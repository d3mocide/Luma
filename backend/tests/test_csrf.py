"""Double-submit CSRF middleware tests."""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from luma.middleware import CSRF_COOKIE, CSRFMiddleware


def _make_app() -> FastAPI:
    app = FastAPI()

    @app.get("/api/v1/ping")
    async def ping() -> dict:
        return {"ok": True}

    @app.post("/api/v1/mutate")
    async def mutate() -> dict:
        return {"ok": True}

    @app.post("/api/v1/ingest/hae/some-token")
    async def ingest() -> dict:
        return {"ok": True}

    app.add_middleware(CSRFMiddleware, secure=False)
    return app


def test_get_issues_csrf_cookie():
    client = TestClient(_make_app())
    resp = client.get("/api/v1/ping")
    assert resp.status_code == 200
    assert CSRF_COOKIE in resp.cookies
    assert len(resp.cookies[CSRF_COOKIE]) > 20


def test_post_without_header_rejected():
    client = TestClient(_make_app())
    client.get("/api/v1/ping")  # receive cookie
    resp = client.post("/api/v1/mutate")
    assert resp.status_code == 403


def test_post_without_any_cookie_rejected_and_cookie_issued():
    client = TestClient(_make_app())
    resp = client.post("/api/v1/mutate")
    assert resp.status_code == 403
    assert CSRF_COOKIE in resp.cookies


def test_post_with_matching_header_allowed():
    client = TestClient(_make_app())
    client.get("/api/v1/ping")
    token = client.cookies[CSRF_COOKIE]
    resp = client.post("/api/v1/mutate", headers={"X-CSRF-Token": token})
    assert resp.status_code == 200


def test_post_with_mismatched_header_rejected():
    client = TestClient(_make_app())
    client.get("/api/v1/ping")
    resp = client.post("/api/v1/mutate", headers={"X-CSRF-Token": "wrong-token"})
    assert resp.status_code == 403


def test_ingest_paths_exempt():
    client = TestClient(_make_app())
    resp = client.post("/api/v1/ingest/hae/some-token")
    assert resp.status_code == 200
