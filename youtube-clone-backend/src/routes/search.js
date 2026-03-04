const express = require('express');
const youtubeService = require('../services/youtube');

const router = express.Router();

/**
 * GET /api/search?q=...&maxResults=12&pageToken=...
 * Search videos on YouTube (cached).
 */
router.get('/', async (req, res) => {
    try {
        const { q, maxResults = 12, pageToken = '' } = req.query;

        if (!q || q.trim().length === 0) {
            return res.status(400).json({ error: 'Query parameter "q" is required' });
        }

        const data = await youtubeService.search(
            q.trim(),
            parseInt(maxResults, 10),
            pageToken
        );

        res.json(data);
    } catch (err) {
        console.error('[Route /api/search] Error:', err.message);
        res.status(500).json({ error: 'Failed to search videos', details: err.message });
    }
});

module.exports = router;
