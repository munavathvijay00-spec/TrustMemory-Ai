try:
    import pytest
except ImportError:
    class _MockPytest:
        class mark:
            @staticmethod
            def asyncio(fn):
                return fn
    pytest = _MockPytest()
import asyncio
from app.services.memory_service import MemoryService
from app.memory.recall import recall_memory

@pytest.mark.asyncio
async def test_manual_helper_memory_retention():
    mem_svc = MemoryService(session=None)
    helper_id = "test_helper_deepa"
    name = "Deepa Sharma"

    await mem_svc.initialize_helper_memory(
        helper_id=helper_id,
        name=name,
        experience_years=5,
        location="Banjara Hills",
        availability="Full-time",
        skills=["elder_care", "cooking"],
        background_note="Specialized experience with elderly dementia care and meal preparation.",
        initial_memories=["Previously supported a family in Jubilee Hills for 2 years with excellent review."]
    )

    mem = await recall_memory(helper_id)

    # Verify World Network facts
    world_texts = [e["text"] for e in mem["world"]]
    assert any("5 years of verified professional experience" in t for t in world_texts)
    assert any("elder care, cooking" in t for t in world_texts)
    assert any("Banjara Hills" in t for t in world_texts)
    assert any("dementia care" in t for t in world_texts)

    # Verify Experience Network entries
    exp_texts = [e["text"] for e in mem["experience"]]
    assert any("Jubilee Hills for 2 years" in t for t in exp_texts)

    # Verify Opinion Network
    opinion_texts = [e["text"] for e in mem["opinion"]]
    assert any("Baseline Trust: 68/100" in t for t in opinion_texts)

@pytest.mark.asyncio
async def test_manual_household_memory_retention():
    mem_svc = MemoryService(session=None)
    household_id = "test_hh_kapoor"
    name = "Kapoor Residence"

    await mem_svc.initialize_household_memory(
        household_id=household_id,
        name=name,
        location="Kondapur",
        requirement="elder_care",
        schedule="Weekday mornings 8am–1pm",
        special_requirements="Requires helper fluent in Hindi. Strictly vegetarian kitchen.",
        initial_memories=["First time hiring an elder care assistant through an agency."]
    )

    mem = await recall_memory(household_id)

    # Verify World Network facts
    world_texts = [e["text"] for e in mem["world"]]
    assert any("located in Kondapur" in t for t in world_texts)
    assert any("elder care" in t for t in world_texts)
    assert any("Weekday mornings 8am–1pm" in t for t in world_texts)
    assert any("Strictly vegetarian kitchen" in t for t in world_texts)

    # Verify Experience Network
    exp_texts = [e["text"] for e in mem["experience"]]
    assert any("First time hiring" in t for t in exp_texts)

    # Verify Opinion Network
    opinion_texts = [e["text"] for e in mem["opinion"]]
    assert any("baseline placement difficulty assessed at 20/100" in t for t in opinion_texts)
