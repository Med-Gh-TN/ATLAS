"""
src/domain/models.py
════════════════════════════════════════════════════════════════════════════════
Domain Models — Single Source of Truth for Data Contracts  (v6.3 Omni-Architect)

All data structures, TypedDicts, and shared schemas used across the
application live here. No business logic. No I/O. Pure definitions.

Changelog v6.3 (SOTA GraphRAG Ontology)
──────────────
• Added strict Pydantic models for Knowledge Graph Nodes and Relationships.
• Enforces Hogan's Graph Theory methodology to prevent LLM schema collapse.

Changelog v5.0 (Omni-Architect SOTA)
──────────────
• Added strict Pydantic models for Academic Assets (Flashcard, Mindmap, Exam).
• Enforced Domain-Driven Design (DDD) to decouple FastAPI from raw dictionaries.
• Retained OpenInference Telemetry Contract (v4.2/v4.3) backward compatibility.
════════════════════════════════════════════════════════════════════════════════
"""
from typing import Optional, TypedDict, Any, Dict, List, Literal
from pydantic import BaseModel, Field

# ──────────────────────────────────────────────────────────────────────────────
# CONTENT-AWARE RETRIEVAL SCORE THRESHOLDS
# ──────────────────────────────────────────────────────────────────────────────

SCORE_THRESHOLDS: dict[str, float] = {
    "MATH":    0.65,
    "CODE":    0.70,
    "TABLE":   0.60,
    "IMAGE":   0.55,
    "BIOLOGY": 0.80,
    "TEXT":    0.55,
}

# ColBERT dense vector key used when an embedding result is returned as a dict
COLBERT_DENSE_KEY: str = "colbert_dense"

# LightRAG keyword used to label a fused graph-synthesis entry in ranked lists
GRAPH_SYNTHESIS_ID: str = "lightrag_graph_synthesis"

# Phrases returned by LightRAG / Gemini that signal an empty / unusable result
EMPTY_RESULT_PHRASES: tuple[str, ...] = (
    "no relevant information",
    "i cannot find",
    "no information available",
    "the provided context does not",
    "based on the provided context, there is no",
    "[vlm blocked",
    "image bytes unavailable",
    "image decode failed",
)

# ──────────────────────────────────────────────────────────────────────────────
# v6.3: SOTA KNOWLEDGE GRAPH ONTOLOGY (Hogan's Methodology)
# ──────────────────────────────────────────────────────────────────────────────

class GraphNode(BaseModel):
    """
    Strict representation of a discrete entity in the Knowledge Graph.
    Prevents the LLM from hallucinating entire sentences as nodes.
    """
    id: str = Field(
        ..., 
        description="The normalized, uppercase string ID of the entity (e.g., 'XML', 'DTD')."
    )
    type: Literal["Technology", "Standard", "SyntaxElement", "Concept", "Tool", "Language"] = Field(
        ..., 
        description="The strict ontological category of the node."
    )
    description: str = Field(
        ..., 
        description="A concise, factual definition of the entity based on the text."
    )

class GraphRelationship(BaseModel):
    """
    Strict representation of a directional relationship between two nodes.
    """
    source_id: str = Field(
        ..., 
        description="The ID of the origin node. Must match a generated GraphNode."
    )
    target_id: str = Field(
        ..., 
        description="The ID of the destination node. Must match a generated GraphNode."
    )
    type: Literal["USED_FOR", "VALIDATES", "CONTAINS", "SUCCESSOR_TO", "DEFINES", "DEPENDS_ON", "IMPLEMENTS"] = Field(
        ..., 
        description="The strict ontological relationship predicate."
    )
    explanation: str = Field(
        ..., 
        description="Brief context on why this relationship exists in the source text."
    )

class GraphExtractionResult(BaseModel):
    """
    The guaranteed JSON output payload for the GraphExtractionService.
    """
    nodes: List[GraphNode] = Field(default_factory=list)
    relationships: List[GraphRelationship] = Field(default_factory=list)


