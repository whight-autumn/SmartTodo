const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ATTENTION_WINDOW_MS,
  taskNeedsAttention,
  getVisibleTaskIds,
  getTaskFilterCounts
} = require("../renderer/task-model");

const NOW = Date.UTC(2026, 8, 14, 8, 0, 0);

function createTask(overrides = {}) {
  return {
    id: overrides.id || "task",
    title: overrides.title || "测试任务",
    remarks: "",
    remindTime: null,
    priority: "medium",
    parentId: null,
    done: false,
    completedAt: null,
    pinned: false,
    createdAt: NOW,
    ...overrides
  };
}

test("需关注包含置顶、高优先级、逾期及未来 24 小时内提醒任务", () => {
  assert.equal(ATTENTION_WINDOW_MS, 24 * 60 * 60 * 1000);
  assert.equal(taskNeedsAttention(createTask({ pinned: true }), NOW), true);
  assert.equal(taskNeedsAttention(createTask({ priority: "high" }), NOW), true);
  assert.equal(taskNeedsAttention(createTask({ remindTime: new Date(NOW - 60_000).toISOString() }), NOW), true);
  assert.equal(taskNeedsAttention(createTask({ remindTime: new Date(NOW + ATTENTION_WINDOW_MS).toISOString() }), NOW), true);
  assert.equal(taskNeedsAttention(createTask({ remindTime: new Date(NOW + ATTENTION_WINDOW_MS + 1).toISOString() }), NOW), false);
  assert.equal(taskNeedsAttention(createTask({ priority: "high", done: true }), NOW), false);
});

test("需关注中的匹配子任务保留父任务上下文并隐藏无关兄弟任务", () => {
  const tasks = [
    createTask({ id: "parent", title: "主任务" }),
    createTask({ id: "focused-child", title: "高优先级子任务", parentId: "parent", priority: "high" }),
    createTask({ id: "other-child", title: "普通子任务", parentId: "parent" }),
    createTask({ id: "other-root", title: "其他主任务" })
  ];

  const visibleIds = getVisibleTaskIds(tasks, "attention", NOW);

  assert.deepEqual([...visibleIds].sort(), ["focused-child", "parent"]);
});

test("筛选数量分别统计直接需关注、全部进行中和已完成任务", () => {
  const tasks = [
    createTask({ id: "parent" }),
    createTask({ id: "high-child", parentId: "parent", priority: "high" }),
    createTask({ id: "pinned", pinned: true }),
    createTask({ id: "completed", priority: "high", done: true, completedAt: NOW })
  ];

  assert.deepEqual(getTaskFilterCounts(tasks, NOW), {
    attention: 2,
    active: 3,
    completed: 1
  });
});
