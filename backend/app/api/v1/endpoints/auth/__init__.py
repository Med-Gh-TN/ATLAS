"""
Auth Domain Aggregation Module.
DEFENSIVE ARCHITECTURE: This file ensures backward compatibility for existing imports
across the application while enforcing the new Domain-Driven Design (DDD) architecture.
"""
from .router import router
from .me import get_current_user

# Explicitly define the public exports of this package.
# Prevents namespace pollution from wildcard imports.
__all__ = ["router", "get_current_user"]