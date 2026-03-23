# Academic AI Assistant — Full Project Overview

> **Builder:** Avi Andargie | Industrial & Management Engineering, BGU Beer-Sheva
> **GitHub:** https://github.com/undergle/academic-ai-assistant
> **Version:** 0.4.0 | **Status:** Active development — Mission 5 complete
> **Stack:** Chrome Extension (MV3) · JavaScript ES6+ · Gemini AI · Google APIs · Moodle AJAX

---

## What Is This?

A **Chrome Extension that acts as a personal AI academic secretary** — built specifically for BGU students.

Instead of checking 4 separate tools every morning (Google Calendar, Gmail, Moodle, WhatsApp), the extension aggregates everything into one persistent side panel with an AI layer that understands your context and can answer questions, generate study guides, and send smart notifications.

**Core insight (from I&ME systems thinking):** The biggest inefficiency in a student's day isn't doing the work — it's the context-switching overhead of finding out *what* work to do. This extension eliminates that overhead.

---

## Architecture at a Glance

```
Chrome Extension (Side Panel)
│
├── sidepanel.html / sidepanel.js     ← UI layer (4 tabs: Today, Inbox, Moodle, Chat)
│
├── src/background.js                 ← Service Worker entry point
│   └── src/orchestrator.js          ← Central scheduler (chrome.alarms routing)
│
├── src/agents/
│   ├── masterAgent.js               ← AI chat + RAG context assembly
│   ├── emailAgent.js                ← Email scoring + BGU dual inbox
│   ├── contentAgent.js              ← Moodle study guide generation
│   └── notificationAgent.js        ← Smart OS-level alerts
│
├── src/gemini.js                    ← Shared Gemini client (global semaphore)
├── src/calendarService.js           ← Google Calendar read + write
├── src/gmailService.js              ← Gmail API (dual account)
├── src/moodleScraper.js             ← Moodle AJAX scraping (session-based)
└── manifest.json                    ← Extension config (MV3)
```

**Data flow:**
```
External data sources           chrome.storage          AI layer
─────────────────────           ──────────────          ────────
Google Calendar  ──────────►   calendarEvents  ──►
Gmail (primary)  ──────────►   emailData       ──►   masterAgent
Gmail (BGU)      ──────────►   emailData       ──►   (RAG context
Moodle AJAX      ──────────►   moodleData      ──►   assembly)
                               aiScores        ──►
```

---

## Feature Matrix

| Feature | Status | How it works |
|---|---|---|
| Google Calendar — read | ✅ Live | `calendar.events` scope · background sync every 60 min |
| Google Calendar — write | ✅ Live | POST to `/calendars/primary/events` via Calendar API |
| Gmail (primary account) | ✅ Live | `gmail.readonly` scope · `chrome.identity.getAuthToken` |
| Gmail (BGU email) | ✅ Live | `launchWebAuthFlow` · implicit OAuth · Web Application client |
| Email AI scoring | ✅ Live | Rule-based (0-10) + Gemini for borderline (3-6) · cached by ID |
| Moodle sync | ✅ Live | AJAX API · `core_calendar_get_action_events_by_timesort` |
| Moodle deadlines | ✅ Live | Paginated fetch (2×50) · real Unix timestamps |
| AI Study Guides | ✅ Live | Content Agent · per-course · cached by content fingerprint |
| AI Chat | ✅ Live | Gemini 2.5 Flash · RAG context · 30-message history |
| OS Notifications | ✅ Live | Lecture 30min · assignments 3d/1d/4h · dedup set |
| Two-way calendar sync | ✅ Live | Inline modal in Today tab · creates event via API |
| Rate limiting | ✅ Live | Global semaphore · exponential backoff · 429 retry |
| Smart cache | ✅ Live | 6-hour Moodle TTL · email score persist · fingerprint cache |
| WhatsApp integration | 🔜 Planned | See `WHATSAPP_INTEGRATION_PLAN.md` |
| Lecture note agent | 🔜 Planned | Mission 6 — video/audio capture + AI timestamped notes |

---

## Missions Completed

### Mission 1 — Extension Shell ✅
Built a working Manifest V3 Chrome Extension with:
- Side Panel UI (4 tabs), Service Worker, chrome.alarms scheduling
- Solved: CSP blocking inline scripts, `type: module` for ES imports

