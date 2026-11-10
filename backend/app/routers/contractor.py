"""
Contractor confirmation router.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import SessionLocal
from app.models import Confirmation, Entry, ShareToken

settings = Settings()
router = APIRouter()


def get_db():
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class ContractorResponse(BaseModel):
    result: str  # "yes", "no", or "dispute"
    reason_text: str | None = None
    reason_audio_uri: str | None = None


@router.get("/{token}", response_model=dict)
async def get_contractor_entry(
    token: str,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    """Get contractor entry data."""
    # Hash the token to find it
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    share_token = (
        db.query(ShareToken)
        .filter(
            ShareToken.token_hash == token_hash,
            ShareToken.used_at.is_(None),
            ShareToken.expires_at > datetime.now(UTC).replace(tzinfo=None),
        )
        .first()
    )

    if not share_token:
        raise HTTPException(status_code=404, detail="Invalid or expired token")

    entry = share_token.entry

    return {
        "entry_text": entry.transcript or "",
        "language": entry.language or "hi-IN",
        "entry_id": entry.id,
    }


@router.post("/{token}/respond", response_model=dict)
async def contractor_respond(
    token: str,
    response_data: ContractorResponse,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    """Contractor response to entry."""
    # Hash the token to find it
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    now = datetime.now(UTC).replace(tzinfo=None)
    share_token = (
        db.query(ShareToken)
        .filter(
            ShareToken.token_hash == token_hash,
            ShareToken.used_at.is_(None),
            ShareToken.expires_at > now,
        )
        .first()
    )

    if not share_token:
        raise HTTPException(status_code=404, detail="Invalid or expired token")

    entry = share_token.entry

    # Update share token as used
    share_token.used_at = now

    # Record confirmation
    confirmation = Confirmation(
        entry_id=entry.id,
        party="contractor",
        channel="web",
        audio_uri=response_data.reason_audio_uri,
        transcript=None,  # Would be transcribed if audio
        result=response_data.result,
        reason_text=response_data.reason_text,
        at=now,
    )
    db.add(confirmation)

    # Update entry status based on contractor response
    if response_data.result == "yes":
        entry.status = Entry.STATUS_CONTRACTOR_CONFIRMED
    elif response_data.result == "dispute":
        entry.status = Entry.STATUS_CONTRACTOR_DISPUTED
    else:
        # "no" - still counts as shared but not confirmed
        entry.status = Entry.STATUS_UNCONFIRMED

    db.commit()

    return {"status": entry.status}
