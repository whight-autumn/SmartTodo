const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { buildManagedUserDataPath } = require("./main-paths.js");
const { readBootstrapState, queueMigration, consumeMigrationResult } = require("./runtime-data-manager.js");
const { readAutoStartState, writeAutoStartState } = require("./login-startup.js");
const { resolveAppLaunchSpec } = require("./app-launch-spec.js");

const SELECTION_LIFETIME_MS = 5 * 60 * 1000;
const SELECTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERRORS = {
  INVALID_SENDER: "设置操作只能由当前主界面发起。",
  INVALID_PAYLOAD: "设置操作参数无效，请重新操作。",
  INVALID_SELECTION: "所选目录已失效，请重新选择目录。",
  SETTINGS_READ_FAILED: "无法读取应用设置，请稍后重试。",
  AUTO_START_FAILED: "无法更改开机自启设置，请检查系统权限后重试。",
  DIRECTORY_CHOICE_FAILED: "无法选择目录，请稍后重试。",
  MIGRATION_FAILED: "无法准备数据迁移。请选择独立、可写的空目录后重试。",
  MIGRATION_RESULT_FAILED: "无法确认迁移结果，请稍后重试。"
};

class SettingsError extends Error {
  constructor(code) { super(ERRORS[code]); this.code = code; }
}

function exactPayload(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw new SettingsError("INVALID_PAYLOAD");
  }
  return value;
}

function registerAppSettingsIpc({ ipcMain, dialog, app, getMainWindow, getRuntimePath,
  appDataPath, homePath, appPath, flushBeforeRelaunch, launchOptions = {} }) {
  const channels = [];
  const selections = new Map();
  let disposed = false;
  let chooserRevision = 0;

  function removeSelection(id) {
    const selection = selections.get(id);
    if (selection) clearTimeout(selection.timer);
    selections.delete(id);
    return selection;
  }

  function clearSelections() {
    for (const id of selections.keys()) removeSelection(id);
  }

  function requireMainSender(event) {
    const window = getMainWindow();
    if (disposed || !window || window.isDestroyed?.() || !window.webContents ||
        window.webContents.isDestroyed?.() || event?.sender !== window.webContents ||
        !Number.isInteger(event.sender.id)) throw new SettingsError("INVALID_SENDER");
    return window;
  }

  function handle(channel, failureCode, payloadKeys, operation) {
    channels.push(channel);
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        const window = requireMainSender(event);
        if (args.length > 1) throw new SettingsError("INVALID_PAYLOAD");
        if (payloadKeys === null && args[0] !== undefined) throw new SettingsError("INVALID_PAYLOAD");
        return await operation(event, args[0], window);
      } catch (error) {
        if (channel === "settings:request-data-migration" && typeof args[0]?.selectionId === "string") {
          removeSelection(args[0].selectionId);
        }
        const code = error instanceof SettingsError ? error.code : failureCode;
        return { ok: false, error: { code, message: ERRORS[code] } };
      }
    });
  }

  handle("settings:get", "SETTINGS_READ_FAILED", null, () => {
    const currentPath = getRuntimePath();
    return {
      autoStart: readAutoStartState({ app, ...launchOptions }),
      storage: { currentPath, isDefault: path.relative(buildManagedUserDataPath(appDataPath), currentPath) === "" },
      migrationResult: readBootstrapState({ appDataPath }).migrationResult
    };
  });

  handle("settings:set-auto-start", "AUTO_START_FAILED", ["enabled"], (_event, value) => {
    const payload = exactPayload(value, ["enabled"]);
    if (typeof payload.enabled !== "boolean") throw new SettingsError("INVALID_PAYLOAD");
    return writeAutoStartState({ app, ...launchOptions, enabled: payload.enabled });
  });

  handle("settings:choose-data-directory", "DIRECTORY_CHOICE_FAILED", null, async (event, _value, window) => {
    const revision = ++chooserRevision;
    const result = await dialog.showOpenDialog(window, { properties: ["openDirectory", "createDirectory"] });
    requireMainSender(event);
    if (revision !== chooserRevision) throw new SettingsError("INVALID_SELECTION");
    if (result.canceled || !result.filePaths?.length) return { canceled: true, selectionId: null, path: null };
    const selectedPath = result.filePaths[0];
    if (typeof selectedPath !== "string" || !path.isAbsolute(selectedPath) || selectedPath.includes("\0")) {
      throw new SettingsError("DIRECTORY_CHOICE_FAILED");
    }
    clearSelections();
    const selectionId = randomUUID();
    const timer = setTimeout(() => removeSelection(selectionId), SELECTION_LIFETIME_MS);
    timer.unref?.();
    selections.set(selectionId, { senderId: event.sender.id, path: selectedPath,
      expiresAt: Date.now() + SELECTION_LIFETIME_MS, timer });
    return { canceled: false, selectionId, path: selectedPath };
  });

  handle("settings:request-data-migration", "MIGRATION_FAILED", ["selectionId"], async (event, value) => {
    // Revoke an identifiable token even when the remainder of the payload is invalid.
    const selection = typeof value?.selectionId === "string" ? removeSelection(value.selectionId) : undefined;
    const payload = exactPayload(value, ["selectionId"]);
    if (typeof payload.selectionId !== "string" || !SELECTION_ID.test(payload.selectionId)) {
      throw new SettingsError("INVALID_PAYLOAD");
    }
    if (!selection || selection.senderId !== event.sender.id || selection.expiresAt <= Date.now()) {
      throw new SettingsError("INVALID_SELECTION");
    }
    const launchSpec = resolveAppLaunchSpec({ app, ...launchOptions });
    await flushBeforeRelaunch();
    requireMainSender(event);
    queueMigration({ appDataPath, sourcePath: getRuntimePath(), targetPath: selection.path, homePath, appPath });
    app.relaunch(launchSpec);
    app.quit();
    return { queued: true };
  });

  handle("settings:consume-migration-result", "MIGRATION_RESULT_FAILED", null, () => consumeMigrationResult({ appDataPath }));

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      ++chooserRevision;
      clearSelections();
      for (const channel of channels) ipcMain.removeHandler(channel);
    }
  };
}

module.exports = { registerAppSettingsIpc };
