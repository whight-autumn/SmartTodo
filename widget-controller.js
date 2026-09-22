"use strict";

const {
  DEFAULT_WIDGET_SIZE,
  sanitizeWidgetPreferences,
  clampWidgetBounds
} = require("./widget-window-state.js");

function createWidgetController({
  BrowserWindow,
  screen,
  fs,
  path,
  userDataPath,
  preloadPath,
  htmlPath,
  onVisibilityChanged = () => {},
  isQuitting = () => false,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  persistenceDelayMs = 180
}) {
  const preferencesPath = path.join(userDataPath, "widget-preferences.json");
  const temporaryPath = `${preferencesPath}.tmp`;
  let preferences = readPreferences();
  let widgetWindow = null;
  let writeTimer = null;
  let disposed = false;

  function readPreferences() {
    try {
      return sanitizeWidgetPreferences(JSON.parse(fs.readFileSync(preferencesPath, "utf8")));
    } catch {
      return sanitizeWidgetPreferences(null);
    }
  }

  function currentBounds() {
    if (!widgetWindow || widgetWindow.isDestroyed()) return preferences.bounds;
    const bounds = widgetWindow.getBounds();
    const display = screen.getDisplayMatching?.(bounds) || screen.getPrimaryDisplay();
    return { ...bounds, displayId: display?.id ?? null };
  }

  function snapshotPreferences() {
    const bounds = currentBounds();
    return sanitizeWidgetPreferences({
      visible: !!widgetWindow?.isVisible?.(),
      displayId: bounds?.displayId ?? preferences.displayId,
      bounds
    });
  }

  function writePreferences() {
    if (disposed && !isQuitting()) return;
    preferences = snapshotPreferences();
    try {
      fs.mkdirSync(userDataPath, { recursive: true });
      fs.writeFileSync(temporaryPath, JSON.stringify(preferences, null, 2), "utf8");
      fs.renameSync(temporaryPath, preferencesPath);
    } catch (error) {
      console.warn("桌面任务笺位置保存失败：", error?.message || error);
    }
  }

  function scheduleWrite() {
    if (writeTimer !== null) clearTimeoutFn(writeTimer);
    writeTimer = setTimeoutFn(() => {
      writeTimer = null;
      writePreferences();
    }, persistenceDelayMs);
  }

  function correctedBounds() {
    const saved = preferences.bounds
      ? { ...preferences.bounds, displayId: preferences.displayId }
      : null;
    return clampWidgetBounds(saved, screen.getAllDisplays(), screen.getPrimaryDisplay());
  }

  function handleMove() {
    scheduleWrite();
  }

  function handleShow() {
    preferences.visible = true;
    onVisibilityChanged(true);
    scheduleWrite();
  }

  function handleHide() {
    preferences.visible = false;
    onVisibilityChanged(false);
    scheduleWrite();
  }

  function handleClose(event) {
    if (isQuitting()) return;
    event.preventDefault();
    widgetWindow?.hide();
  }

  function handleClosed() {
    widgetWindow = null;
  }

  function create() {
    if (widgetWindow && !widgetWindow.isDestroyed()) return widgetWindow;
    disposed = false;
    const bounds = correctedBounds();
    widgetWindow = new BrowserWindow({
      ...DEFAULT_WIDGET_SIZE,
      x: bounds.x,
      y: bounds.y,
      frame: false,
      transparent: true,
      show: false,
      alwaysOnTop: false,
      skipTaskbar: true,
      resizable: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    widgetWindow.on("move", handleMove);
    widgetWindow.on("show", handleShow);
    widgetWindow.on("hide", handleHide);
    widgetWindow.on("close", handleClose);
    widgetWindow.on("closed", handleClosed);
    void widgetWindow.loadFile(htmlPath);
    if (preferences.visible) show();
    return widgetWindow;
  }

  function show() {
    const window = create();
    const bounds = correctedBounds();
    window.setBounds({ x: bounds.x, y: bounds.y, ...DEFAULT_WIDGET_SIZE });
    window.showInactive();
    return true;
  }

  function hide() {
    if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.hide();
    return false;
  }

  function setVisible(value) {
    return value ? show() : hide();
  }

  function isVisible() {
    return !!widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible();
  }

  function toggle() {
    return setVisible(!isVisible());
  }

  function flush() {
    if (writeTimer !== null) {
      clearTimeoutFn(writeTimer);
      writeTimer = null;
    }
    writePreferences();
  }

  function removeWindowListeners(window) {
    window.removeListener("move", handleMove);
    window.removeListener("show", handleShow);
    window.removeListener("hide", handleHide);
    window.removeListener("close", handleClose);
    window.removeListener("closed", handleClosed);
  }

  function dispose() {
    if (writeTimer !== null) {
      clearTimeoutFn(writeTimer);
      writeTimer = null;
    }
    const window = widgetWindow;
    if (window && !window.isDestroyed()) {
      removeWindowListeners(window);
      if (isQuitting()) window.destroy();
    }
    disposed = true;
  }

  return {
    create,
    show,
    hide,
    setVisible,
    toggle,
    isVisible,
    getWindow: () => widgetWindow,
    flush,
    dispose
  };
}

module.exports = { createWidgetController };
