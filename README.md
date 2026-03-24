# Academic AI Assistant

> An AI-powered academic operating system for BGU students — built as a Chrome Extension.
> Unifies Google Calendar, Gmail, and Moodle into a single intelligent side panel.

**Version:** 0.4.1 (Security Hardened) | **Stack:** Chrome MV3 · JavaScript ES Modules · Gemini 2.5 Flash · Google APIs · Moodle AJAX

---

## What This Is

Most students lose 20–30 minutes every morning just figuring out *what they need to do* — switching between Calendar, Gmail, Moodle, and WhatsApp to piece together their day. This extension eliminates that overhead.

A persistent side panel surfaces everything: today's schedule with live countdowns, scored and sorted emails, Moodle deadlines with urgency indicators, and AI-generated study guides. The AI — codenamed **Bol** — doesn't just retrieve information. It reasons about it, connecting course material to exam strategy and surfacing the *why* behind every answer.

---

## The Bol Engine

The AI assistant is built around the persona of a mentor who leads with **intuition before definition**. Every explanation follows a deliberate Chain-of-Thought structure:

1. **Core Principle** — what is the fundamental idea at stake here?
2. **Intuition** — why does this work? what is the mental model?
3. **Formal Definition** — the precise academic framing
4. **Worked Example** — concrete application to this specific course
5. **Strategic Tip** — what this course's structure suggests to focus on for exams

This is not a retrieval system. It is a reasoning layer over your actual academic data.

---

## Architecture

```
Chrome Extension (Manifest V3)
│
├── sidepanel.html / sidepanel.js        ← UI: 5 tabs (Today · Inbox · Moodle · Chat · Setup)
│
├── src/background.js                    ← Service Worker (minimal — wires orchestrator)
│   └── src/orchestrator.js             ← Central scheduler via chrome.alarms
│
├── src/agents/
│   ├── masterAgent.js                  ← Bol AI engine · RAG context assembly · CoT prompting
│   ├── emailAgent.js                   ← Dual inbox scoring (rule-based + Gemini)
│   ├── contentAgent.js                 ← Per-course study guide generation
│   └── notificationAgent.js            ← Smart OS-level alerts with deduplication
│
├── src/gemini.js                        ← Shared Gemini client · global semaphore · retry
├── src/calendarService.js               ← Google Calendar read + write
├── src/gmailService.js                  ← Gmail API (primary + BGU account)
├── src/moodleScraper.js                 ← Moodle AJAX scraping (session-based, no token)
└── manifest.json                        ← Extension config · permissions · CSP
```

**Data flow:**

```
External Sources          chrome.storage.local        Bol AI (Gemini)
─────────────────         ────────────────────        ───────────────
Google Calendar  ──────►  calendarEvents    ──────►
Gmail (primary)  ──────►  emails            ──────►  RAG context assembly
Gmail (BGU)      ──────►  emails            ──────►  → masterAgent prompt
Moodle AJAX      ──────►  moodleData        ──────►
                          emailAiScoreCache  ──────►  (scored once, cached forever)
```

---

## Features

| Feature | Status | Notes |
|---|---|---|
| Google Calendar — read + write | ✅ Live | Two-way sync; inline "Add Event" modal |
| Gmail — primary account | ✅ Live | Last 3 days · sorted by AI importance score |
| Gmail — BGU second account | ✅ Live | `launchWebAuthFlow` · implicit OAuth · Web Application type |
| Email AI scoring | ✅ Live | Rule-based (fast) + Gemini for borderline · cached by ID |
| Moodle sync | ✅ Live | Session-based AJAX scraping · no token setup required |
| Moodle deadlines | ✅ Live | Real Unix timestamps · paginated 2×50 batch fetch |
| AI Study Guides (Bol) | ✅ Live | Per-course · content fingerprint cache · CoT format |
| AI Chat (Bol) | ✅ Live | Gemini 2.5 Flash · full RAG context · 12-message history |
| OS Notifications | ✅ Live | Lecture 30min · assignments 3d/1d/4h · daily 8AM summary |
| Rate limit protection | ✅ Live | Global semaphore · exponential backoff on 429 |
| WhatsApp integration | 🔜 Planned | Content script on web.whatsapp.com · see WHATSAPP_INTEGRATION_PLAN.md |
| Ollama / local LLM | 🔜 Planned | Replace Gemini with local model for full data sovereignty |
| Deep RAG pipeline | 🔜 Planned | Index lecture PDFs + videos; semantic search across all course material |

---

## Privacy & Security

**Your data never leaves your device (except to Google/Gemini APIs you already use).**

### What data is stored and where

