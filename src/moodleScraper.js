// Moodle Scraper — browser context only (sidepanel, NOT service worker)
// Uses BGU's session cookies + Moodle AJAX API for reliable data extraction.
// Key insight: the /my/ dashboard course list is AJAX-rendered, so we call
// Moodle's built-in AJAX endpoints directly instead of trying to parse the DOM.

const MOODLE_BASE = 'https://moodle.bgu.ac.il/moodle';

// ── Core fetch helper ────────────────────────────────────────────
async function fetchMoodlePage(path) {
  const url = path.startsWith('http') ? path : `${MOODLE_BASE}${path}`;
  const res = await fetch(url, {
    credentials: 'include',
    headers: { Accept: 'text/html' },
  });
  // BGU redirects to local/mydashboard or login if not authenticated
  if (
    res.url.includes('/login/') ||
    res.url.includes('local/mydashboard') ||
    res.status === 303
  ) {
    throw new Error('NOT_LOGGED_IN');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  return { doc: new DOMParser().parseFromString(html, 'text/html'), html };
}

function cleanText(el) {
  return el?.textContent?.replace(/\s+/g, ' ').trim() || '';
}

// ── Extract sesskey from any Moodle page ─────────────────────────
// The sesskey is Moodle's CSRF token embedded in every page as JSON config.
// Without it the AJAX endpoints return an error.
function extractSesskey(html) {
  const patterns = [
    /"sesskey":"([a-zA-Z0-9]+)"/,
    /M\.cfg\.sesskey\s*=\s*["']([^"']+)["']/,
    /name="sesskey"\s+value="([^"]+)"/,
    /"sesskey\\?":\\?"([a-zA-Z0-9]+)\\?"/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

// ── Moodle AJAX helper ────────────────────────────────────────────
// Calls Moodle's built-in lib/ajax/service.php endpoint.
// This is the same API Moodle's own JavaScript uses — always available when logged in.
async function moodleAjax(sesskey, methodname, args) {
  const url = `${MOODLE_BASE}/lib/ajax/service.php?sesskey=${sesskey}&info=${methodname}`;
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ index: 0, methodname, args }]),
  });
  if (!res.ok) throw new Error(`AJAX HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Unexpected AJAX response');
  if (data[0]?.error) {
    throw new Error(data[0].exception?.message || data[0].error || 'AJAX error');
  }
  return data[0].data;
}

// ── 1. Get sesskey (required for all AJAX calls) ──────────────────
async function getSesskey() {
  // Try /my/ first (the student dashboard)
  try {
    const { html } = await fetchMoodlePage('/my/');
    const key = extractSesskey(html);
    if (key) return key;
  } catch (e) {
    if (e.message === 'NOT_LOGGED_IN') throw e;
  }
  // Fallback: any course page also has sesskey
  const { html } = await fetchMoodlePage('/');
  const key = extractSesskey(html);
  if (!key) throw new Error('Could not find Moodle session key — try refreshing BGU Moodle');
  return key;
}

// ── 2. Get enrolled courses via AJAX ─────────────────────────────
// Uses core_course_get_enrolled_courses_by_timeline_classification
// Returns actual enrolled course objects with id, fullname, progress, etc.
async function fetchEnrolledCourses(sesskey) {
  // Try 'inprogress' first (current semester) — cleanest result
  try {
    const result = await moodleAjax(
      sesskey,
      'core_course_get_enrolled_courses_by_timeline_classification',
      { offset: 0, limit: 50, classification: 'inprogress', sort: 'fullname' }
    );
    const courses = result?.courses || [];
    if (courses.length > 0) return courses;
  } catch (e) {
    console.warn('[Moodle] inprogress failed, trying all:', e.message);
  }

  // Fallback: get all courses
  const result = await moodleAjax(
    sesskey,
    'core_course_get_enrolled_courses_by_timeline_classification',
    { offset: 0, limit: 50, classification: 'all', sort: 'fullname' }
  );
  return result?.courses || [];
}

// ── 3. Get upcoming deadlines via AJAX calendar ───────────────────
// Uses core_calendar_get_action_events_by_timesort
// Returns actual deadline timestamps — no more text parsing guesswork.
async function fetchUpcomingDeadlines(sesskey) {
  const now    = Math.floor(Date.now() / 1000);
  const future = now + 90 * 24 * 3600; // 90 days ahead

  try {
    // Fetch in two batches of 50 (API max per request is 50)
    const batch1 = await moodleAjax(
      sesskey,
      'core_calendar_get_action_events_by_timesort',
      { timesortfrom: now, timesortto: future, limitnum: 50, limittononsuspendedevents: true }
    );
    const events1 = batch1?.events || [];
    // If we got a full batch, fetch the next page using the last event's timesort
    let events2 = [];
    if (events1.length === 50) {
      const lastSort = events1[events1.length - 1].timesort;
      const batch2 = await moodleAjax(
        sesskey,
        'core_calendar_get_action_events_by_timesort',
        { timesortfrom: lastSort + 1, timesortto: future, limitnum: 50, limittononsuspendedevents: true }
      ).catch(() => null);
      events2 = batch2?.events || [];
    }
    const result = { events: [...events1, ...events2] };
    return result?.events || [];
  } catch (e) {
    console.warn('[Moodle] Calendar AJAX failed:', e.message);
    return [];
  }
}

// ── 4. Scrape a single course page (still server-rendered) ────────
// This gets sections, files, and activities from the course content page.
export async function scrapeCourse(courseId) {
  const { doc } = await fetchMoodlePage(`/course/view.php?id=${courseId}`);

  const courseName =
    cleanText(doc.querySelector('h1.page-header-headings, h1, .page-title')) ||
    `Course ${courseId}`;

  // Sections (weekly/topic format)
  const sections = [];
  doc
    .querySelectorAll('li[id^="section-"], .section.main, .topics .section, .weeks .section')
    .forEach((sec) => {
      const title =
        cleanText(sec.querySelector('.sectionname, .section-title h3, h3.sectionname')) ||
        'Section';

      const items = [];
      sec.querySelectorAll('li.activity, .activityinstance').forEach((act) => {
        const nameEl = act.querySelector('.instancename, .activityname, a');
        const name   = cleanText(nameEl)?.replace(/\s*(פתח|Open)\s*$/, '').trim();
        const type   = act.className?.match(/modtype_(\w+)/)?.[1] || 'unknown';
        const url    = act.querySelector('a[href]')?.href || '';
        if (name && name.length > 2) items.push({ name, type, url });
      });

      if (items.length > 0) sections.push({ title, items });
    });

  // Resource files
  const files = [];
  doc
    .querySelectorAll('li.modtype_resource, li.modtype_url, li.modtype_folder')
    .forEach((el) => {
      const name = cleanText(el.querySelector('.instancename, .activityname, a'));
      const url  = el.querySelector('a')?.href || '';
      const type = el.className.match(/modtype_(\w+)/)?.[1] || 'resource';
      if (name) files.push({ name, url, type });
    });

  return { courseId, courseName, sections, files };
}

// ── 5. Scrape video lectures (best-effort) ────────────────────────
async function scrapeVideos(courseId) {
  try {
    const { doc } = await fetchMoodlePage(
      `/blocks/video/videoslist.php?courseid=${courseId}`
    );
    const videos = [];
    doc
      .querySelectorAll('.video-item, .list-group-item, table tr, .videoslist tr, li')
      .forEach((row) => {
        const link  = row.querySelector('a[href]');
        const title = cleanText(link) || cleanText(row.querySelector('td, .title'));
        const url   = link?.href || '';
        const date  = cleanText(row.querySelector('.date, td:last-child, .video-date'));
        if (title && title.length > 3 && url) {
          videos.push({ title: title.slice(0, 100), url, date });
        }
      });
    return videos;
  } catch (e) {
    return [];
  }
}

// ── 6. Export: scrapeDashboard (kept for API compatibility) ───────
// Now uses AJAX instead of DOM parsing for the course list.
export async function scrapeDashboard() {
  const sesskey = await getSesskey();
  const raw = await fetchEnrolledCourses(sesskey);

  return raw.map((c) => ({
    id:       String(c.id),
    name:     c.fullname || c.shortname || `Course ${c.id}`,
    progress: c.progress || 0,
    url:      `${MOODLE_BASE}/course/view.php?id=${c.id}`,
  }));
}

// ── 7. Main full sync ─────────────────────────────────────────────
export async function fullMoodleSync(onProgress) {
  // Step 1: Get sesskey
  onProgress?.('Connecting to BGU Moodle…', 0);
  const sesskey = await getSesskey();

  // Step 2: Get enrolled courses via AJAX
  onProgress?.('Loading your courses…', 10);
  const rawCourses = await fetchEnrolledCourses(sesskey);
  if (!rawCourses.length) {
    throw new Error(
      'No active courses found. Make sure you are logged in to BGU Moodle and have enrolled courses this semester.'
    );
  }

  // Filter out courses that are clearly finished (100% progress).
  // Keep courses with no progress data (progress=null) — those are often newly added.
  const activeCourses = rawCourses.filter(c => {
    if (c.progress === null || c.progress === undefined) return true; // no data = keep
    return c.progress < 100; // exclude completed courses from past semesters
  });

  // If filtering removed everything (shouldn't happen), fall back to all
  const coursesToMap = activeCourses.length > 0 ? activeCourses : rawCourses;

  const courses = coursesToMap.map((c) => ({
    id:       String(c.id),
    name:     c.fullname || c.shortname || `Course ${c.id}`,
    progress: c.progress ?? 0,
    url:      `${MOODLE_BASE}/course/view.php?id=${c.id}`,
  }));

  onProgress?.(`Found ${courses.length} courses ✅`, 20);

  // Step 3: Get real deadlines via AJAX calendar
  onProgress?.('Loading deadlines from calendar…', 25);
  const calendarEvents = await fetchUpcomingDeadlines(sesskey);

  // Convert to our assignment format with real ISO dates
  const allAssignments = calendarEvents
    .filter((e) => e.timesort && e.name)
    .map((e) => ({
      name:       e.name,
      dueDate:    new Date(e.timesort * 1000).toISOString(), // real timestamp!
      url:        e.action?.url || e.url || '',
      courseId:   String(e.course?.id || ''),
      courseName: e.course?.fullname || e.course?.shortname || '',
      type:       e.modulename || 'assign',
    }))
    // Only include assignments from enrolled courses
    .filter((a) => !a.courseId || courses.some((c) => c.id === a.courseId))
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  onProgress?.(`Found ${allAssignments.length} upcoming deadlines ✅`, 35);

  // Step 4: Scrape course pages for content (sections, files)
  const courseDetails = [];
  const allFiles      = [];

  for (let i = 0; i < courses.length; i++) {
    const course = courses[i];
    const pct    = 35 + Math.round((i / courses.length) * 45);
    onProgress?.(`Reading course: ${course.name.slice(0, 40)}…`, pct);

    try {
      const details = await scrapeCourse(course.id);
      courseDetails.push({ ...details, courseName: course.name });

      details.files.forEach((f) => {
        allFiles.push({ ...f, courseName: course.name, courseId: course.id });
      });

      // Polite delay — BGU server doesn't need hammering
      await new Promise((r) => setTimeout(r, 400));
    } catch (e) {
      console.warn(`[Moodle] Skipped course ${course.name}:`, e.message);
    }
  }

  // Step 5: Videos (best-effort, don't block if it fails)
  onProgress?.('Looking for lecture videos…', 82);
  const allVideos = {};
  for (const course of courses.slice(0, 6)) {
    try {
      const videos = await scrapeVideos(course.id);
      if (videos.length) allVideos[course.id] = videos;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 200));
  }

  onProgress?.('Saving to storage…', 95);

  const moodleData = {
    courses,
    courseDetails,
    assignments: allAssignments,
    files:       allFiles,
    videos:      allVideos,
    lastSync:    Date.now(),
  };

  await new Promise((r) =>
    chrome.storage.local.set({ moodleData, moodleConnected: true }, r)
  );

  onProgress?.(`Done! ${courses.length} courses · ${allAssignments.length} deadlines`, 100);
  return moodleData;
}
