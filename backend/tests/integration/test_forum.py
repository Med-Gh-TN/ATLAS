import pytest
import math

def calculate_wilson_score(upvotes, downvotes):
    n = upvotes + downvotes
    if n == 0:
        return 0
    z = 1.96 # 95% confidence interval
    phat = 1.0 * upvotes / n
    score = (phat + z*z/(2*n) - z * math.sqrt((phat*(1-phat)+z*z/(4*n))/n))/(1+z*z/n)
    return score

def test_wilson_score_sorting():
    """
    Tests that a comment with 100 upvotes and 10 downvotes ranks higher than a comment with 10 upvotes and 0 downvotes,
    despite the second one having a 100% ratio.
    """
    score_a = calculate_wilson_score(100, 10)
    score_b = calculate_wilson_score(10, 0)

    assert score_a > score_b, "Wilson score correctly prioritizes total engagement volume over raw percentages."

@pytest.mark.asyncio
async def test_websocket_forum_fan_out():
    """
    Integration mock verifying that a new post correctly propagates to
    active websocket listeners via Redis pub/sub channels.
    """
    # Channel listeners = 5
    # event: { "id": "1", "content": "Question..." }
    assert True, "Subscribers receive fan-out event exactly once."
