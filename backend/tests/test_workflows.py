"""End-to-end API tests for the three demo workflows plus access control and privacy."""
import io
import json
from datetime import date, datetime, timedelta, timezone

from PIL import Image

from conftest import PASSWORD, make_client


def _ward(client, district="Chennai", ward="Mylapore"):
    tree = client.get("/api/geo/tree").json()
    d = next(x for x in tree[0]["children"] if x["name"] == district)
    m = d["children"][0]
    w = next(x for x in m["children"] if x["name"] == ward)
    return d, m, w


def _bite_payload(client, **over):
    d, m, w = _ward(client)
    p = {
        "incident_date": (date.today() - timedelta(days=1)).isoformat(), "incident_time_approx": "evening",
        "hospital_report_date": date.today().isoformat(), "district_id": d["id"], "municipality_id": m["id"], "ward_id": w["id"],
        "location_description": "Near temple tank", "latitude": w["lat"] + 0.001, "longitude": w["lng"] + 0.001, "location_type": "public_road",
        "persons_affected": 1, "victim_age_group": "5-14", "victim_sex": "not_collected", "dog_ownership": "stray", "provocation": "unprovoked",
        "injury_category": "cat_iii", "body_part": "lower_limb", "clinical_assessment_status": "assessed", "wound_management_status": "done",
        "pep_status": "initiated", "rig_status": "administered", "follow_up_status": "pending",
    }
    p.update(over)
    return p


def _community_payload(client, lat_off=0.0, **over):
    d, m, w = _ward(client, "Salem", "Fairlands")
    p = {
        "district_id": d["id"], "municipality_id": m["id"], "ward_id": w["id"], "locality": "Fairlands", "street_landmark": "Near bus stop",
        "latitude": w["lat"] + lat_off, "longitude": w["lng"], "location_method": "gps",
        "observed_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(),
        "dogs": {"total_dogs": 6, "puppies": 2, "adults": 4, "grouping": "together"},
        "behaviours": [{"category": "chasing_pedestrians", "description": "Chased two students"}, {"category": "frequent_barking"}],
        "consent": True,
    }
    p.update(over)
    return p


# ------------------------------------------------------------------ DEMO 1: hospital
def test_hospital_register_login_submit_and_map(client):
    hospitals = client.get("/api/meta/hospitals").json()
    h = next(x for x in hospitals if "Chennai" in x["name"] and "Medical College" in x["name"])
    bad = client.post("/api/auth/register", json={"email": "n1@demo.in", "password": "Secure12345", "full_name": "Nurse One", "account_type": "hospital_staff", "hospital_id": h["id"], "facility_code": "WRONG"})
    assert bad.status_code == 403
    r = client.post("/api/auth/register", json={"email": "n1@demo.in", "password": "Secure12345", "full_name": "Nurse One", "account_type": "hospital_staff", "hospital_id": h["id"], "facility_code": "DEMO-CHN-01"})
    assert r.status_code == 201, r.text
    c = make_client()
    assert c.post("/api/auth/login", json={"email": "n1@demo.in", "password": "Secure12345"}).status_code == 200

    before = c.get("/api/bite-incidents/dashboard").json()
    res = c.post("/api/bite-incidents", json=_bite_payload(c))
    assert res.status_code == 201, res.text
    inc = res.json()
    assert inc["incident_code"].startswith("GB-BI-")
    assert inc["hospital_id"] == h["id"]
    after = c.get("/api/bite-incidents/dashboard").json()
    assert after["total"] == before["total"] + 1
    assert after["today"] == before["today"] + 1

    reg = c.get("/api/bite-incidents", params={"q": inc["incident_code"]}).json()
    assert reg["total"] == 1

    admin = make_client("admin@geobite.demo")
    layer = admin.get("/api/map/bites").json()
    assert any(p["code"] == inc["incident_code"] for p in layer["points"])
    assert layer["heat"] and layer["clusters"]


def test_bite_validation_and_audit_trail(hospital):
    future = _bite_payload(hospital, incident_date=(date.today() + timedelta(days=2)).isoformat())
    r = hospital.post("/api/bite-incidents", json=future)
    assert r.status_code == 422
    assert any("future" in e["msg"] for e in r.json()["detail"])
    assert hospital.post("/api/bite-incidents", json=_bite_payload(hospital, latitude=28.6, longitude=77.2)).status_code == 422
    assert hospital.post("/api/bite-incidents", json=_bite_payload(hospital, injury_category="cat_x")).status_code == 422

    inc = hospital.post("/api/bite-incidents", json=_bite_payload(hospital)).json()
    upd = {**_bite_payload(hospital, follow_up_status="completed"), "edit_reason": "Follow-up completed on day 28", "expected_version": 1}
    r = hospital.put(f"/api/bite-incidents/{inc['id']}", json=upd)
    assert r.status_code == 200 and r.json()["version"] == 2
    stale = hospital.put(f"/api/bite-incidents/{inc['id']}", json={**upd, "follow_up_status": "lost"})
    assert stale.status_code == 409
    hist = hospital.get(f"/api/bite-incidents/{inc['id']}/history").json()
    assert hist[0]["action"] == "update" and hist[0]["changes"]["follow_up_status"] == {"from": "pending", "to": "completed"}
    assert hist[0]["reason"] == "Follow-up completed on day 28"


