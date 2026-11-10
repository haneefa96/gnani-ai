"""Manual Day-1 integration smoke test for Gnani STT and TTS APIs.

Privacy & safety rules:
- Reads GNANI_API_KEY from .env / environment variables.
- NEVER prints or logs API keys, raw transcripts, or file paths.
- Run manually only when testing live Gnani credentials (never in pytest/CI).
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import inspect
import io
import json
import logging
import os
import struct
import subprocess
import sys
import time
import wave
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import websockets
from dotenv import load_dotenv

# Silence third-party HTTP/WS loggers so URLs, headers, and keys are never emitted.
for _logger_name in ("httpx", "httpcore", "websockets"):
    logging.getLogger(_logger_name).setLevel(logging.CRITICAL)

TARGET_SAMPLE_RATE = 16_000
TARGET_CHANNELS = 1
TARGET_SAMPLE_WIDTH = 2  # PCM16 (2 bytes/sample)
FRAME_SAMPLES = 512
FRAME_BYTES = FRAME_SAMPLES * TARGET_SAMPLE_WIDTH  # 1,024 bytes
FRAME_INTERVAL_S = 0.032  # 32 ms per frame
TRAILING_SILENCE_FRAMES = 28  # ~896 ms silence so VAD flushes the last segment

ALLOWED_LANGS = ("hi-IN", "kn-IN", "bn-IN", "en-IN")

TTS_TEST_SENTENCES: dict[str, str] = {
    "hi-IN": "आज बसवनगुडी साइट पर आठ घंटे काम किया, सुरेश भैया ने सात सौ रुपये बोला, तीन सौ रुपये दिए।",
    "kn-IN": "ಇಂದು ಬಸವನಗುಡಿ ಸೈಟ್ ನಲ್ಲಿ ಎಂಟು ಗಂಟೆ ಕೆಲಸ ಮಾಡಿದ್ದೇನೆ, ಸುರೇಶ್ ಅವರು ಏಳು ನೂರು ರೂಪಾಯಿ ಹೇಳಿದರು, ಮುನ್ನೂರು ರೂಪಾಯಿ ಕೊಟ್ಟರು.",
}


@dataclass
class SmokeRow:
    case: str
    status: str
    http_or_ws_code: str
    latency_ms: int | None
    detected_language: str
    audio_s: float | None
    segments: int | None
    has_digits: bool | None
    script: str
    char_len: int | None
    notes: str = ""
    transcript: str | None = None


@dataclass
class SmokeReport:
    rows: list[SmokeRow] = field(default_factory=list)
    header_precedence_note: str = "Not evaluated"
    rest_duration_note: str = "Not evaluated (provide --long-audio > 30s)"
    rate_limit_note: str = "No 429 / concurrency errors observed"
    vad_defaults_note: str = "Not observed"
    show_transcript: bool = False


def _load_env_and_key() -> tuple[str, dict[str, str]]:
    """Load backend/voice/.env and root .env without overriding shell env vars."""
    repo_root = Path(__file__).resolve().parents[3]
    for candidate in (repo_root / "backend" / "voice" / ".env", repo_root / ".env"):
        if candidate.is_file():
            load_dotenv(dotenv_path=candidate, override=False)

    api_key = os.environ.get("GNANI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "GNANI_API_KEY is missing. Set it in backend/voice/.env or the environment."
        )

    urls = {
        "stt_rest": os.environ.get("GNANI_STT_REST_URL", "https://api.vachana.ai/stt/v3"),
        "stt_wss": os.environ.get("GNANI_STT_WSS_URL", "wss://api.vachana.ai/stt/v3/stream"),
        "tts_rest": os.environ.get(
            "GNANI_TTS_REST_URL", "https://api.vachana.ai/api/v1/tts/inference"
        ),
        "tts_wss": os.environ.get("GNANI_TTS_WSS_URL", "wss://api.vachana.ai/api/v1/tts"),
    }
    return api_key, urls


def _decode_samples(raw: bytes, sampwidth: int, channels: int) -> list[int]:
    """Decode signed/unsigned PCM samples and downmix channels to mono int16 range."""
    if sampwidth == 1:
        total_samples = len(raw)
        vals = [b - 128 for b in raw]
        scale = 256
    elif sampwidth == 2:
        total_samples = len(raw) // 2
        vals = list(struct.unpack(f"<{total_samples}h", raw[: total_samples * 2]))
        scale = 1
    elif sampwidth == 3:
        total_samples = len(raw) // 3
        vals = []
        for idx in range(0, total_samples * 3, 3):
            b0, b1, b2 = raw[idx], raw[idx + 1], raw[idx + 2]
            signed = b0 | (b1 << 8) | (b2 << 16)
            if signed & 0x800000:
                signed -= 0x1000000
            vals.append(signed >> 8)
        scale = 1
    elif sampwidth == 4:
        total_samples = len(raw) // 4
        vals = [v >> 16 for v in struct.unpack(f"<{total_samples}i", raw[: total_samples * 4])]
        scale = 1
    else:
        raise ValueError(f"Unsupported WAV sample width: {sampwidth} bytes")

    if scale != 1:
        vals = [v * scale for v in vals]

    if channels == 1:
        return vals

    mono: list[int] = []
    for i in range(0, len(vals) - channels + 1, channels):
        mono.append(sum(vals[i : i + channels]) // channels)
    return mono


def _resample_linear(samples: list[int], src_rate: int, dst_rate: int) -> list[int]:
    """Linearly resample mono int16 samples from src_rate to dst_rate."""
    if src_rate == dst_rate or not samples:
        return samples
    out_len = max(1, int(round(len(samples) * dst_rate / src_rate)))
    ratio = src_rate / dst_rate
    last = len(samples) - 1
    result: list[int] = []
    for i in range(out_len):
        pos = i * ratio
        idx = int(pos)
        frac = pos - idx
        s0 = samples[idx]
        s1 = samples[min(idx + 1, last)]
        val = int(round(s0 + (s1 - s0) * frac))
        result.append(max(-32768, min(32767, val)))
    return result


def wav_bytes_to_pcm16_16k(wav_bytes: bytes) -> bytes:
    """Convert WAV bytes of any PCM bit-depth/rate/channels into 16 kHz mono PCM16."""
    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        raw = wf.readframes(wf.getnframes())

    if (
        channels == TARGET_CHANNELS
        and sampwidth == TARGET_SAMPLE_WIDTH
        and framerate == TARGET_SAMPLE_RATE
    ):
        return raw

    mono = _decode_samples(raw, sampwidth, channels)
    resampled = _resample_linear(mono, framerate, TARGET_SAMPLE_RATE)
    return struct.pack(f"<{len(resampled)}h", *resampled)


def pcm16_to_wav_bytes(pcm: bytes, sample_rate: int = TARGET_SAMPLE_RATE) -> bytes:
    """Wrap raw 16-bit mono PCM bytes into a valid RIFF/WAV container."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(TARGET_CHANNELS)
        wf.setsampwidth(TARGET_SAMPLE_WIDTH)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm)
    return buf.getvalue()


