from pydantic import BaseModel, ConfigDict
from typing import Generic, TypeVar, List, Optional
from datetime import datetime

T = TypeVar("T")

class BaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

class PaginatedResponse(BaseSchema, Generic[T]):
    items: List[T]
    total: int
    page: int = 1
    page_size: int = 50

class StatusResponse(BaseSchema):
    status: str
    message: Optional[str] = None
