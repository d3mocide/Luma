from fastapi import APIRouter

router = APIRouter()
_NOT_IMPL = {"detail": "not implemented — Phase 1"}


@router.get("/search")
async def search_foods() -> dict:
    return _NOT_IMPL


@router.get("/{food_id}")
async def get_food(food_id: str) -> dict:
    return _NOT_IMPL


@router.post("")
async def create_food() -> dict:
    return _NOT_IMPL
