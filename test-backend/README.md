# Test Backend Server - Quick Start Guide

## 🚀 Quick Setup (5 minutes)

### Step 1: Install Dependencies

```bash
cd test-backend
npm install
```

### Step 2: Set Up API Keys (Optional for testing)

```bash
# Copy example file
cp .env.example .env

# Edit .env and add your API keys
# You can test ResponseExtractor without API keys using /api/test/clean
```

### Step 3: Start Server

```bash
npm start
```

Server will run on `http://localhost:3001`

---

## 🧪 Testing Methods

### Method 1: Test ResponseExtractor Only (No API Keys Needed)

```bash
# Test with sample data
node test.js
```

This tests the cleaning logic with sample responses (like from your screenshot).

### Method 2: Test with Real AI Calls (API Keys Required)

```bash
# Start server
npm start

# In another terminal, test single AI
curl -X POST http://localhost:3001/api/ai/query \
  -H "Content-Type: application/json" \
  -d '{
    "aiProvider": "claude",
    "prompt": "What percentage of the population are millionaires and billionaires?",
    "userId": "test"
  }'
```

### Method 3: Test Batch (Multiple AIs)

```bash
curl -X POST http://localhost:3001/api/ai/batch \
  -H "Content-Type: application/json" \
  -d '{
    "aiProviders": ["chatgpt", "claude", "gemini"],
    "prompt": "What percentage of the population are millionaires and billionaires?",
    "userId": "test"
  }'
```

### Method 4: Test Cleaning with Custom Text

```bash
curl -X POST http://localhost:3001/api/test/clean \
  -H "Content-Type: application/json" \
  -d '{
    "aiProvider": "claude",
    "rawResponse": "Millionsire and billionaire population percentages\nCapital of Japan\nWhat percentage..."
  }'
```

---

## 🔗 Connect Electron App

### Step 1: Start Test Backend

```bash
cd test-backend
npm start
```

### Step 2: Update Electron App

Set environment variable:

```bash
export API_PROXY_URL=http://localhost:3001
```

Or in `main.js`, change:

```javascript
const apiProxyURL = 'http://localhost:3001';
```

### Step 3: Test in Electron App

1. Open Electron app
2. Create workspace with AI tools
3. Send a prompt
4. Click "Compare"
5. Should see clean responses (no chat history, no disclaimers)

---

## 📊 Expected Results

### Before (Raw Response):
```
Millionsire and billionaire population percentages
Capital of Japan
What percentage of the population are millionaires and billionaires? I'll search for...
```

### After (Cleaned):
```
Based on the latest data:

• Millionaires: Approximately 1.1% of global adult population
• Billionaires: About 0.0001% of global population
```

---

## 🐛 Troubleshooting

### Issue: "Cannot find module 'ResponseExtractor'"

**Solution:** Make sure `ResponseExtractor.js` is in the parent directory:
```
projectcoachai-ready-v3.3d-full v1/
├── ResponseExtractor.js
└── test-backend/
    └── server.js
```

### Issue: "API key not set"

**Solution:** 
- For testing ResponseExtractor only: Use `/api/test/clean` endpoint (no keys needed)
- For real AI calls: Add API keys to `.env` file

### Issue: "Connection refused"

**Solution:**
- Check server is running: `curl http://localhost:3001/health`
- Check port is not in use: `lsof -i :3001`
- Try different port: Set `PORT=3002` in `.env`

---

## ✅ Success Indicators

When working correctly, you should see:

1. **Server logs:**
   ```
   📥 Raw response length: 450 chars
   ✨ Clean response length: 180 chars
   ✅ claude: 450 → 180 chars (quality: 95)
   ```

2. **API response:**
   ```json
   {
     "content": "Clean response without chat history...",
     "quality": { "score": 95, "isValid": true },
     "metadata": { "reduction": "60.0%" }
   }
   ```

3. **Electron app:**
   - Clean responses in comparison view
   - No chat history
   - No disclaimers
   - Quality metrics displayed

---

## 🚀 Next Steps

1. ✅ Test locally with test-backend
2. ✅ Verify clean responses
3. ✅ Deploy to production (Railway, etc.)
4. ✅ Update Electron app with production URL

---

**Ready to test!** Start with `npm start` in the test-backend directory.











