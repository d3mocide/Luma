import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, Cookie, HTTPException, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, update, func
from sqlalchemy.exc import SQLAlchemyError

from luma.config import settings
from luma.db.models import User
from luma.deps import DbDep, CurrentUser

logger = logging.getLogger(__name__)
router = APIRouter()
ph = PasswordHasher()


def _raise_auth_db_http_error(exc: SQLAlchemyError) -> None:
    logger.exception("Auth database operation failed")
    message = str(getattr(exc, "orig", exc)).lower()

    if 'relation "users" does not exist' in message:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not initialized. Run `make migrate` and try again.",
        )

    if 'password authentication failed' in message:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database credentials are invalid. Check PG_PASSWORD and DATABASE_URL.",
        )

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Authentication service is temporarily unavailable.",
    )


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
    is_password_temp: bool
    birth_year: int | None = None
    biological_sex: str | None = None
    height_cm: float | None = None
    activity_level: str | None = None
    dri: dict | None = None

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
    try:
        result = await db.execute(select(User).where(User.email == body.email))
        user = result.scalar_one_or_none()
    except SQLAlchemyError as exc:
        _raise_auth_db_http_error(exc)

    # Use constant-time comparison; always verify even if user not found (mitigate timing oracle)
    dummy_hash = "$argon2id$v=19$m=65536,t=3,p=4$SGjslnqhTZtq5oGVdGyUMw$xS8p1ZFkUZfxWOINsNc8FQUOnSXfgVZK0D4GIpn5luI"
    hash_to_check = user.password_hash if user else dummy_hash
    try:
        ph.verify(hash_to_check, body.password)
    except VerifyMismatchError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    try:
        await db.execute(update(User).where(User.id == user.id).values(last_login_at=datetime.now(timezone.utc)))
        await db.commit()
    except SQLAlchemyError as exc:
        _raise_auth_db_http_error(exc)

    _set_auth_cookies(response, user.id)
    return UserOut.model_validate(user)


@router.post("/logout")
async def logout(response: Response) -> dict:
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"detail": "logged out"}


def _user_out(user) -> UserOut:
    from luma.services.dri import compute_dri
    weight_kg = None
    if user.goals and user.goals.target_weight_kg:
        weight_kg = float(user.goals.target_weight_kg)
    dri = compute_dri(
        birth_year=user.birth_year,
        biological_sex=user.biological_sex,
        activity_level=user.activity_level,
        height_cm=float(user.height_cm) if user.height_cm else None,
        weight_kg=weight_kg,
    )
    out = UserOut.model_validate(user)
    out.dri = dri
    return out


@router.get("/me")
async def me(user: CurrentUser) -> UserOut:
    return _user_out(user)


_VALID_SEX = {"male", "female", "prefer_not_to_say"}
_VALID_ACTIVITY = {"sedentary", "lightly_active", "moderately_active", "very_active"}


class UpdateProfileRequest(BaseModel):
    display_name: str | None = None
    birth_year: int | None = None
    biological_sex: str | None = None
    height_cm: float | None = None
    activity_level: str | None = None


@router.patch("/me")
async def update_me(body: UpdateProfileRequest, user: CurrentUser, db: DbDep) -> UserOut:
    if body.display_name is not None:
        name = body.display_name.strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Display name cannot be empty.")
        if len(name) > 100:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Display name must be 100 characters or fewer.")
        user.display_name = name

    if body.birth_year is not None:
        current_year = datetime.now(timezone.utc).year
        if not (1900 <= body.birth_year <= current_year - 13):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid birth year.")
        user.birth_year = body.birth_year

    if body.biological_sex is not None:
        if body.biological_sex not in _VALID_SEX:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"biological_sex must be one of {sorted(_VALID_SEX)}.")
        user.biological_sex = body.biological_sex

    if body.height_cm is not None:
        if not (50.0 <= body.height_cm <= 280.0):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="height_cm out of range.")
        user.height_cm = body.height_cm

    if body.activity_level is not None:
        if body.activity_level not in _VALID_ACTIVITY:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"activity_level must be one of {sorted(_VALID_ACTIVITY)}.")
        user.activity_level = body.activity_level

    try:
        await db.commit()
        await db.refresh(user)
    except SQLAlchemyError as exc:
        _raise_auth_db_http_error(exc)

    return _user_out(user)


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
    try:
        result = await db.execute(select(User).where(User.id == UUID(user_id)))
        user = result.scalar_one_or_none()
    except SQLAlchemyError as exc:
        _raise_auth_db_http_error(exc)

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    _set_auth_cookies(response, user.id)
    return UserOut.model_validate(user)


@router.get("/setup-status")
async def setup_status(db: DbDep) -> SetupStatusResponse:
    # Check if any users exist in the database
    try:
        result = await db.execute(select(func.count(User.id)))
        count = result.scalar() or 0
    except SQLAlchemyError as exc:
        _raise_auth_db_http_error(exc)

    return SetupStatusResponse(setup_required=(count == 0))


@router.post("/setup")
async def setup(body: SetupRequest, response: Response, db: DbDep) -> UserOut:
    # Ensure setup is only allowed on empty database
    try:
        result = await db.execute(select(func.count(User.id)))
        count = result.scalar() or 0
    except SQLAlchemyError as exc:
        _raise_auth_db_http_error(exc)

    if count > 0:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Setup has already been completed.")

    # First user becomes the admin
    password_hash = ph.hash(body.password)
    user = User(
        email=body.email,
        password_hash=password_hash,
        display_name=body.display_name,
        role="admin",
    )
    try:
        db.add(user)
        await db.commit()
        await db.refresh(user)
    except SQLAlchemyError as exc:
        _raise_auth_db_http_error(exc)

    _set_auth_cookies(response, user.id)
    return UserOut.model_validate(user)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    user: CurrentUser,
    db: DbDep,
) -> dict:
    if len(body.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="New password must be at least 8 characters long."
        )

    try:
        ph.verify(user.password_hash, body.current_password)
    except VerifyMismatchError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid current password"
        )

    user.password_hash = ph.hash(body.new_password)
    user.is_password_temp = False

    try:
        await db.commit()
    except SQLAlchemyError as exc:
        _raise_auth_db_http_error(exc)

    return {"detail": "Password changed successfully."}

