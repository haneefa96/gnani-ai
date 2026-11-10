"""
Backend configuration using Pydantic settings.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )
    
    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = False
    
    # Database
    DATABASE_URL: str = "sqlite:///./saakshi.db"
    
    # Security
    SECRET_KEY: SecretStr
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Share tokens
    SHARE_TOKEN_EXPIRY_DAYS: int = 3
    SHARE_TOKEN_LENGTH: int = 32
    
    # Audio storage
    AUDIO_STORAGE_PATH: str = "./data/audio"
    
    # Voice implementation
    VOICE_IMPL: str = "fake"  # "fake" or "gnani"
    
    # Gnani API settings (for A)
    GNANI_STT_API_KEY: str = ""
    GNANI_TTS_API_KEY: str = ""
    GNANI_STT_WSS_URL: str = "wss://api.vachana.ai/stt/v3/stream"
    GNANI_TTS_WSS_URL: str = "wss://api.vachana.ai/api/v1/tts"
    
    # LLM settings (for A)
    LLM_PROVIDER: str = "ollama"
    LLM_MODEL: str = ""
    
    # CORS & deployed frontend URL
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]
    FRONTEND_URL: str = "http://localhost:5173"
    
    @property
    def is_fake_voice(self) -> bool:
        """Check if using FakeVoice implementation."""
        return self.VOICE_IMPL.lower() == "fake"

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, value: SecretStr) -> SecretStr:
        secret = value.get_secret_value()
        if (
            len(secret) < 32
            or secret != secret.strip()
            or len(set(secret)) < 16
        ):
            raise ValueError("SECRET_KEY must be a strong, non-placeholder value")
        return value