def inspect_wav_bytes(wav_bytes: bytes) -> tuple[int, int, int, float]:
    """Return (sample_rate, channels, sampwidth, duration_s) from WAV bytes."""
    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        rate = wf.getframerate()
        channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        raw_frames = wf.readframes(wf.getnframes())
    bytes_per_sec = rate * channels * sampwidth
    duration_s = (len(raw_frames) / bytes_per_sec) if bytes_per_sec else 0.0
    return rate, channels, sampwidth, duration_s


def load_audio_file_as_pcm16_16k(path_str: str, *, flag_name: str = "--audio") -> bytes:
    """Read audio file bytes without echoing the path; transcode non-WAV via ffmpeg."""
    path = Path(path_str)
    if not path.is_file():
        raise FileNotFoundError(
            f"Input file for {flag_name} was not found (omit {flag_name} or create the clip first)."
        )

    raw = path.read_bytes()
    if raw[:4] == b"RIFF" and raw[8:12] == b"WAVE":
        return wav_bytes_to_pcm16_16k(raw)

    try:
        proc = subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-i",
                "pipe:0",
                "-f",
                "wav",
                "-acodec",
                "pcm_s16le",
                "-ac",
                "1",
                "-ar",
                str(TARGET_SAMPLE_RATE),
                "pipe:1",
            ],
            input=raw,
            capture_output=True,
            check=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            "Input audio is not a WAV file and ffmpeg is not installed."
        ) from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError("ffmpeg failed to decode the input audio stream.") from exc

    return wav_bytes_to_pcm16_16k(proc.stdout)


def slice_pcm16(pcm: bytes, max_seconds: float) -> bytes:
    """Truncate 16 kHz mono PCM16 audio to at most max_seconds."""
    max_bytes = int(max_seconds * TARGET_SAMPLE_RATE) * TARGET_SAMPLE_WIDTH
    max_bytes -= max_bytes % TARGET_SAMPLE_WIDTH
    return pcm[:max_bytes]


def pcm_duration_s(pcm: bytes) -> float:
    return len(pcm) / (TARGET_SAMPLE_RATE * TARGET_SAMPLE_WIDTH)


