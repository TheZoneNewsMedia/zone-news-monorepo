const http = require('http');
const https = require('https');

// Configuration
const SERVICES = [
  { name: 'API', url: 'http://67.219.107.230:3001/health', critical: true },
  { name: 'Mini App', url: 'http://67.219.107.230/miniapp.html', critical: true },
  { name: 'Admin Dashboard', url: 'http://67.219.107.230/admin.html', critical: false },
  { name: 'CMS', url: 'http://67.219.107.230:1337/admin', critical: false },
];

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;

// Security check
if (!TELEGRAM_BOT_TOKEN) {
    console.error('❌ CRITICAL: Bot token not found in environment variables');
    console.error('Please set TELEGRAM_BOT_TOKEN or BOT_TOKEN in your .env file');
    process.exit(1);
}
const ADMIN_CHAT_ID = '7802629063'; // Replace with actual admin chat ID

// Check service health
async function checkService(service) {
  return new Promise((resolve) => {
    const protocol = service.url.startsWith('https') ? https : http;
    
    const req = protocol.get(service.url, { timeout: 5000 }, (res) => {
      const isHealthy = res.statusCode >= 200 && res.statusCode < 400;
      resolve({
        ...service,
        status: isHealthy ? 'UP' : 'DOWN',
        statusCode: res.statusCode,
        responseTime: Date.now() - startTime
      });
    });
    
    const startTime = Date.now();
    
    req.on('error', (err) => {
      resolve({
        ...service,
        status: 'DOWN',
        error: err.message,
        responseTime: Date.now() - startTime
      });
    });
    
    req.on('timeout', () => {
      req.abort();
      resolve({
        ...service,
        status: 'TIMEOUT',
        responseTime: 5000
      });
    });
  });
}

// Send Telegram alert
async function sendAlert(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const data = JSON.stringify({
    chat_id: ADMIN_CHAT_ID,
    text: message,
    parse_mode: 'Markdown'
  });
  
  const options = {
    hostname: 'api.telegram.org',
    path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };
  
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      resolve(res.statusCode === 200);
    });
    
    req.on('error', () => resolve(false));
    req.write(data);
    req.end();
  });
}

// Main monitoring function
async function monitor() {
  console.log(`[${new Date().toISOString()}] Starting health check...`);
  
  const results = await Promise.all(SERVICES.map(checkService));
  
  let hasIssues = false;
  let alertMessage = '🚨 *Zone News Service Alert*\n\n';
  
  for (const result of results) {
    console.log(`${result.name}: ${result.status} (${result.responseTime}ms)`);
    
    if (result.status !== 'UP') {
      hasIssues = true;
      alertMessage += `❌ *${result.name}*: ${result.status}\n`;
      if (result.error) {
        alertMessage += `   Error: ${result.error}\n`;
      }
    }
  }
  
  // Send alert if critical services are down
  if (hasIssues) {
    const criticalDown = results.some(r => r.critical && r.status !== 'UP');
    if (criticalDown) {
      alertMessage += '\n⚠️ Critical services are affected!';
      await sendAlert(alertMessage);
      console.log('Alert sent to admin');
    }
  }
  
  // Log metrics
  const upServices = results.filter(r => r.status === 'UP').length;
  console.log(`\nSummary: ${upServices}/${results.length} services UP`);
  console.log('---\n');
}

// Run monitoring every 5 minutes
setInterval(monitor, 5 * 60 * 1000);

// Initial check
monitor();

console.log('📊 Zone News Health Monitor started');
console.log('Checking services every 5 minutes...\n');
