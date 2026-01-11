# ⚡ Quick Test Checklist

## 🚀 Start Testing

```bash
cd "/Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1"
npm start
```

---

## ✅ Test Steps (5 minutes)

### Step 1: Launch & Setup
- [ ] App starts without errors
- [ ] Main window appears
- [ ] Check console for: `✅ API Proxy Client initialized` (or warning if not set)

### Step 2: Select AIs
- [ ] Click to select 2-4 AIs (e.g., ChatGPT, Claude, Gemini)
- [ ] AIs appear in panes

### Step 3: Send Prompt
- [ ] Click "Share Prompt" button
- [ ] Type test prompt: "What is the capital of Switzerland?"
- [ ] Press Enter or click Send
- [ ] Check console for: `💾 [IPC] Stored prompt for comparison`

### Step 4: Wait for Responses
- [ ] Wait 10-30 seconds for AI responses
- [ ] Responses appear in BrowserView panes

### Step 5: Compare
- [ ] Click "Compare" button
- [ ] **Observe what happens:**
  - [ ] Option A: Responses auto-fill → ✅ Extraction/API worked!
  - [ ] Option B: Paste instructions shown → ⚠️ Extraction failed (expected)

### Step 6: Check Console
- [ ] Look for one of these messages:
  - `🌐 [IPC] Using API to get responses...` (API mode)
  - `🔄 [IPC] API not available, attempting extraction...` (Extraction mode)
  - `📊 [IPC] Extraction result: X/Y panes...` (Extraction result)

---

## 📊 Expected Outcomes

### ✅ Best Case (Extraction Works)
- Responses auto-fill in comparison view
- Differences auto-highlight
- Console: `✅ Successfully extracted...`
- **Result**: Keep extraction as bonus feature

### ⚠️ Expected Case (Extraction Fails)
- Paste instructions shown
- Console: `⚠️ Extraction failed...`
- **Result**: Use API approach (already implemented)

### 🎯 API Case (If Backend Ready)
- Responses auto-fill from API
- Console: `✅ Got API response for...`
- **Result**: Modern solution working!

---

## 🐛 If Something Goes Wrong

1. **App won't start**: Check `npm install` was run
2. **No console logs**: Check DevTools are open (View → Toggle Developer Tools)
3. **Compare button does nothing**: Check console for errors
4. **Responses don't appear**: Check BrowserView panes are visible

---

## 📝 Report Back

After testing, tell me:
1. ✅ Did extraction work? (auto-filled responses)
2. ⚠️ Did extraction fail? (showed paste instructions)
3. 📊 What console logs did you see?
4. 🎯 Any errors or issues?

Based on your results, we'll:
- ✅ If extraction works → Keep it, optimize it
- ❌ If extraction fails → Remove it, use API approach
- 🎯 Either way → Solution is ready!

---

## 🎯 Ready? Go!

```bash
npm start
```

Then follow the steps above. Good luck! 🚀











