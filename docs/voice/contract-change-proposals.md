# Contract Change Proposals (`contract-change-proposals`)

Proposed diffs/additions to the joint files (`contracts/voice_interface.py`, `contracts/schemas/entry_draft.schema.json`, `contracts/api.openapi.yaml`) matching Developer A's implemented voice package.

---

## Proposal 1 — Separate `AudioStore` Protocol (Removed from `VoiceService`)
Target: `contracts/voice_interface.py`

```python
from typing import Literal, Protocol
from pydantic import BaseModel

AudioKind = Literal["narration", "confirm", "consent", "dispute"]

class SavedAudio(BaseModel):
    audio_ref: str
    sha256: str
    duration_ms: int

class AudioStore(Protocol):
    async def save_audio(self, data: bytes, kind: AudioKind) -> SavedAudio: ...
```

`VoiceService` remains focused on voice/AI:
```python
ConfirmationResult = Literal["yes", "no", "unclear"]

class VoiceService(Protocol):
    async def extract_entry(self, transcript: str, lang: str, ctx: ExtractContext) -> EntryDraft: ...
    async def synthesize(self, text: str, lang: str, voice: str | None = None) -> bytes: ...
    def build_readback(self, draft: EntryDraft, lang: str) -> str: ...
    def classify_confirmation(self, transcript: str, lang: str) -> ConfirmationResult: ...
```

---

## Proposal 2 — Voice Endpoint Shapes (`/ws/stt`, `/api/voice/tts`, `/api/voice/extract`, `/api/voice/classify-confirmation`)
Target: `contracts/api.openapi.yaml`

### `WS /ws/stt`
- **Query parameters**:
  - `lang`: `hi-IN | kn-IN | bn-IN | en-IN` (short aliases `hi|kn|bn|en` normalized server-side)
  - `mode`: `narration | confirm` (VAD preset)
  - `kind`: `narration | confirm | consent | dispute` (passed to `AudioStore.save_audio`)
  - `keyterms` (optional): JSON array or comma-separated list (forwarded only when `VOICE_KEYTERMS_ENABLED=true`)
- **Client → Server**:
  - Binary frames: raw 16 kHz mono PCM16 frames (1,024 bytes / 32 ms)
  - Final text frame: `{"type": "end"}`
- **Server → Client JSON**:
  - `{"type": "processing"}`
  - `{"type": "transcript", "text": "...", "detected_language_code": "hi-IN", "segment_index": 1, "latency_ms": 420}`
  - `{"type": "audio_saved", "audio_ref": "...", "sha256": "...", "duration_ms": 4120}`
  - `{"type": "error", "code": "RATE_LIMITED", "message": "..."}`

### `POST /api/voice/tts`
- Body: `{"text": "...", "lang": "hi-IN", "voice": null, "audience": "worker" | "contractor"}`
- Response: `audio/wav` or `audio/mpeg` with `Cache-Control`, `ETag`, `X-TTS-Cache` headers (or JSON error body `{type: "error", code, message}`).

### `POST /api/voice/extract`
- Body: `{"transcript": "...", "lang": "hi-IN", "context": ExtractContext}`
- Response: `EntryDraft` JSON.

### `POST /api/voice/classify-confirmation`
- Body: `{"transcript": "...", "lang": "hi-IN"}`
- Response: `{"result": "yes" | "no" | "unclear"}`.

---

## Proposal 3 — Clarification Context (`ExtractContext`)
Target: `contracts/voice_interface.py`

```python
class ExtractContext(BaseModel):
    work_date_ref: date | None = None
    known_counterparties: list[str] = Field(default_factory=list)
    known_sites: list[str] = Field(default_factory=list)
    previous_draft: EntryDraft | None = None
    clarification_answer: str | None = None
    turn_count: int = Field(default=0, ge=0)
```

---

## Proposal 4 — Shared `ErrorCode` Enum
Target: `contracts/voice_interface.py` and `contracts/api.openapi.yaml`

```python
class ErrorCode(str, Enum):
    RATE_LIMITED = "RATE_LIMITED"
    MIC_DENIED = "MIC_DENIED"
    STT_TIMEOUT = "STT_TIMEOUT"
    STT_CONNECTION_LOST = "STT_CONNECTION_LOST"
    TTS_FAILED = "TTS_FAILED"
    EXTRACTION_FAILED = "EXTRACTION_FAILED"
    UNSUPPORTED_LANGUAGE = "UNSUPPORTED_LANGUAGE"
```

Mirrored identically in `backend/voice/errors.py` and `frontend/src/voice/types.ts` (enforced by unit test).

---

## Proposal 5 — `EntryDraft` Schema & `compute_due`
Target: `contracts/schemas/entry_draft.schema.json` and `contracts/voice_interface.py`

```json
{
  "type": "object",
  "required": [
    "work_date",
    "site_name",
    "counterparty_name",
    "work_type",
    "hours",
    "days",
    "agreed_amount_inr",
    "paid_amount_inr",
    "due_amount_inr",
    "field_confidence",
    "needs_clarification",
    "clarification_question",
    "language"
  ],
  "properties": {
    "work_date": { "type": "string", "format": "date" },
    "site_name": { "type": ["string", "null"] },
    "counterparty_name": { "type": ["string", "null"] },
    "work_type": { "type": ["string", "null"] },
    "hours": { "type": ["number", "null"], "minimum": 0 },
    "days": { "type": ["number", "null"], "minimum": 0 },
    "agreed_amount_inr": { "type": ["number", "null"], "minimum": 0 },
    "paid_amount_inr": { "type": ["number", "null"], "minimum": 0 },
    "due_amount_inr": { "type": ["number", "null"], "minimum": 0 },
    "stated_due_amount_inr": { "type": ["number", "null"] },
    "field_confidence": {
      "type": "object",
      "additionalProperties": { "type": "number", "minimum": 0, "maximum": 1 }
    },
    "needs_clarification": {
      "type": "array",
      "items": { "type": "string" }
    },
    "clarification_question": { "type": ["string", "null"] },
    "language": { "type": "string", "enum": ["hi-IN", "kn-IN", "bn-IN", "en-IN"] },
    "manual_correction_required": { "type": "boolean", "default": false }
  },
  "additionalProperties": false
}
```

`compute_due(agreed, paid)` in `backend/voice/amounts.py` returns `None` if `agreed is None`, `paid is None`, `< 0`, or `paid > agreed`.

---

## Proposal 6 — `FakeVoice` Re-Export
Target: `contracts/fake_voice.py` (once B initializes `contracts/`)

`FakeVoice` and fixtures live in `backend/voice/fixtures/`; `contracts/fake_voice.py` should re-export `FakeVoice` from `backend.voice.fixtures.fake_voice`.
