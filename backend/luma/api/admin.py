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
