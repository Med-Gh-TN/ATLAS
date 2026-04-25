import uuid
import logging
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from sqlalchemy.future import select
from sqlalchemy.exc import SQLAlchemyError
from pydantic import BaseModel

from app.db.session import get_session
from app.core.rbac import require_roles
from app.models.user import User, UserRole, Department, TeacherProfile

logger = logging.getLogger(__name__)

router = APIRouter()

# --- Pydantic Schemas ---
class DepartmentCreate(BaseModel):
    name: str

class DepartmentUpdate(BaseModel):
    name: str

class DepartmentResponse(BaseModel):
    id: uuid.UUID
    name: str
    establishment_id: uuid.UUID
    created_at: datetime
    teachers_count: int = 0


# --- Department Endpoints ---

@router.get("/departments", response_model=List[DepartmentResponse])
async def list_departments(
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    session: AsyncSession = Depends(get_session)
):
    """
    List all departments belonging to the Admin's establishment.
    """
    est_id = current_user.establishment_id
    if not est_id:
        raise HTTPException(status_code=403, detail="Admin not linked to an establishment.")

    try:
        query = text("""
        SELECT d.id, d.name, d.establishment_id, d.created_at, COUNT(tp.id) as teachers_count
        FROM department d
        LEFT JOIN teacherprofile tp ON d.id = tp.department_id
        WHERE d.establishment_id = :est_id
        GROUP BY d.id, d.name, d.establishment_id, d.created_at
        ORDER BY d.name
        """)

        result = await session.execute(query, {"est_id": str(est_id).replace("-", "") if not isinstance(est_id, str) else est_id})
        departments = []

        for row in result:
            departments.append(DepartmentResponse(
                id=row.id,
                name=row.name,
                establishment_id=row.establishment_id,
                created_at=row.created_at,
                teachers_count=row.teachers_count or 0
            ))

        return departments
    except SQLAlchemyError as e:
        logger.error(f"Database error fetching departments: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch departments"
        )


@router.post("/departments", response_model=DepartmentResponse)
async def create_department(
    payload: DepartmentCreate,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    session: AsyncSession = Depends(get_session)
):
    """
    Create a new department linked to the current user's establishment.
    """
    est_id = current_user.establishment_id
    if not est_id:
        raise HTTPException(status_code=403, detail="Admin not linked to an establishment.")

    try:
        existing = await session.execute(
            select(Department).where(
                (Department.name == payload.name.strip()) &
                (Department.establishment_id == est_id)
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Department name already exists in your establishment")

        new_dept = Department(
            name=payload.name.strip(),
            establishment_id=est_id
        )
        session.add(new_dept)
        await session.commit()
        await session.refresh(new_dept)

        return DepartmentResponse(
            id=new_dept.id,
            name=new_dept.name,
            establishment_id=new_dept.establishment_id,
            created_at=new_dept.created_at,
            teachers_count=0
        )
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"Database error creating department: {str(e)}")
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create department"
        )


@router.put("/departments/{department_id}", response_model=DepartmentResponse)
async def update_department(
    department_id: uuid.UUID,
    payload: DepartmentUpdate,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    session: AsyncSession = Depends(get_session)
):
    """
    Rename an existing department.
    """
    est_id = current_user.establishment_id
    if not est_id:
        raise HTTPException(status_code=403, detail="Admin not linked to an establishment.")

    try:
        result = await session.execute(
            select(Department).where(
                (Department.id == department_id) &
                (Department.establishment_id == est_id)
            )
        )
        existing = result.scalar_one_or_none()

        if not existing:
            raise HTTPException(status_code=404, detail="Department not found in your establishment")

        # Check duplicate
        name_check = await session.execute(
            select(Department).where(
                (Department.name == payload.name.strip()) &
                (Department.establishment_id == est_id) &
                (Department.id != department_id)
            )
        )
        if name_check.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Another department already uses this name")

        existing.name = payload.name.strip()
        await session.commit()
        await session.refresh(existing)

        return DepartmentResponse(
            id=existing.id,
            name=existing.name,
            establishment_id=existing.establishment_id,
            created_at=existing.created_at,
            teachers_count=0 # Optimistic return without extra query
        )
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"Database error updating department: {str(e)}")
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update department"
        )


@router.delete("/departments/{department_id}")
async def delete_department(
    department_id: uuid.UUID,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    session: AsyncSession = Depends(get_session)
):
    """
    Delete a department safely.
    """
    est_id = current_user.establishment_id
    if not est_id:
        raise HTTPException(status_code=403, detail="Admin not linked to an establishment.")

    try:
        result = await session.execute(
            select(Department).where(
                (Department.id == department_id) &
                (Department.establishment_id == est_id)
            )
        )
        existing = result.scalar_one_or_none()

        if not existing:
            raise HTTPException(status_code=404, detail="Department not found")

        # Validation-based delete
        teachers_res = await session.execute(
            select(TeacherProfile).where(TeacherProfile.department_id == department_id)
        )
        if teachers_res.scalars().all():
            raise HTTPException(
                status_code=400,
                detail="Cannot delete department. Teachers are mapped to it. Please reassign them first."
            )

        await session.delete(existing)
        await session.commit()

        return {"message": "Department deleted successfully"}

    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"Database error deleting department: {str(e)}")
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete department"
        )