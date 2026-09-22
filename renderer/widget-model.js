(function exposeWidgetModel(root, factory) {
  const recurrenceModel = typeof module !== "undefined" && module.exports
    ? require("./recurrence-model.js")
    : root.RecurrenceModel;
  const api = factory(recurrenceModel);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WidgetModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createWidgetModel(recurrenceModel) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const PRIORITIES = new Set(["high", "medium", "low"]);
  let latestRevision = 0;

  function clampBrightness(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 100;
    return Math.min(125, Math.max(75, Math.round(numeric)));
  }

  function sanitizeLabel(value) {
    return typeof value === "string" ? value.trim().slice(0, 80) : "";
  }

  function getRecurrenceLabel(task) {
    if (task?.recurrence && recurrenceModel?.formatRecurrenceLabel) {
      return sanitizeLabel(recurrenceModel.formatRecurrenceLabel(task.recurrence));
    }
    return sanitizeLabel(task?.recurrenceLabel);
  }

  function getCarryoverLabel(task) {
    if (task?.systemMeta?.role === "recurrence-carryover") {
      const missedCount = Math.max(1, Number(task.systemMeta.missedCount) || 1);
      return missedCount > 1 ? `连续 ${missedCount} 期未完成` : "上期未完成";
    }
    return sanitizeLabel(task?.carryoverLabel);
  }

  function toWidgetTask(task, parentTitle = "", order = 0) {
    return {
      id: String(task?.id || ""),
      title: String(task?.title || "").trim(),
      parentTitle: String(parentTitle || "").trim(),
      remindTime: typeof task?.remindTime === "string" ? task.remindTime : null,
      priority: PRIORITIES.has(task?.priority) ? task.priority : "medium",
      pinned: !!task?.pinned,
      done: !!task?.done,
      createdAt: Number(task?.createdAt) || 0,
      recurrenceLabel: getRecurrenceLabel(task),
      carryoverLabel: getCarryoverLabel(task),
      order: Number.isInteger(order) && order >= 0 ? order : 0
    };
  }

  function attentionBucket(task, now = Date.now()) {
    const at = Date.parse(task?.remindTime || "");
    if (Number.isFinite(at) && at < now) return 0;
    if (Number.isFinite(at) && at <= now + DAY_MS) return 1;
    if (task?.pinned) return 2;
    if (task?.priority === "high") return 3;
    return 4;
  }

  function selectWidgetTasks(taskList, now = Date.now(), limit = 5) {
    const maximum = Math.max(0, Math.min(Number(limit) || 5, 5));
    return (Array.isArray(taskList) ? taskList : [])
      .map((task, index) => ({
        task: toWidgetTask(task, task?.parentTitle, Number.isInteger(task?.order) ? task.order : index),
        index
      }))
      .filter(({ task }) => task.id && task.title && !task.done)
      .sort((left, right) => (
        attentionBucket(left.task, now) - attentionBucket(right.task, now)
        || left.task.order - right.task.order
        || left.index - right.index
      ))
      .slice(0, maximum)
      .map(({ task }) => task);
  }

  function createWidgetSnapshot(taskList, appearance = {}, now = Date.now()) {
    const source = Array.isArray(taskList) ? taskList : [];
    const titles = new Map(source.map(task => [String(task?.id || ""), String(task?.title || "").trim()]));
    const displayTasks = source.map((task, order) => toWidgetTask(
      task,
      task?.parentId ? titles.get(String(task.parentId)) || "" : "",
      order
    ));
    latestRevision += 1;
    return {
      revision: latestRevision,
      theme: appearance?.theme === "light" ? "light" : "dark",
      brightness: clampBrightness(appearance?.brightness),
      tasks: selectWidgetTasks(displayTasks, now, 5)
    };
  }

  function normalizeWidgetSnapshot(value) {
    if (!value || typeof value !== "object") {
      return { revision: 0, theme: "dark", brightness: 100, tasks: [] };
    }
    const tasks = (Array.isArray(value.tasks) ? value.tasks : [])
      .map((task, index) => toWidgetTask(task, task?.parentTitle, task?.order ?? index))
      .filter(task => task.id && task.title)
      .slice(0, 5);
    return {
      revision: Number.isInteger(value.revision) && value.revision >= 0 ? value.revision : 0,
      theme: value.theme === "light" ? "light" : "dark",
      brightness: clampBrightness(value.brightness),
      tasks
    };
  }

  function formatWidgetReminder(value, now = Date.now()) {
    const at = Date.parse(value || "");
    if (!Number.isFinite(at)) return "";
    const difference = at - now;
    if (difference < 0) return "已逾期";
    const minutes = Math.ceil(difference / 60000);
    if (minutes < 1) return "即将到期";
    if (minutes < 60) return `${minutes} 分钟后`;
    const hours = Math.ceil(minutes / 60);
    if (hours <= 24) return `${hours} 小时后`;
    const date = new Date(at);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  return {
    attentionBucket,
    createWidgetSnapshot,
    formatWidgetReminder,
    normalizeWidgetSnapshot,
    selectWidgetTasks
  };
});
