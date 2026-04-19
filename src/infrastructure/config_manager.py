"""
src/infrastructure/config_manager.py
════════════════════════════════════════════════════════════════════════════════
Omni-Architect: Typed Configuration Manager (v6.3 — SOTA Asset Boundaries)
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from enum import Enum
from functools import lru_cache
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

logger = logging.getLogger(__name__)

class TaskType(str, Enum):
    INGEST_VISION    = "INGEST_VISION"
    INGEST_GRAPH     = "INGEST_GRAPH"
    QUERY_ROUTER     = "QUERY_ROUTER"
    QUERY_SYNTHESIS  = "QUERY_SYNTHESIS"
    ASSET_GENERATION = "ASSET_GENERATION"  # Dedicated task for heavy JSON

@dataclass(frozen=True)
class OmniConfig:
    api_key_ingest_vision:    str
    api_key_ingest_graph:     str
    api_key_query_router:     str
    api_key_query_synthesis:  str
    api_key_asset_generation: str

    groq_api_key: str
    groq_model:   str
    gemini_model_name: str

    cb_rpm_cooldown_seconds:     float
    cb_rpd_cooldown_seconds:     float
    cb_service_cooldown_seconds: float
    cb_failure_threshold:        int

    gemini_rpm_safety_factor:  float
    gemini_rpd_soft_limit_pct: float

    gemini_max_output_tokens:     int
    gemini_max_extraction_tokens: int
    gemini_max_asset_tokens:      int

    embedder_model_name:  str
    fastembed_provider:   str
    fastembed_batch_size: int
    fastembed_parallel:   int
    fastembed_threads:    int
    embedding_dimension:  int
    embedding_max_tokens: int

    qdrant_url:          str
    qdrant_api_key:      str
    qdrant_upsert_batch: int
    redis_uri:           str
    postgres_uri:        str
    neo4j_uri:           str
    neo4j_user:          str
    neo4j_password:      str

    server_host: str
    server_port: int

    chunk_token_size:    int
    chunk_overlap:       int
    max_pages_per_slice: int

    force_vlm_ocr:       bool
    vlm_ocr_dpi:         int
    vlm_ocr_batch_pages: int

    dir_inputs:    Path
    dir_output:    Path
    dir_workspace: Path

    enterprise_storage_enabled: bool
    qdrant_strict_isolation:    bool

    reranker_enabled: bool
    reranker_model:   str
    reranker_top_k:   int
    hyde_enabled: bool
    semantic_cache_enabled:     bool
    cache_similarity_threshold: float
    query_decomp_enabled: bool
    math_latex_normalize: bool

    @property
    def api_keys(self) -> dict[TaskType, str]:
        return {
            TaskType.INGEST_VISION:    self.api_key_ingest_vision,
            TaskType.INGEST_GRAPH:     self.api_key_ingest_graph,
            TaskType.QUERY_ROUTER:     self.api_key_query_router,
            TaskType.QUERY_SYNTHESIS:  self.api_key_query_synthesis,
            TaskType.ASSET_GENERATION: self.api_key_asset_generation,
        }

    def is_enterprise_ready(self) -> bool:
        return (self.enterprise_storage_enabled and bool(self.redis_uri) 
                and bool(self.neo4j_uri) and bool(self.postgres_uri))

    def sota_features_summary(self) -> dict[str, bool]:
        return {
            "semantic_cache": self.semantic_cache_enabled,
            "hyde":           self.hyde_enabled,
            "query_decomp":   self.query_decomp_enabled,
            "reranker":       self.reranker_enabled,
            "math_normalize": self.math_latex_normalize,
        }

def _require(key: str, errors: list[str]) -> str:
    val = os.getenv(key, "").strip()
    if not val: errors.append(key)
    return val

def _optional(key: str, default: str = "") -> str:
    return os.getenv(key, default).strip() or default

def _optional_int(key: str, default: int) -> int:
    try: return int(os.getenv(key, str(default)))
    except (ValueError, TypeError): return default

def _optional_float(key: str, default: float) -> float:
    try: return float(os.getenv(key, str(default)))
    except (ValueError, TypeError): return default

def _optional_bool(key: str, default: bool = False) -> bool:
    return os.getenv(key, str(default)).strip().lower() in ("true", "1", "yes")

@lru_cache(maxsize=1)
def load_config(env_path: Optional[str] = None) -> OmniConfig:
    resolved = Path(env_path).resolve() if env_path else None
    if resolved: load_dotenv(dotenv_path=resolved, override=False)
    else: load_dotenv(override=False)

    errors: list[str] = []
    k_vision    = _require("API_KEY_INGEST_VISION",   errors)
    k_graph     = _require("API_KEY_INGEST_GRAPH",    errors)
    k_router    = _require("API_KEY_QUERY_ROUTER",    errors)
    k_synthesis = _require("API_KEY_QUERY_SYNTHESIS", errors)
    groq_key    = _require("GROQ_API_KEY",            errors)
    k_asset     = _optional("API_KEY_ASSET_GENERATION", k_synthesis)

    if errors:
        lines = "\n".join(f"  • {k}" for k in errors)
        raise EnvironmentError(f"OMNI-ARCHITECT STARTUP HALT:\n{lines}")

    project_root = resolved.parent if resolved else Path.cwd()

    cfg = OmniConfig(
        api_key_ingest_vision    = k_vision,
        api_key_ingest_graph     = k_graph,
        api_key_query_router     = k_router,
        api_key_query_synthesis  = k_synthesis,
        api_key_asset_generation = k_asset,

        groq_api_key      = groq_key,
        groq_model        = _optional("GROQ_MODEL_NAME", "llama-3.3-70b-versatile"),
        gemini_model_name = _optional("GEMINI_MODEL_NAME", "gemini-2.0-flash-lite"),

        cb_rpm_cooldown_seconds     = _optional_float("CB_RPM_COOLDOWN_SECONDS", 35.0),
        cb_rpd_cooldown_seconds     = _optional_float("CB_RPD_COOLDOWN_SECONDS", 86400.0),
        cb_service_cooldown_seconds = _optional_float("CB_SERVICE_COOLDOWN_SECONDS", 300.0),
        cb_failure_threshold        = _optional_int("CB_FAILURE_THRESHOLD", 2),

        gemini_rpm_safety_factor  = _optional_float("GEMINI_RPM_SAFETY_FACTOR", 0.70),
        gemini_rpd_soft_limit_pct = _optional_float("GEMINI_RPD_SOFT_LIMIT_PCT", 80.0),

        gemini_max_output_tokens     = _optional_int("GEMINI_MAX_OUTPUT_TOKENS", 512),
        gemini_max_extraction_tokens = _optional_int("GEMINI_MAX_EXTRACTION_TOKENS", 4096),
        gemini_max_asset_tokens      = _optional_int("GEMINI_MAX_ASSET_TOKENS", 8192),

        embedder_model_name  = _optional("EMBEDDER_MODEL_NAME", "jinaai/jina-colbert-v2"),
        fastembed_provider   = _optional("FASTEMBED_PROVIDER", "CPUExecutionProvider"),
        fastembed_batch_size = _optional_int("FASTEMBED_BATCH_SIZE", 16),
        fastembed_parallel   = _optional_int("FASTEMBED_PARALLEL", 0),
        fastembed_threads    = _optional_int("FASTEMBED_THREADS", 6),
        embedding_dimension  = _optional_int("EMBEDDING_DIMENSION", 128),
        embedding_max_tokens = _optional_int("EMBEDDING_MAX_TOKENS", 8192),

        qdrant_url          = _optional("QDRANT_URL", "http://localhost:6333"),
        qdrant_api_key      = _optional("QDRANT_API_KEY", ""),
        qdrant_upsert_batch = _optional_int("QDRANT_UPSERT_BATCH_SIZE", 32),
        redis_uri           = _optional("REDIS_URI", "redis://localhost:6379/0"),
        postgres_uri        = _optional("POSTGRES_URI", ""),
        neo4j_uri           = _optional("NEO4J_URI", "bolt://localhost:7687"),
        neo4j_user          = _optional("NEO4J_USER", "neo4j"),
        neo4j_password      = _optional("NEO4J_PASSWORD", ""),

        server_host = _optional("SERVER_HOST", "localhost"),
        server_port = _optional_int("SERVER_PORT", 8000),

        chunk_token_size    = _optional_int("CHUNK_TOKEN_SIZE", 400),
        chunk_overlap       = _optional_int("CHUNK_OVERLAP", 40),
        max_pages_per_slice = _optional_int("MAX_PAGES_PER_SLICE", 5),

        force_vlm_ocr       = _optional_bool("FORCE_VLM_OCR", False),
        vlm_ocr_dpi         = _optional_int("VLM_OCR_DPI", 150),
        vlm_ocr_batch_pages = _optional_int("VLM_OCR_BATCH_PAGES", 1),

        dir_inputs    = project_root / _optional("DIR_INPUTS", "OCR/inputs"),
        dir_output    = project_root / _optional("DIR_OUTPUT", "OCR/output"),
        dir_workspace = project_root / _optional("DIR_WORKSPACE", "rag_workspace"),

        enterprise_storage_enabled = _optional_bool("ENTERPRISE_STORAGE_ENABLED", True),
        qdrant_strict_isolation    = _optional_bool("QDRANT_STRICT_ISOLATION", True),

        reranker_enabled = _optional_bool("RERANKER_ENABLED", True),
        reranker_model   = _optional("RERANKER_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2"),
        reranker_top_k   = _optional_int("RERANKER_TOP_K", 5),

        hyde_enabled               = _optional_bool("HYDE_ENABLED", True),
        semantic_cache_enabled     = _optional_bool("SEMANTIC_CACHE_ENABLED", True),
        cache_similarity_threshold = _optional_float("CACHE_SIMILARITY_THRESHOLD", 0.92),
        query_decomp_enabled       = _optional_bool("QUERY_DECOMP_ENABLED", True),
        math_latex_normalize       = _optional_bool("MATH_LATEX_NORMALIZE", True),
    )
    return cfg