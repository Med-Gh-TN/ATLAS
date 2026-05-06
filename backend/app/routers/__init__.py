"""
Spec-compliant router package for the ATLAS `/v1` API surface.

The legacy `app.api.v1.endpoints` tree has been fully retired and removed.
All production routing now lives in this package.
"""

from app.routers.registry import register_v1_routers

__all__ = ["register_v1_routers"]
