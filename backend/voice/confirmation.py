"""Confirmation classifier (yes / no / unclear) across hi, kn, bn, en."""

from __future__ import annotations

import re

from .models import ConfirmationResult, SupportedLanguage, normalize_language

# Checked before positive/negative matching so "pata nahi" / "not sure" stays "unclear".
UNCLEAR_PHRASES: dict[SupportedLanguage, tuple[str, ...]] = {
    "hi-IN": (
        "pata nahi", "maloom nahi", "samajh nahi", "dobara", "phir se",
        "पता नहीं", "मालूम नहीं", "समझ नहीं", "दोबारा", "फिर से", "सोच",
    ),
    "kn-IN": (
        "gottilla", "gottu illa", "matte heli", "artha aglilla",
        "ಗೊತ್ತಿಲ್ಲ", "ಮತ್ತೆ ಹೇಳಿ", "ಅರ್ಥ ಆಗಲಿಲ್ಲ",
    ),
    "bn-IN": (
        "jani na", "bujhini", "abar bolun", "bhabte hobe",
        "জানি না", "বুঝিনি", "আবার বলুন",
    ),
    "en-IN": (
        "not sure", "don't know", "dont know", "maybe", "repeat", "check again", "wait",
    ),
}

# Explicit negative phrases or negated positives ("theek nahi", "not correct", "ಸರಿ ಇಲ್ಲ").
NEGATED_PHRASES: tuple[str, ...] = (
    "theek nahi", "thik nahi", "sahi nahi", "galat hai", "nahi hai",
    "ठीक नहीं", "सही नहीं", "गलत है", "नहीं है",
    "sari illa", "sariyagi illa", "tappu ide", "ಹೌದು ಅಲ್ಲ", "ಸರಿ ಇಲ್ಲ", "ತಪ್ಪು",
    "thik noy", "thik nei", "thak na", "bhul ache", "ঠিক নয়", "ঠিক না", "ভুল",
    "not correct", "not right", "not ok", "not okay", "disagree", "dispute", "wrong",
)

YES_TOKENS: dict[SupportedLanguage, tuple[str, ...]] = {
    "hi-IN": (
        "haan", "han", "hanji", "haan ji", "ji", "theek hai", "thik hai",
        "sahi hai", "bilkul", "manzoor", "sahmat",
        "हाँ", "हां", "हाँ जी", "जी", "ठीक है", "सही है", "बिल्कुल", "मंजूर", "सहमत",
    ),
    "kn-IN": (
        "haudu", "howdu", "houdu", "sari", "sari ide", "sariyide", "opputtene",
        "ಹೌದು", "ಸರಿ", "ಸರಿ ಇದೆ", "ಸರಿಯಿದೆ", "ಒಪ್ಪುತ್ತೇನೆ", "ಒಪ್ಪಿದ್ದೇನೆ",
    ),
    "bn-IN": (
        "hya", "haan", "ha", "thik ache", "thik achhe", "shothik", "raji", "oboshshoi",
        "হ্যাঁ", "হাঁ", "ঠিক আছে", "সঠিক", "রাজি", "অবশ্যই",
    ),
    "en-IN": (
        "yes", "yeah", "yep", "yup", "ok", "okay", "correct", "right", "confirmed", "confirm", "agreed", "agree",
    ),
}

NO_TOKENS: dict[SupportedLanguage, tuple[str, ...]] = {
    "hi-IN": (
        "nahi", "nahin", "na", "mat", "galat", "badlo", "change",
        "नहीं", "ना", "मत", "गलत", "बदलो",
    ),
    "kn-IN": (
        "illa", "alla", "beda", "tappu", "badalisi",
        "ಇಲ್ಲ", "ಅಲ್ಲ", "ಬೇಡ", "ತಪ್ಪು", "ಬದಲಿಸಿ",
    ),
    "bn-IN": (
        "na", "noy", "nei", "bhul", "badlan",
        "না", "নয়", "নেই", "ভুল", "বদলান",
    ),
    "en-IN": (
        "no", "nope", "nah", "wrong", "incorrect", "change", "dispute", "reject",
    ),
}


def _clean(text: str) -> str:
    cleaned = re.sub(r"[^\w\s\u0900-\u097F\u0980-\u09FF\u0C80-\u0CFF]", " ", text.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def _matches_any(padded_text: str, phrases: tuple[str, ...]) -> bool:
    for phrase in phrases:
        needle = f" {phrase.lower()} "
        if needle in padded_text:
            return True
    return False


def classify_confirmation(transcript: str, lang: str) -> ConfirmationResult:
    """Classify spoken confirmation reply into 'yes', 'no', or 'unclear'."""
    norm_lang = normalize_language(lang)
    cleaned = _clean(transcript or "")
    if not cleaned:
        return "unclear"

    padded = f" {cleaned} "

    # 1. Explicit uncertainty/repeat phrases first (prevents "pata nahi" -> "no").
    unclear_pool = UNCLEAR_PHRASES[norm_lang] + UNCLEAR_PHRASES["en-IN"]
    if _matches_any(padded, unclear_pool):
        return "unclear"

    # 2. Negated positives & explicit dispute phrases always resolve to "no".
    if _matches_any(padded, NEGATED_PHRASES):
        return "no"

    yes_pool = YES_TOKENS[norm_lang] + YES_TOKENS["en-IN"]
    no_pool = NO_TOKENS[norm_lang] + NO_TOKENS["en-IN"]

    has_yes = _matches_any(padded, yes_pool)
    has_no = _matches_any(padded, no_pool)

    # Reject/correction sentences ("haan nahi 400 diye" / "no 300") take negative over positive if numbers or clear no present.
    if has_no and not has_yes:
        return "no"
    if has_yes and not has_no:
        return "yes"
    if has_yes and has_no:
        # Both positive and negative tokens appeared without a clear negation pattern.
        return "unclear"
    return "unclear"

