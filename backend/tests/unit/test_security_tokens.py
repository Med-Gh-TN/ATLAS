from app.core import security


def test_access_token_contains_expected_claims() -> None:
    token = security.create_access_token({"sub": "user-1", "role": "STUDENT"})
    payload = security.decode_token(token)

    assert payload is not None
    assert payload["sub"] == "user-1"
    assert payload["role"] == "STUDENT"
    assert payload["type"] == "access"
    assert "iat" in payload
    assert "exp" in payload


def test_refresh_token_contains_jti() -> None:
    token = security.create_refresh_token({"sub": "user-1", "role": "STUDENT"})
    payload = security.decode_token(token)

    assert payload is not None
    assert payload["type"] == "refresh"
    assert "jti" in payload
    assert "iat" in payload
