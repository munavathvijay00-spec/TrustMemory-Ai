const https = require('https');
require('dotenv').config();

const DOGRAH_API_KEY = process.env.DOGRAH_API_KEY;

https.get({
  hostname: 'api.dograh.com',
  port: 443,
  path: '/api/v1/openapi.json',
  headers: {
    'Authorization': `Bearer ${DOGRAH_API_KEY}`,
    'x-api-key': DOGRAH_API_KEY
  }
}, (r) => {
  let b = '';
  r.on('data', d => b += d);
  r.on('end', () => {
    const spec = JSON.parse(b);
    console.log('TELEPHONY INITIATE-CALL SCHEMA:');
    const pathItem = spec.paths['/api/v1/telephony/initiate-call'];
    console.log(JSON.stringify(pathItem, null, 2));

    const reqBodyRef = pathItem?.post?.requestBody?.content?.['application/json']?.schema?.$ref;
    if (reqBodyRef) {
      const schemaName = reqBodyRef.replace('#/components/schemas/', '');
      console.log('\nSCHEMA DEFINITION FOR', schemaName, ':');
      console.log(JSON.stringify(spec.components?.schemas?.[schemaName], null, 2));
    }
  });
});
