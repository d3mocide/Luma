import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, Cookie, HTTPException, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, update, func

from luma.config import settings
from luma.db.models import User
from luma.deps import DbDep, CurrentUser

logger = logging.getLogger(__name__)
router = APIRouter()
ph = PasswordHasher()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class SetupStatusResponse(BaseModel):
    setup_required: bool


class SetupRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str


class UserOut(BaseModel):
    id: UUID
    email: str
    display_name: str
    role: str

    model_config = {"from_attributes": True}


def _make_access_token(user_id: UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire, "type": "access"},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def _make_refresh_token(user_id: UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire, "type": "refresh"},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def _set_auth_cookies(response: Response, user_id: UUID) -> None:
    access = _make_access_token(user_id)
    refresh = _make_refresh_token(user_id)
    secure = settings.is_production
    response.set_cookie("access_token", access, httponly=True, secure=secure, samesite="strict", max_age=settings.access_token_expire_minutes * 60)
    response.set_cookie("refresh_token", refresh, httponly=True, secure=secure, samesite="strict", max_age=settings.refresh_token_expire_days * 86400)


@router.post("/login")
async def login(body: LoginRequest, response: Response, db: DbDep) -> UserOut:
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    # Use constant-time comparison; always verify even if user not found (mitigate timing oracle)
    dummy_hash = "$argon2id$v=19$m=65536,t=3,p=4$dummydummydummy$dummydummydummydummydummydummydummydummydummy"
    hash_to_check = user.password_hash if user else dummy_hash
    try:
        ph.verify(hash_to_check, body.password)
    except VerifyMismatchError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    await db.execute(update(User).where(User.id == user.id).values(last_login_at=datetime.now(timezone.utc)))
    await db.commit()

    _set_auth_cookies(response, user.id)
    return UserOut.model_validate(user)


@router.post("/logout")
async def logout(response: Response) -> dict:
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"detail": "logged out"}


@router.get("/me")
async def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


@router.post("/refresh")
async def refresh(
    response: Response,
    db: DbDep,
    refresh_token: str | None = Cookie(None),
) -> UserOut:
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")

    try:
        payload = jwt.decode(refresh_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    _set_auth_cookies(response, user.id)
    return UserOut.model_validate(user)


@router.get("/setup-status")
async def setup_status(db: DbDep) -> SetupStatusResponse:
    # Check if any users exist in the database
    result = await db.execute(select(func.count(User.id)))
    count = result.scalar() or 0
    return SetupStatusResponse(setup_required=(count == 0))


@router.post("/setup")
async def setup(body: SetupRequest, response: Response, db: DbDep) -> UserOut:
    # Ensure setup is only allowed on empty database
    result = await db.execute(select(func.count(User.id)))
    count = result.scalar() or 0
    if count > 0:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Setup has already been completed.")

    # Create new operator user
    password_hash = ph.hash(body.password)
    user = User(
        email=body.email,
        password_hash=password_hash,
        display_name=body.display_name,
        role="operator",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    _set_auth_cookies(response, user.id)
    return UserOut.model_validate(user)
