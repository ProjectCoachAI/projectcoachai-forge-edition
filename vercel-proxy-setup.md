# Vercel Proxy Server Setup Guide

## ✅ Yes, Vercel Works Great!

Vercel is an excellent choice for your API proxy server. Here's how to set it up:

---

## 🏗️ Project Structure

```
projectcoachai-proxy/
├── api/
│   ├── ai/
│   │   ├── query.js          # Single AI query
│   │   ├── batch.js          # Batch queries
│   │   └── stream.js         # Streaming responses
│   ├── health.js             # Health check
│   └── usage.js              # Usage tracking
├── lib/
│   ├── ai-config.js          # AI provider configs
│   ├── rate-limit.js         # Rate limiting
│   ├── cache.js              # Response caching
│   └── secrets.js            # API key management
├── vercel.json               # Vercel config
└── package.json
```

---

## 📦 Setup Steps

### 1. Create Vercel Project

```bash
# Install Vercel CLI
npm i -g vercel

# Create new project
mkdir projectcoachai-proxy
cd projectcoachai-proxy
npm init -y

# Install dependencies
npm install node-fetch@2
```

### 2. Basic API Route (`api/ai/query.js`)

```javascript
// api/ai/query.js
const { getAIConfig } = require('../../lib/ai-config');
const { getAPIKey } = require('../../lib/secrets');
const { checkRateLimit } = require('../../lib/rate-limit');
const { getCachedOrFresh } = require('../../lib/cache');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-ID');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { aiProvider, prompt, userId } = req.body;
    
    // 1. Validate input
    if (!aiProvider || !prompt || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // 2. Check rate limit
    const rateLimitOk = await checkRateLimit(userId, aiProvider);
    if (!rateLimitOk) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    
    // 3. Check cache
    const cached = await getCachedOrFresh(userId, aiProvider, prompt);
    if (cached) {
      return res.json({
        provider: aiProvider,
        content: cached.content,
        usage: cached.usage,
        cached: true
      });
    }
    
    // 4. Get API key
    const apiKey = await getAPIKey(aiProvider);
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }
    
    // 5. Get AI config
    const config = getAIConfig(aiProvider);
    if (!config) {
      return res.status(400).json({ error: 'Invalid AI provider' });
    }
    
    // 6. Make API call
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers(apiKey)
      },
      body: JSON.stringify(config.bodyMapper(prompt))
    });
    
    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json({ 
        error: error.error?.message || 'API request failed' 
      });
    }
    
    // 7. Parse response
    const result = await config.responseParser(response);
    
    // 8. Cache result
    await cacheResult(userId, aiProvider, prompt, result);
    
    // 9. Log usage
    await logUsage(userId, aiProvider, prompt.length, result.content.length);
    
    // 10. Return response
    res.json({
      provider: aiProvider,
      content: result.content,
      usage: result.usage,
      model: result.model
    });
    
  } catch (error) {
    console.error('API Proxy Error:', error);
    res.status(500).json({ error: error.message });
  }
};
```

### 3. Health Check (`api/health.js`)

```javascript
// api/health.js
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
};
```

### 4. Vercel Config (`vercel.json`)

```json
{
  "functions": {
    "api/ai/query.js": {
      "maxDuration": 60
    },
    "api/ai/batch.js": {
      "maxDuration": 60
    }
  },
  "env": {
    "OPENAI_API_KEY": "@openai-api-key",
    "ANTHROPIC_API_KEY": "@anthropic-api-key",
    "GEMINI_API_KEY": "@gemini-api-key"
  }
}
```

### 5. Environment Variables

In Vercel Dashboard:
- Go to Project Settings → Environment Variables
- Add:
  - `OPENAI_API_KEY` = `sk-...`
  - `ANTHROPIC_API_KEY` = `sk-ant-...`
  - `GEMINI_API_KEY` = `...`

---

## ⚠️ Vercel Limitations & Solutions

### 1. Execution Time Limits
- **Free tier:** 10 seconds
- **Pro tier:** 60 seconds
- **Enterprise:** 300 seconds

**Solution:**
- Use Pro tier (60 seconds is usually enough)
- For longer responses, use streaming
- Consider splitting into multiple calls

### 2. Streaming Support
Vercel supports streaming, but it's more complex.

**Alternative:** Use Server-Sent Events (SSE) or chunked responses.

### 3. Rate Limiting & Caching
Vercel doesn't have built-in rate limiting or caching.

**Solution:**
- Use Vercel KV (Redis) for rate limiting
- Use Vercel KV for caching
- Or use Upstash Redis (free tier available)

---

## 🚀 Deployment

```bash
# Deploy to Vercel
vercel

# Set environment variables
vercel env add OPENAI_API_KEY
vercel env add ANTHROPIC_API_KEY
vercel env add GEMINI_API_KEY

# Deploy to production
vercel --prod
```

Your API will be available at:
- `https://your-project.vercel.app/api/ai/query`
- `https://your-project.vercel.app/api/health`

---

## 🔄 Update Your Electron App

Update `api-proxy-client.js`:

```javascript
constructor(baseURL, userId) {
    // Change this to your Vercel URL
    this.baseURL = baseURL || 'https://your-project.vercel.app';
    this.userId = userId || 'local-user';
}
```

---

## 💰 Cost Considerations

### Vercel Pricing:
- **Free tier:** 100GB bandwidth, 100 hours function execution
- **Pro tier:** $20/month - Unlimited bandwidth, 1000 hours
- **Enterprise:** Custom pricing

### API Costs (You Pay):
- ChatGPT: ~$0.01-0.03 per 1K tokens
- Claude: ~$0.015-0.03 per 1K tokens
- Gemini: ~$0.0005-0.002 per 1K tokens

**Example:** 1000 users, 10 queries/day each = 10,000 queries/day
- Average: 500 tokens per query = 5M tokens/day
- Cost: ~$50-150/day depending on provider mix

---

## 🎯 Alternative Platforms (If Vercel Doesn't Fit)

### 1. **Railway** (Recommended Alternative)
- ✅ Easy setup
- ✅ No time limits
- ✅ Built-in Redis
- ✅ $5/month starter

### 2. **Render**
- ✅ Free tier available
- ✅ Easy deployment
- ✅ Built-in Redis option

### 3. **Fly.io**
- ✅ Global edge deployment
- ✅ Good for streaming
- ✅ Pay-as-you-go

### 4. **AWS Lambda**
- ✅ Serverless
- ✅ 15-minute timeout
- ✅ More complex setup

---

## ✅ Recommendation

**For MVP/Testing:**
- ✅ Use Vercel (easy, fast setup)
- ✅ Start with Pro tier ($20/month)
- ✅ Use Vercel KV for caching/rate limiting

**For Production (if you scale):**
- Consider Railway or Render for better control
- Or stick with Vercel Enterprise if you need longer timeouts

---

## 📋 Quick Start Checklist

- [ ] Create Vercel account
- [ ] Create new project
- [ ] Set up folder structure
- [ ] Create `api/ai/query.js`
- [ ] Create `api/health.js`
- [ ] Add environment variables
- [ ] Deploy to Vercel
- [ ] Update Electron app with Vercel URL
- [ ] Test API calls
- [ ] Monitor usage/costs

---

**Bottom line:** Yes, Vercel works great! It's perfect for getting started quickly. 🚀













