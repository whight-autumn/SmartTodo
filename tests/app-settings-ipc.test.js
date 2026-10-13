const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { registerAppSettingsIpc } = require("../app-settings-ipc.js");
const { readBootstrapState, buildBootstrapPath, performPendingMigration } = require("../runtime-data-manager.js");

const CHANNELS = ["settings:get", "settings:set-auto-start", "settings:choose-data-directory",
  "settings:request-data-migration", "settings:consume-migration-result"];

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "smarttodo-settings-ipc-"));
  const appDataPath = path.join(root, "app-data");
  let runtimePath = path.join(appDataPath, "SmartTodo", "运行数据");
  const targetPath = path.join(root, "target");
  fs.mkdirSync(runtimePath, { recursive: true });
  const handlers = new Map();
  const calls = [];
  const sender = { id: 31, isDestroyed: () => false };
  const window = { webContents: sender, isDestroyed: () => false };
  const app = {
    enabled: false,
    getLoginItemSettings(options) { calls.push(["readLogin", options]); return { openAtLogin: this.enabled }; },
    setLoginItemSettings(options) { calls.push(["writeLogin", options]); this.enabled = options.openAtLogin; },
    relaunch() {
      calls.push(["relaunch"]);
      assert.equal(readBootstrapState({ appDataPath }).pendingMigration.targetPath, targetPath);
    },
    quit() { calls.push(["quit"]); }
  };
  const dialog = {
    result: { canceled: false, filePaths: [targetPath] },
    async showOpenDialog(parent, options) { calls.push(["choose", parent, options]); return this.result; }
  };
  const registration = registerAppSettingsIpc({
    ipcMain: { handle(channel, handler) { handlers.set(channel, handler); }, removeHandler(channel) { handlers.delete(channel); } },
    dialog, app, getMainWindow: () => window, getRuntimePath: () => runtimePath,
    appDataPath, homePath: path.join(root, "home"), appPath: path.join(root, "app"),
    async flushBeforeRelaunch() {
      calls.push(["flush"]);
      fs.writeFileSync(path.join(runtimePath, "flushed.txt"), "latest state");
    }
  });
  t.after(() => { registration.dispose(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, appDataPath, targetPath, app, dialog, sender, window, registration, handlers, calls,
    invoke: (channel, ...args) => handlers.get(channel)({ sender }, ...args),
    getRuntimePath: () => runtimePath, setRuntimePath: value => { runtimePath = value; } };
}

function assertError(result, code) {
  assert.deepEqual(Object.keys(result), ["ok", "error"]);
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.error), ["code", "message"]);
  assert.equal(result.error.code, code);
  assert.ok(result.error.message.length > 0 && result.error.message.length <= 300);
}

test("registers only five settings channels and disposal removes them", t => {
  const f = fixture(t);
  assert.deepEqual([...f.handlers.keys()], CHANNELS);
  f.registration.dispose();
  assert.equal(f.handlers.size, 0);
});

test("reads system auto-start state and the resolved runtime path without consuming results", async t => {
  const f = fixture(t);
  assert.deepEqual(await f.invoke("settings:get"), {
    autoStart: { available: true, enabled: false },
    storage: { currentPath: f.getRuntimePath(), isDefault: true }, migrationResult: null
  });
  f.app.enabled = true;
  f.setRuntimePath(f.targetPath);
  const snapshot = await f.invoke("settings:get");
  assert.deepEqual(snapshot.autoStart, { available: true, enabled: true });
  assert.deepEqual(snapshot.storage, { currentPath: f.targetPath, isDefault: false });
  assert.equal(fs.existsSync(buildBootstrapPath(f.appDataPath)), false);
});

test("auto-start setter reads back authoritative OS state and rejects coercion or extra fields", async t => {
  const f = fixture(t);
  assert.deepEqual(await f.invoke("settings:set-auto-start", { enabled: true }), { available: true, enabled: true });
  assert.deepEqual(f.calls.find(call => call[0] === "writeLogin")[1], {
    openAtLogin: true, path: process.execPath, args: ["--hidden"]
  });
  f.app.setLoginItemSettings = () => {};
  assert.deepEqual(await f.invoke("settings:set-auto-start", { enabled: false }), { available: true, enabled: true });
  for (const payload of [true, { enabled: 1 }, { enabled: "false" }, { enabled: true, path: "other.exe" }, {}, null]) {
    assertError(await f.invoke("settings:set-auto-start", payload), "INVALID_PAYLOAD");
  }
});

