from app.utils.arabic import normalize_arabic


def test_normalize_arabic_strips_diacritics() -> None:
    assert normalize_arabic("السَّلَامُ عَلَيْكُمْ") == "السلام عليكم"


def test_normalize_arabic_normalizes_variants() -> None:
    assert normalize_arabic("إلى مدرسة") == "الي مدرسه"
