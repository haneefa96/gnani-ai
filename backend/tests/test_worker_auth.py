from __future__ import annotations

import hashlib
import sys
import zipfile
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))

import main
from app.models import Base, EvidencePack, ShareToken
from app.routers import auth, contractor, entries, evidence


@pytest.fixture
def api_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    database_path = tmp_path / "test.db"
    engine = create_engine(
        f"sqlite:///{database_path}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    test_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def get_test_db():
        db = test_session()
        try:
            yield db
        finally:
            db.close()

    api = main.create_application()
    for router in (auth, entries, contractor, evidence):
        api.dependency_overrides[router.get_db] = get_test_db

    monkeypatch.chdir(tmp_path)
    client = TestClient(api)
    try:
        yield client, test_session
    finally:
        client.close()
        engine.dispose()


def register(client: TestClient, alias: str) -> tuple[int, str]:
    response = client.post(
        "/api/auth/register",
        json={"alias": alias, "pin": "1234", "language": "en-IN"},
    )
    assert response.status_code == 201
    data = response.json()
    return data["worker_id"], data["access_token"]


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def send(
    client: TestClient,
    method: str,
    path: str,
    headers: dict[str, str] | None = None,
    body: dict | None = None,
):
    request = getattr(client, method)
    if body is None:
        return request(path, headers=headers)
    return request(path, headers=headers, json=body)


def test_protected_entry_and_evidence_routes_reject_missing_invalid_and_expired_tokens(
    api_client: tuple[TestClient, sessionmaker],
):
    client, _ = api_client
    protected_requests = (
        ("get", "/api/entries/", None),
        ("post", "/api/evidence", {"period_from": "2020-01-01", "period_to": "2030-01-01"}),
        ("get", "/api/verify", None),
    )
    expired_token = auth.create_access_token(
        {"worker_id": 1},
        expires_delta=timedelta(seconds=-1),
    )

    for method, path, body in protected_requests:
        assert send(client, method, path, body=body).status_code == 401
        assert send(
            client,
            method,
            path,
            headers=auth_header("not-a-jwt"),
            body=body,
        ).status_code == 401
        assert send(
            client,
            method,
            path,
            headers=auth_header(expired_token),
            body=body,
        ).status_code == 401


def test_worker_ownership_and_legitimate_register_entry_share_evidence_workflow(
    api_client: tuple[TestClient, sessionmaker],
):
    client, test_session = api_client
    first_worker_id, first_token = register(client, "worker-one")
    second_worker_id, second_token = register(client, "worker-two")

    duplicate_alias = client.post(
        "/api/auth/register",
        json={"alias": "worker-one", "pin": "1234", "language": "en-IN"},
    )
    assert duplicate_alias.status_code == 400
    incorrect_pin = client.post(
        "/api/auth/login",
        json={"alias": "worker-one", "pin": "9999"},
    )
    assert incorrect_pin.status_code == 401

    login = client.post(
        "/api/auth/login",
        json={"alias": "worker-one", "pin": "1234"},
    )
    assert login.status_code == 200
    first_token = login.json()["access_token"]

    first_headers = auth_header(first_token)
    second_headers = auth_header(second_token)
    first_draft = client.post(
        "/api/entries/draft",
        headers=first_headers,
        json={"audio_ref": "first.wav", "transcript": "First worker's entry", "lang": "en-IN"},
    )
    second_draft = client.post(
        "/api/entries/draft",
        headers=second_headers,
        json={"audio_ref": "second.wav", "transcript": "Second worker's entry", "lang": "en-IN"},
    )
    assert first_draft.status_code == 201
    assert second_draft.status_code == 201
    first_entry_id = first_draft.json()["id"]
    second_entry_id = second_draft.json()["id"]

    first_entries = client.get("/api/entries/", headers=first_headers)
    second_entries = client.get("/api/entries/", headers=second_headers)
    assert [entry["id"] for entry in first_entries.json()] == [first_entry_id]
    assert [entry["id"] for entry in second_entries.json()] == [second_entry_id]

    assert client.get(f"/api/entries/{second_entry_id}", headers=first_headers).status_code == 404
    assert client.post(f"/api/entries/{second_entry_id}/confirm", headers=first_headers).status_code == 404
    assert client.post(
        f"/api/entries/{second_entry_id}/correct",
        headers=first_headers,
        json={"audio_ref": "correction.wav", "transcript": "Not mine", "lang": "en-IN"},
    ).status_code == 404
    assert client.post(f"/api/entries/{second_entry_id}/share", headers=first_headers).status_code == 404

    confirmed = client.post(f"/api/entries/{first_entry_id}/confirm", headers=first_headers)
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "WORKER_CONFIRMED"

    shared = client.post(f"/api/entries/{first_entry_id}/share", headers=first_headers)
    assert shared.status_code == 200
    token = shared.json()["share_url"].rsplit("/", 1)[-1]
    contractor_entry = client.get(f"/api/contractor/{token}")
    assert contractor_entry.status_code == 200
    assert contractor_entry.json()["entry_id"] == first_entry_id
    response = client.post(
        f"/api/contractor/{token}/respond",
        json={"result": "yes"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "CONTRACTOR_CONFIRMED"
    assert client.get(f"/api/contractor/{token}").status_code == 404

    evidence_response = client.post(
        "/api/evidence",
        headers=first_headers,
        json={
            "worker_id": second_worker_id,
            "period_from": "2000-01-01",
            "period_to": "2100-01-01",
        },
    )
    assert evidence_response.status_code == 200

    pack = evidence_response.json()
    with test_session() as db:
        saved_pack = db.query(EvidencePack).one()
        assert saved_pack.worker_id == first_worker_id
        with zipfile.ZipFile(pack["zip_uri"]) as archive:
            manifest = archive.read("MANIFEST.txt").decode()
    assert f"Entry ID {first_entry_id}" in manifest
    assert f"Entry ID {second_entry_id}" not in manifest

    verification = client.get("/api/verify", headers=first_headers)
    assert verification.status_code == 200
    assert verification.json()["valid"] is True


def test_contractor_token_cannot_read_other_entries_and_expired_tokens_are_rejected(
    api_client: tuple[TestClient, sessionmaker],
):
    client, test_session = api_client
    _, token = register(client, "worker-three")
    headers = auth_header(token)
    draft = client.post(
        "/api/entries/draft",
        headers=headers,
        json={"audio_ref": "entry.wav", "transcript": "Token-owned entry", "lang": "en-IN"},
    )
    assert draft.status_code == 201
    entry_id = draft.json()["id"]
    assert client.post(f"/api/entries/{entry_id}/confirm", headers=headers).status_code == 200
    share = client.post(f"/api/entries/{entry_id}/share", headers=headers)
    assert share.status_code == 200
    valid_token = share.json()["share_url"].rsplit("/", 1)[-1]

    expired_token = "expired-share-token"
    with test_session() as db:
        db.add(
            ShareToken(
                entry_id=entry_id,
                token_hash=hashlib.sha256(expired_token.encode()).hexdigest(),
                expires_at=datetime.utcnow() - timedelta(seconds=1),
            )
        )
        db.commit()

    assert client.get(f"/api/contractor/{valid_token}").json()["entry_id"] == entry_id
    assert client.get(f"/api/contractor/{expired_token}").status_code == 404
    assert client.get("/api/contractor/unknown-share-token").status_code == 404
