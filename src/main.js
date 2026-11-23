import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  signOut,
  updateProfile
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  deleteDoc,
  serverTimestamp,
  limit,
  getDocs,
  runTransaction
} from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase.js";
import { getCurrentLocationSignal } from "./geofence.js";
import {
  getKolkataDateString,
  recordDailyAttendance,
  checkIsHoliday,
  getRecentDailyRecords
} from "./attendance.js";
import {
  COURSE_TARGET_PERCENTAGE,
  countWorkingDays,
  getCourseEndDate,
  getStartDateForWorkingDayCount,
  isCourseInPeriod
} from "./courses.js";
import {
  calculateAttendanceKarma,
  chooseRoast,
  TENGLISH_ROASTS
} from "./calculator.js";
import {
  enablePushNotifications,
  disablePushNotifications,
  getNotificationPermission,
  isPushNotificationSupported
} from "./notifications.js";
import {
  isWeekend,
  isCollegeDay,
  calculateAttendanceStreak,
  getNextCollegeDay,
  hasTimetableConflict,
  isValidCalendarDate,
  generateAttendanceCsv,
  downloadFile
} from "./pwa-features.js";
import "./style.css";

const appRoot = document.getElementById("app");
const $ = (id) => document.getElementById(id);

let currentUser = null;
let profile = null;
let stopListeners = [];
let cachedFriends = [];
let cachedRequests = [];
let cachedHolidays = [];
let cachedAnnouncements = [];
let todayDailyRecord = null;
let recentRecords = [];
let allDailyRecordsMap = {};
let todayHolidayInfo = null;
let activeCourse = null;
let academicSettings = null;
let academicSettingsLoaded = false;
let attendanceLoaded = false;
let holidaysLoaded = false;
let signInNoticePending = false;
let hasShownCourseSyncError = false;
let isLocationChecking = false;
let lastCalcMemeIndex = -1;
let deferredInstallPrompt = null;
let calendarMonth = new Date(`${getKolkataDateString().slice(0, 7)}-01T00:00:00`);
let userTimetable = [];
let calendarEvents = [];
let calendarSelectedDate = getKolkataDateString();
const loadedCalendarMonths = new Set();
const pendingCalendarMonths = new Set();

const path = () => location.pathname.replace(/\/+$/, "") || "/";
const esc = (v = "") =>
  String(v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));

const pct = (x) => (x?.totalClasses ? (x.attendedClasses / x.totalClasses) * 100 : 0);
const fmt = (n) => `${Number(n || 0).toFixed(1)}%`;

const toast = (msg) => {
  const t = $("toast");
  if (t) {
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3200);
  }
};

const cleanListeners = () => {
  stopListeners.forEach((fn) => fn());
  stopListeners = [];
};

function cacheTimetableBackup() {
  try {
    localStorage.setItem(`attendly_tt_${currentUser.uid}`, JSON.stringify(userTimetable));
    return "";
  } catch (err) {
    return friendlyError(err);
  }
}

const go = (p) => {
  history.pushState({}, "", p);
  renderRoute();
};

window.addEventListener("popstate", renderRoute);

// PWA Install prompt listener
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = $("topInstallBtn");
  if (btn) btn.removeAttribute("hidden");
});

function friendlyError(e) {
  const map = {
    "auth/invalid-email": "That email address doesn't look valid.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/email-already-in-use": "This email already has an account.",
    "auth/weak-password": "Use a password with at least 6 characters.",
    "auth/popup-closed-by-user": "Google sign-in was closed.",
    "auth/unauthorized-domain": "Add this website domain in Firebase Authentication settings."
  };
  return map[e?.code] || e?.message || "Something went wrong.";
}

function shell(active, body, title = "Welcome back") {
  const name = profile?.displayName || currentUser?.displayName || currentUser?.email?.split("@")[0] || "Student";
  const todayStr = getKolkataDateString();
  const subtitle = active === "home"
    ? "Your attendance, your circle, one clear picture."
    : "One class per day · 500m campus zone · Mutual friends only · PWA Installable";

  return `<div class="layout">
    <aside class="sidebar">
      <a class="wordmark" href="/" data-nav="/">attend<span>ly.</span></a>
      <div class="side-label">WORKSPACE</div>
      <nav>
        <a href="/" data-nav="/" class="${active === "home" ? "active" : ""}">▦ <span>Dashboard</span></a>
        <a href="/calc" data-nav="/calc" class="${active === "calc" ? "active" : ""}">◷ <span>Attendance calculator</span></a>
        <a href="/calendar" data-nav="/calendar" class="${active === "calendar" ? "active" : ""}">📅 <span>Calendar & Streak</span></a>
        <a href="/timetable" data-nav="/timetable" class="${active === "timetable" ? "active" : ""}">⌚ <span>Timetable</span></a>
        <a href="/friends" data-nav="/friends" class="${active === "friends" ? "active" : ""}">♧ <span>Friends</span></a>
        <a href="/reports" data-nav="/reports" class="${active === "reports" ? "active" : ""}">▤ <span>Reports & Exports</span></a>
        <a href="/settings" data-nav="/settings" class="${active === "settings" ? "active" : ""}">⚙ <span>Settings</span></a>
        ${currentUser?.isAdmin
          ? `<div class="side-label admin-label">ADMINISTRATION</div>
             <a href="/admin" data-nav="/admin" class="${active === "admin" ? "active" : ""}">⬡ <span>Admin console</span></a>`
          : ""}
      </nav>
      <div class="sidebar-bottom">
        <div class="mini-card">
          <b>One class per day</b>
          <p>Mark daily. No duplicate classes. IST Date: ${todayStr}.</p>
          <span>🔥 Stay consistent</span>
        </div>
        <button class="signout" id="signout">↗ &nbsp; Sign out</button>
        <div class="user-chip">
          <div class="avatar">${esc(name.slice(0, 1).toUpperCase())}</div>
          <div>
            <b>${esc(name)}</b>
            <small>${esc(currentUser?.email || "")}</small>
          </div>
        </div>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div>
          <div class="eyebrow">ATTENDLY / ${active.toUpperCase()}</div>
          <h1>${title}, ${esc(name.split(" ")[0])}.</h1>
          <p>${subtitle}</p>
        </div>
        <div class="top-actions">
          <button class="icon-btn mobile-nav-toggle" id="mobileNavToggle" aria-label="Open navigation">☰</button>
          <button class="btn primary small-btn" id="topInstallBtn" ${deferredInstallPrompt ? "" : "hidden"}>＋ Install App</button>
          <span class="live-dot">LIVE SYNC</span>
          <button class="icon-btn" id="topSignout" title="Sign out">↗</button>
        </div>
      </header>
      ${body}
    </main>
  </div>`;
}

function bindNav() {
  document.querySelectorAll("[data-nav]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelector(".layout")?.classList.remove("sidebar-open");
      go(a.dataset.nav);
    })
  );
  $("mobileNavToggle")?.addEventListener("click", () => {
    document.querySelector(".layout")?.classList.toggle("sidebar-open");
  });
  document.querySelector(".sidebar nav a.active")?.scrollIntoView({
    block: "nearest",
    inline: "nearest"
  });
  ["signout", "topSignout"].forEach((id) =>
    $(id)?.addEventListener("click", () => signOut(auth))
  );

  $("topInstallBtn")?.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === "accepted") {
        toast("ATTENDLY installed to your device!");
      }
      deferredInstallPrompt = null;
      $("topInstallBtn").hidden = true;
    } else {
      toast("Use browser menu → Install app / Add to Home screen.");
    }
  });
}

function authView(mode = "login") {
  const signup = mode === "signup";
  appRoot.innerHTML = `<div class="auth-screen">
    <div class="auth-art">
      <a class="wordmark" href="/">attend<span>ly.</span></a>
      <div class="art-copy">
        <div class="eyebrow">YOUR CAMPUS. YOUR CREW.</div>
        <h1>Attendance tracking,<br><em>without the chaos.</em></h1>
        <p>Keep your numbers clear. Keep your friends close. Keep those shortage notices far away.</p>
        <div class="art-stats">
          <div><b>01</b><small>1 Class per day</small></div>
          <div><b>02</b><small>500m geofence</small></div>
          <div><b>03</b><small>Mutual circle</small></div>
        </div>
      </div>
      <div class="art-footer">ATTENDLY · STUDENT ATTENDANCE PLATFORM · ANDROID PWA</div>
    </div>
    <div class="auth-panel">
      <div class="auth-form">
        <div class="eyebrow">WELCOME ${signup ? "ABOARD" : "BACK"}</div>
        <h2>${signup ? "Create your account" : "Sign in to ATTENDLY"}</h2>
        <p class="muted">${signup ? "Your attendance era starts here." : "Your campus dashboard is one sign-in away."}</p>
        ${signup ? '<label>Full name</label><input id="authName" placeholder="Your name" maxlength="50">' : ""}
        <label>Email address</label>
        <input id="authEmail" type="email" placeholder="you@example.com" autocomplete="email">
        <label>Password</label>
        <input id="authPassword" type="password" placeholder="At least 6 characters" autocomplete="${signup ? "new-password" : "current-password"}">
        <button class="primary full" id="emailAuth">${signup ? "Create account" : "Sign in"}</button>
        <div class="or"><span>OR CONTINUE WITH</span></div>
        <button class="google-btn" id="googleAuth"><b>G</b> Continue with Google</button>
        ${!signup ? '<button class="text-btn" id="forgot">Forgot password?</button>' : ""}
        <p class="switch-auth">
          ${signup ? 'Already have an account? <a href="/login" data-nav="/login">Sign in</a>' : 'New to ATTENDLY? <a href="/signup" data-nav="/signup">Create an account</a>'}
        </p>
        <p class="tiny-note">By continuing, you agree to use attendance data responsibly. Only accepted mutual friends can view your attendance.</p>
      </div>
    </div>
  </div>`;

  $("emailAuth").onclick = async () => {
    const email = $("authEmail").value.trim();
    const pass = $("authPassword").value;
    try {
      if (!email) return toast("Enter your email address.");
      if (!pass) return toast("Enter your password.");
      if (signup) {
        const name = $("authName").value.trim();
        if (!name) return toast("Please enter your name.");
        if (pass.length < 6) return toast("Use a password with at least 6 characters.");
        const c = await createUserWithEmailAndPassword(auth, email, pass);
        await updateProfile(c.user, { displayName: name });
        await ensureProfile(c.user, name);
        toast("Account created. Welcome!");
      } else {
        await signInWithEmailAndPassword(auth, email, pass);
      }
    } catch (e) {
      toast(friendlyError(e));
    }
  };

  $("googleAuth").onclick = async () => {
    try {
      const c = await signInWithPopup(auth, googleProvider);
      await ensureProfile(c.user, c.user.displayName || "Student");
    } catch (e) {
      toast(friendlyError(e));
    }
  };

  $("forgot")?.addEventListener("click", async () => {
    const email = $("authEmail").value.trim();
    if (!email) return toast("Enter your email first.");
    try {
      await sendPasswordResetEmail(auth, email);
      toast("Password reset email sent.");
    } catch (e) {
      toast(friendlyError(e));
    }
  });

  document.querySelectorAll("[data-nav]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      go(a.dataset.nav);
    })
  );
}

async function ensureProfile(user, name) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const username = (user.email?.split("@")[0] || "student")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24) || "student";

  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      displayName: name,
      username,
      email: user.email || "",
      photoURL: user.photoURL || "",
      createdAt: serverTimestamp(),
      disabled: false,
      timetable: [],
      calendarEvents: []
    });
  }

  await setDoc(
    doc(db, "userDirectory", user.uid),
    {
      uid: user.uid,
      displayName: snap.exists() ? snap.data().displayName || name : name,
      username: snap.exists() ? snap.data().username || username : username,
      photoURL: user.photoURL || ""
    },
    { merge: true }
  );
}

