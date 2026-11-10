"""
Voice Interface Contract

This module defines the protocol that Developer B's app layer uses to communicate
with Developer A's voice/AI implementation.

Developer B selects between implementations using the VOICE_IMPL environment variable:
- "fake": uses FakeVoice (no network calls, returns fixture data)
- "gnani": uses GnaniVoice (real STT/TTS via Gnani API)
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Protocol, List, Dict, Optional
from datetime import datetime


class ExtractContext(ABC):
    """Context for the extraction process."""
    
    @property
    @abstractmethod
    def worker_id(self) -> str:
        """ID of the worker making the entry."""
        pass
    
    @property
    @abstractmethod
    def known_counterparties(self) -> List[str]:
        """List of known contractor names for the worker."""
        pass
    
    @property
    @abstractmethod
    def known_sites(self) -> List[str]:
        """List of known work sites for the worker."""
        pass


class EntryDraft(ABC):
    """A draft entry extracted from a voice recording."""
    
    @property
    @abstractmethod
    def work_date(self) -> str:
        """Date of work in YYYY-MM-DD format."""
        pass
    
    @property
    @abstractmethod
    def site_name(self) -> Optional[str]:
        """Name of the work site/location."""
        pass
    
    @property
    @abstractmethod
    def counterparty_name(self) -> Optional[str]:
        """Name of the contractor/supervisor."""
        pass
    
    @property
    @abstractmethod
    def work_type(self) -> Optional[str]:
        """Type of work performed."""
        pass
    
    @property
    @abstractmethod
    def hours(self) -> Optional[float]:
        """Number of hours worked."""
        pass
    
    @property
    @abstractmethod
    def days(self) -> Optional[float]:
        """Number of days worked."""
        pass
    
    @property
    @abstractmethod
    def agreed_amount_inr(self) -> Optional[int]:
        """Amount agreed upon for the work."""
        pass
    
    @property
    @abstractmethod
    def paid_amount_inr(self) -> Optional[int]:
        """Amount already paid."""
        pass
    
    @property
    @abstractmethod
    def due_amount_inr(self) -> int:
        """Amount still due (calculated: agreed - paid)."""
        pass
    
    @property
    @abstractmethod
    def field_confidence(self) -> Dict[str, float]:
        """Confidence scores for each extracted field (0-1)."""
        pass
    
    @property
    @abstractmethod
    def needs_clarification(self) -> List[str]:
        """List of fields that need clarification."""
        pass
    
    @property
    @abstractmethod
    def clarification_question(self) -> Optional[str]:
        """Question to ask worker for clarification."""
        pass
    
    @property
    @abstractmethod
    def language(self) -> str:
        """Language code of the recording."""
        pass
    
    @property
    @abstractmethod
    def detected_language_code(self) -> Optional[str]:
        """Detected language code from STT."""
        pass


class VoiceService(Protocol):
    """
    Protocol for voice/AI services.
    
    Developer A implements this with:
    - GnaniVoice: real integration with Gnani STT/TTS
    - FakeVoice: mock implementation using fixtures
    
    Developer B selects via VOICE_IMPL environment variable.
    """
    
    @abstractmethod
    async def extract_entry(
        self,
        transcript: str,
        lang: str,
        ctx: ExtractContext
    ) -> EntryDraft:
        """
        Extract structured entry data from a transcript.
        
        Layer 1 (rules): regex for amounts and hours
        Layer 2 (LLM): open-weights model via Ollama or free hosted tier
        Layer 3 (checks): validation and clarification logic
        
        Must never invent values.
        
        Args:
            transcript: Transcribed speech from STT
            lang: Worker's language code
            ctx: Extraction context with worker info
            
        Returns:
            EntryDraft with extracted fields
            
        Raises:
            ValueError: If extraction fails after all layers
        """
        pass
    
    @abstractmethod
    async def synthesize(
        self,
        text: str,
        lang: str,
        voice: Optional[str] = None
    ) -> bytes:
        """
        Synthesize speech from text.
        
        Args:
            text: Text to synthesize
            lang: Language code
            voice: Optional voice name (defaults to worker/contractor preset)
            
        Returns:
            Audio bytes (WAV or MP3 format)
        """
        pass
    
    @abstractmethod
    def build_readback(self, draft: EntryDraft, lang: str) -> str:
        """
        Build the read-back text for an entry draft.
        
        This text is spoken to the worker for confirmation.
        Numbers should be in spoken form, not digits.
        
        Args:
            draft: The entry draft to read back
            lang: Language code
            
        Returns:
            Read-back text ready for TTS
        """
        pass


# Cache key function for TTS
def tts_cache_key(text: str, lang: str, voice: Optional[str] = None) -> str:
    """
    Generate a cache key for TTS audio.
    
    Args:
        text: Text to synthesize
        lang: Language code
        voice: Optional voice name
        
    Returns:
        Hash string for cache lookup
    """
    import hashlib
    content = f"{text}|{lang}|{voice or 'default'}"
    return hashlib.sha256(content.encode()).hexdigest()
