"""TTS text normalisation and Indian number-word lookup tables (hi, kn, bn, en)."""

from __future__ import annotations

import re

from .models import SupportedLanguage, normalize_language

# Explicit 0-99 lookup tables for irregular Indic number names (also reused reversed in P9).
HI_0_99: tuple[str, ...] = (
    "शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ",
    "दस", "ग्यारह", "बारह", "तेरह", "चौदह", "पंद्रह", "सोलह", "सत्रह", "अठारह", "उन्नीस",
    "बीस", "इक्कीस", "बाईस", "तेईस", "चौबीस", "पच्चीस", "छब्बीस", "सत्ताईस", "अट्ठाईस", "उनतीस",
    "तीस", "इकतीस", "बत्तीस", "तैंतीस", "चौंतीस", "पैंतीस", "छत्तीस", "सैंतीस", "अड़तीस", "उनतालीस",
    "चालीस", "इकतालीस", "बयालीस", "तैंतालीस", "चवालीस", "पैंतालीस", "छियालीस", "सैंतालीस", "अड़तालीस", "उनचास",
    "पचास", "इक्यावन", "बावन", "तिरपन", "चौवन", "पचपन", "छप्पन", "सत्तावन", "अट्ठावन", "उनसठ",
    "साठ", "इकसठ", "बासठ", "तिरसठ", "चौंसठ", "पैंसठ", "छियासठ", "सड़सठ", "अड़सठ", "उनहत्तर",
    "सत्तर", "इकहत्तर", "बहत्तर", "तिहत्तर", "चौहत्तर", "पचहत्तर", "छिहत्तर", "सतहत्तर", "अठहत्तर", "उनासी",
    "अस्सी", "इक्यासी", "बयासी", "तिरासी", "चौरासी", "पचासी", "छियासी", "सत्तासी", "अट्ठासी", "नवासी",
    "नब्बे", "इक्यानवे", "बानवे", "तिरानवे", "चौरानवे", "पचानवे", "छियानवे", "सत्तानवे", "अट्ठानवे", "निन्यानवे",
)

BN_0_99: tuple[str, ...] = (
    "শূন্য", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়",
    "দশ", "এগারো", "বারো", "তেরো", "চৌদ্দ", "পনেরো", "ষোলো", "সতেরো", "আঠারো", "উনিশ",
    "বিশ", "একুশ", "বাইশ", "তেইশ", "চব্বিশ", "পঁচিশ", "ছাব্বিশ", "সাতাশ", "আটাশ", "ঊনত্রিশ",
    "ত্রিশ", "একত্রিশ", "বত্রিশ", "তেত্রিশ", "চৌত্রিশ", "পঁয়ত্রিশ", "ছত্রিশ", "সাঁইত্রিশ", "আটত্রিশ", "ঊনচল্লিশ",
    "চল্লিশ", "একচল্লিশ", "বিয়াল্লিশ", "তেতাল্লিশ", "চুয়াল্লিশ", "পঁয়তাল্লিশ", "ছেচল্লিশ", "সাতচল্লিশ", "আটচল্লিশ", "ঊনপঞ্চাশ",
    "পঞ্চাশ", "একান্ন", "বাহান্ন", "তিপ্পান্ন", "চুয়ান্ন", "পঞ্চান্ন", "ছাপ্পান্ন", "সাতান্ন", "আটান্ন", "ঊনষাট",
    "ষাট", "একষট্টি", "বাষট্টি", "তেষট্টি", "চৌষট্টি", "পঁয়ষট্টি", "ছেষট্টি", "সাতষট্টি", "আটষট্টি", "ঊনসত্তর",
    "সত্তর", "একাত্তর", "বাহাত্তর", "তিয়াত্তর", "চুয়াত্তর", "পঁচাত্তর", "ছিয়াত্তর", "সাতাত্তর", "আটাত্তর", "ঊনাশি",
    "আশি", "একাশি", "বিরাশি", "তিরাশি", "চুরাশি", "পঁচাশি", "ছিয়াশি", "সাতাশি", "আটাশি", "ঊননব্বই",
    "নব্বই", "একানব্বই", "বিরানব্বই", "তিরানব্বই", "চুরানব্বই", "পঁচানব্বই", "ছিয়ানব্বই", "সাতানব্বই", "আটানব্বই", "নিরানব্বই",
)

