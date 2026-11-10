"""
Contractor confirmation router.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.config import Settings
from backend.app.models import Entry, ShareToken, Confirmation, EntryStatus
from backend.app.db import get_async_session

settings = Settings()
router = APIRouter()


class ContractorResponse(BaseModel):
    result: str  # "yes", "no", or "dispute"
    reason_text: Optional[str] = None
    reason_audio_uri: Optional[str] = None


@router.get("/{token}", response_model=dict)
async def get_contractor_entry(token: str, db: AsyncSession = Depends(get_async_session)) -> dict:
    """Get contractor entry data."""
    # Hash the token to find it
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    
    result = await db.execute(
        select(ShareToken)
        .where(
            ShareToken.token_hash == token_hash,
            ShareToken.used_at.is_(None),
            ShareToken.expires_at > datetime.utcnow()
        )
        .options(selectinload(ShareToken.entry))
    )
    share_token = result.scalar_one_or_none()
    
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
    db: AsyncSession = Depends(get_async_session)
) -> dict:
    """Contractor response to entry."""
    # Hash the token to find it
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    
    result = await db.execute(
        select(ShareToken)
        .where(
            ShareToken.token_hash == token_hash,
            ShareToken.used_at.is_(None),
            ShareToken.expires_at > datetime.utcnow()
        )
        .options(selectinload(ShareToken.entry))
    )
    share_token = result.scalar_one_or_none()
    
    if not share_token:
        raise HTTPException(status_code=404, detail="Invalid or expired token")
    
    entry = share_token.entry
    
    # Update share token as used
    share_token.used_at = datetime.utcnow()
    
    # Record confirmation
    confirmation = Confirmation(
        entry_id=entry.id,
        party="contractor",
        channel="web",
        audio_uri=response_data.reason_audio_uri,
        transcript=None,  # Would be transcribed if audio
        result=response_data.result,
        reason_text=response_data.reason_text,
        at=datetime.utcnow(),
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
    
    await db.commit()
    
    return {"status": entry.status}
