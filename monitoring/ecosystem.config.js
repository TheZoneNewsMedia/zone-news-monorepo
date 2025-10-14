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
