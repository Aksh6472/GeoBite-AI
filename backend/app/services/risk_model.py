"""Ward-level predictive risk model (prototype).

Builds a ward x month panel and predicts next-month hospital-reported bites per ward.
Models: Random Forest (scikit-learn) and, if installed, XGBoost - each compared against a
simple historical-rate baseline (mean of the previous 3 months) on a temporal hold-out of the
most recent complete months. Metrics are computed from whatever data is in the database;
with seeded synthetic data they are SIMULATED and must not be quoted as real-world accuracy.
"""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, datetime, timezone

import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import vocab
from ..models import BiteIncident, CommunityReport, GeoLocation, HotspotAnalysis, VaccinationRecord

MODEL_VERSION = "geobite-risk-0.3.0"
FEATURES = [
    "bites_lag1", "bites_lag2", "bites_lag3", "dog_obs_density_3m", "concern_reports_3m",
    "vax_coverage", "vax_known", "pop_density_k", "waste_sites", "public_spaces", "month_sin", "month_cos",
]
FEATURE_LABELS = {
    "bites_lag1": "Bites last month", "bites_lag2": "Bites 2 months ago", "bites_lag3": "Bites 3 months ago",
    "dog_obs_density_3m": "Observed dog density (3 mo, de-duplicated)", "concern_reports_3m": "Concerning-behaviour reports (3 mo)",
    "vax_coverage": "Verified vaccination coverage", "vax_known": "Vaccination data available",
    "pop_density_k": "Human population density", "waste_sites": "Waste accumulation sites",
    "public_spaces": "Schools & markets", "month_sin": "Seasonality (sin)", "month_cos": "Seasonality (cos)",
}


def _mkey(d: date) -> int:
    return d.year * 12 + d.month - 1