async function loadProfile(user) {
  await ensureProfile(user, user.displayName || user.email?.split("@")[0] || "Student");
  const s = await getDoc(doc(db, "users", user.uid));
  profile = s.data() || {};
  userTimetable = (profile.timetable?.length
    ? profile.timetable
    : JSON.parse(localStorage.getItem(`attendly_tt_${user.uid}`) || "[]"))
    .map((item, index) => ({
      ...item,
      id: item.id || `legacy-${index}-${item.day}-${item.time}`
    }));
  calendarEvents = profile.calendarEvents || [];
  const token = await user.getIdTokenResult(true);
  currentUser.isAdmin = token.claims.admin === true;
}

function startDashboardListeners() {
  cleanListeners();
  const today = getKolkataDateString();
  activeCourse = null;
  academicSettings = null;
  academicSettingsLoaded = false;
  attendanceLoaded = false;
  holidaysLoaded = false;

  // 1. My aggregate attendance
  stopListeners.push(
    onSnapshot(
      doc(db, "attendance", currentUser.uid),
      (s) => {
        window.myAttendance = s.exists() ? s.data() : null;
        attendanceLoaded = true;
        refreshCurrentRoute();
      },
      (e) => toast("Attendance sync: " + e.message)
    )
  );

  stopListeners.push(
    onSnapshot(
      doc(db, "academicSettings", "main"),
      (s) => {
        academicSettings = s.exists() ? s.data() : null;
        academicSettingsLoaded = true;
        if (signInNoticePending) {
          signInNoticePending = false;
          const settings = academicSettings?.notificationSettings;
          if (settings?.loginEnabled && settings.loginBody) {
            setTimeout(() => toast(`${settings.loginTitle || "Welcome back"} · ${settings.loginBody}`), 150);
          }
        }
        refreshCurrentRoute();
      },
      () => {
        academicSettings = null;
        academicSettingsLoaded = true;
        refreshCurrentRoute();
      }
    )
  );

  // 2. Current course control
  stopListeners.push(
    onSnapshot(
      doc(db, "courseControl", "active"),
      (s) => {
        hasShownCourseSyncError = false;
        activeCourse = s.exists() && s.data().status === "active" ? s.data() : null;
        refreshCurrentRoute();
      },
      (e) => {
        activeCourse = null;
        if (!hasShownCourseSyncError) {
          hasShownCourseSyncError = true;
          toast("Course data unavailable. Ask an admin to publish the updated Firestore rules.");
        }
        refreshCurrentRoute();
      }
    )
  );

  // 3. Today's daily record
  stopListeners.push(
    onSnapshot(
      doc(db, "attendance", currentUser.uid, "daily", today),
      (s) => {
        todayDailyRecord = s.exists() ? s.data() : null;
        refreshCurrentRoute();
      },
      () => {}
    )
  );

  // 4. Accepted friendships
  const qFriends = query(
    collection(db, "friendships"),
    where("members", "array-contains", currentUser.uid)
  );
  stopListeners.push(
    onSnapshot(
      qFriends,
      (s) => {
        cachedFriends = s.docs.map((x) => ({ id: x.id, ...x.data() }));
        refreshCurrentRoute();
      },
      (e) => toast("Friends sync: " + e.message)
    )
  );

  // 5. Pending friend requests
  const qReqs = query(
    collection(db, "friendRequests"),
    where("toUid", "==", currentUser.uid),
    where("status", "==", "pending")
  );
  stopListeners.push(
    onSnapshot(
      qReqs,
      (s) => {
        cachedRequests = s.docs.map((x) => ({ id: x.id, ...x.data() }));
        if (path() === "/friends") renderFriends();
      },
      () => {}
    )
  );

  // 6. Active announcements
  const qAnnouncements = query(collection(db, "announcements"), limit(5));
  stopListeners.push(
    onSnapshot(
      qAnnouncements,
      (s) => {
        cachedAnnouncements = s.docs.map((x) => ({ id: x.id, ...x.data() }));
        refreshCurrentRoute();
      },
      () => {}
    )
  );

  // 7. Check today holiday and cache holidays
  getDocs(collection(db, "holidays")).then((snap) => {
    cachedHolidays = snap.docs.map((d) => ({ date: d.id, ...d.data() }));
    todayHolidayInfo = cachedHolidays.find((h) => h.date === today) || null;
    holidaysLoaded = true;
    refreshCurrentRoute();
  }).catch((e) => {
    holidaysLoaded = true;
    toast("Holiday sync: " + friendlyError(e));
    refreshCurrentRoute();
  });

  // 8. Load recent daily records
  getRecentDailyRecords(currentUser.uid, 60).then((recs) => {
    recentRecords = recs;
    allDailyRecordsMap = {};
    for (const r of recs) {
      allDailyRecordsMap[r.date || r.id] = r;
    }
    refreshCurrentRoute();
  });
}

function refreshCurrentRoute() {
  if (path() === "/") homeView();
  else if (path() === "/calendar") calendarView();
}

function metric(label, value, sub, icon) {
  return `<div class="metric">
    <div class="metric-top"><span>${label}</span><b>${icon}</b></div>
    <strong>${value}</strong>
    <small>${sub}</small>
  </div>`;
}

function renderAnnouncementsBanner() {
  if (!cachedAnnouncements.length) return "";
  return cachedAnnouncements
    .map(
      (a) => `
    <div class="announcement-card ${a.priority === "urgent" ? "urgent" : ""}">
      <div class="announcement-badge">${a.priority === "urgent" ? "🚨 IMPORTANT ANNOUNCEMENT" : "📢 NOTICE"}</div>
      <h3>${esc(a.title)}</h3>
      <p>${esc(a.message)}</p>
    </div>`
    )
    .join("");
}

