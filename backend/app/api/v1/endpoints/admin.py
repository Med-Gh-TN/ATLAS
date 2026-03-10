from typing import List
from fastapi import APIRouter, UploadFile, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.core.rbac import require_roles
from app.models.new.user import User, UserRole, UserCreate
from app.core.security import get_password_hash
import pandas as pd
import io
import uuid

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
        
        # Check if user exists
        # Note: In a real batch, we'd query all emails at once for performance
        # but for simplicity/ MVP we iterate.
        # Ideally, move this to a service.
        from sqlalchemy.future import select
        existing = await session.execute(select(User).where(User.email == email))
        if existing.scalars().first():
            results["errors"].append(f"Row {index}: Email {email} already exists")
            continue
            
        # Create Teacher Account
        # Generate a random temporary password
        temp_password = uuid.uuid4().hex[:12]
        
        new_user = User(
            email=email,
            full_name=full_name,
            hashed_password=get_password_hash(temp_password),
            role=UserRole.TEACHER,
            is_active=True,
            is_verified=True # Admin imported, so verified
        )
        session.add(new_user)
        results["imported"] += 1
        
        # TODO: Send email with temp_password via Resend API
        # email_service.send_invite(email, temp_password)

    await session.commit()
    return results
