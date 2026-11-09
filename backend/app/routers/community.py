import io
import json
import secrets
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import vocab
from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user, get_current_user_optional, require_roles
from ..models import BehaviourObservation, CommunityReport, DogObservation, GeoLocation, User
from ..ratelimit import client_ip, enforce
from ..schemas import CommunityReportCreate, VerifyIn
from ..security import content_fingerprint, hash_ip
from ..services import audit
from ..services.aggregates import Filters, cluster_estimates, community_query, filter_behaviour, filters_dep
from ..services.alerts_engine import evaluate_ward
from ..services.community import assign_cluster, score_report
from ..services.geo import new_code, resolve_ward

router = APIRouter(prefix="/community", tags=["community"])
settings = get_settings()
reviewers = require_roles("super_admin", "medical_admin", "veterinary_officer", "municipal_officer")


def _save_photo(upload: UploadFile) -> str:
    raw = upload.file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(raw) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"Photo exceeds {settings.max_upload_mb} MB")
    try:
        img = Image.open(io.BytesIO(raw))
        img.verify()
        img = Image.open(io.BytesIO(raw))
    except (UnidentifiedImageError, OSError):
        raise HTTPException(422, "The uploaded file is not a valid image")
    if img.format not in ("JPEG", "PNG", "WEBP"):
        raise HTTPException(422, "Only JPEG, PNG or WEBP photos are accepted")
    img = img.convert("RGB")
    img.thumbnail((1600, 1600))
    folder = Path(settings.upload_dir) / "community"
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{secrets.token_hex(16)}.jpg"
    img.save(folder / name, "JPEG", quality=85)  # re-encoding strips EXIF (incl. GPS) metadata
    return f"community/{name}"


