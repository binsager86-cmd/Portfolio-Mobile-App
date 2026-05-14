# Portfolio App — Mobile Migration

## Architecture

```
/portfolio_app
  ├── (existing Streamlit app — DO NOT TOUCH)
  │     ├── ui.py
  │     ├── portfolio.db      ← Live Database
  │     └── ...
  │
  └── /mobile-migration       ← NEW (safe sandbox)
        ├── /backend-api      ← FastAPI server
        │     ├── /app
        │     │   ├── main.py          (entry point)
        │     │   ├── /api             (route handlers)
        │     │   │   ├── auth.py
        │     │   │   └── portfolio.py
        │     │   ├── /core            (config, database)
        │     │   │   ├── config.py
        │     │   │   └── database.py
        │     │   └── /services        (business logic)
        │     │       ├── auth_service.py
        │     │       ├── fx_service.py
        │     │       └── portfolio_service.py
        │     ├── .env
        │     └── requirements.txt
        │
        ├── /mobile-app        ← React Native Expo (Phase 2)
        │     ├── /app
        │     ├── /components
        │     └── /services
        │
        └── dev_portfolio.db   ← Development database (COPY of portfolio.db)
```

## Safety Rules

1. **No existing files are modified.** All new code lives under `mobile-migration/`.
2. **Development database:** The backend uses `dev_portfolio.db` (a copy). The live `portfolio.db` is never touched.
3. **WAL mode:** SQLite WAL journal mode is enabled for safe concurrent reads.

---

## Phase 1: Backend API (FastAPI)

### Prerequisites

- Python 3.10+
- A virtual environment (recommended)

### Setup

```bash
# 1. Navigate to backend folder
cd mobile-migration/backend-api

# 2. Create & activate venv
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# 3. Install dependencies
pip install -r requirements.txt

# 4. IMPORTANT — Copy your live database
copy ..\..\portfolio.db ..\dev_portfolio.db
# cp ../../portfolio.db ../dev_portfolio.db   # macOS/Linux

# 5. Edit .env if needed (SECRET_KEY, CORS_ORIGINS)

# 6. Run the server
uvicorn app.main:app --reload --port 8000
```

### Test Endpoints

Open **http://localhost:8000/docs** (Swagger UI):

1. **Health check:** `GET /health` — no auth needed.
2. **Login:**
   - Click **Authorize** → enter your existing Streamlit username + password.
   - Or POST to `/api/auth/login` with form-encoded `username` + `password`.
   - Or POST JSON to `/api/auth/login/json`.
3. **Portfolio overview:** `GET /api/portfolio/overview` — requires Bearer token.
4. **Holdings:** `GET /api/portfolio/holdings` — includes `market_value_kwd` and `unrealized_pnl_kwd`.
5. **Per-portfolio table:** `GET /api/portfolio/table/KFH` (or BBYN, USA).
6. **FX rate:** `GET /api/portfolio/fx-rate`.

### Verify Data Integrity

Compare the JSON output of `/api/portfolio/overview` and `/api/portfolio/holdings`
with what you see in the legacy Streamlit app. The numbers should match.

---

## Switching to the Live Database (Production)

When you're ready to point the backend at the real database:

1. Edit `mobile-migration/backend-api/.env`:
   ```
   DATABASE_PATH=../../portfolio.db
   ```
2. Restart the server.

> **Warning:** This means both Streamlit and FastAPI share the same DB. WAL mode
> allows concurrent reads safely, but be cautious with concurrent writes.

---

## Phase 2: Mobile App (React Native Expo)

React Native / Expo frontend located in `mobile-app/`. Consumes the FastAPI backend.

---

## Eagle Eye — Market Stage Intelligence (Phase 1)

Eagle Eye is a rule-based market-stage classification system that analyses each stock's lifecycle position and produces a confidence score, recommended entry zone, stop-loss, and TP1 target.

### What it does

1. **Computes indicators** — EMA, RSI, MACD, ATR, Bollinger Bands, OBV, CMF, MFI, ADX on the most-recent price window.
2. **Classifies lifecycle stage** — eight stages: `DORMANT`, `STEALTH_ACCUMULATION`, `EARLY_BREAKOUT`, `MARKUP_TRENDING`, `ACCELERATION_CLIMAX`, `DISTRIBUTION_TOPPING`, `MARKDOWN_DECLINE`, `CAPITULATION_EXHAUSTION`.
3. **Scores confidence** — 0–100 score derived from rule-based sub-signals; calibrated against 20-day TP1 hit-rate on 336 real predictions.
4. **Computes entry / stop / TP1** — ATR-floor plus nearest-resistance approach, with per-stage caps to prevent unreachable targets.

### Calibration results (Phase 1, reality check — 336 predictions)

| Confidence band | N   | TP1 hit % | Cal error |
|-----------------|-----|-----------|-----------|
| 00–49           | 263 | 31.2 %    | 6.7 pp    |
| 50–59           | 53  | 50.9 %    | 3.6 pp    |
| 60–69           | 10  | 70.0 %    | 5.5 pp    |

- Monotonic: 31.2 % < 50.9 % < 70.0 % ✓
- Spread: 38.8 pp ≥ 20 pp ✓
- Mean calibration error: **5.3 %** (threshold 15 %) ✓

### Nightly recompute schedule (APScheduler, `app/cron/scheduler.py`)

All times are **Asia/Kuwait**, Sunday–Thursday (Boursa Kuwait trading week).

| Job ID | When | What |
|--------|------|------|
| `eagle_eye_intraday_refresh` | 13:15 Sun–Thu | Intraday score refresh near Boursa close |
| `eagle_eye_nightly` | 14:05 Sun–Thu | Post-close full recompute (no DNA rebuild) |
| `eagle_eye_weekly_dna` | 14:30 Sunday | Weekly full DNA rebuild |

### Stage labels (UI)

| Internal key | Scanner (short) | Detail screen (full) |
|---|---|---|
| `DORMANT` | Sleeping | Sleeping |
| `STEALTH_ACCUMULATION` | Accumulating | Quiet Buying |
| `EARLY_BREAKOUT` | Breaking Out | Breaking Out |
| `MARKUP_TRENDING` | Rising | Rising Strong |
| `ACCELERATION_CLIMAX` | Overheating | Overheating |
| `DISTRIBUTION_TOPPING` | Topping | Topping Out |
| `MARKDOWN_DECLINE` | Falling | Falling |
| `CAPITULATION_EXHAUSTION` | Bottoming | Crashed — Possible Bottom |

### Key backend files

- `app/services/eagle_eye/rating_engine.py` — core scoring + TP1/stop logic
- `app/services/eagle_eye/indicators.py` — technical indicator library
- `app/cron/scheduler.py` — APScheduler job definitions
- `tests/test_eagle_eye_indicators.py` — Phase 1 unit tests (10 tests, all pass)
