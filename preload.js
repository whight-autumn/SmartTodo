/* ==========================================================
   preload 脚本：安全暴露桌面 API 给渲染进程
   ========================================================== */

const { contextBridge, ipcRenderer, webUtils } = require("electron");

function validateExactPayload(value, keys, operationName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${operationName}参数无效`);
  }
  const payloadKeys = Object.keys(value);
  if (payloadKeys.length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw new Error(`${operationName}参数无效`);
  }
  return value;
}

async function prepareTaskAttachmentChanges(value) {
  const payload = validateExactPayload(
    value,
    ["taskId", "files", "removeStorageNames", "existingCount"],
    "准备附件变更"
  );
  if (!Array.isArray(payload.files) || !Array.isArray(payload.removeStorageNames)) {
    throw new Error("附件选择参数无效");
  }

  const sourcePaths = payload.files.map(file => {
    let sourcePath;
    try {
      sourcePath = webUtils.getPathForFile(file);
    } catch {
      throw new Error("只能导入用户实际选择的文件");
    }
    if (typeof sourcePath !== "string" || !sourcePath.trim()) {
      throw new Error("只能导入用户实际选择的文件");
    }
    return sourcePath;
  });

  return ipcRenderer.invoke("task-attachment:prepare-changes", {
    taskId: payload.taskId,
    sourcePaths,
    removeStorageNames: [...payload.removeStorageNames],
    existingCount: payload.existingCount
  });
}

function clonePayload(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

async function setAutoStart(enabled) {
  if (typeof enabled !== "boolean") throw new Error("开机自启参数无效");
  return ipcRenderer.invoke("settings:set-auto-start", { enabled });
}

async function requestDataMigration(value) {
  const payload = validateExactPayload(value, ["selectionId"], "迁移运行数据");
  if (typeof payload.selectionId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.selectionId)) {
    throw new Error("目录选择已失效，请重新选择目录");
  }
  return ipcRenderer.invoke("settings:request-data-migration", { selectionId: payload.selectionId });
}

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(clonePayload(payload));
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("desktop", {
  // 原生系统通知
  notify: (title, body) => ipcRenderer.invoke("notify", { title, body }),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getDataPath: () => ipcRenderer.invoke("get-data-path"),
  getAppSettings: () => ipcRenderer.invoke("settings:get"),
  setAutoStart,
  chooseDataDirectory: () => ipcRenderer.invoke("settings:choose-data-directory"),
  requestDataMigration,
  consumeMigrationResult: () => ipcRenderer.invoke("settings:consume-migration-result"),
  prepareTaskAttachmentChanges,
  commitTaskAttachmentChanges: payload => ipcRenderer.invoke("task-attachment:commit-changes", payload),
  rollbackTaskAttachmentChanges: payload => ipcRenderer.invoke("task-attachment:rollback-changes", payload),
  reconcileTaskAttachments: references => ipcRenderer.invoke("task-attachment:reconcile", references),
  removeTaskAttachmentDirectories: taskIds => ipcRenderer.invoke("task-attachment:remove-task-directories", taskIds),
  getTaskAttachmentUrl: payload => ipcRenderer.invoke("task-attachment:get-url", payload),
  openTaskAttachment: payload => ipcRenderer.invoke("task-attachment:open", payload),
  openExternalUrl: url => ipcRenderer.invoke("task-attachment:open-external", url),
  publishTaskWidgetSnapshot: snapshot => ipcRenderer.invoke("widget:publish-snapshot", snapshot),
  completeTaskWidgetAction: result => ipcRenderer.invoke("widget:task-action-result", result),
  getTaskWidgetVisibility: () => ipcRenderer.invoke("widget:get-visible"),
  toggleTaskWidgetVisibility: () => ipcRenderer.invoke("widget:toggle-visible"),
  setTaskWidgetVisible: visible => ipcRenderer.invoke("widget:set-visible", { visible }),
  onTaskWidgetAction: callback => {
    const listener = (_event, payload) => callback(clonePayload(payload));
    ipcRenderer.on("widget:action", listener);
    return () => ipcRenderer.removeListener("widget:action", listener);
  },
  onTaskWidgetVisibility: callback => {
    const listener = (_event, payload) => callback(clonePayload(payload));
    ipcRenderer.on("widget:visibility", listener);
    return () => ipcRenderer.removeListener("widget:visibility", listener);
  },
  onWindowShown: callback => {
    const listener = () => callback();
    ipcRenderer.on("window-shown", listener);
    return () => ipcRenderer.removeListener("window-shown", listener);
  },

  // 平台信息
  platforms: {
    isWindows: process.platform === "win32",
    isMac: process.platform === "darwin",
    isLinux: process.platform === "linux"
  },

  // 应用版本
  version: process.env.npm_package_version || "1.4.2"
});
