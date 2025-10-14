/**
 * Unit Tests for Redis Cache Service
 * Tests caching functionality, fallback behavior, and error handling
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

// Mock ioredis
const mockRedis = {
    ping: jest.fn().mockResolvedValue('PONG'),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(1),
    mget: jest.fn().mockResolvedValue([]),
    flushdb: jest.fn().mockResolvedValue('OK'),
    info: jest.fn().mockResolvedValue('used_memory:1000000\r\nused_memory_human:976.56K'),
    dbsize: jest.fn().mockResolvedValue(10),
    quit: jest.fn().mockResolvedValue('OK'),
    on: jest.fn(),
    pipeline: jest.fn(() => ({
        setex: jest.fn(),
        set: jest.fn(),
        exec: jest.fn().mockResolvedValue([])
    }))
};

jest.mock('ioredis', () => jest.fn(() => mockRedis));

const { RedisCacheService } = require('../../src/services/redis-cache-service');

describe('Redis Cache Service', () => {
    let cacheService;

    beforeEach(() => {
        jest.clearAllMocks();
        cacheService = new RedisCacheService();
    });

    afterEach(async () => {
        if (cacheService) {
            await cacheService.close();
        }
    });

    describe('Initialization', () => {
        test('should initialize with default config', () => {
            expect(cacheService.config.host).toBe('localhost');
            expect(cacheService.config.port).toBe(6379);
            expect(cacheService.config.db).toBe(0);
        });

        test('should use environment variables for config', () => {
            process.env.REDIS_HOST = 'redis.example.com';
            process.env.REDIS_PORT = '6380';
            process.env.REDIS_PASSWORD = 'secret123';
            process.env.REDIS_DB = '2';

            const service = new RedisCacheService();

            expect(service.config.host).toBe('redis.example.com');
            expect(service.config.port).toBe(6380);
            expect(service.config.password).toBe('secret123');
            expect(service.config.db).toBe(2);

            // Cleanup
            delete process.env.REDIS_HOST;
            delete process.env.REDIS_PORT;
            delete process.env.REDIS_PASSWORD;
            delete process.env.REDIS_DB;
        });

        test('should handle Redis connection success', async () => {
            // Simulate connection success
            const connectCallback = mockRedis.on.mock.calls.find(call => call[0] === 'connect')[1];
            connectCallback();

            expect(cacheService.isConnected).toBe(true);
            expect(cacheService.useFallback).toBe(false);
        });

        test('should handle Redis connection error', async () => {
            // Simulate connection error
            const errorCallback = mockRedis.on.mock.calls.find(call => call[0] === 'error')[1];
            errorCallback(new Error('Connection failed'));

            expect(cacheService.isConnected).toBe(false);
            expect(cacheService.useFallback).toBe(true);
        });
    });

    describe('Basic Operations', () => {
        beforeEach(() => {
            // Simulate successful connection
            cacheService.isConnected = true;
            cacheService.useFallback = false;
        });

        test('should set and get values', async () => {
            const testData = { id: 123, name: 'Test User' };
            mockRedis.set.mockResolvedValue('OK');
            mockRedis.get.mockResolvedValue(JSON.stringify(testData));

            await cacheService.set('user:123', testData);
            const result = await cacheService.get('user:123');

            expect(mockRedis.set).toHaveBeenCalledWith('user:123', JSON.stringify(testData));
            expect(result).toEqual(testData);
        });

        test('should set values with TTL', async () => {
            const testData = { temp: 'data' };
            mockRedis.setex.mockResolvedValue('OK');

            await cacheService.set('temp:key', testData, 300);

            expect(mockRedis.setex).toHaveBeenCalledWith('temp:key', 300, JSON.stringify(testData));
        });

        test('should return null for non-existent keys', async () => {
            mockRedis.get.mockResolvedValue(null);

            const result = await cacheService.get('non:existent');

            expect(result).toBeNull();
        });

        test('should delete keys', async () => {
            mockRedis.del.mockResolvedValue(1);

            const result = await cacheService.del('test:key');

            expect(mockRedis.del).toHaveBeenCalledWith('test:key');
            expect(result).toBe(true);
        });

        test('should check key existence', async () => {
            mockRedis.exists.mockResolvedValue(1);

            const result = await cacheService.exists('test:key');

            expect(mockRedis.exists).toHaveBeenCalledWith('test:key');
            expect(result).toBe(true);
        });
    });

    describe('Batch Operations', () => {
        beforeEach(() => {
            cacheService.isConnected = true;
            cacheService.useFallback = false;
        });

        test('should set multiple values', async () => {
            const data = {
                'key1': { value: 1 },
                'key2': { value: 2 }
            };

            const mockPipeline = {
                set: jest.fn(),
                setex: jest.fn(),
                exec: jest.fn().mockResolvedValue([])
            };
            mockRedis.pipeline.mockReturnValue(mockPipeline);

            await cacheService.mset(data);

            expect(mockRedis.pipeline).toHaveBeenCalled();
            expect(mockPipeline.set).toHaveBeenCalledTimes(2);
            expect(mockPipeline.exec).toHaveBeenCalled();
        });

        test('should get multiple values', async () => {
            const keys = ['key1', 'key2', 'key3'];
            const values = [
                JSON.stringify({ value: 1 }),
                JSON.stringify({ value: 2 }),
                null
            ];
            mockRedis.mget.mockResolvedValue(values);

            const result = await cacheService.mget(keys);

            expect(mockRedis.mget).toHaveBeenCalledWith(keys);
            expect(result).toEqual({
                'key1': { value: 1 },
                'key2': { value: 2 },
                'key3': null
            });
        });
    });

    describe('Fallback Mode', () => {
        beforeEach(() => {
            cacheService.useFallback = true;
            cacheService.isConnected = false;
        });

        test('should use memory cache in fallback mode', async () => {
            const testData = { fallback: 'data' };

            await cacheService.set('fallback:key', testData);
            const result = await cacheService.get('fallback:key');

            expect(result).toEqual(testData);
            expect(cacheService.fallbackCache.has('fallback:key')).toBe(true);
        });

        test('should handle TTL in fallback mode', async () => {
            const testData = { temp: 'data' };

            // Set with 1 second TTL
            await cacheService.set('temp:key', testData, 1);

            // Should exist immediately
            let result = await cacheService.get('temp:key');
            expect(result).toEqual(testData);

            // Mock time passing
            const originalNow = Date.now;
            Date.now = jest.fn(() => originalNow() + 2000); // 2 seconds later

            // Should be expired
            result = await cacheService.get('temp:key');
            expect(result).toBeNull();

            // Restore Date.now
            Date.now = originalNow;
        });

        test('should delete from memory cache in fallback mode', async () => {
            await cacheService.set('test:key', { data: 'test' });
            
            const deleted = await cacheService.del('test:key');
            const result = await cacheService.get('test:key');

            expect(deleted).toBe(true);
            expect(result).toBeNull();
        });
    });

    describe('Error Handling', () => {
        test('should handle Redis errors gracefully', async () => {
            cacheService.isConnected = true;
            cacheService.useFallback = false;
            mockRedis.set.mockRejectedValue(new Error('Redis error'));

            const result = await cacheService.set('error:key', { data: 'test' });

            expect(result).toBe(false);
        });

        test('should handle JSON parsing errors', async () => {
            cacheService.isConnected = true;
            cacheService.useFallback = false;
            mockRedis.get.mockResolvedValue('invalid json {');

            const result = await cacheService.get('invalid:key');

            expect(result).toBeNull();
        });
    });

    describe('Health Check', () => {
        test('should return healthy status when Redis is connected', async () => {
            cacheService.isConnected = true;
            cacheService.useFallback = false;
            mockRedis.ping.mockResolvedValue('PONG');

            const health = await cacheService.healthCheck();

            expect(health.status).toBe('healthy');
            expect(health.type).toBe('redis');
            expect(health.connected).toBe(true);
            expect(typeof health.latency).toBe('number');
        });

        test('should return degraded status in fallback mode', async () => {
            cacheService.useFallback = true;

            const health = await cacheService.healthCheck();

            expect(health.status).toBe('degraded');
            expect(health.type).toBe('memory_fallback');
        });

        test('should return unhealthy status on Redis error', async () => {
            cacheService.isConnected = false;
            cacheService.useFallback = false;
            mockRedis.ping.mockRejectedValue(new Error('Connection failed'));

            const health = await cacheService.healthCheck();

            expect(health.status).toBe('unhealthy');
            expect(health.error).toBe('Connection failed');
        });
    });

    describe('Statistics', () => {
        test('should return Redis stats when connected', async () => {
            cacheService.isConnected = true;
            cacheService.useFallback = false;

            const stats = await cacheService.getStats();

            expect(stats.type).toBe('redis');
            expect(stats.connected).toBe(true);
            expect(typeof stats.keyCount).toBe('number');
            expect(stats.info).toBeDefined();
        });

        test('should return memory stats in fallback mode', async () => {
            cacheService.useFallback = true;
            await cacheService.set('test1', { data: 1 });
            await cacheService.set('test2', { data: 2 });

            const stats = await cacheService.getStats();

            expect(stats.type).toBe('memory');
            expect(stats.connected).toBe(false);
            expect(stats.keyCount).toBe(2);
        });
    });

    describe('Cleanup', () => {
        test('should clear all cache entries', async () => {
            cacheService.isConnected = true;
            cacheService.useFallback = false;

            await cacheService.clear();

            expect(mockRedis.flushdb).toHaveBeenCalled();
        });

        test('should close Redis connection', async () => {
            cacheService.isConnected = true;
            cacheService.useFallback = false;

            await cacheService.close();

            expect(mockRedis.quit).toHaveBeenCalled();
        });
    });
});