@router.post("/reports", status_code=201)
def submit_report(
    request: Request,
    payload: str = Form(..., description="JSON body matching CommunityReportCreate"),
    photo: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    enforce(request, "community_report", settings.rate_limit_reports_per_hour, 3600)
    try:
        body = CommunityReportCreate.model_validate(json.loads(payload))
    except json.JSONDecodeError:
        raise HTTPException(422, "Malformed report payload")
    except ValidationError as e:
        raise HTTPException(422, [{"loc": err["loc"], "msg": err["msg"]} for err in e.errors(include_url=False, include_context=False)])
    if body.website:  # honeypot field filled -> bot. Pretend success without storing.
        return {"report_code": new_code("GB-CR", 8, with_year=False), "status": "received"}

    ip_h = hash_ip(client_ip(request))
    fp = content_fingerprint(ip_h, round(body.latitude, 4), round(body.longitude, 4), body.dogs.total_dogs, sorted(b.category for b in body.behaviours), body.observed_at.replace(second=0, microsecond=0).isoformat())
    dup = db.scalar(select(CommunityReport).where(CommunityReport.content_hash == fp, CommunityReport.created_at >= datetime.now(timezone.utc) - timedelta(hours=24)))
    if dup:
        raise HTTPException(409, {"message": "This report appears to have already been submitted.", "report_code": dup.report_code})

    district = db.get(GeoLocation, body.district_id)
    if not district or district.level != "district":
        raise HTTPException(422, "Unknown district")
    ward = db.get(GeoLocation, body.ward_id) if body.ward_id else resolve_ward(db, body.latitude, body.longitude)
    municipality_id = body.municipality_id or (ward.parent_id if ward else None)

    r = CommunityReport(
        report_code=new_code("GB-CR", 8, with_year=False), reporter_user_id=user.id if user else None,
        district_id=district.id, municipality_id=municipality_id, ward_id=ward.id if ward else None,
        locality=body.locality, street_landmark=body.street_landmark, latitude=body.latitude, longitude=body.longitude,
        location_method=body.location_method, observed_at=body.observed_at, description=body.description,
        consent_given=True, contact_email=body.contact_email, ip_hash=ip_h, content_hash=fp,
    )
    if photo is not None and photo.filename:
        r.photo_path = _save_photo(photo)
    r.dog_observation = DogObservation(**body.dogs.model_dump())
    r.behaviours = [BehaviourObservation(category=b.category, description=b.description) for b in body.behaviours]
    db.add(r)
    db.flush()
    assign_cluster(db, r)
    score_report(db, r)
    audit.log(db, actor=user, action="create", entity_type="community_report", entity_id=r.id, changes={"report_code": r.report_code, "cluster": r.observation_cluster_id}, ip_hash=ip_h)
    if r.ward_id:
        evaluate_ward(db, db.get(GeoLocation, r.ward_id))
    db.commit()
    return {
        "report_code": r.report_code, "status": r.verification_status, "submitted_at": r.created_at,
        "ward": ward.name if ward else None, "district": district.name,
        "joined_existing_observation": r.observation_cluster_id != r.id,
        "message": "Thank you. Your observation has been received and will be reviewed by authorised veterinary or municipal personnel.",
    }


@router.get("/reports/status/{code}")
def report_status(code: str, request: Request, db: Session = Depends(get_db)):
    enforce(request, "status_lookup", 60, 3600)
    r = db.scalar(select(CommunityReport).where(CommunityReport.report_code == code.strip().upper(), CommunityReport.deleted_at.is_(None)))
    if not r:
        raise HTTPException(404, "No report found with this ID")
    return {
        "report_code": r.report_code, "status": r.verification_status, "status_label": vocab.REPORT_STATUS[r.verification_status],
        "submitted_at": r.created_at, "observed_at": r.observed_at, "updated_at": r.updated_at,
        "district": r.district.name, "ward": r.ward.name if r.ward else None, "locality": r.locality,
        "dogs_reported": r.dog_observation.total_dogs if r.dog_observation else None,
        "behaviours": [vocab.BEHAVIOURS[b.category] for b in r.behaviours],
        "verified_at": r.verified_at,
    }


@router.get("/my-reports")
def my_reports(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rs = db.scalars(select(CommunityReport).where(CommunityReport.reporter_user_id == user.id, CommunityReport.deleted_at.is_(None)).order_by(CommunityReport.created_at.desc()).limit(100)).unique().all()
    return [{"report_code": r.report_code, "status": r.verification_status, "observed_at": r.observed_at, "ward": r.ward.name if r.ward else None, "dogs": r.dog_observation.total_dogs if r.dog_observation else None} for r in rs]


@router.get("/dashboard")
def community_dashboard(f: Filters = Depends(filters_dep), db: Session = Depends(get_db)):
    """Public, aggregate-only statistics."""
    reports = db.scalars(community_query(f, 365)).unique().all()
    clusters = cluster_estimates(reports)
    today = datetime.now(timezone.utc).date()
    concern_by_ward: Counter = Counter()
    for c in clusters.values():
        if set(c["behaviours"]) & vocab.CONCERN_BEHAVIOURS and c["ward_id"]:
            concern_by_ward[c["ward_id"]] += c["independent_reports"]
    repeated = []
    for wid, n in concern_by_ward.most_common():
        if n >= 2:
            w = db.get(GeoLocation, wid)
            repeated.append({"ward": w.name, "municipality": w.parent.name if w.parent else None, "independent_reports": n})
    by_beh = Counter(b.category for r in reports for b in r.behaviours)
    by_month = Counter(r.observed_at.strftime("%Y-%m") for r in reports)
    return {
        "total_reports": len(reports),
        "dogs_reported_raw": sum(r.dog_observation.total_dogs for r in reports if r.dog_observation),
        "dogs_estimated_dedup": sum(c["estimated_dogs"] for c in clusters.values()),
        "observation_locations": len(clusters),
        "reports_today": sum(r.created_at.date() == today for r in reports),
        "awaiting_verification": sum(r.verification_status in ("received", "under_verification") for r in reports),
        "verified": sum(r.verification_status == "verified" for r in reports),
        "repeated_concern_areas": repeated[:10],
        "by_behaviour": [{"key": k, "name": vocab.BEHAVIOURS[k], "count": by_beh[k]} for k in vocab.BEHAVIOURS],
        "by_status": [{"key": k, "name": v, "count": sum(r.verification_status == k for r in reports)} for k, v in vocab.REPORT_STATUS.items()],
        "by_month": [{"month": k, "count": by_month[k]} for k in sorted(by_month)],
    }


# ------------------------------------------------------------------ moderation (authorised staff)
def _report_out(r: CommunityReport, full: bool = True) -> dict:
    d = r.dog_observation
    out = {
        "id": r.id, "report_code": r.report_code, "status": r.verification_status, "observed_at": r.observed_at, "created_at": r.created_at,
        "district": r.district.name, "district_id": r.district_id, "municipality": r.municipality.name if r.municipality else None,
        "ward": r.ward.name if r.ward else None, "ward_id": r.ward_id, "ward_number": r.ward.ward_number if r.ward else None,
        "locality": r.locality, "street_landmark": r.street_landmark, "lat": r.latitude, "lng": r.longitude, "location_method": r.location_method,
        "dogs": {"total": d.total_dogs, "estimated_locality": d.estimated_locality_dogs, "puppies": d.puppies, "adults": d.adults, "injured": d.injured, "ear_notched": d.ear_notched, "grouping": d.grouping} if d else None,
        "behaviours": [{"category": b.category, "label": vocab.BEHAVIOURS[b.category], "description": b.description} for b in r.behaviours],
        "has_photo": bool(r.photo_path), "priority_score": r.priority_score, "priority_reasons": r.priority_reasons or [],
        "cluster_id": r.observation_cluster_id, "is_probable_duplicate": r.is_probable_duplicate, "is_synthetic": r.is_synthetic,
        "verified_by": r.verified_by.full_name if r.verified_by else None, "verified_at": r.verified_at, "verification_notes": r.verification_notes,
    }
    if full:
        out["description"] = r.description
    return out


@router.get("/reports")
def moderation_queue(
    f: Filters = Depends(filters_dep),
    status: str | None = None,
    sort: str = Query("priority", pattern="^(priority|recent)$"),
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(reviewers),
):
    q = community_query(Filters(f.district_id, f.municipality_id, f.ward_id, f.date_from, f.date_to, None, status or f.verification_status), 3650)
    if user.role.code in vocab.FIELD_ROLES and user.district_id and not f.district_id:
        q = q.where(CommunityReport.district_id == user.district_id)
    rows = db.scalars(q).unique().all()
    rows = filter_behaviour(rows, f.incident_type)
    rows.sort(key=(lambda r: (-r.priority_score, -r.observed_at.timestamp())) if sort == "priority" else (lambda r: -r.observed_at.timestamp()))
    return {"total": len(rows), "items": [_report_out(r) for r in rows[offset : offset + limit]]}


@router.get("/reports/{report_id}")
def get_report(report_id: int, db: Session = Depends(get_db), user: User = Depends(reviewers)):
    r = db.get(CommunityReport, report_id)
    if not r or r.deleted_at:
        raise HTTPException(404, "Report not found")
    peers = []
    if r.observation_cluster_id:
        peers = db.scalars(select(CommunityReport).where(CommunityReport.observation_cluster_id == r.observation_cluster_id, CommunityReport.id != r.id, CommunityReport.deleted_at.is_(None))).unique().all()
    return {**_report_out(r), "cluster_members": [_report_out(p, full=False) for p in peers]}


@router.get("/reports/{report_id}/photo")
def report_photo(report_id: int, db: Session = Depends(get_db), user: User = Depends(reviewers)):
    r = db.get(CommunityReport, report_id)
    if not r or not r.photo_path:
        raise HTTPException(404, "No photo")
    path = (Path(settings.upload_dir) / r.photo_path).resolve()
    if not str(path).startswith(str(Path(settings.upload_dir).resolve())) or not path.exists():
        raise HTTPException(404, "No photo")
    return FileResponse(path, media_type="image/jpeg")


@router.post("/reports/{report_id}/verify")
def verify_report(report_id: int, body: VerifyIn, request: Request, db: Session = Depends(get_db), user: User = Depends(reviewers)):
    r = db.get(CommunityReport, report_id)
    if not r or r.deleted_at:
        raise HTTPException(404, "Report not found")
    before = r.verification_status
    r.verification_status = body.status
    r.verification_notes = body.notes
    if body.status in ("verified", "rejected"):
        r.verified_by_id, r.verified_at = user.id, datetime.now(timezone.utc)
    audit.log(db, actor=user, action="verify", entity_type="community_report", entity_id=r.id, changes={"verification_status": {"from": before, "to": body.status}}, reason=body.notes, ip_hash=hash_ip(client_ip(request)))
    if r.reporter_user_id:
        audit.notify(db, r.reporter_user_id, f"Report {r.report_code}: {vocab.REPORT_STATUS[body.status]}", None, f"/community/track?code={r.report_code}")
    if r.ward_id:
        evaluate_ward(db, db.get(GeoLocation, r.ward_id))
    db.commit()
    return _report_out(r)


@router.get("/stats/queue")
def queue_counts(db: Session = Depends(get_db), user: User = Depends(reviewers)):
    rows = db.execute(select(CommunityReport.verification_status, func.count()).where(CommunityReport.deleted_at.is_(None)).group_by(CommunityReport.verification_status)).all()
    return {k: v for k, v in rows}
