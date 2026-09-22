const test = require("node:test");
const assert = require("node:assert/strict");
const recurrence = require("../renderer/recurrence-model.js");

const local = (year, month, day, hour, minute = 0) => (
  new Date(year, month - 1, day, hour, minute, 0, 0)
);

test("normalizes missing and invalid recurrence as one-time", () => {
  const expected = { type: "none", anchorAt: null, activeCycleKey: "", lastRolledAt: null };
  assert.deepEqual(recurrence.normalizeRecurrence(null), expected);
  assert.deepEqual(recurrence.normalizeRecurrence({ type: "fortnightly", anchorAt: "bad" }), expected);
});

test("creates a recurrence from a valid reminder anchor", () => {
  const anchorAt = local(2026, 9, 21, 9, 30).toISOString();
  assert.deepEqual(recurrence.createRecurrence("weekly", anchorAt), {
    type: "weekly",
    anchorAt,
    activeCycleKey: "W:2026-09-21",
    lastRolledAt: null
  });
});

test("04:00 is the logical daily and weekly boundary", () => {
  assert.equal(recurrence.getCycleKey("daily", local(2026, 9, 21, 3, 59)), "D:2026-09-20");
  assert.equal(recurrence.getCycleKey("daily", local(2026, 9, 21, 4, 0)), "D:2026-09-21");
  assert.equal(recurrence.getCycleKey("weekly", local(2026, 9, 21, 2, 0)), "W:2026-09-14");
  assert.equal(recurrence.getCycleKey("weekly", local(2026, 9, 21, 4, 0)), "W:2026-09-21");
});

test("month and year cycles also start at 04:00", () => {
  assert.equal(recurrence.getCycleKey("monthly", local(2026, 10, 1, 3, 59)), "M:2026-09");
  assert.equal(recurrence.getCycleKey("monthly", local(2026, 10, 1, 4, 0)), "M:2026-10");
  assert.equal(recurrence.getCycleKey("yearly", local(2027, 1, 1, 3, 59)), "Y:2026");
  assert.equal(recurrence.getCycleKey("yearly", local(2027, 1, 1, 4, 0)), "Y:2027");
});

test("cycle distance and offsets are signed and calendar based", () => {
  assert.equal(recurrence.getCycleDistance("daily", "D:2026-09-20", "D:2026-09-23"), 3);
  assert.equal(recurrence.getCycleDistance("weekly", "W:2026-09-14", "W:2026-10-05"), 3);
  assert.equal(recurrence.getCycleDistance("monthly", "M:2026-11", "M:2027-02"), 3);
  assert.equal(recurrence.getCycleDistance("yearly", "Y:2026", "Y:2029"), 3);
  assert.equal(recurrence.getCycleDistance("daily", "D:2026-09-23", "D:2026-09-20"), -3);
  assert.equal(recurrence.offsetCycleKey("weekly", "W:2026-09-28", -1), "W:2026-09-21");
  assert.equal(recurrence.offsetCycleKey("monthly", "M:2026-12", 2), "M:2027-02");
});

test("month end clamps without losing the original anchor", () => {
  const item = recurrence.createRecurrence("monthly", local(2026, 1, 31, 9, 30).toISOString());
  assert.deepEqual(
    ["M:2026-02", "M:2026-03"].map(key => {
      const date = new Date(recurrence.getOccurrenceReminder(item, key));
      return [date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()];
    }),
    [[2, 28, 9, 30], [3, 31, 9, 30]]
  );
});

test("leap day clamps and later recovers", () => {
  const item = recurrence.createRecurrence("yearly", local(2024, 2, 29, 8, 15).toISOString());
  const commonYear = new Date(recurrence.getOccurrenceReminder(item, "Y:2025"));
  const leapYear = new Date(recurrence.getOccurrenceReminder(item, "Y:2028"));
  assert.deepEqual([commonYear.getMonth() + 1, commonYear.getDate()], [2, 28]);
  assert.deepEqual([leapYear.getMonth() + 1, leapYear.getDate()], [2, 29]);
});

test("daily and weekly reminder projections preserve local wall-clock time", () => {
  const daily = recurrence.createRecurrence("daily", local(2026, 9, 21, 2, 15).toISOString());
  const weekly = recurrence.createRecurrence("weekly", local(2026, 9, 25, 17, 45).toISOString());
  const nextDaily = new Date(recurrence.getOccurrenceReminder(daily, "D:2026-09-21"));
  const nextWeekly = new Date(recurrence.getOccurrenceReminder(weekly, "W:2026-09-28"));
  assert.deepEqual([nextDaily.getDate(), nextDaily.getHours(), nextDaily.getMinutes()], [22, 2, 15]);
  assert.deepEqual([nextWeekly.getDate(), nextWeekly.getHours(), nextWeekly.getMinutes()], [2, 17, 45]);
});

test("formats compact Chinese recurrence labels", () => {
  assert.equal(recurrence.formatRecurrenceLabel(recurrence.createRecurrence("daily", local(2026, 9, 22, 9).toISOString())), "每天 · 09:00");
  assert.equal(recurrence.formatRecurrenceLabel(recurrence.createRecurrence("weekly", local(2026, 9, 25, 17, 30).toISOString())), "每周 · 周五 17:30");
  assert.equal(recurrence.formatRecurrenceLabel(recurrence.createRecurrence("monthly", local(2026, 9, 15, 10).toISOString())), "每月 · 15日 10:00");
  assert.equal(recurrence.formatRecurrenceLabel(recurrence.createRecurrence("yearly", local(2026, 9, 28, 9).toISOString())), "每年 · 09月28日 09:00");
});

test("reminder fingerprints change per recurring occurrence and skip carryovers", () => {
  const item = recurrence.createRecurrence("daily", local(2026, 9, 22, 9).toISOString());
  assert.equal(
    recurrence.getReminderFingerprint({ id: "a", remindTime: item.anchorAt, recurrence: item }),
    `a:${item.activeCycleKey}:${item.anchorAt}`
  );
  assert.equal(
    recurrence.getReminderFingerprint({ id: "a", remindTime: item.anchorAt, recurrence: { ...item, activeCycleKey: "D:2026-09-23" } }),
    `a:D:2026-09-23:${item.anchorAt}`
  );
  assert.equal(recurrence.getReminderFingerprint({
    id: "carry",
    remindTime: item.anchorAt,
    systemMeta: { role: "recurrence-carryover" }
  }), "");
});

test("next daily boundary is strictly in the future", () => {
  assert.equal(recurrence.getNextDailyBoundary(local(2026, 9, 22, 3, 59)).getTime(), local(2026, 9, 22, 4, 0).getTime());
  assert.equal(recurrence.getNextDailyBoundary(local(2026, 9, 22, 4, 0)).getTime(), local(2026, 9, 23, 4, 0).getTime());
});
