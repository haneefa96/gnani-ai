"""Spoken read-back templates in native scripts for hi, kn, bn, en."""

from __future__ import annotations

from typing import Literal

from .amounts import compute_due
from .models import EntryDraft, SupportedLanguage, normalize_language
from .normalise import normalise_for_tts

ReadbackAudience = Literal["worker", "contractor"]

CONSENT_PROMPTS: dict[SupportedLanguage, str] = {
    "hi-IN": "आपका काम और मजदूरी का रिकॉर्ड सुरक्षित रखा जाएगा। यह केवल आपकी मर्ज़ी से साझा होगा। क्या आप सहमत हैं?",
    "kn-IN": "ನಿಮ್ಮ ಕೆಲಸ ಮತ್ತು ವೇತನದ ದಾಖಲೆಯನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ಇಡಲಾಗುವುದು. ನಿಮ್ಮ ಒಪ್ಪಿಗೆಯಿಂದ ಮಾತ್ರ ಹಂಚಿಕೊಳ್ಳಲಾಗುವುದು. ನೀವು ಒಪ್ಪುತ್ತೀರಾ?",
    "bn-IN": "আপনার কাজ ও মজুরির হিসাব নিরাপদে রাখা হবে। কেবল আপনার অনুমতিতেই এটি শেয়ার করা হবে। আপনি কি রাজি?",
    "en-IN": "Your work and wage record will be stored safely and shared only when you choose. Do you agree?",
}

RETRY_PROMPTS: dict[SupportedLanguage, str] = {
    "hi-IN": "आवाज़ साफ नहीं आई, कृपया फिर से बोलें।",
    "kn-IN": "ಧ್ವನಿ ಸ್ಪಷ್ಟವಾಗಿಲ್ಲ, ದಯವಿಟ್ಟು ಮತ್ತೆ ಹೇಳಿ.",
    "bn-IN": "কথা স্পষ্ট শোনা যায়নি, অনুগ্রহ করে আবার বলুন।",
    "en-IN": "Could not hear clearly, please speak again.",
}

_DEFAULT_SITE: dict[SupportedLanguage, str] = {
    "hi-IN": "कार्यस्थल",
    "kn-IN": "ಕೆಲಸದ ಸ್ಥಳ",
    "bn-IN": "কাজের সাইট",
    "en-IN": "the site",
}

_DEFAULT_CONTRACTOR: dict[SupportedLanguage, str] = {
    "hi-IN": "ठेकेदार",
    "kn-IN": "ಗುತ್ತಿಗೆದಾರ",
    "bn-IN": "ঠিকাদার",
    "en-IN": "the contractor",
}

_MISSING_AMOUNT: dict[SupportedLanguage, str] = {
    "hi-IN": "अज्ञात",
    "kn-IN": "ಗೊತ್ತಿಲ್ಲ",
    "bn-IN": "অজানা",
    "en-IN": "unspecified",
}


def _format_num_str(val: float | int | None, lang: SupportedLanguage) -> str:
    if val is None:
        return _MISSING_AMOUNT[lang]
    if isinstance(val, float) and val.is_integer():
        return str(int(val))
    return str(val)


def _duration_phrase(draft: EntryDraft, lang: SupportedLanguage) -> str:
    if draft.hours is not None:
        h_str = _format_num_str(draft.hours, lang)
        suffix = {"hi-IN": "घंटे", "kn-IN": "ಗಂಟೆ", "bn-IN": "ঘণ্টা", "en-IN": "hours"}[lang]
        return f"{h_str} {suffix}"
    if draft.days is not None:
        d_str = _format_num_str(draft.days, lang)
        suffix = {"hi-IN": "दिन", "kn-IN": "ದಿನ", "bn-IN": "দিন", "en-IN": "days"}[lang]
        return f"{d_str} {suffix}"
    return ""


