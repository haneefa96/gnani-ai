"""Unit tests for P10 evaluation and A/B tuning scoring logic using fixtures only."""

from __future__ import annotations

import csv
import json
from dataclasses import replace
from datetime import date
from pathlib import Path

import pytest

from backend.voice.config import VadPreset, VoiceSettings, load_voice_settings
from backend.voice.eval.ab_tuning import TuningConfig, build_ab_grid, format_ab_markdown, run_ab_grid
from backend.voice.eval.run_eval import (
    EvalLabelRow,
    format_eval_markdown,
    load_labels_csv,
    run_evaluation,
)


def _offline_settings(tmp_path: Path) -> VoiceSettings:
    return replace(
        load_voice_settings(load_env_files=False),
        voice_impl="gnani",
        gnani_api_key="",
        gnani_header_style="legacy",
        tts_cache_dir=tmp_path / "tts_cache",
        audio_stub_dir=tmp_path / "audio",
        keyterms_enabled=False,
        llm_enabled=False,
        llm_provider="none",
        vad_narration=VadPreset(min_silence_ms=700, vad_threshold=0.6),
        vad_confirm=VadPreset(min_silence_ms=300, min_speech_ms=100, min_segment_ms=100),
    )


def _write_fixture_labels_csv(tmp_path: Path) -> Path:
    fixtures = json.loads(
        (Path(__file__).resolve().parents[1] / "fixtures" / "entries.json").read_text(
            encoding="utf-8"
        )
    )["entries"]
    csv_path = tmp_path / "labels.csv"
    fieldnames = [
        "utterance_id",
        "audio_file",
        "language",
        "noise_condition",
        "category",
        "expected_transcript",
        "expected_work_date_offset",
        "expected_site_name",
        "expected_counterparty_name",
        "expected_hours",
        "expected_days",
        "expected_agreed_inr",
        "expected_paid_inr",
        "expected_due_inr",
        "expected_confirmation",
        "notes",
    ]
    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for idx, item in enumerate(fixtures[:4]):
            exp = item["expected_draft"]
            writer.writerow(
                {
                    "utterance_id": item["id"],
                    "audio_file": item["audio_file"],
                    "language": item["lang"],
                    "noise_condition": "clean" if idx % 2 == 0 else "noisy",
                    "category": item["category"],
                    "expected_transcript": item["transcript"],
                    "expected_work_date_offset": item["work_date_offset_days"],
                    "expected_site_name": exp["site_name"] or "",
                    "expected_counterparty_name": exp["counterparty_name"] or "",
                    "expected_hours": exp["hours"] or "",
                    "expected_days": exp["days"] or "",
                    "expected_agreed_inr": exp["agreed_amount_inr"] if exp["agreed_amount_inr"] is not None else "",
                    "expected_paid_inr": exp["paid_amount_inr"] if exp["paid_amount_inr"] is not None else "",
                    "expected_due_inr": exp["due_amount_inr"] if exp["due_amount_inr"] is not None else "",
                    "expected_confirmation": "",
                    "notes": "",
                }
            )
    return csv_path


@pytest.mark.asyncio
async def test_eval_scoring_and_markdown_output_from_fixtures(tmp_path: Path) -> None:
    csv_path = _write_fixture_labels_csv(tmp_path)
    labels = load_labels_csv(csv_path)
    assert len(labels) == 4

    audio_dir = Path(__file__).resolve().parents[1] / "fixtures" / "audio"
    summary = await run_evaluation(
        labels,
        audio_dir,
        settings=_offline_settings(tmp_path),
        use_expected_transcript=True,
        ref_date=date(2026, 11, 10),
    )

    assert summary["overall"]["count"] == 4
    assert summary["overall"]["amount_acc"] == 100.0
    assert summary["overall"]["hours_acc"] == 100.0
    assert set(summary["by_language"].keys()) == {"hi-IN", "kn-IN", "bn-IN", "en-IN"}
    assert set(summary["by_noise"].keys()) == {"clean", "noisy"}

    md = format_eval_markdown(summary)
    assert "| overall | 4 |" in md
    assert "| noise:noisy | 2 |" in md


@pytest.mark.asyncio
async def test_ab_tuning_grid_runs_with_mocked_stt_runner(tmp_path: Path) -> None:
    csv_path = _write_fixture_labels_csv(tmp_path)
    labels = load_labels_csv(csv_path)
    audio_dir = Path(__file__).resolve().parents[1] / "fixtures" / "audio"

    grid = build_ab_grid(
        header_styles=("legacy", "new"),
        keyterms_options=(False, True),
        vad_presets={"default": VadPreset(min_silence_ms=700, vad_threshold=0.6)},
    )
    assert len(grid) == 4

    def fake_runner_factory(cfg: VoiceSettings, tc: TuningConfig):
        async def _runner(row: EvalLabelRow, _audio_path: Path) -> str:
            # Simulate keyterms helping on noisy clips while keyterms=off drops site name.
            if not tc.keyterms_enabled and row.noise_condition == "noisy":
                return "Worked 9 hours agreed 800 paid 500"
            return row.expected_transcript

        return _runner

    results = await run_ab_grid(
        labels,
        audio_dir,
        base_settings=_offline_settings(tmp_path),
        grid=grid,
        runner_factory=fake_runner_factory,
    )
    assert len(results) == 4
    kt_off = [r for r in results if not r["keyterms"]][0]
    kt_on = [r for r in results if r["keyterms"]][0]
    assert kt_on["site_acc"] > kt_off["site_acc"]

    md = format_ab_markdown(results)
    assert "| legacy|kt=on|default |" in md

