"""Community-report de-duplication and review prioritisation.

* De-duplication: a new report joins the observation cluster of a report within `dedup_radius_m`
  observed within `cluster_window_days`. Cluster population = median of reported counts (never
  the sum). A report from the same submitter (IP hash / user) in the same cluster within
  `duplicate_window_hours` is flagged as a probable duplicate and excluded from independent counts.
* Prioritisation: transparent, rule-based scoring that orders the human verification queue.
  It never labels dogs as dangerous - it only decides which reports a person looks at first.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .. import vocab
from ..config import get_settings
from ..database import has_postgis
from ..models import BiteIncident, CommunityReport
from .geo import haversine_m

settings = get_settings()


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def nearby_reports(db: Session, lat: float, lng: float, observed_at: datetime, radius_m: float, hours: int, exclude_id: int | None = None) -> list[CommunityReport]:
    lo, hi = observed_at - timedelta(hours=hours), observed_at + timedelta(hours=hours)
    if has_postgis():
        ids = [
            r[0]
            for r in db.execute(
                text(
                    "SELECT id FROM community_reports WHERE deleted_at IS NULL AND observed_at BETWEEN :lo AND :hi "
                    "AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(:lng,:lat),4326)::geography, :r)"
                ),
                {"lo": lo, "hi": hi, "lat": lat, "lng": lng, "r": radius_m},
            )
        ]
        rs = db.scalars(select(CommunityReport).where(CommunityReport.id.in_(ids))).all() if ids else []
    else:
        dlat = radius_m / 111_000 * 1.5
        cand = db.scalars(
            select(CommunityReport).where(
                CommunityReport.deleted_at.is_(None),
                CommunityReport.observed_at.between(lo, hi),
                CommunityReport.latitude.between(lat - dlat, lat + dlat),
                CommunityReport.longitude.between(lng - dlat * 1.2, lng + dlat * 1.2),
            )
        ).all()
        rs = [r for r in cand if haversine_m(lat, lng, r.latitude, r.longitude) <= radius_m]
    return [r for r in rs if r.id != exclude_id]


def assign_cluster(db: Session, report: CommunityReport) -> None:
    """Join the observation cluster of the nearest report within `dedup_radius_m` observed within
    `cluster_window_days` (resident dogs occupy stable territories, so repeated sightings of a place
    describe the same group). Same-submitter reports inside the cluster within
    `duplicate_window_hours` are flagged as probable duplicates."""
    obs = _aware(report.observed_at)
    near = nearby_reports(db, report.latitude, report.longitude, obs, settings.dedup_radius_m, settings.cluster_window_days * 24, report.id)
    if not near:
        report.observation_cluster_id = report.id
        return
    near.sort(key=lambda r: haversine_m(report.latitude, report.longitude, r.latitude, r.longitude))
    report.observation_cluster_id = near[0].observation_cluster_id or near[0].id
    dup_window = timedelta(hours=settings.duplicate_window_hours)
    report.is_probable_duplicate = any(
        (r.observation_cluster_id or r.id) == report.observation_cluster_id
        and abs(_aware(r.observed_at) - obs) <= dup_window
        and ((report.ip_hash and r.ip_hash == report.ip_hash) or (report.reporter_user_id and r.reporter_user_id == report.reporter_user_id))
        for r in near
    )


def score_report(db: Session, report: CommunityReport) -> None:
    cats = {b.category for b in report.behaviours}
    score, reasons = 0.0, []
    concern = cats & vocab.CONCERN_BEHAVIOURS
    if concern:
        score += len(concern)
        reasons.append(f"{len(concern)} concerning behaviour type(s) reported: " + ", ".join(vocab.BEHAVIOURS[c] for c in sorted(concern)))
    if "bite_reported" in cats:
        score += 3
        reasons.append("Community member reports a bite - cross-check with hospital surveillance")
    if cats & vocab.WELFARE_BEHAVIOURS:
        score += 2
        reasons.append("Animal welfare: injured/sick dog or veterinary assistance requested")

    obs = _aware(report.observed_at)
    peers = [
        r
        for r in nearby_reports(db, report.latitude, report.longitude, obs, 400, 24 * 14, report.id)
        if not r.is_probable_duplicate and {b.category for b in r.behaviours} & vocab.CONCERN_BEHAVIOURS
    ]
    indep = len({r.ip_hash or r.id for r in peers})
    if concern and indep:
        score += 2 * min(indep, 4)
        reasons.append(f"{indep} other independent concerning report(s) within 400 m in 14 days")

    since = (obs - timedelta(days=30)).date()
    bites = db.scalars(
        select(BiteIncident).where(
            BiteIncident.deleted_at.is_(None),
            BiteIncident.incident_date >= since,
            BiteIncident.latitude.between(report.latitude - 0.006, report.latitude + 0.006),
            BiteIncident.longitude.between(report.longitude - 0.006, report.longitude + 0.006),
        )
    ).all()
    nb = sum(1 for b in bites if haversine_m(report.latitude, report.longitude, b.latitude, b.longitude) <= 500)
    if nb and (concern or "bite_reported" in cats):
        score += 2
        reasons.append(f"Corroboration: {nb} hospital-reported bite(s) within 500 m in last 30 days")
    if report.is_probable_duplicate:
        score *= 0.5
        reasons.append("Probable repeat submission by the same reporter - weight halved")
    report.priority_score = round(score, 1)
    report.priority_reasons = reasons
