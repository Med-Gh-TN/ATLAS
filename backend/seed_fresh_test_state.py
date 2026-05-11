import asyncio
import os
import uuid
from datetime import UTC, datetime

import asyncpg

from app.core.security import get_password_hash


# DEFENSIVE ARCHITECTURE: Dynamic DB URL resolution
DB_URL = os.getenv("DATABASE_URL", "postgresql://atlas_user:atlas_password@localhost:5433/atlas_db")


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


async def ensure_establishment(conn: asyncpg.Connection, name: str, domain: str) -> str:
    existing = await conn.fetchrow(
        "SELECT id FROM establishment WHERE domain = $1 FOR UPDATE",
        domain,
    )
    if existing:
        return str(existing["id"])

    establishment_id = str(uuid.uuid4())
    await conn.execute(
        """
        INSERT INTO establishment (id, name, domain, is_authorized, created_at)
        VALUES ($1, $2, $3, true, $4)
        """,
        establishment_id,
        name,
        domain,
        utc_now(),
    )
    return establishment_id


async def ensure_department(conn: asyncpg.Connection, establishment_id: str, name: str) -> str:
    # SOTA FIX: removed `allowed_levels`, added `is_deleted` (NOT NULL without default)
    existing = await conn.fetchrow(
        "SELECT id FROM department WHERE establishment_id = $1 AND name = $2 FOR UPDATE",
        establishment_id,
        name,
    )

    if existing:
        # Department already exists; nothing to update
        return str(existing["id"])

    department_id = str(uuid.uuid4())
    await conn.execute(
        """
        INSERT INTO department (id, name, establishment_id, created_at, is_deleted)
        VALUES ($1, $2, $3, $4, false)
        """,
        department_id,
        name,
        establishment_id,
        utc_now(),
    )
    return department_id


async def ensure_major(
    conn: asyncpg.Connection,
    department_id: str,
    name: str,
    level: str,
) -> str:
    """Create a major if it doesn't exist, return its ID."""
    existing = await conn.fetchrow(
        """
        SELECT id FROM major
        WHERE department_id = $1 AND name = $2 AND level = $3::courselevel
        FOR UPDATE
        """,
        department_id,
        name,
        level,
    )
    if existing:
        return str(existing["id"])

    major_id = str(uuid.uuid4())
    await conn.execute(
        """
        INSERT INTO major (id, name, department_id, level, created_at, is_deleted)
        VALUES ($1, $2, $3, $4::courselevel, $5, false)
        """,
        major_id,
        name,
        department_id,
        level,
        utc_now(),
    )
    return major_id


async def ensure_course(
    conn: asyncpg.Connection,
    department_id: str,
    major_id: str,
    title: str,
    level: str,
) -> str:
    existing = await conn.fetchrow(
        """
        SELECT id FROM course
        WHERE department_id = $1 AND title = $2 AND level = $3::courselevel
        FOR UPDATE
        """,
        department_id,
        title,
        level,
    )
    if existing:
        # Update the major link if it was missing
        await conn.execute(
            "UPDATE course SET major_id = $1 WHERE id = $2",
            major_id,
            existing["id"],
        )
        return str(existing["id"])

    course_id = str(uuid.uuid4())
    await conn.execute(
        """
        INSERT INTO course (id, title, description, level, academic_year, created_at,
                            is_deleted, department_id, major_id)
        VALUES ($1, $2, 'Introduction to Cloud Computing and Edge Architecture',
                $3::courselevel, $4, $5, false, $6, $7)
        """,
        course_id,
        title,
        level,
        "2025-2026",
        utc_now(),
        department_id,
        major_id,
    )
    return course_id


