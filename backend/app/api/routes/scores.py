from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.core.db import get_db
from app.schemas.score import ScoreRead, ScoreHistoryRead, ScoreRecalcResult
from app.repositories.score_repository import ScoreRepository
from app.repositories.entity_repository import EntityRepository
from app.services.score_recalc import ScoreRecalcService

router = APIRouter(prefix="/scores", tags=["Scores"])

@router.get("/{entity_id}", response_model=ScoreRead)
async def get_score(entity_id: str, db: AsyncSession = Depends(get_db)):
    repo = ScoreRepository(db)
    sc = await repo.get_score(entity_id)
    if not sc:
        raise HTTPException(status_code=404, detail="Score not found for entity")
    return sc

@router.get("/{entity_id}/history", response_model=List[ScoreHistoryRead])
async def get_score_history(entity_id: str, limit: int = Query(20, ge=1, le=100), db: AsyncSession = Depends(get_db)):
    repo = ScoreRepository(db)
    history = await repo.get_history(entity_id, limit=limit)
    return history

@router.post("/{entity_id}/recalculate", response_model=ScoreRecalcResult)
async def recalculate_score(entity_id: str, db: AsyncSession = Depends(get_db)):
    entity_repo = EntityRepository(db)
    recalc_svc = ScoreRecalcService(db)

    helper = await entity_repo.get_helper(entity_id)
    if helper:
        res = await recalc_svc.recalc_helper(entity_id)
        return ScoreRecalcResult(
            entity_id=entity_id,
            entity_type="helper",
            trust=res["trust"],
            churn=res["churn"],
            why=res["why"],
        )

    household = await entity_repo.get_household(entity_id)
    if household:
        res = await recalc_svc.recalc_household(entity_id)
        return ScoreRecalcResult(
            entity_id=entity_id,
            entity_type="household",
            difficulty=res["difficulty"],
            why=[],
        )

    raise HTTPException(status_code=404, detail="Entity not found")