### Mission 2 — Google Calendar ✅
- Live calendar events with countdown labels ("in 2h 30m")
- Full OAuth 2.0 via `chrome.identity.getAuthToken`
- Background sync every 15 minutes

### Mission 3 — Gmail + AI Chat ✅
- Gmail inbox displayed with sender, subject, snippet
- Rule-based email classifier (URGENT / ACTION / PAYMENT / EXAM keywords)
- Gemini AI chat with RAG context (calendar + emails injected into every prompt)
- API key stored in `chrome.storage`, entered once

### Mission 4 — Multi-Agent System + Moodle ✅
- 5 specialized agents running on independent schedules via orchestrator
- Moodle scraping using browser session cookies (no API token needed)
- Study guide generation per course (Gemini summarizes sections + files)
- Notification agent with 5 trigger conditions and deduplication

### Mission 5 — Production Hardening v0.4.0 ✅
- Shared Gemini client with global semaphore (prevents simultaneous API hammering)
- Moodle AJAX reverse-engineering for real deadline timestamps
- Moodle UI redesign: deadlines section + dropdown navigation
- BGU email OAuth fixed (root cause: Chrome Extension vs Web Application client type)
- Email cards clickable — open directly in Gmail at correct account
- Two-way calendar sync with inline modal
- Content fingerprint caching (no regeneration if course unchanged)
- Icon files created so `chrome.notifications` doesn't silently fail

---

## Key Technical Concepts

### OAuth 2.0 — Two Different Flows
The extension uses **two separate OAuth patterns** for different purposes:

1. **`chrome.identity.getAuthToken`** — for the primary Chrome profile account
   - Requires `"Chrome Extension"` type OAuth client in Google Cloud Console
   - No redirect URI needed — Chrome handles everything
   - Used for: primary Gmail, Google Calendar

2. **`chrome.identity.launchWebAuthFlow`** — for the BGU second account
   - Requires `"Web Application"` type OAuth client in Google Cloud Console
   - Redirect URI `https://<extension-id>.chromiumapp.org/` must be explicitly registered
   - Token comes back in the URL hash fragment (implicit flow, `response_type=token`)
   - Used for: BGU Gmail (`andargia@post.bgu.ac.il`)

### Moodle Scraping — Session Piggyback
BGU Moodle has no public API. The extension bypasses this by:
1. Running in the sidepanel context (has access to browser cookies)
2. Making `fetch()` requests with `credentials: 'include'` — uses the user's existing Moodle login
3. Extracting the `sesskey` (CSRF token) via regex from the `/my/` HTML response
4. Calling `lib/ajax/service.php` with `core_calendar_get_action_events_by_timesort` (internal Moodle AJAX API)
5. Fetching in 2 batches of 50 (API hard limit is 50 events per call)

### Global Semaphore — Rate Limit Control
```js
let _pending = Promise.resolve();
function withSemaphore(fn) {
  const next = _pending.then(() => fn());
  _pending = next.then(()=>{},()=>{});
  return next;
}
```
All Gemini calls queue behind a single Promise chain. Equivalent to a mutex in multi-threaded systems. Combined with reading `retryAfter` from 429 responses for adaptive backoff.

### RAG Pipeline — Context Assembly
Before every AI chat message, `masterAgent.assembleContext()` builds a structured prompt prefix from:
- Today's calendar events
- Assignment deadlines sorted by urgency
- Top-scored emails
- Moodle course summaries
- Agent run statuses

This is production-grade RAG — not just "give the AI some text" but deliberately selecting and formatting the most relevant context.

### Content Fingerprint Cache
```js
function courseFingerprint(d) {
  return `${d.courseId}_s${sections}_i${items}_f${files}`;
}
```
Study guides only regenerate when a course actually has new content. Same technique used in build systems (Webpack, Make) and CDNs.

---

## System Design Decisions

