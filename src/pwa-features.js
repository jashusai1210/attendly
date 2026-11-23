/**
 * ATTENDLY — PWA Features: Calendar, Streak, Timetable & Data Exports
 *
 * Requirements:
 * - Monday–Friday working-day calendar logic; Saturday/Sunday are weekends.
 * - Daily self-report streak count and next college day calculation.
 * - Weekly timetable management (Monday to Friday).
 * - CSV export and Print-to-PDF.
 */

import { getKolkataDateString } from "./attendance.js";

export function isValidCalendarDate(dateString) {
  if (typeof dateString !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return false;
  }
  const date = new Date(`${dateString}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === dateString;
}

export function hasTimetableConflict(timetable, day, startTime, endTime) {
  const toMinutes = (time) => {
    if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      throw new Error("Timetable times must use valid 24-hour HH:MM values.");
    }
    return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  };
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  return timetable.some((item) => {
    if (item.day !== day) return false;
    const itemStart = toMinutes(item.time);
    const itemEnd = item.endTime ? toMinutes(item.endTime) : itemStart + 60;
    return start < itemEnd && end > itemStart;
  });
}

/**
 * Check if a date string (YYYY-MM-DD) falls on a weekend (Saturday or Sunday).
 */
export function isWeekend(dateString) {
  const [y, m, d] = dateString.split("-").map(Number);
  const day = new Date(y, m - 1, d, 12, 0, 0).getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

/**
 * Check if a date string is an active working college day (not weekend, not holiday).
 */
export function isCollegeDay(dateString, holidaysMap = {}) {
  if (isWeekend(dateString)) return false;
  if (holidaysMap && holidaysMap[dateString]) return false;
  return true;
}

/**
 * Calculate the student's consecutive attendance streak.
 * Automatically skips weekends and declared holidays.
 *
 * @param {Object} dailyRecords - Map of { [dateString]: { status: 'attended'|'absent' } }
 * @param {Object} holidaysMap - Map of { [dateString]: { name: string } }
 * @param {string} [todayStr=getKolkataDateString()]
 * @returns {number} Consecutive attended days
 */
export function calculateAttendanceStreak(dailyRecords = {}, holidaysMap = {}, todayStr = getKolkataDateString()) {
  let streak = 0;
  const [y, m, d] = todayStr.split("-").map(Number);
  let cur = new Date(y, m - 1, d, 12, 0, 0);

  // If today hasn't been marked yet, evaluate starting from previous day
  if (!dailyRecords[todayStr]) {
    cur.setDate(cur.getDate() - 1);
  }

  for (let i = 0; i < 365; i++) {
    const s = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;

    // Skip weekends and holidays without breaking streak
    if (!isCollegeDay(s, holidaysMap)) {
      cur.setDate(cur.getDate() - 1);
      continue;
    }

    const rec = dailyRecords[s];
    if (rec && rec.status === "attended") {
      streak++;
      cur.setDate(cur.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Find the next upcoming working college day.
 */
export function getNextCollegeDay(holidaysMap = {}, fromDate = new Date()) {
  const cur = new Date(fromDate);
  cur.setHours(12, 0, 0, 0);

  for (let i = 0; i < 14; i++) {
    const s = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    if (isCollegeDay(s, holidaysMap)) {
      return s;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return null;
}

/**
 * Generate CSV export of attendance totals and daily history.
 */
export function generateAttendanceCsv({ profile, attendance, dailyRecords = [] }) {
  const rows = [
    ["ATTENDLY Attendance Report"],
    ["Generated At", new Date().toLocaleString()],
    ["Student Name", profile?.displayName || "Student"],
    ["Username", `@${profile?.username || "student"}`],
    ...(attendance?.courseName ? [["Course", attendance.courseName]] : []),
    [],
    ["Total Working Classes", attendance?.totalClasses ?? 0],
    ["Attended Classes", attendance?.attendedClasses ?? 0],
    ["Current Percentage", attendance?.totalClasses ? `${((attendance.attendedClasses / attendance.totalClasses) * 100).toFixed(2)}%` : "0%"],
    ["Target Threshold", `${attendance?.targetPercentage ?? 80}%`],
    [],
    ["Date (IST)", "Course", "Status", "Campus Geofence (500m)", "Source"]
  ];

  for (const r of dailyRecords) {
    rows.push([
      r.date || r.id,
      r.courseName || "",
      (r.status || "").toUpperCase(),
      r.locationStatus || "unknown",
      r.source || "web"
    ]);
  }

  return rows
    .map((row) =>
      row
        .map((val) => `"${String(val ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\r\n");
}

/**
 * Trigger browser file download.
 */
export function downloadFile(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
