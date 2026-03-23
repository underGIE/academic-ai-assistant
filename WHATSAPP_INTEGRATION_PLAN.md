# Mission 6.5 — WhatsApp Integration Plan

> **Goal:** Surface WhatsApp messages — especially from study groups — inside the Academic AI Assistant, so assignment deadlines, shared files, and urgent messages from classmates appear alongside calendar events and emails.
> **Approach:** Content script on `web.whatsapp.com` (same technique as Moodle scraping — piggyback on existing session)
> **External API needed:** None. No Meta approval, no phone number registration, no cost.

---

## Why WhatsApp?

For Israeli university students, WhatsApp group chats are the *primary* channel for:
- Course group assignments and coordination ("who's doing part 3?")
- Deadline reminders from classmates ("reminder: submission tomorrow 23:59")
- Lecturer broadcast messages forwarded to groups
- Last-minute cancellations ("class moved to zoom today")
- Shared files (lecture notes PDFs, Excel templates, solutions)

This information currently lives completely outside every tool the extension integrates. Adding it closes the last major gap in the "unified academic inbox."

---

## Approach — Content Script (No API Required)

WhatsApp Web runs at `https://web.whatsapp.com`. When the user is logged in, all their messages are already loaded in the browser DOM. A Chrome Extension content script can read that DOM directly — exactly the same strategy used to scrape Moodle.

**Key advantages:**
- Zero external API calls
- No Meta/WhatsApp approval needed
- No phone number registration
- Works for any user already logged into WhatsApp Web
- No tokens to manage — browser session handles auth automatically

**Key constraints:**
- User must have WhatsApp Web open in a tab (or the extension can open it)
- WhatsApp Web uses a heavily obfuscated React app — DOM selectors need to target stable attributes
- Can only read messages that have been loaded (need to scroll/open chats)
- No ability to send messages (read-only, which is all we need)

---

## Architecture

```
web.whatsapp.com tab
│
├── content_script: whatsappReader.js   ← injected by Chrome into WA Web tab
│   ├── Reads chat list DOM             ← finds all conversations + unread counts
│   ├── Reads recent messages           ← extracts text, sender, timestamp
│   ├── Detects academic keywords       ← deadline, submission, homework, etc.
│   └── chrome.runtime.sendMessage()   ← sends extracted data to extension
│
├── src/agents/whatsappAgent.js         ← processes + scores WA messages
│   ├── Keyword scoring (same as email) ← DEADLINE_WORDS, EXAM_WORDS, etc.
│   ├── AI summarization               ← Gemini summarizes "study group" chats
│   └── saves to chrome.storage        ← whatsappData key
│
└── sidepanel.js                        ← renders in Inbox tab (new "WhatsApp" section)
    └── masterAgent.js                  ← includes top WA messages in RAG context
```

---

## Implementation Plan

### Step 1 — manifest.json changes

Add `web.whatsapp.com` to `host_permissions` and declare the content script:

```json
"host_permissions": [
  "https://www.googleapis.com/*",
  "https://generativelanguage.googleapis.com/*",
  "https://*.bgu.ac.il/*",
  "https://web.whatsapp.com/*"
],
"content_scripts": [
  {
    "matches": ["https://web.whatsapp.com/*"],
    "js": ["src/whatsappReader.js"],
    "run_at": "document_idle"
  }
]
```

### Step 2 — `src/whatsappReader.js` (content script)

Runs inside the WhatsApp Web tab. Reads the chat list and message DOM.

**What to extract:**
- Chat name (group name or contact name)
- Last message text
- Sender name
- Timestamp
- Unread message count
- Whether it's a group chat

**WhatsApp Web DOM selectors (stable as of 2026):**

WhatsApp Web renders chats as a scrollable list. Each chat item has:
- `data-testid="cell-frame-container"` — the chat row
- `data-testid="cell-frame-title"` — the chat name
- `data-testid="last-msg"` — last message preview
- `data-testid="icon-unread-count"` — unread badge

For open chat messages:
- `data-testid="msg-container"` — each message bubble
- `data-testid="msg-text"` — message text
- `data-testid="msg-meta"` — timestamp

**Core logic:**

