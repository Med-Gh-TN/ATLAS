"""
src/infrastructure/llm/prompts.py
════════════════════════════════════════════════════════════════════════════════
Omni-Architect: Prompt Management Layer (v8.0 — Qwen3-VL Zero-Shot SOTA)
────────────────────────────────────────────────────────────────────────────────
Changelog v8.0
──────────────
• [SOTA-QWEN] Completely purged all RLHF <think> tags from embedded fallbacks.
• Enforced strict, declarative JSON/Mermaid schemas across all domain tasks.
• Re-aligned for instruction-tuned zero-shot execution.
"""
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class PromptLoader:
    """
    Loads prompt templates from src/domain/prompts/*.md at startup.
    Falls back to embedded SOTA zero-shot defaults to prevent schema regressions.
    """
    _PROMPTS_DIR = Path(__file__).resolve().parent.parent.parent / "domain" / "prompts"

    _DEFAULTS: dict[str, str] = {
        # ── Core RAG Prompts ────────────────────────────────────────────────
        "vision_extract": (
            "You are a multimodal document analysis expert for academic research. "
            "Analyse the provided image and extract ALL visual information exhaustively.\n\n"
            "## EXTRACTION RULES\n"
            "1. Read table column headers left-to-right, then row headers top-to-bottom.\n"
            "2. For graphs/charts, extract the X-axis and Y-axis limits, labels, and overarching trends.\n"
            "3. Identify all key textual and visual entities.\n\n"
            "## OUTPUT FORMAT — STRICTLY ENFORCED\n"
            "Respond with ONLY a raw, valid JSON object. No markdown fences. No preamble.\n"
            "{\n"
            '  "content_type": "IMAGE | TABLE | CHART | DIAGRAM",\n'
            '  "detailed_description": "string",\n'
            '  "entity_info": {\n'
            '    "entity_name": "string",\n'
            '    "entity_type": "string",\n'
            '    "summary": "string"\n'
            "  }\n"
            "}"
        ),
        
        "entity_extract": (
            "You are an expert Knowledge Graph extraction engine for academic scientific documents.\n\n"
            "## Anti-Hallucination Rules (NON-NEGOTIABLE)\n"
            "1. Extract ONLY entities and relationships explicitly stated in the text.\n"
            "2. Do NOT infer or extrapolate.\n"
            "3. Escape all internal quotation marks properly to ensure strict JSON validity.\n\n"
            "## Entity Extraction Guidelines\n"
            "- Node IDs MUST be ATOMIC NOUNS (max 1 to 3 words). NEVER use full sentences.\n"
            "- Valid node types: CONCEPT, METHOD, MODEL, DATASET, METRIC, TOOL, PERSON, INSTITUTION.\n\n"
            "## Output Schema\n"
            "You MUST return a valid JSON object with EXACTLY this schema. No markdown fences. No preamble.\n"
            "{\n"
            '  "nodes": [\n'
            '    {"id": "Atomic Name", "type": "TYPE", "description": "Detailed definition extracted..."}\n'
            "  ],\n"
            '  "relationships": [\n'
            '    {"source_id": "Name 1", "target_id": "Name 2", "type": "RELATION_TYPE", "explanation": "...", "weight": 1.0}\n'
            "  ]\n"
            "}"
        ),
        
        "query_router": (
            "You are the Master Router for an academic Hybrid RAG system.\n"
            "Directive: Classify the incoming query into EXACTLY ONE retrieval strategy.\n"
            "Output Constraint: Respond with ONLY the single word `GRAPH` or `VECTOR`. No punctuation, no explanation.\n\n"
            "Route -> GRAPH: conceptual questions, summaries, definitions, relationships, explanations.\n"
            "Route -> VECTOR: precise facts, specific values, code snippets, formulas, table data."
        ),
        
        "synthesis": (
            "You are an expert academic research assistant.\n"
            "Your singular directive: Generate precise, structured answers grounded EXCLUSIVELY in the retrieved context.\n\n"
            "1. ZERO HALLUCINATION: Do not use external world knowledge.\n"
            "2. EXACT FIDELITY: Reproduce LaTeX, math symbols, and code snippets verbatim.\n"
            "3. NO PREAMBLE: Answer directly. Never say 'Based on the context'."
        ),

        # ── SOTA: Domain-Aware HyDE Prompts ─────────────────────────────────
        "hyde_math": (
            "You are a graduate-level Mathematics textbook author. "
            "Write a precise, self-contained textbook excerpt (3-5 sentences) that directly explains the concept in the question. "
            "Use formal LaTeX notation. Output ONLY the textbook excerpt — no preamble, no meta-references."
        ),
        "hyde_biology": (
            "You are a molecular and cellular biology textbook author. "
            "Write a precise, self-contained textbook excerpt (3-5 sentences) that explains the mechanism in the question. "
            "Use correct IUPAC terminology. Output ONLY the textbook excerpt — no preamble, no meta-references."
        ),
        "hyde_code": (
            "You are a Computer Science algorithms textbook author. "
            "Write a precise, self-contained textbook excerpt (3-5 sentences) explaining the algorithm in the question. "
            "State time/space complexity (Big-O). Output ONLY the textbook excerpt — no preamble, no meta-references."
        ),
        "hyde_text": (
            "You are an authoritative academic textbook author. "
            "Write a precise, self-contained textbook excerpt (3-5 sentences) explaining the concept in the question. "
            "Be factual and concise. Output ONLY the textbook excerpt — no preamble, no meta-references."
        ),
        "query_decomposition": (
            "You are an expert academic research router.\n"
            "Analyze the user's question. If it is a complex, multi-part, or comparative question, "
            "break it down into an array of 2 to 4 atomic, independent sub-queries.\n"
            "If the question is already atomic/simple, output the original question as a single-element array.\n\n"
            "CRITICAL: Output ONLY a valid JSON array of strings. No markdown fences, no preamble."
        ),

        # ── v7.1: Academic Asset Generation Prompts ──────────────────────────
        "flashcard_gen": (
            "You are an expert academic curriculum designer specializing in spaced-repetition learning systems. "
            "Transform the provided document into a set of 15-28 high-quality digital flashcards.\n\n"
            "RULES:\n"
            "1. FRONT: A single, atomic, testable prompt. Max 25 words.\n"
            "2. BACK: A complete, self-contained answer. Max 90 words.\n"
            "3. Cover RECALL, COMPREHENSION, and APPLICATION levels.\n"
            "4. Wrap LaTeX in $...$ for inline math.\n\n"
            "OUTPUT FORMAT: Respond with ONLY a valid JSON array. No markdown fences. No preamble.\n"
            'Schema: [{"front": "string", "back": "string"}]'
        ),
        "mindmap_gen": (
            "You are an expert academic knowledge architect specializing in visual learning. "
            "Transform the provided document into a comprehensive Mermaid.js mindmap.\n\n"
            "RULES:\n"
            "1. Root node in double parentheses: root((Topic)).\n"
            "2. 4 to 7 first-level branches.\n"
            "3. Node labels must be concise (max 7 words) with NO special characters.\n"
            "4. Do NOT hallucinate external knowledge.\n\n"
            "OUTPUT FORMAT: Respond with ONLY raw Mermaid.js syntax. No markdown fences. Start with: mindmap"
        ),
        "exam_gen": (
            "You are an expert academic examiner. Transform the provided document into a rigorous exam.\n\n"
            "RULES:\n"
            "1. 5 MCQs (4 options, 1 correct answer, with explanation).\n"
            "2. 3 Written questions (requiring synthesis, with model answer).\n"
            "3. Extract ONLY from the provided document context.\n\n"
            "OUTPUT FORMAT: Respond with ONLY a valid JSON object. No markdown fences. No preamble.\n"
            "Schema:\n"
            "{\n"
            '  "mcq": [{"question": "...", "options": {"A": "", "B": "", "C": "", "D": ""}, "answer": "A", "explanation": "..."}],\n'
            '  "written": [{"question": "...", "model_answer": "..."}]\n'
            "}"
        ),
        "summary_gen": (
            "You are an expert academic analyst. Distill the document into a highly structured executive summary.\n\n"
            "RULES:\n"
            "1. Extract ONLY facts explicitly present in the document.\n"
            "2. Ensure exact JSON schema compliance.\n\n"
            "OUTPUT FORMAT (CRITICAL):\n"
            "Respond with ONLY a raw, valid JSON object. No markdown fences. No preamble.\n"
            "DO NOT wrap the JSON in any parent object (root MUST start with 'overview').\n"
            'Schema:\n'
            "{\n"
            '  "overview": "string",\n'
            '  "key_concepts": ["string"],\n'
            '  "conclusion": "string"\n'
            "}"
        ),
    }

    def __init__(self) -> None:
        self._cache: dict[str, str] = {}
        self._load_all()

    def _load_all(self) -> None:
        for name in self._DEFAULTS:
            path = self._PROMPTS_DIR / f"{name}.md"
            try:
                text = path.read_text(encoding="utf-8").strip()
                self._cache[name] = text
                logger.info("PromptLoader: loaded %s.md (%d chars)", name, len(text))
            except FileNotFoundError:
                self._cache[name] = self._DEFAULTS[name]
                logger.debug(
                    "PromptLoader: %s.md not found — using embedded safe default.", name
                )
            except Exception as e:
                self._cache[name] = self._DEFAULTS[name]
                logger.error("PromptLoader: failed to load %s.md: %s", name, e)

    def get(self, name: str) -> str:
        return self._cache.get(name, self._DEFAULTS.get(name, ""))

    def reload(self) -> None:
        self._cache.clear()
        self._load_all()
        logger.info("PromptLoader: all prompts reloaded via hot-swap.")