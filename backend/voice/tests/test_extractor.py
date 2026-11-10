"""Tests for P9 Extractor, Gemini/Ollama LLM clients, GnaniVoice, and /api/voice/extract."""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.voice.config import VadPreset, VoiceSettings, load_voice_settings
from backend.voice.errors import ErrorCode, VoiceError
from backend.voice.extractor import EntryExtractor, LLM_EXTRACT_SCHEMA
from backend.voice.llm import GeminiClient, OllamaClient, get_llm_client
from backend.voice.models import ExtractContext
from backend.voice.router import get_voice_service, get_voice_settings, router
from backend.voice.service import GnaniVoice


def _settings(
    tmp_path: Path,
    *,
    provider: str = "gemini",
    llm_enabled: bool = True,
    gemini_key: str = "gem-key",
    gemini_model: str = "gemini-test-model",
    ollama_model: str = "qwen-test",
    voice_impl: str = "gnani",
) -> VoiceSettings:
    return replace(
        load_voice_settings(load_env_files=False),
        voice_impl=voice_impl,
        gnani_api_key="gnani-key",
        gnani_header_style="legacy",
        tts_cache_dir=tmp_path / "tts_cache",
        audio_stub_dir=tmp_path / "audio",
        keyterms_enabled=False,
        llm_enabled=llm_enabled,
        llm_provider=provider if llm_enabled else "none",  # type: ignore[arg-type]
        llm_timeout_s=5.0,
        gemini_api_key=gemini_key,
        gemini_model=gemini_model,
        ollama_url="http://localhost:11434",
        ollama_model=ollama_model,
        stt_timeout_s=5.0,
        vad_narration=VadPreset(min_silence_ms=700, vad_threshold=0.6),
        vad_confirm=VadPreset(min_silence_ms=300, min_speech_ms=100, min_segment_ms=100),
    )


@pytest.mark.asyncio
async def test_layer1_regex_and_number_word_fallback(tmp_path: Path) -> None:
    cfg = _settings(tmp_path, llm_enabled=False)
    ext = EntryExtractor(settings=cfg)
    ref = date(2026, 11, 10)

    # Digits from transcribe output + kal date
    d1 = await ext.extract(
        "Kal Basavanagudi site pe 8 ghante kaam kiya, Suresh bhaiya ne 700 bola, 300 diye.",
        "hi-IN",
        ExtractContext(work_date_ref=ref),
    )
    assert d1.work_date == date(2026, 11, 9)
    assert d1.site_name == "Basavanagudi"
    assert d1.counterparty_name == "Suresh"
    assert d1.hours == 8
    assert d1.agreed_amount_inr == 700
    assert d1.paid_amount_inr == 300
    assert d1.due_amount_inr == 400
    assert d1.needs_clarification == []

    # Spoken Hindi number words fallback (reversed P7 lookup)
    d2 = await ext.extract(
        "आज इंदिरानगर साइट पर आठ घंटे काम किया, सुरेश ने सात सौ रुपये बोला, तीन सौ रुपये दिए।",
        "hi-IN",
        ExtractContext(work_date_ref=ref),
    )
    assert d2.hours == 8
    assert d2.agreed_amount_inr == 700
    assert d2.paid_amount_inr == 300
    assert d2.due_amount_inr == 400


