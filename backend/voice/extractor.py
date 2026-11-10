"""3-layer structured EntryDraft extractor (Layer 1 regex, Layer 2 LlmClient, Layer 3 code checks)."""

from __future__ import annotations

import json
import re
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .amounts import compute_due
from .config import VoiceSettings, load_voice_settings
from .errors import VoiceError
from .llm import LlmClient, get_llm_client
from .models import EntryDraft, ExtractContext, SupportedLanguage, normalize_language
from .normalise import (
    BN_0_99,
    EN_0_99,
    HI_0_99,
    KN_0_99,
    normalize_indic_digits,
)

_PROMPT_PATH = Path(__file__).resolve().parent / "prompts" / "extract_entry.txt"

# Strict JSON Schema passed to Layer-2 LLM. Note: due_amount_inr is intentionally omitted.
LLM_EXTRACT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": [
        "work_date_offset_days",
        "site_name",
        "counterparty_name",
        "work_type",
        "hours",
        "days",
        "agreed_amount_inr",
        "paid_amount_inr",
        "stated_due_amount_inr",
        "field_confidence",
    ],
    "properties": {
        "work_date_offset_days": {"type": "integer"},
        "site_name": {"type": ["string", "null"]},
        "counterparty_name": {"type": ["string", "null"]},
        "work_type": {"type": ["string", "null"]},
        "hours": {"type": ["number", "null"]},
        "days": {"type": ["number", "null"]},
        "agreed_amount_inr": {"type": ["number", "null"]},
        "paid_amount_inr": {"type": ["number", "null"]},
        "stated_due_amount_inr": {"type": ["number", "null"]},
        "field_confidence": {
            "type": "object",
            "properties": {
                "site_name": {"type": "number"},
                "counterparty_name": {"type": "number"},
                "work_type": {"type": "number"},
                "hours": {"type": "number"},
                "days": {"type": "number"},
                "agreed_amount_inr": {"type": "number"},
                "paid_amount_inr": {"type": "number"},
            },
        },
    },
}


class _LlmOutput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    work_date_offset_days: int = 0
    site_name: str | None = None
    counterparty_name: str | None = None
    work_type: str | None = None
    hours: float | None = Field(default=None, ge=0)
    days: float | None = Field(default=None, ge=0)
    agreed_amount_inr: float | None = Field(default=None, ge=0)
    paid_amount_inr: float | None = Field(default=None, ge=0)
    stated_due_amount_inr: float | None = None
    field_confidence: dict[str, float] = Field(default_factory=dict)


def _build_word_number_maps() -> tuple[dict[str, int], dict[str, int]]:
    base: dict[str, int] = {}
    for table in (HI_0_99, KN_0_99, BN_0_99, EN_0_99):
        for val, word in enumerate(table):
            base[word.lower()] = val

    # Romanized Indic & compound Kannada hundreds for fallback recognition.
    romanized = {
        "ek": 1, "do": 2, "teen": 3, "char": 4, "chaar": 4, "panch": 5, "paanch": 5,
        "chhe": 6, "chhah": 6, "saat": 7, "aath": 8, "nau": 9, "das": 10,
        "gyarah": 11, "barah": 12, "bees": 20, "pachis": 25, "tees": 30,
        "chalis": 40, "pachas": 50, "saath": 60, "sattar": 70, "assi": 80, "nabbe": 90,
        "ondu": 1, "eradu": 2, "mooru": 3, "nalku": 4, "aidu": 5, "aaru": 6,
        "elu": 7, "entu": 8, "ombattu": 9, "hattu": 10,
        "dui": 2, "tin": 3, "chhoy": 6, "sat": 7, "aat": 8, "noy": 9, "dosh": 10,
        "ಇನ್ನೂರು": 200, "ಮುನ್ನೂರು": 300, "ನಾನ್ನೂರು": 400, "ಐನೂರು": 500,
        "ಆರುನೂರು": 600, "ಏಳುನೂರು": 700, "ಎಂಟುನೂರು": 800, "ಒಂಬೈನೂರು": 900,
        "एकशौ": 100, "एकशो": 100, "একশো": 100,
    }
    base.update(romanized)

    multipliers = {
        "सौ": 100, "sau": 100, "शौ": 100, "ನೂರು": 100, "nooru": 100, "শো": 100, "shat": 100, "hundred": 100,
        "हज़ार": 1000, "हजार": 1000, "hazaar": 1000, "hajar": 1000, "ಸಾವಿರ": 1000, "saavira": 1000,
        "হাজার": 1000, "thousand": 1000,
        "लाख": 100_000, "lakh": 100_000, "ಲಕ್ಷ": 100_000, "লাখ": 100_000,
    }
    return base, multipliers


