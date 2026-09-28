from typing import Dict, Any, Optional
from app.llm.groq_client import groq_client
from app.core.logging import logger

FALLBACK_MAP = {
    "late_arrival": {"severity": "MEDIUM", "confidence": 0.81, "reason": "Attendance deviation; severity depends on recurrence."},
    "complaint": {"severity": "MEDIUM", "confidence": 0.85, "reason": "Household-reported dissatisfaction requires review."},
    "negative_feedback": {"severity": "MEDIUM", "confidence": 0.78, "reason": "Negative sentiment recorded in feedback."},
    "positive_feedback": {"severity": "LOW", "confidence": 0.90, "reason": "Positive sentiment, no risk signal."},
    "placement_failure": {"severity": "HIGH", "confidence": 0.90, "reason": "Placement ended in failure."},
    "successful_placement": {"severity": "LOW", "confidence": 0.92, "reason": "Placement concluded successfully."},
    "household_complaint": {"severity": "HIGH", "confidence": 0.83, "reason": "Household-side dissatisfaction pattern."},
    "coaching_completed": {"severity": "LOW", "confidence": 0.88, "reason": "Coaching resolved with commitments logged."},
}

async def classify_event_severity(event_type: str, description: Optional[str] = None) -> Dict[str, Any]:
    """Classifies event severity as LOW, MEDIUM, or HIGH."""
    # Check deterministic fallback first
    res = FALLBACK_MAP.get(event_type)
    if res:
        logger.info(f"[Decision Agent] Classified severity for '{event_type}' -> {res['severity']} ({res['confidence']})")
        return res

    # Otherwise return default
    return {
        "severity": "LOW",
        "confidence": 0.60,
        "reason": f"Standard classification for event type: {event_type}",
    }
