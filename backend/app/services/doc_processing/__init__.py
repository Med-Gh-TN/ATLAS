"""
Document Processing Domain Public API.

[OMNI-ARCHITECT UPDATE]: Legacy MinIO storage and Celery OCR tasks 
have been completely eradicated.
"""

from .storage import calculate_sha256
# minio_client and ocr_tasks severed.

__all__ = [
    "calculate_sha256",
]