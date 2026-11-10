"""Evaluation harness scoring STT + EntryExtractor accuracy against labeled CSV datasets."""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import time
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path
from typing import Any, Awaitable, Callable

from ..config import VoiceSettings, load_voice_settings
from ..extractor import EntryExtractor
from ..gnani_stt import FRAME_BYTES, GnaniSttClient
from ..models import EntryDraft, ExtractContext
from .smoke_test import load_audio_file_as_pcm16_16k


@dataclass(frozen=True)
class EvalLabelRow:
    utterance_id: str
    audio_file: str
    language: str
    noise_condition: str
    category: str
    expected_transcript: str
    expected_work_date_offset: int
    expected_site_name: str | None
    expected_counterparty_name: str | None
    expected_hours: float | None
    expected_days: float | None
    expected_agreed_inr: float | None
    expected_paid_inr: float | None
    expected_due_inr: float | None


@dataclass(frozen=True)
class UtteranceOutcome:
    utterance_id: str
    language: str
    noise_condition: str
    stt_ok: bool
    amount_match: bool
    agreed_match: bool
    paid_match: bool
    due_match: bool
    hours_match: bool
    contractor_match: bool
    site_match: bool
    latency_ms: int


def _opt_float(val: str | None) -> float | None:
    cleaned = (val or "").strip()
    return float(cleaned) if cleaned else None


def _opt_int(val: str | None, default: int = 0) -> int:
    cleaned = (val or "").strip()
    return int(cleaned) if cleaned else default


def _opt_str(val: str | None) -> str | None:
    cleaned = (val or "").strip()
    return cleaned if cleaned else None


