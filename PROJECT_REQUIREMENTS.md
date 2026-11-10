# PROJECT REQUIREMENTS — Saakshi

> Source of truth: `01_Saakshi_Project_Document.pdf` (converted to `01_Saakshi_Project_Document.md`). Every requirement below is traced to a section of that document. Requirements marked **MVP** must be completed for the demo; **ADV** are advanced and only done if time remains; **OOS** are explicitly out of scope.

---

## Requirement ID Scheme

Format: `REQ-<domain>-<number>` where domain is a short code:

| Code | Domain |
|------|--------|
| ONB | Onboarding |
| VOICE | Voice input / STT |
| TTS | Text-to-speech read-back |
| EXT | Extraction & clarification |
| LED | Ledger, hash chain, state machine |
| CONF | Contractor confirmation |
| EVID | Evidence pack & verification |
| HIST | Entry history & UI |
| SEC | Security, privacy, ethics |
| INFRA | Infrastructure, CI, deployment |
| TEST | Testing & evaluation |
| CONTRACT | Shared contracts & schemas |
| I18N | Internationalisation |

---

## 1. Onboarding (REQ-ONB)

| ID | Requirement | Scope | Acceptance Criteria |
|----|-------------|-------|---------------------|
| REQ-ONB-01 | Worker selects language (Hindi, Kannada, Bengali, English) at first launch | MVP | Language selector is shown; selection persists to worker profile |
| REQ-ONB-02 | Spoken consent explanation played via TTS in the worker's language | MVP | Consent audio plays in selected language before asking for agreement |
| REQ-ONB-03 | Worker agrees by voice ("haan") | MVP | System captures and stores consent audio + timestamp |
| REQ-ONB-04 | Worker sets a 4-digit PIN | MVP | PIN is hashed and stored; PIN lock activates on app open |
| REQ-ONB-05 | Consent audio URI, consent text version, and consent timestamp are stored | MVP | `workers` table has `consent_audio_uri`, `consent_text_version`, `consent_at` populated |
| REQ-ONB-06 | Re-authentication via PIN on app open | MVP | App requires PIN entry to access data after backgrounding or reopening |

---

## 2. Voice Input / STT (REQ-VOICE)

| ID | Requirement | Scope | Acceptance Criteria |
|----|-------------|-------|---------------------|
| REQ-VOICE-01 | Hold-to-talk microphone button on the home screen | MVP | Button visible; recording starts on press-hold, stops on release |
| REQ-VOICE-02 | Audio captured via getUserMedia + AudioWorklet at device sample rate (usually 48 kHz) | MVP | AudioWorklet receives Float32 samples |
| REQ-VOICE-03 | Downsample to 16 kHz mono, convert to signed 16-bit little-endian PCM | MVP | Output is 16 kHz mono PCM16 |
| REQ-VOICE-04 | Slice audio into exactly 1,024-byte frames (512 samples = 32 ms at 16 kHz) | MVP | Frame size is exactly 1,024 bytes |
| REQ-VOICE-05 | Send one frame every 32 ms (real-time cadence, no buffering/bursting) | MVP | Frames sent at ~32 ms intervals |
| REQ-VOICE-06 | Frames sent to backend `/ws/stt`, not directly to Gnani (keeps API key server-side) | MVP | WebSocket connects to `/ws/stt`; Gnani key never appears in frontend code |
| REQ-VOICE-07 | Backend STT proxy opens Gnani WebSocket with correct headers, paces frames, forwards transcripts to browser | MVP | Transcripts appear in the browser UI during recording |
| REQ-VOICE-08 | Narration preset: x-model prisma-v3.0, worker language + English, x-sample-rate 16000, x-format transcribe, x-min-silence-ms 700, x-vad-threshold 0.6, x-keyterms JSON array | MVP | Preset headers match specification; keyterms populated from worker profile |
| REQ-VOICE-09 | Confirm preset: same model/lang, x-min-silence-ms 300, x-min-speech-ms 100, x-min-segment-ms 100 | MVP | Preset headers match specification; one-word answers are not dropped |
| REQ-VOICE-10 | Read `detected_language_code` on every transcript; accept if it differs from expected | MVP | Detected language is stored/tagged on the entry; fallback to profile language for short utterances |
| REQ-VOICE-11 | Handle Gnani error message type, WebSocket close, and 429 RATE_LIMITED with exponential back-off | MVP | Errors surface a friendly spoken message ("Phir se bolein") via cached TTS; reconnects attempted |
| REQ-VOICE-12 | Support languages: bn-IN, en-IN, hi-IN, kn-IN (test others later) | MVP | All four languages produce transcripts |
| REQ-VOICE-13 | IVR / phone-call channel for feature phones | ADV | Not required for demo |
| REQ-VOICE-14 | Offline queue and sync | ADV | Not required for demo |

