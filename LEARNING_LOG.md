# 🎓 Learning Log — Academic AI Assistant

> Built by Avi Andargie | Industrial & Management Engineering Student, BGU
> Started: March 2026 | Status: In Progress

This document tracks everything I built, learned, and understood
during this project. It's written so I can explain any part of it
in a job interview or presentation.

---

## Why I Built This

As an I&ME student I noticed a core inefficiency in my daily workflow:
I was context-switching between 4 separate tools every morning —
Google Calendar, Gmail, Moodle, and a browser — just to answer
the question "what do I need to do today?"

This is exactly the kind of problem Industrial Engineering solves:
eliminate waste, reduce friction, centralize information flow.

So I built a Chrome Extension that acts as a unified academic
personal secretary — powered by AI.

---

## Skills I'm Building

| Skill                        | Before      | After                                              |
| ---------------------------- | ----------- | -------------------------------------------------- |
| Chrome Extension development | Zero        | Building MV3 extensions with multi-agent systems   |
| JavaScript / ES6+            | Basic       | Async/await, modules, event-driven architecture    |
| REST APIs                    | Theoretical | Real OAuth + API calls to Google + Gemini          |
| Git & GitHub                 | Basic       | Professional commit workflow, public portfolio     |
| AI integration               | Zero        | Multi-agent LLM system with RAG context assembly   |
| System design                | Academic    | Orchestrator pattern, agent coordination, scheduling|

---

## Mission 1 — Extension Shell ✅

**Date completed:** March 2026
**Commit:** `feat: Mission 1 complete — working Chrome extension shell`

### What I built

A working Chrome Extension with:

- A Side Panel UI with 4 tabs (Today, Inbox, Chat, Settings)
- A background Service Worker that runs silently
- Scheduled alarms that fire every 5-15 minutes
- Proper file structure for a production extension

### Key concepts I learned

**Manifest V3 (MV3)**
The manifest.json is the "ID card" of a Chrome extension.
It tells Chrome: what permissions the extension needs, which file
is the background worker, which file is the side panel, and what
APIs it's allowed to call. Version 3 is the current standard and
is stricter about security than the old V2.

**Service Worker**
A background script that Chrome runs separately from the browser UI.
It wakes up when needed (an alarm fires, a message arrives) and
goes to sleep when idle. Critical rule: you can never store state
in global variables because they get wiped when the worker sleeps.
Everything persistent goes to chrome.storage.

**Content Security Policy (CSP)**
Chrome Extensions block "inline scripts" — JavaScript written
directly inside HTML files. This is a security rule that prevents
malicious code injection. Solution: all JavaScript must be in
separate .js files, linked with `<script src="file.js">`.

**Why this matters for I&ME:**
A Chrome Extension is a real software product with users,
permissions, security constraints, and a deployment pipeline.
Building one requires understanding system architecture,
not just writing code.

### Problems I solved

- Extension wouldn't load → background.js was in wrong folder
- CSP errors in console → moved all JS out of HTML into sidepanel.js
- "chrome is not defined" ESLint error → added webextensions globals

---

## Mission 2 — Google Calendar Integration ✅

**Date completed:** March 2026
**Commit:** `feat: Mission 2 complete — Google Calendar integration working`

### What I built

- Real Google Calendar events showing in the Today tab
- OAuth 2.0 authentication flow via chrome.identity
- Live countdown: "in 18h 55m", "Tomorrow at 08:00"
- Background sync every 15 minutes
- Chrome notifications scheduled before lectures

### Key concepts I learned

**OAuth 2.0 in practice**
I implemented the full OAuth flow inside a Chrome Extension.
Instead of managing redirect URIs and login pages like a web app,
Chrome extensions use chrome.identity.getAuthToken() which handles
everything — popup, approval, token caching, and refresh.
The extension never sees the user's password.

**REST API calls with authentication**
I called the Google Calendar API directly from JavaScript using
fetch(). The key pattern: include the OAuth token in the
Authorization header of every request. If the token expires
(401 response), clear it with removeCachedAuthToken() and retry.

**Async/Await and Promises**
Google's chrome.identity uses callbacks (old style). I wrapped it
in a Promise so I could use modern async/await syntax throughout
the codebase. This is a common real-world pattern.

**ES Modules in Chrome Extensions**
Using import/export requires `"type": "module"` in manifest.json.
Without it Chrome treats the service worker as a classic script
and throws: "Cannot use import statement outside a module".

### Problems I solved

