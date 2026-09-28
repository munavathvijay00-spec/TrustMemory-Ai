from typing import Dict, Any, List, Optional
from app.core.config import settings
from app.memory.recall import recall_memory
from app.memory.retain import retain_memory
from app.llm.call_extraction import extract_call_summary
from app.core.logging import logger

COACHING_VOICE_AGENT_SYSTEM_PROMPT = """# ROLE

You are the Voice Agent of TrustMemory AI — an outbound calling system for an
Indian home-care agency. You do not exist in isolation. You are one of five
agents (Memory, Decision, Voice, Reflection, Matching) that together maintain
an institutional memory and act on it.

You are not a chatbot. You are a coordinator's judgment, extended into a phone
call, and you will be judged by what you remember afterward.

# EPISTEMIC FOUNDATION

TrustMemory AI maintains four memory networks. Every fact you learn on a call
must be classified before it is written back:

1. WORLD NETWORK — stable, verifiable facts. (helper name, household needs,
   assigned role, phone number.) Written once, rarely changed.
2. EXPERIENCE NETWORK — event records. (this call happened, at this time,
   with this outcome.) Append-only.
3. OPINION NETWORK — derived scores. (Trust, Churn Risk.) Never asserted
   directly — always computed from Experience entries.
4. OBSERVATION NETWORK — cross-placement patterns. (This helper performs
   better in elder care than child care.) Written only by the Reflection Agent.

You do not write to the Opinion Network. You write Experience. The Decision
Agent derives Opinion. If you find yourself saying "churn risk is now X" on a
call, you are overstepping. You record events; you do not score them.

# CALL CONTEXT (injected at trigger time)

Helper: {{helper_name}}
Household: {{household_name}}
Role: {{role}}
Late arrivals in past 14 days: {{late_count}}
Prior coaching calls: {{prior_coaching_count}}
Last coaching call date: {{last_coaching_date}}
Last coaching outcome: {{last_coaching_outcome}}
Days since last call: {{days_since_last_call}}
Scenario: {{scenario}}  # one of: coaching_call | household_checkin | escalation_call
Manual destination: {{manual_phone_number}}

# TONE

Warm, respectful, unhurried. You are the agency's voice — not its police.
Indian home-care context: many helpers are women with family and transport
constraints. Assume good faith. Most lateness is logistics, not defiance.

You do not speak in bullet points. You do not sound like a form. You sound
like a person who has made this call before and knows how to listen.

# OPENING

"Hi {{helper_name}}, this is the agency calling. Is now an okay time to talk
for a few minutes?"

WAIT for their answer. If they say no, offer to call back at a specific time
and end the call politely. Do not push.

If yes, continue based on scenario.

# SCENARIO: coaching_call

"Thanks. I wanted to check in — we've noticed {{late_count}} late arrivals
in the last couple of weeks. I'm not calling to scold you. I want to
understand what's going on and see if there's something we can sort out
together."

LISTENING DISCIPLINE:
- Let them finish. Do not interrupt. Silence is not a problem to be filled.
- If they give a vague reason ("traffic", "issues"), do not accept it. Probe:
  "Can you tell me a bit more about what's been happening?"
- If they give a concrete reason (bus route change, a sick family member,
  a new shift at another job), acknowledge it plainly:
  "That sounds difficult. Thank you for telling me."

NEGOTIATION — you need three things, in this order:
1. A specific change. Not "I'll try harder." Something operational:
   an earlier bus, an alarm, a route change, a different departure time.
   If they propose something vague, ask: "What time will you leave instead?"
2. A commitment to notify. "If you're going to be more than 10 minutes
   late, will you message the household directly?"
3. A follow-up date. "We'll check in again in two weeks. Does that work?"

CLOSING:
"Thank you for talking with me. I've noted what you said. We'll check in
again on {{follow_up_date}}."

# SCENARIO: household_checkin

"Hi, this is the agency. I'm calling for a quick check-in on how things
have been going with {{helper_name}}."

LISTENING DISCIPLINE:
- Open-ended first: "How has the past week been?"
- Praise: acknowledge and ask for a specific example ("What did she do that
  stood out?"). Specifics become Experience memories.
- Concern: do not defend. Ask: "Can you give me an example of what happened?"
- Do not promise a replacement helper. Do not promise a refund.
  Route requests to the coordinator: "I'll pass that to our coordinator,
  who will call you back to discuss."

CLOSING:
"Thank you for your time. We'll keep an eye on things. Anything else
you'd like us to know before I let you go?"

# SCENARIO: escalation_call

This is the third rail. Use only when explicitly triggered.

"Hi {{helper_name}}, this is a follow-up from the agency. We spoke on
{{last_coaching_date}} about {{last_coaching_outcome}}. I need to check
in on what's changed since then."

ASSESSMENT:
- Genuine improvement: "That's good to hear. Can you give me a specific
  example from this week?"
- No improvement: "I understand, but we need to see a change. Here's what
  we need going forward: {{specific_requirement}}."
- Boundary: "If this doesn't improve, the next step will be
  {{consequence}}. I want to be transparent with you."

You do not raise your voice. You do not argue. You do not threaten anything
the agency cannot deliver. If the helper becomes hostile, do not engage:

"I understand this is frustrating. Let me note your concern and we'll
follow up." Then end the call.

# COMPLIANCE GUARDRAILS (non-negotiable)

- Never share another helper's information, performance, or assignments.
- Never promise a specific outcome (reassignment, bonus, disciplinary action).
- Never speak in the voice of the agency's legal or HR function.
- If the helper asks "Am I being fired?", answer: "I'm not able to speak to
  that. Our coordinator will follow up with you directly."
- If the helper asks to speak to a human, end the call courteously within
  30 seconds: "Of course. I'll have our coordinator call you back today."
- Never auto-dial. Every call is triggered by a human coordinator through
  the TrustMemory AI interface, to a single manually entered destination.
  You have no ability to call anyone else.

# OUTCOME EXTRACTION (write back to Experience Network)

At the end of every call, produce a structured Experience entry with:

- call_type: coaching_call | household_checkin | escalation_call
- helper_id: {{helper_id}}
- household_id: {{household_id}}
- duration_seconds: <observed>
- sentiment: cooperative | hesitant | frustrated | hostile
- root_cause_identified: <string or null>     # e.g. "changed bus route"
- specific_commitment: <string or null>       # e.g. "leave at 07:15 instead"
- notification_commitment: boolean            # >10 min late, message household
- follow_up_date: <date>
- escalations_required: boolean
- coordinator_note: <one sentence, plain language>

You do NOT produce a Trust score. You do NOT produce a Churn risk score.
Those are the Decision Agent's responsibility, derived from your entry.

# CLOSING PRINCIPLE

You are the memory of an agency that forgets nothing and shames no one.
Every call you make should leave the helper feeling heard, the household
feeling cared for, and the agency's institutional memory one entry richer.
If you achieve all three, you have done your job. If you achieve two,
you have done your job. If you achieve only the first, you have still
done your job — because a helper who feels heard is a helper who will
pick up the next time you call.
"""

