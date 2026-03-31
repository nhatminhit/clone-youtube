const axios = require('axios');
const apiKeyManager = require('./apiKeyManager');
const cache = require('./cache');
const config = require('../config');
const Agent = require('agentkeepalive');
const { parseStringPromise } = require('xml2js');

const HttpsAgent = Agent.HttpsAgent;
const httpsAgent = new HttpsAgent({
    keepAlive: true,
    maxSockets: 64,
    maxFreeSockets: 16,
    timeout: 60000,
});

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * YouTube Data API v3 Service with caching and round-robin key rotation.
 */
class YouTubeService {
    constructor() {
        this.pendingRequests = new Map();
        this.cache = cache;
    }

    /**
     * Make a request to YouTube Data API v3 with automatic key rotation on quota errors.
     */
    async _apiRequest(endpoint, params, retries = 0) {
        const apiKey = apiKeyManager.getKey();

        try {
            const response = await axios.get(`${YOUTUBE_API_BASE}/${endpoint}`, {
                params: {
                    ...params,
                    key: apiKey,
                },
                timeout: 10000,
                httpsAgent,
            });
            return response.data;
        } catch (err) {
            if (err.response) {
                console.error('[YouTube API Error Details]:', JSON.stringify(err.response.data, null, 2));
            }
            // Check if quota exceeded (HTTP 403)
            if (err.response && err.response.status === 403) {
                const errorReason = err.response.data?.error?.errors?.[0]?.reason;
                if (errorReason === 'quotaExceeded' || errorReason === 'dailyLimitExceeded') {
                    console.warn(`[YouTube] Quota exceeded for key ...${apiKey.slice(-6)}, rotating...`);
                    apiKeyManager.markKeyAsLimited(apiKey);

                    if (retries < apiKeyManager.keys.length - 1) {
                        return this._apiRequest(endpoint, params, retries + 1);
                    }
                }
            }
            throw err;
        }
    }

    /**
     * Search videos on YouTube.
     * @param {string} query - Search query
     * @param {number} maxResults - Number of results (default 12)
     * @param {string} pageToken - Pagination token
     */
    async search(query, maxResults = 12, pageToken = '') {
        const cacheKey = `search:${query}:${maxResults}:${pageToken}`;
        const cached = await cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        if (this.pendingRequests.has(cacheKey)) {
            return this.pendingRequests.get(cacheKey);
        }

        const fetchPromise = (async () => {
            const data = await this._apiRequest('search', {
                part: 'snippet',
                q: query,
                type: 'video',
                maxResults,
                pageToken: pageToken || undefined,
            });

            // Enrich with statistics (view count, etc.) in a single batch call
            const videoIds = data.items.map((item) => item.id.videoId).filter(Boolean);
            let statsMap = {};
            if (videoIds.length > 0) {
                const statsData = await this._apiRequest('videos', {
                    part: 'statistics,contentDetails',
                    id: videoIds.join(','),
                });
                statsMap = Object.fromEntries(
                    statsData.items.map((item) => [item.id, {
                        statistics: item.statistics,
                        contentDetails: item.contentDetails,
                    }])
                );
            }

            const result = {
                nextPageToken: data.nextPageToken || null,
                prevPageToken: data.prevPageToken || null,
                totalResults: data.pageInfo?.totalResults || 0,
                items: data.items.map((item) => ({
                    id: item.id.videoId,
                    title: item.snippet.title,
                    description: item.snippet.description,
                    thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
                    thumbnailHigh: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
                    channelTitle: item.snippet.channelTitle,
                    channelId: item.snippet.channelId,
                    publishedAt: item.snippet.publishedAt,
                    statistics: statsMap[item.id.videoId]?.statistics || null,
                    duration: statsMap[item.id.videoId]?.contentDetails?.duration || null,
                })),
            };

            await cache.set(cacheKey, result, config.cacheTTL.search);
            return result;
        })().finally(() => {
            this.pendingRequests.delete(cacheKey);
        });

        this.pendingRequests.set(cacheKey, fetchPromise);
        return fetchPromise;
    }

    /**
     * Get detailed video information.
     * @param {string} videoId
     */
    async getVideoDetails(videoId) {
        const cacheKey = `video:${videoId}`;
        const cached = await cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        // Request Coalescing: check if we're already fetching this video
        if (this.pendingRequests.has(cacheKey)) {
            return this.pendingRequests.get(cacheKey);
        }

        const fetchPromise = (async () => {
            const data = await this._apiRequest('videos', {
                part: 'snippet,statistics,contentDetails',
                id: videoId,
            });

            if (!data.items || data.items.length === 0) {
                return null;
            }

            const video = data.items[0];
            const result = {
                id: video.id,
                title: video.snippet.title,
                description: video.snippet.description,
                thumbnail: video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url,
                thumbnailHigh: video.snippet.thumbnails?.maxres?.url || video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.default?.url,
                channelTitle: video.snippet.channelTitle,
                channelId: video.snippet.channelId,
                publishedAt: video.snippet.publishedAt,
                tags: video.snippet.tags || [],
                statistics: video.statistics,
                duration: video.contentDetails?.duration || null,
                definition: video.contentDetails?.definition || null,
            };

            await cache.set(cacheKey, result, config.cacheTTL.video);
            return result;
        })().finally(() => {
            this.pendingRequests.delete(cacheKey);
        });

        this.pendingRequests.set(cacheKey, fetchPromise);
        return fetchPromise;
    }

