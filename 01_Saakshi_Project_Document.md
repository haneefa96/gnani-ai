# Saakshi: Worker-Held Voice Wage Ledger

> Converted from `01_Saakshi_Project_Document.pdf` for use by coding agents.
> This is a text extraction: visual layout and some diagram geometry may differ from the PDF.
> Review the original PDF for any visual details that are not represented clearly here.

---

Saakshi: Worker-Held Voice Wage Ledger
Project design, technical implementation and two-developer work plan



1. Summary
Saakshi (Hindi/Kannada for "witness") is a voice-first diary that a daily-wage or migrant worker owns. At
the end of the day the worker speaks in their own language, for example: "Aaj Basavanagudi site pe 8
ghante kaam kiya, Suresh bhaiya ne 700 ka bola, 300 diye." The system turns the speech into a
structured entry, reads it back aloud for confirmation, asks the contractor to confirm by voice, and stores
everything in a tamper-evident chain. After a few weeks the worker holds a dated, two-sided record that
a helpline or legal-aid clinic can use.
Why Gnani is a core dependency, not decoration: STT is the only realistic input method for workers
who cannot type reliably and who mix languages mid-sentence. TTS is the only realistic way to let a
worker verify what was recorded, because they may not read the script of the app. Remove either and
the product stops working.

 Honest note on novelty: this document does not claim the idea has never existed. It records what was
 found and where the gap appears to be. Features marked "to verify" must be confirmed with real users
 before you invest build time.



2. Problem and evidence
Informal workers frequently work without written contracts, and wage disputes then collapse for lack of
proof.

Finding                                                                               Source

An ILO report found that in 2022, 70% of construction workers in India did not        IDR (India Development
receive the prescribed minimum wage. More than 94% of workers on e-Shram              Review), March 2025
reported income of INR 10,000 or less (May 2022).

India Labourline's Kerala chapter received 1,227 wage-theft complaints worth about    The Hindu (M.P. Praveen), via
INR 2.41 crore in 18 months. In most cases workers lacked evidence of employment      inkl
or dues, leaving little room for legal resolution.

A district legal-services adalat sent 34 remaining cases back to the Labour           South First, Kerala
Department because they lacked evidence. Officials said many migrants leave
abruptly and ask for dues later.

A state labour helpline run by Aajeevika Bureau receives up to 5,000 calls a month    People's Archive of Rural India
from migrant workers seeking redress for unpaid dues.

NHRC (May 2026) flagged wage theft, subcontracting-chain exploitation and lack of     Business & Human Rights
documentation for workers.                                                            Resource Centre



Existing solutions and their limits
Solution                      What it does                                 Gap Saakshi targets

India Labourline (helpline)   Human-run toll-free helpline for informal    Depends on the worker already having
                              workers; mediates wage recovery.             evidence. Saakshi creates the evidence
                                                                           beforehand.

Sirex, Pagarkhata             Contractor/employer-side attendance and      The record belongs to the party who may
(Khatabook)                   wage tracking.                               withhold pay. Saakshi is worker-held and
                                                                           two-sided.



                                    Saakshi: Worker-Held Voice Wage Ledger | Page 1
Solution                       What it does                                 Gap Saakshi targets

Houzzdat, UdharKhata Plus,     Voice entry for site management or           Not designed for bilateral confirmation or
DhanRakh                       personal/shop ledgers.                       evidence export for wage disputes (as far
                                                                            as found in this research).

e-Shram                        National registration database for           Registration and welfare linkage, not day-
                               unorganised workers.                         by-day wage records.



 Not verified: whether courts or labour departments accept such records, and in what form. Talk to a legal-
 aid clinic or an NGO such as the one running India Labourline in your state before promising any legal
 effect. Present Saakshi as "a dated record" and not as "legal proof".



3. Users and design principles
User                      Needs                                          Constraints

Worker (primary)          Record work, agreed pay and pay received in    Low literacy possible, shared or low-end
                          a few seconds; hear it read back; keep a       Android phone, noisy sites, mixes
                          private history; export a summary.             Hindi/regional language/English words, may
                                                                         fear retaliation.

Contractor / supervisor   Confirm or dispute an entry quickly with no    May be unwilling to participate. Must never be
                          sign-up.                                       forced to install anything.

NGO case worker           Receive a clear evidence pack when a           Needs a readable English or Hindi summary
(secondary)               worker asks for help.                          and a way to check the record is intact.



Design principles
  • Worker owns the record. Data is private to the worker unless the worker chooses to share it.
  • Unconfirmed never means agreed. If the contractor does not respond the entry is stored as
     UNCONFIRMED, not as accepted.
  • Read-back before saving. Every entry is spoken back and confirmed by the worker before it is
     stored. This is where TTS earns its place.
  • Append-only. Entries are never edited. A correction is a new entry that points to the old one.
  • Discreet. Neutral app name, PIN lock, no alarming wording on the lock screen.
  • Computed numbers come from code. The LLM extracts what was said; amounts due are
     calculated by deterministic code and compared with what the worker said.


