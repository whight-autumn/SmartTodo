const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { buildManagedUserDataPath, buildTaskAttachmentPath } = require("../main-paths.js");

const mainPath = path.join(__dirname, "..", "main.js");
const source = fs.readFileSync(mainPath, "utf8");

// Electron's profile and window side effects are external; run the actual main
// entrypoint with boundary doubles so startup ordering is observable in Node.
function runMain({ custom = false, pending = false, failure = false, hidden = false, lock = true,
  settingsPaths = null, widgetFlushError = null } = {}) {
  const appDataPath = "C:\\Users\\test\\AppData\\Roaming";
  const defaultRuntimePath = buildManagedUserDataPath(appDataPath);
  const runtimePath = custom ? "D:\\SmartTodoData" : defaultRuntimePath;
  const calls = [];
  const sessionAccesses = [];
  const handlers = new Map();
  const appHandlers = new Map();
  let userDataPath = "C:\\ElectronDefault";
  const app = {
    disableHardwareAcceleration() {},
    getPath(name) {
      return { appData: appDataPath, userData: userDataPath, home: "C:\\Users\\test" }[name];
    },
    getAppPath: () => "C:\\SmartTodoApp",
    getVersion: () => "1.4.0",
    setPath(name, value) { calls.push(["setPath", name, value]); userDataPath = value; },
    requestSingleInstanceLock: () => lock,
    quit() { calls.push(["quit"]); },
    relaunch() { calls.push(["relaunch"]); },
    on(event, handler) { appHandlers.set(event, handler); },
    whenReady() { return { then(callback) { calls.push(["ready"]); callback(); } }; }
  };
  class BrowserWindow {
    constructor(options) {
      calls.push(["window", options]);
      this.webContents = { id: 31, setWindowOpenHandler() {}, send() {}, focus() { calls.push(["webFocus"]); } };
    }
    loadFile() {}
    on() {}
    isDestroyed() { return false; }
    isMinimized() { return false; }
    show() { calls.push(["show"]); }
    focus() { calls.push(["focus"]); }
    static getAllWindows() { return []; }
  }
  const readBootstrapState = () => {
    calls.push(["bootstrap"]);
    return { activeRuntimePath: runtimePath, pendingMigration: pending ? { requestId: "queued" } : null };
  };
  const performPendingMigration = options => {
    calls.push(["migration", options]);
    if (failure) throw Object.assign(new Error("unbounded ".repeat(1000)), { code: "ERR_RUNTIME_DATA_UNAVAILABLE" });
    return { runtimePath, migrationResult: null };
  };
  const electron = {
    app, BrowserWindow, screen: {}, shell: {}, Notification: {},
    ipcMain: { handle(name, handler) { handlers.set(name, handler); }, removeHandler(name) { handlers.delete(name); } },
    session: { defaultSession: new Proxy({
      // Electron 31's DOMStorage persistence API is synchronous and returns void.
      flushStorageData() { calls.push(["flushStorage"]); }
    }, {
      get(target, name) {
        sessionAccesses.push(name);
        if (!Object.hasOwn(target, name)) throw new Error(`Unsupported session operation: ${String(name)}`);
        return target[name];
      }
    }) },
    dialog: {
      showErrorBox(title, message) { calls.push(["error", title, message]); },
      async showOpenDialog() { return { canceled: false, filePaths: [settingsPaths?.targetPath] }; }
    },
    nativeImage: { createFromPath() { return { isEmpty: () => false }; } },
    Menu: { buildFromTemplate: template => template },
    Tray: class { constructor() { calls.push(["tray"]); } setToolTip() {} setContextMenu() {} on() {} }
  };
  const overrides = {
    electron,
    "./main-paths": {
      buildManagedUserDataPath, buildTaskAttachmentPath,
      resolveRuntimeDataPath: performPendingMigration,
      migrateLegacyUserData() { calls.push(["legacy"]); }
    },
    "./runtime-data-manager.js": { readBootstrapState, performPendingMigration },
    "./runtime-data-manager": { readBootstrapState, performPendingMigration },
    "./task-attachment-store": {
      createTaskAttachmentStore(options) { calls.push(["attachments", options]); return {}; }
    },
    "./task-attachment-ipc": { registerTaskAttachmentIpc: () => ({ openExternalUrl: async () => {} }) },
    "./renderer/widget-model.js": { normalizeWidgetSnapshot() {} },
    "./widget-controller.js": {
      createWidgetController(options) {
        calls.push(["widgetController", options.userDataPath]);
        return {
          getWindow() {}, setVisible() {}, isVisible: () => true,
          create() { calls.push(["widgetCreate"]); }, flush() { calls.push(["widgetFlush"]); }, dispose() {},
          flushOrThrow() { calls.push(["widgetStrictFlush"]); if (widgetFlushError) throw widgetFlushError; }
        };
      }
    },
    "./widget-ipc.js": { registerWidgetIpc: () => ({ dispose() {} }) }
  };
  overrides["./app-settings-ipc.js"] = {
    registerAppSettingsIpc(options) {
      calls.push(["settingsRegistration", options]);
      if (settingsPaths) {
        return require("../app-settings-ipc.js").registerAppSettingsIpc({ ...options, ...settingsPaths });
      }
      return { dispose() { calls.push(["settingsDispose"]); } };
    }
  };
  const entry = vm.runInNewContext(`(function(require, module, exports, __dirname, process) {\n${source}\n})`, { console });
  entry(name => overrides[name] || require(name), { exports: {} }, {}, path.dirname(mainPath), {
    argv: hidden ? ["SmartTodo.exe", "--hidden"] : ["SmartTodo.exe"], platform: "win32", execPath: "C:\\SmartTodoApp\\SmartTodo.exe"
  });
  return { calls, handlers, appHandlers, runtimePath, defaultRuntimePath, appDataPath, sessionAccesses };
}

