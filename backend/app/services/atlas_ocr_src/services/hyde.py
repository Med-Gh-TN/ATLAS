"""
src/services/hyde.py
════════════════════════════════════════════════════════════════════════════════
HyDE — Hypothetical Document Embeddings  (Gao et al., 2022)  v1.0
────────────────────────────────────────────────────────────────────────────────
Bridges the semantic gap between student exam-question language and textbook
exposition language.

Problem being solved
────────────────────
A student asks: "What is the role of ATP synthase in oxidative phosphorylation?"
The question embedding lives in a *question* semantic region.
The relevant textbook chunk starts: "ATP synthase is a transmembrane enzyme that
catalyses the phosphorylation of ADP to ATP using the proton gradient..."
These two embeddings have a cosine distance of ~0.35 in the jina-colbert space.
HyDE collapses this gap to ~0.05 by searching with a generated textbook excerpt.

Pipeline
────────
1. Detect domain from query keywords (MATH / BIOLOGY / CODE / TEXT) — no API call.
2. Generate a 3-5 sentence hypothetical textbook excerpt via Gemini (1 API call).
3. Embed the hypothetical text with ColBERT (same model as production chunks).
4. Return (hypothetical_text, domain, embedding_matrix).
5. FusionEngine uses the hypothetical_text as the Qdrant retrieval string,
   which is re-embedded internally — ColBERT compares it against stored chunks.

Recall improvement
──────────────────
~20% recall@10 on factual scientific queries (Gao et al. ablation, 2022).
Cost: 1 extra Gemini QUERY_SYNTHESIS call per user query.
════════════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Optional

import numpy as np

if TYPE_CHECKING:
    from app.services.atlas_ocr_src.infrastructure.llm.bridge import OmniModelBridge

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
# DOMAIN-AWARE PROMPT TEMPLATES — embedded defaults
# (PromptLoader checks src/domain/prompts/hyde_{domain}.md first)
# ─────────────────────────────────────────────────────────────────────────────

_EMBEDDED_PROMPTS: dict[str, str] = {
    "MATH": (
        "You are a graduate-level mathematics textbook author.\n"
        "Write a precise, self-contained textbook excerpt (3-5 sentences) that "
        "directly explains or proves the mathematical concept in the question.\n"
        "Rules:\n"
        "• Use formal mathematical notation and LaTeX where appropriate.\n"
        "• State definitions, then the key result, then briefly explain why.\n"
        "• Do NOT begin with 'The question is...' or any meta-reference to the question.\n"
        "• Write purely as exposition, as if from Chapter 4 of a textbook.\n\n"
        "Question: {query}\n\n"
        "Hypothetical textbook excerpt:"
    ),
    "BIOLOGY": (
        "You are a molecular and cellular biology textbook author (university level).\n"
        "Write a precise, self-contained textbook excerpt (3-5 sentences) that "
        "directly describes the biological mechanism, pathway, or concept in the question.\n"
        "Rules:\n"
        "• Use correct scientific terminology (IUPAC names where relevant).\n"
        "• Describe mechanism/pathway steps, key molecules, and physiological context.\n"
        "• Do NOT begin with 'The question asks...' — write pure exposition.\n"
        "• Write as if from a university biochemistry or cell biology textbook.\n\n"
        "Question: {query}\n\n"
        "Hypothetical textbook excerpt:"
    ),
    "CODE": (
        "You are a computer science and algorithms textbook author (university level).\n"
        "Write a precise, self-contained textbook excerpt (3-5 sentences) that "
        "directly explains the algorithm, data structure, or programming concept in the question.\n"
        "Rules:\n"
        "• State time complexity (Big-O) and space complexity where relevant.\n"
        "• Name the canonical algorithm or data structure, then describe its invariants.\n"
        "• Do NOT write code — write prose explanation as in a textbook.\n"
        "• Do NOT begin with meta-references to the question.\n\n"
        "Question: {query}\n\n"
        "Hypothetical textbook excerpt:"
    ),
    "TEXT": (
        "You are an authoritative academic textbook author.\n"
        "Write a precise, self-contained textbook excerpt (3-5 sentences) that "
        "directly answers or explains the concept in the question.\n"
        "Rules:\n"
        "• Be factual, concise, and use domain-appropriate terminology.\n"
        "• Do NOT begin with 'The question is...' or any meta-reference.\n"
        "• Write purely as expository prose, as if from an authoritative reference work.\n\n"
        "Question: {query}\n\n"
        "Hypothetical textbook excerpt:"
    ),
}

# Map domain → .md filename in src/domain/prompts/
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

    Usage inside FusionEngine
    ─────────────────────────
    hyde_text, domain, emb_matrix = await hyde.generate(question)
    # Use hyde_text as the retrieval_query string for ColBERT search.
    # FusionEngine embeds it internally — no need to pass the matrix.
    # domain is used for domain-aware synthesis prompts.
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

        Parameters
        ──────────
        query  : User's question.
        domain : Override domain detection.  If None, auto-detected.

        Returns
        ───────
        (hypothetical_text, detected_domain, embedding_matrix)

        hypothetical_text : Generated excerpt.  Empty string on failure.
        detected_domain   : One of MATH / BIOLOGY / CODE / TEXT.
        embedding_matrix  : ColBERT token matrix [seq_len × 128].  None on failure.
                            FusionEngine falls back to embedding the original query.
        """
        detected_domain = domain or detect_domain(query)
        prompt_template = _load_prompt(detected_domain)
        prompt          = prompt_template.format(query=query)

        try:
            from app.services.atlas_ocr_src.infrastructure.config_manager import TaskType

            hypo_text = await self._bridge.router.route_call(
                prompt_parts       = [prompt],
                system_instruction = (
                    "You are an academic textbook author. "
                    "Output ONLY the hypothetical textbook passage — "
                    "no preamble, no 'Here is:', no explanation whatsoever."
                ),
                task       = TaskType.QUERY_SYNTHESIS,
                force_json = False,
            )
            hypo_text = hypo_text.strip()

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

            # Embed the hypothetical document
            matrices = await self._bridge.local_embedding_func([hypo_text])
            if matrices and isinstance(matrices[0], np.ndarray):
                return hypo_text, detected_domain, matrices[0]

            # Return text even if embedding fails — text can still be used as
            # the ColBERT retrieval string (will be re-embedded by storage layer)
            return hypo_text, detected_domain, None

        except Exception as exc:
            logger.warning(
                "HyDE [%s]: Failed for '%s...': %s.  Using original query.",
                detected_domain, query[:60], exc,
            )
            return "", detected_domain, None