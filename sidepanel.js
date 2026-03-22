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
  let html = '';

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

  panel.innerHTML = html;
  document.getElementById('link-moodle')?.addEventListener('click', e=>{e.preventDefault();showTab('moodle');});
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
    const score   = e.importanceScore||0;
    const scoreDot = score>=8?'🔴':score>=6?'🟡':score>=4?'🟢':'';
    html+=`<div class="email-card${e.isUnread?' unread':''}">
      <div class="email-header">
        ${e.isUnread?'<span class="unread-dot"></span>':''}
        <span class="email-from">${esc(shortFrom(e.from))}</span>
        <span style="margin-left:auto;font-size:10px">${scoreDot}</span>
        <span class="email-date">${fmtDate(e.date)}</span>
      </div>
      <div class="email-subject">${esc(e.subject)}</div>
      <div class="email-snippet">${esc(e.aiSummary||e.snippet?.slice(0,80)||'')}${!e.aiSummary?'…':''}</div>
    </div>`;
  });
  html+=`</div>`;
  panel.innerHTML = html;
  panel.querySelectorAll('.filter-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{currentFilter=btn.dataset.filter;renderInbox(emails,panel);});
  });
}

function shortFrom(from){
  const m=from?.match(/^"?([^"<]+)"?\s*</); return m?m[1].trim():(from||'').replace(/<.*>/,'').trim();
}

// ── MOODLE TAB ────────────────────────────────────────────────────
let moodleScraping = false;

async function loadMoodleTab() {
  const panel = document.getElementById('panel-moodle');
  const { moodleData, moodleConnected } = await get(['moodleData','moodleConnected']);
  if (!moodleConnected||!moodleData) { renderMoodleConnect(panel); return; }
  renderMoodleData(moodleData, panel);
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
  const ago = lastSync ? Math.round((Date.now()-lastSync)/60000) : null;

  let html = `
    <div class="moodle-header">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px 0">
        <span style="font-size:10px;color:#aaa">${courses.length} courses · ${ago!=null?`${ago}m ago`:''}</span>
        <div style="display:flex;gap:6px">
          <button class="re-sync-btn" id="btn-gen-summaries">🧠 AI Summaries</button>
          <button class="re-sync-btn" id="btn-re-sync">🔄 Re-sync</button>
        </div>
      </div>
      <div class="course-tabs" id="course-tabs">`;
  courses.forEach((c,i)=>{
    html+=`<button class="course-tab${i===0?' active':''}" data-idx="${i}" data-id="${c.id}">${esc(c.name.slice(0,28))}</button>`;
  });
  html+=`</div></div><div id="course-panels">`;

  courses.forEach((course,i)=>{
    const detail  = data.courseDetails?.find(d=>String(d.courseId)===String(course.id));
    const assigns = assignments.filter(a=>String(a.courseId)===String(course.id));
    const vids    = (data.videos||{})[course.id]||[];
    html+=`<div class="course-panel${i===0?'':' hidden'}" data-panel="${i}">`;

    // AI Study Guide placeholder (loaded on-demand)
    html+=`<div class="moodle-section">
      <div class="moodle-section-title">🧠 AI Study Guide</div>
      <div class="ai-summary-box" id="summary-${course.id}">
        <button class="setup-btn" style="font-size:10px;padding:5px 10px" data-course-id="${course.id}" id="btn-summary-${course.id}">
          Generate Study Guide for this course
        </button>
      </div>
    </div>`;

    // Assignments
    if (assigns.length) {
      const now=new Date();
      html+=`<div class="moodle-section"><div class="moodle-section-title">📝 Assignments</div>`;
      assigns.forEach(a=>{
        const d=a.dueDate?Math.ceil((new Date(a.dueDate)-now)/86400000):null;
        const c=d===null?'#aaa':d<0?'#e74c3c':d<=2?'#e74c3c':d<=5?'#e67e22':'#27ae60';
        const label=d===null?'No deadline':d<0?'OVERDUE':`${d}d left`;
        html+=`<div class="moodle-item">
          <span class="moodle-item-icon">📋</span>
          <span class="moodle-item-name" style="color:#333">${esc(a.name)}</span>
          <span style="font-size:9px;color:${c};margin-left:auto;flex-shrink:0">${label}</span>
        </div>`;
      });
      html+=`</div>`;
    }

    // Lecture videos
    if (vids.length) {
      html+=`<div class="moodle-section"><div class="moodle-section-title">🎥 Lecture Videos (${vids.length})</div>`;
      vids.slice(0,8).forEach(v=>{
        html+=`<div class="moodle-item">
          <span class="moodle-item-icon">▶️</span>
          <a href="${esc(v.url||'#')}" target="_blank" class="moodle-item-name">${esc(v.title)}</a>
          ${v.date?`<span style="font-size:9px;color:#aaa;margin-left:auto">${esc(v.date)}</span>`:''}
        </div>`;
      });
      html+=`</div>`;
    }

    // Files from sections
    if (detail?.sections?.length) {
      detail.sections.forEach(sec=>{
        const resources=(sec.items||[]).filter(it=>['resource','url','folder','page'].includes(it.type));
        if (!resources.length) return;
        html+=`<div class="moodle-section"><div class="moodle-section-title">📁 ${esc(sec.title)}</div>`;
        resources.forEach(item=>{
          const icon=item.type==='url'?'🔗':item.type==='folder'?'📂':'📄';
          html+=`<div class="moodle-item">
            <span class="moodle-item-icon">${icon}</span>
            <a href="${esc(item.url||'#')}" target="_blank" class="moodle-item-name">${esc(item.name)}</a>
          </div>`;
        });
        html+=`</div>`;
      });
    }

    if (!assigns.length&&!vids.length&&!detail?.sections?.length) {
      html+=`<div class="empty-state" style="padding:24px"><span>📂</span><p>No content found.<br>Try re-syncing.</p></div>`;
    }

    html+=`</div>`;
  });
  html+=`</div>`;
  panel.innerHTML = html;

  // Course tab switching
  panel.querySelectorAll('.course-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      panel.querySelectorAll('.course-tab').forEach(t=>t.classList.remove('active'));
      panel.querySelectorAll('.course-panel').forEach(p=>p.classList.add('hidden'));
      tab.classList.add('active');
      panel.querySelector(`.course-panel[data-panel="${tab.dataset.idx}"]`)?.classList.remove('hidden');
      // Load cached summary if exists
      loadCachedSummary(tab.dataset.id);
    });
  });

  // Load summary for first course
  if (courses.length) loadCachedSummary(courses[0].id);

  // Generate study guide buttons
  panel.querySelectorAll('[id^="btn-summary-"]').forEach(btn=>{
    btn.addEventListener('click', ()=>generateSummary(btn.dataset.courseId));
  });

  // Generate all summaries
  document.getElementById('btn-gen-summaries')?.addEventListener('click', generateAllSummaries);

  // Re-sync
  document.getElementById('btn-re-sync')?.addEventListener('click', async ()=>{
    await set({moodleConnected:false}); loadMoodleTab();
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
const CLIENT_ID      = '856203600469-t8oiaao8vmdq5197ockrk9h0aad8jtgb.apps.googleusercontent.com';
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
