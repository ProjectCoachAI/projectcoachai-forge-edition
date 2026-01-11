# Quick Test Guide

## 🚀 5-Minute Test Setup

### Step 1: Install & Start Backend

```bash
cd test-backend
npm install
npm start
```

You should see:
```
🚀 Test Backend Server Running!
📍 URL: http://localhost:3001
```

### Step 2: Test ResponseExtractor (No API Keys Needed)

In a new terminal:

```bash
cd test-backend
node test.js
```

This will show:
- Before/after cleaning examples
- Quality scores
- What gets removed

### Step 3: Test API Endpoint

```bash
# Test cleaning endpoint (no API keys needed)
curl -X POST http://localhost:3001/api/test/clean \
  -H "Content-Type: application/json" \
  -d '{
    "aiProvider": "claude",
    "rawResponse": "Millionsire and billionaire population percentages\nCapital of Japan\nWhat percentage of the population are millionaires and billionaires? I'll search for current data.\n\nBased on the latest data:\n• Millionaires: Approximately 1.1% of global adult population\n• Billionaires: About 0.0001% of global population"
  }'
```

Expected: Clean response without chat history

### Step 4: Connect Electron App

```bash
# In Electron app directory
export API_PROXY_URL=http://localhost:3001

# Or edit main.js line ~2086:
# const apiProxyURL = 'http://localhost:3001';
```

Then:
1. Start Electron app
2. Create workspace
3. Send prompt
4. Click "Compare"
5. Should see clean responses!

---

## ✅ Success Checklist

- [ ] Backend server running on port 3001
- [ ] `node test.js` shows clean responses
- [ ] `/api/test/clean` endpoint works
- [ ] Electron app connects to backend
- [ ] Comparison view shows clean responses (no chat history)

---

## 🐛 Common Issues

**Port already in use?**
```bash
# Use different port
PORT=3002 npm start
# Then update API_PROXY_URL to http://localhost:3002
```

**Module not found?**
```bash
# Make sure ResponseExtractor.js is in parent directory
ls ../ResponseExtractor.js
```

**Electron not connecting?**
- Check backend is running: `curl http://localhost:3001/health`
- Check API_PROXY_URL is set correctly
- Check console logs in Electron app











