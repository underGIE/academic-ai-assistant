// ── Helpers ───────────────────────────────────────────────────────
function get(keys) { return new Promise(r => chrome.storage.local.get(keys, r)); }
function set(obj)  { return new Promise(r => chrome.storage.local.set(obj, r)); }
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Tab switching ─────────────────────────────────────────────────
const TABS = ['today','inbox','moodle','chat','setup'];

function showTab(name) {
  TABS.forEach(t => {
    document.getElementById(`tab-${t}`)?.classList.toggle('active', t === name);
    document.getElementById(`panel-${t}`)?.classList.toggle('hidden', t !== name);
  });
  if (name === 'today')  loadTodayTab();
  if (name === 'inbox')  loadInboxTab();
  if (name === 'moodle') loadMoodleTab();
  if (name === 'chat')   loadChatTab();
  if (name === 'setup')  loadSetupTab();
}

// ── TODAY ─────────────────────────────────────────────────────────
async function loadTodayTab() {
  const panel = document.getElementById('panel-today');
  const { calendarEvents=[], moodleData=null } = await get(['calendarEvents','moodleData']);
  let html = `<div style="display:flex;justify-content:flex-end;padding:6px 10px 0;gap:6px">
    <button id="btn-notify-check" title="Check notifications now" style="font-size:11px;padding:3px 8px;border:1px solid #ddd;border-radius:8px;background:#f8f9fa;cursor:pointer">🔔</button>
    <button id="btn-sync-calendar" title="Sync calendar" style="font-size:11px;padding:3px 8px;border:1px solid #ddd;border-radius:8px;background:#f8f9fa;cursor:pointer">🔄</button>
  </div>`;

  const now    = new Date();
  const sorted = calendarEvents
    .filter(e => new Date(e.start?.dateTime||e.start?.date) >= now)
    .sort((a,b) => new Date(a.start?.dateTime||a.start?.date) - new Date(b.start?.dateTime||b.start?.date));

  if (sorted.length) {
    const next = sorted[0], rest = sorted.slice(1,5);
    const start = new Date(next.start?.dateTime||next.start?.date);
    const diff  = Math.round((start-now)/60000);
    const cd    = diff<60?`${diff}m`:diff<1440?`${Math.round(diff/60)}h`:`${Math.round(diff/1440)}d`;
    html += `<div class="next-event-card">
      <div class="next-label">⚡ Up Next</div>
      <div class="event-title">${esc(next.summary||'')}</div>
      <div class="event-time">${formatTime(start)} · In ${cd}</div>
      ${next.location?`<div class="event-loc">📍 ${esc(next.location)}</div>`:''}
    </div>`;
    if (rest.length) {
      html += `<div class="section-label">Coming Up</div>`;
      rest.forEach(e=>{
        const s=new Date(e.start?.dateTime||e.start?.date);
        html+=`<div class="event-row"><span class="event-dot">•</span>
          <span class="event-row-title">${esc(e.summary||'')}</span>
          <span class="event-row-time">${formatDate(s)}</span></div>`;
      });
    }
  } else {
    html += `<div class="empty-state"><span>📅</span><p>No upcoming events</p></div>`;
  }

  // Assignments
  if (moodleData?.assignments?.length) {
    const overdue  = moodleData.assignments.filter(a=>a.dueDate&&new Date(a.dueDate)<now).slice(0,3);
    const upcoming = moodleData.assignments.filter(a=>a.dueDate&&new Date(a.dueDate)>=now)
      .sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate)).slice(0,5);

    if (overdue.length) {
      html += `<div class="section-label" style="color:#e74c3c">⚠️ Overdue</div>`;
      overdue.forEach(a=>{html+=`<div class="event-row overdue-row">
        <span class="event-dot" style="color:#e74c3c">!</span>
        <div style="flex:1"><div class="event-row-title">${esc(a.name)}</div>
        <div style="font-size:10px;color:#e74c3c">${esc(a.courseName||'')}</div></div>
        <span class="event-row-time" style="color:#e74c3c">${fmtDate(a.dueDate)}</span></div>`;});
    }
    if (upcoming.length) {
      html += `<div class="section-label">📝 Deadlines</div>`;
      upcoming.forEach(a=>{
        const d=Math.ceil((new Date(a.dueDate)-now)/86400000);
        const c=d<=2?'#e74c3c':d<=5?'#e67e22':'#888';
        html+=`<div class="event-row">
          <span class="event-dot" style="color:#3498db">✎</span>
          <div style="flex:1"><div class="event-row-title">${esc(a.name)}</div>
          <div style="font-size:10px;color:#666">${esc(a.courseName||'')}</div></div>
          <span class="event-row-time" style="color:${c}">${d}d</span></div>`;
      });
    }
  } else {
    html += `<div style="margin:10px;padding:10px 12px;background:#f0f4f8;border-radius:8px;font-size:11px;color:#888;text-align:center">
      🎓 <a href="#" id="link-moodle" style="color:#1a3a5c">Connect Moodle</a> to see deadlines
    </div>`;
  }

  // Add Event FAB button
  html += `<div style="padding:10px 12px 4px">
    <button id="btn-add-event" style="width:100%;padding:9px;background:#1a3a5c;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">
      ＋ Add Event to Calendar
    </button>
  </div>`;

  panel.innerHTML = html;
  document.getElementById('link-moodle')?.addEventListener('click', e=>{e.preventDefault();showTab('moodle');});
  document.getElementById('btn-add-event')?.addEventListener('click', showAddEventModal);

  // Notification check button
  document.getElementById('btn-notify-check')?.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'syncCalendar' });
      showToast('🔔 Checking notifications…');
    } catch(e) { showToast('Notification check: ' + e.message); }
  });

  // Calendar re-sync button
  document.getElementById('btn-sync-calendar')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-sync-calendar');
    if(btn) btn.textContent = '⏳';
    try {
      await chrome.runtime.sendMessage({ type: 'syncCalendar' });
      await loadTodayTab();
      showToast('✅ Calendar synced');
    } catch(e) { showToast('Sync failed: ' + e.message); }
  });
}

