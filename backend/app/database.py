"""
Compatibility wrapper for legacy database imports.

The active session/engine implementation lives in `app.db.session`. This
module preserves the old import surface while delegating to the active source
of truth.
"""

from app.db.session import engine, get_session


async def get_db():
    async for session in get_session():
        yield session


__all__ = ["engine", "get_db", "get_session"]
