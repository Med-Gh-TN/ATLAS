"""
src/infrastructure/model_registry.py
════════════════════════════════════════════════════════════════════════════════
Omni-Architect: Model Registry  (v6.0)

Single source of truth for model capabilities, rate limits, token budgets,
and the fallback chain for each pipeline task.

Why this file exists
────────────────────
Hardcoding model names and limits in business logic creates a maintenance
nightmare — limits change, new models ship, JSON support varies per model.
The registry externalises these concerns:

  • model_bridge.py reads token budgets and throttle delays from here, never
    from the .env directly.
  • circuit_breaker.py reads cooldown strategies from here.
  • The fallback chain is declarative — add a new model in one place and every
    task that includes it automatically benefits.

Registry contents
─────────────────
  MODELS             — dict[model_id → ModelSpec]
  TASK_MODEL_CHAINS  — ordered fallback list per TaskType
  ModelRegistry      — thin service object wrapping the above dicts

Data source: Google AI Studio console (free-tier limits as of June 2025)
════════════════════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum, auto
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

    Fields
    ──────
    model_id                : Exact API model string passed to generate_content()
    rpm_limit               : Hard RPM from Google AI Studio console
    tpm_limit               : Hard TPM (0 = effectively unlimited)
    rpd_limit               : Hard RPD (daily request budget)
    capabilities            : frozenset of Cap flags
    max_output_tokens       : Safe default for synthesis / classification calls
    max_extraction_tokens   : Safe budget for entity/relation JSON extraction
    rpm_safety_factor       : Fraction of rpm_limit treated as the operational ceiling
                              (overrides the global GEMINI_RPM_SAFETY_FACTOR from .env
                              when a model needs tighter margins)
    """
    model_id:               str
    rpm_limit:              int
    tpm_limit:              int          # 0 = unlimited
    rpd_limit:              int
    capabilities:           frozenset
    max_output_tokens:      int
    max_extraction_tokens:  int
    rpm_safety_factor:      float = 0.70  # conservative default

    # ── Derived properties ────────────────────────────────────────────────────

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
        """
        Estimated safe token budget per call, derived from TPM and safe_rpm.
        Falls back to a generous constant when TPM is effectively unlimited.
        """
        if self.tpm_limit == 0:
            return 32_000  # unlimited tier — be generous
        if self.safe_rpm <= 0:
            return self.tpm_limit
        return int(self.tpm_limit / self.safe_rpm)


# ─────────────────────────────────────────────────────────────────────────────
# MODEL REGISTRY DATA
# Google AI Studio free-tier limits — June 2025
# ─────────────────────────────────────────────────────────────────────────────

# Sentinel string used in TASK_MODEL_CHAINS to signal Groq routing
GROQ_SENTINEL = "GROQ"