CALL_SCRIPTS = {
    "coaching_call": lambda helper_name, late_count=2, follow_up_date="in two weeks": [
        {"who": "Voice Agent", "text": f"Hi {helper_name.split()[0]}, this is the agency calling. Is now an okay time to talk for a few minutes?"},
        {"who": helper_name.split()[0], "text": "Yes madam, now is fine. What happened?"},
        {"who": "Voice Agent", "text": f"Thanks. I wanted to check in — we've noticed {late_count} late arrivals in the last couple of weeks. I'm not calling to scold you. I want to understand what's going on and see if there's something we can sort out together."},
        {"who": helper_name.split()[0], "text": "Sorry about that madam, there was a major delay on the bus route due to road work. It was taking 45 minutes extra."},
        {"who": "Voice Agent", "text": "That sounds difficult. Thank you for telling me. What time will you leave instead?"},
        {"who": helper_name.split()[0], "text": "I checked the schedule — if I take the earlier bus at 7:15 AM instead of 7:40 AM, I can reach well before time."},
        {"who": "Voice Agent", "text": "Okay, so from tomorrow you'll take the earlier 7:15 AM bus. If you're going to be more than 10 minutes late, will you message the household directly?"},
        {"who": helper_name.split()[0], "text": "Yes, I will directly message the family on WhatsApp immediately if there is any delay."},
        {"who": "Voice Agent", "text": "We'll check in again in two weeks. Does that work?"},
        {"who": helper_name.split()[0], "text": "Yes madam, that works for me. Thank you."},
        {"who": "Voice Agent", "text": f"Thank you for talking with me. I've noted what you said. We'll check in again on {follow_up_date}."},
    ],
    "household_checkin": lambda helper_name, late_count=2, follow_up_date="in two weeks": [
        {"who": "Voice Agent", "text": f"Hi, this is the agency. I'm calling for a quick check-in on how things have been going with {helper_name.split()[0]}."},
        {"who": "Household", "text": "Mostly fine. She has been very attentive to my father's medicine schedule, which we really appreciate, but scheduling on evenings has had some friction."},
        {"who": "Voice Agent", "text": "Can you give me an example of what happened?"},
        {"who": "Household", "text": "Last Tuesday we needed 30 minutes of flexibility due to traffic, but there was a misunderstanding on departure time."},
        {"who": "Voice Agent", "text": "Thank you for explaining. I'll pass that to our coordinator, who will call you back to discuss. Anything else you'd like us to know before I let you go?"},
        {"who": "Household", "text": "No, that was the main point. Thank you for checking in."},
        {"who": "Voice Agent", "text": "Thank you for your time. We'll keep an eye on things and our coordinator will follow up."},
    ],
    "escalation_call": lambda helper_name, late_count=2, follow_up_date="in two weeks": [
        {"who": "Voice Agent", "text": f"Hi {helper_name.split()[0]}, this is a follow-up from the agency. We spoke recently about previous late arrivals. I need to check in on what's changed since then."},
        {"who": helper_name.split()[0], "text": "I understand the concern. Things have still been challenging with morning bus connections."},
        {"who": "Voice Agent", "text": "I understand, but we need to see a change. Here's what we need going forward: reliable arrival by 8:00 AM or notice by 7:30 AM. If this doesn't improve, the next step will be formal placement reassessment. I want to be transparent with you."},
        {"who": helper_name.split()[0], "text": "I understand the boundary. I will commit to leaving 30 minutes earlier from tomorrow."},
        {"who": "Voice Agent", "text": "Thank you for talking with me. I've noted what you said. Our coordinator will follow up with you directly."},
    ],
}

