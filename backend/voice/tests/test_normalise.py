"""Unit tests for P7 normalise.py across hi, kn, bn, en."""

from __future__ import annotations

import pytest

from backend.voice.normalise import (
    BN_0_99,
    EN_0_99,
    HI_0_99,
    KN_0_99,
    normalise_for_tts,
    number_to_words,
)


def test_0_99_tables_have_100_unique_entries() -> None:
    for table in (HI_0_99, KN_0_99, BN_0_99, EN_0_99):
        assert len(table) == 100
        assert len(set(table)) == 100


@pytest.mark.parametrize(
    ("num", "lang", "expected"),
    [
        (0, "hi-IN", "शून्य"),
        (29, "hi-IN", "उनतीस"),
        (700, "hi-IN", "सात सौ"),
        (1500, "hi-IN", "एक हज़ार पाँच सौ"),
        (125000, "hi-IN", "एक लाख पच्चीस हज़ार"),
        (9999999, "hi-IN", "निन्यानवे लाख निन्यानवे हज़ार नौ सौ निन्यानवे"),
        (10000000, "hi-IN", "एक करोड़"),
        (0, "kn-IN", "ಸೊನ್ನೆ"),
        (25, "kn-IN", "ಇಪ್ಪತ್ತೈದು"),
        (300, "kn-IN", "ಮುನ್ನೂರು"),
        (125000, "kn-IN", "ಒಂದು ಲಕ್ಷ ಇಪ್ಪತ್ತೈದು ಸಾವಿರ"),
        (10000000, "kn-IN", "ಒಂದು ಕೋಟಿ"),
        (0, "bn-IN", "শূন্য"),
        (39, "bn-IN", "ঊনচল্লিশ"),
        (100, "bn-IN", "একশো"),
        (700, "bn-IN", "সাত শো"),
        (125000, "bn-IN", "এক লাখ পঁচিশ হাজার"),
        (10000000, "bn-IN", "এক কোটি"),
        (42, "en-IN", "forty two"),
        (125000, "en-IN", "one lakh twenty five thousand"),
        (9999999, "en-IN", "ninety nine lakh ninety nine thousand nine hundred ninety nine"),
        (10000000, "en-IN", "one crore"),
    ],
)
def test_indian_number_to_words(num: int, lang: str, expected: str) -> None:
    assert number_to_words(num, lang) == expected


def test_normalise_rupees_hours_dates_and_indic_digits() -> None:
    hi = normalise_for_tts("2026-11-09 को 8 घंटे काम, ₹700 तय, Rs. 300 मिले।", "hi-IN")
    assert "नौ नवंबर दो हज़ार छब्बीस" in hi
    assert "आठ घंटे" in hi
    assert "सात सौ रुपये" in hi
    assert "तीन सौ रुपये" in hi

    kn = normalise_for_tts("09/11/2026 ರಂದು 8 ಗಂಟೆ ಕೆಲಸ, ₹700 ಒಪ್ಪಂದ.", "kn-IN")
    assert "ಒಂಬತ್ತು ನವೆಂಬರ್ ಎರಡು ಸಾವಿರದ ಇಪ್ಪತ್ತಾರು" in kn or "ಎರಡು ಸಾವಿರ ಇಪ್ಪತ್ತಾರು" in kn
    assert "ಎಂಟು ಗಂಟೆ" in kn
    assert "ಏಳುನೂರು ರೂಪಾಯಿ" in kn

    bn = normalise_for_tts("2026-11-09 তারিখে 8 ঘণ্টা কাজ, ₹700 ঠিক।", "bn-IN")
    assert "নয় নভেম্বর দুই হাজার ছাব্বিশ" in bn
    assert "আট ঘণ্টা" in bn
    assert "সাত শো টাকা" in bn

    en = normalise_for_tts("On 2026-11-09 worked 8 hours for ₹1,25,000.", "en-IN")
    assert "nine November two thousand twenty six" in en
    assert "eight hours" in en
    assert "one lakh twenty five thousand rupees" in en

    # Native Devanagari digits should normalize identically.
    assert normalise_for_tts("₹७००", "hi-IN") == "सात सौ रुपये"

