# Registration Enforcement - Debug Notes

## Issue
Registration enforcement not working - error appears but pricing page doesn't open automatically.

## Current Implementation

### 1. Registration Check (main.js)
- Location: `ipcMain.handle('create-workspace')`
- Checks: `!userSubscription.registered || userSubscription.tier === 'unregistered'`
- Returns: `requiresRegistration: true, showPricing: true`

### 2. Error Handling (toolshelf.html)
- Location: `createBtn.addEventListener('click')`
- Should detect `result.requiresRegistration`
- Should show confirm dialog
- Should call `window.electronAPI.openPricing('registration_required')`

### 3. Registration Completion (main.js)
- Location: `ipcMain.handle('upgrade-subscription')` for free tier
- Sets: `userSubscription.registered = true`
- Should trigger UI update

## Potential Issues to Check

1. **Registration Check Logic**
   - Is `userSubscription.registered` being checked correctly?
   - Is default state `unregistered` being set?

2. **Error Response Handling**
   - Is `result.requiresRegistration` being detected?
   - Is the confirm dialog showing?
   - Is `openPricing` being called?

3. **State Updates**
   - After registration, does `updateSelectionBar()` refresh?
   - Does `getSubscription()` return updated `registered: true`?

4. **Pricing Page Integration**
   - Does pricing page open when called?
   - Does selecting FREE plan complete registration?

## Quick Test Steps

1. Clear subscription.json (or delete file)
2. Select 2 tools
3. Click "Create Workspace"
4. Should see registration prompt
5. Should open pricing page
6. Select Starter (FREE)
7. Should mark as registered
8. Create button should enable
9. Workspace creation should work

## Files to Review

- `main.js` - Registration check and completion
- `toolshelf.html` - Error handling and UI updates
- `pricing.html` - Registration flow
- `preload.js` - API exposure













