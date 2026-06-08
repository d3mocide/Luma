import json
import logging
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import text

from luma.config import settings
from luma.deps import CurrentUser, DbDep
from luma.services.email import send_family_invite

router = APIRouter()
logger = logging.getLogger(__name__)

INVITE_EXPIRE_DAYS = 7
VALID_RESOURCE_TYPES = {"recipe", "favorite", "plan"}
_RESOURCE_TABLE = {"recipe": "recipes", "favorite": "favorites", "plan": "meal_plans"}


# ── Pydantic models ──────────────────────────────────────────────────────────

class GroupCreate(BaseModel):
    name: str


class InviteRequest(BaseModel):
    email: EmailStr


class AcceptInvite(BaseModel):
    token: str


class ShareCreate(BaseModel):
    resource_type: str
    resource_id: str
    note: str | None = None


# ── Auth helpers ─────────────────────────────────────────────────────────────

async def _get_membership(db, group_id: str, user_id: str) -> str | None:
    """Return role string if user is a member, None otherwise."""
    row = await db.execute(
        text("SELECT role FROM family_members WHERE group_id = :gid AND user_id = :uid"),
        {"gid": group_id, "uid": user_id},
    )
    m = row.fetchone()
    return m.role if m else None


async def _assert_member(db, group_id: str, user_id: str) -> str:
    role = await _get_membership(db, group_id, user_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group")
    return role


async def _assert_owner(db, group_id: str, user_id: str) -> None:
    role = await _assert_member(db, group_id, user_id)
    if role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the group owner can do this")


# ── Group management ─────────────────────────────────────────────────────────

@router.post("/groups", status_code=status.HTTP_201_CREATED)
async def create_group(
    body: GroupCreate,
    user: CurrentUser,
    db: DbDep,
) -> dict:
    group_id = str(uuid.uuid4())
    now = datetime.now(UTC)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Group name cannot be empty")

    await db.execute(
        text("INSERT INTO family_groups (id, name, created_by, created_at) VALUES (:id, :name, :uid, :ts)"),
        {"id": group_id, "name": name, "uid": str(user.id), "ts": now},
    )
    await db.execute(
        text("INSERT INTO family_members (group_id, user_id, role, joined_at) VALUES (:gid, :uid, 'owner', :ts)"),
        {"gid": group_id, "uid": str(user.id), "ts": now},
    )
    await db.commit()
    return {"id": group_id, "name": name, "role": "owner", "created_at": now.isoformat()}


@router.get("/groups/me")
async def my_groups(
    user: CurrentUser,
    db: DbDep,
) -> dict:
    rows = await db.execute(
        text("""
            SELECT fg.id, fg.name, fg.created_at, fm.role,
                   (SELECT COUNT(*) FROM family_members m2 WHERE m2.group_id = fg.id) AS member_count
            FROM family_groups fg
            JOIN family_members fm ON fm.group_id = fg.id AND fm.user_id = :uid
            ORDER BY fg.created_at DESC
        """),
        {"uid": str(user.id)},
    )
    return {
        "groups": [
            {
                "id": str(row.id),
                "name": row.name,
                "created_at": row.created_at.isoformat(),
                "role": row.role,
                "member_count": row.member_count,
            }
            for row in rows.fetchall()
        ]
    }


@router.get("/groups/{group_id}")
async def get_group(
    group_id: str,
    user: CurrentUser,
    db: DbDep,
) -> dict:
    await _assert_member(db, group_id, str(user.id))

    grp = (await db.execute(
        text("SELECT id, name, created_at FROM family_groups WHERE id = :gid"),
        {"gid": group_id},
    )).fetchone()
    if not grp:
        raise HTTPException(status_code=404, detail="Group not found")

    members = (await db.execute(
        text("""
            SELECT u.id, u.display_name, u.email, fm.role, fm.joined_at
            FROM family_members fm
            JOIN users u ON u.id = fm.user_id
            WHERE fm.group_id = :gid
            ORDER BY fm.joined_at ASC
        """),
        {"gid": group_id},
    )).fetchall()

    return {
        "id": str(grp.id),
        "name": grp.name,
        "created_at": grp.created_at.isoformat(),
        "members": [
            {
                "id": str(m.id),
                "display_name": m.display_name,
                "email": m.email,
                "role": m.role,
                "joined_at": m.joined_at.isoformat(),
            }
            for m in members
        ],
    }


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: str,
    user: CurrentUser,
    db: DbDep,
) -> None:
    await _assert_owner(db, group_id, str(user.id))
    await db.execute(text("DELETE FROM family_groups WHERE id = :gid"), {"gid": group_id})
    await db.commit()


