# Layer-2 LLM Privacy & Consent Disclosure (`docs/voice/llm-privacy.md`)

## Data Flow by Provider (`VOICE_LLM_PROVIDER`)

| Provider | Where Transcript Goes | Data Sent | Data Never Sent |
| --- | --- | --- | --- |
| `gemini` (default) | Google Gemini API (`generativelanguage.googleapis.com`) | Transcript text + minimal context (`language`, `known_sites`, `known_counterparties`, and previous draft fields during clarification) | Raw audio, worker ID, phone number/alias, file paths, API keys |
| `ollama` | Local Ollama instance (`OLLAMA_URL`) | Same minimal transcript + context only | Same (stays on local host) |
| `none` / `VOICE_LLM_ENABLED=false` | Nowhere (Layer 1 regex only) | None | None |

---

## Mandatory Worker Consent Requirement (`provider=gemini`)

When `VOICE_LLM_PROVIDER=gemini` (and `VOICE_LLM_ENABLED=true`):
1. **Transcripts leave the device/server** and are transmitted to Google's Gemini REST endpoint for structured JSON extraction.
2. **Spoken and written onboarding consent text MUST explicitly disclose** that the worker's spoken transcript text may be processed by an external cloud AI service (`Gemini`) solely to convert speech into structured work/wage fields.
3. **Never log** prompts, transcripts, raw LLM responses, API keys, or local audio paths anywhere in application logs.
4. For fully offline / local-only deployments (no external LLM traffic), set `VOICE_LLM_PROVIDER=ollama` (with a local model in `OLLAMA_MODEL`) or `VOICE_LLM_ENABLED=false` to use deterministic Layer 1 extraction only.