def analyze_transcript_privately(text: str) -> dict[str, Any]:
    """Compute safe, non-PII properties of transcript text without exposing content."""
    stripped = text.strip()
    if not stripped:
        return {"char_len": 0, "has_digits": False, "script": "empty"}

    counts = {"devanagari": 0, "kannada": 0, "bengali": 0, "latin": 0}
    has_digits = False
    for ch in stripped:
        cp = ord(ch)
        if "0" <= ch <= "9":
            has_digits = True
        elif 0x0900 <= cp <= 0x097F:
            counts["devanagari"] += 1
        elif 0x0C80 <= cp <= 0x0CFF:
            counts["kannada"] += 1
        elif 0x0980 <= cp <= 0x09FF:
            counts["bengali"] += 1
        elif ("a" <= ch <= "z") or ("A" <= ch <= "Z"):
            counts["latin"] += 1

    active = [name for name, n in counts.items() if n > 0]
    if not active:
        script = "digits_or_punct" if has_digits else "other"
    elif len(active) == 1:
        script = active[0]
    else:
        script = "mixed(" + "+".join(sorted(active)) + ")"

    return {"char_len": len(stripped), "has_digits": has_digits, "script": script}


def _extract_transcript_from_payload(payload: dict[str, Any]) -> str:
    """Handle common transcript key variations returned by Gnani STT payloads."""
    for key in ("transcript", "text", "result"):
        val = payload.get(key)
        if isinstance(val, str):
            return val
    data = payload.get("data")
    if isinstance(data, dict):
        return _extract_transcript_from_payload(data)
    return ""


def _parse_error_payload(body_text: str) -> str:
    """Extract error_code / generic message without leaking user content."""
    try:
        parsed = json.loads(body_text)
    except json.JSONDecodeError:
        return "non_json_error"

    detail = parsed.get("detail") if isinstance(parsed, dict) else None
    if isinstance(detail, dict):
        code = detail.get("error_code") or detail.get("code") or "ERR"
        return str(code)
    if isinstance(parsed, dict):
        code = parsed.get("error_code") or parsed.get("code") or parsed.get("error")
        if code:
            return str(code)
    return "error_payload"


def _error_row(
    case_name: str,
    *,
    status: str,
    code: str,
    latency_ms: int,
    notes: str,
    language: str = "-",
    audio_s: float | None = None,
    segments: int | None = None,
) -> SmokeRow:
    return SmokeRow(
        case=case_name,
        status=status,
        http_or_ws_code=code,
        latency_ms=latency_ms,
        detected_language=language,
        audio_s=round(audio_s, 2) if audio_s is not None else None,
        segments=segments,
        has_digits=None,
        script="-",
        char_len=None,
        notes=notes,
    )


async def run_rest_stt(
    client: httpx.AsyncClient,
    url: str,
    api_key: str,
    wav_bytes: bytes,
    language_code: str,
    case_name: str,
    *,
    show_transcript: bool = False,
) -> SmokeRow:
    """Test Gnani REST STT (POST /stt/v3) on a WAV payload."""
    _, _, _, audio_s = inspect_wav_bytes(wav_bytes)
    t0 = time.monotonic()
    try:
        resp = await client.post(
            url,
            headers={"X-API-Key-ID": api_key},
            files={"audio_file": ("audio.wav", wav_bytes, "audio/wav")},
            data={
                "model": "prisma-v3.0",
                "language_code": language_code,
                "format": "transcribe",
            },
            timeout=90.0,
        )
    except httpx.HTTPError as exc:
        return _error_row(
            case_name,
            status="ERROR",
            code=type(exc).__name__,
            latency_ms=int((time.monotonic() - t0) * 1000),
            notes="HTTP transport error",
            audio_s=audio_s,
        )

    latency_ms = int((time.monotonic() - t0) * 1000)
    if resp.status_code != 200:
        err_code = _parse_error_payload(resp.text)
        return _error_row(
            case_name,
            status="RATE_LIMITED" if resp.status_code == 429 else "FAIL",
            code=str(resp.status_code),
            latency_ms=latency_ms,
            notes=f"err={err_code}",
            audio_s=audio_s,
            segments=0,
        )

    try:
        payload = resp.json()
    except ValueError:
        return _error_row(
            case_name,
            status="FAIL",
            code=str(resp.status_code),
            latency_ms=latency_ms,
            notes="Invalid JSON response",
            audio_s=audio_s,
            segments=0,
        )
    if not isinstance(payload, dict):
        payload = {}

    transcript = _extract_transcript_from_payload(payload)
    metrics = analyze_transcript_privately(transcript)
    detected = str(payload.get("detected_language_code") or "-")
    keys = ",".join(sorted(str(k) for k in payload.keys()))
    extra = []
    if "processing_time" in payload:
        extra.append(f"proc_s={payload['processing_time']}")
    if "end_to_end_latency" in payload:
        extra.append(f"e2e_s={payload['end_to_end_latency']}")
    extra.append(f"keys=[{keys}]")
    return SmokeRow(
        case=case_name,
        status="OK",
        http_or_ws_code="200",
        latency_ms=latency_ms,
        detected_language=detected,
        audio_s=round(audio_s, 2),
        segments=1 if metrics["char_len"] else 0,
        has_digits=metrics["has_digits"],
        script=metrics["script"],
        char_len=metrics["char_len"],
        notes="; ".join(extra),
        transcript=transcript if show_transcript else None,
    )