MODELS: dict[str, ModelSpec] = {

    # ── Gemini 3.1 Flash Lite Preview ─────────────────────────────────────────
    # Primary model for ALL tasks. Fastest, cheapest, vision-capable.
    # Tight RPD (500/day) — conserve for high-value tasks.
    "gemini-3.1-flash-lite-preview": ModelSpec(
        model_id              = "gemini-3.1-flash-lite-preview",
        rpm_limit             = 15,
        tpm_limit             = 250_000,
        rpd_limit             = 500,
        capabilities          = frozenset({Cap.VISION, Cap.JSON_NATIVE}),
        max_output_tokens     = 512,
        max_extraction_tokens = 4096,
        rpm_safety_factor     = 0.67,   # 33% margin — free tier is less stable
    ),

    # ── Gemma 4 31B ───────────────────────────────────────────────────────────
    # Best quality Gemma fallback. Multimodal (vision). Unlimited TPM.
    # RPD=1500: 3× more daily calls than gemini-3.1-flash-lite.
    "gemma-4-31b-it": ModelSpec(
        model_id              = "gemma-4-31b-it",
        rpm_limit             = 15,
        tpm_limit             = 0,       # unlimited
        rpd_limit             = 1500,
        capabilities          = frozenset({Cap.VISION, Cap.JSON_NATIVE}),
        max_output_tokens     = 512,
        max_extraction_tokens = 4096,
        rpm_safety_factor     = 0.70,
    ),

    # ── Gemma 4 26B A4B ───────────────────────────────────────────────────────
    # Lighter Gemma 4 variant. Good for routing/classification (low latency).
    # Multimodal. Unlimited TPM.
    "gemma-4-26b-a4b-it": ModelSpec(
        model_id              = "gemma-4-26b-a4b-it",
        rpm_limit             = 15,
        tpm_limit             = 0,       # unlimited
        rpd_limit             = 1500,
        capabilities          = frozenset({Cap.VISION, Cap.JSON_NATIVE}),
        max_output_tokens     = 512,
        max_extraction_tokens = 2048,
        rpm_safety_factor     = 0.70,
    ),

    # ── Gemma 3 27B ───────────────────────────────────────────────────────────
    # Deep RPD reserve (14,400/day — best for ingestion-heavy workloads).
    # TEXT-ONLY. No vision. JSON via prompt engineering only.
    # TPM=15K: effective safe_rpm ≈ 10 at 1500-token chunks.
    # MUST use SYS_INJECT — no native system_instruction support via genai SDK.
    "gemma-3-27b-it": ModelSpec(
        model_id              = "gemma-3-27b-it",
        rpm_limit             = 30,
        tpm_limit             = 15_000,
        rpd_limit             = 14_400,
        capabilities          = frozenset({Cap.JSON_PROMPT, Cap.SYS_INJECT}),
        max_output_tokens     = 512,
        max_extraction_tokens = 2048,    # conservative for 15K TPM budget
        rpm_safety_factor     = 0.60,    # stricter — TPM is the real bottleneck
    ),

    # ── Gemma 3 12B ───────────────────────────────────────────────────────────
    # Lightest model. Ideal for QUERY_ROUTER (fast, cheap classification).
    # TEXT-ONLY. No vision. JSON via prompt engineering only.
    # Deep RPD reserve (14,400/day).
    "gemma-3-12b-it": ModelSpec(
        model_id              = "gemma-3-12b-it",
        rpm_limit             = 30,
        tpm_limit             = 15_000,
        rpd_limit             = 14_400,
        capabilities          = frozenset({Cap.JSON_PROMPT, Cap.SYS_INJECT}),
        max_output_tokens     = 256,
        max_extraction_tokens = 1024,
        rpm_safety_factor     = 0.60,
    ),
}


# ─────────────────────────────────────────────────────────────────────────────
# TASK → MODEL FALLBACK CHAINS
# ─────────────────────────────────────────────────────────────────────────────
#
# Ordered: first model is attempted first.  GROQ_SENTINEL at the end routes
# to the Groq emergency fallback (text-only, vision data stripped).
#
# Design principles:
#   1. INGEST_VISION: only vision-capable models, then Groq with stub JSON
#   2. INGEST_GRAPH:  quality + high extraction token budget; gemma-3-27b as
#                     deep RPD reserve (14,400 RPD is huge for KG extraction)
#   3. QUERY_ROUTER:  lightweight fast models; gemma-3-12b (14,400 RPD) is
#                     ideal — routing calls are tiny (query → VECTOR|GRAPH)
#   4. QUERY_SYNTHESIS: quality models with adequate output budget

TASK_MODEL_CHAINS: dict[TaskType, list[str]] = {
    TaskType.INGEST_VISION: [
        "gemini-3.1-flash-lite-preview",
        "gemma-4-31b-it",
        GROQ_SENTINEL,
    ],
    TaskType.INGEST_GRAPH: [
        "gemini-3.1-flash-lite-preview",
        "gemma-4-31b-it",
        "gemma-3-27b-it",
        GROQ_SENTINEL,
    ],
    TaskType.QUERY_ROUTER: [
        "gemini-3.1-flash-lite-preview",
        "gemma-4-26b-a4b-it",
        "gemma-3-12b-it",
        GROQ_SENTINEL,
    ],
    TaskType.QUERY_SYNTHESIS: [
        "gemini-3.1-flash-lite-preview",
        "gemma-4-31b-it",
        "gemma-3-27b-it",
        GROQ_SENTINEL,
    ],
    # ── SOTA ASSET GENERATION CHAIN ──
    TaskType.ASSET_GENERATION: [
        "gemini-3.1-flash-lite-preview",
        "gemma-4-31b-it",
        "gemma-3-27b-it",
        GROQ_SENTINEL,
    ],
}


# ─────────────────────────────────────────────────────────────────────────────
# MODEL REGISTRY SERVICE
# ─────────────────────────────────────────────────────────────────────────────