# ── Invitations ──────────────────────────────────────────────────────────────

@router.post("/groups/{group_id}/invite", status_code=status.HTTP_201_CREATED)
async def invite_member(
    group_id: str,
    body: InviteRequest,
    user: CurrentUser,
    db: DbDep,
) -> dict:
    await _assert_owner(db, group_id, str(user.id))

    already = (await db.execute(
        text("""
            SELECT fm.user_id FROM family_members fm
            JOIN users u ON u.id = fm.user_id
            WHERE fm.group_id = :gid AND u.email = :email
        """),
        {"gid": group_id, "email": str(body.email)},
    )).fetchone()
    if already:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That user is already a member")

    # Replace any existing pending invite for this email + group
    await db.execute(
        text("""
            DELETE FROM family_invitations
            WHERE group_id = :gid AND invited_email = :email AND accepted_at IS NULL
        """),
        {"gid": group_id, "email": str(body.email)},
    )

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(days=INVITE_EXPIRE_DAYS)

    await db.execute(
        text("""
            INSERT INTO family_invitations (id, group_id, invited_email, invited_by, token, expires_at)
            VALUES (:id, :gid, :email, :uid, :token, :exp)
        """),
        {
            "id": str(uuid.uuid4()),
            "gid": group_id,
            "email": str(body.email),
            "uid": str(user.id),
            "token": token,
            "exp": expires_at,
        },
    )
    await db.commit()

    grp = (await db.execute(
        text("SELECT name FROM family_groups WHERE id = :gid"), {"gid": group_id},
    )).fetchone()
    group_name = grp.name if grp else "Family"

    accept_url = f"{settings.app_base_url}/family?token={token}"
    await send_family_invite(
        to_email=str(body.email),
        inviter_name=user.display_name,
        group_name=group_name,
        accept_url=accept_url,
    )

    return {"token": token, "expires_at": expires_at.isoformat()}


@router.post("/invitations/accept")
async def accept_invitation(
    body: AcceptInvite,
    user: CurrentUser,
    db: DbDep,
) -> dict:
    invite = (await db.execute(
        text("""
            SELECT fi.id, fi.group_id, fi.expires_at, fi.accepted_at, fg.name AS group_name
            FROM family_invitations fi
            JOIN family_groups fg ON fg.id = fi.group_id
            WHERE fi.token = :token
        """),
        {"token": body.token},
    )).fetchone()

    if not invite:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invite.accepted_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invitation already used")
    if invite.expires_at < datetime.now(UTC):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invitation has expired")

    existing = (await db.execute(
        text("SELECT 1 FROM family_members WHERE group_id = :gid AND user_id = :uid"),
        {"gid": str(invite.group_id), "uid": str(user.id)},
    )).fetchone()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member of this group")

    now = datetime.now(UTC)
    await db.execute(
        text("UPDATE family_invitations SET accepted_at = :now WHERE id = :id"),
        {"now": now, "id": str(invite.id)},
    )
    await db.execute(
        text("INSERT INTO family_members (group_id, user_id, role, joined_at) VALUES (:gid, :uid, 'member', :ts)"),
        {"gid": str(invite.group_id), "uid": str(user.id), "ts": now},
    )
    await db.commit()

    return {"group_id": str(invite.group_id), "group_name": invite.group_name}


