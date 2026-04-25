"""
@file hyde.py
@description HyDE — Hypothetical Document Embeddings (Gao et al., 2022) v1.0. Upgraded for CoT and Sovereign Edge Node resilience.
@layer Core Logic
@dependencies numpy, logging, pathlib, typing, re
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import TYPE_CHECKING, Optional

import numpy as np

if TYPE_CHECKING:
    from infrastructure.llm.bridge import OmniModelBridge

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# DOMAIN DETECTION — keyword heuristic, zero API calls
# ─────────────────────────────────────────────────────────────────────────────

_MATH_KW = frozenset({
    "integral", "derivative", "equation", "matrix", "vector", "theorem",
    "proof", "formula", "calculus", "algebra", "topology", "norm", "eigenvalue",
    "differential", "fourier", "laplace", "probability", "statistics", "linear",
    "polynomial", "convergence", "divergence", "gradient", "hessian",
    "∫", "∑", "∂", "∇", "∞", "≤", "≥", "±", "π", "σ", "μ", "λ",
    "\\frac", "\\sum", "\\int", "\\partial", "\\nabla", "\\infty",
    "manifold", "eigenvalue", "eigenvector", "determinant", "orthogonal",
})

_BIOLOGY_KW = frozenset({
    "cell", "protein", "dna", "rna", "gene", "enzyme", "membrane", "nucleus",
    "mitosis", "meiosis", "photosynthesis", "metabolism", "atp", "organism",
    "evolution", "bacteria", "virus", "antibody", "receptor", "pathway",
    "transcription", "translation", "ribosome", "chromosome", "amino acid",
    "neuron", "synapse", "homeostasis", "phenotype", "genotype", "ecology",
    "osmosis", "diffusion", "mitochondria", "chloroplast", "respiration",
    "oxidative", "phosphorylation", "krebs", "glycolysis", "insulin",
    "hormone", "cytoplasm", "nucleotide", "peptide", "lipid", "carbohydrate",
    "eukaryote", "prokaryote", "organelle", "endoplasmic", "golgi",
})

_CODE_KW = frozenset({
    "algorithm", "function", "class", "implement", "code", "program", "loop",
    "recursion", "complexity", "big-o", "data structure", "array", "tree",
    "graph", "sort", "search", "python", "java", "c++", "compiler",
    "runtime", "memory", "pointer", "object", "inheritance", "api",
    "database", "query", "sql", "network", "protocol", "thread", "async",
    "binary", "heap", "queue", "stack", "linked list", "hash", "dynamic",
    "greedy", "divide and conquer", "backtracking", "memoization", "cache",
    "time complexity", "space complexity", "turing", "automata", "regex",
})


def detect_domain(query: str) -> str:
    """
    Keyword-based domain classifier.  Zero API calls, <1ms latency.

    Returns one of: "MATH", "BIOLOGY", "CODE", "TEXT"
    Exported for use by FusionEngine domain-aware synthesis.
    """
    q = query.lower()
    math_score = sum(1 for kw in _MATH_KW     if kw in q)
    bio_score  = sum(1 for kw in _BIOLOGY_KW  if kw in q)
    code_score = sum(1 for kw in _CODE_KW     if kw in q)

    best = max(math_score, bio_score, code_score)
    if best == 0:
        return "TEXT"

    if math_score == best:
        return "MATH"
    if bio_score  == best:
        return "BIOLOGY"
    return "CODE"


# ─────────────────────────────────────────────────────────────────────────────
# DOMAIN-AWARE PROMPT TEMPLATES — embedded defaults (CoT UPGRADED)
# ─────────────────────────────────────────────────────────────────────────────

_EMBEDDED_PROMPTS: dict[str, str] = {
    "MATH": (
        "You are a graduate-level mathematics textbook author.\n"
        "Write a precise, self-contained textbook excerpt (3-5 sentences) that "
        "directly explains or proves the mathematical concept in the question.\n"
        "Rules:\n"
        "1. You MUST open with <think> to plan the excerpt.</think>\n"
        "2. Output ONLY the textbook excerpt after the think block.\n"
        "3. Use formal mathematical notation and LaTeX where appropriate.\n"
        "Question: {query}\n"
    ),
    "BIOLOGY": (
        "You are a molecular and cellular biology textbook author.\n"
        "Write a precise, self-contained textbook excerpt (3-5 sentences) that "
        "directly describes the biological mechanism in the question.\n"
        "Rules:\n"
        "1. You MUST open with <think> to plan the excerpt.</think>\n"
        "2. Output ONLY the textbook excerpt after the think block.\n"
        "3. Use correct IUPAC and scientific terminology.\n"
        "Question: {query}\n"
    ),
    "CODE": (
        "You are a computer science and algorithms textbook author.\n"
        "Write a precise, self-contained textbook excerpt (3-5 sentences) that "
        "directly explains the algorithm or data structure in the question.\n"
        "Rules:\n"
        "1. You MUST open with <think> to plan the excerpt.</think>\n"
        "2. Output ONLY the textbook excerpt after the think block.\n"
        "3. State time/space complexity (Big-O) where relevant.\n"
        "Question: {query}\n"
    ),
    "TEXT": (
        "You are an authoritative academic textbook author.\n"
        "Write a precise, self-contained textbook excerpt (3-5 sentences) that "
        "directly answers or explains the concept in the question.\n"
        "Rules:\n"
        "1. You MUST open with <think> to plan the excerpt.</think>\n"
        "2. Output ONLY the textbook excerpt after the think block.\n"
        "3. Be factual, concise, and use domain-appropriate terminology.\n"
        "Question: {query}\n"
    ),
}

_PROMPT_FILES: dict[str, str] = {
    "MATH":    "hyde_math",
    "BIOLOGY": "hyde_biology",
    "CODE":    "hyde_code",
    "TEXT":    "hyde_text",
}

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "domain" / "prompts"


def _load_prompt(domain: str) -> str:
    """Load prompt from .md file if present; fall back to embedded default."""
    fname = _PROMPT_FILES.get(domain, "hyde_text")
    path  = _PROMPTS_DIR / f"{fname}.md"
    try:
        text = path.read_text(encoding="utf-8").strip()
        if text:
            logger.debug("HyDE: loaded prompt from %s.md", fname)
            return text
    except FileNotFoundError:
        pass
    except Exception as exc:
        logger.warning("HyDE: error reading %s.md: %s", fname, exc)
    return _EMBEDDED_PROMPTS.get(domain, _EMBEDDED_PROMPTS["TEXT"])


# ══════════════════════════════════════════════════════════════════════════════
class HyDEService:
    """
    Hypothetical Document Embeddings service.
    """

    def __init__(self, bridge: "OmniModelBridge") -> None:
        self._bridge = bridge

    async def generate(
        self,
        query:  str,
        domain: Optional[str] = None,
    ) -> tuple[str, str, Optional[np.ndarray]]:
        """
        Generate a hypothetical textbook excerpt and its embedding.
        """
        detected_domain = domain or detect_domain(query)
        prompt_template = _load_prompt(detected_domain)
        prompt          = prompt_template.format(query=query)

        try:
            from infrastructure.config_manager import TaskType

            raw_text = await self._bridge.router.route_call(
                prompt_parts       = [prompt],
                system_instruction = (
                    "You are an academic textbook author. You must use <think> tags to plan. "
                    "Output ONLY the hypothetical textbook passage after the tags — no preamble."
                ),
                task       = TaskType.QUERY_SYNTHESIS,
                force_json = False,
            )
            
            # SOTA FIX: Globally strip CoT blocks to prevent ColBERT space corruption
            hypo_text = re.sub(r'<think>(.*?)(?:</think>|$)', '', raw_text, flags=re.DOTALL).strip()

            if not hypo_text or len(hypo_text) < 20:
                logger.warning(
                    "HyDE [%s]: Empty hypothesis for '%s...'. "
                    "Falling back to query embedding.",
                    detected_domain, query[:60],
                )
                return "", detected_domain, None

            logger.info(
                "HyDE [%s]: Generated %d-char hypothesis for '%s...'",
                detected_domain, len(hypo_text), query[:60],
            )

            matrices = await self._bridge.local_embedding_func([hypo_text])
            if matrices and isinstance(matrices[0], np.ndarray):
                return hypo_text, detected_domain, matrices[0]

            return hypo_text, detected_domain, None

        except Exception as exc:
            logger.warning(
                "HyDE [%s]: Failed for '%s...': %s.  Using original query.",
                detected_domain, query[:60], exc,
            )
            return "", detected_domain, None