"""
src/infrastructure/model_registry.py
════════════════════════════════════════════════════════════════════════════════
Omni-Architect: Model Registry  (v7.0 - Sovereign SOTA Edition)

Single source of truth for model capabilities, rate limits, token budgets,
and the fallback chain for each pipeline task.

Changelog v7.0:
  - SOTA QUERY ACCELERATION: VLLM_SOVEREIGN is now the primary engine for ALL tasks.
  - LEGACY PURGE: Removed Groq, Gemini Flash, and Gemma 12B.
  - STRICT CASCADE: Enforced vLLM -> Gemma 4 31B -> Gemma 4 26B -> Gemma 3 27B.
════════════════════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Optional

from infrastructure.config_manager import TaskType

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# MODEL CAPABILITY FLAGS
# ─────────────────────────────────────────────────────────────────────────────

class Cap(str, Enum):
    """Capability flags attached to each ModelSpec."""
    VISION       = "vision"        # Accepts image bytes in prompt_parts
    JSON_NATIVE  = "json_native"   # Supports response_mime_type="application/json"
    JSON_PROMPT  = "json_prompt"   # JSON enforced via system prompt engineering only
    SYS_INJECT   = "sys_inject"    # System instruction must be prepended to user turn


# ─────────────────────────────────────────────────────────────────────────────
# MODEL SPEC
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class ModelSpec:
    """
    Immutable capability and rate-limit profile for one model.
    """
    model_id:               str
    rpm_limit:              int
    tpm_limit:              int          # 0 = unlimited
    rpd_limit:              int
    capabilities:           frozenset
    max_output_tokens:      int
    max_extraction_tokens:  int
    rpm_safety_factor:      float = 0.70  # conservative default

    @property
    def safe_rpm(self) -> float:
        return self.rpm_limit * self.rpm_safety_factor

    @property
    def throttle_delay(self) -> float:
        """Minimum inter-call delay (seconds) to stay within safe RPM."""
        if self.safe_rpm <= 0:
            return 1.0
        return (60.0 / self.safe_rpm) + 0.5   # +0.5s network jitter buffer

    @property
    def supports_vision(self) -> bool:
        return Cap.VISION in self.capabilities

    @property
    def supports_native_json(self) -> bool:
        return Cap.JSON_NATIVE in self.capabilities

    @property
    def needs_system_inject(self) -> bool:
        """True when system instruction must be prepended to the user turn."""
        return Cap.SYS_INJECT in self.capabilities

    @property
    def tpm_per_call_budget(self) -> int:
        if self.tpm_limit == 0:
            return 32_000  # unlimited tier — be generous
        if self.safe_rpm <= 0:
            return self.tpm_limit
        return int(self.tpm_limit / self.safe_rpm)


# ─────────────────────────────────────────────────────────────────────────────
# MODEL REGISTRY DATA
# ─────────────────────────────────────────────────────────────────────────────

VLLM_SENTINEL = "VLLM_SOVEREIGN"

MODELS: dict[str, ModelSpec] = {

    VLLM_SENTINEL: ModelSpec(
        model_id              = VLLM_SENTINEL,
        rpm_limit             = 9999,      # Unbound: bounded only by GPU hardware speed
        tpm_limit             = 0,         # unlimited
        rpd_limit             = 999999,
        # SOTA FIX: Qwen3-VL supports Vision natively via the Kaggle Tunnel
        capabilities          = frozenset({Cap.VISION, Cap.JSON_PROMPT, Cap.SYS_INJECT}),
        max_output_tokens     = 8192,
        max_extraction_tokens = 8192,
        rpm_safety_factor     = 1.0,
    ),

    "gemma-4-31b-it": ModelSpec(
        model_id              = "gemma-4-31b-it",
        rpm_limit             = 15,
        tpm_limit             = 0,       # unlimited
        rpd_limit             = 1500,
        capabilities          = frozenset({Cap.VISION, Cap.JSON_NATIVE}),
        max_output_tokens     = 4096,
        max_extraction_tokens = 4096,
        rpm_safety_factor     = 0.70,
    ),

    "gemma-4-26b-a4b-it": ModelSpec(
        model_id              = "gemma-4-26b-a4b-it",
        rpm_limit             = 15,
        tpm_limit             = 0,       # unlimited
        rpd_limit             = 1500,
        capabilities          = frozenset({Cap.VISION, Cap.JSON_NATIVE}),
        max_output_tokens     = 4096,
        max_extraction_tokens = 2048,
        rpm_safety_factor     = 0.70,
    ),

    "gemma-3-27b-it": ModelSpec(
        model_id              = "gemma-3-27b-it",
        rpm_limit             = 30,
        tpm_limit             = 15_000,
        rpd_limit             = 14_400,
        capabilities          = frozenset({Cap.JSON_PROMPT, Cap.SYS_INJECT}),
        max_output_tokens     = 2048,
        max_extraction_tokens = 2048,
        rpm_safety_factor     = 0.60,
    ),
}


# ─────────────────────────────────────────────────────────────────────────────
# TASK → MODEL FALLBACK CHAINS
# ─────────────────────────────────────────────────────────────────────────────

# SOTA STRICT CASCADE: 
# Every task attempts Kaggle -> Gemma 4 31B -> Gemma 4 26B -> Gemma 3 27B
TASK_MODEL_CHAINS: dict[TaskType, list[str]] = {
    TaskType.INGEST_VISION: [
        VLLM_SENTINEL,
        "gemma-4-31b-it",
        "gemma-4-26b-a4b-it",
        # Gemma 3 27B omitted here strictly because it lacks Vision processing capabilities
    ],
    TaskType.INGEST_GRAPH: [
        VLLM_SENTINEL,
        "gemma-4-31b-it",
        "gemma-4-26b-a4b-it",
        "gemma-3-27b-it",
    ],
    TaskType.QUERY_ROUTER: [
        VLLM_SENTINEL,
        "gemma-4-31b-it",
        "gemma-4-26b-a4b-it",
        "gemma-3-27b-it",
    ],
    TaskType.QUERY_SYNTHESIS: [
        VLLM_SENTINEL,
        "gemma-4-31b-it",
        "gemma-4-26b-a4b-it",
        "gemma-3-27b-it",
    ],
    TaskType.ASSET_GENERATION: [
        VLLM_SENTINEL,
        "gemma-4-31b-it",
        "gemma-4-26b-a4b-it",
        "gemma-3-27b-it",
    ],
}


# ─────────────────────────────────────────────────────────────────────────────
# MODEL REGISTRY SERVICE
# ─────────────────────────────────────────────────────────────────────────────

class ModelRegistry:
    """
    Thin query service over MODELS and TASK_MODEL_CHAINS.
    """

    def __init__(
        self,
        rpm_safety_factor: float = 0.70,
        max_output_tokens: int = 512,
        max_extraction_tokens: int = 4096,
    ) -> None:
        self._rpm_safety_factor     = rpm_safety_factor
        self._max_output_tokens     = max_output_tokens
        self._max_extraction_tokens = max_extraction_tokens

    def get_spec(self, model_id: str) -> ModelSpec:
        if model_id not in MODELS:
            raise KeyError(
                f"ModelRegistry: unknown model '{model_id}'. "
                f"Known models: {sorted(MODELS.keys())}"
            )
        return MODELS[model_id]

    def get_spec_safe(self, model_id: str) -> Optional[ModelSpec]:
        return MODELS.get(model_id)

    def get_chain(self, task: TaskType) -> list[str]:
        chain = TASK_MODEL_CHAINS.get(task)
        if chain is None:
            raise KeyError(f"ModelRegistry: no chain defined for task '{task}'")
        return list(chain)   # defensive copy

    def get_gemini_models(self, task: TaskType) -> list[str]:
        """Returns all models in the chain that use the Google AI Studio SDK."""
        return [m for m in self.get_chain(task) if m != VLLM_SENTINEL]

    def output_budget(self, model_id: str, extraction_mode: bool = False) -> int:
        spec = self.get_spec_safe(model_id)
        if spec is None:
            return self._max_extraction_tokens if extraction_mode else self._max_output_tokens
        if extraction_mode:
            return min(spec.max_extraction_tokens, self._max_extraction_tokens)
        return min(spec.max_output_tokens, self._max_output_tokens)

    def throttle_delay(self, model_id: str) -> float:
        spec = self.get_spec_safe(model_id)
        if spec is None:
            return 6.5   # conservative default
        return spec.throttle_delay

    def supports_vision(self, model_id: str) -> bool:
        spec = self.get_spec_safe(model_id)
        return spec.supports_vision if spec else False

    def supports_native_json(self, model_id: str) -> bool:
        spec = self.get_spec_safe(model_id)
        return spec.supports_native_json if spec else False

    def needs_system_inject(self, model_id: str) -> bool:
        spec = self.get_spec_safe(model_id)
        return spec.needs_system_inject if spec else False

    def log_limits(self) -> None:
        header = f"{'Model':<35} {'RPM':>5} {'TPM':>8} {'RPD':>7} {'Caps'}"
        rows = [header, "-" * 75]
        for mid, spec in sorted(MODELS.items()):
            tpm_str = "∞" if spec.tpm_limit == 0 else f"{spec.tpm_limit:,}"
            caps = ",".join(c.value for c in spec.capabilities)
            rows.append(f"{mid:<35} {spec.rpm_limit:>5} {tpm_str:>8} {spec.rpd_limit:>7}  {caps}")
        logger.info("ModelRegistry limits:\n%s", "\n".join(rows))