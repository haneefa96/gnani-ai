"""
Database configuration and session management.
"""

from __future__ import annotations

from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine

from backend.app.config import Settings

settings = Settings()

# Synchronous engine for Alembic migrations
sync_engine = create_engine(settings.DATABASE_URL.replace("+asyncpg", ""), future=True)
SyncSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sync_engine)

# Asynchronous engine for FastAPI
if "+asyncpg" in settings.DATABASE_URL:
    # PostgreSQL
    async_engine = create_async_engine(
        settings.DATABASE_URL,
        echo=settings.DEBUG,
        future=True,
        pool_pre_ping=True
    )
else:
    # SQLite
    async_engine = create_async_engine(
        settings.DATABASE_URL,
        echo=settings.DEBUG,
        future=True,
        connect_args={"check_same_thread": False}
    )

AsyncSessionLocal = async_sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=async_engine,
    class_=AsyncSession
)


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """Get async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


def get_sync_session():
    """Get sync database session (for migrations)."""
    db = SyncSessionLocal()
    try:
        yield db
    finally:
        db.close()
