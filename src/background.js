// IMPORTANT: All listeners must be at the TOP LEVEL
// The service worker can be killed and restarted at any time

chrome.runtime.onInstalled.addListener(() => {
  console.log("Academic AI Assistant installed");
  setupAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("Academic AI Assistant starting up");
  setupAlarms(); // Re-register alarms on every startup
});

chrome.alarms.onAlarm.addListener((alarm) => {
  console.log("Alarm fired:", alarm.name);
  // Future: handle poll-gmail, poll-calendar, lecture-notify
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

function setupAlarms() {
  // Poll every 15 minutes (minimum in MV3 is 0.5 min = 30 seconds)
  chrome.alarms.create("poll-calendar", { periodInMinutes: 15 });
  chrome.alarms.create("poll-gmail", { periodInMinutes: 5 });
  console.log("Alarms registered");
}
