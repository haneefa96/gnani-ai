"""GnaniVoice service implementing VoiceService plus classify_confirmation."""

from __future__ import annotations

from .config import VoiceSettings, load_voice_settings
from .confirmation import classify_confirmation as _classify_confirmation
from .extractor import EntryExtractor
from .gnani_tts import GnaniTtsClient
from .llm import LlmClient
from .models import ConfirmationResult, EntryDraft, ExtractContext
from .readback import ReadbackAudience, build_readback as _build_readback


class GnaniVoice:
    """Production VoiceService combining EntryExtractor, GnaniTtsClient, readback, and confirmation."""

    def __init__(
        self,
        settings: VoiceSettings | None = None,
        *,
        tts_client: GnaniTtsClient | None = None,
        llm_client: LlmClient | None = None,
    ) -> None:
        self._settings = settings or load_voice_settings()
        self._extractor = EntryExtractor(settings=self._settings, llm_client=llm_client)
        self._tts = tts_client or GnaniTtsClient(settings=self._settings)

    async def extract_entry(
        self, transcript: str, lang: str, ctx: ExtractContext
    ) -> EntryDraft:
        return await self._extractor.extract(transcript, lang, ctx)

    async def synthesize(
        self,
        text: str,
        lang: str,
        voice: str | None = None,
        *,
        audience: ReadbackAudience = "worker",
    ) -> bytes:
        return await self._tts.synthesize(text, lang, voice=voice, audience=audience)

    def build_readback(
        self,
        draft: EntryDraft,
        lang: str,
        *,
        audience: ReadbackAudience = "worker",
    ) -> str:
        return _build_readback(draft, lang, audience=audience)

    def classify_confirmation(
        self, transcript: str, lang: str
    ) -> ConfirmationResult:
        return _classify_confirmation(transcript, lang)

