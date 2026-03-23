content = """\
# Academic AI Assistant - Chrome Extension

> A personal AI-powered academic secretary built as a Chrome Extension.
> Integrates Google Calendar, Gmail, and an AI agent to help university students stay on top of their academic life.

Version: 0.3.0 | Manifest V3 | License: MIT

---

## Features

| Feature | Description |
|---|---|
| Today Tab | Next upcoming event with countdown + full week from Google Calendar |
| Inbox Tab | Gmail sync with Hebrew + English classification: Payment / Admin / Urgent |
| AI Chat | Ask anything about your schedule or emails in Hebrew or English |
| BGU Nerd Friend | AI explains course material: Intuition, Definition, Example, Exam Tip |
| Course Memory | Add courses + lecturers in Setup - AI uses this for exam prep context |

---

## Tech Stack

- Chrome Extension Manifest V3 - Service Worker, Side Panel API, chrome.identity OAuth
- Google Calendar API - real-time schedule sync, recurring event expansion
- Gmail API - inbox sync with rule-based email classification
- Gemini 2.5 Flash - free AI agent via Google AI Studio (no expiration)
- Vanilla JS + ES Modules - no build step required

---

## Getting Started

### Prerequisites
- Google Chrome
- A Google account
- Free Gemini API key from https://aistudio.google.com

### Installation

1. Clone the repo
   git clone https://github.com/underGIE/academic-ai-assistant.git

2. Set up Google Cloud
   - Create a project at https://console.cloud.google.com
   - Enable Google Calendar API and Gmail API
   - Create OAuth 2.0 credentials (Chrome Extension type)
   - Add your Client ID to manifest.json

3. Load in Chrome
   - Open chrome://extensions
   - Enable Developer mode (top right toggle)
   - Click Load unpacked and select the project folder

4. Configure in the extension
   - Setup tab -> Connect & Sync Google Account
   - Paste your free Gemini API key -> Save
   - Add your courses and lecturers

---

## Project Structure

```
academic-ai-assistant/
├── manifest.json          # Extension config (Manifest V3)
├── sidepanel.html         # Side panel UI
├── sidepanel.js           # UI logic
├── src/
│   ├── background.js      # Service worker - alarms, sync, notifications
│   ├── calendarService.js # Google Calendar API client
│   ├── gmailService.js    # Gmail API client
│   ├── classifier.js      # Rule-based email classifier (Hebrew + English)
│   └── aiAgent.js         # Gemini AI agent with context assembly
├── LEARNING_LOG.md        # Mission-by-mission learning journal
└── README.md
```

---

## Roadmap

- [x] Mission 1 - Chrome Extension foundation (Side Panel, tabs, CSP)
- [x] Mission 2 - Google Calendar OAuth + real-time schedule
- [x] Mission 3 - Gmail inbox + AI chat with BGU course context
- [ ] Mission 4 - Moodle integration (auto-import courses and deadlines)
- [ ] Mission 5 - Smart Lecture Note Agent (AI notes from video + timestamps)
- [ ] Mission 6 - Polish + publish

---

## Learning Log

Every key concept, error, and fix is documented in LEARNING_LOG.md
Written to be portfolio-ready and explainable in technical interviews.

---

## Privacy

- Gemini API key stored locally in chrome.storage.local only
- Google OAuth managed by Chrome built-in identity system
- No data leaves your browser except to Google APIs

---

Built by an Industrial & Management Engineering student at Ben-Gurion University of the Negev (BGU)
"""

with open("README.md", "w") as f:
    f.write(content)

print("README.md updated successfully!")