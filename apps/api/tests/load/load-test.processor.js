/**
 * Artillery Load Test Processor
 * Custom functions for load testing the Zone News API
 */

const fs = require('fs');
const path = require('path');

// Track performance metrics
const metrics = {
  requests: 0,
  errors: 0,
  responseTimes: [],
  cacheHits: 0,
  cacheMisses: 0,
  rateLimitHits: 0
};

/**
 * Before scenario hook - setup
 */
function beforeScenario(requestParams, context, ee, next) {
  // Add timestamp for request tracking
  context.vars.startTime = Date.now();
  return next();
}

/**
 * After response hook - collect metrics
 */
function afterResponse(requestParams, response, context, ee, next) {
  const endTime = Date.now();
  const responseTime = endTime - context.vars.startTime;
  
  // Track basic metrics
  metrics.requests++;
  metrics.responseTimes.push(responseTime);
  
  // Track errors
  if (response.statusCode >= 400) {
    metrics.errors++;
    
    if (response.statusCode === 429) {
      metrics.rateLimitHits++;
    }
  }
  
  // Track cache performance
  const cacheHeader = response.headers['x-cache'];
  if (cacheHeader === 'HIT') {
    metrics.cacheHits++;
  } else if (cacheHeader === 'MISS') {
    metrics.cacheMisses++;
  }
  
  // Log slow requests
  if (responseTime > 500) {
    console.warn(`Slow request detected: ${requestParams.url} took ${responseTime}ms`);
  }
  
  return next();
}

/**
 * Custom function to validate API response structure
 */
function validateNewsResponse(requestParams, response, context, ee, next) {
  try {
    const body = JSON.parse(response.body);
    
    // Validate required fields
    if (!body.success) {
      ee.emit('error', 'Missing success field in response');
    }
    
    if (body.articles && !Array.isArray(body.articles)) {
      ee.emit('error', 'Articles field is not an array');
    }
    
    // Validate article structure
    if (body.articles && body.articles.length > 0) {
      const article = body.articles[0];
      const requiredFields = ['id', 'title', 'content', 'category', 'source'];
      
      for (const field of requiredFields) {
        if (!article[field]) {
          ee.emit('error', `Missing required field: ${field}`);
        }
      }
    }
    
  } catch (error) {
    ee.emit('error', `Invalid JSON response: ${error.message}`);
  }
  
  return next();
}

/**
 * Custom function to test rate limiting
 */
function testRateLimit(requestParams, response, context, ee, next) {
  if (response.statusCode === 429) {
    // This is expected for rate limit testing
    const rateLimitHeaders = {
      limit: response.headers['x-ratelimit-limit'],
      remaining: response.headers['x-ratelimit-remaining'],
      reset: response.headers['x-ratelimit-reset']
    };
    
    console.log('Rate limit triggered:', rateLimitHeaders);
  }
  
  return next();
}

/**
 * Generate performance report
 */
function generateReport() {
  const avgResponseTime = metrics.responseTimes.length > 0 
    ? metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length 
    : 0;
    
  const maxResponseTime = Math.max(...metrics.responseTimes, 0);
  const minResponseTime = Math.min(...metrics.responseTimes, 0);
  
  // Calculate percentiles
  const sortedTimes = metrics.responseTimes.sort((a, b) => a - b);
  const p95Index = Math.floor(sortedTimes.length * 0.95);
  const p99Index = Math.floor(sortedTimes.length * 0.99);
  
  const report = {
    summary: {
      totalRequests: metrics.requests,
      totalErrors: metrics.errors,
      errorRate: (metrics.errors / metrics.requests * 100).toFixed(2) + '%',
      averageResponseTime: Math.round(avgResponseTime) + 'ms',
      minResponseTime: minResponseTime + 'ms',
      maxResponseTime: maxResponseTime + 'ms',
      p95ResponseTime: (sortedTimes[p95Index] || 0) + 'ms',
      p99ResponseTime: (sortedTimes[p99Index] || 0) + 'ms'
    },
    caching: {
      cacheHits: metrics.cacheHits,
      cacheMisses: metrics.cacheMisses,
      cacheHitRate: metrics.cacheHits + metrics.cacheMisses > 0 
        ? ((metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses)) * 100).toFixed(2) + '%'
        : 'N/A'
    },
    rateLimiting: {
      rateLimitHits: metrics.rateLimitHits,
      rateLimitRate: (metrics.rateLimitHits / metrics.requests * 100).toFixed(2) + '%'
    },
    performance: {
      requestsUnder200ms: sortedTimes.filter(t => t < 200).length,
      requestsUnder500ms: sortedTimes.filter(t => t < 500).length,
      requestsOver1000ms: sortedTimes.filter(t => t > 1000).length
    }
  };
  
  return report;
}

/**
 * Final hook - generate and save report
 */
function afterCompletion(report) {
  const performanceReport = generateReport();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  // Save detailed report
  const reportPath = path.join(__dirname, `load-test-report-${timestamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(performanceReport, null, 2));
  
  // Print summary to console
  console.log('\n=== LOAD TEST RESULTS ===');
  console.log(`Total Requests: ${performanceReport.summary.totalRequests}`);
  console.log(`Error Rate: ${performanceReport.summary.errorRate}`);
  console.log(`Average Response Time: ${performanceReport.summary.averageResponseTime}`);
  console.log(`95th Percentile: ${performanceReport.summary.p95ResponseTime}`);
  console.log(`99th Percentile: ${performanceReport.summary.p99ResponseTime}`);
  console.log(`Cache Hit Rate: ${performanceReport.caching.cacheHitRate}`);
  console.log(`Rate Limit Triggers: ${performanceReport.rateLimiting.rateLimitHits}`);
  console.log(`Report saved to: ${reportPath}`);
  
  // Performance assertions
  const avgTime = parseInt(performanceReport.summary.averageResponseTime);
  const errorRate = parseFloat(performanceReport.summary.errorRate);
  
  console.log('\n=== PERFORMANCE ASSERTIONS ===');
  console.log(`✓ Average response time < 200ms: ${avgTime < 200 ? 'PASS' : 'FAIL'} (${avgTime}ms)`);
  console.log(`✓ Error rate < 1%: ${errorRate < 1 ? 'PASS' : 'FAIL'} (${errorRate}%)`);
  console.log(`✓ Cache functionality working: ${performanceReport.caching.cacheHits > 0 ? 'PASS' : 'FAIL'}`);
  console.log(`✓ Rate limiting active: ${performanceReport.rateLimiting.rateLimitHits > 0 ? 'PASS' : 'FAIL'}`);
}

module.exports = {
  beforeScenario,
  afterResponse,
  validateNewsResponse,
  testRateLimit,
  afterCompletion
};