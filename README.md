# Academic AI Assistant - Chrome Extension

A personal AI-powered academic secretary built as a Chrome Extension.
Integrates Google Calendar, Gmail, and an AI agent to help BGU students stay on top of academic life.

Version 0.3.0 | Manifest V3

---

## Features

- Today Tab: Next upcoming event with countdown + full week from Google Calendar
- Inbox Tab: Gmail sync with Hebrew + English classification - Payment, Admin, Urgent
- AI Chat: Ask anything about your schedule or emails in Hebrew or English
- BGU Nerd Friend: AI explains course material with Intuition, Definition, Example, Exam Tip
- Course Memory: Add courses + lecturers in Setup, AI uses this for exam prep

---

## Tech Stack

- Chrome Extension Manifest V3 - Service Worker, Side Panel API, OAuth
- Google Calendar API - real-time schedule sync
- Gmail API - inbox sync with rule-based classification
- Gemini 2.5 Flash - free AI agent, no expiration
- Vanilla JS + ES Modules - no build step needed

---

## Getting Started

1. Clone the repo
2. Enable Calendar API and Gmail API in Google Cloud Console
3. Create OAuth credentials and add Client ID to manifest.json
4. Open chrome://extensions, enable Developer mode, click Load unpacked
5. In Setup tab: connect Google account, add Gemini API key, add your courses

Free Gemini API key: https://aistudio.google.com

---

## Project Structure

- manifest.json - Extension config
- sidepanel.html + sidepanel.js - UI
- src/background.js - Service worker
- src/calendarService.js - Google Calendar
- src/gmailService.js - Gmail
- src/classifier.js - Email classifier
- src/aiAgent.js - Gemini AI agent
- LEARNING_LOG.md - Full learning journal

---

## Roadmap

- Done: Mission 1 - Chrome Extension foundation
- Done: Mission 2 - Google Calendar integration
- Done: Mission 3 - Gmail + AI Chat with BGU context
- Next: Mission 4 - Moodle integration
- Next: Mission 5 - Smart Lecture Note Agent
- Next: Mission 6 - Polish and publish

---

## Learning Log

Every concept, error, and fix documented in LEARNING_LOG.md
Written to be portfolio-ready for technical interviews.

---

Built by an Industrial & Management Engineering student at Ben-Gurion University of the Negev