```js
// whatsappReader.js (runs on web.whatsapp.com)

const ACADEMIC_KEYWORDS = [
  'deadline', 'submission', 'due', 'homework', 'assignment', 'exam', 'test',
  'quiz', 'midterm', 'final', 'project', 'report', 'presentation', 'cancel',
  'postponed', 'zoom', 'meeting', 'reminder', 'urgent', 'important',
  // Hebrew keywords:
  'הגשה', 'בוחן', 'מבחן', 'תרגיל', 'פרויקט', 'ביטול', 'נדחה', 'דחוף', 'תזכורת'
];

function scoreMessage(text) {
  const lower = text.toLowerCase();
  return ACADEMIC_KEYWORDS.filter(kw => lower.includes(kw)).length;
}

function extractChats() {
  const chatItems = document.querySelectorAll('[data-testid="cell-frame-container"]');
  const results = [];

  chatItems.forEach(item => {
    const name = item.querySelector('[data-testid="cell-frame-title"]')?.textContent?.trim();
    const lastMsg = item.querySelector('[data-testid="last-msg"]')?.textContent?.trim();
    const unread = item.querySelector('[data-testid="icon-unread-count"]')?.textContent?.trim();
    const timestamp = item.querySelector('[data-testid="cell-frame-secondary"]
                                         [data-testid*="time"]')?.textContent?.trim();

    if (name && lastMsg) {
      results.push({
        chatName: name,
        lastMessage: lastMsg,
        unreadCount: unread ? parseInt(unread) : 0,
        timestamp,
        academicScore: scoreMessage(lastMsg),
        isGroup: item.querySelector('[data-testid="group-icon"]') !== null,
      });
    }
  });

  // Sort by academic score, then by unread count
  return results
    .filter(c => c.academicScore > 0 || c.unreadCount > 0)
    .sort((a, b) => b.academicScore - a.academicScore || b.unreadCount - a.unreadCount);
}

// Send to extension every time chats are updated
const observer = new MutationObserver(() => {
  const chats = extractChats();
  if (chats.length > 0) {
    chrome.runtime.sendMessage({ type: 'WHATSAPP_DATA', chats });
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// Initial read
setTimeout(() => {
  const chats = extractChats();
  chrome.runtime.sendMessage({ type: 'WHATSAPP_DATA', chats });
}, 2000);
```

### Step 3 — `src/agents/whatsappAgent.js`

Receives the data from the content script, applies AI scoring, saves to storage.

```js
// Receives from background.js which listens for WHATSAPP_DATA messages
export async function processWhatsAppData(chats, geminiApiKey) {
  // 1. Filter to academic-relevant chats
  const academic = chats.filter(c => c.academicScore > 0);

  // 2. For high-scoring chats (score >= 2), ask Gemini to extract deadlines
  const processed = [];
  for (const chat of academic) {
    if (chat.academicScore >= 2) {
      const prompt = `
You are reading a WhatsApp message from a university student's study group.
Extract any deadlines, assignments, or action items mentioned.
If none, say "none".
Message: "${chat.lastMessage}"
Chat name: "${chat.chatName}"
Response format: {"deadline": "...", "action": "...", "urgency": "high|medium|low"}
      `.trim();

      try {
        const result = await callGemini(prompt, geminiApiKey, { maxOutputTokens: 150 });
        chat.aiExtract = JSON.parse(result.match(/\{.*\}/s)?.[0] || '{}');
      } catch {
        chat.aiExtract = {};
      }
    }
    processed.push(chat);
  }

  await chrome.storage.local.set({
    whatsappData: { chats: processed, lastSync: Date.now() }
  });
}
```

### Step 4 — Wire into background.js

Listen for messages from the content script:

```js
// In background.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'WHATSAPP_DATA') {
    chrome.storage.local.get(['geminiApiKey'], ({ geminiApiKey }) => {
      whatsappAgent.processWhatsAppData(msg.chats, geminiApiKey);
    });
  }
});
```

### Step 5 — Render in Inbox Tab

Add a WhatsApp section below Gmail in the Inbox tab:

```
┌──────────────────────────────────┐
│ 📨 Gmail — Primary               │
│   [email cards...]               │
│                                  │
│ 📧 Gmail — BGU                   │
│   [email cards...]               │
│                                  │
│ 💬 WhatsApp — Study Groups       │
│   🔴 Software Engineering        │
│      "reminder: ex3 due tomorrow │
│       23:59 — don't forget!!"    │
│      Academic: deadline, reminder│
│                                  │
│   🟡 Operations Research         │
│      "who's presenting first?"   │
│      Academic: project           │
└──────────────────────────────────┘
```

