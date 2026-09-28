# TrustMemory AI — Live Judge Walkthrough & Demo Guide

> **TrustMemory AI**: An institutional memory and intelligence system for home-care agencies powered by five collaborative agents: **Memory** (Hindsight Core), **Decision**, **Voice**, **Reflection**, and **Matching**.

---

## ⚡ Cold Start (Starting the System)

Run the single dev command from the project root:

```bash
cd /Users/munavathvijay/Desktop/TrustMemory-AI
npm run dev
```

- Server and static frontend will start at: **`http://localhost:3000`**
- SQLite database initializes automatically at: **`trustmemory.db`**
- All agents, epistemic memory networks, and telephony routes are active.

---

## 🎙️ The 3-Minute Live Demo Sequence

### **Step 1: Introduction (15 seconds)**
- Open **`http://localhost:3000`** in your browser.
- **Presenter says:**
  > *"Most agency automation treats helpers like numbers and forgets every interaction the moment a call ends. TrustMemory AI is different: it maintains an institutional memory across four distinct epistemic networks — World, Experience, Opinion, and Observation. Let's see what happens when we place a real outbound coaching call."*

---

### **Step 2: The Calling Safeguard (20 seconds)**
- Click on **"Voice Agent"** in the sidebar.
- Point to the **Strict Calling Safeguard** banner and the helper roster table.
- **Presenter says (Non-negotiable safeguard narrative):**
  > *"Notice our safeguard design: We deliberately constrain the system to ONE manually entered number. The system never auto-dials, never loops through worker lists, and test helper records are hard-blocked from dialing. The human coordinator remains the sole authority on who gets called."*
- *(Optional demonstration)*: Click **"Test Dial"** on Helper 2 (`TEST_NUMBER_02`) to show the strict policy block alert.

---

### **Step 3: Trigger the Real Outbound Call (45 seconds)**
- In the **Outbound Call Configuration** card:
  - **Manual Phone Number**: Enter your real mobile number (e.g. `+91 8341745014`).
  - **Target Helper**: Anita Verma
  - **Recent Late Arrivals**: `2`
  - **Scenario**: `Coaching Call (Late Arrivals Check-in)`
- Click **"📞 Place Call to Live Destination"**.
- **What happens:**
  1. The backend Express route `POST /api/place-call` initiates the telephony session via **Dograh** (or Bland AI fallback).
  2. A green pulsing banner appears: **`📞 OUTBOUND CALL IN PROGRESS (TELEPHONY ACTIVE)`**.
  3. Your physical mobile phone rings.
- **Presenter says:**
  > *"The Voice Agent isn't a generic chatbot. It follows a 7-step warm Indian home-care coaching protocol. It assumes good faith, uncovers logistical obstacles like transit delays, agrees on a realistic adjustment, and secures a proactive notice commitment."*

---

### **Step 4: Post-Call Webhook & Memory Retention (30 seconds)**
- Answer the call or click **"⚡ Finish Call & Trigger Webhook (Instant)"** on the pulsing banner.
- **What happens behind the scenes:**
  1. Dograh dispatches the webhook to `POST /api/dograh-webhook`.
  2. The Voice Agent strictly writes to the **Experience Network** in SQLite (`memories` table).
  3. The **Decision Agent** detects the new experience and recalculates Anita Verma's churn risk using the honest formula:
     $$\text{churn} = \text{clamp}(100 - (\text{trust} \times 0.6) - (\text{positive\_exp} \times 8) + (\text{late\_arrivals} \times 5), 0, 100)$$
  4. The newly derived Opinion is written to SQLite, and an **old → new churn delta** is logged to Agent Activity.
- **Presenter says:**
  > *"Crucially, the Voice Agent never scores people. It only records what happened. The Decision Agent then derives updated trust and churn scores — moving Anita's churn risk with an explicit before-and-after delta."*

---

### **Step 5: Inspecting Hindsight Core & SQLite Proof (45 seconds)**
- Navigate to **"Hindsight Core"** in the sidebar.
- Click on **"Experience Network"** to show the call transcript and logged commitments.
- Click on **"Opinion Network"** to show the derived Churn assessment.
- Click on **"Agent Activity"** to show the live ticker:
  `DECISION AGENT — Recalculated churn risk for Anita Verma following coaching_call. 14 → 33.`
- **The "Judge Killer" Moment (SQLite Terminal Inspection):**
  Open terminal in front of the judges and run:
  ```bash
  sqlite3 trustmemory.db "SELECT network, content, created_at FROM memories WHERE helper_id='anita' ORDER BY created_at DESC LIMIT 3;"
  ```
  Show that this is **NOT a frontend mock**: it is a real SQLite database row written by the backend API!

---

## 🛡️ Presentation Fallback Plan

If live telephony minutes expire or carrier PSTN is congested during the demo:

1. **One-Click Pipeline Execution**:
   - On the Voice Agent page, simply click **"⚡ Trigger Demo Webhook & Memory Write"** in the Telephony banner.
   - This executes the exact same Express route (`/api/dograh-webhook`), performs the real SQLite insert, executes the Decision Agent formula, logs the activity, and refreshes the UI within 1 second.
2. **Reviewing Prior Logged Calls**:
   - Scroll down to **"Call history & Logged Commitments"** on the Voice Agent page.
   - Click on the existing recorded call for Anita Verma to expand the verified transcript, structured Experience entry, and 2-week follow-up commitment.

---

## 🏆 Key Architecture Highlights for Judges

| Component | Implementation | Epistemic Role |
| :--- | :--- | :--- |
| **Memory Core** | SQLite (`better-sqlite3`) | 4 isolated networks: World, Experience, Opinion, Observation |
| **Voice Agent** | Express + Dograh API / Bland fallback | Outbound coaching calls; strictly append-only to Experience |
| **Decision Agent** | Deterministic Formula Engine | Derives Trust & Churn Risk into Opinion Network |
| **Calling Guard** | Whitelisted Single Destination | Never iterates, never auto-dials, zero spam risk |
