from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
from app.core.db import get_db
from app.schemas.call import CallTriggerRequest, CallRead
from app.repositories.call_repository import CallRepository
from app.services.voice_service import VoiceService
from app.voice.webhook import process_voice_webhook

router = APIRouter(prefix="/voice", tags=["Voice"])

@router.post("/call", response_model=CallRead)
async def trigger_call(payload: CallTriggerRequest, db: AsyncSession = Depends(get_db)):
    svc = VoiceService(db)
    call = await svc.execute_call(
        call_type=payload.call_type,
        helper_id=payload.helper_id,
        household_id=payload.household_id,
        reason=payload.reason,
        idempotency_key=payload.idempotency_key,
    )
    return call

@router.get("/calls", response_model=List[CallRead])
async def list_calls(limit: int = Query(50, ge=1, le=100), db: AsyncSession = Depends(get_db)):
    repo = CallRepository(db)
    calls = await repo.list_calls(limit=limit)
    return calls

@router.post("/webhook")
async def voice_webhook(request: Request):
    payload = await request.json()
    result = await process_voice_webhook(payload)
    return result
