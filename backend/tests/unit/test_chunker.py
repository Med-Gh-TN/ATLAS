import pytest

from app.utils.chunker import chunk_text


def test_chunk_text_splits_with_overlap() -> None:
    text = "a" * 120
    chunks = chunk_text(text, chunk_size=50, overlap=10)
    assert len(chunks) == 3
    assert len(chunks[0]) == 50
    assert len(chunks[1]) == 50


def test_chunk_text_rejects_invalid_overlap() -> None:
    with pytest.raises(ValueError):
        chunk_text("hello", chunk_size=10, overlap=10)
