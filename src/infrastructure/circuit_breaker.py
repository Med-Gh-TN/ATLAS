"""
src/infrastructure/circuit_breaker.py
════════════════════════════════════════════════════════════════════════════════
Omni-Architect: Global Circuit Breaker  (v6.0)

Redis-backed state machine that tracks the health of every (task, model) pair
across the process — and across restarts, since state lives in Redis.

Why Redis?
──────────
If Gemini global infrastructure is degraded, ALL tasks and ALL workers will
hit the same 503s.  A process-local counter wouldn't help if the server
restarts or if a second worker process spins up.  Redis ensures the open/closed
decision is coordinated globally.

States per (task, model) pair
─────────────────────────────
  CLOSED    — Healthy.  Calls flow normally.
  OPEN      — Unhealthy.  Calls are skipped immediately; cooldown in progress.
  HALF_OPEN — Probe state.  One test call is allowed through to check recovery.

Error taxonomy and strategy
────────────────────────────
  RPM_EXHAUSTED   (429 + retry_after ≤ RPM_WAIT_CEIL)  → wait retry_after, retry
  TPM_EXHAUSTED   (429 + TPM in message)                → wait + retry
  RPD_EXHAUSTED   (429 + daily/day in message, OR
                    retry_after > RPM_WAIT_CEIL)         → OPEN CB for 24 h
  SERVICE_DOWN    (503 / SERVICE_UNAVAILABLE)            → OPEN CB for 5 min
  TRANSIENT       (other errors)                         → record failure;
                                                           OPEN after threshold

Key schema (Redis Hash)
───────────────────────
  omni:cb:{task}:{model_id}
    state          : "CLOSED" | "OPEN" | "HALF_OPEN"
    failure_count  : int
    opened_at      : float (Unix timestamp, 0 if closed)
    cooldown_until : float (Unix timestamp; 0 if not in cooldown)
    last_reason    : str (last ErrorClass name)
    last_updated   : float (Unix timestamp)

════════════════════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

CB_KEY_PREFIX        = "omni:cb"
RPM_WAIT_CEIL        = 120.0   # retry_after > this → treat as RPD exhaustion
DEFAULT_FAILURE_TTL  = 3600    # Redis key TTL when CB is in CLOSED state (1h)


# ─────────────────────────────────────────────────────────────────────────────
# ENUMS
# ─────────────────────────────────────────────────────────────────────────────

class CBState(str, Enum):
    CLOSED    = "CLOSED"
    OPEN      = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class ErrorClass(str, Enum):
    """Classified error types — drives the circuit breaker strategy."""
    RPM_EXHAUSTED   = "RPM_EXHAUSTED"    # short wait, retry same model
    TPM_EXHAUSTED   = "TPM_EXHAUSTED"    # short wait, retry same model
    RPD_EXHAUSTED   = "RPD_EXHAUSTED"    # daily quota — OPEN for 24 h
    SERVICE_DOWN    = "SERVICE_DOWN"     # 503 — OPEN for 5 min
    TRANSIENT       = "TRANSIENT"        # other — threshold-based OPEN


# ─────────────────────────────────────────────────────────────────────────────
# ERROR CLASSIFIER
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class ClassifiedError:
    error_class:   ErrorClass
    retry_after:   Optional[float]  # seconds to wait before retry (RPM/TPM only)
    raw_message:   str


def classify_error(exception: Exception) -> ClassifiedError:
    """
    Inspect the exception message and classify it into one of the ErrorClass
    buckets.  This is the single decision point that drives the CB strategy.

    Classification logic
    ────────────────────
    1. Parse the HTTP status code from the error string.
    2. Parse the retry_after value if present (Google includes it as
       "retryDelay: Xs" or "retry_delay { seconds: X }" in 429 bodies).
    3. Check for "daily" / "per day" keyword → RPD_EXHAUSTED.
    4. Check for "TPM" / "per minute (tokens)" → TPM_EXHAUSTED.
    5. Remaining 429s → RPM_EXHAUSTED.
    6. 503 / SERVICE_UNAVAILABLE → SERVICE_DOWN.
    7. Everything else → TRANSIENT.
    """
    msg = str(exception).lower()
    raw = str(exception)

    # ── Extract retry_after ───────────────────────────────────────────────────
    retry_after: Optional[float] = None
    patterns = [
        r"retry[_\s]?delay[:\s]+(\d+\.?\d*)\s*s",    # retryDelay: 35s
        r"retry[_\s]?after[:\s]+(\d+\.?\d*)",         # Retry-After: 35
        r'"seconds":\s*(\d+\.?\d*)',                   # "seconds": 35
        r"retry in ([\d\.]+)\s*s",                     # retry in 35s
    ]
    for pattern in patterns:
        m = re.search(pattern, msg)
        if m:
            retry_after = float(m.group(1))
            break

    # ── 503 / Service Unavailable ─────────────────────────────────────────────
    if "503" in msg or "service_unavailable" in msg or "service unavailable" in msg:
        return ClassifiedError(ErrorClass.SERVICE_DOWN, None, raw)

    # ── 429 / Resource Exhausted ──────────────────────────────────────────────
    is_429 = "429" in msg or "resource_exhausted" in msg or "quota" in msg

    if is_429:
        # Daily / RPD signals
        rpd_signals = ("per day", "daily", "requests_per_day", "rpd", "day quota")
        if any(s in msg for s in rpd_signals):
            return ClassifiedError(ErrorClass.RPD_EXHAUSTED, None, raw)

        # Large retry_after is a strong RPD signal
        if retry_after is not None and retry_after > RPM_WAIT_CEIL:
            return ClassifiedError(ErrorClass.RPD_EXHAUSTED, None, raw)

        # TPM / token signals
        tpm_signals = ("tokens per minute", "tpm", "token", "per_minute_tokens")
        if any(s in msg for s in tpm_signals):
            return ClassifiedError(ErrorClass.TPM_EXHAUSTED, retry_after, raw)

        # Default 429 → RPM
        return ClassifiedError(ErrorClass.RPM_EXHAUSTED, retry_after, raw)

    # ── Transient / Unknown ───────────────────────────────────────────────────
    return ClassifiedError(ErrorClass.TRANSIENT, None, raw)


# ─────────────────────────────────────────────────────────────────────────────
# CIRCUIT BREAKER
# ─────────────────────────────────────────────────────────────────────────────

class CircuitBreaker:
    """
    Redis-backed circuit breaker for (task, model) pairs.

    Falls back gracefully to a no-op in-process dict if Redis is unavailable
    (e.g., local dev without Docker running).
    """

    def __init__(
        self,
        redis_uri:              str,
        failure_threshold:      int   = 2,
        rpm_cooldown_seconds:   float = 35.0,
        rpd_cooldown_seconds:   float = 86_400.0,
        service_cooldown_seconds: float = 300.0,
    ) -> None:
        self._redis_uri              = redis_uri
        self.failure_threshold       = failure_threshold
        self.rpm_cooldown            = rpm_cooldown_seconds
        self.rpd_cooldown            = rpd_cooldown_seconds
        self.service_cooldown        = service_cooldown_seconds

        self._redis: Optional[object] = None   # aioredis.Redis, set in connect()
        self._local: dict[str, dict]  = {}     # fallback in-process state

        logger.info(
            "CircuitBreaker init: threshold=%d, rpm_cd=%.0fs, "
            "rpd_cd=%.0fs, svc_cd=%.0fs",
            failure_threshold, rpm_cooldown_seconds,
            rpd_cooldown_seconds, service_cooldown_seconds,
        )

    async def connect(self) -> None:
        """
        Establish async Redis connection.  Called once at bridge startup.
        Silently falls back to local dict on failure.
        """
        try:
            import redis.asyncio as aioredis
            self._redis = await aioredis.from_url(
                self._redis_uri,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=3,
            )
            await self._redis.ping()
            logger.info("CircuitBreaker: Redis connected (%s)", self._redis_uri)
        except Exception as e:
            logger.warning(
                "CircuitBreaker: Redis unavailable (%s). "
                "Falling back to in-process state — not shared across workers.",
                e,
            )
            self._redis = None

    # ── Redis key helper ──────────────────────────────────────────────────────

    @staticmethod
    def _key(task: "TaskType | str", model_id: str) -> str:
        task_str = task.value if hasattr(task, "value") else str(task)
        # Replace slashes in model IDs (e.g., future OpenRouter-style names)
        safe_model = model_id.replace("/", "_")
        return f"{CB_KEY_PREFIX}:{task_str}:{safe_model}"

    # ── State read ────────────────────────────────────────────────────────────

    async def get_state(
        self, task: "TaskType | str", model_id: str
    ) -> CBState:
        """
        Return the current state.  Transitions OPEN → HALF_OPEN automatically
        when the cooldown period has expired.
        """
        raw = await self._hgetall(self._key(task, model_id))
        if not raw:
            return CBState.CLOSED

        state_str = raw.get("state", CBState.CLOSED.value)
        state     = CBState(state_str)

        if state == CBState.OPEN:
            cooldown_until = float(raw.get("cooldown_until", 0))
            if cooldown_until > 0 and time.time() >= cooldown_until:
                # Cooldown expired — transition to HALF_OPEN for probe
                await self._transition(task, model_id, CBState.HALF_OPEN, raw)
                return CBState.HALF_OPEN

        return state

    # ── Success recording ─────────────────────────────────────────────────────

    async def record_success(
        self, task: "TaskType | str", model_id: str
    ) -> None:
        """Call after every successful model response."""
        key = self._key(task, model_id)
        raw = await self._hgetall(key)

        state = CBState(raw.get("state", CBState.CLOSED.value)) if raw else CBState.CLOSED

        if state in (CBState.HALF_OPEN, CBState.OPEN):
            logger.info(
                "CircuitBreaker: %s:%s recovered → CLOSED", task, model_id
            )

        update = {
            "state":          CBState.CLOSED.value,
            "failure_count":  "0",
            "opened_at":      "0",
            "cooldown_until": "0",
            "last_reason":    "OK",
            "last_updated":   str(time.time()),
        }
        await self._hmset(key, update)
        # Keep CLOSED state in Redis with a short TTL to avoid stale keys
        await self._expire(key, DEFAULT_FAILURE_TTL)

    # ── Failure recording ─────────────────────────────────────────────────────

    async def record_failure(
        self, task: "TaskType | str", model_id: str, error: Exception
    ) -> tuple[ErrorClass, Optional[float]]:
        """
        Record a failure and apply the appropriate CB strategy.

        Returns:
            (error_class, retry_after_seconds)
            retry_after_seconds is non-None only for RPM/TPM errors where the
            caller should wait and retry the SAME model before moving on.
        """
        classified = classify_error(error)
        ec         = classified.error_class
        ra         = classified.retry_after

        key = self._key(task, model_id)
        raw = await self._hgetall(key) or {}
        failure_count = int(raw.get("failure_count", 0)) + 1

        logger.warning(
            "CircuitBreaker: %s:%s failure #%d — %s | %s",
            task, model_id, failure_count, ec.value,
            classified.raw_message[:120],
        )

        if ec == ErrorClass.RPD_EXHAUSTED:
            cooldown = self.rpd_cooldown
            await self._open(key, ec, cooldown, failure_count)
            logger.warning(
                "CircuitBreaker: %s:%s RPD EXHAUSTED → OPEN for %.0fh",
                task, model_id, cooldown / 3600,
            )

        elif ec == ErrorClass.SERVICE_DOWN:
            cooldown = self.service_cooldown
            await self._open(key, ec, cooldown, failure_count)
            logger.warning(
                "CircuitBreaker: %s:%s SERVICE DOWN → OPEN for %.0fs",
                task, model_id, cooldown,
            )

        elif ec in (ErrorClass.RPM_EXHAUSTED, ErrorClass.TPM_EXHAUSTED):
            # Soft failure — update counter but don't OPEN unless threshold met
            update = {
                "failure_count": str(failure_count),
                "last_reason":   ec.value,
                "last_updated":  str(time.time()),
                "state":         raw.get("state", CBState.CLOSED.value),
                "opened_at":     raw.get("opened_at", "0"),
                "cooldown_until": raw.get("cooldown_until", "0"),
            }
            await self._hmset(key, update)
            await self._expire(key, DEFAULT_FAILURE_TTL)
            # Return retry_after so caller waits before retrying same model
            return ec, ra

        else:  # TRANSIENT
            if failure_count >= self.failure_threshold:
                await self._open(key, ec, self.service_cooldown, failure_count)
                logger.warning(
                    "CircuitBreaker: %s:%s TRANSIENT threshold reached → OPEN",
                    task, model_id,
                )
            else:
                update = {
                    "failure_count": str(failure_count),
                    "last_reason":   ec.value,
                    "last_updated":  str(time.time()),
                    "state":         CBState.CLOSED.value,
                    "opened_at":     "0",
                    "cooldown_until": "0",
                }
                await self._hmset(key, update)
                await self._expire(key, DEFAULT_FAILURE_TTL)

        return ec, None  # no retry for hard failures

    # ── Force open (external callers) ─────────────────────────────────────────

    async def force_open(
        self, task: "TaskType | str", model_id: str, cooldown_seconds: float
    ) -> None:
        """Manually trip a CB open (e.g., from model_bridge on known-bad response)."""
        key = self._key(task, model_id)
        raw = await self._hgetall(key) or {}
        failure_count = int(raw.get("failure_count", 0))
        await self._open(key, ErrorClass.TRANSIENT, cooldown_seconds, failure_count)

    # ── Diagnostics ───────────────────────────────────────────────────────────

    async def status_all(self) -> list[dict]:
        """Return a summary of all CB states for the /health endpoint."""
        results = []
        if self._redis:
            try:
                keys = await self._redis.keys(f"{CB_KEY_PREFIX}:*")
                for key in keys:
                    raw = await self._redis.hgetall(key)
                    results.append({"key": key, **raw})
            except Exception:
                pass
        else:
            for key, raw in self._local.items():
                results.append({"key": key, **raw})
        return results

    # ── Internal helpers ──────────────────────────────────────────────────────

    async def _open(
        self, key: str, reason: ErrorClass, cooldown: float, failure_count: int
    ) -> None:
        now    = time.time()
        update = {
            "state":          CBState.OPEN.value,
            "failure_count":  str(failure_count),
            "opened_at":      str(now),
            "cooldown_until": str(now + cooldown),
            "last_reason":    reason.value,
            "last_updated":   str(now),
        }
        await self._hmset(key, update)
        # Keep OPEN keys alive in Redis well beyond the cooldown
        await self._expire(key, int(cooldown) + DEFAULT_FAILURE_TTL)

    async def _transition(
        self, task: "TaskType | str", model_id: str,
        new_state: CBState, raw: dict
    ) -> None:
        key    = self._key(task, model_id)
        update = {**raw, "state": new_state.value, "last_updated": str(time.time())}
        await self._hmset(key, update)

    # ── Redis / local-dict abstraction ────────────────────────────────────────

    async def _hgetall(self, key: str) -> dict:
        if self._redis:
            try:
                return await self._redis.hgetall(key) or {}
            except Exception as e:
                logger.debug("CircuitBreaker Redis read error: %s", e)
        return self._local.get(key, {})

    async def _hmset(self, key: str, mapping: dict) -> None:
        if self._redis:
            try:
                await self._redis.hset(key, mapping=mapping)
                return
            except Exception as e:
                logger.debug("CircuitBreaker Redis write error: %s", e)
        self._local[key] = {**self._local.get(key, {}), **mapping}

    async def _expire(self, key: str, ttl: int) -> None:
        if self._redis:
            try:
                await self._redis.expire(key, ttl)
            except Exception:
                pass