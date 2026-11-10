# Needs from Developer B (`needs-from-B`)

Items Developer A needs from Developer B's owned paths (`backend/app/**`, `frontend/**`, repo root, and joint `contracts/`).

---

## 1. Repository Skeleton & Tooling (Day 0–2)
- **`.gitignore`**: Ensure `.env`, `backend/voice/.env`, `data/audio/`, `data/tts_cache/`, `__pycache__/`, `.pytest_cache/`, `.venv/`, and `frontend/src/generated/` are ignored.
- **Root `.env.example`**: Per D1, Developer A created `backend/voice/.env.example` (voice vars only) and left the root untouched. When B creates root `.env.example`, please include/reference A's variables alongside `# --- app (B) ---`.
- **CI / Dockerfile**: Install both `backend/app/requirements.txt` and `backend/voice/requirements.txt`.

## 2. Joint Contracts Freeze (Day 0–2)
Please commit the initial frozen joint contracts (incorporating `docs/voice/contract-change-proposals.md`):
- `contracts/voice_interface.py` (`VoiceService`, `AudioStore` Protocol, `SavedAudio`, `AudioKind`, `ErrorCode`, `EntryDraft`, `ExtractContext`)
- `contracts/schemas/entry_draft.schema.json`
- `contracts/api.openapi.yaml`
- Once `contracts/` exists, `contracts/fake_voice.py` should re-export `FakeVoice` from `backend.voice.fixtures.fake_voice`.

## 3. Backend App Integration (`backend/app/**`)
- **`backend/app/main.py` router mount**:
  ```python
  # When running from backend/ (import voice.*):
  from voice.router import get_audio_store, router as voice_router
  # (Also works from repo root as backend.voice.router since voice/ uses relative imports.)
  app.include_router(voice_router)
  app.dependency_overrides[get_audio_store] = lambda: real_audio_store
  ```
- **Real `AudioStore` implementation (D2, D3)**:
  - Implement `AudioStore` (`async def save_audio(self, data: bytes, kind: AudioKind) -> SavedAudio`) returning `audio_ref`, `sha256`, and `duration_ms` for `kind` in `narration | confirm | consent | dispute`.
  - Incoming `data` from `/ws/stt` is already a 16 kHz mono PCM16 WAV (with RIFF/WAV header).
- **Consuming `audio_saved` from `/ws/stt` (D3)**:
  `POST /api/entries/draft`, `POST /api/auth/register` (consent audio), and `POST /api/c/{token}/respond` (dispute audio) should accept `{audio_ref, sha256, duration_ms}` emitted by `/ws/stt` (`{"type": "audio_saved", ...}`).
- **`EntryDraft` DB mapping & `compute_due` (D7)**:
  - `EntryDraft` keeps Section 7.4 field names (`agreed_amount_inr`, `paid_amount_inr`, `due_amount_inr`, `work_type`, plus optional `stated_due_amount_inr` and `manual_correction_required`); B maps them to `entries` table columns (`agreed_inr`, `paid_inr`, `due_inr`, etc.).
  - In `POST /api/entries/{id}/confirm`, recompute `due` using `compute_due(agreed, paid)` from `backend/voice/amounts.py` (`None` if either is `None` or `paid > agreed`).
- **Gemini Privacy Consent Disclosure (`docs/voice/llm-privacy.md`)**:
  - When `VOICE_LLM_PROVIDER=gemini` (default), transcript text leaves the machine for Google Gemini. Onboarding consent copy and checkbox text must disclose cloud AI transcript processing.

## 4. Frontend App Integration (`frontend/**`)
- **Verified `frontend/package.json` dependencies** (tested in an isolated scratch project with `tsc --noEmit`, `vitest run`, and `vite build`):
  - Runtime dependencies: `react`, `react-dom`, `react-router-dom` (tested v7; compatible with v6/v7 `RouteObject[]` in `frontend/src/voice/routes.tsx` per D4).
  - Styling: Tailwind CSS (utility classes used in `VoiceButton.tsx`, `TtsPlayer.tsx`, `VoiceTestPage.tsx`). No external icon libraries are required.
  - Dev / test dependencies: `typescript`, `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `vitest`.
- **Verified `frontend/tsconfig.json` compilerOptions & Vite/Vitest settings**:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "lib": ["ES2022", "DOM", "DOM.Iterable"],
      "module": "ESNext",
      "moduleResolution": "bundler",
      "jsx": "react-jsx",
      "strict": true,
      "noUncheckedIndexedAccess": true,
      "noEmit": true,
      "skipLibCheck": true,
      "types": ["vite/client"]
    }
  }
  ```
  - AudioWorklet types & bundling: `frontend/src/voice/recorder.worklet.ts` declares minimal `AudioWorkletProcessor` globals locally (no `@types/audioworklet` package required), and `frontend/src/voice/vite-assets.d.ts` declares `*?worker&url` so `useSttSocket.ts` compiles cleanly both with and without `"types": ["vite/client"]`. `vite build` bundles `recorder.worklet.ts` + `pcm.ts` into `dist/assets/recorder.worklet-*.js`.
  - Include `"test": "vitest run"` so `frontend/src/voice/pcm.test.ts` runs in CI.
  - Vite dev proxy: proxy `/api/*` (HTTP) and `/ws/*` (`ws: true`) to FastAPI.
- **Mount A's routes (`frontend/src/voice/routes.tsx`) (D4)**:
  Import `voiceRoutes` from `src/voice/routes` and spread `...voiceRoutes` into B's `createBrowserRouter(...)` / `useRoutes(...)`.
- **Contractor Page Shell `/c/:token` (Update 3.7 / D4)**:
  B builds the contractor page shell and imports `TtsPlayer`, `VoiceButton`, and `useSttSocket` via `frontend/src/voice/types.ts`.

## 5. Evaluation Audio Recording (Update 3.9)
- Record 200 volunteer utterances (50 per language: `hi-IN`, `kn-IN`, `bn-IN`, `en-IN`, clean + noisy) and fill labels following:
  - `docs/voice/recording-guide.md`
  - `docs/voice/eval-labels-template.csv`
