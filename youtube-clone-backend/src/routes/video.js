const express = require('express');
const youtubeService = require('../services/youtube');
const streamService = require('../services/stream');
const sponsorBlockService = require('../services/sponsorblock');

const router = express.Router();

/**
 * GET /api/video/:id/combined-watch
 * Get everything needed for the watch page in ONE request.
 */
router.get('/:id/combined-watch', async (req, res) => {
    try {
        const { id } = req.params;
        const { quality = 'highest' } = req.query;
        const cacheKey = `combined-watch-response:${id}:${quality}`;

        const cachedResponse = await youtubeService.cache.get(cacheKey);
        if (cachedResponse) return res.json(cachedResponse);

        const [details, stream, sponsors] = await Promise.all([
            youtubeService.getVideoDetails(id).catch(() => null),
            streamService.getVideoStream(id, quality).catch(() => null),
            sponsorBlockService.getSegments(id).catch(() => [])
        ]);

        if (!details) return res.status(404).json({ error: 'Video not found' });

        const result = { videoId: id, details, stream, sponsors: sponsors || [] };
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
        if (!data) return res.status(404).json({ error: 'Video not found' });
        res.json(data);
    } catch (err) {
        console.error(`[Route /api/video/${req.params.id}] Error:`, err.message);
        res.status(500).json({ error: 'Failed to get video details', details: err.message });
    }
});

/**
 * GET /api/video/:id/related
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
 */
router.get('/:id/streams', async (req, res) => {
    try {
        const { id } = req.params;
        const formats = await streamService.getFormats(id);
        res.json({ videoId: id, formats });
    } catch (err) {
        // Log as a warning instead of error, since the Frontend expects and handles this via YouTube Embed Fallback.
        console.warn(`[Route /api/video/${req.params.id}/streams] Stream extraction failed (expected on Render IP). Falling back to Embed.`);
        res.status(500).json({ error: 'Failed to get stream formats', details: err.message });
    }
});

/**
 * GET /api/video/:id/stream/video
 */
router.get('/:id/stream/video', async (req, res) => {
    try {
        const { id } = req.params;
        const { quality = 'highest' } = req.query;
        const stream = await streamService.getVideoStream(id, quality);
        res.json(stream);
    } catch (err) {
        console.warn(`[Route /api/video/${req.params.id}/stream/video] Direct stream unavailable (Render IP issue). Frontend will default to Embed.`);
        res.status(500).json({ error: 'Failed to get video stream', details: err.message });
    }
});

/**
 * GET /api/video/:id/stream/audio
 */
router.get('/:id/stream/audio', async (req, res) => {
    try {
        const { id } = req.params;
        const audioInfo = await streamService.getAudioStream(id);
        res.json(audioInfo);
    } catch (err) {
        console.error(`[Route /api/video/${req.params.id}/stream/audio] Error:`, err.message);
        res.status(500).json({ error: 'Failed to get audio stream', details: err.message });
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

