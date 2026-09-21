/* ==========================================================
   SmartTodo · 桌面版主进程
   ========================================================== */

const { app, BrowserWindow, Notification, Tray, Menu, ipcMain, nativeImage, screen, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { buildManagedUserDataPath, buildTaskAttachmentPath } = require("./main-paths");
const { createTaskAttachmentStore } = require("./task-attachment-store");
const { registerTaskAttachmentIpc } = require("./task-attachment-ipc");
const WidgetModel = require("./renderer/widget-model.js");
const { createWidgetController } = require("./widget-controller.js");
const { registerWidgetIpc } = require("./widget-ipc.js");

const legacyUserDataPath = path.join(app.getPath("appData"), "smart-assistant");
const managedUserDataPath = buildManagedUserDataPath(app.getPath("appData"));
app.setPath("userData", managedUserDataPath);
const taskAttachmentStore = createTaskAttachmentStore({
  rootPath: buildTaskAttachmentPath(app.getPath("userData"))
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

/* ---------- 创建主窗口 ---------- */
function createMainWindow() {
  mainWindow = new BrowserWindow({
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
ipcMain.handle("get-data-path", () => managedUserDataPath);

/* ---------- 应用生命周期 ---------- */
app.whenReady().then(() => {
  migrateLegacyUserData();
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
    showMainWindow,
    normalizeSnapshot: WidgetModel.normalizeWidgetSnapshot
  });
  createMainWindow();
  widgetController.create();
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
  widgetIpcRegistration?.dispose();
  widgetController?.flush();
  widgetController?.dispose();
});
