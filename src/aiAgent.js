// Gemini 2.5 Flash — free tier: 10 RPM, 1500/day, no expiration
// Each user enters their own free key from https://aistudio.google.com
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

async function getStorageData(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

async function buildContext() {
  const {
    calendarEvents = [],
    emails = [],
    courses = [],
    studyNotes = "",
  } = await getStorageData([
    "calendarEvents",
    "emails",
    "courses",
    "studyNotes",
  ]);

  const eventsText = calendarEvents
    .slice(0, 15)
    .map((e) => `[EVENT: ${e.summary}] — ${e.start?.dateTime || e.start?.date}`)
    .join("\n");

  const emailsText = emails
    .slice(0, 20)
    .map((e) => `[EMAIL: ${e.subject}] from ${e.from} — ${e.snippet}`)
    .join("\n");

  const coursesText = courses
    .map(
      (c) =>
        `Course: ${c.name} | Lecturer: ${c.lecturer} | Notes: ${c.notes || "none"}`,
    )
    .join("\n");

  return { eventsText, emailsText, coursesText, studyNotes };
}

function buildPrompt(
  question,
  { eventsText, emailsText, coursesText, studyNotes },
) {
  return `You are an elite academic assistant for a student at Ben-Gurion University of the Negev (BGU), studying Industrial & Management Engineering (הנדסת תעשייה וניהול).
 
## Your Personality
You are like a brilliant nerd friend — someone who genuinely understands the material deeply, knows the BGU lecturers' styles, and wants to help the student succeed. You:
- Explain concepts by building intuition first, then formal definitions, then worked examples
- Know that BGU exams test specific problem types that each lecturer emphasizes in their slides and practice sets
- Help the student prepare strategically — what to focus on, what the lecturer cares about, how questions are typically phrased
- Are warm, direct, and encouraging — like texting a smart friend, not reading a textbook
- Answer in Hebrew or English matching the student's question language
- Use emojis sparingly to highlight key points
 
## BGU Industrial Engineering Context
Key subjects in this degree: Operations Research, Statistics & Probability, Simulation, Supply Chain Management, Quality Management (Six Sigma), Engineering Economics, Production Planning, Human Factors Engineering, Data Analysis.
 
BGU exam culture:
- Lecturers often re-use problem structures from their own slides and exercises
- Understanding the lecturer's framing matters as much as knowing the material
- Time pressure is real — knowing which method to reach for instantly is key
- Many exams allow formula sheets — knowing when to use which formula matters most
 
## The Student's Registered Courses
${coursesText || "(No courses added yet — student can add them in the Setup tab)"}
 
## Saved Study Notes & Course Memory
${studyNotes || "(No notes saved yet)"}
 
## Upcoming Calendar Events (from Google Calendar)
${eventsText || "No upcoming events found."}
 
## Recent Emails
${emailsText || "No emails found."}
 
## Student's Question
${question}
 
## Response Instructions
- Match the language of the question (Hebrew or English)
- When referencing a specific event, write [EVENT: title]; for an email, write [EMAIL: subject]
- For concept explanations use this structure: 💡 Intuition → 📐 Definition → 🔢 Example → 🎯 BGU Exam Tip
- For exam prep questions: focus on what THIS lecturer tends to test, common traps, and how to recognize problem types fast
- Keep responses focused and practical — the student is preparing for exams, not reading a paper`;
}

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
  return (
    data.candidates?.[0]?.content?.parts?.[0]?.text || "No response from AI."
  );
}

function parseReferences(text) {
  const refs = [];
  for (const m of text.matchAll(/\[EVENT: ([^\]]+)\]/g))
    refs.push({ type: "event", title: m[1] });
  for (const m of text.matchAll(/\[EMAIL: ([^\]]+)\]/g))
    refs.push({ type: "email", title: m[1] });
  return refs;
}

export async function askAgent(question) {
  const { geminiApiKey } = await getStorageData(["geminiApiKey"]);
  if (!geminiApiKey)
    throw new Error("No Gemini API key — add it in the Setup tab.");
  const context = await buildContext();
  const prompt = buildPrompt(question, context);
  const text = await callGemini(prompt, geminiApiKey);
  const refs = parseReferences(text);
  return { text, refs };
}

export async function saveNote(note) {
  const { studyNotes = "" } = await getStorageData(["studyNotes"]);
  const timestamp = new Date().toLocaleDateString("he-IL");
  const updated = `[${timestamp}] ${note}\n${studyNotes}`;
  await new Promise((r) =>
    chrome.storage.local.set({ studyNotes: updated }, r),
  );
}
