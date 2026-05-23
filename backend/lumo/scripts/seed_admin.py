"""Seed the initial operator user.

Run with:
    docker compose run --rm api python -m lumo.scripts.seed_admin
"""
import asyncio
import os
import sys

from argon2 import PasswordHasher
from sqlalchemy import select

from lumo.db.session import AsyncSessionLocal
from lumo.db.models import User


async def main() -> None:
    email = os.environ.get("ADMIN_EMAIL", "admin@sovereign.local")
    password = os.environ.get("ADMIN_PASSWORD", "changeme")
    display_name = os.environ.get("ADMIN_DISPLAY_NAME", "Operator")

    ph = PasswordHasher()

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == email))
        existing = result.scalar_one_or_none()

        if existing:
            print(f"User {email} already exists (id={existing.id}). Skipping.")
            return

        user = User(
            email=email,
            password_hash=ph.hash(password),
            display_name=display_name,
            role="operator",
        )
        db.add(user)
        await db.commit()
        print(f"Created operator user: {email} (id={user.id})")
        if password == "changeme":
            print("WARNING: default password in use — set ADMIN_PASSWORD before deploying")


if __name__ == "__main__":
    asyncio.run(main())