All extension data is stored exclusively in `chrome.storage.local` — sandboxed to this extension, device-local, never synced to the cloud, and inaccessible to websites or other extensions.

| Data type | Where it goes | How long |
|---|---|---|
| Gemini API key | `chrome.storage.local` on your device | Until you clear it |
| Google OAuth tokens | Chrome's built-in token cache | Auto-managed by Chrome |
| BGU OAuth token | `chrome.storage.local` | 1 hour (then auto-cleared) |
| Emails (metadata only) | `chrome.storage.local` | Until next sync |
| Calendar events | `chrome.storage.local` | Until next sync |
| Moodle data | `chrome.storage.local` | 6-hour TTL |
| AI study guides | `chrome.storage.local` | 7-day TTL |
| Chat history | `chrome.storage.local` (last 30 msgs) | Until cleared in Setup |

### What this extension does NOT do

- Does not transmit your data to any server operated by this project
- Does not store any credentials, tokens, or personal data remotely
- Does not have a backend — there is no server
- Does not read any web page content outside of `moodle.bgu.ac.il`
- Does not use analytics, tracking, or telemetry

### Security hardening (v0.4.1)

The following vulnerabilities were identified and fixed during a full security audit:

| ID | Severity | Issue | Fix |
|---|---|---|---|
| SEC-01 | 🔴 Critical | XSS: AI study guide output injected raw into innerHTML | Escape all AI text through `esc()` before HTML substitution |
| SEC-02 | 🔴 Critical | Prompt injection: email subjects/course names in AI prompts unguarded | All user data wrapped in `<user_data>` XML tags with injection-blocking instruction |
| SEC-03 | 🟡 Medium | Semaphore silently retried on errors, masking real failures | Errors now propagate cleanly; queue advances via `.finally()` |
| SEC-04 | 🟡 Medium | Scraped Moodle URLs not validated (could be `javascript:` scheme) | `safeUrl()` helper — only `https://` URLs stored |
| SEC-05 | 🟡 Medium | No explicit Content Security Policy in manifest | Added explicit CSP: `script-src 'self'; object-src 'none'` |
| SEC-07 | 🟢 Low | Chat input had no length limit | `maxlength="2000"` + truncation guard in `sendMsg()` |
| SEC-08 | 🟢 Low | Expired BGU tokens not cleared from storage | `emailAgent.js` now explicitly clears expired tokens |

Full details: see `SECURITY_AUDIT.md`

### Manifest V3 permissions (Least Privilege)

```json
"permissions": ["sidePanel", "storage", "alarms", "notifications", "identity", "tabs"]
```

| Permission | Why it's needed | What it does NOT enable |
|---|---|---|
| `sidePanel` | Open the side panel UI | Cannot access page content |
| `storage` | Store calendar/email data locally | Not synced remotely |
| `alarms` | Schedule background agent runs | Cannot run code outside extension |
| `notifications` | Show OS-level deadline alerts | Cannot access notification history |
| `identity` | OAuth token flow for Google APIs | Cannot access other extensions' tokens |
| `tabs` | Open Gmail links when you click email cards | Cannot read tab content |

---

## Getting Started

### Prerequisites

