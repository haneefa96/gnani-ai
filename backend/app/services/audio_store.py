"""Real AudioStore implementation storing validated 16 kHz mono PCM16 WAV files for backend/app."""

from __future__ import annotations

import hashlib
import uuid
from pathlib import Path

from backend.voice.models import AudioKind, SavedAudio
from backend.voice.storage_stub import ensure_pcm16_16k_wav

_VALID_KINDS = frozenset({"narration", "confirm", "consent", "dispute"})


class AppAudioStore:
    """Product AudioStore backed by AUDIO_STORAGE_PATH for /ws/stt uploads."""

    def __init__(self, base_dir: Path | str = "./data/audio") -> None:
        self._base_dir = Path(base_dir)

    async def save_audio(self, data: bytes, kind: AudioKind) -> SavedAudio:
        """Persist a 16 kHz mono PCM16 WAV clip and return filesystem path, sha256, and duration_ms."""
        if kind not in _VALID_KINDS:
            raise ValueError(f"Unsupported audio kind: {kind!r}")

        wav_bytes, duration_ms = ensure_pcm16_16k_wav(data)
        digest = hashlib.sha256(wav_bytes).hexdigest()
        target_dir = self._base_dir / kind
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / f"{uuid.uuid4().hex}.wav"
        target_path.write_bytes(wav_bytes)
        return SavedAudio(
            audio_ref=str(target_path),
            sha256=digest,
            duration_ms=duration_ms,
        )
