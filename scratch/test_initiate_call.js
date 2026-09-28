const https = require('https');
require('dotenv').config();

const DOGRAH_API_KEY = process.env.DOGRAH_API_KEY;

const payload = JSON.stringify({
  workflow_id: 12570,
  phone_number: '+918341745014'
});

const req = https.request({
  hostname: 'api.dograh.com',
  port: 443,
  path: '/api/v1/telephony/initiate-call',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${DOGRAH_API_KEY}`,
    'X-API-Key': DOGRAH_API_KEY,
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

req.on('error', (e) => {
  console.error('Error:', e);
});

req.write(payload);
req.end();
