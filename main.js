/* ==========================================================
   智能任务管家 · 桌面版主进程
   ========================================================== */

const { app, BrowserWindow, Notification, Tray, Menu, ipcMain, nativeImage, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { buildManagedUserDataPath, buildTaskAttachmentPath } = require("./main-paths");
const { createTaskAttachmentStore } = require("./task-attachment-store");

const TASK_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const STORAGE_NAME_PATTERN = /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]{1,12})?$/;
const EXTERNAL_PROTOCOLS = new Set(["http:", "https:"]);

const legacyUserDataPath = path.join(app.getPath("appData"), "smart-assistant");
const managedUserDataPath = buildManagedUserDataPath(app.getPath("appData"));
app.setPath("userData", managedUserDataPath);
const taskAttachmentStore = createTaskAttachmentStore({
  rootPath: buildTaskAttachmentPath(app.getPath("userData"))
});

let mainWindow = null;
let tray = null;
let isQuitting = false;
const APP_VERSION = app.getVersion();

/* ---------- 创建主窗口 ---------- */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 650,
    title: `智能任务管家 V${APP_VERSION} · by 萤火`,
    backgroundColor: "#0f172a",
    icon: path.join(__dirname, "assets/icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 加载本地渲染页面
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  // 新窗口打开外链时用系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url).catch(error => {
      console.error("打开外部链接失败：", error.message);
    });
    return { action: "deny" };
  });

  // 窗口关闭（非退出时隐藏到托盘）
  mainWindow.on("close", e => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("show", () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("window-shown");
    }
  });
}

function migrateLegacyUserData() {
  try {
    const localStoragePath = path.join(managedUserDataPath, "Local Storage");
    const legacyLocalStoragePath = path.join(legacyUserDataPath, "Local Storage");
    fs.mkdirSync(managedUserDataPath, { recursive: true });
    if (!fs.existsSync(localStoragePath) && fs.existsSync(legacyLocalStoragePath)) {
      fs.cpSync(legacyUserDataPath, managedUserDataPath, {
        recursive: true,
        force: false,
        errorOnExist: false
      });
    }
  } catch (error) {
    console.warn("旧运行数据迁移失败，将继续使用新目录：", error.message);
  }
}

/* ---------- 系统托盘 ---------- */
function createTray() {
  const iconPath = path.join(__dirname, "assets/icon.png");
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      // 占位图标（若图标文件缺失）
      trayIcon = nativeImage.createEmpty();
    }
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip(`智能任务管家 V${APP_VERSION} · by 萤火`);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "打开主界面",
      click: showMainWindow
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("click", showMainWindow);
}

function showMainWindow() {
  if (!mainWindow) {
    createMainWindow();
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.focus();
}

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

function validateTaskId(value) {
  if (typeof value !== "string" || !TASK_ID_PATTERN.test(value)) {
    throw new Error("任务 ID 不安全");
  }
  return value;
}

function validateStorageName(value) {
  if (typeof value !== "string" || !STORAGE_NAME_PATTERN.test(value)) {
    throw new Error("附件存储名称不安全");
  }
  return value;
}

function validateAttachmentPayload(value, operationName) {
  const payload = validateExactPayload(value, ["taskId", "storageName"], operationName);
  return {
    taskId: validateTaskId(payload.taskId),
    storageName: validateStorageName(payload.storageName)
  };
}

function validateImportPayload(value) {
  const payload = validateExactPayload(value, ["taskId", "sourcePaths", "existingCount"], "导入附件");
  const sourcePaths = payload.sourcePaths;
  if (!Array.isArray(sourcePaths) || sourcePaths.some(sourcePath => (
    typeof sourcePath !== "string" || !path.isAbsolute(sourcePath)
  ))) {
    throw new Error("附件源路径无效");
  }
  if (!Number.isInteger(payload.existingCount) || payload.existingCount < 0) {
    throw new Error("现有附件数量无效");
  }
  return {
    taskId: validateTaskId(payload.taskId),
    sourcePaths: [...sourcePaths],
    existingCount: payload.existingCount
  };
}

function validateTaskIds(value) {
  if (!Array.isArray(value)) {
    throw new Error("任务 ID 列表无效");
  }
  return value.map(validateTaskId);
}

async function openExternalUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("外部链接无效");
  }
  const url = new URL(String(value));
  if (!EXTERNAL_PROTOCOLS.has(url.protocol)) {
    throw new Error("仅支持打开 HTTP/HTTPS 链接");
  }
  await shell.openExternal(url.href);
  return true;
}

/* ---------- IPC：原生通知 ---------- */
ipcMain.handle("notify", (event, { title, body }) => {
  try {
    if (Notification.isSupported()) {
      new Notification({
        title: title || "智能任务管家",
        body: body || "",
        icon: path.join(__dirname, "assets/icon.png"),
        silent: false
      }).show();
      return true;
    }
  } catch (e) {
    console.error("通知失败：", e);
  }
  return false;
});

ipcMain.handle("get-app-version", () => app.getVersion());
ipcMain.handle("get-data-path", () => managedUserDataPath);
ipcMain.handle("task-attachment:import", (_event, payload) => (
  taskAttachmentStore.importFiles(validateImportPayload(payload))
));
ipcMain.handle("task-attachment:remove", async (_event, payload) => {
  await taskAttachmentStore.removeAttachment(validateAttachmentPayload(payload, "删除附件"));
  return true;
});
ipcMain.handle("task-attachment:remove-task-directories", async (_event, taskIds) => {
  await Promise.all(validateTaskIds(taskIds).map(taskId => taskAttachmentStore.removeTaskAttachments(taskId)));
  return true;
});
ipcMain.handle("task-attachment:get-url", (_event, payload) => (
  taskAttachmentStore.getAttachmentUrl(validateAttachmentPayload(payload, "获取附件地址"))
));
ipcMain.handle("task-attachment:open", async (_event, payload) => {
  const attachmentPath = await taskAttachmentStore.resolveAttachmentPath(
    validateAttachmentPayload(payload, "打开附件")
  );
  const errorMessage = await shell.openPath(attachmentPath);
  if (errorMessage) {
    throw new Error(`打开附件失败：${errorMessage}`);
  }
  return true;
});
ipcMain.handle("task-attachment:open-external", (_event, value) => openExternalUrl(value));

/* ---------- 应用生命周期 ---------- */
app.whenReady().then(() => {
  migrateLegacyUserData();
  createMainWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      showMainWindow();
    }
  });
});

// 防止多实例
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });
}

// 关闭窗口时退出（macOS 除外）
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // 保留托盘，不退出
  }
});

app.on("before-quit", () => {
  isQuitting = true;
});
