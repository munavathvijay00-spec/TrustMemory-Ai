from typing import Optional, Dict, Any
from datetime import date
from sqlalchemy import String, Date, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, TimestampMixin
from app.models.types import GUID, JSONType

class Event(Base, TimestampMixin):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(GUID, primary_key=True)
    helper_id: Mapped[Optional[str]] = mapped_column(GUID, ForeignKey("helpers.id"), nullable=True, index=True)
    household_id: Mapped[Optional[str]] = mapped_column(GUID, ForeignKey("households.id"), nullable=True, index=True)
    placement_id: Mapped[Optional[str]] = mapped_column(GUID, ForeignKey("placements.id"), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(512), nullable=False)
    severity: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)  # LOW, MEDIUM, HIGH, info
    event_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(32), default="live", nullable=False)  # seed, live, voice, manual
    extra_metadata: Mapped[Dict[str, Any]] = mapped_column(JSONType, default=dict, nullable=False)
