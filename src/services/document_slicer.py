"""
@file document_slicer.py
@description Handles SOTA AST Knapsack chunking and hierarchical Parent-Child document splitting.
@layer Core Logic
@dependencies os, shutil, logging, gc, pathlib, re, uuid, pypdf, fitz, dotenv, tiktoken, domain.models
"""

import os
import shutil
import logging
import gc
import re
import uuid
from pathlib import Path
from typing import Optional, List

import tiktoken
from pypdf import PdfReader, PdfWriter
from dotenv import load_dotenv

# SOTA FIX: Stripped "src." prefix to align with orchestrator sys.path injection
from domain.models import ParentChunk, ChildChunk

try:
    import fitz  # PyMuPDF
    HAS_PYMUPDF = True
except ImportError:
    HAS_PYMUPDF = False
    logging.getLogger(__name__).warning(
        "document_slicer: PyMuPDF (fitz) not found. Falling back to memory-heavy PyPDF."
    )

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(dotenv_path=PROJECT_ROOT / ".env", override=True)


class IORouter:
    @staticmethod
    def _resolve(env_key: str, default: str) -> Path:
        target = PROJECT_ROOT / os.getenv(env_key, default)
        target.mkdir(parents=True, exist_ok=True)
        return target

    @classmethod
    def get_inputs_dir(cls) -> Path: return cls._resolve("DIR_INPUTS", "OCR/inputs")
    @classmethod
    def get_output_dir(cls) -> Path: return cls._resolve("DIR_OUTPUT", "OCR/output")
    @classmethod
    def get_workspace_dir(cls) -> Path: return cls._resolve("DIR_WORKSPACE", "rag_workspace")


def get_docling_markdown_for_file(source_file_path: str) -> Optional[str]:
    source_path = Path(source_file_path)
    stem        = source_path.stem
    output_root = IORouter.get_output_dir()

    for md_path in output_root.rglob("*.md"):
        if md_path.stem == stem and "docling" in md_path.parts:
            try:
                content = md_path.read_text(encoding="utf-8")
                return content
            except OSError as e:
                logger.error("IORouter: Failed to read %s: %s", md_path, e)
    return None


class ASTKnapsackSlicer:
    """
    SOTA: Implements the Knapsack Problem solution for Markdown AST.
    Packs structural blocks tightly into Child chunks (<= 512 tokens), 
    then rolls Children into Parent chunks (<= 1024 tokens).
    """
    def __init__(self, child_max_tokens: int = 512, parent_max_tokens: int = 1024):
        # We use cl100k_base as it closely approximates modern LLM and ColBERT tokenizers
        self.tokenizer = tiktoken.get_encoding("cl100k_base")
        self.child_limit = child_max_tokens
        self.parent_limit = parent_max_tokens

    def count_tokens(self, text: str) -> int:
        return len(self.tokenizer.encode(text, disallowed_special=()))

    def _split_oversized_block(self, block: str) -> List[str]:
        """Emergency fallback: If a single structural node exceeds 512 tokens, split by lines."""
        lines = block.split('\n')
        fragments = []
        current_frag = ""
        
        for line in lines:
            # Add line break if not first line
            candidate = f"{current_frag}\n{line}" if current_frag else line
            if self.count_tokens(candidate) > self.child_limit:
                if current_frag:
                    fragments.append(current_frag)
                current_frag = line
            else:
                current_frag = candidate
                
        if current_frag:
            fragments.append(current_frag)
            
        logger.warning(f"AST Slicer: Split monolithic node ({self.count_tokens(block)} tokens) into {len(fragments)} fragments.")
        return fragments

    def execute(self, text: str, document_id: str) -> List[ParentChunk]:
        # Step 1: Parse into structural blocks (paragraphs, markdown blocks)
        blocks = re.split(r'\n\n+', text.strip())
        
        all_children = []
        current_child_text = ""
        current_child_tokens = 0
        
        # Step 2: Knapsack packing for Child Chunks
        for block in blocks:
            block_tokens = self.count_tokens(block)
            
            # Handle the rare case where a single block is larger than the child limit
            if block_tokens > self.child_limit:
                # Flush current child if exists
                if current_child_text:
                    all_children.append({
                        "content": current_child_text.strip(),
                        "tokens": current_child_tokens
                    })
                    current_child_text = ""
                    current_child_tokens = 0
                    
                # Force split the oversized block
                fragments = self._split_oversized_block(block)
                for frag in fragments:
                    all_children.append({
                        "content": frag.strip(),
                        "tokens": self.count_tokens(frag)
                    })
                continue

            # Knapsack logic: Does this block fit in the current child?
            if current_child_tokens + block_tokens <= self.child_limit:
                current_child_text = f"{current_child_text}\n\n{block}" if current_child_text else block
                current_child_tokens = self.count_tokens(current_child_text)
            else:
                # Bin full. Save it.
                all_children.append({
                    "content": current_child_text.strip(),
                    "tokens": current_child_tokens
                })
                # Start new bin
                current_child_text = block
                current_child_tokens = block_tokens
                
        # Flush final child
        if current_child_text:
            all_children.append({
                "content": current_child_text.strip(),
                "tokens": current_child_tokens
            })

        # Step 3: Roll up into Parent Chunks
        parents: List[ParentChunk] = []
        current_parent_id = str(uuid.uuid4())
        current_parent_children: List[ChildChunk] = []
        current_parent_tokens = 0
        child_index = 0
        
        for child_data in all_children:
            child_tokens = child_data["tokens"]
            
            if current_parent_tokens + child_tokens > self.parent_limit and current_parent_children:
                # Parent full, finalize it
                parent_content = "\n\n".join([c.content for c in current_parent_children])
                parents.append(ParentChunk(
                    id=current_parent_id,
                    document_id=document_id,
                    content=parent_content,
                    token_count=current_parent_tokens,
                    children=current_parent_children
                ))
                # Reset for next parent
                current_parent_id = str(uuid.uuid4())
                current_parent_children = []
                current_parent_tokens = 0
                child_index = 0

            # Create strictly typed ChildChunk Pydantic model
            child_chunk = ChildChunk(
                id=str(uuid.uuid4()),
                parent_id=current_parent_id,
                content=child_data["content"],
                token_count=child_tokens,
                chunk_index=child_index
            )
            current_parent_children.append(child_chunk)
            current_parent_tokens += child_tokens
            child_index += 1

        # Flush final parent
        if current_parent_children:
            parent_content = "\n\n".join([c.content for c in current_parent_children])
            parents.append(ParentChunk(
                id=current_parent_id,
                document_id=document_id,
                content=parent_content,
                token_count=current_parent_tokens,
                children=current_parent_children
            ))

        logger.info(f"ASTKnapsackSlicer: Packed doc into {len(parents)} Parents and {len(all_children)} Children.")
        return parents


