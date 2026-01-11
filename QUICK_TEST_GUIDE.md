# Quick Testing Guide

## 🚀 Quick Start

### 1. Set Up API Keys
```bash
cd test-backend
cp .env.example .env  # or create new .env file
# Edit .env and add your API keys
```

### 2. Start Backend
```bash
npm start
# Server runs on http://localhost:3001
```

### 3. Test Endpoints

#### Health Check
```bash
curl http://localhost:3001/health
```

#### Single AI Query
```bash
curl -X POST http://localhost:3001/api/ai/query \
  -H "Content-Type: application/json" \
  -d '{
    "aiName": "openai",
    "prompt": "What is artificial intelligence?",
    "options": {}
  }'
```

#### Batch AI Queries
```bash
curl -X POST http://localhost:3001/api/ai/batch \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain quantum computing",
    "aiNames": ["openai", "claude", "gemini"]
  }'
```

#### Generate Single Synthesis Template
```bash
curl -X POST http://localhost:3001/api/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "comparisonData": {
      "panes": [
        {"tool": "OpenAI", "response": "Response 1"},
        {"tool": "Claude", "response": "Response 2"}
      ]
    },
    "mode": "comprehensive"
  }'
```

#### Generate All 7 Templates
```bash
curl -X POST http://localhost:3001/api/synthesize/batch \
  -H "Content-Type: application/json" \
  -d '{
    "comparisonData": {
      "panes": [
        {"tool": "OpenAI", "response": "Response 1"},
        {"tool": "Claude", "response": "Response 2"}
      ]
    }
  }'
```

#### Test Response Cleaning (No API Keys Needed)
```bash
curl -X POST http://localhost:3001/api/test/clean \
  -H "Content-Type: application/json" \
  -d '{
    "aiProvider": "claude",
    "rawResponse": "Your raw AI response with metadata here"
  }'
```

---

## 🧪 Testing in Electron App

### Test Message Sharing
1. Start backend: `cd test-backend && npm start`
2. Start Electron app
3. Open workspace
4. Enter prompt in "Share Prompt" bar
5. Click "Send to All"
6. Verify responses appear in panes

### Test Comparison
1. After sending prompt to multiple panes
2. Click "⚖️ Compare" button
3. Verify API responses auto-load in comparison view
4. Check responses are clean (no metadata)
5. Test manual paste fallback (disconnect backend)

### Test Synthesis
1. Open comparison view with responses
2. Click "Get AI Synthesis" button
3. Click "Generate 7 Analysis Templates"
4. Verify templates are generated (empty frameworks)
5. Check compliance notices are displayed

---

## ✅ Success Indicators

### Backend Working
- ✅ Server starts without errors
- ✅ Health endpoint returns `{"status":"ok"}`
- ✅ API keys show as ✅ in console
- ✅ No CORS errors in browser console

### Message Sharing Working
- ✅ Responses appear in panes
- ✅ Responses are clean (no chat history)
- ✅ Images preserved if present
- ✅ Error handling works (shows manual mode if API fails)

### Comparison Working
- ✅ Auto-loads responses from API
- ✅ Shows "X responses loaded" message
- ✅ Clean content (no disclaimers/metadata)
- ✅ Manual paste still works as fallback

### Synthesis Working
- ✅ Templates generate successfully
- ✅ Templates are empty frameworks (not pre-filled)
- ✅ All 7 modes work
- ✅ Compliance notices visible
- ✅ Export/copy functions work

---

## 🐛 Common Issues

### "API key not found"
- Check `.env` file exists in `test-backend/`
- Verify key names match exactly (e.g., `OPENAI_API_KEY`)
- No extra spaces or quotes around keys

### "CORS error"
- Backend should allow all origins (already configured)
- Check backend is running on correct port (3001)

### "Connection refused"
- Verify backend is running: `curl http://localhost:3001/health`
- Check Electron app is pointing to `http://localhost:3001`

### "Rate limit exceeded"
- Wait for rate limit window to reset
- Check provider dashboard for usage limits
- Consider upgrading plan if needed

### "Response not clean"
- Test `/api/test/clean` endpoint directly
- Check `ResponseExtractor.js` is in parent directory
- Verify AI provider name matches exactly

---

## 📊 Expected Response Format

### Single AI Query Response
```json
{
  "success": true,
  "provider": "openai",
  "content": "Clean response text here...",
  "html": "<p>Clean HTML response...</p>",
  "hasImages": false,
  "timestamp": "2024-12-24T..."
}
```

### Batch Query Response
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "provider": "openai",
      "content": "...",
      "html": "...",
      "hasImages": false
    },
    {
      "success": true,
      "provider": "claude",
      "content": "...",
      "html": "...",
      "hasImages": false
    }
  ],
  "successRate": "2/2 (100%)"
}
```

### Synthesis Template Response
```json
{
  "success": true,
  "mode": "comprehensive",
  "template": "Empty template structure here...",
  "provider": "openai",
  "timestamp": "2024-12-24T...",
  "note": "This is an empty template framework. You must fill in all analysis content yourself."
}
```

---

## 🎯 Testing Checklist

- [ ] Backend starts successfully
- [ ] All API keys loaded (check console)
- [ ] Health endpoint works
- [ ] Single AI query works
- [ ] Batch AI query works
- [ ] Response cleaning works
- [ ] Synthesis template generation works
- [ ] Electron app connects to backend
- [ ] Message sharing works in app
- [ ] Comparison auto-load works
- [ ] Synthesis templates generate in app
- [ ] Error handling works (API failures)
- [ ] Manual fallback works

---

**Ready to test!** Start with the health check, then work through each endpoint systematically.