---

## 3. Text-to-Speech Read-back (REQ-TTS)

| ID | Requirement | Scope | Acceptance Criteria |
|----|-------------|-------|---------------------|
| REQ-TTS-01 | After extraction, TTS reads back the entry in the worker's language | MVP | Read-back audio plays automatically after extraction |
| REQ-TTS-02 | Numbers pre-converted to spoken words before synthesis (normalise_for_tts) | MVP | "700" is spoken as the word form of seven hundred, in each language |
| REQ-TTS-03 | Use Gnani Timbre v3.0 model with one warm voice for workers, neutral professional voice for contractors | MVP | Voice selections match; tested in Gnani playground for all demo languages |
| REQ-TTS-04 | Always send `language` explicitly (hi-IN, kn-IN, bn-IN, en-IN) or `auto` for code-mixed text | MVP | Language parameter always present in TTS requests |
| REQ-TTS-05 | Cache audio for fixed phrases (consent text, "Kya yeh sahi hai?", error prompts) on disk keyed by hash of text+voice+language | MVP | Fixed phrases cost credits only once; cache hits return without API call |
| REQ-TTS-06 | Consider slow speed (speed: 0.9) and pause tags for number read-back; test if they help | MVP | Test result documented; setting applied if beneficial |
| REQ-TTS-07 | `/api/voice/tts` endpoint: body `{text, lang, voice?}`, returns audio (mp3 or wav) with cache headers | MVP | Endpoint works and returns audio bytes |
| REQ-TTS-08 | TtsPlayer component plays returned audio in the browser | MVP | Audio plays via TtsPlayer component |

---

## 4. Extraction & Clarification (REQ-EXT)

| ID | Requirement | Scope | Acceptance Criteria |
|----|-------------|-------|---------------------|
| REQ-EXT-01 | Extract from transcript into EntryDraft JSON with fields: work_date, site_name, counterparty_name, work_type, hours, days, agreed_amount_inr, paid_amount_inr, due_amount_inr, field_confidence, needs_clarification, clarification_question, language | MVP | All specified fields present in the returned EntryDraft |
| REQ-EXT-02 | due_amount_inr is COMPUTED by deterministic code (agreed minus paid), not by the model | MVP | Due amount equals agreed minus paid in every test case |
| REQ-EXT-03 | Layer 1 (rules): regex for amounts and hours on the transcribe output; works with no LLM; is the fallback | MVP | Regex layer extracts digits from transcribe output without any LLM call |
| REQ-EXT-04 | Layer 2 (LLM): open-weights model via Ollama or free hosted tier; strict JSON schema in prompt; temperature 0; validate output against entry_draft.schema.json; fall back to Layer 1 on validation failure | MVP | LLM output validated against schema; invalid output falls back to regex |
| REQ-EXT-05 | Layer 3 (checks): amount fields must be numbers; paid cannot exceed agreed without clarification; if worker-stated due disagrees with agreed minus paid, ask | MVP | All three checks implemented and enforced |
| REQ-EXT-06 | The extractor must never invent values | MVP | No field is populated with a value not derivable from the transcript |
| REQ-EXT-07 | Clarification: ask at most one question per turn, then re-read | MVP | Only one clarification question asked per turn |
| REQ-EXT-08 | After two failed clarification turns, offer manual correction through the UI | MVP | After two failed turns, UI shows manual correction fields |
| REQ-EXT-09 | Confidence scores per field | MVP | field_confidence populated for each extracted field |
| REQ-EXT-10 | `/api/voice/extract` endpoint: body `{transcript, lang, context}`, returns EntryDraft | MVP | Endpoint works and returns valid EntryDraft JSON |

---

## 5. Ledger, Hash Chain, State Machine (REQ-LED)