_WORD_VALUES, _WORD_MULTIPLIERS = _build_word_number_maps()

_AGREED_CUES = (
    "bola", "bolle", "bollo", "tay", "fix", "agreed", "rate", "kaha", "total",
    "बोला", "तय", "कहा", "ಹೇಳಿ", "ಹೇಳಿದರು", "ಒಪ್ಪಂದ", "ಬೆಲೆ", "বলেছেন", "ঠিক",
)
_PAID_CUES = (
    "diye", "diya", "diyo", "mila", "mile", "paid", "advance", "kottaru", "kottu", "kotte",
    "दिए", "दिया", "मिले", "मिला", "ಕೊಟ್ಟರು", "ಸಿಕ್ಕಿತು", "ದೊರೆತಿದೆ", "দিয়েছেন", "পেয়েছি", "পেয়েছেন",
)
_DUE_CUES = ("baaki", "baki", "due", "balance", "pending", "बाकी", "बकाया", "ಬಾಕಿ", "বাকি")

# Homonym-prone standalone number words (e.g., "saath"=with/60, "do"=verb/2, "das"=surname/10).
# Only convert these when multiplied ("saath hazaar") or backed by an adjacent numeric cue/unit.
_AMBIGUOUS_STANDALONE_WORDS: frozenset[str] = frozenset({
    "one", "ek", "do", "char", "tin", "sat", "nau", "das", "bees",
    "saath", "aaru", "noy", "dosh", "दो",
})
_SAATH_PREPOSITIONS: frozenset[str] = frozenset({
    "ke", "k", "mere", "tere", "unke", "inke", "humare", "sabke", "apne", "ek",
})
_NUMERIC_NEXT_CUES: frozenset[str] = frozenset({
    "hour", "hours", "hr", "hrs", "ghante", "ghanta", "ghanto", "घंटे", "घंटा", "ಗಂಟೆ", "ঘণ্টা",
    "day", "days", "din", "दिन", "ದಿನ", "দিন",
    "rupee", "rupees", "rs", "rs.", "inr", "rupaye", "rupaiye", "rupay", "rupaiya", "taka",
    "रुपये", "रुपए", "रुपया", "ರೂಪಾಯಿ", "টাকা",
    *_AGREED_CUES, *_PAID_CUES, *_DUE_CUES,
})
_NUMERIC_PREV_CUES: frozenset[str] = frozenset({
    "₹", "rs", "rs.", "inr", "paid", "agreed", "baaki", "baki", "due", "balance", "advance",
})


def _adjacent_word(tokens: list[str], start: int, step: int) -> str:
    """Return the nearest non-whitespace cleaned token before or after index `start`."""
    pos = start
    while 0 <= pos < len(tokens):
        if not tokens[pos].isspace():
            return re.sub(r"^[,.;!?()\[\]\"']+|[,.;!?()\[\]\"']+$", "", tokens[pos].lower())
        pos += step
    return ""