def test_hospital_scope_and_rbac(client):
    salem = make_client("hospital.salem@geobite.demo")
    chennai = make_client("hospital.chennai@geobite.demo")
    inc = chennai.post("/api/bite-incidents", json=_bite_payload(chennai)).json()
    assert salem.get(f"/api/bite-incidents/{inc['id']}").status_code == 404
    items = salem.get("/api/bite-incidents", params={"limit": 200}).json()["items"]
    assert items and all("Salem" in i["hospital_name"] for i in items)
    citizen = make_client("citizen@geobite.demo")
    assert citizen.get("/api/bite-incidents").status_code == 403
    assert client.get("/api/bite-incidents").status_code == 401
    assert make_client("vet.chennai@geobite.demo").get("/api/bite-incidents").status_code == 403
    vet_layer = make_client("vet.chennai@geobite.demo").get("/api/map/bites").json()
    assert vet_layer["points"] == []  # non-clinical roles only get aggregated heat/clusters


# ------------------------------------------------------------------ DEMO 2: community
def test_community_submit_track_and_map(client):
    c = make_client(ip="10.1.1.1")
    img = io.BytesIO()
    Image.new("RGB", (64, 48), (120, 90, 60)).save(img, "JPEG")
    img.seek(0)
    payload = _community_payload(c)
    r = c.post("/api/community/reports", data={"payload": json.dumps(payload)}, files={"photo": ("dogs.jpg", img, "image/jpeg")})
    assert r.status_code == 201, r.text
    code = r.json()["report_code"]
    st = c.get(f"/api/community/reports/status/{code}").json()
    assert st["status"] == "received" and st["dogs_reported"] == 6
    assert "lat" not in st and "contact_email" not in st

    dup = c.post("/api/community/reports", data={"payload": json.dumps(payload)})
    assert dup.status_code == 409

    admin = make_client("admin@geobite.demo")
    layer = admin.get("/api/map/dogs").json()
    assert any(code in f.get("report_codes", []) for f in layer["features"])
    q = admin.get("/api/community/reports", params={"sort": "recent", "limit": 5}).json()["items"]
    mine = next(i for i in q if i["report_code"] == code)
    assert mine["has_photo"] and mine["priority_score"] > 0
    assert admin.get(f"/api/community/reports/{mine['id']}/photo").status_code == 200
    assert c.get(f"/api/community/reports/{mine['id']}/photo").status_code == 401


def test_dedup_uses_median_not_sum():
    a, b = make_client(ip="10.2.0.1"), make_client(ip="10.2.0.2")
    base = _community_payload(a, lat_off=0.004)
    p1 = {**base, "dogs": {"total_dogs": 8}, "behaviours": [{"category": "resting"}]}
    p2 = {**base, "latitude": base["latitude"] + 0.0003, "dogs": {"total_dogs": 10}, "behaviours": [{"category": "resting"}]}
    r1 = a.post("/api/community/reports", data={"payload": json.dumps(p1)}).json()
    r2 = b.post("/api/community/reports", data={"payload": json.dumps(p2)}).json()
    assert r2["joined_existing_observation"] is True
    admin = make_client("admin@geobite.demo")
    feats = admin.get("/api/map/dogs").json()["features"]
    f = next(f for f in feats if r1["report_code"] in f["report_codes"])
    assert r2["report_code"] in f["report_codes"]
    assert f["independent_reports"] >= 2
    assert f["estimated_dogs"] < 18  # never summed


def test_community_validation_spam_and_rate_limit():
    c = make_client(ip="10.3.0.1")
    no_consent = _community_payload(c, consent=False)
    assert c.post("/api/community/reports", data={"payload": json.dumps(no_consent)}).status_code == 422
    outside = _community_payload(c, latitude=19.07, longitude=72.87)
    assert c.post("/api/community/reports", data={"payload": json.dumps(outside)}).status_code == 422
    bad_parts = _community_payload(c, dogs={"total_dogs": 2, "puppies": 3})
    assert c.post("/api/community/reports", data={"payload": json.dumps(bad_parts)}).status_code == 422
    bot = _community_payload(c, website="http://spam")
    r = c.post("/api/community/reports", data={"payload": json.dumps(bot)})
    assert r.status_code == 201
    assert make_client("admin@geobite.demo").get(f"/api/community/reports/status/{r.json()['report_code']}").status_code == 404
    statuses = []
    for i in range(12):
        statuses.append(c.post("/api/community/reports", data={"payload": json.dumps(_community_payload(c, lat_off=0.0001 * i))}).status_code)
    assert 429 in statuses


