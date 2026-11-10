"""Tests for P8 Gnani TTS client, disk cache, and /api/voice/tts endpoint (zero network)."""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.voice.config import VadPreset, VoiceSettings, load_voice_settings
from backend.voice.errors import ErrorCode, VoiceError
from backend.voice.gnani_tts import GnaniTtsClient
from backend.voice.router import get_tts_client, get_voice_settings, router


def _tts_settings(tmp_path: Path, *, voice_impl: str = "gnani", fmt: str = "wav") -> VoiceSettings:
    return replace(
        load_voice_settings(load_env_files=False),
        voice_impl=voice_impl,
        gnani_api_key="test-key",
        gnani_header_style="legacy",
        gnani_tts_rest_url="https://mock.gnani.local/api/v1/tts/inference",
        gnani_tts_worker_voice="Shivani",
        gnani_tts_contractor_voice="Avinash",
        gnani_tts_speed=0.9,
        gnani_tts_format=fmt,  # type: ignore[arg-type]
        tts_cache_dir=tmp_path / "tts_cache",
        audio_stub_dir=tmp_path / "audio",
        llm_enabled=False,
        llm_provider="none",
        vad_narration=VadPreset(min_silence_ms=700, vad_threshold=0.6),
        vad_confirm=VadPreset(min_silence_ms=300, min_speech_ms=100, min_segment_ms=100),
    )


@pytest.mark.asyncio
async def test_tts_normalises_text_and_hits_disk_cache(tmp_path: Path) -> None:
    calls: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("X-API-Key-ID") == "test-key"
        body = json.loads(request.content.decode("utf-8"))
        calls.append(body)
        return httpx.Response(200, content=b"RIFF\x00\x00\x00\x00WAVEfakewav")

    transport = httpx.MockTransport(handler)
    client = GnaniTtsClient(settings=_tts_settings(tmp_path), transport=transport)

    first = await client.synthesize_with_meta("₹700 मिले", "hi-IN", audience="worker")
    assert first.cache_hit is False
    assert first.audio_bytes.startswith(b"RIFF")
    assert len(calls) == 1
    assert calls[0]["model"] == "timbre-v3.0"
    assert calls[0]["voice"] == "Shivani"
    assert calls[0]["language"] == "hi-IN"
    assert calls[0]["speed"] == 0.9
    # Text must be normalized before synthesis ("700" -> spoken Hindi).
    assert "सात सौ रुपये" in calls[0]["text"]
    assert "700" not in calls[0]["text"]

    # Second call hits disk cache with zero network requests.
    second = await client.synthesize_with_meta("₹700 मिले", "hi-IN", audience="worker")
    assert second.cache_hit is True
    assert second.audio_bytes == first.audio_bytes
    assert len(calls) == 1

    # Contractor audience picks neutral contractor voice and misses cache.
    contractor = await client.synthesize_with_meta("₹700 मिले", "hi-IN", audience="contractor")
    assert contractor.cache_hit is False
    assert calls[1]["voice"] == "Avinash"


@pytest.mark.asyncio
async def test_tts_429_backoff_and_error_mapping(tmp_path: Path) -> None:
    attempts = 0

    def retry_then_ok(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            return httpx.Response(429, json={"detail": {"error_code": "RATE_LIMITED"}})
        return httpx.Response(200, content=b"mp3-bytes")

    client = GnaniTtsClient(
        settings=_tts_settings(tmp_path, fmt="mp3"),
        transport=httpx.MockTransport(retry_then_ok),
        max_retries=3,
        backoff_base_s=0.005,
    )
    res = await client.synthesize_with_meta("yes", "en-IN")
    assert attempts == 3
    assert res.content_type == "audio/mpeg"

    always_fail = GnaniTtsClient(
        settings=_tts_settings(tmp_path),
        transport=httpx.MockTransport(lambda req: httpx.Response(500, text="boom")),
        max_retries=1,
        backoff_base_s=0.001,
    )
    with pytest.raises(VoiceError) as exc:
        await always_fail.synthesize("hello", "en-IN")
    assert exc.value.code == ErrorCode.TTS_FAILED


def test_post_voice_tts_endpoint_cache_headers(tmp_path: Path) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, content=b"RIFF\x00\x00\x00\x00WAVEendpoint")

    settings = _tts_settings(tmp_path)
    tts_client = GnaniTtsClient(settings=settings, transport=httpx.MockTransport(handler))

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_voice_settings] = lambda: settings
    app.dependency_overrides[get_tts_client] = lambda: tts_client

    with TestClient(app) as tc:
        r1 = tc.post("/api/voice/tts", json={"text": "₹500", "lang": "en-IN"})
        assert r1.status_code == 200
        assert r1.headers["content-type"].startswith("audio/wav")
        assert r1.headers["x-tts-cache"] == "MISS"
        assert "max-age=" in r1.headers["cache-control"]

        r2 = tc.post("/api/voice/tts", json={"text": "₹500", "lang": "en-IN"})
        assert r2.status_code == 200
        assert r2.headers["x-tts-cache"] == "HIT"
        assert r2.content == r1.content
        assert calls == 1

        bad = tc.post("/api/voice/tts", json={"text": "hello", "lang": "or-IN"})
        assert bad.status_code == 400
        assert bad.json()["code"] == ErrorCode.UNSUPPORTED_LANGUAGE.value

