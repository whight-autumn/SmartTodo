(function exposeTaskModel(root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.TaskModel = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createTaskModel() {
  const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };
  const COMPLETED_RETENTION_MS = 15 * 24 * 60 * 60 * 1000;

  function normalizePriority(priority) {
    return Object.prototype.hasOwnProperty.call(PRIORITY_WEIGHT, priority)
      ? priority
      : "medium";
  }

  function compareTasks(a, b) {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    if (!!a.done !== !!b.done) return a.done ? 1 : -1;
    const priorityDiff = PRIORITY_WEIGHT[normalizePriority(b.priority)]
      - PRIORITY_WEIGHT[normalizePriority(a.priority)];
    if (priorityDiff) return priorityDiff;
    return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
  }

  function normalizeTasks(rawTasks) {
    const normalized = (Array.isArray(rawTasks) ? rawTasks : [])
      .map(task => {
        if (!task || !String(task.title || "").trim()) return null;
        const done = !!task.done;
        return {
          id: task.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
          title: String(task.title),
          remarks: task.remarks || task.desc || "",
          remindTime: task.remindTime || null,
          priority: normalizePriority(task.priority),
          parentId: task.parentId || null,
          done,
          completedAt: done
            ? Number(task.completedAt) || Number(task.createdAt) || Date.now()
            : null,
          pinned: !!task.pinned,
          createdAt: Number(task.createdAt) || Date.now()
        };
      })
      .filter(Boolean);

    const validIds = new Set(normalized.map(task => task.id));
    return normalized.map(task => ({
      ...task,
      parentId: task.parentId && validIds.has(task.parentId) ? task.parentId : null
    }));
  }

  function sortTasks(list) {
    return [...(Array.isArray(list) ? list : [])].sort(compareTasks);
  }

  function buildTaskIndex(taskList) {
    const byId = new Map();
    const childrenByParent = new Map();
    const roots = [];
    taskList.forEach(task => {
      byId.set(task.id, task);
      if (task.parentId) {
        if (!childrenByParent.has(task.parentId)) childrenByParent.set(task.parentId, []);
        childrenByParent.get(task.parentId).push(task);
      } else {
        roots.push(task);
      }
    });
    roots.sort(compareTasks);
    childrenByParent.forEach((children, parentId) => {
      childrenByParent.set(parentId, sortTasks(children));
    });
    return { byId, roots, childrenByParent };
  }

  function markTaskDone(task, done, now = Date.now()) {
    task.done = !!done;
    task.completedAt = task.done ? (Number(task.completedAt) || now) : null;
    return task;
  }

  function pruneCompletedTasks(taskList, now = Date.now(), retentionMs = COMPLETED_RETENTION_MS) {
    return taskList.filter(task => {
      if (!task.done || task.completedAt == null) return true;
      return now - Number(task.completedAt) <= retentionMs;
    });
  }

  function getTaskDepth(taskId, byId) {
    let depth = 0;
    const visited = new Set();
    let task = byId.get(taskId);
    while (task && task.parentId && !visited.has(task.id)) {
      visited.add(task.id);
      depth += 1;
      task = byId.get(task.parentId);
    }
    return depth;
  }

  return {
    COMPLETED_RETENTION_MS,
    normalizePriority,
    normalizeTasks,
    sortTasks,
    buildTaskIndex,
    markTaskDone,
    pruneCompletedTasks,
    getTaskDepth
  };
});
