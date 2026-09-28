const https = require('https');
require('dotenv').config();

const DOGRAH_API_KEY = process.env.DOGRAH_API_KEY;

https.get({
  hostname: 'api.dograh.com',
  port: 443,
  path: '/api/v1/workflow/fetch',
  headers: {
    'Authorization': `Bearer ${DOGRAH_API_KEY}`,
    'X-API-Key': DOGRAH_API_KEY
  }
}, (r) => {
  let b = '';
  r.on('data', d => b += d);
  r.on('end', () => {
    console.log('Status:', r.statusCode);
    console.log('Body:', b);
  });
});
