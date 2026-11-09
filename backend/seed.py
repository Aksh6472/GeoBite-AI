"""Seed GeoBite-AI with SYNTHETIC demonstration data for Tamil Nadu.

    python seed.py            # seed an empty database (after `alembic upgrade head`)
    python seed.py --reset    # wipe all data and re-seed

Every generated record is flagged is_synthetic=True. Ward boundaries are simplified synthetic
hexagons around approximate locality centroids - they are NOT official ward boundaries.
Hospital names are generic demo facilities, not real institutions' data.
"""
from __future__ import annotations

import argparse
import math
import random
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import delete, select

from app import vocab
from app.database import SessionLocal
from app.models import (
    Alert, AuditLog, BehaviourObservation, BiteIncident, CommunityReport, DogObservation, GeoLocation, HotspotAnalysis,
    Hospital, InterventionRecord, Notification, Role, User, VaccinationRecord, VeterinaryInspection,
)
from app.security import hash_password
from app.services.alerts_engine import evaluate_all
from app.services.community import assign_cluster, score_report
from app.services.geo import haversine_m, hexagon, new_code
from app.services.risk_model import train_and_predict

RNG = random.Random(2026)
IST = timezone(timedelta(hours=5, minutes=30))
TODAY = datetime.now(timezone.utc).date()
DEMO_PASSWORD = "GeoBite#2026"

# (district, code, municipality, [(ward, lat, lng)])
GEOGRAPHY = [
    ("Chennai", "CHN", "Greater Chennai Corporation", [
        ("T. Nagar", 13.0418, 80.2341), ("Adyar", 13.0012, 80.2565), ("Mylapore", 13.0339, 80.2619), ("Anna Nagar", 13.0850, 80.2101),
        ("Velachery", 12.9815, 80.2180), ("Tondiarpet", 13.1260, 80.2880), ("Royapuram", 13.1137, 80.2954), ("Perambur", 13.1210, 80.2330),
    ]),
    ("Salem", "SLM", "Salem City Municipal Corporation", [
        ("Fairlands", 11.6780, 78.1360), ("Hasthampatti", 11.6720, 78.1550), ("Suramangalam", 11.6740, 78.1100),
        ("Ammapet", 11.6520, 78.1720), ("Shevapet", 11.6550, 78.1550), ("Kondalampatti", 11.6250, 78.1300),
    ]),
    ("Vellore", "VLR", "Vellore City Municipal Corporation", [
        ("Katpadi", 12.9690, 79.1450), ("Sathuvachari", 12.9370, 79.1590), ("Gandhi Nagar", 12.9550, 79.1330),
        ("Bagayam", 12.8890, 79.1360), ("Fort Area", 12.9200, 79.1300), ("Thorapadi", 12.9000, 79.1500),
    ]),
    ("Madurai", "MDU", "Madurai City Municipal Corporation", [
        ("Tallakulam", 9.9400, 78.1330), ("Simmakkal", 9.9230, 78.1220), ("Mattuthavani", 9.9450, 78.1570), ("Thiruparankundram", 9.8800, 78.0700),
        ("Villapuram", 9.8990, 78.1170), ("Anaiyur", 9.9620, 78.1110), ("Avaniyapuram", 9.8800, 78.1150),
    ]),
    ("Tiruchirappalli", "TRY", "Tiruchirappalli City Municipal Corporation", [
        ("Srirangam", 10.8620, 78.6930), ("Thillai Nagar", 10.8250, 78.6830), ("Cantonment", 10.7960, 78.6880), ("Ponmalai", 10.7920, 78.7280),
        ("K.K. Nagar", 10.7680, 78.7100), ("Thiruverumbur", 10.7740, 78.7790), ("Woraiyur", 10.8300, 78.6600),
    ]),
]
DISTRICT_CENTRES = {"CHN": (13.0827, 80.2707), "SLM": (11.6643, 78.1460), "VLR": (12.9165, 79.1325), "MDU": (9.9252, 78.1198), "TRY": (10.7905, 78.7047)}

