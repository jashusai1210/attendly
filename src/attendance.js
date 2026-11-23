/**
 * ATTENDLY — Attendance Engine & One-Class-Per-Day Tracker
 *
 * Rules:
 * - Exactly one class per day.
 * - Timezone: Asia/Kolkata (IST).
 * - Per-day record at attendance/{uid}/daily/{YYYY-MM-DD}.
 * - ATTEND adds 1 total and 1 attended.
 * - ABSENT adds 1 total and 0 attended.
 * - Correction updates the same record and NEVER adds a second class.
 * - Admin holidays add 0 classes and suppress prompt/submission.
 * - Active-course records and per-course 80% summaries are maintained atomically.
 * - Aggregate document maintained at attendance/{uid}.
 */

import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  collection,
  query,
  orderBy,
  limit,
  getDocs
} from "firebase/firestore";
import { db } from "./firebase.js";
import { COURSE_TARGET_PERCENTAGE, isCourseInPeriod } from "./courses.js";

/**
 * Returns the current (or given) date string formatted as YYYY-MM-DD in Asia/Kolkata (IST).
 * Always consistent regardless of client local machine time zone.
 */
export function getKolkataDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

/**
 * Pure function to calculate attendance state transitions.
 * Guaranteed to be idempotent and transaction-safe.
 */
export function calculateAttendanceTransition({
  currentAggregate,     // { totalClasses, attendedClasses, targetPercentage }
  existingDailyRecord,  // { status: 'attended' | 'absent' } or null
  newStatus,            // 'attended' | 'absent'
  isHoliday = false
}) {
  if (isHoliday) {
    throw new Error("Today is an official holiday. Attendance cannot be marked.");
  }

  if (newStatus !== "attended" && newStatus !== "absent") {
    throw new Error("Invalid status. Expected 'attended' or 'absent'.");
  }

  const currentTotal = Number.isInteger(currentAggregate?.totalClasses)
    ? currentAggregate.totalClasses
    : 0;
  const currentAttended = Number.isInteger(currentAggregate?.attendedClasses)
    ? currentAggregate.attendedClasses
    : 0;
  const targetPercentage = currentAggregate?.targetPercentage || 85;

  let totalClasses = currentTotal;
  let attendedClasses = currentAttended;
  let isCorrection = false;
  let isNewDay = false;

  if (!existingDailyRecord) {
    // New class recorded for this day
    isNewDay = true;
    totalClasses = currentTotal + 1;
    attendedClasses = currentAttended + (newStatus === "attended" ? 1 : 0);
  } else if (existingDailyRecord.status !== newStatus) {
    // Correction on an already recorded day!
    // Must update the existing class without adding a second class!
    isCorrection = true;
    totalClasses = currentTotal; // Never increase total on correction!
    if (newStatus === "attended" && existingDailyRecord.status === "absent") {
      attendedClasses = Math.min(totalClasses, currentAttended + 1);
    } else if (newStatus === "absent" && existingDailyRecord.status === "attended") {
      attendedClasses = Math.max(0, currentAttended - 1);
    }
  } else {
    // Idempotent resubmission of the exact same status:
    // Totals remain unchanged.
  }

  return {
    totalClasses,
    attendedClasses,
    targetPercentage,
    isNewDay,
    isCorrection,
    percentage: totalClasses > 0 ? (attendedClasses / totalClasses) * 100 : 0
  };
}

/**
 * Check if a date is an admin holiday in Firestore.
 */
export async function checkIsHoliday(dateString) {
  try {
    const holidayRef = doc(db, "holidays", dateString);
    const snap = await getDoc(holidayRef);
    if (snap.exists()) {
      return { isHoliday: true, holiday: snap.data() };
    }
  } catch (err) {
    console.warn("Could not check holiday status:", err);
  }
  return { isHoliday: false, holiday: null };
}

/**
 * Record or correct daily attendance for a user within a Firestore transaction.
 *
 * @param {Object} params
 * @param {string} params.uid - User UID
 * @param {string} [params.dateString] - YYYY-MM-DD in Asia/Kolkata (defaults to today)
 * @param {'attended'|'absent'} params.status - Status to record
 * @param {'inside'|'outside'|'unknown'} [params.locationStatus='unknown']
 * @param {string} [params.source='web'] - 'web' | 'notification' | 'action'
 * @param {string} [params.courseId] - Must match the currently active course
 * @returns {Promise<Object>} Updated aggregate attendance state
 */
