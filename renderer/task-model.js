(function exposeTaskModel(root, factory) {
  const recurrenceModel = typeof module !== "undefined" && module.exports
    ? require("./recurrence-model.js")
    : root.RecurrenceModel;
  const api = factory(recurrenceModel);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.TaskModel = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createTaskModel(recurrenceModel) {
  if (!recurrenceModel) throw new Error("周期模型加载失败");
  const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };
  const COMPLETED_RETENTION_MS = 15 * 24 * 60 * 60 * 1000;
  const ATTENTION_WINDOW_MS = 24 * 60 * 60 * 1000;
  const MAX_TASK_ATTACHMENTS = 10;
  const MAX_TASK_ATTACHMENT_BYTES = 20 * 1024 * 1024;

  function normalizePriority(priority) {
    return Object.prototype.hasOwnProperty.call(PRIORITY_WEIGHT, priority)
      ? priority
      : "medium";
  }

  function taskNeedsAttention(task, now = Date.now()) {
    if (!task || task.done) return false;
    if (task.pinned || normalizePriority(task.priority) === "high") return true;
    if (!task.remindTime) return false;

    const reminderAt = new Date(task.remindTime).getTime();
    return Number.isFinite(reminderAt) && reminderAt <= now + ATTENTION_WINDOW_MS;
  }

  function compareTasks(a, b) {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    if (!!a.done !== !!b.done) return a.done ? 1 : -1;
    const priorityDiff = PRIORITY_WEIGHT[normalizePriority(b.priority)]
      - PRIORITY_WEIGHT[normalizePriority(a.priority)];
    if (priorityDiff) return priorityDiff;
    return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
  }

  function normalizeAttachment(raw) {
    if (!raw || !/^[a-zA-Z0-9_-]+$/.test(String(raw.id || ""))) return null;
    if (!/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]{1,12})?$/.test(String(raw.storageName || ""))) return null;
    const name = String(raw.name || "");
    const size = Number(raw.size);
    const addedAt = Number(raw.addedAt);
    if (!name.trim() || /[\\/:]/.test(name) || !Number.isFinite(size) || size < 0 || size > MAX_TASK_ATTACHMENT_BYTES) return null;
    if (!Number.isFinite(addedAt) || addedAt <= 0) return null;
    return {
      id: String(raw.id),
      name,
      storageName: String(raw.storageName),
      mimeType: String(raw.mimeType || "application/octet-stream"),
      size,
      addedAt
    };
  }

  function normalizeSystemMeta(raw) {
    if (!raw || raw.role !== "recurrence-carryover") return null;
    const sourceTaskId = String(raw.sourceTaskId || "").trim();
    const sourceCycleKey = String(raw.sourceCycleKey || "").trim();
    const sourceCycleEndKey = String(raw.sourceCycleEndKey || sourceCycleKey).trim();
    const missedCount = Number(raw.missedCount);
    if (!sourceTaskId || !sourceCycleKey || !sourceCycleEndKey
      || !Number.isInteger(missedCount) || missedCount < 1) return null;
    return {
      role: "recurrence-carryover",
      sourceTaskId,
      sourceCycleKey,
      sourceCycleEndKey,
      missedCount
    };
  }

  function applyTaskNoteEdit(task, edit, now = Date.now()) {
    const remarks = String(edit?.remarks || "");
    const attachments = (Array.isArray(edit?.attachments) ? edit.attachments : [])
      .map(normalizeAttachment).filter(Boolean).slice(0, MAX_TASK_ATTACHMENTS);
    const currentAttachments = (Array.isArray(task.attachments) ? task.attachments : [])
      .map(normalizeAttachment).filter(Boolean);
    const changed = remarks !== String(task.remarks || "")
      || JSON.stringify(attachments) !== JSON.stringify(currentAttachments);
    return {
      changed,
      task: { ...task, remarks, attachments, updatedAt: changed ? now : (Number(task.updatedAt) || null) }
    };
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
          createdAt: Number(task.createdAt) || Date.now(),
          updatedAt: Number(task.updatedAt) || null,
          attachments: (Array.isArray(task.attachments) ? task.attachments : [])
            .map(normalizeAttachment).filter(Boolean).slice(0, MAX_TASK_ATTACHMENTS),
          recurrence: recurrenceModel.normalizeRecurrence(task.recurrence, task.remindTime),
          systemMeta: normalizeSystemMeta(task.systemMeta)
        };
      })
      .filter(Boolean);

    const validIds = new Set(normalized.map(task => task.id));
    return normalized.map(task => {
      const parentId = task.parentId && validIds.has(task.parentId) ? task.parentId : null;
      return {
        ...task,
        parentId,
        recurrence: parentId
          ? recurrenceModel.normalizeRecurrence(null)
          : task.recurrence,
        systemMeta: parentId ? task.systemMeta : null
      };
    });
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
    const source = Array.isArray(taskList) ? taskList : [];
    const byId = new Map(source.map(task => [task.id, task]));

    function belongsToRecurringTemplate(task) {
      let current = task;
      const visited = new Set();
      while (current && !visited.has(current.id)) {
        if (current.systemMeta?.role === "recurrence-carryover") return false;
        visited.add(current.id);
        if (!current.parentId) {
          return recurrenceModel.normalizeRecurrence(current.recurrence, current.remindTime).type !== "none";
        }
        current = byId.get(current.parentId);
      }
      return false;
    }

    return source.filter(task => {
      if (!task.done || task.completedAt == null) return true;
      if (belongsToRecurringTemplate(task)) return true;
      return now - Number(task.completedAt) <= retentionMs;
    });
  }

  function isDescendantOf(task, rootId, byId) {
    let current = task;
    const visited = new Set();
    while (current?.parentId && !visited.has(current.id)) {
      visited.add(current.id);
      if (current.parentId === rootId) return true;
      current = byId.get(current.parentId);
    }
    return false;
  }

  function createCarryoverSnapshot(root, details) {
    return {
      id: details.id,
      title: root.title,
      remarks: root.remarks,
      remindTime: root.remindTime,
      priority: root.priority,
      parentId: root.id,
      done: false,
      completedAt: null,
      pinned: false,
      createdAt: details.createdAt,
      updatedAt: null,
      attachments: root.attachments.map(attachment => ({ ...attachment })),
      recurrence: recurrenceModel.normalizeRecurrence(null),
      systemMeta: {
        role: "recurrence-carryover",
        sourceTaskId: root.id,
        sourceCycleKey: details.sourceCycleKey,
        sourceCycleEndKey: details.sourceCycleEndKey,
        missedCount: details.missedCount
      }
    };
  }

  function rollRecurringTasks(taskList, now = Date.now(), makeId) {
    const timestamp = Number(now);
    const effectiveNow = Number.isFinite(timestamp) ? timestamp : Date.now();
    const output = normalizeTasks(taskList).map(task => ({
      ...task,
      attachments: task.attachments.map(attachment => ({ ...attachment })),
      recurrence: { ...task.recurrence },
      systemMeta: task.systemMeta ? { ...task.systemMeta } : null
    }));
    const byId = new Map(output.map(task => [task.id, task]));
    const usedIds = new Set(byId.keys());
    const recurringRoots = output.filter(task => !task.parentId && task.recurrence.type !== "none");
    const rolledTaskIds = [];
    const carryoverIds = [];

    function nextId() {
      let candidate = "";
      for (let attempt = 0; attempt < 10 && (!candidate || usedIds.has(candidate)); attempt += 1) {
        candidate = typeof makeId === "function"
          ? String(makeId() || "")
          : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      }
      if (!candidate || usedIds.has(candidate)) {
        candidate = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      }
      usedIds.add(candidate);
      return candidate;
    }

    recurringRoots.forEach(root => {
      const type = root.recurrence.type;
      const currentCycleKey = recurrenceModel.getCycleKey(type, effectiveNow);
      const elapsed = recurrenceModel.getCycleDistance(type, root.recurrence.activeCycleKey, currentCycleKey);
      if (!Number.isFinite(elapsed) || elapsed <= 0) return;

      const missedCount = root.done ? Math.max(0, elapsed - 1) : elapsed;
      if (missedCount > 0) {
        const carryoverId = nextId();
        output.push(createCarryoverSnapshot(root, {
          id: carryoverId,
          missedCount,
          sourceCycleKey: root.done
            ? recurrenceModel.offsetCycleKey(type, root.recurrence.activeCycleKey, 1)
            : root.recurrence.activeCycleKey,
          sourceCycleEndKey: recurrenceModel.offsetCycleKey(type, currentCycleKey, -1),
          createdAt: effectiveNow
        }));
        carryoverIds.push(carryoverId);
      }

      output.forEach(task => {
        if (task.id === root.id || task.systemMeta?.role === "recurrence-carryover") return;
        if (isDescendantOf(task, root.id, byId)) {
          task.done = false;
          task.completedAt = null;
        }
      });

      root.done = false;
      root.completedAt = null;
      root.remindTime = recurrenceModel.getOccurrenceReminder(root.recurrence, currentCycleKey);
      root.recurrence.activeCycleKey = currentCycleKey;
      root.recurrence.lastRolledAt = new Date(effectiveNow).toISOString();
      rolledTaskIds.push(root.id);
    });

    return {
      tasks: output,
      changed: rolledTaskIds.length > 0,
      rolledTaskIds,
      carryoverIds
    };
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

  function getVisibleTaskIds(taskList, filter = "active", now = Date.now()) {
    const normalizedTasks = normalizeTasks(taskList);

    if (filter === "completed") {
      return new Set(normalizedTasks.filter(task => task.done).map(task => task.id));
    }

    if (filter !== "attention") {
      return new Set(normalizedTasks.filter(task => !task.done).map(task => task.id));
    }

    const taskMap = new Map(normalizedTasks.map(task => [task.id, task]));
    const visibleIds = new Set();

    normalizedTasks
      .filter(task => taskNeedsAttention(task, now))
      .forEach(task => {
        let current = task;
        const ancestry = new Set();

        while (current && !current.done && !ancestry.has(current.id)) {
          visibleIds.add(current.id);
          ancestry.add(current.id);
          current = current.parentId ? taskMap.get(current.parentId) : null;
        }
      });

    return visibleIds;
  }

  function getTaskFilterCounts(taskList, now = Date.now()) {
    const normalizedTasks = normalizeTasks(taskList);
    return {
      attention: normalizedTasks.filter(task => taskNeedsAttention(task, now)).length,
      active: normalizedTasks.filter(task => !task.done).length,
      completed: normalizedTasks.filter(task => task.done).length
    };
  }

  return {
    COMPLETED_RETENTION_MS,
    ATTENTION_WINDOW_MS,
    normalizePriority,
    normalizeAttachment,
    normalizeSystemMeta,
    applyTaskNoteEdit,
    normalizeTasks,
    sortTasks,
    buildTaskIndex,
    markTaskDone,
    pruneCompletedTasks,
    rollRecurringTasks,
    getTaskDepth,
    taskNeedsAttention,
    getVisibleTaskIds,
    getTaskFilterCounts
  };
});
