from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import vocab
from ..database import get_db
from ..deps import require_roles
from ..models import Alert, InterventionRecord, User
from ..services.aggregates import Filters, bite_query, cluster_estimates, community_query, filter_behaviour, filters_dep, vaccination_by_ward, ward_indicators, wards
from ..services.hotspot import dbscan_clusters, getis_ord_gi_star

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
console = require_roles(*vocab.CONSOLE_ROLES)


@router.get("/summary")
def summary(f: Filters = Depends(filters_dep), days: int = Query(365, ge=7, le=3650), db: Session = Depends(get_db), user: User = Depends(console)):
    bites = db.scalars(bite_query(f, days)).unique().all()
    reports = db.scalars(community_query(Filters(f.district_id, f.municipality_id, f.ward_id, f.date_from, f.date_to, None, f.verification_status), days)).unique().all()
    reports = filter_behaviour(reports, f.incident_type)
    clusters = cluster_estimates([r for r in reports if r.verification_status != "rejected"])

    # Hotspots: DBSCAN bite clusters + Gi* significant hot wards
    by_d: dict = {}
    for b in bites:
        by_d.setdefault(b.district_id, []).append({"lat": b.latitude, "lng": b.longitude, "date": b.incident_date.isoformat()})
    n_clusters = sum(len(dbscan_clusters(v)) for v in by_d.values())
    rows = ward_indicators(db, f, min(days, 90))
    gi = getis_ord_gi_star([{"id": r["id"], "lat": r["lat"], "lng": r["lng"], "value": r["bites"]} for r in rows])
    hot_wards = sum(1 for g in gi if g.classification.startswith("hot"))

    ward_ids = {w.id for w in wards(db, f)}
    vax = {k: v for k, v in vaccination_by_ward(db).items() if k in ward_ids}
    surveyed = [v for v in vax.values() if v["status"] == "survey_estimate"]
    coverage = None
    if surveyed:
        coverage = round(sum(v["dogs_vaccinated"] for v in surveyed) / sum(v["survey_population"] for v in surveyed), 3)

    alerts = db.scalars(select(Alert).where(Alert.status != "closed")).unique().all()
    alerts = [a for a in alerts if a.ward_id in ward_ids]
    return {
        "period_days": days,
        "bite_incidents": len(bites),
        "persons_affected": sum(b.persons_affected for b in bites),
        "dog_sightings": len(reports),
        "estimated_observed_dogs": sum(c["estimated_dogs"] for c in clusters.values()),
        "raw_reported_dogs": sum(r.dog_observation.total_dogs for r in reports if r.dog_observation),
        "observation_locations": len(clusters),
        "hotspots": {"dbscan_clusters": n_clusters, "gi_hot_wards": hot_wards, "total": n_clusters},
        "reports_requiring_verification": sum(r.verification_status in ("received", "under_verification") for r in reports),
        "vaccination": {
            "coverage": coverage, "wards_with_survey": len(surveyed), "wards_with_any_record": len(vax), "wards_total": len(ward_ids),
            "note": "Coverage computed only from confirmed records with a documented population survey.",
        },
        "open_alerts": len(alerts),
        "open_alerts_high": sum(a.severity == "high" for a in alerts),
        "synthetic_data_present": any(b.is_synthetic for b in bites) or any(r.is_synthetic for r in reports),
    }


@router.get("/trends")
def trends(f: Filters = Depends(filters_dep), months: int = Query(12, ge=3, le=36), db: Session = Depends(get_db), user: User = Depends(console)):
    days = months * 31
    bites = db.scalars(bite_query(f, days)).unique().all()
    reports = db.scalars(community_query(Filters(f.district_id, f.municipality_id, f.ward_id, f.date_from, f.date_to), days)).unique().all()
    now = datetime.now(timezone.utc).date().replace(day=1)
    keys = []
    d = now
    for _ in range(months):
        keys.append(d.strftime("%Y-%m"))
        d = (d - timedelta(days=1)).replace(day=1)
    keys.reverse()
    bm = Counter(b.incident_date.strftime("%Y-%m") for b in bites)
    rm = Counter(r.observed_at.strftime("%Y-%m") for r in reports)
    cm = Counter((b.incident_date.strftime("%Y-%m"), b.injury_category) for b in bites)
    ints = db.scalars(select(InterventionRecord).where(InterventionRecord.status == "completed")).unique().all()
    im = Counter((i.completed_at or i.started_at).strftime("%Y-%m") for i in ints if (i.completed_at or i.started_at))
    return [{"month": k, "bites": bm[k], "community_reports": rm[k], "cat_iii": cm[(k, "cat_iii")], "interventions_completed": im[k]} for k in keys]


@router.get("/breakdowns")
def breakdowns(f: Filters = Depends(filters_dep), days: int = Query(365, ge=7, le=3650), db: Session = Depends(get_db), user: User = Depends(console)):
    bites = db.scalars(bite_query(f, days)).unique().all()
    reports = db.scalars(community_query(Filters(f.district_id, f.municipality_id, f.ward_id, f.date_from, f.date_to), days)).unique().all()
    dist_b = Counter(b.district.name for b in bites)
    dist_r = Counter(r.district.name for r in reports)
    names = sorted(set(dist_b) | set(dist_r))

    def cnt(items, voc):
        c = Counter(items)
        return [{"key": k, "name": v, "count": c[k]} for k, v in voc.items()]

    return {
        "by_district": [{"name": n, "bites": dist_b[n], "community_reports": dist_r[n]} for n in names],
        "injury_category": cnt((b.injury_category for b in bites), vocab.INJURY_CATEGORY),
        "age_group": cnt((b.victim_age_group for b in bites), vocab.AGE_GROUPS),
        "location_type": cnt((b.location_type for b in bites), vocab.LOCATION_TYPES),
        "dog_ownership": cnt((b.dog_ownership for b in bites), vocab.DOG_OWNERSHIP),
        "pep_status": cnt((b.pep_status for b in bites), vocab.PEP_STATUS),
        "behaviour": cnt((x.category for r in reports for x in r.behaviours), vocab.BEHAVIOURS),
        "verification": cnt((r.verification_status for r in reports), vocab.REPORT_STATUS),
    }


@router.get("/wards")
def ward_table(f: Filters = Depends(filters_dep), days: int = Query(90, ge=7, le=730), db: Session = Depends(get_db), user: User = Depends(console)):
    rows = ward_indicators(db, f, days)
    gi = {g.unit_id: g for g in getis_ord_gi_star([{"id": r["id"], "lat": r["lat"], "lng": r["lng"], "value": r["bites"]} for r in rows])}
    for r in rows:
        g = gi.get(r["id"])
        r["gi_z"], r["gi_class"] = (g.z, g.classification) if g else (None, "not_computed")
    rows.sort(key=lambda r: (-r["bites"], -r["concerning_reports"]))
    return rows
