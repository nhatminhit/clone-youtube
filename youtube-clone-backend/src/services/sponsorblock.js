const axios = require('axios');
const cache = require('./cache');
const Agent = require('agentkeepalive');

const HttpsAgent = Agent.HttpsAgent;
const httpsAgent = new HttpsAgent({
    keepAlive: true,
    maxSockets: 32,
    maxFreeSockets: 8,
    timeout: 60000,
});

const SPONSORBLOCK_API = 'https://sponsor.ajay.app/api';

/**
 * SponsorBlock API Service.
 * Fetches skip segments (sponsors, intros, outros, etc.) for a given video.
 */
class SponsorBlockService {
    /**
     * Get skip segments for a video.
     * @param {string} videoId
     * @param {Array<string>} categories - Segment categories to fetch
     * @returns {Promise<Array>} Array of segments with start/end times
     */
    async getSegments(videoId, categories = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'music_offtopic']) {
        const cacheKey = `sb:${videoId}:${categories.sort().join(',')}`;
        const cached = await cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            const response = await axios.get(`${SPONSORBLOCK_API}/skipSegments`, {
                params: {
                    videoID: videoId,
                    categories: JSON.stringify(categories),
                },
                timeout: 5000,
                httpsAgent,
            });

            const segments = response.data.map((seg) => ({
                category: seg.category,
                start: seg.segment[0],
                end: seg.segment[1],
                uuid: seg.UUID,
                duration: parseFloat((seg.segment[1] - seg.segment[0]).toFixed(2)),
                actionType: seg.actionType || 'skip',
            }));

            // Cache for 24 hours (segments rarely change)
            await cache.set(cacheKey, segments, 86400);
            return segments;
        } catch (err) {
            if (err.response && err.response.status === 404) {
                // No segments found — cache empty result for 6 hours
                await cache.set(cacheKey, [], 21600);
                return [];
            }
            console.error(`[SponsorBlock] Error fetching segments for ${videoId}:`, err.message);
            return [];
        }
    }
}

module.exports = new SponsorBlockService();
