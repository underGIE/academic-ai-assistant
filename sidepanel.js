// ============================================================
// SIDE PANEL UI
// Reads from chrome.storage — never calls APIs directly
// ============================================================

// ── Tab content templates ─────────────────────────────────
const TABS = {
  today: `<div id="today-content"><div class="empty"><div class="icon">⏳</div><p>Loading...</p></div></div>`,
  inbox: `<div class="empty"><div class="icon">📧</div><p>Gmail coming in Mission 3</p><p class="sub">Emails classified by course, urgency, and action required</p></div>`,
  chat: `<div class="empty"><div class="icon">💬</div><p>AI Chat coming in Mission 3</p><p class="sub">Ask: "What do I have this week?"</p></div>`,
  settings: `
    <div class="card" style="border-left-color:#70AD47">
      <h3>🔗 Google Account</h3>
      <p>Connect Calendar + Gmail</p>
      <div id="google-status" style="margin-top:6px;font-size:12px;color:#64748b">Checking...</div>
      <button class="btn" id="btn-google" style="background:#1F4E79;color:white">Connect Google</button>
    </div>
    <div class="card" style="border-left-color:#FF8C00">
      <h3>📚 Moodle Calendar URL</h3>
      <p>Paste your Moodle ICS export URL</p>
      <span class="label">ICS URL</span>
      <input class="input" id="input-moodle" type="text"
        placeholder="https://moodle.university.edu/calendar/export..." />
      <button class="btn" id="btn-moodle" style="background:#FF8C00;color:white">Save URL</button>
    </div>
    <div class="card" style="border-left-color:#7B2FBE">
      <h3>🤖 AI API Key</h3>
      <p>Gemini or OpenAI key — stored locally, never shared</p>
      <span class="label">API Key</span>
      <input class="input" id="input-apikey" type="password" placeholder="AIza..." />
      <button class="btn" id="btn-apikey" style="background:#7B2FBE;color:white">Save Key</button>
    </div>
  `,
};

// ── Show a tab ────────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === name);
  });
  document.getElementById("tab-content").innerHTML = TABS[name];

  if (name === "today") loadTodayTab();
  if (name === "settings") attachSettingsListeners();
}

// ── Load real calendar data into Today tab ────────────────
async function loadTodayTab() {
  const result = await chrome.storage.local.get([
    "calendarEvents",
    "googleConnected",
  ]);

  const container = document.getElementById("today-content");
  if (!container) return;

  // Not connected yet
  if (!result.googleConnected) {
    container.innerHTML = `
      <div class="empty">
        <div class="icon">📅</div>
        <p>Connect Google to see your schedule</p>
        <p class="sub">Go to ⚙️ Setup tab</p>
      </div>`;
    return;
  }

  const events = result.calendarEvents || [];
  const now = Date.now();

  // Filter to future events only
  const upcoming = events.filter(
    (e) => new Date(e.start?.dateTime || e.start?.date).getTime() > now,
  );

  if (upcoming.length === 0) {
    container.innerHTML = `
      <div class="empty">
        <div class="icon">🎉</div>
        <p>No upcoming events</p>
        <p class="sub">Your calendar is clear</p>
      </div>`;
    return;
  }

  // Next event
  const next = upcoming[0];
  const start = new Date(next.start?.dateTime || next.start?.date);
  const diffMs = start - now;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs / 24);

  let countdown = "";
  if (diffMins < 1) countdown = "🔴 Starting now!";
  else if (diffMins < 60) countdown = `🟡 in ${diffMins} min`;
  else if (diffHrs < 24) countdown = `🟢 in ${diffHrs}h ${diffMins % 60}m`;
  else if (diffDays === 1)
    countdown = `🔵 Tomorrow at ${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  else
    countdown = `🔵 ${start.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}`;

  let html = `
    <div class="card" style="border-left-color:#1F4E79;background:#EBF3FB">
      <h3>📅 ${next.summary || "Event"}</h3>
      <p>${start.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</p>
      <p style="margin-top:4px">🕐 ${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
      <span class="badge badge-blue" style="margin-top:8px;display:inline-block">${countdown}</span>
    </div>`;

  // Remaining events list
  if (upcoming.length > 1) {
    html += `<div class="card" style="border-left-color:#70AD47"><h3>📆 Coming Up</h3>`;
    upcoming.slice(1, 8).forEach((event) => {
      const s = new Date(event.start?.dateTime || event.start?.date);
      const time = event.start?.dateTime
        ? s.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "All day";
      const day = s.toLocaleDateString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      html += `
        <div style="padding:7px 0;border-bottom:1px solid #f0f0f0">
          <div style="font-size:12px;font-weight:600">${event.summary || "Event"}</div>
          <div style="font-size:11px;color:#64748b">${day} · ${time}</div>
        </div>`;
    });
    html += `</div>`;
  }

  container.innerHTML = html;
}

// ── Settings button handlers ──────────────────────────────
function attachSettingsListeners() {
  // Check if already connected
  chrome.storage.local.get(["googleConnected"], (result) => {
    const statusEl = document.getElementById("google-status");
    if (statusEl) {
      statusEl.textContent = result.googleConnected
        ? "✅ Connected"
        : "❌ Not connected";
      statusEl.style.color = result.googleConnected ? "#16a34a" : "#dc2626";
    }
  });

  // Connect Google button
  document.getElementById("btn-google")?.addEventListener("click", async () => {
    try {
      const token = await new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
          if (chrome.runtime.lastError)
            reject(chrome.runtime.lastError.message);
          else resolve(token);
        });
      });

      if (token) {
        await chrome.storage.local.set({ googleConnected: true });

        // Trigger an immediate calendar sync
        chrome.runtime.sendMessage({ action: "syncCalendar" });

        document.getElementById("google-status").textContent = "✅ Connected";
        document.getElementById("google-status").style.color = "#16a34a";
        alert(
          "Google connected! ✓\nSwitch to 📅 Today tab to see your calendar.",
        );
      }
    } catch (err) {
      alert("Connection failed: " + err);
    }
  });

  // Save Moodle URL
  document.getElementById("btn-moodle")?.addEventListener("click", async () => {
    const url = document.getElementById("input-moodle").value.trim();
    if (!url) {
      alert("Please paste your Moodle ICS URL first");
      return;
    }
    await chrome.storage.local.set({ moodleIcsUrl: url });
    alert("Moodle URL saved ✓");
  });

  // Save API Key
  document.getElementById("btn-apikey")?.addEventListener("click", async () => {
    const key = document.getElementById("input-apikey").value.trim();
    if (!key) {
      alert("Please enter your API key first");
      return;
    }
    await chrome.storage.local.set({ llmApiKey: key });
    alert("API key saved ✓");
  });
}

// ── Handle message from background (sync triggered) ──────
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "calendarSynced") {
    loadTodayTab();
  }
});

// ── Tab click listeners ───────────────────────────────────
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => showTab(tab.dataset.tab));
});

// ── Start on Today tab ────────────────────────────────────
showTab("today");
