from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import vocab
from ..database import get_db
from ..deps import require_roles
from ..models import Alert, AuditLog, CommunityReport, GeoLocation, InterventionRecord, Role, User, VeterinaryInspection
from ..schemas import AlertAssign, AlertCreate, AlertStatusIn, InspectionCreate, InterventionCreate, InterventionUpdate
from ..services import audit
from ..services.aggregates import district_of
from ..services.alerts_engine import evaluate_all
from ..services.geo import ancestors, new_code

router = APIRouter(tags=["alerts"])
console = require_roles(*vocab.CONSOLE_ROLES)
admins = require_roles(*vocab.ADMIN_ROLES)


class InspectionIn(InspectionCreate):
    verify_linked_reports: bool = Field(default=False, description="Mark community reports cited in the alert evidence as verified")


def _alert_out(a: Alert, detail: bool = False, db: Session | None = None) -> dict:
    anc = ancestors(a.ward)
    out = {
        "id": a.id, "alert_code": a.alert_code, "ward_id": a.ward_id, "ward": a.ward.name, "ward_number": a.ward.ward_number,
        "municipality": anc["municipality"].name if "municipality" in anc else None, "district": anc["district"].name if "district" in anc else None,
        "district_id": anc["district"].id if "district" in anc else None,
        "lat": a.ward.centroid_lat, "lng": a.ward.centroid_lng, "alert_type": a.alert_type, "alert_type_label": vocab.ALERT_TYPES[a.alert_type],
        "severity": a.severity, "title": a.title, "status": a.status, "status_label": vocab.ALERT_STATUS[a.status], "evidence": a.evidence,
        "assigned_to": {"id": a.assigned_to.id, "name": a.assigned_to.full_name, "role": a.assigned_to.role.name} if a.assigned_to else None,
        "generated_by": "system rule" if a.created_by_id is None else "manual", "due_date": a.due_date, "created_at": a.created_at, "updated_at": a.updated_at,
        "closed_at": a.closed_at, "closure_notes": a.closure_notes, "is_synthetic": a.is_synthetic,
        "allowed_transitions": sorted(vocab.ALERT_TRANSITIONS[a.status]),
    }
    if detail and db is not None:
        insp = db.scalars(select(VeterinaryInspection).where(VeterinaryInspection.alert_id == a.id).order_by(VeterinaryInspection.inspected_at.desc())).unique().all()
        ints = db.scalars(select(InterventionRecord).where(InterventionRecord.alert_id == a.id).order_by(InterventionRecord.created_at.desc())).unique().all()
        logs = db.scalars(select(AuditLog).where(AuditLog.entity_type == "alert", AuditLog.entity_id == a.id).order_by(AuditLog.created_at.desc())).unique().all()
        out["inspections"] = [{"id": i.id, "inspector": i.inspector.full_name, "inspected_at": i.inspected_at, "dogs_counted": i.dogs_counted, "dogs_injured_or_sick": i.dogs_injured_or_sick, "ear_notched_count": i.ear_notched_count, "report_outcome": i.report_outcome, "behaviour_findings": i.behaviour_findings, "environmental_findings": i.environmental_findings, "findings": i.findings} for i in insp]
        out["interventions"] = [{"id": i.id, "intervention_type": i.intervention_type, "label": vocab.INTERVENTION_TYPES[i.intervention_type], "description": i.description, "status": i.status, "performed_by": i.performed_by.full_name if i.performed_by else None, "started_at": i.started_at, "completed_at": i.completed_at, "dogs_vaccinated": i.dogs_vaccinated, "dogs_sterilised": i.dogs_sterilised, "dogs_treated": i.dogs_treated} for i in ints]
        out["history"] = [{"action": l.action, "actor": l.actor.full_name if l.actor else "GeoBite-AI rules engine", "role": l.actor_role, "changes": l.changes, "reason": l.reason, "at": l.created_at} for l in logs]
    return out


def _get(db: Session, alert_id: int, user: User) -> Alert:
    a = db.get(Alert, alert_id)
    if not a:
        raise HTTPException(404, "Alert not found")
    if user.role.code in vocab.FIELD_ROLES:
        d = district_of(a.ward)
        if a.assigned_to_id != user.id and user.district_id and d and d.id != user.district_id:
            raise HTTPException(404, "Alert not found")
    return a


def _can_act(a: Alert, user: User) -> None:
    if user.role.code in vocab.ADMIN_ROLES:
        return
    if user.role.code in vocab.FIELD_ROLES and a.assigned_to_id == user.id:
        return
    raise HTTPException(403, "Only the assigned officer or an administrator can update this alert")


