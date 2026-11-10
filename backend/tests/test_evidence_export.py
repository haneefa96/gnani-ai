from __future__ import annotations

import io
import sys
import zipfile
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))

import main
from app.models import Base, Entry, EvidencePack
from app.routers import auth, contractor, entries, evidence


@pytest.fixture
def client_and_session(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    db_path = tmp_path / "evidence_test.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    api = main.create_application()
    for mod in (auth, entries, contractor, evidence):
        api.dependency_overrides[mod.get_db] = override_get_db

    monkeypatch.chdir(tmp_path)
    tc = TestClient(api)
    try:
        yield tc, session_factory, tmp_path
    finally:
        tc.close()
        engine.dispose()


def _register_worker(tc: TestClient, alias: str) -> tuple[int, str]:
    resp = tc.post(
        "/api/auth/register",
        json={"alias": alias, "pin": "4321", "language": "hi-IN"},
    )
    assert resp.status_code == 201
    payload = resp.json()
    return int(payload["worker_id"]), payload["access_token"]


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_evidence_verify_and_downloads_reject_missing_invalid_expired_auth(
    client_and_session,
):
    tc, _, _ = client_and_session
    expired = auth.create_access_token(
        {"worker_id": 1},
        expires_delta=timedelta(seconds=-5),
    )

    checks = (
        ("post", "/api/evidence", {"period_from": "2026-01-01", "period_to": "2026-12-31"}),
        ("get", "/api/verify", None),
        ("get", "/api/evidence/1/pdf", None),
        ("get", "/api/evidence/1/zip", None),
    )
    for method, url, payload in checks:
        fn = getattr(tc, method)
        kwargs = {"json": payload} if payload is not None else {}
        assert fn(url, **kwargs).status_code == 401
        assert fn(url, headers=_bearer("malformed.jwt.token"), **kwargs).status_code == 401
        assert fn(url, headers=_bearer(expired), **kwargs).status_code == 401


def test_multi_worker_evidence_generation_real_downloads_isolation_and_verify(
    client_and_session,
):
    tc, session_factory, tmp_path = client_and_session
    w1_id, w1_token = _register_worker(tc, "ramesh-w1")
    w2_id, w2_token = _register_worker(tc, "suresh-w2")
    w1_headers = _bearer(w1_token)
    w2_headers = _bearer(w2_token)

    # Empty worker returns clean valid=True on /verify and 404 on /evidence
    v1_empty = tc.get("/api/verify", headers=w1_headers)
    assert v1_empty.status_code == 200
    assert v1_empty.json()["valid"] is True
    assert v1_empty.json()["checked_entries"] == 0

    empty_pack = tc.post(
        "/api/evidence",
        headers=w1_headers,
        json={"period_from": "2020-01-01", "period_to": "2020-01-31"},
    )
    assert empty_pack.status_code == 404

    # Invalid date ranges return 400
    assert (
        tc.post(
            "/api/evidence",
            headers=w1_headers,
            json={"period_from": "2026-12-31", "period_to": "2026-01-01"},
        ).status_code
        == 400
    )
    assert (
        tc.post(
            "/api/evidence",
            headers=w1_headers,
            json={"period_from": "not-a-date", "period_to": "2026-12-31"},
        ).status_code
        == 400
    )

    # Create sample audio files inside tmp_path/data/audio for each worker
    audio_dir = tmp_path / "data" / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    w1_audio = audio_dir / "w1_clip.wav"
    w2_audio = audio_dir / "w2_clip.wav"
    w1_audio.write_bytes(b"RIFF\x00\x00\x00\x00WAVEw1-bytes")
    w2_audio.write_bytes(b"RIFF\x00\x00\x00\x00WAVEw2-bytes")

    e1 = tc.post(
        "/api/entries/draft",
        headers=w1_headers,
        json={"audio_ref": str(w1_audio), "transcript": "Basavanagudi 800", "lang": "hi-IN"},
    )
    assert e1.status_code == 201
    e1_id = e1.json()["id"]
    assert tc.post(f"/api/entries/{e1_id}/confirm", headers=w1_headers).status_code == 200

    # Unconfirmed second draft for w1 should not break /verify of confirmed chain
    e1_draft = tc.post(
        "/api/entries/draft",
        headers=w1_headers,
        json={"audio_ref": str(w1_audio), "transcript": "Second pending draft", "lang": "hi-IN"},
    )
    assert e1_draft.status_code == 201

    e2 = tc.post(
        "/api/entries/draft",
        headers=w2_headers,
        json={"audio_ref": str(w2_audio), "transcript": "Indiranagar 950", "lang": "kn-IN"},
    )
    assert e2.status_code == 201
    e2_id = e2.json()["id"]
    assert tc.post(f"/api/entries/{e2_id}/confirm", headers=w2_headers).status_code == 200

    # Worker 1 attempts to spoof worker_id=w2_id; backend must still generate only w1's pack
    p1_res = tc.post(
        "/api/evidence",
        headers=w1_headers,
        json={
            "worker_id": w2_id,
            "period_from": "2020-01-01",
            "period_to": "2035-12-31",
        },
    )
    assert p1_res.status_code == 200
    p1 = p1_res.json()
    assert p1["pack_id"] >= 1
    assert p1["pdf_download_url"] == f"/api/evidence/{p1['pack_id']}/pdf"
    assert p1["zip_download_url"] == f"/api/evidence/{p1['pack_id']}/zip"
    assert p1["entry_count"] == 2
    assert p1["chain_head_hash"]

    # Generating a second pack for w1 must not overwrite the first pack's files
    p1_res_second = tc.post(
        "/api/evidence",
        headers=w1_headers,
        json={"period_from": "2020-01-01", "period_to": "2035-12-31"},
    )
    assert p1_res_second.status_code == 200
    p1_second = p1_res_second.json()
    assert p1_second["pack_id"] != p1["pack_id"]
    assert p1_second["pdf_uri"] != p1["pdf_uri"]
    assert p1_second["zip_uri"] != p1["zip_uri"]

    p2_res = tc.post(
        "/api/evidence",
        headers=w2_headers,
        json={"period_from": "2020-01-01", "period_to": "2035-12-31"},
    )
    assert p2_res.status_code == 200
    p2 = p2_res.json()

    with session_factory() as db:
        row1 = db.query(EvidencePack).filter(EvidencePack.id == p1["pack_id"]).one()
        row2 = db.query(EvidencePack).filter(EvidencePack.id == p2["pack_id"]).one()
        assert row1.worker_id == w1_id
        assert row2.worker_id == w2_id

    # Genuine binary downloads for Worker 1
    pdf1 = tc.get(p1["pdf_download_url"], headers=w1_headers)
    assert pdf1.status_code == 200
    assert pdf1.headers["content-type"].startswith("application/pdf")
    assert pdf1.content.startswith(b"%PDF-")

    zip1 = tc.get(p1["zip_download_url"], headers=w1_headers)
    assert zip1.status_code == 200
    assert "zip" in zip1.headers["content-type"]
    with zipfile.ZipFile(io.BytesIO(zip1.content)) as zf:
        names = zf.namelist()
        manifest = zf.read("MANIFEST.txt").decode()
        assert f"Entry ID {e1_id}" in manifest
        assert f"Entry ID {e2_id}" not in manifest
        assert any(name.endswith(".pdf") for name in names)
        assert any("w1_clip.wav" in name for name in names)
        assert not any("w2_clip.wav" in name for name in names)

    # Genuine binary downloads for Worker 2
    pdf2 = tc.get(p2["pdf_download_url"], headers=w2_headers)
    assert pdf2.status_code == 200
    assert pdf2.content.startswith(b"%PDF-")
    zip2 = tc.get(p2["zip_download_url"], headers=w2_headers)
    assert zip2.status_code == 200
    with zipfile.ZipFile(io.BytesIO(zip2.content)) as zf2:
        manifest2 = zf2.read("MANIFEST.txt").decode()
        assert f"Entry ID {e2_id}" in manifest2
        assert f"Entry ID {e1_id}" not in manifest2

    # Cross-worker access to PDF or ZIP is strictly blocked (404)
    assert tc.get(p1["pdf_download_url"], headers=w2_headers).status_code == 404
    assert tc.get(p1["zip_download_url"], headers=w2_headers).status_code == 404
    assert tc.get(p2["pdf_download_url"], headers=w1_headers).status_code == 404
    assert tc.get(p2["zip_download_url"], headers=w1_headers).status_code == 404

    # /api/verify returns valid=True for both workers, and flags tampering strictly for the tampered worker
    v1 = tc.get("/api/verify", headers=w1_headers)
    v2 = tc.get("/api/verify", headers=w2_headers)
    assert v1.status_code == 200 and v1.json()["valid"] is True and v1.json()["checked_entries"] == 1
    assert v2.status_code == 200 and v2.json()["valid"] is True and v2.json()["checked_entries"] == 1

    with session_factory() as db:
        e_row = db.query(Entry).filter(Entry.id == e1_id).one()
        e_row.entry_hash = "0" * 64
        db.commit()

    v1_tampered = tc.get("/api/verify", headers=w1_headers)
    v2_still_ok = tc.get("/api/verify", headers=w2_headers)
    assert v1_tampered.status_code == 200
    assert v1_tampered.json()["valid"] is False
    assert v1_tampered.json()["mismatch_reason"]
    assert v2_still_ok.status_code == 200 and v2_still_ok.json()["valid"] is True

