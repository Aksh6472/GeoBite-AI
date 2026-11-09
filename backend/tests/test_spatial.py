"""Unit tests for spatial statistics."""
import random

from app.services.hotspot import classify_gi, dbscan_clusters, getis_ord_gi_star, kde_surface, one_health_index


def _blob(lat, lng, n, sd=0.001, seed=1):
    r = random.Random(seed)
    return [{"lat": lat + r.gauss(0, sd), "lng": lng + r.gauss(0, sd), "date": "2026-01-01"} for _ in range(n)]


def test_dbscan_separates_two_clusters_and_ignores_noise():
    recs = _blob(13.04, 80.23, 25) + _blob(13.10, 80.29, 15, seed=2) + [{"lat": 13.2, "lng": 80.1}, {"lat": 12.9, "lng": 80.4}]
    cl = dbscan_clusters(recs, eps_m=400, min_samples=4)
    assert len(cl) == 2
    assert cl[0]["count"] == 25 and cl[1]["count"] == 15


def test_kde_peak_is_at_the_cluster():
    pts = [(r["lat"], r["lng"], 1.0) for r in _blob(11.67, 78.14, 40)]
    cells = kde_surface(pts, bandwidth_m=400, cell_m=200)
    top = max(cells, key=lambda c: c["density"])
    assert top["level"] == 4
    assert abs(top["lat"] - 11.67) < 0.004 and abs(top["lng"] - 78.14) < 0.004
    assert {c["level"] for c in cells} == {1, 2, 3, 4}


def test_getis_ord_identifies_hot_neighbourhood():
    units = []
    i = 0
    for gx in range(6):
        for gy in range(6):
            hot = gx < 2 and gy < 2
            units.append({"id": i, "lat": 10 + gx * 0.02, "lng": 78 + gy * 0.02, "value": 30 if hot else 3})
            i += 1
    res = {g.unit_id: g for g in getis_ord_gi_star(units, band_m=3200)}
    assert res[0].classification.startswith("hot") and res[0].z > 1.96
    assert not res[35].classification.startswith("hot")
    assert classify_gi(-2.7) == "cold_99" and classify_gi(0.5) == "not_significant"


def test_one_health_index_is_transparent_and_flags_gaps():
    rows = one_health_index([
        {"id": 1, "bite_rate": 4.0, "behaviour_score": 6, "dog_density": 50, "vax_coverage": 0.2, "population": 1, "has_dog_observations": True},
        {"id": 2, "bite_rate": 0.5, "behaviour_score": 0, "dog_density": 80, "vax_coverage": None, "population": 1, "has_dog_observations": True},
    ])
    a, b = rows
    assert a["index"] > b["index"]
    assert abs(sum(a["contributions"].values()) - a["index"]) < 0.5
    assert "vaccination coverage unknown" in b["data_gaps"]
    # a high dog density alone must not produce a high-priority classification
    assert b["priority"] in ("low", "moderate")
