import asyncio
import logging
import secrets
import string
from typing import Annotated
from uuid import UUID

from argon2 import PasswordHasher
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from luma.db.models import User
from luma.deps import DbDep, require_role
from luma.services.email import send_password_reset_email, send_welcome_email

logger = logging.getLogger(__name__)
router = APIRouter()
ph = PasswordHasher()

VALID_ROLES = frozenset({'user', 'operator', 'admin'})
AdminUser = Annotated[User, Depends(require_role('admin'))]

_ALPHABET = string.ascii_letters + string.digits + '!@#$%^&*'


def _temp_password() -> str:
    return ''.join(secrets.choice(_ALPHABET) for _ in range(16))


class UserAdminOut(BaseModel):
    id: UUID
    email: str
    display_name: str
    role: str

    model_config = {"from_attributes": True}


class ChangeRoleRequest(BaseModel):
    role: str


class CreateUserRequest(BaseModel):
    email: EmailStr
    display_name: str
    role: str = 'user'


class CreateUserResponse(BaseModel):
    user: UserAdminOut
    temporary_password: str


class ResetPasswordResponse(BaseModel):
    temporary_password: str


@router.get("/users")
async def list_users(admin: AdminUser, db: DbDep) -> list[UserAdminOut]:
    try:
        result = await db.execute(select(User).order_by(User.created_at))
        users = result.scalars().all()
    except SQLAlchemyError:
        logger.exception("Failed to list users")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database error")
    return [UserAdminOut.model_validate(u) for u in users]


@router.post("/users")
async def create_user(body: CreateUserRequest, admin: AdminUser, db: DbDep) -> CreateUserResponse:
    if body.role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid role. Must be one of: {', '.join(sorted(VALID_ROLES))}",
        )

    temp_pw = _temp_password()
    user = User(
        email=body.email,
        password_hash=ph.hash(temp_pw),
        display_name=body.display_name,
        role=body.role,
        is_password_temp=True,
    )
    try:
        db.add(user)
        await db.commit()
        await db.refresh(user)
    except SQLAlchemyError as exc:
        await db.rollback()
        msg = str(getattr(exc, 'orig', exc)).lower()
        if 'unique' in msg and 'email' in msg:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A user with that email already exists.")
        logger.exception("Failed to create user")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database error")

    asyncio.create_task(
        send_welcome_email(
            to_email=str(user.email),
            display_name=user.display_name,
            temporary_password=temp_pw,
        )
    )
    return CreateUserResponse(user=UserAdminOut.model_validate(user), temporary_password=temp_pw)


@router.patch("/users/{user_id}/role")
async def change_role(user_id: UUID, body: ChangeRoleRequest, admin: AdminUser, db: DbDep) -> UserAdminOut:
    if body.role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid role. Must be one of: {', '.join(sorted(VALID_ROLES))}",
        )

    try:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
    except SQLAlchemyError:
        logger.exception("Failed to fetch user for role change")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database error")

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot change your own role.")

    user.role = body.role
    try:
        await db.commit()
        await db.refresh(user)
    except SQLAlchemyError:
        logger.exception("Failed to update role")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database error")

    return UserAdminOut.model_validate(user)


@router.post("/users/{user_id}/reset-password")
async def reset_password(user_id: UUID, admin: AdminUser, db: DbDep) -> ResetPasswordResponse:
    try:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
    except SQLAlchemyError:
        logger.exception("Failed to fetch user for password reset")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database error")

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    temp_pw = _temp_password()
    user.password_hash = ph.hash(temp_pw)
    user.is_password_temp = True
    # Kill the user's existing sessions — an admin reset usually means the
    # account is suspected compromised or the holder lost control of it.
    user.token_version += 1
    try:
        await db.commit()
    except SQLAlchemyError:
        logger.exception("Failed to reset password")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database error")

    asyncio.create_task(
        send_password_reset_email(
            to_email=str(user.email),
            display_name=user.display_name,
            temporary_password=temp_pw,
        )
    )
    return ResetPasswordResponse(temporary_password=temp_pw)


@router.delete("/users/{user_id}")
async def delete_user(user_id: UUID, admin: AdminUser, db: DbDep) -> dict:
    if user_id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account.")

    try:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
    except SQLAlchemyError:
        logger.exception("Failed to fetch user for deletion")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database error")

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    try:
        await db.delete(user)
        await db.commit()
    except SQLAlchemyError:
        logger.exception("Failed to delete user")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database error")

    return {"detail": "deleted"}


class SmtpConfigSnapshot(BaseModel):
    send_path: str           # graph | xoauth2 | basic_auth | disabled
    smtp_host: str
    smtp_port: int
    smtp_from: str
    smtp_user: str
    smtp_use_tls: bool
    smtp_oauth_token_url: str
    smtp_oauth_client_id: str
    smtp_oauth_client_secret_set: bool
    app_base_url: str


class TestEmailResponse(BaseModel):
    ok: bool
    to: str
    config: SmtpConfigSnapshot
    error: str | None = None


@router.post("/test-email")
async def test_email(admin: AdminUser) -> TestEmailResponse:
    """
    Send a real test email to the authenticated admin's address using whatever
    send path is currently configured (Graph API, XOAUTH2 SMTP, or basic auth).
    Surfaces the full error detail and a redacted config snapshot for diagnosis.
    """
    from email.message import EmailMessage

    from luma.config import settings
    from luma.services.email import _dispatch, active_send_path

    path = active_send_path()

    config_snapshot = SmtpConfigSnapshot(
        send_path=path,
        smtp_host=settings.smtp_host,
        smtp_port=settings.smtp_port,
        smtp_from=settings.smtp_from,
        smtp_user=settings.smtp_user,
        smtp_use_tls=settings.smtp_use_tls,
        smtp_oauth_token_url=settings.smtp_oauth_token_url,
        smtp_oauth_client_id=settings.smtp_oauth_client_id,
        smtp_oauth_client_secret_set=bool(settings.smtp_oauth_client_secret),
        app_base_url=settings.app_base_url,
    )

    if path == "disabled":
        return TestEmailResponse(
            ok=False,
            to=admin.email,
            config=config_snapshot,
            error=(
                "No email send path is configured. "
                "For Microsoft 365 set SMTP_OAUTH_TOKEN_URL, SMTP_OAUTH_CLIENT_ID, "
                "SMTP_OAUTH_CLIENT_SECRET, and SMTP_FROM. "
                "For basic SMTP also set SMTP_HOST."
            ),
        )

    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = admin.email
    msg["Subject"] = "Luma email test"
    msg.set_content(
        f"This is a test email from your Luma instance.\n\n"
        f"If you received this, your email configuration is working correctly.\n\n"
        f"  Sent to:    {admin.email}\n"
        f"  Send path:  {path}\n"
        f"  From:       {settings.smtp_from}\n"
    )

    try:
        await _dispatch(msg)
        logger.info("Test email sent to %s via %s", admin.email, path)
        return TestEmailResponse(ok=True, to=admin.email, config=config_snapshot)
    except Exception as exc:
        error_detail = f"{type(exc).__name__}: {exc}"
        logger.exception("Test email failed via %s", path)
        return TestEmailResponse(
            ok=False,
            to=admin.email,
            config=config_snapshot,
            error=error_detail,
        )