export async function recordDailyAttendance({
  uid,
  dateString = getKolkataDateString(),
  status,
  locationStatus = "unknown",
  source = "web",
  courseId
}) {
  if (!uid) throw new Error("User UID is required to record attendance.");

  // 1. Check holiday status
  const { isHoliday, holiday } = await checkIsHoliday(dateString);
  if (isHoliday) {
    throw new Error(`Cannot mark attendance: ${dateString} is a scheduled holiday (${holiday?.name || holiday?.title || "College Holiday"}).`);
  }

  const aggregateRef = doc(db, "attendance", uid);
  const dailyRef = doc(db, "attendance", uid, "daily", dateString);
  const activeCourseRef = doc(db, "courseControl", "active");

  return await runTransaction(db, async (tx) => {
    const activeCourseSnap = await tx.get(activeCourseRef);
    const activeCourseId = activeCourseSnap.exists() ? activeCourseSnap.data().courseId : null;
    if (!activeCourseId || (courseId && courseId !== activeCourseId)) {
      throw new Error("There is no active course for attendance right now.");
    }

    const courseRef = doc(db, "courses", activeCourseId);
    const [courseSnap, aggregateSnap, dailySnap] = await Promise.all([
      tx.get(courseRef),
      tx.get(aggregateRef),
      tx.get(dailyRef)
    ]);

    if (!courseSnap.exists()) {
      throw new Error("The active course could not be found. Contact an administrator.");
    }

    const course = courseSnap.data();
    if (!isCourseInPeriod(course, dateString)) {
      throw new Error("Attendance can only be marked during the active course period.");
    }

    const currentAggregate = aggregateSnap.exists() ? aggregateSnap.data() : null;
    const existingDaily = dailySnap.exists() ? dailySnap.data() : null;
    if (existingDaily && existingDaily.courseId !== activeCourseId) {
      throw new Error("A class is already recorded for another course today.");
    }

    const result = calculateAttendanceTransition({
      currentAggregate,
      existingDailyRecord: existingDaily,
      newStatus: status,
      isHoliday: false
    });

    const courseAggregate = currentAggregate?.courseStats?.[activeCourseId] || null;
    const courseResult = calculateAttendanceTransition({
      currentAggregate: {
        ...courseAggregate,
        targetPercentage: COURSE_TARGET_PERCENTAGE
      },
      existingDailyRecord: existingDaily,
      newStatus: status,
      isHoliday: false
    });

    // Write daily record
    tx.set(
      dailyRef,
      {
        date: dateString,
        courseId: activeCourseId,
        courseName: course.name,
        status,
        locationStatus,
        source,
        updatedAt: serverTimestamp(),
        createdAt: existingDaily?.createdAt || serverTimestamp()
      },
      { merge: true }
    );

    // Write aggregate summary
    const aggregateData = {
      uid,
      totalClasses: result.totalClasses,
      attendedClasses: result.attendedClasses,
      targetPercentage: result.targetPercentage,
      lastDate: dateString,
      lastStatus: status,
      lastLocationStatus: locationStatus,
      courseStats: {
        ...(currentAggregate?.courseStats || {}),
        [activeCourseId]: {
          totalClasses: courseResult.totalClasses,
          attendedClasses: courseResult.attendedClasses,
          targetPercentage: COURSE_TARGET_PERCENTAGE,
          lastStatus: status,
          lastLocationStatus: locationStatus
        }
      },
      updatedAt: serverTimestamp()
    };
    tx.set(aggregateRef, aggregateData, { merge: true });

    return {
      ...result,
      courseResult,
      courseId: activeCourseId,
      dateString,
      status,
      locationStatus
    };
  });
}

/**
 * Fetch the last N daily attendance records for a user.
 */
export async function getRecentDailyRecords(uid, count = 7) {
  try {
    const dailyColl = collection(db, "attendance", uid, "daily");
    const q = query(dailyColl, orderBy("date", "desc"), limit(count));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
  } catch (err) {
    console.warn("Could not fetch recent daily records:", err);
    return [];
  }
}
