import io
import uuid
import logging
import re
import secrets
from datetime import datetime, timedelta
from typing import Dict, Any, List, Tuple

import pandas as pd
import xlsxwriter
from fastapi import UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.exc import SQLAlchemyError

from app.core.security import get_password_hash
from app.models.user import User, UserRole, Establishment, Department, TeacherProfile

# DEFENSIVE ARCHITECTURE: Import strictly from the communications domain
try:
    from app.services.communications.email_service import send_teacher_invitation_email
except ImportError:
    # Stub for development if email service is not yet migrated
    def send_teacher_invitation_email(*args, **kwargs):
        logging.getLogger(__name__).warning("Email service stub called.")
        return True

logger = logging.getLogger(__name__)

# ==========================================
# TEMPLATE GENERATION ENGINE
# ==========================================

async def generate_dynamic_teacher_template(
    admin_user: User,
    session: AsyncSession
) -> StreamingResponse:
    """
    SOTA Dynamic Template Generator.
    Builds an authentic `.xlsx` file embedding native Excel Dropdown UI mechanisms
    (Data Validation) mapped to the real-time active list of departments for this tenant.
    """
    est_id = admin_user.establishment_id
    if not est_id:
        raise ValueError("Admin is not bound to a valid establishment.")

    # Fetch departments for the admin's tenant
    dept_res = await session.execute(
        select(Department).where(Department.establishment_id == est_id)
    )
    departments = [d.name for d in dept_res.scalars().all()]

    # In-memory workbook generation
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    worksheet = workbook.add_worksheet('Teachers Import')

    # Styling
    header_format = workbook.add_format({
        'bold': True,
        'bg_color': '#4C1D95', # ATLAS Purple
        'font_color': 'white',
        'border': 1
    })

    headers = ['email', 'full_name', 'department_name']
    for col_num, header in enumerate(headers):
        worksheet.write(0, col_num, header, header_format)

    worksheet.set_column('A:B', 25)
    worksheet.set_column('C:C', 35)

    if not departments:
        departments = ["NO DEPARTMENTS EXIST - PLEASE CREATE ONE IN THE DASHBOARD"]

    # Excel Data Validation applies native Dropdowns preventing malformed strings at source
    worksheet.data_validation('C2:C500', {
        'validate': 'list',
        'source': departments,
        'input_title': 'Select Department',
        'input_message': 'Choose from the predefined institutional list',
        'error_title': 'Invalid Department',
        'error_message': 'You must select exactly from the dropdown map to pass SOTA validation.'
    })

    workbook.close()
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=teacher_import_template.xlsx"}
    )


# ==========================================
# BATCH IMPORT ENGINE
# ==========================================

async def process_teacher_batch_import(
    file: UploadFile,
    admin_user: User,
    session: AsyncSession
) -> Dict[str, Any]:
    """
    US-05: Batch imports teachers via CSV or XLSX.
    Validates institutional domains, prevents duplicates, sets isActive=False,
    generates a secure single-use token, and triggers onboarding emails.
    """
    content = await file.read()

    # 1. Parse File Content safely
    try:
        if file.filename.lower().endswith('.csv'):
            df = pd.read_csv(io.BytesIO(content), dtype=str)
        else:
            df = pd.read_excel(io.BytesIO(content), dtype=str, engine='openpyxl')
    except Exception as e:
        logger.error(f"[IAM] CSV Parsing failure: {str(e)}")
        raise ValueError("Failed to parse file. Ensure it is a valid UTF-8 formatted CSV or XLSX.")

    # 2. Schema Validation
    required_cols = {'email', 'full_name', 'department_name'}
    if not required_cols.issubset(df.columns):
        raise ValueError(f"File is missing required columns. Must contain exactly: {required_cols}")

    # Clean data upfront to prevent downstream string matching errors
    df['email'] = df['email'].str.strip().str.lower()
    df['full_name'] = df['full_name'].str.strip()
    df['department_name'] = df['department_name'].str.strip()

    # --- BATCH QUERY OPTIMIZATION (Prevent N+1) ---
    emails = df['email'].dropna().tolist()

    # Extract domains: prof@univ-paris.fr -> univ-paris.fr
    domains = [str(e).split('@')[-1].lower() for e in emails if '@' in str(e)]
    department_names = df['department_name'].dropna().unique().tolist()

    try:
        # A. Fetch Existing Users (Duplicates)
        existing_users_res = await session.execute(select(User.email).where(User.email.in_(emails)))
        existing_emails = set(existing_users_res.scalars().all())

        # B. Fetch Allowed Establishments by extracted domains
        est_res = await session.execute(select(Establishment).where(Establishment.domain.in_(domains)))
        establishments_by_domain = {e.domain.lower(): e for e in est_res.scalars().all()}

        # C. Fetch Departments matching the names found in the CSV
        dept_res = await session.execute(select(Department).where(Department.name.in_(department_names)))
        departments_map = {(d.name, str(d.establishment_id)): d for d in dept_res.scalars().all()}

    except SQLAlchemyError as e:
        logger.error(f"[IAM] Database error during batch pre-fetching: {str(e)}")
        raise RuntimeError("Database pre-fetch failed due to a critical error.")

    # --- VALIDATION LOOP ---
    report = {"success_count": 0, "errors": [], "duplicates": []}
    valid_users_to_process = []

    email_regex = re.compile(r"^[\w\.-]+@([\w\.-]+\.\w+)$")

    for index, row in df.iterrows():
        row_num = index + 2 # +2 accounts for 0-index and CSV header
        email = str(row['email'])
        full_name = str(row['full_name'])
        dept_name = str(row['department_name'])

        # Format Validation
        match = email_regex.match(email)
        if not match:
            report["errors"].append({"row": row_num, "email": email, "reason": "Malformed email format"})
            continue

        domain = match.group(1).lower()

        # Duplicate Detection
        if email in existing_emails:
            report["duplicates"].append({"row": row_num, "email": email})
            continue

        # Institutional Domain Validation (Security)
        est = establishments_by_domain.get(domain)
        if not est:
            reason = f"Unauthorized domain: '{domain}' is not registered as an Establishment"
            report["errors"].append({"row": row_num, "email": email, "reason": reason})
            continue

        # Department Validation
        dept = departments_map.get((dept_name, str(est.id)))
        if not dept:
            reason = f"Department '{dept_name}' not found within establishment '{est.name}'"
            report["errors"].append({"row": row_num, "email": email, "reason": reason})
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
                is_active=False,  # Strict US-05: Accounts must be activated via Token -> OTP
                is_verified=False
            )
            session.add(new_user)
            staged_users.append((new_user, data["department"], data["establishment"]))

        # Flush to generate UUIDs for the new users
        await session.flush()

        # Create profiles and dispatch Tokens
        for new_user, dept, est in staged_users:

            # CORE LOGIC CHANGE: Generate secure token instead of raw OTP
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
            email_dispatched = send_teacher_invitation_email(
                to_email=new_user.email,
                otp_code=secure_token, # TEMPORARY: Passing token through old parameter until email service refactor
                teacher_name=new_user.full_name,
                department_name=dept.name
            )

            if email_dispatched:
                report["success_count"] += 1
            else:
                logger.error(f"[IAM] Critical Failure: Failed to dispatch Invitation Email for {new_user.email}")

        # Commit the transaction block atomically
        await session.commit()
        return report

    except Exception as e:
        await session.rollback()
        logger.error(f"[IAM] Transaction rollback during batch teacher import: {str(e)}", exc_info=True)
        raise RuntimeError("A critical database error occurred. Transaction rolled back.")