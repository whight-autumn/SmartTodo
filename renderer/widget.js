(function initializeTaskWidget() {
  "use strict";

  const widgetModel = window.WidgetModel;
  const iconUtils = window.IconUtils;
  const bridge = window.taskWidget;
  const elements = {
    shell: document.getElementById("widget-shell"),
    date: document.getElementById("widget-date"),
    count: document.getElementById("widget-count"),
    list: document.getElementById("widget-list"),
    empty: document.getElementById("widget-empty"),
    status: document.getElementById("widget-status"),
    headerHide: document.getElementById("widget-header-hide"),
    openMain: document.getElementById("widget-open-main"),
  };
  const pendingTaskIds = new Set();
  let currentSnapshot = widgetModel.normalizeWidgetSnapshot(null);
  let queuedSnapshot = null;

  function formatDate(value = new Date()) {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "long",
      day: "numeric",
      weekday: "short"
    }).format(value);
  }

  function attentionName(task, now = Date.now()) {
    const at = Date.parse(task.remindTime || "");
    if (Number.isFinite(at) && at < now) return "overdue";
    if (Number.isFinite(at) && at <= now + 24 * 60 * 60 * 1000) return "soon";
    if (task.pinned) return "pinned";
    if (task.priority === "high") return "high";
    return "normal";
  }

  function setStatus(message = "") {
    elements.status.textContent = String(message || "");
  }

  function createTaskRow(task) {
    const row = document.createElement("li");
    row.className = "widget-task";
    row.dataset.taskId = task.id;
    row.dataset.priority = task.priority;
    row.dataset.attention = attentionName(task);
    if (task.parentTitle) row.classList.add("is-child");

    const checkWrap = document.createElement("label");
    checkWrap.className = "widget-task__check";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = false;
    checkbox.disabled = pendingTaskIds.has(task.id);
    checkbox.setAttribute("aria-label", `完成任务：${task.title}`);
    checkbox.addEventListener("change", () => handleToggle(task, row, checkbox));
    checkWrap.appendChild(checkbox);

    const body = document.createElement("div");
    body.className = "widget-task__body";
    const title = document.createElement("p");
    title.className = "widget-task__title";
    title.textContent = task.title;
    body.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "widget-task__meta";
    if (task.parentTitle) {
      const parent = document.createElement("span");
      parent.className = "widget-task__parent";
      parent.textContent = `归属 · ${task.parentTitle}`;
      meta.appendChild(parent);
    }
    const reminderText = widgetModel.formatWidgetReminder(task.remindTime);
    if (reminderText) {
      const reminder = document.createElement("span");
      reminder.className = "widget-task__reminder";
      reminder.textContent = reminderText;
      meta.appendChild(reminder);
    } else if (task.pinned) {
      const pinned = document.createElement("span");
      pinned.className = "widget-task__reminder";
      pinned.textContent = "置顶";
      meta.appendChild(pinned);
    } else if (task.priority === "high") {
      const priority = document.createElement("span");
      priority.className = "widget-task__reminder";
      priority.textContent = "高优先级";
      meta.appendChild(priority);
    }
    if (meta.childElementCount) body.appendChild(meta);

    row.append(checkWrap, body);
    return row;
  }

  function renderSnapshot(value) {
    currentSnapshot = widgetModel.normalizeWidgetSnapshot(value);
    document.documentElement.dataset.theme = currentSnapshot.theme;
    document.documentElement.style.setProperty("--widget-brightness", `${currentSnapshot.brightness}%`);
    elements.shell.style.setProperty("--widget-brightness", `${currentSnapshot.brightness}%`);
    elements.date.textContent = formatDate();
    elements.count.textContent = `${currentSnapshot.tasks.length} 项`;
    elements.list.replaceChildren(...currentSnapshot.tasks.map(createTaskRow));
    elements.empty.hidden = currentSnapshot.tasks.length > 0;
  }

  function receiveSnapshot(value) {
    const normalized = widgetModel.normalizeWidgetSnapshot(value);
    if (normalized.revision < currentSnapshot.revision) return;
    if (pendingTaskIds.size) {
      queuedSnapshot = normalized;
      return;
    }
    renderSnapshot(normalized);
  }

  async function handleToggle(task, row, checkbox) {
    if (!checkbox.checked || pendingTaskIds.has(task.id)) return;
    pendingTaskIds.add(task.id);
    checkbox.disabled = true;
    setStatus("正在完成任务");
    try {
      const result = await bridge.toggleTask(task.id);
      if (!result?.ok) throw new Error(result?.message || "任务保存失败，请在主界面重试");
      row.classList.add("is-completing");
      await new Promise(resolve => setTimeout(resolve, 180));
      pendingTaskIds.delete(task.id);
      setStatus("");
      if (queuedSnapshot) {
        const next = queuedSnapshot;
        queuedSnapshot = null;
        renderSnapshot(next);
      } else {
        receiveSnapshot(await bridge.getSnapshot());
      }
    } catch (error) {
      pendingTaskIds.delete(task.id);
      checkbox.checked = false;
      checkbox.disabled = false;
      row.classList.remove("is-completing");
      queuedSnapshot = null;
      setStatus(error?.message || "任务保存失败，请在主界面重试");
    }
  }

  elements.headerHide.addEventListener("click", () => void bridge.setVisible(false));
  elements.openMain.addEventListener("click", () => void bridge.showMainWindow());
  iconUtils.mountIcons(document);
  if (!CSS.supports("backdrop-filter", "blur(1px)")) {
    document.documentElement.classList.add("no-transparency");
  }
  bridge.onSnapshot(receiveSnapshot);
  bridge.getSnapshot().then(receiveSnapshot).catch(() => {
    setStatus("任务暂时无法读取");
  });
})();
