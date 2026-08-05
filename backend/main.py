
import os
from pathlib import Path
from typing import List, Dict, Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import pandas as pd
import google.generativeai as genai

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
  # Fail fast in logs; the endpoint will also validate
  print("[DataVizard] WARNING: GEMINI_API_KEY not set. /api/insights will return an error.")
else:
  genai.configure(api_key=api_key)

app = FastAPI(title="DataVizard Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class InsightsRequest(BaseModel):
    question: str
    columns: List[str]
    sample_rows: List[Dict[str, Any]]


class InsightsResponse(BaseModel):
    insights: str
    row_count: int
    column_count: int
    summary: Dict[str, Any]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/insights", response_model=InsightsResponse)
def api_insights(payload: InsightsRequest):
    if not api_key:
        return InsightsResponse(
            insights="Backend misconfigured: GEMINI_API_KEY is not set on the server.",
            row_count=len(payload.sample_rows),
            column_count=len(payload.columns),
            summary={},
        )

    if not payload.sample_rows:
        return InsightsResponse(
            insights="No data rows were provided to the backend.",
            row_count=0,
            column_count=len(payload.columns),
            summary={},
        )

    df = pd.DataFrame(payload.sample_rows)

    # Basic profiling
    row_count = df.shape[0]
    col_count = df.shape[1]
    missing_per_col = df.isna().sum().to_dict()
    dtypes = df.dtypes.astype(str).to_dict()

    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    describe_str = ""
    if numeric_cols:
        describe_str = df[numeric_cols].describe().to_string()

    head_str = df.head(5).to_string()

    prompt = f"""You are a senior data analyst embedded in a product team.

You are given:
- Row count: {row_count}
- Column count: {col_count}
- Column names: {', '.join(payload.columns)}
- Column dtypes (pandas): {dtypes}
- Missing values per column: {missing_per_col}

Sample head(5):

{head_str}

Numeric summary (pandas describe):
{describe_str}

Business question from user (if any):
{payload.question}

Write a concise, actionable analysis in markdown:
1. Start with a 3–4 line executive summary.
2. Then list 3–7 key patterns, drivers or risks as bullet points.
3. Call out data‑quality issues that could mislead decision‑making.
4. Suggest 3 concrete next analyses or dashboard views.

Keep it non‑technical and business‑oriented. Do not repeat the raw table back.
"""  # noqa

    try:
        model = genai.GenerativeModel(GEMINI_MODEL)
        result = model.generate_content(prompt)
        text = result.text if hasattr(result, "text") else str(result)
    except Exception as exc:  # Gemini call failed (bad/revoked key, retired model, rate limit, ...)
        return InsightsResponse(
            insights=f"Gemini request failed: {exc}",
            row_count=row_count,
            column_count=col_count,
            summary={},
        )

    summary = {
        "missing_per_column": missing_per_col,
        "dtypes": dtypes,
        "numeric_columns": numeric_cols,
    }

    return InsightsResponse(
        insights=text,
        row_count=row_count,
        column_count=col_count,
        summary=summary,
    )


# Serve the static frontend from the same service (mounted last so it
# doesn't shadow the /health and /api/* routes above).
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