def _ws_connect_kwargs(headers: dict[str, str]) -> dict[str, Any]:
    """Support both websockets>=13 (additional_headers) and older (extra_headers)."""
    params = inspect.signature(websockets.connect).parameters
    if "additional_headers" in params:
        return {"additional_headers": headers}
    return {"extra_headers": headers}


async def run_ws_stt(
    wss_url: str,
    api_key: str,
    pcm16: bytes,
    extra_headers: dict[str, str],
    case_name: str,
    *,
    show_transcript: bool = False,
) -> tuple[SmokeRow, dict[str, Any]]:
    """Stream raw 16 kHz mono PCM16 as exact 1,024-byte frames every 32 ms."""
    audio_s = pcm_duration_s(pcm16)
    headers = {
        "x-api-key-id": api_key,
        "x-sample-rate": str(TARGET_SAMPLE_RATE),
        **extra_headers,
    }

    # Pad final speech frame to 1,024 bytes; append trailing silence for VAD endpointing.
    remainder = len(pcm16) % FRAME_BYTES
    padded_speech = pcm16 + (b"\x00" * (FRAME_BYTES - remainder) if remainder else b"")
    speech_frames = [
        padded_speech[i : i + FRAME_BYTES] for i in range(0, len(padded_speech), FRAME_BYTES)
    ]
    silence_frame = b"\x00" * FRAME_BYTES
    all_frames = speech_frames + [silence_frame] * TRAILING_SILENCE_FRAMES

    segments: list[str] = []
    detected_langs: list[str] = []
    msg_keys: set[str] = set()
    vad_endpoint_ms: int | None = None
    last_speech_sent_at: float | None = None
    err_notes: list[str] = []

    t_start = time.monotonic()
    try:
        async with websockets.connect(
            wss_url,
            **_ws_connect_kwargs(headers),
            open_timeout=20,
            close_timeout=5,
        ) as ws:
            async def _receiver() -> None:
                nonlocal vad_endpoint_ms
                try:
                    async for raw_msg in ws:
                        if isinstance(raw_msg, bytes):
                            continue
                        try:
                            data = json.loads(raw_msg)
                        except json.JSONDecodeError:
                            continue
                        if not isinstance(data, dict):
                            continue
                        msg_keys.update(str(k) for k in data.keys())
                        if data.get("type") == "error" or data.get("error_code"):
                            err_notes.append(str(data.get("error_code") or data.get("code") or "ws_error"))
                            continue
                        text = _extract_transcript_from_payload(data)
                        if text:
                            segments.append(text)
                            if last_speech_sent_at is not None:
                                vad_endpoint_ms = int((time.monotonic() - last_speech_sent_at) * 1000)
                        det = data.get("detected_language_code")
                        if isinstance(det, str) and det:
                            detected_langs.append(det)
                except websockets.ConnectionClosed:
                    return

            recv_task = asyncio.create_task(_receiver())
            stream_t0 = time.monotonic()
            for idx, frame in enumerate(all_frames):
                target_t = stream_t0 + idx * FRAME_INTERVAL_S
                delay = target_t - time.monotonic()
                if delay > 0:
                    await asyncio.sleep(delay)
                await ws.send(frame)
                if idx == len(speech_frames) - 1:
                    last_speech_sent_at = time.monotonic()

            # Wait briefly for final VAD flush before closing cleanly.
            await asyncio.sleep(1.2)
            await ws.close()
            try:
                await asyncio.wait_for(recv_task, timeout=3.0)
            except asyncio.TimeoutError:
                recv_task.cancel()
    except Exception as exc:
        latency_ms = int((time.monotonic() - t_start) * 1000)
        status_code = getattr(getattr(exc, "response", None), "status_code", None) or getattr(
            exc, "status_code", None
        )
        raw_body = getattr(getattr(exc, "response", None), "body", b"")
        body_str = raw_body.decode("utf-8", errors="ignore") if isinstance(raw_body, bytes) else ""
        err_tag = _parse_error_payload(body_str) if body_str else type(exc).__name__
        row = SmokeRow(
            case=case_name,
            status="RATE_LIMITED" if status_code == 429 else "FAIL",
            http_or_ws_code=str(status_code or type(exc).__name__),
            latency_ms=latency_ms,
            detected_language="-",
            audio_s=round(audio_s, 2),
            segments=0,
            has_digits=None,
            script="-",
            char_len=None,
            notes=f"err={err_tag}",
        )
        return row, {"status_code": status_code, "err_tag": err_tag, "vad_endpoint_ms": None}

    latency_ms = int((time.monotonic() - t_start) * 1000)
    combined = " ".join(segments).strip()
    metrics = analyze_transcript_privately(combined)
    det_label = ",".join(dict.fromkeys(detected_langs)) if detected_langs else "-"
    note_parts = []
    if vad_endpoint_ms is not None:
        note_parts.append(f"vad_flush_ms={vad_endpoint_ms}")
    if msg_keys:
        note_parts.append(f"keys=[{','.join(sorted(msg_keys))}]")
    if err_notes:
        note_parts.append(f"ws_errs={','.join(err_notes)}")

    row = SmokeRow(
        case=case_name,
        status="OK" if not err_notes else "WARN",
        http_or_ws_code="101/OK",
        latency_ms=latency_ms,
        detected_language=det_label,
        audio_s=round(audio_s, 2),
        segments=len(segments),
        has_digits=metrics["has_digits"],
        script=metrics["script"],
        char_len=metrics["char_len"],
        notes="; ".join(note_parts),
        transcript=combined if show_transcript else None,
    )
    return row, {
        "status_code": 101,
        "vad_endpoint_ms": vad_endpoint_ms,
        "has_digits": metrics["has_digits"],
        "script": metrics["script"],
        "detected": det_label,
    }


