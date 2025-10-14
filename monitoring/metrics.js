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
