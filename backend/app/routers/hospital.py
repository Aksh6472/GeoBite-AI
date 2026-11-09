import csv
import io
from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import vocab
from ..database import get_db
from ..deps import require_roles
from ..models import AuditLog, BiteIncident, GeoLocation, Hospital, User
from ..ratelimit import client_ip
from ..schemas import BiteIncidentCreate, BiteIncidentOut, BiteIncidentUpdate
from ..security import hash_ip
from ..services import audit
from ..services.aggregates import Filters, bite_query, filters_dep
from ..services.alerts_engine import evaluate_ward
from ..services.geo import new_code

router = APIRouter(prefix="/bite-incidents", tags=["hospital"])
clinical = require_roles(*vocab.CLINICAL_ROLES)
EDITABLE = [f for f in BiteIncidentCreate.model_fields if f != "hospital_id"]


def _scope(q, user: User):
    """Hospital staff only ever see their own facility's records."""
    if user.role.code == "hospital_staff":
        q = q.where(BiteIncident.hospital_id == user.hospital_id)
    return q


def _get(db: Session, incident_id: int, user: User) -> BiteIncident:
    b = db.get(BiteIncident, incident_id)
    if not b or b.deleted_at is not None or (user.role.code == "hospital_staff" and b.hospital_id != user.hospital_id):
        raise HTTPException(404, "Incident not found")
    return b


def _validate_geo(db: Session, body) -> None:
    d = db.get(GeoLocation, body.district_id)
    if not d or d.level != "district":
        raise HTTPException(422, "Unknown district")
    if body.municipality_id:
        m = db.get(GeoLocation, body.municipality_id)
        if not m or m.parent_id != d.id:
            raise HTTPException(422, "Municipality does not belong to the selected district")
    if body.ward_id:
        w = db.get(GeoLocation, body.ward_id)
        if not w or w.level != "ward" or (body.municipality_id and w.parent_id != body.municipality_id):
            raise HTTPException(422, "Ward does not belong to the selected municipality")


@router.post("", status_code=201, response_model=BiteIncidentOut)
def create_incident(body: BiteIncidentCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(clinical)):
    if user.role.code == "hospital_staff":
        hospital_id = user.hospital_id
    else:
        hospital_id = body.hospital_id
    if not hospital_id or not db.get(Hospital, hospital_id):
        raise HTTPException(422, "A reporting hospital / PHC is required")
    _validate_geo(db, body)
    data = body.model_dump(exclude={"hospital_id"})
    b = BiteIncident(**data, incident_code=new_code("GB-BI"), hospital_id=hospital_id, reported_by_id=user.id)
    db.add(b)
    db.flush()
    audit.log(db, actor=user, action="create", entity_type="bite_incident", entity_id=b.id, changes={"incident_code": b.incident_code, "ward_id": b.ward_id}, ip_hash=hash_ip(client_ip(request)))
    if b.ward_id:
        evaluate_ward(db, db.get(GeoLocation, b.ward_id))
    db.commit()
    db.refresh(b)
    return BiteIncidentOut.from_model(b)


@router.get("")
def list_incidents(
    f: Filters = Depends(filters_dep),
    q: str | None = Query(None, max_length=60),
    follow_up: str | None = None,
    hospital_id: int | None = None,
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(clinical),
):
    query = _scope(bite_query(f, 3650), user)
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(BiteIncident.incident_code.ilike(like), BiteIncident.location_description.ilike(like)))
    if follow_up:
        query = query.where(BiteIncident.follow_up_status == follow_up)
    if hospital_id and user.role.code != "hospital_staff":
        query = query.where(BiteIncident.hospital_id == hospital_id)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(query.order_by(BiteIncident.incident_date.desc(), BiteIncident.id.desc()).limit(limit).offset(offset)).unique().all()
    return {"total": total, "items": [BiteIncidentOut.from_model(b) for b in rows]}


