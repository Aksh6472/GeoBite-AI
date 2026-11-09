"""Spatial statistics used by the GIS layers and analytics module.

* Kernel Density Estimation (Gaussian kernel, planar local projection) -> heat surface
* DBSCAN (haversine metric)                                             -> incident clusters
* Getis-Ord Gi* (binary distance-band weights incl. self)               -> significant hot/cold wards
* One Health Investigation Priority Index                               -> transparent weighted composite

All functions are pure (numpy/scikit-learn) and operate on plain lists so they are easy to test.
"""
from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass

import numpy as np
from sklearn.cluster import DBSCAN

EARTH_R = 6_371_008.8


# ------------------------------------------------------------------------------- KDE
def kde_surface(
    points: list[tuple[float, float, float]],
    bandwidth_m: float = 450.0,
    cell_m: float = 220.0,
    min_ratio: float = 0.06,
) -> list[dict]:
    """Evaluate a Gaussian KDE on grid cells near the points.

    points: (lat, lng, weight). Returns cells with density (weighted events / km^2) and a
    4-class level relative to the max density: 1 low (green) .. 4 very high (red).
    """
    if not points:
        return []
    pts = np.array(points, dtype=float)
    lat0 = float(np.mean(pts[:, 0]))
    m_per_deg_lat = 111_320.0
    m_per_deg_lng = 111_320.0 * math.cos(math.radians(lat0))
    xy = np.column_stack([pts[:, 1] * m_per_deg_lng, pts[:, 0] * m_per_deg_lat])
    w = pts[:, 2]

    reach = int(math.ceil(3 * bandwidth_m / cell_m))
    cell_idx = np.floor(xy / cell_m).astype(np.int64)
    cand: set[tuple[int, int]] = set()
    offsets = [(dx, dy) for dx in range(-reach, reach + 1) for dy in range(-reach, reach + 1) if dx * dx + dy * dy <= reach * reach]
    for cx, cy in {tuple(c) for c in cell_idx.tolist()}:
        for dx, dy in offsets:
            cand.add((cx + dx, cy + dy))
    cells = np.array(sorted(cand), dtype=np.int64)
    centres = (cells + 0.5) * cell_m

    dens = np.zeros(len(centres))
    h2 = bandwidth_m**2
    norm = 1.0 / (2 * math.pi * h2)
    for start in range(0, len(centres), 4000):
        c = centres[start : start + 4000]
        d2 = ((c[:, None, :] - xy[None, :, :]) ** 2).sum(-1)
        dens[start : start + 4000] = (np.exp(-0.5 * d2 / h2) * w[None, :]).sum(1) * norm * 1e6
    peak = dens.max() if len(dens) else 0
    if peak <= 0:
        return []
    out = []
    half_lat = cell_m / m_per_deg_lat / 2
    half_lng = cell_m / m_per_deg_lng / 2
    for (x, y), dval in zip(centres, dens):
        r = dval / peak
        if r < min_ratio:
            continue
        level = 4 if r >= 0.75 else 3 if r >= 0.5 else 2 if r >= 0.25 else 1
        lat, lng = y / m_per_deg_lat, x / m_per_deg_lng
        out.append(
            {
                "lat": round(lat, 6),
                "lng": round(lng, 6),
                "bounds": [[round(lat - half_lat, 6), round(lng - half_lng, 6)], [round(lat + half_lat, 6), round(lng + half_lng, 6)]],
                "density": round(float(dval), 2),
                "ratio": round(float(r), 3),
                "level": level,
            }
        )
    return out


def kde_by_region(points_by_region: dict[object, list[tuple[float, float, float]]], **kw) -> list[dict]:
    """KDE per region (e.g. district) so that a statewide extent does not explode the grid and
    each city is scaled to its own peak."""
    cells: list[dict] = []
    for pts in points_by_region.values():
        cells.extend(kde_surface(pts, **kw))
    return cells


# ------------------------------------------------------------------------------- DBSCAN
def dbscan_clusters(records: list[dict], eps_m: float = 450.0, min_samples: int = 4) -> list[dict]:
    """records: dicts with lat, lng and optional attributes used for aggregate statistics.
    Returns aggregate cluster summaries only (never individual records)."""
    if len(records) < min_samples:
        return []
    coords = np.radians(np.array([[r["lat"], r["lng"]] for r in records]))
    labels = DBSCAN(eps=eps_m / EARTH_R, min_samples=min_samples, metric="haversine", algorithm="ball_tree").fit_predict(coords)
    clusters = []
    for lab in sorted(set(labels) - {-1}):
        members = [records[i] for i in np.where(labels == lab)[0]]
        lat = float(np.mean([m["lat"] for m in members]))
        lng = float(np.mean([m["lng"] for m in members]))
        radius = max(_hav(lat, lng, m["lat"], m["lng"]) for m in members)
        dates = sorted(m["date"] for m in members if m.get("date"))
        clusters.append(
            {
                "cluster_id": int(lab),
                "lat": round(lat, 5),
                "lng": round(lng, 5),
                "radius_m": round(max(radius, 120.0)),
                "count": len(members),
                "persons_affected": int(sum(m.get("persons", 1) for m in members)),
                "first_date": dates[0] if dates else None,
                "last_date": dates[-1] if dates else None,
                "injury_categories": dict(Counter(m.get("injury_category", "unknown") for m in members)),
                "age_groups": dict(Counter(m.get("age_group", "unknown") for m in members)),
                "location_types": dict(Counter(m.get("location_type", "other") for m in members)),
                "dog_ownership": dict(Counter(m.get("dog_ownership", "unknown") for m in members)),
                "wards": dict(Counter(m.get("ward") or "Unassigned" for m in members)),
            }
        )
    clusters.sort(key=lambda c: -c["count"])
    return clusters