@router.delete("/groups/{group_id}/members/{member_uid}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    group_id: str,
    member_uid: str,
    user: CurrentUser,
    db: DbDep,
) -> None:
    caller_id = str(user.id)
    is_self = caller_id == member_uid

    if is_self:
        role = await _assert_member(db, group_id, caller_id)
        if role == "owner":
            count = (await db.execute(
                text("SELECT COUNT(*) FROM family_members WHERE group_id = :gid"),
                {"gid": group_id},
            )).scalar()
            if count > 1:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Transfer ownership or remove all other members before leaving as owner",
                )
            await db.execute(text("DELETE FROM family_groups WHERE id = :gid"), {"gid": group_id})
            await db.commit()
            return
    else:
        await _assert_owner(db, group_id, caller_id)

    result = await db.execute(
        text("DELETE FROM family_members WHERE group_id = :gid AND user_id = :uid"),
        {"gid": group_id, "uid": member_uid},
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Member not found")


# ── Shares ───────────────────────────────────────────────────────────────────

@router.post("/groups/{group_id}/shares", status_code=status.HTTP_201_CREATED)
async def share_resource(
    group_id: str,
    body: ShareCreate,
    user: CurrentUser,
    db: DbDep,
) -> dict:
    await _assert_member(db, group_id, str(user.id))

    if body.resource_type not in VALID_RESOURCE_TYPES:
        raise HTTPException(status_code=422, detail=f"resource_type must be one of {VALID_RESOURCE_TYPES}")

    table = _RESOURCE_TABLE[body.resource_type]
    owns = (await db.execute(
        text(f"SELECT 1 FROM {table} WHERE id = :rid AND user_id = :uid"),
        {"rid": body.resource_id, "uid": str(user.id)},
    )).fetchone()
    if not owns:
        raise HTTPException(status_code=404, detail="Resource not found or not yours to share")

    existing = (await db.execute(
        text("""
            SELECT 1 FROM group_shares
            WHERE group_id = :gid AND resource_type = :rt AND resource_id = :rid
        """),
        {"gid": group_id, "rt": body.resource_type, "rid": body.resource_id},
    )).fetchone()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already shared with this group")

    share_id = str(uuid.uuid4())
    now = datetime.now(UTC)
    await db.execute(
        text("""
            INSERT INTO group_shares (id, group_id, resource_type, resource_id, shared_by, note, shared_at)
            VALUES (:id, :gid, :rt, :rid, :uid, :note, :ts)
        """),
        {
            "id": share_id, "gid": group_id,
            "rt": body.resource_type, "rid": body.resource_id,
            "uid": str(user.id), "note": body.note, "ts": now,
        },
    )
    await db.commit()
    return {"id": share_id, "shared_at": now.isoformat()}


@router.get("/groups/{group_id}/shares")
async def list_shares(
    group_id: str,
    user: CurrentUser,
    db: DbDep,
    resource_type: str | None = None,
) -> dict:
    await _assert_member(db, group_id, str(user.id))

    filter_clause = "AND gs.resource_type = :rt" if resource_type else ""
    params: dict = {"gid": group_id}
    if resource_type:
        params["rt"] = resource_type

    rows = (await db.execute(
        text(f"""
            SELECT gs.id, gs.resource_type, gs.resource_id, gs.note, gs.shared_at,
                   u.id AS shared_by_id, u.display_name AS shared_by_name
            FROM group_shares gs
            JOIN users u ON u.id = gs.shared_by
            WHERE gs.group_id = :gid {filter_clause}
            ORDER BY gs.shared_at DESC
        """),
        params,
    )).fetchall()

    shares = [
        {
            "id": str(row.id),
            "resource_type": row.resource_type,
            "resource_id": str(row.resource_id),
            "note": row.note,
            "shared_at": row.shared_at.isoformat(),
            "shared_by_id": str(row.shared_by_id),
            "shared_by_name": row.shared_by_name,
            "resource_name": None,
        }
        for row in rows
    ]

    # Enrich with resource names
    recipe_ids = [s["resource_id"] for s in shares if s["resource_type"] == "recipe"]
    favorite_ids = [s["resource_id"] for s in shares if s["resource_type"] == "favorite"]
    plan_ids = [s["resource_id"] for s in shares if s["resource_type"] == "plan"]
    name_map: dict[str, str] = {}

    if recipe_ids:
        for r in (await db.execute(
            text("SELECT id::text, name FROM recipes WHERE id = ANY(:ids)"), {"ids": recipe_ids},
        )).fetchall():
            name_map[r.id] = r.name

    if favorite_ids:
        for r in (await db.execute(
            text("SELECT id::text, name FROM favorites WHERE id = ANY(:ids)"), {"ids": favorite_ids},
        )).fetchall():
            name_map[r.id] = r.name

    if plan_ids:
        for r in (await db.execute(
            text("SELECT id::text, week_start FROM meal_plans WHERE id = ANY(:ids)"), {"ids": plan_ids},
        )).fetchall():
            name_map[r.id] = f"Week of {r.week_start}"

    for s in shares:
        s["resource_name"] = name_map.get(s["resource_id"])

    return {"shares": shares}


@router.delete("/shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unshare(
    share_id: str,
    user: CurrentUser,
    db: DbDep,
) -> None:
    share = (await db.execute(
        text("SELECT shared_by, group_id FROM group_shares WHERE id = :sid"),
        {"sid": share_id},
    )).fetchone()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")

    uid = str(user.id)
    is_sharer = str(share.shared_by) == uid
    if not is_sharer:
        role = await _get_membership(db, str(share.group_id), uid)
        if role != "owner":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to remove this share")

    await db.execute(text("DELETE FROM group_shares WHERE id = :sid"), {"sid": share_id})
    await db.commit()


@router.post("/shares/{share_id}/copy")
async def copy_shared_resource(
    share_id: str,
    user: CurrentUser,
    db: DbDep,
) -> dict:
    share = (await db.execute(
        text("SELECT resource_type, resource_id, group_id FROM group_shares WHERE id = :sid"),
        {"sid": share_id},
    )).fetchone()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")

    await _assert_member(db, str(share.group_id), str(user.id))

    uid = str(user.id)
    new_id = str(uuid.uuid4())
    now = datetime.now(UTC)
    rid = str(share.resource_id)

    if share.resource_type == "recipe":
        recipe = (await db.execute(
            text("SELECT * FROM recipes WHERE id = :rid"), {"rid": rid},
        )).fetchone()
        if not recipe:
            raise HTTPException(status_code=404, detail="Original recipe no longer exists")

        await db.execute(
            text("""
                INSERT INTO recipes
                    (id, user_id, name, description, instructions, prep_minutes, cook_minutes,
                     servings, tags, source, nutrition_per_serving, created_at)
                VALUES
                    (:id, :uid, :name, :desc, :instructions, :prep, :cook,
                     :servings, :tags, :source, CAST(:nutrition AS jsonb), :ts)
            """),
            {
                "id": new_id, "uid": uid,
                "name": recipe.name, "desc": recipe.description,
                "instructions": recipe.instructions,
                "prep": recipe.prep_minutes, "cook": recipe.cook_minutes,
                "servings": recipe.servings, "tags": recipe.tags,
                "source": recipe.source,
                "nutrition": json.dumps(recipe.nutrition_per_serving or {}),
                "ts": now,
            },
        )
        for ing in (await db.execute(
            text("SELECT * FROM recipe_ingredients WHERE recipe_id = :rid ORDER BY sort_order"),
            {"rid": rid},
        )).fetchall():
            await db.execute(
                text("""
                    INSERT INTO recipe_ingredients (recipe_id, food_id, quantity, unit, notes, sort_order)
                    VALUES (:rid, :fid, :qty, :unit, :notes, :order)
                """),
                {
                    "rid": new_id,
                    "fid": str(ing.food_id) if ing.food_id else None,
                    "qty": ing.quantity, "unit": ing.unit,
                    "notes": ing.notes, "order": ing.sort_order,
                },
            )
        await db.commit()
        return {"id": new_id, "resource_type": "recipe"}

    if share.resource_type == "favorite":
        fav = (await db.execute(
            text("SELECT * FROM favorites WHERE id = :fid"), {"fid": rid},
        )).fetchone()
        if not fav:
            raise HTTPException(status_code=404, detail="Original favorite no longer exists")

        await db.execute(
            text("""
                INSERT INTO favorites (id, user_id, name, created_at, updated_at)
                VALUES (:id, :uid, :name, :ts, :ts)
            """),
            {"id": new_id, "uid": uid, "name": fav.name, "ts": now},
        )
        for item in (await db.execute(
            text("SELECT * FROM favorite_items WHERE favorite_id = :fid ORDER BY sort_order"),
            {"fid": rid},
        )).fetchall():
            await db.execute(
                text("""
                    INSERT INTO favorite_items
                        (id, favorite_id, sort_order, food_name, brand, quantity_g, nutrients)
                    VALUES
                        (:id, :fid, :order, :name, :brand, :qty, CAST(:nutrients AS jsonb))
                """),
                {
                    "id": str(uuid.uuid4()), "fid": new_id,
                    "order": item.sort_order, "name": item.food_name,
                    "brand": item.brand, "qty": item.quantity_g,
                    "nutrients": json.dumps(item.nutrients or {}),
                },
            )
        await db.commit()
        return {"id": new_id, "resource_type": "favorite"}

    if share.resource_type == "plan":
        plan = (await db.execute(
            text("SELECT * FROM meal_plans WHERE id = :pid"), {"pid": rid},
        )).fetchone()
        if not plan:
            raise HTTPException(status_code=404, detail="Original meal plan no longer exists")

        await db.execute(
            text("""
                INSERT INTO meal_plans (id, user_id, week_start, status, created_at)
                VALUES (:id, :uid, :ws, 'active', :ts)
            """),
            {"id": new_id, "uid": uid, "ws": plan.week_start, "ts": now},
        )
        for slot in (await db.execute(
            text("SELECT * FROM meal_plan_slots WHERE plan_id = :pid"), {"pid": rid},
        )).fetchall():
            await db.execute(
                text("""
                    INSERT INTO meal_plan_slots
                        (id, plan_id, slot_date, slot, recipe_id, food_id,
                         custom_name, notes, nutrition, locked)
                    VALUES
                        (:id, :pid, :date, :slot, :rid, :fid,
                         :cname, :notes, CAST(:nutrition AS jsonb), false)
                """),
                {
                    "id": str(uuid.uuid4()), "pid": new_id,
                    "date": slot.slot_date, "slot": slot.slot,
                    "rid": str(slot.recipe_id) if slot.recipe_id else None,
                    "fid": str(slot.food_id) if slot.food_id else None,
                    "cname": slot.custom_name, "notes": slot.notes,
                    "nutrition": json.dumps(slot.nutrition or {}),
                },
            )
        await db.commit()
        return {"id": new_id, "resource_type": "plan"}

    raise HTTPException(status_code=422, detail="Unknown resource type")


# ── Status dashboard ─────────────────────────────────────────────────────────

@router.get("/groups/{group_id}/status")
async def member_status(
    group_id: str,
    user: CurrentUser,
    db: DbDep,
) -> dict:
    await _assert_member(db, group_id, str(user.id))

    # Only include members who opted in to status sharing via preferences
    opted_in = (await db.execute(
        text("""
            SELECT u.id, u.display_name
            FROM family_members fm
            JOIN users u ON u.id = fm.user_id
            WHERE fm.group_id = :gid
              AND EXISTS (
                SELECT 1 FROM preferences p
                WHERE p.user_id = u.id
                  AND p.kind = 'share_family_status'
                  AND p.value = 'true'
              )
        """),
        {"gid": group_id},
    )).fetchall()

    statuses = []
    for member in opted_in:
        cal_row = (await db.execute(
            text("""
                SELECT COALESCE(SUM((item->>'calories')::numeric), 0) AS logged_cal
                FROM meal_events me,
                     jsonb_array_elements(me.nutrition) AS item
                WHERE me.user_id = :uid
                  AND me.ts::date = CURRENT_DATE
            """),
            {"uid": str(member.id)},
        )).fetchone()
        logged_cal = float(cal_row.logged_cal) if cal_row else 0.0

        goal_row = (await db.execute(
            text("SELECT daily_calorie_target FROM goals WHERE user_id = :uid"),
            {"uid": str(member.id)},
        )).fetchone()
        target = goal_row.daily_calorie_target if goal_row and goal_row.daily_calorie_target else None

        statuses.append({
            "user_id": str(member.id),
            "display_name": member.display_name,
            "calories_pct": round(logged_cal / target * 100) if target and target > 0 else None,
        })

    return {"statuses": statuses}