| ID | Requirement | Scope | Acceptance Criteria |
|----|-------------|-------|---------------------|
| REQ-LED-01 | Entries are append-only; no UPDATE on content columns; only `status` may change and every change is logged | MVP | Attempting to update content raises an error; status changes are logged in entry_status_log |
| REQ-LED-02 | A correction is a new entry that points to the old one via corrects_entry_id (old entry unchanged) | MVP | Correcting entry has corrects_entry_id set; old entry content remains unchanged |
| REQ-LED-03 | State machine: DRAFT → WORKER_CONFIRMED → SHARED → CONTRACTOR_CONFIRMED / CONTRACTOR_DISPUTED / UNCONFIRMED | MVP | All transitions match the specified state machine; invalid transitions rejected |
| REQ-LED-04 | UNCONFIRMED status after N days of no contractor reply | MVP | Background job sets status to UNCONFIRMED after configured expiry |
| REQ-LED-05 | entry_hash = SHA256(canonical_json({prev_hash, worker_id, work_date, site_name, counterparty, hours, days, agreed_inr, paid_inr, transcript_sha256, audio_sha256, created_at})) | MVP | Hash computed exactly as specified; deterministic across runs |
| REQ-LED-06 | First entry per worker uses prev_hash = "GENESIS" | MVP | First entry's prev_hash is "GENESIS" |
| REQ-LED-07 | If a worker deletes an entry, remove audio and content but keep the hash row, mark DELETED so chain remains verifiable | MVP | Deleted entries retain hash row with DELETED status; chain verification still passes |
| REQ-LED-08 | `/api/verify` recomputes the chain and reports the first mismatch, if any | MVP | Verification returns OK for intact chain, reports first mismatch if tampered |
| REQ-LED-09 | Worker confirmation finalises hash and status (DRAFT → WORKER_CONFIRMED) | MVP | Confirm endpoint computes final hash and sets status |
| REQ-LED-10 | POST /api/entries/draft stores a DRAFT and returns draft + readback text | MVP | Draft persisted; readback text returned |
| REQ-LED-11 | POST /api/entries/{id}/confirm finalises worker confirmation | MVP | Entry moves to WORKER_CONFIRMED |
| REQ-LED-12 | POST /api/entries/{id}/correct creates a correcting entry | MVP | New entry created with corrects_entry_id pointing to original |
| REQ-LED-13 | GET /api/entries returns history with statuses | MVP | All entries returned with their current status |

---

## 6. Contractor Confirmation (REQ-CONF)

| ID | Requirement | Scope | Acceptance Criteria |
|----|-------------|-------|---------------------|
| REQ-CONF-01 | App creates a one-time link after worker confirmation | MVP | Share endpoint returns a unique URL |
| REQ-CONF-02 | Link opens a contractor page that reads the entry aloud in the contractor's chosen language | MVP | Contractor page plays TTS read-back of entry |
| REQ-CONF-03 | Contractor confirms or disputes by voice ("haan"/"nahi") or by tap (fallback) | MVP | Both voice and tap confirmation work |
| REQ-CONF-04 | Contractor may record an optional spoken reason for dispute (stored as audio + transcript) | MVP | Dispute reason audio and transcript stored in confirmations table |
| REQ-CONF-05 | Contractor page shows a short notice before recording voice; lets them respond without recording (tap only) | MVP | Notice shown; tap-only option available |
| REQ-CONF-06 | Token links have expiry; store only a hash of the token | MVP | share_tokens table stores token_hash, not raw token; expired tokens rejected |
| REQ-CONF-07 | One-time use: token marked used_at after contractor responds | MVP | Token cannot be reused after response |
| REQ-CONF-08 | Share via wa.me link or showing the phone | MVP | wa.me link generated; can be shown on phone |
| REQ-CONF-09 | POST /api/entries/{id}/share returns one-time contractor URL | MVP | Endpoint returns URL with token |
| REQ-CONF-10 | GET /api/c/{token} returns contractor page data | MVP | Returns entry text and language |
| REQ-CONF-11 | POST /api/c/{token}/respond processes contractor result + optional reason audio | MVP | Stores result (yes/no/dispute) and optional audio |

---

## 7. Evidence Pack & Verification (REQ-EVID)

| ID | Requirement | Scope | Acceptance Criteria |
|----|-------------|-------|---------------------|
| REQ-EVID-01 | "Evidence pack" button produces a PDF summary | MVP | PDF generated with dated summary of entries |
| REQ-EVID-02 | Evidence pack includes an audio ZIP | MVP | ZIP contains all audio files |
| REQ-EVID-03 | Evidence pack includes a manifest | MVP | Manifest lists all files with hashes |
| REQ-EVID-04 | NGO can run a verification check on the hash chain | MVP | Verification endpoint works on the exported pack |
| REQ-EVID-05 | POST /api/evidence builds the evidence pack; GET returns the file | MVP | Pack built on demand; file downloadable |
| REQ-EVID-06 | evidence_packs table stores period, URIs, chain_head_hash, created_at | MVP | Table populated with all specified fields |

---

## 8. Entry History & UI (REQ-HIST)

