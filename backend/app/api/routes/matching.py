from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.schemas.matching import MatchingRequest, MatchingResponse, CandidateResult
from app.schemas.entities import HelperRead
from app.services.matching_service import MatchingService

router = APIRouter(prefix="/matching", tags=["Matching"])

@router.post("/find", response_model=MatchingResponse)
async def find_matching_candidates(payload: MatchingRequest, db: AsyncSession = Depends(get_db)):
    svc = MatchingService(db)
    raw_results = await svc.find_matches(
        role=payload.role,
        household_id=payload.household_id,
        naive=payload.naive,
    )
    candidates = []
    for r in raw_results:
        h = r["helper"]
        helper_read = HelperRead(
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
            trust=r["trust"],
            churn=r["churn"],
        )
        candidates.append(
            CandidateResult(
                helper=helper_read,
                score=r["score"],
                role_fit=r["role_fit"],
                trust=r["trust"],
                churn=r["churn"],
                why=r["why"],
            )
        )
    return MatchingResponse(
        role=payload.role,
        household_id=payload.household_id,
        candidates=candidates,
    )
