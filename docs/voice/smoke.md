# Gnani Day 1 Smoke Test (`docs/voice/smoke.md`)

> **Privacy rule:** Never commit or paste `GNANI_API_KEY`, real worker transcripts, or local file paths into this document.

---

## 1. Recorded Smoke Test Results (2026-11-10 — All 9 Cases `OK`)

| Case | Status | Code | Latency (ms) | Detected Lang | Audio (s) | Segments | Digits? | Script | Chars | Notes |
| --- | --- | --- | ---: | --- | ---: | ---: | --- | --- | ---: | --- |
| rest_stt_short | OK | 200 | 1158 | en-IN | 10.0 | 1 | False | mixed(devanagari+latin) | 86 | proc_s=0.167; e2e_s=0.169 |
| ws_stt_new_headers | OK | 101/OK | 15654 | en-IN,hi-IN | 10.0 | 2 | False | mixed(devanagari+latin) | 85 | Single-code `language_code=hi-IN` |
| ws_stt_legacy_headers | OK | 101/OK | 17298 | en-IN,hi-IN | 10.0 | 2 | False | mixed(devanagari+latin) | 85 | Single-code `lang_code=hi-IN` |
| tts_rest_hi | OK | 200 | 2187 | hi-IN | 6.93 | - | - | - | - | voice=Shivani; wav=16000Hz/1ch/16bit; bytes=221910 |
| tts_rest_kn | OK | 200 | 3706 | kn-IN | 8.36 | - | - | - | - | voice=Shivani; wav=16000Hz/1ch/16bit; bytes=267422 |
| roundtrip_tts_hi_rest | OK | 200 | 1207 | hi-IN | 6.93 | 1 | True | mixed(devanagari+latin) | 82 | proc_s=0.236; e2e_s=0.238 |
| roundtrip_tts_hi_ws | OK | 101/OK | 11066 | hi-IN | 6.93 | 2 | True | mixed(devanagari+latin) | 82 | vad_flush_ms=603 |
| ws_both_probe_a | OK | 101/OK | 10392 | hi-IN | 6.93 | 2 | True | mixed(devanagari+latin) | 82 | vad_flush_ms=631; new headers won |
| ws_both_probe_b | OK | 101/OK | 11128 | hi-IN,kn-IN | 6.93 | 2 | False | mixed(devanagari+kannada) | 93 | vad_flush_ms=834 |

### Observed API Behavior
- **Header precedence**: **New spellings (`model`, `language_code`, `format`) won** (`GNANI_HEADER_STYLE=new` set as default).
- **WS STT language header**: Single-code (`hi-IN`) succeeded 100% and handled mixed English+Hindi speech (`"site"` / `"Hi, my name is..."`). Comma-separated `"hi-IN,en-IN"` caused `ConnectionClosedError` on WS STT (kept single-code in `gnani_stt.py`).
- **TTS REST**: `timbre-v3.0` (`Shivani`) synthesized `hi-IN` (6.93 s in 2.19 s) and `kn-IN` (8.36 s in 3.71 s); Hindi TTS round-tripped through both REST and WS `prisma-v3.0` (`transcribe`) preserving digits (`8`, `700`, `300`).
- **Rate-limit / concurrency**: `No 429 / concurrency errors observed` (`2+ concurrent WS sessions allowed` observed in earlier probe).
- **Observed VAD defaults**: `~603–631 ms` flush latency after last audio frame on round-trip clip (no VAD override headers sent).
- **REST max-duration (30 s vs 60 s)**: `PENDING` (run once with `--long-audio` >30 s if needed).