def semantic_chunk_markdown(text: str, document_id: str = "temp_doc") -> List[ParentChunk]:
    """
    SOTA FIX: Gateway function invoking the AST Slicer.
    Replaces the legacy naive character-chunking logic.
    """
    child_limit = int(os.getenv("EMBEDDING_MAX_TOKENS", "512"))
    
    # ⏪ SOTA FIX: Curing the Variable Overload Paradox.
    # We explicitly decouple the Parent limit from GEMINI_MAX_EXTRACTION_TOKENS (which is 4096 in .env).
    # This guarantees the Parent is capped at 1024, preventing the 1634-token monolith ingestion.
    parent_limit = int(os.getenv("PARENT_CHUNK_MAX_TOKENS", "1024")) 
    
    slicer = ASTKnapsackSlicer(child_max_tokens=child_limit, parent_max_tokens=parent_limit)
    return slicer.execute(text, document_id)


def sync_slice_pdf(file_path: str, chunk_size: Optional[int] = None) -> list[str]:
    """
    Slices a large PDF into sequential page-range sub-PDFs.
    Implements a 1-page overlap to prevent destruction of paragraphs/tables spanning page breaks.
    """
    source = Path(file_path)
    slices_dir = IORouter.get_inputs_dir() / f"{source.stem}_slices"
    slices_dir.mkdir(parents=True, exist_ok=True)

    chunk_paths: list[str] = []
    env_chunk_limit = int(os.getenv("MAX_PAGES_PER_SLICE", "5"))
    overlap = 1  # 1-page overlap for context preservation
    
    resolved_chunk_size = chunk_size if chunk_size is not None else env_chunk_limit
    if resolved_chunk_size > env_chunk_limit:
        resolved_chunk_size = env_chunk_limit

    if HAS_PYMUPDF:
        doc = fitz.open(str(source))
        total = len(doc)
        
        start = 0
        while start < total:
            end = min(start + resolved_chunk_size - 1, total - 1)
            
            slice_name = f"slice_{start + 1:04d}_to_{end + 1:04d}_{source.name}"
            slice_path = slices_dir / slice_name
            
            doc_slice = fitz.open()
            doc_slice.insert_pdf(doc, from_page=start, to_page=end)
            doc_slice.save(str(slice_path))
            doc_slice.close()
            del doc_slice
            
            chunk_paths.append(str(slice_path))
            
            # Step forward, subtracting overlap (unless we reached the end)
            if end >= total - 1:
                break
            start = end + 1 - overlap
            
        doc.close()
        del doc
        gc.collect()

    else:
        reader = PdfReader(str(source))
        total  = len(reader.pages)

        start = 0
        while start < total:
            end = min(start + resolved_chunk_size, total)
            writer = PdfWriter()
            for page_idx in range(start, end):
                writer.add_page(reader.pages[page_idx])

            slice_name = f"slice_{start + 1:04d}_to_{end:04d}_{source.name}"
            slice_path = slices_dir / slice_name
            with open(slice_path, "wb") as out_file:
                writer.write(out_file)
            chunk_paths.append(str(slice_path))
            
            del writer
            gc.collect()
            
            if end >= total:
                break
            start = end - overlap

    logger.info("sync_slice_pdf: '%s' (%d pages) → %d slices (w/ 1-page overlap)", source.name, total, len(chunk_paths))
    return chunk_paths


def sync_save_upload(file_obj, filename: str) -> Path:
    destination = IORouter.get_inputs_dir() / filename
    with open(destination, "wb") as buffer:
        shutil.copyfileobj(file_obj, buffer)
    return destination


def sync_clean_workspace(inputs_only: bool = True):
    inputs_dir = IORouter.get_inputs_dir()
    cleared = 0
    for item in inputs_dir.iterdir():
        if item.is_file():
            item.unlink()
            cleared += 1
        elif item.is_dir() and item.name.endswith("_slices"):
            shutil.rmtree(item, ignore_errors=True)
            cleared += 1

    if not inputs_only:
        output_dir = IORouter.get_output_dir()
        shutil.rmtree(output_dir, ignore_errors=True)
        output_dir.mkdir(parents=True, exist_ok=True)
        output_dir.info("sync_clean_workspace: Fully purged inputs and outputs.")