from datetime import date, datetime
from typing import Any

from sqlalchemy.orm import Session

from ..models import AuditLog, Notification, User

# Fields that must never be copied into audit diffs.
_REDACT = {"password_hash", "ip_hash", "contact_email", "phone", "registration_code_hash"}


def _jsonable(v: Any) -> Any:
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


def snapshot(obj: Any, fields: list[str]) -> dict:
    return {f: _jsonable(getattr(obj, f)) for f in fields if f not in _REDACT}


def diff(before: dict, after: dict) -> dict:
    return {k: {"from": before.get(k), "to": after.get(k)} for k in after if before.get(k) != after.get(k)}


def log(
    db: Session,
    *,
    actor: User | None,
    action: str,
    entity_type: str,
    entity_id: int | None,
    changes: dict | None = None,
    reason: str | None = None,
    ip_hash: str | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_id=actor.id if actor else None,
            actor_role=actor.role.code if actor else "public",
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            changes={k: v for k, v in (changes or {}).items() if k not in _REDACT} or None,
            reason=reason,
            ip_hash=ip_hash,
        )
    )


def notify(db: Session, user_id: int, title: str, body: str | None = None, link: str | None = None) -> None:
    db.add(Notification(user_id=user_id, title=title, body=body, link=link))
