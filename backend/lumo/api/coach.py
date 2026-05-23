from fastapi import APIRouter

router = APIRouter()
_NOT_IMPL = {"detail": "not implemented — Phase 2"}


@router.post("/threads")
async def create_thread() -> dict:
    return _NOT_IMPL


@router.get("/threads")
async def list_threads() -> dict:
    return _NOT_IMPL


@router.get("/threads/{thread_id}")
async def get_thread(thread_id: str) -> dict:
    return _NOT_IMPL


@router.post("/threads/{thread_id}/messages")
async def post_message(thread_id: str) -> dict:
    return _NOT_IMPL
