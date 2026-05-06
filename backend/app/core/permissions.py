from __future__ import annotations

from app.dependencies import require_role


require_student = require_role("STUDENT")
require_teacher = require_role("TEACHER")
require_admin = require_role("ADMIN", "SUPERADMIN")
require_superadmin = require_role("SUPERADMIN")
