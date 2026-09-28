const https = require('https');
require('dotenv').config();

const DOGRAH_API_KEY = process.env.DOGRAH_API_KEY;
const DOGRAH_AGENT_UUID = process.env.DOGRAH_AGENT_UUID;

const endpoints = [
  { method: 'GET', path: '/' },
  { method: 'GET', path: '/health' },
  { method: 'GET', path: '/docs' },
  { method: 'GET', path: '/api/v1/agents' },
  { method: 'GET', path: `/api/v1/agents/${DOGRAH_AGENT_UUID}` },
  { method: 'GET', path: `/v1/agents/${DOGRAH_AGENT_UUID}` },
  { method: 'GET', path: `/agents/${DOGRAH_AGENT_UUID}` },
  { method: 'POST', path: '/calls' },
  { method: 'POST', path: '/api/v1/calls' },
  { method: 'POST', path: `/api/v1/agents/${DOGRAH_AGENT_UUID}/calls` },
  { method: 'POST', path: `/api/v1/agents/${DOGRAH_AGENT_UUID}/outbound` },
  { method: 'POST', path: `/api/v1/agents/${DOGRAH_AGENT_UUID}/call` },
  { method: 'POST', path: `/api/v1/call` },
  { method: 'POST', path: `/api/calls` },
];

function testEndpoint(ep) {
  return new Promise((resolve) => {
    const payload = ep.method === 'POST' ? JSON.stringify({
      agent_uuid: DOGRAH_AGENT_UUID,
      agent_id: DOGRAH_AGENT_UUID,
      recipient_phone_number: '+918341745014',
      phone_number: '+918341745014',
      to: '+918341745014',
      to_number: '+918341745014'
    }) : null;

    const req = https.request({
      hostname: 'api.dograh.com',
      port: 443,
      path: ep.path,
      method: ep.method,
      headers: {
        'Authorization': `Bearer ${DOGRAH_API_KEY}`,
        'x-api-key': DOGRAH_API_KEY,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        resolve({ path: ep.path, method: ep.method, status: res.statusCode, body: body.slice(0, 200) });
      });
    });

    req.on('error', (e) => resolve({ path: ep.path, error: e.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  for (const ep of endpoints) {
    const res = await testEndpoint(ep);
    console.log(`${res.method} ${res.path} -> Status: ${res.status} | Body: ${res.body || res.error}`);
  }
}

run();
