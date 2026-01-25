// Backend Server for ProjectCoachAI
// This server can be deployed to Railway for backend services

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint (required by Railway)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'projectcoachai-backend' });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'ProjectCoachAI Backend',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            stripe: '/api/stripe'
        }
    });
});

// Stripe routes
const stripeRoutes = require('./routes/stripe');
app.use('/api/stripe', stripeRoutes);

// Start server
app.listen(PORT, () => {
    console.log(`🚀 ProjectCoachAI Backend running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`💳 Stripe API: http://localhost:${PORT}/api/stripe`);
});




