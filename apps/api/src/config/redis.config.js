/**
 * Redis Configuration
 * Production-grade Redis caching configuration for Zone News API
 */

const config = {
  // Redis connection settings
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT) || 6379,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || null,
  REDIS_DB: parseInt(process.env.REDIS_DB) || 0,
  
  // Connection pool settings
  REDIS_MAX_RETRIES: parseInt(process.env.REDIS_MAX_RETRIES) || 3,
  REDIS_RETRY_DELAY: parseInt(process.env.REDIS_RETRY_DELAY) || 1000,
  REDIS_CONNECT_TIMEOUT: parseInt(process.env.REDIS_CONNECT_TIMEOUT) || 5000,
  REDIS_COMMAND_TIMEOUT: parseInt(process.env.REDIS_COMMAND_TIMEOUT) || 2000,
  
  // Cache TTL settings (in seconds)
  CACHE_TTL: {
    NEWS_ARTICLES: parseInt(process.env.CACHE_TTL_NEWS) || 300, // 5 minutes
    TRENDING_ARTICLES: parseInt(process.env.CACHE_TTL_TRENDING) || 600, // 10 minutes
    BREAKING_NEWS: parseInt(process.env.CACHE_TTL_BREAKING) || 180, // 3 minutes
    ARTICLE_STATS: parseInt(process.env.CACHE_TTL_STATS) || 900, // 15 minutes
    SEARCH_RESULTS: parseInt(process.env.CACHE_TTL_SEARCH) || 120, // 2 minutes
  },
  
  // Cache key prefixes
  CACHE_PREFIXES: {
    NEWS: 'zone:news',
    TRENDING: 'zone:trending', 
    BREAKING: 'zone:breaking',
    STATS: 'zone:stats',
    SEARCH: 'zone:search',
    USER: 'zone:user'
  },
  
  // Performance thresholds
  CACHE_METRICS: {
    TARGET_HIT_RATE: parseFloat(process.env.CACHE_TARGET_HIT_RATE) || 0.80, // 80%
    SLOW_QUERY_THRESHOLD: parseInt(process.env.CACHE_SLOW_QUERY_MS) || 10, // 10ms
    MAX_MEMORY_USAGE: parseInt(process.env.REDIS_MAX_MEMORY_MB) || 256, // 256MB
  },
  
  // Feature flags
  FEATURES: {
    CACHE_ENABLED: process.env.CACHE_ENABLED !== 'false',
    CACHE_COMPRESSION: process.env.CACHE_COMPRESSION === 'true',
    CACHE_METRICS_ENABLED: process.env.CACHE_METRICS_ENABLED !== 'false',
    CACHE_WARMING_ENABLED: process.env.CACHE_WARMING_ENABLED === 'true',
  }
};

module.exports = config;