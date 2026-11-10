"""Local Ollama HTTP client for Layer-2 JSON extraction (no hard-coded model name)."""

from __future__ import annotations

import json
from typing import Any

import httpx

from ..errors import ErrorCode, VoiceError


class OllamaClient:
    """Async httpx client for Ollama /api/chat with temperature=0 and JSON schema format."""

    def __init__(
        self,
        *,
        base_url: str,
        model: str,
        timeout_s: float = 10.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if not base_url.strip():
            raise ValueError("OLLAMA_URL is required when VOICE_LLM_PROVIDER=ollama.")
        if not model.strip():
            raise ValueError("OLLAMA_MODEL is required when VOICE_LLM_PROVIDER=ollama.")
        self._base_url = base_url.rstrip("/")
        self._model = model.strip()
        self._timeout_s = timeout_s
        self._transport = transport

    async def extract_json(
        self, prompt: str, schema: dict[str, Any]
    ) -> dict[str, Any]:
        url = f"{self._base_url}/api/chat"
        body = {
            "model": self._model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "format": schema,
            "options": {"temperature": 0},
        }
        try:
            async with httpx.AsyncClient(
                transport=self._transport, timeout=self._timeout_s
            ) as client:
                resp = await client.post(url, json=body)
        except httpx.HTTPError as exc:
            raise VoiceError(
                ErrorCode.EXTRACTION_FAILED, "Ollama request failed.", status_code=502
            ) from exc

        if resp.status_code != 200:
            raise VoiceError(
                ErrorCode.EXTRACTION_FAILED,
                f"Ollama returned HTTP {resp.status_code}.",
                status_code=502,
            )

        try:
            data = resp.json()
            content = data["message"]["content"]
            parsed = json.loads(content) if isinstance(content, str) else content
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise VoiceError(
                ErrorCode.EXTRACTION_FAILED,
                "Ollama response was not valid JSON.",
                status_code=502,
            ) from exc

        if not isinstance(parsed, dict):
            raise VoiceError(
                ErrorCode.EXTRACTION_FAILED,
                "Ollama JSON response must be an object.",
                status_code=502,
            )
        return parsed

