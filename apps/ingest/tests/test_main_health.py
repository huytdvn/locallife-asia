from fastapi.testclient import TestClient

from app.main import app


def test_health() -> None:
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_upload_requires_token_when_set(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    from app.config import get_settings

    # Force token in settings.
    settings = get_settings()
    original = settings.ingest_api_token
    try:
        settings.ingest_api_token = "secret"  # type: ignore[misc]
        client = TestClient(app)
        r = client.post("/upload", files={"file": ("a.txt", b"hi")}, data={"owner": "x@y.z"})
        assert r.status_code == 401
    finally:
        settings.ingest_api_token = original  # type: ignore[misc]
