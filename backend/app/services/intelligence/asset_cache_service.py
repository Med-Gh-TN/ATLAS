"""
@file backend/app/services/intelligence/asset_cache_service.py
@description Service for retrieving and listing cached academic assets.
@layer State Persistence
@dependencies app.models.study_tools
"""

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Note: Assuming AcademicAssetCache is defined in study_tools or imported here based on db schema migrations
from app.models.study_tools import AcademicAssetType

# Import the actual cache model (adjust path if it lives in app.models.collaboration or similar)
try:
    from app.models.study_tools import AcademicAssetCache
except ImportError:
    # Fallback to absolute base model if not explicitly in study_tools
    from app.models.all_models import AcademicAssetCache


async def list_cached_assets(
    session: AsyncSession, 
    document_version_id: UUID
) -> list[dict[str, Any]]:
    """
    Retrieves a manifest of all cached assets for a given document version.
    """
    result = await session.execute(
        select(AcademicAssetCache).where(
            AcademicAssetCache.document_version_id == document_version_id
        )
    )
    assets = result.scalars().all()
    
    return [
        {
            "id": str(asset.id),
            "asset_type": asset.asset_type.value if hasattr(asset.asset_type, "value") else asset.asset_type,
            "target_lang": asset.target_lang,
            "profile": asset.profile,
            "updated_at": asset.updated_at,
        }
        for asset in assets
    ]


async def get_cached_asset(
    session: AsyncSession,
    document_version_id: UUID,
    asset_type: AcademicAssetType,
    target_lang: str,
    profile: str
) -> AcademicAssetCache | None:
    """
    Retrieves a specific cached asset.
    """
    result = await session.execute(
        select(AcademicAssetCache).where(
            AcademicAssetCache.document_version_id == document_version_id,
            AcademicAssetCache.asset_type == asset_type,
            AcademicAssetCache.target_lang == target_lang,
            AcademicAssetCache.profile == profile,
        )
    )
    return result.scalars().first()