# ──────────────────────────────────────────────────────────────────────────────
# v4.3: CACHE & RETRIEVAL DOMAIN MODELS (TypedDicts for Telemetry compat)
# ──────────────────────────────────────────────────────────────────────────────

class RerankedChunk(TypedDict):
    """
    A retrieved vector chunk annotated with cross-encoder score.
    """
    id:           str
    content:      str
    text:         str
    rrf_score:    float
    rerank_score: float
    source:       Optional[str]
    page:         Optional[int]
    content_type: str
    workspace_id: str


class HyDeResult(TypedDict):
    """
    Output of HyDEService.generate().
    """
    hypothesis_text: str
    domain:          str
    used_fallback:   bool


class CachedAnswer(TypedDict):
    """
    Semantic cache hit payload from SemanticCacheService.get().
    """
    answer:            str
    trace_id:          str
    cached_at:         float
    similarity:        float
    original_question: str


# ──────────────────────────────────────────────────────────────────────────────
# OPENINFERENCE QUERY RESULT CONTRACT  [v4.3]
# ──────────────────────────────────────────────────────────────────────────────

class QueryResult(TypedDict):
    """
    Structured return value of HybridRAGPipeline.query().
    Conforms to the OpenInference LLM + Retrieval span specification.
    """
    answer:               str
    route:                str
    expanded_query:       str
    chunks:               list
    retrieval_latency_ms: int
    index_size:           Optional[int]
    prompt_tokens:        Optional[int]
    completion_tokens:    Optional[int]
    total_latency_ms:     int
    ttft_ms:              Optional[int]
    trace_id:             str

    # v4.3 additions — Optional for backward compat with existing code
    domain:             Optional[str]
    cache_hit:          Optional[bool]
    hyde_text:          Optional[str]
    decomposed_queries: Optional[list[str]]


# ──────────────────────────────────────────────────────────────────────────────
# v5.0: ACADEMIC ASSET DOMAIN SCHEMAS (Strict Pydantic Validation)
# ──────────────────────────────────────────────────────────────────────────────

class FlashcardItem(BaseModel):
    """Single flashcard representation."""
    front: str = Field(..., description="The concept, term, or question.")
    back: str = Field(..., description="The definition, explanation, or answer.")

class FlashcardCollection(BaseModel):
    """Payload for the 'flashcards' asset type."""
    cards: List[FlashcardItem] = Field(default_factory=list)
    count: int = Field(default=0)

class MindmapData(BaseModel):
    """Payload for the 'mindmap' asset type."""
    mermaid: str = Field(..., description="Valid Mermaid.js mindmap syntax.")

class MCQItem(BaseModel):
    """Single Multiple Choice Question representation."""
    question: str
    options: Dict[Literal["A", "B", "C", "D"], str] = Field(
        ..., description="Exactly 4 options mapped to A, B, C, D."
    )
    answer: Literal["A", "B", "C", "D"]
    explanation: str

class WrittenItem(BaseModel):
    """Single Open/Written Question representation."""
    question: str
    model_answer: str

class ExamData(BaseModel):
    """Payload for the 'exam' asset type."""
    mcq: List[MCQItem] = Field(default_factory=list)
    written: List[WrittenItem] = Field(default_factory=list)

class SummaryData(BaseModel):
    """Payload for the 'summary' asset type."""
    overview: str = Field(..., description="A high-level executive summary of the document.")
    key_concepts: List[str] = Field(default_factory=list, description="Bullet points of the most critical concepts.")
    conclusion: Optional[str] = Field(None, description="Final concluding thoughts or takeaways.")

class AcademicAssetRecord(BaseModel):
    """
    Represents a finalized, typed asset retrieved from the PostgreSQL layer.
    Ensures the FastAPI router outputs guaranteed schemas.
    """
    id: str
    document_uuid: str
    asset_type: Literal["flashcards", "mindmap", "exam", "summary"]
    content: Any  # Validated against FlashcardCollection, MindmapData, ExamData, or SummaryData at runtime
    model_version: Optional[str] = None
    generated_at: str
    chunk_count: Optional[int] = None