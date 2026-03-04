const express = require('express');
const youtubeService = require('../services/youtube');

const router = express.Router();

/**
 * GET /api/trending?region=VN&maxResults=20
 * Get trending/popular videos (cached).
 */
router.get('/', async (req, res) => {
    try {
        const { region = 'VN', maxResults = 20 } = req.query;
        const data = await youtubeService.getTrending(region, parseInt(maxResults, 10));
        res.json(data);
    } catch (err) {
        console.error('[Route /api/trending] Error:', err.message);
        res.status(500).json({ error: 'Failed to get trending videos', details: err.message });
    }
});

module.exports = router;
