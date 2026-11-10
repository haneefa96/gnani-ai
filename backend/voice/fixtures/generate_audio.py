"""Deterministic synthetic 16 kHz mono PCM16 WAV generator for offline fixtures."""

from __future__ import annotations

import io
import json
import math
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 16_000
CHANNELS = 1
SAMPLE_WIDTH = 2


def make_synthetic_wav(duration_s: float = 0.5, freq_hz: float = 440.0) -> bytes:
    """Create a synthetic 16 kHz mono PCM16 WAV with gentle envelope and trailing silence."""
    total_samples = max(512, int(round(duration_s * SAMPLE_RATE)))
    speech_samples = int(total_samples * 0.75)
    pcm_samples: list[int] = []
    for idx in range(total_samples):
        if idx < speech_samples:
            amp = 5000.0 * math.sin(2.0 * math.pi * freq_hz * (idx / SAMPLE_RATE))
            pcm_samples.append(int(amp))
        else:
            pcm_samples.append(0)

    raw = struct.pack(f"<{len(pcm_samples)}h", *pcm_samples)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(SAMPLE_WIDTH)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(raw)
    return buf.getvalue()


def generate_fixture_audio_files() -> list[Path]:
    """Generate synthetic WAV files for every fixture entry and confirmation clip."""
    fixtures_dir = Path(__file__).resolve().parent
    audio_dir = fixtures_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    data = json.loads((fixtures_dir / "entries.json").read_text(encoding="utf-8"))

    written: list[Path] = []
    items = list(data.get("entries", [])) + list(data.get("confirmations", []))
    for index, item in enumerate(items):
        filename = item["audio_file"]
        freq = 320.0 + (index * 25.0)
        duration = 0.45 if "confirm" in filename else 0.75
        out_path = audio_dir / filename
        out_path.write_bytes(make_synthetic_wav(duration_s=duration, freq_hz=freq))
        written.append(out_path)
    return written


if __name__ == "__main__":
    files = generate_fixture_audio_files()
    print(f"Generated {len(files)} synthetic WAV fixtures.")

