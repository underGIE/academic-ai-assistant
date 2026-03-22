// ── Storage helpers ───────────────────────────────────────────────
function get(keys) {
  return new Promise((r) => chrome.storage.local.get(keys, r));
}
function set(obj) {
  return new Promise((r) => chrome.storage.local.set(obj, r));
}
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── Tab switching ─────────────────────────────────────────────────
const TABS = ["today", "inbox", "moodle", "chat", "setup"];

function showTab(name) {
  TABS.forEach((t) => {
    document.getElementById(`tab-${t}`)?.classList.toggle("active", t === name);
    document
      .getElementById(`panel-${t}`)
      ?.classList.toggle("hidden", t !== name);
  });
  if (name === "today") loadTodayTab();
  if (name === "inbox") loadInboxTab();
  if (name === "moodle") loadMoodleTab();
  if (name === "chat") loadChatTab();
  if (name === "setup") loadSetupTab();
}

// ── TODAY TAB ────────────────────────────────────────────────────
async function loadTodayTab() {
  const panel = document.getElementById("panel-today");
  const { calendarEvents = [], moodleData = null } = await get([
    "calendarEvents",
    "moodleData",
  ]);
  let html = "";

  // Next calendar event
  const now = new Date();
  const sorted = calendarEvents
    .filter((e) => new Date(e.start?.dateTime || e.start?.date) >= now)
    .sort(
      (a, b) =>
        new Date(a.start?.dateTime || a.start?.date) -
        new Date(b.start?.dateTime || b.start?.date),
    );

  if (sorted.length) {
    const next = sorted[0];
    const rest = sorted.slice(1, 5);
    const start = new Date(next.start?.dateTime || next.start?.date);
    const diff = Math.round((start - now) / 60000);
    const countdown =
      diff < 60
        ? `In ${diff}m`
        : diff < 1440
          ? `In ${Math.round(diff / 60)}h`
          : `In ${Math.round(diff / 1440)}d`;
    html += `
      <div class="next-event-card">
        <div class="next-label">⚡ Up Next</div>
        <div class="event-title">${escapeHtml(next.summary || "Untitled")}</div>
        <div class="event-time">${formatTime(start)} · ${countdown}</div>
        ${next.location ? `<div class="event-loc">📍 ${escapeHtml(next.location)}</div>` : ""}
      </div>`;
    if (rest.length) {
      html += `<div class="section-label">Coming Up</div>`;
      rest.forEach((e) => {
        const s = new Date(e.start?.dateTime || e.start?.date);
        html += `<div class="event-row"><span class="event-dot">•</span>
          <span class="event-row-title">${escapeHtml(e.summary || "")}</span>
          <span class="event-row-time">${formatDate(s)}</span></div>`;
      });
    }
  } else {
    html += `<div class="empty-state"><span>📅</span><p>No upcoming events</p></div>`;
  }

  // Moodle assignments
  if (moodleData?.assignments?.length) {
    const nowTs = Date.now() / 1000;
    const overdue = moodleData.assignments
      .filter((a) => a.dueDate && new Date(a.dueDate) < now && a.dueDate)
      .slice(0, 3);
    const upcoming = moodleData.assignments
      .filter((a) => a.dueDate && new Date(a.dueDate) >= now)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
      .slice(0, 5);

    if (overdue.length) {
      html += `<div class="section-label" style="color:#e74c3c">⚠️ Overdue</div>`;
      overdue.forEach((a) => {
        html += `<div class="event-row overdue-row">
          <span class="event-dot" style="color:#e74c3c">!</span>
          <div style="flex:1"><div class="event-row-title">${escapeHtml(a.name)}</div>
          <div style="font-size:10px;color:#e74c3c">${escapeHtml(a.courseName || "")}</div></div>
          <span class="event-row-time" style="color:#e74c3c">${fmtDate(a.dueDate)}</span></div>`;
      });
    }
    if (upcoming.length) {
      html += `<div class="section-label">📝 Assignments Due</div>`;
      upcoming.forEach((a) => {
        const dDiff = Math.ceil((new Date(a.dueDate) - now) / 86400000);
        const col = dDiff <= 2 ? "#e74c3c" : dDiff <= 5 ? "#e67e22" : "#888";
        html += `<div class="event-row">
          <span class="event-dot" style="color:#3498db">✎</span>
          <div style="flex:1"><div class="event-row-title">${escapeHtml(a.name)}</div>
          <div style="font-size:10px;color:#666">${escapeHtml(a.courseName || "")}</div></div>
          <span class="event-row-time" style="color:${col}">${dDiff}d</span></div>`;
      });
    }
  } else {
    html += `<div style="margin:10px 12px;padding:10px 12px;background:#f0f4f8;border-radius:8px;font-size:11px;color:#888;text-align:center">
      🎓 <a href="#" id="link-to-moodle" style="color:#1a3a5c">Connect Moodle</a> to see assignment deadlines
    </div>`;
  }

  panel.innerHTML = html;
  document.getElementById("link-to-moodle")?.addEventListener("click", (e) => {
    e.preventDefault();
    showTab("moodle");
  });
}

