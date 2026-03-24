/**
 * EMAIL AGENT
 * Fetches emails from one or two Gmail accounts,
 * classifies them, scores importance 0-10,
 * and decides which ones deserve a popup notification.
 */

import { callGemini } from '../gemini.js';

const GMAIL_BASE = 'https://www.googleapis.com/gmail/v1/users/me';

// ── Keywords for fast rule-based scoring ─────────────────────────
const URGENT_WORDS   = ['דחוף','מיידי','urgent','asap','deadline','חשוב מאוד','immediately'];
const PAYMENT_WORDS  = ['שכר לימוד','תשלום','חשבונית','payment','invoice','tuition','fee','חוב'];
const ACTION_WORDS   = ['נדרש','יש למלא','יש להגיש','please submit','action required','respond by','confirm'];
const EXAM_WORDS     = ['מבחן','בחינה','exam','test','quiz','midterm','final','מועד'];
const MOODLE_WORDS   = ['moodle','assignment','submission','grade','הגשה','ציון'];
const IGNORE_WORDS   = ['newsletter','unsubscribe','פרסומת','promotion','noreply@github','noreply@linkedin'];

function getStorage(keys) { return new Promise(r => chrome.storage.local.get(keys, r)); }
function setStorage(obj)  { return new Promise(r => chrome.storage.local.set(obj, r)); }

// ── Token getter ─────────────────────────────────────────────────
function getToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, token => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(token);
    });
  });
}

