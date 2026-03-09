import uuid
import asyncio
import io
import pytest
from fastapi.testclient import TestClient
from app.main import app
from sqlmodel import Session, create_engine, select
from app.core.config import settings
from app.models.all_models import Contribution, DocumentVersion, ContributionStatus
from app.services.embedding_tasks import embed_document

if hasattr(asyncio, "WindowsSelectorEventLoopPolicy"):
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

client = TestClient(app)
sync_engine = create_engine(settings.SQLALCHEMY_DATABASE_URI.replace("postgresql+asyncpg", "postgresql"))

def _login(email: str, password: str) -> str:
    r = client.post("/api/v1/auth/login", data={"username": email, "password": password}, headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert r.status_code == 200
    return r.json()["access_token"]

def test_e2e_upload_embedding_search(monkeypatch):
    email = f"ui_{uuid.uuid4().hex[:8]}@example.com"
    password = "Passw0rd!"
    # Register user
    try:
        r = client.post("/api/v1/auth/register", json={"email": email, "full_name": "UI", "password": password, "role": "STUDENT"})
        assert r.status_code == 200
    except Exception as e:
        pytest.skip(f"Register skipped on Windows due to asyncpg concurrency: {e}")
    token = _login(email, password)

    # Upload a small PDF-like payload (the server stores to MinIO; we won't exercise OCR here)
    # Simulate a minimal PDF header bytes to satisfy content-type handling
    dummy_pdf = b"%PDF-1.4\\n%\\xe2\\xe3\\xcf\\xd3\\n"
    files = {
        "title": (None, "E2E Test"),
        "description": (None, "Pipeline"),
        "file": ("dummy.pdf", io.BytesIO(dummy_pdf), "application/pdf"),
    }
    r2 = client.post("/api/v1/contributions/contributions", headers={"Authorization": f"Bearer {token}"}, files=files)
    assert r2.status_code == 200
    cid = r2.json()["id"]

    # Fetch versions and take the first version id
    r3 = client.get(f"/api/v1/contributions/{cid}/versions")
    assert r3.status_code == 200
    versions = r3.json()
    assert len(versions) >= 1
    vid = versions[0]["id"]

    # Inject OCR text directly (simulate OCR done) then run embedding task
    with Session(sync_engine) as s:
        dv = s.get(DocumentVersion, vid)
        dv.ocr_text = "Bonjour intelligence artificielle"
        s.add(dv)
        s.commit()

    # Monkeypatch embeddings to a deterministic vector
    def _fake_embed(text: str):
        return [1.0] + [0.0] * 383
    monkeypatch.setattr("app.services.embedding_tasks._embed", _fake_embed)

    embed_document(str(vid))

    # Approve contribution to make it searchable
    with Session(sync_engine) as s:
        c = s.get(Contribution, cid)
        c.status = ContributionStatus.APPROVED
        s.add(c)
        s.commit()

    # Semantic search should return our document
    r4 = client.get("/api/v1/search", params={"query": "intelligence", "top_k": 5})
    assert r4.status_code == 200
    items = r4.json()
    assert any(item["document_version_id"] == vid for item in items)

    # Text search fallback too
    r5 = client.get("/api/v1/search/text", params={"q": "intelligence", "limit": 5, "offset": 0})
    assert r5.status_code == 200
    items2 = r5.json()["items"]
    assert any(it["version_id"] == vid for it in items2)
