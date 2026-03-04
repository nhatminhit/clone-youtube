const config = require('../config');

/**
 * Cache Service — In-memory fallback when Redis is unavailable.
 * Gracefully degrades: tries Redis first, falls back to Map cache.
 */
class CacheService {
    constructor() {
        this.memoryCache = new Map();
        this.redis = null;
        this.useRedis = false;
    }

    async init() {
        try {
            const Redis = require('ioredis');
            this.redis = new Redis({
                host: config.redis.host,
                port: config.redis.port,
                password: config.redis.password,
                maxRetriesPerRequest: 3,
                lazyConnect: true,
                retryStrategy(times) {
                    if (times > 3) return null; // Stop retrying after 3 attempts
                    return Math.min(times * 200, 2000);
                },
            });

            // Suppress unhandled error events
            this.redis.on('error', () => { });

            await this.redis.connect();
            await this.redis.ping();
            this.useRedis = true;
            console.log('[Cache] ✓ Redis connected');
        } catch (err) {
            console.warn('[Cache] ⚠ Redis unavailable, using in-memory cache:', err.message);
            if (this.redis) {
                try { this.redis.disconnect(); } catch (_) { }
                this.redis = null;
            }
            this.useRedis = false;
        }
    }

    /**
     * Get cached data by key.
     * @param {string} key
     * @returns {any|null}
     */
    async get(key) {
        try {
            if (this.useRedis && this.redis) {
                const data = await this.redis.get(key);
                return data ? JSON.parse(data) : null;
            }
            // Memory cache fallback
            const entry = this.memoryCache.get(key);
            if (!entry) return null;
            if (Date.now() > entry.expiry) {
                this.memoryCache.delete(key);
                return null;
            }
            return entry.data;
        } catch (err) {
            console.error('[Cache] Get error:', err.message);
            return null;
        }
    }

    /**
     * Set data in cache with TTL.
     * @param {string} key
     * @param {any} data
     * @param {number} ttlSeconds
     */
    async set(key, data, ttlSeconds) {
        try {
            if (this.useRedis && this.redis) {
                await this.redis.setex(key, ttlSeconds, JSON.stringify(data));
            } else {
                // Memory cache fallback
                this.memoryCache.set(key, {
                    data,
                    expiry: Date.now() + ttlSeconds * 1000,
                });
            }
        } catch (err) {
            console.error('[Cache] Set error:', err.message);
        }
    }

    /**
     * Delete a cached key.
     * @param {string} key
     */
    async del(key) {
        try {
            if (this.useRedis && this.redis) {
                await this.redis.del(key);
            } else {
                this.memoryCache.delete(key);
            }
        } catch (err) {
            console.error('[Cache] Del error:', err.message);
        }
    }

    /**
     * Flush all cached data.
     */
    async flush() {
        try {
            if (this.useRedis && this.redis) {
                await this.redis.flushdb();
            } else {
                this.memoryCache.clear();
            }
        } catch (err) {
            console.error('[Cache] Flush error:', err.message);
        }
    }
}

// Singleton export
module.exports = new CacheService();