HOSPITALS = [
    ("CHN", "Government Medical College Hospital, Chennai (Demo)", "Medical College Hospital", 13.0810, 80.2770, "DEMO-CHN-01"),
    ("CHN", "Urban Primary Health Centre - Royapuram (Demo)", "Urban PHC", 13.1120, 80.2930, "DEMO-CHN-02"),
    ("CHN", "Urban Primary Health Centre - Velachery (Demo)", "Urban PHC", 12.9800, 80.2200, "DEMO-CHN-03"),
    ("SLM", "District Headquarters Hospital, Salem (Demo)", "District HQ Hospital", 11.6650, 78.1450, "DEMO-SLM-01"),
    ("SLM", "Urban Primary Health Centre - Ammapet (Demo)", "Urban PHC", 11.6510, 78.1700, "DEMO-SLM-02"),
    ("VLR", "Government Medical College Hospital, Vellore (Demo)", "Medical College Hospital", 12.9300, 79.1350, "DEMO-VLR-01"),
    ("VLR", "Primary Health Centre - Katpadi (Demo)", "PHC", 12.9700, 79.1440, "DEMO-VLR-02"),
    ("MDU", "Government Medical College Hospital, Madurai (Demo)", "Medical College Hospital", 9.9290, 78.1350, "DEMO-MDU-01"),
    ("MDU", "Urban Primary Health Centre - Anaiyur (Demo)", "Urban PHC", 9.9610, 78.1120, "DEMO-MDU-02"),
    ("TRY", "Government Medical College Hospital, Tiruchirappalli (Demo)", "Medical College Hospital", 10.8050, 78.6900, "DEMO-TRY-01"),
    ("TRY", "Urban Primary Health Centre - Srirangam (Demo)", "Urban PHC", 10.8610, 78.6920, "DEMO-TRY-02"),
]

SURGE_WARDS = {"Tondiarpet", "Ammapet", "Simmakkal", "Ponmalai"}  # recent rise -> rule-based alerts
WELFARE_WARDS = {"Fort Area", "Villapuram"}
BEHAVIOUR_PROFILES = {
    "calm": (["peaceful_roaming", "resting"], 0.45),
    "waste": (["waste_gathering", "frequent_barking", "peaceful_roaming"], 0.2),
    "vehicles": (["chasing_vehicles", "frequent_barking"], 0.15),
    "pedestrians": (["chasing_pedestrians", "threatening", "frequent_barking"], 0.1),
    "welfare": (["injured_sick", "needs_vet", "resting"], 0.1),
}
CIRCUMSTANCES = [
    "Walking on the street when the dog approached from behind.", "Bitten while riding a two-wheeler.", "Child playing near home.",
    "Near the market while purchasing vegetables.", "Early morning walk in the park.", "Returning from school.",
    "Attempted to separate dogs that were fighting.", "Near garbage collection point.", "While feeding the dog.",
]


def jitter(lat, lng, sd_m):
    return lat + RNG.gauss(0, sd_m) / 111_320, lng + RNG.gauss(0, sd_m) / (111_320 * math.cos(math.radians(lat)))


def in_disc(lat, lng, r_m):
    a, d = RNG.uniform(0, 2 * math.pi), r_m * math.sqrt(RNG.random())
    return lat + d * math.sin(a) / 111_320, lng + d * math.cos(a) / (111_320 * math.cos(math.radians(lat)))


def weighted(d: dict):
    keys, w = zip(*d.items())
    return RNG.choices(keys, weights=w)[0]


def reset(db):
    for m in (Notification, AuditLog, InterventionRecord, VeterinaryInspection, Alert, HotspotAnalysis, VaccinationRecord, BehaviourObservation, DogObservation, CommunityReport, BiteIncident):
        db.execute(delete(m))
    db.execute(delete(User))
    db.execute(delete(Hospital))
    for lvl in ("ward", "municipality", "district", "state"):
        db.execute(delete(GeoLocation).where(GeoLocation.level == lvl))
    db.execute(delete(Role))
    db.commit()


