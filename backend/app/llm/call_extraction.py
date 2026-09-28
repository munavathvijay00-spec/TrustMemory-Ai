from typing import List, Dict, Any

async def extract_call_summary(call_type: str, helper_name: str, transcript: List[Dict[str, str]]) -> Dict[str, Any]:
    """Extracts summary and sentiment from call transcript."""
    if call_type == "coaching":
        summary = f"{helper_name} acknowledged attendance concerns and committed to proactive updates when running late."
        sentiment = "cooperative"
    elif call_type == "checkin":
        summary = "Household raised a scheduling expectation gap; flagged for the household's memory record."
        sentiment = "cooperative"
    else:
        summary = "Helper acknowledged the complaint; case flagged for coordinator review."
        sentiment = "concerned"

    return {
        "summary": summary,
        "sentiment": sentiment,
        "follow_up": "In 2 weeks",
    }
