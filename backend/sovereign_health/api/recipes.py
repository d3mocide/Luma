from fastapi import APIRouter

router = APIRouter()
_NOT_IMPL = {"detail": "not implemented — Phase 1"}


@router.get("")
async def list_recipes() -> dict:
    return _NOT_IMPL


@router.get("/{recipe_id}")
async def get_recipe(recipe_id: str) -> dict:
    return _NOT_IMPL


@router.post("")
async def create_recipe() -> dict:
    return _NOT_IMPL


@router.delete("/{recipe_id}")
async def delete_recipe(recipe_id: str) -> dict:
    return _NOT_IMPL
