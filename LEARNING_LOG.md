# 🎓 Learning Log — Academic AI Assistant

> Built by Avi Andargie| Industrial & Management Engineering Student
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

| Skill                        | Before      | After                                           |
| ---------------------------- | ----------- | ----------------------------------------------- |
| Chrome Extension development | Zero        | Building MV3 extensions from scratch            |
| JavaScript / ES6+            | Basic       | Async/await, modules, event-driven architecture |
| REST APIs                    | Theoretical | Real OAuth + API calls to Google                |
| Git & GitHub                 | Basic       | Professional commit workflow                    |
| AI integration               | Zero        | LLM APIs with context + source references       |
| System design                | Academic    | Designing real multi-source data pipelines      |

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
separate .js files, linked with <script src="file.js">.

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

## Mission 2 — Google Calendar Integration 🔄

_(In progress)_

### What I'm building

- OAuth 2.0 authentication with Google
- Real calendar events displayed in the Today tab
- "Next lecture" detection with countdown timer
- Chrome notifications 30 minutes before lectures

### Key concepts (filling in as I learn)

---

## Mission 3 — Gmail + AI Chat

_(Coming soon)_

---

## Mission 4 — Moodle Integration

_(Coming soon)_

---

## Mission 5 — Smart Lecture Note Agent 🎥

_(Coming soon)_

---

## Architecture Decisions & Why

| Decision                          | Alternative        | Why I chose it                           |
| --------------------------------- | ------------------ | ---------------------------------------- |
| Side Panel over Popup             | Browser popup      | Persistent UI, stays open while browsing |
| Polling over Push                 | WebSocket/Push API | Simpler, no backend required for MVP     |
| Rule-based email classifier first | AI classifier      | Fast, free, covers 80% of cases          |
| Gemini API for AI                 | OpenAI/Claude      | Free tier, already in Google ecosystem   |

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

---

## Project Links

- GitHub: [your repo URL]
- LinkedIn Post: [coming soon]
