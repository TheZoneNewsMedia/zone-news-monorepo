#!/usr/bin/env node
/**
 * Load Testing Implementation - Phase 2.3
 * Tests API gateway and bot performance under load
 */

const axios = require('axios');
const { performance } = require('perf_hooks');

class LoadTester {
    constructor(config = {}) {
        this.config = {
            API_BASE_URL: config.apiUrl || 'http://67.219.107.230:3001',
            BOT_BASE_URL: config.botUrl || 'http://67.219.107.230:3002',
            CONCURRENT_USERS: config.concurrentUsers || 10,
            DURATION_SECONDS: config.duration || 30,
            RAMP_UP_SECONDS: config.rampUp || 5,
            ...config
        };
        
        this.metrics = {
            requests: 0,
            successful: 0,
            failed: 0,
            responseTimes: [],
            errors: [],
            startTime: null,
            endTime: null
        };
    }

    /**
     * Run comprehensive load test
     */
    async runLoadTest() {
        console.log('🚀 Starting Load Test - Phase 2.3');
        console.log(`📊 Configuration:`);
        console.log(`   Concurrent Users: ${this.config.CONCURRENT_USERS}`);
        console.log(`   Duration: ${this.config.DURATION_SECONDS}s`);
        console.log(`   Ramp-up: ${this.config.RAMP_UP_SECONDS}s`);
        console.log(`   API: ${this.config.API_BASE_URL}`);
        
        this.metrics.startTime = performance.now();
        
        try {
            // Phase 1: API Gateway Load Test
            await this.testAPIGateway();
            
            // Phase 2: Bot Health Test
            await this.testBotHealth();
            
            // Phase 3: Database Query Performance
            await this.testDatabasePerformance();
            
            // Phase 4: Cache Performance
            await this.testCachePerformance();
            
            this.metrics.endTime = performance.now();
            this.generateReport();
            
        } catch (error) {
            console.error('❌ Load test failed:', error);
            throw error;
        }
    }

    /**
     * Test API Gateway performance
     */
    async testAPIGateway() {
        console.log('\n📈 Phase 1: API Gateway Load Test');
        
        const promises = [];
        const rampUpDelay = (this.config.RAMP_UP_SECONDS * 1000) / this.config.CONCURRENT_USERS;
        
        for (let i = 0; i < this.config.CONCURRENT_USERS; i++) {
            promises.push(
                this.delayedAPITest(i * rampUpDelay)
            );
        }
        
        await Promise.all(promises);
        console.log(`✅ API Gateway test completed: ${this.metrics.successful}/${this.metrics.requests} successful`);
    }

    /**
     * Run delayed API test for gradual ramp-up
     */
    async delayedAPITest(delay) {
        await this.sleep(delay);
        
        const startTime = performance.now();
        const endTime = startTime + (this.config.DURATION_SECONDS * 1000);
        
        while (performance.now() < endTime) {
            await this.makeAPIRequest('/api/news');
            await this.makeAPIRequest('/health');
            await this.sleep(100); // 100ms between requests
        }
    }

    /**
     * Make single API request and record metrics
     */
    async makeAPIRequest(endpoint) {
        const requestStart = performance.now();
        this.metrics.requests++;
        
        try {
            const response = await axios.get(`${this.config.API_BASE_URL}${endpoint}`, {
                timeout: 5000,
                validateStatus: (status) => status < 500 // Accept 4xx as success for load testing
            });
            
            const responseTime = performance.now() - requestStart;
            this.metrics.responseTimes.push(responseTime);
            this.metrics.successful++;
            
            // Log slow responses
            if (responseTime > 1000) {
                console.log(`⚠️  Slow response: ${endpoint} - ${responseTime.toFixed(2)}ms`);
            }
            
        } catch (error) {
            this.metrics.failed++;
            this.metrics.errors.push({
                endpoint,
                error: error.message,
                time: new Date().toISOString()
            });
        }
    }

    /**
     * Test bot health endpoints
     */
    async testBotHealth() {
        console.log('\n🤖 Phase 2: Bot Health Test');
        
        try {
            const botResponse = await axios.get(`${this.config.BOT_BASE_URL}/health`, {
                timeout: 3000
            });
            
            console.log('✅ Bot health check passed');
            console.log(`   Memory: ${botResponse.data.memory || 'N/A'}`);
            console.log(`   Uptime: ${botResponse.data.uptime || 'N/A'}`);
            
        } catch (error) {
            console.error('❌ Bot health check failed:', error.message);
            this.metrics.errors.push({
                endpoint: '/health',
                error: error.message,
                service: 'bot'
            });
        }
    }

    /**
     * Test database query performance under load
     */
    async testDatabasePerformance() {
        console.log('\n💾 Phase 3: Database Performance Test');
        
        const queries = [
            '/api/news?limit=10',
            '/api/news?category=local',
            '/api/news?trending=true',
            '/api/articles/recent'
        ];
        
        const dbTestPromises = queries.map(async (query) => {
            const times = [];
            
            for (let i = 0; i < 10; i++) {
                const start = performance.now();
                try {
                    await axios.get(`${this.config.API_BASE_URL}${query}`, { timeout: 2000 });
                    times.push(performance.now() - start);
                } catch (error) {
                    console.log(`⚠️  DB query failed: ${query}`);
                }
                await this.sleep(50);
            }
            
            const avgTime = times.length > 0 ? times.reduce((a, b) => a + b) / times.length : 0;
            console.log(`   ${query}: ${avgTime.toFixed(2)}ms avg`);
            
            return { query, avgTime, times };
        });
        
        await Promise.all(dbTestPromises);
        console.log('✅ Database performance test completed');
    }

