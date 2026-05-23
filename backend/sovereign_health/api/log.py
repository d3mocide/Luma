from fastapi import APIRouter

router = APIRouter()
_NOT_IMPL = {"detail": "not implemented — Phase 1"}


@router.post("/meal/voice")
async def log_meal_voice() -> dict:
    return _NOT_IMPL


@router.post("/meal/photo")
async def log_meal_photo() -> dict:
    return _NOT_IMPL


@router.post("/meal/barcode")
async def log_meal_barcode() -> dict:
    return _NOT_IMPL


@router.post("/meal")
async def log_meal() -> dict:
    return _NOT_IMPL


@router.patch("/meal/{meal_id}")
async def patch_meal(meal_id: str) -> dict:
    return _NOT_IMPL


@router.delete("/meal/{meal_id}")
async def delete_meal(meal_id: str) -> dict:
    return _NOT_IMPL
