from datetime import date, datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from . import vocab


def _in(vocab_dict: dict, field: str):
    def check(v):
        if v is None:
            return v
        if v not in vocab_dict:
            raise ValueError(f"Invalid {field}. Allowed: {', '.join(vocab_dict)}")
        return v

    return check


# Tamil Nadu bounding box (with margin) - rejects obviously wrong coordinates
TN_LAT = (7.9, 13.8)
TN_LNG = (75.9, 80.6)


class Coordinates(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

    @model_validator(mode="after")
    def in_service_area(self):
        if not (TN_LAT[0] <= self.latitude <= TN_LAT[1] and TN_LNG[0] <= self.longitude <= TN_LNG[1]):
            raise ValueError("Location is outside the Tamil Nadu pilot service area")
        return self


# ---------------------------------------------------------------- auth
class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
    account_type: Literal["hospital_staff", "community_reporter"]
    designation: str | None = Field(default=None, max_length=120)
    hospital_id: int | None = None
    facility_code: str | None = Field(default=None, max_length=40)

    @field_validator("password")
    @classmethod
    def strong(cls, v: str) -> str:
        if not any(c.isdigit() for c in v) or not any(c.isalpha() for c in v):
            raise ValueError("Password must contain letters and numbers")
        return v

    @model_validator(mode="after")
    def hospital_fields(self):
        if self.account_type == "hospital_staff" and (not self.hospital_id or not self.facility_code):
            raise ValueError("Hospital staff registration requires a facility and its facility access code")
        return self


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    full_name: str
    designation: str | None
    role: str
    role_name: str
    hospital_id: int | None
    hospital_name: str | None
    district_id: int | None
    district_name: str | None
    is_active: bool
    last_login_at: datetime | None = None
    created_at: datetime | None = None

    @classmethod
    def from_user(cls, u) -> "UserOut":
        return cls(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            designation=u.designation,
            role=u.role.code,
            role_name=u.role.name,
            hospital_id=u.hospital_id,
            hospital_name=u.hospital.name if u.hospital else None,
            district_id=u.district_id,
            district_name=u.district.name if u.district else None,
            is_active=u.is_active,
            last_login_at=u.last_login_at,
            created_at=u.created_at,
        )


class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
    designation: str | None = None
    role: str
    hospital_id: int | None = None
    district_id: int | None = None
    _r = field_validator("role")(_in(vocab.ROLES, "role"))


class AdminUserUpdate(BaseModel):
    role: str | None = None
    is_active: bool | None = None
    district_id: int | None = None
    hospital_id: int | None = None
    _r = field_validator("role")(_in(vocab.ROLES, "role"))


# ---------------------------------------------------------------- bite incidents
class BiteIncidentBase(Coordinates):
    incident_date: date
    incident_time_approx: str | None = None
    hospital_report_date: date
    district_id: int
    municipality_id: int | None = None
    ward_id: int | None = None
    location_description: str | None = Field(default=None, max_length=300)
    location_type: str
    persons_affected: int = Field(default=1, ge=1, le=100)
    victim_age_group: str
    victim_sex: str | None = "not_collected"
    circumstances: str | None = Field(default=None, max_length=2000)
    dog_ownership: str
    provocation: str = "not_assessed"
    injury_category: str = "not_assessed"
    body_part: str | None = None
    clinical_assessment_status: str = "pending"
    wound_management_status: str = "not_started"
    pep_status: str = "not_referred"
    rig_status: str = "pending"
    follow_up_status: str = "pending"
    follow_up_due_date: date | None = None
    clinical_notes: str | None = Field(default=None, max_length=4000)

    _v1 = field_validator("incident_time_approx")(_in(vocab.TIME_APPROX, "time"))
    _v2 = field_validator("location_type")(_in(vocab.LOCATION_TYPES, "location type"))
    _v3 = field_validator("victim_age_group")(_in(vocab.AGE_GROUPS, "age group"))
    _v4 = field_validator("victim_sex")(_in(vocab.SEX, "sex"))
    _v5 = field_validator("dog_ownership")(_in(vocab.DOG_OWNERSHIP, "dog ownership"))
    _v6 = field_validator("provocation")(_in(vocab.PROVOCATION, "provocation"))
    _v7 = field_validator("injury_category")(_in(vocab.INJURY_CATEGORY, "injury category"))
    _v8 = field_validator("body_part")(_in(vocab.BODY_PART, "body part"))
    _v9 = field_validator("clinical_assessment_status")(_in(vocab.CLINICAL_ASSESSMENT, "assessment status"))
    _v10 = field_validator("wound_management_status")(_in(vocab.WOUND_MGMT, "wound management status"))
    _v11 = field_validator("pep_status")(_in(vocab.PEP_STATUS, "PEP status"))
    _v12 = field_validator("rig_status")(_in(vocab.RIG_STATUS, "immunoglobulin status"))
    _v13 = field_validator("follow_up_status")(_in(vocab.FOLLOW_UP, "follow-up status"))

    @model_validator(mode="after")
    def dates(self):
        today = datetime.now(timezone.utc).date()
        if self.incident_date > today:
            raise ValueError("Incident date cannot be in the future")
        if self.hospital_report_date < self.incident_date:
            raise ValueError("Hospital reporting date cannot be before the incident date")
        if self.hospital_report_date > today:
            raise ValueError("Hospital reporting date cannot be in the future")
        return self


class BiteIncidentCreate(BiteIncidentBase):
    hospital_id: int | None = None  # forced to the staff member's own facility


class BiteIncidentUpdate(BiteIncidentBase):
    edit_reason: str = Field(min_length=5, max_length=500)
    expected_version: int


class BiteIncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    incident_code: str
    hospital_id: int
    hospital_name: str
    reported_by_name: str | None
    incident_date: date
    incident_time_approx: str | None
    hospital_report_date: date
    district_id: int
    district_name: str
    municipality_id: int | None
    municipality_name: str | None
    ward_id: int | None
    ward_name: str | None
    ward_number: int | None
    location_description: str | None
    latitude: float
    longitude: float
    location_type: str
    persons_affected: int
    victim_age_group: str
    victim_sex: str | None
    circumstances: str | None
    dog_ownership: str
    provocation: str
    injury_category: str
    body_part: str | None
    clinical_assessment_status: str
    wound_management_status: str
    pep_status: str
    rig_status: str
    follow_up_status: str
    follow_up_due_date: date | None
    clinical_notes: str | None
    version: int
    is_synthetic: bool
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, b) -> "BiteIncidentOut":
        d = {c: getattr(b, c) for c in cls.model_fields if hasattr(b, c)}
        d.update(
            hospital_name=b.hospital.name,
            reported_by_name=b.reported_by.full_name if b.reported_by else None,
            district_name=b.district.name,
            municipality_name=b.municipality.name if b.municipality else None,
            ward_name=b.ward.name if b.ward else None,
            ward_number=b.ward.ward_number if b.ward else None,
        )
        return cls(**d)


