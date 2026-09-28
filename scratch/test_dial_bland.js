const https = require('https');
require('dotenv').config();

const BLAND_API_KEY = process.env.BLAND_API_KEY;

const payload = JSON.stringify({
  phone_number: '+918341745014',
  task: 'You are the Voice Agent of TrustMemory AI calling on behalf of an Indian home-care agency. Speak with Anita Verma, a home-care helper. Conduct a short, warm, respectful check-in about 2 recent late arrivals in the past two weeks. Understand the underlying reason, agree on a practical solution, and confirm that the agency will follow up in two weeks.',
  first_sentence: 'Hi Anita, this is the agency calling. Is now an okay time to talk for a few minutes?',
  wait_for_greeting: true,
  voice: 'maya',
  language: 'en-IN'
});

console.log('Sending request to Bland AI for +918341745014...');

const req = https.request({
  hostname: 'api.bland.ai',
  port: 443,
  path: '/v1/calls',
  method: 'POST',
  headers: {
    'authorization': BLAND_API_KEY,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log('Status code:', res.statusCode);
    console.log('Response body:', body);
  });
});

req.on('error', (e) => console.error('Error:', e));
req.write(payload);
req.end();
