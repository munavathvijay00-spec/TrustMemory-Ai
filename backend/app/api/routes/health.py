from fastapi import APIRouter
from app.schemas.common import StatusResponse

router = APIRouter(prefix="/health", tags=["Health"])

@router.get("", response_model=StatusResponse)
async def check_health():
    return StatusResponse(status="healthy", message="TrustMemory AI backend is active.")
