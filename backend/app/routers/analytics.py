import csv
import io
import tempfile

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import vocab
from ..database import get_db
from ..deps import require_roles
from ..models import Alert, HotspotAnalysis, User
from ..services import audit, vision
from ..services.aggregates import Filters, bite_query, cluster_estimates, community_query, filters_dep, ward_indicators
from ..services.alerts_engine import evaluate_index_alerts
from ..services.hotspot import INDEX_EXPLANATION, INDEX_WEIGHTS, dbscan_clusters, getis_ord_gi_star, one_health_index
from ..services.risk_model import train_and_predict

router = APIRouter(prefix="/analytics", tags=["analytics"])
console = require_roles(*vocab.CONSOLE_ROLES)
admins = require_roles("super_admin", "medical_admin", "veterinary_officer")


def _run_out(r: HotspotAnalysis | None):
    if not r:
        return None
    return {"id": r.id, "analysis_type": r.analysis_type, "parameters": r.parameters, "summary": r.summary, "results": r.results, "model_version": r.model_version, "is_simulated": r.is_simulated, "created_at": r.created_at}


@router.post("/hotspots/run")
def run_hotspots(f: Filters = Depends(filters_dep), days: int = Query(90, ge=14, le=730), eps_m: float = Query(450, ge=100, le=3000), min_samples: int = Query(4, ge=2, le=50), band_m: float = Query(3500, ge=500, le=20000), db: Session = Depends(get_db), user: User = Depends(admins)):
    bites = db.scalars(bite_query(f, days)).unique().all()
    by_d: dict = {}
    for b in bites:
        by_d.setdefault(b.district.name, []).append({"lat": b.latitude, "lng": b.longitude, "date": b.incident_date.isoformat(), "persons": b.persons_affected, "injury_category": b.injury_category, "age_group": b.victim_age_group, "location_type": b.location_type, "dog_ownership": b.dog_ownership, "ward": b.ward.name if b.ward else None})
    clusters = []
    for d, recs in by_d.items():
        for c in dbscan_clusters(recs, eps_m, min_samples):
            clusters.append({**c, "district": d})
    rows = ward_indicators(db, f, days)
    gi = getis_ord_gi_star([{"id": r["id"], "lat": r["lat"], "lng": r["lng"], "value": r["bites"]} for r in rows], band_m)
    gi_map = {g.unit_id: g for g in gi}
    idx = one_health_index(rows)
    for r in idx:
        g = gi_map.get(r["id"])
        r["gi_z"], r["gi_p"], r["gi_class"] = (g.z, g.p, g.classification) if g else (None, None, "not_computed")
    idx.sort(key=lambda r: -r["index"])
    synthetic = any(b.is_synthetic for b in bites)
    run = HotspotAnalysis(
        analysis_type="combined",
        parameters={"days": days, "dbscan_eps_m": eps_m, "dbscan_min_samples": min_samples, "gi_band_m": band_m, "index_weights": INDEX_WEIGHTS, "filters": {k: str(v) for k, v in f.__dict__.items() if v}},
        summary={
            "bites": len(bites), "dbscan_clusters": len(clusters),
            "gi_hot_99": sum(g.classification == "hot_99" for g in gi), "gi_hot_95": sum(g.classification == "hot_95" for g in gi), "gi_hot_90": sum(g.classification == "hot_90" for g in gi),
            "priority_high": sum(r["priority"] == "high" for r in idx), "priority_elevated": sum(r["priority"] == "elevated" for r in idx),
            "explanation": INDEX_EXPLANATION,
        },
        results={"clusters": clusters, "wards": idx},
        model_version="hotspot-1.0", is_simulated=synthetic, created_by_id=user.id,
    )
    db.add(run)
    db.flush()
    new_alerts = evaluate_index_alerts(db, synthetic)
    audit.log(db, actor=user, action="run_analysis", entity_type="hotspot_analysis", entity_id=run.id, changes={"alerts_created": len(new_alerts)})
    db.commit()
    return {**_run_out(run), "alerts_created": [a.alert_code for a in new_alerts]}