def _replace_number_words_with_digits(text: str) -> str:
    """Convert spoken Indian/English number-word runs into ASCII digits for Layer-1 regex."""
    tokens = re.findall(r"\S+|\s+", text)
    out: list[str] = []
    idx = 0
    while idx < len(tokens):
        tok = tokens[idx]
        if tok.isspace():
            out.append(tok)
            idx += 1
            continue

        cleaned = re.sub(r"^[,.;!?]+|[,.;!?]+$", "", tok.lower())
        if cleaned not in _WORD_VALUES and cleaned not in _WORD_MULTIPLIERS:
            out.append(tok)
            idx += 1
            continue

        # Accumulate a valid number-word run (ignoring intervening whitespace).
        total = 0
        current = 0
        consumed = 0
        word_count = 0
        used_multiplier = False
        first_word = ""
        j = idx
        while j < len(tokens):
            t = tokens[j]
            if t.isspace():
                j += 1
                continue
            c = re.sub(r"^[,.;!?]+|[,.;!?]+$", "", t.lower())
            if c in _WORD_VALUES:
                val = _WORD_VALUES[c]
                if word_count > 0:
                    # Only join compound tens+unit ("twenty five") or post-multiplier runs ("do sau pachas");
                    # never merge unrelated small words like "ek saath" -> 61.
                    can_chain = (
                        used_multiplier
                        or current >= 100
                        or (current >= 20 and current % 10 == 0 and 1 <= val <= 9)
                    )
                    if not can_chain:
                        break
                current += val
                if word_count == 0:
                    first_word = c
                word_count += 1
                consumed = j + 1
                j += 1
            elif c in _WORD_MULTIPLIERS:
                mult = _WORD_MULTIPLIERS[c]
                used_multiplier = True
                if mult == 100:
                    current = (current or 1) * 100
                else:
                    total += (current or 1) * mult
                    current = 0
                if word_count == 0:
                    first_word = c
                word_count += 1
                consumed = j + 1
                j += 1
            else:
                break

        if not used_multiplier and word_count == 1:
            prev_word = _adjacent_word(tokens, idx - 1, -1)
            next_word = _adjacent_word(tokens, consumed, 1)
            if first_word == "saath" and prev_word in _SAATH_PREPOSITIONS:
                out.append(tok)
                idx += 1
                continue
            if first_word in _AMBIGUOUS_STANDALONE_WORDS and not (
                next_word in _NUMERIC_NEXT_CUES or prev_word in _NUMERIC_PREV_CUES
            ):
                out.append(tok)
                idx += 1
                continue

        value = total + current
        # Preserve leading/trailing punctuation from the boundary words.
        lead = re.match(r"^([,.;!?]+)", tok)
        last_tok = tokens[consumed - 1]
        trail = re.search(r"([,.;!?]+)$", last_tok)
        out.append(
            (lead.group(1) if lead else "")
            + str(value)
            + (trail.group(1) if trail else "")
        )
        idx = consumed

    return "".join(out)


def _clean_num(val: float | int | None) -> float | int | None:
    if val is None:
        return None
    if isinstance(val, bool):
        return None
    f = float(val)
    return int(f) if f.is_integer() else round(f, 2)


def _detect_date_offset(text: str) -> int:
    lower = text.lower()
    if any(tok in lower for tok in ("parso", "परसों", "day before yesterday")):
        return -2
    if any(
        tok in lower
        for tok in ("kal ", " kal", "कल", "ninney", "ninne", "ನಿನ್ನೆ", "gotokal", "গতকাল", "yesterday")
    ) or lower.strip() == "kal":
        return -1
    return 0


def _match_known(text: str, candidates: list[str]) -> str | None:
    lower = text.lower()
    for item in candidates:
        if item and item.lower() in lower:
            return item
    return None


_WORK_TYPES = (
    "plumbing", "plastering", "painting", "masonry", "carpentry",
    "electrical", "wiring", "welding", "digging", "loading", "helper",
)


