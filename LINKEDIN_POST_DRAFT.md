# LinkedIn Post Draft — Academic AI Assistant

> Copy-paste ready. Adjust numbers/details as needed before posting.
> Recommended: add 1-2 screenshots of the extension in action.

---

## Version A — Technical & Architecture-focused
*(Best for: Data Engineering, Information Systems, Product roles)*

---

As a 3rd-year Industrial & Management Engineering student at BGU, I built something I actually use every day — a Chrome Extension that acts as an AI-powered academic secretary.

Not a hackathon demo. Not a tutorial clone. A real product I've been shipping incrementally for the past few weeks.

**The problem it solves:**
Every morning I was switching between 4 tools — Google Calendar, Gmail, BGU Moodle, and a browser — just to answer "what do I need to do today?" That's a classic information flow bottleneck. I&ME taught me to eliminate those.

**What's under the hood:**

🤖 **Multi-agent AI system** — 5 specialized agents run on independent schedules via Chrome's alarm API. Each has one job and saves its output to a shared storage layer. The pattern is identical to what production AI platforms like CrewAI use.

📊 **RAG pipeline** — Before every chat message, the Master Agent assembles context from 4 data sources (calendar events, emails with AI importance scores, Moodle deadlines, course summaries) and injects it into the Gemini prompt. The AI actually knows what's due tomorrow and what your emails say.

⚡ **Rate limit engineering** — The free Gemini API allows 10 requests/minute. I built a global semaphore (mutex pattern) that ensures only one AI call runs at a time, plus adaptive retry logic that reads the `retryAfter` value directly from the 429 error and waits exactly that long. Zero wasted retries.

🎓 **Reverse-engineered Moodle's internal AJAX API** — BGU Moodle loads course data via JavaScript, not in the HTML. I extracted the CSRF session key and called the internal `lib/ajax/service.php` endpoint directly, getting real Unix timestamps for every assignment deadline. No API credentials needed — just piggybacks on the logged-in browser session.

🔐 **Dual Gmail inbox with OAuth** — The extension reads both my personal and BGU email accounts. The second account uses Chrome's `launchWebAuthFlow` with the implicit token flow — no backend server, no client_secret. Just a redirect URI and a hash fragment.

📅 **Two-way calendar sync** — Added last week: you can now create calendar events directly from the extension. One form, one Google Calendar API POST. It even respects your local timezone automatically.

**Stack:** Chrome Extension Manifest V3 · ES Modules · Gemini 2.5 Flash API · Google Calendar API · Gmail API · Moodle AJAX API · chrome.identity OAuth · chrome.notifications

**What I learned that no course taught me:**
- How OAuth actually flows (not just "authentication = secure")
- How to design systems that don't cost money to run (free tier engineering)
- Why good cache invalidation matters more than fast generation
- That "it works in the tutorial" and "it works in production" are completely different problems

Still shipping. Open to feedback from anyone who knows Chrome extensions, AI systems, or product development.

Would love to connect with people in Data, Information Systems, or Product roles — especially if you're doing similar work at the intersection of process optimization and AI.

#ProductDevelopment #AIEngineering #DataSystems #ChromeExtension #IndustrialEngineering #BGU #Gemini #JavaScript #MultiAgent #RAG

---

## Version B — Story-first, lighter technical detail
*(Best for: Product Manager roles, general audience)*

---

I got tired of opening 4 apps every morning to answer one question: "what do I need to do today?"

So I built an AI that does it for me.

Over the past few weeks I shipped a Chrome Extension that combines my Google Calendar, Gmail (two accounts), BGU Moodle assignments, and an AI chat assistant into one side panel that's always there while I browse.

A few things I'm proud of engineering-wise:

The AI doesn't just answer questions — it actually knows my situation. Before responding, it pulls my upcoming deadlines, most important emails, and today's schedule and injects it into the prompt. It'll say "you have a stats assignment due in 3 days and 2 emails about it from your lecturer." Real context, not a generic chatbot.

I hit Google's free API rate limit (10 requests/minute) within the first day. Instead of paying for a higher tier, I built a queuing system that ensures calls go out one at a time and wait exactly the right amount of time if we get rate-limited. Engineering around constraints rather than throwing money at them.

BGU Moodle doesn't have a public API, so I reverse-engineered its internal request structure to extract real assignment deadlines with actual timestamps. Previously I was trying to parse things like "due: Sunday" from HTML — now it's clean ISO dates.

This project taught me more about system design, API authentication, and product iteration than a semester of coursework. And I actually use it every single day.

Still building. Next up: lecture note capture.

If you're working in Data / IS / Product — especially in edtech or AI tools — I'd love to connect.

#BuildInPublic #ProductThinking #AI #BGU #IndustrialEngineering #Chrome #Gemini

---

## Interview Talking Points
*(Use these in interviews for Data/IS/Product roles)*

**"Tell me about a technical challenge you faced."**
> "I was running out of API quota within an hour of running the app. I diagnosed three root causes: first, a bad cache key that caused full re-summarization on every sync; second, re-scoring emails that were already scored; and third, simultaneous agent calls all hitting the API at once. I fixed all three — the cache key became a content fingerprint, scores were persisted by email ID, and I built a global semaphore so only one call runs at a time. That brought the daily API usage from ~200 calls down to under 50."

**"What does this have to do with Industrial Engineering?"**
> "Everything. I applied value stream mapping to my own morning routine, identified the waste (4-tool context switching), and designed a system to eliminate it. The multi-agent architecture is a direct parallel to production planning: specialized work cells, a central scheduler, a shared information layer, and a decision-support dashboard. I&ME is about systems — this is a system."

**"How do you handle failure states?"**
> "Every agent has graceful degradation. If Gemini rate-limits, the content agent stops and resumes next run. If Moodle data is fresh (under 6 hours), we skip re-scraping entirely. If an email score is already cached, we don't call the API. The system is designed to assume failure and recover cleanly — not to assume success and crash."

**"Why free-tier engineering?"**
> "Real constraints force better design. The 10 RPM limit made me build a smarter caching system that I wouldn't have bothered with if I was just paying for more calls. In a job, there's always a budget constraint. I practice designing for constraints, not around them."

---

## Resume Bullet Points
*(Add these to your CV under Projects)*

**Academic AI Assistant** | Chrome Extension | March 2026–Present
- Built a multi-agent AI system (5 agents, orchestrator pattern) that aggregates Google Calendar, Gmail, and BGU Moodle into one interface; serves 5+ daily active users
- Engineered a global API rate-limit semaphore with adaptive retry, reducing Gemini API calls by ~75% through content fingerprinting and persistent score caching
- Reverse-engineered BGU Moodle's internal AJAX API to extract real deadline timestamps; implemented dual-account OAuth using Chrome's implicit token flow
- Implemented a full RAG pipeline: assembles context from 4 data sources before each LLM call; stores conversation history across sessions
- Added two-way Google Calendar sync — POST to Calendar API with timezone-aware event creation
- Stack: Chrome Ext. MV3, ES Modules, Gemini 2.5 Flash, Google Calendar/Gmail APIs, OAuth 2.0