# ---------------------------------------------------------------- community
class DogCountIn(BaseModel):
    total_dogs: int = Field(ge=0, le=500)
    estimated_locality_dogs: int | None = Field(default=None, ge=0, le=2000)
    puppies: int | None = Field(default=None, ge=0, le=500)
    adults: int | None = Field(default=None, ge=0, le=500)
    injured: int | None = Field(default=None, ge=0, le=500)
    ear_notched: int | None = Field(default=None, ge=0, le=500)
    grouping: str | None = None
    _g = field_validator("grouping")(_in(vocab.GROUPING, "grouping"))

    @model_validator(mode="after")
    def parts(self):
        if (self.puppies or 0) + (self.adults or 0) > max(self.total_dogs, self.estimated_locality_dogs or 0):
            raise ValueError("Puppies + adults cannot exceed the number of dogs reported")
        for f in ("injured", "ear_notched"):
            if (getattr(self, f) or 0) > max(self.total_dogs, self.estimated_locality_dogs or 0):
                raise ValueError(f"'{f}' cannot exceed the number of dogs reported")
        return self


class BehaviourIn(BaseModel):
    category: str
    description: str | None = Field(default=None, max_length=1000)
    _c = field_validator("category")(_in(vocab.BEHAVIOURS, "behaviour"))


