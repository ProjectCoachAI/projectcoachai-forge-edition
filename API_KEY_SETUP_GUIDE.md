# API Key Setup & Backend Testing Guide

## 🎯 Overview
This guide helps you set up API keys for all AI providers and test the backend integration for message sharing, comparison, and synthesis features.

---

## 📋 Required API Keys

### Core AI Providers (Priority 1)
1. **OpenAI** - https://platform.openai.com/api-keys
   - Required for: Synthesis template generation
   - Key format: `sk-...`
   - Usage: GPT-4 for analysis framework templates

2. **Anthropic (Claude)** - https://console.anthropic.com/settings/keys
   - Required for: Synthesis template generation
   - Key format: `sk-ant-...`
   - Usage: Claude for analysis framework templates

3. **Google Gemini** - https://makersuite.google.com/app/apikey
   - Required for: Synthesis template generation
   - Key format: `AIza...`
   - Usage: Gemini for analysis framework templates

### Additional AI Providers (Priority 2)
4. **Perplexity** - https://www.perplexity.ai/settings/api
   - Required for: Direct API queries
   - Key format: `pplx-...`

5. **DeepSeek** - https://platform.deepseek.com/api_keys
   - Required for: Direct API queries
   - Key format: `sk-...`

6. **Mistral AI** - https://console.mistral.ai/api-keys/
   - Required for: Direct API queries
   - Key format: `...`

7. **Grok (xAI)** - https://x.ai/api
   - Required for: Direct API queries
   - Key format: `xai-...`

---

## 🔐 API Key Storage

### For Local Testing (test-backend)
Create `.env` file in `test-backend/` directory:

```env
# Core AI Providers
OPENAI_API_KEY=sk-your-openai-key-here
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here
GEMINI_API_KEY=AIza-your-gemini-key-here

# Additional Providers
PERPLEXITY_API_KEY=pplx-your-perplexity-key-here
DEEPSEEK_API_KEY=sk-your-deepseek-key-here
MISTRAL_API_KEY=your-mistral-key-here
GROK_API_KEY=xai-your-grok-key-here

# Server Configuration
PORT=3001
NODE_ENV=development
```

### For Production Backend
Store keys securely in your production environment:
- Use environment variables
- Never commit keys to git
- Use a secrets management service (AWS Secrets Manager, Azure Key Vault, etc.)

---

## 🧪 Testing Checklist

### Phase 1: Backend Health Check
- [ ] Start test backend: `cd test-backend && npm start`
- [ ] Test health endpoint: `curl http://localhost:3001/health`
- [ ] Verify all API keys are loaded (check console logs)

### Phase 2: Message Sharing (API Proxy)
- [ ] Test single AI query: `POST /api/ai/query`
  ```json
  {
    "aiName": "openai",
    "prompt": "Explain quantum computing",
    "options": {}
  }
  ```
- [ ] Test batch AI queries: `POST /api/ai/batch`
  ```json
  {
    "prompt": "Explain quantum computing",
    "aiNames": ["openai", "claude", "gemini"]
  }
  ```
- [ ] Verify clean response extraction (no metadata, disclaimers)
- [ ] Test with all AI providers individually

### Phase 3: Comparison Feature
- [ ] Open workspace in Electron app
- [ ] Send prompt to multiple AI panes
- [ ] Click "Compare" button
- [ ] Verify API responses are auto-loaded in comparison view
- [ ] Check that responses are clean (no chat history, disclaimers)
- [ ] Verify images are preserved if present
- [ ] Test manual paste fallback (if API fails)

### Phase 4: Synthesis Feature
- [ ] Open comparison view with responses
- [ ] Click "Get AI Synthesis" button
- [ ] Verify synthesis page loads with comparison data
- [ ] Click "Generate 7 Analysis Templates"
- [ ] Verify API calls to OpenAI/Claude for template generation
- [ ] Check that templates are empty frameworks (not pre-filled analysis)
- [ ] Verify compliance notices are displayed
- [ ] Test export/copy functionality

### Phase 5: Response Cleaning
- [ ] Test `/api/test/clean` endpoint with raw AI responses
- [ ] Verify Claude responses: no search history
- [ ] Verify Gemini responses: no disclaimers
- [ ] Verify ChatGPT responses: no thinking markers
- [ ] Verify Perplexity responses: clean content only
- [ ] Check image extraction works correctly

---

## 🔧 Backend Integration Points

