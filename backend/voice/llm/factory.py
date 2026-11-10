"""Factory for selecting the Layer-2 LLM client from VoiceSettings."""

from __future__ import annotations

import httpx

from ..config import VoiceSettings, load_voice_settings

from .base import LlmClient
from .gemini import GeminiClient
from .ollama import OllamaClient


def get_llm_client(
    settings: VoiceSettings | None = None,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
) -> LlmClient | None:
    """Return configured LlmClient (gemini|ollama) or None when disabled/none."""
    cfg = settings or load_voice_settings()
    if not cfg.llm_enabled or cfg.llm_provider == "none":
        return None

    if cfg.llm_provider == "gemini":
        return GeminiClient(
            api_key=cfg.gemini_api_key,
            model=cfg.gemini_model,
            fallback_models=cfg.gemini_fallback_models,
            base_url=cfg.gemini_base_url,
            timeout_s=cfg.llm_timeout_s,
            thinking_level=cfg.gemini_thinking_level,
            transport=transport,
        )

    if cfg.llm_provider == "ollama":
        return OllamaClient(
            base_url=cfg.ollama_url,
            model=cfg.ollama_model,
            timeout_s=cfg.llm_timeout_s,
            transport=transport,
        )

    return None

