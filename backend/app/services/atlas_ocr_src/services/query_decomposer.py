"""
src/services/query_decomposer.py
════════════════════════════════════════════════════════════════════════════════
LLM-Powered Multi-Hop Query Decomposer  (v1.0)
────────────────────────────────────────────────────────────────────────────────
Breaks complex multi-part exam questions into atomic sub-queries for
parallel retrieval and better recall on comparative/analytical questions.

Problem being solved
────────────────────
"Compare the structure of prokaryotic and eukaryotic cells and explain how
this affects metabolic efficiency" is a 3-part question.  A single-shot
ColBERT retrieval with this string returns a mishmash of partially relevant
chunks.  Decomposed into 3 atomic queries, each retrieval is precise.

Pipeline
────────
1. Heuristic fast-path: if query is short or contains no multi-part signals,
   return [original_query] immediately — no API call.
2. LLM decomposition: send query to Gemini QUERY_ROUTER task (fast, cheap).
   Parse the JSON array response.
3. Validate: ensure all items are non-empty strings, cap at 4 sub-queries.
4. Return list of atomic sub-queries.

Cost
────
1 Gemini QUERY_ROUTER call per query that passes the heuristic.
Estimated: ~30% of all queries are complex enough to decompose.
════════════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import json
import logging
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.atlas_ocr_src.infrastructure.llm.bridge import OmniModelBridge

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# HEURISTIC FAST-PATH
# ─────────────────────────────────────────────────────────────────────────────

_MULTI_PART_PATTERNS: list[str] = [
    r"\bcompare\b",
    r"\bcontrast\b",
    r"\bdifference[s]? between\b",
    r"\bsimilarities.{0,30}differences\b",
    r"\bhow does.{0,60}\baffect\b",
    r"\btrace.{0,60}from.{0,30}to\b",
    r"\badvantages.{0,30}disadvantages\b",
    r"\bpros.{0,30}cons\b",
    r"\bexplain.{0,30}and.{0,30}(describe|analyse|analyze)\b",
    r"\bwhat.{0,30}and.{0,30}(why|how)\b",
    r"\b(first|step 1).{0,60}\b(then|step 2)\b",
    r"\b(describe|explain|discuss)\b.{0,40}\b(and|as well as|in addition|also)\b.{0,40}\b(describe|explain|discuss)\b",
    r"\b(list|enumerate).{0,40}\b(and|also)\b",
    r"\bderive.{0,50}\band\b.{0,50}\bexplain\b",
    r"\b\w+.{0,10},\s*\w+.{0,10},?\s*and\s*\w+\b",  # "A, B, and C" enumeration
]

_MULTI_RE = re.compile(
    "|".join(_MULTI_PART_PATTERNS),
    re.IGNORECASE,
)

_MIN_WORDS_FOR_DECOMP = 8  # Very short queries cannot be multi-part
_MAX_SUB_QUERIES      = 4  # API budget guard


# ─────────────────────────────────────────────────────────────────────────────
# DECOMPOSITION PROMPT
# ─────────────────────────────────────────────────────────────────────────────

_DECOMP_SYSTEM = (
    "You are a query decomposition engine for an academic RAG system. "
    "Output ONLY a valid JSON array of strings. "
    "No markdown, no explanation, no preamble, no trailing text."
)

_DECOMP_PROMPT = """\
Task: Break the following academic question into 2-4 atomic, self-contained sub-queries.

Rules:
- Each sub-query must target exactly ONE concept, fact, mechanism, or comparison.
- Each sub-query must be answerable independently from a textbook.
- If the question is already atomic (single concept, single fact), return it unchanged as a one-element array.
- Do NOT split a question that has a single answer into multiple questions.
- Output ONLY a JSON array of strings.  Example: ["sub-query 1", "sub-query 2"]

