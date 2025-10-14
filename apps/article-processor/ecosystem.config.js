module.exports = {
  apps: [{
    name: 'article-processor',
    script: './index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://localhost:27017/zone_news_production',
      MODE: 'continuous',
      PROCESS_INTERVAL: '*/5 * * * *' // Every 5 minutes
    },
    error_file: '/root/logs/article-processor-error.log',
    out_file: '/root/logs/article-processor-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    time: true
  }]
};