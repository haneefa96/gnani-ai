"""
Entries router - CRUD for wage entries.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.config import Settings
from backend.app.models import Entry, Worker, Counterparty, EntryStatusLog, EntryStatus, ShareToken
from backend.app.db import get_async_session
from contracts.voice_interface import VoiceService
from backend.app.services.hashchain import HashChainService

settings = Settings()
router = APIRouter()


# Pydantic models
class EntryCreate(BaseModel):
    audio_ref: str
    transcript: str
    lang: str


class EntryCorrect(BaseModel):
    audio_ref: str
    transcript: str
    lang: str


class EntryResponse(BaseModel):
    id: int
    work_date: str
    site_name: Optional[str]
    counterparty_name: Optional[str]
    hours: Optional[float]
    days: Optional[float]
    agreed_inr: float
    paid_inr: float
    due_inr: float
    language: str
    transcript: Optional[str]
    status: str
    created_at: datetime


class EntryDraft(BaseModel):
    work_date: str
    site_name: Optional[str]
    counterparty_name: Optional[str]
    hours: Optional[float]
    days: Optional[float]
    agreed_amount_inr: Optional[int]
    paid_amount_inr: Optional[int]
    due_amount_inr: int
    field_confidence: dict
    needs_clarification: list
    clarification_question: Optional[str]
    language: str


@router.post("/draft", response_model=EntryResponse, status_code=status.HTTP_201_CREATED)
async def create_entry_draft(
    entry_data: EntryCreate,
    current_worker_id: CurrentWorker,
    voice_service: VoiceServiceDep,
    hashchain_service: HashChainServiceDep,
    db: DBSession,
) -> EntryResponse:
    """Create a new entry draft."""
    # Get the last entry to compute prev_hash
    result = await db.execute(
        select(Entry)
        .where(Entry.worker_id == current_worker_id)
        .order_by(Entry.created_at.desc())
        .limit(1)
    )
    last_entry = result.scalar_one_or_none()
    
    prev_hash = hashchain_service.GENESIS_HASH
    if last_entry:
        prev_hash = last_entry.entry_hash
    
    # Calculate due amount in code (never from model)
    agreed_amount = 0
    paid_amount = 0
    due_amount = agreed_amount - paid_amount
    
    entry = Entry(
        worker_id=current_worker_id,
        counterparty_id=None,
        work_date=datetime.utcnow().strftime("%Y-%m-%d"),
        site_name="",
        counterparty_name="",
        hours=0,
        days=0,
        agreed_inr=agreed_amount,
        paid_inr=paid_amount,
        due_inr=due_amount,
        language=entry_data.lang,
        transcript=entry_data.transcript,
        transcript_sha256="",
        audio_uri=entry_data.audio_ref,
        audio_sha256="",
        prev_hash=prev_hash,
        entry_hash="",  # Will be computed after worker confirmation
        status=Entry.STATUS_DRAFT,
        corrects_entry_id=None,
    )
    
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    
    return EntryResponse(
        id=entry.id,
        work_date=entry.work_date,
        site_name=entry.site_name,
        counterparty_name=entry.counterparty_name,
        hours=float(entry.hours) if entry.hours else None,
        days=float(entry.days) if entry.days else None,
        agreed_inr=float(entry.agreed_inr),
        paid_inr=float(entry.paid_inr),
        due_inr=float(entry.due_inr),
        language=entry.language,
        transcript=entry.transcript,
        status=entry.status,
        created_at=entry.created_at,
    )


@router.get("/", response_model=List[EntryResponse])
async def get_entries(
    current_worker_id: CurrentWorker,
    db: DBSession,
) -> List[EntryResponse]:
    """Get all entries for the current worker."""
    result = await db.execute(
        select(Entry)
        .where(Entry.worker_id == current_worker_id)
        .order_by(Entry.created_at.desc())
    )
    entries = result.scalars().all()
    
    return [
        EntryResponse(
            id=e.id,
            work_date=e.work_date,
            site_name=e.site_name,
            counterparty_name=e.counterparty_name,
            hours=float(e.hours) if e.hours else None,
            days=float(e.days) if e.days else None,
            agreed_inr=float(e.agreed_inr),
            paid_inr=float(e.paid_inr),
            due_inr=float(e.due_inr),
            language=e.language,
            transcript=e.transcript,
            status=e.status,
            created_at=e.created_at,
        )
        for e in entries
    ]


@router.get("/{entry_id}", response_model=EntryResponse)
async def get_entry(
    entry_id: int,
    current_worker_id: CurrentWorker,
    db: DBSession,
) -> EntryResponse:
    """Get a single entry by ID."""
    result = await db.execute(
        select(Entry).where(
            Entry.id == entry_id,
            Entry.worker_id == current_worker_id
        )
    )
    entry = result.scalar_one_or_none()
    
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    return EntryResponse(
        id=entry.id,
        work_date=entry.work_date,
        site_name=entry.site_name,
        counterparty_name=entry.counterparty_name,
        hours=float(entry.hours) if entry.hours else None,
        days=float(entry.days) if entry.days else None,
        agreed_inr=float(entry.agreed_inr),
        paid_inr=float(entry.paid_inr),
        due_inr=float(entry.due_inr),
        language=entry.language,
        transcript=entry.transcript,
        status=entry.status,
        created_at=entry.created_at,
    )


@router.post("/{entry_id}/confirm", response_model=EntryResponse)
async def confirm_entry(
    entry_id: int,
    current_worker_id: CurrentWorker,
    hashchain_service: HashChainServiceDep,
    db: DBSession,
) -> EntryResponse:
    """Confirm entry with worker's spoken yes."""
    # Get entry
    result = await db.execute(
        select(Entry).where(
            Entry.id == entry_id,
            Entry.worker_id == current_worker_id
        )
    )
    entry = result.scalar_one_or_none()
    
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    if entry.status != Entry.STATUS_DRAFT:
        raise HTTPException(status_code=400, detail="Entry already confirmed")
    
    # Verify state transition
    if Entry.STATUS_WORKER_CONFIRMED not in Entry.VALID_TRANSITIONS.get(entry.status, set()):
        raise HTTPException(status_code=400, detail="Invalid state transition")
    
    # Compute entry hash
    entry_dict = {
        "worker_id": entry.worker_id,
        "work_date": entry.work_date,
        "site_name": entry.site_name,
        "counterparty_name": entry.counterparty_name,
        "hours": entry.hours,
        "days": entry.days,
        "agreed_inr": entry.agreed_inr,
        "paid_inr": entry.paid_inr,
        "transcript_sha256": entry.transcript_sha256,
        "audio_sha256": entry.audio_sha256,
        "created_at": entry.created_at.isoformat() if entry.created_at else datetime.utcnow().isoformat()
    }
    
    entry.entry_hash = hashchain_service.compute_entry_hash(entry_dict, entry.prev_hash)
    
    # Log status change
    status_log = EntryStatusLog(
        entry_id=entry.id,
        from_status=entry.status,
        to_status=Entry.STATUS_WORKER_CONFIRMED,
        actor="worker",
    )
    db.add(status_log)
    
    # Update entry status
    entry.status = Entry.STATUS_WORKER_CONFIRMED
    
    await db.commit()
    await db.refresh(entry)
    
    return EntryResponse(
        id=entry.id,
        work_date=entry.work_date,
        site_name=entry.site_name,
        counterparty_name=entry.counterparty_name,
        hours=float(entry.hours) if entry.hours else None,
        days=float(entry.days) if entry.days else None,
        agreed_inr=float(entry.agreed_inr),
        paid_inr=float(entry.paid_inr),
        due_inr=float(entry.due_inr),
        language=entry.language,
        transcript=entry.transcript,
        status=entry.status,
        created_at=entry.created_at,
    )


