# Existing Tracking Systems Summary

## Overview
The system has **three separate tracking systems** already implemented. Here's what exists and what's tracked:

## 1. Subscription Tracker (`subscription-tracker.js`)
**File:** `subscription-events.json` in userData directory

### Tracks:
- ✅ **Subscription Events:**
  - Upgrades (tier changes, revenue)
  - Downgrades
  - Cancellations
  - Enterprise contact requests
  
- ✅ **User Behavior:**
  - Limit hits (when users hit tier limits - conversion opportunity)
  - Pricing page views
  - Checkout starts
  
- ✅ **Revenue Tracking:**
  - Total revenue by tier
  - Revenue per upgrade event

### Usage:
```javascript
subscriptionTracker.trackEvent(type, data)
subscriptionTracker.trackLimitHit(currentTier, limitType, attemptedValue, maxAllowed)
subscriptionTracker.trackPricingViewed(source)
subscriptionTracker.trackUpgrade(fromTier, toTier, price, stripeSessionId)
subscriptionTracker.trackCheckoutStarted(tierId, price)
```

### Data Structure:
```json
{
  "events": [
    {
      "timestamp": "2024-01-01T00:00:00.000Z",
      "type": "upgrade",
      "data": { ... },
      "userId": "user-id",
      "sessionId": "session-id"
    }
  ],
  "summary": {
    "totalUpgrades": 0,
    "totalDowngrades": 0,
    "totalCancellations": 0,
    "revenue": 0,
    "byTier": { ... },
    "limitHits": { ... },
    "pricingViews": 0,
    "checkoutStarts": 0
  }
}
```

## 2. Synthesis Usage Tracker (`synthesis-usage-tracker.js`)
**File:** localStorage (browser context) - `synthesis_usage_YYYY-MM_tier`

### Tracks:
- ✅ **Synthesis Generation:**
  - Monthly usage per tier
  - Framework types used
  - Models used (Claude Haiku, Sonnet, etc.)
  - Timestamps per generation
  
- ✅ **Quota Management:**
  - Used vs limit
  - Days until reset
  - Can generate checks

### Usage:
```javascript
window.SynthesisUsageTracker.increment(userTier, frameworkType, modelUsed, metadata)
window.SynthesisUsageTracker.getUsage(userTier)
window.SynthesisUsageTracker.canGenerate(userTier)
window.SynthesisUsageTracker.getStatistics(userTier)
```

### Data Structure (per month/tier):
```json
{
  "used": 5,
  "limit": 30,
  "month": "2024-01",
  "resetDate": "2024-01-31T23:59:59.999Z",
  "entries": [
    {
      "timestamp": "2024-01-01T00:00:00.000Z",
      "frameworkType": "quality",
      "modelUsed": "claude-haiku",
      "metadata": { ... }
    }
  ]
}
```

## 3. General Usage Tracker (`main.js` - NEW)
**File:** `usage.json` in userData directory

### Tracks:
- ✅ **System-Wide Stats:**
  - Total prompts sent
  - Total sessions
  - Tools used (count per tool)
  - First/last usage timestamps
  
- ✅ **Per-User Stats:**
  - User prompts (last 1000)
  - User sessions (last 500)
  - Tools used per user
  - First/last usage per user

### Usage:
```javascript
trackPrompt(prompt, toolIds, userId, userEmail)
trackSessionStart(userId, userEmail)
```

### Data Structure:
```json
{
  "system": {
    "totalPrompts": 150,
    "totalSessions": 25,
    "totalToolsUsed": {
      "chatgpt": 45,
      "claude": 38,
      "gemini": 32
    },
    "firstUsage": "2024-01-01T00:00:00.000Z",
    "lastUsage": "2024-01-15T12:00:00.000Z"
  },
  "users": {
    "user-id": {
      "userId": "user-id",
      "userEmail": "user@email.com",
      "prompts": [
        {
          "prompt": "First 100 chars...",
          "tools": ["chatgpt", "claude"],
          "timestamp": "2024-01-01T00:00:00.000Z"
        }
      ],
      "sessions": [
        {
          "sessionId": "session-id",
          "startTime": "2024-01-01T00:00:00.000Z",
          "endTime": null
        }
      ],
      "toolsUsed": {
        "chatgpt": 15,
        "claude": 12
      },
      "firstUsage": "2024-01-01T00:00:00.000Z",
      "lastUsage": "2024-01-15T12:00:00.000Z"
    }
  }
}
```

## What's Missing / Needs Enhancement

### 1. **User Profile System**
- ❌ No user profile page/view
- ❌ No way to see user's own stats
- ❌ No profile settings/preferences storage

### 2. **Admin Portal Enhancements**
- ❌ Admin portal doesn't show feedback entries
- ❌ Admin portal doesn't show usage statistics
- ❌ No way to view per-user usage in admin portal

### 3. **Consolidation Opportunities**
- Consider consolidating tracking into single system
- Or create unified IPC handlers to query all tracking data
- Add export functionality for analytics

### 4. **Feedback Integration**
- ✅ Feedback is saved to `feedback.json` (recently added)
- ❌ Admin portal doesn't display feedback yet
- ❌ No feedback statistics

## Recommendations

1. **Keep separate systems** for now (they serve different purposes)
2. **Create unified admin dashboard** that queries all three systems
3. **Add user profile page** that shows:
   - User info (name, email, tier)
   - Usage stats (prompts, sessions, tools)
   - Synthesis usage
   - Subscription history
4. **Enhance admin portal** with:
   - Feedback management tab
   - Usage dashboard tab
   - User profile viewer tab

## Next Steps

1. ✅ Increase feedback popup size (DONE)
2. ✅ Feedback storage to `feedback.json` (DONE)
3. ✅ General usage tracking (`usage.json`) (DONE)
4. 🔄 Create user profile page
5. 🔄 Enhance admin portal with feedback & usage views
6. 🔄 Add IPC handlers for user profile data
7. 🔄 Add unified stats query for admin portal


