import uuid
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app

# Ensure Windows async compatibility if running on Windows machines locally
import asyncio
if hasattr(asyncio, "WindowsSelectorEventLoopPolicy"):
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

client = TestClient(app)

# --- Test Helpers & Mocks ---

def get_random_email():
    """Generates a unique email to avoid database collision between test runs."""
    return f"test_{uuid.uuid4().hex[:8]}@example.com"

# Deterministic OTP code for testing cryptographic verification without needing to intercept emails
MOCK_OTP_CODE = "123456"

@pytest.fixture(autouse=True)
def mock_email_and_otp():
    """
    Automatically mock OTP generation and Email dispatch for all tests.
    This prevents network calls to the Resend API during testing and allows 
    us to know the exact OTP code to test the /verify-otp endpoint.
    """
    with patch("app.services.auth_service._generate_otp_code", return_value=MOCK_OTP_CODE), \
         patch("app.services.auth_service.send_otp_email", return_value=True):
        yield

# --- Test Suite ---

def test_register_user_success():
    """Test nominal registration flow enforces inactive state until OTP is verified."""
    email = get_random_email()
    payload = {
        "email": email,
        "full_name": "Test User",
        "password": "SecurePassword123!",
        "role": "STUDENT"
    }
    response = client.post("/api/v1/auth/register", json=payload)
    
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["email"] == email
    # US-03 Constraint: Users must be inactive and unverified upon creation
    assert data["is_verified"] is False
    assert data["is_active"] is False  

def test_register_existing_user():
    """Test that duplicate registrations are blocked."""
    email = get_random_email()
    payload = {"email": email, "password": "SecurePassword123!", "role": "STUDENT"}
    
    # First registration
    client.post("/api/v1/auth/register", json=payload)
    
    # Second registration should be rejected
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]

def test_login_unverified_user():
    """Test that a user cannot log in before verifying their OTP."""
    email = get_random_email()
    payload = {"email": email, "password": "SecurePassword123!", "role": "STUDENT"}
    client.post("/api/v1/auth/register", json=payload)
    
    # Attempt login before OTP verification
    response = client.post(
        "/api/v1/auth/login", 
        data={"username": email, "password": "SecurePassword123!"},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    # US-03 Constraint: 403 Forbidden until verified
    assert response.status_code == 403
    assert "not activated or verified" in response.json()["detail"]

def test_verify_otp_success_and_login():
    """Test the complete, successful lifecycle of registration -> verification -> login."""
    email = get_random_email()
    password = "SecurePassword123!"
    payload = {"email": email, "password": password, "role": "STUDENT"}
    
    # 1. Register
    client.post("/api/v1/auth/register", json=payload)
    
    # 2. Verify OTP (using our mocked deterministic code)
    verify_payload = {"email": email, "code": MOCK_OTP_CODE}
    verify_response = client.post("/api/v1/auth/verify-otp", json=verify_payload)
    assert verify_response.status_code == 200
    assert "successfully verified" in verify_response.json()["message"]
    
    # 3. Login now that user is verified and activated
    login_response = client.post(
        "/api/v1/auth/login", 
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    
    # 4. Check profile endpoint
    me_response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_response.status_code == 200
    me_data = me_response.json()
    assert me_data["email"] == email
    # US-03 Constraint: State transition verified
    assert me_data["is_verified"] is True
    assert me_data["is_active"] is True

def test_verify_otp_invalid_code():
    """Test that an incorrect OTP code fails securely."""
    email = get_random_email()
    payload = {"email": email, "password": "SecurePassword123!", "role": "STUDENT"}
    client.post("/api/v1/auth/register", json=payload)
    
    # Submit incorrect 6-digit code
    verify_payload = {"email": email, "code": "999999"}
    verify_response = client.post("/api/v1/auth/verify-otp", json=verify_payload)
    assert verify_response.status_code == 400
    assert "Invalid or expired" in verify_response.json()["detail"]

def test_request_new_otp():
    """Test the request-otp endpoint functions without exposing user enumeration."""
    email = get_random_email()
    payload = {"email": email, "password": "SecurePassword123!", "role": "STUDENT"}
    client.post("/api/v1/auth/register", json=payload)
    
    # Request new OTP
    req_payload = {"email": email}
    req_response = client.post("/api/v1/auth/request-otp", json=req_payload)
    assert req_response.status_code == 200
    assert "code has been sent" in req_response.json()["message"]