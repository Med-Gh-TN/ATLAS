"""
ATLAS Application Root Package.

This module defines the top-level namespace for the ATLAS system.
Strict architectural boundaries are enforced within the sub-domains
(api, core, db, models, services).

DEFENSIVE ARCHITECTURE ENFORCEMENT:
Imports at this root level are deliberately restricted to package metadata.
No application logic, routers, or configuration state may be exported here to
strictly prevent circular dependency chains during the ASGI/FastAPI boot sequence.

Consumers must explicitly import from exact sub-packages
(e.g., `from app.core.config import settings`).
"""

__version__ = "1.0.0"
__author__ = "ATLAS Engineering Architecture"

__all__ = [
    "__version__",
    "__author__",
]