- Status code 15 / import error → added "type": "module" to manifest
- ESLint showing chrome as undefined → added chrome: 'readonly' to globals
- ESLint showing import as error → added sourceType: 'module' to parserOptions

---

## Mission 3 — Gmail + AI Chat ✅

**Date completed:** March 2026
**Commit:** `feat: Mission 3 complete — Gmail inbox + Gemini AI chat`

### What I built

- Gmail inbox fetched via Gmail API, displayed with sender, subject, snippet
- Rule-based email classifier: URGENT / ACTION / PAYMENT / EXAM keyword scoring
- AI chat powered by Gemini 2.5 Flash — answers questions about schedule and emails
- RAG (Retrieval-Augmented Generation): assembles context from calendar + emails before each AI call
- API key stored in chrome.storage so it only needs to be entered once
- BGU email address (andargia@post.bgu.ac.il) prioritized in importance scoring

### Key concepts I learned

**RAG — Retrieval-Augmented Generation**
Instead of asking the AI a question with no context, I first pull all
relevant data (calendar events, emails, course list) from chrome.storage,
format it into a structured text block, and prepend it to the AI prompt.
This makes the AI aware of my actual situation without training it.
This is how real enterprise AI assistants work.

**Gemini API (free tier)**
Google AI Studio provides a permanently free API key (not a trial):
10 requests/minute, 1500/day. It uses the same REST pattern as every
other modern AI API — POST a JSON body with your prompt, get text back.
Model used: gemini-2.5-flash (gemini-1.5-flash and 2.0-flash were deprecated).

**Rule-based classification before AI**
For email scoring I built a keyword-matching system first (fast, free,
deterministic) and only call the AI API for "borderline" emails scoring
3-6. This is efficient system design: don't use a sledgehammer for
every nail.

### Problems I solved

- "model not found" → gemini-1.5-flash deprecated → updated to gemini-2.5-flash
- chrome.identity.getAccounts doesn't exist → replaced with manual second email input
- API key re-entered every time → saved to chrome.storage.local on first save

---

## Mission 4 — Multi-Agent System + Moodle ✅

**Date completed:** March 2026
**Commit:** `feat: Mission 4 complete — multi-agent system with Moodle integration`

### What I built

A full **multi-agent AI system** where 5 specialized agents run on schedule
and share information through a central storage layer:

**Email Agent** (`src/agents/emailAgent.js`)
Scores every email 0-10 using keyword rules (URGENT_WORDS, EXAM_WORDS,
PAYMENT_WORDS etc.) + BGU sender boost. Calls Gemini only for borderline
emails (score 3-6). Only fires a Chrome notification for emails scoring ≥7.
Deduplicates notifications so you never see the same alert twice.

**Content Agent** (`src/agents/contentAgent.js`)
Reads Moodle course data (sections, files, assignments) and sends it to
Gemini with a structured prompt: intuition, key concepts, exam focus,
study checklist, and quick tip. Caches by courseId + timestamp so it
doesn't regenerate on every sync. Respects the 10 req/min API limit with
6.5-second delays between courses.

**Notification Agent** (`src/agents/notificationAgent.js`)
Centralises all smart popups: lectures 30 min before start, assignment
deadlines at 3 days / 1 day / 4 hours checkpoints, overdue alerts, 8AM
daily morning summary, and important email notifications. Uses a
deduplication set (max 200 entries) to prevent repeat alerts.

**Master Agent** (`src/agents/masterAgent.js`)
The main conversational AI. Before every chat response it calls
assembleContext() which pulls from all other agents' storage outputs —
email scores, Moodle summaries, calendar events, assignment deadlines —
and injects it into the Gemini prompt. Maintains conversation history
(last 30 messages) in chrome.storage so the chat remembers context
across sessions. Also generates UX improvement suggestions every 2 days
that appear in Setup for approve/decline.

**Orchestrator** (`src/orchestrator.js`)
Central scheduler that creates chrome.alarms for each agent (email: 5min,
notifications: 15min, calendar: 60min, UX: 2880min) and routes each alarm
to the correct agent function. background.js is now minimal — it just
wires the orchestrator.

**Moodle scraping** (`src/moodleScraper.js`)
Instead of needing an API token, the extension scrapes BGU Moodle using
the user's existing browser session (fetch with credentials:'include').
This only works in the sidepanel context (not the service worker) because
it needs DOMParser and the browser's cookies.

### Key concepts I learned

