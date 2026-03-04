// Simple in-memory cache for frontend with SessionStorage persistence
const cache = new Map();

// Initialize from SessionStorage on load
try {
    const saved = sessionStorage.getItem('yt_clone_cache');
    if (saved) {
        const parsed = JSON.parse(saved);
        Object.entries(parsed).forEach(([key, entry]) => {
            if (entry.expiry > Date.now()) {
                cache.set(key, entry);
            }
        });
    }
} catch (e) {
    console.warn('[Cache] Failed to load from SessionStorage');
}

const saveToSession = () => {
    try {
        const data = {};
        cache.forEach((val, key) => {
            // Only persist search, trending, and video metadata (skip transient streams)
            if (key.includes('search') || key.includes('trending') || key.includes('video:')) {
                data[key] = val;
            }
        });
        sessionStorage.setItem('yt_clone_cache', JSON.stringify(data));
    } catch (e) { }
};

export const getCached = (key) => {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
        cache.delete(key);
        saveToSession();
        return null;
    }
    return entry.data;
};

export const setCache = (key, data, ttlMs = 300000) => { // Default 5 mins
    cache.set(key, {
        data,
        expiry: Date.now() + ttlMs
    });
    saveToSession();
};

export const clearCache = () => {
    cache.clear();
    sessionStorage.removeItem('yt_clone_cache');
};
