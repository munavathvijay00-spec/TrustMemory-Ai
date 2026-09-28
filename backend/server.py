import json
import asyncio
import random
import time
import uuid
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import date, datetime

from app.memory.recall import recall_memory
from app.memory.retain import retain_memory
from app.services.memory_service import MemoryService
from app.services.scoring_service import calculate_trust, calculate_churn, calculate_difficulty, churn_why
from app.llm.severity import classify_event_severity
from app.services.email_service import email_service
from app.agents.voice_agent import voice_agent
from app.core.logging import logger

PORT = 8000

# Pre-seeded users for instant sign in
REGISTERED_ACCOUNTS = {
    "admin@trustmemory.ai": {
        "email": "admin@trustmemory.ai",
        "username": "admin",
        "password": "admin123",
        "name": "Agency Administrator",
        "role": "admin",
        "entity_id": None
    },
    "anita@gmail.com": {
        "email": "anita@gmail.com",
        "username": "anita",
        "password": "helper123",
        "name": "Anita Verma",
        "role": "helper",
        "entity_id": "anita"
    },
    "sharma@gmail.com": {
        "email": "sharma@gmail.com",
        "username": "sharma",
        "password": "home123",
        "name": "Sharma Residence",
        "role": "household",
        "entity_id": "h101"
    }
}

# OTP storage: email -> { code, role, timestamp }
OTP_STORE = {}

# In-memory store for standalone runner
SEED_HELPERS = [
    {"id":"anita", "name":"Anita Verma", "location":"Hyderabad", "experience_years":6, "availability":"Full-time", "color":"#8F6A2E", "skills":["elder_care","cleaning"], "role_scores":{"elder_care":88,"child_care":60,"cleaning":70,"cooking":55}, "trust":88, "churn":18},
    {"id":"priya", "name":"Priya Nair", "location":"Hyderabad", "experience_years":4, "availability":"Full-time", "color":"#3F6659", "skills":["elder_care","child_care","cleaning"], "role_scores":{"elder_care":93,"child_care":38,"cleaning":74,"cooking":50}, "trust":92, "churn":22},
    {"id":"radha", "name":"Radha Kumari", "location":"Secunderabad", "experience_years":7, "availability":"Full-time", "color":"#5B4A8F", "skills":["child_care","cooking"], "role_scores":{"elder_care":45,"child_care":90,"cleaning":55,"cooking":80}, "trust":78, "churn":15},
    {"id":"sunita", "name":"Sunita Devi", "location":"Hyderabad", "experience_years":3, "availability":"Part-time", "color":"#A6453A", "skills":["cleaning","cooking"], "role_scores":{"elder_care":50,"child_care":48,"cleaning":78,"cooking":65}, "trust":65, "churn":35},
    {"id":"meena", "name":"Meena Joshi", "location":"Gachibowli", "experience_years":9, "availability":"Full-time", "color":"#31507A", "skills":["elder_care","cooking"], "role_scores":{"elder_care":81,"child_care":52,"cleaning":60,"cooking":85}, "trust":85, "churn":20},
]

SEED_HOUSEHOLDS = [
    {"id":"h101", "name":"Sharma Residence", "location":"Jubilee Hills", "requirement":"cleaning", "schedule":"Weekday mornings", "difficulty":20},
    {"id":"h102", "name":"Reddy Residence", "location":"Banjara Hills", "requirement":"elder_care", "schedule":"Live-in", "difficulty":25},
    {"id":"h104", "name":"Iyer Residence", "location":"Madhapur", "requirement":"child_care", "schedule":"Weekday, 9am–6pm", "difficulty":68},
    {"id":"h106", "name":"Nair Residence", "location":"Gachibowli", "requirement":"elder_care", "schedule":"Live-in, new requirement", "difficulty":20},
    {"id":"h107", "name":"Verma Residence", "location":"Himayatnagar", "requirement":"elder_care", "schedule":"Full-time", "difficulty":20},
]

EVENTS = []
CALLS = []
RECOMMENDATIONS = []

mem_svc = MemoryService(session=None)

# Pre-populate memory
for h in SEED_HELPERS:
    asyncio.run(mem_svc.initialize_helper_memory(
        helper_id=h["id"],
        name=h["name"],
        experience_years=h["experience_years"],
        location=h["location"],
        availability=h["availability"],
        skills=h["skills"],
    ))