test("runtime migration finishes before the only profile setter and attachment initialization", () => {
  const result = runMain({ custom: true, pending: true });
  const names = result.calls.map(call => call[0]);
  assert.ok(names.indexOf("migration") >= 0, "pending migration must run");
  assert.ok(names.indexOf("migration") < names.indexOf("setPath"));
  assert.ok(names.indexOf("setPath") < names.indexOf("attachments"));
  assert.ok(names.indexOf("migration") < names.indexOf("ready"));
  assert.deepEqual(result.calls.filter(call => call[0] === "setPath"), [["setPath", "userData", "D:\\SmartTodoData"]]);
  assert.equal((source.match(/app\.setPath\(\s*"userData"/g) || []).length, 1);
  assert.equal(result.calls.find(call => call[0] === "attachments")[1].rootPath, path.join("D:\\SmartTodoData", "task-attachments"));
  assert.equal(result.calls.find(call => call[0] === "widgetController")[1], "D:\\SmartTodoData");
  assert.equal(result.handlers.get("get-data-path")(), "D:\\SmartTodoData");
  assert.equal(result.calls.find(call => call[0] === "migration")[1].defaultRuntimePath, result.defaultRuntimePath);
});

for (const options of [{ custom: true }, { pending: true }, { custom: true, pending: true }]) {
  test(`bootstrap ownership skips historic migration: ${JSON.stringify(options)}`, () => {
    assert.equal(runMain(options).calls.some(call => call[0] === "legacy"), false);
  });
}

test("default startup preserves historic migration before Chromium storage opens", () => {
  const { calls } = runMain();
  const names = calls.map(call => call[0]);
  assert.equal(calls.filter(call => call[0] === "legacy").length, 1);
  assert.ok(names.indexOf("legacy") < names.indexOf("ready"));
});

test("unrecoverable runtime data reports a bounded native error and quits before storage or windows", () => {
  const { calls } = runMain({ pending: true, failure: true });
  const names = calls.map(call => call[0]);
  assert.ok(names.includes("quit"));
  for (const effect of ["setPath", "attachments", "window", "ready", "legacy"]) {
    assert.equal(names.includes(effect), false, `${effect} must not occur after failed recovery`);
  }
  const error = calls.find(call => call[0] === "error");
  assert.ok(error, "native error is visible");
  assert.ok(error[1].length <= 100);
  assert.ok(error[2].length > 0 && error[2].length <= 300);
  assert.ok(names.indexOf("error") < names.indexOf("quit"));
});

test("hidden launch creates the tray and saved desktop note without showing or focusing the main window", () => {
  const { calls } = runMain({ hidden: true });
  assert.equal(calls.find(call => call[0] === "window")[1].show, false);
  for (const effect of ["show", "focus", "webFocus"]) assert.equal(calls.some(call => call[0] === effect), false);
  assert.ok(calls.some(call => call[0] === "tray"));
  assert.ok(calls.some(call => call[0] === "widgetCreate"));
});

test("manual launch shows and focuses the main window", () => {
  const { calls } = runMain();
  assert.equal(calls.find(call => call[0] === "window")[1].show, true);
  for (const effect of ["show", "focus", "webFocus"]) assert.ok(calls.some(call => call[0] === effect));
});

test("a second process without the lock quits before touching runtime data", () => {
  assert.deepEqual(runMain({ lock: false }).calls, [["quit"]]);
});

test("a second hidden launch preserves focus while a manual second launch opens the main window", () => {
  const { calls, appHandlers } = runMain({ hidden: true });
  appHandlers.get("second-instance")({}, ["SmartTodo.exe", "--hidden"]);
  assert.equal(calls.some(call => call[0] === "focus"), false);
  appHandlers.get("second-instance")({}, ["SmartTodo.exe"]);
  assert.ok(calls.some(call => call[0] === "focus"));
});

test("main registers settings with resolved paths and flushes Chromium plus widget preferences before relaunch", async () => {
  const { calls, runtimePath, appDataPath, sessionAccesses } = runMain({ custom: true });
  const registration = calls.find(call => call[0] === "settingsRegistration");
  assert.ok(registration, "settings IPC must be registered");
  const options = registration[1];
  assert.equal(options.appDataPath, appDataPath);
  assert.equal(options.getRuntimePath(), runtimePath);
  assert.equal(options.homePath, "C:\\Users\\test");
  assert.equal(options.appPath, "C:\\SmartTodoApp");
  assert.ok(options.getMainWindow());
  await options.flushBeforeRelaunch();
  assert.deepEqual(sessionAccesses, ["flushStorageData"]);
  assert.deepEqual(calls.filter(call => ["flushStorage", "widgetStrictFlush"].includes(call[0])),
    [["flushStorage"], ["widgetStrictFlush"]]);
});

test("settings handlers are disposed alongside widgets on application quit", () => {
  const { calls, appHandlers } = runMain();
  appHandlers.get("before-quit")();
  assert.ok(calls.some(call => call[0] === "settingsDispose"));
});

test("strict widget persistence failure in main preparation prevents queue, relaunch and quit", async t => {
  const root = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "smarttodo-main-flush-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source");
  fs.mkdirSync(sourcePath);
  const settingsPaths = {
    appDataPath: path.join(root, "app-data"), getRuntimePath: () => sourcePath,
    targetPath: path.join(root, "target"), homePath: path.join(root, "home"), appPath: path.join(root, "app")
  };
  const { calls, handlers } = runMain({ settingsPaths, widgetFlushError: new Error("preference write failed") });
  const event = { sender: calls.find(call => call[0] === "settingsRegistration")[1].getMainWindow().webContents };
  const selection = await handlers.get("settings:choose-data-directory")(event);
  const response = await handlers.get("settings:request-data-migration")(event, { selectionId: selection.selectionId });
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "MIGRATION_FAILED");
  assert.ok(calls.some(call => call[0] === "widgetStrictFlush"));
  assert.equal(fs.existsSync(require("../runtime-data-manager.js").buildBootstrapPath(settingsPaths.appDataPath)), false);
  assert.equal(calls.some(call => ["relaunch", "quit"].includes(call[0])), false);
});

