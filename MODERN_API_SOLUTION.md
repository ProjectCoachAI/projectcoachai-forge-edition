# Modern API-Based Solution - Designer's Recommended Approach

## 🎯 The Problem with Current Approaches

1. **BrowserView Extraction**: Unreliable, breaks when sites change
2. **Manual Copy-Paste**: 80s/90s approach, not modern UX
3. **DOM Scraping**: Fragile, violates ToS concerns

## ✅ The Modern Solution: Backend API Proxy

**Your organization handles the backend API** - this is the perfect setup for a modern, seamless experience.

### How It Works

```
User Types Prompt → Your App → Your Backend API → AI APIs → Responses → Comparison View
```

**One flow, zero manual steps, always works.**

---

## 🏗️ Architecture

### Current Flow (BrowserView-based)
```
1. User clicks "Share Prompt"
2. App injects text into BrowserViews
3. User waits for responses in panes
4. User clicks "Compare"
5. App tries to extract from BrowserViews (unreliable)
6. Falls back to manual paste (80s approach)
```

### Modern Flow (API-based)
```
1. User types prompt in central input
2. User clicks "Send to All AIs"
3. App calls YOUR backend API with prompt + selected AIs
4. Backend calls all AI APIs in parallel (your org's keys)
5. Responses stream back to app
6. App auto-populates comparison view
7. Differences auto-highlight
8. Done! (10 seconds, zero friction)
```

---

## 🔧 Implementation Plan

### Option 1: Hybrid Approach (Recommended for Launch)

**Keep BrowserViews for display, use API for comparison data**

1. **Share Prompt**: Keep current BrowserView injection (works fine)
2. **Compare Button**: Call backend API to get responses, populate comparison view
3. **Best of both**: Users see responses in workspace, comparison gets clean API data

### Option 2: Full API Mode (Future Enhancement)

**Replace BrowserViews entirely with API responses**

1. **Share Prompt**: Calls backend API, displays responses in panes
2. **Compare**: Uses same API responses, instant comparison
3. **Cleaner**: No BrowserViews, no extraction, pure API data

---

## 💡 Recommended: Option 1 (Hybrid)

### Why This Works Best

✅ **Keeps what works**: BrowserView display (users like seeing real AI interfaces)
✅ **Modern comparison**: API data is clean and reliable
✅ **No breaking changes**: Works with existing code
✅ **Fast to implement**: Just add API call to Compare button

### Implementation

**When user clicks "Compare":**

1. Get the prompt they used (from workspace state or prompt bar)
2. Get selected AIs (from active panes)
3. Call your backend API: `POST /api/ai/batch`
4. Backend returns clean responses
5. Populate comparison view with API responses
6. Auto-highlight differences

**No extraction needed. No manual paste. Just clean API data.**

---

## 📝 Code Changes Needed

### 1. Add API Call to Compare Handler

**File: `main.js`** - Update `open-visual-comparison`:

```javascript
ipcMain.handle('open-visual-comparison', async (event, options) => {
    try {
        // Get the prompt from workspace (store it when user sends)
        const prompt = workspaceState.lastPrompt || options.prompt || '';
        
        // Get selected AIs from active panes
        const selectedAIs = activePanes.map(p => p.tool.id); // e.g., ['chatgpt', 'claude', 'gemini']
        
        // Call YOUR backend API
        const apiClient = new AIProxyClient(process.env.API_PROXY_URL || 'https://api.projectcoachai.com');
        const responses = await apiClient.queryMultiple(selectedAIs, prompt);
        
        // Map responses to pane format
        const paneResponses = activePanes.map((pane, index) => {
            const apiResponse = responses.find(r => r.provider === pane.tool.id);
            return {
                tool: pane.tool.name,
                icon: pane.tool.icon,
                index: pane.index,
                response: apiResponse?.content || '',
                hasResponse: !!apiResponse?.content
            };
        });
        
        // Open comparison window with API responses
        const comparisonWindow = new BrowserWindow({...});
        // ... rest of window setup ...
        
        comparisonWindow.webContents.send('setup-comparison', {
            panes: paneResponses,
            mode: 'api', // Flag to indicate API data
            autoPopulated: true,
            timestamp: new Date().toISOString()
        });
        
        return { success: true, responsesCount: paneResponses.filter(p => p.hasResponse).length };
    } catch (error) {
        console.error('Error:', error);
        return { success: false, error: error.message };
    }
});
```

### 2. Store Prompt in Workspace State

**File: `main.js`** - Add state tracking:

```javascript
// Store workspace state
let workspaceState = {
    lastPrompt: null,
    lastPromptTimestamp: null
};

// Update when prompt is sent
ipcMain.handle('send-prompt-to-all', async (event, prompt) => {
    // Store prompt for later use in comparison
    workspaceState.lastPrompt = prompt;
    workspaceState.lastPromptTimestamp = Date.now();
    
    // ... existing BrowserView injection code ...
});
```

### 3. Add Environment Variable for API URL

**File: `.env` or config**:
```
API_PROXY_URL=https://your-backend-api.com
```

---

## 🎯 User Experience

### Before (Current)
```
1. Share Prompt → Wait for responses
2. Click Compare → Try extraction (may fail)
3. Manual paste (if extraction fails)
4. Click Highlight Diffs
Time: 2-5 minutes, friction: High
```

### After (Modern API)
```
1. Share Prompt → Wait for responses (BrowserViews)
2. Click Compare → Instant comparison (API data)
Time: 10 seconds, friction: Zero
```

---

## ✅ Benefits

1. **Reliable**: API responses are structured, always work
2. **Fast**: Parallel API calls, instant results
3. **Modern**: No DOM scraping, no manual paste
4. **Clean**: API data is clean text, perfect for comparison
5. **Scalable**: Works with any number of AIs
6. **Compliant**: Your org handles API keys, ToS compliance

---

## 🚀 Implementation Priority

**Phase 1 (Launch-Ready)**:
- Add API call to Compare button
- Store prompt in workspace state
- Use API responses for comparison view
- Keep BrowserViews for display (hybrid)

**Phase 2 (Future)**:
- Optional: Replace BrowserViews with API-only mode
- Add streaming responses
- Add response caching

---

## 💬 Next Steps

1. **Test extraction approach** (as you mentioned)
2. **If extraction doesn't work**: Implement API-based comparison
3. **Keep BrowserViews** for the visual workspace experience
4. **Use API** for reliable comparison data

This gives you the best of both worlds: visual workspace + reliable comparison.











