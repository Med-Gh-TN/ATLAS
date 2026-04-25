"""
Omni-Architect: PDF & IO Worker (Production Build v3.2 — Atomic Truncation Guardrail)
Handles synchronous, CPU-bound operations to prevent asyncio event-loop starvation.
All functions in this module are safe to call via asyncio.to_thread().

Changelog v3.2
──────────────
• [FIX-TENSOR-02] SemanticDoclingParser.get_semantic_chunks(): Atomic block
  truncation guardrail. Atomic blocks (CODE, MATH, TABLE, IMAGE) are never
  prose-split by design — they are emitted whole. However, a large LaTeX
  derivation block, a massive CSV table rendered as markdown, or a multi-page
  code listing can easily exceed 8192 tokens. When such a block reaches the
  ONNX Slice node in Jina-ColBERT-v2's attention head it causes an
  unrecoverable out-of-bounds RuntimeError.
  Fix: after the content_type of an atomic block is determined, count its
  tokens. If the count exceeds EMBEDDING_MAX_TOKENS (read from .env,
  default 8192), hard-truncate to the limit and log a WARNING. The semantic
  content is partially lost, but the pipeline survives. This is the correct
  tradeoff for a production RAG system.

Key Fixes vs v3.0 (preserved):
  • [CRASH-03 FIX] extract_pages_as_images() — PyMuPDF page rendering.
  • [CRASH-03 FIX] detect_handwriting_risk() — pypdf text-density probe.
  • [DEFECT-08 PRESERVED] SemanticDoclingParser wired into the pipeline.
  • [DEFECT-09 PRESERVED] Single-pass regex splitter with no None entries.
  • [DEFECT-10 PRESERVED] True tiktoken-based sliding window chunking.
  • [DEFECT-11 PRESERVED] Slice temp directories in inputs/ not output/.
  • [DEFECT-12 PRESERVED] content_type field on every chunk dict.
  • [DEFECT-13 PRESERVED] get_docling_markdown_for_file() path resolver.
"""
import os
import re
import shutil
import logging
from pathlib import Path
from typing import Optional

from pypdf import PdfReader, PdfWriter
from dotenv import load_dotenv

try:
    import tiktoken
    HAS_TIKTOKEN = True
except ImportError:
    HAS_TIKTOKEN = False
    logging.getLogger(__name__).warning(
        "pdf_worker: tiktoken not found. Falling back to word-count approximation. "
        "Install with: pip install tiktoken"
    )

# [CRASH-03] PyMuPDF for page-to-image rendering
try:
    import fitz  # PyMuPDF
    HAS_PYMUPDF = True
except ImportError:
    HAS_PYMUPDF = False
    logging.getLogger(__name__).warning(
        "pdf_worker: PyMuPDF (fitz) not found. VLM OCR page rendering disabled. "
        "Install with: pip install pymupdf"
    )

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=PROJECT_ROOT / ".env", override=True)

# ─────────────────────────────────────────────────────────────────────────────
# [FIX-TENSOR-02] Module-level constant for atomic block truncation guardrail.
# Matches Jina-ColBERT-v2's absolute position embedding table size.
# Read from .env so it can be adjusted without code changes.
# DO NOT raise above 8192 — the ONNX model's architecture enforces this limit.
# ─────────────────────────────────────────────────────────────────────────────
_EMBED_MAX_TOKENS: int = int(os.getenv("EMBEDDING_MAX_TOKENS", "8192"))


# =============================================================================
# IO ROUTER — Dynamic Path Resolution
# =============================================================================

class IORouter:
    """
    Singleton-like factory for .env-driven directory resolution.
    All directories are created on first access.
    """

    @staticmethod
    def _resolve(env_key: str, default: str) -> Path:
        target = PROJECT_ROOT / os.getenv(env_key, default)
        target.mkdir(parents=True, exist_ok=True)
        return target

    @classmethod
    def get_inputs_dir(cls) -> Path:
        return cls._resolve("DIR_INPUTS", "OCR/inputs")

    @classmethod
    def get_output_dir(cls) -> Path:
        return cls._resolve("DIR_OUTPUT", "OCR/output")

    @classmethod
    def get_workspace_dir(cls) -> Path:
        return cls._resolve("DIR_WORKSPACE", "rag_workspace")


