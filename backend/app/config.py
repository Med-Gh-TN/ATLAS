"""
Compatibility wrapper for legacy imports.

The backend's active settings source is `app.core.config`. This module only
re-exports that configuration so older imports resolve to the same singleton
instead of instantiating a second settings model.
"""

from app.core.config import Settings, settings

__all__ = ["Settings", "settings"]