4. User journey (worked example)
  1. Onboarding (once). Ramesh opens the web app, picks Hindi, hears a spoken consent
     explanation (TTS), says "haan" to agree, and sets a 4-digit PIN. Consent audio and timestamp are
     stored.
  2. End of day. He holds the big microphone button and says: "Aaj Basavanagudi site pe 8 ghante
     kaam kiya, Suresh bhaiya ne 700 ka bola, 300 diye."
  3. Transcription. Gnani STT (Prisma v3.0, `transcribe` style) returns text with digits. The backend
     extracts: date today, site Basavanagudi, contractor Suresh, hours 8, agreed 700, paid 300. Code
     computes due = 400.
  4. Read-back. TTS says in Hindi: "Aapne 8 ghante Basavanagudi site pe Suresh ke saath kaam kiya.
     Tay hua saat sau rupaye, mile teen sau rupaye, baaki chaar sau rupaye. Kya yeh sahi hai?"
     (numbers pre-converted to spoken words).
  5. Worker confirms. He says "haan". If he says "nahi" or corrects a number, the system asks one
     targeted question ("Kitne rupaye mile?") and reads back again.

                                     Saakshi: Worker-Held Voice Wage Ledger | Page 2
  6. Share with contractor. The app creates a one-time link. Ramesh sends it to Suresh through
     WhatsApp using a wa.me link or by showing the phone. The link opens a page that reads the entry
     aloud in Suresh's chosen language and asks for "haan" or "nahi".
  7. Outcome. CONTRACTOR_CONFIRMED, CONTRACTOR_DISPUTED (with an optional spoken
     reason, stored as audio and transcript) or UNCONFIRMED after a set number of days.
  8. Weeks later. Ramesh asks the NGO for help. He taps "Evidence pack"; the app produces a PDF
     summary and a zip with audio and a manifest. The NGO can run a verification check on the hash
     chain.


5. Scope
MVP (must be done for the demo)            Advanced (only if time remains)            Out of scope

Worker registration with spoken            IVR/phone-call channel for feature         Legal advice or automated legal
consent and PIN                            phones (needs telephony, paid)             claims
Hold-to-talk entry in Hindi, Kannada,      Offline queue and sync                     Contractor "reliability scores"
Bengali, English (test others later)       Multiple sites/contractors dashboards      Payments
Structured extraction with clarification   Wage-rate benchmarks by region             Languages Gnani does not support
question                                   NGO web dashboard                          (Odia, Assamese, etc.)
TTS read-back and spoken yes/no            More languages once Gnani support is
confirmation                               checked
Contractor confirmation page via link
Hash-chained append-only ledger
Evidence pack PDF + audio zip +
verification
Entry history with status badges




6. System architecture
WORKER PHONE (web app / PWA)                         CONTRACTOR (any phone browser)
 ├─ frontend/src/voice (A) recorder + sockets          └─ /c/<token> contractor page (A)
 └─ frontend/src/...    (B) screens, history, export           │
        │ WebSocket (PCM16 audio)           │ HTTPS             │ HTTPS
        ▼                                   ▼                   ▼
┌───────────────────────────── BACKEND (FastAPI) ──────────────────────────────┐
│ backend/voice (A)                          backend/app (B)                   │
│ /ws/stt ── proxy ──► Gnani STT (wss)        /api/auth, /api/entries          │
│ /api/voice/tts ─────► Gnani TTS (wss)       /api/share, /c/{token}           │
│ /api/voice/extract ─► LLM + rule parser     /api/evidence, /api/verify       │
│ normalise.py, readback.py                   services: hashchain, pdf, storage│
└───────────────┬──────────────────────────────────────┬───────────────────────┘
                │ contracts/voice_interface.py         │
                └──────────── calls ───────────────────┘
                                                       ▼
                                      SQLite/PostgreSQL + local audio folder



Component                        Responsibility                                                          Owner

Audio recorder (frontend)        Capture mic, downsample to 16 kHz mono PCM16, cut into exactly          A
                                 1,024-byte frames, send every 32 ms.

STT proxy (backend)              Open Gnani WebSocket with the right headers, pace frames, forward       A
                                 transcript messages to the browser, handle errors and reconnects.

TTS service                      Synthesize read-back, cache fixed sentences, return audio for           A
                                 playback.

Extractor                        Turn transcript into the `EntryDraft` JSON, compute confidence,         A
                                 produce a clarification question when needed.

Entry ledger                     Persist entries, state machine, hash chain, corrections.                B



                                       Saakshi: Worker-Held Voice Wage Ledger | Page 3
Component                       Responsibility                                                              Owner

Share and confirm               Token links, contractor responses, expiry, UNCONFIRMED job.                 B (API) / A
                                                                                                            (voice UI)

Evidence pack                   PDF summary, audio zip, manifest, verification endpoint.                    B

Frontend screens                Onboarding, home, review, history, export, settings.                        B




