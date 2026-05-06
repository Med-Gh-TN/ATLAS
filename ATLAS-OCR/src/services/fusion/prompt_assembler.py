"""
@file prompt_assembler.py
@description Domain-Aware Prompt Assembler & GraphRAG Synthesis
@layer Core Logic
@dependencies typing, os, tiktoken

Single Responsibility: Constructing the final generation prompt with mandatory
verification blocks, GraphRAG edge-grounding constraints, and domain-specific
system instructions. (v8.2 Token-Exhaustion Protection Edition)
"""

import os
import tiktoken
from typing import Optional, Union, List

_DOMAIN_SYSTEM_ADDONS: dict[str, str] = {
    "MATH": (
        "You are a mathematics synthesis engine. "
        "When answering, preserve ALL mathematical notation exactly as it appears in the context. "
        "Show derivation steps where relevant. "
        "Use LaTeX notation inline ($...$) and display ($$...$$) appropriately. "
    ),
    "BIOLOGY": (
        "You are a biology synthesis engine specialising in molecular and cellular biology. "
        "Describe mechanisms step-by-step. Use correct scientific terminology. "
        "When describing pathways, name intermediates and enzymes precisely. "
    ),
    "CODE": (
        "You are a computer science synthesis engine. "
        "When explaining algorithms or data structures, state the time and space complexity. "
        "Explain logic in clear prose — do not invent code unless the context contains code. "
    ),
    "TEXT": "",
}

def _pack_context_edge_in(chunks: List[str]) -> str:
    """
    SOTA FIX: Lost in the Middle mitigation + VRAM OOM Defense.
    Reorders chunks so highest relevance are at the extreme edges.
    Enforces a strict tiktoken ceiling to prevent Kaggle T4 OOM crashes.
    """
    if not chunks:
        return ""
        
    max_tokens = int(os.getenv("GEMINI_MAX_EXTRACTION_TOKENS", "4096")) - 1000
    encoder = tiktoken.get_encoding("cl100k_base")

    packed: List[Optional[str]] = [None] * len(chunks)
    left = 0
    right = len(chunks) - 1
    current_tokens = 0

    for i, chunk in enumerate(chunks):
        chunk_tokens = len(encoder.encode(chunk, disallowed_special=()))
        if current_tokens + chunk_tokens > max_tokens:
            break
            
        if i % 2 == 0:
            packed[left] = chunk
            left += 1
        else:
            packed[right] = chunk
            right -= 1
            
        current_tokens += chunk_tokens

    valid_packed = [c for c in packed if c is not None]
    return "\n\n---\n\n".join(valid_packed)

def build_synthesis_prompt(
    question: str,
    context_data: Union[str, List[str]],
    degradation_tier: int,
    is_multi_doc: bool = False,
    document_uuids: Optional[list[str]] = None,
    detected_domain: str = "TEXT",
    hyde_text: Optional[str] = None,
) -> tuple[str, str]:
    
    if isinstance(context_data, list):
        context_str = _pack_context_edge_in(context_data)
    else:
        context_str = context_data

    cross_doc = ""
    doc_ref_str = "document does"
    if is_multi_doc and document_uuids:
        n = len(document_uuids)
        doc_ref_str = "documents do"
        cross_doc = (
            f"══════════════════════════════════════════════════════\n"
            f"CROSS-DOCUMENT CONTEXT ({n} DOCUMENTS)\n"
            f"══════════════════════════════════════════════════════\n"
            f"The context below is retrieved from {n} distinct documents. "
            f"Compare or contrast information across documents. Cite the source document for facts.\n\n"
        )

    hyde_note = ""
    if hyde_text:
        hyde_note = (
            f"[Retrieval Note: Base your answer ONLY on the CONTEXT below, not on the retrieval seed.]\n\n"
        )

    # SOTA FIX: Token Exhaustion Prevention. Forced singular block.
    synthesis_prompt = (
        cross_doc
        + hyde_note
        + "You are a precise question-answering assistant operating on retrieved "
        "document context (Knowledge Graphs and Vector Chunks).\n\n"
        "══════════════════════════════════════════════════════\n"
        "MANDATORY STEP 1 — VERIFICATION (complete before answering)\n"
        "══════════════════════════════════════════════════════\n"
        "Before writing your answer, you MUST write EXACTLY ONE <verification> block for the ENTIRE answer.\n"
        "DO NOT write a verification block for each individual chunk. Group your primary evidence into one block.\n\n"
        "<verification>\n"
        "Supporting Evidence: \"[Quote 1 or 2 key sentences that prove your answer]\"\n"
        "Relevance: [One aggregate sentence explaining why this answers the question]\n"
        "</verification>\n\n"
        "If you cannot find ANY supporting evidence for a specific part of the query:\n"
        "<verification>\n"
        "Supporting Evidence: NOT FOUND IN CONTEXT\n"
        "Relevance: N/A\n"
        "</verification>\n\n"
        f"If your <verification> block contains 'NOT FOUND IN CONTEXT' for a component of the query, "
        f"you MUST answer the verifiable parts and explicitly state:\n"
        f"\"Data regarding [Missing Concept] is not present in the provided {doc_ref_str}.\"\n"
        "NEVER abort the entire answer if partial evidence exists.\n\n"
        "══════════════════════════════════════════════════════\n"
        "STEP 2 — ANSWER (only after verification passes)\n"
        "══════════════════════════════════════════════════════\n"
        "  A. ANSWER — If the context supports the question, answer accurately using ONLY the context.\n"
        "  B. CORRECT — If the question contains a false premise CONTRADICTED by the context, correct it.\n\n"
        f"QUESTION: {question}\n\n"
        f"CONTEXT:\n{context_str}\n\n"
        "ANSWER (write EXACTLY ONE <verification> block first, then your academic answer):"
    )

    domain_addon = _DOMAIN_SYSTEM_ADDONS.get(detected_domain, "")
    cross_doc_sys = (
        f"You have context from {len(document_uuids)} documents. "
        if is_multi_doc and document_uuids else ""
    )

    synthesis_system = (
        "You are a corrective synthesis engine operating on retrieved document context. "
        + domain_addon
        + cross_doc_sys
        + "You MUST write EXACTLY ONE <verification> block before your answer. DO NOT loop or write multiple blocks. "
        f"If no evidence exists for a part of the query, explicitly state what is missing, "
        "and answer the remaining parts. NEVER abort the entire answer if partial evidence exists."
    )

    return synthesis_prompt, synthesis_system