// Gemini 2.5 Flash — free: 10 RPM, 1500/day, permanent
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

function getStorage(keys) {
  return new Promise((r) => chrome.storage.local.get(keys, r));
}

// ── RAG: assemble all context from storage ───────────────────────
async function buildContext() {
  const {
    calendarEvents = [],
    emails = [],
    courses = [], // manual courses
    studyNotes = "",
    moodleData = null,
  } = await getStorage([
    "calendarEvents",
    "emails",
    "courses",
    "studyNotes",
    "moodleData",
  ]);

  // 1. Calendar
  const eventsText = calendarEvents
    .slice(0, 15)
    .map((e) => `[EVENT: ${e.summary}] — ${e.start?.dateTime || e.start?.date}`)
    .join("\n");

  // 2. Emails
  const emailsText = emails
    .slice(0, 20)
    .map((e) => `[EMAIL: ${e.subject}] from ${e.from} — ${e.snippet}`)
    .join("\n");

  // 3. Manual courses
  const manualText = courses
    .map(
      (c) =>
        `[COURSE: ${c.name}] Lecturer: ${c.lecturer}${c.notes ? ` | ${c.notes}` : ""}`,
    )
    .join("\n");

  // 4. Moodle — the rich RAG layer
  let moodleCoursesText = "";
  let moodleAssignText = "";
  let moodleSectionsText = "";
  let moodleVideosText = "";

  if (moodleData) {
    // Enrolled courses
    moodleCoursesText = (moodleData.courses || [])
      .map((c) => `[COURSE: ${c.name}] (${c.shortName || c.id})`)
      .join("\n");

    // Assignments
    const now = new Date();
    const upcoming = (moodleData.assignments || [])
      .filter((a) => a.dueDate && new Date(a.dueDate) > now)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
      .slice(0, 12);
    const overdue = (moodleData.assignments || []).filter(
      (a) => a.dueDate && new Date(a.dueDate) <= now,
    );

    if (upcoming.length)
      moodleAssignText +=
        "Upcoming:\n" +
        upcoming
          .map(
            (a) =>
              `[ASSIGNMENT: ${a.name}] in [COURSE: ${a.courseName}] — due ${new Date(a.dueDate).toLocaleDateString("he-IL")}`,
          )
          .join("\n");
    if (overdue.length)
      moodleAssignText +=
        "\nOverdue:\n" +
        overdue
          .map((a) => `[OVERDUE: ${a.name}] in [COURSE: ${a.courseName}]`)
          .join("\n");

    // Course sections (what's been taught, what materials exist)
    moodleSectionsText = (moodleData.courseDetails || [])
      .map((cd) => {
        const secs = (cd.sections || [])
          .slice(0, 6)
          .map(
            (s) =>
              `  Section "${s.title}": ${s.items
                ?.slice(0, 5)
                .map((i) => i.name)
                .join(", ")}`,
          )
          .join("\n");
        return `[COURSE: ${cd.courseName}]\n${secs}`;
      })
      .join("\n\n");

    // Lecture videos
    const videoEntries = Object.entries(moodleData.videos || {});
    if (videoEntries.length) {
      moodleVideosText = videoEntries
        .map(([courseId, vids]) => {
          const course = (moodleData.courses || []).find(
            (c) => c.id === courseId || c.id === +courseId,
          );
          return `[COURSE: ${course?.name || courseId}] videos: ${vids
            .slice(0, 6)
            .map((v) => v.title)
            .join(", ")}`;
        })
        .join("\n");
    }
  }

  return {
    eventsText,
    emailsText,
    manualText,
    moodleCoursesText,
    moodleAssignText,
    moodleSectionsText,
    moodleVideosText,
    studyNotes,
    hasMoodle: !!moodleData,
  };
}

// ── Prompt builder ───────────────────────────────────────────────
function buildPrompt(question, ctx) {
  return `You are an elite academic assistant for a student at Ben-Gurion University of the Negev (BGU), studying Industrial & Management Engineering (הנדסת תעשייה וניהול).

## Your Personality
You are a brilliant nerd friend who:
- Understands the material deeply and explains it intuitively
- Knows how BGU exams work — lecturers reuse problem structures from their own slides
- Helps strategically: what to focus on, what this lecturer cares about, how to recognize question types fast
- Answers like texting a smart friend, not writing a paper
- Matches the language of the question (Hebrew or English)

## BGU Industrial Engineering Context
Core subjects: Operations Research, Statistics, Simulation, Supply Chain, Quality Management, Engineering Economics, Production Planning, Human Factors, Data Analysis.
Success at BGU = understanding each lecturer's style + knowing how they structure exam problems.

---

## Enrolled Courses (from Moodle)
${ctx.moodleCoursesText || ctx.manualText || "(No courses connected — link Moodle in the Moodle tab)"}

## Assignment Deadlines (from Moodle)
${ctx.moodleAssignText || "(No Moodle data yet)"}

## Course Content & Materials (from Moodle)
${ctx.moodleSectionsText || "(No course content loaded)"}

## Lecture Videos Available
${ctx.moodleVideosText || "(No videos loaded)"}

## Saved Study Notes
${ctx.studyNotes || "(None yet)"}

## Upcoming Calendar Events
${ctx.eventsText || "No events found."}

## Recent Emails
${ctx.emailsText || "No emails found."}

---

## Student's Question
${question}

## Response Format
- Reference items as: [EVENT: title], [EMAIL: subject], [ASSIGNMENT: name], [COURSE: name]
- For concept explanations: 💡 Intuition → 📐 Definition → 🔢 Example → 🎯 BGU Exam Tip
- For exam prep: focus on what THIS lecturer typically tests, common traps, how to recognize problem types
- Be practical and concise — the student is preparing for exams`;
}

// ── Gemini API call ──────────────────────────────────────────────
async function callGemini(prompt, apiKey) {
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response.";
}

function parseRefs(text) {
  const refs = [];
  const patterns = [
    { re: /\[EVENT: ([^\]]+)\]/g, type: "event" },
    { re: /\[EMAIL: ([^\]]+)\]/g, type: "email" },
    { re: /\[ASSIGNMENT: ([^\]]+)\]/g, type: "assignment" },
    { re: /\[OVERDUE: ([^\]]+)\]/g, type: "overdue" },
    { re: /\[COURSE: ([^\]]+)\]/g, type: "course" },
  ];
  for (const { re, type } of patterns)
    for (const m of text.matchAll(re)) refs.push({ type, title: m[1] });
  return refs;
}

// ── Public API ───────────────────────────────────────────────────
export async function askAgent(question) {
  const { geminiApiKey } = await getStorage(["geminiApiKey"]);
  if (!geminiApiKey) throw new Error("No Gemini API key — add it in Setup.");
  const ctx = await buildContext();
  const prompt = buildPrompt(question, ctx);
  const text = await callGemini(prompt, geminiApiKey);
  const refs = parseRefs(text);
  return { text, refs };
}

export async function saveNote(note) {
  const { studyNotes = "" } = await getStorage(["studyNotes"]);
  const updated = `[${new Date().toLocaleDateString("he-IL")}] ${note}\n${studyNotes}`;
  await new Promise((r) =>
    chrome.storage.local.set({ studyNotes: updated }, r),
  );
}