for hh in SEED_HOUSEHOLDS:
    asyncio.run(mem_svc.initialize_household_memory(
        household_id=hh["id"],
        name=hh["name"],
        location=hh["location"],
        requirement=hh["requirement"],
        schedule=hh["schedule"],
    ))

class APIHandler(BaseHTTPRequestHandler):
    def _send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/v1/health":
            self._send_json({"status": "healthy", "service": "TrustMemory AI Backend", "timestamp": datetime.now().isoformat()})

        elif path == "/api/v1/helpers":
            for h in SEED_HELPERS:
                h["memories_count"] = asyncio.run(mem_svc.count_entity_memories(h["id"]))
            self._send_json(SEED_HELPERS)

        elif path.startswith("/api/v1/helpers/"):
            hid = path.split("/")[-1]
            h = next((x for x in SEED_HELPERS if x["id"] == hid), None)
            if h:
                h["memories_count"] = asyncio.run(mem_svc.count_entity_memories(h["id"]))
                self._send_json(h)
            else:
                self._send_json({"detail": "Helper not found"}, status=404)

        elif path == "/api/v1/households":
            for hh in SEED_HOUSEHOLDS:
                hh["memories_count"] = asyncio.run(mem_svc.count_entity_memories(hh["id"]))
            self._send_json(SEED_HOUSEHOLDS)

        elif path.startswith("/api/v1/households/"):
            hhid = path.split("/")[-1]
            hh = next((x for x in SEED_HOUSEHOLDS if x["id"] == hhid), None)
            if hh:
                hh["memories_count"] = asyncio.run(mem_svc.count_entity_memories(hh["id"]))
                self._send_json(hh)
            else:
                self._send_json({"detail": "Household not found"}, status=404)

        elif path == "/api/v1/events":
            self._send_json(EVENTS)

        elif path == "/api/v1/voice/calls":
            self._send_json(CALLS)

        elif path.startswith("/api/v1/memory/"):
            entity_id = path.split("/")[-1]
            mem = asyncio.run(recall_memory(entity_id))
            self._send_json(mem)

        elif path == "/api/v1/dashboard":
            high_churn = len([h for h in SEED_HELPERS if h.get("churn", 0) >= 55])
            high_diff = len([hh for hh in SEED_HOUSEHOLDS if hh.get("difficulty", 0) >= 55])
            self._send_json({
                "active_helpers": len(SEED_HELPERS),
                "active_households": len(SEED_HOUSEHOLDS),
                "active_placements": 5,
                "actions_required": len(RECOMMENDATIONS),
                "high_churn_count": high_churn,
                "high_difficulty_count": high_diff,
                "alerts": [
                    {
                        "flag": "warn",
                        "title": "Anita Verma churn risk elevated (58/100)",
                        "sub": "Recommended action: Start coaching call",
                        "action_label": "Review",
                        "entity_type": "helper",
                        "entity_id": "anita"
                    }
                ]
            })

        elif path == "/api/v1/auth/me":
            self._send_json({
                "email": "munavathvijay00@gmail.com",
                "name": "Munavath Vijay",
                "role": "admin",
                "provider": "credentials",
                "is_authenticated": True
            })

        else:
            self._send_json({"detail": "Not found"}, status=404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        length = int(self.headers.get("Content-Length", 0))
        payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}

        # -------------------------------------------------------------
        # 1. SEND OTP ENDPOINT
        # -------------------------------------------------------------
        if path == "/api/v1/auth/send-otp":
            email = payload.get("email", "").strip().lower()
            role = payload.get("role", "helper").strip().lower()
            if not email or "@" not in email:
                self._send_json({"detail": "A valid email address is required to generate an OTP."}, status=400)
                return

            otp_code = str(random.randint(100000, 999999))
            OTP_STORE[email] = {
                "code": otp_code,
                "role": role,
                "timestamp": time.time()
            }
            logger.info(f"[Auth Service] Generated OTP {otp_code} for {email} ({role})")

            # Attempt live email delivery via Gmail SMTP using provided App Password
            sent_res = asyncio.run(email_service.send_otp_email(recipient=email, otp_code=otp_code, role=role))
            is_sent = sent_res.get("success", False)

            self._send_json({
                "status": "ok",
                "message": f"Verification OTP sent to {email}",
                "otp": otp_code,
                "email_delivered": is_sent
            }, status=200)

        # -------------------------------------------------------------
        # 2. CREATE ACCOUNT / REGISTER ENDPOINT
        # -------------------------------------------------------------
        elif path == "/api/v1/auth/register":
            email = payload.get("email", "").strip().lower()
            role = payload.get("role", "helper").strip().lower()
            password = payload.get("password", "").strip()
            name = payload.get("name", "").strip() or payload.get("full_name", "").strip() or "User"
            username = payload.get("username", "").strip() or email.split("@")[0]
            entered_otp = str(payload.get("otp", "")).strip()

            if not email or not password or not entered_otp:
                self._send_json({"detail": "Email, password, and OTP code are required."}, status=400)
                return

            stored = OTP_STORE.get(email)
            if not stored or stored.get("code") != entered_otp:
                # Provide a dev bypass for seamless testing in sandbox environments
                if entered_otp != "123456":
                    self._send_json({"detail": "Invalid or expired OTP code. Please request a new OTP."}, status=400)
                    return

            entity_id = None

            # Retain in Hindsight Core and save profile
            if role == "helper":
                entity_id = payload.get("id") or (name.lower().replace(" ", "_")[:10] + "_" + uuid.uuid4().hex[:4])
                exp = int(payload.get("experience_years", 3) or 3)
                skills = payload.get("skills", ["elder_care"])
                if isinstance(skills, str):
                    skills = [s.strip() for s in skills.split(",") if s.strip()]
                loc = payload.get("location", "Hyderabad") or "Hyderabad"
                avail = payload.get("availability", "Full-time") or "Full-time"
                note = payload.get("background_note", "")

                new_helper = {
                    "id": entity_id,
                    "name": name,
                    "location": loc,
                    "experience_years": exp,
                    "availability": avail,
                    "skills": skills,
                    "role_scores": {s: 80 for s in skills},
                    "color": "#3F6659",
                    "trust": 68,
                    "churn": 18
                }
                SEED_HELPERS.insert(0, new_helper)

                # Retain facts, background note, and baseline opinion into Hindsight Core
                asyncio.run(mem_svc.initialize_helper_memory(
                    helper_id=entity_id,
                    name=name,
                    experience_years=exp,
                    location=loc,
                    availability=avail,
                    skills=skills,
                    background_note=note
                ))
                logger.info(f"[Auth] Helper '{name}' registered & retained into Hindsight Core.")

            elif role == "household":
                entity_id = payload.get("id") or ("h_" + name.lower().replace(" ", "_")[:8] + "_" + uuid.uuid4().hex[:4])
                loc = payload.get("location", "Hyderabad") or "Hyderabad"
                req = payload.get("requirement", "cleaning") or "cleaning"
                sched = payload.get("schedule", "Weekday mornings") or "Weekday mornings"
                special_req = payload.get("special_requirements", "")

                new_hh = {
                    "id": entity_id,
                    "name": name,
                    "location": loc,
                    "requirement": req,
                    "schedule": sched,
                    "difficulty": 20
                }
                SEED_HOUSEHOLDS.insert(0, new_hh)

                # Retain facts, requirement, and baseline opinion into Hindsight Core
                asyncio.run(mem_svc.initialize_household_memory(
                    household_id=entity_id,
                    name=name,
                    location=loc,
                    requirement=req,
                    schedule=sched,
                    special_requirements=special_req
                ))
                logger.info(f"[Auth] Household '{name}' registered & retained into Hindsight Core.")

            # Record registered account
            user_data = {
                "email": email,
                "username": username,
                "password": password,
                "name": name,
                "role": role,
                "entity_id": entity_id
            }
            REGISTERED_ACCOUNTS[email] = user_data
            REGISTERED_ACCOUNTS[username] = user_data

            self._send_json({
                "access_token": f"jwt_{role}_{uuid.uuid4().hex[:12]}",
                "token_type": "bearer",
                "user": {
                    "email": email,
                    "username": username,
                    "name": name,
                    "role": role,
                    "entity_id": entity_id
                }
            }, status=201)

        # -------------------------------------------------------------
        # 3. LOGIN ENDPOINT
        # -------------------------------------------------------------
        elif path == "/api/v1/auth/login":
            identifier = payload.get("username", "").strip().lower() or payload.get("email", "").strip().lower()
            password = payload.get("password", "").strip()

            if not identifier or not password:
                self._send_json({"detail": "Username/email and password are required."}, status=400)
                return

            account = REGISTERED_ACCOUNTS.get(identifier)
            if not account:
                # Find matching account by case-insensitive email or username
                account = next(
                    (acc for acc in REGISTERED_ACCOUNTS.values()
                     if acc.get("username", "").lower() == identifier or acc.get("email", "").lower() == identifier),
                    None
                )

            if account and account.get("password") == password:
                logger.info(f"[Auth] User '{account['name']}' ({account['role']}) logged in successfully.")
                self._send_json({
                    "access_token": f"jwt_{account['role']}_{uuid.uuid4().hex[:12]}",
                    "token_type": "bearer",
                    "user": {
                        "email": account["email"],
                        "username": account.get("username", identifier),
                        "name": account["name"],
                        "role": account["role"],
                        "entity_id": account.get("entity_id")
                    }
                }, status=200)
            else:
                self._send_json({"detail": "Invalid username or password."}, status=401)

        # -------------------------------------------------------------
        # 4. GOOGLE AUTH ENDPOINT
        # -------------------------------------------------------------
        elif path == "/api/v1/auth/google":
            email = payload.get("email", "munavathvijay@gmail.com")
            name = payload.get("name") or email.split("@")[0].replace(".", " ").title()
            picture = payload.get("picture", "")

            self._send_json({
                "access_token": f"google_oauth_{email.split('@')[0]}_token",
                "token_type": "bearer",
                "user": {
                    "id": "usr_coord_1",
                    "email": email,
                    "name": name,
                    "role": "admin",
                    "picture": picture,
                    "provider": "google"
                }
            }, status=200)

        elif path == "/api/v1/helpers":
            name = payload.get("name", "New Helper")
            hid = payload.get("id") or name.lower().replace(" ", "_")[:10]
            exp = payload.get("experience_years", 3)
            skills = payload.get("skills", ["elder_care"])
            loc = payload.get("location", "Hyderabad")
            avail = payload.get("availability", "Full-time")

            new_helper = {
                "id": hid,
                "name": name,
                "location": loc,
                "experience_years": exp,
                "availability": avail,
                "skills": skills,
                "role_scores": payload.get("role_scores", {s: 80 for s in skills}),
                "color": payload.get("color", "#3F6659"),
                "trust": 68,
                "churn": 18
            }
            SEED_HELPERS.insert(0, new_helper)

            # Retain in Hindsight
            asyncio.run(mem_svc.initialize_helper_memory(
                helper_id=hid,
                name=name,
                experience_years=exp,
                location=loc,
                availability=avail,
                skills=skills,
                background_note=payload.get("background_note"),
                initial_memories=payload.get("initial_memories")
            ))

            new_helper["memories_count"] = asyncio.run(mem_svc.count_entity_memories(hid))
            self._send_json(new_helper, status=201)

        elif path == "/api/v1/households":
            name = payload.get("name", "New Residence")
            hhid = payload.get("id") or "h_" + name.lower().replace(" ", "_")[:8]
            loc = payload.get("location", "Hyderabad")
            req = payload.get("requirement", "elder_care")
            sched = payload.get("schedule", "Weekday mornings")

            new_hh = {
                "id": hhid,
                "name": name,
                "location": loc,
                "requirement": req,
                "schedule": sched,
                "difficulty": 20
            }
            SEED_HOUSEHOLDS.insert(0, new_hh)

            # Retain in Hindsight
            asyncio.run(mem_svc.initialize_household_memory(
                household_id=hhid,
                name=name,
                location=loc,
                requirement=req,
                schedule=sched,
                special_requirements=payload.get("special_requirements"),
                initial_memories=payload.get("initial_memories")
            ))

            new_hh["memories_count"] = asyncio.run(mem_svc.count_entity_memories(hhid))
            self._send_json(new_hh, status=201)

        elif path == "/api/v1/events":
            etype = payload.get("event_type", "observation")
            desc = payload.get("description", "")
            hid = payload.get("helper_id")
            hhid = payload.get("household_id")

            cls = asyncio.run(classify_event_severity(etype, desc))
            ev = {
                "id": f"ev_{len(EVENTS)+1}",
                "event_type": etype,
                "description": desc,
                "severity": cls["severity"],
                "helper_id": hid,
                "household_id": hhid,
                "event_date": str(date.today()),
                "created_at": datetime.now().isoformat()
            }
            EVENTS.insert(0, ev)

            # Retain into Hindsight Core
            if hid:
                asyncio.run(retain_memory(hid, "experience", desc, {"event_type": etype}))
            if hhid:
                asyncio.run(retain_memory(hhid, "experience", desc, {"event_type": etype}))

            # Recalculate helper churn if applicable
            after_churn = None
            if hid:
                h_events = [e for e in EVENTS if e["helper_id"] == hid]
                after_churn = calculate_churn(h_events)
                for h in SEED_HELPERS:
                    if h["id"] == hid:
                        h["churn"] = after_churn

                if after_churn >= 75:
                    RECOMMENDATIONS.append({
                        "entity_id": hid,
                        "text": f"Critical churn alert for {hid} ({after_churn}/100)",
                        "action": "Escalate to coordinator"
                    })
                    # Dispatch alert email if configured
                    asyncio.run(email_service.send_alert_email(
                        subject=f"CRITICAL CHURN ALERT: {hid} reached score {after_churn}",
                        body_text=f"Event '{desc}' triggered churn escalation to {after_churn}/100."
                    ))

            self._send_json({
                "event": ev,
                "severity_classification": cls,
                "after_churn": after_churn
            }, status=201)

        elif path == "/api/v1/matching/find":
            role = payload.get("role", "elder_care")
            naive = payload.get("naive", False)
            ranked = []
            for h in SEED_HELPERS:
                role_fit = h["role_scores"].get(role, 40)
                trust = h.get("trust", 68)
                churn = h.get("churn", 18)
                if naive:
                    score = min(100, 50 + h["experience_years"]*2)
                else:
                    score = int(round(role_fit*0.5 + trust*0.3 + (100-churn)*0.2))
                ranked.append({
                    "helper": h,
                    "score": score,
                    "role_fit": role_fit,
                    "trust": trust,
                    "churn": churn,
                    "why": churn_why([], churn)
                })
            ranked.sort(key=lambda x: x["score"], reverse=True)
            self._send_json({"role": role, "candidates": ranked})

        elif path == "/api/v1/voice/calls":
            manual_phone = (payload.get("manual_phone_number") or "").strip()
            if not manual_phone or manual_phone.startswith("TEST_NUMBER"):
                self._send_json({
                    "error": "Call blocked by calling rule: Only the user-entered manual phone number can be dialed. Test numbers are non-dialable."
                }, status=400)
                return

            helper_id = payload.get("helper_id")
            if helper_id and str(helper_id).startswith("test_"):
                self._send_json({
                    "error": "Call blocked: Test helpers exist solely for UI demonstration and must not be called."
                }, status=400)
                return

            call_type = payload.get("call_type", "coaching")
            household_id = payload.get("household_id")
            late_count = int(payload.get("late_count") or 2)
            reason = payload.get("reason", f"{late_count} recent late arrivals check-in (coaching)")
            helper = next((h for h in SEED_HELPERS if h["id"] == helper_id), None)
            h_name = helper["name"] if helper else "Anita Verma"

            try:
                call_res = asyncio.run(voice_agent.plan_and_execute_call(
                    call_type=call_type,
                    helper_id=helper_id,
                    helper_name=h_name,
                    household_id=household_id,
                    reason=reason,
                    manual_phone_number=manual_phone,
                    late_count=late_count,
                ))
                CALLS.insert(0, call_res)
                self._send_json(call_res, status=201)
            except Exception as e:
                logger.error(f"[Voice API] Call execution failed: {e}")
                self._send_json({"error": str(e)}, status=400)

        else:
            self._send_json({"detail": "Not found"}, status=404)

def run_server():
    server = HTTPServer(("0.0.0.0", PORT), APIHandler)
    logger.info(f"TrustMemory AI Backend API running at http://0.0.0.0:{PORT}/api/v1/")
    server.serve_forever()

if __name__ == "__main__":
    run_server()
