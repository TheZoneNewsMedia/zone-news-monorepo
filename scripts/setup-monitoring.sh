#!/bin/bash

echo "📊 Setting up Monitoring & Alerts"
echo "================================="
echo ""

# Create monitoring directory
mkdir -p monitoring

# Create health check script
cat > monitoring/health-check.js << 'EOF'
const http = require('http');
const https = require('https');

// Configuration
const SERVICES = [
  { name: 'API', url: 'http://67.219.107.230:3001/health', critical: true },
  { name: 'Mini App', url: 'http://67.219.107.230/miniapp.html', critical: true },
  { name: 'Admin Dashboard', url: 'http://67.219.107.230/admin.html', critical: false },
  { name: 'CMS', url: 'http://67.219.107.230:1337/admin', critical: false },
];

const TELEGRAM_BOT_TOKEN = '8132879580:AAFgNLe51T37LyDSl3g0-_jAsN1-k8ABfPk';
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
EOF

# Create PM2 ecosystem config for monitoring
cat > monitoring/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'zone-monitor',
      script: 'health-check.js',
      cwd: '/root/zone-news-monorepo/monitoring',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '100M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
EOF

# Create system metrics collector
cat > monitoring/metrics.js << 'EOF'
const os = require('os');
const { exec } = require('child_process');
const fs = require('fs').promises;

async function collectMetrics() {
  const metrics = {
    timestamp: new Date().toISOString(),
    system: {
      hostname: os.hostname(),
      platform: os.platform(),
      uptime: os.uptime(),
      loadAverage: os.loadavg(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      memoryUsage: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2) + '%',
      cpuCores: os.cpus().length
    },
    services: {}
  };
  
  // Get PM2 process info
  await new Promise((resolve) => {
    exec('pm2 jlist', (error, stdout) => {
      if (!error) {
        try {
          const processes = JSON.parse(stdout);
          processes.forEach(proc => {
            metrics.services[proc.name] = {
              status: proc.pm2_env.status,
              cpu: proc.monit.cpu,
              memory: proc.monit.memory,
              uptime: proc.pm2_env.pm_uptime,
              restarts: proc.pm2_env.restart_time
            };
          });
        } catch (e) {
          console.error('Failed to parse PM2 data:', e);
        }
      }
      resolve();
    });
  });
  
  // Save metrics to file
  const metricsFile = `/tmp/zone-news-metrics-${Date.now()}.json`;
  await fs.writeFile(metricsFile, JSON.stringify(metrics, null, 2));
  
  console.log('Metrics collected:', metrics);
  
  // Clean up old metrics files (keep last 100)
  exec('ls -t /tmp/zone-news-metrics-*.json | tail -n +101 | xargs rm -f');
  
  return metrics;
}

// Collect metrics every minute
setInterval(collectMetrics, 60000);

// Initial collection
collectMetrics();

console.log('📈 Metrics collector started');
EOF

# Create alert rules
cat > monitoring/alert-rules.json << 'EOF'
{
  "rules": [
    {
      "name": "High Memory Usage",
      "condition": "memory_usage > 90",
      "severity": "warning",
      "message": "Memory usage is above 90%"
    },
    {
      "name": "Service Down",
      "condition": "service_status == 'DOWN'",
      "severity": "critical",
      "message": "Service {service_name} is down"
    },
    {
      "name": "High Response Time",
      "condition": "response_time > 2000",
      "severity": "warning",
      "message": "Service {service_name} response time > 2s"
    },
    {
      "name": "Too Many Restarts",
      "condition": "restart_count > 5",
      "severity": "error",
      "message": "Service {service_name} restarted {restart_count} times"
    }
  ]
}
EOF

echo "✅ Monitoring setup complete!"
echo ""
echo "📝 To deploy monitoring on server:"
echo "1. Copy monitoring folder to server:"
echo "   scp -r monitoring root@67.219.107.230:/root/zone-news-monorepo/"
echo ""
echo "2. SSH into server and start monitoring:"
echo "   ssh root@67.219.107.230"
echo "   cd /root/zone-news-monorepo/monitoring"
echo "   pm2 start ecosystem.config.js"
echo ""
echo "3. View monitoring logs:"
echo "   pm2 logs zone-monitor"
echo ""
echo "📊 Features:"
echo "• Health checks every 5 minutes"
echo "• Telegram alerts for critical issues"
echo "• System metrics collection"
echo "• PM2 process monitoring"
echo "• Alert rules for various conditions"