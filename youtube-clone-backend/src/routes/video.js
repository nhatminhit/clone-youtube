const express = require('express');
const youtubeService = require('../services/youtube');
const streamService = require('../services/stream');
const sponsorBlockService = require('../services/sponsorblock');

const router = express.Router();

/**
 * GET /api/video/download/:id
 * Download video or audio with proper filename.
 */
router.get('/download/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { type = 'video' } = req.query; // 'video' or 'audio'

        const details = await youtubeService.getVideoDetails(id);
        const title = (details?.title || 'video').replace(/[\\/:*?"<>|]/g, '');

        // Fallback filename MUST be ASCII only
        const asciiTitle = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x00-\x7F]/g, '_');
        const filename = type === 'audio' ? `${title}.mp3` : `${title}.mp4`;
        const fallbackFilename = type === 'audio' ? `${asciiTitle.replace(/"/g, '')}.mp3` : `${asciiTitle.replace(/"/g, '')}.mp4`;

        // Strict RFC 5987 encoding
        const encodedFilename = encodeURIComponent(filename).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

        if (type === 'audio') {
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Disposition', `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`);
            const mp3Stream = await streamService.transcodeToMp3(id);

            mp3Stream.on('error', (err) => {
                console.error(`[Download MP3 Stream Error] ID: ${id}`, err.message);
                if (!res.headersSent) res.status(500).json({ error: 'Audio conversion failed' });
            });

            mp3Stream.pipe(res);
        } else {
            const streamInfo = await streamService.getVideoStream(id, 'highest');

            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Content-Disposition', `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`);

            if (streamInfo.url.includes('proxy/merged')) {
                const itag = new URLSearchParams(streamInfo.url.split('?')[1]).get('itag');
                const mergedStream = await streamService.createMergedStream(id, itag);

                mergedStream.on('error', (err) => {
                    console.error(`[Download Merged Stream Error] ID: ${id}`, err.message);
                    if (!res.headersSent) res.status(500).json({ error: 'Video merging failed' });
                });

                mergedStream.pipe(res);
            } else {
                const { stream } = await streamService.createStream(id, 'video', 'highest');

                stream.on('error', (err) => {
                    console.error(`[Download Video Stream Error] ID: ${id}`, err.message);
                    if (!res.headersSent) res.status(500).json({ error: 'Video stream failed' });
                });

                stream.pipe(res);
            }
        }
    } catch (err) {
        console.error(`[Route /api/video/download/${req.params.id}] Error:`, err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to start download', details: err.message });
        }
    }
});

/**
 * GET /api/video/:id/combined-watch
 * CONSOLIDATED: Get everything needed for the watch page in ONE request.
 */
router.get('/:id/combined-watch', async (req, res) => {
    try {
        const { id } = req.params;
        const { quality = 'highest' } = req.query;
        const cacheKey = `combined-watch-response:${id}:${quality}`;

        const cachedResponse = await youtubeService.cache.get(cacheKey);
        if (cachedResponse) return res.json(cachedResponse);

        const [details, related, stream, sponsors] = await Promise.all([
            youtubeService.getVideoDetails(id).catch(() => null),
            youtubeService.getRelatedVideos(id, 15).catch(() => ({ items: [] })),
            streamService.getVideoStream(id, quality).catch(() => null),
            sponsorBlockService.getSegments(id).catch(() => [])
        ]);

        if (!details) return res.status(404).json({ error: 'Video not found' });

        const result = { videoId: id, details, related: related.items || [], stream, sponsors: sponsors || [] };
        await youtubeService.cache.set(cacheKey, result, 300);
        res.json(result);
    } catch (err) {
        console.error(`[Route /api/video/${req.params.id}/combined-watch] Error:`, err.message);
        res.status(500).json({ error: 'Failed to load watch data', details: err.message });
    }
});

/**
 * GET /api/video/:id
 * Get video details (metadata, statistics).
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = await youtubeService.getVideoDetails(id);

        if (!data) {
            return res.status(404).json({ error: 'Video not found' });
        }

        res.json(data);
    } catch (err) {
        console.error(`[Route /api/video/${req.params.id}] Error:`, err.message);
        res.status(500).json({ error: 'Failed to get video details', details: err.message });
    }
});

/**
 * GET /api/video/:id/related
 * Get related videos.
 */
router.get('/:id/related', async (req, res) => {
    try {
        const { id } = req.params;
        const { maxResults = 10 } = req.query;
        const data = await youtubeService.getRelatedVideos(id, parseInt(maxResults, 10));
        res.json(data);
    } catch (err) {
        console.error(`[Route /api/video/${req.params.id}/related] Error:`, err.message);
        res.status(500).json({ error: 'Failed to get related videos', details: err.message });
    }
});

/**
 * GET /api/video/:id/streams
 * Get available stream URLs (video + audio formats).
 */
router.get('/:id/streams', async (req, res) => {
    try {
        const { id } = req.params;
        const formats = await streamService.getFormats(id);
        res.json({ videoId: id, formats });
    } catch (err) {
        console.error(`[Route /api/video/${req.params.id}/streams] Error:`, err.message);
        res.status(500).json({ error: 'Failed to get stream formats', details: err.message, videoId: req.params.id });
    }
});

/**
 * GET /api/video/:id/stream/video
 * Get best video stream URL (combined video+audio preferred).
 */
router.get('/:id/stream/video', async (req, res) => {
    try {
        const { id } = req.params;
        const { quality = 'highest' } = req.query;
        const stream = await streamService.getVideoStream(id, quality);
        res.json(stream);
    } catch (err) {
        console.error(`[Route /api/video/${req.params.id}/stream/video] Error:`, err.message);
        res.status(500).json({ error: 'Failed to get video stream', details: err.message, videoId: req.params.id });
    }
});