Examples:
Input: "Compare the structure of prokaryotic and eukaryotic cells and explain how this affects metabolic efficiency"
Output: ["What is the structural organisation of prokaryotic cells?", "What is the structural organisation of eukaryotic cells?", "How does prokaryotic cell structure affect metabolic efficiency?", "How does eukaryotic cell structure affect metabolic efficiency?"]

Input: "Derive the Navier-Stokes equation from first principles and explain each term's physical meaning"
Output: ["What are the physical principles and conservation laws used to derive the Navier-Stokes equation?", "What is the step-by-step derivation of the Navier-Stokes equation?", "What is the physical meaning of each term in the Navier-Stokes equation?"]

Input: "What is the role of ATP synthase in oxidative phosphorylation?"
Output: ["What is the role of ATP synthase in oxidative phosphorylation?"]

Question: {query}
Output (JSON array only):"""


# ══════════════════════════════════════════════════════════════════════════════
class QueryDecomposer:
    """
    LLM-powered query decomposer for multi-part academic questions.

    Public interface
    ────────────────
    sub_queries = await decomposer.decompose(question)
    # Returns list[str] — always at least [original_question].
    """

    def __init__(self, bridge: "OmniModelBridge") -> None:
        self._bridge = bridge

    # ─────────────────────────────────────────────────────────────────────
    # HEURISTIC GATE
    # ─────────────────────────────────────────────────────────────────────

    def is_complex(self, query: str) -> bool:
        """
        Fast heuristic to determine if decomposition is warranted.
        Returns False for short or clearly atomic queries to skip the API call.
        """
        words = query.split()
        if len(words) < _MIN_WORDS_FOR_DECOMP:
            return False
        return bool(_MULTI_RE.search(query))

    # ─────────────────────────────────────────────────────────────────────
    # DECOMPOSITION
    # ─────────────────────────────────────────────────────────────────────

    async def decompose(self, query: str) -> list[str]:
        """
        Decompose a complex query into atomic sub-queries.

        Behaviour
        ─────────
        • Simple queries (heuristic gate): returns [query] immediately.
        • Complex queries: calls Gemini QUERY_ROUTER → parses JSON array.
        • Any parse/API error: returns [query] as safe fallback.
        • Result is always capped at MAX_SUB_QUERIES (4).

        Returns
        ───────
        list[str] — at least one element (the original query).
        """
        if not self.is_complex(query):
            logger.debug(
                "QueryDecomposer: atomic query — skipping decomposition. '%s...'",
                query[:60],
            )
            return [query]

        prompt = _DECOMP_PROMPT.format(query=query)

        try:
            from app.services.atlas_ocr_src.infrastructure.config_manager import TaskType

            raw = await self._bridge.router.route_call(
                prompt_parts       = [prompt],
                system_instruction = _DECOMP_SYSTEM,
                task               = TaskType.QUERY_ROUTER,
                force_json         = False,
            )

            raw = raw.strip()
            # Strip markdown code fences if the model wraps output
            raw = re.sub(r"^```[a-z]*\n?", "", raw)
            raw = re.sub(r"\n?```$",       "", raw.strip())

            parsed = json.loads(raw)

            if not isinstance(parsed, list):
                raise ValueError(f"Expected JSON list, got {type(parsed).__name__}")

            valid: list[str] = [
                q.strip()
                for q in parsed
                if isinstance(q, str) and q.strip()
            ]

            if not valid:
                raise ValueError("Decomposition returned empty list")

            valid = valid[:_MAX_SUB_QUERIES]

            logger.info(
                "QueryDecomposer: '%s...' → %d sub-queries: %s",
                query[:60], len(valid),
                [q[:50] for q in valid],
            )
            return valid

        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning(
                "QueryDecomposer: parse error for '%s...': %s.  "
                "Using original query.",
                query[:60], exc,
            )
        except Exception as exc:
            logger.warning(
                "QueryDecomposer: API error for '%s...': %s.  "
                "Using original query.",
                query[:60], exc,
            )

        return [query]