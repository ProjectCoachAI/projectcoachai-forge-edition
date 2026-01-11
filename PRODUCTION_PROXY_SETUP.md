# Production-Ready Proxy Server Setup

## 🏆 Recommended: Railway (Best Stable Solution)

**Why Railway over Vercel:**
- ✅ **No execution time limits** (critical for AI API calls)
- ✅ **Built-in Redis** (for rate limiting & caching)
- ✅ **More stable** for production workloads
- ✅ **Predictable pricing** ($5/month starter)
- ✅ **Easy deployment** (GitHub integration)
- ✅ **Better for long-running operations**

---

## 🏗️ Complete Implementation

### Project Structure

```
projectcoachai-proxy/
├── server.js                 # Main Express server
├── routes/
│   ├── ai.js                # AI query routes
│   └── health.js            # Health check
├── lib/
│   ├── ai-config.js         # AI provider configs
│   ├── rate-limit.js        # Rate limiting (Redis)
│   ├── cache.js             # Response caching (Redis)
│   └── secrets.js           # API key management
├── package.json
├── railway.json             # Railway config
└── .env.example
```

---

## 📦 Step 1: Setup Files

### `package.json`

```json
{
  "name": "projectcoachai-proxy",
  "version": "1.0.0",
  "description": "AI Proxy Server for ProjectCoachAI",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "ioredis": "^5.3.2",
    "node-fetch": "^2.7.0",
    "express-rate-limit": "^7.1.5",
    "helmet": "^7.1.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### `server.js` (Main Server)

```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const aiRoutes = require('./routes/ai');
const healthRoutes = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/ai', aiRoutes);
app.use('/api/health', healthRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AI Proxy Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
});
```

### `routes/ai.js` (AI Query Routes)

```javascript
const express = require('express');
const router = express.Router();
const { getAIConfig } = require('../lib/ai-config');
const { getAPIKey } = require('../lib/secrets');
const { checkRateLimit, recordRequest } = require('../lib/rate-limit');
const { getCached, setCache } = require('../lib/cache');

// Single AI query
router.post('/query', async (req, res) => {
  try {
    const { aiProvider, prompt, userId } = req.body;
    
    // Validation
    if (!aiProvider || !prompt || !userId) {
      return res.status(400).json({ 
        error: 'Missing required fields: aiProvider, prompt, userId' 
      });
    }
    
    // Check rate limit
    const rateLimitOk = await checkRateLimit(userId, aiProvider);
    if (!rateLimitOk) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded. Please try again later.' 
      });
    }
    
    // Check cache
    const cacheKey = `${userId}:${aiProvider}:${hashPrompt(prompt)}`;
    const cached = await getCached(cacheKey);
    if (cached) {
      console.log(`✅ Cache hit for ${aiProvider}`);
      return res.json({
        provider: aiProvider,
        content: cached.content,
        usage: cached.usage,
        cached: true,
        timestamp: new Date().toISOString()
      });
    }
    
    // Get API key
    const apiKey = await getAPIKey(aiProvider);
    if (!apiKey) {
      return res.status(500).json({ 
        error: `API key not configured for ${aiProvider}` 
      });
    }
    
    // Get AI config
    const config = getAIConfig(aiProvider);
    if (!config) {
      return res.status(400).json({ 
        error: `Invalid AI provider: ${aiProvider}` 
      });
    }
    
    // Make API call
    console.log(`🌐 Calling ${aiProvider} API...`);
    const startTime = Date.now();
    
    const endpoint = typeof config.endpoint === 'function' 
      ? config.endpoint(apiKey) 
      : config.endpoint;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers(apiKey)
      },
      body: JSON.stringify(config.bodyMapper(prompt))
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`❌ ${aiProvider} API error:`, errorData);
      return res.status(response.status).json({ 
        error: errorData.error?.message || `API request failed: ${response.statusText}` 
      });
    }
    
    // Parse response
    const result = await config.responseParser(response);
    const duration = Date.now() - startTime;
    
    console.log(`✅ ${aiProvider} response received (${duration}ms)`);
    
    // Cache result (5 minutes)
    await setCache(cacheKey, {
      content: result.content,
      usage: result.usage,
      model: result.model
    }, 300); // 5 minutes
    
    // Record usage
    await recordRequest(userId, aiProvider, prompt.length, result.content.length);
    
    // Return response
    res.json({
      provider: aiProvider,
      content: result.content,
      usage: result.usage,
      model: result.model,
      cached: false,
      duration: duration,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in /query:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
});