def layer1_extract(
    transcript: str,
    lang: SupportedLanguage,
    ctx: ExtractContext,
) -> dict[str, Any]:
    """Deterministic Layer-1 regex + reversed number-word extraction."""
    ref_date = ctx.work_date_ref or date.today()
    ascii_text = normalize_indic_digits(transcript or "")
    expanded = _replace_number_words_with_digits(ascii_text)

    date_offset = _detect_date_offset(expanded)
    hours: float | None = None
    days: float | None = None
    used_spans: list[tuple[int, int]] = []

    h_match = re.search(
        r"(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr|ghante|ghanta|ghanto|घंटे|घंटा|ಗಂಟೆ|ঘণ্টা)",
        expanded,
        re.IGNORECASE,
    )
    if h_match:
        hours = float(h_match.group(1))
        used_spans.append(h_match.span(1))

    d_match = re.search(
        r"(\d+(?:\.\d+)?)\s*(?:days?|din|ದಿನ|দিন|दिन)",
        expanded,
        re.IGNORECASE,
    )
    if d_match:
        days = float(d_match.group(1))
        used_spans.append(d_match.span(1))

    agreed: float | int | None = None
    paid: float | int | None = None
    stated_due: float | int | None = None
    unclassified_nums: list[float | int] = []

    for m in re.finditer(r"(?:₹|Rs\.?|INR)?\s*(\d+(?:,\d+)*(?:\.\d+)?)", expanded, re.IGNORECASE):
        span = m.span(1)
        if any(s0 <= span[0] and span[1] <= s1 for s0, s1 in used_spans):
            continue
        raw_val = float(m.group(1).replace(",", ""))
        val = _clean_num(raw_val)
        if val is None:
            continue

        before_raw = expanded[max(0, m.start() - 22) : m.start()].lower()
        after_raw = expanded[m.end() : min(len(expanded), m.end() + 26)].lower()
        # Bound clauses at punctuation/other numbers so "agreed 600 paid 200" doesn't bleed across numbers.
        before = re.split(r"[,.;\d]+", before_raw)[-1]
        after = re.split(r"[,.;\d]+", after_raw)[0]

        def _detect_role(window: str) -> str | None:
            if any(c in window for c in _DUE_CUES):
                return "due"
            if any(c in window for c in _AGREED_CUES):
                return "agreed"
            if any(c in window for c in _PAID_CUES):
                return "paid"
            return None

        # A cue word right before the number (e.g. "agreed 600", "paid 200", "baaki 500")
        # takes priority for SVO/mixed text; otherwise use the post-number clause (Indic SOV).
        role_before = _detect_role(before)
        role_after = _detect_role(after)

        if role_before and (not role_after or before.strip().endswith(_AGREED_CUES + _PAID_CUES + _DUE_CUES)):
            role = role_before
        elif role_after and not role_before:
            role = role_after
        elif role_before and role_after:
            # If both clauses match different roles (e.g. "agreed 600 paid "), check which cue is closer to the number.
            role = role_before
        else:
            role = None

        if role == "due" and stated_due is None:
            stated_due = val
        elif role == "agreed" and agreed is None:
            agreed = val
        elif role == "paid" and paid is None:
            paid = val
        else:
            unclassified_nums.append(val)

    for val in unclassified_nums:
        if agreed is None:
            agreed = val
        elif paid is None:
            paid = val

    # Site extraction
    site_name = _match_known(expanded, ctx.known_sites)
    if site_name is None:
        s_match = re.search(
            r"([A-Za-z\u0900-\u097F\u0980-\u09FF\u0C80-\u0CFF]+(?:\s+[A-Za-z\u0900-\u097F\u0980-\u09FF\u0C80-\u0CFF]+)?)\s+(?:site|साइट|ಸೈಟ್|সাইটে|সাইট)",
            expanded,
            re.IGNORECASE,
        )
        if s_match:
            cand = s_match.group(1).strip()
            # Drop leading time/preposition words like "Aaj", "Kal", "Ninney", "At"
            cand = re.sub(
                r"^(?:aaj|kal|ninney|ninne|indhu|gotokal|today|yesterday|at|on|in|आज|कल|ಇಂದು|ನಿನ್ನೆ|আজ|গতকাল)\s+",
                "",
                cand,
                flags=re.IGNORECASE,
            ).strip()
            if cand:
                site_name = cand
        elif m_at := re.search(r"\bat\s+([A-Z][A-Za-z]{2,})", expanded):
            site_name = m_at.group(1)

    # Contractor extraction
    contractor_name = _match_known(expanded, ctx.known_counterparties)
    if contractor_name is None:
        c_match = re.search(
            r"([A-Za-z\u0900-\u097F\u0980-\u09FF\u0C80-\u0CFF]{2,})\s+(?:bhaiya|sir|da|contractor|ji|avaru|ne|ke\s+saath|ने|के\s+साथ|अवरु|ಅವರು|দা)(?=\s|$|[.,!?])",
            expanded,
            re.IGNORECASE,
        )
        if c_match:
            contractor_name = c_match.group(1).strip()
        elif m_under := re.search(r"\b(?:under|with)\s+([A-Z][A-Za-z]{2,})", expanded):
            contractor_name = m_under.group(1)

    lower_expanded = expanded.lower()
    work_type = next((wt for wt in _WORK_TYPES if wt in lower_expanded), None)

    return {
        "work_date": ref_date + timedelta(days=date_offset),
        "site_name": site_name,
        "counterparty_name": contractor_name,
        "work_type": work_type,
        "hours": _clean_num(hours),
        "days": _clean_num(days),
        "agreed_amount_inr": agreed,
        "paid_amount_inr": paid,
        "stated_due_amount_inr": stated_due,
        "field_confidence": {
            "site_name": 0.85 if site_name else 0.0,
            "counterparty_name": 0.85 if contractor_name else 0.0,
            "hours": 0.92 if hours is not None else 0.0,
            "days": 0.90 if days is not None else 0.0,
            "agreed_amount_inr": 0.88 if agreed is not None else 0.0,
            "paid_amount_inr": 0.88 if paid is not None else 0.0,
        },
        "language": lang,
    }