def load_labels_csv(csv_path: Path) -> list[EvalLabelRow]:
    """Parse an evaluation labels CSV matching docs/voice/eval-labels-template.csv."""
    rows: list[EvalLabelRow] = []
    with csv_path.open("r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        for raw in reader:
            if not (raw.get("utterance_id") or "").strip():
                continue
            rows.append(
                EvalLabelRow(
                    utterance_id=raw["utterance_id"].strip(),
                    audio_file=raw["audio_file"].strip(),
                    language=raw["language"].strip(),
                    noise_condition=(raw.get("noise_condition") or "clean").strip() or "clean",
                    category=(raw.get("category") or "complete").strip() or "complete",
                    expected_transcript=(raw.get("expected_transcript") or "").strip(),
                    expected_work_date_offset=_opt_int(raw.get("expected_work_date_offset"), 0),
                    expected_site_name=_opt_str(raw.get("expected_site_name")),
                    expected_counterparty_name=_opt_str(raw.get("expected_counterparty_name")),
                    expected_hours=_opt_float(raw.get("expected_hours")),
                    expected_days=_opt_float(raw.get("expected_days")),
                    expected_agreed_inr=_opt_float(raw.get("expected_agreed_inr")),
                    expected_paid_inr=_opt_float(raw.get("expected_paid_inr")),
                    expected_due_inr=_opt_float(raw.get("expected_due_inr")),
                )
            )
    return rows


def _num_match(actual: float | int | None, expected: float | None) -> bool:
    if actual is None and expected is None:
        return True
    if actual is None or expected is None:
        return False
    return abs(float(actual) - float(expected)) <= 0.01


def _text_match(actual: str | None, expected: str | None) -> bool:
    if actual is None and expected is None:
        return True
    if actual is None or expected is None:
        return False
    return actual.strip().lower() == expected.strip().lower()


def score_utterance(
    label: EvalLabelRow,
    draft: EntryDraft | None,
    *,
    stt_ok: bool,
    latency_ms: int,
) -> UtteranceOutcome:
    """Compare an extracted EntryDraft against a ground-truth EvalLabelRow."""
    if draft is None:
        return UtteranceOutcome(
            utterance_id=label.utterance_id,
            language=label.language,
            noise_condition=label.noise_condition,
            stt_ok=stt_ok,
            amount_match=False,
            agreed_match=False,
            paid_match=False,
            due_match=False,
            hours_match=False,
            contractor_match=False,
            site_match=False,
            latency_ms=latency_ms,
        )

    agreed_ok = _num_match(draft.agreed_amount_inr, label.expected_agreed_inr)
    paid_ok = _num_match(draft.paid_amount_inr, label.expected_paid_inr)
    due_ok = _num_match(draft.due_amount_inr, label.expected_due_inr)
    return UtteranceOutcome(
        utterance_id=label.utterance_id,
        language=label.language,
        noise_condition=label.noise_condition,
        stt_ok=stt_ok,
        amount_match=agreed_ok and paid_ok and due_ok,
        agreed_match=agreed_ok,
        paid_match=paid_ok,
        due_match=due_ok,
        hours_match=_num_match(draft.hours, label.expected_hours),
        contractor_match=_text_match(draft.counterparty_name, label.expected_counterparty_name),
        site_match=_text_match(draft.site_name, label.expected_site_name),
        latency_ms=latency_ms,
    )


def _aggregate_bucket(items: list[UtteranceOutcome]) -> dict[str, Any]:
    n = len(items)
    if n == 0:
        return {
            "count": 0,
            "amount_acc": 0.0,
            "agreed_acc": 0.0,
            "paid_acc": 0.0,
            "due_acc": 0.0,
            "hours_acc": 0.0,
            "contractor_acc": 0.0,
            "site_acc": 0.0,
            "mean_latency_ms": 0,
        }

    def pct(pred: Callable[[UtteranceOutcome], bool]) -> float:
        return round(100.0 * sum(1 for x in items if pred(x)) / n, 1)

    return {
        "count": n,
        "amount_acc": pct(lambda x: x.amount_match),
        "agreed_acc": pct(lambda x: x.agreed_match),
        "paid_acc": pct(lambda x: x.paid_match),
        "due_acc": pct(lambda x: x.due_match),
        "hours_acc": pct(lambda x: x.hours_match),
        "contractor_acc": pct(lambda x: x.contractor_match),
        "site_acc": pct(lambda x: x.site_match),
        "mean_latency_ms": int(round(sum(x.latency_ms for x in items) / n)),
    }


def aggregate_outcomes(outcomes: list[UtteranceOutcome]) -> dict[str, Any]:
    """Compute overall, per-language, and per-noise-condition accuracy metrics."""
    by_lang: dict[str, list[UtteranceOutcome]] = defaultdict(list)
    by_noise: dict[str, list[UtteranceOutcome]] = defaultdict(list)
    for item in outcomes:
        by_lang[item.language].append(item)
        by_noise[item.noise_condition].append(item)

    return {
        "overall": _aggregate_bucket(outcomes),
        "by_language": {k: _aggregate_bucket(v) for k, v in sorted(by_lang.items())},
        "by_noise": {k: _aggregate_bucket(v) for k, v in sorted(by_noise.items())},
        "outcomes": [asdict(o) for o in outcomes],
    }


def format_eval_markdown(summary: dict[str, Any]) -> str:
    """Format aggregated evaluation metrics as Markdown tables (never logs transcripts/paths)."""
    lines = [
        "| Slice | N | Amount % | Agreed % | Paid % | Due % | Hours % | Contractor % | Site % | Mean Latency (ms) |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]

    def _row(label: str, m: dict[str, Any]) -> str:
        return (
            f"| {label} | {m['count']} | {m['amount_acc']} | {m['agreed_acc']} | "
            f"{m['paid_acc']} | {m['due_acc']} | {m['hours_acc']} | "
            f"{m['contractor_acc']} | {m['site_acc']} | {m['mean_latency_ms']} |"
        )

    lines.append(_row("overall", summary["overall"]))
    for lang, metrics in summary["by_language"].items():
        lines.append(_row(f"lang:{lang}", metrics))
    for noise, metrics in summary["by_noise"].items():
        lines.append(_row(f"noise:{noise}", metrics))
    return "\n".join(lines)


async def stt_via_proxy_client(
    audio_path: Path,
    lang: str,
    *,
    settings: VoiceSettings,
    keyterms: list[str] | None = None,
) -> str:
    """Stream WAV/audio through GnaniSttClient (the exact code path used by /ws/stt)."""
    pcm16 = load_audio_file_as_pcm16_16k(str(audio_path))
    client = GnaniSttClient(settings=settings)

    async def _chunks() -> Any:
        for idx in range(0, len(pcm16), FRAME_BYTES):
            yield pcm16[idx : idx + FRAME_BYTES]

    parts: list[str] = []
    async for evt in client.transcribe_pcm_stream(
        _chunks(), lang, "narration", keyterms=keyterms
    ):
        if evt.text:
            parts.append(evt.text)
    return " ".join(parts).strip()


SttRunner = Callable[[EvalLabelRow, Path], Awaitable[str]]


async def run_evaluation(
    labels: list[EvalLabelRow],
    audio_dir: Path,
    *,
    settings: VoiceSettings | None = None,
    extractor: EntryExtractor | None = None,
    stt_runner: SttRunner | None = None,
    use_expected_transcript: bool = False,
    ref_date: date | None = None,
    pass_keyterms: bool = False,
) -> dict[str, Any]:
    """Run STT (or label transcripts) + EntryExtractor and return aggregated metrics."""
    cfg = settings or load_voice_settings()
    ext = extractor or EntryExtractor(settings=cfg)
    today_ref = ref_date or date.today()
    outcomes: list[UtteranceOutcome] = []

    for row in labels:
        t0 = time.monotonic()
        audio_path = audio_dir / row.audio_file
        keyterms = []
        if pass_keyterms:
            if row.expected_site_name:
                keyterms.append(row.expected_site_name)
            if row.expected_counterparty_name:
                keyterms.append(row.expected_counterparty_name)

        stt_ok = True
        try:
            if use_expected_transcript:
                transcript = row.expected_transcript
            elif stt_runner is not None:
                transcript = await stt_runner(row, audio_path)
            else:
                transcript = await stt_via_proxy_client(
                    audio_path,
                    row.language,
                    settings=cfg,
                    keyterms=keyterms or None,
                )
        except Exception:
            stt_ok = False
            transcript = ""

        draft: EntryDraft | None = None
        if stt_ok and transcript:
            ctx = ExtractContext(
                work_date_ref=today_ref,
                known_sites=[row.expected_site_name] if pass_keyterms and row.expected_site_name else [],
                known_counterparties=(
                    [row.expected_counterparty_name]
                    if pass_keyterms and row.expected_counterparty_name
                    else []
                ),
            )
            draft = await ext.extract(transcript, row.language, ctx)

        latency_ms = int((time.monotonic() - t0) * 1000)
        outcomes.append(
            score_utterance(row, draft, stt_ok=stt_ok, latency_ms=latency_ms)
        )

    return aggregate_outcomes(outcomes)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run Saakshi STT + EntryExtractor field-level evaluation."
    )
    parser.add_argument("--audio-dir", required=True, type=Path)
    parser.add_argument("--labels", required=True, type=Path)
    parser.add_argument("--json-out", default=None, type=Path)
    parser.add_argument("--md-out", default=None, type=Path)
    parser.add_argument(
        "--offline-transcripts",
        action="store_true",
        help="Evaluate extractor only using expected_transcript column (no Gnani calls).",
    )
    parser.add_argument("--pass-keyterms", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    labels = load_labels_csv(args.labels)
    summary = asyncio.run(
        run_evaluation(
            labels,
            args.audio_dir,
            use_expected_transcript=args.offline_transcripts,
            pass_keyterms=args.pass_keyterms,
        )
    )
    md = format_eval_markdown(summary)
    print(md)
    if args.json_out:
        args.json_out.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    if args.md_out:
        args.md_out.write_text(md + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

