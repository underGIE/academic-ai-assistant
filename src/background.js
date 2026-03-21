// ============================================================
// BACKGROUND SERVICE WORKER
// Runs silently in the background — schedules syncs + alarms
// ============================================================
import {
  fetchUpcomingEvents,
  scheduleLectureAlarm,
} from "./calendarService.js";

// ── Top-level listeners (MV3 requirement) ─────────────────

// Listen for manual sync trigger from UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "syncCalendar") {
    syncCalendar().then(() => sendResponse({ ok: true }));
    return true; // keeps the message channel open for async response
  }
});
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[AcademicAI] Installed ✓");
  setupAlarms();
  await syncCalendar();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("[AcademicAI] Startup ✓");
  setupAlarms();
  await syncCalendar();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log("[AcademicAI] Alarm fired:", alarm.name);

  // Periodic calendar refresh
  if (alarm.name === "poll-calendar") {
    await syncCalendar();
  }

  // Lecture notification alarm
  if (alarm.name.startsWith("lecture-")) {
    const stored = await chrome.storage.local.get(`alarm-${alarm.name}`);
    const info = stored[`alarm-${alarm.name}`];
    if (info) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: "📅 Lecture in 30 minutes",
        message: `${info.title} · ${info.time}`,
      });
    }
  }
});

// Opens side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// ── Register recurring alarms ─────────────────────────────
function setupAlarms() {
  chrome.alarms.create("poll-calendar", { periodInMinutes: 15 });
  chrome.alarms.create("poll-gmail", { periodInMinutes: 5 });
  console.log("[AcademicAI] Alarms registered ✓");
}

// ── Fetch and cache calendar events ──────────────────────
async function syncCalendar() {
  try {
    const events = await fetchUpcomingEvents(14);

    // Save to local storage — UI reads from here
    await chrome.storage.local.set({
      calendarEvents: events,
      lastCalendarSync: Date.now(),
    });

    // Schedule a notification alarm for each upcoming event
    for (const event of events) {
      await scheduleLectureAlarm(event, 30);
    }

    console.log(`[AcademicAI] Synced ${events.length} events ✓`);
  } catch (err) {
    console.error("[AcademicAI] Calendar sync failed:", err);
  }
}
