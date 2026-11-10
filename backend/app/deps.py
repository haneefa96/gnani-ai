"""
Dependency injection helpers.
"""

from __future__ import annotations

from typing import Generator, Annotated, Optional
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import SessionLocal
from app.services.hashchain import HashChainService
from contracts.voice_interface import VoiceService

settings = Settings()
security = HTTPBearer(auto_error=False)


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
        from backend.voice.fixtures.fake_voice import FakeVoice
        return FakeVoice()  # type: ignore[return-value]
    else:
        from backend.voice.service import GnaniVoice
        return GnaniVoice()  # type: ignore[return-value]


def get_hashchain_service() -> HashChainService:
    """Get hash chain service."""
    return HashChainService()


def get_current_worker(
    auth: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security)]
) -> int:
    """Get current worker ID from JWT token."""
    if auth is None:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        token = auth.credentials
        payload = jwt.decode(
            token,
            settings.SECRET_KEY.get_secret_value(),
            algorithms=["HS256"],
        )
        worker_id = payload.get("worker_id")
        if not isinstance(worker_id, int) or isinstance(worker_id, bool) or worker_id < 1:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        return worker_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Token expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# Type aliases for cleaner imports
DBSession = Annotated[Session, Depends(get_db)]
VoiceServiceDep = Annotated[VoiceService, Depends(get_voice_service)]
HashChainServiceDep = Annotated[HashChainService, Depends(get_hashchain_service)]
CurrentWorker = Annotated[int, Depends(get_current_worker)]
