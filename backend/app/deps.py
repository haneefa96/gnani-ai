"""
Dependency injection helpers.
"""

from __future__ import annotations

from typing import Generator, Annotated
from fastapi import Depends, HTTPException, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from sqlalchemy.orm import Session

from backend.app.config import Settings
from backend.app.db import SessionLocal
from contracts.voice_interface import VoiceService
from backend.app.services.hashchain import HashChainService

settings = Settings()
security = HTTPBearer()


def get_db() -> Generator[Session, None, None]:
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_voice_service() -> VoiceService:
    """Get voice service implementation."""
    if settings.is_fake_voice:
        from contracts.fake_voice import FakeVoice
        return FakeVoice()
    else:
        from backend.voice.service import GnaniVoice
        return GnaniVoice()


def get_hashchain_service() -> HashChainService:
    """Get hash chain service."""
    return HashChainService()


def get_current_worker(
    auth: Annotated[HTTPAuthorizationCredentials, Depends(security)]
) -> int:
    """Get current worker ID from JWT token."""
    try:
        token = auth.credentials
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        worker_id = payload.get("worker_id")
        if worker_id is None:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        return int(worker_id)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# Type aliases for cleaner imports
DBSession = Annotated[Session, Depends(get_db)]
VoiceServiceDep = Annotated[VoiceService, Depends(get_voice_service)]
HashChainServiceDep = Annotated[HashChainService, Depends(get_hashchain_service)]
CurrentWorker = Annotated[int, Depends(get_current_worker)]
