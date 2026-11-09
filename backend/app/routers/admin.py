from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, require_roles
from ..models import AuditLog, Notification, Role, User
from ..schemas import AdminUserCreate, AdminUserUpdate, UserOut
from ..security import hash_password
from ..services import audit

router = APIRouter(tags=["administration"])
super_admin = require_roles("super_admin")
auditors = require_roles("super_admin", "medical_admin")


@router.get("/admin/users")
def list_users(role: str | None = None, q: str | None = None, db: Session = Depends(get_db), user: User = Depends(auditors)):
    query = select(User).join(Role).where(User.deleted_at.is_(None))
    if role:
        query = query.where(Role.code == role)
    if q:
        query = query.where(User.full_name.ilike(f"%{q}%") | User.email.ilike(f"%{q}%"))
    if user.role.code == "medical_admin":
        query = query.where(Role.code.in_(["hospital_staff", "medical_admin"]))
    return [UserOut.from_user(u) for u in db.scalars(query.order_by(User.created_at.desc())).unique().all()]


@router.post("/admin/users", status_code=201)
def create_user(body: AdminUserCreate, db: Session = Depends(get_db), user: User = Depends(super_admin)):
    if db.scalar(select(User.id).where(User.email == body.email.lower())):
        raise HTTPException(409, "Email already registered")
    role = db.scalar(select(Role).where(Role.code == body.role))
    u = User(email=body.email.lower(), password_hash=hash_password(body.password), full_name=body.full_name, designation=body.designation, role_id=role.id, hospital_id=body.hospital_id, district_id=body.district_id)
    db.add(u)
    db.flush()
    audit.log(db, actor=user, action="create", entity_type="user", entity_id=u.id, changes={"role": body.role})
    db.commit()
    db.refresh(u)
    return UserOut.from_user(u)


@router.patch("/admin/users/{user_id}")
def update_user(user_id: int, body: AdminUserUpdate, db: Session = Depends(get_db), user: User = Depends(super_admin)):
    u = db.get(User, user_id)
    if not u or u.deleted_at:
        raise HTTPException(404, "User not found")
    if u.id == user.id and (body.is_active is False or (body.role and body.role != "super_admin")):
        raise HTTPException(422, "You cannot deactivate or demote your own account")
    changes = {}
    if body.role:
        role = db.scalar(select(Role).where(Role.code == body.role))
        changes["role"] = {"from": u.role.code, "to": body.role}
        u.role_id = role.id
    for f in ("is_active", "district_id", "hospital_id"):
        v = getattr(body, f)
        if v is not None and getattr(u, f) != v:
            changes[f] = {"from": getattr(u, f), "to": v}
            setattr(u, f, v)
    audit.log(db, actor=user, action="update", entity_type="user", entity_id=u.id, changes=changes)
    db.commit()
    db.refresh(u)
    return UserOut.from_user(u)


@router.get("/admin/audit-logs")
def audit_logs(entity_type: str | None = None, action: str | None = None, limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0), db: Session = Depends(get_db), user: User = Depends(auditors)):
    q = select(AuditLog)
    if entity_type:
        q = q.where(AuditLog.entity_type == entity_type)
    if action:
        q = q.where(AuditLog.action == action)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)).unique().all()
    return {"total": total, "items": [{"id": a.id, "at": a.created_at, "actor": a.actor.full_name if a.actor else ("public" if a.actor_role == "public" else "system"), "role": a.actor_role, "action": a.action, "entity_type": a.entity_type, "entity_id": a.entity_id, "changes": a.changes, "reason": a.reason} for a in rows]}


@router.get("/notifications")
def notifications(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(30)).all()
    unread = db.scalar(select(func.count()).where(Notification.user_id == user.id, Notification.is_read.is_(False)))
    return {"unread": unread, "items": [{"id": n.id, "title": n.title, "body": n.body, "link": n.link, "is_read": n.is_read, "at": n.created_at} for n in rows]}


@router.post("/notifications/read-all")
def read_all(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db.execute(update(Notification).where(Notification.user_id == user.id).values(is_read=True))
    db.commit()
    return {"ok": True}


@router.post("/notifications/{nid}/read")
def read_one(nid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    n = db.get(Notification, nid)
    if not n or n.user_id != user.id:
        raise HTTPException(404, "Not found")
    n.is_read = True
    db.commit()
    return {"ok": True}