### 1. Message Sharing Endpoint
**Location:** `test-backend/server.js` → `/api/ai/query` and `/api/ai/batch`

**What it does:**
- Receives prompt from Electron app
- Routes to appropriate AI provider API
- Cleans response using `ResponseExtractor`
- Returns clean HTML + text

**Test Command:**
```bash
curl -X POST http://localhost:3001/api/ai/query \
  -H "Content-Type: application/json" \
  -d '{
    "aiName": "openai",
    "prompt": "What is AI?",
    "options": {}
  }'
```

### 2. Comparison Data Endpoint
**Location:** `main.js` → `open-visual-comparison` IPC handler

**What it does:**
- Calls backend API for each active pane
- Aggregates responses
- Passes to comparison view

**Test:** Use Electron app UI (Compare button)

### 3. Synthesis Template Generation
**Location:** `synthesis-engine.js` → `runSynthesis()` function

**What it needs:**
- Backend endpoint: `/api/synthesize` (to be created)
- Calls OpenAI/Claude for template generation
- Returns empty frameworks

**Backend Endpoint to Create:**
```javascript
app.post('/api/synthesize', async (req, res) => {
  const { comparisonData, mode } = req.body;
  // Use SynthesisService to generate templates
  // Return empty frameworks only
});
```

---

## 📝 API Key Setup Steps

### Step 1: Sign Up for Each Provider
1. **OpenAI**
   - Go to https://platform.openai.com
   - Sign up / Log in
   - Navigate to API Keys
   - Create new secret key
   - Copy key immediately (won't be shown again)

2. **Anthropic (Claude)**
   - Go to https://console.anthropic.com
   - Sign up / Log in
   - Navigate to API Keys
   - Create new key
   - Copy key

3. **Google Gemini**
   - Go to https://makersuite.google.com
   - Sign up / Log in
   - Navigate to API Keys
   - Create new key
   - Copy key

4. **Perplexity**
   - Go to https://www.perplexity.ai
   - Sign up / Log in
   - Navigate to Settings → API
   - Create new key
   - Copy key

5. **DeepSeek, Mistral, Grok**
   - Follow similar process for each provider
   - Check their respective documentation for signup

### Step 2: Configure Test Backend
1. Navigate to `test-backend/` directory
2. Copy `.env.example` to `.env` (if exists) or create new `.env`
3. Add all API keys to `.env` file
4. Save file

### Step 3: Test Backend
1. Start backend: `cd test-backend && npm start`
2. Check console for "API keys loaded" messages
3. Test health endpoint
4. Test single query endpoint

### Step 4: Test in Electron App
1. Start Electron app
2. Open workspace
3. Send prompt to AI panes
4. Test comparison feature
5. Test synthesis feature

---

## ⚠️ Important Notes

### Rate Limits
- Each provider has different rate limits
- Monitor usage in provider dashboards
- Implement rate limiting in production backend

### Costs
- Most providers charge per token/request
- Monitor usage to avoid unexpected charges
- Set up billing alerts

### Security
- **Never commit API keys to git**
- Use `.gitignore` to exclude `.env` files
- Rotate keys regularly
- Use different keys for dev/staging/production

### Error Handling
- Backend should handle API failures gracefully
- Return clear error messages
- Fall back to manual paste mode if API fails

---

## 🐛 Troubleshooting

### Issue: "API key not found"
**Solution:** Check `.env` file exists and keys are correctly named

### Issue: "Rate limit exceeded"
**Solution:** Wait for rate limit window to reset, or upgrade plan

### Issue: "Invalid API key"
**Solution:** Verify key is correct, check for extra spaces, regenerate if needed

### Issue: "CORS error"
**Solution:** Ensure backend CORS is configured for Electron app origin

### Issue: "Response not clean"
**Solution:** Check `ResponseExtractor` is working, test `/api/test/clean` endpoint

---

## 📞 Support

If you encounter issues:
1. Check backend console logs
2. Check Electron app console (DevTools)
3. Test endpoints directly with curl/Postman
4. Verify API keys are valid in provider dashboards

---

## ✅ Go-Live Checklist

Before going live:
- [ ] All API keys configured in production environment
- [ ] Rate limiting implemented
- [ ] Error handling tested
- [ ] Response cleaning verified
- [ ] Synthesis templates working
- [ ] Comparison auto-load working
- [ ] Manual fallback tested
- [ ] Privacy/compliance notices displayed
- [ ] Performance tested under load

---

**Last Updated:** December 24, 2024











