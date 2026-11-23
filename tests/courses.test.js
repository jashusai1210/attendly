import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COURSE_TARGET_PERCENTAGE,
  getCourseEndDate,
  countWorkingDays,
  getStartDateForWorkingDayCount,
  isCourseInPeriod
} from "../src/courses.js";

describe("Course periods and attendance target", () => {
  it("uses an inclusive end date for a ten-day course", () => {
    assert.equal(getCourseEndDate("2026-11-19", 10), "2026-11-28");
  });

  it("handles month and leap-year boundaries", () => {
    assert.equal(getCourseEndDate("2024-02-27", 4), "2024-03-01");
  });

  it("counts working days inclusively while skipping weekends and configured holidays", () => {
    assert.equal(countWorkingDays("2026-11-16", "2026-11-23", ["2026-11-19"]), 5);
    assert.equal(countWorkingDays("2026-11-21", "2026-11-22"), 0);
    assert.equal(countWorkingDays("2026-11-23", "2026-11-20"), 0);
  });

  it("calculates a start date for a known number of working days through today", () => {
    const startDate = getStartDateForWorkingDayCount("2026-11-19", 50);
    assert.equal(countWorkingDays(startDate, "2026-11-19"), 50);
  });

  it("rejects invalid dates and durations", () => {
    assert.throws(() => getCourseEndDate("2026-02-30", 10), /valid YYYY-MM-DD/i);
    assert.throws(() => getCourseEndDate("2026-11-19", 0), /duration/i);
    assert.throws(() => getCourseEndDate("2026-11-19", 366), /duration/i);
  });

  it("enforces the fixed course minimum attendance target", () => {
    assert.equal(COURSE_TARGET_PERCENTAGE, 80);
  });

  it("allows attendance only for the active course and within its inclusive period", () => {
    const course = {
      status: "active",
      startDate: "2026-11-19",
      endDate: "2026-11-27"
    };

    assert.equal(isCourseInPeriod(course, "2026-11-19"), true);
    assert.equal(isCourseInPeriod(course, "2026-11-27"), true);
    assert.equal(isCourseInPeriod(course, "2026-11-18"), false);
    assert.equal(isCourseInPeriod(course, "2026-11-28"), false);
    assert.equal(isCourseInPeriod(course, "2026-11-21"), false);
    assert.equal(isCourseInPeriod({ ...course, status: "scheduled" }, "2026-11-20"), false);
    assert.equal(isCourseInPeriod(course, "2026-02-30"), false);
  });
});
