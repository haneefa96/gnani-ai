"""Offline FakeVoice implementing VoiceService using local fixtures (zero network)."""

from __future__ import annotations

import json
import re
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from ..amounts import compute_due
from ..confirmation import classify_confirmation as _classify_confirmation
from ..models import (
    ConfirmationResult,
    EntryDraft,
    ExtractContext,
    SupportedLanguage,
    normalize_language,
)
from ..readback import build_readback as _build_readback

from .generate_audio import make_synthetic_wav

_FIXTURES_PATH = Path(__file__).resolve().parent / "entries.json"


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _load_fixtures() -> dict[str, Any]:
    return json.loads(_FIXTURES_PATH.read_text(encoding="utf-8"))


class FakeVoice:
    """Deterministic fixture-backed VoiceService for offline tests and Developer B."""

    def __init__(self, fixtures_path: Path | None = None) -> None:
        raw = (
            json.loads(fixtures_path.read_text(encoding="utf-8"))
            if fixtures_path is not None
            else _load_fixtures()
        )
        self._entries: list[dict[str, Any]] = list(raw.get("entries", []))
        self._confirmations: list[dict[str, Any]] = list(raw.get("confirmations", []))

    def list_fixtures(self) -> list[dict[str, Any]]:
        """Return raw fixture entries for test inspection."""
        return list(self._entries)

    async def extract_entry(
        self, transcript: str, lang: str, ctx: ExtractContext
    ) -> EntryDraft:
        norm_lang: SupportedLanguage = normalize_language(lang)
        ref_date = ctx.work_date_ref or date.today()

        if ctx.previous_draft is not None and ctx.clarification_answer:
            return self._apply_clarification(
                ctx.previous_draft, ctx.clarification_answer, ctx.turn_count
            )

        needle = _normalize_text(transcript)
        for item in self._entries:
            if _normalize_text(item["transcript"]) == needle:
                return self._materialize_draft(item, ref_date)

        nums = [int(n) for n in re.findall(r"\b\d+\b", transcript)]
        agreed = nums[1] if len(nums) >= 2 else (nums[0] if nums else None)
        paid = nums[2] if len(nums) >= 3 else (0 if agreed is not None else None)
        due = compute_due(agreed, paid)
        return EntryDraft(
            work_date=ref_date,
            hours=float(nums[0]) if len(nums) >= 3 else None,
            agreed_amount_inr=agreed,
            paid_amount_inr=paid,
            due_amount_inr=due,
            field_confidence={},
            needs_clarification=[] if agreed is not None else ["agreed_amount_inr"],
            clarification_question=None if agreed is not None else "What was the agreed amount?",
            language=norm_lang,
        )

    def _materialize_draft(self, item: dict[str, Any], ref_date: date) -> EntryDraft:
        offset = int(item.get("work_date_offset_days", 0))
        payload = dict(item["expected_draft"])
        payload["work_date"] = ref_date + timedelta(days=offset)
        payload["due_amount_inr"] = compute_due(
            payload.get("agreed_amount_inr"), payload.get("paid_amount_inr")
        )
        return EntryDraft.model_validate(payload)

    def _apply_clarification(
        self, prev: EntryDraft, answer: str, turn_count: int
    ) -> EntryDraft:
        nums = [float(n) for n in re.findall(r"\b\d+(?:\.\d+)?\b", answer)]
        updated = prev.model_copy(deep=True)
        if nums:
            val = int(nums[0]) if nums[0].is_integer() else nums[0]
            target = prev.needs_clarification[0] if prev.needs_clarification else "paid_amount_inr"
            if target == "agreed_amount_inr":
                updated.agreed_amount_inr = val
            elif target == "paid_amount_inr":
                updated.paid_amount_inr = val
            elif target == "due_amount_inr":
                updated.stated_due_amount_inr = val
            updated.due_amount_inr = compute_due(
                updated.agreed_amount_inr, updated.paid_amount_inr
            )
            if updated.due_amount_inr is not None:
                updated.needs_clarification = []
                updated.clarification_question = None
                return updated

        if turn_count >= 2:
            updated.manual_correction_required = True
        return updated

    async def synthesize(
        self, text: str, lang: str, voice: str | None = None
    ) -> bytes:
        normalize_language(lang)
        freq = 380.0 if (voice or "").lower() == "avinash" else 440.0
        duration = min(1.5, max(0.25, len(text.strip()) * 0.01))
        return make_synthetic_wav(duration_s=duration, freq_hz=freq)

    def build_readback(self, draft: EntryDraft, lang: str) -> str:
        return _build_readback(draft, lang)

    def classify_confirmation(
        self, transcript: str, lang: str
    ) -> ConfirmationResult:
        needle = _normalize_text(transcript)
        for item in self._confirmations:
            if _normalize_text(item["transcript"]) == needle:
                return item["expected"]
        return _classify_confirmation(transcript, lang)
