"""GIS layers. Every endpoint returns aggregated geometry; individual bite records are only
returned to clinical roles, and community data shown publicly is snapped to a ~550 m grid."""
from collections import Counter, defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import vocab
from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user_optional, require_roles
from ..models import User
from ..services.aggregates import Filters, bite_query, cluster_estimates, community_query, filter_behaviour, filters_dep, vaccination_by_ward, ward_indicators, wards
from ..services.geo import ancestors, snap
from ..services.hotspot import INDEX_EXPLANATION, INDEX_WEIGHTS, dbscan_clusters, getis_ord_gi_star, kde_by_region, one_health_index

router = APIRouter(prefix="/map", tags=["gis"])
settings = get_settings()
console = require_roles("super_admin", "medical_admin", "veterinary_officer", "municipal_officer", "hospital_staff")


def _public(user: User | None) -> bool:
    return user is None or user.role.code == "community_reporter"


@router.get("/bites")
def bite_layer(
    f: Filters = Depends(filters_dep),
    bandwidth_m: float = Query(450, ge=100, le=3000),
    eps_m: float = Query(450, ge=100, le=3000),
    min_samples: int = Query(4, ge=2, le=50),
    db: Session = Depends(get_db),
    user: User = Depends(console),
):
    q = bite_query(f, 365)
    bites = db.scalars(q).unique().all()
    by_district = defaultdict(list)
    for b in bites:
        by_district[b.district_id].append((b.latitude, b.longitude, float(b.persons_affected)))
    recs = [
        {"lat": b.latitude, "lng": b.longitude, "date": b.incident_date.isoformat(), "persons": b.persons_affected, "injury_category": b.injury_category,
         "age_group": b.victim_age_group, "location_type": b.location_type, "dog_ownership": b.dog_ownership, "ward": b.ward.name if b.ward else None}
        for b in bites
    ]
    clusters = []
    for did in by_district:
        clusters.extend(dbscan_clusters([r for r, b in zip(recs, bites) if b.district_id == did], eps_m=eps_m, min_samples=min_samples))
    for i, c in enumerate(sorted(clusters, key=lambda c: -c["count"])):
        c["cluster_id"] = i + 1
    show_points = user.role.code in ("super_admin", "medical_admin", "hospital_staff")
    points = []
    if show_points:
        for b in bites:
            if user.role.code == "hospital_staff" and b.hospital_id != user.hospital_id:
                continue
            points.append({"id": b.id, "code": b.incident_code, "lat": b.latitude, "lng": b.longitude, "date": b.incident_date.isoformat(), "category": b.injury_category, "ward": b.ward.name if b.ward else None, "hospital": b.hospital.name})
    return {
        "total": len(bites),
        "heat": kde_by_region(by_district, bandwidth_m=bandwidth_m),
        "clusters": sorted(clusters, key=lambda c: c["cluster_id"]),
        "points": points,
        "parameters": {"kde_bandwidth_m": bandwidth_m, "dbscan_eps_m": eps_m, "dbscan_min_samples": min_samples, "weight": "persons affected"},
        "legend": [{"level": 1, "label": "Low", "color": "#22a06b"}, {"level": 2, "label": "Moderate", "color": "#e2b203"}, {"level": 3, "label": "High", "color": "#f18d13"}, {"level": 4, "label": "Very high", "color": "#d1342f"}],
    }


@router.get("/dogs")
def dog_layer(f: Filters = Depends(filters_dep), db: Session = Depends(get_db), user: User | None = Depends(get_current_user_optional)):
    reports = [r for r in db.scalars(community_query(f, 90)).unique().all() if r.verification_status != "rejected"]
    clusters = cluster_estimates(reports)
    public = _public(user)
    feats = []
    if public:  # merge clusters into privacy grid cells
        cells: dict = {}
        for c in clusters.values():
            key = snap(c["lat"], c["lng"])
            cell = cells.setdefault(key, {"lat": key[0], "lng": key[1], "observations": 0, "independent_reports": 0, "estimated_dogs": 0, "verified": False, "last_observed": c["last_observed"]})
            cell["observations"] += c["report_count"]
            cell["independent_reports"] += c["independent_reports"]
            cell["estimated_dogs"] += c["estimated_dogs"]
            cell["verified"] = cell["verified"] or c["verified"]
            cell["last_observed"] = max(cell["last_observed"], c["last_observed"])
        feats = [{**c, "precision": "grid_550m"} for c in cells.values()]
    else:
        for c in clusters.values():
            feats.append({
                "cluster_id": c["cluster_id"], "lat": round(c["lat"], 5), "lng": round(c["lng"], 5), "observations": c["report_count"],
                "independent_reports": c["independent_reports"], "estimated_dogs": c["estimated_dogs"], "verified": c["verified"],
                "statuses": c["statuses"], "first_observed": c["first_observed"], "last_observed": c["last_observed"],
                "report_codes": [r.report_code for r in c["reports"]][:10], "precision": "cluster_centroid",
            })
    return {
        "total_reports": len(reports), "locations": len(feats), "estimated_dogs": sum(x["estimated_dogs"] for x in feats),
        "features": feats,
        "method": "Reports within 150 m of each other (chained over 30 days) are treated as one dog group; the group's estimate is the median reported count, never the sum of overlapping reports.",
    }


