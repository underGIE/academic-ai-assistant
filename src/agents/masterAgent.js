/**
 * MASTER AGENT
 * The main AI the user talks to.
 * Knows everything every other agent has done.
 * Assembles full RAG context and answers as a brilliant BGU nerd friend.
 */

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

function getStorage(keys) { return new Promise(r => chrome.storage.local.get(keys, r)); }
function setStorage(obj)  { return new Promise(r => chrome.storage.local.set(obj, r)); }

// ── Build full multi-agent context ───────────────────────────────
async function assembleContext() {
  const data = await getStorage([
    'calendarEvents',
    'emails',
    'moodleData',
    'courseStudyGuides',
    'courses',
    'studyNotes',
    'emailAgentLastRun',
    'contentAgentLastRun',
    'uxSuggestions'
  ]);

  const {
    calendarEvents    = [],
    emails            = [],
    moodleData        = null,
    courseStudyGuides = {},
    courses           = [],
    studyNotes        = '',
    emailAgentLastRun,
    contentAgentLastRun,
    uxSuggestions     = []
  } = data;

  // 1. Calendar
  const now         = new Date();
  const eventsText  = calendarEvents
    .filter(e => new Date(e.start?.dateTime || e.start?.date) >= now)
    .slice(0, 10)
    .map(e => `[EVENT: ${e.summary}] — ${e.start?.dateTime || e.start?.date}`)
    .join('\n');

  // 2. Emails (top 15 by importance score)
  const emailsText = emails
    .sort((a,b) => (b.importanceScore||0) - (a.importanceScore||0))
    .slice(0, 15)
    .map(e => {
      const score = e.importanceScore ? ` [importance: ${e.importanceScore}/10]` : '';
      const summ  = e.aiSummary ? ` | ${e.aiSummary}` : ` | ${e.snippet?.slice(0,60)}`;
      return `[EMAIL: ${e.subject}] from ${e.from}${score}${summ}`;
    }).join('\n');

  // 3. Moodle courses
  const moodleCoursesText = (moodleData?.courses || [])
    .map(c => `[COURSE: ${c.name}]`)
    .join('\n');

  // 4. Moodle assignments with urgency
  const assignText = (moodleData?.assignments || [])
    .filter(a => a.dueDate)
    .sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 10)
    .map(a => {
      const diff  = new Date(a.dueDate) - now;
      const days  = Math.ceil(diff / 86400000);
      const status = diff < 0 ? '⚠️ OVERDUE' : days <= 1 ? '🔴 due tomorrow' : days <= 3 ? '🟡 due soon' : '🟢';
      return `[ASSIGNMENT: ${a.name}] ${status} in [COURSE: ${a.courseName}] — ${new Date(a.dueDate).toLocaleDateString('he-IL')}`;
    }).join('\n');

  // 5. AI study guides (Content Agent output)
  const studyGuideSummary = Object.values(courseStudyGuides)
    .slice(0, 4)
    .map(g => `[COURSE: ${g.courseName}]: Study guide available (generated ${Math.round((Date.now()-g.generatedAt)/3600000)}h ago)`)
    .join('\n');

  // 6. Manual courses + notes
  const manualCoursesText = courses.map(c =>
    `[COURSE: ${c.name}] — Lecturer: ${c.lecturer}${c.notes ? ` | ${c.notes}` : ''}`
  ).join('\n');

  // 7. Agent status (so master agent knows what has been done)
  const agentStatus = [
    emailAgentLastRun    ? `✅ Email Agent last ran: ${new Date(emailAgentLastRun).toLocaleTimeString('he-IL')}` : '❌ Email Agent has not run',
    contentAgentLastRun  ? `✅ Content Agent last ran: ${new Date(contentAgentLastRun).toLocaleTimeString('he-IL')}` : '❌ Content Agent has not run',
    moodleData           ? `✅ Moodle Agent: ${moodleData.courses?.length||0} courses, ${moodleData.assignments?.length||0} assignments` : '❌ Moodle not connected'
  ].join('\n');

  return {
    eventsText,
    emailsText,
    moodleCoursesText,
    assignText,
    studyGuideSummary,
    manualCoursesText,
    studyNotes,
    agentStatus
  };
}