**Multi-agent architecture**
Instead of one monolithic AI function, I split responsibilities into
specialized agents. Each agent: has one job, runs on its own schedule,
saves its output to storage, and can be updated independently.
This is the same pattern used in production AI systems (AutoGPT, CrewAI, etc.)

**Orchestrator pattern**
A single coordinator decides WHEN each agent runs and in what order.
This prevents race conditions, manages API rate limits, and makes the
system easy to extend — adding a new agent means adding one alarm and
one handler in the orchestrator.

**Browser scraping with session cookies**
BGU Moodle doesn't have a public API. But since the user is already
logged in to Moodle in their browser, I can use fetch() with
credentials:'include' to make requests as them and parse the HTML
response with DOMParser. No tokens, no login forms — just piggyback
on the existing session.

**RAG at scale (multi-source context)**
The Master Agent's context window includes: today's calendar events,
assignment deadlines sorted by urgency, Moodle course summaries,
top-scored emails, and the status of each agent (when it last ran).
This is a real RAG pipeline, not a toy example.

**Why this matters for I&ME:**
Multi-agent systems are a direct analog to production planning in
operations management. Each agent is like a work cell with a defined
responsibility. The orchestrator is the production scheduler.
The shared storage is the information system. The Master Agent is
the decision-support layer. This is systems thinking applied to software.

### Architecture decisions

| Decision | Alternative | Why |
|---|---|---|
| Browser scraping for Moodle | Moodle REST API token | No token needed, works with existing login |
| Agent per concern | One big background script | Separation of concerns, easier to debug |
| Orchestrator with chrome.alarms | setInterval / setTimeout | Alarms survive service worker sleep cycles |
| Gemini only for borderline emails | Gemini for all emails | Saves API quota, rule-based is faster |
| 6.5s delay between content agent calls | Parallel API calls | Respects 10 RPM free tier limit |

### Problems I solved

- manifest.json had duplicate oauth2 sections → cleaned to single block with real client ID
- Moodle scraping must run in sidepanel (not service worker) → DOMParser not available in SW
- Service worker sleeps between alarms → chrome.alarms persist even when SW is asleep
- API rate limit for study guide generation → added 6500ms delay between courses

---

## Mission 5 — Smart Lecture Note Agent 🎥

_(Coming soon — video frame capture + AI timestamped notes)_

---

## Mission 6 — Polish + LinkedIn Post

_(Coming soon)_

---

## Mission Board

```
✅ Mission 1 — Extension shell + Git
✅ Mission 2 — Google Calendar + real data
✅ Mission 3 — Gmail + AI Chat + Gemini
✅ Mission 4 — Multi-agent system + Moodle
🔜 Mission 5 — Smart Lecture Note Agent 🎥
⬜ Mission 6 — Polish + LinkedIn post
```

---

## Architecture Decisions & Why

| Decision                          | Alternative        | Why I chose it                             |
| --------------------------------- | ------------------ | ------------------------------------------ |
| Side Panel over Popup             | Browser popup      | Persistent UI, stays open while browsing   |
| Polling over Push                 | WebSocket/Push API | Simpler, no backend required for MVP       |
| Rule-based email classifier first | AI classifier      | Fast, free, covers 80% of cases            |
| Gemini API for AI                 | OpenAI/Claude      | Free tier, already in Google ecosystem     |
| Multi-agent over monolith         | Single AI function | Separation of concerns, independent scaling|
| Orchestrator pattern              | Direct alarm calls | Single control point, easy to extend       |

---

## What I Would Tell Someone in an Interview

**"What did you learn building this?"**
I learned that building a real product requires solving problems
that textbooks don't cover — API authentication flows, browser
security policies, event-driven architecture, and managing
asynchronous state. Every error I hit taught me something specific
about how browsers and APIs actually work.

**"What does this have to do with I&ME?"**
Everything. This project is applied operations research. I identified
a bottleneck in information processing (4 tools → 1 unified interface),
designed a system to eliminate it, and built it. The AI layer is
essentially an automated decision-support system for prioritizing tasks.
The multi-agent architecture mirrors production planning: specialized
work cells, a central scheduler, and a management information layer.

**"Why a multi-agent system?"**
Single-responsibility principle. When the email agent breaks, I don't
touch the Moodle agent. When I want to improve study guides, I only
change the content agent. This is maintainable, scalable software —
the same reason factories have separate departments instead of one
person doing everything.

---

## Project Links

- GitHub: https://github.com/AviAndargie/academic-ai-assistant
- LinkedIn Post: coming soon
