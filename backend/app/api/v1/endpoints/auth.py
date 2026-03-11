from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from typing import Any

from app.db.session import get_session
from app.models.all_models import User, UserCreate, UserRead, OTPPurpose
from app.core import security
from app.core.config import settings
from app.core.limits import limiter
from app.services.auth_service import create_email_otp, verify_email_otp

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

# --- Pydantic Schemas for OTP Flow ---

class OTPRequest(BaseModel):
    """Schema for requesting a new OTP via email."""
    email: EmailStr

class OTPVerify(BaseModel):
    """Schema for verifying a submitted OTP code."""
    email: EmailStr
    code: str

# --- Dependency ---

async def get_current_user(
    token: str = Depends(oauth2_scheme), 
    session: AsyncSession = Depends(get_session)
) -> User:
    """
    Dependency to validate JWT and return the current user object.
    Raises 401 if token is invalid or user does not exist.
    """
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

# --- Endpoints ---

@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(limiter(5, 60))])
async def register(
    user_in: UserCreate, 
    session: AsyncSession = Depends(get_session)
) -> Any:
    """
    Register a new user and trigger the initial OTP email verification.
    """
    result = await session.execute(select(User).where(User.email == user_in.email))
    existing_user = result.scalars().first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists."
        )
    
    try:
        user = User(
            email=user_in.email,
            full_name=user_in.full_name,
            role=user_in.role,
            filiere=user_in.filiere,
            level=user_in.level,
            hashed_password=security.get_password_hash(user_in.password),
            is_verified=False,
            is_active=True
        )
        session.add(user)
        # Flush to generate the User ID, but keep transaction open
        await session.flush() 
        
        otp_created = await create_email_otp(
            session=session, 
            user=user, 
            purpose=OTPPurpose.VERIFY_EMAIL
        )
        
        if not otp_created:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send verification email. Please try again later."
            )
            
        # Finalize the transaction for both the User and the OTPToken
        await session.commit()
        await session.refresh(user)
        return user

    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.post("/verify-otp")
async def verify_otp(
    payload: OTPVerify, 
    session: AsyncSession = Depends(get_session)
) -> Any:
    """
    Verify the OTP code sent to the user's email.
    If successful, the user's 'is_verified' flag is set to True.
    """
    try:
        success = await verify_email_otp(
            session=session, 
            email=payload.email, 
            code=payload.code,
            allowed_purposes=(OTPPurpose.VERIFY_EMAIL, OTPPurpose.TEACHER_INVITE)
        )
        
        if not success:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="Invalid or expired verification code."
            )
            
        # Commit the consumption of the token and the user verification status
        await session.commit()
        return {"message": "Email successfully verified."}
        
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.post("/request-otp", dependencies=[Depends(limiter(3, 3600))])
async def request_otp(
    payload: OTPRequest, 
    session: AsyncSession = Depends(get_session)
) -> Any:
    """
    Resend a new OTP to the user's email if they haven't received it or it expired.
    """
    try:
        result = await session.execute(select(User).where(User.email == payload.email))
        user = result.scalars().first()
        
        if user:
            otp_created = await create_email_otp(session=session, user=user)
            if otp_created:
                await session.commit()
            else:
                await session.rollback()
                
        # Always return 200 to prevent email enumeration attacks
        return {"message": "If the account exists, a new code has been sent."}
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.post("/login", dependencies=[Depends(limiter(10, 60))])
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(), 
    session: AsyncSession = Depends(get_session)
) -> Any:
    """
    Standard OAuth2 compatible token login.
    Strictly enforces that the user must be verified before accessing the system.
    """
    result = await session.execute(select(User).where(User.email == form_data.username))
    user = result.scalars().first()
    
    if not user or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # SOTA Practice: Deny access until email is verified
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Your email address is not verified. Please check your inbox for an OTP code."
        )
    
    access_token_expires = security.timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        data={"sub": user.email, "role": user.role}, 
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserRead)
async def read_users_me(current_user: User = Depends(get_current_user)) -> Any:
    """
    Retrieve current authenticated user profile.
    """
    return current_user