"""
src/infrastructure/llm/prompts.py
════════════════════════════════════════════════════════════════════════════════
Omni-Architect: Prompt Management Layer (v7.1 — Academic Asset Prompts)
────────────────────────────────────────────────────────────────────────────────
Changelog v7.1
──────────────
• Added embedded default for: summary_gen.
• Summary prompt SOTA constraint: Explicitly forbids nested root keys to guarantee
  Pydantic compliance (prevents {"summary": {"overview": ...}} hallucination).
"""
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class PromptLoader:
    """
    Loads prompt templates from src/domain/prompts/*.md at startup.
    Falls back to embedded SOTA defaults to prevent hallucination regressions.
    """
    _PROMPTS_DIR = Path(__file__).resolve().parent.parent.parent / "domain" / "prompts"

    _DEFAULTS: dict[str, str] = {
        # ── Core RAG Prompts (unchanged) ────────────────────────────────────
        "vision_extract": (
            "You are a multimodal document analysis expert for academic research. "
            "Analyse the provided image and extract ALL visual information exhaustively. "
            "CRITICAL: Respond ONLY with valid JSON:\n"
            "{\n"
            '  "content_type": "IMAGE",\n'
            '  "detailed_description": "Exhaustive description of ALL visual elements.",\n'
            '  "entity_info": {\n'
            '    "entity_name": "Unique specific name.",\n'
            '    "entity_type": "diagram | chart | photograph | schema | equation",\n'
            '    "summary": "One sentence summarising the image core content."\n'
            "  }\n"
            "}\n"
            "No extra keys. No omitted keys. No markdown. No preamble."
        ),
        "entity_extract": (
            "You are a Knowledge Graph extraction engine for academic scientific documents.\n"
            "Domain coverage: mathematics, biology, computer science, engineering, physics, "
            "chemistry, statistics, literature.\n\n"
            "## Anti-Hallucination Rules (NON-NEGOTIABLE)\n"
            "1. Extract ONLY entities and relationships explicitly stated in the provided text.\n"
            "2. Do NOT infer, extrapolate, or add any entity not directly supported verbatim.\n"
            "3. If the chunk contains no extractable entities, output nothing.\n"
            "4. NO CONVERSATIONAL FILLER. Output ONLY the TOON tags and data.\n\n"
            "## Entity Extraction Guidelines\n"
            "Extract named entities of these types: CONCEPT, METHOD, MODEL, DATASET, METRIC, "
            "ORGANISM, GENE, CHEMICAL, MATH_OBJECT, TOOL, PERSON, INSTITUTION.\n"
            "CRITICAL: Entity names MUST be concise (1 to 5 words maximum).\n\n"
            "## FORMATTING CONSTRAINTS (CRITICAL)\n"
            "- You MUST use Token-Oriented Object Notation (TOON).\n"
            "- **JSON IS STRICTLY FORBIDDEN.**\n"
            "- Every field separated by exactly this delimiter: <SEP>\n"
            "- Every entity row: exactly 3 fields. Every relationship row: exactly 4 fields."
        ),
        "query_router": (
            "You are the Master Router for an advanced Hybrid RAG system over academic documents. "
            "Respond ONLY with GRAPH or VECTOR — no explanation, no punctuation, nothing else.\n\n"
            "GRAPH: conceptual questions, summaries, definitions, relationships, explanations.\n"
            "VECTOR: precise facts, specific values, code snippets, formulas, table data."
        ),
        "synthesis": (
            "You are an expert academic research assistant providing precise, well-structured "
            "answers grounded EXCLUSIVELY in the retrieved context. "
            "When context is insufficient, state it clearly rather than hallucinating. "
            "Preserve mathematical notation and code formatting exactly as provided. "
            "Cite sources when available."
        ),

        # ── SOTA: Domain-Aware HyDE Prompts ─────────────────────────────────
        "hyde_math": (
            "You are a graduate-level Mathematics Professor. Given the student's question, "
            "generate a hypothetical, highly accurate textbook excerpt (3-5 sentences) that answers it. "
            "Use rigorous mathematical terminology and valid LaTeX notation. "
            "Output ONLY the hypothetical textbook passage — no preamble, no explanation."
        ),
        "hyde_biology": (
            "You are a graduate-level Biology Professor. Given the student's question, "
            "generate a hypothetical, highly accurate textbook excerpt (3-5 sentences) that answers it. "
            "Focus on mechanisms of action, pathways, and precise anatomical/cellular terminology. "
            "Output ONLY the hypothetical textbook passage — no preamble, no explanation."
        ),
        "hyde_code": (
            "You are a graduate-level Computer Science Professor. Given the student's question, "
            "generate a hypothetical, highly accurate textbook excerpt (3-5 sentences) that answers it. "
            "Include technical architecture details and inline pseudo-code where appropriate. "
            "Output ONLY the hypothetical textbook passage — no preamble, no explanation."
        ),
        "hyde_text": (
            "You are a graduate-level Academic Professor. Given the student's question, "
            "generate a hypothetical, highly accurate textbook excerpt (3-5 sentences) that answers it. "
            "Write in an authoritative, academic tone. "
            "Output ONLY the hypothetical textbook passage — no preamble, no explanation."
        ),
        "query_decomposition": (
            "You are an expert academic research router. "
            "Analyze the user's question. If it is a complex, multi-part, or comparative question, "
            "break it down into an array of 2 to 4 atomic, independent sub-queries.\n"
            "If the question is already atomic/simple, output the original question as a single-element array.\n\n"
            "CRITICAL: Output ONLY a valid JSON array of strings. No markdown formatting, no preamble."
        ),

        # ── v7.1: Academic Asset Generation Prompts ──────────────────────────
        "flashcard_gen": (
            "You are an expert academic curriculum designer specializing in spaced-repetition "
            "learning systems (Anki, SuperMemo). Transform the provided document into 15-28 "
            "high-quality flashcards.\n\n"
            "RULES:\n"
            "1. FRONT: single atomic testable prompt, max 25 words (question form).\n"
            "2. BACK: complete self-contained answer, max 90 words.\n"
            "3. Cover: recall, comprehension, and application cognitive levels.\n"
            "4. LaTeX in $...$ delimiters for math.\n"
            "5. NO trivial, redundant, or statement-form fronts.\n"
            "6. Extract ONLY from the provided document — zero hallucination.\n\n"
            "OUTPUT: ONLY a valid JSON array. No markdown. No preamble.\n"
            'Schema: [{"front": "...", "back": "..."}]'
        ),
        "mindmap_gen": (
            "You are an expert academic knowledge architect specializing in visual concept mapping. "
            "Transform the provided document into a comprehensive Mermaid.js mindmap.\n\n"
            "RULES:\n"
            "1. Root node in double parentheses: root((Topic)).\n"
            "2. 4-7 first-level branches (major themes/chapters).\n"
            "3. Each branch: 2-6 leaf nodes with specific concepts.\n"
            "4. Node labels: max 7 words, exact technical terminology.\n"
            "5. No special characters (quotes, colons, brackets) in labels.\n"
            "6. Valid Mermaid.js v10+ mindmap syntax only.\n"
            "7. Extract ONLY from the provided document — zero hallucination.\n\n"
            "OUTPUT: ONLY raw Mermaid.js syntax. Start with: mindmap"
        ),
        "exam_gen": (
            "You are a senior university examination designer (LMD system). "
            "Generate a rigorous exam: exactly 10 MCQ + 5 written questions.\n\n"
            "MCQ RULES:\n"
            "- 4 options: A, B, C, D. Exactly one correct.\n"
            "- Distribution: 3 recall + 4 comprehension + 3 analysis questions.\n"
            "- Distractors: plausible but definitively wrong.\n"
            "- 'answer': exactly 'A', 'B', 'C', or 'D'.\n"
            "- 'explanation': why correct + key error in top distractor (max 70 words).\n\n"
            "WRITTEN RULES:\n"
            "- Types: definition, mechanism, comparison, analysis, application.\n"
            "- 'model_answer': 3-8 sentences, reference quality.\n\n"
            "Extract ONLY from the provided document — zero hallucination.\n\n"
            "OUTPUT: ONLY a valid JSON object. No markdown. No preamble.\n"
            'Schema: {"mcq": [{"question":"","options":{"A":"","B":"","C":"","D":""},'
            '"answer":"A","explanation":""}], "written": [{"question":"","model_answer":""}]}'
        ),
        "summary_gen": (
            "You are an expert academic analyst. Your strict task is to distill the provided document "
            "context into a highly structured, professional executive summary.\n\n"
            "RULES:\n"
            "1. Overview: Write a comprehensive 2-3 paragraph executive summary of the entire document.\n"
            "2. Key Concepts: Extract 5 to 10 of the most critical facts, definitions, or arguments as bullet points.\n"
            "3. Conclusion: Provide a brief final takeaway or the main conclusion of the text.\n\n"
            "ANTI-HALLUCINATION GUARD: Base ALL information STRICTLY on the provided document context.\n\n"
            "OUTPUT FORMAT (CRITICAL):\n"
            "Respond with ONLY a raw, valid JSON object. No markdown fences. No preamble.\n"
            "DO NOT wrap the JSON in any parent object or root key. The root MUST start with 'overview'.\n"
            'Schema: {"overview": "str", "key_concepts": ["str"], "conclusion": "str"}'
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