"""Temporary local AudioStore stub writing 16 kHz mono PCM16 WAVs to data/audio/."""

from __future__ import annotations

import hashlib
import io
import uuid
import wave
from pathlib import Path

from .config import load_voice_settings
from .models import AudioKind, AudioStore, SavedAudio

TARGET_SAMPLE_RATE = 16_000
TARGET_CHANNELS = 1
TARGET_SAMPLE_WIDTH = 2
_VALID_KINDS: set[str] = {"narration", "confirm", "consent", "dispute"}


def ensure_pcm16_16k_wav(data: bytes) -> tuple[bytes, int]:
    """Ensure bytes are a 16 kHz mono PCM16 WAV container and return (wav_bytes, duration_ms)."""
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        with wave.open(io.BytesIO(data), "rb") as wf:
            rate = wf.getframerate()
            channels = wf.getnchannels()
            width = wf.getsampwidth()
            frames = wf.getnframes()
        if rate == TARGET_SAMPLE_RATE and channels == TARGET_CHANNELS and width == TARGET_SAMPLE_WIDTH:
            duration_ms = int(round((frames / rate) * 1000)) if rate else 0
            return data, duration_ms
        raise ValueError(
            f"Expected 16 kHz mono 16-bit WAV, got {rate} Hz / {channels} ch / {width * 8}-bit."
        )

    # Raw PCM16 mono 16 kHz input: trim partial sample if odd length and add RIFF header.
    usable_len = len(data) - (len(data) % TARGET_SAMPLE_WIDTH)
    pcm = data[:usable_len]
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(TARGET_CHANNELS)
        wf.setsampwidth(TARGET_SAMPLE_WIDTH)
        wf.setframerate(TARGET_SAMPLE_RATE)
        wf.writeframes(pcm)
    num_samples = usable_len // TARGET_SAMPLE_WIDTH
    duration_ms = int(round((num_samples / TARGET_SAMPLE_RATE) * 1000))
    return buf.getvalue(), duration_ms


class LocalAudioStore:
    """Stub AudioStore writing WAV files under data/audio/<kind>/ until B's store arrives."""

    def __init__(self, base_dir: Path | str | None = None) -> None:
        self._base_dir = (
            Path(base_dir) if base_dir is not None else load_voice_settings().audio_stub_dir
        )

    async def save_audio(self, data: bytes, kind: AudioKind) -> SavedAudio:
        if kind not in _VALID_KINDS:
            raise ValueError(f"Unsupported audio kind: {kind!r}")

        wav_bytes, duration_ms = ensure_pcm16_16k_wav(data)
        digest = hashlib.sha256(wav_bytes).hexdigest()
        target_dir = self._base_dir / kind
        target_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{uuid.uuid4().hex}.wav"
        (target_dir / filename).write_bytes(wav_bytes)
        return SavedAudio(
            audio_ref=f"local://{kind}/{filename}",
            sha256=digest,
            duration_ms=duration_ms,
        )


def get_audio_store() -> AudioStore:
    """FastAPI dependency returning LocalAudioStore (overridden by Developer B in app/main.py)."""
    return LocalAudioStore()

