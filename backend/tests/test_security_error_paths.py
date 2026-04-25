import sys
from unittest.mock import MagicMock

# Mock dependencies before they are imported
mock_bcrypt = MagicMock()
sys.modules["bcrypt"] = mock_bcrypt

mock_jose = MagicMock()
sys.modules["jose"] = mock_jose
sys.modules["jose.jwt"] = MagicMock()
sys.modules["jose.JWTError"] = type("JWTError", (Exception,), {})

# Mock pydantic and pydantic_settings
mock_pydantic = MagicMock()
sys.modules["pydantic"] = mock_pydantic
sys.modules["pydantic_settings"] = MagicMock()

# Mock settings
mock_settings = MagicMock()
mock_settings.SECRET_KEY = "test_secret"
mock_settings.ALGORITHM = "HS256"

# Create a mock app.core.config module
mock_config = MagicMock()
mock_config.settings = mock_settings
sys.modules["app.core.config"] = mock_config

import pytest
from app.core.security import verify_password, get_password_hash

def test_verify_password_success():
    # Setup mock
    mock_bcrypt.checkpw.return_value = True
    mock_bcrypt.checkpw.side_effect = None

    # Correct password should return True
    result = verify_password("plain", "hashed")

    assert result is True
    mock_bcrypt.checkpw.assert_called()

def test_verify_password_failure():
    # Setup mock
    mock_bcrypt.checkpw.return_value = False
    mock_bcrypt.checkpw.side_effect = None

    # Incorrect password should return False
    result = verify_password("plain", "wrong_hash")

    assert result is False
    mock_bcrypt.checkpw.assert_called()

def test_verify_password_value_error():
    # Setup mock to raise ValueError (simulating invalid hash format)
    mock_bcrypt.checkpw.side_effect = ValueError("Invalid hash")

    result = verify_password("plain", "invalid_hash")

    assert result is False

def test_verify_password_type_error():
    # Setup mock to raise TypeError (simulating invalid input types)
    mock_bcrypt.checkpw.side_effect = TypeError("Invalid type")

    # The code handles TypeError from bcrypt.checkpw
    result = verify_password("plain", "hashed")

    assert result is False

def test_verify_password_attribute_error():
    # plain_password.encode('utf-8') will raise AttributeError if plain_password is None
    # Now it should be caught by the try-except block
    result = verify_password(None, "hashed") # type: ignore
    assert result is False

    result = verify_password("plain", None) # type: ignore
    assert result is False

    result = verify_password("plain", 123) # type: ignore
    assert result is False

def test_get_password_hash():
    mock_bcrypt.gensalt.return_value = b"salt"
    mock_bcrypt.hashpw.return_value = b"hashed_bytes"

    result = get_password_hash("password")

    assert result == "hashed_bytes"
    mock_bcrypt.gensalt.assert_called_with(rounds=12)
    mock_bcrypt.hashpw.assert_called()