function formatTime(d) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatDate(d) {
  const t = new Date(),
    tom = new Date(t);
  tom.setDate(t.getDate() + 1);
  if (d.toDateString() === t.toDateString()) return `Today ${formatTime(d)}`;
  if (d.toDateString() === tom.toDateString())
    return `Tomorrow ${formatTime(d)}`;
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
function fmtDate(str) {
  if (!str) return "";
  return new Date(str).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

// ── INBOX TAB ───────────────────────────────────────────────────
let currentFilter = "all";

async function loadInboxTab() {
  const panel = document.getElementById("panel-inbox");
  panel.innerHTML = `<div class="empty-state"><span>⏳</span><p>Loading…</p></div>`;
  const { emails = [] } = await get(["emails"]);
  if (!emails.length) {
    panel.innerHTML = `<div class="empty-state"><span>📭</span><p>No emails. Connect Google in Setup.</p></div>`;
    return;
  }
  renderInbox(emails, panel);
}

function renderInbox(emails, panel) {
  const cats = ["all", "payment", "admin", "general"];
  const counts = {};
  cats.forEach((c) => {
    counts[c] =
      c === "all"
        ? emails.length
        : emails.filter((e) => e.category === c).length;
  });
  const labels = {
    all: "📧 All",
    payment: "💳 Pay",
    admin: "📋 Admin",
    general: "📄 General",
  };
  const filtered =
    currentFilter === "all"
      ? emails
      : emails.filter((e) => e.category === currentFilter);

  let html = `<div class="filter-bar">`;
  cats.forEach((c) => {
    html += `<button class="filter-btn${currentFilter === c ? " active" : ""}" data-filter="${c}">${labels[c]} <span class="count-badge">${counts[c]}</span></button>`;
  });
  html += `</div><div class="email-list">`;

  filtered.forEach((e) => {
    html += `<div class="email-card${e.isUnread ? " unread" : ""}">
      <div class="email-header">
        ${e.isUnread ? '<span class="unread-dot"></span>' : ""}
        <span class="email-from">${escapeHtml(shortFrom(e.from))}</span>
        <span class="email-date">${fmtDate(e.date)}</span>
      </div>
      <div class="email-subject">${escapeHtml(e.subject)}</div>
      <div class="email-snippet">${escapeHtml((e.snippet || "").slice(0, 90))}…</div>
      <div class="email-badges">
        ${e.urgency === "high" ? '<span class="badge badge-urgent">🔴 Urgent</span>' : ""}
        ${e.actionRequired ? '<span class="badge badge-action">⚡ Action</span>' : ""}
      </div>
    </div>`;
  });

  html += `</div>`;
  panel.innerHTML = html;
  panel.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentFilter = btn.dataset.filter;
      renderInbox(emails, panel);
    });
  });
}

