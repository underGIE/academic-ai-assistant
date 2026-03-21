// ============================================================
// GMAIL SERVICE
// Fetches and caches emails using Gmail API
// Uses the 'q' parameter — same syntax as Gmail search box
// ============================================================

const GMAIL_BASE = "https://www.googleapis.com/gmail/v1/users/me";

function getGoogleToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(token);
    });
  });
}

async function fetchMessageIds(q = "newer_than:7d", maxResults = 30) {
  const token = await getGoogleToken();
  const params = new URLSearchParams({ q, maxResults });
  const res = await fetch(`${GMAIL_BASE}/messages?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.messages || [];
}

async function fetchMessageDetail(messageId) {
  const token = await getGoogleToken();
  const res = await fetch(
    `${GMAIL_BASE}/messages/${messageId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return res.json();
}

function parseMessage(raw) {
  const headers = raw.payload?.headers || [];
  const get = (name) => headers.find((h) => h.name === name)?.value || "";
  return {
    id: raw.id,
    subject: get("Subject") || "(no subject)",
    from: get("From"),
    date: get("Date"),
    snippet: raw.snippet || "",
    isUnread: (raw.labelIds || []).includes("UNREAD"),
  };
}

export async function fetchRecentEmails(maxResults = 30) {
  try {
    const ids = await fetchMessageIds("newer_than:7d", maxResults);
    if (!ids.length) return [];
    const details = await Promise.all(ids.map((m) => fetchMessageDetail(m.id)));
    return details.map(parseMessage);
  } catch (err) {
    console.error("[Gmail] fetchRecentEmails error:", err);
    return [];
  }
}

export async function fetchEmailsByQuery(q, maxResults = 10) {
  try {
    const ids = await fetchMessageIds(q, maxResults);
    if (!ids.length) return [];
    const details = await Promise.all(ids.map((m) => fetchMessageDetail(m.id)));
    return details.map(parseMessage);
  } catch (err) {
    console.error("[Gmail] fetchEmailsByQuery error:", err);
    return [];
  }
}
