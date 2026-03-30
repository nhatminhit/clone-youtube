const axios = require('axios');
const cache = require('./cache');


/**
 * Stream Extractor Service — gets playable video/audio URLs from YouTube.
 * YouTube Data API v3 doesn't provide direct stream URLs, so we use ytdl-core.
 */
class StreamService {
    constructor() {
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
        ];
        this.formatPromises = new Map(); // Prevent redundant simultaneous requests
    }

    getRandomHeaders() {
        // Using Android App User-Agent to match youtubei.js generated stream URLs
        // Web User-Agents (Chrome) cause 403 Forbidden when accessing these signed URLs.
        return {
            'User-Agent': 'com.google.android.youtube/17.31.35 (Linux; U; Android 11) gzip',
            'Accept': '*/*',
            'Origin': 'https://www.youtube.com',
            'Upgrade-Insecure-Requests': '1'
        };
    }

    /**
     * Get all available stream formats for a video.
     */
    async getFormats(videoId) {
        // 1. Try Cache First (1 hour TTL)
        const cacheKey = `formats:${videoId}`;
        const cached = await cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        // 2. Check for an ongoing request to prevent multiple calls
        if (this.formatPromises.has(videoId)) {
            return this.formatPromises.get(videoId);
        }

        // 3. Kick off new fetch
        const fetchPromise = this._fetchFormats(videoId).finally(() => {
            this.formatPromises.delete(videoId);
        });

        this.formatPromises.set(videoId, fetchPromise);
        return fetchPromise;
    }

    async _fetchFormats(videoId) {
        const cacheKey = `formats:${videoId}`;

        // === Strategy 1: youtubei.js (Reliable for Datacenters) ===
        try {
            const { Innertube, Platform } = require('youtubei.js');
            if (!this.ytInstance) {
                // Provide custom JS evaluator for deciphering YouTube signatures (required by v17+)
                Platform.shim.eval = async (data, env) => {
                    const properties = [];
                    if (env.n) properties.push(`n: exportedVars.nFunction("${env.n}")`);
                    if (env.sig) properties.push(`sig: exportedVars.sigFunction("${env.sig}")`);
                    const code = `${data.output}\nreturn { ${properties.join(', ')} }`;
                    return new Function(code)();
                };
                this.ytInstance = await Innertube.create();
            }
            const info = await this.ytInstance.getInfo(videoId);
            const sd = info.streaming_data;
            if (!sd) throw new Error('No streaming_data');

            const formatsRaw = [...(sd.formats || []), ...(sd.adaptive_formats || [])];
            const mapped = [];
            
            for (const f of formatsRaw) {
                let url = null;
                try {
                    url = f.decipher ? await f.decipher(this.ytInstance.session.player) : f.url;
                    if (url && typeof url === 'object') url = url.toString();
                    if (url && typeof url !== 'string') url = String(url);
                } catch(e) { continue; }
                
                if (!url || !url.startsWith('http')) continue;
                
                mapped.push({
                    itag: f.itag,
                    mimeType: f.mime_type || 'video/mp4',
                    qualityLabel: f.quality_label || (f.height ? `${f.height}p` : null),
                    url,
                    hasVideo: !!f.has_video,
                    hasAudio: !!f.has_audio,
                    bitrate: f.bitrate || 0,
                    height: f.height || 0,
                    width: f.width || 0,
                });
            }
            
            // Free memory
            info.streaming_data = null;

            if (mapped.length > 0) {
                await cache.set(cacheKey, mapped, 3600);
                return mapped;
            }
        } catch (err) {
            console.error('[StreamService] youtubei.js strategy failed:', err.message);
        }

        // === Strategy 2: Piped API (Fallback) ===
        try {
            const pipedFormats = await this.getFormatsFromPiped(videoId);
            if (pipedFormats && pipedFormats.length > 0) {
                await cache.set(cacheKey, pipedFormats, 3600);
                return pipedFormats;
            }
        } catch (err) {
            console.error('[StreamService] Piped strategy failed:', err.message);
        }


        // === Strategy 3: Invidious (last resort) ===
        const invidiousFormats = await this.getFormatsFromInvidious(videoId);
        if (invidiousFormats && invidiousFormats.length > 0) {
            await cache.set(cacheKey, invidiousFormats, 3600);
            return invidiousFormats;
        }

        throw new Error('All stream sources failed to return formats (IP Ban possible).');
    }

    async getFormatsFromPiped(videoId) {
        const instances = [
            'https://pi.ggtyler.dev',
            'https://pipedapi.kavin.rocks',
            'https://pipedapi.tokhmi.xyz',
            'https://pipedapi.syncpundit.io',
            'https://pipedapi.lunar.icu',
            'https://piped-api.garudalinux.org'
        ];
        
        for (const instance of instances) {
            try {
                const response = await axios.get(`${instance}/streams/${videoId}`, { 
                    timeout: 4000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36' }
                });
                const data = response.data;
                if (!data || !data.videoStreams) continue;

                const mappedFormats = [
                    ...data.videoStreams.map(f => ({
                        itag: f.itag,
                        qualityLabel: f.quality,
                        url: f.url,
                        hasVideo: true,
                        hasAudio: !f.videoOnly,
                        mimeType: f.mimeType || `video/${f.format.toLowerCase()}`,
                        height: parseInt(f.quality) || 0,
                        width: 0,
                        bitrate: f.bitrate || 0
                    })),
                    ...data.audioStreams.map(f => ({
                        itag: f.itag,
                        qualityLabel: null,
                        url: f.url,
                        hasVideo: false,
                        hasAudio: true,
                        mimeType: f.mimeType || `audio/${f.format.toLowerCase()}`,
                        height: 0,
                        width: 0,
                        bitrate: f.bitrate || 0
                    }))
                ];

                if (mappedFormats.length > 0) return mappedFormats;
            } catch (err) {
                continue;
            }
        }
        return null;
    }

    /**
     * Backup Strategy: Fetch streaming data from public Invidious instances.
     */
    async getFormatsFromInvidious(videoId) {
        const instances = [
            'https://inv.tux.rs',
            'https://iv.ggtyler.dev',
            'https://invidious.no-logs.com',
            'https://invidious.projectsegfau.lt',
            'https://yt.artemislena.eu',
            'https://invidious.esmailelbob.xyz',
            'https://inv.tux.rs',
            'https://inv.n8ms.com',
            'https://iv.melmac.space',
            'https://invidious.privacydev.net', // Sometimes works
        ];

        // Shuffle instances
        const shuffled = instances.sort(() => Math.random() - 0.5);

        for (const instance of shuffled) {
            try {
                const response = await axios.get(`${instance}/api/v1/videos/${videoId}`, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 6000
                });

                const data = response.data;
                if (!data || (!data.formatStreams && !data.adaptiveFormats)) {
                    continue;
                }

                const formats = data.formatStreams || [];
                const adaptive = data.adaptiveFormats || [];

                const mappedFormats = [
                    ...formats.map(f => ({
                        itag: f.itag,
                        qualityLabel: f.qualityLabel,
                        url: f.url,
                        hasVideo: true,
                        hasAudio: true,
                        mimeType: f.type || 'video/mp4',
                        height: parseInt(f.qualityLabel) || (f.height),
                        width: f.width
                    })),
                    ...adaptive.map(f => ({
                        itag: f.itag,
                        qualityLabel: f.qualityLabel || (f.height ? `${f.height}p` : null),
                        url: f.url,
                        hasVideo: !!f.qualityLabel || (f.type?.includes('video')),
                        hasAudio: !!f.audioChannels || (f.type?.includes('audio')) || (f.type?.includes('opus')),
                        mimeType: f.type,
                        height: f.height,
                        width: f.width
                    }))
                ];

                if (mappedFormats.length > 0) return mappedFormats;
            } catch (err) {
                continue;
            }
        }
        throw new Error('All stream sources (ytdl-core & Invidious) failed to return formats.');
    }

    /**
     * Get the best combined (video+audio) stream URL.
     */
    async getVideoStream(videoId, quality = 'highest') {
        try {
            const formats = await this.getFormats(videoId);

            if (!formats || formats.length === 0) {
                console.error(`[StreamService] No formats found for ${videoId}`);
                throw new Error('No formats found for this video.');
            }

            // Prefer combined formats (video + audio) for FAST loading (itag 18, 22, etc)
            let combined = formats.filter(f => f.hasVideo && f.hasAudio);

            // If we are on 'highest' quality, we might still want to prefer 720p combined (itag 22) 
            // over 1080p separate (which requires proxy merging) to ensure instant play.
            // Let's refine the sorting to prioritize combined formats even if slightly lower quality
            combined.sort((a, b) => {
                const bHeight = parseInt(b.height) || 0;
                const aHeight = parseInt(a.height) || 0;
                return bHeight - aHeight;
            });

            let selected = quality === 'lowest' ? combined[combined.length - 1] : combined[0];

            // If no combined format found, or we specifically need it
            if (!selected) {
                console.warn(`[StreamService] No combined formats found for ${videoId}, trying any video format...`);
                const allVideo = formats.filter(f => f.hasVideo);
                allVideo.sort((a, b) => (parseInt(b.height) || 0) - (parseInt(a.height) || 0));
                selected = quality === 'lowest' ? allVideo[allVideo.length - 1] : allVideo[0];
            }

            if (!selected) {
                throw new Error('Strictly no video formats available.');
            }

            // DIRECT URL STRATEGY: Return googlevideo.com URLs directly to the browser.
            // The user's browser (personal IP) will fetch from Google - never gets banned.
            // Datacenter proxy approach is fundamentally broken due to Google IP bans.

            // If it's separate (no audio), try to find a combined format first
            if (!selected.hasAudio && selected.itag) {
                // Still return a direct URL - the browser handles audio-only separately
                return {
                    type: 'combined',
                    url: selected.url,
                    qualityLabel: selected.qualityLabel || `${selected.height}p`,
                    mimeType: selected.mimeType || 'video/mp4',
                    direct: true
                };
            }

            return {
                type: 'combined',
                url: selected.url,
                qualityLabel: selected.qualityLabel || (selected.height ? `${selected.height}p` : '360p'),
                mimeType: selected.mimeType || 'video/mp4',
                direct: true
            };
        } catch (err) {
            console.error(`[StreamService] getVideoStream failed for ${videoId}:`, err.message);
            throw err;
        }
    }

}

module.exports = new StreamService();
