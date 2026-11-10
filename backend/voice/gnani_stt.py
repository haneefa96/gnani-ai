"""Gnani Realtime STT WebSocket client (raw websockets for VAD header control)."""

from __future__ import annotations

import asyncio
import inspect
import json
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import websockets

from .config import HeaderStyle, VadPreset, VoiceSettings, load_voice_settings
from .errors import ErrorCode, VoiceError
from .models import SupportedLanguage, VadMode, normalize_language

PCM_SAMPLE_RATE = 16_000
PCM_SAMPLE_WIDTH = 2
FRAME_SAMPLES = 512
FRAME_BYTES = FRAME_SAMPLES * PCM_SAMPLE_WIDTH  # 1,024 bytes
FRAME_INTERVAL_S = 0.032  # 32 ms real-time cadence
TRAILING_SILENCE_FRAMES = 25  # 800 ms zero PCM so VAD flushes last utterance
POST_END_FLUSH_S = 1.5  # Settle window after trailing silence once >=1 segment arrived


@dataclass(frozen=True)
class SttTranscriptEvent:
    """Transcript segment forwarded from Gnani to browser clients."""

    text: str
    detected_language_code: str
    segment_index: int
    latency_ms: int


def _language_hint_header(lang: SupportedLanguage) -> str:
    # Live smoke test showed comma-separated "hi-IN,en-IN" closes WS ~1.4s in;
    # single-code "hi-IN" connects cleanly and transcribes embedded English words.
    return lang


def _apply_vad_headers(headers: dict[str, str], preset: VadPreset) -> None:
    headers["x-min-silence-ms"] = str(preset.min_silence_ms)
    if preset.vad_threshold is not None:
        headers["x-vad-threshold"] = str(preset.vad_threshold)
    if preset.min_speech_ms is not None:
        headers["x-min-speech-ms"] = str(preset.min_speech_ms)
    if preset.min_segment_ms is not None:
        headers["x-min-segment-ms"] = str(preset.min_segment_ms)
    if preset.max_speech_s is not None:
        headers["x-max-speech-s"] = str(preset.max_speech_s)


def build_stt_headers(
    settings: VoiceSettings,
    lang: str,
    mode: VadMode,
    *,
    keyterms: list[str] | None = None,
    header_style: HeaderStyle | None = None,
) -> dict[str, str]:
    """Build Gnani STT WebSocket upgrade headers in a single configurable place."""
    norm_lang = normalize_language(lang)
    style = header_style or settings.gnani_header_style
    lang_hint = _language_hint_header(norm_lang)
    preset = settings.vad_narration if mode == "narration" else settings.vad_confirm

    if style == "new":
        headers: dict[str, str] = {
            "x-api-key-id": settings.gnani_api_key,
            "model": settings.gnani_stt_model,
            "language_code": lang_hint,
            "format": "transcribe",
            "x-sample-rate": str(PCM_SAMPLE_RATE),
        }
        keyterms_header = "keyterms"
    else:
        headers = {
            "x-api-key-id": settings.gnani_api_key,
            "x-model": settings.gnani_stt_model,
            "lang_code": lang_hint,
            "x-format": "transcribe",
            "x-sample-rate": str(PCM_SAMPLE_RATE),
        }
        keyterms_header = "x-keyterms"

    _apply_vad_headers(headers, preset)

    if settings.keyterms_enabled and keyterms:
        cleaned = [term.strip() for term in keyterms if term and term.strip()][:200]
        if cleaned:
            headers[keyterms_header] = json.dumps(cleaned, ensure_ascii=True)

    return headers


def resolve_detected_language(
    raw_detected: str | None, profile_lang: SupportedLanguage
) -> SupportedLanguage:
    """Resolve detected_language_code, falling back to profile_lang when missing or Devanagari-ambiguous."""
    if not raw_detected:
        return profile_lang
    cleaned = raw_detected.strip()
    if cleaned in {"hi-IN", "kn-IN", "bn-IN", "en-IN"}:
        return cleaned  # type: ignore[return-value]
    # Marathi shares Devanagari with Hindi; short Hindi utterances can be mis-tagged as mr-IN.
    if cleaned == "mr-IN" and profile_lang == "hi-IN":
        return "hi-IN"
    return profile_lang


def _ws_connect_kwargs(headers: dict[str, str]) -> dict[str, Any]:
    params = inspect.signature(websockets.connect).parameters
    if "additional_headers" in params:
        return {"additional_headers": headers}
    return {"extra_headers": headers}


def _extract_status_and_error(exc: Exception) -> tuple[int | None, str | None]:
    response = getattr(exc, "response", None)
    status_code = getattr(response, "status_code", None) or getattr(exc, "status_code", None)
    raw_body = getattr(response, "body", b"")
    if isinstance(raw_body, bytes) and raw_body:
        try:
            parsed = json.loads(raw_body.decode("utf-8", errors="ignore"))
            detail = parsed.get("detail") if isinstance(parsed, dict) else None
            if isinstance(detail, dict):
                return status_code, str(detail.get("error_code") or detail.get("code") or "")
        except json.JSONDecodeError:
            pass
    return status_code, None


