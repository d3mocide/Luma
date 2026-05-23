from fastapi import APIRouter

router = APIRouter()
_NOT_IMPL = {"detail": "not implemented — Phase 1"}


@router.get("/current")
async def get_current_plan() -> dict:
    return _NOT_IMPL


@router.get("")
async def get_plan() -> dict:
    return _NOT_IMPL


@router.post("/regenerate")
async def regenerate_plan() -> dict:
    return _NOT_IMPL


@router.post("/slot/{slot_id}/swap")
async def swap_slot(slot_id: str) -> dict:
    return _NOT_IMPL


@router.patch("/slot/{slot_id}")
async def patch_slot(slot_id: str) -> dict:
    return _NOT_IMPL


@router.post("/{plan_id}/log-as-eaten/{slot_id}")
async def log_as_eaten(plan_id: str, slot_id: str) -> dict:
    return _NOT_IMPL


@router.get("/{plan_id}/shopping-list")
async def shopping_list(plan_id: str) -> dict:
    return _NOT_IMPL


@router.post("/{plan_id}/shopping-list/export-reminders")
async def export_reminders(plan_id: str) -> dict:
    return _NOT_IMPL
