from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import uuid
from app.core.db import get_db
from app.schemas.entities import PlacementRead, PlacementCreate
from app.models.entities import Placement
from app.repositories.entity_repository import EntityRepository

router = APIRouter(prefix="/placements", tags=["Placements"])

@router.get("", response_model=List[PlacementRead])
async def list_placements(db: AsyncSession = Depends(get_db)):
    repo = EntityRepository(db)
    placements = await repo.list_placements()
    return placements

@router.post("", response_model=PlacementRead)
async def create_placement(payload: PlacementCreate, db: AsyncSession = Depends(get_db)):
    repo = EntityRepository(db)
    p = Placement(
        id=payload.id or str(uuid.uuid4())[:8],
        helper_id=payload.helper_id,
        household_id=payload.household_id,
        role=payload.role,
        start_date=payload.start_date,
        end_date=payload.end_date,
        status=payload.status,
    )
    created = await repo.create_placement(p)
    return created
