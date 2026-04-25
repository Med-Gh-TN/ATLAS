from __future__ import annotations

import re
import unicodedata


_DIACRITICS_RE = re.compile(r"[\u064b-\u065f\u0670\u06d6-\u06ed]")


def normalize_arabic(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text)
    normalized = _DIACRITICS_RE.sub("", normalized)
    normalized = normalized.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")
    normalized = normalized.replace("ى", "ي").replace("ة", "ه")
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


__all__ = ["normalize_arabic"]
