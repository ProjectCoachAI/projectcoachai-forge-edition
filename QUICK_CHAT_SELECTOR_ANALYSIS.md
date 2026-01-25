# Quick Chat Selector - Prominence Analysis

## Current Context

Based on my review of `quick-chat-selector.html` and the codebase:

- **Quick Chat Mode** = Single-pane chat with one AI at a time (vs Multi-Pane comparison mode)
- Currently, Quick Chat opens via a modal from toolshelf
- The selector needs to allow **frequent switching** between AIs (this is Quick Chat's core value prop)
- Users are in a focused chat interface, so the selector shouldn't be disruptive but must be discoverable

---

## Three Approaches Evaluated

### Approach 1: Compact Selector with Quick Switch Grid ⭐ **RECOMMENDED**
**Current State:** Shows current AI prominently with 8-icon grid below

**Assessment:** ✅ **This is the best starting point, but could be MORE prominent**

**Pros:**
- Clear current state (which AI is active)
- One-click switching
- Compact footprint
- All options visible

**Why it needs MORE prominence:**
- The grid icons (2rem/32px) might be too small for quick scanning
- The "Quick switch to:" label is subtle
- Current AI display could be larger/more attention-grabbing
- May get lost if user scrolls down in chat

**Enhancement Ideas:**
1. **Increase grid icon size** from 2rem → 3rem (48px) for better visibility
2. **Make current AI display larger** - maybe 120px logo instead of 80px
3. **Add subtle pulsing/glow** to active AI in grid for better visual hierarchy
4. **Sticky positioning** - Keep selector visible when scrolling (if chat is long)
5. **Add keyboard shortcuts hint** - "Press 1-8 to switch" displayed

---

### Approach 2: Prominent Dropdown with Rich Info
**Current State:** Large button with detailed AI info, expands to dropdown

**Assessment:** ⚠️ **Too heavy for frequent switching**

**Pros:**
- Very prominent and hard to miss
- Rich metadata (descriptions, tags)
- Search functionality

**Cons:**
- Requires click to see options (extra step = friction)
- Takes significant vertical space (200px+)
- Overkill for power users who switch often
- Not ideal for quick switching workflow

**When to use:** Good for onboarding new users, but not optimal for daily use

---

### Approach 3: Horizontal Tab Bar
**Current State:** Browser-style tabs, always visible

**Assessment:** ✅ **EXCELLENT for prominence, but has trade-offs**

**Pros:**
- **Always visible** - never hidden
- Familiar pattern (everyone knows browser tabs)
- Shows all options at once
- Clear "Active" indicator
- Horizontal scroll handles many AIs

**Cons:**
- Takes horizontal space (requires scrolling if 15+ AIs)
- Less space per AI (no descriptions)
- Could feel cluttered

**Verdict:** If prominence is the goal, this might actually be **BEST**. Consider a hybrid:
- **Top of Quick Chat pane**: Horizontal tab bar (always visible)
- **Below tabs**: The chat interface
- **Tabs auto-scroll** to show active AI
- **Keyboard navigation**: Arrow keys to switch

---

## My Recommendation: Hybrid Approach

### **Primary: Enhanced Approach 1 + Sticky Positioning**

1. **Sticky selector at top of Quick Chat pane**
   - Always visible, even when scrolling chat
   - Takes ~150px vertical space (acceptable trade-off)

2. **Larger, more prominent current AI display**
   - Increase from 80px → 120px logo
   - Add subtle animation/pulse when switching
   - Make it more "clickable" looking

3. **Larger quick-switch grid**
   - Icons: 2rem → 3rem (48px)
   - Increase spacing between icons
   - Add subtle hover effects

4. **Keyboard shortcuts prominently displayed**
   - "Press 1-8 to switch" hint text
   - Visual number badges on grid items

### **Alternative: Tab Bar (Approach 3) if prominence is critical**

If users are **missing the selector entirely**, go with Approach 3:
- Horizontal tab bar at top of Quick Chat pane
- Always visible, zero clicks to discover
- More "in your face" - can't miss it
- Trade horizontal space for vertical space

---

## Questions to Consider:

1. **What's the current problem?**
   - Are users not finding the selector at all?
   - Or finding it but it's not prominent enough?
   - Are they accidentally clicking away from Quick Chat mode?

2. **How often do users switch AIs in Quick Chat?**
   - If they switch 5-10 times per session → Tab bar (Approach 3)
   - If they switch 1-3 times → Enhanced Approach 1 is fine

3. **What's the visual priority?**
   - Chat content vs Selector prominence
   - Can you afford 150px at top for always-visible selector?

4. **Mobile/tablet usage?**
   - Tab bar scrolls horizontally (works well)
   - Grid approach needs responsive design

---

## Implementation Priority:

1. **Quick Win**: Make Approach 1's current AI display larger (80px → 120px)
2. **Medium Impact**: Make grid icons larger (2rem → 3rem)
3. **High Impact**: Add sticky positioning to keep selector visible
4. **Nuclear Option**: Switch to Approach 3 (tab bar) if prominence is critical

---

## Visual Hierarchy Test:

Ask yourself: **If I look at the Quick Chat interface for 2 seconds, do I immediately see how to switch AIs?**

- **Approach 1 (current)**: Maybe - depends on scrolling position
- **Approach 1 (enhanced)**: Yes - if sticky + larger
- **Approach 2**: Yes - but requires interaction
- **Approach 3**: **YES - impossible to miss**

---

## Final Verdict:

**Go with Enhanced Approach 1** (larger, sticky) if the current design just needs more prominence.

**Switch to Approach 3** (tab bar) if users are completely missing the selector or if Quick Chat switching is a primary feature you want to highlight.

The tab bar approach is actually more prominent and might be the better choice if "quick switching" is a core selling point of Quick Chat mode.
