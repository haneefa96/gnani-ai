"""
Database configuration and session management.
"""

from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

try:
    from app.config import Settings
    from app.models import Base
except ImportError:
    from config import Settings
    from models import Base

__all__ = [
    "Base",
    "SessionLocal",
    "engine",
    "get_db",
    "normalize_database_url",
    "settings",
]

settings = Settings()


def normalize_database_url(raw_url: str) -> str:
    """Normalize PostgreSQL/Neon connection strings for SQLAlchemy and installed drivers."""
    url = raw_url.strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    url = url.replace("postgresql+asyncpg://", "postgresql://", 1)
    if url.startswith("postgresql://"):
        try:
            import psycopg2  # noqa: F401
        except ImportError:
            try:
                import psycopg  # noqa: F401

                url = "postgresql+psycopg://" + url[len("postgresql://") :]
            except ImportError:
                pass
    return url


database_url = normalize_database_url(settings.DATABASE_URL)
is_sqlite = database_url.startswith("sqlite")
engine_kwargs: dict = {
    "echo": settings.DEBUG,
    "connect_args": {"check_same_thread": False} if is_sqlite else {},
}
if not is_sqlite:
    # Guard against serverless PostgreSQL (Neon) closing idle SSL connections.
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_recycle"] = 300

engine = create_engine(database_url, **engine_kwargs)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