@pytest.mark.asyncio
async def test_gemini_layer2_schema_no_hardcoded_model_and_code_computes_due(tmp_path: Path) -> None:
    # No hard-coded model name: missing GEMINI_MODEL raises on direct instantiation.
    with pytest.raises(ValueError):
        GeminiClient(api_key="k", model="")

    captured: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("x-goog-api-key") == "gem-key"
        assert "gemini-test-model:generateContent" in str(request.url)
        body = json.loads(request.content.decode("utf-8"))
        captured.append(body)
        # Mock Gemini returning a bogus due_amount_inr to verify code overwrites it.
        llm_json = {
            "work_date_offset_days": 0,
            "site_name": "Basavanagudi",
            "counterparty_name": "Suresh",
            "work_type": "masonry",
            "hours": 8,
            "days": None,
            "agreed_amount_inr": 750,
            "paid_amount_inr": 250,
            "due_amount_inr": 9999,
            "stated_due_amount_inr": None,
            "field_confidence": {"agreed_amount_inr": 0.96, "paid_amount_inr": 0.94},
        }
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {"content": {"parts": [{"text": json.dumps(llm_json)}]}}
                ]
            },
        )

    client = GeminiClient(
        api_key="gem-key",
        model="gemini-test-model",
        transport=httpx.MockTransport(handler),
    )
    ext = EntryExtractor(settings=_settings(tmp_path), llm_client=client)
    draft = await ext.extract(
        "Aaj kaam kiya",
        "hi-IN",
        ExtractContext(
            work_date_ref=date(2026, 11, 10),
            known_sites=["Basavanagudi"],
            known_counterparties=["Suresh"],
        ),
    )
    assert len(captured) == 1
    gen_cfg = captured[0]["generationConfig"]
    assert gen_cfg["temperature"] == 0
    assert gen_cfg["responseMimeType"] == "application/json"
    assert "due_amount_inr" not in gen_cfg["responseSchema"]["properties"]
    assert "due_amount_inr" not in LLM_EXTRACT_SCHEMA["properties"]
    # Code must compute 750 - 250 = 500, ignoring Gemini's 9999.
    assert draft.due_amount_inr == 500
    assert draft.work_type == "masonry"


@pytest.mark.asyncio
async def test_ollama_layer2_and_fallback_on_failure(tmp_path: Path) -> None:
    def ok_handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        assert body["model"] == "qwen-test"
        assert body["options"]["temperature"] == 0
        return httpx.Response(
            200,
            json={
                "message": {
                    "content": json.dumps(
                        {
                            "work_date_offset_days": -1,
                            "site_name": "Whitefield",
                            "counterparty_name": "Raju",
                            "work_type": None,
                            "hours": 9,
                            "days": None,
                            "agreed_amount_inr": 900,
                            "paid_amount_inr": 400,
                            "stated_due_amount_inr": None,
                            "field_confidence": {"agreed_amount_inr": 0.9},
                        }
                    )
                }
            },
        )

    ollama = OllamaClient(
        base_url="http://localhost:11434",
        model="qwen-test",
        transport=httpx.MockTransport(ok_handler),
    )
    ext = EntryExtractor(settings=_settings(tmp_path, provider="ollama"), llm_client=ollama)
    d = await ext.extract("yesterday work", "en-IN", ExtractContext(work_date_ref=date(2026, 11, 10)))
    assert d.work_date == date(2026, 11, 9)
    assert d.due_amount_inr == 500

    # Broken Ollama falls back silently to Layer 1 regex.
    broken = OllamaClient(
        base_url="http://localhost:11434",
        model="qwen-test",
        transport=httpx.MockTransport(lambda req: httpx.Response(500, text="err")),
    )
    ext_fb = EntryExtractor(settings=_settings(tmp_path, provider="ollama"), llm_client=broken)
    fb_draft = await ext_fb.extract(
        "Worked 8 hours at Hebbal site under Mohan agreed 600 paid 200",
        "en-IN",
        ExtractContext(work_date_ref=date(2026, 11, 10)),
    )
    assert fb_draft.agreed_amount_inr == 600
    assert fb_draft.paid_amount_inr == 200
    assert fb_draft.due_amount_inr == 400

    # Factory returns None when VOICE_LLM_ENABLED=false
    assert get_llm_client(_settings(tmp_path, llm_enabled=False)) is None


