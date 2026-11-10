"""
Authentication router.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from passlib.hash import bcrypt
import jwt
import secrets
from sqlalchemy import select

from backend.app.config import Settings
from backend.app.models import Worker
from backend.app.db import AsyncSession, get_async_session

settings = Settings()
router = APIRouter()


# Pydantic models
class WorkerCreate(BaseModel):
    alias: str = Field(..., min_length=3, max_length=50)
    pin_hash: str = Field(..., min_length=6)
    language: str = "hi-IN"
    consent_audio_uri: Optional[str] = None
    consent_text_version: Optional[str] = None
    consent_at: Optional[datetime] = None


class WorkerLogin(BaseModel):
    alias: str = Field(..., min_length=3, max_length=50)
    pin: str = Field(..., min_length=4)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    worker_id: int


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")


async def verify_pin(alias: str, pin: str, db: AsyncSession) -> Optional[Worker]:
    """Verify worker PIN."""
    result = await db.execute(select(Worker).where(Worker.alias == alias))
    worker = result.scalar_one_or_none()
    if not worker:
        return None
    if not bcrypt.verify(pin, worker.pin_hash):
        return None
    return worker


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register_worker(
    worker_data: WorkerCreate,
    db: AsyncSession = Depends(get_async_session)
) -> TokenResponse:
    """Register a new worker."""
    # Check if alias already exists
    result = await db.execute(select(Worker).where(Worker.alias == worker_data.alias))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Alias already registered"
        )
    
    # Create worker with hashed PIN
    worker = Worker(
        alias=worker_data.alias,
        pin_hash=worker_data.pin_hash,
        language=worker_data.language,
        consent_audio_uri=worker_data.consent_audio_uri,
        consent_text_version=worker_data.consent_text_version,
        consent_at=worker_data.consent_at
    )
    db.add(worker)
    await db.commit()
    await db.refresh(worker)
    
    # Create access token
    access_token = create_access_token(
        data={"worker_id": worker.id},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        worker_id=worker.id
    )


@router.post("/login", response_model=TokenResponse)
async def login_worker(
    login_data: WorkerLogin,
    db: AsyncSession = Depends(get_async_session)
) -> TokenResponse:
    """Login a worker."""
    worker = await verify_pin(login_data.alias, login_data.pin, db)
    if not worker:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid alias or PIN",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(
        data={"worker_id": worker.id},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        worker_id=worker.id
    )


@router.post("/verify-pin")
async def verify_worker_pin(
    login_data: WorkerLogin,
    db: AsyncSession = Depends(get_async_session)
) -> dict:
    """Verify worker PIN (for PIN lock screen)."""
    worker = await verify_pin(login_data.alias, login_data.pin, db)
    if not worker:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid alias or PIN"
        )
    return {"valid": True, "worker_id": worker.id}