def _transition(db: Session, a: Alert, new: str, user: User, note: str | None) -> None:
    if new == a.status:
        return
    if new not in vocab.ALERT_TRANSITIONS[a.status] and not (new == "closed" and user.role.code in vocab.ADMIN_ROLES):
        raise HTTPException(422, f"Cannot move alert from '{vocab.ALERT_STATUS[a.status]}' to '{vocab.ALERT_STATUS[new]}'")
    if new == "closed":
        if not note or len(note.strip()) < 5:
            raise HTTPException(422, "Closing an alert requires closure notes for the audit record")
        a.closed_at, a.closure_notes = datetime.now(timezone.utc), note
    old = a.status
    a.status = new
    audit.log(db, actor=user, action="status_change", entity_type="alert", entity_id=a.id, changes={"status": {"from": old, "to": new}}, reason=note)


@router.get("/alerts")
def list_alerts(
    status: str | None = None, alert_type: str | None = None, district_id: int | None = None, severity: str | None = None,
    mine: bool = False, include_closed: bool = False, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
    db: Session = Depends(get_db), user: User = Depends(console),
):
    q = select(Alert)
    if status:
        q = q.where(Alert.status == status)
    elif not include_closed:
        q = q.where(Alert.status != "closed")
    if alert_type:
        q = q.where(Alert.alert_type == alert_type)
    if severity:
        q = q.where(Alert.severity == severity)
    if mine:
        q = q.where(Alert.assigned_to_id == user.id)
    rows = db.scalars(q.order_by(Alert.created_at.desc())).unique().all()
    if user.role.code in vocab.FIELD_ROLES and user.district_id:
        rows = [a for a in rows if a.assigned_to_id == user.id or (district_of(a.ward) and district_of(a.ward).id == user.district_id)]
    if district_id:
        rows = [a for a in rows if district_of(a.ward) and district_of(a.ward).id == district_id]
    sev_rank = {"high": 0, "medium": 1, "low": 2}
    rows.sort(key=lambda a: (a.status == "closed", sev_rank.get(a.severity, 3), -a.created_at.timestamp()))
    return {"total": len(rows), "items": [_alert_out(a) for a in rows[offset : offset + limit]]}


@router.post("/alerts", status_code=201)
def create_alert(body: AlertCreate, db: Session = Depends(get_db), user: User = Depends(console)):
    ward = db.get(GeoLocation, body.ward_id)
    if not ward or ward.level != "ward":
        raise HTTPException(422, "Unknown ward")
    a = Alert(alert_code=new_code("GB-AL"), ward_id=ward.id, alert_type=body.alert_type, severity=body.severity, title=body.title, evidence={"rule": "manual", "notes": body.notes}, status="new", created_by_id=user.id)
    db.add(a)
    db.flush()
    audit.log(db, actor=user, action="create", entity_type="alert", entity_id=a.id, changes={"alert_type": a.alert_type})
    db.commit()
    return _alert_out(a)


@router.post("/alerts/evaluate")
def run_rules(db: Session = Depends(get_db), user: User = Depends(admins)):
    created = evaluate_all(db)
    audit.log(db, actor=user, action="evaluate_rules", entity_type="alert", entity_id=None, changes={"created": len(created)})
    db.commit()
    return {"created": [a.alert_code for a in created]}


@router.get("/alerts/{alert_id}")
def get_alert(alert_id: int, db: Session = Depends(get_db), user: User = Depends(console)):
    return _alert_out(_get(db, alert_id, user), detail=True, db=db)


@router.post("/alerts/{alert_id}/assign")
def assign(alert_id: int, body: AlertAssign, db: Session = Depends(get_db), user: User = Depends(admins)):
    a = _get(db, alert_id, user)
    if a.status == "closed":
        raise HTTPException(422, "Closed alerts cannot be reassigned")
    officer = db.get(User, body.assigned_to_id)
    if not officer or not officer.is_active or officer.role.code not in vocab.FIELD_ROLES:
        raise HTTPException(422, "Alerts can only be assigned to an active veterinary or municipal officer")
    prev = a.assigned_to.full_name if a.assigned_to else None
    a.assigned_to, a.due_date = officer, body.due_date
    audit.log(db, actor=user, action="assign", entity_type="alert", entity_id=a.id, changes={"assigned_to": {"from": prev, "to": officer.full_name}, "due_date": str(body.due_date) if body.due_date else None}, reason=body.note)
    if a.status == "new":
        _transition(db, a, "under_review", user, "Assigned for review")
    audit.notify(db, officer.id, f"Alert assigned to you: {a.alert_code}", a.title, f"/console/alerts/{a.id}")
    db.commit()
    return _alert_out(a, True, db)


@router.post("/alerts/{alert_id}/status")
def set_status(alert_id: int, body: AlertStatusIn, db: Session = Depends(get_db), user: User = Depends(console)):
    a = _get(db, alert_id, user)
    _can_act(a, user)
    if body.status == "closed" and user.role.code not in vocab.ADMIN_ROLES:
        raise HTTPException(403, "Only an administrator can close an alert")
    _transition(db, a, body.status, user, body.note)
    db.commit()
    return _alert_out(a, True, db)