@pytest.mark.asyncio
async def test_layer3_clarification_reextraction_and_manual_flag(tmp_path: Path) -> None:
    ext = EntryExtractor(settings=_settings(tmp_path, llm_enabled=False))
    ref = date(2026, 11, 10)

    # paid > agreed triggers clarification & due_amount_inr=None
    over = await ext.extract(
        "At Koramangala site 6 hours with Mohan, agreed 500, paid 700.",
        "en-IN",
        ExtractContext(work_date_ref=ref),
    )
    assert over.due_amount_inr is None
    assert over.needs_clarification == ["paid_amount_inr"]
    assert over.clarification_question is not None

    # Stated due mismatch triggers clarification
    mismatch = await ext.extract(
        "Aaj Yelahanka site pe 8 ghante kaam kiya, Rajesh ne 800 bola, 300 diya, baaki 600 hai.",
        "hi-IN",
        ExtractContext(work_date_ref=ref),
    )
    assert mismatch.due_amount_inr == 500
    assert mismatch.stated_due_amount_inr == 600
    assert mismatch.needs_clarification == ["due_amount_inr"]

    # Missing multiple fields asks at most ONE question per turn
    partial = await ext.extract(
        "Worked at Whitefield site under Raju",
        "en-IN",
        ExtractContext(work_date_ref=ref),
    )
    assert len(partial.needs_clarification) >= 2
    assert partial.clarification_question is not None
    assert partial.clarification_question.count("?") == 1
    assert partial.manual_correction_required is False

    # Re-extraction answers first question (agreed amount) -> moves cleanly to next missing field
    turn1 = await ext.extract(
        "",
        "en-IN",
        ExtractContext(
            work_date_ref=ref,
            previous_draft=partial,
            clarification_answer="800",
            turn_count=1,
        ),
    )
    assert turn1.agreed_amount_inr == 800
    assert "agreed_amount_inr" not in turn1.needs_clarification
    assert "paid_amount_inr" in turn1.needs_clarification

    # Turn 2 still unresolved -> manual_correction_required=True
    turn2 = await ext.extract(
        "",
        "en-IN",
        ExtractContext(
            work_date_ref=ref,
            previous_draft=turn1,
            clarification_answer="not sure",
            turn_count=2,
        ),
    )
    assert turn2.manual_correction_required is True