// ── Add Event Modal ────────────────────────────────────────────────
function showAddEventModal() {
  const existing = document.getElementById('add-event-modal');
  if (existing) { existing.remove(); return; }

  const nowLocal = new Date();
  nowLocal.setMinutes(nowLocal.getMinutes() - nowLocal.getTimezoneOffset());
  const defaultStart = nowLocal.toISOString().slice(0,16);
  const defaultEnd   = new Date(nowLocal.getTime() + 60*60*1000).toISOString().slice(0,16);

  const modal = document.createElement('div');
  modal.id = 'add-event-modal';
  modal.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:2px solid #1a3a5c;padding:16px;z-index:1000;box-shadow:0 -4px 20px rgba(0,0,0,0.15)';
  modal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <span style="font-size:13px;font-weight:700;color:#1a3a5c">📅 Add Calendar Event</span>
      <button id="btn-close-modal" style="background:none;border:none;cursor:pointer;font-size:16px;color:#888">✕</button>
    </div>
    <input id="evt-title" type="text" placeholder="Event title *" style="width:100%;padding:7px 9px;border:1px solid #dde;border-radius:6px;font-size:12px;margin-bottom:8px;box-sizing:border-box" />
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <div><label style="font-size:10px;color:#888;display:block;margin-bottom:2px">Start</label>
        <input id="evt-start" type="datetime-local" value="${defaultStart}" style="width:100%;padding:6px;border:1px solid #dde;border-radius:6px;font-size:11px;box-sizing:border-box" /></div>
      <div><label style="font-size:10px;color:#888;display:block;margin-bottom:2px">End</label>
        <input id="evt-end" type="datetime-local" value="${defaultEnd}" style="width:100%;padding:6px;border:1px solid #dde;border-radius:6px;font-size:11px;box-sizing:border-box" /></div>
    </div>
    <input id="evt-desc" type="text" placeholder="Description (optional)" style="width:100%;padding:7px 9px;border:1px solid #dde;border-radius:6px;font-size:12px;margin-bottom:10px;box-sizing:border-box" />
    <button id="btn-create-event" style="width:100%;padding:9px;background:#27ae60;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">
      ✅ Create Event
    </button>
    <div id="evt-status" style="font-size:11px;color:#888;margin-top:6px;text-align:center"></div>`;

  document.body.appendChild(modal);

  document.getElementById('btn-close-modal').addEventListener('click', () => modal.remove());
  document.getElementById('btn-create-event').addEventListener('click', async () => {
    const title = document.getElementById('evt-title')?.value.trim();
    const start = document.getElementById('evt-start')?.value;
    const end   = document.getElementById('evt-end')?.value;
    const desc  = document.getElementById('evt-desc')?.value.trim();
    const status = document.getElementById('evt-status');
    if (!title) { status.style.color='#e74c3c'; status.textContent='Please enter a title'; return; }
    if (!start || !end) { status.style.color='#e74c3c'; status.textContent='Please set start and end time'; return; }
    const btn = document.getElementById('btn-create-event');
    btn.disabled = true; btn.textContent = '⏳ Creating…';
    status.style.color = '#888'; status.textContent = '';
    try {
      const { createCalendarEvent } = await import('./src/calendarService.js');
      await createCalendarEvent({ title, startDateTime: start, endDateTime: end, description: desc });
      showToast('✅ Event created!');
      modal.remove();
      loadTodayTab(); // refresh Today tab
      chrome.runtime.sendMessage({ type: 'syncCalendar' }).catch(() => {});
    } catch(e) {
      btn.disabled = false; btn.textContent = '✅ Create Event';
      status.style.color = '#e74c3c';
      status.textContent = e.message.includes('401') ? 'Auth error — try reconnecting Google' : e.message;
    }
  });
}

function formatTime(d){ return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }
function formatDate(d){
  const t=new Date(),tom=new Date(t); tom.setDate(t.getDate()+1);
  if(d.toDateString()===t.toDateString())   return `Today ${formatTime(d)}`;
  if(d.toDateString()===tom.toDateString()) return `Tomorrow ${formatTime(d)}`;
  return d.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'});
}
function fmtDate(str){ if(!str)return''; return new Date(str).toLocaleDateString([],{month:'short',day:'numeric'}); }

// ── INBOX ─────────────────────────────────────────────────────────
let currentFilter = 'all';

async function loadInboxTab() {
  const panel = document.getElementById('panel-inbox');
  panel.innerHTML = `<div class="empty-state"><span>⏳</span><p>Loading…</p></div>`;
  const { emails=[] } = await get(['emails']);
  if (!emails.length) {
    panel.innerHTML = `<div class="empty-state"><span>📭</span><p>No emails yet.<br>Connect Google in Setup.</p></div>`;
    return;
  }
  renderInbox(emails, panel);
}

function renderInbox(emails, panel) {
  const cats   = ['all','payment','exam','admin','moodle','general'];
  const labels = {all:'All',payment:'💳',exam:'📝 Exam',admin:'📋',moodle:'🎓 Moodle',general:'📄'};
  const counts = {}; cats.forEach(c=>{counts[c]=c==='all'?emails.length:emails.filter(e=>e.category===c).length;});
  const filtered = currentFilter==='all'?emails:emails.filter(e=>e.category===currentFilter);

  let html = `<div class="filter-bar">`;
  cats.forEach(c=>{if(counts[c]===0&&c!=='all')return;
    html+=`<button class="filter-btn${currentFilter===c?' active':''}" data-filter="${c}">${labels[c]} <span class="count-badge">${counts[c]}</span></button>`;
  });
  html+=`</div><div class="email-list">`;

  filtered.sort((a,b)=>(b.importanceScore||0)-(a.importanceScore||0)).forEach(e=>{
    const score    = e.importanceScore||0;
    const scoreDot = score>=8?'🔴':score>=6?'🟡':score>=4?'🟢':'';
    const acctIdx  = e._isBGU ? 1 : 0; // BGU = account index 1 in Gmail
    html+=`<div class="email-card${e.isUnread?' unread':''}" data-id="${esc(e.id||'')}" data-acct="${acctIdx}" style="cursor:pointer" title="Click to open in Gmail">
      <div class="email-header">
        ${e.isUnread?'<span class="unread-dot"></span>':''}
        <span class="email-from">${esc(shortFrom(e.from))}</span>
        ${e._isBGU?'<span style="font-size:9px;color:#1a3a5c;margin-left:3px;font-weight:700">BGU</span>':''}
        <span style="margin-left:auto;font-size:10px">${scoreDot}</span>
        <span class="email-date">${fmtDate(e.date)}</span>
      </div>
      <div class="email-subject">${esc(e.subject)}</div>
      <div class="email-snippet">${esc(e.aiSummary||e.snippet?.slice(0,80)||'')}${!e.aiSummary?'…':''}</div>
    </div>`;
  });
  html+=`</div>`;
  panel.innerHTML = html;

  // Open email in Gmail when clicked
  panel.querySelectorAll('.email-card[data-id]').forEach(card => {
    card.addEventListener('click', () => {
      const id   = card.dataset.id;
      const acct = card.dataset.acct || '0';
      if (id) chrome.tabs.create({ url: `https://mail.google.com/mail/u/${acct}/#inbox/${id}` });
    });
  });

  panel.querySelectorAll('.filter-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{currentFilter=btn.dataset.filter;renderInbox(emails,panel);});
  });
}