def _from_key(k: int) -> date:
    return date(k // 12, k % 12 + 1, 1)


def build_panel(db: Session):
    wards = db.scalars(select(GeoLocation).where(GeoLocation.level == "ward")).all()
    bites = db.execute(select(BiteIncident.ward_id, BiteIncident.incident_date).where(BiteIncident.deleted_at.is_(None), BiteIncident.ward_id.isnot(None))).all()
    reports = db.scalars(select(CommunityReport).where(CommunityReport.deleted_at.is_(None), CommunityReport.verification_status != "rejected")).all()
    vax = db.scalars(select(VaccinationRecord).where(VaccinationRecord.verification_status == "confirmed")).all()

    bite_m = defaultdict(int)
    for wid, d in bites:
        bite_m[(wid, _mkey(d))] += 1
    dogs_m = defaultdict(float)
    concern_m = defaultdict(int)
    seen_cluster = set()
    for r in reports:
        k = (r.ward_id, _mkey(r.observed_at.date()))
        cid = (r.observation_cluster_id or r.id, k[1])
        if cid not in seen_cluster and r.dog_observation:
            seen_cluster.add(cid)
            dogs_m[k] += r.dog_observation.total_dogs
        if not r.is_probable_duplicate and {b.category for b in r.behaviours} & vocab.CONCERN_BEHAVIOURS:
            concern_m[k] += 1
    vax_by_ward = defaultdict(list)
    for v in vax:
        if v.estimation_method == "documented_survey" and v.estimated_dog_population:
            vax_by_ward[v.ward_id].append((_mkey(v.end_date or v.start_date), min(1.0, v.dogs_vaccinated / v.estimated_dog_population)))

    if not bites:
        return wards, [], None, None
    kmin = min(_mkey(d) for _, d in bites)
    now_k = _mkey(datetime.now(timezone.utc).date())
    rows = []
    for w in wards:
        area = w.area_km2 or 1.0
        for k in range(kmin + 3, now_k + 1):  # k == now_k is the (incomplete) current month -> prediction row
            covs = [c for (vk, c) in vax_by_ward.get(w.id, []) if vk < k]
            m = k % 12 + 1
            feats = {
                "bites_lag1": bite_m[(w.id, k - 1)], "bites_lag2": bite_m[(w.id, k - 2)], "bites_lag3": bite_m[(w.id, k - 3)],
                "dog_obs_density_3m": sum(dogs_m[(w.id, k - i)] for i in (1, 2, 3)) / area,
                "concern_reports_3m": sum(concern_m[(w.id, k - i)] for i in (1, 2, 3)),
                "vax_coverage": covs[-1] if covs else 0.0, "vax_known": 1.0 if covs else 0.0,
                "pop_density_k": (w.population or 0) / area / 1000, "waste_sites": w.waste_sites or 0,
                "public_spaces": (w.schools or 0) + (w.markets or 0),
                "month_sin": math.sin(2 * math.pi * m / 12), "month_cos": math.cos(2 * math.pi * m / 12),
            }
            completeness = np.mean([w.population is not None, bool(covs), any(dogs_m[(w.id, k - i)] for i in (1, 2, 3)), True])
            rows.append({"ward": w, "k": k, "y": bite_m[(w.id, k)], "x": feats, "completeness": float(completeness)})
    return wards, rows, kmin, now_k


def train_and_predict(db: Session, user_id: int | None = None) -> HotspotAnalysis:
    wards, rows, kmin, now_k = build_panel(db)
    if not rows or now_k - kmin < 8:
        raise ValueError("Not enough history to train the model (need at least 8 months of bite reports).")

    train_rows = [r for r in rows if r["k"] < now_k - 3]
    test_rows = [r for r in rows if now_k - 3 <= r["k"] < now_k]
    pred_rows = [r for r in rows if r["k"] == now_k]
    X = lambda rs: np.array([[r["x"][f] for f in FEATURES] for r in rs], dtype=float)  # noqa: E731
    y = lambda rs: np.array([r["y"] for r in rs], dtype=float)  # noqa: E731

    rf = RandomForestRegressor(n_estimators=300, min_samples_leaf=3, random_state=42, n_jobs=-1)
    rf.fit(X(train_rows), y(train_rows))
    base_test = np.array([(r["x"]["bites_lag1"] + r["x"]["bites_lag2"] + r["x"]["bites_lag3"]) / 3 for r in test_rows])
    rf_test = rf.predict(X(test_rows))
    yt = y(test_rows)
    metrics = {
        "holdout_months": [_from_key(k).strftime("%Y-%m") for k in range(now_k - 3, now_k)],
        "train_rows": len(train_rows), "test_rows": len(test_rows),
        "baseline_historical_rate": _metrics(yt, base_test),
        "random_forest": _metrics(yt, rf_test),
    }
    try:
        from xgboost import XGBRegressor

        xgb = XGBRegressor(n_estimators=300, max_depth=3, learning_rate=0.05, subsample=0.9, random_state=42)
        xgb.fit(X(train_rows), y(train_rows))
        metrics["xgboost"] = _metrics(yt, xgb.predict(X(test_rows)))
    except Exception as exc:  # optional dependency
        metrics["xgboost"] = {"unavailable": str(exc)[:120]}

    # Refit on all labelled rows and predict the current month.
    labelled = [r for r in rows if r["k"] < now_k]
    rf.fit(X(labelled), y(labelled))
    Xp = X(pred_rows)
    tree_preds = np.stack([t.predict(Xp) for t in rf.estimators_])
    mean, p10, p90 = tree_preds.mean(0), np.percentile(tree_preds, 10, 0), np.percentile(tree_preds, 90, 0)
    importances = dict(sorted(zip(FEATURES, rf.feature_importances_.round(4).tolist()), key=lambda kv: -kv[1]))

    Xall = X(labelled)
    mu, sd = Xall.mean(0), Xall.std(0) + 1e-9
    rates = []
    for r, m in zip(pred_rows, mean):
        pop = r["ward"].population or 0
        rates.append(m / pop * 10000 if pop else m)
    t1, t2 = (np.percentile(rates, [50, 80]) if rates else (0, 0))

    preds = []
    for i, r in enumerate(pred_rows):
        w = r["ward"]
        z = (Xp[i] - mu) / sd
        contrib = sorted(
            ({"feature": FEATURE_LABELS[f], "key": f, "direction": "higher" if z[j] > 0 else "lower", "weight": round(float(abs(z[j]) * importances[f]), 4)} for j, f in enumerate(FEATURES)),
            key=lambda c: -c["weight"],
        )[:4]
        rel_width = float((p90[i] - p10[i]) / max(mean[i], 0.5))
        preds.append(
            {
                "ward_id": w.id, "ward": w.name, "ward_number": w.ward_number, "lat": w.centroid_lat, "lng": w.centroid_lng,
                "predicted_bites": round(float(mean[i]), 2), "interval_p10_p90": [round(float(p10[i]), 2), round(float(p90[i]), 2)],
                "predicted_rate_per_10k": round(float(rates[i]), 3),
                "risk_category": "high" if rates[i] >= t2 else "moderate" if rates[i] >= t1 else "low",
                "uncertainty": "high" if rel_width > 1.2 else "medium" if rel_width > 0.6 else "low",
                "top_factors": contrib, "data_completeness": round(r["completeness"], 2),
            }
        )
    preds.sort(key=lambda p: -p["predicted_rate_per_10k"])
    synthetic = bool(db.scalar(select(BiteIncident.is_synthetic).where(BiteIncident.is_synthetic.is_(True)).limit(1)))
    run = HotspotAnalysis(
        analysis_type="risk_model",
        parameters={"target": "hospital-reported bites next month per ward", "features": FEATURES, "model": "RandomForestRegressor(n=300,min_leaf=3)", "category_thresholds": "rate per 10k: >= P80 high, >= P50 moderate"},
        summary={
            "prediction_month": _from_key(now_k).strftime("%Y-%m"), "metrics": metrics, "feature_importance": importances,
            "feature_labels": FEATURE_LABELS, "validated_at": datetime.now(timezone.utc).isoformat(),
            "disclaimer": "SIMULATED prototype output trained on synthetic data. Not validated for operational use." if synthetic else "Prototype model - requires external validation before operational use.",
        },
        results=preds,
        model_version=MODEL_VERSION,
        is_simulated=synthetic,
        created_by_id=user_id,
    )
    db.add(run)
    db.flush()
    return run


def _metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    if len(y_true) == 0:
        return {}
    err = y_pred - y_true
    return {"mae": round(float(np.abs(err).mean()), 3), "rmse": round(float(np.sqrt((err**2).mean())), 3)}