// ── Gmail API calls ──────────────────────────────────────────────
async function gmailList(token, q, maxResults = 40) {
  const params = new URLSearchParams({ q, maxResults });
  const res = await fetch(`${GMAIL_BASE}/messages?${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return data.messages || [];
}

async function gmailGet(token, id) {
  const res = await fetch(
    `${GMAIL_BASE}/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.json();
}

function parseMsg(raw) {
  const h    = raw.payload?.headers || [];
  const get  = name => h.find(x => x.name === name)?.value || '';
  return {
    id:       raw.id,
    subject:  get('Subject') || '(no subject)',
    from:     get('From'),
    date:     get('Date'),
    snippet:  raw.snippet || '',
    isUnread: (raw.labelIds || []).includes('UNREAD')
  };
}

// ── Rule-based importance score 0-10 ─────────────────────────────
function ruleScore(email) {
  const text = `${email.subject} ${email.snippet} ${email.from}`.toLowerCase();
  let score  = 3; // baseline
  let reason = '';
  let category = 'general';

  if (IGNORE_WORDS.some(w => text.includes(w.toLowerCase()))) return { score: 0, category: 'promo', reason: 'promotional' };

  if (URGENT_WORDS.some(w  => text.includes(w.toLowerCase()))) { score += 4; reason = 'urgent';  }
  if (EXAM_WORDS.some(w    => text.includes(w.toLowerCase()))) { score += 3; category = 'exam';   reason = 'exam-related'; }
  if (PAYMENT_WORDS.some(w => text.includes(w.toLowerCase()))) { score += 2; category = 'payment'; }
  if (ACTION_WORDS.some(w  => text.includes(w.toLowerCase()))) { score += 2; reason += ' action-required'; }
  if (MOODLE_WORDS.some(w  => text.includes(w.toLowerCase()))) { score += 1; category = 'moodle'; }
  if (email.isUnread) score += 1;

  // BGU sender boost
  if (email.from.includes('bgu.ac.il') || email.from.includes('post.bgu.ac.il')) score += 2;

  return { score: Math.min(score, 10), category, reason: reason.trim() };
}

// ── Gemini AI scoring for borderline emails ───────────────────────
async function aiScore(emails, apiKey) {
  if (!apiKey || !emails.length) return [];

  const prompt = `You are classifying university student emails for importance.
Score each email 0-10 (10=most important) and classify it.
Categories: exam, assignment, payment, admin, moodle, social, promo, general

Emails:
${emails.map((e,i) => `${i+1}. From: ${e.from}\nSubject: ${e.subject}\nSnippet: ${e.snippet}`).join('\n\n')}

Respond ONLY with JSON array:
[{"index":1,"score":7,"category":"exam","summary":"Brief 1-line summary in same language as email"}]`;

  try {
    const text = await callGemini(prompt, apiKey, { temperature: 0.1, maxOutputTokens: 500 });
    const json = text.match(/\[[\s\S]*\]/)?.[0];
    return json ? JSON.parse(json) : [];
  } catch (e) {
    console.warn('[EmailAgent] AI score failed:', e.message);
    return [];
  }
}

// ── Fetch emails from one account (given a token) ─────────────────
async function fetchEmailsForToken(token, accountLabel = '') {
  try {
    const ids     = await gmailList(token, 'newer_than:3d', 40);
    if (!ids.length) return [];
    const details = await Promise.all(ids.slice(0, 30).map(m => gmailGet(token, m.id)));
    return details.map(raw => ({ ...parseMsg(raw), account: accountLabel }));
  } catch (e) {
    console.warn(`[EmailAgent] Failed to fetch ${accountLabel} emails:`, e.message);
    return [];
  }
}

// ── Main run ─────────────────────────────────────────────────────
export async function runEmailAgent() {
  console.log('[EmailAgent] Starting…');
  const { geminiApiKey, emailAgentState = {}, emailAiScoreCache = {},
          bguEmailToken, bguEmailExpiry, bguEmailAddress } =
    await getStorage(['geminiApiKey', 'emailAgentState', 'emailAiScoreCache',
                      'bguEmailToken', 'bguEmailExpiry', 'bguEmailAddress']);

  // ── Primary account (Chrome-profile Google account) ──────────────
  let primaryEmails = [];
  try {
    const token  = await getToken(false);
    primaryEmails = await fetchEmailsForToken(token, 'primary');
  } catch {
    console.warn('[EmailAgent] No primary auth token');
  }

  // ── Secondary account (BGU @post.bgu.ac.il) ──────────────────────
  let bguEmails = [];
  if (bguEmailToken && bguEmailExpiry > Date.now()) {
    console.log(`[EmailAgent] Fetching BGU inbox: ${bguEmailAddress}`);
    bguEmails = await fetchEmailsForToken(bguEmailToken, 'bgu');
    // Give BGU emails a pre-score boost so they're prioritised correctly
    bguEmails.forEach(e => { e._isBGU = true; });
  } else if (bguEmailToken) {
    // SEC-08: clear expired tokens from storage — no point keeping them around
    console.warn('[EmailAgent] BGU token expired — clearing from storage, user must reconnect');
    await setStorage({ bguEmailToken: null, bguEmailExpiry: null });
  }

  // ── Merge, deduplicate by email ID ───────────────────────────────
  const seen   = new Set();
  const emails = [...primaryEmails, ...bguEmails].filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  if (!emails.length) {
    console.log('[EmailAgent] No emails fetched from any account');
    return null;
  }
  console.log(`[EmailAgent] ${primaryEmails.length} primary + ${bguEmails.length} BGU = ${emails.length} total`);

  // Rule scoring first (fast, free, always runs)
  const scored = emails.map(email => {
    const { score, category, reason } = ruleScore(email);
    // BGU account emails get an extra +2 even if their From header doesn't show bgu.ac.il
    // (BGU Workspace emails sometimes use google workspace routing)
    const bguBonus = email._isBGU && !email.from.includes('bgu.ac.il') ? 2 : 0;
    return { ...email, importanceScore: Math.min(score + bguBonus, 10), category, reason };
  }).filter(e => e.importanceScore > 0); // drop promos

  // ── AI scoring: only for borderline emails we haven't scored before ──
  // emailAiScoreCache: { [emailId]: { score, category, aiSummary } }
  // This prevents re-calling Gemini for the same email on every 5-minute cycle.
  const needsAiScore = scored.filter(e =>
    e.importanceScore >= 3 &&
    e.importanceScore <= 6 &&
    !emailAiScoreCache[e.id]   // ← KEY: skip if we already scored this email
  ).slice(0, 8); // max 8 per run to protect quota

  if (needsAiScore.length && geminiApiKey) {
    console.log(`[EmailAgent] AI scoring ${needsAiScore.length} new borderline emails`);
    const aiResults = await aiScore(needsAiScore, geminiApiKey);
    if (Array.isArray(aiResults)) {
      aiResults.forEach(r => {
        const email = needsAiScore[r.index - 1];
        if (email) {
          email.importanceScore = r.score;
          email.category        = r.category || email.category;
          email.aiSummary       = r.summary;
          // Cache this score so we never call Gemini for this email again
          emailAiScoreCache[email.id] = {
            score:     r.score,
            category:  r.category,
            aiSummary: r.summary
          };
        }
      });
      // Persist the cache (keep last 500 entries)
      const cacheEntries = Object.entries(emailAiScoreCache);
      const trimmedCache = Object.fromEntries(cacheEntries.slice(-500));
      await setStorage({ emailAiScoreCache: trimmedCache });
    }
  } else if (needsAiScore.length === 0) {
    console.log('[EmailAgent] All borderline emails already scored — no API calls needed');
  }

  // Apply cached AI scores to emails that were previously scored
  scored.forEach(email => {
    const cached = emailAiScoreCache[email.id];
    if (cached && !email.aiSummary) {
      email.importanceScore = cached.score;
      email.category        = cached.category || email.category;
      email.aiSummary       = cached.aiSummary;
    }
  });

  // Sort by importance
  scored.sort((a, b) => b.importanceScore - a.importanceScore);

  // Find new high-importance emails to notify about
  const alreadyNotified = new Set(emailAgentState.notified || []);
  const toNotify = scored.filter(e =>
    e.importanceScore >= 7 &&
    e.isUnread &&
    !alreadyNotified.has(e.id)
  );

  // Save results
  const newState = {
    notified: [...alreadyNotified, ...toNotify.map(e => e.id)].slice(-100),
    lastRun:  Date.now()
  };

  await setStorage({
    emails: scored,
    emailsToNotify: toNotify,
    emailAgentState: newState,
    emailAgentLastRun: Date.now()
  });

  console.log(`[EmailAgent] Done: ${scored.length} emails, ${toNotify.length} to notify`);
  return { emails: scored, toNotify };
}
