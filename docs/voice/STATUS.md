# Developer A Voice & AI Status (`docs/voice/STATUS.md`)

## Done (Verified Offline)
- [x] **P2 Core**: `backend/voice/{__init__,config,errors,models,amounts,storage_stub}.py`
  - `ErrorCode` enum + `{type:"error", code, message}` builder + Python/TypeScript mirror test (`test_error_code_matches_frontend_types_ts`).
  - Pydantic v2 `EntryDraft` (Section 7.4 + `stated_due_amount_inr` + `manual_correction_required`), `ExtractContext`, `AudioKind`, `SavedAudio`.
  - `compute_due(agreed, paid)` returning `None` on `None`, negatives, or `paid > agreed`.
  - Async `AudioStore` Protocol + `LocalAudioStore` writing 16 kHz mono PCM16 WAVs to `data/audio/` with `sha256` and `duration_ms`.
  - Configurable voices (`VOICE_TTS_VOICE_WORKER`, `VOICE_TTS_VOICE_CONTRACTOR`), models (`GNANI_STT_MODEL`, `GNANI_TTS_MODEL`), header style (`GNANI_HEADER_STYLE`), and timeouts (`VOICE_STT_TIMEOUT_S`, `VOICE_TTS_TIMEOUT_S`, `VOICE_LLM_TIMEOUT_S`).
- [x] **P3 Fixtures & `FakeVoice`**: `backend/voice/fixtures/{entries.json,fake_voice.py,generate_audio.py,audio/*.wav}`
  - **16 total fixture cases** (11 entry cases + 5 confirmation cases) across `hi-IN`, `kn-IN`, `bn-IN`, `en-IN` + 16 synthetic 16 kHz WAVs:
    - **10 entry cases** exercised across **Layer 1 + Layer 3** (`test_layer1_matches_all_10_entry_fixtures`, checking all fields including `work_date`, `site_name`, `counterparty_name`, `work_type`, `hours`, `days`, amounts, `needs_clarification`, `clarification_question`).
    - **1 `llm_only` entry case** (`hi_llm_only_implicit_half_16`) exercised through **mocked Layer 2 + Layer 3** (`test_llm_only_fixtures_with_layer2_and_layer3`).
    - **5 confirmation cases** exercised through `classify_confirmation` and `FakeVoice`.
    - **All 16 cases** exercised through `FakeVoice`.
- [x] **P5 STT Proxy**: `backend/voice/gnani_stt.py`, `backend/voice/router.py` (`WS /ws/stt`)
  - Single `build_stt_headers` function, env-overridable VAD presets, `\u`-escaped `keyterms`, 1,024-byte/32 ms pacing, `detected_language_code` + profile fallback, 429 exponential back-off, bounded `stt_timeout_s` wait after sender completion, `AudioStore` WAV persistence on `{"type":"end"}`, and `try/except` ErrorCode handling for unexpected storage/runtime errors.
- [x] **P7 Language Utilities**: `backend/voice/{normalise,readback,confirmation}.py`, `docs/voice/native-review.md`
  - `normalise_for_tts` (`hi`, `kn`, `bn`, `en`), native-script worker/contractor read-back templates, native + romanized `classify_confirmation`.
- [x] **P8 TTS**: `backend/voice/gnani_tts.py`, `POST /api/voice/tts` in `router.py`
  - `timbre-v3.0`, configurable worker/contractor voices & timeout, `speed`, `wav`/`mp3` config, 429 back-off, `data/tts_cache/` disk cache keyed by `sha256(text+voice+language+speed+format)`, `normalise_for_tts` before synthesis.
- [x] **P9 Extractor & Service**: `backend/voice/llm/{base,gemini,ollama,factory}.py`, `prompts/extract_entry.txt`, `extractor.py`, `service.py`, `POST /api/voice/extract`, `POST /api/voice/classify-confirmation`, `docs/voice/llm-privacy.md`
  - Layer 1 regex + reversed P7 number words, pluggable Layer 2 (`GeminiClient` REST `generateContent` default + `OllamaClient`, zero hard-coded model names, malformed-JSON guard + `VOICE_LLM_ENABLED=false` disable), Layer 3 checks, re-extraction, `manual_correction_required`.
- [x] **P6 Frontend**: `frontend/src/voice/{types.ts,pcm.ts,pcm.test.ts,recorder.worklet.ts,vite-assets.d.ts,useSttSocket.ts,VoiceButton.tsx,TtsPlayer.tsx,VoiceTestPage.tsx,routes.tsx}`
  - Verified in isolated `/tmp/saakshi-fe-check` project: `tsc --noEmit` (`strict: true`, `noUncheckedIndexedAccess: true`) passed with 0 errors, `vitest run` passed `4/4` tests, and `vite build` bundled `recorder.worklet-*.js` cleanly via `?worker&url`.
- [x] **P10 Eval**: `docs/voice/{recording-guide.md,eval-labels-template.csv,eval-results.md}`, `backend/voice/eval/{smoke_test.py,run_eval.py,ab_tuning.py}`.

---

## Assumed Voice Names, Models, Headers & API Field Names to Verify Live

