"""
@file backend/app/routers/files.py
@description Restores secure, authenticated physical file streaming from the Omni workspace.
@layer Core Logic
@dependencies app.db.session, app.dependencies, app.models
"""

from __future__ import annotations

import os
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.dependencies import get_current_user
from app.models.contribution import Contribution
from app.models.user import User, UserRole


router = APIRouter(tags=["Files"])

PREVIEWABLE_MIME_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

# The physical volume mount shared between API and ATLAS-OCR workers
WORKSPACE_DIR = os.getenv("OMNI_WORKSPACE_DIR", "/omni/workspace")


def _can_access_document(current_user: User, contribution: Contribution) -> bool:
    role_value = (
        current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    )
    if role_value in (
        UserRole.ADMIN.value,
        UserRole.SUPERADMIN.value,
        UserRole.TEACHER.value,
    ):
        return True
    if contribution.uploader_id == current_user.id:
        return True
    return contribution.status == "APPROVED"


def _get_content_type(path: str) -> str:
    """Determine content type based on file extension."""
    path_lower = path.lower()
    if path_lower.endswith(".pdf"):
        return "application/pdf"
    elif path_lower.endswith(".doc"):
        return "application/msword"
    elif path_lower.endswith(".docx"):
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif path_lower.endswith(".pptx"):
        return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    elif path_lower.endswith(".txt"):
        return "text/plain"
    elif path_lower.endswith(".png"):
        return "image/png"
    elif path_lower.endswith(".jpg") or path_lower.endswith(".jpeg"):
        return "image/jpeg"
    else:
        return "application/octet-stream"


@router.get("/files/proxy/{path:path}")
async def proxy_file(
    path: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """
    [OMNI-ARCHITECT PIPELINE]
    Securely streams physical files from the Omni workspace volume to the frontend viewer.
    """
    base_dir = Path(WORKSPACE_DIR).resolve()
    
    # Clean the incoming path
    clean_path = path.lstrip("/")
    
    # If the frontend passes the absolute docker path, strip the prefix to avoid duplication
    if clean_path.startswith("omni/workspace/"):
        clean_path = clean_path.replace("omni/workspace/", "", 1)
        
    target_path = (base_dir / clean_path).resolve()
    
    # Strict security check: Prevent directory traversal (e.g. ../../../etc/passwd)
    try:
        target_path.relative_to(base_dir)
    except ValueError:
        raise HTTPException(status_code=403, detail="Path traversal detected and blocked.")
        
    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(status_code=404, detail=f"Physical file not found in storage volume.")
        
    mime_type = _get_content_type(str(target_path))
    
    return FileResponse(
        path=str(target_path),
        media_type=mime_type,
        filename=target_path.name,
        content_disposition_type="inline"
    )


@router.get("/files/pdf-view-url-by-path")
async def get_pdf_view_url_by_path(
    path: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """
    [OMNI-ARCHITECT PIPELINE]
    Returns the Next.js proxy URL so the frontend can securely route 'Open' and 'Download' button clicks.
    """
    clean_path = path if path.startswith("/") else f"/{path}"
    return {"url": f"/api/files/proxy{clean_path}"}


@router.get("/files/pdf-view-url/{contribution_id}")
async def get_pdf_view_url(
    contribution_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """
    [OMNI-ARCHITECT PIPELINE]
    Deprecated in favor of pdf-view-url-by-path. 
    """
    raise HTTPException(
        status_code=501, 
        detail="Lookup by ID is deprecated. Use pdf-view-url-by-path."
    )