function renderTodayAttendanceCard() {
  const today = getKolkataDateString();
  const courseIsOpen = isCourseInPeriod(activeCourse, today);

  if (todayHolidayInfo) {
    return `
    <div class="panel holiday-panel">
      <div class="panel-head">
        <div>
          <h2>🌴 Official College Holiday</h2>
          <p>${esc(todayHolidayInfo.name || todayHolidayInfo.title || "Holiday scheduled")}</p>
        </div>
        <span class="tag">SUPPRESSED</span>
      </div>
      <p class="holiday-note">Today (${today}) is an administrator-designated holiday. Attendance is suppressed and adds 0 classes.</p>
    </div>`;
  }

  const isMarked = Boolean(todayDailyRecord);
  const status = todayDailyRecord?.status; // 'attended' | 'absent'
  const locStatus = todayDailyRecord?.locationStatus || "unknown";
  const canCorrect = courseIsOpen && todayDailyRecord?.courseId === activeCourse?.courseId;
  const locationLabel = locStatus === "inside"
    ? "Verified · on campus"
    : locStatus === "outside"
      ? "Outside campus"
      : "Unverified";

  return `
  <section class="panel dashboard-checkin">
    <div class="dashboard-checkin-head">
      <div>
        <span class="dashboard-kicker">TODAY · ${today}</span>
        <h2>Attendance check-in</h2>
        <p>One class per day. You can correct your response later.</p>
        ${activeCourse ? `<small class="dashboard-course-note">${esc(activeCourse.name)} · ${esc(activeCourse.startDate)}–${esc(activeCourse.endDate)} · ${COURSE_TARGET_PERCENTAGE}% target</small>` : ""}
      </div>
      <span class="dashboard-status ${isMarked ? "marked" : ""}">${isMarked ? (status === "attended" ? "Attended" : "Absent") : "Not marked"}</span>
    </div>
    <div class="dashboard-checkin-body">
      <div class="dashboard-checkin-actions">
        ${isMarked
        ? canCorrect
          ? `<button class="ghost dashboard-correct-button" id="btnCorrectToday">Correct to ${status === "attended" ? "ABSENT" : "ATTEND"}</button>`
          : `<span class="muted">Today's class is already recorded.</span>`
        : `<button class="primary dashboard-attend-button" id="btnAttendToday" ${!courseIsOpen || isLocationChecking ? "disabled" : ""}>✓<b>ATTEND</b></button>
           <button class="ghost dashboard-absent-button" id="btnAbsentToday" ${!courseIsOpen ? "disabled" : ""}>ABSENT</button>`}
      </div>
      <div class="dashboard-checkin-details">
        <div><span>Location signal</span><b class="dashboard-location ${locStatus}">${locationLabel}</b></div>
        <a href="/settings" data-nav="/settings">Enable reminders</a>
        ${!courseIsOpen && !isMarked ? `<small>${activeCourse ? "Attendance is outside this course period." : "An administrator must start a course first."}</small>` : ""}
      </div>
    </div>
  </section>`;
}

function getWeekdaysBeforeToday(startDate) {
  if (!startDate) return 0;
  const today = getKolkataDateString();
  const holidays = cachedHolidays.map((holiday) => holiday.date);
  return Math.max(
    0,
    countWorkingDays(startDate, today, holidays) -
      (isCollegeDay(today, Object.fromEntries(holidays.map((date) => [date, true]))) ? 1 : 0)
  );
}

function renderAttendanceSetup() {
  const semesterStartDate = academicSettings?.semesterStartDate;
  const courseStart = activeCourse?.startDate;
  const overallClasses = getWeekdaysBeforeToday(semesterStartDate);
  const courseClasses = getWeekdaysBeforeToday(courseStart);
  const hasOverallBaseline = Boolean(window.myAttendance);
  const completedCourses = ["HTML and CSS", "JavaScript", "MySQL"];
  const today = getKolkataDateString();

  const body = `
    <section class="panel setup-welcome">
      <span class="dashboard-kicker">QUICK ATTENDANCE SETUP</span>
      <h2>Let's get your attendance up to date</h2>
      <p>We count Monday–Friday automatically. Saturdays and Sundays are not counted.</p>
      ${activeCourse ? `<p class="setup-active-course"><b>Current course:</b> ${esc(activeCourse.name)} · working day ${courseClasses + 1}</p>` : ""}
    </section>
    <section class="dashboard-simple-grid setup-grid">
      <article class="panel setup-card">
        <h2>Attendance so far</h2>
        <p>Enter how many classes you attended before today. We calculate the total working days from the admin's semester start date.</p>
        <form id="firstLoginSetupForm" class="setup-form">
          ${!hasOverallBaseline
            ? `<label>Attended overall before today <span>${overallClasses} working days counted</span>
                <input id="setupOverallAttended" type="number" min="0" max="${overallClasses}" required placeholder="e.g. 45" ${semesterStartDate ? "" : "disabled"}>
              </label>`
            : `<div class="setup-readonly">Overall attendance already saved: ${Number(window.myAttendance.attendedClasses || 0)} / ${Number(window.myAttendance.totalClasses || 0)}</div>`}
          <label>How many ${esc(activeCourse?.name || "current course")} classes did you miss before today?
            <span>${courseClasses} weekday class${courseClasses === 1 ? "" : "es"} so far · today is recorded separately</span>
            <input id="setupCourseMissed" type="number" min="0" max="${courseClasses}" required value="0" ${courseStart ? "" : "disabled"}>
          </label>
          <button class="primary" type="submit" ${semesterStartDate && courseStart ? "" : "disabled"}>Save and continue</button>
          ${!semesterStartDate ? '<small class="setup-warning">Ask the administrator to set the semester start date first.</small>' : ""}
          ${!courseStart ? '<small class="setup-warning">Ask the administrator to schedule and start the current course first.</small>' : ""}
        </form>
      </article>
      <article class="panel setup-card">
        <h2>Completed courses</h2>
        <p>Previous course percentages are left blank because historical marks were not imported.</p>
        <div class="completed-course-list">
          ${completedCourses.map((name) => `<div><span>${name}</span><b>—</b></div>`).join("")}
        </div>
        <small>Overall attendance will still include your historical totals above.</small>
      </article>
    </section>`;

  appRoot.innerHTML = shell("home", body, "Welcome back");
  bindNav();

  $("firstLoginSetupForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const overallAttended = hasOverallBaseline
      ? Number(window.myAttendance.attendedClasses || 0)
      : Number($("setupOverallAttended").value);
    const courseMissed = Number($("setupCourseMissed").value);
    if (
      !Number.isInteger(overallAttended) ||
      overallAttended < 0 ||
      overallAttended > overallClasses ||
      !Number.isInteger(courseMissed) ||
      courseMissed < 0 ||
      courseMissed > courseClasses
    ) {
      return toast("Enter valid attended and missed class counts.");
    }

    const currentAggregate = window.myAttendance || {};
    try {
      await setDoc(doc(db, "attendance", currentUser.uid), {
        uid: currentUser.uid,
        totalClasses: hasOverallBaseline ? currentAggregate.totalClasses : overallClasses,
        attendedClasses: hasOverallBaseline ? currentAggregate.attendedClasses : overallAttended,
        targetPercentage: currentAggregate.targetPercentage || 85,
        courseStats: {
          ...(currentAggregate.courseStats || {}),
          [activeCourse.courseId]: {
            totalClasses: courseClasses,
            attendedClasses: courseClasses - courseMissed,
            targetPercentage: COURSE_TARGET_PERCENTAGE
          }
        },
        updatedAt: serverTimestamp()
      }, { merge: true });

      await addDoc(collection(db, "auditLogs"), {
        actorUid: currentUser.uid,
        action: "first_login_attendance_setup",
        targetCourseId: activeCourse.courseId,
        setupDate: today,
        createdAt: serverTimestamp()
      });
      toast("Attendance set up. Mark today's class below.");
    } catch (error) {
      toast(friendlyError(error));
    }
  });
}

function homeView() {
  if (
    attendanceLoaded &&
    academicSettingsLoaded &&
    holidaysLoaded &&
    activeCourse &&
    !window.myAttendance?.courseStats?.[activeCourse.courseId]
  ) {
    renderAttendanceSetup();
    return;
  }

  const savedCourseAttendance = activeCourse
    ? window.myAttendance?.courseStats?.[activeCourse.courseId]
    : null;
  const legacyAttendance = window.myAttendance;
  const a = activeCourse && savedCourseAttendance
    ? {
        totalClasses: savedCourseAttendance.totalClasses || 0,
        attendedClasses: savedCourseAttendance.attendedClasses || 0
      }
    : !activeCourse && legacyAttendance
      ? legacyAttendance
      : activeCourse
        ? { totalClasses: 0, attendedClasses: 0 }
        : null;
  const target = activeCourse
    ? COURSE_TARGET_PERCENTAGE
    : Number(legacyAttendance?.targetPercentage) || 85;
  const percentage = a ? pct(a) : 0;
  const friendsCount = cachedFriends.filter((friend) => friend.status === "accepted").length;
  const targetMet = a && a.totalClasses > 0 && percentage >= target;
  const body = `
    ${renderTodayAttendanceCard()}
    <section class="legacy-dashboard-grid">
      <article class="panel progress-panel">
        <div class="panel-head">
          <div>
            <h2>Attendance overview</h2>
            <p>${activeCourse ? `Progress toward ${esc(activeCourse.name)} target.` : "Your progress toward your personal target."}</p>
          </div>
          <span class="tag">TARGET ${target}%</span>
        </div>
        <div class="dashboard-progress-block">
          <div class="dashboard-percent">${a && a.totalClasses ? fmt(percentage) : "—"}</div>
          <div class="progress-track"><i style="width:${Math.min(100, percentage)}%"></i></div>
          <div class="progress-foot">
            <span>${a ? `${a.attendedClasses} attended of ${a.totalClasses} classes` : "Mark today's class to get started"}</span>
            <b>${targetMet ? "Target reached" : a?.totalClasses ? `${(target - percentage).toFixed(1)}% to go` : ""}</b>
          </div>
        </div>
        <a class="inline-link" href="/calc" data-nav="/calc">Open attendance calculator →</a>
        <details class="completed-courses-disclosure">
          <summary>Completed courses</summary>
          <div class="completed-course-list compact">
            ${["HTML and CSS", "JavaScript", "MySQL"].map((name) => `<div><span>${name}</span><b>—</b></div>`).join("")}
          </div>
        </details>
      </article>
      <article class="panel circle-card">
        <div class="circle-icon" aria-hidden="true">♧</div>
        <div>
          <h2>Your circle</h2>
          <p>${friendsCount === 1 ? "1 accepted friend" : `${friendsCount} accepted friends`}</p>
        </div>
        <a class="primary" href="/friends" data-nav="/friends">Manage friends</a>
        <small>Attendance is shared only with accepted friends.</small>
      </article>
    </section>
    ${renderAnnouncementsBanner()}`;

  appRoot.innerHTML = shell("home", body, "Welcome back");
  bindNav();

  // Action: Mark Attended Today
  $("btnAttendToday")?.addEventListener("click", async () => {
    isLocationChecking = true;
    toast("Evaluating 500m campus geofence…");
    const locSignal = await getCurrentLocationSignal();
    isLocationChecking = false;

    try {
      await recordDailyAttendance({
        uid: currentUser.uid,
        status: "attended",
        locationStatus: locSignal.status,
        source: "web"
      });
      toast(`Marked ATTENDED! (${locSignal.reason})`);
      recentRecords = await getRecentDailyRecords(currentUser.uid, 60);
      for (const r of recentRecords) allDailyRecordsMap[r.date || r.id] = r;
      refreshCurrentRoute();
    } catch (err) {
      toast(friendlyError(err));
    }
  });

  // Action: Mark Absent Today
  $("btnAbsentToday")?.addEventListener("click", async () => {
    try {
      await recordDailyAttendance({
        uid: currentUser.uid,
        status: "absent",
        locationStatus: "outside",
        source: "web"
      });
      toast("Marked ABSENT for today.");
      recentRecords = await getRecentDailyRecords(currentUser.uid, 60);
      for (const r of recentRecords) allDailyRecordsMap[r.date || r.id] = r;
      refreshCurrentRoute();
    } catch (err) {
      toast(friendlyError(err));
    }
  });

  // Action: Correct Today's Attendance
  $("btnCorrectToday")?.addEventListener("click", async () => {
    if (!todayDailyRecord) return;
    const newStatus = todayDailyRecord.status === "attended" ? "absent" : "attended";
    let newLoc = "unknown";

    if (newStatus === "attended") {
      toast("Evaluating 500m campus geofence for correction…");
      const locSignal = await getCurrentLocationSignal();
      newLoc = locSignal.status;
    }

    try {
      await recordDailyAttendance({
        uid: currentUser.uid,
        status: newStatus,
        locationStatus: newLoc,
        source: "correction"
      });
      toast(`Corrected to ${newStatus.toUpperCase()}. Second class was NOT added.`);
      recentRecords = await getRecentDailyRecords(currentUser.uid, 60);
      for (const r of recentRecords) allDailyRecordsMap[r.date || r.id] = r;
      refreshCurrentRoute();
    } catch (err) {
      toast(friendlyError(err));
    }
  });
}

function calendarView() {
  const holidaysMap = {};
  for (const h of cachedHolidays) holidaysMap[h.date] = h;
  const streak = calculateAttendanceStreak(allDailyRecordsMap, holidaysMap);
  const nextDay = getNextCollegeDay(holidaysMap);

  const y = calendarMonth.getFullYear();
  const m = calendarMonth.getMonth();
  const firstDayIndex = new Date(y, m, 1).getDay(); // Sunday = 0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const monthName = calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const todayStr = getKolkataDateString();
  ensureCalendarMonthRecords(y, m);
  const monthPrefix = `${y}-${String(m + 1).padStart(2, "0")}-`;
  const monthlyLogs = Object.keys(allDailyRecordsMap).filter((date) => date.startsWith(monthPrefix)).length;
  const selectedEvents = calendarEvents
    .filter((event) => event.date === calendarSelectedDate)
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const upcomingEvents = calendarEvents
    .filter((event) => event.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""))
    .slice(0, 5);

  let daysHtml = "";
  // Empty cells before month starts
  for (let i = 0; i < firstDayIndex; i++) {
    daysHtml += `<div class="cal-day muted"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const weekend = isWeekend(dateStr);
    const holiday = holidaysMap[dateStr];
    const record = allDailyRecordsMap[dateStr];
    const dayEvents = calendarEvents.filter((event) => event.date === dateStr);

    let cl = "";
    let markText = "";

    if (weekend) {
      cl = "holiday";
      markText = "Weekend";
    } else if (holiday) {
      cl = "holiday";
      markText = esc(holiday.name || holiday.title || "Holiday");
    } else if (record) {
      if (record.status === "attended") {
        cl = "good";
        markText = "✓ Present";
      } else {
        cl = "bad";
        markText = "✕ Absent";
      }
    }

    const isToday = dateStr === todayStr;
    if (dayEvents.length) {
      markText += `${markText ? " · " : ""}${dayEvents.length} reminder${dayEvents.length === 1 ? "" : "s"}`;
    }

    daysHtml += `
      <button type="button" class="cal-day ${isToday ? "today" : ""} ${dateStr === calendarSelectedDate ? "selected" : ""} ${cl}" data-calendar-date="${dateStr}" aria-label="${dateStr}${markText ? `, ${esc(markText)}` : ""}">
        <b>${d}</b>
        <span class="mark">${markText}</span>
      </button>`;
  }

  const body = `
  <section class="metric-grid">
    ${metric("DAY STREAK", `${streak} 🔥`, "Consecutive college days", "✦")}
    ${metric("NEXT WORKING DAY", nextDay || "—", "Mon–Fri working days", "⌚")}
    ${metric("MONTHLY LOGS", monthlyLogs, "Saved daily classes", "◷")}
    ${metric("HOLIDAYS", cachedHolidays.length, "Declared college holidays", "🌴")}
  </section>

  <article class="panel calendar-panel">
    <div class="panel-head">
      <div>
        <h2>Smart Attendance Calendar</h2>
        <p>Monday–Friday working days. Weekends are automatically off.</p>
      </div>
      <div class="calendar-nav-buttons">
        <button class="ghost small-btn" id="calPrevMonth">← Prev</button>
        <b class="calendar-month">${monthName}</b>
        <button class="ghost small-btn" id="calNextMonth">Next →</button>
      </div>
    </div>
    <div class="panel-body">
      <div class="calendar-week-labels">
        <div>SUN</div><div>MON</div><div>TUE</div><div>WED</div><div>THU</div><div>FRI</div><div>SAT</div>
      </div>
      <div class="calendar-grid">
        ${daysHtml}
      </div>
      <div class="calendar-legend">
        <span class="tag good">● Present (Attended)</span>
        <span class="tag bad">● Absent</span>
        <span class="tag warn">● Official Holiday</span>
        <span class="tag">● Weekend (Off)</span>
      </div>
    </div>
  </article>`;

  const agendaBody = `
  <section class="content-grid calendar-agenda">
    <article class="panel">
      <div class="panel-head">
        <div>
          <h2>Add a reminder</h2>
          <p>Save exams, assignment deadlines, and campus events to your calendar.</p>
        </div>
      </div>
      <form id="calendarEventForm" class="form-grid">
        <div class="field full-field">
          <label for="eventTitle">Title</label>
          <input id="eventTitle" maxlength="80" placeholder="e.g. Data Structures midterm" required>
        </div>
        <div class="field">
          <label for="eventDate">Date</label>
          <input id="eventDate" type="date" value="${esc(calendarSelectedDate)}" required>
        </div>
        <div class="field">
          <label for="eventTime">Time (optional)</label>
          <input id="eventTime" type="time">
        </div>
        <div class="field">
          <label for="eventType">Type</label>
          <select id="eventType">
            <option value="exam">Exam</option>
            <option value="assignment">Assignment</option>
            <option value="event">Campus event</option>
          </select>
        </div>
        <div class="field full-field">
          <button class="primary" type="submit">Add to calendar ↗</button>
        </div>
      </form>
    </article>
    <article class="panel">
      <div class="panel-head">
        <div>
          <h2>${esc(calendarSelectedDate)}</h2>
          <p>Reminders for the selected date.</p>
        </div>
      </div>
      <div class="agenda-list">
        ${selectedEvents.length
          ? selectedEvents.map((event) => `
            <div class="agenda-item">
              <span class="agenda-type ${esc(event.type)}">${esc(event.type || "event")}</span>
              <div class="grow"><b>${esc(event.title)}</b><small>${esc(event.time || "All day")}</small></div>
              <button type="button" class="ghost small-btn" data-delete-event="${esc(event.id)}" aria-label="Delete ${esc(event.title)}">Remove</button>
            </div>`).join("")
          : '<p class="empty">No reminders for this date. Add one to keep deadlines in sight.</p>'}
      </div>
    </article>
  </section>
  <article class="panel">
    <div class="panel-head">
      <div><h2>Coming up</h2><p>Your next exams, deadlines, and campus events.</p></div>
      <span class="tag">${upcomingEvents.length} UPCOMING</span>
    </div>
    <div class="agenda-list">
      ${upcomingEvents.length
        ? upcomingEvents.map((event) => `
          <div class="agenda-item">
            <span class="agenda-type ${esc(event.type)}">${esc(event.type || "event")}</span>
            <div class="grow"><b>${esc(event.title)}</b><small>${esc(event.date)}${event.time ? ` · ${esc(event.time)}` : ""}</small></div>
            <button type="button" class="ghost small-btn" data-delete-event="${esc(event.id)}" aria-label="Delete ${esc(event.title)}">Remove</button>
          </div>`).join("")
        : '<p class="empty">No upcoming reminders yet.</p>'}
    </div>
  </article>`;

  const fullBody = body + agendaBody;
  appRoot.innerHTML = shell("calendar", fullBody, "Smart Calendar & Streak");
  bindNav();

  $("calPrevMonth")?.addEventListener("click", () => {
    calendarMonth.setMonth(calendarMonth.getMonth() - 1);
    calendarView();
  });
  $("calNextMonth")?.addEventListener("click", () => {
    calendarMonth.setMonth(calendarMonth.getMonth() + 1);
    calendarView();
  });
  appRoot.querySelectorAll("[data-calendar-date]").forEach((button) => {
    button.addEventListener("click", () => {
      calendarSelectedDate = button.dataset.calendarDate;
      calendarView();
    });
  });
  $("calendarEventForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = $("eventTitle").value.trim();
    const date = $("eventDate").value;
    const time = $("eventTime").value;
    const type = $("eventType").value;
    if (!title || !isValidCalendarDate(date)) {
      return toast("Enter a reminder title and valid date.");
    }
    if (calendarEvents.length >= 100) return toast("You can save up to 100 calendar reminders.");
    const event = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      date,
      time,
      type
    };
    const nextEvents = [...calendarEvents, event];
    try {
      await updateDoc(doc(db, "users", currentUser.uid), { calendarEvents: nextEvents });
      calendarEvents = nextEvents;
      profile.calendarEvents = calendarEvents;
      calendarSelectedDate = date;
      const eventDate = new Date(`${date}T00:00:00`);
      calendarMonth = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1);
      toast("Reminder added to your calendar.");
      calendarView();
    } catch (err) {
      toast(`Could not save reminder: ${friendlyError(err)}`);
    }
  });
  appRoot.querySelectorAll("[data-delete-event]").forEach((button) => {
    button.addEventListener("click", async () => {
      const nextEvents = calendarEvents.filter((event) => event.id !== button.dataset.deleteEvent);
      try {
        await updateDoc(doc(db, "users", currentUser.uid), { calendarEvents: nextEvents });
        calendarEvents = nextEvents;
        profile.calendarEvents = calendarEvents;
        toast("Reminder removed.");
        calendarView();
      } catch (err) {
        toast(`Could not remove reminder: ${friendlyError(err)}`);
      }
    });
  });
}

