# DataVizard

DataVizard is a pastel neo‑brutalist data dashboard:

- Upload CSV / Excel.
- Clean data (missing, duplicates, outliers) with an auditable, undoable log.
- Configure visualisations (bar, line, pie, scatter).
- Ask Gemini for AI‑generated insights via a FastAPI backend.

FastAPI serves both the API **and** the static frontend as a single deployable
service — there's no separate frontend server or backend URL to keep in sync.

## Project layout

```text
DataVizard/
  frontend/
    index.html      # Static UI (neo‑brutalist pastel shell)
    style.css        # Theme + layout
    config.js         # Frontend config (API paths, limits)
    app.js             # Client‑side logic (upload, cleaning, charts, exports)
  backend/
    main.py           # FastAPI app: /api/insights (Gemini) + serves frontend/
    requirements.txt
  .env.example      # Copy to .env and fill GEMINI_API_KEY
```

## Running locally

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example ../.env  # then edit ../.env to set GEMINI_API_KEY
uvicorn main:app --host 0.0.0.0 --port 8000
```

Open http://localhost:8000 — the frontend and API are both served from there.

## Deploying to Render

Single Render **Web Service** pointed at this repo:

- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Environment variables: `GEMINI_API_KEY` (required), `GEMINI_MODEL` (optional,
  defaults to `gemini-1.5-flash`)

Do not commit `.env` — set `GEMINI_API_KEY` in the Render dashboard instead.