test("all settings operations reject senders other than the live main window", async t => {
  const f = fixture(t);
  for (const channel of CHANNELS) {
    assertError(await f.handlers.get(channel)({ sender: { id: 32 } }), "INVALID_SENDER");
  }
  f.window.isDestroyed = () => true;
  assertError(await f.invoke("settings:get"), "INVALID_SENDER");
  assert.deepEqual(f.calls, []);
});

test("read and chooser operations reject renderer payloads and extra IPC arguments", async t => {
  const f = fixture(t);
  for (const channel of ["settings:get", "settings:choose-data-directory", "settings:consume-migration-result"]) {
    assertError(await f.invoke(channel, { path: f.targetPath }), "INVALID_PAYLOAD");
    assertError(await f.invoke(channel, undefined, "extra"), "INVALID_PAYLOAD");
  }
  assertError(await f.invoke("settings:set-auto-start", { enabled: true }, "extra"), "INVALID_PAYLOAD");
  assert.deepEqual(f.calls, []);
});

test("chooser issues a UUID selection only for the native main-owned directory", async t => {
  const f = fixture(t);
  const selected = await f.invoke("settings:choose-data-directory");
  assert.deepEqual(Object.keys(selected), ["canceled", "selectionId", "path"]);
  assert.equal(selected.canceled, false);
  assert.match(selected.selectionId, /^[0-9a-f-]{36}$/);
  assert.equal(selected.path, f.targetPath);
  assert.deepEqual(f.calls[0], ["choose", f.window, { properties: ["openDirectory", "createDirectory"] }]);
});

test("cancel and empty chooser results create no selection capability", async t => {
  const f = fixture(t);
  for (const result of [{ canceled: true, filePaths: [f.targetPath] }, { canceled: false, filePaths: [] }]) {
    f.dialog.result = result;
    assert.deepEqual(await f.invoke("settings:choose-data-directory"), { canceled: true, selectionId: null, path: null });
  }
});

test("canceling or returning no directory preserves the prior unused native selection", async t => {
  for (const canceled of [true, false]) {
    const f = fixture(t);
    const selected = await f.invoke("settings:choose-data-directory");
    f.dialog.result = { canceled, filePaths: canceled ? [f.targetPath] : [] };
    assert.deepEqual(await f.invoke("settings:choose-data-directory"), { canceled: true, selectionId: null, path: null });
    assert.deepEqual(await f.invoke("settings:request-data-migration", { selectionId: selected.selectionId }), { queued: true });
  }
});

test("migration flushes before queueing the exact native path then relaunches and quits", async t => {
  const f = fixture(t);
  const selected = await f.invoke("settings:choose-data-directory");
  assert.deepEqual(await f.invoke("settings:request-data-migration", { selectionId: selected.selectionId }), { queued: true });
  assert.deepEqual(f.calls.map(call => call[0]), ["choose", "flush", "relaunch", "quit"]);
  assert.equal(fs.readFileSync(path.join(f.getRuntimePath(), "flushed.txt"), "utf8"), "latest state");
  const pending = readBootstrapState({ appDataPath: f.appDataPath }).pendingMigration;
  assert.equal(pending.sourcePath, f.getRuntimePath());
  assert.equal(pending.targetPath, f.targetPath);
  assertError(await f.invoke("settings:request-data-migration", { selectionId: selected.selectionId }), "INVALID_SELECTION");
});

test("migration rejects fabricated IDs, paths, extra fields, and invalid token shapes", async t => {
  const f = fixture(t);
  assertError(await f.invoke("settings:request-data-migration", { selectionId: "00000000-0000-4000-8000-000000000001" }), "INVALID_SELECTION");
  const selected = await f.invoke("settings:choose-data-directory");
  for (const payload of [selected.selectionId, { path: f.targetPath }, { selectionId: 1 }, {},
    { selectionId: selected.selectionId, targetPath: f.targetPath }]) {
    assertError(await f.invoke("settings:request-data-migration", payload), "INVALID_PAYLOAD");
  }
  assert.equal(fs.existsSync(buildBootstrapPath(f.appDataPath)), false);
  assert.equal(f.calls.some(call => call[0] === "flush"), false);
  assertError(await f.invoke("settings:request-data-migration", { selectionId: selected.selectionId }), "INVALID_SELECTION");
});

