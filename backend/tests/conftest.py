import asyncio
import pytest
from datetime import date
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from httpx import AsyncClient, ASGITransport

from app.models.base import Base
from app.models.entities import Helper, Household, Placement
from app.core.db import get_db
from app.main import app

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()

@pytest.fixture
async def seed_data(db_session: AsyncSession):
    helper1 = Helper(
        id="anita",
        name="Anita Verma",
        location="Hyderabad",
        experience_years=6,
        availability="Full-time",
        color="#8F6A2E",
        skills=["elder_care", "cleaning"],
        role_scores={"elder_care": 88, "child_care": 60, "cleaning": 70, "cooking": 55},
    )
    helper2 = Helper(
        id="priya",
        name="Priya Nair",
        location="Hyderabad",
        experience_years=4,
        availability="Full-time",
        color="#3F6659",
        skills=["elder_care", "child_care", "cleaning"],
        role_scores={"elder_care": 93, "child_care": 38, "cleaning": 74, "cooking": 50},
    )
    household1 = Household(
        id="h107",
        name="Verma Residence",
        location="Himayatnagar",
        requirement="elder_care",
        schedule="Full-time",
    )
    placement1 = Placement(
        id="p1",
        helper_id="anita",
        household_id="h107",
        role="elder_care",
        start_date=date(2026, 1, 5),
        end_date=None,
        status="active",
    )
    db_session.add_all([helper1, helper2, household1, placement1])
    await db_session.commit()
    return {"helper1": helper1, "helper2": helper2, "household1": household1, "placement1": placement1}