/**
 * GET /api/video/:id/stream/audio
 * Get audio-only stream URL (for background playback).
 */
router.get('/:id/stream/audio', async (req, res) => {
    try {
        const { id } = req.params;
        const audioInfo = await streamService.getAudioStream(id);
        res.json(audioInfo);
    } catch (err) {
        console.error(`[Route /api/video/${req.params.id}/stream/audio] Error:`, err.message);
        res.status(500).json({ error: 'Failed to get audio stream', details: err.message, videoId: req.params.id });
    }
});

/**
 * GET /api/video/:id/proxy/merged
 * Proxy a merged high-quality stream (Video + Audio combined on-the-fly).
 */
router.get('/:id/proxy/merged', async (req, res) => {
    try {
        const { id } = req.params;
        const { itag } = req.query;

        if (!itag) {
            return res.status(400).json({ error: 'itag is required' });
        }

        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');

        const mergedStream = await streamService.createMergedStream(id, itag);
        mergedStream.pipe(res);

    } catch (err) {
        console.error(`[Route /api/video/${req.params.id}/proxy/merged] Error:`, err.message);
        res.status(500).json({ error: 'Failed to merge and proxy stream', details: err.message, videoId: req.params.id });
    }
});

/**
 * GET /api/video/:id/proxy/video
 * Proxy a standard video stream.
 */
router.get('/:id/proxy/video', async (req, res) => {
    try {
        const { id } = req.params;
        const { quality = 'highest', itag } = req.query;
        const range = req.headers.range;

        const { stream, mimeType, contentLength, abort, responseHeaders, status } = await streamService.createStream(id, 'video', quality, range, itag);

        // Forward critical headers from upstream for proper seeking/metadata
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Accept-Ranges', 'bytes');

        if (responseHeaders) {
            if (responseHeaders['content-range']) res.setHeader('Content-Range', responseHeaders['content-range']);
            if (responseHeaders['content-length']) res.setHeader('Content-Length', responseHeaders['content-length']);
            if (responseHeaders['content-type']) res.setHeader('Content-Type', responseHeaders['content-type']);
        } else if (contentLength) {
            res.setHeader('Content-Length', contentLength);
        }

        res.status(status || (range ? 206 : 200));
        stream.pipe(res);

        stream.on('error', (err) => {
            // 'aborted' is expected when client disconnects — don't treat it as a real error
            if (err.message === 'aborted' || err.code === 'ERR_CANCELED') {
                // Client disconnected (normal)
            } else {
                console.error('[Video Proxy] Stream error:', err.message);
                if (!res.headersSent) res.status(500).json({ error: 'Video stream failed' });
            }
        });

        // Clean up upstream when the client disconnects
        req.on('close', () => {
            if (!res.writableFinished) {
                stream.destroy();
                if (abort) abort();
            }
        });
    } catch (err) {
        console.error(`[Route /api/video/${req.params.id}/proxy/video] Error:`, err.message);
        res.status(500).json({ error: 'Failed to proxy video stream', details: err.message });
    }
});

/**
 * GET /api/video/:id/proxy/audio
         * Proxy the audio stream through our server (avoids CORS issues on client).
         * Supports Range requests for seeking.
         */
router.get('/:id/proxy/audio', async (req, res) => {
    try {
        const { id } = req.params;
        const range = req.headers.range;

        const { stream, mimeType, contentLength, abort, responseHeaders, status } = await streamService.createStream(id, 'audio', 'highest', range);

        // Forward critical headers from upstream
        res.setHeader('Accept-Ranges', 'bytes');
        if (responseHeaders) {
            if (responseHeaders['content-range']) res.setHeader('Content-Range', responseHeaders['content-range']);
            if (responseHeaders['content-length']) res.setHeader('Content-Length', responseHeaders['content-length']);
            if (responseHeaders['content-type']) res.setHeader('Content-Type', responseHeaders['content-type']);
        } else {
            res.setHeader('Content-Type', mimeType);
            if (contentLength) res.setHeader('Content-Length', contentLength);
        }

        res.status(status || (range ? 206 : 200));
        stream.pipe(res);

        stream.on('error', (err) => {
            if (err.message === 'aborted' || err.code === 'ERR_CANCELED') {
                // Client disconnected (normal)
            } else {
                console.error('[Audio Proxy] Stream error:', err.message);
                if (!res.headersSent) res.status(500).json({ error: 'Audio stream failed' });
            }
        });

        // Clean up upstream when the client disconnects
        req.on('close', () => {
            if (!res.writableFinished) {
                stream.destroy();
                if (abort) abort();
            }
        });
    } catch (err) {
        console.error(`[Route /api/video/${req.params.id}/proxy/audio] Error:`, err.message);
        res.status(500).json({ error: 'Failed to proxy audio stream', details: err.message, videoId: req.params.id });
    }
});

/**
 * GET /api/video/:id/sponsors
         * Get SponsorBlock skip segments for a video.
         */
router.get('/:id/sponsors', async (req, res) => {
    try {
        const { id } = req.params;
        const { categories } = req.query;

        const cats = categories ? categories.split(',') : undefined;
        const segments = await sponsorBlockService.getSegments(id, cats);

        res.json({
            videoId: id,
            segments,
            count: segments.length,
        });
    } catch (err) {
        console.error(`[Route /api/video/${req.params.id}/sponsors] Error:`, err.message);
        res.status(500).json({ error: 'Failed to get sponsor segments', details: err.message, videoId: req.params.id });
    }
});

module.exports = router;