async def run_tts_rest(
    client: httpx.AsyncClient,
    url: str,
    api_key: str,
    language: str,
    voice: str,
    text: str,
    case_name: str,
) -> tuple[SmokeRow, bytes | None]:
    """Test Gnani REST TTS (timbre-v3.0) and return WAV bytes."""
    payload = {
        "text": text,
        "voice": voice,
        "model": "timbre-v3.0",
        "language": language,
        "speed": 0.9,
        "audio_config": {
            "sample_rate": TARGET_SAMPLE_RATE,
            "num_channels": 1,
            "sample_width": 2,
            "encoding": "linear_pcm",
            "container": "wav",
        },
    }
    t0 = time.monotonic()
    try:
        resp = await client.post(
            url,
            headers={"X-API-Key-ID": api_key, "Content-Type": "application/json"},
            json=payload,
            timeout=45.0,
        )
    except httpx.HTTPError as exc:
        latency_ms = int((time.monotonic() - t0) * 1000)
        return (
            SmokeRow(
                case=case_name,
                status="ERROR",
                http_or_ws_code=type(exc).__name__,
                latency_ms=latency_ms,
                detected_language=language,
                audio_s=None,
                segments=None,
                has_digits=None,
                script="-",
                char_len=None,
                notes="HTTP transport error",
            ),
            None,
        )

    latency_ms = int((time.monotonic() - t0) * 1000)
    if resp.status_code != 200:
        err_code = _parse_error_payload(resp.text)
        return (
            SmokeRow(
                case=case_name,
                status="FAIL",
                http_or_ws_code=str(resp.status_code),
                latency_ms=latency_ms,
                detected_language=language,
                audio_s=None,
                segments=None,
                has_digits=None,
                script="-",
                char_len=None,
                notes=f"err={err_code}",
            ),
            None,
        )

    wav_bytes = resp.content
    try:
        rate, channels, width, dur_s = inspect_wav_bytes(wav_bytes)
        note = f"voice={voice}; wav={rate}Hz/{channels}ch/{width*8}bit; bytes={len(wav_bytes)}"
    except wave.Error:
        dur_s = None
        note = f"non_wav_payload; content_type={resp.headers.get('content-type', '?')}; bytes={len(wav_bytes)}"

    return (
        SmokeRow(
            case=case_name,
            status="OK",
            http_or_ws_code="200",
            latency_ms=latency_ms,
            detected_language=language,
            audio_s=round(dur_s, 2) if dur_s is not None else None,
            segments=None,
            has_digits=None,
            script="-",
            char_len=None,
            notes=note,
        ),
        wav_bytes,
    )