    /**
     * Get trending/popular videos.
     * @param {string} regionCode - Country code (default 'VN')
     * @param {number} maxResults
     */
    async getTrending(regionCode = 'VN', maxResults = 20) {
        const cacheKey = `trending:${regionCode}:${maxResults}`;
        const cached = await cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        if (this.pendingRequests.has(cacheKey)) {
            return this.pendingRequests.get(cacheKey);
        }

        const fetchPromise = (async () => {
            const data = await this._apiRequest('videos', {
                part: 'snippet,statistics,contentDetails',
                chart: 'mostPopular',
                regionCode,
                maxResults,
            });

            const result = {
                items: data.items.map((video) => ({
                    id: video.id,
                    title: video.snippet.title,
                    description: video.snippet.description,
                    thumbnail: video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url,
                    thumbnailHigh: video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url,
                    channelTitle: video.snippet.channelTitle,
                    channelId: video.snippet.channelId,
                    publishedAt: video.snippet.publishedAt,
                    statistics: video.statistics,
                    duration: video.contentDetails?.duration || null,
                })),
            };

            await cache.set(cacheKey, result, config.cacheTTL.trending);
            return result;
        })().finally(() => {
            this.pendingRequests.delete(cacheKey);
        });

        this.pendingRequests.set(cacheKey, fetchPromise);
        return fetchPromise;
    }

    /**
     * Get related videos for a given video ID.
     * Note: YouTube API v3 search endpoint with relatedToVideoId.
     * @param {string} videoId
     * @param {number} maxResults
     */
    async getRelatedVideos(videoId, maxResults = 10) {
        const cacheKey = `related:${videoId}:${maxResults}`;
        const cached = await cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            // First, get the current video's info to search by title
            const videoDetails = await this.getVideoDetails(videoId);
            if (!videoDetails || !videoDetails.title) {
                throw new Error('No video details');
            }

            // Search by title (keyword based fallback)
            const searchTitle = videoDetails.title.slice(0, 40);
            const data = await this._apiRequest('search', {
                part: 'snippet',
                q: searchTitle,
                type: 'video',
                maxResults: maxResults + 1,
            });

            const result = {
                items: (data.items || [])
                    .filter(item => item.id.videoId !== videoId)
                    .slice(0, maxResults)
                    .map((item) => ({
                        id: item.id.videoId,
                        title: item.snippet.title,
                        description: item.snippet.description,
                        thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
                        thumbnailHigh: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url,
                        channelTitle: item.snippet.channelTitle,
                        channelId: item.snippet.channelId,
                        publishedAt: item.snippet.publishedAt,
                    })),
            };

            await cache.set(cacheKey, result, config.cacheTTL.search);
            return result;
        } catch (err) {
            console.warn(`[YouTube] getRelatedVideos failed (${err.message}), using RSS fallback`);
            // Fallback to RSS feed - NO API KEY NEEDED
            try {
                return await this._getRssFallback(maxResults);
            } catch (e) {
                console.error('[YouTube] RSS fallback also failed:', e.message);
                return { items: [] };
            }
        }
    }

    /**
     * Get trending videos via YouTube RSS feed (no API key required).
     * Used as a fallback when API quota is exhausted.
     */
    async _getRssFallback(maxResults = 10) {
        const cacheKey = `rss-fallback:${maxResults}`;
        const cached = await cache.get(cacheKey);
        if (cached) return cached;

        const rssUrl = 'https://www.youtube.com/feeds/videos.xml?chart=most_popular&hl=vi&gl=VN';
        const response = await axios.get(rssUrl, { timeout: 8000 });
        const parsed = await parseStringPromise(response.data, { explicitArray: false });

        const entries = parsed?.feed?.entry;
        const list = Array.isArray(entries) ? entries : entries ? [entries] : [];

        const items = list.slice(0, maxResults).map(entry => {
            const videoId = entry['yt:videoId'];
            return {
                id: videoId,
                title: entry.title,
                thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
                thumbnailHigh: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                channelTitle: entry?.author?.name || 'YouTube',
                channelId: entry?.['yt:channelId'] || '',
                publishedAt: entry.published,
            };
        });

        const result = { items, source: 'rss' };
        await cache.set(cacheKey, result, 1800); // Cache 30 mins
        return result;
    }
}

module.exports = new YouTubeService();