function shortFrom(from){
  const m=from?.match(/^"?([^"<]+)"?\s*</); return m?m[1].trim():(from||'').replace(/<.*>/,'').trim();
}

// ── MOODLE TAB ────────────────────────────────────────────────────
let moodleScraping = false;

const MOODLE_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

async function loadMoodleTab() {
  const panel = document.getElementById('panel-moodle');
  const { moodleData, moodleConnected } = await get(['moodleData','moodleConnected']);

  // Never scraped — show connect screen
  if (!moodleConnected || !moodleData) { renderMoodleConnect(panel); return; }

  // Data is fresh (< 6h) — render from cache, no scrape
  const age = Date.now() - (moodleData.lastSync || 0);
  if (age < MOODLE_CACHE_TTL) {
    renderMoodleData(moodleData, panel);
    return;
  }

  // Data is stale — show cached data immediately, then quietly re-sync in background
  renderMoodleData(moodleData, panel);
  const ageH = Math.round(age / 3600000);
  showToast(`ℹ️ Moodle data is ${ageH}h old — re-syncing in background…`);
  try {
    const { fullMoodleSync } = await import('./src/moodleScraper.js');
    const fresh = await fullMoodleSync();
    renderMoodleData(fresh, panel);
    showToast(`✅ Moodle refreshed — ${fresh.courses.length} courses`);
    loadTodayTab();
  } catch(e) {
    console.warn('[Moodle] Background re-sync failed:', e.message);
  }
}

function renderMoodleConnect(panel) {
  panel.innerHTML = `
    <div class="moodle-connect-screen">
      <div style="font-size:44px">🎓</div>
      <h2 style="font-size:14px;font-weight:700;color:#1a3a5c;margin:8px 0">Connect BGU Moodle</h2>
      <p style="font-size:11px;color:#666;margin-bottom:6px;line-height:1.6;max-width:280px">
        The extension will read your courses, assignments, and files directly — no password needed. Just be logged in to Moodle in Chrome.
      </p>
      <button class="setup-btn success" id="btn-moodle-sync" style="margin-top:12px;font-size:12px;padding:10px 22px">
        🔗 Connect &amp; Sync Moodle
      </button>
      <div id="moodle-progress" style="margin-top:14px;width:100%;display:none">
        <div class="progress-bar-bg"><div class="progress-bar-fill" id="progress-fill"></div></div>
        <p id="progress-text" style="font-size:10px;color:#888;margin-top:5px;text-align:center"></p>
      </div>
    </div>`;
  document.getElementById('btn-moodle-sync')?.addEventListener('click', startMoodleSync);
}

async function startMoodleSync() {
  if (moodleScraping) return;
  moodleScraping = true;
  const btn  = document.getElementById('btn-moodle-sync');
  const prog = document.getElementById('moodle-progress');
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');
  btn.disabled = true; btn.textContent = '⏳ Syncing…';
  prog.style.display = 'block';
  try {
    const { fullMoodleSync } = await import('./src/moodleScraper.js');
    const data = await fullMoodleSync((msg,pct)=>{ text.textContent=msg; fill.style.width=`${pct}%`; });
    moodleScraping = false;
    showToast(`✅ Moodle synced — ${data.courses.length} courses`);
    renderMoodleData(data, document.getElementById('panel-moodle'));
    loadTodayTab();
  } catch(err) {
    moodleScraping = false;
    if (err.message==='NOT_LOGGED_IN') {
      document.getElementById('panel-moodle').innerHTML = `
        <div class="moodle-connect-screen">
          <div style="font-size:40px">🔐</div>
          <h2 style="color:#e74c3c;font-size:13px;margin:8px 0">Not logged in to Moodle</h2>
          <p style="font-size:11px;color:#666;margin-bottom:14px">
            Please <a href="https://moodle.bgu.ac.il/moodle/login/index.php" target="_blank" style="color:#1a3a5c">log in to BGU Moodle</a> first.
          </p>
          <button class="setup-btn" id="btn-retry-moodle">↩ Try Again</button>
        </div>`;
      document.getElementById('btn-retry-moodle')?.addEventListener('click', loadMoodleTab);
    } else { showToast('❌ '+err.message); }
  }
}

