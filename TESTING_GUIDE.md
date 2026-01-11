# Complete Testing Guide - Server-Side ResponseExtractor

## 🎯 Goal

Test the server-side ResponseExtractor to ensure clean, quality responses without chat history, disclaimers, or metadata.

---

## 🚀 Quick Start (5 Minutes)

### Step 1: Test ResponseExtractor (No Setup Needed)

```bash
cd test-backend
node test.js
```

**Expected Output:**
- Shows before/after examples
- Demonstrates cleaning (removes chat history, disclaimers)
- Quality scores for each test case

### Step 2: Start Test Backend Server

```bash
cd test-backend
npm install
npm start
```

**Expected Output:**
```
🚀 Test Backend Server Running!
📍 URL: http://localhost:3001
```

### Step 3: Test API Endpoint

**Option A: Test Cleaning Only (No API Keys Needed)**

```bash
curl -X POST http://localhost:3001/api/test/clean \
  -H "Content-Type: application/json" \
  -d '{
    "aiProvider": "claude",
    "rawResponse": "Millionsire and billionaire population percentages\nCapital of Japan\nWhat percentage of the population are millionaires and billionaires? I'll search for current data.\n\nBased on the latest data:\n• Millionaires: Approximately 1.1% of global adult population"
  }'
```

**Expected:** Clean response without "Millionsire", "Capital of Japan", or "I'll search" text.

**Option B: Test with Real AI (API Keys Required)**

1. Create `.env` file in `test-backend/`:
```bash
OPENAI_API_KEY=sk-your-key
ANTHROPIC_API_KEY=sk-ant-your-key
GOOGLE_API_KEY=your-google-key
PERPLEXITY_API_KEY=pplx-your-key
```

2. Test single AI:
```bash
curl -X POST http://localhost:3001/api/ai/query \
  -H "Content-Type: application/json" \
  -d '{
    "aiProvider": "claude",
    "prompt": "What percentage of the population are millionaires and billionaires?",
    "userId": "test"
  }'
```

3. Test multiple AIs:
```bash
curl -X POST http://localhost:3001/api/ai/batch \
  -H "Content-Type: application/json" \
  -d '{
    "aiProviders": ["chatgpt", "claude", "gemini"],
    "prompt": "What percentage of the population are millionaires and billionaires?",
    "userId": "test"
  }'
```

### Step 4: Connect Electron App

The Electron app is already configured to use `http://localhost:3001` by default.

**Just start the Electron app:**
```bash
npm start
```

**Or if you need to set it explicitly:**
```bash
export API_PROXY_URL=http://localhost:3001
npm start
```

### Step 5: Test Full Flow in Electron

1. **Create Workspace**
   - Select 2-3 AI tools (ChatGPT, Claude, Gemini)
   - Click "Create Workspace"

2. **Send Prompt**
   - Type: "What percentage of the population are millionaires and billionaires?"
   - Click "Send to All"

3. **Wait for Responses**
   - AIs will respond in their panes
   - Responses are sent to backend for cleaning

4. **Open Comparison**
   - Click "Compare" button
   - Should see **CLEAN responses**:
     - ✅ No chat history (no "Capital of Japan", "Millionsire")
     - ✅ No disclaimers (no "Gemini can make mistakes...")
     - ✅ No search context (no "According to search results...")
     - ✅ Just the actual answer content

---

## ✅ Success Indicators

### Backend Logs Should Show:

```
📡 Calling claude with prompt: "What percentage..."
📥 Raw response length: 450 chars
✨ Clean response length: 180 chars
✅ claude: 450 → 180 chars (quality: 95)
```

### API Response Should Have:

```json
{
  "content": "Based on the latest data:\n• Millionaires: Approximately 1.1%...",
  "quality": { "score": 95, "isValid": true },
  "metadata": { "reduction": "60.0%" }
}
```

### Electron App Should Show:

- **Clean responses** in comparison view
- **No chat history** (no topic lists)
- **No disclaimers** (no "can make mistakes" text)
- **Quality metrics** calculated automatically
- **Images** if present in responses

---

## 🐛 Troubleshooting

### Issue: "Cannot find module '../ResponseExtractor'"

**Solution:**
```bash
# Make sure ResponseExtractor.js is in parent directory
ls ../ResponseExtractor.js

# If missing, it should be in the project root
# The test-backend expects: project-root/ResponseExtractor.js
```

### Issue: "fetch is not defined"

**Solution:**
```bash
cd test-backend
npm install node-fetch@2
```

### Issue: "Port 3001 already in use"

**Solution:**
```bash
# Use different port
PORT=3002 npm start

# Then update Electron app:
export API_PROXY_URL=http://localhost:3002
```

### Issue: "API key not set"

**Solution:**
- For testing ResponseExtractor: Use `/api/test/clean` (no keys needed)
- For real AI calls: Add keys to `.env` file

### Issue: Electron app not connecting

**Check:**
1. Backend is running: `curl http://localhost:3001/health`
2. API_PROXY_URL is set: Check console logs in Electron
3. Network: Check for CORS errors in browser console

---

## 📊 Test Cases

### Test Case 1: Claude Chat History

**Input:**
```
Millionsire and billionaire population percentages
Capital of Japan
What percentage of the population are millionaires and billionaires? I'll search for...
```

**Expected Output:**
```
Based on the latest data:
• Millionaires: Approximately 1.1% of global adult population
• Billionaires: About 0.0001% of global population
```

**What Gets Removed:**
- ❌ "Millionsire and billionaire population percentages"
- ❌ "Capital of Japan"
- ❌ "I'll search for..."

### Test Case 2: Gemini Disclaimer

**Input:**
```
Gemini can make mistakes, including about people, so double-check it. You privacy and Gemini Opens in a new window.

- **Tim: You can still edit this response...**

About 1.1% of adults globally are millionaires.
```

**Expected Output:**
```
About 1.1% of adults globally are millionaires.
```

**What Gets Removed:**
- ❌ "Gemini can make mistakes..."
- ❌ "You privacy and Gemini..."
- ❌ "You can still edit this response..."

### Test Case 3: Perplexity Search Context

**Input:**
```
According to search results, the percentage of millionaires globally is approximately 1.1% of adults.

Sources:
• Credit Suisse Global Wealth Report
[1] https://www.credit-suisse.com
```

**Expected Output:**
```
The percentage of millionaires globally is approximately 1.1% of adults.
```

**What Gets Removed:**
- ❌ "According to search results..."
- ❌ "Sources:" section
- ❌ Citation URLs

---

## 🎯 Next Steps After Testing

1. **Verify Clean Responses**
   - Check all test cases pass
   - Verify no chat history in responses
   - Confirm quality scores are good (>80)

2. **Deploy to Production**
   - Copy `ResponseExtractor.js` to production backend
   - Integrate into production API (see `BACKEND_API_GUIDE.md`)
   - Deploy to Railway/your server

3. **Update Electron App**
   - Change `API_PROXY_URL` to production URL
   - Test with production backend
   - Verify clean responses in production

---

## 📚 Files Reference

- `test-backend/server.js` - Test server
- `test-backend/test.js` - Standalone test script
- `test-backend/README.md` - Detailed guide
- `ResponseExtractor.js` - Cleaning engine
- `BACKEND_API_GUIDE.md` - Production integration

---

**Ready to test!** Start with `cd test-backend && node test.js`
