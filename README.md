# 🎓 Academic AI Assistant — Chrome Extension

> An AI-powered academic personal secretary that unifies Google Calendar,
> Gmail, and Moodle into a single smart interface.

## 🚀 Project Status

🔨 **In active development** — [Follow progress →](#roadmap)

## 🧠 What It Does

Students context-switch between 4+ tools daily. This extension eliminates
that friction by:

- 📅 Detecting upcoming lectures and their sequence number
- 📧 Classifying emails by course, urgency, and required action
- 📚 Surfacing Moodle deadlines and materials for the next lecture
- 💬 Answering natural-language questions with cited sources

## 🏗️ Architecture

- **Chrome Manifest V3** — Side Panel + Service Worker
- **Google Calendar API + Gmail API** — OAuth2 via chrome.identity
- **Moodle Web Services / ICS** — Course content and deadlines
- **Claude API (Anthropic)** — AI agent with source-referenced responses

## 🗺️ Roadmap

- [x] Phase 1: Extension shell + Side Panel UI
- [ ] Phase 2: Google Calendar integration + lecture notifications
- [ ] Phase 3: Gmail integration + AI-powered email classification
- [ ] Phase 4: Moodle integration + AI Chat
- [ ] Phase 5: Smart prioritization engine + MCP layer

## 🛠️ Tech Stack

React · Vite · Chrome Extension MV3 · Google APIs · Claude AI

## 📦 Local Development

```bash
npm install
npm run dev
# Load /dist folder as unpacked extension in chrome://extensions
```

## 👤 About

Built as a learning project to demonstrate systems thinking and
technical execution. Background in Industrial & Management Engineering.