async def run_tts_ws_check(
    wss_url: str,
    api_key: str,
    language: str,
    voice: str,
    text: str,
) -> SmokeRow:
    """Verify WSS TTS endpoint streaming behavior and latency."""
    t0 = time.monotonic()
    total_bytes = 0
    chunks = 0
    try:
        async with websockets.connect(
            wss_url,
            **_ws_connect_kwargs({"X-API-Key-ID": api_key}),
            open_timeout=20,
            close_timeout=5,
        ) as ws:
            await ws.send(
                json.dumps(
                    {
                        "text": text,
                        "voice": voice,
                        "model": "timbre-v3.0",
                        "language": language,
                        "speed": 0.9,
                        "audio_config": {
                            "sample_rate": TARGET_SAMPLE_RATE,
                            "num_channels": 1,
                            "sample_width": 2,
                            "encoding": "linear_pcm",
                            "container": "wav",
                        },
                    }
                )
            )
            async for msg in ws:
                if isinstance(msg, bytes):
                    total_bytes += len(msg)
                    chunks += 1
                    continue
                data = json.loads(msg)
                if isinstance(data, dict):
                    b64 = data.get("audio") or data.get("audio_chunk") or data.get("data")
                    if isinstance(b64, str):
                        total_bytes += len(base64.b64decode(b64))
                        chunks += 1
                    if data.get("is_final") is True:
                        break
    except Exception as exc:
        latency_ms = int((time.monotonic() - t0) * 1000)
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        return SmokeRow(
            case="tts_wss_hi",
            status="FAIL",
            http_or_ws_code=str(status_code or type(exc).__name__),
            latency_ms=latency_ms,
            detected_language=language,
            audio_s=None,
            segments=None,
            has_digits=None,
            script="-",
            char_len=None,
            notes="WSS TTS error",
        )

    latency_ms = int((time.monotonic() - t0) * 1000)
    return SmokeRow(
        case="tts_wss_hi",
        status="OK",
        http_or_ws_code="101/OK",
        latency_ms=latency_ms,
        detected_language=language,
        audio_s=None,
        segments=chunks,
        has_digits=None,
        script="-",
        char_len=None,
        notes=f"voice={voice}; chunks={chunks}; bytes={total_bytes}",
    )


async def probe_ws_concurrency(
    wss_url: str, api_key: str, lang: str
) -> str:
    """Open two simultaneous WS connections briefly to observe concurrent-session caps."""
    headers = {
        "x-api-key-id": api_key,
        "model": "prisma-v3.0",
        "language_code": f"{lang},en-IN",
        "format": "transcribe",
        "x-sample-rate": str(TARGET_SAMPLE_RATE),
    }
    try:
        async with websockets.connect(wss_url, **_ws_connect_kwargs(headers), open_timeout=15):
            try:
                async with websockets.connect(
                    wss_url, **_ws_connect_kwargs(headers), open_timeout=15
                ):
                    return "2+ concurrent WS sessions allowed"
            except Exception as exc2:
                code = getattr(getattr(exc2, "response", None), "status_code", None)
                body = getattr(getattr(exc2, "response", None), "body", b"")
                body_str = body.decode("utf-8", errors="ignore") if isinstance(body, bytes) else ""
                err = _parse_error_payload(body_str) if body_str else type(exc2).__name__
                return f"2nd concurrent WS rejected: HTTP {code} ({err})"
    except Exception as exc1:
        return f"Concurrency probe could not open 1st session ({type(exc1).__name__})"


def _determine_precedence(probe_a: dict[str, Any], probe_b: dict[str, Any]) -> str:
    """Compare symmetric conflicting-header probes on the Hindi numeric TTS clip."""
    a_ok = probe_a.get("status_code") == 101
    b_ok = probe_b.get("status_code") == 101
    if not (a_ok and b_ok):
        return (
            f"Inconclusive (probe A status={probe_a.get('status_code')}, "
            f"probe B status={probe_b.get('status_code')})"
        )

    # Probe A: new(language_code=hi-IN, format=transcribe) vs legacy(lang_code=kn-IN, x-format=verbatim)
    # Probe B: new(language_code=kn-IN, format=verbatim) vs legacy(lang_code=hi-IN, x-format=transcribe)
    a_digits, b_digits = probe_a.get("has_digits"), probe_b.get("has_digits")
    a_det, b_det = str(probe_a.get("detected") or "-"), str(probe_b.get("detected") or "-")
    a_scr, b_scr = str(probe_a.get("script") or "-"), str(probe_b.get("script") or "-")

    new_lang_won = "hi-IN" in a_det and "kn-IN" in b_det
    legacy_lang_won = "kn-IN" in a_det and "hi-IN" in b_det

    if (a_digits is True and b_digits is False) or new_lang_won:
        return (
            f"New spellings (model/language_code/format) won "
            f"(A digits={a_digits} script={a_scr} det={a_det}; "
            f"B digits={b_digits} script={b_scr} det={b_det})"
        )
    if (a_digits is False and b_digits is True) or legacy_lang_won:
        return (
            f"Legacy spellings (x-model/lang_code/x-format) won "
            f"(A digits={a_digits} script={a_scr} det={a_det}; "
            f"B digits={b_digits} script={b_scr} det={b_det})"
        )
    return (
        f"Mixed/ambiguous signal (A digits={a_digits} script={a_scr} det={a_det}; "
        f"B digits={b_digits} script={b_scr} det={b_det})"
    )


