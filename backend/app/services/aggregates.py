"""Shared filtering and per-ward aggregation used by dashboards, map layers, analytics and alerts."""
from __future__ import annotations

import statistics
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from fastapi import Query
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from .. import vocab
from ..models import BiteIncident, CommunityReport, GeoLocation, VaccinationRecord


@dataclass
class Filters:
    district_id: int | None = None
    municipality_id: int | None = None
    ward_id: int | None = None
    date_from: date | None = None
    date_to: date | None = None
    incident_type: str | None = None  # injury category for bites, behaviour category for community
    verification_status: str | None = None
    include_synthetic: bool = True

    def window(self, default_days: int = 365) -> tuple[date, date]:
        end = self.date_to or datetime.now(timezone.utc).date()
        start = self.date_from or end - timedelta(days=default_days)
        return start, end


def filters_dep(
    state: str | None = Query(None, description="Only 'Tamil Nadu' is configured in the pilot"),
    district_id: int | None = None,
    municipality_id: int | None = None,
    ward_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    incident_type: str | None = None,
    verification_status: str | None = None,
) -> Filters:
    return Filters(district_id, municipality_id, ward_id, date_from, date_to, incident_type or None, verification_status or None)


def bite_query(f: Filters, default_days: int = 365) -> Select:
    start, end = f.window(default_days)
    q = select(BiteIncident).where(
        BiteIncident.deleted_at.is_(None), BiteIncident.incident_date >= start, BiteIncident.incident_date <= end
    )
    if f.district_id:
        q = q.where(BiteIncident.district_id == f.district_id)
    if f.municipality_id:
        q = q.where(BiteIncident.municipality_id == f.municipality_id)
    if f.ward_id:
        q = q.where(BiteIncident.ward_id == f.ward_id)
    if f.incident_type and f.incident_type in vocab.INJURY_CATEGORY:
        q = q.where(BiteIncident.injury_category == f.incident_type)
    return q


def community_query(f: Filters, default_days: int = 365) -> Select:
    start, end = f.window(default_days)
    q = select(CommunityReport).where(
        CommunityReport.deleted_at.is_(None),
        CommunityReport.observed_at >= datetime.combine(start, time.min, tzinfo=timezone.utc),
        CommunityReport.observed_at <= datetime.combine(end, time.max, tzinfo=timezone.utc),
    )
    if f.district_id:
        q = q.where(CommunityReport.district_id == f.district_id)
    if f.municipality_id:
        q = q.where(CommunityReport.municipality_id == f.municipality_id)
    if f.ward_id:
        q = q.where(CommunityReport.ward_id == f.ward_id)
    if f.verification_status in vocab.REPORT_STATUS:
        q = q.where(CommunityReport.verification_status == f.verification_status)
    return q


def filter_behaviour(reports: list[CommunityReport], category: str | None) -> list[CommunityReport]:
    if not category or category not in vocab.BEHAVIOURS:
        return reports
    return [r for r in reports if any(b.category == category for b in r.behaviours)]


def wards(db: Session, f: Filters | None = None) -> list[GeoLocation]:
    q = select(GeoLocation).where(GeoLocation.level == "ward")
    ws = db.scalars(q).all()
    if f:
        anc = lambda w: _ancestor_ids(w)  # noqa: E731
        if f.ward_id:
            ws = [w for w in ws if w.id == f.ward_id]
        elif f.municipality_id:
            ws = [w for w in ws if f.municipality_id in anc(w)]
        elif f.district_id:
            ws = [w for w in ws if f.district_id in anc(w)]
    return list(ws)


def _ancestor_ids(node: GeoLocation) -> set[int]:
    ids = set()
    while node is not None:
        ids.add(node.id)
        node = node.parent
    return ids


def district_of(node: GeoLocation) -> GeoLocation | None:
    while node is not None and node.level != "district":
        node = node.parent
    return node


# ------------------------------------------------------------------ dedup-aware dog estimates
def cluster_estimates(reports: list[CommunityReport]) -> dict[int, dict]:
    """Group reports by observation cluster. A cluster's dog estimate is the median of its
    reports' counts - overlapping reports of the same dogs are never summed."""
    groups: dict[int, list[CommunityReport]] = defaultdict(list)
    for r in reports:
        groups[r.observation_cluster_id or -r.id].append(r)
    out = {}
    for cid, rs in groups.items():
        counts = [r.dog_observation.total_dogs for r in rs if r.dog_observation]
        independent = {r.ip_hash or f"u{r.reporter_user_id or r.id}" for r in rs if not r.is_probable_duplicate}
        lat = statistics.fmean(r.latitude for r in rs)
        lng = statistics.fmean(r.longitude for r in rs)
        out[cid] = {
            "cluster_id": cid,
            "reports": rs,
            "report_count": len(rs),
            "independent_reports": max(len(independent), 1),
            "estimated_dogs": int(round(statistics.median(counts))) if counts else 0,
            "lat": lat,
            "lng": lng,
            "verified": any(r.verification_status == "verified" for r in rs),
            "statuses": sorted({r.verification_status for r in rs}),
            "first_observed": min(r.observed_at for r in rs),
            "last_observed": max(r.observed_at for r in rs),
            "ward_id": rs[0].ward_id,
            "behaviours": sorted({b.category for r in rs for b in r.behaviours}),
        }
    return out


