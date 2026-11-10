"""Unit tests for P2 Core: config, errors, models, compute_due, and LocalAudioStore."""

from __future__ import annotations

import hashlib
import io
import re
import wave
from datetime import date
from pathlib import Path

import pytest

from backend.voice.amounts import compute_due
from backend.voice.config import load_voice_settings
from backend.voice.errors import ErrorCode, VoiceError, build_error_payload
from backend.voice.models import EntryDraft, ExtractContext, normalize_language
from backend.voice.storage_stub import LocalAudioStore, ensure_pcm16_16k_wav


def test_error_codes_and_payload_builder() -> None:
    expected = {
        "RATE_LIMITED",
        "MIC_DENIED",
        "STT_TIMEOUT",
        "STT_CONNECTION_LOST",
        "TTS_FAILED",
        "EXTRACTION_FAILED",
        "UNSUPPORTED_LANGUAGE",
    }
    assert {e.value for e in ErrorCode} == expected

    payload = build_error_payload(ErrorCode.RATE_LIMITED, "Try again later")
    assert payload == {
        "type": "error",
        "code": "RATE_LIMITED",
        "message": "Try again later",
    }

    err = VoiceError(ErrorCode.TTS_FAILED, "Synthesis failed", status_code=502)
    assert err.to_payload() == {
        "type": "error",
        "code": "TTS_FAILED",
        "message": "Synthesis failed",
    }


def test_error_code_matches_frontend_types_ts() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    ts_path = repo_root / "frontend" / "src" / "voice" / "types.ts"
    if not ts_path.exists():
        pytest.skip("frontend/src/voice/types.ts not created yet (P6)")

    ts_source = ts_path.read_text(encoding="utf-8")
    match = re.search(
        r"export\s+const\s+ERROR_CODES\s*=\s*\[(.*?)\]\s*as\s+const",
        ts_source,
        flags=re.DOTALL,
    )
    if match is None:
        match = re.search(
            r"export\s+type\s+ErrorCode\s*=\s*(.*?);",
            ts_source,
            flags=re.DOTALL,
        )
    assert match is not None, "Could not locate ERROR_CODES or ErrorCode in types.ts"

    ts_codes = set(re.findall(r'["\']([A-Z0-9_]+)["\']', match.group(1)))
    py_codes = {e.value for e in ErrorCode}
    assert ts_codes == py_codes, f"ErrorCode divergence: py={py_codes} ts={ts_codes}"


def test_compute_due_rules() -> None:
    assert compute_due(700, 300) == 400
    assert compute_due(700, 700) == 0
    assert compute_due(700, 0) == 700
    assert compute_due(750.5, 250.25) == 500.25
    assert compute_due(None, 300) is None
    assert compute_due(700, None) is None
    assert compute_due(None, None) is None
    assert compute_due(500, 700) is None
    assert compute_due(-100, 0) is None
    assert compute_due(500, -10) is None


def test_entry_draft_and_extract_context_models() -> None:
    draft = EntryDraft(
        work_date=date(2026, 11, 9),
        site_name="Basavanagudi",
        counterparty_name="Suresh",
        hours=8,
        agreed_amount_inr=700,
        paid_amount_inr=300,
        due_amount_inr=400,
        stated_due_amount_inr=400,
        field_confidence={"agreed_amount_inr": 0.95},
        language="hi-IN",
    )
    dumped = draft.model_dump(mode="json")
    assert dumped["work_date"] == "2026-11-09"
    assert dumped["due_amount_inr"] == 400
    assert dumped["stated_due_amount_inr"] == 400

    ctx = ExtractContext(
        previous_draft=draft,
        clarification_answer="300 diye",
        turn_count=1,
    )
    assert ctx.previous_draft is not None
    assert ctx.clarification_answer == "300 diye"


def test_normalize_language() -> None:
    assert normalize_language("hi") == "hi-IN"
    assert normalize_language("HI-in") == "hi-IN"
    assert normalize_language("kn") == "kn-IN"
    assert normalize_language("bn-IN") == "bn-IN"
    assert normalize_language("en") == "en-IN"
    with pytest.raises(VoiceError) as exc:
        normalize_language("or-IN")
    assert exc.value.code == ErrorCode.UNSUPPORTED_LANGUAGE


def test_config_env_overrides(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("VOICE_LLM_ENABLED", raising=False)
    monkeypatch.delenv("VOICE_LLM_PROVIDER", raising=False)
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    default_cfg = load_voice_settings(load_env_files=False)
    assert default_cfg.gnani_header_style == "new"
    assert default_cfg.llm_provider == "gemini"
    assert default_cfg.gemini_model == ""

    monkeypatch.setenv("GNANI_HEADER_STYLE", "new")
    monkeypatch.setenv("GNANI_VAD_NARRATION_MIN_SILENCE_MS", "900")
    monkeypatch.setenv("GNANI_VAD_CONFIRM_MIN_SPEECH_MS", "75")
    monkeypatch.setenv("OLLAMA_MODEL", "llama3.2:3b")
    monkeypatch.setenv("VOICE_LLM_PROVIDER", "ollama")
    monkeypatch.setenv("VOICE_LLM_ENABLED", "true")
    monkeypatch.setenv("VOICE_TTS_VOICE_WORKER", "Chetana")
    monkeypatch.setenv("VOICE_TTS_VOICE_CONTRACTOR", "Prakash")
    monkeypatch.setenv("VOICE_TTS_TIMEOUT_S", "12.5")

    cfg = load_voice_settings(load_env_files=False)
    assert cfg.gnani_header_style == "new"
    assert cfg.vad_narration.min_silence_ms == 900
    assert cfg.vad_confirm.min_speech_ms == 75
    assert cfg.ollama_model == "llama3.2:3b"
    assert cfg.llm_provider == "ollama"
    assert cfg.llm_enabled is True
    assert cfg.gnani_tts_worker_voice == "Chetana"
    assert cfg.gnani_tts_contractor_voice == "Prakash"
    assert cfg.tts_timeout_s == 12.5

    monkeypatch.setenv("VOICE_LLM_ENABLED", "false")
    disabled_cfg = load_voice_settings(load_env_files=False)
    assert disabled_cfg.llm_provider == "none"


@pytest.mark.asyncio
async def test_local_audio_store_writes_16k_mono_wav(tmp_path: Path) -> None:
    store = LocalAudioStore(base_dir=tmp_path)
    # 16,000 samples * 2 bytes = 32,000 bytes => 1,000 ms at 16 kHz mono PCM16
    raw_pcm = b"\x01\x00" * 16_000
    saved = await store.save_audio(raw_pcm, "narration")

    assert saved.audio_ref.startswith("local://narration/")
    assert saved.duration_ms == 1000
    filename = saved.audio_ref.split("/")[-1]
    wav_path = tmp_path / "narration" / filename
    assert wav_path.is_file()

    wav_bytes = wav_path.read_bytes()
    assert saved.sha256 == hashlib.sha256(wav_bytes).hexdigest()
    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        assert wf.getframerate() == 16_000
        assert wf.getnchannels() == 1
        assert wf.getsampwidth() == 2
        assert wf.getnframes() == 16_000

    # Also accepts an already-valid 16 kHz mono WAV container unchanged.
    re_wrapped, dur = ensure_pcm16_16k_wav(wav_bytes)
    assert re_wrapped == wav_bytes
    assert dur == 1000

