"""
Omni-Architect JSON Prompts Injector (v6.8 — Native SOTA Restoration)
────────────────────────────────────────────────────────────────────────────────
This module handles the surgical injection of our decoupled SOTA Markdown prompts
into the native LightRAG and RAG-Anything prompt registries.

Architecture Change (v6.8):
The "Kill Switch" lobotomy has been removed. We are now allowing LightRAG to 
natively process graph extraction and summarization, but we are aggressively 
locking its internal prompts to use our perfected, schema-compliant SOTA prompts 
(entity_extract.md, summary_gen.md, vision_extract.md) from the domain folder.
"""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

class LockedPromptDict(dict):
    """
    A defensive dictionary that intercepts and ignores framework overwrites
    once the SOTA prompts are locked in.
    """
    def __init__(self, original_dict):
        super().__init__(original_dict)
        self._locked = False

    def lock(self):
        self._locked = True

    def __setitem__(self, key, value):
        if getattr(self, "_locked", False) and key in ("entity_extraction", "vision_prompt", "summarize_entity_descriptions"):
            logger.debug(f"Patches [SOTA-INJECT]: Blocked framework from downgrading '{key}'")
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
    [SOTA-INJECT] Overwrite LightRAG's native prompts with our perfected schema 
    prompts to guarantee high-precision graph generation.
    Locks the dictionaries to prevent framework overrides.
    """
    src_dir = Path(__file__).resolve().parent.parent.parent
    prompts_dir = src_dir / "domain" / "prompts"
    
    vision_md_path = prompts_dir / "vision_extract.md"
    entity_md_path = prompts_dir / "entity_extract.md"
    summary_md_path = prompts_dir / "summary_gen.md"
    
    # Load Prompts from Disk
    vision_prompt = ""
    if vision_md_path.exists():
        with open(vision_md_path, "r", encoding="utf-8") as f:
            vision_prompt = f.read()

    entity_prompt = ""
    if entity_md_path.exists():
        with open(entity_md_path, "r", encoding="utf-8") as f:
            entity_prompt = f.read()
            
    summary_prompt = ""
    if summary_md_path.exists():
        with open(summary_md_path, "r", encoding="utf-8") as f:
            summary_prompt = f.read()
            
    # 1. Attack LightRAG directly — Inject SOTA Graph Prompts
    try:
        import lightrag.prompt as lr_prompts
        
        if not isinstance(lr_prompts.PROMPTS, LockedPromptDict):
            lr_prompts.PROMPTS = LockedPromptDict(lr_prompts.PROMPTS)

        if entity_prompt:
            lr_prompts.PROMPTS["entity_extraction"] = entity_prompt
        if summary_prompt:
            lr_prompts.PROMPTS["summarize_entity_descriptions"] = summary_prompt
        
        logger.info("Patches [SOTA-INJECT]: SOTA Graph Extraction Prompts injected into LightRAG ✓")
        
        lr_prompts.PROMPTS.lock()
    except Exception as e:
        logger.warning(f"Patches [SOTA-INJECT]: LightRAG patch failed: {e}")

    # 2. Attack RAG-Anything's prompt registry
    try:
        import raganything.prompt as ra_prompts
        
        if not isinstance(ra_prompts.PROMPTS, LockedPromptDict):
            ra_prompts.PROMPTS = LockedPromptDict(ra_prompts.PROMPTS)
            
        if vision_prompt:
            ra_prompts.PROMPTS["vision_prompt"] = vision_prompt
            logger.info("Patches [SOTA-INJECT]: SOTA vision_extract.md injected into RAG-Anything ✓")
                
        if entity_prompt:
            ra_prompts.PROMPTS["entity_extraction"] = entity_prompt
                
        ra_prompts.PROMPTS.lock()
        logger.info("Patches [SOTA-INJECT]: RAG-Anything prompts locked and overridden ✓")
    except Exception as e:
        logger.warning(f"Patches [SOTA-INJECT]: RAG-Anything patch bypassed (non-fatal): {e}")