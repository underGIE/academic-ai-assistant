/**
 * CONTENT AGENT
 * Takes raw Moodle course data (sections, files, assignments)
 * and uses Gemini to produce:
 *   - An intuitive course summary
 *   - Key concepts explained simply
 *   - What to focus on for the exam
 *   - A learning checklist
 *
 * Output is stored in chrome.storage and shown inline in the Moodle tab
 * (no external links as primary experience).
 */

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

function getStorage(keys) { return new Promise(r => chrome.storage.local.get(keys, r)); }
function setStorage(obj)  { return new Promise(r => chrome.storage.local.set(obj, r)); }

async function callGemini(prompt, apiKey) {
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1200 }
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── Build a study summary for one course ─────────────────────────
async function summarizeCourse(courseDetail, assignments, apiKey) {
  const { courseName, sections = [] } = courseDetail;

  // Flatten all material into readable text
  const materialText = sections.map(sec => {
    const items = (sec.items || []).map(i => `  - ${i.name} (${i.type})`).join('\n');
    return `Section: ${sec.title}\n${items}`;
  }).join('\n\n');

  const assignText = assignments.map(a =>
    `- ${a.name}${a.dueDate ? ` (due: ${new Date(a.dueDate).toLocaleDateString('he-IL')})` : ''}`
  ).join('\n');

  const prompt = `You are an expert academic tutor helping a Ben-Gurion University Industrial & Management Engineering student understand their course material.

Course: "${courseName}"

Course materials and sections:
${materialText || '(No sections found)'}

Assignments:
${assignText || '(No assignments)'}

Create a structured study guide in the SAME LANGUAGE as the course name (Hebrew if Hebrew, English if English).

Format your response EXACTLY like this:

## 📌 מה הקורס הזה עוסק בו
[2-3 sentences explaining the core purpose of this course in simple terms]

## 🧠 נושאים מרכזיים
[List the 5-8 most important topics from the sections. For each topic, add one sentence of intuition in plain language]

## 🎯 מה חשוב לבחינה
[Based on typical BGU I&ME courses and the material listed, what should the student focus on most? Be specific and strategic]

## ✅ רשימת למידה
[Checklist of concrete study actions — e.g. "לקרוא את הסיכום של שיעור 3", "לפתור תרגילים מסוג X"]

## ⚡ טיפ מהיר
[One key insight that helps understand the core idea of this course]`;

  return callGemini(prompt, apiKey);
}

// ── Main run ─────────────────────────────────────────────────────
export async function runContentAgent(onProgress) {
  console.log('[ContentAgent] Starting…');
  const { geminiApiKey, moodleData, contentAgentCache = {} } =
    await getStorage(['geminiApiKey', 'moodleData', 'contentAgentCache']);

  if (!geminiApiKey) {
    console.warn('[ContentAgent] No API key, skipping');
    return null;
  }
  if (!moodleData?.courseDetails?.length) {
    console.warn('[ContentAgent] No Moodle data, skipping');
    return null;
  }

  const summaries   = { ...contentAgentCache };
  const details     = moodleData.courseDetails || [];
  const assignments = moodleData.assignments   || [];
  const total       = details.length;

  for (let i = 0; i < details.length; i++) {
    const detail  = details[i];
    const cacheKey = `${detail.courseId}_${moodleData.lastSync}`;

    // Skip if already summarized in this sync cycle
    if (summaries[cacheKey]) {
      onProgress?.(`Skipping ${detail.courseName} (cached)`, Math.round(((i+1)/total)*100));
      continue;
    }

    onProgress?.(`Summarizing ${detail.courseName}…`, Math.round(((i+1)/total)*100));

    const courseAssigns = assignments.filter(a => a.courseId === detail.courseId);
    try {
      const summary = await summarizeCourse(detail, courseAssigns, geminiApiKey);
      summaries[cacheKey] = {
        courseId:   detail.courseId,
        courseName: detail.courseName,
        summary,
        generatedAt: Date.now()
      };
      // Save incrementally so progress isn't lost if it crashes
      await setStorage({ contentAgentCache: summaries });
    } catch (e) {
      console.warn(`[ContentAgent] Failed for ${detail.courseName}:`, e.message);
    }

    // Small delay to respect Gemini rate limits (10 RPM free tier)
    await new Promise(r => setTimeout(r, 6500));
  }

  // Build the final output map: courseId → summary text
  const courseStudyGuides = {};
  Object.values(summaries).forEach(entry => {
    if (entry.courseId) courseStudyGuides[entry.courseId] = entry;
  });

  await setStorage({
    courseStudyGuides,
    contentAgentLastRun: Date.now()
  });

  console.log(`[ContentAgent] Done: ${Object.keys(courseStudyGuides).length} course summaries`);
  return courseStudyGuides;
}

// ── Get summary for a single course (called from Moodle tab UI) ──
export async function getCourseStudyGuide(courseId) {
  const { courseStudyGuides = {}, geminiApiKey, moodleData } =
    await getStorage(['courseStudyGuides', 'geminiApiKey', 'moodleData']);

  // Return cached if available
  if (courseStudyGuides[courseId]) return courseStudyGuides[courseId];

  // Generate on-demand if not cached
  if (!geminiApiKey || !moodleData) return null;

  const detail = moodleData.courseDetails?.find(d => d.courseId === courseId || d.courseId === +courseId);
  if (!detail) return null;

  const assigns = (moodleData.assignments || []).filter(a => a.courseId == courseId);
  const summary = await summarizeCourse(detail, assigns, geminiApiKey);

  const entry = { courseId, courseName: detail.courseName, summary, generatedAt: Date.now() };

  // Cache it
  const updated = { ...courseStudyGuides, [courseId]: entry };
  await setStorage({ courseStudyGuides: updated });

  return entry;
}
