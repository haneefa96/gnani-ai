# Saakshi — Worker-Held Voice Wage Ledger

> Saakshi (Hindi/Kannada for "witness") is a voice-first diary that a daily-wage or migrant worker owns. The worker speaks about their day's work, the system transcribes it, extracts structured fields, reads the entry back aloud for confirmation, and stores it in a tamper-evident hash-chained ledger. The record can later be exported as an evidence pack for legal-aid clinics or NGO case workers.

---

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [Testing](#testing)
- [Documentation Index](#documentation-index)

---

## Features

### MVP (must be done for the demo)

- Worker registration with spoken consent and 4-digit PIN
- Hold-to-talk voice entry in Hindi, Kannada, Bengali, English
- Real-time speech-to-text via Gnani Prisma v3.0
- Structured extraction (date, site, contractor, hours, agreed/paid/due amounts) with clarification questions
- TTS read-back of the extracted entry in the worker's language
- Spoken yes/no confirmation by the worker
- Contractor confirmation page via one-time link (voice or tap)
- Append-only hash-chained ledger (tamper-evident, not tamper-proof)
- Evidence pack: PDF summary + audio ZIP + manifest + chain verification
- Entry history with status badges

### Advanced (only if time remains)

- IVR/phone-call channel for feature phones
- Offline queue and sync
- Multiple sites/contractors dashboards
- Wage-rate benchmarks by region
- NGO web dashboard
- More languages once Gnani support is checked

### Out of scope

- Legal advice or automated legal claims
- Contractor "reliability scores"
- Payments
- Languages Gnani does not support (Odia, Assamese, Urdu, Tulu, Konkani)

---

## Technology Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Backend | Python 3.11+, FastAPI, Uvicorn, `websockets` (raw client for Gnani VAD headers), Pydantic v2 | Async WebSocket support; Gnani SDK is Python; schemas shared via Pydantic and JSON Schema |
| Database | SQLite for development, PostgreSQL optional; SQLAlchemy 2 + Alembic | Zero setup for development; migrations owned by Developer B |
| Audio storage | Local folder `data/audio/` (git-ignored), path stored in DB | Free; swap for object storage later |
| Frontend | React + TypeScript + Vite, installable as a PWA, Tailwind CSS | One codebase for phone and laptop; mic access in the browser |
| LLM extraction | Open-weights model through Ollama or a free hosted tier (verify), plus regex fallback | Project assumes no paid API other than Gnani credits |
| PDF | ReportLab or WeasyPrint | Pure Python |
| Testing | pytest, httpx, Playwright for one happy-path E2E | Standard Python and browser testing tools |
| Quality | ruff, black, prettier, pre-commit, GitHub Actions | Same config on both machines prevents formatting conflicts |

---

## Project Structure

```
saakshi/
├── contracts/                  # shared, frozen after Day 2 (joint PR only)
│   ├── api.openapi.yaml
│   ├── schemas/entry_draft.schema.json
│   ├── voice_interface.py
│   ├── fake_voice.py            # Developer A
│   └── fixtures/                # A (audio) + both (json)
├── backend/
│   ├── voice/                   # DEVELOPER A only
│   └── app/                     # DEVELOPER B only
├── frontend/
│   ├── src/voice/               # DEVELOPER A only
│   ├── src/pages/contractor/    # DEVELOPER A only
│   └── src/ (everything else)  # DEVELOPER B only
├── docs/
│   ├── voice/                   # Developer A
│   ├── app/                     # Developer B
│   └── CHANGELOG.md             # Both (append-only)
├── .github/                     # CI and tooling (Developer B)
├── docker-compose.yml
├── Makefile
└── .env.example
```

---

## Prerequisites

- Python 3.11 or higher
- Node.js 18+ (for the frontend)
- A Gnani account with API key and sufficient credits (check quota at app.gnani.ai)
- (Optional) Ollama installed locally for LLM-based extraction
- (Optional) PostgreSQL for production-like testing

---

## Installation

### Backend

```bash
# From the project root
cd backend/app
python -m venv .venv
source .venv/bin/activate    # On Windows: .venv\Scripts\activate
pip install -r requirements.txt

cd ../voice
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Frontend

```bash
cd frontend
npm install
```

### Database (development)

SQLite requires no setup. Alembic migrations create the tables:

```bash
cd backend/app
alembic upgrade head
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values. Each developer edits only their own section.

```bash
# --- voice (Developer A) ---
GNANI_STT_API_KEY=          # Your Gnani STT API key (X-API-Key-ID)
GNANI_TTS_API_KEY=          # Your Gnani TTS API key
GNANI_STT_WSS_URL=wss://api.vachana.ai/stt/v3/stream
GNANI_TTS_WSS_URL=wss://api.vachana.ai/api/v1/tts
VOICE_IMPL=fake             # "fake" for FakeVoice, "gnani" for real integration
LLM_PROVIDER=ollama        # "ollama" or a free hosted tier
LLM_MODEL=                 # Model name for local LLM

# --- app (Developer B) ---
DATABASE_URL=sqlite:///./saakshi.db
SECRET_KEY=                 # Session secret (generate a random string)
SHARE_TOKEN_EXPIRY_DAYS=3
AUDIO_STORAGE_PATH=./data/audio
```

---

## Running the Application

### Backend

```bash
cd backend/app
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm run dev
```

The frontend dev server (typically port 5173) connects to the backend on port 8000.

---

## Testing

```bash
# Backend unit and integration tests
cd backend
pytest

# Gnani smoke test (requires real API key)
pytest backend/voice/tests/test_smoke.py

# Frontend tests
cd frontend
npm test

# End-to-end (Playwright, uses FakeVoice)
npx playwright test
```

See `TESTING_STRATEGY.md` for the full testing plan.

---

## Documentation Index

| Document | Purpose |
|----------|---------|
| [PROJECT_REQUIREMENTS.md](PROJECT_REQUIREMENTS.md) | All requirements with IDs, MVP vs advanced scope, acceptance criteria |
| [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) | Architecture, components, Gnani integration, data flow, Mermaid diagrams |
| [DATABASE_DESIGN.md](DATABASE_DESIGN.md) | Tables, fields, relationships, state machine, hash chain, ER diagram |
| [API_DOCUMENTATION.md](API_DOCUMENTATION.md) | All endpoints, request/response contracts, WebSocket contract, errors |
| [WORK_BREAKDOWN.md](WORK_BREAKDOWN.md) | Developer A/B ownership, independent chunks, dependencies, timeline |
| [IMPLEMENTATION_TRACKER.md](IMPLEMENTATION_TRACKER.md) | Chunk status, requirements completed, tests, verification, blockers |
| [TESTING_STRATEGY.md](TESTING_STRATEGY.md) | Unit, integration, smoke, accuracy, contract, and E2E tests |
| [DECISIONS_AND_ASSUMPTIONS.md](DECISIONS_AND_ASSUMPTIONS.md) | Open questions, decisions, assumptions, risks |
| [DEVELOPMENT_GUIDELINES.md](DEVELOPMENT_GUIDELINES.md) | Folder ownership, git workflow, coding standards, conflict prevention |

---

> **Important:** This project presents Saakshi as "a dated record" and not as "legal proof." Whether courts or labour departments accept such records is not yet verified. Consult a legal-aid clinic or NGO before promising any legal effect.
