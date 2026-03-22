// Moodle Scraper — browser context only (sidepanel, NOT service worker)
// Uses fetch with credentials to access pages the user is already logged in to
// BGU Moodle: https://moodle.bgu.ac.il/moodle

const MOODLE_BASE = "https://moodle.bgu.ac.il/moodle";

// ── Core fetch helper ────────────────────────────────────────────
async function fetchMoodlePage(path) {
  const url = path.startsWith("http") ? path : `${MOODLE_BASE}${path}`;
  const res = await fetch(url, {
    credentials: "include", // sends BGU login cookies
    headers: { Accept: "text/html" },
  });
  if (res.status === 303 || res.url.includes("login")) {
    throw new Error("NOT_LOGGED_IN");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  return new DOMParser().parseFromString(html, "text/html");
}

function cleanText(el) {
  return el?.textContent?.replace(/\s+/g, " ").trim() || "";
}

// ── 1. Dashboard — get enrolled course list ───────────────────────
export async function scrapeDashboard() {
  const doc = await fetchMoodlePage("/my/");

  const courses = [];
  const seen = new Set();

  // Multiple selectors to handle different Moodle themes
  const selectors = [
    'a[href*="course/view.php?id="]',
    ".coursename a",
    ".course-info-container a",
    '[data-region="course-content"] a',
  ];

  for (const sel of selectors) {
    doc.querySelectorAll(sel).forEach((link) => {
      const match = link.href?.match(/course\/view\.php\?id=(\d+)/);
      if (!match || seen.has(match[1])) return;
      seen.add(match[1]);

      const name =
        cleanText(link.querySelector(".coursename, .multiline")) ||
        link.getAttribute("title") ||
        cleanText(link) ||
        `Course ${match[1]}`;

      if (name.length > 2) {
        courses.push({ id: match[1], name: name.slice(0, 80) });
      }
    });
  }

  // Deduplicate by ID
  const unique = Object.values(
    Object.fromEntries(courses.map((c) => [c.id, c])),
  );

  return unique;
}

// ── 2. Course page — get sections, files, assignments ─────────────
export async function scrapeCourse(courseId) {
  const doc = await fetchMoodlePage(`/course/view.php?id=${courseId}`);

  // Course title
  const courseName =
    cleanText(doc.querySelector("h1.page-header-headings, h1, .page-title")) ||
    `Course ${courseId}`;

  // Sections (weekly or topic format)
  const sections = [];
  const sectionEls = doc.querySelectorAll(
    'li[id^="section-"], .section.main, .topics .section, .weeks .section',
  );

  sectionEls.forEach((sec) => {
    const title =
      cleanText(
        sec.querySelector(".sectionname, .section-title h3, h3.sectionname"),
      ) || "Section";

    const items = [];

    // Activities (assignments, resources, videos, etc.)
    sec.querySelectorAll("li.activity, .activityinstance").forEach((act) => {
      const nameEl = act.querySelector(".instancename, .activityname, a");
      const name = cleanText(nameEl)
        ?.replace(/\s*(פתח|Open)\s*$/, "")
        .trim();
      const typeMatch = act.className?.match(/modtype_(\w+)/);
      const type = typeMatch ? typeMatch[1] : "unknown";
      const linkEl = act.querySelector("a[href]");
      const url = linkEl?.href || "";

      if (name && name.length > 2) {
        items.push({ name, type, url });
      }
    });

    if (items.length > 0) {
      sections.push({ title, items });
    }
  });

  // Extract assignments specifically (with deadline if visible)
  const assignments = [];
  doc.querySelectorAll("li.modtype_assign, .activity.assign").forEach((el) => {
    const name = cleanText(el.querySelector(".instancename, .activityname, a"));
    const url = el.querySelector("a")?.href || "";
    const dueText = cleanText(
      el.querySelector(".due-date, .activity-due-date, .submissionstatustable"),
    );

    if (name) {
      assignments.push({ name, url, dueText });
    }
  });

  // Extract resource files
  const files = [];
  doc
    .querySelectorAll("li.modtype_resource, li.modtype_url, li.modtype_folder")
    .forEach((el) => {
      const name = cleanText(
        el.querySelector(".instancename, .activityname, a"),
      );
      const url = el.querySelector("a")?.href || "";
      const type = el.className.match(/modtype_(\w+)/)?.[1] || "resource";
      if (name) files.push({ name, url, type });
    });

  return { courseId, courseName, sections, assignments, files };
}

// ── 3. Video lectures page ────────────────────────────────────────
export async function scrapeVideos(courseId) {
  try {
    const doc = await fetchMoodlePage(
      `/blocks/video/videoslist.php?courseid=${courseId}`,
    );

    const videos = [];

    // Try multiple selectors for video list items
    const rows = doc.querySelectorAll(
      ".video-item, .list-group-item, table tr, .videoslist tr, li",
    );

    rows.forEach((row) => {
      const link = row.querySelector("a[href]");
      const title =
        cleanText(link) || cleanText(row.querySelector("td, .title"));
      const url = link?.href || "";
      const date = cleanText(
        row.querySelector(".date, td:last-child, .video-date"),
      );

      if (title && title.length > 3 && url) {
        videos.push({ title: title.slice(0, 100), url, date });
      }
    });

    return videos;
  } catch (e) {
    console.warn(
      `[Moodle] Could not scrape videos for course ${courseId}:`,
      e.message,
    );
    return [];
  }
}

// ── 4. Full sync — dashboard + all courses ────────────────────────
export async function fullMoodleSync(onProgress) {
  // Step 1: Get course list
  onProgress?.("Loading course list…", 0);
  const courses = await scrapeDashboard();

  if (!courses.length)
    throw new Error("No courses found. Are you logged in to Moodle?");
  onProgress?.(`Found ${courses.length} courses`, 10);

  const courseDetails = [];
  const allAssignments = [];
  const allFiles = [];

  // Step 2: Scrape each course
  for (let i = 0; i < courses.length; i++) {
    const course = courses[i];
    const pct = 10 + Math.round((i / courses.length) * 70);
    onProgress?.(`Reading ${course.name}…`, pct);

    try {
      const details = await scrapeCourse(course.id);
      courseDetails.push(details);

      // Collect assignments
      details.assignments.forEach((a) => {
        allAssignments.push({
          ...a,
          courseName: course.name,
          courseId: course.id,
        });
      });

      // Collect files
      details.files.forEach((f) => {
        allFiles.push({ ...f, courseName: course.name, courseId: course.id });
      });

      // Small delay to be polite to the server
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      console.warn(`[Moodle] Skipped course ${course.name}:`, e.message);
    }
  }

  // Step 3: Scrape videos for each course
  onProgress?.("Loading lecture videos…", 80);
  const allVideos = {};
  for (const course of courses.slice(0, 8)) {
    const videos = await scrapeVideos(course.id);
    if (videos.length) allVideos[course.id] = videos;
    await new Promise((r) => setTimeout(r, 200));
  }

  onProgress?.("Saving data…", 95);

  const moodleData = {
    courses,
    courseDetails,
    assignments: allAssignments,
    files: allFiles,
    videos: allVideos,
    lastSync: Date.now(),
  };

  // Save to chrome.storage for AI agent to read
  await new Promise((r) =>
    chrome.storage.local.set({ moodleData, moodleConnected: true }, r),
  );

  onProgress?.("Done!", 100);
  return moodleData;
}