@router.get("/hotspots/latest")
def latest_hotspots(db: Session = Depends(get_db), user: User = Depends(console)):
    return _run_out(db.scalar(select(HotspotAnalysis).where(HotspotAnalysis.analysis_type == "combined").order_by(HotspotAnalysis.created_at.desc()).limit(1)))


@router.get("/runs")
def list_runs(db: Session = Depends(get_db), user: User = Depends(console)):
    runs = db.scalars(select(HotspotAnalysis).order_by(HotspotAnalysis.created_at.desc()).limit(30)).all()
    return [{"id": r.id, "analysis_type": r.analysis_type, "model_version": r.model_version, "is_simulated": r.is_simulated, "created_at": r.created_at, "summary": {k: v for k, v in r.summary.items() if k not in ("explanation", "feature_labels")}} for r in runs]


@router.post("/risk-model/train")
def train_risk(db: Session = Depends(get_db), user: User = Depends(admins)):
    try:
        run = train_and_predict(db, user.id)
    except ValueError as e:
        raise HTTPException(422, str(e))
    audit.log(db, actor=user, action="train_model", entity_type="hotspot_analysis", entity_id=run.id, changes={"model_version": run.model_version})
    db.commit()
    return _run_out(run)


@router.get("/risk-model/latest")
def latest_risk(db: Session = Depends(get_db), user: User = Depends(console)):
    return _run_out(db.scalar(select(HotspotAnalysis).where(HotspotAnalysis.analysis_type == "risk_model").order_by(HotspotAnalysis.created_at.desc()).limit(1)))


@router.get("/vision/status")
def vision_status(user: User = Depends(console)):
    ok, msg = vision.available()
    return {"available": ok, "message": msg}


@router.post("/vision/count")
def vision_count(photo: UploadFile = File(...), user: User = Depends(require_roles("super_admin", "veterinary_officer", "municipal_officer"))):
    ok, msg = vision.available()
    if not ok:
        raise HTTPException(501, msg)
    with tempfile.NamedTemporaryFile(suffix=".jpg") as tmp:
        tmp.write(photo.file.read(10 * 1024 * 1024))
        tmp.flush()
        return vision.count_dogs(tmp.name)


@router.get("/export/{dataset}.csv")
def export(dataset: str, f: Filters = Depends(filters_dep), db: Session = Depends(get_db), user: User = Depends(console)):
    """Aggregated exports (no patient-level or reporter-level identifiers)."""
    buf = io.StringIO()
    w = csv.writer(buf)
    if dataset == "wards":
        rows = one_health_index(ward_indicators(db, f, 90))
        cols = ["district", "municipality", "ward", "ward_number", "population", "bites", "persons_affected", "category_iii", "bite_rate", "community_reports", "observation_clusters", "observed_dogs", "concerning_reports", "vax_status", "vax_coverage", "index", "priority"]
        w.writerow(cols)
        for r in rows:
            w.writerow([r.get(c) for c in cols])
    elif dataset == "observations":
        clusters = cluster_estimates(db.scalars(community_query(f, 365)).unique().all())
        w.writerow(["cluster_id", "lat_3dp", "lng_3dp", "reports", "independent_reports", "estimated_dogs", "verified", "first_observed", "last_observed", "behaviours"])
        for c in clusters.values():
            w.writerow([c["cluster_id"], round(c["lat"], 3), round(c["lng"], 3), c["report_count"], c["independent_reports"], c["estimated_dogs"], c["verified"], c["first_observed"].isoformat(), c["last_observed"].isoformat(), ";".join(c["behaviours"])])
    elif dataset == "alerts":
        w.writerow(["alert_code", "ward", "type", "severity", "status", "assigned_to", "created_at", "closed_at"])
        for a in db.scalars(select(Alert).order_by(Alert.created_at.desc())).unique().all():
            w.writerow([a.alert_code, a.ward.name, a.alert_type, a.severity, a.status, a.assigned_to.full_name if a.assigned_to else "", a.created_at.isoformat(), a.closed_at.isoformat() if a.closed_at else ""])
    else:
        raise HTTPException(404, "Unknown dataset. Use wards, observations or alerts.")
    audit.log(db, actor=user, action="export", entity_type=dataset, entity_id=None)
    db.commit()
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=geobite_{dataset}.csv"})