test("selection is bound to sender id even if the main window object is reused", async t => {
  const f = fixture(t);
  const selected = await f.invoke("settings:choose-data-directory");
  f.sender.id = 32;
  assertError(await f.invoke("settings:request-data-migration", { selectionId: selected.selectionId }), "INVALID_SELECTION");
  f.sender.id = 31;
  assertError(await f.invoke("settings:request-data-migration", { selectionId: selected.selectionId }), "INVALID_SELECTION");
  assert.equal(f.calls.some(call => call[0] === "flush"), false);
});

test("expired native selections cannot queue a migration", async t => {
  const f = fixture(t);
  let now = 1_000;
  t.mock.method(Date, "now", () => now);
  const selected = await f.invoke("settings:choose-data-directory");
  now += 5 * 60 * 1000;
  assertError(await f.invoke("settings:request-data-migration", { selectionId: selected.selectionId }), "INVALID_SELECTION");
  assert.equal(fs.existsSync(buildBootstrapPath(f.appDataPath)), false);
});

test("a second chooser invalidates the previous unused selection", async t => {
  const f = fixture(t);
  const first = await f.invoke("settings:choose-data-directory");
  await f.invoke("settings:choose-data-directory");
  assertError(await f.invoke("settings:request-data-migration", { selectionId: first.selectionId }), "INVALID_SELECTION");
});

test("flush failure consumes the selection without queueing or exiting", async t => {
  const f = fixture(t);
  const selected = await f.invoke("settings:choose-data-directory");
  // Remove the source so the fixture's real flush fails at its filesystem boundary.
  fs.rmSync(f.getRuntimePath(), { recursive: true });
  assertError(await f.invoke("settings:request-data-migration", { selectionId: selected.selectionId }), "MIGRATION_FAILED");
  assert.equal(fs.existsSync(buildBootstrapPath(f.appDataPath)), false);
  assert.deepEqual(f.calls.map(call => call[0]), ["choose", "flush"]);
  assertError(await f.invoke("settings:request-data-migration", { selectionId: selected.selectionId }), "INVALID_SELECTION");
});

test("invalid or nonempty migration target consumes the token without relaunch or quit", async t => {
  const f = fixture(t);
  fs.mkdirSync(f.targetPath);
  fs.writeFileSync(path.join(f.targetPath, "private.txt"), "preserve me");
  const selected = await f.invoke("settings:choose-data-directory");
  const result = await f.invoke("settings:request-data-migration", { selectionId: selected.selectionId });
  assertError(result, "MIGRATION_FAILED");
  assert.equal(result.error.message.includes(f.targetPath), false);
  assert.equal(fs.existsSync(buildBootstrapPath(f.appDataPath)), false);
  assert.equal(fs.readFileSync(path.join(f.targetPath, "private.txt"), "utf8"), "preserve me");
  assert.equal(f.calls.some(call => ["relaunch", "quit"].includes(call[0])), false);
  assertError(await f.invoke("settings:request-data-migration", { selectionId: selected.selectionId }), "INVALID_SELECTION");
});

test("relaunch failure leaves the queued request recoverable and does not quit", async t => {
  const f = fixture(t);
  f.app.relaunch = () => { throw new Error("secret ".repeat(1000)); };
  const selected = await f.invoke("settings:choose-data-directory");
  const result = await f.invoke("settings:request-data-migration", { selectionId: selected.selectionId });
  assertError(result, "MIGRATION_FAILED");
  assert.equal(result.error.message.includes("secret"), false);
  assert.ok(readBootstrapState({ appDataPath: f.appDataPath }).pendingMigration);
  assert.equal(f.calls.some(call => call[0] === "quit"), false);
});

test("concurrent requests cannot flush or relaunch the same selection twice", async t => {
  const f = fixture(t);
  const selected = await f.invoke("settings:choose-data-directory");
  const results = await Promise.all([
    f.invoke("settings:request-data-migration", { selectionId: selected.selectionId }),
    f.invoke("settings:request-data-migration", { selectionId: selected.selectionId })
  ]);
  assert.deepEqual(results[0], { queued: true });
  assertError(results[1], "INVALID_SELECTION");
  assert.equal(f.calls.filter(call => call[0] === "flush").length, 1);
  assert.equal(f.calls.filter(call => call[0] === "relaunch").length, 1);
});

