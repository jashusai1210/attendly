import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getKolkataDateString,
  calculateAttendanceTransition
} from "../src/attendance.js";

describe("Attendance Engine - One Class Per Day & Asia/Kolkata Date", () => {
  it("formats Asia/Kolkata dates in YYYY-MM-DD correctly across UTC midnight boundaries", () => {
    // 2026-11-18 19:00:00 UTC is 2026-11-19 00:30:00 IST (+5:30)
    const d1 = new Date("2026-11-18T19:00:00Z");
    assert.equal(getKolkataDateString(d1), "2026-11-19");

    // 2026-11-18 18:00:00 UTC is 2026-11-18 23:30:00 IST (+5:30)
    const d2 = new Date("2026-11-18T18:00:00Z");
    assert.equal(getKolkataDateString(d2), "2026-11-18");
  });

  it("first record ATTEND adds 1 total class and 1 attended class", () => {
    const res = calculateAttendanceTransition({
      currentAggregate: { totalClasses: 50, attendedClasses: 42, targetPercentage: 85 },
      existingDailyRecord: null,
      newStatus: "attended",
      isHoliday: false
    });

    assert.equal(res.totalClasses, 51);
    assert.equal(res.attendedClasses, 43);
    assert.equal(res.isNewDay, true);
    assert.equal(res.isCorrection, false);
  });

  it("first record ABSENT adds 1 total class and 0 attended classes", () => {
    const res = calculateAttendanceTransition({
      currentAggregate: { totalClasses: 50, attendedClasses: 42, targetPercentage: 85 },
      existingDailyRecord: null,
      newStatus: "absent",
      isHoliday: false
    });

    assert.equal(res.totalClasses, 51);
    assert.equal(res.attendedClasses, 42);
    assert.equal(res.isNewDay, true);
    assert.equal(res.isCorrection, false);
  });

  it("correcting ABSENT to ATTEND updates attended count but NEVER adds a second class to total", () => {
    const res = calculateAttendanceTransition({
      currentAggregate: { totalClasses: 51, attendedClasses: 42, targetPercentage: 85 },
      existingDailyRecord: { status: "absent" },
      newStatus: "attended",
      isHoliday: false
    });

    assert.equal(res.totalClasses, 51, "Total classes must NOT increase on correction!");
    assert.equal(res.attendedClasses, 43);
    assert.equal(res.isCorrection, true);
    assert.equal(res.isNewDay, false);
  });

  it("correcting ATTEND to ABSENT decreases attended count but NEVER adds a second class to total", () => {
    const res = calculateAttendanceTransition({
      currentAggregate: { totalClasses: 51, attendedClasses: 43, targetPercentage: 85 },
      existingDailyRecord: { status: "attended" },
      newStatus: "absent",
      isHoliday: false
    });

    assert.equal(res.totalClasses, 51, "Total classes must NOT increase on correction!");
    assert.equal(res.attendedClasses, 42);
    assert.equal(res.isCorrection, true);
    assert.equal(res.isNewDay, false);
  });

  it("submitting the exact same status repeatedly is idempotent (no duplicates)", () => {
    const res = calculateAttendanceTransition({
      currentAggregate: { totalClasses: 51, attendedClasses: 43, targetPercentage: 85 },
      existingDailyRecord: { status: "attended" },
      newStatus: "attended",
      isHoliday: false
    });

    assert.equal(res.totalClasses, 51);
    assert.equal(res.attendedClasses, 43);
    assert.equal(res.isCorrection, false);
    assert.equal(res.isNewDay, false);
  });

  it("rejects marking attendance when today is an admin holiday", () => {
    assert.throws(
      () =>
        calculateAttendanceTransition({
          currentAggregate: { totalClasses: 50, attendedClasses: 42, targetPercentage: 85 },
          existingDailyRecord: null,
          newStatus: "attended",
          isHoliday: true
        }),
      /official holiday/i
    );
  });

  it("rejects invalid status types", () => {
    assert.throws(
      () =>
        calculateAttendanceTransition({
          currentAggregate: { totalClasses: 50, attendedClasses: 42, targetPercentage: 85 },
          existingDailyRecord: null,
          newStatus: "half-day",
          isHoliday: false
        }),
      /invalid status/i
    );
  });
});