function renderMoodleData(data, panel) {
  const { courses=[], assignments=[], lastSync } = data;
  const now    = new Date();
  const ageMin = lastSync ? Math.round((Date.now()-lastSync)/60000) : null;
  const ageStr = ageMin == null ? '' : ageMin < 60 ? `${ageMin}m ago` : `${Math.round(ageMin/60)}h ago`;

  // ── 1. Deadlines section (all courses) ────────────────────────
  const allDeadlines = assignments
    .filter(a => a.dueDate)
    .sort((a,b) => new Date(a.dueDate)-new Date(b.dueDate))
    .slice(0, 20);

  const overdueList  = allDeadlines.filter(a => new Date(a.dueDate) < now);
  const upcomingList = allDeadlines.filter(a => new Date(a.dueDate) >= now);

  function deadlineRow(a) {
    const d     = Math.ceil((new Date(a.dueDate)-now)/86400000);
    const color = d < 0 ? '#e74c3c' : d <= 2 ? '#e74c3c' : d <= 5 ? '#e67e22' : '#27ae60';
    const label = d < 0 ? `⚠️ ${Math.abs(d)}d overdue` : d === 0 ? '🔴 Today!' : d === 1 ? '🔴 Tomorrow' : `${d}d left`;
    const date  = new Date(a.dueDate).toLocaleDateString('he-IL',{day:'numeric',month:'short'});
    return `<div class="deadline-row">
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:600;color:#1a3a5c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.name)}</div>
        <div style="font-size:9px;color:#888;margin-top:1px">${esc(a.courseName||'')}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;margin-left:8px">
        <div style="font-size:10px;font-weight:700;color:${color}">${label}</div>
        <div style="font-size:9px;color:#aaa">${date}</div>
      </div>
    </div>`;
  }

  let deadlineHtml = '';
  if (overdueList.length) {
    deadlineHtml += `<div class="deadline-group-label" style="color:#e74c3c">⚠️ OVERDUE (${overdueList.length})</div>`;
    deadlineHtml += overdueList.map(deadlineRow).join('');
  }
  if (upcomingList.length) {
    deadlineHtml += `<div class="deadline-group-label" style="color:#1a3a5c;margin-top:${overdueList.length?'8px':'0'}">📅 Upcoming</div>`;
    deadlineHtml += upcomingList.slice(0,10).map(deadlineRow).join('');
  }
  if (!deadlineHtml) {
    deadlineHtml = `<div style="font-size:11px;color:#aaa;padding:8px 0">No deadlines found. Re-sync if this looks wrong.</div>`;
  }

  // ── 2. Course dropdown options ─────────────────────────────────
  const courseOptions = courses.map((c,i) =>
    `<option value="${i}" data-id="${c.id}">${esc(c.name.length>50?c.name.slice(0,50)+'…':c.name)}</option>`
  ).join('');

  // ── 3. Build full HTML ─────────────────────────────────────────
  let html = `
    <div style="padding:8px 10px 0;display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:10px;color:#aaa">${courses.length} courses · ${ageStr}</span>
      <div style="display:flex;gap:5px">
        <button class="re-sync-btn" id="btn-gen-summaries" title="Generate AI study guides">🧠</button>
        <button class="re-sync-btn" id="btn-re-sync" title="Force re-sync">🔄</button>
      </div>
    </div>

    <!-- Deadlines panel -->
    <div class="moodle-section" style="margin:8px 10px 0">
      <div class="moodle-section-title" style="cursor:pointer;user-select:none" id="toggle-deadlines">
        📅 Deadlines &amp; Assignments
        <span id="deadlines-toggle-icon" style="float:right;font-size:10px;color:#aaa">▲</span>
      </div>
      <div id="deadlines-body" style="padding-top:4px">${deadlineHtml}</div>
    </div>

    <!-- Course picker -->
    <div style="padding:8px 10px 4px">
      <div style="font-size:10px;font-weight:700;color:#1a3a5c;margin-bottom:5px">📚 Course Detail</div>
      <div style="position:relative">
        <select id="course-select" style="width:100%;padding:6px 8px;border:1px solid #dde;border-radius:6px;font-size:11px;background:#fff;color:#1a3a5c;appearance:none;cursor:pointer">
          ${courseOptions}
        </select>
        <span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);pointer-events:none;color:#888;font-size:10px">▼</span>
      </div>
    </div>
    <div id="course-detail-panel" style="padding:0 10px 10px"></div>`;

  panel.innerHTML = html;

  // ── Wire collapse toggle for deadlines ─────────────────────────
  document.getElementById('toggle-deadlines')?.addEventListener('click', () => {
    const body = document.getElementById('deadlines-body');
    const icon = document.getElementById('deadlines-toggle-icon');
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? '' : 'none';
    icon.textContent = hidden ? '▲' : '▼';
  });

  // ── Render selected course detail ──────────────────────────────
  function renderCourseDetail(idx) {
    const course  = courses[idx];
    if (!course) return;
    const detail  = data.courseDetails?.find(d => String(d.courseId) === String(course.id));
    const assigns = assignments.filter(a => String(a.courseId) === String(course.id));
    const vids    = (data.videos || {})[course.id] || [];
    const pnl     = document.getElementById('course-detail-panel');
    let inner = '';

    // AI Study Guide
    inner += `<div class="moodle-section">
      <div class="moodle-section-title">🧠 AI Study Guide</div>
      <div class="ai-summary-box" id="summary-${course.id}">
        <button class="setup-btn" style="font-size:10px;padding:5px 10px" data-course-id="${course.id}" id="btn-summary-${course.id}">
          Generate Study Guide
        </button>
      </div>
    </div>`;

    // Course assignments (mini view)
    if (assigns.length) {
      inner += `<div class="moodle-section"><div class="moodle-section-title">📝 This Course's Tasks</div>`;
      assigns.forEach(a => {
        const d = a.dueDate ? Math.ceil((new Date(a.dueDate)-now)/86400000) : null;
        const c = d===null?'#aaa':d<0?'#e74c3c':d<=2?'#e74c3c':d<=5?'#e67e22':'#27ae60';
        const label = d===null?'No deadline':d<0?'OVERDUE':`${d}d`;
        inner += `<div class="moodle-item">
          <span class="moodle-item-icon">📋</span>
          <span class="moodle-item-name" style="color:#333">${esc(a.name)}</span>
          <span style="font-size:9px;color:${c};margin-left:auto;flex-shrink:0;font-weight:600">${label}</span>
        </div>`;
      });
      inner += `</div>`;
    }

    // Videos
    if (vids.length) {
      inner += `<div class="moodle-section"><div class="moodle-section-title">🎥 Lecture Videos (${vids.length})</div>`;
      vids.slice(0,8).forEach(v => {
        inner += `<div class="moodle-item">
          <span class="moodle-item-icon">▶️</span>
          <a href="${esc(v.url||'#')}" target="_blank" class="moodle-item-name">${esc(v.title)}</a>
          ${v.date?`<span style="font-size:9px;color:#aaa;margin-left:auto">${esc(v.date)}</span>`:''}
        </div>`;
      });
      inner += `</div>`;
    }

    // Section files
    if (detail?.sections?.length) {
      detail.sections.forEach(sec => {
        const resources = (sec.items||[]).filter(it => ['resource','url','folder','page'].includes(it.type));
        if (!resources.length) return;
        inner += `<div class="moodle-section"><div class="moodle-section-title">📁 ${esc(sec.title)}</div>`;
        resources.forEach(item => {
          const icon = item.type==='url'?'🔗':item.type==='folder'?'📂':'📄';
          inner += `<div class="moodle-item">
            <span class="moodle-item-icon">${icon}</span>
            <a href="${esc(item.url||'#')}" target="_blank" class="moodle-item-name">${esc(item.name)}</a>
          </div>`;
        });
        inner += `</div>`;
      });
    }

    if (!assigns.length && !vids.length && !detail?.sections?.length) {
      inner += `<div class="empty-state" style="padding:18px"><span>📂</span><p>No content yet.<br>Re-sync may help.</p></div>`;
    }

    pnl.innerHTML = inner;
    loadCachedSummary(course.id);
    pnl.querySelector(`#btn-summary-${course.id}`)?.addEventListener('click', () => generateSummary(course.id));
  }

  // Course dropdown change
  const sel = document.getElementById('course-select');
  sel?.addEventListener('change', () => renderCourseDetail(+sel.value));
  renderCourseDetail(0); // render first course

  // AI Summaries button
  document.getElementById('btn-gen-summaries')?.addEventListener('click', generateAllSummaries);

  // Re-sync button — force fresh scrape regardless of cache
  document.getElementById('btn-re-sync')?.addEventListener('click', async () => {
    panel.innerHTML = `<div class="moodle-connect-screen">
      <div style="font-size:34px">🔄</div>
      <p style="font-size:11px;color:#666;margin:10px 0">Re-syncing Moodle…</p>
      <div class="progress-bar-bg"><div class="progress-bar-fill" id="progress-fill" style="width:0%"></div></div>
      <p id="progress-text" style="font-size:10px;color:#888;margin-top:5px;text-align:center"></p>
    </div>`;
    try {
      const { fullMoodleSync } = await import('./src/moodleScraper.js');
      const fresh = await fullMoodleSync((msg,pct) => {
        const el = document.getElementById('progress-text');
        const fill = document.getElementById('progress-fill');
        if(el) el.textContent = msg;
        if(fill) fill.style.width = `${pct}%`;
      });
      renderMoodleData(fresh, panel);
      showToast(`✅ Moodle refreshed — ${fresh.courses.length} courses`);
      loadTodayTab();
    } catch(e) {
      showToast('❌ Re-sync failed: ' + e.message);
      renderMoodleData(data, panel); // restore old data
    }
  });
}

