"""Single source of truth for wage due calculation (free of backend.app imports)."""

from __future__ import annotations

Number = int | float


def compute_due(agreed: Number | None, paid: Number | None) -> Number | None:
    """Return remaining due INR, or None if either value is None, negative, or paid > agreed."""
    if agreed is None or paid is None:
        return None
    if isinstance(agreed, bool) or isinstance(paid, bool):
        return None
    if agreed < 0 or paid < 0:
        return None
    if paid > agreed:
        return None

    diff = round(float(agreed) - float(paid), 2)
    if diff.is_integer():
        return int(diff)
    return diff