@router.post("/alerts/{alert_id}/inspections", status_code=201)
def add_inspection(alert_id: int, body: InspectionIn, db: Session = Depends(get_db), user: User = Depends(console)):
    a = _get(db, alert_id, user)
    _can_act(a, user)
    if a.status == "closed":
        raise HTTPException(422, "Alert is closed")
    data = body.model_dump(exclude={"verify_linked_reports"})
    insp = VeterinaryInspection(**data, alert_id=a.id, ward_id=a.ward_id, inspector_id=user.id)
    db.add(insp)
    db.flush()
    audit.log(db, actor=user, action="inspection", entity_type="alert", entity_id=a.id, changes={"outcome": body.report_outcome, "dogs_counted": body.dogs_counted})
    verified = 0
    if body.verify_linked_reports and body.report_outcome != "not_confirmed":
        for code in (a.evidence or {}).get("report_codes", []):
            r = db.scalar(select(CommunityReport).where(CommunityReport.report_code == code))
            if r and r.verification_status != "verified":
                r.verification_status, r.verified_by_id, r.verified_at = "verified", user.id, datetime.now(timezone.utc)
                r.verification_notes = f"Verified by field inspection for alert {a.alert_code}"
                audit.log(db, actor=user, action="verify", entity_type="community_report", entity_id=r.id, changes={"verification_status": {"to": "verified"}}, reason=f"Field inspection {a.alert_code}")
                verified += 1
    if body.report_outcome in ("confirmed", "partially_confirmed") and a.status in ("under_review", "field_verification_required"):
        _transition(db, a, "verified", user, f"Field inspection: {vocab.INSPECTION_OUTCOMES[body.report_outcome]}")
    elif body.report_outcome == "not_confirmed" and a.status == "under_review":
        _transition(db, a, "field_verification_required", user, "Inspection did not confirm reports; follow-up visit suggested")
    db.commit()
    return {**_alert_out(a, True, db), "reports_verified": verified}


@router.post("/alerts/{alert_id}/interventions", status_code=201)
def add_intervention(alert_id: int, body: InterventionCreate, db: Session = Depends(get_db), user: User = Depends(console)):
    a = _get(db, alert_id, user)
    _can_act(a, user)
    if a.status == "closed":
        raise HTTPException(422, "Alert is closed")
    i = InterventionRecord(**body.model_dump(), alert_id=a.id, ward_id=a.ward_id, performed_by_id=a.assigned_to_id or user.id)
    db.add(i)
    db.flush()
    audit.log(db, actor=user, action="intervention", entity_type="alert", entity_id=a.id, changes={"intervention_type": body.intervention_type, "status": body.status})
    if a.status == "verified":
        _transition(db, a, "intervention_assigned", user, f"Intervention planned: {vocab.INTERVENTION_TYPES[body.intervention_type]}")
    _maybe_complete(db, a, user)
    db.commit()
    return _alert_out(a, True, db)


@router.patch("/interventions/{intervention_id}")
def update_intervention(intervention_id: int, body: InterventionUpdate, db: Session = Depends(get_db), user: User = Depends(console)):
    i = db.get(InterventionRecord, intervention_id)
    if not i:
        raise HTTPException(404, "Intervention not found")
    a = _get(db, i.alert_id, user) if i.alert_id else None
    if a:
        _can_act(a, user)
    before = audit.snapshot(i, ["status", "completed_at", "dogs_vaccinated", "dogs_sterilised", "dogs_treated", "description"])
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(i, k, v)
    if i.status == "completed" and not i.completed_at:
        i.completed_at = datetime.now(timezone.utc).date()
    after = audit.snapshot(i, list(before))
    audit.log(db, actor=user, action="intervention_update", entity_type="alert" if a else "intervention", entity_id=a.id if a else i.id, changes=audit.diff(before, after))
    if a:
        _maybe_complete(db, a, user)
    db.commit()
    return _alert_out(a, True, db) if a else {"ok": True}


def _maybe_complete(db: Session, a: Alert, user: User) -> None:
    ints = db.scalars(select(InterventionRecord).where(InterventionRecord.alert_id == a.id, InterventionRecord.status != "cancelled")).unique().all()
    if ints and all(i.status == "completed" for i in ints) and a.status == "intervention_assigned":
        _transition(db, a, "action_completed", user, "All interventions completed")


@router.get("/officers")
def officers(district_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(console)):
    q = select(User).join(Role).where(Role.code.in_(list(vocab.FIELD_ROLES)), User.is_active.is_(True), User.deleted_at.is_(None))
    if district_id:
        q = q.where(or_(User.district_id == district_id, User.district_id.is_(None)))
    return [{"id": u.id, "name": u.full_name, "role": u.role.code, "role_name": u.role.name, "designation": u.designation, "district": u.district.name if u.district else "All districts"} for u in db.scalars(q).unique().all()]
