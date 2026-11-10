"""
Hash chain service for tamper-evident ledger.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import List, Optional, Dict, Any

try:
    from app.models import Entry
except ImportError:
    from models import Entry


class HashChainService:
    """Service for computing and verifying hash chains."""
    
    def __init__(self):
        self.GENESIS_HASH = "GENESIS"
    
    def compute_entry_hash(
        self,
        entry: Dict[str, Any],
        prev_hash: str
    ) -> str:
        """
        Compute the SHA-256 hash for an entry.
        
        Hash = SHA256(canonical_json({
            prev_hash, worker_id, work_date, site_name, counterparty,
            hours, days, agreed_inr, paid_inr, transcript_sha256,
            audio_sha256, created_at
        }))
        """
        # Build canonical representation
        canonical = {
            "prev_hash": prev_hash,
            "worker_id": entry.get("worker_id"),
            "work_date": entry.get("work_date"),
            "site_name": entry.get("site_name"),
            "counterparty": entry.get("counterparty_name"),
            "hours": float(entry.get("hours")) if entry.get("hours") else None,
            "days": float(entry.get("days")) if entry.get("days") else None,
            "agreed_inr": float(entry.get("agreed_inr")) if entry.get("agreed_inr") else None,
            "paid_inr": float(entry.get("paid_inr")) if entry.get("paid_inr") else None,
            "transcript_sha256": entry.get("transcript_sha256"),
            "audio_sha256": entry.get("audio_sha256"),
            "created_at": entry.get("created_at", datetime.utcnow().isoformat())
        }
        
        # Convert to canonical JSON string
        canonical_str = json.dumps(canonical, sort_keys=True, separators=(',', ':'))
        
        # Compute SHA-256
        return hashlib.sha256(canonical_str.encode()).hexdigest()
    
    def compute_genesis_hash(self, entry: Dict[str, Any]) -> str:
        """Compute hash for the first entry (prev_hash = GENESIS)."""
        return self.compute_entry_hash(entry, self.GENESIS_HASH)
    
    def verify_chain(self, entries: List[Entry]) -> tuple[bool, Optional[str]]:
        """
        Verify the integrity of the hash chain.
        
        Returns:
            (is_valid, mismatch_reason)
        """
        if not entries:
            return True, None
        
        # Sort deterministically by (created_at, id) so same-millisecond inserts keep order.
        sorted_entries = sorted(
            entries,
            key=lambda e: (e.created_at or datetime.min, e.id or 0),
        )
        
        prev_hash = self.GENESIS_HASH
        for i, entry in enumerate(sorted_entries):
            # Build entry dict from model
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
            
            expected_hash = self.compute_entry_hash(entry_dict, prev_hash)
            
            if entry.entry_hash != expected_hash:
                return False, f"Entry {entry.id} hash mismatch at index {i}"
            
            prev_hash = entry.entry_hash
        
        return True, None
    
    def get_chain_head(self, entries: List[Entry]) -> Optional[str]:
        """Get the head hash of the chain."""
        if not entries:
            return None
        return entries[-1].entry_hash
    
    def verify_single_entry(
        self,
        entry: Entry,
        prev_hash: Optional[str] = None
    ) -> tuple[bool, Optional[str]]:
        """
        Verify a single entry's hash.
        
        If prev_hash is None, uses the previous entry's hash from DB.
        """
        if prev_hash is None:
            return False, "Previous hash required for verification"
        
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
        
        expected_hash = self.compute_entry_hash(entry_dict, prev_hash)
        
        if entry.entry_hash != expected_hash:
            return False, f"Entry {entry.id} hash mismatch"
        
        return True, None