KN_0_19: tuple[str, ...] = (
    "ಸೊನ್ನೆ", "ಒಂದು", "ಎರಡು", "ಮೂರು", "ನಾಲ್ಕು", "ಐದು", "ಆರು", "ಏಳು", "ಎಂಟು", "ಒಂಬತ್ತು",
    "ಹತ್ತು", "ಹನ್ನೊಂದು", "ಹನ್ನೆರಡು", "ಹದಿಮೂರು", "ಹದಿನಾಲ್ಕು", "ಹದಿನೈದು", "ಹದಿನಾರು", "ಹದಿನೇಳು", "ಹದಿನೆಂಟು", "ಹತ್ತೊಂಬತ್ತು",
)
KN_TENS_EXACT: dict[int, str] = {
    20: "ಇಪ್ಪತ್ತು",
    30: "ಮೂವತ್ತು",
    40: "ನಲವತ್ತು",
    50: "ಐವತ್ತು",
    60: "ಅರವತ್ತು",
    70: "ಎಪ್ಪತ್ತು",
    80: "ಎಂಬತ್ತು",
    90: "ತೊಂಬತ್ತು",
}
KN_TENS_PREFIX: dict[int, str] = {
    20: "ಇಪ್ಪತ್ತ",
    30: "ಮೂವತ್ತ",
    40: "ನಲವತ್ತ",
    50: "ಐವತ್ತ",
    60: "ಅರವತ್ತ",
    70: "ಎಪ್ಪತ್ತ",
    80: "ಎಂಬತ್ತ",
    90: "ತೊಂಬತ್ತ",
}


_KN_UNIT_SUFFIXES: tuple[str, ...] = (
    "", "ೊಂದು", "ೆರಡು", "ಮೂರು", "ನಾಲ್ಕು", "ೈದು", "ಾರು", "ೇಳು", "ೆಂಟು", "ೊಂಬತ್ತು"
)


