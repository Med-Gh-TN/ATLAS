import io
import uuid
import logging
import re
import secrets
from datetime import datetime, timedelta

import pandas as pd
from fastapi import APIRouter, UploadFile, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.exc import SQLAlchemyError
from pydantic import BaseModel
from typing import List

from app.db.session import get_session
from app.core.rbac import require_roles
from app.core.security import get_password_hash
from app.models.user import User, UserRole, Establishment, Department, TeacherProfile
from app.services.email_service import send_teacher_invitation_email
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# Response Schemas for clear Frontend Typings
class ImportErrorDetail(BaseModel):
    row: int
    email: str
    reason: str

class ImportDuplicateDetail(BaseModel):
    row: int
    email: str

class ImportReportResponse(BaseModel):
    success_count: int
    errors: List[ImportErrorDetail]
    duplicates: List[ImportDuplicateDetail]


@router.post("/teachers/import", response_model=ImportReportResponse)
async def import_teachers(
    file: UploadFile,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    session: AsyncSession = Depends(get_session)
):
    """
    US-05 (Updated): Batch imports teachers via CSV.
    Validates institutional domains, prevents duplicates, sets isActive=False, 
    generates a secure single-use token, and triggers the onboarding email with a magic link.
    """
    if not file.filename.lower().endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Invalid file format. Please upload a strictly formatted CSV file."
        )
    
    content = await file.read()
    try:
        # We enforce string types to prevent pandas from inferring weird numeric formats
        df = pd.read_csv(io.BytesIO(content), dtype=str)
    except Exception as e:
        logger.error(f"CSV Parsing failure: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Failed to parse CSV. Ensure it is a valid UTF-8 formatted file."
        )
    
    # Required columns per US-05 mapping needs
    required_cols = {'email', 'full_name', 'department_name'}
    if not required_cols.issubset(df.columns):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"CSV is missing required columns. Must contain exactly: {required_cols}"
        )
    
    # Clean data upfront to prevent downstream string matching errors
    df['email'] = df['email'].str.strip().str.lower()
    df['full_name'] = df['full_name'].str.strip()
    df['department_name'] = df['department_name'].str.strip()

    # --- BATCH QUERY OPTIMIZATION (Prevent N+1) ---
    emails = df['email'].dropna().tolist()
    
    # Extract domains: prof@univ-paris.fr -> univ-paris.fr (Strictly lowercase for matching)
    domains = [str(e).split('@')[-1].lower() for e in emails if '@' in str(e)]
    department_names = df['department_name'].dropna().unique().tolist()

    try:
        # 1. Fetch Existing Users (Duplicates)
        existing_users_res = await session.execute(select(User.email).where(User.email.in_(emails)))
        existing_emails = set(existing_users_res.scalars().all())

        # 2. Fetch Allowed Establishments by extracted domains
        est_res = await session.execute(select(Establishment).where(Establishment.domain.in_(domains)))
        establishments_by_domain = {e.domain.lower(): e for e in est_res.scalars().all()}

        # 3. Fetch Departments matching the names found in the CSV
        dept_res = await session.execute(select(Department).where(Department.name.in_(department_names)))
        # Map as (department_name, establishment_id) to ensure correct institutional linkage
        departments_map = {(d.name, str(d.establishment_id)): d for d in dept_res.scalars().all()}
        
    except SQLAlchemyError as e:
        logger.error(f"Database error during batch pre-fetching: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Database pre-fetch failed.")

    # --- VALIDATION LOOP ---
    report = ImportReportResponse(success_count=0, errors=[], duplicates=[])
    valid_users_to_process = []
    
    email_regex = re.compile(r"^[\w\.-]+@([\w\.-]+\.\w+)$")

    for index, row in df.iterrows():
        row_num = index + 2 # +2 accounts for 0-index and CSV header
        email = str(row['email'])
        full_name = str(row['full_name'])
        dept_name = str(row['department_name'])
        
        # 1. Basic Format Validation
        match = email_regex.match(email)
        if not match:
            report.errors.append(ImportErrorDetail(row=row_num, email=email, reason="Malformed email format"))
            logger.warning(f"[AUDIT] Admin Import Rejection: Malformed email '{email}' at row {row_num}.")
            continue
            
        domain = match.group(1).lower()

        # 2. Duplicate Detection
        if email in existing_emails:
            report.duplicates.append(ImportDuplicateDetail(row=row_num, email=email))
            logger.info(f"[AUDIT] Admin Import Rejection: Duplicate email '{email}' detected at row {row_num}.")
            continue

        # 3. Institutional Domain Validation (Security)
        est = establishments_by_domain.get(domain)
        if not est:
            reason = f"Unauthorized domain: '{domain}' is not registered as an Establishment"
            report.errors.append(ImportErrorDetail(row=row_num, email=email, reason=reason))
            logger.warning(f"[AUDIT] Admin Import Rejection: Security Domain Whitelist Bypass Attempt. Email '{email}' rejected. Domain '{domain}' unknown.")
            continue

        # 4. Department Validation
        dept = departments_map.get((dept_name, str(est.id)))
        if not dept:
            reason = f"Department '{dept_name}' not found within establishment '{est.name}'"
            report.errors.append(ImportErrorDetail(row=row_num, email=email, reason=reason))
            logger.warning(f"[AUDIT] Admin Import Rejection: Invalid Department '{dept_name}' for Establishment '{est.name}' at row {row_num}.")
            continue

        valid_users_to_process.append({
            "email": email,
            "full_name": full_name,
            "department": dept,
            "establishment": est
        })

    # --- BATCH INSERTION & TOKEN DISPATCH ---
    if not valid_users_to_process:
        return report # Return early if nothing to process

    try:
        staged_users = []
        for data in valid_users_to_process:
            # Generate highly secure, random temp password (will be overwritten during OTP activation)
            temp_password = uuid.uuid4().hex + uuid.uuid4().hex 
            
            new_user = User(
                email=data["email"],
                full_name=data["full_name"],
                hashed_password=get_password_hash(temp_password),
                role=UserRole.TEACHER,
                is_active=False,  # US-05 Strict: Accounts must be activated via Token -> OTP
                is_verified=False
            )
            session.add(new_user)
            staged_users.append((new_user, data["department"], data["establishment"]))
            
        # Flush to generate UUIDs for the new users
        await session.flush()
        
        # Create profiles and dispatch Tokens
        for new_user, dept, est in staged_users:
            
            # CORE LOGIC CHANGE: Generate secure token instead of OTP
            secure_token = secrets.token_urlsafe(32)
            expiration_time = datetime.utcnow() + timedelta(hours=48)
            
            profile = TeacherProfile(
                user_id=new_user.id,
                department_id=dept.id,
                invite_token=secure_token,
                invite_expires_at=expiration_time
            )
            session.add(profile)
            
            # SOTA SIDE-EFFECT: Dispatch the email containing the token
            # Note: We temporarily pass the token as the 'otp_code' argument to the email service 
            # until we refactor the email service in the next step to handle the magic link properly.
            email_dispatched = send_teacher_invitation_email(
                to_email=new_user.email,
                otp_code=secure_token, # TEMPORARY: Passing token through old parameter
                teacher_name=new_user.full_name,
                department_name=dept.name
            )
            
            if email_dispatched:
                report.success_count += 1
            else:
                logger.error(f"[AUDIT] Critical Failure: Failed to dispatch Invitation Email for imported user {new_user.email}")
                
        # Commit the transaction block atomically
        await session.commit()
        return report
        
    except Exception as e:
        await session.rollback()
        logger.error(f"[AUDIT] Transaction rollback during batch teacher import: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="A critical database error occurred. Transaction rolled back."
        )