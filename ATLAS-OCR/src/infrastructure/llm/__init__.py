# Comprehensive, production-ready code with clear JSDoc/Docstring comments.
"""
Omni-Architect: LLM Infrastructure Package
────────────────────────────────────────────────────────────────────────────────
Exposes the Model Bridge facade and core LLM routing components.
"""

from .bridge import OmniModelBridge, raw_colbert_embed

__all__ = [
    "OmniModelBridge",
    "raw_colbert_embed",
]