def vaccination_by_ward(db: Session) -> dict[int, dict]:
    """Latest vaccination info per ward. Coverage is only computed from *confirmed* records that
    come with a documented population survey; otherwise status is 'confirmed_no_estimate' or
    'unverified'. Wards absent from the result have no information."""
    recs = db.scalars(select(VaccinationRecord).order_by(VaccinationRecord.start_date)).all()
    out: dict[int, dict] = {}
    for r in recs:
        info = out.setdefault(r.ward_id, {"records": 0, "dogs_vaccinated": 0, "latest": None, "coverage": None, "status": "unverified", "survey_population": None})
        info["records"] += 1
        info["latest"] = r.end_date or r.start_date
        if r.verification_status == "confirmed":
            info["dogs_vaccinated"] += r.dogs_vaccinated
            if r.estimation_method == "documented_survey" and r.estimated_dog_population:
                info["survey_population"] = r.estimated_dog_population
                info["status"] = "survey_estimate"
            elif info["status"] != "survey_estimate":
                info["status"] = "confirmed_no_estimate"
    for info in out.values():
        if info["status"] == "survey_estimate" and info["survey_population"]:
            info["coverage"] = round(min(1.0, info["dogs_vaccinated"] / info["survey_population"]), 3)
    return out


def ward_indicators(db: Session, f: Filters, days: int = 90) -> list[dict]:
    """Per-ward indicators for the period used by Gi*, the One Health index and the ward table."""
    ws = wards(db, f)
    ff = Filters(**{**f.__dict__})
    bites = db.scalars(bite_query(ff, days)).all()
    reports = db.scalars(community_query(Filters(f.district_id, f.municipality_id, f.ward_id, f.date_from, f.date_to), days)).all()
    clusters = cluster_estimates(reports)
    vax = vaccination_by_ward(db)

    bite_count = defaultdict(int)
    persons = defaultdict(int)
    cat3 = defaultdict(int)
    for b in bites:
        if b.ward_id:
            bite_count[b.ward_id] += 1
            persons[b.ward_id] += b.persons_affected
            cat3[b.ward_id] += b.injury_category == "cat_iii"
    dogs = defaultdict(int)
    obs_clusters = defaultdict(int)
    beh_score = defaultdict(float)
    concern_reports = defaultdict(int)
    for c in clusters.values():
        wid = c["ward_id"]
        if not wid:
            continue
        dogs[wid] += c["estimated_dogs"]
        obs_clusters[wid] += 1
        concerning = [r for r in c["reports"] if any(b.category in vocab.CONCERN_BEHAVIOURS for b in r.behaviours) and not r.is_probable_duplicate]
        if concerning:
            indep = len({r.ip_hash or r.id for r in concerning})
            beh_score[wid] += indep + sum(1 for r in concerning if r.verification_status == "verified")
            concern_reports[wid] += indep
    reports_per_ward = defaultdict(int)
    for r in reports:
        if r.ward_id:
            reports_per_ward[r.ward_id] += 1

    rows = []
    for w in ws:
        pop = w.population or 0
        d = district_of(w)
        v = vax.get(w.id)
        rows.append(
            {
                "id": w.id,
                "ward": w.name,
                "ward_number": w.ward_number,
                "municipality": w.parent.name if w.parent else None,
                "district": d.name if d else None,
                "district_id": d.id if d else None,
                "lat": w.centroid_lat,
                "lng": w.centroid_lng,
                "population": w.population,
                "area_km2": w.area_km2,
                "bites": bite_count[w.id],
                "persons_affected": persons[w.id],
                "category_iii": cat3[w.id],
                "bite_rate": round(bite_count[w.id] / pop * 10000, 2) if pop else 0.0,
                "community_reports": reports_per_ward[w.id],
                "observation_clusters": obs_clusters[w.id],
                "observed_dogs": dogs[w.id],
                "dog_density": round(dogs[w.id] / w.area_km2, 2) if w.area_km2 else 0.0,
                "behaviour_score": beh_score[w.id],
                "concerning_reports": concern_reports[w.id],
                "vax_coverage": v["coverage"] if v else None,
                "vax_status": v["status"] if v else "unavailable",
                "has_dog_observations": obs_clusters[w.id] > 0,
            }
        )
    return rows
