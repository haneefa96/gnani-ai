"""
Evidence pack router.
"""

from __future__ import annotations

import os
import shutil
import zipfile
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.config import Settings
from backend.app.models import EvidencePack, Entry
from backend.app.db import get_async_session
from backend.app.services.storage import StorageService
from backend.app.services.pdf import EvidencePDFService

settings = Settings()
router = APIRouter()


class EvidencePackRequest(BaseModel):
    worker_id: int
    period_from: str  # YYYY-MM-DD
    period_to: str  # YYYY-MM-DD


class EvidencePackResponse(BaseModel):
    pdf_uri: str
    zip_uri: str
    chain_head_hash: str


@router.post("/evidence", response_model=EvidencePackResponse)
async def build_evidence_pack(
    request: EvidencePackRequest,
    db: AsyncSession = Depends(get_async_session)
) -> EvidencePackResponse:
    """Build evidence pack."""
    # Get entries for the worker within the period
    result = await db.execute(
        select(Entry).where(
            Entry.worker_id == request.worker_id,
            Entry.work_date >= request.period_from,
            Entry.work_date <= request.period_to,
        ).order_by(Entry.created_at)
    )
    entries = result.scalars().all()
    
    if not entries:
        raise HTTPException(status_code=404, detail="No entries found for the specified period")
    
    # Generate PDF
    pdf_service = EvidencePDFService()
    pdf_path = f"./data/audio/evidence_{request.worker_id}_{datetime.utcnow().strftime('%Y%m%d')}.pdf"
    os.makedirs(os.path.dirname(pdf_path), exist_ok=True)
    
    # Get worker alias for the PDF
    from backend.app.models import Worker
    worker_result = await db.execute(select(Worker).where(Worker.id == request.worker_id))
    worker = worker_result.scalar_one_or_none()
    
    # Convert entries to dict for PDF
    entry_data = [
        {
            "id": e.id,
            "work_date": e.work_date,
            "site_name": e.site_name,
            "counterparty_name": e.counterparty_name,
            "hours": float(e.hours) if e.hours else None,
            "days": float(e.days) if e.days else None,
            "agreed_inr": float(e.agreed_inr),
            "paid_inr": float(e.paid_inr),
            "due_inr": float(e.due_inr),
            "status": e.status,
        }
        for e in entries
    ]
    
    pdf_service.generate_evidence_pdf(
        worker_alias=worker.alias if worker else "Unknown",
        entries=entry_data,
        output_path=pdf_path,
    )
    
    # Create ZIP with audio files
    zip_path = f"./data/audio/evidence_{request.worker_id}_{datetime.utcnow().strftime('%Y%m%d')}.zip"
    with zipfile.ZipFile(zip_path, 'w') as zf:
        # Add manifest
        manifest = "Evidence Pack Manifest\n"
        manifest += f"Generated: {datetime.utcnow().isoformat()}\n"
        manifest += f"Worker ID: {request.worker_id}\n"
        manifest += f"Period: {request.period_from} to {request.period_to}\n\n"
        manifest += "Entries:\n"
        for e in entries:
            manifest += f"  - Entry ID {e.id}: {e.work_date}, {e.site_name}, Status: {e.status}\n"
        
        zf.writestr("MANIFEST.txt", manifest)
        
        # Add PDF
        zf.write(pdf_path, os.path.basename(pdf_path))
        
        # Add audio files if they exist
        for e in entries:
            if e.audio_uri and os.path.exists(e.audio_uri):
                zf.write(e.audio_uri, os.path.basename(e.audio_uri))
    
    # Get chain head hash
    from backend.app.services.hashchain import HashChainService
    hashchain = HashChainService()
    chain_head_hash = hashchain.get_chain_head(entries)
    
    # Store evidence pack record
    evidence_pack = EvidencePack(
        worker_id=request.worker_id,
        period_from=request.period_from,
        period_to=request.period_to,
        pdf_uri=pdf_path,
        zip_uri=zip_path,
        chain_head_hash=chain_head_hash or "",
        created_at=datetime.utcnow(),
    )
    db.add(evidence_pack)
    await db.commit()
    
    return EvidencePackResponse(
        pdf_uri=pdf_path,
        zip_uri=zip_path,
        chain_head_hash=chain_head_hash or "",
    )


@router.get("/verify", response_model=dict)
async def verify_chain(
    db: AsyncSession = Depends(get_async_session)
) -> dict:
    """Verify hash chain integrity."""
    # Get all entries
    result = await db.execute(select(Entry).order_by(Entry.created_at))
    entries = result.scalars().all()
    
    if not entries:
        return {"valid": True, "mismatch_reason": None, "message": "No entries to verify"}
    
    # Verify chain
    from backend.app.services.hashchain import HashChainService
    hashchain = HashChainService()
    is_valid, mismatch_reason = hashchain.verify_chain(entries)
    
    return {
        "valid": is_valid,
        "mismatch_reason": mismatch_reason,
    }

