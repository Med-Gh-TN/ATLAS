"""
@file embedder.py
@description Single-responsibility service for managing CPU-bound late interaction embeddings and thread isolation.
@layer Core Logic
@dependencies infrastructure.config_manager, aiohttp

Changelog v8.5:
- SOTA FIX: Aggressive URL sanitation to prevent aiohttp ClientConnectorDNSError caused by .env invisible characters.
"""

from __future__ import annotations

import asyncio
import concurrent.futures
import logging
import os
import threading
import time
from typing import Optional

import numpy as np
import aiohttp
from fastembed import LateInteractionTextEmbedding

from infrastructure.config_manager import OmniConfig

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# SOTA Lazy Loading: Tiktoken Network Quarantine
# ─────────────────────────────────────────────────────────────────────────────
_TIKTOKEN_ENC = None
_TIKTOKEN_ATTEMPTED = False
_HAS_TIKTOKEN = False


def _get_tiktoken_enc():
    """
    Lazy loader with a strict 3-second network guillotine.
    Prevents Azure blob storage timeouts from permanently hanging the pipeline.
    """
    global _TIKTOKEN_ENC, _TIKTOKEN_ATTEMPTED, _HAS_TIKTOKEN
    if _TIKTOKEN_ATTEMPTED:
        return _TIKTOKEN_ENC

    _TIKTOKEN_ATTEMPTED = True
    try:
        import tiktoken as _tiktoken

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_tiktoken.get_encoding, "cl100k_base")
            try:
                _TIKTOKEN_ENC = future.result(timeout=3.0)
                _HAS_TIKTOKEN = True
                logger.debug("embedder: tiktoken loaded — Tensor Truncation Guardrail is byte-exact.")
            except concurrent.futures.TimeoutError:
                logger.warning(
                    "embedder: tiktoken network fetch timed out (>3s). "
                    "Azure blob storage is blocked. "
                    "Falling back to word-count approximation."
                )
                _TIKTOKEN_ENC = None
                _HAS_TIKTOKEN = False
    except ImportError:
        _TIKTOKEN_ENC = None
        _HAS_TIKTOKEN = False
        logger.warning(
            "embedder: tiktoken not found. Tensor Truncation Guardrail will use "
            "word-count approximation (±30% accuracy). "
            "Install with: pip install tiktoken"
        )

    return _TIKTOKEN_ENC


# ─────────────────────────────────────────────────────────────────────────────
# Hybrid Edge/CPU Embedder Service
# ─────────────────────────────────────────────────────────────────────────────

