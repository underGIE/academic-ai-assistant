// ============================================================
// BACKGROUND SERVICE WORKER
// ============================================================
import {
  fetchUpcomingEvents,
  scheduleLectureAlarm,
} from "./calendarService.js";
import { fetchRecentEmails } from "./gmailService.js";
import { classifyAll } from "./classifier.js";

function setupAlarms() {
  chrome.alarms.create("poll-calendar", { periodInMinutes: 15 });
  chrome.alarms.create("poll-gmail", { periodInMinutes: 5 });
}

async function syncCalendar() {
  try {
    const events = await fetchUpcomingEvents(7);
    await chrome.storage.local.set({
      calendarEvents: events,
      calendarLastSync: Date.now(),
    });
    scheduleLectureAlarm(events);
    console.log("[BG] Calendar synced:", events.length, "events");
  } catch (e) {
    console.error("[BG] Calendar sync failed:", e);
  }
}

async function syncGmail() {
  try {
    const raw = await fetchRecentEmails(30);
    const emails = classifyAll(raw);
    await chrome.storage.local.set({ emails, gmailLastSync: Date.now() });
    console.log("[BG] Gmail synced:", emails.length, "emails");
  } catch (e) {
    console.error("[BG] Gmail sync failed:", e);
  }
}

async function syncAll() {
  await syncCalendar();
  await syncGmail();
}

// ── Top-level listeners (MV3 requirement) ──────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  setupAlarms();
  syncAll();
});
chrome.runtime.onStartup.addListener(() => {
  setupAlarms();
  syncAll();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "poll-calendar") syncCalendar();
  else if (alarm.name === "poll-gmail") syncGmail();
  else if (alarm.name.startsWith("lecture-")) {
    const title = alarm.name.replace("lecture-", "");
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "📚 Lecture in 30 minutes",
      message: title,
    });
  }
});

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "syncCalendar")
    syncCalendar().then(() => sendResponse({ ok: true }));
  if (msg.type === "syncGmail")
    syncGmail().then(() => sendResponse({ ok: true }));
  if (msg.type === "syncAll") syncAll().then(() => sendResponse({ ok: true }));
  return true;
});
