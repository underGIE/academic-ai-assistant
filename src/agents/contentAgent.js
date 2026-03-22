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

import { callGemini } from '../gemini.js';

function getStorage(keys) { return new Promise(r => chrome.storage.local.get(keys, r)); }
function setStorage(obj)  { return new Promise(r => chrome.storage.local.set(obj, r)); }

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

  return callGemini(prompt, apiKey, { temperature: 0.3, maxOutputTokens: 1200 });
}

// ── Content fingerprint for cache invalidation ───────────────────
// Only regenerate if the course content actually changed (new sections/files).
// We do NOT use lastSync timestamp — that changes every Moodle sync and
// would cause a full re-summarization every hour, burning the entire API quota.
function courseFingerprint(detail) {
  const sectionCount = detail.sections?.length || 0;
  const itemCount    = detail.sections?.reduce((n, s) => n + (s.items?.length || 0), 0) || 0;
  const fileCount    = detail.files?.length || 0;
  return `${detail.courseId}_s${sectionCount}_i${itemCount}_f${fileCount}`;
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — regenerate weekly at most

// ── Main run ─────────────────────────────────────────────────────
export async function runContentAgent(onProgress) {
  console.log('[ContentAgent] Starting…');
  const { geminiApiKey, moodleData, courseStudyGuides = {} } =
    await getStorage(['geminiApiKey', 'moodleData', 'courseStudyGuides']);

  if (!geminiApiKey) {
    console.warn('[ContentAgent] No API key, skipping');
    return null;
  }
  if (!moodleData?.courseDetails?.length) {
    console.warn('[ContentAgent] No Moodle data, skipping');
    return null;
  }

  const guides      = { ...courseStudyGuides };
  const details     = moodleData.courseDetails || [];
  const assignments = moodleData.assignments   || [];
  const total       = details.length;
  const now         = Date.now();

  for (let i = 0; i < details.length; i++) {
    const detail      = details[i];
    const fingerprint = courseFingerprint(detail);
    const existing    = guides[detail.courseId];

    // ── Cache hit: skip if fingerprint matches AND within TTL ──
    if (existing?.fingerprint === fingerprint &&
        existing?.generatedAt &&
        (now - existing.generatedAt) < CACHE_TTL_MS) {
      onProgress?.(`${detail.courseName} — cached ✓`, Math.round(((i+1)/total)*100));
      console.log(`[ContentAgent] Cache hit for ${detail.courseName}`);
      continue;
    }

    onProgress?.(`Generating guide: ${detail.courseName}…`, Math.round(((i+1)/total)*100));
    console.log(`[ContentAgent] Generating for ${detail.courseName} (fingerprint: ${fingerprint})`);

    const courseAssigns = assignments.filter(a => a.courseId === detail.courseId);
    try {
      const summary = await summarizeCourse(detail, courseAssigns, geminiApiKey);
      guides[detail.courseId] = {
        courseId:    detail.courseId,
        courseName:  detail.courseName,
        summary,
        fingerprint,             // ← content hash, not timestamp
        generatedAt: now
      };
      // Save after each course so progress isn't lost on crash
      await setStorage({ courseStudyGuides: guides });
    } catch (e) {
      console.warn(`[ContentAgent] Failed for ${detail.courseName}:`, e.message);
      if (e.message?.includes('429') || e.message?.includes('quota')) {
        console.warn('[ContentAgent] Rate limit hit — stopping, will resume next run');
        break; // stop gracefully instead of hammering the API
      }
    }

    // 7-second delay = max ~8 RPM, safely under the 10 RPM free tier limit
    await new Promise(r => setTimeout(r, 7000));
  }

  await setStorage({ contentAgentLastRun: now });
  console.log(`[ContentAgent] Done: ${Object.keys(guides).length} course guides cached`);
  return guides;
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