test("migration uses only supported Electron 31 storage persistence before widget flush, queue, relaunch and quit", async t => {
  const root = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "smarttodo-main-persistence-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source");
  fs.mkdirSync(sourcePath);
  const settingsPaths = {
    appDataPath: path.join(root, "app-data"), getRuntimePath: () => sourcePath,
    targetPath: path.join(root, "target"), homePath: path.join(root, "home"), appPath: path.join(root, "app")
  };
  const { calls, handlers, sessionAccesses } = runMain({ settingsPaths });
  const { buildBootstrapPath, readBootstrapState } = require("../runtime-data-manager.js");
  const bootstrapPath = buildBootstrapPath(settingsPaths.appDataPath);
  const rename = fs.renameSync;
  t.mock.method(fs, "renameSync", (from, to) => {
    rename(from, to);
    if (to === bootstrapPath) calls.push(["queue"]);
  });
  const event = { sender: calls.find(call => call[0] === "settingsRegistration")[1].getMainWindow().webContents };
  const selection = await handlers.get("settings:choose-data-directory")(event);
  assert.deepEqual(await handlers.get("settings:request-data-migration")(event,
    { selectionId: selection.selectionId }), { queued: true });
  assert.deepEqual(sessionAccesses, ["flushStorageData"]);
  assert.deepEqual(calls.filter(call => ["flushStorage", "widgetStrictFlush", "queue", "relaunch", "quit"].includes(call[0])),
    [["flushStorage"], ["widgetStrictFlush"], ["queue"], ["relaunch"], ["quit"]]);
  const queued = readBootstrapState({ appDataPath: settingsPaths.appDataPath }).pendingMigration;
  assert.equal(queued.sourcePath, sourcePath);
  assert.equal(queued.targetPath, settingsPaths.targetPath);
});
