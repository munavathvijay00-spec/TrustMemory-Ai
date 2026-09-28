const https = require('https');
const http = require('http');
require('dotenv').config();

const DOGRAH_API_KEY = process.env.DOGRAH_API_KEY;
const DOGRAH_AGENT_UUID = process.env.DOGRAH_AGENT_UUID;
const DOGRAH_API_URL = process.env.DOGRAH_API_URL || 'https://api.dograh.com/v1';
const BLAND_API_KEY = process.env.BLAND_API_KEY;

function httpRequest(urlStr, options, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === 'https:' ? https : http;

    const req = lib.request(urlStr, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });

    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

/**
 * Fetch or resolve active Dograh workflow ID
 */
async function getDograhWorkflowId() {
  if (!DOGRAH_API_KEY) return 12570;
  try {
    const wfRes = await httpRequest('https://api.dograh.com/api/v1/workflow/fetch', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${DOGRAH_API_KEY}`,
        'X-API-Key': DOGRAH_API_KEY
      }
    });
    if (wfRes.status === 200 && Array.isArray(wfRes.data) && wfRes.data.length > 0) {
      const matched = wfRes.data.find(w => w.workflow_uuid === DOGRAH_AGENT_UUID || String(w.id) === String(DOGRAH_AGENT_UUID)) || wfRes.data[0];
      if (matched) return matched.id;
    }
  } catch(e) {}
  return 12570;
}

/**
 * Create an interactive live agent session with Dograh AI
 */
async function createDograhSession({ helper_name, late_count, scenario }) {
  const workflowId = await getDograhWorkflowId();
  const endpoint = `https://api.dograh.com/api/v1/workflow/${workflowId}/text-chat/sessions`;

  const payload = {
    name: `${helper_name || 'Anita Verma'} Coaching Check-in`,
    initial_context: {
      helper_name: helper_name || 'Anita Verma',
      late_count: late_count || 2,
      scenario: scenario || 'coaching_call'
    }
  };

  const res = await httpRequest(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DOGRAH_API_KEY}`,
      'X-API-Key': DOGRAH_API_KEY,
      'Content-Type': 'application/json'
    }
  }, payload);

  if (res.status >= 200 && res.status < 300) {
    const turns = res.data.session_data?.turns || [];
    const firstAssistantMsg = turns.length > 0 && turns[0].assistant_message ? turns[0].assistant_message.text : 'Hi, this is the agency calling. Is now an okay time to talk for a few minutes?';
    return {
      success: true,
      workflow_id: workflowId,
      run_id: res.data.workflow_run_id,
      state: res.data.state,
      initial_message: firstAssistantMsg,
      session: res.data
    };
  }

  throw new Error(`Dograh session creation failed: ${JSON.stringify(res.data || res.raw)}`);
}

/**
 * Send user/helper message to Dograh Voice Agent and receive response
 */
async function sendDograhMessage(workflowId, runId, text) {
  const endpoint = `https://api.dograh.com/api/v1/workflow/${workflowId}/text-chat/sessions/${runId}/messages`;
  const payload = { text };

  const res = await httpRequest(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DOGRAH_API_KEY}`,
      'X-API-Key': DOGRAH_API_KEY,
      'Content-Type': 'application/json'
    }
  }, payload);

  if (res.status >= 200 && res.status < 300) {
    const turns = res.data.session_data?.turns || [];
    const lastTurn = turns[turns.length - 1];
    const reply = lastTurn?.assistant_message?.text || 'I understand, thank you for explaining.';
    return {
      success: true,
      reply,
      turns,
      session: res.data
    };
  }

  throw new Error(`Dograh message failed: ${JSON.stringify(res.data || res.raw)}`);
}

/**
 * End Dograh session
 */
async function endDograhSession(workflowId, runId) {
  const endpoint = `https://api.dograh.com/api/v1/workflow/${workflowId}/text-chat/sessions/${runId}/end`;
  const res = await httpRequest(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DOGRAH_API_KEY}`,
      'X-API-Key': DOGRAH_API_KEY,
      'Content-Type': 'application/json'
    }
  }, {});
  return res.data;
}

/**
 * Priority 1: Trigger Outbound Call via Dograh or Bland AI
 */
async function placeOutboundCall({ to, helper_name, household_name, role, late_count, scenario }) {
  let cleanTo = String(to || '').replace(/[^\d+]/g, '');
  if (!cleanTo.startsWith('+') && cleanTo.length === 10) {
    cleanTo = '+91' + cleanTo;
  }

  // 1. Check Dograh configuration first
  if (DOGRAH_API_KEY && DOGRAH_API_KEY !== 'mock') {
    const workflowId = await getDograhWorkflowId();
    const endpoint = 'https://api.dograh.com/api/v1/telephony/initiate-call';
    const payload = {
      workflow_id: Number(workflowId),
      phone_number: cleanTo
    };

    const res = await httpRequest(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DOGRAH_API_KEY}`,
        'X-API-Key': DOGRAH_API_KEY,
        'Content-Type': 'application/json'
      }
    }, payload);

    if (res.status >= 200 && res.status < 300) {
      return {
        call_id: res.data.call_id || res.data.id || ('dograh_' + Date.now()),
        status: 'in-progress',
        provider: 'dograh'
      };
    }

    const errorDetail = res.data?.detail || res.data?.message || JSON.stringify(res.data || res.raw);
    console.warn(`[Telephony] Dograh attempt failed (status ${res.status}): ${errorDetail}`);

    if (!BLAND_API_KEY || BLAND_API_KEY === 'bland_mock_key' || BLAND_API_KEY.startsWith('mock')) {
      throw new Error(`Dograh Telephony: ${errorDetail}`);
    }
    console.log('[Telephony] Falling back to Bland AI carrier...');
  }

  // 2. Check Bland AI fallback
  if (BLAND_API_KEY && BLAND_API_KEY !== 'bland_mock_key' && !BLAND_API_KEY.startsWith('mock')) {
    const payload = {
      phone_number: cleanTo,
      task: `You are the Voice Agent of TrustMemory AI calling on behalf of an Indian home-care agency. Speak with ${helper_name}, a home-care helper. Conduct a short, warm, respectful check-in about ${late_count || 2} recent late arrivals in the past two weeks. Understand the underlying reason (e.g. bus road work delay), agree on a practical solution (e.g. taking 7:15 AM bus), and confirm that the agency will follow up in two weeks.`,
      first_sentence: `Hi ${helper_name ? helper_name.split(' ')[0] : 'there'}, this is the agency calling. Is now an okay time to talk for a few minutes?`,
      wait_for_greeting: true,
      voice: 'maya',
      language: 'en-IN'
    };

    const res = await httpRequest('https://api.bland.ai/v1/calls', {
      method: 'POST',
      headers: {
        'authorization': BLAND_API_KEY,
        'Content-Type': 'application/json'
      }
    }, payload);

    if (res.status >= 200 && res.status < 300) {
      return {
        call_id: res.data.call_id || ('bland_' + Date.now()),
        status: 'in-progress',
        provider: 'bland'
      };
    }

    const blandError = res.data?.message || res.data?.errors?.[0]?.message || JSON.stringify(res.data || res.raw);
    throw new Error(`Carrier Dispatch (${cleanTo}): ${blandError}`);
  }

  const err = new Error('Telephony not configured — set DOGRAH_API_KEY or BLAND_API_KEY in .env.');
  err.statusCode = 500;
  throw err;
}

module.exports = {
  getDograhWorkflowId,
  createDograhSession,
  sendDograhMessage,
  endDograhSession,
  placeOutboundCall
};
