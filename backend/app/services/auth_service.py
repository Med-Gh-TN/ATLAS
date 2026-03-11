import secrets
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core import security
from app.models.all_models import OTPToken, OTPPurpose, User
from app.services.email_service import send_otp_email


def _generate_otp_code() -> str:
    try:
        import pyotp
        return pyotp.TOTP(pyotp.random_base32(), digits=6, interval=30).now()
    except Exception:
        return f"{secrets.randbelow(1_000_000):06d}"


async def create_email_otp(session: AsyncSession, user: User, ttl_minutes: int = 10, purpose: OTPPurpose = OTPPurpose.VERIFY_EMAIL) -> OTPToken:
    code = _generate_otp_code()
    token = OTPToken(
        user_id=user.id,
        purpose=purpose,
        otp_code_hash=security.get_password_hash(code),
        expires_at=datetime.utcnow() + timedelta(minutes=ttl_minutes),
    )
    session.add(token)
    await session.commit()
    await session.refresh(token)
    send_otp_email(user.email, code)
    return token


async def verify_email_otp(session: AsyncSession, email: str, code: str, allowed_purposes: tuple[OTPPurpose, ...] = (OTPPurpose.VERIFY_EMAIL, OTPPurpose.TEACHER_INVITE)) -> bool:
    res = await session.execute(select(User).where(User.email == email))
    user = res.scalars().first()
    if not user:
        return False

    q = (
        select(OTPToken)
        .where(OTPToken.user_id == user.id)
        .where(OTPToken.purpose.in_(allowed_purposes))
        .where(OTPToken.consumed_at.is_(None))
        .order_by(OTPToken.created_at.desc())
        .limit(1)
    )
    tok_res = await session.execute(q)
    token = tok_res.scalars().first()
    if not token:
        return False
    if token.expires_at < datetime.utcnow():
        return False
    if not security.verify_password(code, token.otp_code_hash):
        return False

    token.consumed_at = datetime.utcnow()
    user.is_verified = True
    session.add(token)
    session.add(user)
    await session.commit()
    return True
