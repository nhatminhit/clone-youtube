const config = require('../config');

/**
 * YouTube API Key Manager with Round-Robin rotation.
 * Automatically switches to the next key when the current one hits quota limit.
 */
class ApiKeyManager {
    constructor() {
        this.keys = [...config.youtubeApiKeys];
        this.currentIndex = 0;
        this.disabledKeys = new Map(); // key -> disabled until (timestamp)

        if (this.keys.length === 0) {
            console.warn('[ApiKeyManager] ⚠ No YouTube API keys configured! Add YOUTUBE_API_KEYS in .env');
        } else {
            console.log(`[ApiKeyManager] ✓ Loaded ${this.keys.length} API key(s)`);
        }
    }

    /**
     * Get the current active API key.
     * Skips disabled keys (those that hit quota limit).
     */
    getKey() {
        const now = Date.now();

        // Clean up expired disabled keys
        for (const [key, expiry] of this.disabledKeys) {
            if (now > expiry) {
                this.disabledKeys.delete(key);
            }
        }

        // Find the next available key
        for (let i = 0; i < this.keys.length; i++) {
            const index = (this.currentIndex + i) % this.keys.length;
            const key = this.keys[index];
            if (!this.disabledKeys.has(key)) {
                this.currentIndex = index;
                return key;
            }
        }

        // All keys are disabled
        throw new Error('All YouTube API keys have been rate-limited. Please try again later.');
    }

    /**
     * Mark the current key as rate-limited.
     * Disables it for the rest of the day (resets at midnight Pacific Time — YouTube quota cycle).
     */
    markKeyAsLimited(key) {
        // Disable until next midnight PT (approx)
        const now = new Date();
        const midnightPT = new Date(now);
        midnightPT.setUTCHours(7, 0, 0, 0); // Midnight PT = 07:00 UTC
        if (midnightPT <= now) {
            midnightPT.setDate(midnightPT.getDate() + 1);
        }

        this.disabledKeys.set(key, midnightPT.getTime());
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;

        console.warn(`[ApiKeyManager] ⚠ Key ending ...${key.slice(-6)} disabled until ${midnightPT.toISOString()}`);
    }

    /**
     * Get status info about all keys.
     */
    getStatus() {
        return {
            totalKeys: this.keys.length,
            activeKeys: this.keys.length - this.disabledKeys.size,
            disabledKeys: this.disabledKeys.size,
            currentKeyIndex: this.currentIndex,
        };
    }
}

// Singleton export
module.exports = new ApiKeyManager();
