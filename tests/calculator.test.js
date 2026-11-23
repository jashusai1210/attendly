import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateAttendanceKarma,
  chooseRoast,
  TENGLISH_ROASTS
} from "../src/calculator.js";

describe("Calculator — Karma Math & Savage Tenglish Roasts", () => {
  it("calculates accurate attendance percentage and needed classes", () => {
    // 78 attended out of 100, target 85%
    // Needed: ceil((0.85*100 - 78) / (1 - 0.85)) = ceil(7 / 0.15) = 47
    const res = calculateAttendanceKarma({ total: 100, attended: 78, targetPercent: 85 });
    assert.equal(res.percentage, 78);
    assert.equal(res.classesNeeded, 47);
    assert.equal(res.bunkable, 0);
    assert.equal(res.isSafe, false);
    assert.match(res.explanation, /next 47 consecutive classes/i);
  });

  it("calculates accurate bunkable classes when target is reached", () => {
    // 90 attended out of 100, target 85%
    // Bunkable: floor(90 / 0.85 - 100) = floor(105.88 - 100) = 5
    const res = calculateAttendanceKarma({ total: 100, attended: 90, targetPercent: 85 });
    assert.equal(res.percentage, 90);
    assert.equal(res.classesNeeded, 0);
    assert.equal(res.bunkable, 5);
    assert.equal(res.isSafe, true);
    assert.match(res.explanation, /next 5 future classes/i);
  });

  it("handles 100% target edge case correctly (returns Infinity when attended < total)", () => {
    const res = calculateAttendanceKarma({ total: 100, attended: 99, targetPercent: 100 });
    assert.equal(res.percentage, 99);
    assert.equal(res.classesNeeded, Infinity);
    assert.equal(res.bunkable, 0);
    assert.equal(res.isSafe, false);
    assert.match(res.explanation, /previous absences/i);
  });

  it("handles 100% target when 100% is currently maintained", () => {
    const res = calculateAttendanceKarma({ total: 50, attended: 50, targetPercent: 100 });
    assert.equal(res.percentage, 100);
    assert.equal(res.classesNeeded, 0);
    assert.equal(res.bunkable, 0);
    assert.equal(res.isSafe, true);
  });

  it("throws clear errors on invalid inputs", () => {
    // Empty/zero total
    assert.throws(() => calculateAttendanceKarma({ total: 0, attended: 0, targetPercent: 85 }), /at least 1/i);
    // Attended > total
    assert.throws(() => calculateAttendanceKarma({ total: 50, attended: 55, targetPercent: 85 }), /champaku/i);
    // Negative numbers
    assert.throws(() => calculateAttendanceKarma({ total: 50, attended: -5, targetPercent: 85 }), /champaku/i);
    // Decimals / non-integers
    assert.throws(() => calculateAttendanceKarma({ total: 50.5, attended: 20, targetPercent: 85 }), /whole numbers/i);
  });

  it("contains the expanded set of Tenglish roasts (89 entries)", () => {
    assert.equal(TENGLISH_ROASTS.length, 89);
  });

  it("has roasts covering all percentage ranges including 100%", () => {
    const brackets = [
      { min: 0, max: 39.99 },
      { min: 40, max: 59.99 },
      { min: 60, max: 69.99 },
      { min: 70, max: 74.99 },
      { min: 75, max: 84.99 },
      { min: 85, max: 89.99 },
      { min: 90, max: 99.99 },
      { min: 100, max: 100 }
    ];

    for (const b of brackets) {
      const match = TENGLISH_ROASTS.filter((r) => r.min === b.min && r.max === b.max);
      assert.ok(match.length > 0, `Bracket ${b.min}-${b.max} must have roasts`);
    }
  });

  it("chooseRoast returns a valid roast from the matching bracket", () => {
    const roastLow = chooseRoast(25);
    assert.ok(typeof roastLow.text === "string" && roastLow.text.length > 5);
    assert.ok(roastLow.index >= 0 && roastLow.index < TENGLISH_ROASTS.length);

    const roast100 = chooseRoast(100);
    assert.ok(
      roast100.text.includes("watchman") ||
      roast100.text.includes("rent") ||
      roast100.text.includes("Principal") ||
      roast100.text.includes("permanent staff") ||
      roast100.text.includes("lights off") ||
      roast100.text.includes("darshanam")
    );
  });
});
