
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from jose import JWTError, jwt
from app.db.session import get_session
from app.models.all_models import User, UserCreate, UserRead
from app.core import security
from app.core.config import settings
from app.core.limits import limiter
from pydantic import BaseModel, EmailStr
from app.services.auth_service import create_email_otp, verify_email_otp

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme), session: AsyncSession = Depends(get_session)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalars().first()
    if user is None:
        raise credentials_exception
    return user

@router.post("/register", response_model=UserRead, dependencies=[Depends(limiter(5, 60))])
async def register(user_in: UserCreate, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(User).where(User.email == user_in.email))
    existing_user = result.scalars().first()
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="User with this email already exists"
        )
    
    try:
        user = User(
            email=user_in.email,
            full_name=user_in.full_name,
            role=user_in.role,
            filiere=user_in.filiere,
            level=user_in.level,
            hashed_password=security.get_password_hash(user_in.password),
            is_verified=False
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        await create_email_otp(session=session, user=user, ttl_minutes=settings.OTP_EXPIRE_MINUTES)
        return user
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=500, detail=str(e))

class OTPRequest(BaseModel):
    email: EmailStr

class OTPVerify(BaseModel):
    email: EmailStr
    code: str

@router.post("/request-otp", dependencies=[Depends(limiter(3, 3600))])
async def request_otp(payload: OTPRequest, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(User).where(User.email == payload.email))
    user = result.scalars().first()
    if user:
        await create_email_otp(session=session, user=user, ttl_minutes=settings.OTP_EXPIRE_MINUTES)
    return {"status": "ok"}

@router.post("/verify-otp")
async def verify_otp(payload: OTPVerify, session: AsyncSession = Depends(get_session)):
    ok = await verify_email_otp(session=session, email=str(payload.email), code=payload.code)
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    return {"status": "verified"}

@router.post("/login", dependencies=[Depends(limiter(10, 60))])
async def login(form_data: OAuth2PasswordRequestForm = Depends(), session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(User).where(User.email == form_data.username))
    user = result.scalars().first()
    
    if not user or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email not verified")
    
    access_token_expires = security.timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        data={"sub": user.email, "role": user.role}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserRead)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user