def _clarification_prompt(field: str, lang: SupportedLanguage, **fmt: Any) -> str:
    if field == "paid_gt_agreed":
        agreed, paid = fmt.get("agreed"), fmt.get("paid")
        prompts = {
            "hi-IN": f"मिले हुए {paid} रुपये तय {agreed} रुपये से ज़्यादा हैं। सही तय रकम कितनी थी?",
            "kn-IN": f"ಸಿಕ್ಕಿದ {paid} ರೂಪಾಯಿ ಒಪ್ಪಿದ {agreed} ರೂಪಾಯಿಗಿಂತ ಹೆಚ್ಚಾಗಿದೆ. ಸರಿಯಾದ ಒಪ್ಪಿದ ಮೊತ್ತ ಎಷ್ಟು?",
            "bn-IN": f"প্রাপ্ত {paid} টাকা নির্ধারিত {agreed} টাকার চেয়ে বেশি। সঠিক নির্ধারিত টাকা কত ছিল?",
            "en-IN": f"Paid amount ({paid}) exceeds agreed ({agreed}). What was the agreed amount?",
        }
        return prompts[lang]
    if field == "due_mismatch":
        agreed, paid, due, stated = fmt["agreed"], fmt["paid"], fmt["due"], fmt["stated"]
        prompts = {
            "hi-IN": f"{agreed} तय और {paid} मिलने पर बाकी {due} बनता है, आपने {stated} कहा। क्या तय या मिली रकम बदलनी है?",
            "kn-IN": f"{agreed} ಒಪ್ಪಿ {paid} ಕೊಟ್ಟರೆ ಬಾಕಿ {due} ಆಗುತ್ತದೆ, ನೀವು {stated} ಹೇಳಿದ್ದೀರಿ. ಯಾವುದನ್ನು ಸರಿಪಡಿಸಬೇಕು?",
            "bn-IN": f"{agreed} ঠিক ও {paid} পাওয়ায় বাকি {due} হয়, আপনি {stated} বলেছেন। কোন টাকাটি ঠিক করতে হবে?",
            "en-IN": f"{agreed} agreed minus {paid} paid equals {due}, but you stated {stated}. Which amount should be updated?",
        }
        return prompts[lang]
    if field == "agreed_amount_inr":
        return {
            "hi-IN": "कुल कितनी मज़दूरी तय हुई थी?",
            "kn-IN": "ಒಟ್ಟು ಎಷ್ಟು ಕೂಲಿ ಒಪ್ಪಲಾಗಿತ್ತು?",
            "bn-IN": "মোট কত টাকা ঠিক হয়েছিল?",
            "en-IN": "What was the total agreed wage in rupees?",
        }[lang]
    if field == "paid_amount_inr":
        return {
            "hi-IN": "अभी तक कितने रुपये मिले?",
            "kn-IN": "ಇದುವರೆಗೆ ಎಷ್ಟು ರೂಪಾಯಿ ಸಿಕ್ಕಿದೆ?",
            "bn-IN": "এখন পর্যন্ত কত টাকা পেয়েছেন?",
            "en-IN": "How much money have you been paid so far?",
        }[lang]
    return {
        "hi-IN": "आपने कितने घंटे काम किया?",
        "kn-IN": "ನೀವು ಎಷ್ಟು ಗಂಟೆ ಕೆಲಸ ಮಾಡಿದ್ದೀರಿ?",
        "bn-IN": "আপনি কত ঘণ্টা কাজ করেছেন?",
        "en-IN": "How many hours did you work?",
    }[lang]