def seed_geography(db):
    state = GeoLocation(level="state", name="Tamil Nadu", code="TN", centroid_lat=11.1271, centroid_lng=78.6569)
    db.add(state)
    db.flush()
    districts, wards = {}, []
    for dname, code, mname, ward_list in GEOGRAPHY:
        c = DISTRICT_CENTRES[code]
        d = GeoLocation(level="district", name=dname, code=f"TN-{code}", parent_id=state.id, centroid_lat=c[0], centroid_lng=c[1])
        db.add(d)
        db.flush()
        m = GeoLocation(level="municipality", name=mname, code=f"TN-{code}-MC", parent_id=d.id, centroid_lat=c[0], centroid_lng=c[1])
        db.add(m)
        db.flush()
        districts[code] = (d, m)
        for i, (wname, lat, lng) in enumerate(ward_list):
            nearest = min(haversine_m(lat, lng, la, ln) for (n2, la, ln) in ward_list if n2 != wname)
            r = min(1500.0, nearest * 0.5)
            area = 2.598 * (r / 1000) ** 2
            w = GeoLocation(
                level="ward", name=wname, code=f"TN-{code}-W{i + 1:02d}", parent_id=m.id, ward_number=RNG.randint(1, 20) + i * 20,
                centroid_lat=lat, centroid_lng=lng, boundary_geojson=hexagon(lat, lng, r), area_km2=round(area, 2),
                population=int(area * RNG.uniform(14000, 26000)), waste_sites=RNG.randint(1, 9), schools=RNG.randint(3, 15), markets=RNG.randint(1, 6),
            )
            db.add(w)
            wards.append((w, code, r))
    db.flush()
    return districts, wards


def seed_people(db, districts):
    roles = {}
    for code, (name, desc) in vocab.ROLES.items():
        roles[code] = Role(code=code, name=name, description=desc)
        db.add(roles[code])
    hospitals = []
    for dcode, name, ftype, lat, lng, fcode in HOSPITALS:
        d, m = districts[dcode]
        h = Hospital(name=name, facility_type=ftype, district_id=d.id, municipality_id=m.id, latitude=lat, longitude=lng, registration_code_hash=hash_password(fcode))
        db.add(h)
        hospitals.append((h, dcode, fcode))
    db.flush()
    pw = hash_password(DEMO_PASSWORD)
    H = {f[2]: f[0] for f in hospitals}
    users = [
        ("admin@geobite.demo", "Dr. Kavitha Raman", "State Programme Director", "super_admin", None, None),
        ("medical.admin@geobite.demo", "Dr. Senthil Kumar", "Deputy Director of Health Services", "medical_admin", None, None),
        ("hospital.chennai@geobite.demo", "Ms. Priya Lakshmi", "Staff Nurse, ARV Clinic", "hospital_staff", H["DEMO-CHN-01"], districts["CHN"][0]),
        ("hospital.salem@geobite.demo", "Mr. Arun Prakash", "Medical Records Officer", "hospital_staff", H["DEMO-SLM-01"], districts["SLM"][0]),
        ("hospital.madurai@geobite.demo", "Dr. Meena Sundaram", "Medical Officer", "hospital_staff", H["DEMO-MDU-01"], districts["MDU"][0]),
        ("vet.chennai@geobite.demo", "Dr. Rajesh Babu", "Veterinary Assistant Surgeon", "veterinary_officer", None, districts["CHN"][0]),
        ("vet.madurai@geobite.demo", "Dr. Anitha Selvam", "Veterinary Officer", "veterinary_officer", None, districts["MDU"][0]),
        ("vet.state@geobite.demo", "Dr. Ganesh Murugan", "Joint Director (Animal Husbandry)", "veterinary_officer", None, None),
        ("municipal.chennai@geobite.demo", "Mr. Vignesh Kannan", "Sanitary Inspector", "municipal_officer", None, districts["CHN"][0]),
        ("municipal.trichy@geobite.demo", "Ms. Deepa Natarajan", "Assistant Health Officer", "municipal_officer", None, districts["TRY"][0]),
        ("citizen@geobite.demo", "Demo Community Reporter", None, "community_reporter", None, None),
    ]
    out = {}
    for email, name, desig, role, hosp, dist in users:
        u = User(email=email, password_hash=pw, full_name=name, designation=desig, role_id=roles[role].id, hospital_id=hosp.id if hosp else None, district_id=dist.id if dist else None)
        db.add(u)
        out[email] = u
    db.flush()
    return hospitals, out


def ward_profile(w: GeoLocation, r_m: float):
    dog_factor = RNG.uniform(0.6, 1.8)
    vax_cov = RNG.choice([None, None, RNG.uniform(0.25, 0.8), RNG.uniform(0.25, 0.8), RNG.uniform(0.4, 0.75)])
    base = 0.8 + 1.3 * dog_factor + 0.18 * (w.waste_sites or 0) + (1.2 if vax_cov is None else 2.0 * (1 - vax_cov))
    hotspots = [(*in_disc(w.centroid_lat, w.centroid_lng, r_m * 0.55), RNG.choice(["market", "residential", "school_college", "public_road", "park"])) for _ in range(RNG.randint(1, 3))]
    return {"dog_factor": dog_factor, "vax_cov": vax_cov, "base": base, "hotspots": hotspots}


