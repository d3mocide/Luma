"""Coach threads API — create threads, stream messages via SSE."""
from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, Body, HTTPException, status
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
    user: CurrentUser,
    db: DbDep,
    req: NewThreadRequest | None = Body(default=None),
) -> dict[str, Any]:
    thread = CoachThread(
        id=uuid.uuid4(),
        user_id=user.id,
        title=(req.title if req and req.title else None) or "New conversation",
    )
    db.add(thread)
    await db.commit()
    await db.refresh(thread)

    # Enqueue a case file update — the previous thread just "closed"
    try:
        from arq import create_pool
        from luma.worker.settings import WorkerSettings
        pool = await create_pool(WorkerSettings.redis_settings)
        await pool.enqueue_job("update_case_file_task", str(user.id))
        await pool.close()
    except Exception:
        pass  # non-critical — worker cron will catch it anyway

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
        select(CoachMessage)
        .where(CoachMessage.thread_id == thread.id, CoachMessage.is_summary == False)  # noqa: E712
        .order_by(CoachMessage.created_at)
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

    # Load history: start from the latest summary (if any), then all messages after it.
    # This implements the compression contract — summaries replace older messages in context.
    from sqlalchemy import text as sqlt
    latest_summary = await db.execute(
        sqlt("""
            SELECT created_at FROM coach_messages
            WHERE thread_id = :tid AND is_summary = TRUE
            ORDER BY created_at DESC LIMIT 1
        """),
        {"tid": str(thread.id)},
    )
    summary_ts = latest_summary.scalar()

    hist_query = select(CoachMessage).where(CoachMessage.thread_id == thread.id)
    if summary_ts:
        hist_query = hist_query.where(CoachMessage.created_at >= summary_ts)
    hist_query = hist_query.order_by(CoachMessage.created_at).limit(50)

    hist_rows = await db.execute(hist_query)
    history = [{"role": m.role, "content": m.content} for m in hist_rows.scalars().all()]

    from luma.agents.coach import coach_stream
    from luma.db.session import AsyncSessionLocal

    async def _event_stream():
        collected: list[str] = []
        async with AsyncSessionLocal() as agent_db:
            async for chunk in coach_stream(user_id=str(user.id), thread_id=thread_id, messages=history, db=agent_db):
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
