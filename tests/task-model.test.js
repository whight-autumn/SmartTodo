const test = require("node:test");
const assert = require("node:assert/strict");
const {
  markTaskDone,
  pruneCompletedTasks,
  buildTaskIndex
} = require("../renderer/task-model.js");

test("markTaskDone records completedAt and undo clears it", () => {
  const task = { id: "a", title: "任务", done: false, completedAt: null };
  markTaskDone(task, true, 1000);
  assert.equal(task.done, true);
  assert.equal(task.completedAt, 1000);
  markTaskDone(task, false, 2000);
  assert.equal(task.done, false);
  assert.equal(task.completedAt, null);
});

test("pruneCompletedTasks removes only tasks completed more than 15 days ago", () => {
  const now = 16 * 24 * 60 * 60 * 1000;
  const tasks = [
    { id: "old", done: true, completedAt: 0 },
    { id: "new", done: true, completedAt: now - 14 * 24 * 60 * 60 * 1000 },
    { id: "active", done: false, completedAt: null }
  ];
  assert.deepEqual(
    pruneCompletedTasks(tasks, now).map(task => task.id),
    ["new", "active"]
  );
});

test("buildTaskIndex groups and sorts children once", () => {
  const index = buildTaskIndex([
    { id: "p", parentId: null, priority: "medium", done: false, pinned: false, createdAt: 1 },
    { id: "low", parentId: "p", priority: "low", done: false, pinned: false, createdAt: 2 },
    { id: "high", parentId: "p", priority: "high", done: false, pinned: false, createdAt: 3 }
  ]);
  assert.deepEqual(index.childrenByParent.get("p").map(task => task.id), ["high", "low"]);
});