// Batch query (multiple AIs)
router.post('/batch', async (req, res) => {
  try {
    const { aiProviders, prompt, userId } = req.body;
    
    if (!Array.isArray(aiProviders) || !prompt || !userId) {
      return res.status(400).json({ 
        error: 'Missing required fields: aiProviders (array), prompt, userId' 
      });
    }
    
    // Process all providers concurrently
    const promises = aiProviders.map(provider => 
      fetch(`${req.protocol}://${req.get('host')}/api/ai/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiProvider: provider, prompt, userId })
      })
      .then(r => r.json())
      .then(data => ({ provider, ...data }))
      .catch(error => ({ 
        provider, 
        error: error.message,
        success: false 
      }))
    );
    
    const results = await Promise.all(promises);
    
    res.json({
      results,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in /batch:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function
function hashPrompt(prompt) {
  // Simple hash for caching (use crypto in production)
  return Buffer.from(prompt).toString('base64').slice(0, 50);
}

module.exports = router;
```

### `routes/health.js` (Health Check)

```javascript
const express = require('express');
const router = express.Router();
const { getRedis } = require('../lib/cache');

router.get('/', async (req, res) => {
  try {
    // Check Redis connection
    const redis = getRedis();
    if (redis) {
      await redis.ping();
    }
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      redis: redis ? 'connected' : 'not configured'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

module.exports = router;
```

### `lib/ai-config.js` (Copy from your Electron app)

```javascript
// Same as ai-config.js in Electron app
// Copy the entire file from ProjectCoachAI-Forge-Edition-V1/ai-config.js
```

### `lib/secrets.js` (API Key Management)

```javascript
// Get API keys from environment variables
function getAPIKey(provider) {
  const keys = {
    'chatgpt': process.env.OPENAI_API_KEY,
    'claude': process.env.ANTHROPIC_API_KEY,
    'gemini': process.env.GEMINI_API_KEY,
    'perplexity': process.env.PERPLEXITY_API_KEY
  };
  
  return keys[provider.toLowerCase()] || null;
}

module.exports = { getAPIKey };
```

### `lib/rate-limit.js` (Rate Limiting with Redis)

```javascript
const Redis = require('ioredis');

let redis = null;

function getRedis() {
  if (!redis && process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL);
  }
  return redis;
}

// Rate limit: 100 requests per hour per user per provider
async function checkRateLimit(userId, provider) {
  const redis = getRedis();
  if (!redis) {
    // No Redis = no rate limiting (for development)
    return true;
  }
  
  const key = `ratelimit:${userId}:${provider}`;
  const current = await redis.incr(key);
  
  if (current === 1) {
    // Set expiration (1 hour)
    await redis.expire(key, 3600);
  }
  
  const limit = parseInt(process.env.RATE_LIMIT_PER_HOUR || '100');
  return current <= limit;
}

async function recordRequest(userId, provider, promptTokens, responseTokens) {
  const redis = getRedis();
  if (!redis) return;
  
  const key = `usage:${userId}:${provider}`;
  await redis.hincrby(key, 'requests', 1);
  await redis.hincrby(key, 'prompt_tokens', promptTokens);
  await redis.hincrby(key, 'response_tokens', responseTokens);
  await redis.expire(key, 86400 * 30); // 30 days
}

module.exports = { checkRateLimit, recordRequest, getRedis };
```

### `lib/cache.js` (Response Caching with Redis)

```javascript
const Redis = require('ioredis');

let redis = null;

function getRedis() {
  if (!redis && process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL);
  }
  return redis;
}

async function getCached(key) {
  const redis = getRedis();
  if (!redis) return null;
  
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

async function setCache(key, data, ttlSeconds = 300) {
  const redis = getRedis();
  if (!redis) return;
  
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(data));
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

module.exports = { getCached, setCache, getRedis };
```

### `.env.example`

```env
# Server
PORT=3000
NODE_ENV=production
ALLOWED_ORIGINS=https://your-electron-app.com

# API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...
PERPLEXITY_API_KEY=...

# Redis (Railway provides this automatically)
REDIS_URL=redis://default:password@host:port

# Rate Limiting
RATE_LIMIT_PER_HOUR=100
```

### `railway.json` (Railway Config)

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

---

## 🚀 Deployment to Railway

### Step 1: Create Railway Account
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Create new project

### Step 2: Add Redis
1. In Railway dashboard, click "New"
2. Select "Redis"
3. Railway automatically provides `REDIS_URL` environment variable

### Step 3: Deploy Code
1. Connect GitHub repository
2. Railway auto-detects Node.js
3. Add environment variables:
   - `OPENAI_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `GEMINI_API_KEY`
   - `PERPLEXITY_API_KEY`
   - `ALLOWED_ORIGINS` (your Electron app domain, or `*` for testing)

### Step 4: Get Your URL
Railway provides a URL like: `https://your-project.up.railway.app`

---

## 🔄 Update Your Electron App

Update `api-proxy-client.js`:

```javascript
constructor(baseURL, userId) {
    // Change to your Railway URL
    this.baseURL = baseURL || 'https://your-project.up.railway.app';
    this.userId = userId || 'local-user';
}
```

---

## 💰 Pricing

### Railway:
- **Starter:** $5/month (includes Redis)
- **Pro:** $20/month (more resources)
- **Pay-as-you-go:** $0.000463/GB RAM-hour

### API Costs (You Pay):
- ChatGPT: ~$0.01-0.03 per 1K tokens
- Claude: ~$0.015-0.03 per 1K tokens
- Gemini: ~$0.0005-0.002 per 1K tokens

**Example:** 1000 users, 10 queries/day = ~$50-150/day in API costs

---

## ✅ Why Railway is Best

1. **No Time Limits** - Critical for AI API calls
2. **Built-in Redis** - Perfect for rate limiting & caching
3. **Stable & Reliable** - Production-grade infrastructure
4. **Easy Deployment** - GitHub integration, auto-deploy
5. **Predictable Pricing** - Clear, transparent costs
6. **Great Support** - Active community, good docs

---

## 🎯 Alternative: Render (Also Excellent)

If you prefer Render:
- Similar setup (Express.js)
- Built-in Redis option
- Free tier available
- Slightly different deployment process

**Both Railway and Render are better than Vercel for this use case** because they don't have execution time limits.

---

## 📋 Deployment Checklist

- [ ] Create Railway account
- [ ] Create new project
- [ ] Add Redis service
- [ ] Connect GitHub repository
- [ ] Set environment variables
- [ ] Deploy
- [ ] Test health endpoint
- [ ] Test AI query endpoint
- [ ] Update Electron app with Railway URL
- [ ] Monitor usage & costs

---

**Bottom Line:** Railway is the **best stable solution** for production. It's built for exactly this type of workload. 🚀













