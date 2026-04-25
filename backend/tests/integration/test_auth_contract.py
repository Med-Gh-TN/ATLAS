import os
import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://atlas_test_user:atlas_test_password@localhost:5432/atlas_test_db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("REDIS_CACHE_URL", "redis://localhost:6379/1")
os.environ.setdefault("CELERY_BROKER_URL", "redis://localhost:6379/0")
os.environ.setdefault("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
os.environ.setdefault("MINIO_ACCESS_KEY", "minio_admin")
os.environ.setdefault("MINIO_SECRET_KEY", "minio_password")
os.environ.setdefault("MINIO_ENDPOINT", "localhost:9000")
os.environ.setdefault("MINIO_BUCKET_NAME", "atlas-documents")

from app.core.exceptions import install_exception_handlers
from app.core.redis import get_redis_client
from app.db.session import get_session
from app.models.user import User, UserRole
from app.routers.auth import router as auth_router


class FakeExecuteResult:
    def __init__(self, user: User | None):
        self._user = user

    def scalar_one_or_none(self) -> User | None:
        return self._user

    def scalar_one(self) -> User:
        if self._user is None:
            raise AssertionError("Expected user to exist")
        return self._user


class FakeSession:
    def __init__(self, user: User | None):
        self.user = user
        self.flushed = False
        self.committed = False

    async def execute(self, _query: Any) -> FakeExecuteResult:
        return FakeExecuteResult(self.user)

    def add(self, value: Any) -> None:
        self.user = value

    async def flush(self) -> None:
        self.flushed = True

    async def commit(self) -> None:
        self.committed = True

    async def rollback(self) -> None:
        return None

    async def refresh(self, _value: Any) -> None:
        return None


class FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, int] = {}

    async def get(self, key: str) -> int | None:
        return self.store.get(key)

    async def ttl(self, _key: str) -> int:
        return -1

    async def setex(self, key: str, _ttl: int, value: int) -> None:
        self.store[key] = value

    async def incr(self, key: str) -> None:
        self.store[key] = int(self.store.get(key, 0)) + 1

    async def exists(self, key: str) -> int:
        return 1 if key in self.store else 0


def _build_app(fake_session: FakeSession, fake_redis: FakeRedis) -> TestClient:
    app = FastAPI()
    install_exception_handlers(app)
    app.include_router(auth_router, prefix="/v1/auth")

    async def override_session():
        yield fake_session

    async def override_redis():
        yield fake_redis

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_redis_client] = override_redis
    return TestClient(app)


def test_login_returns_contract_shape(monkeypatch) -> None:
    user = User(
        id="00000000-0000-0000-0000-000000000001",
        email="student@example.com",
        full_name="Atlas Student",
        role=UserRole.STUDENT,
        hashed_password="hashed",
        is_active=True,
        is_verified=True,
        onboarding_completed=False,
    )
    fake_session = FakeSession(user)
    client = _build_app(fake_session, FakeRedis())

    from app.routers import auth as auth_module

    async def fake_authenticate_user(*_args, **_kwargs):
        return user

    def fake_create_user_tokens(*_args, **_kwargs):
        return "access-token", "refresh-token"

    monkeypatch.setattr(auth_module.auth_service, "authenticate_user", fake_authenticate_user)
    monkeypatch.setattr(auth_module.auth_service, "create_user_tokens", fake_create_user_tokens)

    response = client.post(
        "/v1/auth/login",
        json={"email": "student@example.com", "password": "password123"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["accessToken"] == "access-token"
    assert body["refreshToken"] == "refresh-token"
    assert body["user"]["email"] == "student@example.com"
    assert body["user"]["role"] == "STUDENT"
    assert "refresh_token=" in response.headers.get("set-cookie", "")


def test_verify_otp_returns_specific_error_code(monkeypatch) -> None:
    user = User(
        id="00000000-0000-0000-0000-000000000001",
        email="student@example.com",
        full_name="Atlas Student",
        role=UserRole.STUDENT,
        hashed_password="hashed",
        is_active=False,
        is_verified=False,
        onboarding_completed=False,
    )
    fake_session = FakeSession(user)
    client = _build_app(fake_session, FakeRedis())

    from app.routers import auth as auth_module

    async def fake_verify_email_otp_result(*_args, **_kwargs):
        return {"ok": False, "reason": "OTP_EXPIRED"}

    monkeypatch.setattr(auth_module.otp_service, "verify_email_otp_result", fake_verify_email_otp_result)

    response = client.post(
        "/v1/auth/verify-otp",
        json={"email": "student@example.com", "otp_code": "123456", "purpose": "ACCOUNT_ACTIVATION"},
    )

    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "OTP_EXPIRED"