function shortFrom(from) {
  const m = from?.match(/^"?([^"<]+)"?\s*</);
  return m ? m[1].trim() : (from || "").replace(/<.*>/, "").trim();
}

// ── MOODLE TAB ──────────────────────────────────────────────────
let moodleScraping = false;

async function loadMoodleTab() {
  const panel = document.getElementById("panel-moodle");
  const { moodleData, moodleConnected } = await get([
    "moodleData",
    "moodleConnected",
  ]);

  if (!moodleConnected || !moodleData) {
    renderMoodleConnect(panel);
    return;
  }
  renderMoodleData(moodleData, panel);
}

function renderMoodleConnect(panel) {
  panel.innerHTML = `
    <div class="moodle-connect-screen">
      <div style="font-size:48px;margin-bottom:12px">🎓</div>
      <h2 style="font-size:15px;font-weight:700;color:#1a3a5c;margin-bottom:8px">Connect BGU Moodle</h2>
      <p style="font-size:12px;color:#666;margin-bottom:6px;line-height:1.6">
        The extension will read your Moodle courses, files, assignments, and lecture videos.
        <strong>You must be logged in to Moodle in this browser.</strong>
      </p>
      <p style="font-size:11px;color:#999;margin-bottom:20px">
        No password is sent — it uses your existing browser login session.
      </p>
      <button class="setup-btn success" id="btn-start-moodle-sync" style="font-size:13px;padding:10px 24px">
        🔗 Connect &amp; Sync Moodle
      </button>
      <div id="moodle-progress" style="margin-top:16px;display:none">
        <div class="progress-bar-bg"><div class="progress-bar-fill" id="progress-fill"></div></div>
        <p id="progress-text" style="font-size:11px;color:#666;margin-top:6px;text-align:center"></p>
      </div>
    </div>`;

  document
    .getElementById("btn-start-moodle-sync")
    ?.addEventListener("click", startMoodleSync);
}

async function startMoodleSync() {
  if (moodleScraping) return;
  moodleScraping = true;

  const btn = document.getElementById("btn-start-moodle-sync");
  const progress = document.getElementById("moodle-progress");
  const fill = document.getElementById("progress-fill");
  const text = document.getElementById("progress-text");

  btn.disabled = true;
  btn.textContent = "⏳ Syncing…";
  progress.style.display = "block";

  try {
    const { fullMoodleSync } = await import("./src/moodleScraper.js");
    const data = await fullMoodleSync((msg, pct) => {
      text.textContent = msg;
      fill.style.width = `${pct}%`;
    });
    moodleScraping = false;
    showToast(`✅ Moodle synced — ${data.courses.length} courses`);
    renderMoodleData(data, document.getElementById("panel-moodle"));
  } catch (err) {
    moodleScraping = false;
    if (err.message === "NOT_LOGGED_IN") {
      document.getElementById("progress-text").textContent = "";
      document.getElementById("panel-moodle").innerHTML = `
        <div class="moodle-connect-screen">
          <div style="font-size:48px">🔐</div>
          <h2 style="font-size:15px;color:#e74c3c;margin:8px 0">Not logged in to Moodle</h2>
          <p style="font-size:12px;color:#666;margin-bottom:16px">
            Please <a href="https://moodle.bgu.ac.il/moodle/login/index.php" target="_blank" style="color:#1a3a5c">log in to BGU Moodle</a> in your browser first, then come back and try again.
          </p>
          <button class="setup-btn" onclick="loadMoodleTab()">↩ Try Again</button>
        </div>`;
    } else {
      showToast("❌ Moodle error: " + err.message);
      btn.disabled = false;
      btn.textContent = "🔗 Try Again";
    }
  }
}

