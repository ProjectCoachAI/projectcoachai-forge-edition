# Universal Feedback Design

## Overview

One feedback **link** → one **pop-up** → **auto-attach** user id/name → **POST to API** → **log in DB** → **thank-you** in the UI. The same flow can be reused in Electron (Quick Chat, Multi-Pane), on the website, and in other surfaces.

---

## 1. Link

- **Placement:** Anywhere you want to ask for feedback (e.g. Quick Chat tab bar, header, footer, Multi-Pane).
- **Copy:** e.g. *"AI is emotional. Help shape Forge—what would make your AI experience better?"*
- **Action:** Click opens the feedback pop-up. Same link component can be used in Electron and on the web.

---

## 2. Pop-up

- **Modal:** Overlay + centred card.
- **Fields:** 
  - Textarea: user's message (required).
  - Optional: none for v1; you can add rating/category later.
- **Actions:** Cancel (close), Submit (send).
- **Thank-you:** After a successful submit, show *"Thank you. We'll use your feedback to improve Forge."* and a "Got it" button to close. No need to wait for a backend "thank-you";
  the UI thank-you is enough.

---

## 3. Auto-attach user id and name

- **Electron:**  
  - Main process `submit-feedback` handler gets `message` and `source` from the renderer.  
  - It uses existing `currentUser` (or `loadUser()`) to add `userId`, `userName`, `userEmail`.  
  - Payload: `{ message, userId, userName, userEmail, source, createdAt }`.  
  - If the user is not signed in, `userId`/`userName`/`userEmail` are `null`; still send the feedback.

- **Web:**  
  - If you have a session/JWT, the **backend** can add `userId`/`userName` from the authenticated session when it receives the POST.  
  - Or the frontend can call an auth API and attach them before sending. Same payload shape.

---

## 4. API and database

- **Endpoint:** `POST /api/feedback` (or `FEEDBACK_API_URL` in Electron).
- **Body:**  
  `{ message, userId, userName, userEmail, source, createdAt }`
- **Source:** Identifies where it came from, e.g.:
  - `electron-quickchat`
  - `electron-multipane`
  - `web-pricing`
  - `web-contact`
- **Backend:**
  - Validate `message` (required, max length, etc.).
  - Insert into a `feedback` table, e.g.:  
    `id, message, user_id, user_name, user_email, source, created_at`
  - Optionally send an email or Slack notification.
  - Return `200` or `201` so the client can show the thank-you.
- **Electron:**  
  - Set `FEEDBACK_API_URL` (e.g. `https://your-api.com/api/feedback`).  
  - If unset, the app still shows thank-you and logs the payload locally; you can add a real URL when the backend exists.

---

## 5. Thank-you

- Shown in the same pop-up after a successful submit.
- No need for a separate "thank-you" API; the UI message is enough.  
  If you later add email/Slack, that is independent of this flow.

---

## 6. Making it universal

| Piece        | Electron                     | Web                          |
|-------------|------------------------------|------------------------------|
| **Link**    | Same copy; `openFeedbackPopup()` | Same copy; `openFeedbackPopup()` or route to feedback page |
| **Pop-up**  | Same modal HTML/JS/CSS       | Same modal; can be a shared component or copy |
| **User**    | `currentUser` in main        | Session/JWT on backend or from frontend auth |
| **Submit**  | `submit-feedback` IPC → main → `FEEDBACK_API_URL` | `fetch(POST /api/feedback)` with same body shape |
| **Source**  | `electron-quickchat`, etc.    | `web-pricing`, `web-contact`, etc. |
| **Thank-you** | In modal after success      | Same                         |

Use the same **payload shape** and **source** values so the backend can log and analyse all feedback in one place.

---

## 7. Optional: reply to user

- Store `user_id` and `user_email` in the `feedback` row.
- A separate process (cron or queue) can:
  - Find "unreplied" rows.
  - Send an email: *"Thanks for your feedback. We've noted it and will use it to improve Forge."*
  - Mark as `replied_at`.
- This is independent of the submit/thank-you flow; the in-app thank-you stays as is.