| Decision | Why |
|---|---|
| Side Panel over popup | Persistent UI — stays open while browsing Moodle or email |
| Polling over WebSocket | No backend server required; chrome.alarms survive SW sleep |
| Rule-based classifier first | Covers 80% of emails for free; Gemini only for edge cases |
| Multi-agent over monolith | Single-responsibility: when email agent breaks, Moodle is unaffected |
| Orchestrator pattern | One control point for all scheduling; easy to add new agents |
| Shared Gemini client | Prevents all agents hitting rate limit simultaneously |
| Session cookie scraping | No Moodle token setup for the user; works automatically |
| `Web Application` OAuth type | Required for `launchWebAuthFlow` — `Chrome Extension` type is incompatible |

---

## File Reference

| File | Purpose |
|---|---|
| `manifest.json` | Extension config: permissions, OAuth, service worker, side panel |
| `sidepanel.html` | UI markup: tabs, cards, modals, setup form |
| `sidepanel.js` | All UI logic: rendering, event handlers, tab switching, OAuth launch |
| `src/background.js` | Service worker entry: wires orchestrator, handles alarm events |
| `src/orchestrator.js` | Scheduler: creates alarms, routes alarm names to agent functions |
| `src/gemini.js` | Shared Gemini API client with semaphore + exponential backoff |
| `src/calendarService.js` | Google Calendar read (list events) + write (create event) |
| `src/gmailService.js` | Gmail API: fetch messages, decode base64, multi-account |
| `src/moodleScraper.js` | Moodle AJAX: extract sesskey, call calendar API, paginated fetch |
| `src/moodleService.js` | Moodle data storage layer and course listing |
| `src/classifier.js` | Email keyword scorer (URGENT_WORDS, EXAM_WORDS, PAYMENT_WORDS) |
| `src/agents/masterAgent.js` | Chat AI: RAG context assembly, Gemini call, history management |
| `src/agents/emailAgent.js` | Email scoring: rule-based + Gemini for borderline, notifications |
| `src/agents/contentAgent.js` | Study guides: per-course Gemini summarization with fingerprint cache |
| `src/agents/notificationAgent.js` | Chrome OS notifications: lecture/deadline/summary triggers + dedup |
| `icons/icon48.png` | Required by notifications API (48px) |
| `icons/icon128.png` | Extension store icon (128px) |
| `LEARNING_LOG.md` | Mission-by-mission dev log — all concepts and problems solved |
| `PROJECT_OVERVIEW.md` | This file — full project summary |
| `WHATSAPP_INTEGRATION_PLAN.md` | Plan for Mission 6.5 — WhatsApp integration |
| `LINKEDIN_POST_DRAFT.md` | LinkedIn post drafts + resume bullets |

---

## BGU-Specific Setup

| Setting | Value |
|---|---|
| Extension ID | `gkkcaiihdcjojepgclndamghomcmgghh` |
| Primary Google OAuth client | Chrome Extension type · ID `856203600469-t8oiaao8...` |
| BGU Email OAuth client | Web Application type · ID `856203600469-qb04giv...` |
| BGU Moodle domain | `moodle.bgu.ac.il` |
| BGU email format | `<username>@post.bgu.ac.il` |
| Gemini model | `gemini-2.5-flash-preview-04-17` |
| Free tier limits | 10 RPM / 1500 req/day |

---

## What's Next

### Mission 6 — WhatsApp Integration (see `WHATSAPP_INTEGRATION_PLAN.md`)
Read WhatsApp Web messages — detect deadlines, group assignments, and important mentions — without any external API or phone number.

### Mission 7 — Lecture Note Agent
Record or transcribe lectures (mic or tab audio), generate timestamped notes with AI, sync to the relevant Moodle course.

### Mission 8 — Full Polish + Publish
Chrome Web Store submission, onboarding flow, public README.

---

## I&ME Connection

This project is **applied Industrial Engineering**:

- **Bottleneck analysis:** 4 tools × daily context-switching = wasted cognitive overhead → unified interface eliminates the bottleneck
- **MIS (Management Information Systems):** Multi-agent architecture with a shared data layer is identical to an ERP system with specialized modules
- **Operations scheduling:** Orchestrator pattern = production scheduler; agents = work cells; chrome.alarms = production calendar
- **Decision support:** RAG-powered AI chat is a decision-support system for task prioritization
- **Quality control:** Content fingerprint caching = don't rework a part that hasn't changed
- **Capacity management:** Global Gemini semaphore = bottleneck management at the API rate limit constraint
