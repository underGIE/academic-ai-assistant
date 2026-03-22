/**
 * NOTIFICATION AGENT
 * Decides WHAT to notify about and WHEN.
 * Avoids spamming — each event notifies only once.
 * Runs from background service worker via chrome.alarms.
 */

function getStorage(keys) { return new Promise(r => chrome.storage.local.get(keys, r)); }
function setStorage(obj)  { return new Promise(r => chrome.storage.local.set(obj, r)); }

function notify(id, title, message, priority = 0) {
  return new Promise(r => chrome.notifications.create(`academic-${id}`, {
    type:     'basic',
    iconUrl:  'icons/icon48.png',
    title,
    message,
    priority
  }, r));
}

// ── Main run ─────────────────────────────────────────────────────
export async function runNotificationAgent() {
  console.log('[NotificationAgent] Checking what to notify…');
  const {
    calendarEvents   = [],
    emailsToNotify   = [],
    moodleData       = null,
    notifAgentState  = {}
  } = await getStorage(['calendarEvents','emailsToNotify','moodleData','notifAgentState']);

  const fired    = new Set(notifAgentState.fired || []);
  const newFired = [];
  const now      = Date.now();

  // ── 1. Lecture starting in 30 min ──────────────────────────────
  calendarEvents.forEach(event => {
    const start = new Date(event.start?.dateTime || event.start?.date).getTime();
    const diff  = start - now;
    if (diff > 0 && diff < 35 * 60 * 1000) {   // within 35 minutes
      const key = `lecture-${event.id || event.summary}`;
      if (!fired.has(key)) {
        const mins = Math.round(diff / 60000);
        notify(key, '📚 שיעור בעוד קצר!', `${event.summary} — בעוד ${mins} דקות`, 2);
        newFired.push(key);
      }
    }
  });

  // ── 2. Assignment deadlines ────────────────────────────────────
  if (moodleData?.assignments?.length) {
    moodleData.assignments.forEach(a => {
      if (!a.dueDate) return;
      const due  = new Date(a.dueDate).getTime();
      const diff = due - now;
      const days = diff / 86400000;

      // Notify at: 3 days, 1 day, 4 hours before
      const checkpoints = [
        { threshold: 3 * 86400000, label: '3 ימים',  key: `assign-3d-${a.id||a.name}` },
        { threshold: 1 * 86400000, label: 'מחר',     key: `assign-1d-${a.id||a.name}` },
        { threshold: 4 * 3600000,  label: '4 שעות',  key: `assign-4h-${a.id||a.name}` }
      ];

      checkpoints.forEach(cp => {
        if (diff > 0 && diff < cp.threshold * 1.1 && !fired.has(cp.key)) {
          notify(cp.key, '📝 הגשה מתקרבת!',
            `${a.name}\n${a.courseName} — בעוד ${cp.label}`, 2);
          newFired.push(cp.key);
        }
      });

      // Overdue alert (once)
      if (diff < 0 && diff > -86400000) {
        const key = `assign-overdue-${a.id||a.name}`;
        if (!fired.has(key)) {
          notify(key, '⚠️ הגשה עברה את הדדליין!', `${a.name} — ${a.courseName}`, 2);
          newFired.push(key);
        }
      }
    });
  }

  // ── 3. Important emails ────────────────────────────────────────
  emailsToNotify.slice(0, 3).forEach(email => {
    const key = `email-${email.id}`;
    if (!fired.has(key)) {
      const from = email.from?.replace(/<.*>/, '').trim() || 'Unknown';
      notify(key, `📧 מייל חשוב מ-${from}`, email.subject, 1);
      newFired.push(key);
    }
  });

  // ── 4. Daily morning summary (8:00 AM) ─────────────────────────
  const todayKey = `daily-${new Date().toDateString()}`;
  const hour     = new Date().getHours();
  if (hour >= 8 && hour <= 9 && !fired.has(todayKey)) {
    const upcoming = calendarEvents
      .filter(e => {
        const d = new Date(e.start?.dateTime || e.start?.date);
        return d.toDateString() === new Date().toDateString();
      });
    const dueSoon = (moodleData?.assignments || [])
      .filter(a => a.dueDate && (new Date(a.dueDate) - now) < 3 * 86400000 && new Date(a.dueDate) > now);

    if (upcoming.length || dueSoon.length) {
      const parts = [];
      if (upcoming.length)  parts.push(`${upcoming.length} שיעורים היום`);
      if (dueSoon.length)   parts.push(`${dueSoon.length} הגשות קרובות`);
      notify(todayKey, '☀️ בוקר טוב! סיכום יומי', parts.join(' · '), 0);
      newFired.push(todayKey);
    }
  }

  // Save updated fired set
  await setStorage({
    notifAgentState: {
      fired: [...fired, ...newFired].slice(-200),
      lastRun: now
    }
  });

  console.log(`[NotificationAgent] Done: ${newFired.length} notifications fired`);
  return newFired;
}