async def ensure_user(
    conn: asyncpg.Connection,
    *,
    email: str,
    password: str,
    full_name: str,
    role: str,
    establishment_id: str | None = None,
    filiere: str | None = None,
    level: str | None = None,
    major_id: str | None = None,
    onboarding_completed: bool = True,
    trust_score: int = 100,
    profile_completeness: int = 100,
) -> str:
    hashed_password = get_password_hash(password)
    now = utc_now()
    user_id = str(uuid.uuid4())
    is_contributor = role in ("TEACHER", "ADMIN", "SUPERADMIN")

    query = """
        INSERT INTO "user" (
            id, email, full_name, role, status, establishment_id, trust_score, profile_completeness,
            is_active, is_verified, verified_at, filiere, level, major_id, onboarding_completed,
            is_contributor, hashed_password, created_at,
            push_notifications_enabled, email_digest_enabled, notification_types, is_rtl
        )
        VALUES (
            $1, $2, $3, $4::userrole, 'ACTIVE', $5, $6, $7,
            true, true, $8, $9, $10::studentlevel, $11, $12,
            $13, $14, $15,
            true, false, '["contributions", "achievements", "reminders", "leaderboard"]'::jsonb, false
        )
        ON CONFLICT (email) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            role = EXCLUDED.role,
            status = 'ACTIVE',
            establishment_id = EXCLUDED.establishment_id,
            trust_score = EXCLUDED.trust_score,
            profile_completeness = EXCLUDED.profile_completeness,
            is_active = true,
            is_verified = true,
            verified_at = EXCLUDED.verified_at,
            filiere = EXCLUDED.filiere,
            level = EXCLUDED.level,
            major_id = EXCLUDED.major_id,
            onboarding_completed = true,
            is_contributor = EXCLUDED.is_contributor,
            hashed_password = EXCLUDED.hashed_password
        RETURNING id;
    """

    result = await conn.fetchval(
        query,
        user_id, email, full_name, role, establishment_id, trust_score, profile_completeness,
        now, filiere, level, major_id, onboarding_completed, is_contributor, hashed_password, now
    )
    return str(result)


async def ensure_teacher_profile(
    conn: asyncpg.Connection, user_id: str, department_id: str, specialization: str
) -> None:
    profile_id = str(uuid.uuid4())
    query = """
        INSERT INTO teacherprofile (id, user_id, department_id, specialization, modules)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id) DO UPDATE SET
            department_id = EXCLUDED.department_id,
            specialization = EXCLUDED.specialization
    """
    await conn.execute(
        query,
        profile_id,
        user_id,
        department_id,
        specialization,
        "Algorithms, Cloud, Data Structures",
    )


async def main() -> None:
    conn = await asyncpg.connect(DB_URL.replace("+asyncpg", ""))

    async with conn.transaction():
        atlas_id = await ensure_establishment(conn, "ATLAS University", "atlas.tn")

        # 1. Department
        dept_id = await ensure_department(conn, atlas_id, "Computer Science")

        # 2. Majors
        iot_l1_id = await ensure_major(conn, dept_id, "IoT", "L1")
        iot_l2_id = await ensure_major(conn, dept_id, "IoT", "L2")
        bigdata_m1_id = await ensure_major(conn, dept_id, "Big Data", "M1")
        # Additional major for L1 if desired
        networks_l1_id = await ensure_major(conn, dept_id, "Networks & Security", "L1")

        # 3. Course linked to IoT L1 major
        course_id = await ensure_course(conn, dept_id, iot_l1_id, "cloud", "L1")

        # 4. Student assigned to IoT L1
        student_id = await ensure_user(
            conn,
            email="student@atlas.tn",
            password="Student123!",
            full_name="Atlas Student",
            role="STUDENT",
            establishment_id=atlas_id,
            filiere="Computer Science",
            level="L1",
            major_id=iot_l1_id,
        )

        # 5. Teacher also assigned to IoT L1 (or could be without major if they teach across)
        teacher_id = await ensure_user(
            conn,
            email="teacher@atlas.tn",
            password="Teacher123!",
            full_name="Atlas Teacher",
            role="TEACHER",
            establishment_id=atlas_id,
            filiere="Computer Science",
            level="L1",
            major_id=iot_l1_id,
        )

        await ensure_teacher_profile(
            conn,
            user_id=teacher_id,
            department_id=dept_id,
            specialization="Cloud Infrastructure & Orchestration",
        )

        # 6. Admins (no major)
        await ensure_user(
            conn,
            email="admin@atlas.tn",
            password="Admin123!",
            full_name="Atlas Admin",
            role="ADMIN",
            establishment_id=atlas_id,
        )

        await ensure_user(
            conn,
            email="superadmin@atlas.tn",
            password="SuperAdmin123!",
            full_name="Atlas Superadmin",
            role="SUPERADMIN",
        )

    print("====================================================================")
    print("✅ SUCCESS: Fresh test state with Majors created.")
    print("✅ MAJORS: IoT (L1, L2), Big Data (M1), Networks & Security (L1)")
    print("✅ COURSE: 'cloud' (L1) linked to major 'IoT'.")
    print("✅ STUDENT & TEACHER assigned to major 'IoT' (L1).")
    print("====================================================================")
    print("LOGIN-READY ACCOUNTS:")
    print("  👨‍🎓 STUDENT:    student@atlas.tn    / Student123!")
    print("  👨‍🏫 TEACHER:    teacher@atlas.tn    / Teacher123!")
    print("  🛡️  ADMIN:      admin@atlas.tn      / Admin123!")
    print("  👑 SUPERADMIN: superadmin@atlas.tn / SuperAdmin123!")
    print("====================================================================")

    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())