class CPUEmbedderService:
    """
    Hybrid inference service for Late Interaction Embeddings.
    Prioritizes Colab T4 GPU via Reverse Tunnel. Falls back to strictly pinned
    local CPU P-Cores if the tunnel times out or returns 502/403.
    """

    def __init__(self, config: OmniConfig) -> None:
        self.config = config

        os.environ["OMP_NUM_THREADS"] = str(self.config.fastembed_threads)
        os.environ["OMP_THREAD_LIMIT"] = str(self.config.fastembed_threads)
        os.environ["RAY_NUM_CPUS"] = "1"

        self._embed_semaphore = asyncio.Semaphore(1)
        
        # SOTA FIX: Independent Micro-Breaker for the Embedder
        self._tunnel_cooldown_until = 0.0

        self._colbert_executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=1,
            initializer=self._init_colbert_affinity
        )

        logger.info(
            "CPUEmbedderService: Loading '%s' via FastEmbed "
            "(provider=%s, threads=%d, batch=%d) on Pinned Cores=%s...",
            self.config.embedder_model_name,
            self.config.fastembed_provider,
            self.config.fastembed_threads,
            self.config.fastembed_batch_size,
            self.config.colbert_cores
        )

        self.embedding_model = self._colbert_executor.submit(
            LateInteractionTextEmbedding,
            model_name=self.config.embedder_model_name,
            providers=[self.config.fastembed_provider],
            threads=self.config.fastembed_threads,
            max_length=self.config.embedding_max_tokens, 
            cache_dir=os.getenv("FASTEMBED_CACHE_PATH")
        ).result()

        logger.info("CPUEmbedderService: Local Fallback Online and P-Core Isolated.")

    def _init_colbert_affinity(self) -> None:
        if hasattr(os, "sched_setaffinity") and self.config.colbert_cores:
            try:
                os.sched_setaffinity(0, set(self.config.colbert_cores))
                logger.debug(
                    "CPUEmbedderService: Thread %s strictly pinned to logical cores %s.",
                    threading.get_ident(), self.config.colbert_cores
                )
            except Exception as e:
                logger.warning("CPUEmbedderService: Failed to set OS CPU affinity: %s", e)

    def _truncate_texts(self, texts: list[str]) -> list[str]:
        limit = self.config.embedding_max_tokens
        result: list[str] = []
        enc = _get_tiktoken_enc()

        for text in texts:
            if enc is not None:
                ids = enc.encode(text)
                if len(ids) > limit:
                    logger.warning(
                        "embedder._truncate_texts: text truncated %d → %d tokens "
                        "(Tensor Truncation Guardrail).",
                        len(ids), limit
                    )
                    result.append(enc.decode(ids[:limit]))
                else:
                    result.append(text)
            else:
                word_limit = int(limit / 1.3)
                words = text.split()
                if len(words) > word_limit:
                    logger.warning(
                        "embedder._truncate_texts: text truncated ~%d → ~%d words "
                        "(word-count approximation active).",
                        len(words), word_limit
                    )
                    result.append(" ".join(words[:word_limit]))
                else:
                    result.append(text)

        return result

    async def embed(self, texts: list[str]) -> list[np.ndarray]:
        if not texts:
            return []

        safe_texts = self._truncate_texts(texts)
        loop = asyncio.get_running_loop()

        # THE SMOKING GUN FIX: Aggressive stripping of invisible characters
        use_external = os.getenv("USE_EXTERNAL_GPU", "false").strip().lower() == "true"
        colab_url = os.getenv("COLAB_GPU_URL", "").strip().rstrip('/')
        tunnel_key = os.getenv("TUNNEL_API_KEY", "").strip()
        timeout_val = float(os.getenv("CLOUDFLARE_TUNNEL_TIMEOUT", "95.0").strip())

        # SOTA FIX: Evaluate the Micro-Breaker State
        if use_external and colab_url:
            if time.time() > self._tunnel_cooldown_until:
                try:
                    headers = {"X-API-Key": tunnel_key} if tunnel_key else {}
                    url = f"{colab_url}/embed"
                    
                    client_timeout = aiohttp.ClientTimeout(total=timeout_val)
                    async with aiohttp.ClientSession(timeout=client_timeout) as session:
                        async with session.post(url, json={"texts": safe_texts}, headers=headers) as response:
                            response.raise_for_status()
                            data = await response.json()
                            return [np.array(v) for v in data["vectors"]]
                            
                except aiohttp.ClientConnectorDNSError as dns_err:
                    logger.error(f"CPUEmbedderService: Tunnel DNS Error (Check .env formatting). {dns_err}")
                    self._tunnel_cooldown_until = time.time() + 300.0
                except Exception as e:
                    logger.warning(
                        "CPUEmbedderService: Colab tunnel failed (%s). "
                        "Tripping Embedder Circuit Breaker for 5 minutes. Falling back to local P-Cores.", type(e).__name__
                    )
                    # Trip the breaker for 300 seconds (5 minutes)
                    self._tunnel_cooldown_until = time.time() + 300.0
            else:
                # Silently skip remote call during cooldown to prevent pipeline blocking
                pass

        async with self._embed_semaphore:
            return await loop.run_in_executor(
                self._colbert_executor,
                lambda: list(self.embedding_model.embed(
                    safe_texts,
                    batch_size=self.config.fastembed_batch_size,
                    parallel=self.config.fastembed_parallel,
                ))
            )