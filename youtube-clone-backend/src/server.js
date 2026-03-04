const express = require('express');
const cors = require('cors');
const config = require('./config');
const compression = require('compression');
const cache = require('./services/cache');

const app = express();

// ── Middleware ──────────────────────────────────────────────
app.use(compression());
app.use(cors({
    origin: config.clientUrl,
    credentials: true,
}));
app.use(express.json());

// Request logging (dev only)
if (config.nodeEnv === 'development') {
    app.use((req, res, next) => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
        next();
    });
}

// ── Routes ─────────────────────────────────────────────────
const searchRoutes = require('./routes/search');
const videoRoutes = require('./routes/video');
const trendingRoutes = require('./routes/trending');

app.use('/api/search', searchRoutes);
app.use('/api/video', videoRoutes);
app.use('/api/trending', trendingRoutes);

// Health check
app.get('/api/health', (req, res) => {
    const apiKeyManager = require('./services/apiKeyManager');
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        apiKeys: apiKeyManager.getStatus(),
    });
});

// 404 handler
app.use((req, res) => {
    console.log(`[404] Not Found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('[Server Error]', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ── Server Start ───────────────────────────────────────────
async function start() {
    // Initialize cache (Redis or fallback)
    await cache.init();

    app.listen(config.port, () => {
        console.log(`
╔══════════════════════════════════════════════╗
║   YouTube Clone Backend — Ready!             ║
║   Port: ${config.port}                              ║
║   Env:  ${config.nodeEnv}                     ║
║   Client URL: ${config.clientUrl}     ║
╚══════════════════════════════════════════════╝
    `);
    });
}

start().catch((err) => {
    console.error('[Fatal] Failed to start server:', err);
    process.exit(1);
});

module.exports = app;
