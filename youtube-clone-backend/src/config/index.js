require('dotenv').config();

const config = {
    // Server
    port: parseInt(process.env.PORT, 10) || 3001,
    nodeEnv: process.env.NODE_ENV || 'development',
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

    // YouTube API v3 - Round Robin Keys
    youtubeApiKeys: (process.env.YOUTUBE_API_KEYS || '').split(',').filter(Boolean),

    // Redis
    redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
    },

    // Cache TTL (seconds)
    cacheTTL: {
        search: parseInt(process.env.CACHE_TTL_SEARCH, 10) || 3600,       // 1 hour
        video: parseInt(process.env.CACHE_TTL_VIDEO, 10) || 86400,        // 24 hours
        trending: parseInt(process.env.CACHE_TTL_TRENDING, 10) || 1800,   // 30 minutes
    },
};

module.exports = config;
