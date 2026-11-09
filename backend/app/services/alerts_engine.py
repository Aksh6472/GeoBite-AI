"""Rule-based alert generation. Every rule is explicit and its evidence is stored with the alert.

Rules (evaluated per ward):
  bite_cluster        >= 5 bites in last 30 days AND >= 1.5x the ward's monthly baseline (previous 90 days)
  repeated_behaviour  >= 3 independent concerning-behaviour reports in last 14 days
  animal_welfare      >= 2 injured/sick/needs-vet reports in last 7 days
  combined_hotspot    One Health Investigation Priority Index >= 60 (evaluated with analytics runs)

An alert is only created when no open alert of the same type exists for the ward; otherwise the
open alert's evidence is refreshed.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import vocab
from ..models import Alert, BiteIncident, CommunityReport, GeoLocation, Role, User
from . import audit
from .aggregates import Filters, district_of, ward_indicators
from .geo import new_code
from .hotspot import one_health_index

BITE_MIN = 5
BITE_RATIO = 1.5
BEHAVIOUR_MIN = 3
WELFARE_MIN = 2
INDEX_MIN = 60.0


def _open_alert(db: Session, ward_id: int, alert_type: str) -> Alert | None:
    return db.scalar(select(Alert).where(Alert.ward_id == ward_id, Alert.alert_type == alert_type, Alert.status != "closed"))


def _upsert(db: Session, ward: GeoLocation, alert_type: str, severity: str, title: str, evidence: dict, synthetic: bool = False) -> Alert | None:
    existing = _open_alert(db, ward.id, alert_type)
    evidence = {**evidence, "evaluated_at": datetime.now(timezone.utc).isoformat()}
    if existing:
        existing.evidence = evidence
        if severity == "high" and existing.severity != "high":
            existing.severity = "high"
        return None
    a = Alert(alert_code=new_code("GB-AL"), ward_id=ward.id, alert_type=alert_type, severity=severity, title=title, evidence=evidence, status="new", is_synthetic=synthetic)
    db.add(a)
    db.flush()
    audit.log(db, actor=None, action="alert_generated", entity_type="alert", entity_id=a.id, changes={"rule": alert_type, "severity": severity})
    d = district_of(ward)
    officers = db.scalars(
        select(User).join(Role).where(User.is_active.is_(True), Role.code.in_(["super_admin", "medical_admin", "veterinary_officer", "municipal_officer"]))
    ).all()
    for u in officers:
        if u.role.code in vocab.FIELD_ROLES and u.district_id and d and u.district_id != d.id:
            continue
        audit.notify(db, u.id, f"New alert: {title}", f"{vocab.ALERT_TYPES[alert_type]} in {ward.name}", f"/console/alerts/{a.id}")
    return a


def evaluate_ward(db: Session, ward: GeoLocation, now: datetime | None = None, synthetic: bool = False) -> list[Alert]:
    now = now or datetime.now(timezone.utc)
    today = now.date()
    created: list[Alert] = []

    bites = db.scalars(
        select(BiteIncident).where(BiteIncident.ward_id == ward.id, BiteIncident.deleted_at.is_(None), BiteIncident.incident_date >= today - timedelta(days=120))
    ).all()
    last30 = [b for b in bites if b.incident_date > today - timedelta(days=30)]
    prior = [b for b in bites if today - timedelta(days=120) < b.incident_date <= today - timedelta(days=30)]
    baseline = len(prior) / 3.0
    ratio = len(last30) / baseline if baseline > 0 else float(len(last30))
    if len(last30) >= BITE_MIN and ratio >= BITE_RATIO:
        sev = "high" if len(last30) >= 10 or ratio >= 3 else "medium"
        a = _upsert(
            db, ward, "bite_cluster", sev, f"Rise in hospital-reported bites - {ward.name}",
            {
                "rule": f">= {BITE_MIN} bites in 30 days and >= {BITE_RATIO}x monthly baseline",
                "bites_last_30_days": len(last30),
                "monthly_baseline_prior_90_days": round(baseline, 2),
                "ratio": round(ratio, 2),
                "category_iii": sum(b.injury_category == "cat_iii" for b in last30),
                "children_under_15": sum(b.victim_age_group in ("0-4", "5-14") for b in last30),
                "location_types": _count(b.location_type for b in last30),
            },
            synthetic,
        )
        if a:
            created.append(a)

    reports = db.scalars(
        select(CommunityReport).where(
            CommunityReport.ward_id == ward.id, CommunityReport.deleted_at.is_(None), CommunityReport.verification_status != "rejected",
            CommunityReport.observed_at >= now - timedelta(days=14),
        )
    ).all()
    concerning = [r for r in reports if not r.is_probable_duplicate and {b.category for b in r.behaviours} & vocab.CONCERN_BEHAVIOURS]
    indep = {r.ip_hash or f"r{r.id}" for r in concerning}
    if len(indep) >= BEHAVIOUR_MIN:
        verified = sum(r.verification_status == "verified" for r in concerning)
        bite_claims = sum(any(b.category == "bite_reported" for b in r.behaviours) for r in concerning)
        sev = "high" if verified >= 2 or bite_claims >= 2 else "medium"
        a = _upsert(
            db, ward, "repeated_behaviour", sev, f"Repeated concerning-behaviour reports - {ward.name}",
            {
                "rule": f">= {BEHAVIOUR_MIN} independent concerning reports in 14 days",
                "independent_reports": len(indep),
                "verified_reports": verified,
                "unverified_reports": len(concerning) - verified,
                "behaviours": _count(b.category for r in concerning for b in r.behaviours if b.category in vocab.CONCERN_BEHAVIOURS),
                "report_codes": [r.report_code for r in concerning[:20]],
                "note": "Community observations are unverified until field verification. Not a classification of any dog as dangerous.",
            },
            synthetic,
        )
        if a:
            created.append(a)

    welfare = [r for r in reports if r.observed_at >= _aware(now - timedelta(days=7)) and {b.category for b in r.behaviours} & vocab.WELFARE_BEHAVIOURS]
    if len(welfare) >= WELFARE_MIN:
        a = _upsert(
            db, ward, "animal_welfare", "medium" if len(welfare) >= 4 else "low", f"Dogs needing veterinary assistance - {ward.name}",
            {"rule": f">= {WELFARE_MIN} welfare reports in 7 days", "reports": len(welfare), "report_codes": [r.report_code for r in welfare[:20]]},
            synthetic,
        )
        if a:
            created.append(a)
    return created


def evaluate_index_alerts(db: Session, synthetic: bool = False) -> list[Alert]:
    rows = one_health_index(ward_indicators(db, Filters(), days=90))
    created = []
    for r in rows:
        if r["index"] >= INDEX_MIN:
            ward = db.get(GeoLocation, r["id"])
            a = _upsert(
                db, ward, "combined_hotspot", "high" if r["index"] >= 75 else "medium", f"One Health investigation priority - {ward.name}",
                {"rule": f"Investigation Priority Index >= {INDEX_MIN}", "index": r["index"], "contributions": r["contributions"], "data_gaps": r["data_gaps"]},
                synthetic,
            )
            if a:
                created.append(a)
    return created


def evaluate_all(db: Session, synthetic: bool = False) -> list[Alert]:
    out: list[Alert] = []
    for w in db.scalars(select(GeoLocation).where(GeoLocation.level == "ward")).all():
        out.extend(evaluate_ward(db, w, synthetic=synthetic))
    out.extend(evaluate_index_alerts(db, synthetic))
    return out


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _count(it) -> dict:
    d: dict = {}
    for x in it:
        d[x] = d.get(x, 0) + 1
    return d
