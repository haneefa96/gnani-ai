"""Unit tests for P7 confirmation.py across hi, kn, bn, en."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.voice.confirmation import classify_confirmation


def test_classify_confirmation_all_fixture_cases() -> None:
    fixtures_file = Path(__file__).resolve().parents[1] / "fixtures" / "entries.json"
    confirmations = json.loads(fixtures_file.read_text(encoding="utf-8"))["confirmations"]
    assert len(confirmations) == 5
    for item in confirmations:
        assert classify_confirmation(item["transcript"], item["lang"]) == item["expected"], item["id"]


@pytest.mark.parametrize(
    ("transcript", "lang", "expected"),
    [
        ("हाँ", "hi-IN", "yes"),
        ("haan ji theek hai", "hi-IN", "yes"),
        ("sahi hai", "hi-IN", "yes"),
        ("नहीं", "hi-IN", "no"),
        ("nahi 400 diye", "hi-IN", "no"),
        ("theek nahi hai", "hi-IN", "no"),
        ("galat hai", "hi-IN", "no"),
        ("pata nahi", "hi-IN", "unclear"),
        ("दोबारा बोलो", "hi-IN", "unclear"),
        ("ಹೌದು ಸರಿ ಇದೆ", "kn-IN", "yes"),
        ("haudu", "kn-IN", "yes"),
        ("ಇಲ್ಲ ತಪ್ಪು", "kn-IN", "no"),
        ("sari illa", "kn-IN", "no"),
        ("ಗೊತ್ತಿಲ್ಲ", "kn-IN", "unclear"),
        ("হ্যাঁ ঠিক আছে", "bn-IN", "yes"),
        ("thik ache", "bn-IN", "yes"),
        ("না ভুল", "bn-IN", "no"),
        ("thik noy", "bn-IN", "no"),
        ("জানি না", "bn-IN", "unclear"),
        ("yes correct", "en-IN", "yes"),
        ("not correct", "en-IN", "no"),
        ("no wrong amount", "en-IN", "no"),
        ("maybe repeat please", "en-IN", "unclear"),
        ("", "en-IN", "unclear"),
    ],
)
def test_classify_confirmation(transcript: str, lang: str, expected: str) -> None:
    assert classify_confirmation(transcript, lang) == expected

