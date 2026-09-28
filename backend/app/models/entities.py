from typing import Optional, List, Dict, Any
from datetime import date
from sqlalchemy import String, Integer, Date, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin
from app.models.types import GUID, JSONType, ArrayType

class Helper(Base, TimestampMixin):
    __tablename__ = "helpers"

    id: Mapped[str] = mapped_column(GUID, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    location: Mapped[str] = mapped_column(String(128), nullable=False)
    experience_years: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    availability: Mapped[str] = mapped_column(String(64), default="Full-time", nullable=False)
    color: Mapped[str] = mapped_column(String(32), default="#8F6A2E", nullable=False)
    skills: Mapped[List[str]] = mapped_column(ArrayType, default=list, nullable=False)
    role_scores: Mapped[Dict[str, int]] = mapped_column(JSONType, default=dict, nullable=False)

    placements: Mapped[List["Placement"]] = relationship("Placement", back_populates="helper", lazy="selectin")

class Household(Base, TimestampMixin):
    __tablename__ = "households"

    id: Mapped[str] = mapped_column(GUID, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    location: Mapped[str] = mapped_column(String(128), nullable=False)
    requirement: Mapped[str] = mapped_column(String(64), nullable=False)
    schedule: Mapped[str] = mapped_column(String(128), nullable=False)

    placements: Mapped[List["Placement"]] = relationship("Placement", back_populates="household", lazy="selectin")

class Placement(Base, TimestampMixin):
    __tablename__ = "placements"

    id: Mapped[str] = mapped_column(GUID, primary_key=True)
    helper_id: Mapped[str] = mapped_column(GUID, ForeignKey("helpers.id"), nullable=False, index=True)
    household_id: Mapped[str] = mapped_column(GUID, ForeignKey("households.id"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(64), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)  # active, ended_poor_fit, failed, completed

    helper: Mapped["Helper"] = relationship("Helper", back_populates="placements", lazy="selectin")
    household: Mapped["Household"] = relationship("Household", back_populates="placements", lazy="selectin")
