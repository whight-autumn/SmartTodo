/* ==========================================================
   SmartTodo · 桌面版主进程
   ========================================================== */

const { app, BrowserWindow, Notification, Tray, Menu, ipcMain, nativeImage, screen, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const {
  buildManagedUserDataPath,
  buildTaskAttachmentPath,
  resolveRuntimeDataPath,
  migrateLegacyUserData: migrateLegacyUserDataFiles
} = require("./main-paths");
const { readBootstrapState } = require("./runtime-data-manager.js");
const { createTaskAttachmentStore } = require("./task-attachment-store");
const { registerTaskAttachmentIpc } = require("./task-attachment-ipc");
const WidgetModel = require("./renderer/widget-model.js");
const { createWidgetController } = require("./widget-controller.js");
const { registerWidgetIpc } = require("./widget-ipc.js");

// Chromium's accelerated native date/time editor can leave some Windows GPU
// combinations on a black compositor frame after segment text is selected.
// SmartTodo's lightweight UI is more reliable with software composition.
app.disableHardwareAcceleration();

// Only the primary process may inspect or migrate the runtime profile.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

const appDataPath = app.getPath("appData");
const defaultRuntimePath = buildManagedUserDataPath(appDataPath);
let runtimePath;
try {
  const bootstrapState = readBootstrapState({ appDataPath, defaultRuntimePath });
  ({ runtimePath } = resolveRuntimeDataPath({
    appDataPath,
    defaultRuntimePath,
    homePath: app.getPath("home"),
    appPath: app.getAppPath()
  }));
  // A pending migration owns startup even when it falls back to the default.
  if (!bootstrapState.pendingMigration &&
      path.relative(defaultRuntimePath, bootstrapState.activeRuntimePath) === "" &&
      path.relative(defaultRuntimePath, runtimePath) === "") {
    migrateLegacyUserData();
  }
} catch (error) {
  const message = error.code === "ERR_RUNTIME_DATA_UNAVAILABLE"
    ? "无法安全恢复原运行数据，已停止启动以避免创建空数据。请保留原目录和备份目录后重试。"
    : "无法安全初始化运行数据，已停止启动。请保留原目录和备份目录后重试。";
  try {
    dialog.showErrorBox("SmartTodo 运行数据不可用", message);
  } finally {
    app.quit();
  }
  return;
}
app.setPath("userData", runtimePath);
const taskAttachmentStore = createTaskAttachmentStore({
  rootPath: buildTaskAttachmentPath(runtimePath)
});
const { openExternalUrl } = registerTaskAttachmentIpc({
  ipcMain,
  shell,
  attachmentStore: taskAttachmentStore
});

let mainWindow = null;
let tray = null;
let widgetController = null;
let widgetIpcRegistration = null;
let isQuitting = false;
const APP_VERSION = app.getVersion();
const startHidden = process.argv.includes("--hidden");

/* ---------- 创建主窗口 ---------- */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    show: !startHidden,
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 620,
    title: `SmartTodo V${APP_VERSION} · by 萤火`,
    backgroundColor: "#111815",
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
    migrateLegacyUserDataFiles({ appDataPath });
  } catch (error) {
    console.warn("旧运行数据迁移失败，将继续使用新目录：", error.message);
  }
}

/* ---------- 系统托盘 ---------- */
function createTray() {
  const iconPath = path.join(__dirname, "assets/tray-icon.png");
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
  tray.setToolTip(`SmartTodo V${APP_VERSION} · by 萤火`);
  updateTrayMenu();
  tray.on("click", showMainWindow);
}

function updateTrayMenu() {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "打开主界面",
      click: showMainWindow
    },
    {
      label: "桌面任务笺",
      type: "checkbox",
      checked: widgetController?.isVisible() || false,
      click: item => widgetController?.setVisible(item.checked)
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

/* ---------- IPC：原生通知 ---------- */
ipcMain.handle("notify", (event, { title, body }) => {
  try {
    if (Notification.isSupported()) {
      new Notification({
        title: title || "SmartTodo",
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
ipcMain.handle("get-data-path", () => runtimePath);

/* ---------- 应用生命周期 ---------- */
app.whenReady().then(() => {
  widgetController = createWidgetController({
    BrowserWindow,
    screen,
    fs,
    path,
    userDataPath: app.getPath("userData"),
    preloadPath: path.join(__dirname, "widget-preload.js"),
    htmlPath: path.join(__dirname, "renderer", "widget.html"),
    onVisibilityChanged(visible) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("widget:visibility", { visible });
      }
      updateTrayMenu();
    },
    isQuitting: () => isQuitting
  });
  widgetIpcRegistration = registerWidgetIpc({
    ipcMain,
    getMainWindow: () => mainWindow,
    getWidgetWindow: widgetController.getWindow,
    setWidgetVisible: widgetController.setVisible,
    isWidgetVisible: widgetController.isVisible,
    showMainWindow,
    normalizeSnapshot: WidgetModel.normalizeWidgetSnapshot
  });
  createMainWindow();
  if (!startHidden) showMainWindow();
  widgetController.create();
  createTray();

  app.on("activate", () => {
    showMainWindow();
  });
});

// 防止多实例
app.on("second-instance", (_event, commandLine) => {
  if (!commandLine.includes("--hidden")) showMainWindow();
});

// 关闭窗口时退出（macOS 除外）
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // 保留托盘，不退出
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  widgetIpcRegistration?.dispose();
  widgetController?.flush();
  widgetController?.dispose();
});
