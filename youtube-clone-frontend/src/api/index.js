import axios from 'axios';
import { getCached, setCache } from './cache';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

const api = axios.create({
    baseURL: API_BASE,
    timeout: 15000,
});

/**
 * Search videos
 */
export const searchVideos = async (query, maxResults = 12, pageToken = '') => {
    const key = `search:${query}:${maxResults}:${pageToken}`;
    const cached = getCached(key);
    if (cached) return cached;

    const { data } = await api.get('/search', {
        params: { q: query, maxResults, pageToken },
    });
    setCache(key, data);
    return data;
};

/**
 * Get trending videos
 */
export const getTrending = async (region = 'VN', maxResults = 20) => {
    const key = `trending:${region}:${maxResults}`;
    const cached = getCached(key);
    if (cached) return cached;

    const { data } = await api.get('/trending', {
        params: { region, maxResults },
    });
    setCache(key, data, 600000); // 10 mins cache for trending
    return data;
};

/**
 * Get video details
 */
export const getVideoDetails = async (videoId) => {
    const key = `video:${videoId}`;
    const cached = getCached(key);
    if (cached) return cached;

    const { data } = await api.get(`/video/${videoId}`);
    setCache(key, data, 1800000); // 30 mins
    return data;
};

/**
 * Get related videos
 */
export const getRelatedVideos = async (videoId, maxResults = 10) => {
    const key = `related:${videoId}:${maxResults}`;
    const cached = getCached(key);
    if (cached) return cached;

    const { data } = await api.get(`/video/${videoId}/related`, {
        params: { maxResults },
    });
    setCache(key, data, 900000); // 15 mins
    return data;
};

/**
 * Get consolidated watch data (Metadata + Related + Stream + Sponsors)
 */
export const getCombinedWatchData = async (videoId, quality = 'highest') => {
    const key = `combined-watch:${videoId}:${quality}`;
    const cached = getCached(key);
    if (cached) return cached;

    const { data } = await api.get(`/video/${videoId}/combined-watch`, {
        params: { quality },
    });

    // We can also populate individual caches with this data to avoid re-fetching
    setCache(`video:${videoId}`, data.details, 1800000);
    setCache(`stream:${videoId}`, data.stream, 300000);
    setCache(`sponsors:${videoId}`, { segments: data.sponsors }, 3600000);

    setCache(key, data, 300000); // Combined cache
    return data;
};

/**
 * Get stream URLs for a video
 */
export const getVideoStream = async (videoId) => {
    const key = `stream:${videoId}`;
    const cached = getCached(key);
    if (cached) return cached;

    const { data } = await api.get(`/video/${videoId}/stream/video`);
    // Streams expire quickly on YT side, cache for only 5 mins
    setCache(key, data, 300000);
    return data;
};

/**
 * Get all available stream formats for a video
 */
export const getFormats = async (videoId) => {
    const key = `formats:${videoId}`;
    const cached = getCached(key);
    if (cached) return cached;

    const { data } = await api.get(`/video/${videoId}/streams`);
    setCache(key, data, 300000);
    return data;
};

/**
 * Get audio-only stream URL
 */
export const getAudioStream = async (videoId) => {
    const key = `audio:${videoId}`;
    const cached = getCached(key);
    if (cached) return cached;

    const { data } = await api.get(`/video/${videoId}/stream/audio`);
    setCache(key, data, 300000);
    return data;
};

/**
 * Get audio proxy URL (for direct use in <audio> element)
 */
export const getAudioProxyUrl = (videoId) => {
    return `${API_BASE}/video/${videoId}/proxy/audio`;
};

/**
 * Get SponsorBlock segments
 */
export const getSponsorSegments = async (videoId) => {
    const key = `sponsors:${videoId}`;
    const cached = getCached(key);
    if (cached) return cached;

    const { data } = await api.get(`/video/${videoId}/sponsors`);
    setCache(key, data, 3600000); // 1 hour
    return data;
};

export default api;
