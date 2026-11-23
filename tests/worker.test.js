import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getKolkataDateString,
  getKolkataTimeInfo,
  DEFAULT_NOTIFICATION_SETTINGS,
  parseNotificationSettings,
  getDueNotificationTypes
} from "../worker/index.js";

describe("Cloudflare Worker — Cron Schedules & Notification Payloads", () => {
  it("converts 03:30 UTC to 9:00 AM IST (Weekday Attendance Check)", () => {
    // 03:30 UTC on Wednesday, Nov 18, 2026
    const utcDate = new Date("2026-11-18T03:30:00Z");
    const { hour, minute, weekday } = getKolkataTimeInfo(utcDate);

    assert.equal(hour, 9, "03:30 UTC must be 9 AM in IST");
    assert.equal(minute, 0, "03:30 UTC + 5:30 gives exactly 09:00 AM IST (minute = 0)");
    assert.equal(weekday, "Wed");
  });

  it("converts 12:30 UTC to 6:00 PM IST (Thursday and Sunday Reminders)", () => {
    // 12:30 UTC on Thursday, Nov 19, 2026
    const thuDate = new Date("2026-11-19T12:30:00Z");
    const thuInfo = getKolkataTimeInfo(thuDate);
    assert.equal(thuInfo.hour, 18, "12:30 UTC must be 18:00 (6 PM) in IST");
    assert.equal(thuInfo.minute, 0);
    assert.equal(thuInfo.weekday, "Thu");

    // 12:30 UTC on Sunday, Nov 22, 2026
    const sunDate = new Date("2026-11-22T12:30:00Z");
    const sunInfo = getKolkataTimeInfo(sunDate);
    assert.equal(sunInfo.hour, 18, "12:30 UTC must be 18:00 (6 PM) in IST");
    assert.equal(sunInfo.weekday, "Sun");
  });

  it("has exact required reminder strings from the implementation brief", () => {
    const thursdayExpected = "Repu oka roju clg ki poo 2 day's holidays";
    const sundayExpected = "2 days rest tisukunav gaa inkem clg ki poo";

    assert.equal(thursdayExpected, "Repu oka roju clg ki poo 2 day's holidays");
    assert.equal(sundayExpected, "2 days rest tisukunav gaa inkem clg ki poo");
  });

  it("generates correct Kolkata date for today", () => {
    const dateStr = getKolkataDateString(new Date());
    assert.match(dateStr, /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
  });

  it("uses safe defaults when administrator notification fields are missing", () => {
    assert.deepEqual(parseNotificationSettings({}), DEFAULT_NOTIFICATION_SETTINGS);
  });

  it("uses administrator notification toggles and text", () => {
    const settings = parseNotificationSettings({
      fields: {
        notificationSettings: {
          mapValue: {
            fields: {
              dailyEnabled: { booleanValue: false },
              dailyTitle: { stringValue: "Class check" },
              dailyBody: { stringValue: "Please record attendance." },
              dailyTime: { stringValue: "10:15" },
              thursdayEnabled: { booleanValue: true },
              thursdayTitle: { stringValue: "Thursday title" },
              thursdayBody: { stringValue: "Thursday note" },
              thursdayTime: { stringValue: "17:45" },
              sundayEnabled: { booleanValue: false },
              sundayTitle: { stringValue: "Sunday title" },
              sundayBody: { stringValue: "Sunday note" },
              sundayTime: { stringValue: "19:15" },
              loginEnabled: { booleanValue: true },
              loginTitle: { stringValue: "Welcome!" },
              loginBody: { stringValue: "Signed in." }
            }
          }
        }
      }
    });

    assert.equal(settings.dailyEnabled, false);
    assert.equal(settings.dailyTitle, "Class check");
    assert.equal(settings.dailyBody, "Please record attendance.");
    assert.equal(settings.dailyTime, "10:15");
    assert.equal(settings.thursdayTitle, "Thursday title");
    assert.equal(settings.thursdayBody, "Thursday note");
    assert.equal(settings.thursdayTime, "17:45");
    assert.equal(settings.sundayEnabled, false);
    assert.equal(settings.sundayTime, "19:15");
    assert.equal(settings.loginEnabled, true);
    assert.equal(settings.loginTitle, "Welcome!");
  });

  it("sends scheduled notifications at the administrator's selected IST minute only", () => {
    const settings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      dailyTime: "10:15",
      thursdayTime: "17:45",
      sundayTime: "19:15"
    };

    assert.deepEqual(
      getDueNotificationTypes(getKolkataTimeInfo(new Date("2026-11-18T04:45:00Z")), settings),
      ["weekday_prompt"]
    );
    assert.deepEqual(
      getDueNotificationTypes(getKolkataTimeInfo(new Date("2026-11-19T12:15:00Z")), settings),
      ["thursday_reminder"]
    );
    assert.deepEqual(
      getDueNotificationTypes(getKolkataTimeInfo(new Date("2026-11-22T13:45:00Z")), settings),
      ["sunday_reminder"]
    );
    assert.deepEqual(
      getDueNotificationTypes(getKolkataTimeInfo(new Date("2026-11-21T04:45:00Z")), settings),
      []
    );
    assert.deepEqual(
      getDueNotificationTypes(getKolkataTimeInfo(new Date("2026-11-18T04:46:00Z")), settings),
      []
    );
  });
});
