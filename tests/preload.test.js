const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadPreload() {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "preload", "main-preload.js"), "utf8");
  const calls = [];
  let desktop;

  class SelectedFile {
    constructor(name, selectedPath) {
      this.name = name;
      this.selectedPath = selectedPath;
    }
  }

  const context = vm.createContext({
    File: SelectedFile,
    process: {
      env: {},
      platform: "win32"
    },
    require(moduleName) {
      assert.equal(moduleName, "electron");
      return {
        contextBridge: {
          exposeInMainWorld(name, api) {
            assert.equal(name, "desktop");
            desktop = api;
          }
        },
        ipcRenderer: {
          invoke(channel, payload) {
            calls.push({ channel, payload });
            return Promise.resolve({ channel });
          },
          on() {},
          removeListener() {}
        },
        webUtils: {
          getPathForFile(file) {
            assert.ok(file instanceof SelectedFile);
            return file.selectedPath;
          }
        }
      };
    }
  });

  new vm.Script(source, { filename: "preload.js" }).runInContext(context);
  return { desktop, calls, SelectedFile };
}

test("preload exposes no renderer-controlled path import API", () => {
  const { desktop } = loadPreload();

  assert.equal(desktop.getPathForFile, undefined);
  assert.equal(desktop.importTaskAttachments, undefined);
  assert.equal(desktop.removeTaskAttachment, undefined);
  assert.equal(typeof desktop.prepareTaskAttachmentChanges, "function");
  assert.equal(typeof desktop.commitTaskAttachmentChanges, "function");
  assert.equal(typeof desktop.rollbackTaskAttachmentChanges, "function");
  for (const method of [
    "publishTaskWidgetSnapshot",
    "completeTaskWidgetAction",
    "getTaskWidgetVisibility",
    "toggleTaskWidgetVisibility",
    "setTaskWidgetVisible",
    "onTaskWidgetAction",
    "onTaskWidgetVisibility"
  ]) assert.equal(typeof desktop[method], "function", method);
  assert.equal(desktop.ipcRenderer, undefined);
  assert.equal(desktop.invoke, undefined);
  assert.equal(desktop.send, undefined);
});

test("preload widget bridge uses fixed channels and exact listener cleanup", async () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "preload", "main-preload.js"), "utf8");
  assert.match(source, /ipcRenderer\.invoke\("widget:publish-snapshot"/);
  assert.match(source, /ipcRenderer\.invoke\("widget:task-action-result"/);
  assert.match(source, /ipcRenderer\.invoke\("widget:get-visible"/);
  assert.match(source, /ipcRenderer\.invoke\("widget:toggle-visible"/);
  assert.match(source, /ipcRenderer\.invoke\("widget:set-visible"/);
  assert.match(source, /ipcRenderer\.on\("widget:action"/);
  assert.match(source, /ipcRenderer\.on\("widget:visibility"/);
  assert.doesNotMatch(source, /publishTaskWidgetSnapshot\s*:\s*\([^)]*channel/);
});

test("preload exposes a fixed validated window theme bridge", async () => {
  const { desktop, calls } = loadPreload();
  assert.equal(typeof desktop.setWindowTheme, "function");

  await desktop.setWindowTheme("light");
  await desktop.setWindowTheme("dark");
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { channel: "window:set-theme", payload: { theme: "light" } },
    { channel: "window:set-theme", payload: { theme: "dark" } }
  ]);

  for (const value of [null, "system", 1, {}, ["light"]]) {
    await assert.rejects(desktop.setWindowTheme(value));
  }
  assert.equal(calls.length, 2);
});

test("preload derives paths only from actual selected File objects", async () => {
  const { desktop, calls, SelectedFile } = loadPreload();
  const selected = new SelectedFile("selected.txt", "C:\\selected\\selected.txt");

  await desktop.prepareTaskAttachmentChanges({
    taskId: "task_1",
    files: [selected],
    removeStorageNames: ["old.txt"],
    existingCount: 2
  });

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    channel: "task-attachment:prepare-changes",
    payload: {
      taskId: "task_1",
      sourcePaths: ["C:\\selected\\selected.txt"],
      removeStorageNames: ["old.txt"],
      existingCount: 2
    }
  }]);
});