def _apply_layer3_checks(
    raw: dict[str, Any], lang: SupportedLanguage, turn_count: int
) -> EntryDraft:
    """Compute due_amount_inr deterministically, validate consistency, and pick at most ONE question."""
    agreed = _clean_num(raw.get("agreed_amount_inr"))
    paid = _clean_num(raw.get("paid_amount_inr"))
    stated_due = _clean_num(raw.get("stated_due_amount_inr"))
    due = compute_due(agreed, paid)

    needs: list[str] = []
    question: str | None = None

    if agreed is not None and paid is not None and paid > agreed:
        needs.append("paid_amount_inr")
        question = _clarification_prompt("paid_gt_agreed", lang, agreed=agreed, paid=paid)
    elif stated_due is not None and due is not None and abs(float(stated_due) - float(due)) > 0.01:
        needs.append("due_amount_inr")
        question = _clarification_prompt(
            "due_mismatch", lang, agreed=agreed, paid=paid, due=due, stated=stated_due
        )
    else:
        if agreed is None:
            needs.append("agreed_amount_inr")
        if paid is None:
            needs.append("paid_amount_inr")
        if raw.get("hours") is None and raw.get("days") is None:
            needs.append("hours")

        if needs:
            # At most ONE clarification question per turn (highest priority field).
            question = _clarification_prompt(needs[0], lang)

    conf = dict(raw.get("field_confidence") or {})
    for key, val in (
        ("site_name", raw.get("site_name")),
        ("counterparty_name", raw.get("counterparty_name")),
        ("hours", raw.get("hours")),
        ("days", raw.get("days")),
        ("agreed_amount_inr", agreed),
        ("paid_amount_inr", paid),
    ):
        if val is None:
            conf[key] = 0.0
        elif key not in conf:
            conf[key] = 0.85

    manual_correction = bool(needs) and turn_count >= 2
    return EntryDraft(
        work_date=raw["work_date"],
        site_name=raw.get("site_name"),
        counterparty_name=raw.get("counterparty_name"),
        work_type=raw.get("work_type"),
        hours=_clean_num(raw.get("hours")),
        days=_clean_num(raw.get("days")),
        agreed_amount_inr=agreed,
        paid_amount_inr=paid,
        due_amount_inr=due,
        stated_due_amount_inr=stated_due,
        field_confidence=conf,
        needs_clarification=needs,
        clarification_question=question,
        language=lang,
        manual_correction_required=manual_correction,
    )