- Chrome browser (or any Chromium-based browser)
- A Google account (with Calendar and Gmail)
- A free Gemini API key — get one at [aistudio.google.com](https://aistudio.google.com) (no credit card, never expires)
- Access to BGU Moodle (for Moodle features)

### Installation

```bash
git clone https://github.com/undergle/academic-ai-assistant
cd academic-ai-assistant
```

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked** → select the `academic-ai-assistant` folder
4. The extension icon appears in your toolbar

### First-time setup

1. Click the extension icon → side panel opens
2. Go to **⚙️ Setup** tab
3. Click **Connect Google Account** — authorize Calendar + Gmail
4. Paste your **Gemini API key** → Save
5. Go to **Moodle** tab → click **Sync with BGU Moodle** (must be logged in to Moodle in the same browser)
6. Optionally: connect your **BGU email** (`@post.bgu.ac.il`) for dual inbox

### BGU Email OAuth setup (one-time)

The BGU email requires a "Web Application" type OAuth client (not "Chrome Extension" type). If you are setting this up fresh:

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Create credentials → OAuth client ID
2. Type: **Web application**
3. Authorized redirect URI: `https://<your-extension-id>.chromiumapp.org/`
4. Your extension ID is shown in the Setup tab under "BGU Email"
5. Paste the new client ID into `sidepanel.js` line ~668 (`const CLIENT_ID = '...'`)

---

## Roadmap

### Completed
- ✅ Mission 1 — Chrome Extension shell · MV3 · Service Worker · Side Panel
- ✅ Mission 2 — Google Calendar integration · OAuth · live sync
- ✅ Mission 3 — Gmail + AI Chat · RAG context · Gemini 2.5 Flash
- ✅ Mission 4 — Multi-agent system · Moodle AJAX scraping · orchestrator pattern
- ✅ Mission 5 — Production hardening v0.4.0 · dual inbox · two-way calendar sync
- ✅ Mission 6 — Security hardening v0.4.1 · full audit · XSS + injection fixes

### In Progress
- 🔜 Mission 7 — **Bol Engine v2** · full CoT persona · Hebrew/English adaptive tutoring
- 🔜 Mission 7.5 — **WhatsApp integration** · content script on web.whatsapp.com · study group parsing · Hebrew keyword detection

### Vision (v1.0)
- ⬜ Mission 8 — **Ollama / Local LLM** · replace Gemini with local model · full data sovereignty
- ⬜ Mission 9 — **Deep RAG pipeline** · index PDFs + lecture slides + videos · semantic search across all course material
- ⬜ Mission 10 — **Moodle video integration** · scrape and surface lecture videos inline
- ⬜ Mission 11 — **Lecture note agent** · audio transcription + AI timestamped notes
- ⬜ Mission 12 — **Polish + publish** · onboarding flow · Chrome Web Store

---

## The Ollama Vision

The current architecture uses Gemini (cloud API) for all AI processing. This works well for an MVP but has two constraints: a rate limit of 10 RPM on the free tier, and all prompts are sent to Google's servers.

The target architecture for v1.0:

```
Local Computer
│
├── Chrome Extension (frontend, unchanged)
│   └── Calls → localhost:11434/api/generate
│
└── Ollama Server (background process)
    ├── Model: llama3 / mistral / phi-3
    ├── RAG Index: all Moodle PDFs + slides + recordings
    └── MCP Server: exposes tools to the extension
```

Benefits: zero API costs, unlimited RPM, data never leaves the device, works offline. The extension already has the architecture to swap the API endpoint — `src/gemini.js` is the single integration point.

---

## Project Structure

```
academic-ai-assistant/
├── manifest.json               Extension config (MV3)
├── sidepanel.html              Side panel markup
├── sidepanel.js                All UI logic (~900 lines)
├── src/
│   ├── background.js           Service worker entry
│   ├── orchestrator.js         Alarm scheduler + agent router
│   ├── gemini.js               Shared AI client (semaphore + retry)
│   ├── calendarService.js      Google Calendar API
│   ├── gmailService.js         Gmail API
│   ├── moodleScraper.js        Moodle session scraper
│   ├── moodleService.js        Moodle data layer
│   ├── classifier.js           Rule-based email scorer
│   └── agents/
│       ├── masterAgent.js      Bol AI engine + RAG
│       ├── emailAgent.js       Email scoring + dual inbox
│       ├── contentAgent.js     Study guide generation
│       └── notificationAgent.js Smart alert engine
├── icons/
│   ├── icon48.png
│   └── icon128.png
├── LEARNING_LOG.md             Technical architecture journal
├── PROJECT_OVERVIEW.md         Full system reference doc
├── SECURITY_AUDIT.md           Vulnerability findings + fixes
└── WHATSAPP_INTEGRATION_PLAN.md  Mission 7.5 implementation plan
```

---

## Technical Highlights

**Multi-agent orchestration** — five specialized agents run on independent schedules via `chrome.alarms`. A central orchestrator routes events. Each agent reads from and writes to `chrome.storage.local` as the shared data layer. This is the same pattern as a production microservices system.

**Session-based Moodle scraping** — BGU Moodle has no public API. The extension makes `fetch()` requests with `credentials: 'include'`, using the student's existing browser session. It extracts the `sesskey` CSRF token and calls Moodle's internal AJAX endpoint (`core_calendar_get_action_events_by_timesort`) for real deadline timestamps.

**Dual OAuth pattern** — Google Calendar and primary Gmail use `chrome.identity.getAuthToken` (Chrome Extension type client). The BGU second email uses `chrome.identity.launchWebAuthFlow` with a Web Application type client, because `getAuthToken` only serves the primary Chrome profile account.

**Global semaphore** — all Gemini calls queue through a single Promise chain. No two agents can call the API simultaneously. Combined with `retryAfter`-aware exponential backoff on HTTP 429.

**Content fingerprint caching** — study guides regenerate only when course content actually changes (new sections/files), not on every sync. Cache key: `courseId_sN_iN_fN` (section/item/file counts).

---

Built by Avi Andargie · Industrial & Management Engineering · Ben-Gurion University of the Negev
GitHub: https://github.com/undergle/academic-ai-assistant