    /**
     * Test cache performance
     */
    async testCachePerformance() {
        console.log('\n⚡ Phase 4: Cache Performance Test');
        
        const endpoint = '/api/news';
        const iterations = 20;
        const times = [];
        
        // First request (cache miss)
        const firstStart = performance.now();
        await axios.get(`${this.config.API_BASE_URL}${endpoint}`);
        const firstTime = performance.now() - firstStart;
        console.log(`   First request (cache miss): ${firstTime.toFixed(2)}ms`);
        
        // Subsequent requests (should be cached)
        for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            try {
                await axios.get(`${this.config.API_BASE_URL}${endpoint}`);
                times.push(performance.now() - start);
            } catch (error) {
                console.log(`⚠️  Cache test request failed: ${i + 1}`);
            }
            await this.sleep(10);
        }
        
        const avgCachedTime = times.reduce((a, b) => a + b) / times.length;
        const improvement = ((firstTime - avgCachedTime) / firstTime * 100).toFixed(1);
        
        console.log(`   Cached requests: ${avgCachedTime.toFixed(2)}ms avg`);
        console.log(`   Cache improvement: ${improvement}% faster`);
        console.log('✅ Cache performance test completed');
    }

    /**
     * Generate comprehensive test report
     */
    generateReport() {
        const duration = (this.metrics.endTime - this.metrics.startTime) / 1000;
        const rps = this.metrics.requests / duration;
        const successRate = (this.metrics.successful / this.metrics.requests * 100).toFixed(2);
        
        // Calculate response time percentiles
        const sortedTimes = this.metrics.responseTimes.sort((a, b) => a - b);
        const p50 = this.getPercentile(sortedTimes, 50);
        const p95 = this.getPercentile(sortedTimes, 95);
        const p99 = this.getPercentile(sortedTimes, 99);
        const avgTime = sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length;
        
        console.log('\n📊 LOAD TEST REPORT');
        console.log('==================');
        console.log(`Duration: ${duration.toFixed(2)}s`);
        console.log(`Total Requests: ${this.metrics.requests}`);
        console.log(`Successful: ${this.metrics.successful}`);
        console.log(`Failed: ${this.metrics.failed}`);
        console.log(`Success Rate: ${successRate}%`);
        console.log(`Requests/Second: ${rps.toFixed(2)}`);
        
        console.log('\n⏱️  Response Times:');
        console.log(`Average: ${avgTime.toFixed(2)}ms`);
        console.log(`50th percentile: ${p50.toFixed(2)}ms`);
        console.log(`95th percentile: ${p95.toFixed(2)}ms`);
        console.log(`99th percentile: ${p99.toFixed(2)}ms`);
        
        // Performance evaluation
        console.log('\n🎯 Performance Assessment:');
        if (avgTime < 200) {
            console.log('✅ Average response time: EXCELLENT (<200ms)');
        } else if (avgTime < 500) {
            console.log('⚠️  Average response time: GOOD (200-500ms)');
        } else {
            console.log('❌ Average response time: NEEDS IMPROVEMENT (>500ms)');
        }
        
        if (successRate >= 99) {
            console.log('✅ Success rate: EXCELLENT (≥99%)');
        } else if (successRate >= 95) {
            console.log('⚠️  Success rate: GOOD (95-99%)');
        } else {
            console.log('❌ Success rate: NEEDS IMPROVEMENT (<95%)');
        }
        
        if (p95 < 500) {
            console.log('✅ 95th percentile: EXCELLENT (<500ms)');
        } else if (p95 < 1000) {
            console.log('⚠️  95th percentile: ACCEPTABLE (500-1000ms)');
        } else {
            console.log('❌ 95th percentile: NEEDS IMPROVEMENT (>1000ms)');
        }
        
        // Error summary
        if (this.metrics.errors.length > 0) {
            console.log('\n❌ Errors Summary:');
            const errorCounts = {};
            this.metrics.errors.forEach(error => {
                const key = error.error || 'Unknown error';
                errorCounts[key] = (errorCounts[key] || 0) + 1;
            });
            
            Object.entries(errorCounts).forEach(([error, count]) => {
                console.log(`   ${error}: ${count} times`);
            });
        }
        
        console.log('\n✅ Load test completed successfully!');
        
        return {
            duration,
            requests: this.metrics.requests,
            successful: this.metrics.successful,
            failed: this.metrics.failed,
            successRate: parseFloat(successRate),
            requestsPerSecond: rps,
            responseTime: {
                average: avgTime,
                p50,
                p95,
                p99
            },
            errors: this.metrics.errors
        };
    }

    /**
     * Calculate percentile from sorted array
     */
    getPercentile(sortedArray, percentile) {
        if (sortedArray.length === 0) return 0;
        const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
        return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run load test if called directly
if (require.main === module) {
    const config = {
        concurrentUsers: parseInt(process.env.LOAD_TEST_USERS) || 10,
        duration: parseInt(process.env.LOAD_TEST_DURATION) || 30,
        rampUp: parseInt(process.env.LOAD_TEST_RAMP_UP) || 5
    };
    
    const tester = new LoadTester(config);
    
    tester.runLoadTest().catch(error => {
        console.error('❌ Load test failed:', error);
        process.exit(1);
    });
}

module.exports = LoadTester;