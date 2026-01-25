# Feedback, Profile & Usage Tracking Implementation Plan

## Overview
This document outlines the implementation of:
1. **Feedback System** - Store and manage user feedback
2. **User Profiles** - User profile page with settings and stats
3. **Usage Tracking** - System-wide and per-user usage statistics
4. **Admin Portal Enhancements** - View feedback, usage stats, and user data

## Implementation Status

### ✅ Completed
- [x] Feedback storage to `feedback.json` file
- [x] IPC handlers for feedback management (`admin-get-all-feedback`, `admin-update-feedback`)
- [x] IPC handlers added to `preload.js`

### 🔄 In Progress
- [ ] Usage tracking system (track prompts, AI tools, sessions)
- [ ] User profile page (`profile.html`)
- [ ] Profile IPC handlers (`get-user-profile`, `update-user-profile`, `get-user-usage-stats`)
- [ ] Admin portal enhancements (feedback view, usage dashboard)

## Architecture

### Data Storage

#### feedback.json
```json
[
  {
    "id": "hex-id",
    "message": "User feedback text",
    "userId": "user-id",
    "userName": "User Name",
    "userEmail": "user@email.com",
    "source": "electron",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "read": false,
    "archived": false
  }
]
```

#### usage.json
```json
{
  "system": {
    "totalPrompts": 0,
    "totalSessions": 0,
    "totalToolsUsed": {},
    "firstUsage": "2024-01-01T00:00:00.000Z",
    "lastUsage": "2024-01-01T00:00:00.000Z"
  },
  "users": {
    "user-id": {
      "userId": "user-id",
      "userEmail": "user@email.com",
      "prompts": [],
      "sessions": [],
      "toolsUsed": {},
      "firstUsage": "2024-01-01T00:00:00.000Z",
      "lastUsage": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### IPC Handlers

#### Feedback
- `submit-feedback` - Save feedback (✅ implemented)
- `admin-get-all-feedback` - Get all feedback entries (✅ implemented)
- `admin-update-feedback` - Mark as read/archive (✅ implemented)

#### User Profile
- `get-user-profile` - Get current user's profile data
- `update-user-profile` - Update user profile (name, preferences)
- `get-user-usage-stats` - Get current user's usage statistics

#### Usage Tracking
- `track-prompt` - Track when a prompt is sent (called from sendPromptToPanes)
- `track-session-start` - Track when app starts (called from app.whenReady)
- `get-system-usage-stats` - Get system-wide usage statistics

### UI Components

#### User Profile Page (`profile.html`)
- Display: Name, Email, User ID, Subscription Tier
- Usage Stats: Prompts sent, Tools used, Sessions, First/Last usage
- Settings: Update name, preferences
- Access: Profile icon/button in header

#### Admin Portal Enhancements
- Feedback Management Tab:
  - List all feedback entries
  - Filter by read/unread, archived
  - Mark as read/archive
  - Export feedback
- Usage Dashboard Tab:
  - System-wide stats (total prompts, sessions, tools used)
  - Per-user usage stats
  - Charts/graphs (optional)

## Next Steps

1. Implement usage tracking in `sendPromptToPanes()`
2. Create `profile.html` with user profile UI
3. Add profile IPC handlers in `main.js`
4. Update admin portal with feedback and usage sections
5. Add profile access button in workspace header
6. Test all features end-to-end

## Files to Modify/Create

### Modify
- `main.js` - Add usage tracking, profile IPC handlers
- `preload.js` - Add profile IPC methods
- `admin-portal.html` - Add feedback and usage sections

### Create
- `profile.html` - User profile page
- `usage-tracker.js` - Usage tracking utilities (optional)


