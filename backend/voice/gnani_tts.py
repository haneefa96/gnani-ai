"""Gnani Timbre v3.0 REST TTS client with normalization, 429 back-off, and disk cache."""

from __future__ import annotations

import asyncio
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import httpx

from .config import VoiceSettings, load_voice_settings
from .errors import ErrorCode, VoiceError
from .models import SupportedLanguage, normalize_language
from .normalise import normalise_for_tts

TtsAudience = Literal["worker", "contractor"]
TtsFormat = Literal["wav", "mp3"]


@dataclass(frozen=True)
class TtsSynthesisResult:
    """Synthesized audio payload plus HTTP metadata."""

    audio_bytes: bytes
    content_type: str
    cache_key: str
    cache_hit: bool


def build_tts_cache_key(
    normalized_text: str,
    voice: str,
    language: SupportedLanguage,
    speed: float,
    audio_format: TtsFormat,
) -> str:
    """Compute sha256(text + voice + language + speed + format) cache key."""
    raw = f"{normalized_text}|{voice}|{language}|{speed:.2f}|{audio_format}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _audio_config(audio_format: TtsFormat) -> dict[str, Any]:
    if audio_format == "mp3":
        return {
            "sample_rate": 48_000,
            "num_channels": 1,
            "container": "mp3",
            "bitrate": "128k",
        }
    return {
        "sample_rate": 16_000,
        "num_channels": 1,
        "sample_width": 2,
        "encoding": "linear_pcm",
        "container": "wav",
    }


def _content_type(audio_format: TtsFormat) -> str:
    return "audio/mpeg" if audio_format == "mp3" else "audio/wav"


class GnaniTtsClient:
    """Timbre v3.0 REST TTS client with on-disk phrase caching and 429 retries."""

    def __init__(
        self,
        settings: VoiceSettings | None = None,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        max_retries: int = 3,
        backoff_base_s: float = 0.4,
    ) -> None:
        self._settings = settings or load_voice_settings()
        self._transport = transport
        self._max_retries = max_retries
        self._backoff_base_s = backoff_base_s

    def resolve_voice(
        self, voice: str | None, audience: TtsAudience = "worker"
    ) -> str:
        if voice and voice.strip():
            return voice.strip()
        if audience == "contractor":
            return self._settings.gnani_tts_contractor_voice
        return self._settings.gnani_tts_worker_voice

    async def synthesize_with_meta(
        self,
        text: str,
        lang: str,
        *,
        voice: str | None = None,
        audience: TtsAudience = "worker",
        speed: float | None = None,
        audio_format: TtsFormat | None = None,
    ) -> TtsSynthesisResult:
        """Normalize text, check disk cache, or call Gnani TTS REST with 429 back-off."""
        norm_lang = normalize_language(lang)
        norm_text = normalise_for_tts(text, norm_lang)
        if not norm_text:
            raise VoiceError(ErrorCode.TTS_FAILED, "Cannot synthesize empty text.", status_code=400)

        selected_voice = self.resolve_voice(voice, audience)
        selected_speed = speed if speed is not None else self._settings.gnani_tts_speed
        selected_fmt: TtsFormat = audio_format or self._settings.gnani_tts_format
        cache_key = build_tts_cache_key(
            norm_text, selected_voice, norm_lang, selected_speed, selected_fmt
        )

        cache_dir = Path(self._settings.tts_cache_dir)
        cache_path = cache_dir / f"{cache_key}.{selected_fmt}"
        if cache_path.is_file():
            return TtsSynthesisResult(
                audio_bytes=cache_path.read_bytes(),
                content_type=_content_type(selected_fmt),
                cache_key=cache_key,
                cache_hit=True,
            )

        if not self._settings.gnani_api_key:
            raise VoiceError(
                ErrorCode.TTS_FAILED,
                "TTS service is not configured (missing API key).",
                status_code=503,
            )

        payload = {
            "text": norm_text,
            "voice": selected_voice,
            "model": self._settings.gnani_tts_model,
            "language": norm_lang,
            "speed": selected_speed,
            "audio_config": _audio_config(selected_fmt),
        }

        audio_bytes = await self._request_with_backoff(payload)
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(audio_bytes)
        return TtsSynthesisResult(
            audio_bytes=audio_bytes,
            content_type=_content_type(selected_fmt),
            cache_key=cache_key,
            cache_hit=False,
        )

    async def synthesize(
        self,
        text: str,
        lang: str,
        voice: str | None = None,
        *,
        audience: TtsAudience = "worker",
    ) -> bytes:
        result = await self.synthesize_with_meta(
            text, lang, voice=voice, audience=audience
        )
        return result.audio_bytes

    async def _request_with_backoff(self, payload: dict[str, Any]) -> bytes:
        async with httpx.AsyncClient(
            transport=self._transport, timeout=self._settings.tts_timeout_s
        ) as client:
            for attempt in range(self._max_retries + 1):
                try:
                    resp = await client.post(
                        self._settings.gnani_tts_rest_url,
                        headers={
                            "X-API-Key-ID": self._settings.gnani_api_key,
                            "Content-Type": "application/json",
                        },
                        json=payload,
                    )
                except httpx.HTTPError as exc:
                    raise VoiceError(
                        ErrorCode.TTS_FAILED,
                        "TTS request failed due to network error.",
                        status_code=502,
                    ) from exc

                if resp.status_code == 200 and resp.content:
                    return resp.content

                if resp.status_code == 429:
                    if attempt < self._max_retries:
                        await asyncio.sleep(self._backoff_base_s * (2**attempt))
                        continue
                    raise VoiceError(
                        ErrorCode.RATE_LIMITED,
                        "TTS service rate limit reached. Please try again shortly.",
                        status_code=429,
                    )

                raise VoiceError(
                    ErrorCode.TTS_FAILED,
                    f"TTS synthesis failed with status {resp.status_code}.",
                    status_code=502,
                )

        raise VoiceError(
            ErrorCode.TTS_FAILED, "TTS synthesis failed.", status_code=502
        )