SEASON = {1: 0.9, 2: 0.95, 3: 1.15, 4: 1.3, 5: 1.35, 6: 1.2, 7: 1.0, 8: 0.95, 9: 0.95, 10: 0.9, 11: 0.85, 12: 0.9}


def poisson(lam):
    L, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= RNG.random()
        if p <= L:
            return k
        k += 1


def seed_bites(db, wards, profiles, hospitals, staff_by_hosp):
    start = (TODAY.replace(day=1) - timedelta(days=540)).replace(day=1)
    n = 0
    for w, dcode, r_m in wards:
        prof = profiles[w.id]
        d, m = w.parent.parent, w.parent
        hosp_options = [h for h, hc, _ in hospitals if hc == dcode]
        cursor = start
        while cursor <= TODAY:
            nxt = (cursor + timedelta(days=32)).replace(day=1)
            last_day = min(nxt - timedelta(days=1), TODAY)
            span = (last_day - cursor).days + 1
            lam = prof["base"] * SEASON[cursor.month] * span / 30.0
            for _ in range(poisson(lam)):
                n += _bite(db, w, d, m, prof, hosp_options, staff_by_hosp, cursor + timedelta(days=RNG.randrange(span)), r_m)
            cursor = nxt
        if w.name in SURGE_WARDS:  # recent rise over the last 30 days
            for _ in range(int(prof["base"] * 2.2) + 5):
                n += _bite(db, w, d, m, prof, hosp_options, staff_by_hosp, TODAY - timedelta(days=RNG.randrange(28)), r_m, surge=True)
    return n


def _bite(db, w, d, m, prof, hosp_options, staff_by_hosp, inc_date, r_m, surge=False):
    if surge or RNG.random() < 0.7:
        hlat, hlng, ltype = RNG.choice(prof["hotspots"])
        lat, lng = jitter(hlat, hlng, 170)
        if RNG.random() < 0.3:
            ltype = RNG.choice(["public_road", "residential"])
    else:
        lat, lng = in_disc(w.centroid_lat, w.centroid_lng, r_m * 0.85)
        ltype = weighted({"residential": 4, "public_road": 4, "market": 1, "school_college": 1, "park": 1, "other": 1})
    hosp = min(hosp_options, key=lambda h: haversine_m(lat, lng, h.latitude, h.longitude) * (0.6 if "Medical College" in h.facility_type else 1))
    report_date = min(inc_date + timedelta(days=weighted({0: 6, 1: 3, 2: 1})), TODAY)
    age_days = (TODAY - inc_date).days
    cat = weighted({"cat_i": 1, "cat_ii": 4.5, "cat_iii": 4, "not_assessed": 0.5 if age_days > 7 else 1.5})
    if age_days > 35:
        fu = weighted({"completed": 8, "lost": 1, "not_required": 1})
        pep = "completed" if fu == "completed" and cat != "cat_i" else ("not_indicated" if cat == "cat_i" else "initiated")
    else:
        fu = weighted({"pending": 5, "in_progress": 4, "completed": 1})
        pep = "not_indicated" if cat == "cat_i" else weighted({"initiated": 6, "referred": 3, "not_referred": 1})
    rig = "not_applicable" if cat != "cat_iii" else weighted({"administered": 6, "referred": 2, "unavailable": 1, "pending": 1})
    b = BiteIncident(
        incident_code=new_code("GB-BI"), hospital_id=hosp.id, reported_by_id=staff_by_hosp.get(hosp.id),
        incident_date=inc_date, incident_time_approx=weighted({"early_morning": 2, "morning": 3, "afternoon": 2, "evening": 3, "night": 1}),
        hospital_report_date=report_date, district_id=d.id, municipality_id=m.id, ward_id=w.id,
        location_description=f"Near {ltype.replace('_', ' ')} - {w.name} (synthetic)", latitude=round(lat, 6), longitude=round(lng, 6), location_type=ltype,
        persons_affected=weighted({1: 93, 2: 5, 3: 2}), victim_age_group=weighted({"0-4": 6, "5-14": 26, "15-29": 24, "30-59": 32, "60+": 10, "unknown": 2}),
        victim_sex=weighted({"male": 55, "female": 42, "not_collected": 3}), circumstances=RNG.choice(CIRCUMSTANCES),
        dog_ownership=weighted({"stray": 78, "owned": 15, "unknown": 7}), provocation=weighted({"unprovoked": 55, "provoked": 20, "not_assessed": 25}),
        injury_category=cat, body_part=weighted({"lower_limb": 55, "upper_limb": 15, "hand": 14, "trunk": 5, "head_neck": 4, "multiple": 4, "not_recorded": 3}),
        clinical_assessment_status="assessed" if cat != "not_assessed" else "pending", wound_management_status="done" if cat != "not_assessed" else "not_started",
        pep_status=pep, rig_status=rig, follow_up_status=fu, follow_up_due_date=inc_date + timedelta(days=28) if fu in ("pending", "in_progress") else None,
        is_synthetic=True,
    )
    b.created_at = datetime.combine(report_date, time(RNG.randint(8, 18), RNG.randint(0, 59)), tzinfo=IST)
    b.updated_at = b.created_at
    db.add(b)
    return 1