def format_markdown_report(report: SmokeReport) -> str:
    lines = [
        "### Smoke Test Results (paste into docs/voice/smoke.md)",
        "",
        "| Case | Status | Code | Latency (ms) | Detected Lang | Audio (s) | Segments | Digits? | Script | Chars | Notes |",
        "| --- | --- | --- | ---: | --- | ---: | ---: | --- | --- | ---: | --- |",
    ]
    for r in report.rows:
        lines.append(
            f"| {r.case} | {r.status} | {r.http_or_ws_code} | "
            f"{r.latency_ms if r.latency_ms is not None else '-'} | "
            f"{r.detected_language} | "
            f"{r.audio_s if r.audio_s is not None else '-'} | "
            f"{r.segments if r.segments is not None else '-'} | "
            f"{r.has_digits if r.has_digits is not None else '-'} | "
            f"{r.script} | "
            f"{r.char_len if r.char_len is not None else '-'} | "
            f"{r.notes} |"
        )

    lines.extend(
        [
            "",
            "#### Observed API Behavior",
            f"- **Header precedence**: {report.header_precedence_note}",
            f"- **REST max-duration (30 s vs 60 s)**: {report.rest_duration_note}",
            f"- **Rate-limit / concurrency**: {report.rate_limit_note}",
            f"- **Observed VAD defaults**: {report.vad_defaults_note}",
        ]
    )

    if report.show_transcript:
        lines.extend(
            [
                "",
                "WARNING: Transcript output enabled - do not use with real worker data.",
                "#### Opt-In STT Transcripts",
            ]
        )
        for r in report.rows:
            if r.transcript is not None:
                lines.append(f"- **{r.case}**: {r.transcript or '(empty)'}")

    return "\n".join(lines)


