import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isWeekend,
  isCollegeDay,
  calculateAttendanceStreak,
  getNextCollegeDay,
  generateAttendanceCsv,
  hasTimetableConflict,
  isValidCalendarDate
} from "../src/pwa-features.js";

describe("PWA Features — Working Days, Streaks, Timetable & Exports", () => {
  it("identifies Saturday and Sunday as weekends", () => {
    // 2026-11-21 is Saturday, 2026-11-22 is Sunday, 2026-11-20 is Friday
    assert.equal(isWeekend("2026-11-21"), true);
    assert.equal(isWeekend("2026-11-22"), true);
    assert.equal(isWeekend("2026-11-20"), false);
    assert.equal(isWeekend("2026-11-23"), false); // Monday
  });

  it("identifies college days considering weekends and declared holidays", () => {
    const holidays = { "2026-11-20": { name: "Diwali" } };
    assert.equal(isCollegeDay("2026-11-19", holidays), true); // Thursday
    assert.equal(isCollegeDay("2026-11-20", holidays), false); // Friday Holiday
    assert.equal(isCollegeDay("2026-11-21", holidays), false); // Saturday Weekend
  });

  it("calculates attendance streak across weekends and holidays without breaking", () => {
    // Suppose Monday (2026-11-16), Tuesday (2026-11-17), Wednesday (2026-11-18) were attended
    const records = {
      "2026-11-16": { status: "attended" },
      "2026-11-17": { status: "attended" },
      "2026-11-18": { status: "attended" }
    };
    const streak = calculateAttendanceStreak(records, {}, "2026-11-18");
    assert.equal(streak, 3);
  });

  it("skips weekend without breaking streak", () => {
    // Friday (2026-11-20) attended, Sat & Sun are weekends, Monday (2026-11-23) attended
    const records = {
      "2026-11-20": { status: "attended" },
      "2026-11-23": { status: "attended" }
    };
    const streak = calculateAttendanceStreak(records, {}, "2026-11-23");
    assert.equal(streak, 2);
  });

  it("calculates next college day skipping weekends and holidays", () => {
    // Starting on Friday 2026-11-20 with Monday 2026-11-23 as a holiday
    const holidays = { "2026-11-23": { name: "Holiday" } };
    const nextDay = getNextCollegeDay(holidays, new Date("2026-11-21T12:00:00Z")); // Saturday
    // Sat (21) -> Sun (22) -> Mon (23 holiday) -> Tue (24)
    assert.equal(nextDay, "2026-11-24");
  });

  it("validates real calendar dates, including leap days", () => {
    assert.equal(isValidCalendarDate("2028-02-29"), true);
    assert.equal(isValidCalendarDate("2027-02-29"), false);
    assert.equal(isValidCalendarDate("2026-13-01"), false);
  });

  it("detects overlapping timetable slots but allows back-to-back classes", () => {
    const timetable = [{ day: "Monday", time: "09:00", endTime: "10:00" }];
    assert.equal(hasTimetableConflict(timetable, "Monday", "09:30", "10:30"), true);
    assert.equal(hasTimetableConflict(timetable, "Monday", "10:00", "11:00"), false);
    assert.equal(hasTimetableConflict(timetable, "Tuesday", "09:30", "10:30"), false);
  });

  it("treats legacy timetable entries as one-hour classes", () => {
    const timetable = [{ day: "Wednesday", time: "11:00" }];
    assert.equal(hasTimetableConflict(timetable, "Wednesday", "11:45", "12:15"), true);
    assert.equal(hasTimetableConflict(timetable, "Wednesday", "12:00", "13:00"), false);
  });

  it("generates well-formed CSV export string", () => {
    const csv = generateAttendanceCsv({
      profile: { displayName: "Jashu", username: "jashu" },
      attendance: { totalClasses: 50, attendedClasses: 45, targetPercentage: 80, courseName: "HTML and CSS" },
      dailyRecords: [
        { date: "2026-11-18", courseName: "HTML and CSS", status: "attended", locationStatus: "inside", source: "web" }
      ]
    });

    assert.ok(csv.includes("ATTENDLY Attendance Report"));
    assert.ok(csv.includes("Jashu"));
    assert.ok(csv.includes("HTML and CSS"));
    assert.ok(csv.includes("80%"));
    assert.ok(csv.includes("2026-11-18"));
    assert.ok(csv.includes("ATTENDED"));
    assert.ok(csv.includes("inside"));
  });
});