function renderMoodleData(data, panel) {
  const {
    courses = [],
    assignments = [],
    files = [],
    videos = {},
    lastSync,
  } = data;
  const syncAgo = lastSync ? Math.round((Date.now() - lastSync) / 60000) : null;

  // ── Course selector ──
  let html = `
    <div class="moodle-header">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px 0">
        <span style="font-size:11px;color:#888">${courses.length} courses · ${syncAgo != null ? `synced ${syncAgo}m ago` : ""}</span>
        <button class="re-sync-btn" id="btn-re-sync">🔄 Re-sync</button>
      </div>
      <div class="course-tabs" id="course-tabs">`;

  courses.forEach((c, i) => {
    html += `<button class="course-tab${i === 0 ? " active" : ""}" data-course-id="${c.id}" data-course-idx="${i}">${escapeHtml(c.name.slice(0, 30))}</button>`;
  });
  html += `</div></div>`;

  // ── Course detail panels ──
  html += `<div id="course-panels">`;

  courses.forEach((course, i) => {
    const detail = data.courseDetails?.find((d) => d.courseId === course.id);
    const assigns = assignments.filter((a) => a.courseId === course.id);
    const vids = videos[course.id] || [];
    const hidden = i === 0 ? "" : " hidden";

    html += `<div class="course-panel${hidden}" data-panel-idx="${i}">`;

    // Assignments for this course
    if (assigns.length) {
      html += `<div class="moodle-section"><div class="moodle-section-title">📝 Assignments</div>`;
      assigns.forEach((a) => {
        html += `<div class="moodle-item">
          <span class="moodle-item-icon">📋</span>
          <a href="${escapeHtml(a.url || "#")}" target="_blank" class="moodle-item-name">${escapeHtml(a.name)}</a>
          ${a.dueText ? `<span style="font-size:10px;color:#e74c3c;margin-left:4px">${escapeHtml(a.dueText)}</span>` : ""}
        </div>`;
      });
      html += `</div>`;
    }

    // Lecture videos
    if (vids.length) {
      html += `<div class="moodle-section"><div class="moodle-section-title">🎥 Lecture Videos</div>`;
      vids.slice(0, 10).forEach((v) => {
        html += `<div class="moodle-item">
          <span class="moodle-item-icon">▶️</span>
          <a href="${escapeHtml(v.url || "#")}" target="_blank" class="moodle-item-name">${escapeHtml(v.title)}</a>
          ${v.date ? `<span style="font-size:10px;color:#999;margin-left:4px">${escapeHtml(v.date)}</span>` : ""}
        </div>`;
      });
      html += `</div>`;
    }

    // Course sections and files
    if (detail?.sections?.length) {
      detail.sections.forEach((sec) => {
        const resources =
          sec.items?.filter((it) =>
            ["resource", "url", "folder", "page"].includes(it.type),
          ) || [];
        if (!resources.length) return;
        html += `<div class="moodle-section">
          <div class="moodle-section-title">📁 ${escapeHtml(sec.title)}</div>`;
        resources.forEach((item) => {
          const icon =
            item.type === "url" ? "🔗" : item.type === "folder" ? "📂" : "📄";
          html += `<div class="moodle-item">
            <span class="moodle-item-icon">${icon}</span>
            <a href="${escapeHtml(item.url || "#")}" target="_blank" class="moodle-item-name">${escapeHtml(item.name)}</a>
          </div>`;
        });
        html += `</div>`;
      });
    }

    if (!assigns.length && !vids.length && !detail?.sections?.length) {
      html += `<div class="empty-state" style="padding:30px"><span>📂</span><p>No content found for this course.</p></div>`;
    }

    html += `</div>`;
  });

  html += `</div>`;
  panel.innerHTML = html;

  // ── Course tab switching ──
  panel.querySelectorAll(".course-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      panel
        .querySelectorAll(".course-tab")
        .forEach((t) => t.classList.remove("active"));
      panel
        .querySelectorAll(".course-panel")
        .forEach((p) => p.classList.add("hidden"));
      tab.classList.add("active");
      panel
        .querySelector(
          `.course-panel[data-panel-idx="${tab.dataset.courseIdx}"]`,
        )
        ?.classList.remove("hidden");
    });
  });

  document
    .getElementById("btn-re-sync")
    ?.addEventListener("click", async () => {
      await set({ moodleConnected: false });
      loadMoodleTab();
    });
}

