from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from app.core.db import get_db
from app.services.memory_service import MemoryService

router = APIRouter(prefix="/memory", tags=["Memory"])

class RetainPayload(BaseModel):
    layer: str  # world, experience, opinion, observation
    text: str
    metadata: Optional[Dict[str, Any]] = None

@router.get("/{entity_id}")
async def get_entity_memory(entity_id: str, db: AsyncSession = Depends(get_db)):
    svc = MemoryService(db)
    memories = await svc.get_entity_memory(entity_id)
    return memories

@router.post("/{entity_id}/retain")
async def retain_entity_memory(entity_id: str, payload: RetainPayload, db: AsyncSession = Depends(get_db)):
    svc = MemoryService(db)
    entry = await svc.retain_fact(
        entity_id=entity_id,
        layer=payload.layer,
        text=payload.text,
        metadata=payload.metadata,
    )
    return entry
