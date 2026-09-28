from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from app.core.db import get_db
from app.schemas.dashboard import ReflectionRead
from app.repositories.reflection_repository import ReflectionRepository
from app.services.reflection_service import ReflectionService

router = APIRouter(prefix="/reflections", tags=["Reflections"])

@router.get("", response_model=List[ReflectionRead])
async def list_reflections(entity_id: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    repo = ReflectionRepository(db)
    refls = await repo.list_reflections(entity_id=entity_id)
    return refls

@router.post("/household/{household_id}", response_model=ReflectionRead)
async def trigger_household_reflection(household_id: str, db: AsyncSession = Depends(get_db)):
    svc = ReflectionService(db)
    refl = await svc.reflect_household(household_id)
    return refl

@router.post("/helper/{helper_id}/role-fit", response_model=ReflectionRead)
async def trigger_role_fit_reflection(helper_id: str, db: AsyncSession = Depends(get_db)):
    svc = ReflectionService(db)
    refl = await svc.reflect_role_fit(helper_id)
    return refl
