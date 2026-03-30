const ytdl = require('@distube/ytdl-core');
const ytdlp = require('yt-dlp-exec');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const { PassThrough } = require('stream');
const cache = require('./cache');

ffmpeg.setFfmpegPath(ffmpegStatic);

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
        const ua = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
        return {
            'User-Agent': ua,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': 'https://www.youtube.com/',
            'DNT': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
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

        // === Strategy 1: youtubei.js (Extremely reliable for Datacenters, avoids Chrome IP bans) ===
        try {
            const { Innertube, UniversalCache } = require('youtubei.js');
            if (!this.ytInstance) {
                this.ytInstance = await Innertube.create({ cache: new UniversalCache(false) });
            }
            const info = await this.ytInstance.getInfo(videoId);
            const formatsRaw = [...(info.streaming_data?.formats || []), ...(info.streaming_data?.adaptive_formats || [])];

            const mapped = formatsRaw.map(f => {
                const url = f.url || (f.decipher ? f.decipher(this.ytInstance.session.player) : null);
                return {
                    itag: f.itag,
                    mimeType: f.mime_type || `video/mp4`,
                    qualityLabel: f.quality_label || (f.height ? `${f.height}p` : null),
                    url: url,
                    hasVideo: f.has_video,
                    hasAudio: f.has_audio,
                    bitrate: f.bitrate || 0,
                    height: f.height || 0,
                    width: f.width || 0,
                };
            }).filter(f => f.url);

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

        // === Strategy 3: yt-dlp (reliable but blocked on Render) ===
        try {
            const info = await ytdlp(`https://www.youtube.com/watch?v=${videoId}`, {
                dumpSingleJson: true,
                noCheckCertificates: true,
                noWarnings: true,
                preferFreeFormats: false,
                addHeader: [
                    'referer:youtube.com',
                    'user-agent:Mozilla/5.0'
                ]
            });

            if (!info.formats || info.formats.length === 0) {
                throw new Error('yt-dlp returned no formats');
            }

            const mapped = info.formats
                .filter(f => f.url)
                .map(f => ({
                    itag: parseInt(f.format_id) || 0,
                    mimeType: f.ext === 'mp4' ? 'video/mp4' : f.ext === 'webm' ? 'video/webm' : (f.ext === 'm4a' ? 'audio/mp4' : `video/${f.ext}`),
                    qualityLabel: f.resolution && f.resolution !== 'audio only' ? (f.resolution.replace('x', 'p').split('p').pop() ? f.height + 'p' : f.resolution) : null,
                    url: f.url,
                    hasVideo: f.vcodec !== 'none' && !!f.vcodec,
                    hasAudio: f.acodec !== 'none' && !!f.acodec,
                    bitrate: f.tbr ? Math.round(f.tbr * 1000) : 0,
                    height: f.height || 0,
                    width: f.width || 0,
                }));

            if (mapped.length > 0) {
                await cache.set(cacheKey, mapped, 3600);
                return mapped;
            }
        } catch (err) {
            // yt-dlp failed
        }

        // === Strategy 4: Invidious (last resort) ===
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

            // If it's separate (no audio), return a merged proxy URL to make it "just work" as combined
            if (!selected.hasAudio && selected.itag) {
                return {
                    type: 'combined',
                    url: `/api/video/${videoId}/proxy/merged?itag=${selected.itag}`,
                    qualityLabel: selected.qualityLabel || `${selected.height}p`,
                    mimeType: 'video/mp4'
                };
            }

            return {
                type: 'combined',
                url: `/api/video/${videoId}/proxy/video?quality=${quality}`,
                qualityLabel: selected.qualityLabel || (selected.height ? `${selected.height}p` : '360p'),
                mimeType: selected.mimeType || 'video/mp4'
            };
        } catch (err) {
            console.error(`[StreamService] getVideoStream failed for ${videoId}:`, err.message);
            throw err;
        }
    }


    /**
     * Transcode a stream to MP3 on the fly.
     */
    async transcodeToMp3(videoId) {
        const audioInfo = await this.getAudioStream(videoId);
        if (!audioInfo || !audioInfo.url) throw new Error('Could not find audio stream for transcoding');

        const passThrough = new PassThrough();
        const headers = this.getRandomHeaders();

        ffmpeg(audioInfo.url)
            .inputOptions([
                `-headers`, `User-Agent: ${headers['User-Agent']}\r\nReferer: https://www.youtube.com/\r\n`
            ])
            .audioCodec('libmp3lame')
            .audioBitrate(192)
            .format('mp3')
            .on('error', (err) => {
                console.error('[Audio Transcoding] FFMPEG Error:', err.message);
                passThrough.destroy();
            })
            .pipe(passThrough);

        return passThrough;
    }

    /**
     * Get audio-only stream URL.
     */
    async getAudioStream(videoId) {
        try {
            const formats = await this.getFormats(videoId);

            // Prefer audio-only formats
            const audioOnly = formats.filter(f => f.hasAudio && !f.hasVideo);
            // Fallback to any format with audio
            const withAudio = formats.filter(f => f.hasAudio);

            const selected = audioOnly.length > 0
                ? audioOnly.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0]
                : withAudio.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

            if (!selected) throw new Error('No audio formats found');

            return {
                url: selected.url,
                mimeType: selected.mimeType || 'audio/webm',
                contentLength: selected.contentLength
            };
        } catch (err) {
            console.error(`[StreamService] getAudioStream failed for ${videoId}:`, err.message);
            throw err;
        }
    }

    /**
     * On-the-fly merging of Video + Audio for 1080p, 4K, etc.
     */
    async createMergedStream(videoId, videoTag) {
        const formats = await this.getFormats(videoId);

        // Get selected video format
        const videoFormat = formats.find(f => f.itag === parseInt(videoTag));
        if (!videoFormat) throw new Error('Selected video format not found');

        // Choose best audio format
        const audioFormats = formats.filter(f => f.hasAudio && !f.hasVideo);
        audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        const audioFormat = audioFormats[0];
        if (!audioFormat) throw new Error('No audio format found for merging');

        const passThrough = new PassThrough();
        const headers = this.getRandomHeaders();

        // Use ffmpeg to combine them on the fly
        ffmpeg()
            .input(videoFormat.url)
            .inputOptions([
                `-headers`, `User-Agent: ${headers['User-Agent']}\r\nReferer: https://www.youtube.com/\r\n`
            ])
            .input(audioFormat.url)
            .inputOptions([
                `-headers`, `User-Agent: ${headers['User-Agent']}\r\nReferer: https://www.youtube.com/\r\n`
            ])
            .videoCodec('copy')
            .audioCodec('aac')
            .format('mp4')
            .outputOptions([
                '-movflags frag_keyframe+empty_moov',
                '-shortest'
            ])
            .on('error', (err) => {
                console.error('[Stream Merging] FFMPEG Error:', err.message);
                passThrough.destroy();
            })
            .pipe(passThrough);

        return passThrough;
    }

    /**
     * Pipe the actual stream data.
     */
    async createStream(videoId, type = 'video', quality = 'highest', range = null, itag = null) {
        try {
            let selectedUrl;
            let mimeType = 'video/mp4';

            const formats = await this.getFormats(videoId);

            if (type === 'audio') {
                const audio = formats.filter(f => f.hasAudio && !f.hasVideo);
                audio.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
                const selected = audio.length > 0 ? audio[0] : formats.find(f => f.hasAudio);
                if (!selected) throw new Error('No audio formats for proxy');
                selectedUrl = selected.url;
                mimeType = selected.mimeType || 'audio/webm';
            } else {
                let selected;
                if (itag) {
                    selected = formats.find(f => f.itag === parseInt(itag));
                }

                if (!selected) {
                    // Prefer combined formats (video + audio) for direct playback
                    // This matches the logic in getVideoStream() to avoid mismatch
                    const combined = formats
                        .filter(f => f.hasVideo && f.hasAudio)
                        .sort((a, b) => (parseInt(b.height) || 0) - (parseInt(a.height) || 0));

                    if (combined.length > 0) {
                        selected = quality === 'lowest' ? combined[combined.length - 1] : combined[0];
                    } else {
                        // Fallback to any video format if no combined available
                        const video = formats.filter(f => f.hasVideo);
                        video.sort((a, b) => (parseInt(b.height) || 0) - (parseInt(a.height) || 0));
                        selected = quality === 'lowest' ? video[video.length - 1] : video[0];
                    }
                }

                if (!selected) throw new Error('No video formats for proxy');
                selectedUrl = selected.url;
                mimeType = selected.mimeType || 'video/mp4';
            }

            const headers = this.getRandomHeaders();
            if (range) headers['Range'] = range;

            // Use AbortController for proper cleanup when client disconnects
            const abortController = new AbortController();

            const response = await axios({
                method: 'get',
                url: selectedUrl,
                responseType: 'stream',
                headers: headers,
                timeout: 15000, // Connection timeout only (time to first byte)
                signal: abortController.signal,
                // Don't limit the transfer time for streaming
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            // Attach the abort controller to the stream for external cleanup
            response.data._abortController = abortController;

            return {
                stream: response.data,
                mimeType: response.headers['content-type'] || mimeType,
                contentLength: response.headers['content-length'],
                responseHeaders: response.headers,
                status: response.status,
                abort: () => abortController.abort()
            };
        } catch (err) {
            console.error(`[StreamService] createStream error for ${videoId}:`, err.message);
            throw err;
        }
    }
}

module.exports = new StreamService();

