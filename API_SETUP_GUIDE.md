# API Setup Guide - ProjectCoachAI Comparison Feature

## 🎯 Why Use API?

The API approach is the **ONLY RECOMMENDED** method for the comparison feature because:

⚠️ **Extraction is unreliable** - DOM scraping is fragile, breaks with site changes, and often misses content or includes chat history.

✅ **API guarantees quality** - Clean, structured responses directly from AI providers.

✅ **Clean Responses**: Gets structured, clean text directly from AI APIs  
✅ **Reliable**: No DOM extraction, no UI elements, no JavaScript code  
✅ **Fast**: Parallel API calls, instant results  
✅ **Modern**: Industry-standard approach  
✅ **Scalable**: Works with any number of AIs  

---

## 🚀 Quick Setup

### Option 1: Environment Variable (Recommended)

```bash
export API_PROXY_URL=https://your-backend-api.com
npm start
```

### Option 2: In Code

Edit `main.js` line ~2086:
```javascript
const apiProxyURL = 'https://your-backend-api.com';
```

---

## 📋 Backend API Requirements

Your backend API should provide:

**Endpoint**: `POST /api/ai/query`

**Request:**
```json
{
  "aiProvider": "chatgpt",
  "prompt": "User's question here",
  "userId": "forge-edition"
}
```

**Response:**
```json
{
  "provider": "chatgpt",
  "content": "AI response text here",
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 50
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

---

## 🔧 Current Status

### How It Works Now:

1. **User sends prompt** → Stored in `workspaceState.lastPrompt`
2. **User clicks "Compare"** → App checks:
   - ✅ Prompt exists?
   - ✅ Prompt is recent (<5 minutes)?
   - ✅ API client available?
3. **If all yes** → Calls your backend API
4. **API returns responses** → Auto-populates comparison view
5. **If API fails** → Falls back to extraction (manual paste as last resort)

---

## 🐛 Troubleshooting

### Issue: "API client not initialized"

**Solution**: Set `API_PROXY_URL` environment variable:
```bash
export API_PROXY_URL=https://your-backend-api.com
```

### Issue: "SSL certificate error"

**Current**: Code allows invalid certificates for testing (`rejectUnauthorized: false`)

**Production**: Fix SSL certificate on your backend server

### Issue: "API request timeout"

**Solution**: 
- Check backend is running
- Check network connectivity
- Increase timeout in code (currently 10 seconds)

### Issue: "No API response for [AI]"

**Possible causes**:
- Backend doesn't support that AI provider
- API key not configured for that provider
- Provider API is down

**Solution**: Check backend logs and API key configuration

---

## 📊 API vs Extraction

| Feature | API Approach | Extraction Approach |
|---------|-------------|---------------------|
| **Reliability** | ✅ 100% | ⚠️ Variable (depends on site structure) |
| **Content Quality** | ✅ Clean, structured | ⚠️ May include UI elements |
| **Speed** | ✅ Fast (parallel calls) | ⚠️ Slower (DOM parsing) |
| **Setup** | ⚠️ Requires backend | ✅ No setup needed |
| **Maintenance** | ✅ Stable | ⚠️ Breaks when sites change |

**Recommendation**: Use API approach when possible, extraction as fallback.

---

## 🎯 Next Steps

1. **Set up backend API** (see `RAILWAY_SETUP.md` for Railway deployment)
2. **Configure API_PROXY_URL** environment variable
3. **Test API connection** (check console logs)
4. **Verify responses** (should be clean, no UI elements)

---

## ✅ Success Indicators

When API is working, you'll see:
```
✅ API Proxy Client initialized: https://your-api.com
🌐 [IPC] Using API to get responses for comparison (PRIMARY approach)
📡 [IPC] Calling API for 3 providers: chatgpt, claude, gemini
✅ [IPC] Got API response for ChatGPT: 1234 chars
✅ [IPC] Got API response for Claude: 1567 chars
✅ [IPC] Got API response for Gemini: 1456 chars
📊 [IPC] API result: 3/3 responses received (100% success)
```

---

**Last Updated**: After implementing robust API client
**Status**: Ready for backend integration

