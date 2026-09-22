const test = require("node:test");
const assert = require("node:assert/strict");
const recurrence = require("../renderer/recurrence-model.js");
const taskModel = require("../renderer/task-model.js");

const local = (year, month, day, hour = 8, minute = 0) => (
  new Date(year, month - 1, day, hour, minute, 0, 0)
);

const attachment = {
  id: "hours-sheet",
  name: "工时表.xlsx",
  storageName: "hours-sheet.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  size: 1024,
  addedAt: local(2026, 9, 14, 10).getTime()
};

const root = (overrides = {}) => {
  const anchorAt = local(2026, 9, 21, 9).toISOString();
  return {
    id: "root",
    title: "填写上周工时",
    remarks: "核对后提交",
    remindTime: anchorAt,
    priority: "high",
    parentId: null,
    done: false,
    completedAt: null,
    pinned: true,
    createdAt: local(2026, 9, 14, 10).getTime(),
    updatedAt: null,
    attachments: [attachment],
    recurrence: recurrence.createRecurrence("weekly", anchorAt),
    systemMeta: null,
    ...overrides
  };
};

test("normalizes legacy and malformed recurrence data safely", () => {
  const [legacy, malformed] = taskModel.normalizeTasks([
    { id: "legacy", title: "旧任务", createdAt: 1 },
    { id: "malformed", title: "损坏周期", createdAt: 2, recurrence: { type: "fortnightly", anchorAt: "bad" } }
  ]);
  assert.deepEqual(legacy.recurrence, { type: "none", anchorAt: null, activeCycleKey: "", lastRolledAt: null });
  assert.deepEqual(malformed.recurrence, { type: "none", anchorAt: null, activeCycleKey: "", lastRolledAt: null });
  assert.equal(legacy.systemMeta, null);
});

test("an unfinished occurrence creates one carryover and rolls the stable root", () => {
  const result = taskModel.rollRecurringTasks([root()], local(2026, 9, 28, 4).getTime(), () => "carry-1");
  const nextRoot = result.tasks.find(task => task.id === "root");
  const carry = result.tasks.find(task => task.id === "carry-1");

  assert.equal(result.changed, true);
  assert.deepEqual(result.rolledTaskIds, ["root"]);
  assert.deepEqual(result.carryoverIds, ["carry-1"]);
  assert.equal(nextRoot.recurrence.activeCycleKey, "W:2026-09-28");
  assert.equal(nextRoot.done, false);
  assert.equal(nextRoot.pinned, true);
  assert.equal(new Date(nextRoot.remindTime).getDate(), 28);
  assert.equal(carry.parentId, "root");
  assert.equal(carry.systemMeta.role, "recurrence-carryover");
  assert.equal(carry.systemMeta.missedCount, 1);
  assert.equal(carry.title, "填写上周工时");
  assert.equal(carry.remarks, "核对后提交");
  assert.equal(carry.priority, "high");
  assert.equal(carry.pinned, false);
  assert.deepEqual(carry.attachments.map(item => item.id), ["hours-sheet"]);
  assert.notEqual(carry.attachments, nextRoot.attachments);
  assert.equal(carry.recurrence.type, "none");
});

test("rolling twice in one cycle is idempotent", () => {
  const once = taskModel.rollRecurringTasks([root()], local(2026, 9, 28, 4).getTime(), () => "carry-1");
  const twice = taskModel.rollRecurringTasks(once.tasks, local(2026, 9, 28, 12).getTime(), () => "carry-2");
  assert.equal(twice.changed, false);
  assert.deepEqual(twice.tasks.map(task => task.id), ["root", "carry-1"]);
});

test("a future first cycle does not roll", () => {
  const anchorAt = local(2026, 10, 5, 9).toISOString();
  const future = root({
    remindTime: anchorAt,
    recurrence: recurrence.createRecurrence("weekly", anchorAt)
  });
  const result = taskModel.rollRecurringTasks([future], local(2026, 9, 28, 4).getTime(), () => "unused");
  assert.equal(result.changed, false);
  assert.equal(result.tasks.length, 1);
});

test("one completed cycle rolls without a carryover", () => {
  const result = taskModel.rollRecurringTasks(
    [root({ done: true, completedAt: local(2026, 9, 21, 12).getTime() })],
    local(2026, 9, 28, 4).getTime(),
    () => "unused"
  );
  assert.deepEqual(result.carryoverIds, []);
  assert.equal(result.tasks[0].done, false);
  assert.equal(result.tasks[0].completedAt, null);
});

test("completed and unfinished roots count offline misses differently", () => {
  const late = local(2026, 10, 12, 4).getTime();
  const unfinished = taskModel.rollRecurringTasks([root()], late, () => "unfinished-carry");
  const completed = taskModel.rollRecurringTasks([
    root({ done: true, completedAt: local(2026, 9, 21, 12).getTime() })
  ], late, () => "completed-carry");

  assert.equal(unfinished.tasks.find(task => task.id === "unfinished-carry").systemMeta.missedCount, 3);
  assert.equal(unfinished.tasks.find(task => task.id === "unfinished-carry").systemMeta.sourceCycleEndKey, "W:2026-10-05");
  assert.equal(completed.tasks.find(task => task.id === "completed-carry").systemMeta.missedCount, 2);
  assert.equal(completed.tasks.find(task => task.id === "completed-carry").systemMeta.sourceCycleKey, "W:2026-09-28");
});

test("user children reset while historical carryovers keep their state", () => {
  const userChild = {
    ...root(),
    id: "child",
    parentId: "root",
    recurrence: { type: "none" },
    done: true,
    completedAt: 1
  };
  const oldCarry = {
    ...userChild,
    id: "old-carry",
    done: true,
    systemMeta: {
      role: "recurrence-carryover",
      sourceTaskId: "root",
      sourceCycleKey: "W:2026-09-14",
      sourceCycleEndKey: "W:2026-09-14",
      missedCount: 1
    }
  };
  const result = taskModel.rollRecurringTasks(
    [root({ done: true, completedAt: 1 }), userChild, oldCarry],
    local(2026, 9, 28, 4).getTime(),
    () => "unused"
  );
  assert.equal(result.tasks.find(task => task.id === "child").done, false);
  assert.equal(result.tasks.find(task => task.id === "old-carry").done, true);
});

test("completed recurring templates survive pruning but old carryovers do not", () => {
  const now = local(2026, 10, 20, 12).getTime();
  const completedAt = local(2026, 9, 21, 12).getTime();
  const recurringRoot = root({ done: true, completedAt });
  const userChild = {
    ...root(), id: "child", parentId: "root", recurrence: { type: "none" }, done: true, completedAt
  };
  const oldCarry = {
    ...userChild,
    id: "old-carry",
    systemMeta: {
      role: "recurrence-carryover",
      sourceTaskId: "root",
      sourceCycleKey: "W:2026-09-14",
      sourceCycleEndKey: "W:2026-09-14",
      missedCount: 1
    }
  };
  assert.deepEqual(
    taskModel.pruneCompletedTasks([recurringRoot, userChild, oldCarry], now).map(task => task.id),
    ["root", "child"]
  );
});
