"""Favorites API — save and manage collections of food items."""
from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text

from luma.deps import CurrentUser, DbDep

router = APIRouter()


class FavoriteItemIn(BaseModel):
    food_name: str
    brand: str | None = None
    quantity_g: float
    nutrients: dict = {}


class FavoriteCreate(BaseModel):
    name: str
    items: list[FavoriteItemIn] = []


class FavoriteUpdate(BaseModel):
    name: str | None = None
    items: list[FavoriteItemIn] | None = None


def _item_row_to_dict(r: Any) -> dict[str, Any]:
    return {
        "id": str(r.item_id) if r.item_id else None,
        "sort_order": r.sort_order,
        "food_name": r.food_name,
        "brand": r.brand,
        "quantity_g": r.quantity_g,
        "nutrients": r.nutrients if r.nutrients is not None else {},
    }


async def _fetch_favorite(favorite_id: str, user_id: str, db: Any) -> dict[str, Any]:
    rows = await db.execute(
        text("""
            SELECT
                f.id        AS fav_id,
                f.name      AS fav_name,
                f.created_at,
                f.updated_at,
                fi.id       AS item_id,
                fi.sort_order,
                fi.food_name,
                fi.brand,
                fi.quantity_g,
                fi.nutrients
            FROM favorites f
            LEFT JOIN favorite_items fi ON fi.favorite_id = f.id
            WHERE f.id = :fav_id AND f.user_id = :uid
            ORDER BY fi.sort_order NULLS LAST
        """),
        {"fav_id": favorite_id, "uid": user_id},
    )
    results = rows.fetchall()
    if not results:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Favorite not found")

    first = results[0]
    items = [_item_row_to_dict(r) for r in results if r.item_id is not None]
    return {
        "id": str(first.fav_id),
        "name": first.fav_name,
        "created_at": first.created_at.isoformat(),
        "updated_at": first.updated_at.isoformat(),
        "items": items,
    }


# Map sort param to a fixed ORDER BY clause — never interpolate user input directly.
_SORT_ORDERS = {
    "recent": "created_at DESC",
    "frequency": "log_count DESC, created_at DESC",
}


@router.get("")
async def list_favorites(
    user: CurrentUser,
    db: DbDep,
    sort: str = "recent",
    limit: int | None = None,
    offset: int = 0,
) -> dict[str, Any]:
    order_by = _SORT_ORDERS.get(sort, _SORT_ORDERS["recent"])

    params: dict[str, Any] = {"uid": str(user.id)}
    page_clause = ""
    if limit is not None:
        page_clause = "LIMIT :limit OFFSET :offset"
        params["limit"] = max(0, limit)
        params["offset"] = max(0, offset)

    # log_count counts how many times this favorite has been logged. Favorites are
    # logged as meal_events with source='favorite' and raw_input set to the favorite
    # name, so that pairing is the frequency signal. Paging happens on favorites (not
    # joined item rows) via the CTE before items are attached.
    rows = await db.execute(
        text(f"""
            WITH fav_counts AS (
                SELECT
                    f.id, f.name, f.created_at, f.updated_at,
                    COUNT(me.id) AS log_count
                FROM favorites f
                LEFT JOIN meal_events me
                    ON me.user_id = f.user_id
                    AND me.source = 'favorite'
                    AND me.raw_input = f.name
                WHERE f.user_id = :uid
                GROUP BY f.id, f.name, f.created_at, f.updated_at
            ),
            paged AS (
                SELECT * FROM fav_counts
                ORDER BY {order_by}
                {page_clause}
            )
            SELECT
                p.id        AS fav_id,
                p.name      AS fav_name,
                p.created_at,
                p.updated_at,
                p.log_count,
                fi.id       AS item_id,
                fi.sort_order,
                fi.food_name,
                fi.brand,
                fi.quantity_g,
                fi.nutrients
            FROM paged p
            LEFT JOIN favorite_items fi ON fi.favorite_id = p.id
            ORDER BY {order_by}, fi.sort_order NULLS LAST
        """),
        params,
    )
    results = rows.fetchall()

    # Group items under their parent favorite, preserving the ranked order above
    favorites_map: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for r in results:
        fav_id = str(r.fav_id)
        if fav_id not in favorites_map:
            favorites_map[fav_id] = {
                "id": fav_id,
                "name": r.fav_name,
                "created_at": r.created_at.isoformat(),
                "updated_at": r.updated_at.isoformat(),
                "log_count": int(r.log_count or 0),
                "items": [],
            }
            order.append(fav_id)
        if r.item_id is not None:
            favorites_map[fav_id]["items"].append(_item_row_to_dict(r))

    total_row = await db.execute(
        text("SELECT COUNT(*) AS n FROM favorites WHERE user_id = :uid"),
        {"uid": str(user.id)},
    )
    total = int(total_row.scalar() or 0)

    return {"favorites": [favorites_map[k] for k in order], "total": total}