def _hav(lat1, lng1, lat2, lng2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 2 * EARTH_R * math.asin(math.sqrt(a))


# ------------------------------------------------------------------------------- Getis-Ord Gi*
@dataclass
class GiResult:
    unit_id: int
    value: float
    z: float
    p: float
    classification: str
    neighbours: int


def getis_ord_gi_star(units: list[dict], band_m: float = 3500.0) -> list[GiResult]:
    """units: dicts with id, lat, lng, value. Binary distance-band weights, self included (Gi*)."""
    n = len(units)
    if n < 3:
        return []
    x = np.array([u["value"] for u in units], dtype=float)
    xbar = x.mean()
    s = math.sqrt(max((x**2).mean() - xbar**2, 0.0))
    out: list[GiResult] = []
    for i, ui in enumerate(units):
        wi = np.array([1.0 if _hav(ui["lat"], ui["lng"], uj["lat"], uj["lng"]) <= band_m else 0.0 for uj in units])
        sw, sw2 = wi.sum(), (wi**2).sum()
        denom_inner = (n * sw2 - sw**2) / (n - 1)
        if s == 0 or denom_inner <= 0:
            z = 0.0
        else:
            z = float(((wi * x).sum() - xbar * sw) / (s * math.sqrt(denom_inner)))
        p = math.erfc(abs(z) / math.sqrt(2))
        out.append(GiResult(ui["id"], float(x[i]), round(z, 3), round(p, 4), classify_gi(z), int(sw - 1)))
    return out


def classify_gi(z: float) -> str:
    a = abs(z)
    conf = "99" if a >= 2.576 else "95" if a >= 1.960 else "90" if a >= 1.645 else None
    if conf is None:
        return "not_significant"
    return f"hot_{conf}" if z > 0 else f"cold_{conf}"


# ------------------------------------------------------------------------------- One Health index
INDEX_WEIGHTS = {
    "bite_incidence": 0.40,
    "concerning_behaviour_reports": 0.20,
    "vaccination_gap": 0.25,
    "observed_dog_density": 0.15,
}
INDEX_EXPLANATION = {
    "bite_incidence": "Hospital-reported bites per 10,000 residents in the period (min-max scaled across wards).",
    "concerning_behaviour_reports": "Independent (de-duplicated) community reports of chasing, threatening behaviour or bites; verified reports count double.",
    "vaccination_gap": "1 − verified vaccination coverage from documented surveys. Unknown coverage is scored 0.5 and flagged as a data gap.",
    "observed_dog_density": "De-duplicated observed dogs per km². Indicates need for vaccination/ABC outreach - NOT an indicator of danger.",
}


def _minmax(vals: list[float]) -> list[float]:
    lo, hi = min(vals), max(vals)
    if hi - lo < 1e-12:
        return [0.0 for _ in vals]
    return [(v - lo) / (hi - lo) for v in vals]


def one_health_index(wards: list[dict]) -> list[dict]:
    """wards: dicts with id, bite_rate, behaviour_score, dog_density, vax_coverage (0..1 or None)."""
    if not wards:
        return []
    bite = _minmax([w["bite_rate"] for w in wards])
    beh = _minmax([w["behaviour_score"] for w in wards])
    dens = _minmax([w["dog_density"] for w in wards])
    out = []
    for i, w in enumerate(wards):
        cov = w.get("vax_coverage")
        gap = 0.5 if cov is None else max(0.0, min(1.0, 1 - cov))
        comps = {
            "bite_incidence": bite[i],
            "concerning_behaviour_reports": beh[i],
            "vaccination_gap": gap,
            "observed_dog_density": dens[i],
        }
        score = sum(INDEX_WEIGHTS[k] * v for k, v in comps.items()) * 100
        known = sum([w.get("population") is not None, cov is not None, w.get("has_dog_observations", False), True])
        out.append(
            {
                **w,
                "components": {k: round(v, 3) for k, v in comps.items()},
                "contributions": {k: round(INDEX_WEIGHTS[k] * v * 100, 1) for k, v in comps.items()},
                "index": round(score, 1),
                "priority": "high" if score >= 60 else "elevated" if score >= 40 else "moderate" if score >= 20 else "low",
                "data_gaps": [g for g, missing in (("vaccination coverage unknown", cov is None), ("no community observations", not w.get("has_dog_observations"))) if missing],
                "data_completeness": round(known / 4, 2),
            }
        )
    return out
