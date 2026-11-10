"""Unit tests for P3 Fixtures and FakeVoice."""

from __future__ import annotations

import io
import json
import wave
from datetime import date
from pathlib import Path

import pytest

from backend.voice.fixtures.fake_voice import FakeVoice
from backend.voice.models import ExtractContext

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"


def test_fixtures_cover_at_least_12_cases_and_four_languages() -> None:
    raw = json.loads((FIXTURES_DIR / "entries.json").read_text(encoding="utf-8"))
    entries = raw["entries"]
    confirmations = raw["confirmations"]
    total = len(entries) + len(confirmations)
    assert total >= 12

    langs = {item["lang"] for item in entries}
    assert langs == {"hi-IN", "kn-IN", "bn-IN", "en-IN"}

    categories = {item["category"] for item in entries}
    assert {"complete", "missing_paid", "paid_gt_agreed", "due_mismatch", "kal_date", "code_mixed"} <= categories

    for item in entries + confirmations:
        wav_path = FIXTURES_DIR / "audio" / item["audio_file"]
        assert wav_path.is_file(), f"Missing synthetic fixture audio: {wav_path.name}"
        with wave.open(io.BytesIO(wav_path.read_bytes()), "rb") as wf:
            assert wf.getframerate() == 16_000
            assert wf.getnchannels() == 1
            assert wf.getsampwidth() == 2


@pytest.mark.asyncio
async def test_fake_voice_extracts_all_entry_fixtures_and_kal_date() -> None:
    fake = FakeVoice()
    ref = date(2026, 11, 10)
    raw = json.loads((FIXTURES_DIR / "entries.json").read_text(encoding="utf-8"))

    for item in raw["entries"]:
        draft = await fake.extract_entry(
            item["transcript"], item["lang"], ExtractContext(work_date_ref=ref)
        )
        assert draft.language == item["lang"]
        if item["work_date_offset_days"] == -1:
            assert draft.work_date == date(2026, 11, 9)
        else:
            assert draft.work_date == ref
        if item["category"] == "paid_gt_agreed":
            assert draft.due_amount_inr is None
            assert "paid_amount_inr" in draft.needs_clarification
        if item["category"] == "due_mismatch":
            assert draft.due_amount_inr == 500
            assert draft.stated_due_amount_inr == 600
            assert "due_amount_inr" in draft.needs_clarification


@pytest.mark.asyncio
async def test_fake_voice_clarification_synthesize_readback_and_confirm() -> None:
    fake = FakeVoice()
    ref = date(2026, 11, 10)
    initial = await fake.extract_entry(
        "आज इंदिरानगर साइट पर 8 घंटे काम किया, महेश ने 600 रुपये तय किए।",
        "hi-IN",
        ExtractContext(work_date_ref=ref),
    )
    assert initial.paid_amount_inr is None
    assert initial.due_amount_inr is None

    clarified = await fake.extract_entry(
        "",
        "hi-IN",
        ExtractContext(
            work_date_ref=ref,
            previous_draft=initial,
            clarification_answer="200 रुपये मिले",
            turn_count=1,
        ),
    )
    assert clarified.paid_amount_inr == 200
    assert clarified.due_amount_inr == 400
    assert clarified.needs_clarification == []

    readback = fake.build_readback(clarified, "hi-IN")
    assert "छह सौ" in readback and "चार सौ" in readback

    wav = await fake.synthesize(readback, "hi-IN")
    with wave.open(io.BytesIO(wav), "rb") as wf:
        assert wf.getframerate() == 16_000
        assert wf.getnchannels() == 1

    assert fake.classify_confirmation("हाँ ठीक है", "hi-IN") == "yes"
    assert fake.classify_confirmation("nahi galat hai", "hi-IN") == "no"
    assert fake.classify_confirmation("wait maybe check again", "en-IN") == "unclear"

    raw = json.loads((FIXTURES_DIR / "entries.json").read_text(encoding="utf-8"))
    for conf in raw["confirmations"]:
        assert fake.classify_confirmation(conf["transcript"], conf["lang"]) == conf["expected"], conf["id"]
