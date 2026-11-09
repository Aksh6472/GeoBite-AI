from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import vocab
from ..database import get_db
from ..models import GeoLocation, Hospital
from ..services.geo import ancestors, resolve_ward

router = APIRouter(tags=["reference"])


@router.get("/meta/vocab")
def vocabularies():
    o = vocab.as_options
    return {
        "location_types": o(vocab.LOCATION_TYPES), "age_groups": o(vocab.AGE_GROUPS), "sex": o(vocab.SEX),
        "dog_ownership": o(vocab.DOG_OWNERSHIP), "provocation": o(vocab.PROVOCATION), "injury_category": o(vocab.INJURY_CATEGORY),
        "body_part": o(vocab.BODY_PART), "clinical_assessment": o(vocab.CLINICAL_ASSESSMENT), "wound_management": o(vocab.WOUND_MGMT),
        "pep_status": o(vocab.PEP_STATUS), "rig_status": o(vocab.RIG_STATUS), "follow_up": o(vocab.FOLLOW_UP),
        "time_approx": o(vocab.TIME_APPROX), "behaviours": o(vocab.BEHAVIOURS), "concern_behaviours": sorted(vocab.CONCERN_BEHAVIOURS),
        "behaviour_layer_groups": vocab.BEHAVIOUR_LAYER_GROUPS, "grouping": o(vocab.GROUPING), "report_status": o(vocab.REPORT_STATUS),
        "alert_status": o(vocab.ALERT_STATUS), "alert_transitions": {k: sorted(v) for k, v in vocab.ALERT_TRANSITIONS.items()},
        "alert_types": o(vocab.ALERT_TYPES), "intervention_types": o(vocab.INTERVENTION_TYPES),
        "inspection_outcomes": o(vocab.INSPECTION_OUTCOMES), "vax_methods": o(vocab.VAX_METHOD),
        "roles": [{"value": k, "label": v[0], "description": v[1]} for k, v in vocab.ROLES.items()],
    }


def _node(g: GeoLocation) -> dict:
    return {"id": g.id, "name": g.name, "code": g.code, "level": g.level, "ward_number": g.ward_number, "lat": g.centroid_lat, "lng": g.centroid_lng}


@router.get("/geo/tree")
def geo_tree(db: Session = Depends(get_db)):
    nodes = db.scalars(select(GeoLocation).order_by(GeoLocation.level, GeoLocation.ward_number, GeoLocation.name)).all()
    by_parent: dict[int | None, list[GeoLocation]] = {}
    for n in nodes:
        by_parent.setdefault(n.parent_id, []).append(n)

    def build(n: GeoLocation) -> dict:
        d = _node(n)
        kids = by_parent.get(n.id, [])
        if kids:
            d["children"] = [build(k) for k in sorted(kids, key=lambda k: (k.ward_number or 0, k.name))]
        return d

    return [build(n) for n in by_parent.get(None, [])]


@router.get("/geo/locate")
def locate(lat: float = Query(ge=-90, le=90), lng: float = Query(ge=-180, le=180), db: Session = Depends(get_db)):
    ward = resolve_ward(db, lat, lng)
    if not ward:
        raise HTTPException(404, "No configured ward near this location. Please choose the district and ward manually.")
    a = ancestors(ward)
    return {k: _node(v) for k, v in a.items()}


@router.get("/geo/wards")
def ward_boundaries(district_id: int | None = None, db: Session = Depends(get_db)):
    ws = db.scalars(select(GeoLocation).where(GeoLocation.level == "ward")).all()
    feats = []
    for w in ws:
        a = ancestors(w)
        if district_id and a.get("district") and a["district"].id != district_id:
            continue
        feats.append({
            "type": "Feature", "geometry": w.boundary_geojson,
            "properties": {**_node(w), "municipality": a["municipality"].name if "municipality" in a else None, "district": a["district"].name if "district" in a else None, "population": w.population, "is_synthetic": w.is_synthetic},
        })
    return {"type": "FeatureCollection", "features": feats}


@router.get("/meta/hospitals")
def hospitals(db: Session = Depends(get_db)):
    hs = db.scalars(select(Hospital).where(Hospital.is_active.is_(True)).order_by(Hospital.name)).all()
    return [{"id": h.id, "name": h.name, "facility_type": h.facility_type, "district": h.district.name, "district_id": h.district_id, "lat": h.latitude, "lng": h.longitude} for h in hs]
