"""Explicit demo-only voice implementation for local workflows and tests."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from contracts.voice_interface import ExtractContext, TranscriptionResult


DEMO_TRANSCRIPT = (
    "DEMO SAMPLE: Work at Demo Site with Demo Contractor on 2026-11-10; "
    "8 hours, agreed 1200 rupees, paid 300 rupees."
)


@dataclass(frozen=True)
class FakeEntryDraft:
    work_date: Optional[str]
    site_name: Optional[str]
    counterparty_name: Optional[str]
    work_type: Optional[str]
    hours: Optional[float]
    days: Optional[float]
    agreed_amount_inr: Optional[int]
    paid_amount_inr: Optional[int]
    due_amount_inr: Optional[int]
    field_confidence: Dict[str, float]
    needs_clarification: List[str]
    clarification_question: Optional[str]
    language: str
    detected_language_code: Optional[str]


class FakeVoice:
    """Return a fixed, visibly synthetic sample; never represents live STT."""

    async def transcribe_audio(
        self,
        audio: bytes,
        content_type: str,
        lang: str,
    ) -> TranscriptionResult:
        if not audio:
            raise ValueError("Audio is empty")
        return TranscriptionResult(
            transcript=DEMO_TRANSCRIPT,
            detected_language_code=lang,
        )

    async def extract_entry(
        self,
        transcript: str,
        lang: str,
        ctx: ExtractContext,
    ) -> FakeEntryDraft:
        if transcript != DEMO_TRANSCRIPT:
            return FakeEntryDraft(
                work_date=None,
                site_name=None,
                counterparty_name=None,
                work_type=None,
                hours=None,
                days=None,
                agreed_amount_inr=None,
                paid_amount_inr=None,
                due_amount_inr=None,
                field_confidence={},
                needs_clarification=[
                    "work_date",
                    "agreed_amount_inr",
                    "paid_amount_inr",
                ],
                clarification_question=(
                    "Please review and enter the work date, agreed wage, "
                    "and amount paid."
                ),
                language=lang,
                detected_language_code=lang,
            )

        return FakeEntryDraft(
            work_date="2026-11-10",
            site_name="Demo Site",
            counterparty_name="Demo Contractor",
            work_type=None,
            hours=8,
            days=None,
            agreed_amount_inr=1200,
            paid_amount_inr=300,
            due_amount_inr=900,
            field_confidence={
                "work_date": 1,
                "hours": 1,
                "agreed_amount_inr": 1,
                "paid_amount_inr": 1,
            },
            needs_clarification=[],
            clarification_question=None,
            language=lang,
            detected_language_code=lang,
        )

    async def synthesize(
        self,
        text: str,
        lang: str,
        voice: Optional[str] = None,
    ) -> bytes:
        raise NotImplementedError("Demo voice does not provide speech synthesis.")

    def build_readback(self, draft: FakeEntryDraft, lang: str) -> str:
        return (
            f"Demo entry for {draft.work_date}: {draft.hours} hours, "
            f"agreed {draft.agreed_amount_inr}, paid {draft.paid_amount_inr}."
        )
