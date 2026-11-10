from __future__ import annotations

import hashlib
import base64
import os
import sys
import zipfile
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from passlib.hash import bcrypt

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
os.environ.setdefault("SECRET_KEY", "tests-only-random-secret-key-0123456789abcd")

import main
from app.config import Settings
from app.models import Base, Confirmation, Entry, EntryStatusLog, EvidencePack, ShareToken, Worker
from app.routers import auth, contractor, entries, evidence
from app.deps import get_voice_service
from contracts.fake_voice import FakeVoice
from contracts.voice_interface import TranscriptionResult


@pytest.fixture
def api_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    auth.login_rate_limiter.reset()
    auth.login_rate_limiter.max_attempts = 5
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
        auth.login_rate_limiter.reset()
        auth.login_rate_limiter.max_attempts = 5


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


def create_voice_draft(client: TestClient, headers: dict[str, str]):
    return client.post(
        "/api/entries/draft",
        headers={**headers, "Content-Type": "audio/webm"},
        content=b"test audio data",
    )


def confirmed_voice_entry(
    client: TestClient,
    headers: dict[str, str],
    draft: dict,
):
    return client.post(
        "/api/entries/draft/confirm",
        headers=headers,
        json={
            "draft_token": draft["draft_token"],
            "audio_base64": base64.b64encode(b"test audio data").decode("ascii"),
            "work_date": draft["work_date"],
            "site_name": draft["site_name"],
            "counterparty_name": draft["counterparty_name"],
            "work_type": draft["work_type"],
            "hours": draft["hours"],
            "days": draft["days"],
            "agreed_amount_inr": draft["agreed_amount_inr"],
            "paid_amount_inr": draft["paid_amount_inr"],
            "language": draft["language"],
        },
    )


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
        ("post", "/api/entries/draft", {"audio_ref": "old", "transcript": "old", "lang": "en-IN"}),
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


