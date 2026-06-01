"""Clear all HAE-sourced biometric rows for a given user UUID.

Usage:
    python -m luma.scripts.clear_hae_data <user-uuid>

Deletes every row in `biometrics` where source = 'hae' for the given user,
then refreshes biometrics_daily so Trends reflects the deletion immediately.
"""
import asyncio
import sys
from uuid import UUID


async def main(user_id: UUID) -> None:
    from sqlalchemy import text
    from luma.db.session import engine

    async with engine.connect() as conn:
        await conn.execution_options(isolation_level="AUTOCOMMIT")

        result = await conn.execute(
            text("SELECT COUNT(*) FROM biometrics WHERE user_id = :uid AND source = 'hae'"),
            {"uid": str(user_id)},
        )
        count = result.scalar()
        if count == 0:
            print(f"No HAE data found for user {user_id}.")
            return

        print(f"Deleting {count} HAE rows for user {user_id}...")
        await conn.execute(
            text("DELETE FROM biometrics WHERE user_id = :uid AND source = 'hae'"),
            {"uid": str(user_id)},
        )

        print("Refreshing biometrics_daily...")
        await conn.execute(
            text("CALL refresh_continuous_aggregate('biometrics_daily', NULL, NULL)")
        )

    print("Done.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: python -m luma.scripts.clear_hae_data <user-uuid>", file=sys.stderr)
        sys.exit(1)
    try:
        uid = UUID(sys.argv[1])
    except ValueError:
        print(f"Invalid UUID: {sys.argv[1]!r}", file=sys.stderr)
        sys.exit(1)
    asyncio.run(main(uid))