def _render_prompt(transcript: str, lang: SupportedLanguage, ctx: ExtractContext) -> str:
    template = _PROMPT_PATH.read_text(encoding="utf-8")
    prev_json = "null"
    if ctx.previous_draft is not None:
        prev_subset = ctx.previous_draft.model_dump(
            mode="json",
            exclude={"due_amount_inr", "field_confidence", "manual_correction_required"},
        )
        prev_json = json.dumps(prev_subset, ensure_ascii=False)
    return template.format(
        language=lang,
        known_sites=json.dumps(ctx.known_sites, ensure_ascii=False),
        known_counterparties=json.dumps(ctx.known_counterparties, ensure_ascii=False),
        previous_draft=prev_json,
        clarification_answer=ctx.clarification_answer or "null",
        transcript=transcript,
    )


class EntryExtractor:
    """Orchestrates Layer 1 regex, optional Layer 2 LlmClient, and Layer 3 checks."""

    def __init__(
        self,
        settings: VoiceSettings | None = None,
        llm_client: LlmClient | None = None,
    ) -> None:
        self._settings = settings or load_voice_settings()
        self._llm_override = llm_client
        # Strictly non-PII Layer-2 execution outcome for diagnostics (no keys/prompts/transcripts).
        self.last_layer2_status: str = "not_run"
        self.last_layer2_model: str = ""

    def _resolve_llm(self) -> LlmClient | None:
        if self._llm_override is not None:
            return self._llm_override if self._settings.llm_enabled else None
        try:
            return get_llm_client(self._settings)
        except ValueError:
            # Missing GEMINI_KEY/MODEL or OLLAMA_MODEL falls back silently to Layer 1.
            return None

    async def extract(
        self, transcript: str, lang: str, ctx: ExtractContext
    ) -> EntryDraft:
        norm_lang = normalize_language(lang)
        ref_date = ctx.work_date_ref or date.today()

        # Re-extraction path when answering a targeted clarification question.
        if ctx.previous_draft is not None and ctx.clarification_answer:
            return await self._re_extract(norm_lang, ctx, ref_date)

        baseline = layer1_extract(transcript, norm_lang, ctx)
        llm_client = self._resolve_llm()
        if llm_client is not None:
            merged = await self._try_layer2(transcript, norm_lang, ctx, ref_date, baseline, llm_client)
            return _apply_layer3_checks(merged, norm_lang, ctx.turn_count)

        self.last_layer2_status = "disabled"
        self.last_layer2_model = ""
        return _apply_layer3_checks(baseline, norm_lang, ctx.turn_count)

    async def _try_layer2(
        self,
        transcript: str,
        lang: SupportedLanguage,
        ctx: ExtractContext,
        ref_date: date,
        baseline: dict[str, Any],
        llm_client: LlmClient,
    ) -> dict[str, Any]:
        prompt = _render_prompt(transcript, lang, ctx)
        self.last_layer2_model = ""
        try:
            raw_json = await llm_client.extract_json(prompt, LLM_EXTRACT_SCHEMA)
            # Never trust or use due_amount_inr from an LLM response.
            raw_json.pop("due_amount_inr", None)
            parsed = _LlmOutput.model_validate(raw_json)
        except VoiceError as exc:
            self.last_layer2_status = f"fallback:{exc.code.value}:{exc.message}"
            return baseline
        except ValidationError:
            self.last_layer2_status = "fallback:ValidationError"
            return baseline
        except Exception as exc:
            self.last_layer2_status = f"fallback:{type(exc).__name__}"
            return baseline

        self.last_layer2_status = "ok"
        self.last_layer2_model = str(getattr(llm_client, "last_used_model", "") or "")

        return {
            "work_date": ref_date + timedelta(days=parsed.work_date_offset_days),
            "site_name": parsed.site_name or baseline.get("site_name"),
            "counterparty_name": parsed.counterparty_name or baseline.get("counterparty_name"),
            "work_type": parsed.work_type or baseline.get("work_type"),
            "hours": parsed.hours if parsed.hours is not None else baseline.get("hours"),
            "days": parsed.days if parsed.days is not None else baseline.get("days"),
            "agreed_amount_inr": (
                parsed.agreed_amount_inr
                if parsed.agreed_amount_inr is not None
                else baseline.get("agreed_amount_inr")
            ),
            "paid_amount_inr": (
                parsed.paid_amount_inr
                if parsed.paid_amount_inr is not None
                else baseline.get("paid_amount_inr")
            ),
            "stated_due_amount_inr": (
                parsed.stated_due_amount_inr
                if parsed.stated_due_amount_inr is not None
                else baseline.get("stated_due_amount_inr")
            ),
            "field_confidence": parsed.field_confidence or baseline.get("field_confidence", {}),
            "language": lang,
        }

    async def _re_extract(
        self, lang: SupportedLanguage, ctx: ExtractContext, ref_date: date
    ) -> EntryDraft:
        prev = ctx.previous_draft
        assert prev is not None
        answer = ctx.clarification_answer or ""

        answer_l1 = layer1_extract(answer, lang, ctx)
        llm_client = self._resolve_llm()
        if llm_client is not None:
            answer_parsed = await self._try_layer2(answer, lang, ctx, ref_date, answer_l1, llm_client)
        else:
            answer_parsed = answer_l1

        merged: dict[str, Any] = {
            "work_date": prev.work_date,
            "site_name": answer_parsed.get("site_name") or prev.site_name,
            "counterparty_name": answer_parsed.get("counterparty_name") or prev.counterparty_name,
            "work_type": answer_parsed.get("work_type") or prev.work_type,
            "hours": answer_parsed.get("hours") if answer_parsed.get("hours") is not None else prev.hours,
            "days": answer_parsed.get("days") if answer_parsed.get("days") is not None else prev.days,
            "agreed_amount_inr": prev.agreed_amount_inr,
            "paid_amount_inr": prev.paid_amount_inr,
            "stated_due_amount_inr": prev.stated_due_amount_inr,
            "field_confidence": dict(prev.field_confidence),
            "language": lang,
        }

        target = prev.needs_clarification[0] if prev.needs_clarification else "paid_amount_inr"
        # Check if answer explicitly flagged agreed vs paid, else route a bare amount to the asked field.
        new_agreed = answer_parsed.get("agreed_amount_inr")
        new_paid = answer_parsed.get("paid_amount_inr")
        new_due = answer_parsed.get("stated_due_amount_inr")

        expanded_ans = _replace_number_words_with_digits(normalize_indic_digits(answer))
        bare_nums = [_clean_num(float(n.replace(",", ""))) for n in re.findall(r"\b\d+(?:,\d+)*(?:\.\d+)?\b", expanded_ans)]

        if target == "agreed_amount_inr":
            if new_agreed is not None:
                merged["agreed_amount_inr"] = new_agreed
            elif bare_nums:
                merged["agreed_amount_inr"] = bare_nums[0]
        elif target == "paid_amount_inr":
            # In a paid>agreed clarification ("paid_amount_inr" with agreed < paid), allow fixing either agreed or paid.
            if new_agreed is not None and prev.paid_amount_inr is not None and prev.agreed_amount_inr is not None and prev.paid_amount_inr > prev.agreed_amount_inr:
                merged["agreed_amount_inr"] = new_agreed
            elif new_paid is not None:
                merged["paid_amount_inr"] = new_paid
            elif bare_nums:
                merged["paid_amount_inr"] = bare_nums[0]
        elif target == "due_amount_inr":
            if new_agreed is not None:
                merged["agreed_amount_inr"] = new_agreed
            if new_paid is not None:
                merged["paid_amount_inr"] = new_paid
            if new_due is not None:
                merged["stated_due_amount_inr"] = new_due
            elif new_agreed is not None or new_paid is not None:
                merged["stated_due_amount_inr"] = None
            elif bare_nums:
                merged["stated_due_amount_inr"] = bare_nums[0]
        elif target == "hours" and merged["hours"] is None and bare_nums:
            merged["hours"] = bare_nums[0]

        return _apply_layer3_checks(merged, lang, ctx.turn_count)