async function loadCachedSummary(courseId) {
  const { courseStudyGuides={} } = await get(['courseStudyGuides']);
  const guide = courseStudyGuides[courseId];
  if (!guide) return;
  renderSummary(courseId, guide.summary);
}

function renderSummary(courseId, text) {
  const box = document.getElementById(`summary-${courseId}`);
  if (!box) return;
  // Convert markdown-style headers to readable HTML
  const html = text
    .replace(/^## (.+)$/gm, '<div class="summary-header">$1</div>')
    .replace(/^- (.+)$/gm,  '<div class="summary-item">• $1</div>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '<br>');
  box.innerHTML = `<div class="summary-content">${html}</div>`;
}

async function generateSummary(courseId) {
  const btn = document.getElementById(`btn-summary-${courseId}`);
  const box = document.getElementById(`summary-${courseId}`);
  if (btn) { btn.textContent='⏳ Generating…'; btn.disabled=true; }
  try {
    const { getCourseStudyGuide } = await import('./src/agents/contentAgent.js');
    const guide = await getCourseStudyGuide(courseId);
    if (guide) renderSummary(courseId, guide.summary);
    else { if(box) box.innerHTML='<p style="font-size:11px;color:#e74c3c">Could not generate. Check API key in Setup.</p>'; }
  } catch(e) {
    if(box) box.innerHTML=`<p style="font-size:11px;color:#e74c3c">Error: ${esc(e.message)}</p>`;
  }
}

async function generateAllSummaries() {
  showToast('🧠 Generating AI summaries for all courses…');
  try {
    const { runContentAgent } = await import('./src/agents/contentAgent.js');
    await runContentAgent((msg,pct)=>{ showToast(`${pct}% — ${msg}`); });
    const { moodleData } = await get(['moodleData']);
    if (moodleData) renderMoodleData(moodleData, document.getElementById('panel-moodle'));
    showToast('✅ All study guides generated!');
  } catch(e) { showToast('❌ '+e.message); }
}

// ── CHAT ──────────────────────────────────────────────────────────
let chatLoaded = false;
let conversationHistory = [];

function loadChatTab() {
  if (chatLoaded) return;
  chatLoaded = true;
  const panel = document.getElementById('panel-chat');
  panel.innerHTML = `
    <div id="chat-messages"></div>
    <div class="quick-prompts">
      <button class="quick-btn" data-q="מה יש לי היום?">📅 היום</button>
      <button class="quick-btn" data-q="מה ההגשות הקרובות שלי?">📝 הגשות</button>
      <button class="quick-btn" data-q="יש מיילים חשובים?">📧 מיילים</button>
      <button class="quick-btn" data-q="תעזור לי להתכונן למבחן הבא">🎯 מבחן</button>
    </div>
    <div class="chat-input-row">
      <input id="chat-input" type="text" placeholder="שאל את הסוכן הראשי…" />
      <button id="chat-send">שלח</button>
    </div>`;

  // Check API key BEFORE showing welcome — clear guidance if missing
  get(['geminiApiKey','conversationHistory']).then(({geminiApiKey, conversationHistory:h=[]})=>{
    conversationHistory = h;
    if (!geminiApiKey) {
      addMsg('assistant','👋 שלום! כדי להפעיל אותי, הוסף את מפתח Gemini API בלשונית ⚙️ Setup → שמור → חזור לכאן.');
      document.getElementById('chat-input').disabled = true;
      document.getElementById('chat-send').disabled  = true;
      // Link to setup tab
      const btn = document.createElement('button');
      btn.className = 'quick-btn'; btn.style.marginTop = '6px';
      btn.textContent = '⚙️ פתח Setup';
      btn.addEventListener('click', () => showTab('setup'));
      document.querySelector('.quick-prompts').prepend(btn);
    } else {
      addMsg('assistant','👋 שלום! אני הסוכן הראשי שלך — מחובר לכל הנתונים: לוח זמנים, מיילים, קורסי המודל, ומשימות. שאל אותי כל דבר!');
    }
  });

  const input=document.getElementById('chat-input');
  const send =document.getElementById('chat-send');

  async function sendMsg(text) {
    if (!text.trim()) return;
    addMsg('user',text); input.value='';
    const lid=addMsg('assistant','⏳ חושב…',true);
    try {
      const {askMaster} = await import('./src/agents/masterAgent.js');
      const {text:reply,refs} = await askMaster(text, conversationHistory);
      conversationHistory.push({role:'user',content:text},{role:'assistant',content:reply});
      updateMsg(lid,reply);
      if (refs.length) {
        const icons={event:'📅',email:'📧',assignment:'📝',course:'🎓',overdue:'⚠️'};
        const html=refs.map(r=>`<span class="msg-ref">${icons[r.type]||'•'} ${esc(r.title)}</span>`).join(' ');
        appendRefs(lid,html);
      }
    } catch(e){updateMsg(lid,`❌ ${e.message}`);}
  }

  send.addEventListener('click',()=>sendMsg(input.value));
  input.addEventListener('keydown',e=>{if(e.key==='Enter')sendMsg(input.value);});
  panel.querySelectorAll('.quick-btn').forEach(b=>b.addEventListener('click',()=>sendMsg(b.dataset.q)));
}

let msgN=0;
function addMsg(role,text,loading=false){
  const id=`m${++msgN}`, div=document.createElement('div');
  div.id=id; div.className=`msg msg-${role}${loading?' msg-loading':''}`;
  div.textContent=text;
  document.getElementById('chat-messages').appendChild(div);
  div.scrollIntoView({behavior:'smooth'});
  return id;
}
function updateMsg(id,text){const el=document.getElementById(id);if(el){el.textContent=text;el.classList.remove('msg-loading');}}
function appendRefs(id,html){const el=document.getElementById(id);if(el){const r=document.createElement('div');r.style.marginTop='5px';r.innerHTML=html;el.appendChild(r);}}

// ── BGU EMAIL — OAuth via launchWebAuthFlow ───────────────────────
// Uses implicit token flow (response_type=token) so no client secret is needed.
// The access token expires in 1 hour; we silently refresh it each time the
// extension opens. If silent refresh fails the user gets a "reconnect" prompt.
const GMAIL_SCOPE    = 'https://www.googleapis.com/auth/gmail.readonly';
// ⚠️  Must be "Web application" type in Google Cloud Console (NOT "Chrome Extension" type)
// "Chrome Extension" type only works with chrome.identity.getAuthToken()
// launchWebAuthFlow requires "Web application" type with the chromiumapp.org redirect URI registered
const CLIENT_ID      = '856203600469-qb04giv206s7iml703pb9j0db9etlc0e.apps.googleusercontent.com';
const REDIRECT_URI   = `https://${chrome.runtime.id}.chromiumapp.org/`;

async function launchBGUOAuth(interactive = true) {
  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'token',
    scope:         GMAIL_SCOPE,
    prompt:        interactive ? 'select_account' : 'none', // 'none' = silent refresh
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive }, (redirectUrl) => {
      if (chrome.runtime.lastError || !redirectUrl) {
        return reject(new Error(chrome.runtime.lastError?.message || 'Auth cancelled'));
      }
      // Token is in the URL fragment: #access_token=...&expires_in=3600&...
      const hash   = new URL(redirectUrl).hash.slice(1);
      const parsed = new URLSearchParams(hash);
      const token  = parsed.get('access_token');
      const expiry = Date.now() + Number(parsed.get('expires_in') || 3600) * 1000;
      if (!token) return reject(new Error('No token in response'));
      resolve({ token, expiry });
    });
  });
}

