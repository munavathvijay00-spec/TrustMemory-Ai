const https = require('https');
require('dotenv').config();

const BLAND_API_KEY = process.env.BLAND_API_KEY;
console.log('Testing Bland AI with key:', BLAND_API_KEY ? BLAND_API_KEY.slice(0, 10) + '...' : 'NONE');

// Test phone number details or account balance / endpoints
const options = {
  hostname: 'api.bland.ai',
  port: 443,
  path: '/v1/me',
  method: 'GET',
  headers: {
    'authorization': BLAND_API_KEY
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', body);
  });
});

req.on('error', (e) => {
  console.error('Error:', e);
});

req.end();
