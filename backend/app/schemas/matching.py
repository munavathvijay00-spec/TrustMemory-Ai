from pydantic import BaseModel
from typing import List, Optional
from app.schemas.common import BaseSchema
from app.schemas.entities import HelperRead

class CandidateResult(BaseSchema):
    helper: HelperRead
    score: int
    role_fit: int
    trust: int
    churn: int
    why: List[str] = []

class MatchingRequest(BaseModel):
    role: str
    household_id: str
    naive: bool = False

class MatchingResponse(BaseSchema):
    role: str
    household_id: str
    candidates: List[CandidateResult]
