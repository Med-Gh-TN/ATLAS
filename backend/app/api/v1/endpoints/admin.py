import io
import uuid

import pandas as pd
from fastapi import APIRouter, UploadFile, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db.session import get_session
from app.core.rbac import require_roles
from app.models.all_models import User, UserRole, OTPPurpose
from app.core.security import get_password_hash
from app.services.auth_service import create_email_otp

router = APIRouter()

@router.post("/admin/import-teachers")
async def import_teachers(
    file: UploadFile,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    session: AsyncSession = Depends(get_session)
):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload a CSV file.")
    
    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")
    
    required_cols = {'email', 'full_name'}
    if not required_cols.issubset(df.columns):
        raise HTTPException(status_code=400, detail=f"CSV must contain columns: {required_cols}")
    
    results = {"imported": 0, "errors": []}
    
    for index, row in df.iterrows():
        email = row['email']
        full_name = row['full_name']
        
        existing = await session.execute(select(User).where(User.email == email))
        if existing.scalars().first():
            results["errors"].append(f"Row {index}: Email {email} already exists")
            continue
            
        temp_password = uuid.uuid4().hex[:12]
        
        new_user = User(
            email=email,
            full_name=full_name,
            hashed_password=get_password_hash(temp_password),
            role=UserRole.TEACHER,
            is_active=True,
            is_verified=False
        )
        session.add(new_user)
        results["imported"] += 1
        await session.flush()
        await create_email_otp(session=session, user=new_user, purpose=OTPPurpose.TEACHER_INVITE)

    await session.commit()
    return results