# =============================================================================
# ATOMIC BLOCK SPLITTER — Single-Pass Regex (DEFECT-09 FIX)
# =============================================================================
# A single unified capturing group that matches any atomic markdown block.
# Using one group ensures re.split() produces a clean [prose, atomic, prose, atomic, ...]
# alternation with NO None entries from non-participating groups.
#
# Priority order (most specific → least specific):
#   1. Fenced code blocks (```...```)
#   2. Display math blocks ($$ ... $$ or \[ ... \])
#   3. Inline/block LaTeX (\(...\) single-line)
#   4. Markdown image refs (![...](...)
#   5. Markdown tables (contiguous pipe-delimited rows)

_ATOMIC_BLOCK_PATTERN = re.compile(
    r"("
    r"```[\s\S]*?```"                                                      # 1. Fenced code block
    r"|\$\$[\s\S]*?\$\$"                                                   # 2. Display math $$...$$
    r"|\\\[[\s\S]*?\\\]"                                                   # 3. Display math \[...\]
    r"|!\[.*?\]\(.*?\)"                                                    # 4. Markdown image ref
    r"|(?:^\|.+\|\s*\n)+(?:^\|[-:\s|]+\|\s*\n)?(?:^\|.+\|\s*\n)*"       # 5. Markdown table
    r")",
    re.MULTILINE,
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
    if stripped.startswith("|"):
        return "TABLE"
    return "TEXT"


# =============================================================================
# SEMANTIC DOCLING PARSER (DEFECT-09, DEFECT-10, DEFECT-12, DEFECT-13 FIX)
# =============================================================================

class SemanticDoclingParser:
    """
    Parses Docling-generated Markdown into semantically bounded, typed chunks.

    Design contract:
    - Atomic blocks (CODE, MATH, TABLE, IMAGE) are NEVER split. They are emitted
      as single chunks regardless of token count — unless they exceed
      EMBEDDING_MAX_TOKENS, in which case they are hard-truncated (see below).
    - Prose (TEXT) is chunked via a true token-level sliding window with
      configurable size and overlap from .env.
    - Every chunk dict carries a 'content_type' field matching the CONTENT_TYPES
      taxonomy in model_bridge.py.
    - TEXT chunks carry 'needs_llm_classification': True, signalling server.py
      to call classify_content_type() for BIOLOGY detection.

    [FIX-TENSOR-02] Atomic Block Truncation Guardrail:
    - After an atomic block is matched and its type is determined, its token
      count is checked against _EMBED_MAX_TOKENS (default 8192).
    - If the block exceeds the limit (e.g. a 500-row markdown table or a
      multi-page code listing), it is hard-truncated to _EMBED_MAX_TOKENS
      tokens and a WARNING is emitted. The pipeline continues rather than
      crashing the entire ingestion run.
    - This is intentionally the ONLY place where an "atomic" block is modified.
      The semantic guarantees of atomicity apply to structural splitting
      (never breaking a code block mid-function), not to the embedding model's
      absolute coordinate limits.

    Output schema per chunk:
    {
        "content":                  str,   # The raw text content
        "content_type":             str,   # MATH|CODE|TABLE|IMAGE|TEXT
        "needs_llm_classification": bool,  # True only for TEXT chunks
        "is_atomic":                bool,  # True for CODE/MATH/TABLE/IMAGE
        "char_start":               int,   # Character offset in source markdown
        "char_end":                 int,   # Character offset in source markdown
    }
    """

    def __init__(self):
        chunk_token_size_str = os.getenv("CHUNK_TOKEN_SIZE", "1500")
        chunk_overlap_str    = os.getenv("CHUNK_OVERLAP",    "200")

        self.chunk_size    = max(64, int(chunk_token_size_str))
        self.chunk_overlap = max(0,  int(chunk_overlap_str))

        if self.chunk_overlap >= self.chunk_size:
            logger.warning(
                f"SemanticDoclingParser: CHUNK_OVERLAP ({self.chunk_overlap}) >= "
                f"CHUNK_TOKEN_SIZE ({self.chunk_size}). Clamping overlap to "
                f"chunk_size // 4 = {self.chunk_size // 4}."
            )
            self.chunk_overlap = self.chunk_size // 4

        if HAS_TIKTOKEN:
            # cl100k_base: tokenizer used by GPT-4 and compatible ColBERT models
            self.encoder = tiktoken.get_encoding("cl100k_base")
        else:
            self.encoder = None

        logger.info(
            f"SemanticDoclingParser: Initialized. "
            f"chunk_size={self.chunk_size} tokens, "
            f"overlap={self.chunk_overlap} tokens, "
            f"embed_max={_EMBED_MAX_TOKENS} tokens, "
            f"tiktoken={'enabled' if self.encoder else 'DISABLED (word approx)'}."
        )

    # ------------------------------------------------------------------
    # PUBLIC API
    # ------------------------------------------------------------------

    def get_semantic_chunks(self, markdown_text: str) -> list[dict]:
        """
        Primary entry point. Parses a full Docling markdown document into
        a list of semantically bounded, content-typed chunk dicts.

        Args:
            markdown_text: The full markdown string from Docling's .md output.

        Returns:
            List of chunk dicts matching the schema described in the class docstring.
        """
        if not markdown_text or not markdown_text.strip():
            logger.warning("SemanticDoclingParser: Received empty markdown. Returning [].")
            return []

        chunks: list[dict] = []

        # re.split() with a capturing group returns:
        # [prose_0, match_1, prose_1, match_2, prose_2, ...]
        # Even indices → prose segments (may be empty strings)
        # Odd indices  → atomic block matches (never None with one group)
        segments = _ATOMIC_BLOCK_PATTERN.split(markdown_text)

        prose_buffer       = ""
        prose_buffer_start = 0
        cursor             = 0  # Tracks character position in the original markdown

        for i, segment in enumerate(segments):
            if segment is None:
                # Should not occur with a single capturing group, but guard defensively
                continue

            seg_start = cursor
            seg_end   = cursor + len(segment)
            cursor    = seg_end

            if i % 2 == 1:
                # ── ODD INDEX: Atomic block ────────────────────────────────
                # Flush pending prose buffer first
                if prose_buffer.strip():
                    chunks.extend(
                        self._chunk_prose(prose_buffer, start_offset=prose_buffer_start)
                    )
                    prose_buffer = ""

                content_type = _detect_atomic_type(segment)
                stripped     = segment.strip()

                if stripped:
                    # ── [FIX-TENSOR-02] Atomic Block Truncation Guardrail ──
                    atom_tokens = self._count_tokens(stripped)
                    if atom_tokens > _EMBED_MAX_TOKENS:
                        logger.warning(
                            "SemanticDoclingParser [FIX-TENSOR-02]: "
                            "Atomic block [%s] exceeds embedding limit "
                            "(%d > %d tokens). Hard-truncating to prevent "
                            "ONNX Slice out-of-bounds crash.",
                            content_type, atom_tokens, _EMBED_MAX_TOKENS,
                        )
                        stripped = self._hard_truncate(stripped, _EMBED_MAX_TOKENS)
                        # Recalculate end offset after truncation
                        seg_end = seg_start + len(stripped)

                    chunks.append({
                        "content":                  stripped,
                        "content_type":             content_type,
                        "needs_llm_classification": False,  # Atomic type is deterministic
                        "is_atomic":                True,
                        "char_start":               seg_start,
                        "char_end":                 seg_end,
                    })
                    logger.debug(
                        "SemanticDoclingParser: Atomic block [%s] preserved (%d chars).",
                        content_type, len(stripped),
                    )

            else:
                # ── EVEN INDEX: Prose segment ──────────────────────────────
                if not segment.strip():
                    continue

                # Buffer prose until it accumulates enough for a chunk
                if not prose_buffer:
                    prose_buffer_start = seg_start
                prose_buffer += segment

                # Proactive flush: if buffer is already over the limit, emit now
                # to prevent unbounded memory accumulation on large prose sections
                if self._count_tokens(prose_buffer) >= self.chunk_size * 3:
                    chunks.extend(
                        self._chunk_prose(prose_buffer, start_offset=prose_buffer_start)
                    )
                    prose_buffer       = ""
                    prose_buffer_start = seg_end

        # Final prose flush
        if prose_buffer.strip():
            chunks.extend(
                self._chunk_prose(prose_buffer, start_offset=prose_buffer_start)
            )

        logger.info(
            "SemanticDoclingParser: Produced %d chunks "
            "(%d atomic, %d prose).",
            len(chunks),
            sum(1 for c in chunks if c["is_atomic"]),
            sum(1 for c in chunks if not c["is_atomic"]),
        )
        return chunks

    # ------------------------------------------------------------------
    # INTERNAL HELPERS
    # ------------------------------------------------------------------

    def _count_tokens(self, text: str) -> int:
        """Returns token count using tiktoken when available, else word approximation."""
        if self.encoder:
            return len(self.encoder.encode(text))
        # Approximation: average English word ≈ 1.3 tokens
        return int(len(text.split()) * 1.3)

    def _hard_truncate(self, text: str, max_tokens: int) -> str:
        """
        Truncates text to at most max_tokens tokens.

        Uses tiktoken for byte-exact truncation when available.
        Falls back to word-count approximation otherwise.
        """
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
        Splits a prose block into overlapping token-window chunks (DEFECT-10 fix).

        Uses tiktoken for byte-exact token boundary control when available.
        Falls back to word-level windowing with the same overlap semantics.

        Args:
            text:         The prose string to chunk.
            start_offset: Character offset of this prose block in the source document.

        Returns:
            List of chunk dicts with content_type='TEXT'.
        """
        text = text.strip()
        if not text:
            return []

        chunks = []
        step   = max(1, self.chunk_size - self.chunk_overlap)

        if self.encoder:
            # ── Tiktoken path: true token-level sliding window ────────────
            token_ids = self.encoder.encode(text)
            total     = len(token_ids)

            for token_start in range(0, total, step):
                token_end  = min(token_start + self.chunk_size, total)
                window_ids = token_ids[token_start:token_end]
                chunk_text = self.encoder.decode(window_ids).strip()

                if not chunk_text:
                    continue

                # Approximate character offset within the prose block
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

                if token_end >= total:
                    break

        else:
            # ── Word-count fallback path ───────────────────────────────────
            words        = text.split()
            word_step    = max(1, int(step / 1.3))
            window_words = max(1, int(self.chunk_size / 1.3))

            for word_start in range(0, len(words), word_step):
                word_end   = min(word_start + window_words, len(words))
                chunk_text = " ".join(words[word_start:word_end]).strip()

                if not chunk_text:
                    continue

                approx_char_ratio = word_start / max(len(words), 1)
                approx_char_start = start_offset + int(approx_char_ratio * len(text))

                chunks.append({
                    "content":                  chunk_text,
                    "content_type":             "TEXT",
                    "needs_llm_classification": True,
                    "is_atomic":                False,
                    "char_start":               approx_char_start,
                    "char_end":                 approx_char_start + len(chunk_text),
                })

                if word_end >= len(words):
                    break

        return chunks


# =============================================================================
# DOCLING OUTPUT RESOLVER (DEFECT-13 FIX)
# =============================================================================

def get_docling_markdown_for_file(source_file_path: str) -> Optional[str]:
    """
    Resolves and reads the Docling-generated Markdown file for a given source
    PDF, matching the nested output directory structure produced by
    RAG-Anything's docling parser.

    Docling output structure:
        OCR/output/
          {stem}_{hash}/
            {stem}/
              docling/
                {stem}.md

    Strategy: Walk the output directory tree to find the first .md file whose
    stem matches the source file's stem. This is robust to hash variations
    in the folder name.

    Args:
        source_file_path: Absolute or relative path to the original PDF.

    Returns:
        The markdown string content, or None if not found.
    """
    source_path = Path(source_file_path)
    stem        = source_path.stem
    output_root = IORouter.get_output_dir()

    # Walk entire output tree looking for matching .md file
    for md_path in output_root.rglob("*.md"):
        if md_path.stem == stem and "docling" in md_path.parts:
            try:
                content = md_path.read_text(encoding="utf-8")
                logger.info(
                    "IORouter: Resolved Docling markdown for '%s' → %s",
                    stem, md_path,
                )
                return content
            except OSError as e:
                logger.error(
                    "IORouter: Found markdown at %s but failed to read: %s",
                    md_path, e,
                )

    logger.warning(
        "IORouter: No Docling markdown found for '%s' under %s. "
        "Ensure process_document_complete() has run before calling this function.",
        stem, output_root,
    )
    return None


# =============================================================================
# [CRASH-03 FIX] VLM OCR SUPPORT FUNCTIONS
# =============================================================================

def extract_pages_as_images(
    file_path:   str,
    dpi:         Optional[int]   = None,
    batch_size:  Optional[int]   = None,
    page_range:  Optional[tuple] = None,
) -> list[list[bytes]]:
    """
    Renders PDF pages as JPEG bytes for downstream Gemini Vision OCR.

    Converts each page in the PDF to a JPEG image at the configured DPI
    using PyMuPDF (fitz). Pages are grouped into batches of `batch_size`
    for efficient API call batching in model_bridge.vlm_ocr_page().

    Args:
        file_path:  Absolute path to the source PDF file.
        dpi:        Render resolution. Defaults to VLM_OCR_DPI from .env (150).
        batch_size: Pages per batch. Defaults to VLM_OCR_BATCH_PAGES from .env (1).
        page_range: Optional (start, end) tuple for partial processing.
                    0-indexed, end is exclusive. Default: all pages.

    Returns:
        List of batches. Each batch is a list of JPEG byte strings, one per page.

    Raises:
        ImportError:     If PyMuPDF is not installed.
        FileNotFoundError: If the PDF file does not exist.
    """
    if not HAS_PYMUPDF:
        raise ImportError(
            "extract_pages_as_images requires PyMuPDF. "
            "Install with: pip install pymupdf"
        )

    source = Path(file_path)
    if not source.exists():
        raise FileNotFoundError(f"PDF not found: {source}")

    resolved_dpi   = dpi        or int(os.getenv("VLM_OCR_DPI",         "150"))
    resolved_batch = batch_size or int(os.getenv("VLM_OCR_BATCH_PAGES", "1"))
    resolved_batch = max(1, min(resolved_batch, 2))  # Hard clamp: [1, 2]

    doc         = fitz.open(str(source))
    total_pages = len(doc)

    if page_range is not None:
        start_page = max(0, page_range[0])
        end_page   = min(total_pages, page_range[1])
    else:
        start_page = 0
        end_page   = total_pages

    logger.info(
        "extract_pages_as_images: '%s' — pages %d–%d at %d DPI, batch_size=%d.",
        source.name, start_page + 1, end_page, resolved_dpi, resolved_batch,
    )

    # Scale matrix: PDF native = 72 DPI, fitz Matrix scales relative to that
    scale  = resolved_dpi / 72.0
    matrix = fitz.Matrix(scale, scale)

    batches:       list[list[bytes]] = []
    current_batch: list[bytes]       = []

    for page_idx in range(start_page, end_page):
        page       = doc[page_idx]
        pixmap     = page.get_pixmap(matrix=matrix, colorspace=fitz.csRGB)
        jpeg_bytes = pixmap.tobytes("jpeg")
        current_batch.append(jpeg_bytes)

        if len(current_batch) >= resolved_batch:
            batches.append(current_batch)
            current_batch = []

    # Flush final partial batch
    if current_batch:
        batches.append(current_batch)

    doc.close()
    total_pages_rendered = end_page - start_page
    logger.info(
        "extract_pages_as_images: Rendered %d pages into %d batches.",
        total_pages_rendered, len(batches),
    )
    return batches


def detect_handwriting_risk(file_path: str) -> bool:
    """
    Heuristic detector for PDFs likely to fail Docling text-layer OCR.

    Performs a fast, low-cost probe using pypdf's text extraction to estimate
    text content density. PDFs with sparse text extraction are classified as
    scanned or handwritten documents where Docling will produce garbled output.

    Args:
        file_path: Absolute or relative path to the PDF file.

    Returns:
        True  → VLM OCR is recommended (handwriting/scan risk detected).
        False → Docling text extraction is likely sufficient.
    """
    source = Path(file_path)
    if not source.exists():
        logger.warning(
            "detect_handwriting_risk: File not found: %s. Returning False.", source
        )
        return False

    try:
        reader      = PdfReader(str(source))
        total_pages = len(reader.pages)
        if total_pages == 0:
            return False

        total_chars = 0
        for page in reader.pages:
            try:
                text = page.extract_text() or ""
            except Exception:
                text = ""
            total_chars += len(re.sub(r"\s+", "", text))

        avg_chars_per_page = total_chars / total_pages

        is_low_density  = avg_chars_per_page < 50
        is_near_empty   = total_chars < 100
        risk_detected   = is_low_density or is_near_empty

        if risk_detected:
            logger.info(
                "detect_handwriting_risk: ⚠ '%s' — low text density "
                "(%.1f chars/page, %d total). Recommend VLM OCR path.",
                source.name, avg_chars_per_page, total_chars,
            )
        else:
            logger.debug(
                "detect_handwriting_risk: '%s' — text density OK "
                "(%.1f chars/page). Docling extraction is sufficient.",
                source.name, avg_chars_per_page,
            )

        return risk_detected

    except Exception as e:
        logger.error(
            "detect_handwriting_risk: Failed to probe '%s': %s. Defaulting to False.",
            source.name, e,
        )
        return False


# =============================================================================
# SYNCHRONOUS I/O WORKERS
# =============================================================================

def sync_slice_pdf(file_path: str, chunk_size: int = 10) -> list[str]:
    """
    Slices a large PDF into sequential page-range sub-PDFs.

    Output location: sibling temp directory to the source file (DEFECT-11 fix).
    The temp directory is named '{filename}_slices' and lives in the inputs dir.
    The caller (server.py) is responsible for cleanup in its finally block.

    Args:
        file_path:  Absolute path to the source PDF.
        chunk_size: Number of pages per slice.

    Returns:
        Ordered list of absolute paths to the generated slice PDFs.
    """
    source = Path(file_path)
    reader = PdfReader(str(source))
    total  = len(reader.pages)

    # Place slices in a temp sibling dir inside inputs — NOT in output (DEFECT-11)
    slices_dir = IORouter.get_inputs_dir() / f"{source.stem}_slices"
    slices_dir.mkdir(parents=True, exist_ok=True)

    chunk_paths: list[str] = []

    for start in range(0, total, chunk_size):
        end    = min(start + chunk_size, total)
        writer = PdfWriter()
        for page_idx in range(start, end):
            writer.add_page(reader.pages[page_idx])

        slice_name = f"slice_{start + 1:04d}_to_{end:04d}_{source.name}"
        slice_path = slices_dir / slice_name
        with open(slice_path, "wb") as out_file:
            writer.write(out_file)
        chunk_paths.append(str(slice_path))

    logger.info(
        "sync_slice_pdf: '%s' (%d pages) → %d slices in %s",
        source.name, total, len(chunk_paths), slices_dir,
    )
    return chunk_paths


def sync_save_upload(file_obj, filename: str) -> Path:
    """
    Saves an uploaded file stream to the configured inputs directory.

    Args:
        file_obj: A file-like object (from FastAPI UploadFile.file).
        filename: Target filename.

    Returns:
        Absolute Path to the saved file.
    """
    destination = IORouter.get_inputs_dir() / filename
    with open(destination, "wb") as buffer:
        shutil.copyfileobj(file_obj, buffer)
    logger.info("sync_save_upload: Saved '%s' → %s", filename, destination)
    return destination


def sync_clean_workspace(inputs_only: bool = True):
    """
    Utility to clear the inputs directory between processing runs.

    Args:
        inputs_only: If True, only clears inputs. If False, also clears output.
                     Never touches the Qdrant vault or rag_workspace.
    """
    inputs_dir = IORouter.get_inputs_dir()
    cleared    = 0

    for item in inputs_dir.iterdir():
        if item.is_file():
            item.unlink()
            cleared += 1
        elif item.is_dir() and item.name.endswith("_slices"):
            shutil.rmtree(item, ignore_errors=True)
            cleared += 1

    logger.info(
        "sync_clean_workspace: Cleared %d items from %s.", cleared, inputs_dir
    )

    if not inputs_only:
        output_dir = IORouter.get_output_dir()
        shutil.rmtree(output_dir, ignore_errors=True)
        output_dir.mkdir(parents=True, exist_ok=True)
        logger.info(
            "sync_clean_workspace: Cleared output directory %s.", output_dir
        )