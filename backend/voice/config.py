"""Voice configuration loaded from environment variables (never logs secrets)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv

HeaderStyle = Literal["legacy", "new"]
LlmProvider = Literal["gemini", "ollama", "none"]


@dataclass(frozen=True)
class VadPreset:
    """VAD parameters for a Gnani streaming preset."""

    min_silence_ms: int
    vad_threshold: float | None = None
    min_speech_ms: int | None = None
    min_segment_ms: int | None = None
    max_speech_s: float | None = None


@dataclass(frozen=True)
class VoiceSettings:
    """Runtime settings for the voice module."""

    voice_impl: str
    gnani_api_key: str
    gnani_header_style: HeaderStyle
    gnani_stt_model: str
    gnani_tts_model: str
    gnani_stt_wss_url: str
    gnani_stt_rest_url: str
    gnani_tts_wss_url: str
    gnani_tts_rest_url: str
    gnani_tts_worker_voice: str
    gnani_tts_contractor_voice: str
    gnani_tts_speed: float
    gnani_tts_format: Literal["wav", "mp3"]
    tts_cache_dir: Path
    audio_stub_dir: Path
    keyterms_enabled: bool
    llm_enabled: bool
    llm_provider: LlmProvider
    llm_timeout_s: float
    gemini_api_key: str
    gemini_model: str
    gemini_base_url: str
    ollama_url: str
    ollama_model: str
    stt_timeout_s: float
    tts_timeout_s: float
    vad_narration: VadPreset
    vad_confirm: VadPreset
    gemini_thinking_level: str = ""
    gemini_fallback_models: tuple[str, ...] = ()

    def __repr__(self) -> str:  # pragma: no cover - defensive secret redaction
        return (
            f"VoiceSettings(voice_impl={self.voice_impl!r}, "
            f"header_style={self.gnani_header_style!r}, "
            f"llm_provider={self.llm_provider!r})"
        )


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int | None) -> int | None:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    return int(raw.strip())


def _env_float(name: str, default: float | None) -> float | None:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    return float(raw.strip())


def load_voice_settings(*, load_env_files: bool = True) -> VoiceSettings:
    """Load VoiceSettings from voice/.env, repo .env, and os.environ."""
    if load_env_files:
        voice_dir = Path(__file__).resolve().parent
        repo_root = voice_dir.parents[1]
        for candidate in (voice_dir / ".env", repo_root / ".env"):
            if candidate.is_file():
                load_dotenv(dotenv_path=candidate, override=False)

    raw_style = os.environ.get("GNANI_HEADER_STYLE", "new").strip().lower()
    header_style: HeaderStyle = "legacy" if raw_style == "legacy" else "new"

    raw_fmt = os.environ.get("GNANI_TTS_FORMAT", "wav").strip().lower()
    tts_fmt: Literal["wav", "mp3"] = "mp3" if raw_fmt == "mp3" else "wav"

    llm_enabled = _env_bool("VOICE_LLM_ENABLED", True)
    raw_provider = os.environ.get("VOICE_LLM_PROVIDER", "gemini").strip().lower()
    if not llm_enabled or raw_provider == "none":
        llm_provider: LlmProvider = "none"
    elif raw_provider == "ollama":
        llm_provider = "ollama"
    else:
        llm_provider = "gemini"

    ollama_url = (
        os.environ.get("OLLAMA_URL")
        or os.environ.get("OLLAMA_BASE_URL")
        or "http://localhost:11434"
    ).strip()

    llm_timeout_raw = (
        os.environ.get("VOICE_LLM_TIMEOUT_S")
        or os.environ.get("OLLAMA_TIMEOUT_S")
        or "10.0"
    ).strip()

    # Default voice names ("Shivani", "Avinash") MUST be verified in the Gnani playground
    # across hi-IN, kn-IN, bn-IN, and en-IN before demo/pilot use.
    worker_voice = (
        os.environ.get("VOICE_TTS_VOICE_WORKER")
        or os.environ.get("GNANI_TTS_WORKER_VOICE")
        or "Shivani"
    ).strip()
    contractor_voice = (
        os.environ.get("VOICE_TTS_VOICE_CONTRACTOR")
        or os.environ.get("GNANI_TTS_CONTRACTOR_VOICE")
        or "Avinash"
    ).strip()

    tts_cache_raw = os.environ.get("VOICE_TTS_CACHE_DIR", "data/tts_cache").strip()
    audio_stub_raw = os.environ.get("VOICE_AUDIO_STUB_DIR", "data/audio").strip()
    tts_cache_path = Path(tts_cache_raw)
    audio_stub_path = Path(audio_stub_raw)
    if os.environ.get("VERCEL"):
        if not tts_cache_path.is_absolute():
            tts_cache_path = Path("/tmp/saakshi") / tts_cache_path
        if not audio_stub_path.is_absolute():
            audio_stub_path = Path("/tmp/saakshi") / audio_stub_path

    return VoiceSettings(
        voice_impl=os.environ.get("VOICE_IMPL", "fake").strip().lower(),
        gnani_api_key=os.environ.get("GNANI_API_KEY", "").strip(),
        gnani_header_style=header_style,
        gnani_stt_model=os.environ.get("GNANI_STT_MODEL", "prisma-v3.0").strip(),
        gnani_tts_model=os.environ.get("GNANI_TTS_MODEL", "timbre-v3.0").strip(),
        gnani_stt_wss_url=os.environ.get(
            "GNANI_STT_WSS_URL", "wss://api.vachana.ai/stt/v3/stream"
        ).strip(),
        gnani_stt_rest_url=os.environ.get(
            "GNANI_STT_REST_URL", "https://api.vachana.ai/stt/v3"
        ).strip(),
        gnani_tts_wss_url=os.environ.get(
            "GNANI_TTS_WSS_URL", "wss://api.vachana.ai/api/v1/tts"
        ).strip(),
        gnani_tts_rest_url=os.environ.get(
            "GNANI_TTS_REST_URL", "https://api.vachana.ai/api/v1/tts/inference"
        ).strip(),
        gnani_tts_worker_voice=worker_voice,
        gnani_tts_contractor_voice=contractor_voice,
        gnani_tts_speed=float(os.environ.get("GNANI_TTS_SPEED", "0.9").strip() or "0.9"),
        gnani_tts_format=tts_fmt,
        tts_cache_dir=tts_cache_path,
        audio_stub_dir=audio_stub_path,
        keyterms_enabled=_env_bool("VOICE_KEYTERMS_ENABLED", False),
        llm_enabled=llm_enabled,
        llm_provider=llm_provider,
        llm_timeout_s=float(llm_timeout_raw or "10.0"),
        gemini_api_key=os.environ.get("GEMINI_API_KEY", "").strip(),
        gemini_model=os.environ.get("GEMINI_MODEL", "").strip(),
        gemini_base_url=os.environ.get(
            "GEMINI_BASE_URL",
            "https://generativelanguage.googleapis.com/v1beta/models",
        ).strip(),
        ollama_url=ollama_url,
        ollama_model=os.environ.get("OLLAMA_MODEL", "").strip(),
        stt_timeout_s=float(os.environ.get("VOICE_STT_TIMEOUT_S", "30.0").strip() or "30.0"),
        tts_timeout_s=float(os.environ.get("VOICE_TTS_TIMEOUT_S", "30.0").strip() or "30.0"),
        vad_narration=VadPreset(
            min_silence_ms=_env_int("GNANI_VAD_NARRATION_MIN_SILENCE_MS", 700) or 700,
            vad_threshold=_env_float("GNANI_VAD_NARRATION_THRESHOLD", 0.6),
            min_speech_ms=_env_int("GNANI_VAD_NARRATION_MIN_SPEECH_MS", None),
            min_segment_ms=_env_int("GNANI_VAD_NARRATION_MIN_SEGMENT_MS", None),
            max_speech_s=_env_float("GNANI_VAD_NARRATION_MAX_SPEECH_S", None),
        ),
        vad_confirm=VadPreset(
            min_silence_ms=_env_int("GNANI_VAD_CONFIRM_MIN_SILENCE_MS", 300) or 300,
            vad_threshold=_env_float("GNANI_VAD_CONFIRM_THRESHOLD", None),
            min_speech_ms=_env_int("GNANI_VAD_CONFIRM_MIN_SPEECH_MS", 100),
            min_segment_ms=_env_int("GNANI_VAD_CONFIRM_MIN_SEGMENT_MS", 100),
            max_speech_s=_env_float("GNANI_VAD_CONFIRM_MAX_SPEECH_S", None),
        ),
        gemini_thinking_level=os.environ.get("GEMINI_THINKING_LEVEL", "").strip(),
        gemini_fallback_models=tuple(
            dict.fromkeys(
                m.strip()
                for m in os.environ.get("GEMINI_FALLBACK_MODELS", "").split(",")
                if m.strip()
            )
        ),
    )
