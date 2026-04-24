// Backend Server for ProjectCoachAI
// This server can be deployed to Railway for backend services

require('dotenv').config();
const express     = require('express');
let compression;
try { compression = require('compression'); } catch(_) { compression = () => (req,res,next) => next(); console.warn('[Compression] not available'); }
let helmet;
try { helmet = require('helmet'); } catch(_) { helmet = () => (req,res,next) => next(); console.warn('[Helmet] not available'); }
const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');
const cors    = require('cors');
const path    = require('path');
const db      = require('./lib/db');

const app  = express();

// Global async route error wrapper
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);


const PORT = process.env.PORT || 3000;

// Initialize PostgreSQL on startup
db.init().catch(err => console.error('DB init error:', err.message));

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
        const allowed = [
            'https://forge-app-1u9.pages.dev',
            'https://projectcoachai.com',
            'https://www.projectcoachai.com',
            'http://localhost:3000',
            'http://localhost:5500',
        ];
        if (!origin || allowed.includes(origin)) return callback(null, true);
        console.warn('[CORS] Unlisted origin:', origin);
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Handle preflight requests explicitly
app.options('*', cors());

// Stripe webhook needs raw body BEFORE express.json()
// Production middleware
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use('/api/', apiLimiter);
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input sanitization helper
function sanitize(str, maxLen=500) {
  if (typeof str !== "string") return "";
  return str.trim().slice(0, maxLen);
}
global.sanitize = sanitize;


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

// Stripe routes (guarded Ã¢â‚¬â€ local stripe.js may be Cloudflare Worker format)
try {
    const stripeRoutes = require('./routes/stripe');
    if (typeof stripeRoutes === 'function') {
        app.use('/api/stripe', stripeRoutes);
        console.log('Ã°Å¸â€™Â³ Stripe routes loaded');
    } else {
        console.warn('Ã¢Å¡Â Ã¯Â¸Â  Stripe routes skipped (not an Express router Ã¢â‚¬â€ deploy to Railway for Stripe)');
    }
} catch (e) {
    console.warn('Ã¢Å¡Â Ã¯Â¸Â  Stripe routes skipped:', e.message);
}

// Contact routes
try {
    const contactRoutes = require('./routes/contact');
    app.use('/api/contact', contactRoutes);
} catch (e) { console.warn('Ã¢Å¡Â Ã¯Â¸Â  Contact routes skipped:', e.message); }
try {
    app.use('/api/invite', require('./routes/invite'));
try { app.use('/api/digest', require('./routes/digest')); console.log('Digest routes loaded'); } catch(e) { console.warn('Digest routes skipped:', e.message); }
    console.log('Invite routes loaded');
} catch (e) { console.warn('Invite routes failed:', e.message); }

// Account services (password reset/change)
try {
    const accountRoutes = require('./routes/account');
    app.use('/api/account', accountRoutes);
} catch (e) { console.warn('Ã¢Å¡Â Ã¯Â¸Â  Account routes skipped:', e.message); }

// Auth routes (register, signin, signout, /me, password reset)
try {
    const authRoutes = require('./routes/auth');
    app.use('/api/auth/2fa', require('./routes/2fa'));
app.use('/api/auth', authRoutes);
    console.log('Ã°Å¸â€Â Auth routes loaded');
} catch (e) { console.warn('Ã¢Å¡Â Ã¯Â¸Â  Auth routes skipped:', e.message); }

// Provider key connections (encrypted storage)
try {
    const connectionsRoutes = require('./routes/connections');
    app.use('/api/connections', connectionsRoutes);
    console.log('Ã°Å¸â€â€” Connections routes loaded');
} catch (e) { console.warn('Ã¢Å¡Â Ã¯Â¸Â  Connections routes skipped:', e.message); }

// Prompt library CRUD
try {
    const promptsRoutes = require('./routes/prompts');
    app.use('/api/prompts', promptsRoutes);
    console.log('Ã°Å¸â€œÅ¡ Prompts routes loaded');
} catch (e) { console.warn('Ã¢Å¡Â Ã¯Â¸Â  Prompts routes skipped:', e.message); }

// 7-mode synthesis via Forge Claude Haiku
try {
    const excelRoutes = require('./routes/excel');
    app.use('/api/excel', excelRoutes);
    console.log('Excel analysis routes loaded');
} catch (e) { console.warn('Excel routes failed:', e.message); }
try {
    const synthesizeRoutes = require('./routes/synthesize');
    app.use('/api/synthesize', synthesizeRoutes);
    console.log('Ã¢Å“Â¦ Synthesize routes loaded');
} catch (e) { console.warn('Ã¢Å¡Â Ã¯Â¸Â  Synthesize routes skipped:', e.message); }

// Admin routes
try {
    const adminRoutes = require('./routes/admin');
    app.use('/api/admin', adminRoutes)
} catch (e) { console.warn('Ã¢Å¡Â Ã¯Â¸Â  Admin routes skipped:', e.message); }

// Analytics tracking
try {
    const trackRoutes = require('./routes/track');
    app.use('/api/track', trackRoutes);
} catch (e) { console.warn('Ã¢Å¡Â Ã¯Â¸Â  Track routes skipped:', e.message); }

// AI comparison API
try {
    const compareRoutes = require('./routes/compare');
    app.use('/api/compare', compareRoutes);
    console.log('Ã¢Å¡Â¡ Compare routes loaded');
} catch (e) { console.warn('Ã¢Å¡Â Ã¯Â¸Â  Compare routes skipped:', e.message); }

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

// Global error handler Ã¢â‚¬â€ ensures CORS headers are present even on crashes
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Start server

// Global unhandled promise rejection handler
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Server] Unhandled Rejection:", reason?.message || reason);
});
process.on("uncaughtException", (err) => {
  console.error("[Server] Uncaught Exception:", err.message);
});

app.listen(PORT, () => {
    console.log(`\nÃ°Å¸Å¡â‚¬ ProjectCoachAI Backend running on port ${PORT}`);
    console.log(`Ã°Å¸â€œÂ Health: http://localhost:${PORT}/health`);
});

// cache bust 04/06/2026 16:13:07