### Step 6 — Include in RAG Context

Add to `masterAgent.assembleContext()`:

```js
const { whatsappData } = await chrome.storage.local.get('whatsappData');
if (whatsappData?.chats?.length) {
  context += '\n\n## WhatsApp Study Groups (Academic Messages)\n';
  whatsappData.chats.slice(0, 5).forEach(c => {
    context += `- [${c.chatName}] "${c.lastMessage}"`;
    if (c.aiExtract?.deadline) context += ` → Deadline: ${c.aiExtract.deadline}`;
    context += '\n';
  });
}
```

---

## Hebrew Support

Israeli university students mix Hebrew and English in messages. The keyword list must include both:

| English | Hebrew | Example |
|---|---|---|
| deadline | הגשה | "הגשה מחר ב-23:59" |
| exam | מבחן | "מבחן ביניים ביום ד'" |
| cancelled | ביטול | "ביטול שיעור" |
| reminder | תזכורת | "תזכורת: תרגיל 3" |
| postponed | נדחה | "הבוחן נדחה לשבוע הבא" |
| urgent | דחוף | "דחוף: לקרוא פרק 5" |

---

## Limitations & Mitigations

| Limitation | Mitigation |
|---|---|
| WhatsApp Web must be open in a tab | Add a "Open WhatsApp Web" button in extension setup; observer pattern means data flows as soon as user opens it |
| WhatsApp Web DOM changes occasionally | Use `data-testid` attributes (more stable than class names); add fallback selectors |
| Can only see last message in chat list | For high-priority chats, could auto-open and read full history (optional, opt-in) |
| No send capability | Read-only is sufficient — we're surfacing info, not automating replies |
| Performance: MutationObserver on entire body | Throttle observer callback with 2-second debounce |

---

## Privacy Considerations

- All processing is **local** — messages never leave the user's browser
- Gemini AI calls only send the **text content** of the last message, never user names or phone numbers
- Data is stored in `chrome.storage.local` (device-only, not synced)
- No data is sent to any external server except the Gemini API for AI processing
- User can disable WhatsApp integration from Setup at any time

---

## Development Checklist

- [ ] Add `web.whatsapp.com` to `host_permissions` in manifest.json
- [ ] Create `src/whatsappReader.js` content script
- [ ] Add content script declaration to manifest.json
- [ ] Create `src/agents/whatsappAgent.js`
- [ ] Wire `WHATSAPP_DATA` message listener in background.js
- [ ] Add WhatsApp section rendering to `sidepanel.js` Inbox tab
- [ ] Add WhatsApp context to `masterAgent.assembleContext()`
- [ ] Add Hebrew keywords to scorer
- [ ] Add "WhatsApp" toggle in Setup tab
- [ ] Test: open WhatsApp Web → verify data flows to extension
- [ ] Test: chat with AI → verify WhatsApp context appears
- [ ] Test: notification fires for high-scoring WA messages
- [ ] Update LEARNING_LOG.md with Mission 6.5

---

## Estimated Effort

| Task | Time |
|---|---|
| manifest.json + content script scaffold | 30 min |
| DOM selector research on WhatsApp Web | 45 min |
| `whatsappReader.js` complete | 1.5 hours |
| `whatsappAgent.js` + background wiring | 1 hour |
| UI rendering in Inbox tab | 1 hour |
| RAG context integration | 30 min |
| Hebrew keywords + testing | 45 min |
| **Total** | **~6 hours** |

---

## Why This Is Powerful (Interview Story)

> "Most integrations rely on official APIs — you apply, get approved, and wait. I identified that WhatsApp Web already has all the data loaded in the browser DOM, authenticated, in real-time. So I wrote a content script that reads it the same way I read Moodle — no API, no approval, no cost. The result is a unified academic inbox that includes the channel Israeli students actually use most."

This demonstrates:
- **Creative problem solving** — finding an unconventional path when official APIs are unavailable
- **Systems thinking** — identifying that the data constraint was access pattern, not data availability
- **Practical engineering** — building the simplest solution that works, not the most architecturally "correct"
