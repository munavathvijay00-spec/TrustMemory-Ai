from pydantic import BaseModel, Field
from typing import List, Dict, Optional
from datetime import date, datetime
from app.schemas.common import BaseSchema

class HelperBase(BaseModel):
    name: str
    location: str
    experience_years: int = 0
    availability: str = "Full-time"
    color: str = "#8F6A2E"
    skills: List[str] = Field(default_factory=list)
    role_scores: Dict[str, int] = Field(default_factory=dict)

class HelperCreate(HelperBase):
    id: Optional[str] = None
    background_note: Optional[str] = None
    initial_memories: Optional[List[str]] = None

class HelperRead(HelperBase, BaseSchema):
    id: str
    created_at: datetime
    updated_at: datetime
    trust: Optional[int] = None
    churn: Optional[int] = None
    memories_count: Optional[int] = None

class HouseholdBase(BaseModel):
    name: str
    location: str
    requirement: str
    schedule: str

class HouseholdCreate(HouseholdBase):
    id: Optional[str] = None
    special_requirements: Optional[str] = None
    initial_memories: Optional[List[str]] = None

class HouseholdRead(HouseholdBase, BaseSchema):
    id: str
    created_at: datetime
    updated_at: datetime
    difficulty: Optional[int] = None
    memories_count: Optional[int] = None

class PlacementBase(BaseModel):
    helper_id: str
    household_id: str
    role: str
    start_date: date
    end_date: Optional[date] = None
    status: str = "active"

class PlacementCreate(PlacementBase):
    id: Optional[str] = None

class PlacementRead(PlacementBase, BaseSchema):
    id: str
    created_at: datetime
    updated_at: datetime
    helper: Optional[HelperRead] = None
    household: Optional[HouseholdRead] = None