async def run_suite(args: argparse.Namespace) -> SmokeReport:
    api_key, urls = _load_env_and_key()
    show_transcript = bool(args.show_transcript)
    report = SmokeReport(show_transcript=show_transcript)

    input_pcm = load_audio_file_as_pcm16_16k(args.audio)
    if not input_pcm:
        raise ValueError("Input audio contains 0 PCM samples.")
    input_dur_s = pcm_duration_s(input_pcm)
    short_pcm = slice_pcm16(input_pcm, 15.0)
    short_wav = pcm16_to_wav_bytes(short_pcm)

    long_pcm: bytes | None = None
    if args.long_audio:
        long_pcm = load_audio_file_as_pcm16_16k(args.long_audio, flag_name="--long-audio")
    elif input_dur_s > 30.0:
        long_pcm = input_pcm

    # Live smoke test showed comma-separated "hi-IN,en-IN" closes WS STT early;
    # REST STT accepts single or comma-separated hints, while WS STT needs single code.
    rest_lang_hint = f"{args.lang},en-IN" if args.lang != "en-IN" else "en-IN"
    ws_lang_hint = args.lang

    async with httpx.AsyncClient() as client:
        # (a) REST STT short clip
        rest_short = await run_rest_stt(
            client,
            urls["stt_rest"],
            api_key,
            short_wav,
            rest_lang_hint,
            "rest_stt_short",
            show_transcript=show_transcript,
        )
        report.rows.append(rest_short)

        # (a2) REST STT > 30s clip (30s vs 60s check)
        if long_pcm is not None:
            long_wav = pcm16_to_wav_bytes(long_pcm)
            rest_long = await run_rest_stt(
                client,
                urls["stt_rest"],
                api_key,
                long_wav,
                rest_lang_hint,
                "rest_stt_over_30s",
                show_transcript=show_transcript,
            )
            report.rows.append(rest_long)
            report.rest_duration_note = (
                f"Clip {round(pcm_duration_s(long_pcm), 1)}s -> HTTP {rest_long.http_or_ws_code} ({rest_long.status}, {rest_long.notes})"
            )

        # (b) WS STT: new header names vs legacy header names on short clip
        ws_new, ws_new_meta = await run_ws_stt(
            urls["stt_wss"],
            api_key,
            short_pcm,
            {"model": "prisma-v3.0", "language_code": ws_lang_hint, "format": "transcribe"},
            "ws_stt_new_headers",
            show_transcript=show_transcript,
        )
        report.rows.append(ws_new)
        await asyncio.sleep(0.5)

        ws_legacy, _ = await run_ws_stt(
            urls["stt_wss"],
            api_key,
            short_pcm,
            {"x-model": "prisma-v3.0", "lang_code": ws_lang_hint, "x-format": "transcribe"},
            "ws_stt_legacy_headers",
            show_transcript=show_transcript,
        )
        report.rows.append(ws_legacy)
        await asyncio.sleep(0.5)

        if ws_new_meta.get("vad_endpoint_ms") is not None:
            report.vad_defaults_note = (
                f"Default VAD flush latency after last speech frame: ~{ws_new_meta['vad_endpoint_ms']} ms (no VAD override headers sent)"
            )

        # (c) TTS timbre-v3.0 in hi-IN and kn-IN
        hi_tts_row, hi_tts_wav = await run_tts_rest(
            client,
            urls["tts_rest"],
            api_key,
            "hi-IN",
            args.tts_voice,
            TTS_TEST_SENTENCES["hi-IN"],
            "tts_rest_hi",
        )
        report.rows.append(hi_tts_row)

        kn_tts_row, _ = await run_tts_rest(
            client,
            urls["tts_rest"],
            api_key,
            "kn-IN",
            args.tts_voice,
            TTS_TEST_SENTENCES["kn-IN"],
            "tts_rest_kn",
        )
        report.rows.append(kn_tts_row)

        if args.test_tts_wss:
            tts_ws_row = await run_tts_ws_check(
                urls["tts_wss"],
                api_key,
                "hi-IN",
                args.tts_voice,
                TTS_TEST_SENTENCES["hi-IN"],
            )
            report.rows.append(tts_ws_row)

        # Round-trip: Hindi TTS -> 16 kHz mono PCM16 -> REST STT & WS STT
        rt_pcm: bytes | None = None
        if hi_tts_wav is not None:
            try:
                rt_pcm = wav_bytes_to_pcm16_16k(hi_tts_wav)
            except (wave.Error, ValueError):
                rt_pcm = None

        if rt_pcm:
            rt_wav = pcm16_to_wav_bytes(rt_pcm)

            rt_rest = await run_rest_stt(
                client,
                urls["stt_rest"],
                api_key,
                rt_wav,
                "hi-IN,en-IN",
                "roundtrip_tts_hi_rest",
                show_transcript=show_transcript,
            )
            report.rows.append(rt_rest)

            rt_ws, _ = await run_ws_stt(
                urls["stt_wss"],
                api_key,
                rt_pcm,
                {"model": "prisma-v3.0", "language_code": "hi-IN", "format": "transcribe"},
                "roundtrip_tts_hi_ws",
                show_transcript=show_transcript,
            )
            report.rows.append(rt_ws)
            await asyncio.sleep(0.5)

        # Header precedence probes (use Hindi TTS PCM when available, else short_pcm)
        probe_pcm = rt_pcm if rt_pcm else short_pcm
        probe_a_row, probe_a_meta = await run_ws_stt(
            urls["stt_wss"],
            api_key,
            probe_pcm,
            {
                "model": "prisma-v3.0",
                "x-model": "prisma-v3.0",
                "language_code": "hi-IN",
                "lang_code": "kn-IN",
                "format": "transcribe",
                "x-format": "verbatim",
            },
            "ws_both_probe_a",
            show_transcript=show_transcript,
        )
        report.rows.append(probe_a_row)
        await asyncio.sleep(0.5)

        probe_b_row, probe_b_meta = await run_ws_stt(
            urls["stt_wss"],
            api_key,
            probe_pcm,
            {
                "model": "prisma-v3.0",
                "x-model": "prisma-v3.0",
                "language_code": "kn-IN",
                "lang_code": "hi-IN",
                "format": "verbatim",
                "x-format": "transcribe",
            },
            "ws_both_probe_b",
            show_transcript=show_transcript,
        )
        report.rows.append(probe_b_row)
        report.header_precedence_note = _determine_precedence(probe_a_meta, probe_b_meta)

    if args.probe_concurrency:
        await asyncio.sleep(0.5)
        report.rate_limit_note = await probe_ws_concurrency(
            urls["stt_wss"], api_key, args.lang
        )
    else:
        rate_hits = [r.case for r in report.rows if r.status == "RATE_LIMITED" or r.http_or_ws_code == "429"]
        if rate_hits:
            report.rate_limit_note = f"429 RATE_LIMITED observed on: {', '.join(rate_hits)}"

    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Manual Gnani STT/TTS smoke test (never prints keys, transcripts, or paths)."
    )
    parser.add_argument(
        "--audio",
        required=True,
        help="Path to an audio clip (WAV natively, or mp3/m4a/ogg if ffmpeg is installed).",
    )
    parser.add_argument(
        "--long-audio",
        default=None,
        help="Optional path to a >30s clip (e.g., 35-40s) to test REST STT 30s vs 60s limit.",
    )
    parser.add_argument(
        "--lang",
        default="hi-IN",
        choices=ALLOWED_LANGS,
        help="Primary spoken language of --audio (default: hi-IN).",
    )
    parser.add_argument(
        "--tts-voice",
        default="Shivani",
        help="Timbre v3.0 voice to test (default: Shivani).",
    )
    parser.add_argument(
        "--test-tts-wss",
        action="store_true",
        help="Also run a diagnostic WSS TTS test against wss://api.vachana.ai/api/v1/tts.",
    )
    parser.add_argument(
        "--probe-concurrency",
        action="store_true",
        help="Open two simultaneous WS STT streams briefly to check concurrent-session cap.",
    )
    parser.add_argument(
        "--show-transcript",
        action="store_true",
        help="Opt-in: print STT transcript text (never use with real worker data).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        report = asyncio.run(run_suite(args))
    except Exception as exc:
        print(f"Smoke test aborted: {exc}", file=sys.stderr)
        return 1

    print(format_markdown_report(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