@router.post("")
async def create_favorite(
    body: FavoriteCreate,
    user: CurrentUser,
    db: DbDep,
) -> dict[str, Any]:
    fav_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO favorites (id, user_id, name)
            VALUES (:id, :uid, :name)
        """),
        {"id": fav_id, "uid": str(user.id), "name": body.name},
    )
    for idx, item in enumerate(body.items):
        item_id = str(uuid.uuid4())
        await db.execute(
            text("""
                INSERT INTO favorite_items (id, favorite_id, sort_order, food_name, brand, quantity_g, nutrients)
                VALUES (:id, :fav_id, :sort_order, :food_name, :brand, :quantity_g, CAST(:nutrients AS jsonb))
            """),
            {
                "id": item_id,
                "fav_id": fav_id,
                "sort_order": idx,
                "food_name": item.food_name,
                "brand": item.brand,
                "quantity_g": item.quantity_g,
                "nutrients": json.dumps(item.nutrients),
            },
        )
    await db.commit()
    return await _fetch_favorite(fav_id, str(user.id), db)


@router.patch("/{favorite_id}")
async def update_favorite(
    favorite_id: str,
    body: FavoriteUpdate,
    user: CurrentUser,
    db: DbDep,
) -> dict[str, Any]:
    # Verify ownership
    result = await db.execute(
        text("SELECT id FROM favorites WHERE id = :fav_id AND user_id = :uid"),
        {"fav_id": favorite_id, "uid": str(user.id)},
    )
    if result.fetchone() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Favorite not found")

    if body.name is not None:
        await db.execute(
            text("UPDATE favorites SET name = :name, updated_at = now() WHERE id = :fav_id"),
            {"name": body.name, "fav_id": favorite_id},
        )
    else:
        await db.execute(
            text("UPDATE favorites SET updated_at = now() WHERE id = :fav_id"),
            {"fav_id": favorite_id},
        )

    if body.items is not None:
        await db.execute(
            text("DELETE FROM favorite_items WHERE favorite_id = :fav_id"),
            {"fav_id": favorite_id},
        )
        for idx, item in enumerate(body.items):
            item_id = str(uuid.uuid4())
            await db.execute(
                text("""
                    INSERT INTO favorite_items (id, favorite_id, sort_order, food_name, brand, quantity_g, nutrients)
                    VALUES (:id, :fav_id, :sort_order, :food_name, :brand, :quantity_g, CAST(:nutrients AS jsonb))
                """),
                {
                    "id": item_id,
                    "fav_id": favorite_id,
                    "sort_order": idx,
                    "food_name": item.food_name,
                    "brand": item.brand,
                    "quantity_g": item.quantity_g,
                    "nutrients": json.dumps(item.nutrients),
                },
            )

    await db.commit()
    return await _fetch_favorite(favorite_id, str(user.id), db)


@router.delete("/{favorite_id}")
async def delete_favorite(
    favorite_id: str,
    user: CurrentUser,
    db: DbDep,
) -> dict[str, str]:
    result = await db.execute(
        text("DELETE FROM favorites WHERE id = :fav_id AND user_id = :uid"),
        {"fav_id": favorite_id, "uid": str(user.id)},
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Favorite not found")
    return {"status": "ok"}
