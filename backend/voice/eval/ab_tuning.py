"""A/B tuning grid runner over keyterms, VAD presets, and Gnani header styles."""

from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

from ..config import HeaderStyle, VadPreset, VoiceSettings, load_voice_settings
from .run_eval import (
    EvalLabelRow,
    SttRunner,
    load_labels_csv,
    run_evaluation,
)


@dataclass(frozen=True)
class TuningConfig:
    name: str
    keyterms_enabled: bool
    vad_preset_name: str
    vad_preset: VadPreset
    header_style: HeaderStyle


DEFAULT_VAD_PRESETS: dict[str, VadPreset] = {
    "narration_default": VadPreset(min_silence_ms=700, vad_threshold=0.6),
    "narration_noisy": VadPreset(min_silence_ms=700, vad_threshold=0.72, min_speech_ms=200),
    "narration_sensitive": VadPreset(min_silence_ms=500, vad_threshold=0.5, min_speech_ms=80),
}


def build_ab_grid(
    *,
    header_styles: tuple[HeaderStyle, ...] = ("legacy", "new"),
    keyterms_options: tuple[bool, ...] = (False, True),
    vad_presets: dict[str, VadPreset] | None = None,
) -> list[TuningConfig]:
    """Generate the keyterms x VAD-preset x header-style A/B grid."""
    presets = vad_presets or DEFAULT_VAD_PRESETS
    grid: list[TuningConfig] = []
    for style in header_styles:
        for kt in keyterms_options:
            for preset_name, preset in presets.items():
                grid.append(
                    TuningConfig(
                        name=f"{style}|kt={'on' if kt else 'off'}|{preset_name}",
                        keyterms_enabled=kt,
                        vad_preset_name=preset_name,
                        vad_preset=preset,
                        header_style=style,
                    )
                )
    return grid


async def run_ab_grid(
    labels: list[EvalLabelRow],
    audio_dir: Path,
    *,
    base_settings: VoiceSettings | None = None,
    grid: list[TuningConfig] | None = None,
    runner_factory: Any = None,
) -> list[dict[str, Any]]:
    """Run evaluation across every TuningConfig in the grid and return comparison rows."""
    cfg_base = base_settings or load_voice_settings()
    configs = grid or build_ab_grid()
    results: list[dict[str, Any]] = []

    for item in configs:
        cfg = replace(
            cfg_base,
            keyterms_enabled=item.keyterms_enabled,
            gnani_header_style=item.header_style,
            vad_narration=item.vad_preset,
        )
        stt_runner: SttRunner | None = runner_factory(cfg, item) if runner_factory else None
        summary = await run_evaluation(
            labels,
            audio_dir,
            settings=cfg,
            stt_runner=stt_runner,
            pass_keyterms=item.keyterms_enabled,
        )
        overall = summary["overall"]
        results.append(
            {
                "config": item.name,
                "header_style": item.header_style,
                "keyterms": item.keyterms_enabled,
                "vad_preset": item.vad_preset_name,
                **overall,
            }
        )
    return results


def format_ab_markdown(results: list[dict[str, Any]]) -> str:
    """Format A/B tuning results as a Markdown comparison table."""
    lines = [
        "| Config | Header Style | Keyterms | VAD Preset | Amount % | Hours % | Contractor % | Site % | Mean Latency (ms) |",
        "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for r in results:
        lines.append(
            f"| {r['config']} | {r['header_style']} | {'on' if r['keyterms'] else 'off'} | "
            f"{r['vad_preset']} | {r['amount_acc']} | {r['hours_acc']} | "
            f"{r['contractor_acc']} | {r['site_acc']} | {r['mean_latency_ms']} |"
        )
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Gnani keyterms/VAD/header A/B tuning.")
    parser.add_argument("--audio-dir", required=True, type=Path)
    parser.add_argument("--labels", required=True, type=Path)
    parser.add_argument("--json-out", default=None, type=Path)
    parser.add_argument("--md-out", default=None, type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    labels = load_labels_csv(args.labels)
    results = asyncio.run(run_ab_grid(labels, args.audio_dir))
    md = format_ab_markdown(results)
    print(md)
    if args.json_out:
        args.json_out.write_text(json.dumps(results, indent=2), encoding="utf-8")
    if args.md_out:
        args.md_out.write_text(md + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