def test_post_voice_extract_and_gnani_voice_service(tmp_path: Path) -> None:
    cfg = _settings(tmp_path, llm_enabled=False)
    service = GnaniVoice(settings=cfg)

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_voice_settings] = lambda: cfg
    app.dependency_overrides[get_voice_service] = lambda: service

    with TestClient(app) as tc:
        resp = tc.post(
            "/api/voice/extract",
            json={
                "transcript": "Aaj Basavanagudi site pe 8 ghante kaam kiya, Suresh bhaiya ne 700 bola, 300 diye.",
                "lang": "hi-IN",
                "context": {"work_date_ref": "2026-11-10"},
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["agreed_amount_inr"] == 700
        assert body["paid_amount_inr"] == 300
        assert body["due_amount_inr"] == 400

        cls_resp = tc.post(
            "/api/voice/classify-confirmation",
            json={"transcript": "हाँ ठीक है", "lang": "hi-IN"},
        )
        assert cls_resp.status_code == 200
        assert cls_resp.json() == {"result": "yes"}


@pytest.mark.asyncio
async def test_layer1_matches_all_10_entry_fixtures(tmp_path: Path) -> None:
    fixtures_file = Path(__file__).resolve().parents[1] / "fixtures" / "entries.json"
    items = json.loads(fixtures_file.read_text(encoding="utf-8"))["entries"]
    ext = EntryExtractor(settings=_settings(tmp_path, llm_enabled=False))
    ref = date(2026, 11, 10)

    for item in items:
        if item.get("llm_only"):
            continue
        draft = await ext.extract(
            item["transcript"],
            item["lang"],
            ExtractContext(work_date_ref=ref),
        )
        exp = item["expected_draft"]
        expected_date = ref + timedelta(days=int(item.get("work_date_offset_days", 0)))
        assert draft.work_date == expected_date, item["id"]
        assert draft.site_name == exp["site_name"], item["id"]
        assert draft.counterparty_name == exp["counterparty_name"], item["id"]
        assert draft.work_type == exp["work_type"], item["id"]
        assert draft.hours == exp["hours"], item["id"]
        assert draft.days == exp["days"], item["id"]
        assert draft.agreed_amount_inr == exp["agreed_amount_inr"], item["id"]
        assert draft.paid_amount_inr == exp["paid_amount_inr"], item["id"]
        assert draft.due_amount_inr == exp["due_amount_inr"], item["id"]
        assert draft.stated_due_amount_inr == exp["stated_due_amount_inr"], item["id"]
        assert draft.needs_clarification == exp["needs_clarification"], item["id"]
        assert (draft.clarification_question is not None) == bool(exp["needs_clarification"]), item["id"]


@pytest.mark.asyncio
async def test_llm_only_fixtures_with_layer2_and_layer3(tmp_path: Path) -> None:
    fixtures_file = Path(__file__).resolve().parents[1] / "fixtures" / "entries.json"
    llm_items = [
        item
        for item in json.loads(fixtures_file.read_text(encoding="utf-8"))["entries"]
        if item.get("llm_only")
    ]
    assert len(llm_items) == 1

    item = llm_items[0]
    exp = item["expected_draft"]

    def handler(request: httpx.Request) -> httpx.Response:
        llm_json = {
            "work_date_offset_days": item["work_date_offset_days"],
            "site_name": exp["site_name"],
            "counterparty_name": exp["counterparty_name"],
            "work_type": exp["work_type"],
            "hours": exp["hours"],
            "days": exp["days"],
            "agreed_amount_inr": exp["agreed_amount_inr"],
            "paid_amount_inr": exp["paid_amount_inr"],
            "stated_due_amount_inr": exp["stated_due_amount_inr"],
            "field_confidence": exp["field_confidence"],
        }
        return httpx.Response(
            200,
            json={"candidates": [{"content": {"parts": [{"text": json.dumps(llm_json)}]}}]},
        )

    client = GeminiClient(
        api_key="gem-key",
        model="gemini-test-model",
        transport=httpx.MockTransport(handler),
    )
    ext = EntryExtractor(settings=_settings(tmp_path), llm_client=client)
    draft = await ext.extract(
        item["transcript"],
        item["lang"],
        ExtractContext(work_date_ref=date(2026, 11, 10)),
    )
    assert draft.agreed_amount_inr == 800
    assert draft.paid_amount_inr == 400
    assert draft.due_amount_inr == 400
    assert draft.needs_clarification == ["hours"]
    assert draft.clarification_question is not None
    assert ext.last_layer2_status == "ok"


@pytest.mark.asyncio
async def test_layer1_romanized_homonyms_do_not_misparse_numbers(tmp_path: Path) -> None:
    ext = EntryExtractor(settings=_settings(tmp_path, llm_enabled=False))
    ref = date(2026, 11, 10)

    # "saath" in "ke saath" ("with") must NOT become agreed_amount_inr=60.
    d1 = await ext.extract(
        "Aaj Suresh ke saath kaam kiya, 800 me se aadha mila.",
        "hi-IN",
        ExtractContext(work_date_ref=ref),
    )
    assert d1.agreed_amount_inr != 60
    assert ext.last_layer2_status == "disabled"

    # Ambiguous homonyms in non-numeric contexts ("ek saath", "do", "Das") stay non-numeric,
    # while real numeric phrases ("do din", "saath rupaye", "do hazaar", "saath sau") convert.
    d2 = await ext.extract(
        "Ek saath kaam kar do, Ramesh Das ne 500 diya.",
        "hi-IN",
        ExtractContext(work_date_ref=ref),
    )
    assert d2.paid_amount_inr == 500
    assert d2.agreed_amount_inr is None

    d3 = await ext.extract(
        "do din kaam kiya, do hazaar bola, saath rupaye diye.",
        "hi-IN",
        ExtractContext(work_date_ref=ref),
    )
    assert d3.days == 2
    assert d3.agreed_amount_inr == 2000
    assert d3.paid_amount_inr == 60

    d4 = await ext.extract(
        "saath hazaar bola aur do sau diya.",
        "hi-IN",
        ExtractContext(work_date_ref=ref),
    )
    assert d4.agreed_amount_inr == 60000
    assert d4.paid_amount_inr == 200


@pytest.mark.asyncio
async def test_gemini_thinking_level_thought_parts_and_503_retry(tmp_path: Path) -> None:
    attempts = 0
    seen_bodies: list[dict] = []

    def retry_then_ok(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        seen_bodies.append(json.loads(request.content.decode("utf-8")))
        if attempts == 1:
            return httpx.Response(503, text="high demand")
        llm_json = {
            "work_date_offset_days": 0,
            "site_name": None,
            "counterparty_name": "Suresh",
            "work_type": None,
            "hours": None,
            "days": None,
            "agreed_amount_inr": 800,
            "paid_amount_inr": 400,
            "stated_due_amount_inr": None,
            "field_confidence": {"counterparty_name": 0.9, "agreed_amount_inr": 0.92, "paid_amount_inr": 0.85},
        }
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {"thought": True, "text": "internal thought"},
                                {"text": json.dumps(llm_json)},
                            ]
                        }
                    }
                ]
            },
        )

    client = GeminiClient(
        api_key="gem-key",
        model="gemini-test-model",
        thinking_level="MINIMAL",
        max_retries=1,
        retry_backoff_s=0.0,
        transport=httpx.MockTransport(retry_then_ok),
    )
    ext = EntryExtractor(settings=_settings(tmp_path), llm_client=client)
    draft = await ext.extract(
        "Aaj Suresh ke saath kaam kiya, 800 me se aadha mila.",
        "hi-IN",
        ExtractContext(work_date_ref=date(2026, 11, 10)),
    )
    assert attempts == 2
    assert seen_bodies[0]["generationConfig"]["thinkingConfig"] == {"thinkingLevel": "MINIMAL"}
    assert draft.counterparty_name == "Suresh"
    assert draft.agreed_amount_inr == 800
    assert draft.paid_amount_inr == 400
    assert draft.due_amount_inr == 400
    assert ext.last_layer2_status == "ok"

    # Exhausted 503 records non-PII diagnostic reason and falls back cleanly.
    always_503 = GeminiClient(
        api_key="gem-key",
        model="gemini-test-model",
        max_retries=1,
        retry_backoff_s=0.0,
        transport=httpx.MockTransport(lambda req: httpx.Response(503, text="secret-upstream")),
    )
    ext_fail = EntryExtractor(settings=_settings(tmp_path), llm_client=always_503)
    fb = await ext_fail.extract(
        "Aaj Suresh ke saath kaam kiya, 800 me se aadha mila.",
        "hi-IN",
        ExtractContext(work_date_ref=date(2026, 11, 10)),
    )
    assert fb.agreed_amount_inr != 60
    assert fb.counterparty_name == "Suresh"
    assert ext_fail.last_layer2_status == "fallback:EXTRACTION_FAILED:Gemini returned HTTP 503."
    assert "secret-upstream" not in ext_fail.last_layer2_status
    assert "Suresh" not in ext_fail.last_layer2_status

    # Model failover + automatic thinkingConfig strip on HTTP 400.
    calls: list[tuple[str, bool]] = []

    def failover_handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        has_thinking = "thinkingConfig" in body.get("generationConfig", {})
        url = str(request.url)
        calls.append((url, has_thinking))
        if "primary-m:" in url:
            return httpx.Response(503, text="busy")
        if "fallback-m:" in url and has_thinking:
            return httpx.Response(400, text="thinkingLevel unsupported")
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "text": json.dumps(
                                        {
                                            "work_date_offset_days": 0,
                                            "site_name": None,
                                            "counterparty_name": "Suresh",
                                            "work_type": None,
                                            "hours": None,
                                            "days": None,
                                            "agreed_amount_inr": 800,
                                            "paid_amount_inr": 400,
                                            "stated_due_amount_inr": None,
                                            "field_confidence": {"agreed_amount_inr": 0.9},
                                        }
                                    )
                                }
                            ]
                        }
                    }
                ]
            },
        )

    failover_client = GeminiClient(
        api_key="gem-key",
        model="primary-m",
        fallback_models=["fallback-m"],
        thinking_level="MINIMAL",
        max_retries=1,
        retry_backoff_s=0.0,
        transport=httpx.MockTransport(failover_handler),
    )
    ext_fo = EntryExtractor(settings=_settings(tmp_path), llm_client=failover_client)
    fo_draft = await ext_fo.extract(
        "Aaj Suresh ke saath kaam kiya, 800 me se aadha mila.",
        "hi-IN",
        ExtractContext(work_date_ref=date(2026, 11, 10)),
    )
    assert failover_client.last_used_model == "fallback-m"
    assert ext_fo.last_layer2_status == "ok"
    assert ext_fo.last_layer2_model == "fallback-m"
    assert fo_draft.agreed_amount_inr == 800
    assert fo_draft.paid_amount_inr == 400
    assert fo_draft.due_amount_inr == 400
    assert calls[-1][1] is False


