/**
 * BACKGROUND SERVICE WORKER
 * Minimal — just wires alarms to the Orchestrator.
 * All logic lives in agents/.
 */

import { setupAlarms, handleAlarm, initialSync, manualSync } from './orchestrator.js';

// ── Top-level listeners (MV3 requirement) ─────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  setupAlarms();
  initialSync();
});

chrome.runtime.onStartup.addListener(() => {
  setupAlarms();
  initialSync();
});

chrome.alarms.onAlarm.addListener(handleAlarm);

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// ── Messages from sidepanel ───────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handle = async () => {
    switch (msg.type) {
      case 'syncAll':      await manualSync('all');           break;
      case 'syncCalendar': await manualSync('calendar');      break;
      case 'syncGmail':    await manualSync('email');         break;
      default: break;
    }
    return { ok: true };
  };
  handle().then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
  return true; // keep channel open for async
});
