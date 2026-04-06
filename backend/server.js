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
    'http://localhost:3001',
    'http://localhost:8080',
    'https://projectcoachai.pages.dev',
    'https://projectcoachai.com',
    'https://www.projectcoachai.com',
    'https://forge-app-1u9.pages.dev'
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow all origins — Forge is a public API
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Handle preflight requests explicitly
app.options('*', cors());

// Stripe webhook needs raw body BEFORE express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
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

// Stripe routes (guarded — local stripe.js may be Cloudflare Worker format)
try {
    const stripeRoutes = require('./routes/stripe');
    if (typeof stripeRoutes === 'function') {
        app.use('/api/stripe', stripeRoutes);
        console.log('💳 Stripe routes loaded');
    } else {
        console.warn('⚠️  Stripe routes skipped (not an Express router — deploy to Railway for Stripe)');
    }
} catch (e) {
    console.warn('⚠️  Stripe routes skipped:', e.message);
}

// Contact routes
try {
    const contactRoutes = require('./routes/contact');
    app.use('/api/contact', contactRoutes);
} catch (e) { console.warn('⚠️  Contact routes skipped:', e.message); }

// Account services (password reset/change)
try {
    const accountRoutes = require('./routes/account');
    app.use('/api/account', accountRoutes);
} catch (e) { console.warn('⚠️  Account routes skipped:', e.message); }

// Auth routes (register, signin, signout, /me, password reset)
try {
    const authRoutes = require('./routes/auth');
    app.use('/api/auth', authRoutes);
    console.log('🔐 Auth routes loaded');
} catch (e) { console.warn('⚠️  Auth routes skipped:', e.message); }

// Provider key connections (encrypted storage)
try {
    const connectionsRoutes = require('./routes/connections');
    app.use('/api/connections', connectionsRoutes);
    console.log('🔗 Connections routes loaded');
} catch (e) { console.warn('⚠️  Connections routes skipped:', e.message); }

// Prompt library CRUD
try {
    const promptsRoutes = require('./routes/prompts');
    app.use('/api/prompts', promptsRoutes);
    console.log('📚 Prompts routes loaded');
} catch (e) { console.warn('⚠️  Prompts routes skipped:', e.message); }

// 7-mode synthesis via Forge Claude Haiku
try {
    const synthesizeRoutes = require('./routes/synthesize');
    app.use('/api/synthesize', synthesizeRoutes);
    console.log('✦ Synthesize routes loaded');
} catch (e) { console.warn('⚠️  Synthesize routes skipped:', e.message); }

// Admin routes
try {
    const adminRoutes = require('./routes/admin');
    app.use('/api/admin', adminRoutes);
} catch (e) { console.warn('⚠️  Admin routes skipped:', e.message); }

// Analytics tracking
try {
    const trackRoutes = require('./routes/track');
    app.use('/api/track', trackRoutes);
} catch (e) { console.warn('⚠️  Track routes skipped:', e.message); }

// AI comparison API
try {
    const compareRoutes = require('./routes/compare');
    app.use('/api/compare', compareRoutes);
    console.log('⚡ Compare routes loaded');
} catch (e) { console.warn('⚠️  Compare routes skipped:', e.message); }

// Local dev: serve legal pages and SPA catch-all
if (!isProduction) {
    const projectRoot = path.join(__dirname, '..');
    app.get('/privacy.html', (req, res) => {
        res.sendFile(path.join(projectRoot, 'privacy.html'));
    });
    app.get('/terms.html', (req, res) => {
        res.sendFile(path.join(projectRoot, 'terms.html'));
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
    console.log(`\n🚀 ProjectCoachAI Backend running on port ${PORT}`);
    console.log(`📍 Health: http://localhost:${PORT}/health`);
});

// cache bust 04/06/2026 16:13:07