async function ensureCalendarMonthRecords(year, month) {
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  if (loadedCalendarMonths.has(monthKey) || pendingCalendarMonths.has(monthKey)) return;
  pendingCalendarMonths.add(monthKey);
  const start = `${monthKey}-01`;
  const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, "0")}`;
  try {
    const records = await getDocs(query(
      collection(db, "attendance", currentUser.uid, "daily"),
      where("date", ">=", start),
      where("date", "<=", end)
    ));
    for (const record of records.docs) {
      allDailyRecordsMap[record.id] = { id: record.id, ...record.data() };
    }
    loadedCalendarMonths.add(monthKey);
    if (path() === "/calendar" && calendarMonth.getFullYear() === year && calendarMonth.getMonth() === month) {
      calendarView();
    }
  } catch (err) {
    toast(`Could not load calendar attendance: ${friendlyError(err)}`);
  } finally {
    pendingCalendarMonths.delete(monthKey);
  }
}

function timetableView() {
  const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  let scheduleHtml = "";
  for (const day of daysOfWeek) {
    const dayClasses = userTimetable.filter((c) => c.day === day).sort((a, b) => a.time.localeCompare(b.time));
    scheduleHtml += `
      <div class="timetable-day-card">
        <h4>${day}</h4>
        ${
          dayClasses.length
            ? `<div class="timetable-classes">
                ${dayClasses
                  .map(
                    (c) => `
                  <div class="timetable-class-row">
                    <span><b>${esc(c.time)}${c.endTime ? `–${esc(c.endTime)}` : ""}</b> — ${esc(c.subject)}${c.room ? `<small>${esc(c.room)}</small>` : ""}</span>
                    <button class="ghost small-btn" data-delete-class="${esc(c.id)}" aria-label="Remove ${esc(c.subject)}">✕</button>
                  </div>`
                  )
                  .join("")}
               </div>`
            : '<p class="muted-text" style="font-size:11px;margin:5px 0;">No classes scheduled.</p>'
        }
      </div>`;
  }

  const body = `
  <section class="content-grid">
    <div class="panel">
      <div class="panel-head">
        <div>
          <h2>Add Class to Routine</h2>
          <p>Regular Monday–Friday timetable.</p>
        </div>
      </div>
      <form id="addClassForm" class="form-grid">
        <div class="field full-field">
          <label>Subject / Class Name</label>
          <input id="ttSubject" placeholder="e.g. Operating Systems / Lab" required maxlength="60">
        </div>
        <div class="field">
          <label>Day of Week</label>
          <select id="ttDay">
            <option>Monday</option>
            <option>Tuesday</option>
            <option>Wednesday</option>
            <option>Thursday</option>
            <option>Friday</option>
          </select>
        </div>
        <div class="field">
          <label>Start Time</label>
          <input id="ttTime" type="time" value="09:00" required>
        </div>
        <div class="field">
          <label>End Time</label>
          <input id="ttEndTime" type="time" value="10:00" required>
        </div>
        <div class="field full-field">
          <label>Room / Location (optional)</label>
          <input id="ttRoom" placeholder="e.g. Block B · Room 204" maxlength="60">
        </div>
        <div class="field full-field">
          <button class="primary" type="submit">Add to timetable ↗</button>
        </div>
      </form>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <h2>Weekly Routine</h2>
          <p>Saturday and Sunday are recharge days.</p>
        </div>
      </div>
      <div class="timetable-wrapper">
        ${scheduleHtml}
      </div>
    </div>
  </section>`;

  appRoot.innerHTML = shell("timetable", body, "Timetable & Schedule");
  bindNav();

  $("addClassForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const subject = $("ttSubject").value.trim();
    const day = $("ttDay").value;
    const time = $("ttTime").value;
    const endTime = $("ttEndTime").value;
    const room = $("ttRoom").value.trim();

    if (!subject || !time || !endTime || endTime <= time) {
      return toast("Enter a subject and an end time later than the start time.");
    }
    if (userTimetable.length >= 100) return toast("You can save up to 100 timetable classes.");
    try {
      if (hasTimetableConflict(userTimetable, day, time, endTime)) {
        return toast("This class overlaps another class on that day.");
      }
    } catch (err) {
      return toast(`Could not check the timetable: ${friendlyError(err)}`);
    }
    const newClass = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      subject,
      day,
      time,
      endTime,
      room
    };
    const nextTimetable = [...userTimetable, newClass];
    try {
      await updateDoc(doc(db, "users", currentUser.uid), { timetable: nextTimetable });
      userTimetable = nextTimetable;
      profile.timetable = userTimetable;
      const backupError = cacheTimetableBackup();
      toast(backupError ? `Saved online; browser backup failed: ${backupError}` : `Added ${subject} to ${day}.`);
      timetableView();
    } catch (err) {
      toast(`Could not save class: ${friendlyError(err)}`);
    }
  });

  appRoot.querySelectorAll("[data-delete-class]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const nextTimetable = userTimetable.filter((c) => c.id !== btn.dataset.deleteClass);
      try {
        await updateDoc(doc(db, "users", currentUser.uid), { timetable: nextTimetable });
        userTimetable = nextTimetable;
        profile.timetable = userTimetable;
        const backupError = cacheTimetableBackup();
        toast(backupError ? `Removed online; browser backup failed: ${backupError}` : "Class removed.");
        timetableView();
      } catch (err) {
        toast(`Could not remove class: ${friendlyError(err)}`);
      }
    });
  });
}

function reportsView() {
  const savedCourseAttendance = activeCourse
    ? window.myAttendance?.courseStats?.[activeCourse.courseId]
    : null;
  const a = activeCourse
    ? {
        ...savedCourseAttendance,
        courseName: activeCourse.name,
        targetPercentage: COURSE_TARGET_PERCENTAGE
      }
    : window.myAttendance;

  const body = `
  <section class="content-grid">
    <div class="panel">
      <div class="panel-head">
        <div>
          <h2>Export Attendance Data</h2>
          <p>Download your attendance records for submission.</p>
        </div>
      </div>
      <div class="panel-body">
        <p class="muted-text">Generate a standardized CSV report containing your totals, percentage, target, and all 500m geofence daily checks.</p>
        <div class="row" style="margin-top:14px;">
          <button class="primary" id="btnExportCsv">Download CSV ↗</button>
          <button class="ghost" id="btnPrintReport">Print / Save PDF</button>
        </div>
      </div>
    </div>
  </section>

  <section class="panel table-panel">
    <div class="panel-head">
      <div>
        <h2>Full Attendance Log History</h2>
        <p>Complete record of all daily marks, geofence status, and audit sources.</p>
      </div>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>DATE (IST)</th>
            <th>COURSE</th>
            <th>STATUS</th>
            <th>CAMPUS GEOFENCE (500M)</th>
            <th>SOURCE</th>
          </tr>
        </thead>
        <tbody>
          ${
            recentRecords.length
              ? recentRecords
                  .map((r) => {
                    const isAttended = r.status === "attended";
                    const loc = r.locationStatus || "unknown";
                    let locPill = `<span class="pill neutral">—</span>`;
                    if (loc === "inside") locPill = `<span class="pill green">Inside</span>`;
                    else if (loc === "outside") locPill = `<span class="pill red">Outside</span>`;

                    return `<tr>
                      <td><b>${esc(r.date || r.id)}</b></td>
                      <td>${esc(r.courseName || "—")}</td>
                      <td><span class="pill ${isAttended ? "green" : "red"}">${isAttended ? "Attended" : "Absent"}</span></td>
                      <td>${locPill}</td>
                      <td><small class="muted">${esc(r.source || "web")}</small></td>
                    </tr>`;
                  })
                  .join("")
              : '<tr><td colspan="5" class="empty">No attendance records found.</td></tr>'
          }
        </tbody>
      </table>
    </div>
  </section>`;

  appRoot.innerHTML = shell("reports", body, "Reports & Data Exports");
  bindNav();

  $("btnExportCsv")?.addEventListener("click", () => {
    const csvContent = generateAttendanceCsv({
      profile,
      attendance: a,
      dailyRecords: recentRecords
    });
    downloadFile(`attendly-attendance-${getKolkataDateString()}.csv`, "text/csv;charset=utf-8", csvContent);
    toast("CSV exported.");
  });

  $("btnPrintReport")?.addEventListener("click", () => {
    window.print();
  });
}

function calcView() {
  const body = `
  <section class="calc-wrap">
    <div class="calc-intro">
      <span class="tag">⚠️ SAVAGE MODE: ON · 65 ORIGINAL ROASTS</span>
      <h2>Calculate your karma 💀</h2>
      <p class="subtitle">College ki velthunnava? Leka attendance ni RIP chepthunnava?</p>
    </div>
    <div class="panel calc-panel">
      <form id="calcForm" novalidate>
        <div class="form-grid">
          <div class="field full-field">
            <label for="calcTarget">Select attendance percentage</label>
            <select id="calcTarget">
              <option value="70">70%</option>
              <option value="75">75%</option>
              <option value="80">80%</option>
              <option value="85" selected>85%</option>
              <option value="90">90%</option>
              <option value="95">95%</option>
              <option value="100">100%</option>
            </select>
            <small class="muted">Choose the threshold that applies to you (e.g. 85% or 90%).</small>
          </div>
          <div class="field">
            <label for="calcTotal">Total working days / classes</label>
            <input id="calcTotal" type="number" min="1" step="1" placeholder="e.g. 100">
          </div>
          <div class="field">
            <label for="calcAttended">Days / classes attended</label>
            <input id="calcAttended" type="number" min="0" step="1" placeholder="e.g. 78">
          </div>
        </div>
        <p class="target-note"><strong>Reminder:</strong> This calculator treats each day as 1 unit. Preserves exact 100% target handling.</p>
        <button class="primary full" type="submit">CALCULATE MY KARMA 💀</button>
      </form>
      <div id="calcError" class="error-box" style="display:none;"></div>
      <div id="calcResult" class="calc-result" style="display:none;"></div>
    </div>
  </section>`;

  appRoot.innerHTML = shell("calc", body, "Attendance calculator");
  bindNav();

  const form = $("calcForm");
  const errBox = $("calcError");
  const resBox = $("calcResult");

  form.onsubmit = (e) => {
    e.preventDefault();
    errBox.style.display = "none";
    resBox.style.display = "none";

    const totalRaw = $("calcTotal").value.trim();
    const attendedRaw = $("calcAttended").value.trim();
    const targetPercent = Number($("calcTarget").value);

    if (!totalRaw || !attendedRaw) {
      errBox.textContent = "Rey babu, rendu boxes fill cheyyi. Calculator ki mind reading raadhu 😭";
      errBox.style.display = "block";
      return;
    }

    const total = Number(totalRaw);
    const attended = Number(attendedRaw);

    let karma;
    try {
      karma = calculateAttendanceKarma({ total, attended, targetPercent });
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = "block";
      return;
    }

    const { percentage, classesNeeded, bunkable, isSafe, explanation } = karma;
    const roast = chooseRoast(percentage, lastCalcMemeIndex);
    lastCalcMemeIndex = roast.index;

    const formattedNeeded = classesNeeded === Infinity ? "Not possible (∞)" : String(classesNeeded);

    resBox.innerHTML = `
      <div class="result-top">
        <div>
          <small>CURRENT ATTENDANCE</small>
          <h3>${percentage.toFixed(2)}%</h3>
          <span class="status ${isSafe ? "success" : "danger"}">${isSafe ? "TARGET REACHED" : "TARGET NOT REACHED"}</span>
        </div>
        <div class="result-emoji">${isSafe ? "🏆" : percentage >= targetPercent - 5 ? "😬" : "💀"}</div>
      </div>
      <div class="result-grid">
        <div><small>Attended</small><b>${attended} / ${total}</b></div>
        <div><small>Selected Target</small><b>${targetPercent}%</b></div>
        <div><small>Classes to attend</small><b>${formattedNeeded}</b></div>
        <div><small>Future bunkable</small><b>${bunkable}</b></div>
      </div>
      <div class="progress-wrap">
        <div class="progress-label"><span>Current progress</span><span>${percentage.toFixed(2)}% / ${targetPercent}%</span></div>
        <div class="track"><div class="bar" style="width:${Math.min(100, percentage)}%"></div></div>
      </div>
      <p class="explain">${esc(explanation)}</p>
      <div class="meme pop">
        <div class="meme-label">🎤 SAVAGE TENGLISH ROAST</div>
        <div class="meme-text">${esc(roast.text)}</div>
      </div>
      <div class="result-actions">
        <button class="secondary" type="button" id="copyResultBtn">COPY RESULT</button>
        <button class="secondary" type="button" id="resetCalcBtn">RESET</button>
      </div>`;

    resBox.style.display = "block";

    $("copyResultBtn")?.addEventListener("click", async () => {
      const copyText = `ATTENDLY REPORT\nCurrent: ${percentage.toFixed(2)}%\nTarget: ${targetPercent}%\nClasses needed: ${formattedNeeded}\nBunkable: ${bunkable}\nRoast: ${roast.text}`;
      try {
        await navigator.clipboard.writeText(copyText);
        $("copyResultBtn").textContent = "COPIED ✓";
      } catch {
        $("copyResultBtn").textContent = "COPY NOT ALLOWED";
      }
      setTimeout(() => {
        if ($("copyResultBtn")) $("copyResultBtn").textContent = "COPY RESULT";
      }, 1800);
    });

    $("resetCalcBtn")?.addEventListener("click", () => {
      form.reset();
      resBox.style.display = "none";
      errBox.style.display = "none";
      $("calcTarget").value = "85";
      $("calcTotal").focus();
    });
  };
}

async function renderFriends() {
  if (!currentUser) return;
  const accepted = cachedFriends.filter((f) => f.status === "accepted");
  const requests = cachedRequests;

  const body = `
  <section class="metric-grid">
    ${metric("YOUR FRIENDS", accepted.length, "Accepted mutual connections", "♧")}
    ${metric("PENDING REQUESTS", requests.length, "Waiting for your response", "◷")}
    ${metric("PRIVACY", "FRIENDS ONLY", "Attendance is never public", "◈")}
    ${metric("SYNC", "LIVE", "Firestore transaction safe", "↗")}
  </section>

  <section class="content-grid">
    <div class="panel">
      <div class="panel-head">
        <div>
          <h2>Find students</h2>
          <p>Search by exact username.</p>
        </div>
      </div>
      <form id="searchPeople" class="search-row">
        <input id="personQuery" placeholder="Enter exact username" required>
        <button class="primary">Search</button>
      </form>
      <div id="searchResults" class="people-list"></div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <h2>Friend requests</h2>
          <p>Accept requests to share attendance.</p>
        </div>
      </div>
      <div class="people-list">
        ${
          requests
            .map(
              (r) => `<div class="person-row">
                <div class="avatar">${esc((r.fromName || "?").slice(0, 1).toUpperCase())}</div>
                <div class="person-info">
                  <b>${esc(r.fromName || "Student")}</b>
                  <small>Wants to connect</small>
                </div>
                <button class="primary small-btn" data-accept="${r.id}">Accept</button>
                <button class="ghost small-btn" data-reject="${r.id}">Decline</button>
              </div>`
            )
            .join("") || '<div class="empty">No pending requests.</div>'
        }
      </div>
    </div>
  </section>

  <section class="panel table-panel">
    <div class="panel-head">
      <div>
        <h2>Friends attendance & Campus check</h2>
        <p>Visible only for accepted mutual friends. Precise coordinates are NEVER shared.</p>
      </div>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>FRIEND</th>
            <th>ATTENDANCE</th>
            <th>ATTENDED / TOTAL</th>
            <th>TARGET</th>
            <th>CAMPUS GEOFENCE (500M)</th>
            <th>STATUS</th>
          </tr>
        </thead>
        <tbody id="friendAttendanceTable">
          <tr><td colspan="6" class="empty">Loading friend attendance…</td></tr>
        </tbody>
      </table>
    </div>
  </section>`;

  appRoot.innerHTML = shell("friends", body, "Your circle");
  bindNav();

  $("searchPeople").onsubmit = async (e) => {
    e.preventDefault();
    const term = $("personQuery").value.trim().toLowerCase();
    const box = $("searchResults");
    box.innerHTML = '<div class="empty">Searching…</div>';
    try {
      const q1 = query(
        collection(db, "userDirectory"),
        where("username", "==", term.replace(/^@/, "")),
        limit(10)
      );
      const s1 = await getDocs(q1);
      const results = s1.docs.filter((x) => x.id !== currentUser.uid);
      box.innerHTML =
        results
          .map((x) => {
            const u = x.data();
            return `<div class="person-row">
              <div class="avatar">${esc((u.displayName || "?").slice(0, 1).toUpperCase())}</div>
              <div class="person-info">
                <b>${esc(u.displayName || "Student")}</b>
                <small>@${esc(u.username || "student")}</small>
              </div>
              <button class="primary small-btn" data-add="${x.id}" data-name="${esc(u.displayName || "Student")}">Add friend</button>
            </div>`;
          })
          .join("") ||
        '<div class="empty">No matching student found. Ask them for their exact username.</div>';
    } catch (err) {
      box.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    }
  };

  $("searchResults").onclick = async (e) => {
    const btn = e.target.closest("[data-add]");
    if (!btn) return;
    try {
      const target = btn.dataset.add;
      const existing = cachedFriends.find((f) => f.members?.includes(target));
      if (existing) return toast("You are already connected or have a pending request.");

      await addDoc(collection(db, "friendRequests"), {
        fromUid: currentUser.uid,
        fromName: profile.displayName || "Student",
        toUid: target,
        status: "pending",
        createdAt: serverTimestamp()
      });
      toast("Friend request sent.");
      btn.disabled = true;
      btn.textContent = "Sent";
    } catch (err) {
      toast(friendlyError(err));
    }
  };

  appRoot.querySelectorAll("[data-accept]").forEach((b) =>
    (b.onclick = async () => {
      const req = cachedRequests.find((r) => r.id === b.dataset.accept);
      if (!req) return;
      try {
        const names = {
          [currentUser.uid]: profile.displayName || "Student",
          [req.fromUid]: req.fromName
        };
        await setDoc(
          doc(db, "friendships", [currentUser.uid, req.fromUid].sort().join("_")),
          {
            members: [currentUser.uid, req.fromUid],
            memberNames: names,
            status: "accepted",
            requestId: req.id,
            createdAt: serverTimestamp()
          }
        );
        await updateDoc(doc(db, "friendRequests", req.id), { status: "accepted" });
        toast("Friend added. Attendance is now shared.");
      } catch (e) {
        toast(friendlyError(e));
      }
    })
  );

  appRoot.querySelectorAll("[data-reject]").forEach((b) =>
    (b.onclick = async () => {
      try {
        await updateDoc(doc(db, "friendRequests", b.dataset.reject), {
          status: "rejected"
        });
        toast("Request declined.");
      } catch (e) {
        toast(friendlyError(e));
      }
    })
  );

  loadFriendAttendance();
}

async function loadFriendAttendance() {
  const box = $("friendAttendanceTable");
  if (!box) return;
  const friends = cachedFriends.filter((f) => f.status === "accepted");
  if (!friends.length) {
    box.innerHTML = '<tr><td colspan="6" class="empty">No accepted friends yet.</td></tr>';
    return;
  }

  const rows = await Promise.all(
    friends.map(async (f) => {
      const uid = f.members.find((x) => x !== currentUser.uid);
      const name = f.memberNames?.[uid] || "Friend";
      try {
        const s = await getDoc(doc(db, "attendance", uid));
        if (!s.exists()) {
          return `<tr>
            <td><b>${esc(name)}</b></td>
            <td>Not shared yet</td>
            <td>—</td>
            <td>—</td>
            <td><span class="status neutral">No data</span></td>
            <td><span class="status neutral">—</span></td>
          </tr>`;
        }

        const attendance = s.data();
        const a = activeCourse
          ? attendance.courseStats?.[activeCourse.courseId] || {
              totalClasses: 0,
              attendedClasses: 0
            }
          : null;
        const p = a ? pct(a) : 0;
        const t = COURSE_TARGET_PERCENTAGE;
        const loc = a?.lastLocationStatus || "unknown";
        const lastSt = a?.lastStatus || "";

        let locPill = `<span class="pill neutral">— Unverified</span>`;
        if (loc === "inside") {
          locPill = `<span class="pill green">✓ On campus</span>`;
        } else if (loc === "outside") {
          if (lastSt === "attended") {
            locPill = `<span class="pill red" title="Attended marked, but outside 500m campus zone. Note: GPS can be inaccurate; not proof.">⚠️ Mismatch Alert</span>`;
          } else {
            locPill = `<span class="pill amber">Outside campus</span>`;
          }
        }

        return `<tr>
          <td><b>${esc(name)}</b></td>
          <td>${a ? fmt(p) : "—"}</td>
          <td>${a ? `${a.attendedClasses} / ${a.totalClasses}` : "No active course"}</td>
          <td>${t}%</td>
          <td>${locPill}</td>
          <td><span class="status ${!a ? "neutral" : p >= t ? "success" : p >= t - 5 ? "warning" : "danger"}">${!a ? "No active course" : p >= t ? "On target" : p >= t - 5 ? "Near target" : "Below target"}</span></td>
        </tr>`;
      } catch (e) {
        return `<tr><td>${esc(name)}</td><td colspan="5">Could not load attendance</td></tr>`;
      }
    })
  );

  if ($("friendAttendanceTable")) {
    $("friendAttendanceTable").innerHTML = rows.join("");
  }
}

async function settingsView() {
  const perm = getNotificationPermission();
  const pushSupported = await isPushNotificationSupported();

  const body = `
  <section class="panel settings-panel">
    <div class="panel-head">
      <div>
        <h2>Profile settings</h2>
        <p>Manage your public student identity.</p>
      </div>
    </div>
    <form id="profileForm" class="form-grid">
      <div class="field">
        <label>Display name</label>
        <input id="displayName" maxlength="50" value="${esc(profile?.displayName || "")}">
      </div>
      <div class="field">
        <label>Username (exact match lookup)</label>
        <input id="username" maxlength="24" pattern="[a-zA-Z0-9_]+" value="${esc(profile?.username || "")}">
      </div>
      <div class="field full-field">
        <button class="primary">Save profile</button>
      </div>
    </form>
    <div class="privacy-note">
      Your email and attendance are never publicly listed. Students can search only by exact username. Attendance is only visible to you, accepted friends, and authorized admins.
    </div>
  </section>

  <section class="panel settings-panel">
    <div class="panel-head">
      <div>
        <h2>Automated Push Notifications & Reminders</h2>
        <p>9 AM weekday prompts (with ATTEND/ABSENT) · Thursday & Sunday 6 PM reminders</p>
      </div>
      <span class="tag">${perm.toUpperCase()}</span>
    </div>
    <div class="stack">
      <p class="muted">
        ATTENDLY sends automated weekday 9 AM attendance checks with native ATTEND/ABSENT action buttons, plus Thursday ("Repu oka roju clg ki poo 2 day's holidays") and Sunday ("2 days rest tisukunav gaa inkem clg ki poo") 6 PM IST reminders.
      </p>
      <div class="notification-controls">
        ${
          perm === "granted"
            ? `<button class="ghost" id="btnDisablePush">Disable push notifications</button>`
            : `<button class="primary" id="btnEnablePush" ${!pushSupported ? "disabled" : ""}>
                ${pushSupported ? "Enable 9 AM & Reminder Alerts 🔔" : "Push not supported in this browser"}
               </button>`
        }
      </div>
      <small class="muted">
        Permission is requested ONLY on your click. FCM tokens are saved securely to your account for scheduled delivery.
      </small>
    </div>
  </section>`;

  appRoot.innerHTML = shell("settings", body, "Account settings");
  bindNav();

  $("profileForm").onsubmit = async (e) => {
    e.preventDefault();
    const displayName = $("displayName").value.trim();
    const username = $("username").value.trim().toLowerCase();
    if (!displayName || !/^[a-z0-9_]{3,24}$/.test(username)) {
      return toast("Name required; username must be 3–24 letters, numbers or underscores.");
    }
    try {
      await updateDoc(doc(db, "users", currentUser.uid), { displayName, username });
      await setDoc(
        doc(db, "userDirectory", currentUser.uid),
        {
          uid: currentUser.uid,
          displayName,
          username,
          photoURL: profile.photoURL || ""
        },
        { merge: true }
      );
      profile = { ...profile, displayName, username };
      toast("Profile updated.");
    } catch (err) {
      toast(friendlyError(err));
    }
  };

  $("btnEnablePush")?.addEventListener("click", async () => {
    try {
      toast("Requesting notification permission…");
      await enablePushNotifications(currentUser);
      toast("Push notifications enabled! Device registered.");
      settingsView();
    } catch (err) {
      toast("Notification error: " + friendlyError(err));
    }
  });

  $("btnDisablePush")?.addEventListener("click", async () => {
    try {
      await disablePushNotifications(currentUser);
      toast("Notifications disabled on this device.");
      settingsView();
    } catch (err) {
      toast(friendlyError(err));
    }
  });
}

async function adminView() {
  try {
    const settingsSnap = await getDoc(doc(db, "academicSettings", "main"));
    academicSettings = settingsSnap.exists() ? settingsSnap.data() : null;
  } catch (error) {
    toast("Could not load semester settings: " + friendlyError(error));
  }

  const body = `
  <section class="admin-banner">
    <div>
      <span class="tag">SECURE ADMINISTRATION · VERIFIED CLAIM</span>
      <h2>Admin control center</h2>
      <p>Manage the academic calendar, course schedule, student updates, and platform access from one place.</p>
      <div class="admin-hero-meta">
        <span><i></i> Connected to live workspace</span>
        <span>IST · Asia/Kolkata</span>
        <span>80% course attendance minimum</span>
      </div>
    </div>
    <div class="admin-hero-mark" aria-hidden="true">A</div>
  </section>

  <nav class="admin-section-nav" aria-label="Admin sections">
    <a href="#admin-notifications">Notifications</a>
    <a href="#admin-courses-section">Courses</a>
    <a href="#admin-holidays-section">Holidays</a>
    <a href="#admin-announcements-section">Announcements</a>
    <a href="#admin-users-section">Students</a>
    <a href="#admin-audit-section">Audit log</a>
  </nav>

  <section class="metric-grid" id="adminMetrics">
    ${metric("REGISTERED USERS", "…", "User directory profiles", "♧")}
    ${metric("ATTENDANCE RECORDS", "…", "Saved student records", "◷")}
    ${metric("ACTIVE COURSE", "…", "One course at a time", "📚")}
    ${metric("80% MINIMUM", "Required", "Per course", "✓")}
  </section>

  <section class="panel admin-panel" id="admin-notifications">
    <div class="panel-head">
      <div>
        <span class="admin-section-kicker">COMMUNICATIONS</span>
        <h2>Notification center</h2>
        <p>Choose what students receive, when it is sent, and how each message reads. Scheduled messages use India Standard Time.</p>
      </div>
      <span class="admin-live-badge"><i></i> ADMIN CONTROLLED</span>
    </div>
    <form id="adminAcademicSettingsForm" class="form-grid">
      <div class="admin-notice-layout full-field">
        <div class="admin-notice-controls">
          <div class="admin-notification-card">
            <div class="admin-notification-top">
              <div class="admin-notification-icon">◷</div>
              <div class="admin-notification-title">
                <b>Weekday attendance check</b>
                <small>Push notification · Monday–Friday</small>
              </div>
              <label class="admin-switch" aria-label="Enable weekday attendance prompt">
                <input id="notifyDailyEnabled" type="checkbox" ${academicSettings?.notificationSettings?.dailyEnabled === false ? "" : "checked"}>
                <span></span>
              </label>
            </div>
            <div class="admin-notification-fields">
              <label>Send time <span>IST</span>
                <input id="notifyDailyTime" type="time" required value="${esc(academicSettings?.notificationSettings?.dailyTime || "09:00")}">
              </label>
              <label>Notification title
                <input id="notifyDailyTitle" maxlength="100" required value="${esc(academicSettings?.notificationSettings?.dailyTitle || "ATTENDLY — Daily Attendance Check ⏰")}">
              </label>
              <label>Message
                <textarea id="notifyDailyBody" maxlength="220" rows="2" required>${esc(academicSettings?.notificationSettings?.dailyBody || "College ki vellava leka bunk kottava? Mark today's class.")}</textarea>
              </label>
            </div>
          </div>

          <div class="admin-notification-card">
            <div class="admin-notification-top">
              <div class="admin-notification-icon amber">✦</div>
              <div class="admin-notification-title">
                <b>Thursday reminder</b>
                <small>Push notification · Every Thursday</small>
              </div>
              <label class="admin-switch" aria-label="Enable Thursday reminder">
                <input id="notifyThursdayEnabled" type="checkbox" ${academicSettings?.notificationSettings?.thursdayEnabled === false ? "" : "checked"}>
                <span></span>
              </label>
            </div>
            <div class="admin-notification-fields">
              <label>Send time <span>IST</span>
                <input id="notifyThursdayTime" type="time" required value="${esc(academicSettings?.notificationSettings?.thursdayTime || "18:00")}">
              </label>
              <label>Notification title
                <input id="notifyThursdayTitle" maxlength="100" required value="${esc(academicSettings?.notificationSettings?.thursdayTitle || "ATTENDLY Reminder 📢")}">
              </label>
              <label>Message
                <textarea id="notifyThursdayBody" maxlength="220" rows="2" required>${esc(academicSettings?.notificationSettings?.thursdayBody || "Repu oka roju clg ki poo 2 day's holidays")}</textarea>
              </label>
            </div>
          </div>

          <div class="admin-notification-card">
            <div class="admin-notification-top">
              <div class="admin-notification-icon violet">↗</div>
              <div class="admin-notification-title">
                <b>Sunday reminder</b>
                <small>Push notification · Every Sunday</small>
              </div>
              <label class="admin-switch" aria-label="Enable Sunday reminder">
                <input id="notifySundayEnabled" type="checkbox" ${academicSettings?.notificationSettings?.sundayEnabled === false ? "" : "checked"}>
                <span></span>
              </label>
            </div>
            <div class="admin-notification-fields">
              <label>Send time <span>IST</span>
                <input id="notifySundayTime" type="time" required value="${esc(academicSettings?.notificationSettings?.sundayTime || "18:00")}">
              </label>
              <label>Notification title
                <input id="notifySundayTitle" maxlength="100" required value="${esc(academicSettings?.notificationSettings?.sundayTitle || "ATTENDLY Reminder 📢")}">
              </label>
              <label>Message
                <textarea id="notifySundayBody" maxlength="220" rows="2" required>${esc(academicSettings?.notificationSettings?.sundayBody || "2 days rest tisukunav gaa inkem clg ki poo")}</textarea>
              </label>
            </div>
          </div>

          <div class="admin-notification-card login-notice-card">
            <div class="admin-notification-top">
              <div class="admin-notification-icon green">✓</div>
              <div class="admin-notification-title">
                <b>Welcome notice after sign-in</b>
                <small>In-app message · shown once when a student signs in</small>
              </div>
              <label class="admin-switch" aria-label="Enable welcome notice after sign-in">
                <input id="notifyLoginEnabled" type="checkbox" ${academicSettings?.notificationSettings?.loginEnabled === true ? "checked" : ""}>
                <span></span>
              </label>
            </div>
            <div class="admin-notification-fields">
              <label>Notice title
                <input id="notifyLoginTitle" maxlength="100" required value="${esc(academicSettings?.notificationSettings?.loginTitle || "Welcome back to ATTENDLY")}">
              </label>
              <label>Message
                <textarea id="notifyLoginBody" maxlength="220" rows="2" required>${esc(academicSettings?.notificationSettings?.loginBody || "Your attendance dashboard is ready.")}</textarea>
              </label>
              <small class="admin-inline-note">This is an in-app sign-in notice, not a device push. Push permission remains under each student's control.</small>
            </div>
          </div>
        </div>

        <aside class="admin-notification-preview">
          <span class="admin-section-kicker">MESSAGE PREVIEW</span>
          <div class="admin-preview-device">
            <div class="admin-preview-topline"><i></i><span>ATTENDLY · now</span><b>•••</b></div>
            <b id="notificationPreviewTitle">ATTENDLY — Daily Attendance Check ⏰</b>
            <p id="notificationPreviewBody">College ki vellava leka bunk kottava? Mark today's class.</p>
          </div>
          <p>Changes apply to future scheduled sends. The weekday prompt is automatically skipped on holidays.</p>
          <label class="admin-semester-field">Semester start date
            <input id="semesterStartDate" type="date" required value="${academicSettings?.semesterStartDate || getStartDateForWorkingDayCount(getKolkataDateString(), 50)}">
            <small>Working-day totals begin here. The default counts 50 weekdays through today.</small>
          </label>
          <button class="primary admin-save-button" type="submit">Save notification settings</button>
        </aside>
      </div>
    </form>
  </section>

  <section class="panel" id="admin-courses-section">
    <div class="panel-head">
      <div>
        <h2>Course Management</h2>
        <p>Schedule named courses in sequence. Only one course can be active, and each requires at least 80% attendance.</p>
      </div>
      <span class="tag">DEFAULT: 10 DAYS</span>
    </div>
    <form id="addCourseForm" class="form-grid">
      <div class="field">
        <label for="courseName">Course / subject name</label>
        <input id="courseName" placeholder="e.g. HTML and CSS" required maxlength="80">
      </div>
      <div class="field">
        <label for="courseStartDate">Start date</label>
        <input id="courseStartDate" type="date" min="${getKolkataDateString()}" required value="${getKolkataDateString()}">
      </div>
      <div class="field">
        <label for="courseDuration">Duration (days)</label>
        <input id="courseDuration" type="number" min="1" max="365" value="10" required>
      </div>
      <div class="field full-field">
        <small class="muted" id="courseDatePreview">End date is inclusive. Attendance target is fixed at ${COURSE_TARGET_PERCENTAGE}%.</small>
        <button class="primary" type="submit">Schedule course ↗</button>
      </div>
    </form>
    <div class="table-scroll">
      <table>
        <thead>
          <tr><th>COURSE</th><th>PERIOD</th><th>DURATION</th><th>STATUS</th><th>ACTION</th></tr>
        </thead>
        <tbody id="adminCourses">
          <tr><td colspan="5" class="empty">Loading courses…</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- Admin Holiday Management -->
  <section class="panel" id="admin-holidays-section">
    <div class="panel-head">
      <div>
        <h2>Holiday Management</h2>
        <p>Holidays suppress 9 AM attendance prompts and add 0 classes to totals.</p>
      </div>
      <span class="tag">SPARK FREE TIER</span>
    </div>
    <form id="addHolidayForm" class="form-grid">
      <div class="field">
        <label>Holiday Date (YYYY-MM-DD)</label>
        <input id="holidayDate" type="date" required value="${getKolkataDateString()}">
      </div>
      <div class="field">
        <label>Holiday Name / Reason</label>
        <input id="holidayName" placeholder="e.g. Diwali Vacation / Annual Fest" required maxlength="60">
      </div>
      <div class="field full-field">
        <button class="primary" type="submit">Schedule holiday ↗</button>
      </div>
    </form>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>DATE (IST)</th>
            <th>HOLIDAY NAME</th>
            <th>ACTION</th>
          </tr>
        </thead>
        <tbody id="adminHolidayTable">
          <tr><td colspan="3" class="empty">Loading holidays…</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- Admin Announcements -->
  <section class="panel" id="admin-announcements-section">
    <div class="panel-head">
      <div>
        <h2>Announcements & Broadcasts</h2>
        <p>Publish banners visible to all students on the dashboard.</p>
      </div>
    </div>
    <form id="addAnnouncementForm" class="form-grid">
      <div class="field">
        <label>Title</label>
        <input id="announcementTitle" placeholder="e.g. Midterm Exams Announced" required maxlength="100">
      </div>
      <div class="field">
        <label>Priority</label>
        <select id="announcementPriority">
          <option value="normal">Normal (Notice)</option>
          <option value="urgent">Urgent (Red Alert)</option>
        </select>
      </div>
      <div class="field full-field">
        <label>Message</label>
        <input id="announcementMessage" placeholder="Detailed message for students…" required maxlength="300">
      </div>
      <div class="field full-field">
        <button class="primary" type="submit">Publish announcement ↗</button>
      </div>
    </form>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>TITLE</th>
            <th>PRIORITY</th>
            <th>MESSAGE</th>
            <th>ACTION</th>
          </tr>
        </thead>
        <tbody id="adminAnnouncementTable">
          <tr><td colspan="4" class="empty">Loading announcements…</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- Admin User Directory -->
  <section class="panel table-panel" id="admin-users-section">
    <div class="panel-head">
      <div>
        <h2>User directory & account status</h2>
        <p>Native Firestore admin control (Works without Blaze Cloud Functions).</p>
      </div>
      <button class="ghost" id="refreshAdmin">Refresh directory</button>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>STUDENT</th>
            <th>USERNAME</th>
            <th>UID</th>
            <th>STATUS</th>
            <th>CONTROL</th>
          </tr>
        </thead>
        <tbody id="adminUsers">
          <tr><td colspan="5" class="empty">Loading directory…</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- Audit Logs -->
  <section class="panel table-panel" id="admin-audit-section">
    <div class="panel-head">
      <div>
        <h2>Recent audit events</h2>
        <p>Platform security log.</p>
      </div>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>ACTOR UID</th>
            <th>ACTION</th>
            <th>TIME</th>
          </tr>
        </thead>
        <tbody id="adminLogs">
          <tr><td colspan="3" class="empty">Loading audit logs…</td></tr>
        </tbody>
      </table>
    </div>
  </section>`;

  appRoot.innerHTML = shell("admin", body, "Administration");
  bindNav();

  async function loadAdminData() {
    try {
      const [uDirSnap, aSnap, holidaysSnap, announcementsSnap, logsSnap, coursesSnap, controlSnap, academicSettingsSnap] =
        await Promise.all([
          getDocs(collection(db, "userDirectory")),
          getDocs(collection(db, "attendance")),
          getDocs(collection(db, "holidays")),
          getDocs(collection(db, "announcements")),
          getDocs(query(collection(db, "auditLogs"), orderBy("createdAt", "desc"), limit(15))),
          getDocs(collection(db, "courses")),
          getDoc(doc(db, "courseControl", "active")),
          getDoc(doc(db, "academicSettings", "main"))
        ]);
      academicSettings = academicSettingsSnap.exists() ? academicSettingsSnap.data() : null;

      const users = uDirSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      const holidays = holidaysSnap.docs.map((d) => ({ date: d.id, ...d.data() }));
      const announcements = announcementsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const courses = coursesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const control = controlSnap.exists() ? controlSnap.data() : null;

      $("adminMetrics").innerHTML =
        metric("REGISTERED USERS", users.length, "Directory profiles", "♧") +
        metric("ATTENDANCE RECORDS", aSnap.size, "Saved student records", "◷") +
        metric("ACTIVE COURSE", control?.status === "active" ? esc(control.name) : "None", "One course at a time", "📚") +
        metric("80% MINIMUM", "Required", `${courses.length} course${courses.length === 1 ? "" : "s"} scheduled`, "✓");

      $("adminCourses").innerHTML = courses
        .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))
        .map((course) => {
          const isActive = control?.status === "active" && control.courseId === course.id;
          const expired = course.status === "scheduled" && course.endDate < getKolkataDateString();
          const canStart = course.status === "scheduled"
            && course.startDate <= getKolkataDateString()
            && course.endDate >= getKolkataDateString()
            && control?.status !== "active";
          const status = isActive ? "Active" : expired ? "Expired" : course.status;
          const action = isActive
            ? `<button class="ghost small-btn" data-complete-course="${esc(course.id)}">Complete course</button>`
            : canStart
              ? `<button class="primary small-btn" data-start-course="${esc(course.id)}">Start course</button>
                 <button class="ghost small-btn" data-delete-course="${esc(course.id)}">Cancel</button>`
              : course.status === "scheduled"
                ? `<span class="muted">${course.startDate > getKolkataDateString() ? "Starts later" : "Expired"}</span>
                   <button class="ghost small-btn" data-delete-course="${esc(course.id)}">Cancel</button>`
                : '<span class="muted">—</span>';
          return `<tr>
            <td><b>${esc(course.name)}</b></td>
            <td>${esc(course.startDate)} – ${esc(course.endDate)}</td>
            <td>${Number(course.durationDays)} days</td>
            <td><span class="status ${isActive ? "success" : expired ? "danger" : "neutral"}">${esc(status)}</span></td>
            <td>${action}</td>
          </tr>`;
        })
        .join("") || '<tr><td colspan="5" class="empty">No courses scheduled.</td></tr>';

      // Holidays Table
      $("adminHolidayTable").innerHTML =
        holidays
          .map(
            (h) => `<tr>
              <td><b>${esc(h.date)}</b></td>
              <td>${esc(h.name || h.title || "Holiday")}</td>
              <td><button class="ghost small-btn" data-delete-holiday="${esc(h.date)}">Delete</button></td>
            </tr>`
          )
          .join("") || '<tr><td colspan="3" class="empty">No holidays scheduled.</td></tr>';

      // Announcements Table
      $("adminAnnouncementTable").innerHTML =
        announcements
          .map(
            (a) => `<tr>
              <td><b>${esc(a.title)}</b></td>
              <td><span class="pill ${a.priority === "urgent" ? "red" : "amber"}">${esc(a.priority)}</span></td>
              <td>${esc(a.message)}</td>
              <td><button class="ghost small-btn" data-delete-announcement="${esc(a.id)}">Delete</button></td>
            </tr>`
          )
          .join("") || '<tr><td colspan="4" class="empty">No active announcements.</td></tr>';

      // Users Table
      const userRows = await Promise.all(
        users.map(async (u) => {
          let disabled = false;
          try {
            const userSnap = await getDoc(doc(db, "users", u.uid));
            if (userSnap.exists()) disabled = userSnap.data().disabled === true;
          } catch {}
          return `<tr>
            <td><b>${esc(u.displayName || "Student")}</b></td>
            <td>@${esc(u.username || "student")}</td>
            <td class="uid">${esc(u.uid)}</td>
            <td><span class="status ${disabled ? "danger" : "success"}">${disabled ? "Disabled" : "Active"}</span></td>
            <td><button class="ghost small-btn" data-toggle-user="${esc(u.uid)}" data-disabled="${disabled}">${disabled ? "Enable" : "Disable"}</button></td>
          </tr>`;
        })
      );

      $("adminUsers").innerHTML =
        userRows.join("") || '<tr><td colspan="5" class="empty">No users found.</td></tr>';

      // Audit logs
      $("adminLogs").innerHTML =
        logsSnap.docs
          .map((s) => {
            const x = s.data();
            return `<tr>
              <td class="uid">${esc(x.actorUid || "system")}</td>
              <td>${esc(x.action || "event")}</td>
              <td>${x.createdAt?.toDate ? x.createdAt.toDate().toLocaleString() : "—"}</td>
            </tr>`;
          })
          .join("") || '<tr><td colspan="3" class="empty">No audit events yet.</td></tr>';
    } catch (e) {
      toast("Admin data error: " + friendlyError(e));
    }
  }

  $("refreshAdmin")?.addEventListener("click", loadAdminData);

  $("adminAcademicSettingsForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const semesterStartDate = $("semesterStartDate").value;
    if (!semesterStartDate || semesterStartDate > getKolkataDateString()) {
      return toast("Semester start date must be today or earlier.");
    }

    const notificationSettings = {
      dailyEnabled: $("notifyDailyEnabled").checked,
      dailyTitle: $("notifyDailyTitle").value.trim(),
      dailyBody: $("notifyDailyBody").value.trim(),
      dailyTime: $("notifyDailyTime").value,
      thursdayEnabled: $("notifyThursdayEnabled").checked,
      thursdayTitle: $("notifyThursdayTitle").value.trim(),
      thursdayBody: $("notifyThursdayBody").value.trim(),
      thursdayTime: $("notifyThursdayTime").value,
      sundayEnabled: $("notifySundayEnabled").checked,
      sundayTitle: $("notifySundayTitle").value.trim(),
      sundayBody: $("notifySundayBody").value.trim(),
      sundayTime: $("notifySundayTime").value,
      loginEnabled: $("notifyLoginEnabled").checked,
      loginTitle: $("notifyLoginTitle").value.trim(),
      loginBody: $("notifyLoginBody").value.trim()
    };
    if (!notificationSettings.dailyTitle || !notificationSettings.dailyBody ||
        !notificationSettings.thursdayTitle || !notificationSettings.thursdayBody ||
        !notificationSettings.sundayTitle || !notificationSettings.sundayBody ||
        !notificationSettings.loginTitle || !notificationSettings.loginBody ||
        !notificationSettings.dailyTime || !notificationSettings.thursdayTime || !notificationSettings.sundayTime) {
      return toast("Complete every notification message and delivery time.");
    }

    try {
      await setDoc(doc(db, "academicSettings", "main"), {
        semesterStartDate,
        notificationSettings,
        updatedBy: currentUser.uid,
        updatedAt: serverTimestamp()
      });
      academicSettings = { semesterStartDate, notificationSettings };
      await addDoc(collection(db, "auditLogs"), {
        actorUid: currentUser.uid,
        action: "semester_and_notification_settings_updated",
        createdAt: serverTimestamp()
      });
      toast("Notification schedule and semester settings saved.");
    } catch (error) {
      toast(friendlyError(error));
    }
  });

  const updateNotificationPreview = () => {
    const title = $("notificationPreviewTitle");
    const body = $("notificationPreviewBody");
    if (!title || !body) return;
    title.textContent = $("notifyDailyTitle").value || "Notification title";
    body.textContent = $("notifyDailyBody").value || "Notification message";
  };
  ["notifyDailyTitle", "notifyDailyBody"].forEach((id) =>
    $(id)?.addEventListener("input", updateNotificationPreview)
  );

  const updateCourseDatePreview = () => {
    const preview = $("courseDatePreview");
    if (!preview) return;
    try {
      const endDate = getCourseEndDate(
        $("courseStartDate").value,
        Number($("courseDuration").value)
      );
      preview.textContent = `End date: ${endDate} (inclusive). Attendance target is fixed at ${COURSE_TARGET_PERCENTAGE}%.`;
    } catch (err) {
      preview.textContent = err.message;
    }
  };
  $("courseStartDate")?.addEventListener("change", updateCourseDatePreview);
  $("courseDuration")?.addEventListener("input", updateCourseDatePreview);
  updateCourseDatePreview();

  $("addCourseForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("courseName").value.trim();
    const startDate = $("courseStartDate").value;
    const durationDays = Number($("courseDuration").value);
    if (!name || name.length > 80) return toast("Course name must be between 1 and 80 characters.");
    if (startDate < getKolkataDateString()) return toast("Course start date cannot be in the past.");

    let endDate;
    try {
      endDate = getCourseEndDate(startDate, durationDays);
    } catch (err) {
      return toast(err.message);
    }

    try {
      const courseRef = doc(collection(db, "courses"));
      await setDoc(courseRef, {
        name,
        startDate,
        endDate,
        durationDays,
        attendanceTarget: COURSE_TARGET_PERCENTAGE,
        status: "scheduled",
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      await addDoc(collection(db, "auditLogs"), {
        actorUid: currentUser.uid,
        action: "course_scheduled",
        targetCourseId: courseRef.id,
        createdAt: serverTimestamp()
      });
      $("courseName").value = "";
      toast(`Course "${name}" scheduled for ${startDate} through ${endDate}.`);
      await loadAdminData();
    } catch (err) {
      toast(friendlyError(err));
    }
  });

  $("adminCourses")?.addEventListener("click", async (e) => {
    const startButton = e.target.closest("[data-start-course]");
    const completeButton = e.target.closest("[data-complete-course]");
    const deleteButton = e.target.closest("[data-delete-course]");
    const courseId = startButton?.dataset.startCourse
      || completeButton?.dataset.completeCourse
      || deleteButton?.dataset.deleteCourse;
    if (!courseId) return;

    const courseRef = doc(db, "courses", courseId);
    const controlRef = doc(db, "courseControl", "active");
    try {
      if (deleteButton) {
        if (!confirm("Cancel and remove this scheduled course?")) return;
        await deleteDoc(courseRef);
        await addDoc(collection(db, "auditLogs"), {
          actorUid: currentUser.uid,
          action: "course_cancelled",
          targetCourseId: courseId,
          createdAt: serverTimestamp()
        });
        toast("Scheduled course cancelled.");
        await loadAdminData();
        return;
      }

      await runTransaction(db, async (transaction) => {
        const [courseSnap, controlSnap] = await Promise.all([
          transaction.get(courseRef),
          transaction.get(controlRef)
        ]);
        if (!courseSnap.exists()) throw new Error("Course not found.");
        const course = courseSnap.data();
        const control = controlSnap.exists() ? controlSnap.data() : null;

        if (startButton) {
          if (course.status !== "scheduled") throw new Error("Only scheduled courses can be started.");
          if (control?.status === "active") throw new Error("Complete the active course before starting another.");
          const today = getKolkataDateString();
          if (today < course.startDate || today > course.endDate) {
            throw new Error("A course can only start during its scheduled date range.");
          }
          transaction.update(courseRef, { status: "active", updatedAt: serverTimestamp() });
          transaction.set(controlRef, {
            courseId,
            name: course.name,
            startDate: course.startDate,
            endDate: course.endDate,
            durationDays: course.durationDays,
            status: "active",
            updatedAt: serverTimestamp()
          });
        } else {
          if (course.status !== "active" || control?.courseId !== courseId) {
            throw new Error("Only the currently active course can be completed.");
          }
          transaction.update(courseRef, { status: "completed", updatedAt: serverTimestamp() });
          transaction.set(controlRef, {
            courseId: null,
            name: null,
            startDate: null,
            endDate: null,
            durationDays: null,
            status: "inactive",
            updatedAt: serverTimestamp()
          });
        }
      });
      await addDoc(collection(db, "auditLogs"), {
        actorUid: currentUser.uid,
        action: startButton ? "course_started" : "course_completed",
        targetCourseId: courseId,
        createdAt: serverTimestamp()
      });
      toast(startButton ? "Course started. Attendance is now open." : "Course completed.");
      await loadAdminData();
    } catch (err) {
      toast(friendlyError(err));
    }
  });

  // Add holiday handler
  $("addHolidayForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const date = $("holidayDate").value.trim();
    const name = $("holidayName").value.trim();
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) || !name) {
      return toast("Valid YYYY-MM-DD date and holiday name are required.");
    }
    try {
      await setDoc(doc(db, "holidays", date), {
        date,
        name,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });
      await addDoc(collection(db, "auditLogs"), {
        actorUid: currentUser.uid,
        action: `holiday_added_${date}`,
        createdAt: serverTimestamp()
      });
      toast(`Holiday on ${date} saved.`);
      $("holidayName").value = "";
      loadAdminData();
    } catch (err) {
      toast(friendlyError(err));
    }
  });

  // Delete holiday
  $("adminHolidayTable")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-delete-holiday]");
    if (!btn) return;
    const date = btn.dataset.deleteHoliday;
    if (!confirm(`Delete holiday on ${date}?`)) return;
    try {
      await deleteDoc(doc(db, "holidays", date));
      toast(`Holiday ${date} deleted.`);
      loadAdminData();
    } catch (err) {
      toast(friendlyError(err));
    }
  });

  // Add announcement handler
  $("addAnnouncementForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = $("announcementTitle").value.trim();
    const priority = $("announcementPriority").value;
    const message = $("announcementMessage").value.trim();
    if (!title || !message) return toast("Title and message are required.");
    try {
      await addDoc(collection(db, "announcements"), {
        title,
        priority,
        message,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });
      toast("Announcement posted.");
      $("announcementTitle").value = "";
      $("announcementMessage").value = "";
      loadAdminData();
    } catch (err) {
      toast(friendlyError(err));
    }
  });

  // Delete announcement
  $("adminAnnouncementTable")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-delete-announcement]");
    if (!btn) return;
    const id = btn.dataset.deleteAnnouncement;
    if (!confirm("Delete this announcement?")) return;
    try {
      await deleteDoc(doc(db, "announcements", id));
      toast("Announcement deleted.");
      loadAdminData();
    } catch (err) {
      toast(friendlyError(err));
    }
  });

  // Toggle user disabled
  $("adminUsers")?.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-toggle-user]");
    if (!b) return;
    const uid = b.dataset.toggleUser;
    const disabled = b.dataset.disabled !== "true";
    if (uid === currentUser.uid && disabled) {
      return toast("You cannot disable your own administrator account.");
    }
    if (!confirm(`${disabled ? "Disable" : "Enable"} this account?`)) return;
    try {
      await updateDoc(doc(db, "users", uid), { disabled });
      await addDoc(collection(db, "auditLogs"), {
        actorUid: currentUser.uid,
        action: disabled ? "user_disabled" : "user_enabled",
        targetUid: uid,
        createdAt: serverTimestamp()
      });
      toast("User account status updated.");
      loadAdminData();
    } catch (err) {
      toast(friendlyError(err));
    }
  });

  await loadAdminData();
}

async function handleActionQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get("action");
  const date = params.get("date") || getKolkataDateString();

  if (!currentUser || !action) return;

  // Clean the URL query params without reloading
  window.history.replaceState({}, document.title, window.location.pathname);

  if (action === "attend") {
    toast("Evaluating 500m campus geofence from push action…");
    const locSignal = await getCurrentLocationSignal();
    try {
      await recordDailyAttendance({
        uid: currentUser.uid,
        dateString: date,
        status: "attended",
        locationStatus: locSignal.status,
        source: "notification_action"
      });
      toast(`Marked ATTENDED for ${date}! (${locSignal.reason})`);
      recentRecords = await getRecentDailyRecords(currentUser.uid, 60);
      for (const r of recentRecords) allDailyRecordsMap[r.date || r.id] = r;
      refreshCurrentRoute();
    } catch (err) {
      toast(friendlyError(err));
    }
  } else if (action === "absent") {
    try {
      await recordDailyAttendance({
        uid: currentUser.uid,
        dateString: date,
        status: "absent",
        locationStatus: "outside",
        source: "notification_action"
      });
      toast(`Marked ABSENT for ${date}.`);
      recentRecords = await getRecentDailyRecords(currentUser.uid, 60);
      for (const r of recentRecords) allDailyRecordsMap[r.date || r.id] = r;
      refreshCurrentRoute();
    } catch (err) {
      toast(friendlyError(err));
    }
  } else if (action === "prompt") {
    toast(`Please mark attendance for today (${date}).`);
  }
}

async function renderRoute() {
  if (!currentUser) {
    if (path() === "/signup") authView("signup");
    else authView("login");
    return;
  }

  if (path() === "/login" || path() === "/signup") {
    go("/");
    return;
  }

  if (path() === "/calc") {
    calcView();
    return;
  }

  if (path() === "/calendar") {
    calendarView();
    return;
  }

  if (path() === "/timetable") {
    timetableView();
    return;
  }

  if (path() === "/friends") {
    await renderFriends();
    return;
  }

  if (path() === "/reports") {
    reportsView();
    return;
  }

  if (path() === "/settings") {
    await settingsView();
    return;
  }

  if (path() === "/admin") {
    if (!currentUser.isAdmin) {
      appRoot.innerHTML = shell(
        "home",
        `<section class="panel formpanel">
          <h2>Access restricted</h2>
          <p class="muted">This account does not have verified administrator privileges (admin custom claim required).</p>
          <a class="inline-link" href="/" data-nav="/">Return to dashboard →</a>
        </section>`,
        "Restricted"
      );
      bindNav();
      return;
    }
    await adminView();
    return;
  }

  homeView();
}

// Register service worker for offline PWA support
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

onAuthStateChanged(auth, async (user) => {
  cleanListeners();
  signInNoticePending = Boolean(user);
  currentUser = user;
  if (!user) {
    profile = null;
    renderRoute();
    return;
  }
  try {
    await loadProfile(user);
    if (profile.disabled) {
      await signOut(auth);
      return toast("This account has been disabled. Contact an administrator.");
    }
    startDashboardListeners();
    renderRoute();
    await handleActionQueryParams();
  } catch (e) {
    toast("Could not load your profile: " + friendlyError(e));
  }
});
