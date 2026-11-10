"""
Audio and file storage service.
"""

from __future__ import annotations

import os
import hashlib
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional
import uuid

from backend.app.config import Settings

settings = Settings()


class StorageService:
    """Service for managing audio and file storage."""
    
    def __init__(self):
        self.base_path = Path(settings.AUDIO_STORAGE_PATH)
        self.base_path.mkdir(parents=True, exist_ok=True)
    
    def generate_audio_path(self, extension: str = "wav") -> str:
        """Generate a unique audio file path."""
        filename = f"{uuid.uuid4()}.{extension}"
        return str(self.base_path / filename)
    
    def generate_file_hash(self, file_path: str) -> Optional[str]:
        """Generate SHA256 hash of a file."""
        try:
            sha256_hash = hashlib.sha256()
            with open(file_path, "rb") as f:
                for byte_block in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(byte_block)
            return sha256_hash.hexdigest()
        except Exception:
            return None
    
    def save_audio(self, audio_data: bytes, extension: str = "wav") -> str:
        """Save audio data to storage."""
        path = self.generate_audio_path(extension)
        with open(path, "wb") as f:
            f.write(audio_data)
        return path
    
    def save_file(self, data: bytes, filename: str) -> str:
        """Save arbitrary file to storage."""
        path = str(self.base_path / filename)
        with open(path, "wb") as f:
            f.write(data)
        return path
    
    def delete_file(self, path: str) -> bool:
        """Delete a file from storage."""
        try:
            file_path = Path(path)
            if file_path.exists():
                file_path.unlink()
                return True
            return False
        except Exception:
            return False
    
    def file_exists(self, path: str) -> bool:
        """Check if file exists in storage."""
        return Path(path).exists()
    
    def get_file_size(self, path: str) -> Optional[int]:
        """Get file size in bytes."""
        try:
            return Path(path).stat().st_size
        except Exception:
            return None
