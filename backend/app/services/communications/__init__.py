"""
Communications Domain Public API.

This module exposes the strict public interface for outbound system communications,
including standard email dispatch and real-time WebSocket notification management.
Internal template parsing and connection handling are encapsulated.
"""

from .email_service import (
    send_email,
    send_otp_email,
    send_teacher_invitation_email,
    send_contribution_status_email,
    send_admin_new_contribution_email,
)

from .notification_service import (
    ConnectionManager,
    ws_manager,
    fetch_user_notifications,
    mark_notification_read,
)

__all__ = [
    # Email Dispatchers
    "send_email",
    "send_otp_email",
    "send_teacher_invitation_email",
    "send_contribution_status_email",
    "send_admin_new_contribution_email",

    # Real-Time WebSocket Management
    "ConnectionManager",
    "ws_manager",

    # Notification State Persistence
    "fetch_user_notifications",
    "mark_notification_read",
]