try:
    import pytest
except ImportError:
    class _MockPytest:
        class mark:
            @staticmethod
            def asyncio(fn):
                return fn
    pytest = _MockPytest()
from app.llm.severity import classify_event_severity

@pytest.mark.asyncio
async def test_classify_event_severity():
    res1 = await classify_event_severity("late_arrival")
    assert res1["severity"] == "MEDIUM"

    res2 = await classify_event_severity("placement_failure")
    assert res2["severity"] == "HIGH"

    res3 = await classify_event_severity("positive_feedback")
    assert res3["severity"] == "LOW"

    res4 = await classify_event_severity("custom_unknown_type")
    assert res4["severity"] == "LOW"
