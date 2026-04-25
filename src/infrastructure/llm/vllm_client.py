"""
@file vllm_client.py
@description Dedicated HTTP client for Sovereign Edge Node. 
Strictly adheres to the Kaggle Master Bootloader API contract (Raw String Payload).
@layer Core Logic
@dependencies aiohttp, asyncio, logging, os
"""

import asyncio
import logging
import os
import aiohttp

logger = logging.getLogger(__name__)

class VLLMClient:
    """
    Manages direct HTTP connection to the remote Colab/Kaggle GPU tunnel using native Async IO.
    Supports multimodal payloads (Base64 images) for Qwen-VL architectures.
    """

    @staticmethod
    def clean_response(text: str) -> str:
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return text.strip()

    @classmethod
    async def generate(
        cls, 
        prompt: str, 
        system_instruction: str, 
        max_tokens: int, 
        json_schema: dict = None, 
        image_base64: str = None
    ) -> str:
        # THE SMOKING GUN FIX: Aggressive stripping of invisible characters
        colab_url = os.getenv("COLAB_GPU_URL", "").strip().rstrip('/')
        tunnel_key = os.getenv("TUNNEL_API_KEY", "").strip()
        logger.critical(f"☢️ NUKE TEST: Dialing EXACT URL -> '{colab_url}'")
        timeout_str = os.getenv("CLOUDFLARE_TUNNEL_TIMEOUT", "95.0").strip()
        timeout_val = float(timeout_str)

        if not colab_url:
            raise RuntimeError("COLAB_GPU_URL is not configured. Tunnel down.")

        headers = {"X-API-Key": tunnel_key} if tunnel_key else {}
        
        payload = {
            "prompt": prompt,
            "system_instruction": system_instruction,
            "max_tokens": max_tokens,
            "temperature": 0.1  
        }
        
        if json_schema:
            payload["json_schema"] = json_schema
            
        if image_base64:
            payload["image_base64"] = image_base64

        timeout = aiohttp.ClientTimeout(
            total=timeout_val + 60.0, 
            sock_read=timeout_val
        )

        full_text = ""
        
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(f"{colab_url}/generate", json=payload, headers=headers) as res:
                    
                    if res.status == 524:
                        logger.error("[SIDE EFFECT] Cloudflare Tunnel Timeout (524).")
                        raise TimeoutError("Cloudflare tunnel timeout (524).")
                    if res.status == 502:
                        logger.error("[SIDE EFFECT] Bad Gateway (502). Sovereign Node offline.")
                        raise ConnectionError("Sovereign Node connection refused (502).")
                        
                    res.raise_for_status()
                    
                    async for chunk in res.content.iter_any():
                        if chunk:
                            full_text += chunk.decode('utf-8', errors='replace')

            return cls.clean_response(full_text)
            
        except asyncio.TimeoutError as e:
            logger.error(f"[SIDE EFFECT] Local async timeout: {e}")
            raise TimeoutError(f"Local timeout: {e}")
        except aiohttp.ClientConnectorDNSError as e:
            logger.error(f"[SIDE EFFECT] Tunnel DNS Error (Check .env formatting): {e}")
            raise ConnectionError(f"Tunnel DNS Error: {e}")
        except aiohttp.ClientPayloadError as e:
            logger.error(f"[SIDE EFFECT] Stream interrupted: {e}")
            raise ConnectionError(f"Stream interrupted: {e}")
        except aiohttp.ClientError as e:
            logger.error(f"[SIDE EFFECT] Tunnel request failed: {e}")
            raise ConnectionError(f"Network bad gateway / connection refused: {e}")