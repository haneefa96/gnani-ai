"""Unit tests for P7 readback.py across hi, kn, bn, en."""

from __future__ import annotations

from datetime import date

import pytest

from backend.voice.models import EntryDraft
from backend.voice.readback import build_readback


@pytest.mark.parametrize(
    ("lang", "worker_marker", "contractor_marker"),
    [
        ("hi-IN", "क्या यह सही है?", "क्या आप इसकी पुष्टि करते हैं?"),
        ("kn-IN", "ಇದು ಸರಿಯೇ?", "ನೀವು ಇದನ್ನು ದೃಢೀಕರಿಸುತ್ತೀರಾ?"),
        ("bn-IN", "এটা কি ঠিক আছে?", "আপনি কি এটি নিশ্চিত করছেন?"),
        ("en-IN", "Is this correct?", "Do you confirm this entry?"),
    ],
)
def test_readback_worker_and_contractor_templates(
    lang: str, worker_marker: str, contractor_marker: str
) -> None:
    draft = EntryDraft(
        work_date=date(2026, 11, 9),
        site_name="Basavanagudi",
        counterparty_name="Suresh",
        hours=8,
        agreed_amount_inr=700,
        paid_amount_inr=300,
        due_amount_inr=400,
        language=lang,  # type: ignore[arg-type]
    )

    worker_txt = build_readback(draft, lang, audience="worker")
    contractor_txt = build_readback(draft, lang, audience="contractor")

    assert worker_txt.endswith(worker_marker)
    assert contractor_txt.endswith(contractor_marker)
    assert "Basavanagudi" in worker_txt
    assert "Suresh" in worker_txt
    assert "Suresh" not in contractor_txt
    # Numbers must be normalized to spoken words (no ASCII digits remaining).
    assert not any(ch.isdigit() for ch in worker_txt)
    assert not any(ch.isdigit() for ch in contractor_txt)

