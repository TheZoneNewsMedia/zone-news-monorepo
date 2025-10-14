#!/usr/bin/env node
const http = require('http');
const { app } = require('../src/server');

async function main() {
  const server = await (async () => {
    // Start the app on a random available port
    const srv = app.listen(0);
    await new Promise((r) => srv.once('listening', r));
    return srv;
  })();

  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/health`;
  http.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => {
      console.log('HEALTH RESPONSE:', data);
      server.close(() => process.exit(0));
    });
  }).on('error', (err) => {
    console.error('REQUEST ERROR:', err.message);
    server.close(() => process.exit(1));
  });
}

main().catch((e) => {
  console.error('TEST ERROR:', e);
  process.exit(1);
});
