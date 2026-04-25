"""
ATLAS model package.

`all_models` remains the current aggregation point for SQLModel metadata while the
codebase is gradually normalized into the spec-aligned backend architecture.
"""

from app.models import all_models

__all__ = ["all_models"]
