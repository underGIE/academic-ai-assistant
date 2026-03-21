// ── Storage helpers ────────────────────────────────────────────────
function get(keys) {
  return new Promise((r) => chrome.storage.local.get(keys, r));
}
function set(obj) {
  return new Promise((r) => chrome.storage.local.set(obj, r));
}

// ── Tab switching ──────────────────────────────────────────────────
const TABS = ["today", "inbox", "chat", "setup"];

function showTab(name) {
  TABS.forEach((t) => {
    document.getElementById(`tab-${t}`)?.classList.toggle("active", t === name);
    document
      .getElementById(`panel-${t}`)
      ?.classList.toggle("hidden", t !== name);
  });
  if (name === "today") loadTodayTab();
  if (name === "inbox") loadInboxTab();
  if (name === "chat") loadChatTab();
  if (name === "setup") loadSetupTab();
}

// ── TODAY TAB ─────────────────────────────────────────────────────
async function loadTodayTab() {
  const panel = document.getElementById("panel-today");
  const { calendarEvents = [] } = await get(["calendarEvents"]);

  if (!calendarEvents.length) {
    panel.innerHTML = `<div class="empty-state"><span>📅</span><p>No upcoming events.<br>Click Connect & Sync in Setup.</p></div>`;
    return;
  }

  const now = new Date();
  const sorted = calendarEvents
    .filter((e) => new Date(e.start?.dateTime || e.start?.date) >= now)
    .sort(
      (a, b) =>
        new Date(a.start?.dateTime || a.start?.date) -
        new Date(b.start?.dateTime || b.start?.date),
    );

  const next = sorted[0];
  const rest = sorted.slice(1, 6);
  let html = "";

  if (next) {
    const start = new Date(next.start?.dateTime || next.start?.date);
    const diff = Math.round((start - now) / 60000);
    const countdown =
      diff < 60
        ? `In ${diff} min`
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
  }

  if (rest.length) {
    html += `<div class="section-label">Coming Up</div>`;
    rest.forEach((e) => {
      const start = new Date(e.start?.dateTime || e.start?.date);
      html += `
        <div class="event-row">
          <span class="event-dot">•</span>
          <span class="event-row-title">${escapeHtml(e.summary || "Untitled")}</span>
          <span class="event-row-time">${formatDate(start)}</span>
        </div>`;
    });
  }

  panel.innerHTML = html;
}

function formatTime(d) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatDate(d) {
  const today = new Date();
  const tom = new Date(today);
  tom.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString())
    return `Today ${formatTime(d)}`;
  if (d.toDateString() === tom.toDateString())
    return `Tomorrow ${formatTime(d)}`;
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ── INBOX TAB ────────────────────────────────────────────────────
let currentFilter = "all";

async function loadInboxTab() {
  const panel = document.getElementById("panel-inbox");
  panel.innerHTML = `<div class="empty-state"><span>⏳</span><p>Loading emails…</p></div>`;

  const { emails = [] } = await get(["emails"]);
  if (!emails.length) {
    panel.innerHTML = `<div class="empty-state"><span>📭</span><p>No emails loaded yet.<br>Connect Google in Setup tab.</p></div>`;
    return;
  }
  renderInbox(emails, panel);
}

