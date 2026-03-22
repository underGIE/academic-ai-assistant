/**
 * ORCHESTRATOR
 * The central scheduler that runs all agents in the right order.
 * Called by background.js alarms.
 *
 * Agent run schedule:
 *   Every  5 min → Email Agent
 *   Every 15 min → Notification Agent
 *   Every 60 min → Calendar sync
 *   Every 6 hrs  → Content Agent (heavy, uses Gemini)
 *   Weekly       → UX Suggestions
 *
 * Moodle scraping runs from the sidepanel (needs browser context for cookies + DOM).
 */

import { runEmailAgent }        from './agents/emailAgent.js';
import { runNotificationAgent } from './agents/notificationAgent.js';
import { generateUXSuggestions } from './agents/masterAgent.js';
import { fetchUpcomingEvents, scheduleLectureAlarm } from './calendarService.js';

function getStorage(keys) { return new Promise(r => chrome.storage.local.get(keys, r)); }
function setStorage(obj)  { return new Promise(r => chrome.storage.local.set(obj, r)); }

// ── Setup all alarms ──────────────────────────────────────────────
// Rate limit budget (Gemini free tier: 10 RPM, ~500 RPD):
//   - Email AI scoring: max 8 calls per run, runs every 30 min = max 128 calls/day on emails
//   - Content agent: only runs on-demand (user clicks "Generate Guide")
//   - Chat: on user message only
//   - UX suggestions: every 2 days = ~1 call per 2 days
// Total worst case: ~130 calls/day, well within 500 RPD.
export function setupAlarms() {
  chrome.alarms.create('agent-email',        { periodInMinutes: 30 }); // was 5 — 30 is enough
  chrome.alarms.create('agent-notification', { periodInMinutes: 15 });
  chrome.alarms.create('agent-calendar',     { periodInMinutes: 60 });
  chrome.alarms.create('agent-ux',           { periodInMinutes: 60 * 24 * 2 }); // every 2 days
}

// ── Handle alarm events ──────────────────────────────────────────
export async function handleAlarm(alarm) {
  console.log(`[Orchestrator] Alarm: ${alarm.name}`);

  switch (alarm.name) {

    case 'agent-email':
      try { await runEmailAgent(); }
      catch (e) { console.error('[Orchestrator] Email agent failed:', e.message); }
      // After email runs, check notifications
      try { await runNotificationAgent(); }
      catch (e) { console.error('[Orchestrator] Notification agent failed:', e.message); }
      break;

    case 'agent-notification':
      try { await runNotificationAgent(); }
      catch (e) { console.error('[Orchestrator] Notification agent failed:', e.message); }
      break;

    case 'agent-calendar':
      try {
        const events = await fetchUpcomingEvents(7);
        await setStorage({ calendarEvents: events, calendarLastSync: Date.now() });
        scheduleLectureAlarm(events);
        // After calendar sync, check notifications
        await runNotificationAgent();
      } catch (e) { console.error('[Orchestrator] Calendar agent failed:', e.message); }
      break;

    case 'agent-ux':
      try { await generateUXSuggestions(); }
      catch (e) { console.warn('[Orchestrator] UX agent failed:', e.message); }
      break;
  }
}

// ── Initial full sync (on install / startup) ─────────────────────
export async function initialSync() {
  console.log('[Orchestrator] Running initial sync…');

  // 1. Calendar
  try {
    const events = await fetchUpcomingEvents(7);
    await setStorage({ calendarEvents: events, calendarLastSync: Date.now() });
    scheduleLectureAlarm(events);
  } catch (e) { console.warn('[Orchestrator] Calendar sync failed:', e.message); }

  // 2. Emails
  try { await runEmailAgent(); }
  catch (e) { console.warn('[Orchestrator] Email agent failed:', e.message); }

  // 3. Notifications
  try { await runNotificationAgent(); }
  catch (e) { console.warn('[Orchestrator] Notification agent failed:', e.message); }

  console.log('[Orchestrator] Initial sync complete');
}

// ── Manual sync triggered from UI ────────────────────────────────
export async function manualSync(type = 'all') {
  if (type === 'all' || type === 'calendar') {
    const events = await fetchUpcomingEvents(7);
    await setStorage({ calendarEvents: events, calendarLastSync: Date.now() });
    scheduleLectureAlarm(events);
  }
  if (type === 'all' || type === 'email') {
    await runEmailAgent();
  }
  if (type === 'all' || type === 'notifications') {
    await runNotificationAgent();
  }
}
