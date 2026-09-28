const https = require('https');
require('dotenv').config();

const DOGRAH_API_KEY = process.env.DOGRAH_API_KEY;
const DOGRAH_AGENT_UUID = process.env.DOGRAH_AGENT_UUID;
const DOGRAH_API_URL = process.env.DOGRAH_API_URL || 'https://api.dograh.com/v1';

console.log('Testing Dograh with:');
console.log('API KEY:', DOGRAH_API_KEY ? DOGRAH_API_KEY.slice(0, 10) + '...' : 'NONE');
console.log('AGENT UUID:', DOGRAH_AGENT_UUID);
console.log('URL:', DOGRAH_API_URL);

const payload = JSON.stringify({
  agent_uuid: DOGRAH_AGENT_UUID,
  to: '+918341745014',
  initial_context: {
    helper_name: 'Anita Verma',
    late_count: 2,
    scenario: 'coaching_call'
  }
});

const url = new URL(`${DOGRAH_API_URL.replace(/\/$/, '')}/calls`);

const options = {
  hostname: url.hostname,
  port: 443,
  path: url.pathname,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${DOGRAH_API_KEY}`,
    'x-api-key': DOGRAH_API_KEY,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

console.log('Sending request to', url.href, '...');

const req = https.request(options, (res) => {
  let body = '';
  console.log('Status code:', res.statusCode);
  console.log('Headers:', res.headers);
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log('Response body:', body);
  });
});

req.on('error', (e) => {
  console.error('Request error:', e);
});

req.write(payload);
req.end();