@router.post("/{entry_id}/correct", response_model=EntryResponse)
async def create_correction(
    entry_id: int,
    correction_data: EntryCorrect,
    current_worker_id: CurrentWorker,
    hashchain_service: HashChainServiceDep,
    db: DBSession,
) -> EntryResponse:
    """Create a correcting entry."""
    # Get original entry
    result = await db.execute(
        select(Entry).where(
            Entry.id == entry_id,
            Entry.worker_id == current_worker_id
        )
    )
    original_entry = result.scalar_one_or_none()
    
    if not original_entry:
        raise HTTPException(status_code=404, detail="Original entry not found")
    
    # Create new entry that corrects the original
    new_entry = Entry(
        worker_id=current_worker_id,
        counterparty_id=original_entry.counterparty_id,
        work_date=original_entry.work_date,
        site_name=original_entry.site_name,
        counterparty_name=original_entry.counterparty_name,
        hours=original_entry.hours,
        days=original_entry.days,
        agreed_inr=original_entry.agreed_inr,
        paid_inr=original_entry.paid_inr,
        due_inr=original_entry.due_inr,
        language=correction_data.lang,
        transcript=correction_data.transcript,
        transcript_sha256="",
        audio_uri=correction_data.audio_ref,
        audio_sha256="",
        prev_hash=original_entry.entry_hash,
        entry_hash="",  # Will be computed after worker confirmation
        status=Entry.STATUS_DRAFT,
        corrects_entry_id=entry_id,
    )
    
    db.add(new_entry)
    await db.commit()
    await db.refresh(new_entry)
    
    return EntryResponse(
        id=new_entry.id,
        work_date=new_entry.work_date,
        site_name=new_entry.site_name,
        counterparty_name=new_entry.counterparty_name,
        hours=float(new_entry.hours) if new_entry.hours else None,
        days=float(new_entry.days) if new_entry.days else None,
        agreed_inr=float(new_entry.agreed_inr),
        paid_inr=float(new_entry.paid_inr),
        due_inr=float(new_entry.due_inr),
        language=new_entry.language,
        transcript=new_entry.transcript,
        status=new_entry.status,
        created_at=new_entry.created_at,
    )


@router.post("/{entry_id}/share", response_model=dict)
async def share_entry(
    entry_id: int,
    current_worker_id: CurrentWorker,
    db: DBSession,
) -> dict:
    """Create share token for contractor."""
    # Get entry
    result = await db.execute(
        select(Entry).where(
            Entry.id == entry_id,
            Entry.worker_id == current_worker_id
        )
    )
    entry = result.scalar_one_or_none()
    
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    if entry.status != Entry.STATUS_WORKER_CONFIRMED:
        raise HTTPException(status_code=400, detail="Entry must be confirmed before sharing")
    
    # Generate share token
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    
    expires_at = datetime.utcnow() + timedelta(days=settings.SHARE_TOKEN_EXPIRY_DAYS)
    
    share_token = ShareToken(
        entry_id=entry_id,
        token_hash=token_hash,
        expires_at=expires_at,
        used_at=None,
    )
    
    db.add(share_token)
    await db.commit()
    
    # Build share URL
    share_url = f"http://localhost:5173/c/{token}"
    
    return {"share_url": share_url}