// ── Build master prompt ──────────────────────────────────────────
function buildMasterPrompt(question, ctx, conversationHistory) {
  const historyText = conversationHistory.slice(-6).map(m =>
    `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.content}`
  ).join('\n');

  return `You are the MASTER AGENT — an elite AI academic assistant for a BGU Industrial & Management Engineering student. You coordinate a team of agents (Email, Moodle, Content, Notification) and have access to all their outputs.

## Your Character
You are a brilliant nerd friend who:
- Knows the student's ENTIRE academic situation (schedule, emails, assignments, course material)
- Explains concepts with intuition first, then depth
- Is strategic about exam prep — knows how BGU lecturers structure their exams
- Is warm, direct, practical — like WhatsApp with your smartest friend
- Matches the language of the question (Hebrew or English)
- References specific data points when answering (events, emails, assignments, courses)

## Agent Status Report
${ctx.agentStatus}

## Student's Enrolled Courses
${ctx.moodleCoursesText || ctx.manualCoursesText || '(No courses loaded)'}

## Upcoming Calendar Events
${ctx.eventsText || 'None found'}

## Assignment Deadlines (by urgency)
${ctx.assignText || 'None found'}

## Recent Emails (by importance)
${ctx.emailsText || 'None found'}

## AI Study Guides Available
${ctx.studyGuideSummary || 'Not generated yet — go to Moodle tab and sync'}

## Saved Notes
${ctx.studyNotes || 'None yet'}

## Conversation History
${historyText || 'New conversation'}

## Student's Question
${question}

## Response Rules
- Reference items as [EVENT: title], [EMAIL: subject], [ASSIGNMENT: name], [COURSE: name]
- For concept questions: 💡 Intuition → 📐 Formal → 🔢 Example → 🎯 BGU Exam Tip
- For "what do I have today/this week": list concretely from the data above
- For exam prep: be strategic, not generic — what does THIS course's structure suggest to focus on
- Keep it practical. The student is busy.`;
}

// ── Gemini call ──────────────────────────────────────────────────
async function callGemini(prompt, apiKey) {
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 1500 }
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';
}

function parseRefs(text) {
  const refs = [];
  const patterns = [
    { re: /\[EVENT: ([^\]]+)\]/g,      type: 'event' },
    { re: /\[EMAIL: ([^\]]+)\]/g,      type: 'email' },
    { re: /\[ASSIGNMENT: ([^\]]+)\]/g, type: 'assignment' },
    { re: /\[COURSE: ([^\]]+)\]/g,     type: 'course' },
    { re: /\[OVERDUE: ([^\]]+)\]/g,    type: 'overdue' }
  ];
  for (const { re, type } of patterns)
    for (const m of text.matchAll(re)) refs.push({ type, title: m[1] });
  return [...new Map(refs.map(r => [`${r.type}:${r.title}`, r])).values()]; // deduplicate
}

// ── Save note to long-term memory ────────────────────────────────
export async function saveNote(note) {
  const { studyNotes = '' } = await getStorage(['studyNotes']);
  const ts      = new Date().toLocaleDateString('he-IL');
  const updated = `[${ts}] ${note}\n${studyNotes}`;
  await setStorage({ studyNotes: updated });
}

// ── Main ask function ─────────────────────────────────────────────
export async function askMaster(question, conversationHistory = []) {
  const { geminiApiKey } = await getStorage(['geminiApiKey']);
  if (!geminiApiKey) throw new Error('אין מפתח Gemini — הוסף אותו בלשונית Setup');

  const ctx    = await assembleContext();
  const prompt = buildMasterPrompt(question, ctx, conversationHistory);
  const text   = await callGemini(prompt, geminiApiKey);
  const refs   = parseRefs(text);

  // Save conversation to history
  const { conversationHistory: hist = [] } = await getStorage(['conversationHistory']);
  const updated = [
    ...hist,
    { role: 'user',      content: question },
    { role: 'assistant', content: text }
  ].slice(-30); // keep last 30 messages
  await setStorage({ conversationHistory: updated });

  return { text, refs };
}

// ── UX Agent suggestions ──────────────────────────────────────────
export async function generateUXSuggestions() {
  const { geminiApiKey, moodleData, emails = [], uxSuggestions = [] } =
    await getStorage(['geminiApiKey', 'moodleData', 'emails', 'uxSuggestions']);

  if (!geminiApiKey) return [];

  const prompt = `You are a UX Agent for an academic Chrome Extension used by a BGU student.
Based on the data below, suggest 2-3 concrete new features or improvements.
Each suggestion must be specific and implementable.

Data available:
- Courses: ${moodleData?.courses?.length || 0}
- Assignments: ${moodleData?.assignments?.length || 0}
- Emails processed: ${emails.length}

Respond ONLY with JSON:
[{"title":"Feature name","description":"What it does and why it helps","priority":"high|medium|low"}]`;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 400 }
      })
    });
    const data    = await res.json();
    const text    = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const json    = text.match(/\[[\s\S]*\]/)?.[0];
    const parsed  = json ? JSON.parse(json) : [];
    const newSuggestions = parsed.map(s => ({ ...s, id: Date.now() + Math.random(), status: 'pending' }));
    await setStorage({ uxSuggestions: [...uxSuggestions, ...newSuggestions].slice(-20) });
    return newSuggestions;
  } catch (e) {
    console.warn('[MasterAgent/UX] Failed:', e.message);
    return [];
  }
}
