"""
@file ATLAS-OCR/src/infrastructure/llm/vllm_client.py
@description Dedicated HTTP client for Sovereign Edge Node. 
SOTA FIX: Hardened `generate_stream` to prevent aiohttp TCP sockets from dropping prematurely.
@layer Core Logic
@dependencies aiohttp, asyncio, logging, os
"""

import asyncio
import logging
import os
import aiohttp
from typing import AsyncGenerator

logger = logging.getLogger(__name__)

class VLLMClient:
    """
    Manages direct HTTP connection to the remote Colab/Kaggle GPU tunnel using native Async IO.
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
    async def _get_base_config(cls):
        colab_url = os.getenv("COLAB_GPU_URL", "").strip().rstrip('/')
        tunnel_key = os.getenv("TUNNEL_API_KEY", "").strip()
        if not colab_url:
            raise RuntimeError("COLAB_GPU_URL is not configured. Tunnel down.")
        headers = {"X-API-Key": tunnel_key} if tunnel_key else {}
        return colab_url, headers

    @classmethod
    async def generate(
        cls, 
        prompt: str, 
        system_instruction: str, 
        max_tokens: int, 
        json_schema: dict = None, 
        image_base64: str = None
    ) -> str:
        colab_url, headers = await cls._get_base_config()
        logger.info(f"☢️ Dialing URL -> '{colab_url}'")
        
        heartbeat_timeout = 60.0 
        total_horizon = 900.0 
        
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

        timeout = aiohttp.ClientTimeout(total=total_horizon, sock_read=heartbeat_timeout)
        full_text = ""
        
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(f"{colab_url}/generate", json=payload, headers=headers) as res:
                    if res.status in (524, 502):
                        raise TimeoutError(f"Tunnel Error ({res.status}).")
                    res.raise_for_status()
                    async for chunk in res.content.iter_any():
                        if chunk:
                            full_text += chunk.decode('utf-8', errors='replace')
            return cls.clean_response(full_text)
            
        except Exception as e:
            logger.error(f"[SIDE EFFECT] Tunnel request failed: {e}")
            raise ConnectionError(f"Stream or Network Error: {e}")

    @classmethod
    async def generate_stream(
        cls, 
        prompt: str, 
        system_instruction: str, 
        max_tokens: int, 
        image_base64: str = None
    ) -> AsyncGenerator[str, None]:
        """
        🚨 SOTA FIX: True Async Generator.
        Yields raw text chunks instantly over the socket without blocking.
        Hardened to prevent the ASGI worker from dropping the aiohttp TCP connection.
        """
        colab_url, headers = await cls._get_base_config()
        
        heartbeat_timeout = 60.0 
        total_horizon = 900.0 
        
        payload = {
            "prompt": prompt,
            "system_instruction": system_instruction,
            "max_tokens": max_tokens,
            "temperature": 0.1  
        }
        
        if image_base64:
            payload["image_base64"] = image_base64

        timeout = aiohttp.ClientTimeout(total=total_horizon, sock_read=heartbeat_timeout)
        
        try:
            # SOTA FIX: We manage the session strictly outside the yield loop
            # so FastAPI StreamingResponse doesn't trigger __aexit__ prematurely.
            session = aiohttp.ClientSession(timeout=timeout)
            try:
                res = await session.post(f"{colab_url}/generate", json=payload, headers=headers)
                if res.status in (524, 502):
                    raise TimeoutError(f"Tunnel Error ({res.status}).")
                res.raise_for_status()
                
                async for chunk in res.content.iter_any():
                    if chunk:
                        yield chunk.decode('utf-8', errors='replace')
                        
            finally:
                await session.close()
                
        except Exception as e:
            logger.error(f"[SIDE EFFECT] Tunnel stream failed: {e}")
            raise ConnectionError(f"Stream Network Error: {e}")

    @classmethod
    async def embed(cls, texts: list[str]) -> list[list[float]]:
        colab_url, headers = await cls._get_base_config()
        timeout = aiohttp.ClientTimeout(total=120.0)
        
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(f"{colab_url}/embed", json={"texts": texts}, headers=headers) as res:
                    res.raise_for_status()
                    data = await res.json()
                    return data.get("vectors", [])
        except Exception as e:
            logger.error(f"[SIDE EFFECT] Remote Embed failed: {e}")
            raise ConnectionError(f"Remote Embed Error: {e}")

    @classmethod
    async def rerank(cls, query: str, chunks: list[str]) -> list[float]:
        colab_url, headers = await cls._get_base_config()
        timeout = aiohttp.ClientTimeout(total=120.0)
        
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(f"{colab_url}/rerank", json={"query": query, "chunks": chunks}, headers=headers) as res:
                    res.raise_for_status()
                    data = await res.json()
                    return data.get("scores", [])
        except Exception as e:
            logger.error(f"[SIDE EFFECT] Remote Rerank failed: {e}")
            raise ConnectionError(f"Remote Rerank Error: {e}")