"""
Saakshi Backend - Worker-Held Voice Wage Ledger

Developer B: Product and Data
"""

import os
import logging
from contextlib import contextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import sys
from pathlib import Path

# Add backend parent directory to path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.config import Settings
from app.routers import auth, entries, contractor, evidence
from app.db import engine, SessionLocal, Base

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

settings = Settings()


def create_application() -> FastAPI:
    """Create and configure the FastAPI application."""
    
    application = FastAPI(
        title="Saakshi API",
        description="Worker-Held Voice Wage Ledger",
        version="1.0.0",
        lifespan=lifespan
    )
    
    # CORS middleware
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Include routers
    application.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    application.include_router(entries.router, prefix="/api/entries", tags=["entries"])
    application.include_router(contractor.router, prefix="/api/contractor", tags=["contractor"])
    application.include_router(evidence.router, prefix="/api", tags=["evidence"])
    
    return application


@contextmanager
def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    logger.info("Starting Saakshi application...")
    
    # Create database tables
    logger.info("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    
    logger.info("Database tables created successfully.")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Saakshi application...")


app = create_application()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