async function connectBGUEmail() {
  const statusEl = document.getElementById('bgu-email-status');
  if (statusEl) { statusEl.textContent = '🔄 Connecting…'; statusEl.style.color = '#888'; }
  try {
    const { token, expiry } = await launchBGUOAuth(true);
    // Fetch the account email to confirm which account was connected
    const profileRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const profile = await profileRes.json();
    const email   = profile.emailAddress || 'BGU account';
    await set({ bguEmailToken: token, bguEmailExpiry: expiry, bguEmailAddress: email });
    showToast(`✅ ${email} connected!`);
    loadSetupTab(); // refresh UI
  } catch (e) {
    if (statusEl) { statusEl.textContent = '❌ Failed — try again'; statusEl.style.color = '#e74c3c'; }
    showToast('BGU connect failed: ' + e.message);
  }
}

// Try silent token refresh — called when the extension opens
async function refreshBGUTokenIfNeeded() {
  const { bguEmailToken, bguEmailExpiry } = await get(['bguEmailToken','bguEmailExpiry']);
  if (!bguEmailToken) return; // not connected
  const expiresIn = (bguEmailExpiry || 0) - Date.now();
  if (expiresIn > 5 * 60 * 1000) return; // still valid for >5 min, nothing to do
  // Try silent refresh
  try {
    const { token, expiry } = await launchBGUOAuth(false);
    await set({ bguEmailToken: token, bguEmailExpiry: expiry });
    console.log('[BGU] Token silently refreshed');
  } catch {
    // Silent refresh failed (user logged out). Keep old token for now,
    // emailAgent will fail gracefully and the Setup tab will show reconnect prompt.
    console.warn('[BGU] Silent token refresh failed — user may need to reconnect');
  }
}