| ID | Requirement | Scope | Acceptance Criteria |
|----|-------------|-------|---------------------|
| REQ-HIST-01 | Entry history screen shows all entries with status badges | MVP | History visible; each entry shows status badge (DRAFT, CONFIRMED, DISPUTED, UNCONFIRMED, DELETED) |
| REQ-HIST-02 | Status badges visually distinguish confirmed, disputed, unconfirmed, and deleted entries | MVP | Each status has a distinct visual treatment |
| REQ-HIST-03 | UNCONFIRMED entries look visibly different from confirmed ones | MVP | Clear visual distinction |
| REQ-HIST-04 | Review screen: shows draft, plays read-back, has buttons as fallback to voice | MVP | All three present and functional |
| REQ-HIST-05 | Settings screen with PIN lock and data deletion flow | MVP | Settings accessible; PIN change and data deletion available |
| REQ-HIST-06 | Home screen with the hold-to-talk button | MVP | Home screen renders with mic button |
| REQ-HIST-07 | Export screen for evidence pack | MVP | Export screen accessible; triggers evidence pack generation |
| REQ-HIST-08 | Multiple sites/contractors dashboards | ADV | Not required for demo |
| REQ-HIST-09 | NGO web dashboard | ADV | Not required for demo |

---

## 9. Security, Privacy, Ethics (REQ-SEC)

| ID | Requirement | Scope | Acceptance Criteria |
|----|-------------|-------|---------------------|
| REQ-SEC-01 | Worker owns the record; data is private to the worker unless they choose to share | MVP | No data accessible without worker PIN/auth |
| REQ-SEC-02 | Unconfirmed never means agreed; if contractor does not respond, entry is UNCONFIRMED, not accepted | MVP | UNCONFIRMED entries never show as confirmed |
| REQ-SEC-03 | Read-back before saving; every entry is spoken back and confirmed by the worker before storage | MVP | No entry stored without read-back + worker confirmation |
| REQ-SEC-04 | Discreet: neutral app name, PIN lock, no alarming wording on lock screen | MVP | App name neutral; lock screen shows no alarming text |
| REQ-SEC-05 | Computed numbers come from code, not the LLM; LLM extracts what was said; amounts due calculated by deterministic code | MVP | Due always computed in code, never from model output |
| REQ-SEC-06 | Obtain explicit, spoken and checkbox consent in the worker's language; explain storage and sharing | MVP | Both spoken and checkbox consent captured |
| REQ-SEC-07 | Offer deletion of entries (remove audio and content, keep hash row, mark DELETED) | MVP | Deletion flow works as specified |
| REQ-SEC-08 | Do not log transcripts or audio paths in application logs | MVP | Log statements do not include transcript text or audio paths |
| REQ-SEC-09 | Protect the Gnani API key on the server only | MVP | Key only in .env, never in frontend or committed files |
| REQ-SEC-10 | No push notifications that reveal content | MVP | No content-revealing notifications sent |
| REQ-SEC-11 | Do not build or display contractor "scores" in the MVP | MVP | No score feature exists |
| REQ-SEC-12 | Review DPDP Act obligations with a mentor or legal-aid contact before any pilot | MVP (process) | Review documented; no pilot without this |
| REQ-SEC-13 | Contractor page: let them respond without recording (tap only) | MVP | Tap-only response option available |

---

## 10. Infrastructure, CI, Deployment (REQ-INFRA)

