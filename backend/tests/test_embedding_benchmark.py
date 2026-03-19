import time
import pytest
import logging

# Configure test-level logging for visibility during pipeline execution
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def generate_mock_100_page_document() -> str:
    """
    Generates a mock document representing exactly 100 pages.
    Calculated at an average of 500 words per page to simulate heavy academic loads.
    """
    # 50 iterations of this string equals roughly 500 words.
    page_content = "This is a standard academic sentence designed to rigorously test vector embedding generation, chunking logic, and database insertion thresholds. " * 50
    return "\n\n".join([f"--- Page {i} ---\n" + page_content for i in range(1, 101)])

@pytest.mark.benchmark
def test_100_page_embedding_performance():
    """
    US-08 DoD Verification: Benchmark test to ensure 100 pages of text 
    are chunked and embedded in strictly under 90 seconds.
    """
    try:
        from app.services.embedding_tasks import _embed_chunks, get_models
    except ImportError as e:
        pytest.fail(f"Architectural Halt: Import failed. Ensure paths are correct. {e}")

    logger.info("Initializing synthetic 100-page payload...")
    mock_text = generate_mock_100_page_document()

    # Pre-load models (outside the timer to mimic worker initialization)
    logger.info("Loading ML Models...")
    embedding_model, _, device = get_models()

    logger.info(f"Starting precise performance timer for embedding pipeline on {device}...")
    start_time = time.perf_counter()

    # ACT: Execute the pure embedding pipeline synchronously.
    chunked_embeddings = _embed_chunks(text=mock_text, model=embedding_model, device=device)

    end_time = time.perf_counter()
    elapsed_time = end_time - start_time

    logger.info(f"Embedded {len(chunked_embeddings)} chunks in {elapsed_time:.2f} seconds.")

    # ASSERT: Strict performance boundary enforcement
    assert elapsed_time <= 90.0, f"DOD VIOLATION: Embedding process took {elapsed_time:.2f}s, exceeding the 90.0s threshold."