function renderInbox(emails, panel) {
  const categories = ["all", "payment", "admin", "general"];
  const counts = {};
  categories.forEach((c) => {
    counts[c] =
      c === "all"
        ? emails.length
        : emails.filter((e) => e.category === c).length;
  });
  const filtered =
    currentFilter === "all"
      ? emails
      : emails.filter((e) => e.category === currentFilter);

  let html = `<div class="filter-bar">`;
  const labels = {
    all: "📧 All",
    payment: "💳 Payment",
    admin: "📋 Admin",
    general: "📄 General",
  };
  categories.forEach((c) => {
    html += `<button class="filter-btn${currentFilter === c ? " active" : ""}" data-filter="${c}">${labels[c]} <span class="count-badge">${counts[c]}</span></button>`;
  });
  html += `</div><div class="email-list">`;

  if (!filtered.length) {
    html += `<div class="empty-state" style="padding:20px"><span>🔍</span><p>No ${currentFilter} emails.</p></div>`;
  } else {
    filtered.forEach((e) => {
      const urgentBadge =
        e.urgency === "high"
          ? `<span class="badge badge-urgent">🔴 Urgent</span>`
          : "";
      const actionBadge = e.actionRequired
        ? `<span class="badge badge-action">⚡ Action</span>`
        : "";
      const unreadDot = e.isUnread ? `<span class="unread-dot"></span>` : "";
      html += `
        <div class="email-card${e.isUnread ? " unread" : ""}">
          <div class="email-header">
            ${unreadDot}
            <span class="email-from">${escapeHtml(shortFrom(e.from))}</span>
            <span class="email-date">${shortDate(e.date)}</span>
          </div>
          <div class="email-subject">${escapeHtml(e.subject)}</div>
          <div class="email-snippet">${escapeHtml((e.snippet || "").slice(0, 90))}…</div>
          <div class="email-badges">${urgentBadge}${actionBadge}</div>
        </div>`;
    });
  }
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
function shortDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? formatTime(d)
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── CHAT TAB ──────────────────────────────────────────────────────
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
      <button class="quick-btn" data-q="תסביר לי את החומר של השיעור הבא">🧠 חומר</button>
    </div>
    <div class="chat-input-row">
      <input id="chat-input" type="text" placeholder="שאל כל שאלה על הלימודים שלך…" />
      <button id="chat-send">שלח</button>
    </div>`;

  addMessage(
    "assistant",
    "👋 היי! אני כאן כמו חבר מקצועי שיודע הכל על הקורסים שלך ב-BGU. שאל אותי על מה שיש לך היום, על חומר לימוד, או על הכנה למבחן!",
  );

  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send");

  async function sendMessage(text) {
    if (!text.trim()) return;
    addMessage("user", text);
    input.value = "";
    const loadingId = addMessage("assistant", "⏳ חושב…", true);
    try {
      const { askAgent } = await import("./src/aiAgent.js");
      const { text: reply, refs } = await askAgent(text);
      updateMessage(loadingId, reply);
      if (refs.length) {
        const refHtml = refs
          .map(
            (r) =>
              `<span class="msg-ref">${r.type === "event" ? "📅" : "📧"} ${escapeHtml(r.title)}</span>`,
          )
          .join(" ");
        appendRefs(loadingId, refHtml);
      }
    } catch (err) {
      updateMessage(loadingId, `❌ ${err.message}`);
    }
  }

  sendBtn.addEventListener("click", () => sendMessage(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage(input.value);
  });
  panel.querySelectorAll(".quick-btn").forEach((btn) => {
    btn.addEventListener("click", () => sendMessage(btn.dataset.q));
  });
}

let msgCounter = 0;
function addMessage(role, text, isLoading = false) {
  const id = `msg-${++msgCounter}`;
  const div = document.createElement("div");
  div.id = id;
  div.className = `msg msg-${role}${isLoading ? " msg-loading" : ""}`;
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
    r.innerHTML = html;
    el.appendChild(r);
  }
}

// ── SETUP TAB ────────────────────────────────────────────────────
async function loadSetupTab() {
  const { googleConnected, moodleUrl, geminiApiKey, activeAccountId } =
    await get([
      "googleConnected",
      "moodleUrl",
      "geminiApiKey",
      "activeAccountId",
    ]);

  const statusEl = document.getElementById("google-status");
  if (statusEl)
    statusEl.textContent = googleConnected
      ? "✅ Connected"
      : "❌ Not connected";

  const moodleInput = document.getElementById("moodle-url");
  if (moodleInput && moodleUrl) moodleInput.value = moodleUrl;

  const apiInput = document.getElementById("gemini-key");
  if (apiInput && geminiApiKey) apiInput.value = geminiApiKey;

  await loadAccountSwitcher(activeAccountId);
  await loadCourses();
}

// ── MULTI-ACCOUNT SWITCHER ───────────────────────────────────────
async function loadAccountSwitcher(activeAccountEmail) {
  const container = document.getElementById("accounts-container");
  if (!container) return;

  const { activeAccountEmail: savedEmail } = await get(["activeAccountEmail"]);
  const email = activeAccountEmail || savedEmail || "";

  container.innerHTML = `
    <div style="margin-bottom:8px">
      <p style="font-size:11px;color:#666;margin-bottom:6px">
        <strong>Primary account</strong> — connected via Chrome OAuth<br>
        To use your university email, enter it below and sign into Chrome with it first.
      </p>
      <input class="setup-input" type="email" id="secondary-email"
             placeholder="andargia@post.bgu.ac.il"
             value="${escapeHtml(email)}" style="margin-bottom:6px" />
      <button class="setup-btn" id="btn-save-secondary" style="font-size:11px;padding:5px 10px">
        Save University Email
      </button>
      ${email ? `<p style="font-size:11px;color:#27ae60;margin-top:6px">✅ University email: ${escapeHtml(email)}</p>` : ""}
    </div>`;

  document
    .getElementById("btn-save-secondary")
    ?.addEventListener("click", async () => {
      const val = document.getElementById("secondary-email")?.value.trim();
      if (val) {
        await set({ activeAccountEmail: val });
        showToast("University email saved ✅");
        loadAccountSwitcher(val);
      }
    });
}

// ── COURSES ──────────────────────────────────────────────────────
async function loadCourses() {
  const { courses = [] } = await get(["courses"]);
  const list = document.getElementById("courses-list");
  if (!list) return;

  if (!courses.length) {
    list.innerHTML = `<p style="font-size:11px;color:#999;margin-bottom:8px">No courses added yet. Add them so the AI knows your context.</p>`;
    return;
  }

  list.innerHTML = courses
    .map(
      (c, i) => `
    <div class="course-card">
      <div class="course-info">
        <strong style="font-size:12px">${escapeHtml(c.name)}</strong>
        <span style="font-size:11px;color:#666"> · ${escapeHtml(c.lecturer)}</span>
        ${c.notes ? `<div style="font-size:11px;color:#888;margin-top:2px">${escapeHtml(c.notes)}</div>` : ""}
      </div>
      <button class="btn-remove-course" data-index="${i}">✕</button>
    </div>`,
    )
    .join("");

  list.querySelectorAll(".btn-remove-course").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { courses: c = [] } = await get(["courses"]);
      c.splice(+btn.dataset.index, 1);
      await set({ courses: c });
      loadCourses();
    });
  });
}

// ── SETUP LISTENERS ──────────────────────────────────────────────
function attachSetupListeners() {
  document
    .getElementById("btn-google-connect")
    ?.addEventListener("click", async () => {
      const statusEl = document.getElementById("google-status");
      statusEl.textContent = "🔄 Connecting…";
      try {
        await chrome.runtime.sendMessage({ type: "syncAll" });
        await set({ googleConnected: true });
        statusEl.textContent = "✅ Connected";
        loadInboxTab();
      } catch (e) {
        statusEl.textContent = "❌ Error: " + e.message;
      }
    });

  document
    .getElementById("btn-save-moodle")
    ?.addEventListener("click", async () => {
      const url = document.getElementById("moodle-url")?.value?.trim();
      if (url) {
        await set({ moodleUrl: url });
        showToast("Moodle URL saved ✅");
      }
    });

  document
    .getElementById("btn-save-apikey")
    ?.addEventListener("click", async () => {
      const key = document.getElementById("gemini-key")?.value?.trim();
      if (key) {
        await set({ geminiApiKey: key });
        showToast("API key saved ✅");
      }
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
        if (
          document.getElementById("panel-inbox") &&
          !document.getElementById("panel-inbox").classList.contains("hidden")
        ) {
          loadInboxTab();
        }
      } catch (e) {
        showToast("Sync failed: " + e.message);
      }
      btn.textContent = "🔄 Sync Now";
      btn.disabled = false;
    });

  document
    .getElementById("btn-add-course")
    ?.addEventListener("click", async () => {
      const name = document.getElementById("course-name")?.value.trim();
      const lecturer = document.getElementById("course-lecturer")?.value.trim();
      const notes = document.getElementById("course-notes")?.value.trim();
      if (!name || !lecturer) {
        showToast("Enter course name and lecturer ⚠️");
        return;
      }
      const { courses = [] } = await get(["courses"]);
      courses.push({ name, lecturer, notes });
      await set({ courses });
      document.getElementById("course-name").value = "";
      document.getElementById("course-lecturer").value = "";
      document.getElementById("course-notes").value = "";
      loadCourses();
      showToast(`${name} added ✅`);
    });
}

// ── TOAST NOTIFICATION ───────────────────────────────────────────
function showToast(msg) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

// ── INIT ─────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  attachSetupListeners();
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });
  showTab("today");
});