@router.get("/dashboard")
def hospital_dashboard(f: Filters = Depends(filters_dep), db: Session = Depends(get_db), user: User = Depends(clinical)):
    rows = db.scalars(_scope(bite_query(f, 3650), user)).unique().all()
    today = datetime.now(timezone.utc).date()
    month_start = today.replace(day=1)
    soon = today + timedelta(days=7)
    pending = [b for b in rows if b.follow_up_status in ("pending", "in_progress")]
    by_month = Counter(b.incident_date.strftime("%Y-%m") for b in rows if b.incident_date >= today - timedelta(days=365))
    ward_counts = Counter((b.ward.name if b.ward else "Unassigned", b.district.name) for b in rows)
    return {
        "scope": user.hospital.name if user.role.code == "hospital_staff" and user.hospital else "All facilities",
        "total": len(rows),
        "today": sum(b.hospital_report_date == today for b in rows),
        "this_month": sum(b.incident_date >= month_start for b in rows),
        "persons_affected": sum(b.persons_affected for b in rows),
        "pending_follow_ups": len(pending),
        "follow_ups_due_7d": sum(1 for b in pending if b.follow_up_due_date and b.follow_up_due_date <= soon),
        "by_district": [{"name": k, "count": v} for k, v in Counter(b.district.name for b in rows).most_common()],
        "by_ward": [{"name": k[0], "district": k[1], "count": v} for k, v in ward_counts.most_common(12)],
        "by_category": [{"key": k, "name": vocab.INJURY_CATEGORY[k], "count": Counter(b.injury_category for b in rows)[k]} for k in vocab.INJURY_CATEGORY],
        "by_age": [{"key": k, "name": vocab.AGE_GROUPS[k], "count": Counter(b.victim_age_group for b in rows)[k]} for k in vocab.AGE_GROUPS],
        "by_month": [{"month": k, "count": by_month[k]} for k in sorted(by_month)],
        "pep_status": [{"key": k, "name": v, "count": sum(b.pep_status == k for b in rows)} for k, v in vocab.PEP_STATUS.items()],
        "points": [{"id": b.id, "code": b.incident_code, "lat": b.latitude, "lng": b.longitude, "category": b.injury_category, "date": b.incident_date.isoformat()} for b in rows[:3000]],
        "is_synthetic_present": any(b.is_synthetic for b in rows),
    }


@router.get("/export.csv")
def export_csv(f: Filters = Depends(filters_dep), db: Session = Depends(get_db), user: User = Depends(clinical)):
    rows = db.scalars(_scope(bite_query(f, 3650), user).order_by(BiteIncident.incident_date)).unique().all()
    cols = ["incident_code", "incident_date", "hospital_report_date", "district", "municipality", "ward", "ward_number", "location_type", "persons_affected", "victim_age_group", "dog_ownership", "provocation", "injury_category", "pep_status", "rig_status", "follow_up_status", "is_synthetic"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    for b in rows:
        w.writerow([b.incident_code, b.incident_date, b.hospital_report_date, b.district.name, b.municipality.name if b.municipality else "", b.ward.name if b.ward else "", b.ward.ward_number if b.ward else "", b.location_type, b.persons_affected, b.victim_age_group, b.dog_ownership, b.provocation, b.injury_category, b.pep_status, b.rig_status, b.follow_up_status, b.is_synthetic])
    audit.log(db, actor=user, action="export", entity_type="bite_incident", entity_id=None, changes={"rows": len(rows)})
    db.commit()
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=geobite_bite_incidents.csv"})


@router.get("/{incident_id}", response_model=BiteIncidentOut)
def get_incident(incident_id: int, db: Session = Depends(get_db), user: User = Depends(clinical)):
    return BiteIncidentOut.from_model(_get(db, incident_id, user))


@router.put("/{incident_id}", response_model=BiteIncidentOut)
def update_incident(incident_id: int, body: BiteIncidentUpdate, request: Request, db: Session = Depends(get_db), user: User = Depends(clinical)):
    b = _get(db, incident_id, user)
    if b.version != body.expected_version:
        raise HTTPException(409, "This record was modified by someone else. Reload it and re-apply your correction.")
    _validate_geo(db, body)
    before = audit.snapshot(b, EDITABLE)
    for k in EDITABLE:
        setattr(b, k, getattr(body, k))
    after = audit.snapshot(b, EDITABLE)
    changes = audit.diff(before, after)
    if not changes:
        raise HTTPException(422, "No changes to save")
    b.version += 1
    audit.log(db, actor=user, action="update", entity_type="bite_incident", entity_id=b.id, changes=changes, reason=body.edit_reason, ip_hash=hash_ip(client_ip(request)))
    db.commit()
    db.refresh(b)
    return BiteIncidentOut.from_model(b)


@router.delete("/{incident_id}")
def soft_delete(incident_id: int, reason: str = Query(min_length=5, max_length=300), db: Session = Depends(get_db), user: User = Depends(require_roles("super_admin", "medical_admin"))):
    b = _get(db, incident_id, user)
    b.deleted_at = datetime.now(timezone.utc)
    b.deletion_reason = reason
    audit.log(db, actor=user, action="soft_delete", entity_type="bite_incident", entity_id=b.id, reason=reason)
    db.commit()
    return {"ok": True}


@router.get("/{incident_id}/history")
def history(incident_id: int, db: Session = Depends(get_db), user: User = Depends(clinical)):
    _get(db, incident_id, user)
    logs = db.scalars(select(AuditLog).where(AuditLog.entity_type == "bite_incident", AuditLog.entity_id == incident_id).order_by(AuditLog.created_at.desc())).all()
    return [{"id": a.id, "action": a.action, "actor": a.actor.full_name if a.actor else "system", "role": a.actor_role, "changes": a.changes, "reason": a.reason, "at": a.created_at} for a in logs]