test("preload rejects fabricated path payloads, non-Files, and empty selected paths before IPC", async () => {
  const { desktop, calls, SelectedFile } = loadPreload();

  await assert.rejects(desktop.prepareTaskAttachmentChanges({
    taskId: "task_1",
    sourcePaths: ["C:\\private\\secret.txt"],
    removeStorageNames: [],
    existingCount: 0
  }));
  await assert.rejects(desktop.prepareTaskAttachmentChanges({
    taskId: "task_1",
    files: [{ name: "secret.txt", selectedPath: "C:\\private\\secret.txt" }],
    removeStorageNames: [],
    existingCount: 0
  }));
  await assert.rejects(desktop.prepareTaskAttachmentChanges({
    taskId: "task_1",
    files: [new SelectedFile("fabricated.txt", "")],
    removeStorageNames: [],
    existingCount: 0
  }));

  assert.deepEqual(calls, []);
});

test("preload uses fixed transaction completion channels", async () => {
  const { desktop, calls } = loadPreload();
  const payload = {
    taskId: "task_1",
    transactionId: "00000000-0000-4000-8000-000000000001"
  };

  await desktop.commitTaskAttachmentChanges(payload);
  await desktop.rollbackTaskAttachmentChanges(payload);

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { channel: "task-attachment:commit-changes", payload },
    { channel: "task-attachment:rollback-changes", payload }
  ]);
});
require("node:test")("preload exposes task reconciliation only through a fixed IPC channel", () => {
  const localAssert = require("node:assert/strict");
  const source = require("node:fs").readFileSync(require.resolve("../src/preload/main-preload.js"), "utf8");

  localAssert.match(source, /reconcileTaskAttachments/);
  localAssert.match(source, /ipcRenderer\.invoke\("task-attachment:reconcile"/);
  localAssert.doesNotMatch(source, /reconcileTaskAttachments\s*:\s*\([^)]*channel/);
});

test("preload settings bridge uses only its five fixed channels", async () => {
  const { desktop, calls } = loadPreload();
  const selectionId = "00000000-0000-4000-8000-000000000001";
  await desktop.getAppSettings();
  await desktop.setAutoStart(true);
  await desktop.chooseDataDirectory();
  await desktop.requestDataMigration({ selectionId });
  await desktop.consumeMigrationResult();
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { channel: "settings:get" },
    { channel: "settings:set-auto-start", payload: { enabled: true } },
    { channel: "settings:choose-data-directory" },
    { channel: "settings:request-data-migration", payload: { selectionId } },
    { channel: "settings:consume-migration-result" }
  ]);
});

test("preload rejects nonboolean auto-start and renderer-owned migration paths before IPC", async () => {
  const { desktop, calls } = loadPreload();
  for (const value of [1, 0, "true", null, undefined, { enabled: true }]) {
    await assert.rejects(desktop.setAutoStart(value));
  }
  for (const value of ["C:\\data", null, {}, [], { selectionId: "" }, { selectionId: 1 },
    { selectionId: "fabricated" }, { path: "C:\\data" },
    { selectionId: "00000000-0000-4000-8000-000000000001", path: "C:\\data" }]) {
    await assert.rejects(desktop.requestDataMigration(value));
  }
  assert.deepEqual(calls, []);
});

test("preload settings API exposes no generic Electron, filesystem, chooser or path extraction capabilities", () => {
  const { desktop } = loadPreload();
  for (const name of ["ipcRenderer", "invoke", "send", "electron", "fs", "filesystem", "dialog", "showOpenDialog",
    "getPathForFile", "webUtils", "readFile", "writeFile", "subscribe"]) {
    assert.equal(desktop[name], undefined, name);
  }
});