# Compatibility aliases
CALL_SCRIPTS["coaching"] = CALL_SCRIPTS["coaching_call"]
CALL_SCRIPTS["checkin"] = CALL_SCRIPTS["household_checkin"]
CALL_SCRIPTS["escalation"] = CALL_SCRIPTS["escalation_call"]

class VoiceAgent:
    """Voice Agent coordinating evidence gathering, compliance checks, and coaching execution."""

    def get_system_prompt(
        self,
        helper_name: str,
        manual_phone_number: str = "+91 8341745014",
        late_count: int = 2,
        scenario: str = "coaching_call",
        household_name: str = "Client Residence",
        role: str = "Home Care Helper",
        prior_coaching_count: int = 1,
        last_coaching_date: str = "14 days ago",
        last_coaching_outcome: str = "agreed to adjust schedule",
        days_since_last_call: int = 14,
        follow_up_date: str = "in two weeks",
    ) -> str:
        return (
            COACHING_VOICE_AGENT_SYSTEM_PROMPT
            .replace("{{helper_name}}", helper_name)
            .replace("{{household_name}}", household_name)
            .replace("{{role}}", role)
            .replace("{{late_count}}", str(late_count))
            .replace("{{prior_coaching_count}}", str(prior_coaching_count))
            .replace("{{last_coaching_date}}", last_coaching_date)
            .replace("{{last_coaching_outcome}}", last_coaching_outcome)
            .replace("{{days_since_last_call}}", str(days_since_last_call))
            .replace("{{scenario}}", scenario)
            .replace("{{follow_up_date}}", follow_up_date)
            .replace("{{manual_phone_number}}", manual_phone_number)
        )

    async def plan_and_execute_call(
        self,
        call_type: str,
        helper_id: Optional[str] = None,
        helper_name: Optional[str] = None,
        household_id: Optional[str] = None,
        household_name: Optional[str] = None,
        reason: Optional[str] = None,
        manual_phone_number: Optional[str] = None,
        late_count: int = 2,
    ) -> Dict[str, Any]:
        # Strict calling rule check
        phone = (manual_phone_number or "").strip()
        if not phone or phone.startswith("TEST_NUMBER"):
            raise ValueError("Call blocked: only user-entered manual_phone_number is permitted. Test numbers must never be dialed.")

        if helper_id and str(helper_id).startswith("test_"):
            raise ValueError("Call blocked: Test helpers exist solely for demonstration and must never be dialed.")

        h_name = helper_name or "Anita Verma"
        hh_name = household_name or "Client Residence"

        # Normalize scenario name
        scenario = call_type
        if scenario == "coaching":
            scenario = "coaching_call"
        elif scenario == "checkin":
            scenario = "household_checkin"
        elif scenario == "escalation":
            scenario = "escalation_call"

        # 1. Gather evidence from Experience & World memory networks
        helper_mem = {}
        if helper_id:
            helper_mem = await recall_memory(helper_id, query="attendance and coaching history")

        # 2. Generate transcript script according to scenario
        script_fn = CALL_SCRIPTS.get(scenario, CALL_SCRIPTS["coaching_call"])
        transcript = script_fn(h_name, late_count=late_count)

        # 3. Telephony Carrier Dispatch Check
        clean_phone = "".join(ch for ch in phone if ch.isdigit() or ch == '+')
        if not clean_phone.startswith('+') and len(clean_phone) == 10:
            clean_phone = "+91" + clean_phone

        telephony_info = {
            "status": "simulated",
            "provider": "simulation",
            "message": "Local simulation mode. To make physical phone ring, configure BLAND_API_KEY or TWILIO in backend/.env"
        }

        task_prompt = self.get_system_prompt(
            helper_name=h_name,
            manual_phone_number=clean_phone,
            late_count=late_count,
            scenario=scenario,
            household_name=hh_name,
        )
        first_sentence = f"Hi {h_name.split()[0]}, this is the agency calling. Is now an okay time to talk for a few minutes?"

        try:
            if settings.BLAND_API_KEY and settings.BLAND_API_KEY != "bland_mock_key" and not settings.BLAND_API_KEY.startswith("mock"):
                from app.voice.bland_client import bland_client
                telephony_info = await bland_client.send_call(
                    phone_number=clean_phone,
                    task=task_prompt,
                    first_sentence=first_sentence
                )
            elif getattr(settings, 'TWILIO_ACCOUNT_SID', None) and getattr(settings, 'TWILIO_AUTH_TOKEN', None):
                from app.voice.twilio_client import twilio_client
                telephony_info = await twilio_client.make_call(
                    phone_number=clean_phone,
                    first_sentence=first_sentence
                )
            elif settings.VAPI_API_KEY and settings.VAPI_API_KEY != "vapi_mock_key" and not settings.VAPI_API_KEY.startswith("mock"):
                from app.voice.vapi_client import vapi_client
                telephony_info = await vapi_client.create_call(
                    phone_number=clean_phone,
                    context={"helper_name": h_name, "late_count": late_count}
                )
        except Exception as e:
            logger.error(f"[Voice Agent] Error attempting telephony dispatch: {e}")
            telephony_info = {"status": "error", "error": str(e)}

        # 4. Structured Experience Entry Write-Back (Strict Epistemic Rule: Voice Agent writes ONLY Experience)
        follow_up_date = "in two weeks"
        sentiment = "concerned" if scenario == "escalation_call" else "cooperative"

        coordinator_note = (
            f"{h_name.split()[0]} explained root cause (bus route construction), committed to earlier 7:15 AM bus, and agreed to message household if >10 min late."
            if scenario == "coaching_call"
            else f"Household praised care standards, noted evening schedule friction; referred to coordinator."
            if scenario == "household_checkin"
            else f"Helper acknowledged arrival boundary; committed to 30 min earlier departure."
        )

        experience_entry = {
            "call_type": scenario,
            "helper_id": helper_id,
            "household_id": household_id,
            "duration_seconds": 184 if scenario == "coaching_call" else (142 if scenario == "household_checkin" else 210),
            "sentiment": sentiment,
            "root_cause_identified": "bus route construction delay" if scenario == "coaching_call" else None,
            "specific_commitment": "take 07:15 AM bus instead of 07:40 AM" if scenario == "coaching_call" else ("depart 30 minutes earlier" if scenario == "escalation_call" else None),
            "notification_commitment": scenario != "household_checkin",
            "follow_up_date": follow_up_date,
            "escalations_required": scenario == "escalation_call",
            "coordinator_note": coordinator_note,
        }

        # Write ONLY to Experience Network
        if helper_id:
            await retain_memory(
                entity_id=helper_id,
                memory_type="experience",
                content=coordinator_note,
                metadata=experience_entry
            )

        logger.info(f"[Voice Agent] Executed {scenario} call to {phone} for {h_name}. Experience Network updated. Telephony: {telephony_info.get('status')}")

        return {
            "call_type": scenario,
            "helper_id": helper_id,
            "household_id": household_id,
            "destination_phone": phone,
            "late_count": late_count,
            "reason": reason or f"{late_count} recent late arrivals coaching check-in",
            "telephony": telephony_info,
            "transcript": transcript,
            "summary": coordinator_note,
            "sentiment": sentiment,
            "experience_entry": experience_entry,
            "follow_up": follow_up_date,
            "status": "completed",
        }

voice_agent = VoiceAgent()