def _build_kn_0_99() -> tuple[str, ...]:
    items = list(KN_0_19)
    for n in range(20, 100):
        ten = (n // 10) * 10
        unit = n % 10
        if unit == 0:
            items.append(KN_TENS_EXACT[ten])
        else:
            items.append(f"{KN_TENS_PREFIX[ten]}{_KN_UNIT_SUFFIXES[unit]}")
    return tuple(items)


KN_0_99: tuple[str, ...] = _build_kn_0_99()

EN_0_19: tuple[str, ...] = (
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
)
EN_TENS: dict[int, str] = {
    20: "twenty",
    30: "thirty",
    40: "forty",
    50: "fifty",
    60: "sixty",
    70: "seventy",
    80: "eighty",
    90: "ninety",
}


def _build_en_0_99() -> tuple[str, ...]:
    items = list(EN_0_19)
    for n in range(20, 100):
        ten, unit = (n // 10) * 10, n % 10
        items.append(EN_TENS[ten] if unit == 0 else f"{EN_TENS[ten]} {EN_0_19[unit]}")
    return tuple(items)


EN_0_99: tuple[str, ...] = _build_en_0_99()

_KN_HUNDREDS: dict[int, str] = {
    1: "ನೂರು",
    2: "ಇನ್ನೂರು",
    3: "ಮುನ್ನೂರು",
    4: "ನಾನ್ನೂರು",
    5: "ಐನೂರು",
    6: "ಆರುನೂರು",
    7: "ಏಳುನೂರು",
    8: "ಎಂಟುನೂರು",
    9: "ಒಂಬೈನೂರು",
}

_TABLES_0_99: dict[SupportedLanguage, tuple[str, ...]] = {
    "hi-IN": HI_0_99,
    "kn-IN": KN_0_99,
    "bn-IN": BN_0_99,
    "en-IN": EN_0_99,
}

_UNITS: dict[SupportedLanguage, dict[str, str]] = {
    "hi-IN": {"hundred": "सौ", "thousand": "हज़ार", "lakh": "लाख", "crore": "करोड़"},
    "kn-IN": {"hundred": "ನೂರು", "thousand": "ಸಾವಿರ", "lakh": "ಲಕ್ಷ", "crore": "ಕೋಟಿ"},
    "bn-IN": {"hundred": "শো", "thousand": "হাজার", "lakh": "লাখ", "crore": "কোটি"},
    "en-IN": {"hundred": "hundred", "thousand": "thousand", "lakh": "lakh", "crore": "crore"},
}

_MONTH_NAMES: dict[SupportedLanguage, tuple[str, ...]] = {
    "hi-IN": (
        "", "जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून",
        "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर",
    ),
    "kn-IN": (
        "", "ಜನವರಿ", "ಫೆಬ್ರವರಿ", "ಮಾರ್ಚ್", "ಏಪ್ರಿಲ್", "ಮೇ", "ಜೂನ್",
        "ಜುಲೈ", "ಆಗಸ್ಟ್", "ಸೆಪ್ಟೆಂಬರ್", "ಅಕ್ಟೋಬರ್", "ನವೆಂಬರ್", "ಡಿಸೆಂಬರ್",
    ),
    "bn-IN": (
        "", "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
        "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
    ),
    "en-IN": (
        "", "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ),
}

_CURRENCY_WORD: dict[SupportedLanguage, str] = {
    "hi-IN": "रुपये",
    "kn-IN": "ರೂಪಾಯಿ",
    "bn-IN": "টাকা",
    "en-IN": "rupees",
}
_PAISE_WORD: dict[SupportedLanguage, str] = {
    "hi-IN": "पैसे",
    "kn-IN": "ಪೈಸೆ",
    "bn-IN": "পয়সা",
    "en-IN": "paise",
}
_HOURS_WORD: dict[SupportedLanguage, str] = {
    "hi-IN": "घंटे",
    "kn-IN": "ಗಂಟೆ",
    "bn-IN": "ঘণ্টা",
    "en-IN": "hours",
}

_INDIC_DIGIT_TRANS = str.maketrans("०१२३४५६७८९೦೧೨೩೪೫೬೭೮೯০১২৩৪৫৬৭৮৯", "0123456789" * 3)

_RE_ISO_DATE = re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b")
_RE_DMY_DATE = re.compile(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b")
_RE_RUPEE = re.compile(
    r"(?:₹|Rs\.?|INR)\s*([0-9][0-9,]*(?:\.[0-9]+)?)|([0-9][0-9,]*(?:\.[0-9]+)?)\s*/-"
)
_RE_HOURS = re.compile(
    r"\b([0-9]+(?:\.[0-9]+)?)\s*(?:hours?|hrs?|ghante|ghanta|ghanto|घंटे|घंटा|ಗಂಟೆ|ঘণ্টা)(?!\w)",
    re.IGNORECASE,
)
_RE_NUMBER = re.compile(r"\b([0-9][0-9,]*(?:\.[0-9]+)?)\b")


def normalize_indic_digits(text: str) -> str:
    """Convert Devanagari, Kannada, and Bengali digits to ASCII 0-9."""
    return text.translate(_INDIC_DIGIT_TRANS)


def _format_hundreds(n: int, lang: SupportedLanguage) -> str:
    """Format 1..999 in the target language."""
    table = _TABLES_0_99[lang]
    if n < 100:
        return table[n]
    h = n // 100
    rem = n % 100
    if lang == "kn-IN":
        prefix = _KN_HUNDREDS[h]
        if rem == 0:
            return prefix
        # Kannada connects e.g. ಏಳು ನೂರು + ಐವತ್ತು naturally as space-separated spoken words.
        return f"{prefix} {table[rem]}"
    if lang == "bn-IN" and h == 1:
        head = "একশো"
    else:
        head = f"{table[h]} {_UNITS[lang]['hundred']}"
    return head if rem == 0 else f"{head} {table[rem]}"


def number_to_words(n: int, lang: str) -> str:
    """Convert an integer 0..99,99,99,999 into spoken words using Indian grouping."""
    norm_lang = normalize_language(lang)
    if n < 0:
        minus = {"hi-IN": "माइनस", "kn-IN": "ಮೈನಸ್", "bn-IN": "মাইনাস", "en-IN": "minus"}[norm_lang]
        return f"{minus} {number_to_words(-n, norm_lang)}"

    table = _TABLES_0_99[norm_lang]
    if n < 100:
        return table[n]

    if n > 99_99_99_999:
        # Fallback digit-by-digit beyond 99 crore.
        return " ".join(table[int(d)] for d in str(n))

    units = _UNITS[norm_lang]
    parts: list[str] = []

    crore = n // 1_00_00_000
    n %= 1_00_00_000
    if crore:
        parts.append(f"{number_to_words(crore, norm_lang)} {units['crore']}")

    lakh = n // 1_00_000
    n %= 1_00_000
    if lakh:
        parts.append(f"{table[lakh]} {units['lakh']}")

    thousand = n // 1_000
    n %= 1_000
    if thousand:
        parts.append(f"{table[thousand]} {units['thousand']}")

    if n:
        parts.append(_format_hundreds(n, norm_lang))

    return " ".join(parts)


def decimal_to_words(raw_num: str, lang: SupportedLanguage) -> str:
    """Convert integer or decimal numeric string (with optional commas) into spoken words."""
    clean = raw_num.replace(",", "")
    if "." not in clean:
        return number_to_words(int(clean), lang)

    int_part, frac_part = clean.split(".", 1)
    frac_part = frac_part.rstrip("0")
    head = number_to_words(int(int_part or "0"), lang)
    if not frac_part:
        return head
    point_word = {"hi-IN": "दशमलव", "kn-IN": "ಪಾಯಿಂಟ್", "bn-IN": "দশমিক", "en-IN": "point"}[lang]
    table = _TABLES_0_99[lang]
    frac_words = " ".join(table[int(ch)] for ch in frac_part)
    return f"{head} {point_word} {frac_words}"


def _format_date_match(day: int, month: int, year: int, lang: SupportedLanguage) -> str | None:
    if not (1 <= month <= 12 and 1 <= day <= 31):
        return None
    month_name = _MONTH_NAMES[lang][month]
    return f"{number_to_words(day, lang)} {month_name} {number_to_words(year, lang)}"


def _format_rupee(raw_num: str, lang: SupportedLanguage) -> str:
    clean = raw_num.replace(",", "")
    if "." not in clean:
        return f"{number_to_words(int(clean), lang)} {_CURRENCY_WORD[lang]}"
    whole_s, frac_s = clean.split(".", 1)
    paise = int((frac_s + "00")[:2])
    whole_words = f"{number_to_words(int(whole_s or '0'), lang)} {_CURRENCY_WORD[lang]}"
    if paise == 0:
        return whole_words
    and_word = {"hi-IN": "और", "kn-IN": "ಮತ್ತು", "bn-IN": "এবং", "en-IN": "and"}[lang]
    return f"{whole_words} {and_word} {number_to_words(paise, lang)} {_PAISE_WORD[lang]}"


def normalise_for_tts(text: str, lang: str) -> str:
    """Convert dates, rupee amounts, hours, and numbers in text into spoken form."""
    norm_lang = normalize_language(lang)
    out = normalize_indic_digits(text or "")

    def _iso_repl(m: re.Match[str]) -> str:
        year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return _format_date_match(day, month, year, norm_lang) or m.group(0)

    def _dmy_repl(m: re.Match[str]) -> str:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return _format_date_match(day, month, year, norm_lang) or m.group(0)

    def _rupee_repl(m: re.Match[str]) -> str:
        raw_num = m.group(1) or m.group(2)
        return _format_rupee(raw_num, norm_lang)

    def _hours_repl(m: re.Match[str]) -> str:
        return f"{decimal_to_words(m.group(1), norm_lang)} {_HOURS_WORD[norm_lang]}"

    def _num_repl(m: re.Match[str]) -> str:
        return decimal_to_words(m.group(1), norm_lang)

    out = _RE_ISO_DATE.sub(_iso_repl, out)
    out = _RE_DMY_DATE.sub(_dmy_repl, out)
    out = _RE_RUPEE.sub(_rupee_repl, out)
    out = _RE_HOURS.sub(_hours_repl, out)
    out = _RE_NUMBER.sub(_num_repl, out)
    return re.sub(r"\s+", " ", out).strip()
