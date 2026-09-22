const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createWidgetSnapshot,
  normalizeWidgetSnapshot,
  selectWidgetTasks,
  formatWidgetReminder
} = require("../renderer/widget-model.js");

const NOW = Date.parse("2026-09-21T08:00:00.000Z");
const task = (id, overrides = {}) => ({
  id,
  title: id,
  parentId: null,
  remindTime: null,
  priority: "medium",
  pinned: false,
  done: false,
  createdAt: NOW - 1000,
  ...overrides
});

test("selects at most five unfinished tasks by overdue, due, pinned, high and stable order", () => {
  const tasks = [
    task("normal-a", { createdAt: NOW - 6000 }),
    task("high", { priority: "high" }),
    task("pinned", { pinned: true }),
    task("soon", { remindTime: new Date(NOW + 60 * 60 * 1000).toISOString() }),
    task("overdue", { remindTime: new Date(NOW - 1000).toISOString() }),
    task("normal-b", { createdAt: NOW - 7000 }),
    task("done", { done: true, priority: "high" })
  ];
  assert.deepEqual(
    selectWidgetTasks(tasks, NOW, 5).map(item => item.id),
    ["overdue", "soon", "pinned", "high", "normal-a"]
  );
});

test("snapshot contains only display fields and resolves a child parent title", () => {
  const snapshot = createWidgetSnapshot([
    task("parent", { title: "年度计划", pinned: true }),
    task("child", { title: "整理季度材料", parentId: "parent", priority: "high" })
  ], { theme: "dark", brightness: 95 }, NOW);
  assert.equal(snapshot.theme, "dark");
  assert.equal(snapshot.brightness, 95);
  assert.equal(snapshot.tasks.find(item => item.id === "child").parentTitle, "年度计划");
  assert.equal(Object.hasOwn(snapshot.tasks[0], "remarks"), false);
  assert.equal(Object.hasOwn(snapshot.tasks[0], "attachments"), false);
});

test("snapshot exposes labels but not writable recurrence metadata", () => {
  const snapshot = createWidgetSnapshot([
    task("weekly", {
      recurrence: {
        type: "weekly",
        anchorAt: "2026-09-21T09:00:00.000Z",
        activeCycleKey: "W:2026-09-21",
        lastRolledAt: null
      }
    }),
    task("carry", {
      parentId: "weekly",
      systemMeta: {
        role: "recurrence-carryover",
        sourceTaskId: "weekly",
        sourceCycleKey: "W:2026-09-14",
        sourceCycleEndKey: "W:2026-09-14",
        missedCount: 1
      }
    })
  ], {}, NOW);
  assert.match(snapshot.tasks.find(item => item.id === "weekly").recurrenceLabel, /^每周/);
  assert.equal(snapshot.tasks.find(item => item.id === "carry").carryoverLabel, "上期未完成");
  assert.equal(Object.hasOwn(snapshot.tasks[0], "recurrence"), false);
  assert.equal(Object.hasOwn(snapshot.tasks[1], "systemMeta"), false);
});

test("normalizes malformed snapshots without accepting writable task data", () => {
  assert.deepEqual(normalizeWidgetSnapshot(null), {
    revision: 0, theme: "dark", brightness: 100, tasks: []
  });
  const normalized = normalizeWidgetSnapshot({
    revision: 2,
    theme: "light",
    brightness: 500,
    tasks: [{ id: "safe", title: "保留", done: false, remarks: "不得进入任务笺" }]
  });
  assert.equal(normalized.brightness, 125);
  assert.equal(normalized.tasks[0].title, "保留");
  assert.equal(Object.hasOwn(normalized.tasks[0], "remarks"), false);
});

test("formats overdue, due-soon and invalid reminders", () => {
  assert.equal(formatWidgetReminder(new Date(NOW - 1000).toISOString(), NOW), "已逾期");
  assert.equal(formatWidgetReminder(new Date(NOW + 30 * 60 * 1000).toISOString(), NOW), "30 分钟后");
  assert.equal(formatWidgetReminder("invalid", NOW), "");
});