def build_readback(
    draft: EntryDraft,
    lang: str,
    *,
    audience: ReadbackAudience = "worker",
) -> str:
    """Build a spoken native-script read-back with normalized numbers/dates."""
    norm_lang = normalize_language(lang)
    site = draft.site_name or _DEFAULT_SITE[norm_lang]
    contractor = draft.counterparty_name or _DEFAULT_CONTRACTOR[norm_lang]
    dur = _duration_phrase(draft, norm_lang)
    agreed_s = _format_num_str(draft.agreed_amount_inr, norm_lang)
    paid_s = _format_num_str(draft.paid_amount_inr, norm_lang)
    due = compute_due(draft.agreed_amount_inr, draft.paid_amount_inr)
    due_s = _format_num_str(due, norm_lang)
    date_s = draft.work_date.isoformat()

    if audience == "contractor":
        raw = _build_contractor_template(
            norm_lang, date_s, dur, site, agreed_s, paid_s, due_s
        )
    else:
        raw = _build_worker_template(
            norm_lang, date_s, dur, site, contractor, agreed_s, paid_s, due_s
        )
    return normalise_for_tts(raw, norm_lang)


def _build_worker_template(
    lang: SupportedLanguage,
    date_s: str,
    dur: str,
    site: str,
    contractor: str,
    agreed_s: str,
    paid_s: str,
    due_s: str,
) -> str:
    dur_part = f"{dur} " if dur else ""
    if lang == "hi-IN":
        return (
            f"तारीख {date_s} को आपने {dur_part}{site} पर {contractor} के साथ काम किया। "
            f"तय हुआ ₹{agreed_s}, मिले ₹{paid_s}, बाकी ₹{due_s}। क्या यह सही है?"
        )
    if lang == "kn-IN":
        return (
            f"ದಿನಾಂಕ {date_s} ರಂದು ನೀವು {site} ನಲ್ಲಿ {contractor} ಅವರೊಂದಿಗೆ {dur_part}ಕೆಲಸ ಮಾಡಿದ್ದೀರಿ. "
            f"ಒಪ್ಪಿದ ಹಣ ₹{agreed_s}, ಸಿಕ್ಕಿದ್ದು ₹{paid_s}, ಬಾಕಿ ₹{due_s}. ಇದು ಸರಿಯೇ?"
        )
    if lang == "bn-IN":
        return (
            f"তারিখ {date_s}-এ আপনি {site}-এ {contractor}-এর সাথে {dur_part}কাজ করেছেন। "
            f"ঠিক হয়েছে ₹{agreed_s}, পেয়েছেন ₹{paid_s}, বাকি ₹{due_s}। এটা কি ঠিক আছে?"
        )
    return (
        f"On {date_s}, you worked {dur_part}at {site} with {contractor}. "
        f"Agreed ₹{agreed_s}, paid ₹{paid_s}, due ₹{due_s}. Is this correct?"
    )


def _build_contractor_template(
    lang: SupportedLanguage,
    date_s: str,
    dur: str,
    site: str,
    agreed_s: str,
    paid_s: str,
    due_s: str,
) -> str:
    dur_part = f"{dur} " if dur else ""
    if lang == "hi-IN":
        return (
            f"तारीख {date_s} को {site} पर {dur_part}काम का विवरण दर्ज हुआ है। "
            f"तय रकम ₹{agreed_s}, भुगतान ₹{paid_s}, बकाया ₹{due_s}। क्या आप इसकी पुष्टि करते हैं?"
        )
    if lang == "kn-IN":
        return (
            f"ದಿನಾಂಕ {date_s} ರಂದು {site} ನಲ್ಲಿ {dur_part}ಕೆಲಸದ ವಿವರ ದಾಖಲಾಗಿದೆ. "
            f"ಒಪ್ಪಿದ ಮೊತ್ತ ₹{agreed_s}, ಪಾವತಿ ₹{paid_s}, ಬಾಕಿ ₹{due_s}. ನೀವು ಇದನ್ನು ದೃಢೀಕರಿಸುತ್ತೀರಾ?"
        )
    if lang == "bn-IN":
        return (
            f"তারিখ {date_s}-এ {site}-এ {dur_part}কাজের হিসাব নথিভুক্ত হয়েছে। "
            f"নির্ধারিত ₹{agreed_s}, পরিশোধ ₹{paid_s}, বাকি ₹{due_s}। আপনি কি এটি নিশ্চিত করছেন?"
        )
    return (
        f"Work record for {date_s} at {site}: {dur_part}work. "
        f"Agreed ₹{agreed_s}, paid ₹{paid_s}, due ₹{due_s}. Do you confirm this entry?"
    )