class CommunityReportCreate(Coordinates):
    district_id: int
    municipality_id: int | None = None
    ward_id: int | None = None
    locality: str | None = Field(default=None, max_length=120)
    street_landmark: str | None = Field(default=None, max_length=200)
    location_method: Literal["gps", "map", "manual"]
    observed_at: datetime
    description: str | None = Field(default=None, max_length=2000)
    dogs: DogCountIn
    behaviours: list[BehaviourIn] = Field(default_factory=list, max_length=11)
    consent: bool
    contact_email: EmailStr | None = None
    website: str | None = None  # honeypot - must stay empty

    @model_validator(mode="after")
    def checks(self):
        if not self.consent:
            raise ValueError("Consent is required to submit a report")
        obs = self.observed_at if self.observed_at.tzinfo else self.observed_at.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if obs > now + timedelta(minutes=10):
            raise ValueError("Observation time cannot be in the future")
        if (now - obs).days > 30:
            raise ValueError("Observations older than 30 days cannot be submitted")
        cats = [b.category for b in self.behaviours]
        if len(cats) != len(set(cats)):
            raise ValueError("Each behaviour can be selected only once")
        return self


class VerifyIn(BaseModel):
    status: Literal["under_verification", "verified", "rejected"]
    notes: str | None = Field(default=None, max_length=1000)


# ---------------------------------------------------------------- vaccination / alerts
class VaccinationCreate(BaseModel):
    ward_id: int
    campaign_name: str = Field(min_length=3, max_length=200)
    start_date: date
    end_date: date | None = None
    dogs_vaccinated: int = Field(ge=0, le=100000)
    estimated_dog_population: int | None = Field(default=None, ge=1, le=200000)
    estimation_method: str
    data_source: str | None = Field(default=None, max_length=200)
    verification_status: Literal["confirmed", "unverified"] = "unverified"
    notes: str | None = Field(default=None, max_length=2000)
    _m = field_validator("estimation_method")(_in(vocab.VAX_METHOD, "estimation method"))

    @model_validator(mode="after")
    def check(self):
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("End date cannot be before start date")
        if self.estimation_method == "documented_survey" and not self.estimated_dog_population:
            raise ValueError("A documented survey estimate requires the surveyed dog population")
        return self


class AlertCreate(BaseModel):
    ward_id: int
    alert_type: str
    severity: Literal["low", "medium", "high"] = "medium"
    title: str = Field(min_length=5, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)
    _t = field_validator("alert_type")(_in(vocab.ALERT_TYPES, "alert type"))


class AlertAssign(BaseModel):
    assigned_to_id: int
    due_date: date | None = None
    note: str | None = Field(default=None, max_length=1000)


class AlertStatusIn(BaseModel):
    status: str
    note: str | None = Field(default=None, max_length=2000)
    _s = field_validator("status")(_in(vocab.ALERT_STATUS, "status"))


class InspectionCreate(BaseModel):
    inspected_at: datetime
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    dogs_counted: int | None = Field(default=None, ge=0, le=1000)
    dogs_injured_or_sick: int | None = Field(default=None, ge=0, le=1000)
    ear_notched_count: int | None = Field(default=None, ge=0, le=1000)
    report_outcome: str
    behaviour_findings: str | None = Field(default=None, max_length=2000)
    environmental_findings: str | None = Field(default=None, max_length=2000)
    findings: str = Field(min_length=5, max_length=4000)
    _o = field_validator("report_outcome")(_in(vocab.INSPECTION_OUTCOMES, "outcome"))


class InterventionCreate(BaseModel):
    intervention_type: str
    description: str | None = Field(default=None, max_length=2000)
    status: Literal["planned", "in_progress", "completed", "cancelled"] = "planned"
    started_at: date | None = None
    completed_at: date | None = None
    dogs_vaccinated: int | None = Field(default=None, ge=0, le=100000)
    dogs_sterilised: int | None = Field(default=None, ge=0, le=100000)
    dogs_treated: int | None = Field(default=None, ge=0, le=100000)
    _t = field_validator("intervention_type")(_in(vocab.INTERVENTION_TYPES, "intervention type"))


class InterventionUpdate(BaseModel):
    status: Literal["planned", "in_progress", "completed", "cancelled"]
    completed_at: date | None = None
    dogs_vaccinated: int | None = Field(default=None, ge=0, le=100000)
    dogs_sterilised: int | None = Field(default=None, ge=0, le=100000)
    dogs_treated: int | None = Field(default=None, ge=0, le=100000)
    description: str | None = Field(default=None, max_length=2000)
