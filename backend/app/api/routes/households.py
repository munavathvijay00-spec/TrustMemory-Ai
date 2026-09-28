from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import uuid
from app.core.db import get_db
from app.schemas.entities import HouseholdRead, HouseholdCreate
from app.models.entities import Household
from app.repositories.entity_repository import EntityRepository
from app.repositories.score_repository import ScoreRepository
from app.repositories.audit_repository import AuditRepository
from app.services.memory_service import MemoryService
from app.core.logging import logger

router = APIRouter(prefix="/households", tags=["Households"])

@router.get("", response_model=List[HouseholdRead])
async def list_households(db: AsyncSession = Depends(get_db)):
    repo = EntityRepository(db)
    score_repo = ScoreRepository(db)
    mem_svc = MemoryService(db)
    households = await repo.list_households()
    results = []
    for hh in households:
        sc = await score_repo.get_score(hh.id)
        mem_count = await mem_svc.count_entity_memories(hh.id)
        results.append(
            HouseholdRead(
                id=hh.id,
                name=hh.name,
                location=hh.location,
                requirement=hh.requirement,
                schedule=hh.schedule,
                created_at=hh.created_at,
                updated_at=hh.updated_at,
                difficulty=sc.difficulty if sc else 20,
                memories_count=mem_count,
            )
        )
    return results

@router.get("/{household_id}", response_model=HouseholdRead)
async def get_household(household_id: str, db: AsyncSession = Depends(get_db)):
    repo = EntityRepository(db)
    score_repo = ScoreRepository(db)
    mem_svc = MemoryService(db)
    hh = await repo.get_household(household_id)
    if not hh:
        raise HTTPException(status_code=404, detail="Household not found")
    sc = await score_repo.get_score(hh.id)
    mem_count = await mem_svc.count_entity_memories(hh.id)
    return HouseholdRead(
        id=hh.id,
        name=hh.name,
        location=hh.location,
        requirement=hh.requirement,
        schedule=hh.schedule,
        created_at=hh.created_at,
        updated_at=hh.updated_at,
        difficulty=sc.difficulty if sc else 20,
        memories_count=mem_count,
    )

@router.post("", response_model=HouseholdRead)
async def create_household(payload: HouseholdCreate, db: AsyncSession = Depends(get_db)):
    repo = EntityRepository(db)
    score_repo = ScoreRepository(db)
    audit_repo = AuditRepository(db)
    mem_svc = MemoryService(db)

    household_id = payload.id or ("h_" + payload.name.lower().replace(" ", "_")[:10] + "_" + str(uuid.uuid4())[:4])

    hh = Household(
        id=household_id,
        name=payload.name,
        location=payload.location,
        requirement=payload.requirement,
        schedule=payload.schedule,
    )
    created = await repo.create_household(hh)

    # Retain facts, special preferences, and baseline opinion into Hindsight Core
    await mem_svc.initialize_household_memory(
        household_id=created.id,
        name=created.name,
        location=created.location,
        requirement=created.requirement,
        schedule=created.schedule,
        special_requirements=payload.special_requirements,
        initial_memories=payload.initial_memories,
    )

    # Initialize baseline score in database
    await score_repo.upsert_score(
        entity_id=created.id,
        entity_type="household",
        difficulty=20,
    )
    await score_repo.record_history(
        entity_id=created.id,
        entity_type="household",
        difficulty=20,
        reason="Initial residence registration",
    )

    # Log to audit trail
    await audit_repo.log_activity(
        agent="MEMORY AGENT",
        action=f"Manually registered residence '{created.name}'. Retained requirements into Hindsight Core.",
        entity_id=created.id,
        details={"requirement": created.requirement, "location": created.location},
    )

    mem_count = await mem_svc.count_entity_memories(created.id)

    logger.info(f"Residence '{created.name}' successfully registered and retained into Hindsight Core with {mem_count} memory items.")

    return HouseholdRead(
        id=created.id,
        name=created.name,
        location=created.location,
        requirement=created.requirement,
        schedule=created.schedule,
        created_at=created.created_at,
        updated_at=created.updated_at,
        difficulty=20,
        memories_count=mem_count,
    )
