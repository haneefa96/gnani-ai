"""
Saakshi Backend - Worker-Held Voice Wage Ledger

Developer B: Product and Data
"""

import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import Settings
from backend.app.routers import auth, entries, contractor, evidence
from backend.app.db import engine, Base

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    logger.info("Starting Saakshi application...")
    
    # Create database tables
    logger.info("Creating database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
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
