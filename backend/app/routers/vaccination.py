from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import vocab
from ..database import get_db
from ..deps import require_roles
from ..models import GeoLocation, User, VaccinationRecord
from ..schemas import VaccinationCreate
from ..services import audit
from ..services.geo import ancestors

router = APIRouter(prefix="/vaccination", tags=["vaccination"])
console = require_roles(*vocab.CONSOLE_ROLES)
recorders = require_roles("super_admin", "veterinary_officer", "municipal_officer")


def _out(v: VaccinationRecord) -> dict:
    a = ancestors(v.ward)
    return {
        "id": v.id, "ward_id": v.ward_id, "ward": v.ward.name, "district": a["district"].name if "district" in a else None, "campaign_name": v.campaign_name,
        "start_date": v.start_date, "end_date": v.end_date, "dogs_vaccinated": v.dogs_vaccinated, "estimated_dog_population": v.estimated_dog_population,
        "estimation_method": v.estimation_method, "data_source": v.data_source, "verification_status": v.verification_status, "notes": v.notes,
        "coverage": round(min(1, v.dogs_vaccinated / v.estimated_dog_population), 3) if v.estimation_method == "documented_survey" and v.estimated_dog_population else None,
        "is_synthetic": v.is_synthetic,
    }


@router.get("")
def list_records(ward_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(console)):
    q = select(VaccinationRecord).order_by(VaccinationRecord.start_date.desc())
    if ward_id:
        q = q.where(VaccinationRecord.ward_id == ward_id)
    return [_out(v) for v in db.scalars(q).unique().all()]


@router.post("", status_code=201)
def create(body: VaccinationCreate, db: Session = Depends(get_db), user: User = Depends(recorders)):
    w = db.get(GeoLocation, body.ward_id)
    if not w or w.level != "ward":
        raise HTTPException(422, "Unknown ward")
    status = body.verification_status if user.role.code in ("veterinary_officer", "super_admin") else "unverified"
    v = VaccinationRecord(**body.model_dump(exclude={"verification_status"}), verification_status=status, recorded_by_id=user.id, verified_by_id=user.id if status == "confirmed" else None)
    db.add(v)
    db.flush()
    audit.log(db, actor=user, action="create", entity_type="vaccination_record", entity_id=v.id, changes={"ward_id": v.ward_id, "dogs_vaccinated": v.dogs_vaccinated, "status": status})
    db.commit()
    return _out(v)


@router.post("/{record_id}/confirm")
def confirm(record_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("super_admin", "veterinary_officer"))):
    v = db.get(VaccinationRecord, record_id)
    if not v:
        raise HTTPException(404, "Record not found")
    v.verification_status, v.verified_by_id = "confirmed", user.id
    audit.log(db, actor=user, action="confirm", entity_type="vaccination_record", entity_id=v.id)
    db.commit()
    return _out(v)