test("snapshots preserve migration results until consume atomically clears them", async t => {
  const f = fixture(t);
  const selected = await f.invoke("settings:choose-data-directory");
  await f.invoke("settings:request-data-migration", { selectionId: selected.selectionId });
  const completed = performPendingMigration({ appDataPath: f.appDataPath, homePath: path.join(f.root, "home"), appPath: path.join(f.root, "app") });
  f.setRuntimePath(completed.runtimePath);
  assert.deepEqual((await f.invoke("settings:get")).migrationResult, completed.migrationResult);
  assert.deepEqual((await f.invoke("settings:get")).migrationResult, completed.migrationResult);
  assert.deepEqual(await f.invoke("settings:consume-migration-result"), completed.migrationResult);
  assert.equal(await f.invoke("settings:consume-migration-result"), null);
  assert.equal(readBootstrapState({ appDataPath: f.appDataPath }).migrationResult, null);
});

test("native OS and dialog errors return bounded non-sensitive results", async t => {
  const f = fixture(t);
  f.app.getLoginItemSettings = () => { throw new Error("private registry information"); };
  assertError(await f.invoke("settings:get"), "SETTINGS_READ_FAILED");
  const result = await f.invoke("settings:set-auto-start", { enabled: true });
  assertError(result, "AUTO_START_FAILED");
  assert.equal(result.error.message.includes("private"), false);
  f.dialog.showOpenDialog = async () => { throw new Error("private directory"); };
  assertError(await f.invoke("settings:choose-data-directory"), "DIRECTORY_CHOICE_FAILED");
});

test("atomic queue write failure consumes the token and preserves the current runtime without exiting", async t => {
  const f = fixture(t);
  const selected = await f.invoke("settings:choose-data-directory");
  const rename = fs.renameSync;
  t.mock.method(fs, "renameSync", (source, target) => {
    if (target === buildBootstrapPath(f.appDataPath)) throw new Error("private OS information");
    return rename(source, target);
  });
  assertError(await f.invoke("settings:request-data-migration", { selectionId: selected.selectionId }), "MIGRATION_FAILED");
  assert.equal(fs.existsSync(buildBootstrapPath(f.appDataPath)), false);
  assert.ok(fs.existsSync(f.getRuntimePath()));
  assert.equal(f.calls.some(call => ["relaunch", "quit"].includes(call[0])), false);
  assertError(await f.invoke("settings:request-data-migration", { selectionId: selected.selectionId }), "INVALID_SELECTION");
});

test("failed result consumption preserves the result for the next successful confirmation", async t => {
  const f = fixture(t);
  const selected = await f.invoke("settings:choose-data-directory");
  await f.invoke("settings:request-data-migration", { selectionId: selected.selectionId });
  const completed = performPendingMigration({ appDataPath: f.appDataPath, homePath: path.join(f.root, "home"), appPath: path.join(f.root, "app") });
  const rename = fs.renameSync;
  const mocked = t.mock.method(fs, "renameSync", (source, target) => {
    if (target === buildBootstrapPath(f.appDataPath)) throw new Error("private OS information");
    return rename(source, target);
  });
  assertError(await f.invoke("settings:consume-migration-result"), "MIGRATION_RESULT_FAILED");
  assert.deepEqual(readBootstrapState({ appDataPath: f.appDataPath }).migrationResult, completed.migrationResult);
  mocked.mock.restore();
  assert.deepEqual(await f.invoke("settings:consume-migration-result"), completed.migrationResult);
});

test("disposal during an open chooser cannot issue another selection", async t => {
  const f = fixture(t);
  let resolveDialog;
  f.dialog.showOpenDialog = () => new Promise(resolve => { resolveDialog = resolve; });
  const choosing = f.invoke("settings:choose-data-directory");
  f.registration.dispose();
  resolveDialog({ canceled: false, filePaths: [f.targetPath] });
  assertError(await choosing, "INVALID_SENDER");
});

test("rejected sender or extra migration arguments revoke an identifiable selection", async t => {
  const f = fixture(t);
  const first = await f.invoke("settings:choose-data-directory");
  assertError(await f.handlers.get("settings:request-data-migration")({ sender: { id: 32 } },
    { selectionId: first.selectionId }), "INVALID_SENDER");
  assertError(await f.invoke("settings:request-data-migration", { selectionId: first.selectionId }), "INVALID_SELECTION");
  const second = await f.invoke("settings:choose-data-directory");
  assertError(await f.invoke("settings:request-data-migration", { selectionId: second.selectionId }, "extra"), "INVALID_PAYLOAD");
  assertError(await f.invoke("settings:request-data-migration", { selectionId: second.selectionId }), "INVALID_SELECTION");
});