| ID | Requirement | Scope | Acceptance Criteria |
|----|-------------|-------|---------------------|
| REQ-INFRA-01 | Repository with folders, README, .gitignore, .env.example skeleton | MVP | Repo structured per ownership map; both developers can clone and run |
| REQ-INFRA-02 | Pre-commit config (ruff + black for Python, prettier for frontend) | MVP | Pre-commit hooks run on commit; formatting enforced |
| REQ-INFRA-03 | GitHub Actions CI pipeline | MVP | CI runs on every PR; tests pass |
| REQ-INFRA-04 | CODEOWNERS file mapping directories to owners | MVP | GitHub requests correct reviewer automatically |
| REQ-INFRA-05 | Branch protection on main (no direct pushes, PR required, one approval, CI must pass) | MVP | Direct pushes to main rejected |
| REQ-INFRA-06 | docker-compose.yml for local orchestration | MVP | docker-compose up runs the full stack |
| REQ-INFRA-07 | Makefile for common tasks | MVP | make targets for test, lint, run, migrate |
| REQ-INFRA-08 | Two requirements.txt files (one per owner) | MVP | backend/voice/requirements.txt and backend/app/requirements.txt |
| REQ-INFRA-09 | .env.example with two commented sections (voice A / app B) | MVP | File exists with both sections, empty values |
| REQ-INFRA-10 | Deployment (free tier or local demo laptop) with seed data and reset script | MVP | Demo can be run from deployment |
| REQ-INFRA-11 | Generate TypeScript types from contracts/*.json into frontend/src/generated/ (git-ignored, built in CI) | MVP | Types generated in CI, not hand-edited |

---

## 11. Testing & Evaluation (REQ-TEST)

| ID | Requirement | Scope | Acceptance Criteria |
|----|-------------|-------|---------------------|
| REQ-TEST-01 | Gnani smoke test: Day 1 send a 10-second clip by REST and by WebSocket; record latency and result | MVP | Result written in docs/voice/smoke.md |
| REQ-TEST-02 | Accuracy set: 50 utterances per demo language (consented volunteers, with and without noise); hand-write expected structured entry | MVP | 50 utterances × 4 languages recorded with labels |
| REQ-TEST-03 | Field-level accuracy: compare extracted amount, hours, contractor, site with labels; choose target after baseline; report real numbers | MVP | Real numbers reported in demo, not guesses |
| REQ-TEST-04 | A/B keyterms and VAD presets: run same set with and without keyterms and 2-3 VAD settings; keep the best | MVP | Best configuration documented and applied |
| REQ-TEST-05 | Unit tests: normalise_for_tts, hash chain, state machine, due-amount calculation, token expiry | MVP | All unit tests pass |
| REQ-TEST-06 | Contract tests: both sides validate responses against JSON Schemas using shared fixtures | MVP | Both A and B contract tests pass |
| REQ-TEST-07 | E2E: one Playwright test of record → confirm → share → contractor confirm → evidence pack using FakeVoice | MVP | E2E test passes with FakeVoice |
| REQ-TEST-08 | Pilot rehearsal: 3-5 real or role-playing workers/volunteers; note where they hesitate | MVP | Pilot notes documented |
| REQ-TEST-09 | Noise and accent test round; fix top 5 failure patterns in extraction | MVP | Top 5 patterns identified and addressed |

---

## 12. Shared Contracts & Schemas (REQ-CONTRACT)

| ID | Requirement | Scope | Acceptance Criteria |
|----|-------------|-------|---------------------|
| REQ-CONTRACT-01 | API contract (api.openapi.yaml): every HTTP and WebSocket endpoint, request/response body, error shape | MVP | OpenAPI spec covers all endpoints; frozen after Day 2 |
| REQ-CONTRACT-02 | Data schemas (entry_draft.schema.json and others): JSON Schema for each object crossing the A/B boundary | MVP | All schemas defined; both sides validate against them |
| REQ-CONTRACT-03 | Python interface (voice_interface.py): VoiceService Protocol with extract_entry, synthesize, build_readback | MVP | Interface defined; GnaniVoice and FakeVoice both implement it |
| REQ-CONTRACT-04 | Fixtures (contracts/fixtures/): sample audio clips, transcripts, JSON responses; both sides test against same fixtures | MVP | Fixtures available; both sides use them in tests |
| REQ-CONTRACT-05 | FakeVoice: returns fixture data with no network call; B builds/tests against it | MVP | FakeVoice implemented; B's tests pass without Gnani |
| REQ-CONTRACT-06 | VOICE_IMPL env var selects GnaniVoice or FakeVoice; B never edits A's files | MVP | Env var controls implementation selection |
| REQ-CONTRACT-07 | Contracts frozen after Day 2; changes require joint PR approved by both | MVP | No unilateral contract changes after Day 2 |

---

## 13. Internationalisation (REQ-I18N)

| ID | Requirement | Scope | Acceptance Criteria |
|----|-------------|-------|---------------------|
| REQ-I18N-01 | UI strings in frontend/src/i18n/*.json for Hindi, Kannada, Bengali, English | MVP | All UI strings translated for four languages |
| REQ-I18N-02 | Spoken read-back templates in backend/voice/readback.py (never mixed with UI i18n) | MVP | Read-back templates in readback.py, not in frontend i18n |
| REQ-I18N-03 | normalise_for_tts converts digits to spoken words in each language | MVP | Tested in every demo language |
| REQ-I18N-04 | Contractor page language selectable | MVP | Contractor can choose language for read-back |

---

## Requirement Summary

| Scope | Count |
|-------|-------|
| MVP | 71 |
| Advanced (ADV) | 5 |
| Out of Scope (OOS) | 4 |

Out of scope items (do not build):
- Legal advice or automated legal claims
- Contractor "reliability scores"
- Payments
- Languages Gnani does not support (Odia, Assamese, Urdu, Tulu, Konkani)
