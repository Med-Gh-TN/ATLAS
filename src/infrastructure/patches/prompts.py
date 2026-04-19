"""
Omni-Architect TOON Prompts Injector (v6.3 — SOTA Decoupled Architecture)
────────────────────────────────────────────────────────────────────────────────
This module handles the surgical injection of our decoupled SOTA Markdown prompts,
and the strict neutralization of native LightRAG graph generation.

Architecture Change (v6.3):
LightRAG's native entity extraction is now lobotomized via a parser-safe 
"Kill Switch" prompt. Graph generation is exclusively handled by the external
GraphExtractionService using rigid Pydantic schemas.
"""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# SOTA KILL SWITCHES
# These prompts force the LLM to return empty, parser-safe structures instantly.
# This prevents token bleed, API quota exhaustion, and schema contamination.
# ──────────────────────────────────────────────────────────────────────────────

ENTITY_KILL_SWITCH_PROMPT = """You are an AI system operating in a decoupled architecture. 
The Knowledge Graph extraction phase is handled by an external service.
You MUST NOT extract any entities or relationships. 
You MUST output EXACTLY the following string to satisfy the TOON parser, and nothing else:
("tuple", [], [])"""

SUMMARIZE_KILL_SWITCH_PROMPT = """You are an AI system operating in a decoupled architecture.
DO NOT summarize anything.
Output EXACTLY the following string and nothing else:
"""


class LockedPromptDict(dict):
    """
    A defensive dictionary that intercepts and ignores framework overwrites
    once the SOTA prompts and Kill Switches are locked in.
    """
    def __init__(self, original_dict):
        super().__init__(original_dict)
        self._locked = False

    def lock(self):
        self._locked = True

    def __setitem__(self, key, value):
        if getattr(self, "_locked", False) and key in ("entity_extraction", "vision_prompt", "summarize_entity_descriptions"):
            logger.debug(f"Patches [ANTI-HALLUC]: Blocked framework from downgrading '{key}'")
            return
        super().__setitem__(key, value)

    def update(self, *args, **kwargs):
        if getattr(self, "_locked", False):
            if args:
                for k, v in dict(args[0]).items():
                    self.__setitem__(k, v)
            for k, v in kwargs.items():
                self.__setitem__(k, v)
            return
        super().update(*args, **kwargs)


def apply_prompt_patches() -> None:
    """
    [ANTI-HALLUC] Overwrite LightRAG's native prompts with Kill Switches to 
    guarantee zero hallucination and bypass internal graph generation. 
    Locks the dictionaries to prevent framework overrides.
    """
    src_dir = Path(__file__).resolve().parent.parent.parent
    prompts_dir = src_dir / "domain" / "prompts"
    vision_md_path = prompts_dir / "vision_extract.md"
    
    # 1. Attack LightRAG directly — Lobotomize Graph Generation
    try:
        import lightrag.prompt as lr_prompts
        
        if not isinstance(lr_prompts.PROMPTS, LockedPromptDict):
            lr_prompts.PROMPTS = LockedPromptDict(lr_prompts.PROMPTS)

        # Inject the Kill Switches
        lr_prompts.PROMPTS["entity_extraction"] = ENTITY_KILL_SWITCH_PROMPT
        lr_prompts.PROMPTS["summarize_entity_descriptions"] = SUMMARIZE_KILL_SWITCH_PROMPT
        
        logger.info("Patches [ANTI-HALLUC]: SOTA Kill Switches injected into LightRAG (Graph Generation Disabled) ✓")
        
        lr_prompts.PROMPTS.lock()
    except Exception as e:
        logger.warning(f"Patches [ANTI-HALLUC]: LightRAG patch failed: {e}")

    # 2. Attack RAG-Anything's prompt registry — Preserve Vision OCR
    try:
        import raganything.prompt as ra_prompts
        
        if not isinstance(ra_prompts.PROMPTS, LockedPromptDict):
            ra_prompts.PROMPTS = LockedPromptDict(ra_prompts.PROMPTS)
            
        if vision_md_path.exists():
            with open(vision_md_path, "r", encoding="utf-8") as f:
                ra_prompts.PROMPTS["vision_prompt"] = f.read()
                logger.info("Patches [ANTI-HALLUC]: SOTA vision_extract.md injected into RAG-Anything ✓")
                
        # RAG-Anything caches the entity prompt here as well. Lobotomize it.
        ra_prompts.PROMPTS["entity_extraction"] = ENTITY_KILL_SWITCH_PROMPT
                
        ra_prompts.PROMPTS.lock()
        logger.info("Patches [ANTI-HALLUC]: RAG-Anything prompts locked and overridden ✓")
    except Exception as e:
        logger.warning(f"Patches [ANTI-HALLUC]: RAG-Anything patch bypassed (non-fatal): {e}")