class GnaniSttClient:
    """Streaming Gnani STT client with 1,024-byte / 32 ms pacing and 429 exponential back-off."""

    def __init__(
        self,
        settings: VoiceSettings | None = None,
        *,
        max_retries: int = 3,
        backoff_base_s: float = 0.4,
        frame_interval_s: float = FRAME_INTERVAL_S,
        trailing_silence_frames: int = TRAILING_SILENCE_FRAMES,
        post_end_flush_s: float = POST_END_FLUSH_S,
    ) -> None:
        self._settings = settings or load_voice_settings()
        self._max_retries = max_retries
        self._backoff_base_s = backoff_base_s
        self._frame_interval_s = frame_interval_s
        self._trailing_silence_frames = trailing_silence_frames
        self._post_end_flush_s = post_end_flush_s

    async def connect_with_backoff(
        self,
        lang: str,
        mode: VadMode,
        *,
        keyterms: list[str] | None = None,
        header_style: HeaderStyle | None = None,
    ) -> Any:
        """Open upstream Gnani WebSocket, retrying HTTP 429 RATE_LIMITED with exponential back-off."""
        if not self._settings.gnani_api_key:
            raise VoiceError(
                ErrorCode.STT_CONNECTION_LOST,
                "STT service is not configured (missing API key).",
                status_code=503,
            )

        headers = build_stt_headers(
            self._settings,
            lang,
            mode,
            keyterms=keyterms,
            header_style=header_style,
        )

        last_exc: Exception | None = None
        for attempt in range(self._max_retries + 1):
            try:
                return await websockets.connect(
                    self._settings.gnani_stt_wss_url,
                    **_ws_connect_kwargs(headers),
                    open_timeout=self._settings.stt_timeout_s,
                    close_timeout=5.0,
                )
            except TimeoutError as exc:
                raise VoiceError(
                    ErrorCode.STT_TIMEOUT,
                    "Timed out connecting to STT service.",
                    status_code=504,
                ) from exc
            except Exception as exc:
                last_exc = exc
                status_code, err_code = _extract_status_and_error(exc)
                is_rate_limit = status_code == 429 or err_code == "RATE_LIMITED"
                if is_rate_limit and attempt < self._max_retries:
                    await asyncio.sleep(self._backoff_base_s * (2**attempt))
                    continue
                if is_rate_limit:
                    raise VoiceError(
                        ErrorCode.RATE_LIMITED,
                        "Voice service is busy. Please try again in a moment.",
                        status_code=429,
                    ) from exc
                raise VoiceError(
                    ErrorCode.STT_CONNECTION_LOST,
                    "Unable to connect to STT service.",
                    status_code=502,
                ) from exc

        raise VoiceError(
            ErrorCode.STT_CONNECTION_LOST,
            "Unable to connect to STT service.",
            status_code=502,
        ) from last_exc

    async def transcribe_pcm_stream(
        self,
        pcm_chunks: AsyncIterator[bytes],
        lang: str,
        mode: VadMode = "narration",
        *,
        keyterms: list[str] | None = None,
        header_style: HeaderStyle | None = None,
    ) -> AsyncIterator[SttTranscriptEvent]:
        """Pace incoming PCM16 audio in 1,024-byte / 32 ms frames and yield transcript events."""
        profile_lang = normalize_language(lang)
        ws = await self.connect_with_backoff(
            profile_lang,
            mode,
            keyterms=keyterms,
            header_style=header_style,
        )
        out_queue: asyncio.Queue[SttTranscriptEvent | Exception | None] = asyncio.Queue()
        stream_state = {"last_audio_at": time.monotonic(), "segment_counter": 0}
        last_event_state: dict[str, float] = {"at": 0.0}

        async def _send_frame(frame: bytes) -> None:
            try:
                await asyncio.wait_for(ws.send(frame), timeout=self._settings.stt_timeout_s)
            except TimeoutError as exc:
                raise VoiceError(
                    ErrorCode.STT_TIMEOUT,
                    "Timed out sending audio to STT service.",
                    status_code=504,
                ) from exc

        async def _sender() -> None:
            buf = bytearray()
            next_deadline = time.monotonic()
            try:
                async for chunk in pcm_chunks:
                    if not chunk:
                        continue
                    buf.extend(chunk)
                    while len(buf) >= FRAME_BYTES:
                        frame = bytes(buf[:FRAME_BYTES])
                        del buf[:FRAME_BYTES]
                        delay = next_deadline - time.monotonic()
                        if delay > 0:
                            await asyncio.sleep(delay)
                        await _send_frame(frame)
                        stream_state["last_audio_at"] = time.monotonic()
                        next_deadline = max(next_deadline + self._frame_interval_s, time.monotonic())

                if buf:
                    padded = bytes(buf) + b"\x00" * (FRAME_BYTES - len(buf))
                    delay = next_deadline - time.monotonic()
                    if delay > 0:
                        await asyncio.sleep(delay)
                    await _send_frame(padded)
                    stream_state["last_audio_at"] = time.monotonic()
                    next_deadline = max(next_deadline + self._frame_interval_s, time.monotonic())

                silence = b"\x00" * FRAME_BYTES
                for _ in range(self._trailing_silence_frames):
                    delay = next_deadline - time.monotonic()
                    if delay > 0:
                        await asyncio.sleep(delay)
                    await _send_frame(silence)
                    next_deadline = max(next_deadline + self._frame_interval_s, time.monotonic())
            except asyncio.CancelledError:
                return
            except websockets.ConnectionClosed:
                return
            except VoiceError as err:
                await out_queue.put(err)
                return
            except Exception:
                await out_queue.put(
                    VoiceError(
                        ErrorCode.STT_CONNECTION_LOST,
                        "STT audio upload interrupted.",
                        status_code=502,
                    )
                )
                return

        async def _receiver() -> None:
            try:
                async for raw_msg in ws:
                    if isinstance(raw_msg, bytes):
                        continue
                    try:
                        payload = json.loads(raw_msg)
                    except json.JSONDecodeError:
                        continue
                    if not isinstance(payload, dict):
                        continue

                    if payload.get("type") == "error" or payload.get("error_code"):
                        raw_code = str(
                            payload.get("error_code") or payload.get("code") or ""
                        ).upper()
                        mapped = (
                            ErrorCode.RATE_LIMITED
                            if raw_code == "RATE_LIMITED"
                            else ErrorCode.STT_CONNECTION_LOST
                        )
                        await out_queue.put(
                            VoiceError(
                                mapped,
                                "Speech recognition failed. Please try again.",
                                status_code=429 if mapped == ErrorCode.RATE_LIMITED else 502,
                            )
                        )
                        return

                    text = ""
                    for key in ("transcript", "text", "result"):
                        val = payload.get(key)
                        if isinstance(val, str):
                            text = val.strip()
                            break
                    if not text:
                        continue

                    last_event_state["at"] = time.monotonic()
                    if payload.get("is_final") is False:
                        continue

                    stream_state["segment_counter"] += 1
                    seg_idx = payload.get("segment_index")
                    if not isinstance(seg_idx, int):
                        seg_idx = stream_state["segment_counter"]

                    detected = resolve_detected_language(
                        payload.get("detected_language_code"), profile_lang
                    )
                    latency_ms = max(
                        0, int((time.monotonic() - stream_state["last_audio_at"]) * 1000)
                    )
                    await out_queue.put(
                        SttTranscriptEvent(
                            text=text,
                            detected_language_code=detected,
                            segment_index=seg_idx,
                            latency_ms=latency_ms,
                        )
                    )
            except websockets.ConnectionClosed as exc:
                if exc.code not in (1000, 1001):
                    await out_queue.put(
                        VoiceError(
                            ErrorCode.STT_CONNECTION_LOST,
                            "STT connection closed unexpectedly.",
                            status_code=502,
                        )
                    )
            finally:
                await out_queue.put(None)

        sender_task = asyncio.create_task(_sender())
        receiver_task = asyncio.create_task(_receiver())
        sender_done_at: float | None = None
        flush_window = min(self._post_end_flush_s, self._settings.stt_timeout_s)
        try:
            # Wait for sender to complete, then wait boundedly for trailing VAD flush.
            while True:
                if sender_task.done() and sender_done_at is None:
                    sender_done_at = time.monotonic()

                if sender_done_at is not None and out_queue.empty():
                    if stream_state["segment_counter"] > 0:
                        # Persistent STT sockets stay open after delivering segments; settle
                        # briefly after trailing silence/latest event, then close upstream cleanly.
                        anchor = max(sender_done_at, last_event_state["at"])
                        remaining = flush_window - (time.monotonic() - anchor)
                        if remaining <= 0:
                            break
                        wait_timeout = remaining
                    else:
                        remaining = self._settings.stt_timeout_s - (time.monotonic() - sender_done_at)
                        if remaining <= 0:
                            raise VoiceError(
                                ErrorCode.STT_TIMEOUT,
                                "Timed out waiting for STT response.",
                                status_code=504,
                            )
                        wait_timeout = remaining
                else:
                    wait_timeout = min(0.2, self._settings.stt_timeout_s)

                try:
                    item = await asyncio.wait_for(out_queue.get(), timeout=wait_timeout)
                except TimeoutError as exc:
                    if sender_task.done() and sender_done_at is not None:
                        now = time.monotonic()
                        if stream_state["segment_counter"] > 0:
                            anchor = max(sender_done_at, last_event_state["at"])
                            if (now - anchor) >= flush_window:
                                break
                        elif (now - sender_done_at) >= self._settings.stt_timeout_s:
                            raise VoiceError(
                                ErrorCode.STT_TIMEOUT,
                                "Timed out waiting for STT response.",
                                status_code=504,
                            ) from exc
                    continue

                if item is None:
                    break
                if isinstance(item, Exception):
                    raise item
                yield item
        finally:
            if not sender_task.done():
                sender_task.cancel()
            try:
                await ws.close()
            except Exception:
                pass
            if not receiver_task.done():
                try:
                    await asyncio.wait_for(receiver_task, timeout=2.0)
                except (TimeoutError, asyncio.CancelledError):
                    receiver_task.cancel()

