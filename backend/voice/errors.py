"""Voice error codes and browser error payload builders."""

from __future__ import annotations

from enum import Enum
from typing import TypedDict


class ErrorCode(str, Enum):
    """Canonical voice error codes mirrored in frontend/src/voice/types.ts."""

    RATE_LIMITED = "RATE_LIMITED"
    MIC_DENIED = "MIC_DENIED"
    STT_TIMEOUT = "STT_TIMEOUT"
    STT_CONNECTION_LOST = "STT_CONNECTION_LOST"
    TTS_FAILED = "TTS_FAILED"
    EXTRACTION_FAILED = "EXTRACTION_FAILED"
    UNSUPPORTED_LANGUAGE = "UNSUPPORTED_LANGUAGE"


class ErrorPayload(TypedDict):
    type: str
    code: str
    message: str


def build_error_payload(code: ErrorCode | str, message: str) -> ErrorPayload:
    """Build the standardized {type: 'error', code, message} JSON payload."""
    code_val = code.value if isinstance(code, ErrorCode) else ErrorCode(code).value
    return {
        "type": "error",
        "code": code_val,
        "message": message,
    }


class VoiceError(Exception):
    """Domain exception carrying a structured ErrorCode for API/WS responses."""

    def __init__(
        self, code: ErrorCode, message: str, *, status_code: int = 400
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code

    def to_payload(self) -> ErrorPayload:
        return build_error_payload(self.code, self.message)