// ── CHAT TAB ─────────────────────────────────────────────────────
let chatLoaded = false;

function loadChatTab() {
  if (chatLoaded) return;
  chatLoaded = true;

  const panel = document.getElementById("panel-chat");
  panel.innerHTML = `
    <div id="chat-messages"></div>
    <div class="quick-prompts">
      <button class="quick-btn" data-q="מה יש לי היום?">📅 היום</button>
      <button class="quick-btn" data-q="יש מיילים דחופים?">🔴 דחוף</button>
      <button class="quick-btn" data-q="מה יש לי להגיש השבוע?">📝 הגשות</button>
      <button class="quick-btn" data-q="תסביר לי את החומר של הקורס הבא">🧠 חומר</button>
    </div>
    <div class="chat-input-row">
      <input id="chat-input" type="text" placeholder="שאל כל שאלה…" />
      <button id="chat-send">שלח</button>
    </div>`;

  addMessage(
    "assistant",
    "👋 היי! אני מחובר ללוח הזמנים, המיילים, והקורסים שלך במודל. שאל אותי כל שאלה על הלימודים שלך!",
  );

  const input = document.getElementById("chat-input");
  const send = document.getElementById("chat-send");

  async function sendMsg(text) {
    if (!text.trim()) return;
    addMessage("user", text);
    input.value = "";
    const lid = addMessage("assistant", "⏳ חושב…", true);
    try {
      const { askAgent } = await import("./src/aiAgent.js");
      const { text: reply, refs } = await askAgent(text);
      updateMessage(lid, reply);
      if (refs.length) {
        const icons = {
          event: "📅",
          email: "📧",
          assignment: "📝",
          overdue: "⚠️",
          course: "🎓",
          video: "🎥",
          file: "📄",
        };
        const html = refs
          .map(
            (r) =>
              `<span class="msg-ref">${icons[r.type] || "•"} ${escapeHtml(r.title)}</span>`,
          )
          .join(" ");
        appendRefs(lid, html);
      }
    } catch (err) {
      updateMessage(lid, `❌ ${err.message}`);
    }
  }

  send.addEventListener("click", () => sendMsg(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMsg(input.value);
  });
  panel
    .querySelectorAll(".quick-btn")
    .forEach((b) => b.addEventListener("click", () => sendMsg(b.dataset.q)));
}

let msgN = 0;
function addMessage(role, text, loading = false) {
  const id = `msg-${++msgN}`;
  const div = document.createElement("div");
  div.id = id;
  div.className = `msg msg-${role}${loading ? " msg-loading" : ""}`;
  div.textContent = text;
  document.getElementById("chat-messages").appendChild(div);
  div.scrollIntoView({ behavior: "smooth" });
  return id;
}
function updateMessage(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
    el.classList.remove("msg-loading");
  }
}
function appendRefs(id, html) {
  const el = document.getElementById(id);
  if (el) {
    const r = document.createElement("div");
    r.style.marginTop = "6px";
    r.innerHTML = html;
    el.appendChild(r);
  }
}

// ── SETUP TAB ────────────────────────────────────────────────────
async function loadSetupTab() {
  const { googleConnected, geminiApiKey, moodleData, moodleConnected } =
    await get([
      "googleConnected",
      "geminiApiKey",
      "moodleData",
      "moodleConnected",
    ]);

  const gEl = document.getElementById("google-status");
  if (gEl)
    gEl.textContent = googleConnected ? "✅ Connected" : "❌ Not connected";

  const mEl = document.getElementById("moodle-setup-status");
  if (mEl) {
    mEl.textContent =
      moodleConnected && moodleData
        ? `✅ ${moodleData.courses?.length || 0} courses synced`
        : "❌ Not connected";
    mEl.style.color = moodleConnected ? "#27ae60" : "#e74c3c";
  }

  const kEl = document.getElementById("gemini-key");
  if (kEl && geminiApiKey) kEl.value = geminiApiKey;

  loadCourses(moodleData);
}

