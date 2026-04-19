# Comprehensive, production-ready code with clear JSDoc/Docstring comments.
"""
Omni-Architect: Legacy Forwarding Stub (v6.2)
────────────────────────────────────────────────────────────────────────────────
Maintains strict backward compatibility for downstream modules (colbert_qdrant.py, 
infrastructure/patches, server.py) that still expect model_bridge at the root level.

Architecture:
All core logic, routing, and prompt enforcement have been surgically extracted
and safely isolated within the `src/infrastructure/llm/` package. This file 
now acts purely as a proxy.
"""

# Forward the primary classes and hooks required by the legacy dependency graph
from infrastructure.llm.bridge import (
    OmniModelBridge,
    raw_colbert_embed,
    _INGESTION_ACTIVE
)

# Optional: Expose the module itself for any dynamic attribute scanning
import infrastructure.llm.bridge as _llm_bridge