def test_secret_key_must_be_present_and_strong(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
    with pytest.raises(ValidationError):
        Settings(_env_file=None, SECRET_KEY="")
    with pytest.raises(ValidationError):
        Settings(_env_file=None, SECRET_KEY="your-secret-key-here")
    with pytest.raises(ValidationError):
        Settings(_env_file=None, SECRET_KEY="a" * 40)

    settings = Settings(
        _env_file=None,
        SECRET_KEY="tests-only-random-secret-key-0123456789abcd",
    )
    assert len(settings.SECRET_KEY.get_secret_value()) >= 32


def test_authenticated_worker_can_change_pin_and_old_pin_stops_working(
    api_client: tuple[TestClient, sessionmaker],
):
    client, test_session = api_client
    worker_id, token = register(client, "pin-change-worker")
    headers = auth_header(token)
    pin_change = {"current_pin": "1234", "new_pin": "5678"}

    assert client.post("/api/auth/change-pin", json=pin_change).status_code == 401
    assert client.post(
        "/api/auth/change-pin",
        headers=auth_header("invalid-token"),
        json=pin_change,
    ).status_code == 401
    expired_token = auth.create_access_token(
        {"worker_id": worker_id},
        expires_delta=timedelta(seconds=-1),
    )
    assert client.post(
        "/api/auth/change-pin",
        headers=auth_header(expired_token),
        json=pin_change,
    ).status_code == 401
    assert client.post(
        "/api/auth/change-pin",
        headers=headers,
        json={"current_pin": "1234", "new_pin": "12a4"},
    ).status_code == 422

    wrong_pin = client.post(
        "/api/auth/change-pin",
        headers=headers,
        json={"current_pin": "9999", "new_pin": "5678"},
    )
    assert wrong_pin.status_code == 403
    assert wrong_pin.json()["detail"] == "Current PIN verification failed"

    changed = client.post(
        "/api/auth/change-pin",
        headers=headers,
        json=pin_change,
    )
    assert changed.status_code == 200
    assert changed.json() == {"status": "updated"}
    assert "pin_hash" not in str(changed.json())

    with test_session() as db:
        worker = db.query(Worker).filter(Worker.id == worker_id).one()
        assert bcrypt.verify("5678", worker.pin_hash)
        assert not bcrypt.verify("1234", worker.pin_hash)

    assert client.post(
        "/api/auth/login",
        json={"alias": "pin-change-worker", "pin": "5678"},
    ).status_code == 200
    assert client.post(
        "/api/auth/login",
        json={"alias": "pin-change-worker", "pin": "1234"},
    ).status_code == 401


@pytest.mark.parametrize("endpoint", ["login", "change-pin"])
def test_login_and_pin_change_attempts_are_rate_limited_temporarily(
    api_client: tuple[TestClient, sessionmaker],
    monkeypatch: pytest.MonkeyPatch,
    endpoint: str,
):
    client, _ = api_client
    _, token = register(client, "rate-limited-worker")
    headers = auth_header(token)
    limiter = auth.login_rate_limiter
    limiter.max_attempts = 2
    now = [100.0]
    monkeypatch.setattr(auth, "monotonic", lambda: now[0])

    def attempt():
        if endpoint == "login":
            return client.post(
                "/api/auth/login",
                json={"alias": "rate-limited-worker", "pin": "9999"},
            )
        return client.post(
            "/api/auth/change-pin",
            headers=headers,
            json={"current_pin": "9999", "new_pin": "5678"},
        )

    expected_failure = 401 if endpoint == "login" else 403
    assert attempt().status_code == expected_failure
    assert attempt().status_code == expected_failure
    limited = attempt()
    assert limited.status_code == 429
    assert int(limited.headers["Retry-After"]) > 0

    now[0] += limiter.window_seconds + 1
    if endpoint == "login":
        recovered = client.post(
            "/api/auth/login",
            json={"alias": "rate-limited-worker", "pin": "1234"},
        )
    else:
        recovered = client.post(
            "/api/auth/change-pin",
            headers=headers,
            json={"current_pin": "1234", "new_pin": "5678"},
        )
    assert recovered.status_code == 200


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
    first_draft = create_voice_draft(client, first_headers)
    second_draft = create_voice_draft(client, second_headers)
    assert first_draft.status_code == 200
    assert second_draft.status_code == 200
    with test_session() as db:
        assert db.query(Entry).count() == 0

    assert confirmed_voice_entry(
        client,
        second_headers,
        first_draft.json(),
    ).status_code == 404
    first_confirmation = confirmed_voice_entry(client, first_headers, first_draft.json())
    second_confirmation = confirmed_voice_entry(client, second_headers, second_draft.json())
    assert first_confirmation.status_code == 201
    assert second_confirmation.status_code == 201
    first_entry_id = first_confirmation.json()["id"]
    second_entry_id = second_confirmation.json()["id"]
    repeated_confirmation = confirmed_voice_entry(
        client,
        first_headers,
        first_draft.json(),
    )
    assert repeated_confirmation.status_code == 201
    assert repeated_confirmation.json()["id"] == first_entry_id
    with test_session() as db:
        assert db.query(Entry).count() == 2

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

    assert client.post(f"/api/entries/{second_entry_id}/confirm", headers=first_headers).status_code == 404
    assert first_confirmation.json()["status"] == "WORKER_CONFIRMED"

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
    with test_session() as db:
        status_log = db.query(EntryStatusLog).filter(
            EntryStatusLog.entry_id == first_entry_id
        ).one()
        assert status_log.from_status is None
        assert status_log.to_status == Entry.STATUS_WORKER_CONFIRMED


def test_audio_draft_validates_audio_and_does_not_save_unconfirmed_entries(
    api_client: tuple[TestClient, sessionmaker],
):
    client, test_session = api_client
    _, token = register(client, "audio-draft-worker")
    headers = auth_header(token)

    assert client.post(
        "/api/entries/draft",
        headers={**headers, "Content-Type": "application/json"},
        content=b"not audio",
    ).status_code == 415
    assert client.post(
        "/api/entries/draft",
        headers={**headers, "Content-Type": "audio/webm"},
        content=b"",
    ).status_code == 400
    assert client.post(
        "/api/entries/draft",
        headers={**headers, "Content-Type": "audio/webm"},
        content=b"x" * (8 * 1024 * 1024 + 1),
    ).status_code == 413

    draft = create_voice_draft(client, headers)
    assert draft.status_code == 200
    assert draft.json()["voice_mode"] == "fake"
    assert draft.json()["transcript"].startswith("DEMO SAMPLE:")
    with test_session() as db:
        assert db.query(Entry).count() == 0


def test_missing_wage_details_are_flagged_and_cannot_be_saved_unreviewed(
    api_client: tuple[TestClient, sessionmaker],
):
    client, test_session = api_client
    _, token = register(client, "ambiguous-audio-worker")
    headers = auth_header(token)

    class AmbiguousVoice(FakeVoice):
        async def transcribe_audio(self, audio: bytes, content_type: str, lang: str):
            return TranscriptionResult(
                transcript="The recording does not state the wage or work date.",
                detected_language_code=lang,
            )

    client.app.dependency_overrides[get_voice_service] = AmbiguousVoice
    draft = create_voice_draft(client, headers)
    assert draft.status_code == 200
    body = draft.json()
    assert body["work_date"] is None
    assert body["agreed_amount_inr"] is None
    assert body["paid_amount_inr"] is None
    assert {"work_date", "agreed_amount_inr", "paid_amount_inr"}.issubset(
        body["needs_clarification"]
    )

    rejected = confirmed_voice_entry(client, headers, body)
    assert rejected.status_code == 422
    with test_session() as db:
        assert db.query(Entry).count() == 0


def test_transcription_failures_are_reported_without_creating_entries(
    api_client: tuple[TestClient, sessionmaker],
):
    client, test_session = api_client
    _, token = register(client, "failed-audio-worker")
    headers = auth_header(token)

    class FailedVoice(FakeVoice):
        async def transcribe_audio(self, audio: bytes, content_type: str, lang: str):
            raise ValueError("provider-specific details must not be returned")

    client.app.dependency_overrides[get_voice_service] = FailedVoice
    failed = create_voice_draft(client, headers)
    assert failed.status_code == 422
    assert failed.json()["detail"] == (
        "Audio could not be transcribed or understood; please record again"
    )
    with test_session() as db:
        assert db.query(Entry).count() == 0


def test_confirm_rejects_audio_changed_after_review(
    api_client: tuple[TestClient, sessionmaker],
):
    client, test_session = api_client
    _, token = register(client, "changed-audio-worker")
    headers = auth_header(token)
    draft = create_voice_draft(client, headers).json()
    body = {
        "draft_token": draft["draft_token"],
        "audio_base64": base64.b64encode(b"different audio").decode("ascii"),
        "work_date": draft["work_date"],
        "site_name": draft["site_name"],
        "counterparty_name": draft["counterparty_name"],
        "work_type": draft["work_type"],
        "hours": draft["hours"],
        "days": draft["days"],
        "agreed_amount_inr": draft["agreed_amount_inr"],
        "paid_amount_inr": draft["paid_amount_inr"],
        "language": draft["language"],
    }

    response = client.post(
        "/api/entries/draft/confirm",
        headers=headers,
        json=body,
    )
    assert response.status_code == 400
    assert "does not match" in response.json()["detail"]
    with test_session() as db:
        assert db.query(Entry).count() == 0


def test_missing_gnani_implementation_fails_explicitly(
    api_client: tuple[TestClient, sessionmaker],
    monkeypatch: pytest.MonkeyPatch,
):
    client, test_session = api_client
    _, token = register(client, "unavailable-gnani-worker")
    monkeypatch.setattr("app.deps.settings.VOICE_IMPL", "gnani")

    unavailable = create_voice_draft(client, auth_header(token))

    assert unavailable.status_code == 503
    assert unavailable.json()["detail"] == (
        "Gnani voice processing is not installed or configured"
    )
    with test_session() as db:
        assert db.query(Entry).count() == 0


@pytest.mark.parametrize(
    ("result", "expected_status", "reason"),
    [
        ("yes", "CONTRACTOR_CONFIRMED", None),
        ("no", "UNCONFIRMED", None),
        ("dispute", "CONTRACTOR_DISPUTED", "The recorded wage is incorrect"),
        ("dispute", "CONTRACTOR_DISPUTED", None),
    ],
)
def test_contractor_token_access_and_all_response_results(
    api_client: tuple[TestClient, sessionmaker],
    result: str,
    expected_status: str,
    reason: str | None,
):
    client, test_session = api_client
    _, token = register(client, "worker-three")
    headers = auth_header(token)
    draft = create_voice_draft(client, headers)
    assert draft.status_code == 200
    confirmation = confirmed_voice_entry(client, headers, draft.json())
    assert confirmation.status_code == 201
    entry_id = confirmation.json()["id"]
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

    assert client.get(f"/api/contractor/{valid_token}").json() == {
        "entry_text": "DEMO SAMPLE: Work at Demo Site with Demo Contractor on 2026-11-10; 8 hours, agreed 1200 rupees, paid 300 rupees.",
        "language": "en-IN",
        "entry_id": entry_id,
    }
    assert client.get("/api/contractor/unknown-share-token").status_code == 404
    assert client.post(
        "/api/contractor/unknown-share-token/respond",
        json={"result": result},
    ).status_code == 404
    assert client.get(f"/api/contractor/{expired_token}").status_code == 404
    assert client.post(
        f"/api/contractor/{expired_token}/respond",
        json={"result": result},
    ).status_code == 404

    response_body = {"result": result}
    if reason is not None:
        response_body["reason_text"] = reason
    response = client.post(
        f"/api/contractor/{valid_token}/respond",
        json=response_body,
    )
    assert response.status_code == 200
    assert response.json()["status"] == expected_status
    assert client.get(f"/api/contractor/{valid_token}").status_code == 404
    assert client.post(
        f"/api/contractor/{valid_token}/respond",
        json={"result": result},
    ).status_code == 404
    with test_session() as db:
        confirmation = db.query(Confirmation).one()
        assert confirmation.result == result
        assert confirmation.reason_text == reason