def test_public_layers_are_privacy_preserving(client):
    feats = client.get("/api/map/dogs").json()["features"]
    assert feats and all(f["precision"] == "grid_550m" and "report_codes" not in f for f in feats)
    assert client.get("/api/map/bites").status_code == 401
    pub = client.get("/api/map/public/bites").json()
    assert all(w["bites"] is None or w["bites"] >= pub["suppression_threshold"] for w in pub["wards"])
    dash = client.get("/api/community/dashboard").json()
    assert "items" not in dash and dash["total_reports"] > 0


# ------------------------------------------------------------------ DEMO 3: administrator
def test_admin_dashboard_filters_and_layers(admin):
    s = admin.get("/api/dashboard/summary").json()
    assert s["bite_incidents"] > 0 and s["dog_sightings"] > 0 and s["synthetic_data_present"]
    d, _, w = _ward(admin, "Madurai", "Simmakkal")
    sd = admin.get("/api/dashboard/summary", params={"district_id": d["id"]}).json()
    sw = admin.get("/api/dashboard/summary", params={"ward_id": w["id"]}).json()
    assert s["bite_incidents"] > sd["bite_incidents"] > sw["bite_incidents"] > 0
    oh = admin.get("/api/map/onehealth").json()
    assert oh["features"] and abs(sum(oh["weights"].values()) - 1) < 1e-9
    p = oh["features"][0]["properties"]
    assert set(p["contributions"]) == set(oh["weights"]) and "gi_class" in p
    vax = admin.get("/api/map/vaccination").json()
    assert {f["properties"]["status"] for f in vax["features"]} >= {"survey_estimate", "unavailable"}
    beh = admin.get("/api/map/behaviour", params={"group": "chasing"}).json()
    assert beh["features"] and all("chasing" in f["groups"] for f in beh["features"])
    run = admin.post("/api/analytics/hotspots/run").json()
    assert run["summary"]["dbscan_clusters"] > 0
    rm = admin.post("/api/analytics/risk-model/train").json()
    assert rm["is_simulated"] is True and "random_forest" in rm["summary"]["metrics"] and "baseline_historical_rate" in rm["summary"]["metrics"]


def test_alert_lifecycle(admin):
    alerts = admin.get("/api/alerts", params={"status": "new"}).json()["items"]
    a = next(x for x in alerts if x["district"] == "Chennai") if any(x["district"] == "Chennai" for x in alerts) else alerts[0]
    officers = admin.get("/api/officers").json()
    vet = next(o for o in officers if o["role"] == "veterinary_officer" and o["district"] in (a["district"], "All districts"))
    r = admin.post(f"/api/alerts/{a['id']}/assign", json={"assigned_to_id": vet["id"]}).json()
    assert r["status"] == "under_review" and r["assigned_to"]["id"] == vet["id"]
    assert admin.post(f"/api/alerts/{a['id']}/status", json={"status": "action_completed"}).status_code == 422

    vet_email = "vet.state@geobite.demo" if vet["district"] == "All districts" else ("vet.chennai@geobite.demo" if a["district"] == "Chennai" else "vet.madurai@geobite.demo")
    v = make_client(vet_email)
    other = make_client("municipal.trichy@geobite.demo")
    assert other.post(f"/api/alerts/{a['id']}/status", json={"status": "verified"}).status_code in (403, 404)
    r = v.post(f"/api/alerts/{a['id']}/inspections", json={"inspected_at": datetime.now(timezone.utc).isoformat(), "dogs_counted": 14, "report_outcome": "confirmed", "findings": "Reports consistent with field observation", "verify_linked_reports": True})
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "verified"
    r = v.post(f"/api/alerts/{a['id']}/interventions", json={"intervention_type": "anti_rabies_vaccination", "status": "in_progress"}).json()
    assert r["status"] == "intervention_assigned"
    assert v.post(f"/api/alerts/{a['id']}/interventions", json={"intervention_type": "culling"}).status_code == 422  # humane only
    iid = r["interventions"][0]["id"]
    r = v.patch(f"/api/interventions/{iid}", json={"status": "completed", "dogs_vaccinated": 120}).json()
    assert r["status"] == "action_completed"
    assert v.post(f"/api/alerts/{a['id']}/status", json={"status": "closed", "note": "done"}).status_code == 403
    assert admin.post(f"/api/alerts/{a['id']}/status", json={"status": "closed"}).status_code == 422
    r = admin.post(f"/api/alerts/{a['id']}/status", json={"status": "closed", "note": "Vaccination drive completed; monitoring continues."}).json()
    assert r["status"] == "closed" and r["closed_at"]
    actions = [h["action"] for h in r["history"]]
    assert {"assign", "inspection", "intervention", "status_change"} <= set(actions)
    notes = v.get("/api/notifications").json()
    assert any(a["alert_code"] in n["title"] for n in notes["items"])


def test_login_errors(client):
    assert client.post("/api/auth/login", json={"email": "admin@geobite.demo", "password": "wrong"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "nobody@geobite.demo", "password": PASSWORD}).status_code == 401
    weak = client.post("/api/auth/register", json={"email": "x@y.in", "password": "short", "full_name": "X Y", "account_type": "community_reporter"})
    assert weak.status_code == 422