// ── SETUP ─────────────────────────────────────────────────────────
async function loadSetupTab() {
  const { googleConnected, geminiApiKey, moodleData, moodleConnected,
          uxSuggestions=[], bguEmailAddress, bguEmailToken, bguEmailExpiry } =
    await get(['googleConnected','geminiApiKey','moodleData','moodleConnected',
               'uxSuggestions','bguEmailAddress','bguEmailToken','bguEmailExpiry']);

  const gEl=document.getElementById('google-status');
  if(gEl) gEl.textContent=googleConnected?'✅ Connected':'❌ Not connected';

  // BGU email status
  const bEl = document.getElementById('bgu-email-status');
  const discBtn = document.getElementById('btn-bgu-disconnect');
  if (bEl) {
    const isConnected = bguEmailToken && bguEmailExpiry > Date.now() - 3600000;
    if (isConnected && bguEmailAddress) {
      bEl.textContent  = `✅ ${bguEmailAddress}`;
      bEl.style.color  = '#27ae60';
      if (discBtn) discBtn.style.display = 'inline-block';
    } else if (bguEmailToken) {
      // Token exists but may be expired
      bEl.textContent = '⚠️ Token expired — reconnect';
      bEl.style.color = '#e67e22';
      if (discBtn) discBtn.style.display = 'none';
    } else {
      bEl.textContent = '❌ Not connected';
      bEl.style.color = '#e74c3c';
      if (discBtn) discBtn.style.display = 'none';
    }
  }

  const mEl=document.getElementById('moodle-setup-status');
  if(mEl){
    mEl.textContent=moodleConnected&&moodleData?`✅ ${moodleData.courses?.length||0} courses`:'❌ Not connected';
    mEl.style.color=moodleConnected?'#27ae60':'#e74c3c';
  }

  // Show API key as masked placeholder if saved
  const kEl=document.getElementById('gemini-key');
  if(kEl) kEl.placeholder=geminiApiKey?'●●●●●●●● (saved — change to update)':'AIza…';

  // UX suggestions
  const uxEl=document.getElementById('ux-suggestions');
  if(uxEl&&uxSuggestions.length){
    const pending=uxSuggestions.filter(s=>s.status==='pending');
    if(pending.length){
      uxEl.innerHTML=`<p style="font-size:11px;font-weight:600;color:#1a3a5c;margin-bottom:6px">💡 ${pending.length} UX Suggestion${pending.length>1?'s':''} from AI Agent:</p>`+
        pending.map(s=>`<div class="ux-card">
          <div style="font-size:11px;font-weight:600">${esc(s.title)}</div>
          <div style="font-size:10px;color:#666;margin:3px 0">${esc(s.description)}</div>
          <div style="display:flex;gap:6px;margin-top:4px">
            <button class="setup-btn" style="padding:3px 8px;font-size:10px" data-ux-id="${s.id}" data-action="approve">✅ Approve</button>
            <button class="setup-btn secondary" style="padding:3px 8px;font-size:10px" data-ux-id="${s.id}" data-action="decline">✗ Decline</button>
          </div>
        </div>`).join('');

      uxEl.querySelectorAll('[data-ux-id]').forEach(btn=>{
        btn.addEventListener('click', async()=>{
          const {uxSuggestions:s=[]}=await get(['uxSuggestions']);
          const idx=s.findIndex(x=>String(x.id)===btn.dataset.uxId);
          if(idx>=0) s[idx].status=btn.dataset.action==='approve'?'approved':'declined';
          await set({uxSuggestions:s});
          if(btn.dataset.action==='approve') showToast('✅ Approved — will be built in next mission!');
          loadSetupTab();
        });
      });
    } else { uxEl.innerHTML='<p style="font-size:11px;color:#999">No pending suggestions.</p>'; }
  }

  loadCourses(moodleData);
}

