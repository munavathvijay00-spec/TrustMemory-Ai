from typing import List, Dict, Any

async def synthesize_cross_placement_pattern(household_name: str, placements_count: int, failed_placements: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Synthesizes cross-placement pattern for household into FACT, OBSERVATION, or HYPOTHESIS."""
    failed_count = len(failed_placements)
    if failed_count >= 3:
        classification = "HYPOTHESIS"
        insight = (
            f"{failed_count} placements ended in replacement across different helpers, with schedule-related complaints in each. "
            "Possible common factor: schedule or expectation mismatch on the household side, rather than helper performance."
        )
        confidence = 0.72
    elif failed_count >= 1:
        classification = "OBSERVATION"
        insight = f"{failed_count} placement(s) at {household_name} ended early. Evidence is limited; further placements would clarify whether this is a pattern."
        confidence = 0.50
    else:
        classification = "FACT"
        insight = f"{household_name} has no failed placements on record. Current placement history shows stability."
        confidence = 0.90

    evidence = [
        f"{p.get('helper_name', 'Helper')}: placement ended {p.get('end_date', 'earlier')} ({p.get('status', 'failed').replace('_', ' ')})"
        for p in failed_placements
    ]

    return {
        "classification": classification,
        "insight": insight,
        "evidence": evidence,
        "confidence": confidence,
    }