async function loadCourses(moodleData) {
  const list = document.getElementById("courses-list");
  if (!list) return;
  if (moodleData?.courses?.length) {
    list.innerHTML =
      `<p style="font-size:11px;color:#27ae60;margin-bottom:6px">✅ Auto-imported from Moodle:</p>` +
      moodleData.courses
        .slice(0, 6)
        .map(
          (c) =>
            `<div class="course-card"><div class="course-info"><strong style="font-size:12px">${escapeHtml(c.name)}</strong></div></div>`,
        )
        .join("");
    return;
  }
  const { courses = [] } = await get(["courses"]);
  list.innerHTML = courses.length
    ? courses
        .map(
          (c, i) =>
            `<div class="course-card"><div class="course-info"><strong style="font-size:12px">${escapeHtml(c.name)}</strong><span style="font-size:11px;color:#666"> · ${escapeHtml(c.lecturer)}</span></div><button class="btn-remove-course" data-index="${i}">✕</button></div>`,
        )
        .join("")
    : `<p style="font-size:11px;color:#999;margin-bottom:8px">Connect Moodle tab or add manually.</p>`;
  list.querySelectorAll(".btn-remove-course").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { courses: c = [] } = await get(["courses"]);
      c.splice(+btn.dataset.index, 1);
      await set({ courses: c });
      loadCourses(null);
    });
  });
}

function attachSetupListeners() {
  document
    .getElementById("btn-google-connect")
    ?.addEventListener("click", async () => {
      const el = document.getElementById("google-status");
      el.textContent = "🔄 Connecting…";
      try {
        await chrome.runtime.sendMessage({ type: "syncAll" });
        await set({ googleConnected: true });
        el.textContent = "✅ Connected";
        loadInboxTab();
      } catch (e) {
        el.textContent = "❌ " + e.message;
      }
    });

  document
    .getElementById("btn-save-apikey")
    ?.addEventListener("click", async () => {
      const key = document.getElementById("gemini-key")?.value.trim();
      if (key) {
        await set({ geminiApiKey: key });
        showToast("API key saved ✅");
      }
    });

  document
    .getElementById("btn-add-course")
    ?.addEventListener("click", async () => {
      const name = document.getElementById("course-name")?.value.trim();
      const lecturer = document.getElementById("course-lecturer")?.value.trim();
      const notes = document.getElementById("course-notes")?.value.trim();
      if (!name || !lecturer) {
        showToast("Enter name and lecturer ⚠️");
        return;
      }
      const { courses = [] } = await get(["courses"]);
      courses.push({ name, lecturer, notes });
      await set({ courses });
      ["course-name", "course-lecturer", "course-notes"].forEach((id) => {
        document.getElementById(id).value = "";
      });
      loadCourses(null);
      showToast(`${name} added ✅`);
    });

  document
    .getElementById("btn-sync-now")
    ?.addEventListener("click", async () => {
      const btn = document.getElementById("btn-sync-now");
      btn.textContent = "⏳ Syncing…";
      btn.disabled = true;
      try {
        await chrome.runtime.sendMessage({ type: "syncAll" });
        showToast("Sync complete ✅");
        loadTodayTab();
      } catch (e) {
        showToast("Error: " + e.message);
      }
      btn.textContent = "🔄 Sync Now";
      btn.disabled = false;
    });

  document
    .getElementById("btn-go-moodle")
    ?.addEventListener("click", () => showTab("moodle"));
}

// ── TOAST ────────────────────────────────────────────────────────
function showToast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

// ── INIT ─────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  attachSetupListeners();
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });
  showTab("today");
});
