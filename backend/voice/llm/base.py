"""Pluggable Layer-2 LLM client Protocol."""

from __future__ import annotations

from typing import Any, Protocol


class LlmClient(Protocol):
    """Structured JSON extraction client (implemented by GeminiClient and OllamaClient)."""

    async def extract_json(
        self, prompt: str, schema: dict[str, Any]
    ) -> dict[str, Any]: ...