7. Gnani integration in detail
Gnani API facts this design relies on
Everything below was read from the official Gnani documentation (docs.gnani.ai). Re-check the pages
before you build, because the docs are updated often.

Item               What the docs say                                         Consequence for this project

STT models         Prisma v2.5 (default) and Prisma v3.0 (opt-in via         Use v3.0: it handles mixed-language speech
                   `model=prisma-v3.0` on REST, `x-model: prisma-            and reports `detected_language_code`.
                   v3.0` header on WebSocket).

STT languages      bn-IN, en-IN, gu-IN, hi-IN, kn-IN, ml-IN, mr-IN, pa-IN,   Odia, Assamese, Urdu, Tulu and Konkani are
                   ta-IN, te-IN. v3.0 also accepts `indic-auto`.             NOT supported. Do not promise them.

STT REST           POST https://api.vachana.ai/stt/v3, header `X-API-        Good for short clips and for offline batch re-
                   Key-ID`, clips up to 30 s (one docs page says 60 s;       testing.
                   test it).

STT realtime       WSS wss://api.vachana.ai/stt/v3/stream. Headers           Browsers cannot set WebSocket headers, so
                   carry config (`x-api-key-id`, `lang_code`, `x-sample-     a backend proxy is mandatory. This also
                   rate`, `x-format`, VAD headers). Raw PCM16 mono,          keeps the API key off the client.
                   exactly 1,024-byte frames at real-time cadence.
                   Transcripts arrive per speech segment (VAD), not
                   word by word. Session cap 15 min.

Output styles      `verbatim`, `transcribe` (digits and symbols),            Use `transcribe` when you need numbers as
                   `codemix`, `transliterate`.                               digits.

Hints              `keyterms` up to 200 items (REST and streaming);          A/B test with and without hints on your own
                   `topic`, `previous_text`, `speaker_names` on REST         audio before enabling.
                   only. Docs warn hints can reduce accuracy.

VAD tuning         `x-vad-threshold`, `x-min-silence-ms` (default 500),      Use two presets: long-narration and short-
                   `x-min-speech-ms`, `x-min-segment-ms`, `x-max-            confirmation (yes/no). The `gnani-vachana`
                   speech-s`. Raising `x-min-segment-ms` too far             Python SDK does not expose VAD headers,
                   silently drops one-word answers.                          so use a raw WebSocket client.

Not offered        Word timestamps, translation, diarization on              Translation must come from another tool.
                   REST/realtime (Batch separates speakers in its own
                   step).

TTS                Timbre v3.0: 13 voices, each speaks all 10                One voice can serve every language. Cache
                   languages, supports audio tags. Timbre v2.5: 42           audio for fixed sentences to save credits.
                   voices, one preferred language each. WSS
                   wss://api.vachana.ai/api/v1/tts, plus REST and SSE.
                   Formats include wav, mp3, ogg, raw PCM, mu-law/A-
                   law (8 kHz).

TTS text input     Numbers, IDs, dates and currency should be written        Build a `normalise_for_tts()` function and test
                   in spoken form or they are mispronounced.                 it in every language you ship.

Limits             Request-rate and concurrent-session limits are            Check your quota on Day 0 and design for
                   shown per account at app.gnani.ai.                        graceful 429 back-off.




                                      Saakshi: Worker-Held Voice Wage Ledger | Page 4
7.1 Audio capture pipeline (frontend, Developer A)
    • Use `getUserMedia` and an `AudioWorklet` to receive Float32 samples at the device rate (usually
      48 kHz).
    • Downsample to 16 kHz mono, convert to signed 16-bit little-endian PCM.
    • Slice into exactly 1,024-byte frames (512 samples = 32 ms at 16 kHz). Send one frame every 32
      ms. Do not buffer and burst, because the docs say this degrades VAD accuracy.
    • Send frames to `/ws/stt` on your own backend, not to Gnani directly. Pass `lang` and `mode`
      (`narration` or `confirm`) as query parameters.

7.2 STT presets (backend, Developer A)
Preset            Headers sent to Gnani                                                      Use

narration         x-model: prisma-v3.0, lang_code: hi-IN,kn-IN,en-IN (the worker's           The main spoken entry.
                  language plus English, up to 4 allowed), x-sample-rate: 16000, x-format:   Longer silence lets the
                  transcribe, x-min-silence-ms: 700, x-vad-threshold: 0.6 (tune), x-         worker pause mid-
                  keyterms: JSON array of the worker's known contractor and site names       sentence.
                  (escape non-ASCII as \u sequences).

confirm           Same model and language headers, x-min-silence-ms: 300, x-min-             Yes/no replies. The docs
                  speech-ms: 100, x-min-segment-ms: 100.                                     warn that a high `x-min-
                                                                                             segment-ms` drops one-
                                                                                             word answers.


    • Read `detected_language_code` on every transcript. If it differs from the expected language,
      accept it (v3.0 follows the spoken language) and tag the entry.
    • Hindi and Marathi share the Devanagari script. For short utterances the tag may be wrong; store
      the worker's profile language as the fallback.
    • Keyterms: build an A/B test (with and without) on your recorded set before turning them on by
      default.
    • Errors: handle the `error` message type, WebSocket close, and 429 `RATE_LIMITED` with
      exponential back-off. Surface a friendly spoken message ("Phir se bolein") through cached TTS.

7.3 TTS usage (backend, Developer A)
    • Model `timbre-v3.0`. Voice: one warm voice from the catalog (the docs describe Shivani and
      Chetana as warm, empathetic) for workers; a neutral professional voice for contractors. Check
      both in the Gnani playground in every demo language before choosing.
    • Always send `language` explicitly (`hi-IN`, `kn-IN`, `bn-IN`, `en-IN`), or `auto` for code-mixed text.
    • Write `normalise_for_tts()` to convert digits to spoken words in each language ("700" to the spoken
      form of seven hundred) and to format dates. Unit-test every language.
    • Cache audio for fixed phrases (consent text, "Kya yeh sahi hai?", error prompts) on disk keyed by
      hash of text+voice+language, so these cost credits only once.
    • Slow speed (`speed: 0.9`) and `<pauses>` tags can help number read-back. Test whether they
      help.

7.4 Extraction pipeline
The extractor receives the transcript and returns an `EntryDraft`. It must never invent values.

{
    "work_date": "2026-11-09",              // default: today, unless worker says "kal" etc.
    "site_name": "Basavanagudi",
    "counterparty_name": "Suresh",
    "work_type": null,
    "hours": 8, "days": null,
    "agreed_amount_inr": 700,
    "paid_amount_inr": 300,


                                    Saakshi: Worker-Held Voice Wage Ledger | Page 5
    "due_amount_inr": 400,              // COMPUTED by code, not by the model
    "field_confidence": { "agreed_amount_inr": 0.92, "paid_amount_inr": 0.88, ... },
    "needs_clarification": [],          // e.g. ["paid_amount_inr"]
    "clarification_question": null,
    "language": "hi-IN"
}



    • Layer 1, rules: regex for amounts and hours on the `transcribe` output (digits already present).
      Works with no LLM and is the fallback.
    • Layer 2, LLM: an open-weights model run locally (for example through Ollama) or a free hosted
      tier if available to you (verify current free tiers and whether your laptop can run the model). Use a
      strict JSON schema in the prompt, temperature 0, and validate the output against
      `entry_draft.schema.json`. If validation fails, fall back to Layer 1.
    • Layer 3, checks in code: amount fields must be numbers; paid cannot exceed agreed without a
      clarification; if the worker states a due amount that disagrees with agreed minus paid, ask.
    • Clarification: ask at most one question per turn, then re-read. After two failed turns, offer manual
      correction through the UI.


8. Data model
Table                  Key columns                                                                Notes

workers                id, phone_or_alias, pin_hash, language, created_at,                        No Aadhaar or other IDs
                       consent_audio_uri, consent_text_version, consent_at                        in the MVP.

counterparties         id, worker_id, display_name, phone_optional                                Names as the worker
                                                                                                  says them.

entries                id, worker_id, counterparty_id, work_date, site_name, hours, days,         Append-only. No
                       agreed_inr, paid_inr, due_inr, language, transcript,                       UPDATE on content
                       transcript_sha256, audio_uri, audio_sha256, status,                        columns; only `status`
                       corrects_entry_id, prev_hash, entry_hash, created_at                       may change and every
                                                                                                  change is logged.

entry_status_log       id, entry_id, from_status, to_status, actor, at                            Audit trail of the state
                                                                                                  machine.

share_tokens           id, entry_id, token_hash, expires_at, used_at                              Store only a hash of the
                                                                                                  token.

confirmations          id, entry_id, party (worker|contractor), channel, audio_uri, transcript,   Contractor audio kept
                       result (yes|no|dispute), reason_text, at                                   only after the page shows
                                                                                                  a notice.

evidence_packs         id, worker_id, period_from, period_to, pdf_uri, zip_uri,                   Generated on demand.
                       chain_head_hash, created_at



State machine
DRAFT ──worker says yes──► WORKER_CONFIRMED ──share──► SHARED
                                                        │
                    ┌────────── contractor yes ─────────┤
                    ▼                                   ├─ contractor no ─► CONTRACTOR_DISPUTED
          CONTRACTOR_CONFIRMED                          └─ no reply after N days ─► UNCONFIRMED
Any state ──correction──► NEW entry with corrects_entry_id (old entry unchanged)



Hash chain
entry_hash = SHA256( canonical_json({
   prev_hash, worker_id, work_date, site_name, counterparty, hours, days,
   agreed_inr, paid_inr, transcript_sha256, audio_sha256, created_at }) )
First entry per worker uses prev_hash = "GENESIS".




                                    Saakshi: Worker-Held Voice Wage Ledger | Page 6
 A hash chain makes tampering detectable. It does not make tampering impossible, and it does not prove
 the statements are true. Say "tamper-evident", never "tamper-proof". An optional extra is to email the
 current chain-head hash to the worker (and, with consent, to an NGO) weekly so the head is held by a third
 party.



9. API contract (frozen on Day 2)
Endpoint                                    Purpose                                                                     Owner

WS /ws/stt?lang=hi-IN&mode=narration        Client sends binary PCM frames; server sends JSON                           A
                                            `{type:"transcript", text, detected_language_code, segment_index,
                                            latency_ms}`, `{type:"processing"}`, `{type:"error", code, message}`.

POST /api/voice/tts                         Body `{text, lang, voice?}` returns audio (mp3 or wav) with cache           A
                                            headers.

POST /api/voice/extract                     Body `{transcript, lang, context}` returns `EntryDraft`.                    A

POST /api/auth/register, /login             Create worker (alias + PIN + language + consent), log in, return            B
                                            session token.

POST /api/entries/draft                     Takes `{audio_ref, transcript, lang}`, calls the voice interface, stores    B
                                            a DRAFT, returns draft + readback text.

POST /api/entries/{id}/confirm              Worker confirmation (`yes`), finalises hash and status.                     B

POST /api/entries/{id}/correct              Creates a correcting entry.                                                 B

GET /api/entries                            History with statuses.                                                      B

POST /api/entries/{id}/share                Returns one-time contractor URL.                                            B

GET /api/c/{token}                          Contractor page data (entry text, language).                                B

POST /api/c/{token}/respond                 Contractor result + optional reason audio.                                  B

POST /api/evidence                          Builds the evidence pack; GET returns file.                                 B

GET /api/verify                             Recomputes the chain and reports the first mismatch, if any.                B



Python interface the app layer calls (contracts/voice_interface.py)
class VoiceService(Protocol):
    async def extract_entry(self, transcript: str, lang: str, ctx: ExtractContext) -> EntryDraft: ...
    async def synthesize(self, text: str, lang: str, voice: str | None = None) -> bytes: ...
    def build_readback(self, draft: EntryDraft, lang: str) -> str: ...

# Implementations: backend/voice/service.py::GnaniVoice (A)
#                  contracts/fake_voice.py::FakeVoice     (A, returns fixtures, no network)
# B selects one through env var VOICE_IMPL, so B never edits A's files.




10. Technology stack
Layer                 Choice                                                     Why

Backend               Python 3.11+, FastAPI, Uvicorn, `websockets` (raw          Async WebSocket support; Gnani SDK is
                      client for Gnani VAD headers), Pydantic v2                 Python; schemas shared via Pydantic and
                                                                                 JSON Schema.

Database              SQLite for development, PostgreSQL optional;               Zero setup for students; migrations owned
                      SQLAlchemy 2 + Alembic                                     by B.

Audio storage         Local folder `data/audio/` (git-ignored), path stored in   Free; swap for object storage later.
                      DB



                                      Saakshi: Worker-Held Voice Wage Ledger | Page 7
Layer                  Choice                                                  Why

Frontend               React + TypeScript + Vite, installable as a PWA,        One codebase for phone and laptop; mic
                       Tailwind CSS                                            access in the browser.

LLM extraction         Open-weights model through Ollama or a free hosted      Project assumes no paid API other than
                       tier (verify), plus regex fallback                      Gnani credits.

PDF                    ReportLab or WeasyPrint                                 Pure Python.

Testing                pytest, httpx, Playwright for one happy-path E2E

Quality                ruff, black, prettier, pre-commit, GitHub Actions       Same config on both machines prevents
                                                                               formatting conflicts.




11. Security, privacy and ethics
  • Voice recordings are personal data. Obtain explicit, spoken and checkbox consent in the worker's
    language, explain storage and sharing, and offer deletion. If a worker deletes an entry, remove the
    audio and content but keep the hash row, and mark it DELETED so the chain remains verifiable.
  • Do not log transcripts or audio paths in application logs.
  • Protect the Gnani API key on the server only.
  • Contractor page: show a short notice before recording the contractor's voice and let them respond
    without recording (tap only).
  • Retaliation risk: private by default, neutral app name, PIN, no push notifications that reveal content.
  • Do not build or display contractor "scores" in the MVP. They raise defamation and fairness issues.
  • Review the Digital Personal Data Protection Act obligations with a mentor or legal-aid contact
    before any pilot with real workers.


12. Testing and evaluation
Test                          How                                                                             Owner

Gnani smoke test              Day 1: send a 10-second clip by REST and by WebSocket; record latency           A
                              and result.

Accuracy set                  Record 50 utterances per demo language (consented volunteers, with and          A
                              without background noise such as fan or traffic). Hand-write the expected
                              structured entry.

Field-level accuracy          For each utterance compare extracted amount, hours, contractor and site with    A
                              the label. Choose your own target after the baseline run and report real
                              numbers in the demo, not guesses.

A/B keyterms and VAD          Run the same set with and without keyterms and with 2–3 VAD settings.           A
presets                       Keep the best.

Unit tests                    `normalise_for_tts`, hash chain, state machine, due-amount calculation, token   A and B for
                              expiry.                                                                         own code

Contract tests                Both sides validate their responses against the JSON Schemas using the          Both
                              shared fixtures.

E2E                           One Playwright test of record → confirm → share → contractor confirm →          B
                              evidence pack using `FakeVoice`.

Pilot rehearsal               Ask 3–5 real or role-playing workers/volunteers to use it; note where they      Both
                              hesitate.




                                       Saakshi: Worker-Held Voice Wage Ledger | Page 8
13. Work distribution between two developers
Developer A: Voice and AI. Owns everything that touches Gnani, audio, language, extraction and the
voice parts of the UI.
Developer B: Product and Data. Owns the database, API, ledger logic, evidence pack, screens, CI and
deployment.
Both are given roughly equal effort: A carries the highest technical risk; B carries the largest volume of
ordinary features.

13.1 Ownership map (no file has two owners)
Path                                                   Owner   Contents

backend/voice/                                         A       gnani_stt.py, gnani_tts.py, service.py, router.py,
                                                               extractor.py, normalise.py, readback.py, prompts/, eval/,
                                                               tests/

backend/voice/requirements.txt                         A       Voice-only Python dependencies

frontend/src/voice/                                    A       recorder.worklet.ts, useSttSocket.ts, TtsPlayer.tsx,
                                                               VoiceButton.tsx

frontend/src/pages/contractor/                         A       Contractor confirmation page

contracts/fake_voice.py, contracts/fixtures/audio/     A       Mock and sample audio

backend/app/                                           B       main.py, deps.py, db.py, models.py, migrations/,
                                                               routers/, services/hashchain.py, evidence_pdf.py,
                                                               storage.py

backend/app/requirements.txt                           B       App-only Python dependencies

frontend/ (except the two A folders)                   B       Onboarding, home, review, history, export, i18n JSON,
                                                               package.json, vite config

.github/, docker-compose.yml, Makefile, .pre-          B       CI and tooling (set up on Day 0, with A reviewing)
commit-config.yaml

contracts/api.openapi.yaml, contracts/schemas/,        Both    Frozen after Day 2; joint PR only
contracts/voice_interface.py

docs/voice/                                            A       Notes, evaluation results

docs/app/                                              B       Notes, runbook

docs/CHANGELOG.md                                      Both    Append one line at the end only



13.2 Week-by-week tasks
Day 0 to 2: joint setup (about 6 hours together, then split)
Task                                                                      Owner        Done when

Create repo, folders, README, `.gitignore`, `.env.example` skeleton       B            Both can clone and run an empty
                                                                                       app

Pre-commit config, CI, CODEOWNERS, branch protection                      B            A opens a test PR and CI runs

Write `entry_draft.schema.json`, `api.openapi.yaml`,                      Both         Both approve the PR; contracts
`voice_interface.py` together                                                          frozen

Check Gnani key, quota, concurrent sessions; run REST + WebSocket         A            Result written in
smoke tests                                                                            docs/voice/smoke.md

`FakeVoice` + 10 fixture transcripts and expected drafts                  A            B can call it

DB schema draft and first Alembic migration                               B            Tables exist locally

                                     Saakshi: Worker-Held Voice Wage Ledger | Page 9
Week 1: foundations
Dev A                                                           Dev B

AudioWorklet recorder to 16 kHz PCM16, 1,024-byte               Auth + onboarding screens + consent screen (consent
frames at 32 ms                                                 audio uses cached TTS from A when ready, text-only until
`gnani_stt.py` with narration and confirm presets               then)
`/ws/stt` proxy with error handling                             Entries CRUD with `FakeVoice`
Minimal test page in `frontend/src/voice/` showing live         DB models, migrations, state machine
transcripts                                                     Home and history screens

 Checkpoint 1 (end of week 1): speak into the app and see a Hindi/Kannada/English transcript in the real
 UI. Both branches merged to main. Record a 2-minute screen capture for your own records.



Week 2: the worker loop
Dev A                                                           Dev B

`extractor.py` rules layer, then LLM layer, schema              Review screen: shows draft, plays read-back, buttons as
validation                                                      fallback to voice
`normalise.py` and `readback.py` for hi, kn, bn, en             Hash chain service + `/api/verify`
`gnani_tts.py`, `/api/voice/tts`, audio cache                   Confirm and correct endpoints
`TtsPlayer` and yes/no capture using the confirm preset         Share token creation and expiry job

 Checkpoint 2 (end of week 2): worker records, hears the read-back, says yes, and the entry appears in
 history with a valid chain. Run the Gnani accuracy set once for a baseline.



Week 3: contractor loop and evidence
Dev A                                                           Dev B

Contractor page (read aloud entry, spoken yes/no/dispute,       `/api/c/{token}` endpoints and dispute handling
tap fallback)                                                   Evidence pack: PDF, audio zip, manifest, verification page
Evaluation harness, A/B keyterms and VAD tuning, write          i18n JSON for all UI strings in four languages
results                                                         Settings, PIN lock, data deletion flow
Clarification question flow in the extractor
Latency optimisation (stream TTS, pre-cache)

 Checkpoint 3 (end of week 3): the full journey in section 4 works end to end, including the evidence pack.



Week 4: hardening and demo
Task                                                                                                     Owner

Noise and accent test round; fix top 5 failure patterns in extraction                                    A

Error states: network drop, quota error, mic denied, spoken fallback messages                            A (voice) / B (UI)

Deployment (free tier or local demo laptop), seed data, reset script                                     B

Demo script, slides, a 2-minute video; feedback session with an NGO or volunteer workers                 Both

Code freeze on day 3; day 4 to 5 bug fixes only                                                          Both




Working together without merge conflicts
Merge conflicts happen when two people edit the same lines of the same file. The plan below removes
that possibility by design: every file has exactly one owner, shared files are frozen early, and the two
halves talk to each other only through written contracts and mock implementations.

                                      Saakshi: Worker-Held Voice Wage Ledger | Page 10
1. Repository layout and file ownership
saakshi/
├── contracts/                  # shared, frozen after Day 2 (joint PR only)
│   ├── api.openapi.yaml
│   ├── schemas/entry_draft.schema.json
│   ├── voice_interface.py
│   ├── fake_voice.py           # A
│   └── fixtures/               # A (audio) + both (json)
├── backend/
│   ├── voice/                  # DEVELOPER A only
│   └── app/                    # DEVELOPER B only
├── frontend/
│   ├── src/voice/              # DEVELOPER A only
│   ├── src/pages/contractor/   # DEVELOPER A only
│   └── src/ (everything else) # DEVELOPER B only
├── docs/{voice,app}/ , CHANGELOG.md
├── .github/CODEOWNERS, workflows/
└── docker-compose.yml, Makefile, .env.example



Path                                          Owner        Rule

backend/voice/, frontend/src/voice/,          A            B never edits these. B asks through an issue labelled
frontend/src/pages/contractor/                             `needs-from-A`.

backend/app/, frontend/ (rest), CI, tooling   B            A never edits these. A asks through an issue labelled
                                                           `needs-from-B`.

contracts/                                    Both         Joint PR, both approve. Frozen after Day 2.



2. Contracts first (Day 0 to Day 2)
Before anyone writes feature code, both developers spend about two hours together and agree the
contracts. After Day 2 the contracts are frozen. A contract change needs a joint pull request approved by
both people.
  • API contract (`contracts/api.openapi.yaml`): every HTTP and WebSocket endpoint, request and
    response body, error shape.
  • Data schemas (`contracts/schemas/*.json`): JSON Schema for each object that crosses the A/B
    boundary.
  • Python interface (`contracts/voice_interface.py`): function signatures that the app layer calls on
    the voice layer (see the project section).
  • Fixtures (`contracts/fixtures/`): sample audio clips, sample transcripts and sample JSON
    responses. Both sides test against the same fixtures.
  • Fake implementations: the voice owner ships a `FakeVoice` class that returns fixture data with no
    network call. The app owner builds and tests everything against it, so nobody waits for the other
    person or burns Gnani credits.

3. Git workflow
  9. `main` is protected: no direct pushes, pull request required, one approval from the other developer,
     CI must pass.
  10. Branch names: `a/<feature>` for Developer A, `b/<feature>` for Developer B. One branch = one
      small feature, ideally under one day of work.
  11. Before opening a PR run `git fetch && git rebase origin/main`. Resolve any conflict on your own
      branch, never on main.
  12. Merge with squash and merge. Delete the branch afterwards.
  13. Keep PRs under about 400 changed lines. Large PRs hide conflicts and are reviewed badly.
  14. Merge to `main` at least once a day. Long-lived branches are the main source of painful conflicts.


                                     Saakshi: Worker-Held Voice Wage Ledger | Page 11
 15. Never reformat a file you do not own. Both developers use the same pre-commit config (ruff +
     black for Python, prettier for the frontend) committed on Day 0.
 16. Add a `.github/CODEOWNERS` file that maps each directory to its owner so GitHub requests the
     right review automatically.

4. Known conflict hot-spots and how they are removed
Hot-spot                                    How we avoid the conflict

`backend/app/main.py` (router               Owned by B. It imports `voice.router` by name. A only defines `router` inside
registration)                               their own module, so A never touches main.py.

Python dependencies                         Two requirements files, one per owner. The Docker/CI step installs both.

`frontend/package.json` and lockfile        Owned by B. If A needs a package, A opens a tiny PR titled "deps: add X"
                                            touching only package.json and the lockfile, B approves within the hour, and
                                            A rebases.

Database migrations                         Only B writes migrations. If A needs a new column, A opens an issue with the
                                            exact field; B adds it in a separate PR.

Environment variables                       `.env.example` has two commented sections: `# --- voice (A) ---` and `# ---
                                            app (B) ---`. Each person edits only their section.

i18n strings                                UI strings (B) live in `frontend/src/i18n/*.json`. Spoken read-back templates
                                            (A) live in `backend/voice/readback.py`. They are never mixed.

Shared types                                Generate TypeScript types from `contracts/*.json` into
                                            `frontend/src/generated/` (git-ignored, built in CI) so nobody hand-edits them.

Docs and README                             README is owned by B. A writes only in `docs/voice/`.



5. Daily rhythm
  • 10 minutes each morning: say which files you will touch today. If both of you need the same file,
    one person goes first and the other works on something else.
  • Integration checkpoints (listed in the timeline): both branches merge, the full flow is run end to
    end, and a short note is added to `docs/CHANGELOG.md` by whoever finishes last (append-only,
    one line per entry, so it never conflicts).
  • Blocked? Open a GitHub issue tagged `contract-change` or `needs-from-A` / `needs-from-B`
    instead of editing the other person's files.

6. Secrets and credits
  • API keys live only in `.env` (git-ignored). Commit `.env.example` with empty values; each owner
    appends only their own section.
  • Use one shared Gnani key only if the account allows it; otherwise each developer uses their own
    key locally. Check the concurrent-session limit at app.gnani.ai.
  • Use fixtures and `FakeVoice` for day-to-day UI work. Spend Gnani credits only on integration tests
    and the demo rehearsal.


14. Risks and mitigations
Risk                                        Impact                  Mitigation

STT accuracy drops on noisy sites or        Wrong amounts           Read-back + confirmation is mandatory; baseline test
heavy dialect                               recorded                in week 1; tune VAD; worker can correct by voice or
                                                                    tap.




                                       Saakshi: Worker-Held Voice Wage Ledger | Page 12
Risk                                      Impact                  Mitigation

Contractor refuses to engage              Many                    Product still gives a dated worker-side record; test
                                          UNCONFIRMED             acceptance with an NGO early.
                                          entries

Languages not covered by Gnani            Excludes some           State limitation clearly; confirm which languages your
(Odia, Assamese, etc.)                    migrants                target workers actually speak.

Legal weight unclear                      Over-promising          Describe as a record; get advice from a legal-aid
                                                                  clinic before any claim.

Free LLM too slow or weak on Indic        Extraction errors       Regex layer first; constrained prompts; restrict to the
text                                                              short structured fields.

Credits run out                           Demo fails              Cache TTS; fixtures for development; reserve credits
                                                                  for rehearsals; check quota on Day 0.

Retaliation or privacy breach             Worker harm             Private by default, PIN, neutral naming, no content in
                                                                  notifications, pilot only with an NGO partner.




15. Demo script (5 minutes)
 17. Introduce Ramesh and the problem with one statistic from section 2.
 18. Live: a volunteer speaks the Hindi-English mix. Show the transcript, the extracted fields and the
     spoken read-back.
 19. Say "nahi" and correct the paid amount; show the single clarifying question.
 20. Switch the worker profile to Kannada, then Bengali, and repeat quickly (one voice, three
     languages).
 21. Second phone: the contractor opens the link, hears the entry, says "haan". Show the status turning
     green.
 22. Show an UNCONFIRMED entry staying visibly different from a confirmed one.
 23. Open the evidence pack and run the verification; then edit one database value on stage and show
     the verification failing.
 24. Close with the roadmap: IVR for feature phones, NGO dashboard, more languages.


16. Items to verify before building
  • Your Gnani credit quota, rate limit and concurrent-session cap (app.gnani.ai).
  • Whether REST audio limit is 30 s or 60 s in practice.
  • STT accuracy on noisy, 8 kHz-like and dialect audio in each demo language.
  • Which languages your target workers speak; whether Gnani supports them.
  • Legal advice about the status of electronic records and voice consent.
  • A free LLM option that runs on your hardware and handles Indic text acceptably.
  • Whether an NGO partner will pilot with you.


Sources used for the evidence section
  • IDR (India Development Review), "Informal workers and the labour codes", March 2025:
    idronline.org
  • The Hindu / inkl: "Migrant workers lodge complaints of wage theft amounting to Rs 2.41 crore in 18
    months"
  • South First: "Rs 1.3 crore wage theft reported in 14 months: how migrant workers are being
    swindled in Kerala"


                                     Saakshi: Worker-Held Voice Wage Ledger | Page 13
• People's Archive of Rural India: "Migrants: don't lose that number"
• Business & Human Rights Resource Centre: NHRC statement, 13 May 2026
• The Tribune: Sirex launch; Business Standard: Pagarkhata; product pages of Houzzdat,
  UdharKhata Plus, DhanRakh
• Gnani official documentation: docs.gnani.ai (STT, TTS, limits, languages, voices)




                             Saakshi: Worker-Held Voice Wage Ledger | Page 14
