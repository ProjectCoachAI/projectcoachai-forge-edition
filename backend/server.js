// Backend Server for ProjectCoachAI
// This server can be deployed to Railway for backend services

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'https://projectcoachai.pages.dev',
    'https://projectcoachai.com',
    'https://www.projectcoachai.com'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(null, true); // Allow all for now; tighten later
        }
    },
    credentials: true
}));
app.use(express.json());

// Trust proxy for accurate IP-based rate limiting (Railway, Render, etc.)
app.set('trust proxy', 1);

// Serve Forge Lite static files (local dev only; Cloudflare Pages serves in production)
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT;
const forgeLitePath = path.join(__dirname, '..', 'forge-lite');

if (!isProduction) {
    app.use('/css', express.static(path.join(forgeLitePath, 'css')));
    app.use('/js', express.static(path.join(forgeLitePath, 'js')));
    app.use('/assets', express.static(path.join(forgeLitePath, 'assets')));
}

// Health check endpoint (required by Railway)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'projectcoachai-backend' });
});

// Stripe routes
const stripeRoutes = require('./routes/stripe');
app.use('/api/stripe', stripeRoutes);

// Contact routes
const contactRoutes = require('./routes/contact');
app.use('/api/contact', contactRoutes);

// Account services (password reset/change)
const accountRoutes = require('./routes/account');
app.use('/api/account', accountRoutes);

// Global auth services (register/sign-in/password reset/change)
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Analytics tracking
const trackRoutes = require('./routes/track');
app.use('/api/track', trackRoutes);

// Forge Lite — AI comparison API
const compareRoutes = require('./routes/compare');
app.use('/api/compare', compareRoutes);

// Local dev: serve legal pages and SPA catch-all
if (!isProduction) {
    const projectRoot = path.join(__dirname, '..');
    app.get('/privacy.html', (req, res) => {
        res.sendFile(path.join(projectRoot, 'privacy.html'));
    });
    app.get('/terms.html', (req, res) => {
        res.sendFile(path.join(projectRoot, 'terms.html'));
    });
    app.get('*', (req, res) => {
        res.sendFile(path.join(forgeLitePath, 'index.html'));
    });
}

// Production: root endpoint for health/info
if (isProduction) {
    app.get('/', (req, res) => {
        res.json({ service: 'ProjectCoachAI Backend', status: 'ok' });
    });
}

// Start server
app.listen(PORT, () => {
    console.log(`🚀 ProjectCoachAI Backend running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`💳 Stripe API: http://localhost:${PORT}/api/stripe`);
    console.log(`🔥 Forge Lite: http://localhost:${PORT}`);
});




