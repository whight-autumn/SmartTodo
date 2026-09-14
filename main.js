/* ==========================================================
   智能任务管家 · 桌面版主进程
   ========================================================== */

const { app, BrowserWindow, Notification, Tray, Menu, ipcMain, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const { buildManagedUserDataPath } = require("./main-paths");

const legacyUserDataPath = path.join(app.getPath("appData"), "smart-assistant");
const managedUserDataPath = buildManagedUserDataPath(app.getPath("appData"));
app.setPath("userData", managedUserDataPath);

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
    require("electron").shell.openExternal(url);
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
