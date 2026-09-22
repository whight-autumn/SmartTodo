"use strict";

const { randomUUID } = require("node:crypto");

const CHANNELS = [
  "widget:publish-snapshot",
  "widget:get-snapshot",
  "widget:toggle-task",
  "widget:task-action-result",
  "widget:get-visible",
  "widget:toggle-visible",
  "widget:set-visible",
  "widget:show-main"
];
const TASK_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function exactObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}参数无效`);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw new Error(`${label}参数无效`);
  }
  return value;
}

function snapshotObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("发布任务笺参数无效");
  }
  const required = ["revision", "theme", "tasks"];
  const allowed = new Set([...required, "brightness"]);
  if (required.some(key => !Object.hasOwn(value, key))
      || Object.keys(value).some(key => !allowed.has(key))) {
    throw new Error("发布任务笺参数无效");
  }
  return value;
}

function clonePayload(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function registerWidgetIpc({
  ipcMain,
  getMainWindow,
  getWidgetWindow,
  setWidgetVisible,
  isWidgetVisible,
  showMainWindow,
  normalizeSnapshot,
  actionTimeoutMs = 5000
}) {
  const pending = new Map();
  let latestSnapshot = normalizeSnapshot(null);
  let observedWidgetContents = null;

  const mainContents = () => getMainWindow()?.webContents || null;
  const widgetContents = () => getWidgetWindow()?.webContents || null;
  const isLive = contents => contents && !(contents.isDestroyed?.() ?? false);

  function requireSender(event, expected, label) {
    const contents = expected();
    if (!contents || event?.sender !== contents) throw new Error(`${label}来源无效`);
    return contents;
  }

  function rejectPending(message) {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error(message));
    }
    pending.clear();
  }

  function observeWidget(contents) {
    if (!contents || observedWidgetContents === contents) return;
    observedWidgetContents?.removeListener?.("destroyed", onWidgetDestroyed);
    observedWidgetContents = contents;
    observedWidgetContents.once?.("destroyed", onWidgetDestroyed);
  }

  function onWidgetDestroyed() {
    rejectPending("桌面任务笺已关闭");
    observedWidgetContents = null;
  }

  ipcMain.handle("widget:publish-snapshot", async (event, value) => {
    requireSender(event, mainContents, "发布任务笺");
    snapshotObject(value);
    latestSnapshot = clonePayload(normalizeSnapshot(value));
    const contents = widgetContents();
    if (isLive(contents)) {
      observeWidget(contents);
      contents.send("widget:snapshot", clonePayload(latestSnapshot));
    }
    return clonePayload(latestSnapshot);
  });

  ipcMain.handle("widget:get-snapshot", async (event, payload) => {
    requireSender(event, widgetContents, "读取任务笺");
    if (payload !== undefined) throw new Error("读取任务笺参数无效");
    return clonePayload(latestSnapshot);
  });

  ipcMain.handle("widget:toggle-task", async (event, value) => {
    const contents = requireSender(event, widgetContents, "完成任务");
    const payload = exactObject(value, ["taskId"], "完成任务");
    if (typeof payload.taskId !== "string" || !TASK_ID_PATTERN.test(payload.taskId)) {
      throw new Error("任务 ID 不安全");
    }
    const destination = mainContents();
    if (!isLive(destination)) throw new Error("主界面不可用");
    observeWidget(contents);
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("任务操作超时，请在主界面重试"));
      }, Math.max(1, actionTimeoutMs));
      pending.set(requestId, { resolve, reject, timer });
      destination.send("widget:action", {
        requestId,
        type: "toggle-complete",
        taskId: payload.taskId
      });
    });
  });

  ipcMain.handle("widget:task-action-result", async (event, value) => {
    requireSender(event, mainContents, "完成任务结果");
    const payload = exactObject(value, ["requestId", "ok", "message"], "完成任务结果");
    if (typeof payload.requestId !== "string" || !REQUEST_ID_PATTERN.test(payload.requestId)
        || typeof payload.ok !== "boolean" || typeof payload.message !== "string") {
      throw new Error("完成任务结果参数无效");
    }
    const item = pending.get(payload.requestId);
    if (!item) throw new Error("任务请求不存在或已完成");
    pending.delete(payload.requestId);
    clearTimeout(item.timer);
    item.resolve({ ok: payload.ok, message: payload.message });
    return true;
  });

  ipcMain.handle("widget:set-visible", async (event, value) => {
    const payload = exactObject(value, ["visible"], "任务笺可见性");
    if (typeof payload.visible !== "boolean") throw new Error("任务笺可见性参数无效");
    const fromMain = event?.sender === mainContents();
    const fromWidget = event?.sender === widgetContents();
    if (!fromMain && !fromWidget) throw new Error("任务笺可见性来源无效");
    if (fromWidget && payload.visible) throw new Error("任务笺不能自行显示");
    return setWidgetVisible(payload.visible);
  });

  ipcMain.handle("widget:get-visible", async (event, payload) => {
    requireSender(event, mainContents, "读取任务笺可见性");
    if (payload !== undefined) throw new Error("读取任务笺可见性参数无效");
    return !!isWidgetVisible();
  });

  ipcMain.handle("widget:toggle-visible", async (event, payload) => {
    requireSender(event, mainContents, "切换任务笺可见性");
    if (payload !== undefined) throw new Error("切换任务笺可见性参数无效");
    return setWidgetVisible(!isWidgetVisible());
  });

  ipcMain.handle("widget:show-main", async (event, payload) => {
    requireSender(event, widgetContents, "打开主界面");
    if (payload !== undefined) throw new Error("打开主界面参数无效");
    return showMainWindow();
  });

  observeWidget(widgetContents());

  return {
    dispose() {
      CHANNELS.forEach(channel => ipcMain.removeHandler(channel));
      observedWidgetContents?.removeListener?.("destroyed", onWidgetDestroyed);
      observedWidgetContents = null;
      rejectPending("任务笺通信已关闭");
    }
  };
}

module.exports = { CHANNELS, registerWidgetIpc };