def seed_community(db, wards, profiles, citizen):
    reporters = [f"{RNG.getrandbits(128):032x}" for _ in range(320)]
    pending = []
    for w, dcode, r_m in wards:
        prof = profiles[w.id]
        n_groups = RNG.randint(3, 6)
        for _ in range(n_groups):
            glat, glng = in_disc(w.centroid_lat, w.centroid_lng, r_m * 0.8)
            size = max(2, int(RNG.gauss(5 * prof["dog_factor"], 2)))
            pname = weighted({k: v[1] for k, v in BEHAVIOUR_PROFILES.items()})
            if w.name in SURGE_WARDS and RNG.random() < 0.6:
                pname = RNG.choice(["vehicles", "pedestrians"])
            if w.name in WELFARE_WARDS and RNG.random() < 0.5:
                pname = "welfare"
            behaviours = BEHAVIOUR_PROFILES[pname][0]
            local_reporters = RNG.sample(reporters, 12)
            # platform adoption ramps up: few reports early, more recently
            n_reports = RNG.randint(2, 6) + (RNG.randint(3, 6) if w.name in SURGE_WARDS | WELFARE_WARDS else 0)
            for _ in range(n_reports):
                days_ago = int(abs(RNG.gauss(0, 75))) % 260
                if (w.name in SURGE_WARDS and pname in ("vehicles", "pedestrians")) or (w.name in WELFARE_WARDS and pname == "welfare"):
                    days_ago = RNG.randrange(0, 6 if pname == "welfare" else 12)
                pending.append((w, prof, glat, glng, size, behaviours, pname, RNG.choice(local_reporters), days_ago))
    pending.sort(key=lambda p: -p[-1])
    now = datetime.now(timezone.utc)
    count = 0
    for w, prof, glat, glng, size, behaviours, pname, rep, days_ago in pending:
        obs = now - timedelta(days=days_ago, hours=RNG.randint(1, 14), minutes=RNG.randint(0, 59))
        lat, lng = jitter(glat, glng, 45)
        total = max(1, size + RNG.randint(-2, 2))
        cats = RNG.sample(behaviours, RNG.randint(1, min(2, len(behaviours))))
        if pname == "pedestrians" and RNG.random() < 0.2:
            cats.append("bite_reported")
        if days_ago > 21:
            status = weighted({"verified": 45, "rejected": 7, "under_verification": 8, "received": 40})
        else:
            status = weighted({"received": 70, "under_verification": 20, "verified": 10})
        r = CommunityReport(
            report_code=new_code("GB-CR", 8, with_year=False), reporter_user_id=citizen.id if RNG.random() < 0.05 else None,
            district_id=w.parent.parent_id, municipality_id=w.parent_id, ward_id=w.id, locality=w.name,
            street_landmark=RNG.choice(["Near bus stop", "Opposite temple", "Behind market", "Main road junction", "Near school gate", "Garbage collection point", "Park entrance"]),
            latitude=round(lat, 6), longitude=round(lng, 6), location_method=weighted({"gps": 6, "map": 3, "manual": 1}), observed_at=obs,
            description="Synthetic demonstration observation.", verification_status=status, consent_given=True, ip_hash=rep, is_synthetic=True,
            verified_at=obs + timedelta(days=3) if status in ("verified", "rejected") else None,
        )
        r.created_at = r.updated_at = obs + timedelta(minutes=RNG.randint(5, 240))
        puppies = RNG.randint(0, max(0, total // 3)) if RNG.random() < 0.35 else None
        r.dog_observation = DogObservation(
            total_dogs=total, estimated_locality_dogs=total + RNG.randint(0, 6) if RNG.random() < 0.4 else None, puppies=puppies,
            adults=(total - puppies) if puppies is not None else None, injured=RNG.randint(1, 2) if pname == "welfare" else (0 if RNG.random() < 0.3 else None),
            ear_notched=RNG.randint(0, total // 2) if RNG.random() < 0.3 else None, grouping=weighted({"together": 5, "separately": 2, "both": 1, "unknown": 1}),
        )
        r.behaviours = [BehaviourObservation(category=c) for c in dict.fromkeys(cats)]
        db.add(r)
        db.flush()
        assign_cluster(db, r)
        score_report(db, r)
        count += 1
    return count


def seed_vaccination(db, wards, profiles, vet):
    n = 0
    for w, dcode, r_m in wards:
        cov = profiles[w.id]["vax_cov"]
        if cov is None:
            if RNG.random() < 0.25:  # some wards have a drive record without a population survey
                db.add(VaccinationRecord(ward_id=w.id, campaign_name=f"Anti-rabies vaccination camp - {w.name}", start_date=TODAY - timedelta(days=RNG.randint(60, 300)), dogs_vaccinated=RNG.randint(40, 160), estimation_method="drive_record_only", data_source="Municipal veterinary camp register (synthetic)", verification_status=weighted({"confirmed": 1, "unverified": 1}), verified_by_id=vet.id, recorded_by_id=vet.id, is_synthetic=True))
                n += 1
            continue
        pop = int(w.area_km2 * RNG.uniform(90, 220))
        s = TODAY - timedelta(days=RNG.randint(120, 400))
        db.add(VaccinationRecord(ward_id=w.id, campaign_name=f"Mass dog anti-rabies vaccination - {w.name}", start_date=s, end_date=s + timedelta(days=RNG.randint(3, 14)), dogs_vaccinated=int(pop * cov), estimated_dog_population=pop, estimation_method="documented_survey", data_source="Post-campaign mark-resight survey (synthetic)", verification_status="confirmed", verified_by_id=vet.id, recorded_by_id=vet.id, is_synthetic=True))
        n += 1
    return n


def progress_alerts(db, users):
    """Move a few generated alerts through the workflow so the demo shows a full lifecycle."""
    alerts = db.scalars(select(Alert).order_by(Alert.id)).unique().all()
    for a in alerts:
        a.is_synthetic = True
    vet_c, mun_t, admin = users["vet.chennai@geobite.demo"], users["municipal.trichy@geobite.demo"], users["medical.admin@geobite.demo"]
    by_district = {}
    for a in alerts:
        by_district.setdefault(a.ward.parent.parent.name, []).append(a)
    from app.services import audit

    chn = [a for a in by_district.get("Chennai", []) if a.alert_type == "bite_cluster"]
    if chn:
        a = chn[0]
        a.assigned_to_id, a.status = vet_c.id, "intervention_assigned"
        db.add(VeterinaryInspection(alert_id=a.id, ward_id=a.ward_id, inspector_id=vet_c.id, inspected_at=datetime.now(timezone.utc) - timedelta(days=3), dogs_counted=23, dogs_injured_or_sick=2, ear_notched_count=4, report_outcome="confirmed", behaviour_findings="Two groups near the fish market; vehicle chasing observed at the junction.", environmental_findings="Overflowing waste bins near market; open meat-waste disposal.", findings="Reports consistent with field observation. Low ear-notch prevalence suggests limited ABC coverage."))
        db.add(InterventionRecord(alert_id=a.id, ward_id=a.ward_id, intervention_type="anti_rabies_vaccination", description="Ward-level anti-rabies vaccination drive", status="in_progress", performed_by_id=vet_c.id, started_at=TODAY - timedelta(days=1), dogs_vaccinated=48))
        db.add(InterventionRecord(alert_id=a.id, ward_id=a.ward_id, intervention_type="waste_management", description="Daily clearance of market waste; covered bins", status="planned", performed_by_id=users["municipal.chennai@geobite.demo"].id))
        for act, ch in (("assign", {"assigned_to": {"to": vet_c.full_name}}), ("status_change", {"status": {"from": "new", "to": "under_review"}}), ("inspection", {"outcome": "confirmed"}), ("status_change", {"status": {"from": "under_review", "to": "verified"}}), ("intervention", {"intervention_type": "anti_rabies_vaccination"}), ("status_change", {"status": {"from": "verified", "to": "intervention_assigned"}})):
            audit.log(db, actor=admin if act == "assign" else vet_c, action=act, entity_type="alert", entity_id=a.id, changes=ch)
    try_ = [a for a in by_district.get("Tiruchirappalli", [])]
    if try_:
        a = try_[0]
        a.assigned_to_id, a.status = mun_t.id, "under_review"
        audit.log(db, actor=admin, action="assign", entity_type="alert", entity_id=a.id, changes={"assigned_to": {"to": mun_t.full_name}})
    # a historical, closed alert
    w = db.scalar(select(GeoLocation).where(GeoLocation.name == "Srirangam"))
    closed = Alert(alert_code=new_code("GB-AL"), ward_id=w.id, alert_type="animal_welfare", severity="low", title=f"Dogs needing veterinary assistance - {w.name}", evidence={"rule": ">= 2 welfare reports in 7 days", "reports": 3}, status="closed", assigned_to_id=mun_t.id, closed_at=datetime.now(timezone.utc) - timedelta(days=40), closure_notes="Two injured dogs treated by veterinary team and released; follow-up visit found no further cases.", is_synthetic=True)
    closed.created_at = datetime.now(timezone.utc) - timedelta(days=55)
    db.add(closed)
    db.flush()
    db.add(InterventionRecord(alert_id=closed.id, ward_id=w.id, intervention_type="veterinary_treatment", status="completed", performed_by_id=mun_t.id, started_at=TODAY - timedelta(days=50), completed_at=TODAY - timedelta(days=45), dogs_treated=2))
    audit.log(db, actor=admin, action="status_change", entity_type="alert", entity_id=closed.id, changes={"status": {"from": "action_completed", "to": "closed"}}, reason=closed.closure_notes)


def seed(wipe: bool = False) -> bool:
    """Load the synthetic demo data. Returns False (and changes nothing) when data already exists."""
    with SessionLocal() as db:
        if db.scalar(select(Role.id).limit(1)):
            if not wipe:
                print("Database already seeded. Use --reset to wipe and re-seed.")
                return False
            reset(db)
        districts, wards = seed_geography(db)
        hospitals, users = seed_people(db, districts)
        staff = {u.hospital_id: u.id for u in users.values() if u.hospital_id}
        profiles = {w.id: ward_profile(w, r) for w, _, r in wards}
        db.flush()
        nb = seed_bites(db, wards, profiles, hospitals, staff)
        db.flush()
        nc = seed_community(db, wards, profiles, users["citizen@geobite.demo"])
        nv = seed_vaccination(db, wards, profiles, users["vet.state@geobite.demo"])
        db.flush()
        alerts = evaluate_all(db, synthetic=True)
        progress_alerts(db, users)
        db.flush()
        try:
            train_and_predict(db, users["admin@geobite.demo"].id)
        except ValueError as e:
            print("risk model skipped:", e)
        db.commit()
        from app.routers.analytics import run_hotspots
        from app.services.aggregates import Filters

        run_hotspots(f=Filters(), days=90, eps_m=450, min_samples=4, band_m=3500, db=db, user=users["admin@geobite.demo"])
        print(f"Seeded SYNTHETIC data: {len(wards)} wards, {len(hospitals)} facilities, {len(users)} users, {nb} bite incidents, {nc} community reports, {nv} vaccination records, {len(alerts)} rule-generated alerts.")
        print(f"\nDemo password for all accounts: {DEMO_PASSWORD}")
        for email, u in users.items():
            print(f"  {u.role.code if u.role else '':<20} {email}")
        print("\nFacility access codes (for hospital staff self-registration):")
        for h, _, code in hospitals:
            print(f"  {code}  {h.name}")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true")
    seed(wipe=ap.parse_args().reset)


if __name__ == "__main__":
    main()
