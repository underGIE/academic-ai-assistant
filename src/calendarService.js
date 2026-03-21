// ============================================================
// CALENDAR SERVICE
// Responsible for: OAuth token, fetching events, formatting
// ============================================================

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

// ── Get OAuth token ───────────────────────────────────────
// chrome.identity handles the entire login flow for us
// interactive: true means it shows the Google login popup
export async function getGoogleToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError.message);
      } else {
        resolve(token);
      }
    });
  });
}

// ── Clear expired token ───────────────────────────────────
export function removeToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}

// ── Fetch events for next N days ──────────────────────────
export async function fetchUpcomingEvents(daysAhead = 14) {
  const token = await getGoogleToken();
  const now = new Date().toISOString();
  const future = new Date(
    Date.now() + daysAhead * 24 * 60 * 60 * 1000,
  ).toISOString();

  const params = new URLSearchParams({
    singleEvents: "true", // expands recurring events into individual instances
    orderBy: "startTime", // sort by time ascending
    timeMin: now,
    timeMax: future,
    maxResults: "50",
  });

  const res = await fetch(
    `${CALENDAR_API}/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  // Token expired → clear it and retry once
  if (res.status === 401) {
    await removeToken(token);
    return fetchUpcomingEvents(daysAhead);
  }

  const data = await res.json();
  return data.items || [];
}

// ── Find the next upcoming event ──────────────────────────
export function getNextEvent(events) {
  const now = Date.now();
  return (
    events.find((e) => {
      const start = new Date(e.start?.dateTime || e.start?.date).getTime();
      return start > now;
    }) || null
  );
}

// ── Format time: "14:00" ──────────────────────────────────
export function formatTime(event) {
  if (!event.start?.dateTime) return "All day";
  return new Date(event.start.dateTime).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Format date: "Monday, March 21" ──────────────────────
export function formatDate(event) {
  const d = new Date(event.start?.dateTime || event.start?.date);
  return d.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// ── Format countdown: "in 2h 30m", "Tomorrow at 14:00" ───
export function formatCountdown(event) {
  const start = new Date(event.start?.dateTime || event.start?.date);
  const diffMs = start - Date.now();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffMins < 1) return "Starting now";
  if (diffMins < 60) return `in ${diffMins} min`;
  if (diffHrs < 24) return `in ${diffHrs}h ${diffMins % 60}m`;
  if (diffDays === 1) return `Tomorrow at ${formatTime(event)}`;
  return `${start.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}`;
}

// ── Schedule a Chrome alarm before a lecture ─────────────
export function scheduleLectureAlarm(events) {
  const now = Date.now();
  events.forEach((event) => {
    const startStr = event.start?.dateTime || event.start?.date;
    if (!startStr) return;
    const startTime = new Date(startStr).getTime();
    if (isNaN(startTime) || !isFinite(startTime)) return; // ← guard added
    const alarmTime = startTime - 30 * 60 * 1000;
    if (alarmTime <= now) return;
    const name = `lecture-${event.summary || "event"}`;
    chrome.alarms.create(name, { when: alarmTime });
  });
}
