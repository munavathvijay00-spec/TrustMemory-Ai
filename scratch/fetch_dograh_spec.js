const https = require('https');
require('dotenv').config();

const DOGRAH_API_KEY = process.env.DOGRAH_API_KEY;

const paths = [
  '/api/v1/openapi.json',
  '/openapi.json',
  '/api/v1/docs',
  '/api/docs',
  '/api/v1/swagger.json'
];

async function checkDocs() {
  for (const p of paths) {
    await new Promise((res) => {
      https.get({
        hostname: 'api.dograh.com',
        port: 443,
        path: p,
        headers: {
          'Authorization': `Bearer ${DOGRAH_API_KEY}`,
          'x-api-key': DOGRAH_API_KEY
        }
      }, (r) => {
        let b = '';
        r.on('data', d => b += d);
        r.on('end', () => {
          console.log(`Path: ${p} -> Status ${r.statusCode} (Length: ${b.length})`);
          if (r.statusCode === 200) {
            try {
              const spec = JSON.parse(b);
              console.log('OpenAPI Paths found:');
              console.log(Object.keys(spec.paths || {}));
            } catch (e) {
              console.log('Non-JSON 200 response:', b.slice(0, 300));
            }
          }
          res();
        });
      }).on('error', e => {
        console.error(p, e.message);
        res();
      });
    });
  }
}

checkDocs();
