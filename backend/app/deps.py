"""
Dependency injection helpers.
"""

from __future__ import annotations

from typing import AsyncGenerator, Annotated
from fastapi import Depends, HTTPException, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

from backend.app.config import Settings
from backend.app.db import SyncSessionLocal, sync_engine, AsyncSessionLocal
from sqlalchemy.ext.asyncio import AsyncSession
from contracts.voice_interface import VoiceService
from backend.app.services.hashchain import HashChainService

settings = Settings()
security = HTTPBearer()


async def get_sync_session():
    """Get sync database session (for migrations)."""
    db = SyncSessionLocal()
    try:
        yield db
    finally:
        db.close()


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """Get async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def get_voice_service() -> VoiceService:
    """Get voice service implementation."""
    if settings.is_fake_voice:
        from contracts.fake_voice import FakeVoice
        return FakeVoice()
    else:
        from backend.voice.service import GnaniVoice
        return GnaniVoice()


async def get_hashchain_service() -> HashChainService:
    """Get hash chain service."""
    return HashChainService()


async def get_current_worker(
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
DBSession = Annotated[AsyncSession, Depends(get_async_session)]
SyncDBSession = Annotated[Session, Depends(get_sync_session)]
VoiceServiceDep = Annotated[VoiceService, Depends(get_voice_service)]
HashChainServiceDep = Annotated[HashChainService, Depends(get_hashchain_service)]
CurrentWorker = Annotated[int, Depends(get_current_worker)]

# Import Session for sync operations
from sqlalchemy.orm import Session
