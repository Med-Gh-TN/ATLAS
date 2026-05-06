"""
@file vision.py
@description Single-responsibility service for managing VLM OCR and multimodal image analysis.
────────────────────────────────────────────────────────────────────────────────
Changelog v8.1:
  - SOTA FIX: Purged hard Google GenAI dependency. Payload generation is now strictly 
    aligned for Kaggle/Colab vLLM Sovereign constraints (Raw Base64 kwargs).
  - Hardened page-by-page OCR loop to explicitly protect T4 16GB VRAM bounds.
@layer Core Logic
@dependencies asyncio, base64, logging, infrastructure.config_manager
"""

from __future__ import annotations

import asyncio
import base64
import logging
from typing import Any

from infrastructure.config_manager import TaskType

logger = logging.getLogger(__name__)

# Fallback response for out-of-bounds VLM calls
_VLM_BLOCKED_RESPONSE = (
    '{"content_type": "IMAGE", "detailed_description": "VLM call blocked outside ingestion phase.", '
    '"entity_info": {"entity_name": "blocked", "entity_type": "blocked", "summary": "blocked"}}'
)


class VisionService:
    """
    Dedicated service for multimodal API interactions.
    Guards VLM requests with a strict concurrency semaphore to respect API quotas
    and Edge Node VRAM limitations.
    """

    def __init__(self, router: Any, prompts: Any) -> None:
        self.router = router
        self.prompts = prompts
        # VLM payloads are massive. Hard-locking concurrency to 1 to prevent Kaggle T4 OOM crashes.
        self._vision_semaphore = asyncio.Semaphore(1)

    async def vision_translation_func(
        self, prompt: str, system_prompt: str = "", ingestion_active: bool = False, **kwargs
    ) -> str:
        """Translates embedded images/figures into semantic graph nodes via Qwen-VL."""
        if not ingestion_active:
            return _VLM_BLOCKED_RESPONSE

        raw_image_data = kwargs.get("image_data")
        
        if not raw_image_data:
            return (
                '{"content_type": "IMAGE", "detailed_description": "Image missing. Unavailable.", '
                '"entity_info": {"entity_name": "unknown", "entity_type": "illustration", "summary": "Unavailable"}}'
            )

        # SOTA FIX: Sovereign-safe payload construction. 
        # By passing prompt_parts as [prompt] and supplying the image via image_base64 kwarg, 
        # bridge.py and vllm_client.py seamlessly forward the raw Base64 string to Kaggle 
        # without crashing on Google GenAI types.
        prompt_parts = [prompt]

        async with self._vision_semaphore:
            return await self.router.route_call(
                prompt_parts       = prompt_parts,
                system_instruction = self.prompts.get("vision_extract"),
                task               = TaskType.INGEST_VISION,
                is_vision_call     = True,
                force_json         = True,
                image_base64       = raw_image_data, 
            )

    async def vlm_ocr_page(
        self, image_bytes_batch: list[bytes], page_num_start: int = 0
    ) -> str:
        """Performs verbatim OCR on rasterized document pages."""
        if not image_bytes_batch:
            return ""

        extracted_texts = []
        text_prompt = (
            "Perform complete verbatim OCR. Transcribe ALL text exactly. "
            "Output ONLY transcribed text, no commentary."
        )
        sys_instruction = "You are a precise OCR engine. Output only extracted text."

        # STRICT VRAM LOOP: Ensures Kaggle T4 processes one high-res patch at a time.
        for page_idx, page_bytes in enumerate(image_bytes_batch):
            b64_img = base64.b64encode(page_bytes).decode('utf-8')
            prompt_parts = [text_prompt]

            async with self._vision_semaphore:
                try:
                    logger.info(f"VisionService: Processing OCR for page {page_num_start + page_idx + 1}...")
                    page_text = await self.router.route_call(
                        prompt_parts       = prompt_parts,
                        system_instruction = sys_instruction,
                        task               = TaskType.INGEST_VISION,
                        is_vision_call     = True,
                        image_base64       = b64_img, 
                    )
                    extracted_texts.append(page_text)
                except Exception as e:
                    logger.error(f"VisionService: Failed to OCR page {page_num_start + page_idx + 1}: {e}")
                    
        return "\n\n".join(extracted_texts)