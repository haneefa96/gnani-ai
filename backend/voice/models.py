"""Pydantic v2 models and Protocols for the Saakshi voice layer."""

from __future__ import annotations

from datetime import date
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field

from .errors import ErrorCode, VoiceError

SupportedLanguage = Literal["hi-IN", "kn-IN", "bn-IN", "en-IN"]
VadMode = Literal["narration", "confirm"]
AudioKind = Literal["narration", "confirm", "consent", "dispute"]
ConfirmationResult = Literal["yes", "no", "unclear"]

_LANG_ALIASES: dict[str, SupportedLanguage] = {
    "hi": "hi-IN",
    "hi-in": "hi-IN",
    "kn": "kn-IN",
    "kn-in": "kn-IN",
    "bn": "bn-IN",
    "bn-in": "bn-IN",
    "en": "en-IN",
    "en-in": "en-IN",
}


def normalize_language(lang: str) -> SupportedLanguage:
    """Normalize short or BCP-47 language tags to supported Gnani Indian locales."""
    normalized = _LANG_ALIASES.get((lang or "").strip().lower())
    if normalized is None:
        raise VoiceError(
            ErrorCode.UNSUPPORTED_LANGUAGE,
            f"Unsupported language. Supported: hi-IN, kn-IN, bn-IN, en-IN.",
            status_code=400,
        )
    return normalized


class SavedAudio(BaseModel):
    """Metadata returned by AudioStore.save_audio."""

    audio_ref: str
    sha256: str
    duration_ms: int = Field(ge=0)


class EntryDraft(BaseModel):
    """Structured work/wage entry draft extracted from a worker voice utterance."""

    model_config = ConfigDict(extra="forbid")

    work_date: date
    site_name: str | None = None
    counterparty_name: str | None = None
    work_type: str | None = None
    hours: float | None = Field(default=None, ge=0)
    days: float | None = Field(default=None, ge=0)
    agreed_amount_inr: float | None = Field(default=None, ge=0)
    paid_amount_inr: float | None = Field(default=None, ge=0)
    due_amount_inr: float | None = Field(default=None, ge=0)
    stated_due_amount_inr: float | None = None
    field_confidence: dict[str, float] = Field(default_factory=dict)
    needs_clarification: list[str] = Field(default_factory=list)
    clarification_question: str | None = None
    language: SupportedLanguage
    manual_correction_required: bool = False


class ExtractContext(BaseModel):
    """Context supplied to entry extraction and clarification re-extraction."""

    work_date_ref: date | None = None
    known_counterparties: list[str] = Field(default_factory=list)
    known_sites: list[str] = Field(default_factory=list)
    previous_draft: EntryDraft | None = None
    clarification_answer: str | None = None
    turn_count: int = Field(default=0, ge=0)


class AudioStore(Protocol):
    """Async audio persistence interface implemented by Developer B."""

    async def save_audio(self, data: bytes, kind: AudioKind) -> SavedAudio: ...


class VoiceService(Protocol):
    """Voice & AI contract implemented by GnaniVoice and FakeVoice."""

    async def extract_entry(
        self, transcript: str, lang: str, ctx: ExtractContext
    ) -> EntryDraft: ...

    async def synthesize(
        self, text: str, lang: str, voice: str | None = None
    ) -> bytes: ...

    def build_readback(self, draft: EntryDraft, lang: str) -> str: ...

    def classify_confirmation(
        self, transcript: str, lang: str
    ) -> ConfirmationResult: ...

