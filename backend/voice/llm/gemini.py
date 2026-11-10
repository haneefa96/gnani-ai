"""Gemini REST generateContent JSON extraction client (no hard-coded model name)."""

from __future__ import annotations

import asyncio
import json
from typing import Any, Sequence

import httpx

from ..errors import ErrorCode, VoiceError

_DEFAULT_GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
_RETRYABLE_STATUS_CODES = frozenset({500, 502, 503, 504})
_FAILOVER_STATUS_CODES = frozenset({404, 429, 500, 502, 503, 504})


def to_gemini_response_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Convert standard JSON Schema subset into Gemini OpenAPI-3.0 responseSchema."""
    if not isinstance(schema, dict):
        return {}

    raw_type = schema.get("type")
    nullable = False
    if isinstance(raw_type, list):
        non_null = [t for t in raw_type if t != "null"]
        nullable = "null" in raw_type
        raw_type = non_null[0] if non_null else "string"

    type_map = {
        "object": "OBJECT",
        "array": "ARRAY",
        "string": "STRING",
        "number": "NUMBER",
        "integer": "INTEGER",
        "boolean": "BOOLEAN",
    }
    out: dict[str, Any] = {}
    if isinstance(raw_type, str):
        out["type"] = type_map.get(raw_type.lower(), raw_type.upper())
    if nullable:
        out["nullable"] = True
    if "enum" in schema:
        out["enum"] = list(schema["enum"])
    if "description" in schema:
        out["description"] = schema["description"]
    if "properties" in schema and isinstance(schema["properties"], dict):
        out["properties"] = {
            k: to_gemini_response_schema(v) for k, v in schema["properties"].items()
        }
    if "required" in schema and isinstance(schema["required"], list):
        out["required"] = list(schema["required"])
    if "items" in schema and isinstance(schema["items"], dict):
        out["items"] = to_gemini_response_schema(schema["items"])
    return out


class GeminiClient:
    """Async httpx client for Gemini REST generateContent with strict JSON schema output."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        fallback_models: Sequence[str] = (),
        base_url: str = _DEFAULT_GEMINI_API_BASE,
        timeout_s: float = 10.0,
        thinking_level: str = "",
        max_retries: int = 1,
        retry_backoff_s: float = 0.4,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if not api_key.strip():
            raise ValueError("GEMINI_API_KEY is required when VOICE_LLM_PROVIDER=gemini.")
        if not model.strip():
            raise ValueError("GEMINI_MODEL is required when VOICE_LLM_PROVIDER=gemini.")
        self._api_key = api_key.strip()
        self._model = model.strip()
        self._models: tuple[str, ...] = tuple(
            dict.fromkeys(
                m.strip() for m in (model, *fallback_models) if m and m.strip()
            )
        )
        self._base_url = (base_url or _DEFAULT_GEMINI_API_BASE).strip().rstrip("/")
        self._timeout_s = timeout_s
        self._thinking_level = thinking_level.strip()
        self._max_retries = max(0, max_retries)
        self._retry_backoff_s = max(0.0, retry_backoff_s)
        self._transport = transport
        self.last_used_model: str = ""

    def __repr__(self) -> str:  # pragma: no cover - redact key
        return f"GeminiClient(model={self._model!r}, timeout_s={self._timeout_s!r})"

    async def _post_model(
        self,
        client: httpx.AsyncClient,
        model_name: str,
        headers: dict[str, str],
        body: dict[str, Any],
    ) -> httpx.Response:
        """Send generateContent for a single model with transient retry and 400 thinkingConfig fallback."""
        url = f"{self._base_url}/{model_name}:generateContent"
        req_body = body
        stripped_thinking = False
        for attempt in range(self._max_retries + 1):
            try:
                resp = await client.post(url, headers=headers, json=req_body)
            except httpx.TimeoutException as exc:
                raise VoiceError(
                    ErrorCode.EXTRACTION_FAILED,
                    "Gemini request timed out.",
                    status_code=502,
                ) from exc
            except (httpx.ConnectError, httpx.RemoteProtocolError) as exc:
                if attempt < self._max_retries:
                    if self._retry_backoff_s > 0:
                        await asyncio.sleep(self._retry_backoff_s * (2**attempt))
                    continue
                raise VoiceError(
                    ErrorCode.EXTRACTION_FAILED,
                    "Gemini request failed.",
                    status_code=502,
                ) from exc
            except httpx.HTTPError as exc:
                raise VoiceError(
                    ErrorCode.EXTRACTION_FAILED,
                    "Gemini request failed.",
                    status_code=502,
                ) from exc

            # Some models reject thinkingConfig with HTTP 400; retry once without it.
            if (
                resp.status_code == 400
                and not stripped_thinking
                and "thinkingConfig" in req_body.get("generationConfig", {})
            ):
                gen_cfg = dict(req_body["generationConfig"])
                gen_cfg.pop("thinkingConfig", None)
                req_body = {**req_body, "generationConfig": gen_cfg}
                stripped_thinking = True
                resp = await client.post(url, headers=headers, json=req_body)

            if resp.status_code in _RETRYABLE_STATUS_CODES and attempt < self._max_retries:
                if self._retry_backoff_s > 0:
                    await asyncio.sleep(self._retry_backoff_s * (2**attempt))
                continue
            return resp

        raise VoiceError(ErrorCode.EXTRACTION_FAILED, "Gemini request failed.", status_code=502)

    async def extract_json(
        self, prompt: str, schema: dict[str, Any]
    ) -> dict[str, Any]:
        generation_config: dict[str, Any] = {
            "temperature": 0,
            "responseMimeType": "application/json",
            "responseSchema": to_gemini_response_schema(schema),
        }
        if self._thinking_level:
            generation_config["thinkingConfig"] = {
                "thinkingLevel": self._thinking_level,
            }
        body = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": generation_config,
        }
        headers = {
            "x-goog-api-key": self._api_key,
            "Content-Type": "application/json",
        }

        resp: httpx.Response | None = None
        last_err: VoiceError | None = None
        async with httpx.AsyncClient(
            transport=self._transport, timeout=self._timeout_s
        ) as client:
            for idx, model_name in enumerate(self._models):
                has_fallback = idx < len(self._models) - 1
                try:
                    candidate = await self._post_model(client, model_name, headers, body)
                except VoiceError as exc:
                    last_err = exc
                    if has_fallback:
                        continue
                    raise

                if candidate.status_code == 200:
                    resp = candidate
                    self.last_used_model = model_name
                    break

                err = (
                    VoiceError(ErrorCode.RATE_LIMITED, "Gemini rate limit reached.", status_code=429)
                    if candidate.status_code == 429
                    else VoiceError(
                        ErrorCode.EXTRACTION_FAILED,
                        f"Gemini returned HTTP {candidate.status_code}.",
                        status_code=502,
                    )
                )
                last_err = err
                if candidate.status_code in _FAILOVER_STATUS_CODES and has_fallback:
                    continue
                raise err

        if resp is None:
            raise last_err or VoiceError(
                ErrorCode.EXTRACTION_FAILED, "Gemini request failed.", status_code=502
            )

        try:
            data = resp.json()
            parts = data["candidates"][0]["content"]["parts"]
            text = next(
                (
                    p["text"]
                    for p in reversed(parts)
                    if isinstance(p, dict)
                    and not p.get("thought")
                    and isinstance(p.get("text"), str)
                ),
                None,
            )
            if text is None:
                raise ValueError("Missing text part")
            parsed = json.loads(text)
        except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise VoiceError(
                ErrorCode.EXTRACTION_FAILED,
                "Gemini response was not valid JSON.",
                status_code=502,
            ) from exc

        if not isinstance(parsed, dict):
            raise VoiceError(
                ErrorCode.EXTRACTION_FAILED,
                "Gemini JSON response must be an object.",
                status_code=502,
            )
        return parsed

