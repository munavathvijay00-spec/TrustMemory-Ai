from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime
from app.schemas.common import BaseSchema

class CallMessage(BaseModel):
    who: str
    text: str

class CallTriggerRequest(BaseModel):
    call_type: str  # coaching, checkin, escalation
    helper_id: Optional[str] = None
    household_id: Optional[str] = None
    reason: Optional[str] = None
    idempotency_key: Optional[str] = None

class CallRead(BaseSchema):
    id: str
    idempotency_key: Optional[str] = None
    call_type: str
    helper_id: Optional[str] = None
    household_id: Optional[str] = None
    reason: Optional[str] = None
    status: str
    transcript: List[CallMessage] = Field(default_factory=list)
    summary: str
    sentiment: str
    follow_up: Optional[str] = None
    created_at: datetime