@router.get("/behaviour")
def behaviour_layer(f: Filters = Depends(filters_dep), group: str | None = None, db: Session = Depends(get_db), user: User | None = Depends(get_current_user_optional)):
    reports = [r for r in db.scalars(community_query(Filters(f.district_id, f.municipality_id, f.ward_id, f.date_from, f.date_to, None, f.verification_status), 90)).unique().all() if r.verification_status != "rejected"]
    reports = filter_behaviour(reports, f.incident_type)
    cat_to_group = {c: g for g, cs in vocab.BEHAVIOUR_LAYER_GROUPS.items() for c in cs}
    clusters = cluster_estimates([r for r in reports if r.behaviours])
    public = _public(user)
    feats = []
    for c in clusters.values():
        groups = Counter()
        verified_groups = Counter()
        for r in c["reports"]:
            if r.is_probable_duplicate:
                continue
            for g in {cat_to_group[b.category] for b in r.behaviours}:
                groups[g] += 1
                if r.verification_status == "verified":
                    verified_groups[g] += 1
        if group and group not in groups:
            continue
        if not groups:
            continue
        lat, lng = (snap(c["lat"], c["lng"]) if public else (round(c["lat"], 5), round(c["lng"], 5)))
        dominant = max(groups, key=lambda g: (g != "other", groups[g]))
        feats.append({
            "lat": lat, "lng": lng, "groups": dict(groups), "verified_groups": dict(verified_groups), "dominant": dominant,
            "independent_reports": c["independent_reports"], "verified": c["verified"], "repeated": c["independent_reports"] >= 2,
            "last_observed": c["last_observed"], **({} if public else {"report_codes": [r.report_code for r in c["reports"]][:10]}),
        })
    return {"features": feats, "groups": list(vocab.BEHAVIOUR_LAYER_GROUPS), "note": "Reported observations. Unverified until reviewed by authorised veterinary or municipal personnel; not a classification of any dog as dangerous."}


@router.get("/vaccination")
def vaccination_layer(f: Filters = Depends(filters_dep), db: Session = Depends(get_db)):
    vax = vaccination_by_ward(db)
    feats = []
    for w in wards(db, f):
        v = vax.get(w.id)
        a = ancestors(w)
        feats.append({
            "type": "Feature", "geometry": w.boundary_geojson,
            "properties": {
                "id": w.id, "ward": w.name, "ward_number": w.ward_number, "district": a["district"].name if "district" in a else None,
                "status": v["status"] if v else "unavailable", "coverage": v["coverage"] if v else None,
                "dogs_vaccinated": v["dogs_vaccinated"] if v else 0, "records": v["records"] if v else 0,
                "latest": v["latest"].isoformat() if v and v["latest"] else None,
            },
        })
    return {
        "type": "FeatureCollection", "features": feats,
        "legend": {"survey_estimate": "Coverage estimate based on documented survey", "confirmed_no_estimate": "Vaccination confirmed (no population survey)", "unverified": "Unverified record", "unavailable": "Vaccination information unavailable"},
        "note": "Visible ear-notches are not treated as proof of current vaccination.",
    }


@router.get("/onehealth")
def onehealth_layer(f: Filters = Depends(filters_dep), days: int = Query(90, ge=14, le=730), band_m: float = Query(3500, ge=500, le=20000), db: Session = Depends(get_db), user: User = Depends(require_roles(*vocab.CONSOLE_ROLES))):
    rows = ward_indicators(db, f, days)
    idx = one_health_index(rows)
    gi = {g.unit_id: g for g in getis_ord_gi_star([{"id": r["id"], "lat": r["lat"], "lng": r["lng"], "value": r["bites"]} for r in rows], band_m)}
    geoms = {w.id: w.boundary_geojson for w in wards(db, f)}
    feats = []
    for r in idx:
        g = gi.get(r["id"])
        feats.append({"type": "Feature", "geometry": geoms.get(r["id"]), "properties": {**r, "gi_z": g.z if g else None, "gi_p": g.p if g else None, "gi_class": g.classification if g else "not_computed"}})
    return {"type": "FeatureCollection", "features": feats, "weights": INDEX_WEIGHTS, "explanation": INDEX_EXPLANATION, "period_days": days, "gi_band_m": band_m,
            "note": "Investigation Priority Index identifies where field investigation should be prioritised. A high observed dog population is not treated as dangerousness."}


@router.get("/public/bites")
def public_bite_summary(f: Filters = Depends(filters_dep), db: Session = Depends(get_db)):
    """Ward-level aggregated bite counts for public dashboards, with small-cell suppression."""
    rows = ward_indicators(db, f, 90)
    k = settings.public_min_cell_count
    return {
        "suppression_threshold": k,
        "wards": [{"ward": r["ward"], "district": r["district"], "lat": r["lat"], "lng": r["lng"], "bites": r["bites"] if r["bites"] >= k else None, "suppressed": 0 < r["bites"] < k} for r in rows],
    }
