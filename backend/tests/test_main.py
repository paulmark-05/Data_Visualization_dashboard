from fastapi.testclient import TestClient

import main
from main import InsightsRequest, clamp_payload

client = TestClient(main.app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_static_frontend_is_served():
    res = client.get("/")
    assert res.status_code == 200
    assert "text/html" in res.headers["content-type"]


def test_insights_without_api_key(monkeypatch):
    monkeypatch.setattr(main, "api_key", None)
    res = client.post(
        "/api/insights",
        json={"question": "q", "columns": ["a"], "sample_rows": [{"a": 1}]},
    )
    assert res.status_code == 200
    body = res.json()
    assert "GEMINI_API_KEY is not set" in body["insights"]
    assert body["row_count"] == 1


def test_insights_with_no_rows(monkeypatch):
    monkeypatch.setattr(main, "api_key", "fake-key-for-test")
    res = client.post(
        "/api/insights",
        json={"question": "q", "columns": ["a"], "sample_rows": []},
    )
    assert res.status_code == 200
    body = res.json()
    assert "No data rows" in body["insights"]
    assert body["row_count"] == 0


def test_insights_success_path(monkeypatch):
    monkeypatch.setattr(main, "api_key", "fake-key-for-test")

    class FakeResult:
        text = "## Executive Summary\n\nRevenue is trending up."

    class FakeModel:
        def __init__(self, model_name):
            self.model_name = model_name

        def generate_content(self, prompt):
            return FakeResult()

    monkeypatch.setattr(main.genai, "GenerativeModel", FakeModel)

    res = client.post(
        "/api/insights",
        json={
            "question": "How is revenue trending?",
            "columns": ["region", "revenue"],
            "sample_rows": [
                {"region": "North", "revenue": 100},
                {"region": "South", "revenue": None},
            ],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["insights"] == FakeResult.text
    assert body["row_count"] == 2
    assert body["column_count"] == 2
    # Missing-value counts must be plain JSON-serializable ints, not numpy
    # scalars, or FastAPI's response encoding would break here.
    assert body["summary"]["missing_per_column"]["revenue"] == 1
    assert body["summary"]["missing_per_column"]["region"] == 0


def test_insights_gemini_failure_is_reported_gracefully(monkeypatch):
    monkeypatch.setattr(main, "api_key", "fake-key-for-test")

    class FailingModel:
        def __init__(self, model_name):
            pass

        def generate_content(self, prompt):
            raise RuntimeError("API key not valid")

    monkeypatch.setattr(main.genai, "GenerativeModel", FailingModel)

    res = client.post(
        "/api/insights",
        json={"question": "q", "columns": ["a"], "sample_rows": [{"a": 1}]},
    )
    assert res.status_code == 200
    body = res.json()
    assert "Gemini request failed" in body["insights"]
    assert "API key not valid" in body["insights"]


def test_request_size_limit_returns_413():
    huge_value = "x" * (3 * 1024 * 1024)
    res = client.post(
        "/api/insights",
        json={"question": "q", "columns": ["a"], "sample_rows": [{"a": huge_value}]},
    )
    assert res.status_code == 413


def test_clamp_payload_truncates_rows_columns_and_cells():
    req = InsightsRequest(
        question="x" * 3000,
        columns=["a", "b"],
        sample_rows=[{"a": i, "b": "y" * 1000} for i in range(300)],
    )
    clamped = clamp_payload(req)

    assert len(clamped.sample_rows) == 200
    assert len(clamped.question) == 2000
    assert len(clamped.sample_rows[0]["b"]) == 501  # 500 chars + ellipsis


def test_clamp_payload_drops_columns_not_in_allowlist():
    req = InsightsRequest(
        question="q",
        columns=["a"],
        sample_rows=[{"a": 1, "b": "should be dropped"}],
    )
    clamped = clamp_payload(req)

    assert "b" not in clamped.sample_rows[0]
    assert clamped.sample_rows[0]["a"] == 1