class ModelRegistry:
    """
    Thin query service over MODELS and TASK_MODEL_CHAINS.

    Exposes helper methods so model_bridge.py and circuit_breaker.py don't
    need to import the raw dicts directly.
    """

    def __init__(
        self,
        rpm_safety_factor: float = 0.70,
        max_output_tokens: int = 512,
        max_extraction_tokens: int = 4096,
    ) -> None:
        """
        Args:
            rpm_safety_factor:     Global override for models that don't specify
                                   their own.  Read from OmniConfig in production.
            max_output_tokens:     Global default synthesis token budget.
            max_extraction_tokens: Global default extraction token budget.
        """
        self._rpm_safety_factor     = rpm_safety_factor
        self._max_output_tokens     = max_output_tokens
        self._max_extraction_tokens = max_extraction_tokens

    # ── Model lookup ──────────────────────────────────────────────────────────

    def get_spec(self, model_id: str) -> ModelSpec:
        """
        Return the ModelSpec for a model_id.

        Raises:
            KeyError: if the model_id is not in the registry.
        """
        if model_id not in MODELS:
            raise KeyError(
                f"ModelRegistry: unknown model '{model_id}'. "
                f"Known models: {sorted(MODELS.keys())}"
            )
        return MODELS[model_id]

    def get_spec_safe(self, model_id: str) -> Optional[ModelSpec]:
        """Returns None instead of raising for unknown models."""
        return MODELS.get(model_id)

    # ── Task chains ───────────────────────────────────────────────────────────

    def get_chain(self, task: TaskType) -> list[str]:
        """
        Return the ordered fallback chain for a task.

        The list includes real model_ids and may end with GROQ_SENTINEL.
        """
        chain = TASK_MODEL_CHAINS.get(task)
        if chain is None:
            raise KeyError(f"ModelRegistry: no chain defined for task '{task}'")
        return list(chain)   # defensive copy

    def get_gemini_models(self, task: TaskType) -> list[str]:
        """Return only the Gemini/Gemma model_ids in the task chain (no GROQ_SENTINEL)."""
        return [m for m in self.get_chain(task) if m != GROQ_SENTINEL]

    # ── Token budget helpers ──────────────────────────────────────────────────

    def output_budget(self, model_id: str, extraction_mode: bool = False) -> int:
        """
        Return the appropriate token budget for a call.

        Falls back gracefully: model-specific → global config → hard default.
        """
        spec = self.get_spec_safe(model_id)
        if spec is None:
            return self._max_extraction_tokens if extraction_mode else self._max_output_tokens
        if extraction_mode:
            # Clamp to model's own extraction limit (respects TPM budget)
            return min(spec.max_extraction_tokens, self._max_extraction_tokens)
        return min(spec.max_output_tokens, self._max_output_tokens)

    def throttle_delay(self, model_id: str) -> float:
        """Return the inter-call throttle delay (seconds) for a model."""
        spec = self.get_spec_safe(model_id)
        if spec is None:
            return 6.5   # conservative default
        return spec.throttle_delay

    # ── Capability queries ────────────────────────────────────────────────────

    def supports_vision(self, model_id: str) -> bool:
        spec = self.get_spec_safe(model_id)
        return spec.supports_vision if spec else False

    def supports_native_json(self, model_id: str) -> bool:
        spec = self.get_spec_safe(model_id)
        return spec.supports_native_json if spec else False

    def needs_system_inject(self, model_id: str) -> bool:
        spec = self.get_spec_safe(model_id)
        return spec.needs_system_inject if spec else False

    # ── Diagnostics ───────────────────────────────────────────────────────────

    def log_limits(self) -> None:
        """Emit a startup table of all registered model limits."""
        header = f"{'Model':<35} {'RPM':>5} {'TPM':>8} {'RPD':>7} {'Caps'}"
        rows = [header, "-" * 75]
        for mid, spec in sorted(MODELS.items()):
            tpm_str = "∞" if spec.tpm_limit == 0 else f"{spec.tpm_limit:,}"
            caps = ",".join(c.value for c in spec.capabilities)
            rows.append(f"{mid:<35} {spec.rpm_limit:>5} {tpm_str:>8} {spec.rpd_limit:>7}  {caps}")
        logger.info("ModelRegistry limits:\n%s", "\n".join(rows))