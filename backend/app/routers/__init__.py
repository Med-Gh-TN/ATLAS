"""
Spec-compliant router package for the rebuilt ATLAS `/v1` API surface.

These routers will replace the legacy `app.api.v1.endpoints` tree as the
contract migration proceeds.
"""

from app.routers.registry import register_v1_routers

__all__ = ["register_v1_routers"]
