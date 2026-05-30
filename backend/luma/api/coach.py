"""Coach threads API — create threads, stream messages via SSE."""
from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select

from luma.db.models import CoachMessage, CoachThread
from luma.deps import CurrentUser, DbDep

router = APIRouter()


class NewThreadRequest(BaseModel):
    title: str | None = None


class NewMessageRequest(BaseModel):
    content: str


@router.post("/threads")
async def create_thread(
    req: NewThreadRequest,
    user: CurrentUser,
    db: DbDep,
) -> dict[str, Any]:
    thread = CoachThread(
        id=uuid.uuid4(),
        user_id=user.id,
        title=req.title or "New conversation",
    )
    db.add(thread)
    await db.commit()
    await db.refresh(thread)
    return {"id": str(thread.id), "title": thread.title, "created_at": thread.created_at.isoformat()}


@router.get("/threads")
async def list_threads(user: CurrentUser, db: DbDep) -> dict[str, Any]:
    rows = await db.execute(
        select(CoachThread)
        .where(CoachThread.user_id == user.id)
        .order_by(CoachThread.created_at.desc())
        .limit(30)
    )
    return {"threads": [
        {"id": str(t.id), "title": t.title, "created_at": t.created_at.isoformat()}
        for t in rows.scalars().all()
    ]}


@router.get("/threads/{thread_id}")
async def get_thread(thread_id: str, user: CurrentUser, db: DbDep) -> dict[str, Any]:
    row = await db.execute(
        select(CoachThread).where(CoachThread.id == uuid.UUID(thread_id), CoachThread.user_id == user.id)
    )
    thread = row.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")

    msg_rows = await db.execute(
        select(CoachMessage).where(CoachMessage.thread_id == thread.id).order_by(CoachMessage.created_at)
    )
    return {
        "id": str(thread.id),
        "title": thread.title,
        "created_at": thread.created_at.isoformat(),
        "messages": [
            {"id": str(m.id), "role": m.role, "content": m.content, "created_at": m.created_at.isoformat()}
            for m in msg_rows.scalars().all()
        ],
    }


@router.post("/threads/{thread_id}/messages")
async def post_message(
    thread_id: str,
    req: NewMessageRequest,
    user: CurrentUser,
    db: DbDep,
) -> StreamingResponse:
    row = await db.execute(
        select(CoachThread).where(CoachThread.id == uuid.UUID(thread_id), CoachThread.user_id == user.id)
    )
    thread = row.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")

    user_msg = CoachMessage(id=uuid.uuid4(), thread_id=thread.id, role="user", content=req.content)
    db.add(user_msg)
    await db.commit()

    hist_rows = await db.execute(
        select(CoachMessage)
        .where(CoachMessage.thread_id == thread.id)
        .order_by(CoachMessage.created_at)
        .limit(40)
    )
    history = [{"role": m.role, "content": m.content} for m in hist_rows.scalars().all()]

    from luma.agents.coach import coach_stream
    from luma.db.session import AsyncSessionLocal

    async def _event_stream():
        collected: list[str] = []
        async with AsyncSessionLocal() as agent_db:
            async for chunk in coach_stream(user_id=str(user.id), messages=history, db=agent_db):
                yield chunk
                try:
                    data = json.loads(chunk.removeprefix("data: ").strip())
                    if data.get("type") == "token":
                        collected.append(data["text"])
                except (json.JSONDecodeError, ValueError):
                    pass

        reply = "".join(collected).strip()
        if reply:
            async with AsyncSessionLocal() as persist_db:
                asst_msg = CoachMessage(id=uuid.uuid4(), thread_id=thread.id, role="assistant", content=reply)
                persist_db.add(asst_msg)
                await persist_db.commit()

    return StreamingResponse(_event_stream(), media_type="text/event-stream")
