"""
 * @file markdown_parser.py
 * @description Pure text processing service. Handles semantic Docling chunking and strict tensor limit guardrails.
 * @layer Core Logic
 * @dependencies os, re, logging, concurrent.futures
"""

import os
import re
import logging
import concurrent.futures
from typing import Optional

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# SOTA Lazy Loading: Tiktoken Network Quarantine
# ─────────────────────────────────────────────────────────────────────────────
_TIKTOKEN_ENC = None
_TIKTOKEN_ATTEMPTED = False
_HAS_TIKTOKEN = False

def _get_tiktoken_enc():
    """Lazy loader with a strict 3-second network guillotine."""
    global _TIKTOKEN_ENC, _TIKTOKEN_ATTEMPTED, _HAS_TIKTOKEN
    if _TIKTOKEN_ATTEMPTED:
        return _TIKTOKEN_ENC
        
    _TIKTOKEN_ATTEMPTED = True
    try:
        import tiktoken as _tiktoken
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_tiktoken.get_encoding, "cl100k_base")
            try:
                _TIKTOKEN_ENC = future.result(timeout=3.0)
                _HAS_TIKTOKEN = True
                logger.debug("markdown_parser: tiktoken loaded successfully.")
            except concurrent.futures.TimeoutError:
                logger.warning(
                    "markdown_parser: tiktoken network fetch timed out (>3s). "
                    "Azure blob storage blocked. Falling back to word approx."
                )
                _TIKTOKEN_ENC = None
                _HAS_TIKTOKEN = False
    except ImportError:
        _TIKTOKEN_ENC = None
        _HAS_TIKTOKEN = False
        logger.warning("markdown_parser: tiktoken not found. Falling back to word approx.")
        
    return _TIKTOKEN_ENC


# Match Jina-ColBERT-v2 absolute position embedding limits. Default 8192 if unset.
_EMBED_MAX_TOKENS: int = int(os.getenv("EMBEDDING_MAX_TOKENS", "8192"))


# =============================================================================
# ATOMIC BLOCK SPLITTER — Single-Pass Regex
# =============================================================================

# SOTA FIX: Eliminated nested quantifiers causing ReDoS catastrophic backtracking.
_ATOMIC_BLOCK_PATTERN = re.compile(
    r"("
    r"```[\s\S]*?```"                                          # 1. Fenced code block
    r"|\$\$[\s\S]*?\$\$"                                       # 2. Display math $$...$$
    r"|\\\[[\s\S]*?\\\]"                                       # 3. Display math \[...\]
    r"|!\[.*?\]\(.*?\)"                                        # 4. Markdown image ref
    r"|<table[\s\S]*?</table>"                                 # 5. Docling HTML tables
    r"|(?:^\|.*?\|\s*\n)+"                                     # 6. SOTA FIX: Non-backtracking Markdown table
    r")",
    re.MULTILINE | re.IGNORECASE,
)

def _detect_atomic_type(block: str) -> str:
    """Determines the content_type of an atomic markdown block in O(1)."""
    stripped = block.strip()
    if stripped.startswith("```"):
        return "CODE"
    if stripped.startswith("$$") or stripped.startswith(r"\[") or stripped.startswith(r"\("):
        return "MATH"
    if stripped.startswith("!["):
        return "IMAGE"
    if stripped.startswith("|") or stripped.lower().startswith("<table"):
        return "TABLE"
    return "TEXT"


# =============================================================================
# SEMANTIC DOCLING PARSER
# =============================================================================

