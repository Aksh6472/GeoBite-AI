# AI and spatial-statistics modules

Design principle: **every number must be explainable, and nothing is presented as more certain than it is.** Simulated outputs are labelled as such in the API (`is_simulated`) and in the UI.

## 1. Bite-incident hotspot analysis (`services/hotspot.py`)

| Method | What it does | Parameters (defaults) |
|---|---|---|
| **Kernel Density Estimation** | Gaussian KDE over a local planar projection, evaluated on 220 m cells near the data and weighted by persons affected. Computed per district so each city has its own scale. Cells are classed relative to the peak: <25% low (green), 25-50% moderate (yellow), 50-75% high (orange), ≥75% very high (red). | bandwidth 450 m |
| **DBSCAN** | Density-based clusters of incidents (haversine metric, ball tree). The API returns only aggregate cluster statistics (count, persons, date range, injury, age, setting, wards), never patient-level rows, to non-clinical roles. | eps 450 m, min_samples 4 |
| **Getis-Ord Gi\*** | Local hot/cold-spot z-scores on ward bite counts with binary distance-band weights including self. Classified at 90/95/99% confidence (two-sided normal). | band 3.5 km |

Caveat: with only 6-8 wards per city the Gi* neighbourhood is small, so significance is conservative. With real data, use finer grid cells or official ward polygons with contiguity weights.

## 2. One Health Investigation Priority Index

A transparent weighted composite per ward over the last 90 days (weights are in `INDEX_WEIGHTS`):

| Component | Weight | Definition |
|---|---|---|
| Bite incidence | 0.40 | Bites per 10,000 residents, min-max scaled across wards |
| Concerning-behaviour reports | 0.20 | Independent (de-duplicated) reports of chasing, threatening behaviour or bites; verified reports count double |
| Vaccination gap | 0.25 | 1 − verified survey coverage. **Unknown coverage scores 0.5 and is flagged as a data gap.** |
| Observed dog density | 0.15 | De-duplicated observed dogs per km². Used as an *outreach-need* signal, **not** as danger. |

The API returns the components, their contributions (which sum to the index), data gaps and data completeness for every ward. Classes: ≥60 high, 40-60 elevated, 20-40 moderate, <20 low. An index ≥60 raises a `combined_hotspot` alert for field investigation.

## 3. Stray-dog population estimation

- **Community counts.** Reports within 150 m of each other (chained over 30 days) form one observation group, whose estimate is the **median** of its reports' counts, never the sum. Area estimates sum distinct groups. This undercounts rather than inflates when distinct groups share a spot; the trade-off is documented in the UI.
- **Ear-notches** are recorded but never treated as proof of current vaccination.
- **Computer vision (optional).** `services/vision.py` runs Ultralytics YOLO (COCO class `dog`) on a single field-survey photo and returns detections in that photo only, with an explicit caveat: it is not an individual-level or population count. Enable it with:
  ```bash
  pip install -r backend/requirements-ml.txt
  export ENABLE_YOLO=1 YOLO_WEIGHTS=yolov8n.pt
  ```
  Endpoint: `POST /api/analytics/vision/count`. When the module is disabled it returns `501` with the reason, and the UI shows "not installed".

## 4. Behavioural observation analysis

Rule-based prioritisation (`services/community.py`) scores each report for the human review queue. Points are added for:
- each concerning behaviour type;
- a reported bite (+3);
- welfare needs (+2);
- up to 4 independent concerning reports within 400 m and 14 days (+2 each);
- hospital-reported bites within 500 m in the last 30 days (+2).

Probable same-reporter repeats are halved. The stored `priority_reasons` explain every point. **No dog is classified as dangerous; aggression and rabies are never inferred.**

## 5. Predictive ward risk model (`services/risk_model.py`)

- **Panel:** ward × month. **Target:** next month's hospital-reported bites.
- **Features:**
  - bites lagged 1-3 months;
  - de-duplicated observed dog density (3 months);
  - concerning-behaviour reports (3 months);
  - verified vaccination coverage, plus a known/unknown flag;
  - human population density;
  - waste-accumulation sites;
  - schools and markets;
  - month seasonality (sin/cos).
- **Models:** `RandomForestRegressor(n=300, min_samples_leaf=3)`, plus `XGBRegressor` when installed, each compared against a **historical-rate baseline** (mean of the last 3 months).
- **Validation:** temporal hold-out of the 3 most recent complete months, reporting MAE and RMSE for every model. The metrics are computed, never hard-coded. On the seeded data the RF modestly beats the baseline and XGBoost does not; the UI shows that honestly.
- **Per-ward output:**
  - predicted bites with a P10-P90 interval across trees;
  - rate per 10k;
  - risk category (≥P80 high, ≥P50 moderate);
  - uncertainty band;
  - top contributing factors (|z| × importance; approximate);
  - data completeness;
  - model version and validation timestamp.
- **Simulation label:** when trained on synthetic data the run is stored with `is_simulated=true` and displayed with a *SIMULATED OUTPUT* banner. **Do not cite these metrics as real-world accuracy.**

Before operational use the model needs real retrospective data, spatial cross-validation, calibration checks and external validation. Consider count models (Poisson/negative-binomial GLM) as a further interpretable baseline.

## Extending

New modules plug in as services that write a `hotspot_analyses` row (`analysis_type`, `parameters`, `summary`, `results`, `model_version`, `is_simulated`). The console reads the latest run of each type, so no frontend schema change is needed to add results.
