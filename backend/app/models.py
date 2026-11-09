"""Relational schema for GeoBite-AI.

Coordinates are stored as latitude/longitude floats on every spatial table so that the
ORM works on both PostgreSQL and SQLite. On PostgreSQL the Alembic migration additionally
adds a PostGIS `geom geometry(Point, 4326)` column (kept in sync by a trigger) plus GIST
indexes, which the spatial services use for ST_DWithin / ST_Contains queries.
"""
from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from .database import Base

JSONType = JSON().with_variant(JSONB(), "postgresql")


class UTCDateTime(TypeDecorator):
    """Timezone-aware UTC datetimes on every backend (SQLite stores naive UTC)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        value = value.astimezone(timezone.utc)
        return value.replace(tzinfo=None) if dialect.name == "sqlite" else value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utcnow, onupdate=utcnow, nullable=False
    )


# --------------------------------------------------------------------------------------
# Identity & access
# --------------------------------------------------------------------------------------
class Role(Base):
    __tablename__ = "roles"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class User(TimestampMixin, Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    designation: Mapped[str | None] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(20))  # never returned by public APIs
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), nullable=False, index=True)
    hospital_id: Mapped[int | None] = mapped_column(ForeignKey("hospitals.id"), index=True)
    district_id: Mapped[int | None] = mapped_column(ForeignKey("geographical_locations.id"), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    deleted_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    role: Mapped[Role] = relationship(lazy="joined")
    hospital: Mapped["Hospital | None"] = relationship(lazy="joined", foreign_keys=[hospital_id])
    district: Mapped["GeoLocation | None"] = relationship(lazy="joined", foreign_keys=[district_id])


# --------------------------------------------------------------------------------------
# Geography (state -> district -> municipality -> ward)
# --------------------------------------------------------------------------------------
class GeoLocation(TimestampMixin, Base):
    __tablename__ = "geographical_locations"
    __table_args__ = (
        CheckConstraint("level IN ('state','district','municipality','ward')", name="ck_geo_level"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    level: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("geographical_locations.id"), index=True)
    ward_number: Mapped[int | None] = mapped_column(Integer)
    centroid_lat: Mapped[float] = mapped_column(Float, nullable=False)
    centroid_lng: Mapped[float] = mapped_column(Float, nullable=False)
    boundary_geojson: Mapped[dict | None] = mapped_column(JSONType)  # synthetic demo boundary
    population: Mapped[int | None] = mapped_column(Integer)
    area_km2: Mapped[float | None] = mapped_column(Float)
    waste_sites: Mapped[int | None] = mapped_column(Integer)
    schools: Mapped[int | None] = mapped_column(Integer)
    markets: Mapped[int | None] = mapped_column(Integer)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    parent: Mapped["GeoLocation | None"] = relationship(remote_side=[id], lazy="joined", join_depth=3)


class Hospital(TimestampMixin, Base):
    __tablename__ = "hospitals"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    facility_type: Mapped[str] = mapped_column(String(60), nullable=False)
    district_id: Mapped[int] = mapped_column(ForeignKey("geographical_locations.id"), nullable=False, index=True)
    municipality_id: Mapped[int | None] = mapped_column(ForeignKey("geographical_locations.id"))
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    registration_code_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    district: Mapped[GeoLocation] = relationship(lazy="joined", foreign_keys=[district_id])


# --------------------------------------------------------------------------------------
# Portal 1: hospital bite incidents (no direct patient identifiers are collected)
# --------------------------------------------------------------------------------------
class BiteIncident(TimestampMixin, Base):
    __tablename__ = "bite_incidents"
    __table_args__ = (
        CheckConstraint("persons_affected >= 1 AND persons_affected <= 100", name="ck_bite_persons"),
        CheckConstraint("latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180", name="ck_bite_coords"),
        Index("ix_bite_district_date", "district_id", "incident_date"),
        Index("ix_bite_ward_date", "ward_id", "incident_date"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    incident_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    hospital_id: Mapped[int] = mapped_column(ForeignKey("hospitals.id"), nullable=False, index=True)
    reported_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)

    # A. incident details
    incident_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    incident_time_approx: Mapped[str | None] = mapped_column(String(20))
    hospital_report_date: Mapped[date] = mapped_column(Date, nullable=False)
    district_id: Mapped[int] = mapped_column(ForeignKey("geographical_locations.id"), nullable=False)
    municipality_id: Mapped[int | None] = mapped_column(ForeignKey("geographical_locations.id"))
    ward_id: Mapped[int | None] = mapped_column(ForeignKey("geographical_locations.id"))
    location_description: Mapped[str | None] = mapped_column(String(300))
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    location_type: Mapped[str] = mapped_column(String(30), nullable=False)

    # B. bite incident details
    persons_affected: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    victim_age_group: Mapped[str] = mapped_column(String(20), nullable=False)
    victim_sex: Mapped[str | None] = mapped_column(String(20))
    circumstances: Mapped[str | None] = mapped_column(Text)
    dog_ownership: Mapped[str] = mapped_column(String(20), nullable=False)
    provocation: Mapped[str] = mapped_column(String(30), nullable=False)
    injury_category: Mapped[str] = mapped_column(String(30), nullable=False)
    body_part: Mapped[str | None] = mapped_column(String(40))

    # C. clinical reporting fields (status only - no AI diagnosis or treatment advice)
    clinical_assessment_status: Mapped[str] = mapped_column(String(30), nullable=False)
    wound_management_status: Mapped[str] = mapped_column(String(30), nullable=False)
    pep_status: Mapped[str] = mapped_column(String(30), nullable=False)
    rig_status: Mapped[str] = mapped_column(String(30), nullable=False)
    follow_up_status: Mapped[str] = mapped_column(String(30), nullable=False)
    follow_up_due_date: Mapped[date | None] = mapped_column(Date)
    clinical_notes: Mapped[str | None] = mapped_column(Text)

    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    deletion_reason: Mapped[str | None] = mapped_column(String(300))

    hospital: Mapped[Hospital] = relationship(lazy="joined")
    district: Mapped[GeoLocation] = relationship(lazy="joined", foreign_keys=[district_id])
    municipality: Mapped[GeoLocation | None] = relationship(lazy="joined", foreign_keys=[municipality_id])
    ward: Mapped[GeoLocation | None] = relationship(lazy="joined", foreign_keys=[ward_id])
    reported_by: Mapped[User | None] = relationship(lazy="joined", foreign_keys=[reported_by_id])


# --------------------------------------------------------------------------------------
# Portal 2: community reports
# --------------------------------------------------------------------------------------
class CommunityReport(TimestampMixin, Base):
    __tablename__ = "community_reports"
    __table_args__ = (
        CheckConstraint(
            "verification_status IN ('received','under_verification','verified','rejected')",
            name="ck_cr_status",
        ),
        CheckConstraint("latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180", name="ck_cr_coords"),
        Index("ix_cr_ward_obs", "ward_id", "observed_at"),
        Index("ix_cr_content_hash", "content_hash"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    report_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    reporter_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    district_id: Mapped[int] = mapped_column(ForeignKey("geographical_locations.id"), nullable=False, index=True)
    municipality_id: Mapped[int | None] = mapped_column(ForeignKey("geographical_locations.id"))
    ward_id: Mapped[int | None] = mapped_column(ForeignKey("geographical_locations.id"))
    locality: Mapped[str | None] = mapped_column(String(120))
    street_landmark: Mapped[str | None] = mapped_column(String(200))
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    location_method: Mapped[str] = mapped_column(String(10), nullable=False)  # gps | map | manual
    observed_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    photo_path: Mapped[str | None] = mapped_column(String(300))
    photo_ai_detections: Mapped[int | None] = mapped_column(Integer)

    verification_status: Mapped[str] = mapped_column(String(30), default="received", nullable=False, index=True)
    verified_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    verified_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    verification_notes: Mapped[str | None] = mapped_column(Text)

    # Deduplication: reports describing the same group of dogs share a cluster id
    observation_cluster_id: Mapped[int | None] = mapped_column(Integer, index=True)
    is_probable_duplicate: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Review prioritisation (rule-based, for human review only)
    priority_score: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    priority_reasons: Mapped[list | None] = mapped_column(JSONType)

    consent_given: Mapped[bool] = mapped_column(Boolean, nullable=False)
    contact_email: Mapped[str | None] = mapped_column(String(255))  # optional, never public
    ip_hash: Mapped[str | None] = mapped_column(String(64))
    content_hash: Mapped[str | None] = mapped_column(String(64))
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    district: Mapped[GeoLocation] = relationship(lazy="joined", foreign_keys=[district_id])
    municipality: Mapped[GeoLocation | None] = relationship(lazy="joined", foreign_keys=[municipality_id])
    ward: Mapped[GeoLocation | None] = relationship(lazy="joined", foreign_keys=[ward_id])
    dog_observation: Mapped["DogObservation | None"] = relationship(
        back_populates="report", uselist=False, lazy="joined", cascade="all, delete-orphan"
    )
    behaviours: Mapped[list["BehaviourObservation"]] = relationship(
        back_populates="report", lazy="selectin", cascade="all, delete-orphan"
    )
    verified_by: Mapped[User | None] = relationship(lazy="joined", foreign_keys=[verified_by_id])


class DogObservation(Base):
    __tablename__ = "dog_observations"
    __table_args__ = (
        CheckConstraint("total_dogs >= 0 AND total_dogs <= 500", name="ck_do_total"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    report_id: Mapped[int] = mapped_column(
        ForeignKey("community_reports.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    total_dogs: Mapped[int] = mapped_column(Integer, nullable=False)
    estimated_locality_dogs: Mapped[int | None] = mapped_column(Integer)
    puppies: Mapped[int | None] = mapped_column(Integer)
    adults: Mapped[int | None] = mapped_column(Integer)
    injured: Mapped[int | None] = mapped_column(Integer)
    ear_notched: Mapped[int | None] = mapped_column(Integer)
    grouping: Mapped[str | None] = mapped_column(String(20))  # together | separately | both | unknown
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)

    report: Mapped[CommunityReport] = relationship(back_populates="dog_observation")


class BehaviourObservation(Base):
    __tablename__ = "behaviour_observations"
    __table_args__ = (UniqueConstraint("report_id", "category", name="uq_behaviour_report_cat"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    report_id: Mapped[int] = mapped_column(
        ForeignKey("community_reports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)

    report: Mapped[CommunityReport] = relationship(back_populates="behaviours")


# --------------------------------------------------------------------------------------
# Veterinary / municipal operations
# --------------------------------------------------------------------------------------
class VaccinationRecord(TimestampMixin, Base):
    __tablename__ = "vaccination_records"
    __table_args__ = (
        CheckConstraint("dogs_vaccinated >= 0", name="ck_vax_nonneg"),
        CheckConstraint("verification_status IN ('confirmed','unverified')", name="ck_vax_status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    ward_id: Mapped[int] = mapped_column(ForeignKey("geographical_locations.id"), nullable=False, index=True)
    campaign_name: Mapped[str] = mapped_column(String(200), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)
    dogs_vaccinated: Mapped[int] = mapped_column(Integer, nullable=False)
    estimated_dog_population: Mapped[int | None] = mapped_column(Integer)
    estimation_method: Mapped[str] = mapped_column(String(40), nullable=False)  # documented_survey | drive_record_only
    data_source: Mapped[str | None] = mapped_column(String(200))
    verification_status: Mapped[str] = mapped_column(String(20), default="unverified", nullable=False)
    verified_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    recorded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    notes: Mapped[str | None] = mapped_column(Text)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    ward: Mapped[GeoLocation] = relationship(lazy="joined")


class Alert(TimestampMixin, Base):
    __tablename__ = "alerts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('new','under_review','field_verification_required','verified',"
            "'intervention_assigned','action_completed','closed')",
            name="ck_alert_status",
        ),
        Index("ix_alert_ward_type_status", "ward_id", "alert_type", "status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    alert_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    ward_id: Mapped[int] = mapped_column(ForeignKey("geographical_locations.id"), nullable=False, index=True)
    alert_type: Mapped[str] = mapped_column(String(40), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False)  # low | medium | high
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    evidence: Mapped[dict] = mapped_column(JSONType, nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="new", nullable=False, index=True)
    assigned_to_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))  # NULL = generated by system rules
    due_date: Mapped[date | None] = mapped_column(Date)
    closed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    closure_notes: Mapped[str | None] = mapped_column(Text)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    ward: Mapped[GeoLocation] = relationship(lazy="joined")
    assigned_to: Mapped[User | None] = relationship(lazy="joined", foreign_keys=[assigned_to_id])


class VeterinaryInspection(Base):
    __tablename__ = "veterinary_inspections"
    id: Mapped[int] = mapped_column(primary_key=True)
    alert_id: Mapped[int | None] = mapped_column(ForeignKey("alerts.id"), index=True)
    ward_id: Mapped[int] = mapped_column(ForeignKey("geographical_locations.id"), nullable=False, index=True)
    inspector_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    inspected_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    dogs_counted: Mapped[int | None] = mapped_column(Integer)
    dogs_injured_or_sick: Mapped[int | None] = mapped_column(Integer)
    ear_notched_count: Mapped[int | None] = mapped_column(Integer)
    report_outcome: Mapped[str] = mapped_column(String(30), nullable=False)  # confirmed | partially_confirmed | not_confirmed
    behaviour_findings: Mapped[str | None] = mapped_column(Text)
    environmental_findings: Mapped[str | None] = mapped_column(Text)
    findings: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)

    inspector: Mapped[User] = relationship(lazy="joined")


class InterventionRecord(TimestampMixin, Base):
    __tablename__ = "intervention_records"
    __table_args__ = (
        CheckConstraint("status IN ('planned','in_progress','completed','cancelled')", name="ck_int_status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    alert_id: Mapped[int | None] = mapped_column(ForeignKey("alerts.id"), index=True)
    ward_id: Mapped[int] = mapped_column(ForeignKey("geographical_locations.id"), nullable=False, index=True)
    intervention_type: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="planned", nullable=False)
    performed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    started_at: Mapped[date | None] = mapped_column(Date)
    completed_at: Mapped[date | None] = mapped_column(Date)
    dogs_vaccinated: Mapped[int | None] = mapped_column(Integer)
    dogs_sterilised: Mapped[int | None] = mapped_column(Integer)
    dogs_treated: Mapped[int | None] = mapped_column(Integer)

    performed_by: Mapped[User | None] = relationship(lazy="joined")


# --------------------------------------------------------------------------------------
# Analytics, notifications, audit
# --------------------------------------------------------------------------------------
class HotspotAnalysis(Base):
    __tablename__ = "hotspot_analyses"
    id: Mapped[int] = mapped_column(primary_key=True)
    analysis_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    parameters: Mapped[dict] = mapped_column(JSONType, nullable=False)
    summary: Mapped[dict] = mapped_column(JSONType, nullable=False)
    results: Mapped[dict | list] = mapped_column(JSONType, nullable=False)
    model_version: Mapped[str | None] = mapped_column(String(40))
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False, index=True)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(300))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_entity", "entity_type", "entity_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    actor_role: Mapped[str | None] = mapped_column(String(40))
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[int | None] = mapped_column(Integer)
    changes: Mapped[dict | None] = mapped_column(JSONType)
    reason: Mapped[str | None] = mapped_column(String(500))
    ip_hash: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False, index=True)

    actor: Mapped[User | None] = relationship(lazy="joined")