class SemanticDoclingParser:
    """
    Parses Docling-generated Markdown into semantically bounded, typed chunks.
    """
    def __init__(self):
        chunk_token_size_str = os.getenv("CHUNK_TOKEN_SIZE", "1500")
        chunk_overlap_str    = os.getenv("CHUNK_OVERLAP",    "200")

        self.chunk_size    = max(64, int(chunk_token_size_str))
        self.chunk_overlap = max(0,  int(chunk_overlap_str))

        if self.chunk_overlap >= self.chunk_size:
            logger.warning(
                f"SemanticDoclingParser: CHUNK_OVERLAP ({self.chunk_overlap}) >= "
                f"CHUNK_TOKEN_SIZE ({self.chunk_size}). Clamping overlap."
            )
            self.chunk_overlap = self.chunk_size // 4

        self.encoder = _get_tiktoken_enc()

        logger.info(
            f"SemanticDoclingParser: Initialized. "
            f"chunk_size={self.chunk_size} tokens, "
            f"overlap={self.chunk_overlap} tokens, "
            f"embed_max={_EMBED_MAX_TOKENS} tokens."
        )

    def get_semantic_chunks(self, markdown_text: str) -> list[dict]:
        if not markdown_text or not markdown_text.strip():
            return []

        # ── THE BASE64 GUILLOTINE ──
        markdown_text = re.sub(
            r"!\[(.*?)\]\(data:image/[^;]+;base64,[^\)]+\)",
            r"![\1]([BASE64_IMAGE_STRIPPED_TO_PRESERVE_VRAM])",
            markdown_text
        )
        
        # Strip HTML base64 imgs just in case
        markdown_text = re.sub(
            r'<img[^>]+src="data:image/[^;]+;base64,[^"]+"[^>]*>',
            r"[BASE64_HTML_IMAGE_STRIPPED]",
            markdown_text
        )

        chunks: list[dict] = []
        segments = _ATOMIC_BLOCK_PATTERN.split(markdown_text)

        prose_buffer       = ""
        prose_buffer_start = 0
        cursor             = 0 

        for i, segment in enumerate(segments):
            if segment is None:
                continue

            seg_start = cursor
            seg_end   = cursor + len(segment)
            cursor    = seg_end

            if i % 2 == 1:
                # ODD INDEX: Atomic block
                if prose_buffer.strip():
                    chunks.extend(self._chunk_prose(prose_buffer, start_offset=prose_buffer_start))
                    prose_buffer = ""

                content_type = _detect_atomic_type(segment)
                stripped     = segment.strip()

                if stripped:
                    atom_tokens = self._count_tokens(stripped)
                    if atom_tokens > _EMBED_MAX_TOKENS:
                        logger.warning(
                            "SemanticDoclingParser: Atomic block [%s] exceeds limit "
                            "(%d > %d tokens). Hard-truncating.",
                            content_type, atom_tokens, _EMBED_MAX_TOKENS,
                        )
                        stripped = self._hard_truncate(stripped, _EMBED_MAX_TOKENS)
                        seg_end = seg_start + len(stripped)

                    chunks.append({
                        "content":                  stripped,
                        "content_type":             content_type,
                        "needs_llm_classification": False,  
                        "is_atomic":                True,
                        "char_start":               seg_start,
                        "char_end":                 seg_end,
                    })
            else:
                # EVEN INDEX: Prose segment
                if not segment.strip():
                    continue

                if not prose_buffer:
                    prose_buffer_start = seg_start
                prose_buffer += segment

                if self._count_tokens(prose_buffer) >= self.chunk_size * 3:
                    chunks.extend(self._chunk_prose(prose_buffer, start_offset=prose_buffer_start))
                    prose_buffer       = ""
                    prose_buffer_start = seg_end

        if prose_buffer.strip():
            chunks.extend(self._chunk_prose(prose_buffer, start_offset=prose_buffer_start))

        return chunks

    def _count_tokens(self, text: str) -> int:
        if self.encoder:
            return len(self.encoder.encode(text))
        return int(len(text.split()) * 1.3)

    def _hard_truncate(self, text: str, max_tokens: int) -> str:
        if self.encoder:
            ids = self.encoder.encode(text)
            if len(ids) > max_tokens:
                return self.encoder.decode(ids[:max_tokens])
            return text
        else:
            word_limit = int(max_tokens / 1.3)
            words = text.split()
            if len(words) > word_limit:
                return " ".join(words[:word_limit])
            return text

    def _chunk_prose(self, text: str, start_offset: int = 0) -> list[dict]:
        """
        SOTA FIX: Semantic Boundary Snapping with Strict Advance Guard.
        """
        text = text.strip()
        if not text:
            return []

        chunks = []
        
        if self.encoder:
            token_ids = self.encoder.encode(text)
            total     = len(token_ids)
            token_start = 0

            while token_start < total:
                token_end  = min(token_start + self.chunk_size, total)
                window_ids = token_ids[token_start:token_end]
                chunk_text = self.encoder.decode(window_ids)

                if token_end < total:
                    # SOTA FIX: O(N) boundary search (finditer instead of expensive negative lookahead)
                    matches = list(re.finditer(r'([\.\?!]\s+|\n\n+)', chunk_text))
                    if matches:
                        boundary_idx = matches[-1].end()
                        chunk_text = chunk_text[:boundary_idx].strip()
                    else:
                        chunk_text = chunk_text.strip()
                    
                    # Always recalculate true consumption
                    actual_tokens = len(self.encoder.encode(chunk_text))
                    token_end = token_start + actual_tokens

                if chunk_text:
                    approx_char_ratio = token_start / max(total, 1)
                    approx_char_start = start_offset + int(approx_char_ratio * len(text))

                    chunks.append({
                        "content":                  chunk_text,
                        "content_type":             "TEXT",
                        "needs_llm_classification": True,
                        "is_atomic":                False,
                        "char_start":               approx_char_start,
                        "char_end":                 approx_char_start + len(chunk_text),
                    })

                # SOTA FIX: Strict Advance Guard mathematically prevents infinite loops
                advance_step = max(1, (token_end - token_start) - self.chunk_overlap)
                token_start += advance_step

                if token_end >= total:
                    break
        else:
            # Fallback Word-Level Semantic Slicer
            words = text.split()
            window_words = max(1, int(self.chunk_size / 1.3))
            overlap_words = max(0, int(self.chunk_overlap / 1.3))
            
            word_start = 0
            total_words = len(words)
            
            while word_start < total_words:
                word_end = min(word_start + window_words, total_words)
                chunk_text = " ".join(words[word_start:word_end])
                
                if word_end < total_words:
                    matches = list(re.finditer(r'([\.\?!]\s+|\n\n+)', chunk_text))
                    if matches:
                        boundary_idx = matches[-1].end()
                        chunk_text = chunk_text[:boundary_idx].strip()
                        word_end = word_start + len(chunk_text.split())
                    else:
                        chunk_text = chunk_text.strip()
                
                if chunk_text:
                    approx_char_ratio = word_start / max(total_words, 1)
                    approx_char_start = start_offset + int(approx_char_ratio * len(text))

                    chunks.append({
                        "content":                  chunk_text,
                        "content_type":             "TEXT",
                        "needs_llm_classification": True,
                        "is_atomic":                False,
                        "char_start":               approx_char_start,
                        "char_end":                 approx_char_start + len(chunk_text),
                    })
                    
                # SOTA FIX: Strict Advance Guard for fallback slicing
                advance_step = max(1, (word_end - word_start) - overlap_words)
                word_start += advance_step

                if word_end >= total_words:
                    break

        return chunks