| Area | File(s) | Assumed Value / Field Name | How to Verify |
| --- | --- | --- | --- |
| TTS default voices | `config.py`, `.env.example`, `smoke_test.py` | `VOICE_TTS_VOICE_WORKER="Shivani"`, `VOICE_TTS_VOICE_CONTRACTOR="Avinash"` | Listen in Gnani playground across `hi-IN`, `kn-IN`, `bn-IN`, `en-IN` |
| TTS model & payload | `config.py`, `gnani_tts.py`, `smoke_test.py` | `GNANI_TTS_MODEL="timbre-v3.0"`, endpoint `POST /api/v1/tts/inference`, header `X-API-Key-ID`, JSON `{text, voice, model, language, speed, audio_config: {sample_rate, num_channels, sample_width, encoding, container, bitrate}}` | Run `smoke_test.py` (`tts_rest_hi`, `tts_rest_kn`) |
| TTS WSS check | `config.py`, `smoke_test.py` | `wss://api.vachana.ai/api/v1/tts`, header `X-API-Key-ID`, chunks `audio` / `audio_chunk` / `data`, `is_final` | Run `smoke_test.py --test-tts-wss` |
| STT model & WS headers (legacy) | `config.py`, `gnani_stt.py`, `smoke_test.py` | `GNANI_STT_MODEL="prisma-v3.0"`, `x-api-key-id`, `x-model`, `lang_code`, `x-format`, `x-sample-rate`, `x-keyterms` | Run `smoke_test.py` (`ws_stt_legacy_headers`, `ws_both_probe_a/b`) |
| STT WS headers (new) | `gnani_stt.py`, `smoke_test.py` | `model`, `language_code`, `format`, `keyterms` (+ `x-sample-rate`) | Run `smoke_test.py` (`ws_stt_new_headers`, `ws_both_probe_a/b`) |
| STT VAD headers | `config.py`, `gnani_stt.py` | `x-min-silence-ms`, `x-vad-threshold`, `x-min-speech-ms`, `x-min-segment-ms`, `x-max-speech-s` | Verify defaults & run `ab_tuning.py` |
| STT WS JSON responses | `gnani_stt.py`, `smoke_test.py` | `transcript` / `text` / `result`, `detected_language_code`, `segment_index`, `type="error"`, `error_code` / `code` / `detail.error_code` (HTTP 429 `RATE_LIMITED`) | Inspect `keys=[...]` in `smoke_test.py` output |
| STT REST endpoint | `config.py`, `smoke_test.py` | `POST https://api.vachana.ai/stt/v3`, header `X-API-Key-ID`, multipart `audio_file`, `model`, `language_code`, `format`, response `transcript`, `detected_language_code`, `processing_time`, `end_to_end_latency` | Run `smoke_test.py` with `--audio` and `--long-audio` (>30 s) |
| Gemini REST API | `llm/gemini.py` | `POST https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent`, header `x-goog-api-key`, `generationConfig: {temperature: 0, responseMimeType: "application/json", responseSchema}` (+ optional `thinkingConfig.thinkingLevel`), non-`thought` text part in `candidates[0].content.parts`, transient `5xx`/connect retry | Test once with `GEMINI_API_KEY` + `GEMINI_MODEL` set |
| Ollama HTTP API | `llm/ollama.py` | `POST {OLLAMA_URL}/api/chat` (`model`, `messages`, `stream: false`, `format`, `options.temperature`), response `message.content` | Test with local Ollama daemon |

---

## Live-Verified & Remaining
- [x] Live Gnani smoke test passed (`9/9 OK` in `docs/voice/smoke.md`): confirmed `GNANI_HEADER_STYLE=new` wins, single-code WS STT works on code-mixed Hindi/English, TTS REST `hi-IN`/`kn-IN` works, Hindi TTS→STT round-trip preserves digits (`8`, `700`, `300`), and default VAD flush is ~600 ms.
- [x] Live Gemini Layer-2 extraction verified via `GnaniVoice().extract_entry("Aaj Suresh ke saath kaam kiya, 800 me se aadha mila.", "hi-IN", ...)` (`layer2_status: ok`): extracted `counterparty_name: "Suresh"`, `agreed_amount_inr: 800.0`, `paid_amount_inr: 400.0`, computed `due_amount_inr: 400.0`, `needs_clarification: ["hours"]`. Local `backend/voice/.env` uses `GEMINI_MODEL=gemini-3-flash-preview`, `GEMINI_FALLBACK_MODELS=gemini-3.1-flash-lite,gemini-flash-latest`, `GEMINI_THINKING_LEVEL=MINIMAL`, `VOICE_LLM_TIMEOUT_S=35.0`.
- [ ] Optional: run `smoke_test.py --long-audio` (>30 s) to confirm REST 30 s vs 60 s limit.
- [ ] Live Ollama extraction with local daemon + `OLLAMA_MODEL`.
- [ ] Native-speaker review of `docs/voice/native-review.md`.

## Blocked on Developer B
- [ ] Repo root `.gitignore`, root `.env.example`, CI config.
- [ ] Joint `contracts/` freeze (`voice_interface.py`, `entry_draft.schema.json`, `api.openapi.yaml`, `contracts/fake_voice.py` re-export).
- [ ] `backend/app/main.py` mounting `backend.voice.router.router` and overriding `get_audio_store`.
- [ ] Frontend `package.json`, `tsconfig.json`, `vite.config.ts` proxy, mounting `voiceRoutes`, and `/c/:token` contractor shell.
- [ ] Recording 200 evaluation utterances (`docs/voice/recording-guide.md`).
