# Open Items — ProjectCoachAI Forge Edition
**Date:** 02 May 2026  
**Status key:** 🔴 Blocking | 🟡 Important | 🟢 Done | ⚪ Deferred

---

## 1. Excel — Questions Section Cognitive Overload
**Status:** 🟢 Fixed today  
**What was done:**
- Context section now collapsed by default (Show ▼ instead of Hide ▲)
- Analysis type buttons + templates + save/load merged into one compact row
- Removed redundant "What type of analysis do you need?" label
- Placeholder text simplified
- Enhance & Write Back removed from UI
- Second file upload hidden
- Upload zone reduced from 48px → 20px padding

---

## 2. Excel — "Why Excel" Landing Section
**Status:** 🟡 Needs update  
**Issue:** Currently references formulas, chart suggestions, and write-back — all of which are removed from the launch version.  
**Action needed:** Update hero text and feature list to reflect:
- Upload CSV/Excel → instant AI analysis
- 5 analysis modes (Best Answer, Executive Summary, Detailed, Anomalies, Action Items)  
- 4 industry templates (Financial, Carbon, HR, Sales, Audit)
- Ask plain-English questions about your data
- Save analysis history

---

## 3. Profile — Notifications
**Status:** 🟡 Needs testing  
**Action needed:** Test end-to-end:
- Do notifications appear when expected?
- Does marking as read work?
- Are there any garbled characters in notification text?

---

## 4. Profile — Account Settings
**Status:** 🟡 Needs testing  
**Action needed:** Test:
- Name/email update
- Password change
- Delete account flow (confirm it asks for confirmation)

---

## 5. Profile — Day Streak
**Status:** 🔴 Not working  
**Issue:** Streak shows 0, no activity tracking happening.  
**Root cause:** Backend needs to log daily login/activity events per user.  
**Action needed:**
- Add `last_active_date` and `streak_count` columns to users table
- Update on every authenticated API call (compare, split, synthesize)
- Profile page reads and displays live value

---

## 6. Profile — Excel Analyses
**Status:** 🟡 Needs monitoring  
**Issue:** Unclear if `excel_analyses` table is receiving data after analysis runs.  
**Action needed:**
- Run an Excel analysis and check Railway logs for `[Excel] save` entries
- Query DB: `SELECT COUNT(*) FROM excel_analyses WHERE user_email='daniel.jones@xencoreglobal.com'`
- If 0 rows, the `/api/excel/save` call is failing silently

---

## 7. Browser Extension Submissions
**Status:** 🔴 Blocking launch  

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome Web Store | Draft created | Privacy tab needs completion, screenshots needed |
| Microsoft Edge | Testing only | Same package as Chrome, submit after Chrome approved |
| Opera | Not started | Same package |
| Firefox | Not started | Minor MV3 tweaks needed |
| Safari | Not started | Requires Xcode + Apple Developer account ($99/yr) |

**Priority:** Chrome first. Edge and Opera same week. Firefox next sprint.

---

## 8. Perspectives — Card Layout (Responsive Grid)
**Status:** 🟡 Important  
**Issue:** Cards don't auto-adjust to available space. 2 cards should fill 2 columns, 3 should fill 3, max 4 per row like Forge tab.  
**Action needed:** Update the grid CSS in `home.js` / `index.html`:
```css
.responses-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
```
This makes 1 card = full width, 2 = two columns, 3 = three, 4 = four, then wraps.

---

## 9. Info/Help Popup Buttons — Garbled Characters
**Status:** 🟡 Important  
**Issue:** Buttons show strange prefix characters (e.g. `Ã°Å¸â€™Â³` instead of emoji).  
**Root cause:** UTF-8 encoding issue — emoji stored as HTML entities or wrong charset in server responses.  
**Affected files:** `server.js` logs show garbled emoji in route load messages. Same issue may affect help tooltips in UI.  
**Action needed:**
- Ensure all HTML files have `<meta charset="UTF-8">` as first head element
- Replace garbled emoji strings with direct Unicode or clean HTML entities
- Check `server.js` console.log strings — replace garbled chars with plain text

---

## 10. Security — Remaining Items
**Status:** 🟡 Post-launch  

| Item | Priority | Notes |
|------|----------|-------|
| Tighten rate limits on `/api/compare` | High | 30 req/min auth, 10 unauth |
| Cloudflare WAF on projectcoachai.com | High | Blocks SQLi, XSS, bots |
| Per-user spend caps | Medium | Track API cost, flag >100 req/day |
| Token relay for Forge Perspective | Medium | Store token on login, read in panel |

---

## 11. Forge Perspective — Grok Dock
**Status:** 🟡 Low priority  
**Issue:** Forge dock not showing on grok.com  
**Fix needed:** Check hostname detection in `provider-content.js` for grok.com

---

## 12. Trust Layer — Full Dynamic Version
**Status:** ⚪ Deferred  
**Issue:** "View in Claude →" deep-link doesn't point to exact conversation  
**Fix:** Store `sourceMetadata` in `chrome.storage.local` keyed by provider, read on render

---

## 13. Repo Cleanup
**Status:** 🟡 Before launch  
**Issue:** ~50 untracked Python fix scripts in repo root (`fix.py`, `fix2.py` ... `fix11.py`, etc.)  
**Action needed:**
```powershell
cd C:\Users\DanielJones\downloads\projectcoachai-forge-edition-v1
echo "*.py" >> .gitignore
echo "*.patch" >> .gitignore
echo "*.diff" >> .gitignore
git add .gitignore
git commit -m "chore: gitignore py/patch/diff files"
```

---

## Launch Readiness Summary

| Area | Status |
|------|--------|
| Perspectives (7 AIs, fast, trust strip) | ✅ Ready |
| Forge Perspective panel | ✅ Ready |
| Quick Answer | ✅ Ready |
| Synthesis (7 modes) | ✅ Ready |
| Excel (5 modes, simplified) | 🟡 Test needed |
| Auth guards on all pages | ✅ Done |
| AI endpoints secured | ✅ Done |
| Browser extension (Edge) | ✅ Working |
| Chrome Web Store submission | 🔴 Not submitted |
| Profile (streak, notifications) | 🟡 Needs testing |
| Responsive card grid | 🟡 CSS fix needed |
| Info button encoding | 🟡 Fix needed |
