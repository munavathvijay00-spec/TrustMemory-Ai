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
 * Priority 1: Trigger Outbound Call via Dograh or Bland AI
 */
async function placeOutboundCall({ to, helper_name, household_name, role, late_count, scenario }) {
  // Clean phone number to E.164
  let cleanTo = String(to || '').replace(/[^\d+]/g, '');
  if (!cleanTo.startsWith('+') && cleanTo.length === 10) {
    cleanTo = '+91' + cleanTo;
  }

  // 1. Check Dograh configuration first
  if (DOGRAH_API_KEY && DOGRAH_AGENT_UUID && DOGRAH_API_KEY !== 'mock') {
    const endpoint = `${DOGRAH_API_URL.replace(/\/$/, '')}/calls`;
    const payload = {
      agent_uuid: DOGRAH_AGENT_UUID,
      to: cleanTo,
      initial_context: {
        helper_name: helper_name || 'Anita Verma',
        household_name: household_name || 'Verma Residence',
        role: role || 'elder_care',
        late_count: late_count || 2,
        scenario: scenario || 'coaching_call'
      }
    };

    const res = await httpRequest(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DOGRAH_API_KEY}`,
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
    throw new Error(`Dograh call initiation failed: ${JSON.stringify(res.data || res.raw)}`);
  }

  // 2. Check Bland AI fallback
  if (BLAND_API_KEY && BLAND_API_KEY !== 'bland_mock_key' && !BLAND_API_KEY.startsWith('mock')) {
    const payload = {
      phone_number: cleanTo,
      task: `You are the Voice Agent of TrustMemory AI. Conduct an outbound coaching check-in call with ${helper_name} regarding ${late_count || 2} recent late arrivals.`,
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
    throw new Error(`Bland AI call initiation failed: ${JSON.stringify(res.data || res.raw)}`);
  }

  // Neither configured: Return 500 error as required by specification
  const err = new Error('Telephony not configured — set DOGRAH_API_KEY and DOGRAH_AGENT_UUID.');
  err.statusCode = 500;
  throw err;
}

module.exports = {
  placeOutboundCall
};
