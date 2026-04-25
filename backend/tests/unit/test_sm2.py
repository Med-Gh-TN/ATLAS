from app.utils.sm2 import calculate_sm2


def test_sm2_resets_failed_card() -> None:
    repetitions, ease_factor, interval = calculate_sm2(0, 3, 2.5, 10)
    assert repetitions == 0
    assert interval == 1
    assert ease_factor >= 1.3


def test_sm2_advances_well_reviewed_card() -> None:
    repetitions, ease_factor, interval = calculate_sm2(5, 2, 2.5, 6)
    assert repetitions == 3
    assert interval >= 15
    assert ease_factor > 2.5
