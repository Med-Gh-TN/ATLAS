import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest

from app.core import security
from app.models.user import OTPPurpose
from app.services.iam import otp_service


class FakeScalarResult:
    def __init__(self, value):
        self._value = value

    def first(self):
        return self._value


class FakeExecuteResult:
    def __init__(self, value):
        self._value = value

    def scalars(self):
        return FakeScalarResult(self._value)


class FakeSession:
    def __init__(self, user, token):
        self._user = user
        self._token = token
        self.added = []

    async def execute(self, _query):
        if not hasattr(self, "_seen_user"):
            self._seen_user = True
            return FakeExecuteResult(self._user)
        return FakeExecuteResult(self._token)

    def add(self, value):
        self.added.append(value)

    async def flush(self):
        return None


@pytest.mark.asyncio
async def test_verify_email_otp_result_reports_expired_token() -> None:
    user = SimpleNamespace(id=uuid.uuid4(), email="user@example.com")
    token = SimpleNamespace(
        user_id=user.id,
        purpose=OTPPurpose.ACCOUNT_ACTIVATION,
        otp_code_hash=security.get_password_hash("123456"),
        expires_at=datetime.utcnow() - timedelta(minutes=1),
        attempts=0,
        max_attempts=5,
        is_used=False,
        created_at=datetime.utcnow(),
    )
    session = FakeSession(user, token)

    result = await otp_service.verify_email_otp_result(
        session=session,
        email=user.email,
        code="123456",
        allowed_purposes=(OTPPurpose.ACCOUNT_ACTIVATION,),
    )

    assert result == {"ok": False, "reason": "OTP_EXPIRED"}


@pytest.mark.asyncio
async def test_verify_email_otp_result_reports_invalid_code() -> None:
    user = SimpleNamespace(id=uuid.uuid4(), email="user@example.com")
    token = SimpleNamespace(
        user_id=user.id,
        purpose=OTPPurpose.ACCOUNT_ACTIVATION,
        otp_code_hash=security.get_password_hash("123456"),
        expires_at=datetime.utcnow() + timedelta(minutes=5),
        attempts=0,
        max_attempts=5,
        is_used=False,
        created_at=datetime.utcnow(),
    )
    session = FakeSession(user, token)

    result = await otp_service.verify_email_otp_result(
        session=session,
        email=user.email,
        code="000000",
        allowed_purposes=(OTPPurpose.ACCOUNT_ACTIVATION,),
    )

    assert result == {"ok": False, "reason": "INVALID_OTP"}