async function loadCourses(moodleData){
  const list=document.getElementById('courses-list'); if(!list)return;
  if(moodleData?.courses?.length){
    list.innerHTML=`<p style="font-size:10px;color:#27ae60;margin-bottom:5px">✅ Auto from Moodle:</p>`+
      moodleData.courses.slice(0,6).map(c=>`<div class="course-card"><div class="course-info"><strong style="font-size:11px">${esc(c.name)}</strong></div></div>`).join('');
    return;
  }
  const {courses=[]}=await get(['courses']);
  list.innerHTML=courses.length
    ?courses.map((c,i)=>`<div class="course-card"><div class="course-info"><strong style="font-size:11px">${esc(c.name)}</strong><span style="font-size:10px;color:#666"> · ${esc(c.lecturer)}</span></div><button class="btn-remove-course" data-index="${i}">✕</button></div>`).join('')
    :`<p style="font-size:10px;color:#999">Connect Moodle or add manually.</p>`;
  list.querySelectorAll('.btn-remove-course').forEach(btn=>{
    btn.addEventListener('click',async()=>{const{courses:c=[]}=await get(['courses']);c.splice(+btn.dataset.index,1);await set({courses:c});loadCourses(null);});
  });
}

function attachSetupListeners(){
  // Populate redirect URI box so user can copy it to Google Cloud Console
  const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
  const uriDisplay  = document.getElementById('redirect-uri-display');
  const copyBtn     = document.getElementById('btn-copy-redirect');
  if (uriDisplay) uriDisplay.textContent = redirectUri;
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(redirectUri).then(() => {
        copyBtn.textContent = '✅ Copied!';
        setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 2000);
      }).catch(() => {
        // fallback: select the text
        uriDisplay?.select?.();
        document.execCommand('copy');
        copyBtn.textContent = '✅ Copied!';
        setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 2000);
      });
    });
  }

  document.getElementById('btn-google-connect')?.addEventListener('click',async()=>{
    const el=document.getElementById('google-status'); el.textContent='🔄…';
    try{ await chrome.runtime.sendMessage({type:'syncAll'}); await set({googleConnected:true}); el.textContent='✅ Connected'; loadInboxTab(); }
    catch(e){ el.textContent='❌ '+e.message; }
  });
  document.getElementById('btn-bgu-connect')?.addEventListener('click', connectBGUEmail);
  document.getElementById('btn-bgu-disconnect')?.addEventListener('click', async()=>{
    await set({ bguEmailToken: null, bguEmailExpiry: null, bguEmailAddress: null });
    showToast('BGU email disconnected');
    loadSetupTab();
  });
  document.getElementById('btn-save-apikey')?.addEventListener('click',async()=>{
    const key=document.getElementById('gemini-key')?.value.trim();
    if(key){
      await set({geminiApiKey:key});
      showToast('API key saved ✅');
      // If chat was blocked waiting for key, reset so it reloads properly
      chatLoaded = false;
      const input = document.getElementById('chat-input');
      const send  = document.getElementById('chat-send');
      if(input) input.disabled = false;
      if(send)  send.disabled  = false;
    }
  });
  document.getElementById('btn-go-moodle')?.addEventListener('click',()=>showTab('moodle'));
  document.getElementById('btn-add-course')?.addEventListener('click',async()=>{
    const name=document.getElementById('course-name')?.value.trim();
    const lecturer=document.getElementById('course-lecturer')?.value.trim();
    const notes=document.getElementById('course-notes')?.value.trim();
    if(!name||!lecturer){showToast('Enter name and lecturer ⚠️');return;}
    const{courses=[]}=await get(['courses']); courses.push({name,lecturer,notes}); await set({courses});
    ['course-name','course-lecturer','course-notes'].forEach(id=>{document.getElementById(id).value='';});
    loadCourses(null); showToast(`${name} added ✅`);
  });
  document.getElementById('btn-sync-now')?.addEventListener('click',async()=>{
    const btn=document.getElementById('btn-sync-now'); btn.textContent='⏳…'; btn.disabled=true;
    try{await chrome.runtime.sendMessage({type:'syncAll'});showToast('Sync complete ✅');loadTodayTab();}
    catch(e){showToast('Error: '+e.message);}
    btn.textContent='🔄 Sync'; btn.disabled=false;
  });
}

// ── TOAST ─────────────────────────────────────────────────────────
function showToast(msg){
  let t=document.getElementById('toast');
  if(!t){t=document.createElement('div');t.id='toast';document.body.appendChild(t);}
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2800);
}

// ── INIT ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  attachSetupListeners();
  document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>showTab(btn.dataset.tab)));
  showTab('today');
  // Silently refresh BGU token in the background if it's about to expire
  refreshBGUTokenIfNeeded().catch(()=>{});
});
