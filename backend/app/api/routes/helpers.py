from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import uuid
from app.core.db import get_db
from app.schemas.entities import HelperRead, HelperCreate
from app.models.entities import Helper
from app.repositories.entity_repository import EntityRepository
from app.repositories.score_repository import ScoreRepository
from app.repositories.audit_repository import AuditRepository
from app.services.memory_service import MemoryService
from app.core.logging import logger

router = APIRouter(prefix="/helpers", tags=["Helpers"])

@router.get("", response_model=List[HelperRead])
async def list_helpers(db: AsyncSession = Depends(get_db)):
    repo = EntityRepository(db)
    score_repo = ScoreRepository(db)
    mem_svc = MemoryService(db)
    helpers = await repo.list_helpers()
    results = []
    for h in helpers:
        sc = await score_repo.get_score(h.id)
        mem_count = await mem_svc.count_entity_memories(h.id)
        results.append(
            HelperRead(
                id=h.id,
                name=h.name,
                location=h.location,
                experience_years=h.experience_years,
                availability=h.availability,
                color=h.color,
                skills=h.skills,
                role_scores=h.role_scores,
                created_at=h.created_at,
                updated_at=h.updated_at,
                trust=sc.trust if sc else 68,
                churn=sc.churn if sc else 18,
                memories_count=mem_count,
            )
        )
    return results

@router.get("/{helper_id}", response_model=HelperRead)
async def get_helper(helper_id: str, db: AsyncSession = Depends(get_db)):
    repo = EntityRepository(db)
    score_repo = ScoreRepository(db)
    mem_svc = MemoryService(db)
    h = await repo.get_helper(helper_id)
    if not h:
        raise HTTPException(status_code=404, detail="Helper not found")
    sc = await score_repo.get_score(h.id)
    mem_count = await mem_svc.count_entity_memories(h.id)
    return HelperRead(
        id=h.id,
        name=h.name,
        location=h.location,
        experience_years=h.experience_years,
        availability=h.availability,
        color=h.color,
        skills=h.skills,
        role_scores=h.role_scores,
        created_at=h.created_at,
        updated_at=h.updated_at,
        trust=sc.trust if sc else 68,
        churn=sc.churn if sc else 18,
        memories_count=mem_count,
    )

@router.post("", response_model=HelperRead)
async def create_helper(payload: HelperCreate, db: AsyncSession = Depends(get_db)):
    repo = EntityRepository(db)
    score_repo = ScoreRepository(db)
    audit_repo = AuditRepository(db)
    mem_svc = MemoryService(db)

    helper_id = payload.id or (payload.name.lower().replace(" ", "_")[:12] + "_" + str(uuid.uuid4())[:4])

    # Compute default role scores if empty
    role_scores = payload.role_scores or {}
    if not role_scores:
        exp = payload.experience_years
        for skill in payload.skills:
            role_scores[skill] = min(95, 75 + exp * 2)

    helper = Helper(
        id=helper_id,
        name=payload.name,
        location=payload.location,
        experience_years=payload.experience_years,
        availability=payload.availability,
        color=payload.color or "#8F6A2E",
        skills=payload.skills,
        role_scores=role_scores,
    )
    created = await repo.create_helper(helper)

    # Retain facts, background note, and baseline opinion into Hindsight Core
    await mem_svc.initialize_helper_memory(
        helper_id=created.id,
        name=created.name,
        experience_years=created.experience_years,
        location=created.location,
        availability=created.availability,
        skills=created.skills,
        background_note=payload.background_note,
        initial_memories=payload.initial_memories,
    )

    # Initialize baseline score in database
    await score_repo.upsert_score(
        entity_id=created.id,
        entity_type="helper",
        trust=68,
        churn=18,
    )
    await score_repo.record_history(
        entity_id=created.id,
        entity_type="helper",
        trust=68,
        churn=18,
        reason="Initial profile registration",
    )

    # Log to audit trail
    await audit_repo.log_activity(
        agent="MEMORY AGENT",
        action=f"Manually registered helper '{created.name}'. Retained facts into Hindsight Core.",
        entity_id=created.id,
        details={"skills": created.skills, "location": created.location},
    )

    mem_count = await mem_svc.count_entity_memories(created.id)

    logger.info(f"Helper '{created.name}' successfully registered and retained into Hindsight Core with {mem_count} memory items.")

    return HelperRead(
        id=created.id,
        name=created.name,
        location=created.location,
        experience_years=created.experience_years,
        availability=created.availability,
        color=created.color,
        skills=created.skills,
        role_scores=created.role_scores,
        created_at=created.created_at,
        updated_at=created.updated_at,
        trust=68,
        churn=18,
        memories_count=mem_count,
    )
