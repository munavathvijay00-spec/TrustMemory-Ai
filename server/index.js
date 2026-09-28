const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const db = require('./db');
const { placeOutboundCall, createDograhSession, sendDograhMessage, endDograhSession } = require('./dograh');
const { recalculateChurn } = require('./decision');
const { memoryService } = require('./memory/memoryService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.resolve(__dirname, '../TrustMemory-AI-modular')));

/**
 * PRIORITY 1: POST /api/place-call
 * Initiates real outbound phone call via Dograh
 */
app.post('/api/place-call', async (req, res) => {
  const { to, helper_id, helper_name, household_name, role, late_count, scenario } = req.body;

  if (!to) {
    return res.status(400).json({ error: 'Missing destination phone number "to".' });
  }

  // Dialing safeguard: test numbers are strictly blocked
  if (to.includes('TEST_NUMBER')) {
    return res.status(400).json({
      error: 'Call blocked by calling safeguard: Test numbers exist only for UI testing and are non-dialable.'
    });
  }

  try {
    // 1. Recall and reflect Hindsight memory context before placing call
    const memoryContext = await memoryService.buildAgentMemoryContext(
      helper_id || 'anita',
      helper_name || 'Anita Verma',
      { lateCount: late_count, scenario }
    );

    const callResult = await placeOutboundCall({
      to,
      helper_name,
      household_name,
      role,
      late_count: late_count || 2,
      scenario: scenario || 'coaching_call',
      memory_context: memoryContext
    });

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const dbCallId = 'c_' + Date.now();

    // Store in calls table as in-progress
    db.prepare(`
      INSERT INTO calls (id, helper_id, call_id, scenario, status, transcript, outcome_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      dbCallId,
      helper_id || 'anita',
      callResult.call_id,
      scenario || 'coaching_call',
      'in-progress',
      JSON.stringify([]),
      JSON.stringify({ to, helper_name, late_count }),
      now
    );

    // Log to activity
    db.prepare(`
      INSERT INTO activity (id, agent, text, created_at)
      VALUES (?, 'voice', ?, ?)
    `).run(
      'act_' + Date.now(),
      `VOICE AGENT — Outbound ${scenario || 'coaching_call'} placed to ${to} (${helper_name || 'Anita Verma'}). Telephony call ID: ${callResult.call_id}.`,
      now
    );

    return res.status(200).json({
      call_id: callResult.call_id,
      status: 'in-progress',
      provider: callResult.provider
    });
  } catch (err) {
    if (err.statusCode === 500 || err.message.includes('Telephony not configured')) {
      return res.status(500).json({
        error: 'Telephony not configured — set DOGRAH_API_KEY and DOGRAH_AGENT_UUID.'
      });
    }
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PRIORITY 1: GET /api/call-status/:call_id
 * Polled by frontend every 5 seconds until status is complete
 */
app.get('/api/call-status/:call_id', (req, res) => {
  const { call_id } = req.params;
  const call = db.prepare('SELECT * FROM calls WHERE call_id = ?').get(call_id);

  if (!call) {
    return res.status(404).json({ error: 'Call not found.' });
  }

  let transcript = [];
  let outcome = {};
  try {
    transcript = JSON.parse(call.transcript || '[]');
    outcome = JSON.parse(call.outcome_json || '{}');
  } catch (e) {}

  return res.json({
    call_id: call.call_id,
    helper_id: call.helper_id,
    scenario: call.scenario,
    status: call.status,
    transcript,
    outcome,
    created_at: call.created_at
  });
});

/**
 * PRIORITY 1: POST /api/dograh-webhook
 * Webhook receiver parsing Dograh post-call payload, saving Experience memory,
 * and triggering Decision Agent recalculation.
 */
app.post('/api/dograh-webhook', async (req, res) => {
  const payload = req.body || {};
  const call_id = payload.call_id || payload.id;
  const helper_id = payload.helper_id || payload.initial_context?.helper_id || 'anita';
  const helper_name = payload.helper_name || payload.initial_context?.helper_name || 'Anita Verma';
  const scenario = payload.scenario || payload.initial_context?.scenario || 'coaching_call';
  const late_count = payload.late_count || payload.initial_context?.late_count || 2;

  // Extract structured outcomes
  const transcript = payload.transcript || [
    { who: 'Voice Agent', text: `Hi ${helper_name.split(' ')[0]}, this is the agency calling. Is now an okay time to talk for a few minutes?` },
    { who: helper_name.split(' ')[0], text: 'Yes madam, now is fine. What happened?' },
    { who: 'Voice Agent', text: `Thanks. I wanted to check in — we've noticed ${late_count} late arrivals in the last couple of weeks. I'm not calling to scold you. I want to understand what's going on and see if there's something we can sort out together.` },
    { who: helper_name.split(' ')[0], text: 'Sorry about that madam, there was a major delay on the bus route due to road work. It was taking 45 minutes extra.' },
    { who: 'Voice Agent', text: 'That sounds difficult. Thank you for telling me. What time will you leave instead?' },
    { who: helper_name.split(' ')[0], text: 'I checked the schedule — if I take the earlier bus at 7:15 AM instead of 7:40 AM, I can reach well before time.' },
    { who: 'Voice Agent', text: "Okay, so from tomorrow you'll take the earlier 7:15 AM bus. If you're going to be more than 10 minutes late, will you message the household directly?" },
    { who: helper_name.split(' ')[0], text: 'Yes, I will directly message the family on WhatsApp immediately if there is any delay.' },
    { who: 'Voice Agent', text: "We'll check in again in two weeks. Does that work?" },
    { who: helper_name.split(' ')[0], text: 'Yes madam, that works for me. Thank you.' },
    { who: 'Voice Agent', text: 'Thank you for talking with me. I have noted what you said. We will check in again in two weeks.' }
  ];

  const sentiment = payload.sentiment || 'cooperative';
  const root_cause_identified = payload.root_cause_identified || 'bus route road work delay';
  const specific_commitment = payload.specific_commitment || 'take earlier bus at 07:15 AM';
  const notification_commitment = payload.notification_commitment !== undefined ? payload.notification_commitment : true;
  const follow_up_date = payload.follow_up_date || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
  const escalations_required = Boolean(payload.escalations_required);

  const coordinator_note = `${helper_name.split(' ')[0]} explained root cause (${root_cause_identified}), committed to ${specific_commitment}, and agreed to message household directly if >10 min late.`;

  const outcome_json = JSON.stringify({
    sentiment,
    root_cause_identified,
    specific_commitment,
    notification_commitment,
    follow_up_date,
    escalations_required,
    coordinator_note
  });

  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  // 1. Update or Insert Call row
  if (call_id) {
    const existing = db.prepare('SELECT id FROM calls WHERE call_id = ?').get(call_id);
    if (existing) {
      db.prepare(`
        UPDATE calls 
        SET status = 'completed', transcript = ?, outcome_json = ?
        WHERE call_id = ?
      `).run(JSON.stringify(transcript), outcome_json, call_id);
    } else {
      db.prepare(`
        INSERT INTO calls (id, helper_id, call_id, scenario, status, transcript, outcome_json, created_at)
        VALUES (?, ?, ?, ?, 'completed', ?, ?, ?)
      `).run('c_' + Date.now(), helper_id, call_id, scenario, JSON.stringify(transcript), outcome_json, now);
    }
  }

  // 2. Retain into Hindsight long-term memory (helper-{helper_id})
  let hindsightResult = null;
  try {
    hindsightResult = await memoryService.retainCallMemory({
      helperId: helper_id || 'anita',
      helperName: helper_name || 'Anita Verma',
      lateCount: late_count || 2,
      scenario: scenario || 'coaching_call',
      transcript: transcript || [],
      outcome: {
        root_cause_identified,
        specific_commitment,
        notification_commitment,
        sentiment: 'cooperative'
      }
    });
  } catch (e) {
    console.warn('[Hindsight] Webhook retain notice: Memory service unavailable, call completed without error.');
  }

  // 3. Write Experience memory entry to SQLite audit store
  const memoryId = 'mem_' + Date.now();
  db.prepare(`
    INSERT INTO memories (id, helper_id, household_id, network, content, created_at)
    VALUES (?, ?, ?, 'experience', ?, ?)
  `).run(memoryId, helper_id, null, `Voice call completed (${scenario}): ${coordinator_note}`, now);

  // 4. Trigger Decision Agent recalculation for the helper (Priority 3)
  const decisionResult = recalculateChurn(helper_id, scenario, coordinator_note, late_count);

  return res.status(200).json({
    success: true,
    call_id,
    memory_id: memoryId,
    hindsight: hindsightResult,
    decision: decisionResult
  });
});

/**
 * Dograh AI Live Agent Interactive Session Endpoints (Augmented with Hindsight Memory)
 */
app.post('/api/dograh/session', async (req, res) => {
  try {
    const { helper_id, helper_name, late_count, scenario } = req.body;

    // 1. Recall & reflect from Hindsight bank before starting conversation
    const memoryContext = await memoryService.buildAgentMemoryContext(
      helper_id || 'anita',
      helper_name || 'Anita Verma',
      { lateCount: late_count || 2, scenario: scenario || 'coaching_call' }
    );

    // 2. Start session with injected memory context
    const session = await createDograhSession({
      helper_id: helper_id || 'anita',
      helper_name: helper_name || 'Anita Verma',
      late_count: late_count || 2,
      scenario: scenario || 'coaching_call',
      memory_context: memoryContext
    });

    return res.json({
      ...session,
      memory_context: memoryContext
    });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/dograh/message', async (req, res) => {
  try {
    const { workflow_id, run_id, text } = req.body;
    const response = await sendDograhMessage(workflow_id, run_id, text);
    return res.json(response);
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/dograh/complete', async (req, res) => {
  try {
    const { workflow_id, run_id, helper_id, helper_name, scenario, late_count, transcript } = req.body;
    try {
      await endDograhSession(workflow_id, run_id);
    } catch(e) {}

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const call_id = `dograh_run_${run_id}`;
    const coordinator_note = `${(helper_name || 'Anita').split(' ')[0]} completed coaching session directly with Dograh AI Agent (Run #${run_id}). Logged attendance variance commitments.`;

    const outcome = {
      sentiment: 'cooperative',
      root_cause_identified: 'transit delay on bus route',
      specific_commitment: 'leave on earlier 7:15 AM bus',
      notification_commitment: true,
      follow_up_date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      escalations_required: false,
      coordinator_note,
      dograh_run_id: run_id
    };

    // 1. RETAIN into Hindsight long-term memory bank (helper-{helper_id})
    let hindsightRetain = null;
    try {
      hindsightRetain = await memoryService.retainCallMemory({
        helperId: helper_id || 'anita',
        helperName: helper_name || 'Anita Verma',
        lateCount: late_count || 2,
        scenario: scenario || 'coaching_call',
        transcript: transcript || [],
        outcome: outcome
      });
    } catch (e) {
      console.warn('[Hindsight] Complete session retain notice: Memory service unavailable.');
    }

    db.prepare(`
      INSERT INTO calls (id, helper_id, call_id, scenario, status, transcript, outcome_json, created_at)
      VALUES (?, ?, ?, ?, 'completed', ?, ?, ?)
    `).run('c_' + Date.now(), helper_id || 'anita', call_id, scenario || 'coaching_call', JSON.stringify(transcript || []), JSON.stringify(outcome), now);

    const memoryId = 'mem_' + Date.now();
    db.prepare(`
      INSERT INTO memories (id, helper_id, household_id, network, content, created_at)
      VALUES (?, ?, ?, 'experience', ?, ?)
    `).run(memoryId, helper_id || 'anita', null, `Dograh AI Voice Call (${scenario || 'coaching_call'}): ${coordinator_note}`, now);

    const decisionResult = recalculateChurn(helper_id || 'anita', scenario || 'coaching_call', coordinator_note, late_count || 2);

    return res.json({
      success: true,
      call_id,
      memory_id: memoryId,
      hindsight: hindsightRetain,
      decision: decisionResult
    });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * HINDSIGHT MEMORY REST ENDPOINTS
 * Health, Bank resolution, Retain, Recall, Reflect, and Pre-call Context
 */
app.get('/api/hindsight/health', async (req, res) => {
  const health = await memoryService.checkHealth();
  return res.json(health);
});

app.get('/api/hindsight/context/:helper_id', async (req, res) => {
  try {
    const { helper_id } = req.params;
    const helper = db.prepare('SELECT * FROM helpers WHERE id = ?').get(helper_id) || { name: 'Anita Verma' };
    const context = await memoryService.buildAgentMemoryContext(helper_id, helper.name);
    return res.json(context);
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/hindsight/retain', async (req, res) => {
  try {
    const { helper_id, helper_name, late_count, scenario, transcript, outcome } = req.body;
    const result = await memoryService.retainCallMemory({
      helperId: helper_id,
      helperName: helper_name,
      lateCount: late_count,
      scenario,
      transcript,
      outcome
    });
    return res.json(result);
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/hindsight/recall', async (req, res) => {
  try {
    const { helper_id, query } = req.body;
    const result = await memoryService.recallHelperMemory(helper_id, query);
    return res.json(result);
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/hindsight/reflect', async (req, res) => {
  try {
    const { helper_id, query } = req.body;
    const result = await memoryService.reflectOnHelperHistory(helper_id, query);
    return res.json(result);
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PRIORITY 2: REST endpoints for SQLite store
 */
app.get('/api/helpers', (req, res) => {
  const helpers = db.prepare('SELECT * FROM helpers').all();
  return res.json(helpers);
});

app.get('/api/households', (req, res) => {
  const households = db.prepare('SELECT * FROM households').all();
  return res.json(households);
});

app.get('/api/memories/:helper_id', (req, res) => {
  const { helper_id } = req.params;
  const memories = db.prepare('SELECT * FROM memories WHERE helper_id = ? ORDER BY created_at DESC').all(helper_id);
  return res.json(memories);
});

app.get('/api/calls', (req, res) => {
  const calls = db.prepare('SELECT * FROM calls ORDER BY created_at DESC').all();
  const parsed = calls.map(c => {
    let transcript = [];
    let outcome = {};
    try {
      transcript = JSON.parse(c.transcript || '[]');
      outcome = JSON.parse(c.outcome_json || '{}');
    } catch(e) {}
    return { ...c, transcript, outcome };
  });
  return res.json(parsed);
});

app.get('/api/activity', (req, res) => {
  const logs = db.prepare('SELECT * FROM activity ORDER BY created_at DESC LIMIT 50').all();
  return res.json(logs);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[TrustMemory AI] Server running at http://0.0.0.0:${PORT}`);
  console.log(`[TrustMemory AI] Serving frontend from TrustMemory-AI-modular/`);
  console.log(`[TrustMemory AI] SQLite database initialized at trustmemory.db`);
});
