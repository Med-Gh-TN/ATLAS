"""
 * @file vision_renderer.py
 * @description Isolates PyMuPDF C-extensions for memory-safe image rasterization and layout analysis.
 * @layer Core Logic
 * @dependencies os, gc, logging, pathlib, re, fitz
"""

import os
import gc
import re
import logging
from pathlib import Path
from typing import Optional

try:
    import fitz  # PyMuPDF
    HAS_PYMUPDF = True
except ImportError:
    HAS_PYMUPDF = False

logger = logging.getLogger(__name__)

# =============================================================================
# VLM OCR SUPPORT FUNCTIONS
# =============================================================================

def extract_pages_as_images(
    file_path:   str,
    dpi:         Optional[int]   = None,
    batch_size:  Optional[int]   = None,
    page_range:  Optional[tuple] = None,
) -> list[list[bytes]]:
    """Rasterizes PDF pages to JPEG with strict garbage collection."""
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
    resolved_batch = max(1, min(resolved_batch, 2))  

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

    scale  = resolved_dpi / 72.0
    matrix = fitz.Matrix(scale, scale)

    batches:       list[list[bytes]] = []
    current_batch: list[bytes]       = []

    for page_idx in range(start_page, end_page):
        page       = doc[page_idx]
        pixmap     = page.get_pixmap(matrix=matrix, colorspace=fitz.csRGB)
        jpeg_bytes = pixmap.tobytes("jpeg")
        current_batch.append(jpeg_bytes)

        # STRICT C-MEMORY MANAGEMENT - Drop pointers immediately
        del pixmap
        del page

        if len(current_batch) >= resolved_batch:
            batches.append(current_batch)
            current_batch = []
            gc.collect() # Force Python to reap the C-extensions

    if current_batch:
        batches.append(current_batch)

    doc.close()
    del doc
    gc.collect() # Final sweep

    total_pages_rendered = end_page - start_page
    logger.info(
        "extract_pages_as_images: Rendered %d pages into %d batches.",
        total_pages_rendered, len(batches),
    )
    return batches


def detect_handwriting_risk(file_path: str) -> bool:
    """
    SOTA FIX: Multimodal Density Scanner.
    Calculates both Text Density AND Embedded Image Density.
    If a document is image-heavy (Slide Decks, Anatomy Books) or text-poor (Scans),
    it autonomously triggers the Sovereign VLM Bypass.
    """
    source = Path(file_path)
    if not source.exists():
        logger.warning(
            "detect_handwriting_risk: File not found: %s. Returning False.", source
        )
        return False

    try:
        if HAS_PYMUPDF:
            doc = fitz.open(str(source))
            total_pages = len(doc)
            if total_pages == 0:
                doc.close()
                return False

            total_chars = 0
            total_images = 0

            for page in doc:
                # 1. Count Text
                text = page.get_text()
                total_chars += len(re.sub(r"\s+", "", text))
                
                # 2. Count Embedded Images/Figures
                # get_images() returns a list of tuples. Index 2 is width, Index 3 is height.
                image_list = page.get_images(full=True)
                
                # Filter out tiny 1x1 pixel tracking images, logos, or background watermarks
                valid_images = [img for img in image_list if img[2] > 50 and img[3] > 50] 
                total_images += len(valid_images)
            
            doc.close()
            del doc
            total = total_pages
        else:
            # Fallback to PyPDF if fitz is missing (Not recommended, slow, no image support)
            from pypdf import PdfReader
            reader      = PdfReader(str(source))
            total = len(reader.pages)
            if total == 0:
                return False

            total_chars = 0
            total_images = 0
            for page in reader.pages:
                try:
                    text = page.extract_text() or ""
                except Exception:
                    text = ""
                total_chars += len(re.sub(r"\s+", "", text))

        avg_chars_per_page = total_chars / total
        avg_images_per_page = total_images / total

        # SOTA HEURISTICS:
        # Trigger if < 50 chars per page OR if it averages 1.5+ complex images per page
        is_low_density  = avg_chars_per_page < 50
        is_image_heavy  = avg_images_per_page >= 1.5
        
        risk_detected   = is_low_density or is_image_heavy

        if risk_detected:
            reason = "low text density" if is_low_density else f"high image density ({avg_images_per_page:.1f} imgs/page)"
            logger.info(
                f"detect_handwriting_risk: ⚠ '{source.name}' — {reason}. "
                f"Autonomously routing to Holistic VLM OCR."
            )
        else:
            logger.debug(
                f"detect_handwriting_risk: '{source.name}' — Standard PDF detected "
                f"({avg_chars_per_page:.1f} chars/page, {avg_images_per_page:.1f} imgs/page). Docling extraction is sufficient."
            )

        return risk_detected

    except Exception as e:
        logger.error(
            "detect_handwriting_risk: Failed to probe '%s': %s. Defaulting to False.",
            source.name, e,
        )
        return False