// Moodle REST API client
// BGU Moodle: https://moodle.bgu.ac.il
// Token: Moodle → Profile → Security Keys → Mobile web services token

function getStorage(keys) {
  return new Promise((r) => chrome.storage.local.get(keys, r));
}

async function moodleRequest(moodleUrl, token, wsfunction, params = {}) {
  const url = `${moodleUrl.replace(/\/$/, "")}/webservice/rest/server.php`;
  const body = new URLSearchParams({
    wstoken: token,
    wsfunction,
    moodlewsrestformat: "json",
    ...params,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json();
  if (data && data.exception) throw new Error(`Moodle error: ${data.message}`);
  if (data && data.errorcode) throw new Error(`Moodle error: ${data.error}`);
  return data;
}

// Verify token and get user info
export async function getSiteInfo(moodleUrl, token) {
  return moodleRequest(moodleUrl, token, "core_webservice_get_site_info");
}

// Get all enrolled courses for a user
export async function getEnrolledCourses(moodleUrl, token, userId) {
  return moodleRequest(moodleUrl, token, "core_enrol_get_users_courses", {
    userid: userId,
  });
}

// Get assignment deadlines for a list of course IDs
export async function getAssignments(moodleUrl, token, courseIds) {
  const params = {};
  courseIds.forEach((id, i) => {
    params[`courseids[${i}]`] = id;
  });
  return moodleRequest(moodleUrl, token, "mod_assign_get_assignments", params);
}

// Get course sections, files, and resources
export async function getCourseContents(moodleUrl, token, courseId) {
  return moodleRequest(moodleUrl, token, "core_course_get_contents", {
    courseid: courseId,
  });
}

// Main sync function — called by background.js
export async function syncMoodle() {
  const { moodleUrl, moodleToken } = await getStorage([
    "moodleUrl",
    "moodleToken",
  ]);

  if (!moodleUrl || !moodleToken) {
    console.log("[Moodle] No URL or token configured, skipping sync");
    return null;
  }

  console.log("[Moodle] Starting sync...");

  // Step 1: Verify token and get user ID
  const siteInfo = await getSiteInfo(moodleUrl, moodleToken);
  const userId = siteInfo.userid;
  const userName = siteInfo.fullname;
  console.log(`[Moodle] Logged in as: ${userName}`);

  // Step 2: Get enrolled courses
  const rawCourses = await getEnrolledCourses(moodleUrl, moodleToken, userId);
  const courses = (rawCourses || [])
    .filter((c) => c.visible !== 0)
    .map((c) => ({
      id: c.id,
      name: c.fullname,
      shortName: c.shortname,
      category: c.categoryname || "",
      progress: c.progress || 0,
    }));

  console.log(`[Moodle] Found ${courses.length} courses`);

  // Step 3: Get assignments with deadlines
  const courseIds = courses.map((c) => c.id);
  let assignments = [];

  if (courseIds.length > 0) {
    try {
      const assignData = await getAssignments(
        moodleUrl,
        moodleToken,
        courseIds,
      );
      const now = Date.now() / 1000;

      (assignData.courses || []).forEach((course) => {
        (course.assignments || []).forEach((a) => {
          assignments.push({
            id: a.id,
            name: a.name,
            courseName: course.fullname,
            courseId: course.id,
            dueDate:
              a.duedate > 0 ? new Date(a.duedate * 1000).toISOString() : null,
            dueDateTs: a.duedate,
            isOverdue: a.duedate > 0 && a.duedate < now,
            description: (a.intro || "").replace(/<[^>]*>/g, "").slice(0, 150),
          });
        });
      });

      // Sort: upcoming first, then overdue, then no deadline
      assignments.sort((a, b) => {
        if (!a.dueDateTs && !b.dueDateTs) return 0;
        if (!a.dueDateTs) return 1;
        if (!b.dueDateTs) return -1;
        return a.dueDateTs - b.dueDateTs;
      });
    } catch (e) {
      console.warn("[Moodle] Could not fetch assignments:", e.message);
    }
  }

  // Step 4: Get file list for each course (limit to 6 courses to avoid quota)
  const courseFiles = {};
  for (const course of courses.slice(0, 6)) {
    try {
      const contents = await getCourseContents(
        moodleUrl,
        moodleToken,
        course.id,
      );
      const files = [];
      (contents || []).forEach((section) => {
        (section.modules || []).forEach((mod) => {
          if (["resource", "url", "folder", "page"].includes(mod.modname)) {
            files.push({
              name: mod.name,
              type: mod.modname,
              url: mod.url || "",
              section: section.name,
            });
          }
        });
      });
      courseFiles[course.id] = files;
    } catch (e) {
      console.warn(
        `[Moodle] Could not fetch contents for course ${course.id}:`,
        e.message,
      );
    }
  }

  const moodleData = {
    userId,
    userName,
    courses,
    assignments,
    courseFiles,
    lastSync: Date.now(),
  };

  await chrome.storage.local.set({ moodleData, moodleConnected: true });
  console.log(
    `[Moodle] Sync complete: ${courses.length} courses, ${assignments.length} assignments`,
  );
  return moodleData;
}