@pytest.mark.asyncio
async def test_llm_malformed_json_and_extract_endpoint_unexpected_error(tmp_path: Path) -> None:
    bad_gemini = GeminiClient(
        api_key="gem-key",
        model="gemini-test-model",
        transport=httpx.MockTransport(lambda req: httpx.Response(200, text="not-json")),
    )
    with pytest.raises(VoiceError) as g_exc:
        await bad_gemini.extract_json("prompt", LLM_EXTRACT_SCHEMA)
    assert g_exc.value.code == ErrorCode.EXTRACTION_FAILED

    bad_ollama = OllamaClient(
        base_url="http://localhost:11434",
        model="qwen-test",
        transport=httpx.MockTransport(lambda req: httpx.Response(200, text="not-json")),
    )
    with pytest.raises(VoiceError) as o_exc:
        await bad_ollama.extract_json("prompt", LLM_EXTRACT_SCHEMA)
    assert o_exc.value.code == ErrorCode.EXTRACTION_FAILED

    # EntryExtractor falls back cleanly to Layer 1 on malformed Gemini HTTP 200.
    ext = EntryExtractor(settings=_settings(tmp_path), llm_client=bad_gemini)
    draft = await ext.extract(
        "Worked 8 hours at Hebbal site under Mohan agreed 600 paid 200",
        "en-IN",
        ExtractContext(work_date_ref=date(2026, 11, 10)),
    )
    assert draft.due_amount_inr == 400

    # Unexpected error in POST /api/voice/extract returns structured ErrorCode JSON.
    class ExplodingVoice:
        async def extract_entry(self, *args, **kwargs):
            raise RuntimeError("secret-internal-trace")

        async def synthesize(self, *args, **kwargs):
            return b""

        def build_readback(self, *args, **kwargs):
            return ""

        def classify_confirmation(self, *args, **kwargs):
            return "unclear"

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_voice_service] = lambda: ExplodingVoice()
    with TestClient(app) as tc:
        resp = tc.post("/api/voice/extract", json={"transcript": "hi", "lang": "en-IN"})
        assert resp.status_code == 500
        body = resp.json()
        assert body["type"] == "error"
        assert body["code"] == ErrorCode.EXTRACTION_FAILED.value
        assert "secret-internal-trace" not in body["message"]
