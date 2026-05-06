"""
@file backend/app/services/doc_processing/storage.py
@description Storage Utilities.
@layer Core Logic
@dependencies hashlib
"""

import hashlib

def calculate_sha256(content: bytes) -> str:
    """
    Calculates the SHA-256 hash of raw file bytes.
    Used for cryptographic deduplication of uploaded academic assets.
    """
    return hashlib.sha256(content).hexdigest()