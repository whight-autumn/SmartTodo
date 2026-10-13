const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const {
  buildBootstrapPath,
  readBootstrapState,
  queueMigration,
  validateMigrationPaths,
  buildFileManifest,
  performPendingMigration,
  consumeMigrationResult
} = require("../runtime-data-manager.js");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "smarttodo-runtime-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const options = {
    appDataPath: path.join(root, "app-data"),
    sourcePath: path.join(root, "source"),
    targetPath: path.join(root, "target"),
    homePath: path.join(root, "home"),
    appPath: path.join(root, "app"),
    requestId: "request-1",
    createdAt: "2026-10-13T02:00:00.000Z"
  };
  fs.mkdirSync(options.sourcePath);
  return { root, ...options };
}

function writeBootstrap(options, value) {
  const filePath = path.join(options.appDataPath, "SmartTodo", "bootstrap.json");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, typeof value === "string" ? value : JSON.stringify(value));
}

test("bootstrap defaults to the managed runtime path", t => {
  const options = fixture(t);
  assert.equal(buildBootstrapPath(options.appDataPath), path.join(options.appDataPath, "SmartTodo", "bootstrap.json"));
  assert.deepEqual(readBootstrapState(options), {
    schemaVersion: 1,
    activeRuntimePath: path.join(options.appDataPath, "SmartTodo", "运行数据"),
    pendingMigration: null,
    migrationResult: null
  });
  assert.equal(fs.existsSync(buildBootstrapPath(options.appDataPath)), false);
});

for (const corrupt of [false, true]) {
  test(`${corrupt ? "corrupt" : "missing"} bootstrap refuses a real default directory junction`, t => {
    const options = fixture(t);
    const directory = path.join(options.appDataPath, "SmartTodo");
    fs.mkdirSync(directory, { recursive: true });
    if (corrupt) writeBootstrap(options, "{");
    const defaultPath = path.join(directory, "运行数据");
    fs.symlinkSync(options.sourcePath, defaultPath, "junction");
    assert.throws(() => readBootstrapState(options), { code: "ERR_RUNTIME_DATA_UNAVAILABLE" });
    assert.throws(() => performPendingMigration(options), { code: "ERR_RUNTIME_DATA_UNAVAILABLE" });
    assert.equal(fs.lstatSync(defaultPath).isSymbolicLink(), true);
    assert.deepEqual(fs.readdirSync(options.sourcePath), []);
  });
}

test("default path validation errors cannot return a writable fallback", t => {
  const options = fixture(t);
  const defaultRuntimePath = path.join(options.root, "unsafe-default");
  const original = fs.lstatSync;
  t.mock.method(fs, "lstatSync", (entry, ...args) => {
    if (entry === defaultRuntimePath) return { isSymbolicLink: () => true, isDirectory: () => true };
    return original(entry, ...args);
  });
  assert.throws(() => readBootstrapState({ ...options, defaultRuntimePath }), { code: "ERR_RUNTIME_DATA_UNAVAILABLE" });
  assert.equal(fs.existsSync(defaultRuntimePath), false);
  assert.equal(fs.existsSync(buildBootstrapPath(options.appDataPath)), false);
});

test("result categories survive bootstrap validation while unknown categories are rejected", t => {
  const options = fixture(t);
  const result = { status: "failure", requestId: "request-1", sourcePath: options.sourcePath,
    targetPath: options.targetPath, completedAt: options.createdAt,
    failureCode: "verification", warningCodes: ["staging-retained", "rollback-backup"], error: "RAW_MARKER" };
  const state = { schemaVersion: 1, activeRuntimePath: options.sourcePath, pendingMigration: null, migrationResult: result };
  writeBootstrap(options, state);
  assert.deepEqual(readBootstrapState(options).migrationResult, result);
  for (const change of [{ failureCode: "RAW_MARKER" }, { warningCodes: ["RAW_MARKER"] },
    { warningCodes: ["staging-retained", "staging-retained"] }]) {
    writeBootstrap(options, { ...state, migrationResult: { ...result, ...change } });
    assert.equal(readBootstrapState(options).migrationResult.failureCode, "configuration");
  }
});

test("legacy safe failure and warning summaries map to closed categories", t => {
  const options = fixture(t);
  const result = { status: "failure", requestId: "request-1", sourcePath: options.sourcePath,
    targetPath: options.targetPath, completedAt: options.createdAt,
    error: "Runtime data verification failed. The original directory is still active.",
    warning: "The request staging directory could not be safely removed and was retained." };
  writeBootstrap(options, { schemaVersion: 1, activeRuntimePath: options.sourcePath, pendingMigration: null, migrationResult: result });
  assert.deepEqual(readBootstrapState(options).migrationResult, { ...result, failureCode: "verification", warningCodes: ["staging-retained"] });
});

test("a retained request staging directory produces a safe persisted warning category", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  queueMigration(options);
  t.mock.method(fs, "copyFileSync", () => { throw new Error("RAW_MARKER"); });
  const originalRemove = fs.rmSync;
  t.mock.method(fs, "rmSync", (entry, ...args) => {
    if (path.basename(entry) === ".target.staging-request-1") throw new Error("RAW_MARKER");
    return originalRemove(entry, ...args);
  });
  const outcome = performPendingMigration(options);
  assert.equal(outcome.runtimePath, options.sourcePath);
  assert.deepEqual(outcome.migrationResult.warningCodes, ["staging-retained"]);
  assert.deepEqual(consumeMigrationResult(options), outcome.migrationResult);
  assert.equal(consumeMigrationResult(options), null);
  assert.ok(fs.existsSync(path.join(options.root, ".target.staging-request-1")));
  assert.doesNotMatch(JSON.stringify(outcome), /RAW_MARKER/);
});

test("an ordinary file at the missing-bootstrap default path stops startup", t => {
  const options = fixture(t);
  const defaultRuntimePath = path.join(options.root, "default-file");
  fs.writeFileSync(defaultRuntimePath, "preserve");
  assert.throws(() => performPendingMigration({ ...options, defaultRuntimePath }), { code: "ERR_RUNTIME_DATA_UNAVAILABLE" });
  assert.equal(fs.readFileSync(defaultRuntimePath, "utf8"), "preserve");
});

test("a valid custom bootstrap loads when the unused default path is a file", t => {
  const options = fixture(t);
  const state = { schemaVersion: 1, activeRuntimePath: options.sourcePath, pendingMigration: null, migrationResult: null };
  writeBootstrap(options, state);
  fs.writeFileSync(path.join(options.appDataPath, "SmartTodo", "运行数据"), "unrelated file");
  assert.deepEqual(readBootstrapState(options), state);
  assert.deepEqual(performPendingMigration(options), { runtimePath: options.sourcePath, migrationResult: null });
});

test("a valid custom bootstrap loads when the unused default path is a junction", t => {
  const options = fixture(t);
  const state = { schemaVersion: 1, activeRuntimePath: options.sourcePath, pendingMigration: null, migrationResult: null };
  writeBootstrap(options, state);
  fs.symlinkSync(options.sourcePath, path.join(options.appDataPath, "SmartTodo", "运行数据"), "junction");
  assert.deepEqual(readBootstrapState(options), state);
  assert.deepEqual(performPendingMigration(options), { runtimePath: options.sourcePath, migrationResult: null });
});

test("a missing custom active runtime stops startup instead of selecting an empty profile", t => {
  const options = fixture(t);
  const missingCustomPath = path.join(options.root, "missing-custom-data");
  writeBootstrap(options, { schemaVersion: 1, activeRuntimePath: missingCustomPath,
    pendingMigration: null, migrationResult: null });
  assert.throws(() => readBootstrapState(options), { code: "ERR_RUNTIME_DATA_UNAVAILABLE" });
  assert.throws(() => performPendingMigration(options), { code: "ERR_RUNTIME_DATA_UNAVAILABLE" });
  assert.equal(fs.existsSync(missingCustomPath), false);
  assert.equal(fs.existsSync(path.join(options.appDataPath, "SmartTodo", "运行数据")), false);
});

test("bootstrap rejects malformed and relative custom paths", t => {
  const options = fixture(t);
  const fallback = path.join(options.appDataPath, "SmartTodo", "运行数据");
  for (const invalid of ["{", [], { schemaVersion: 1, activeRuntimePath: "relative/data" },
    { schemaVersion: 2, activeRuntimePath: options.sourcePath }]) {
    writeBootstrap(options, invalid);
    const state = readBootstrapState(options);
    assert.equal(state.activeRuntimePath, fallback);
    assert.equal(state.pendingMigration, null);
    assert.equal(state.migrationResult.status, "failure");
    assert.equal(state.migrationResult.failureCode, "configuration");
  }
  writeBootstrap(options, {
    schemaVersion: 1,
    activeRuntimePath: path.join(options.root, "unused", "..", "source"),
    pendingMigration: null,
    migrationResult: null
  });
  assert.equal(readBootstrapState(options).activeRuntimePath, options.sourcePath);
});

test("migration rejects same nested root home and app paths", t => {
  const options = fixture(t);
  for (const [sourcePath, targetPath] of [
    [options.sourcePath, options.sourcePath],
    [options.sourcePath, path.join(options.sourcePath, "nested")],
    [path.join(options.sourcePath, "nested"), options.sourcePath],
    [options.sourcePath, path.parse(options.root).root],
    [options.sourcePath, options.homePath],
    [options.homePath, options.targetPath],
    [options.sourcePath, options.appPath],
    [options.sourcePath, options.root],
    ["relative", options.targetPath]
  ]) {
    assert.throws(() => validateMigrationPaths({ ...options, sourcePath, targetPath }));
  }
  assert.deepEqual(validateMigrationPaths({
    ...options, targetPath: path.join(options.root, "unused", "..", "target")
  }), { sourcePath: options.sourcePath, targetPath: options.targetPath });
  fs.mkdirSync(options.targetPath);
  fs.writeFileSync(path.join(options.targetPath, "keep.txt"), "user data");
  assert.throws(() => validateMigrationPaths(options));
  assert.equal(fs.readFileSync(path.join(options.targetPath, "keep.txt"), "utf8"), "user data");
});

test("migration rejects runtime directories nested inside the application directory", t => {
  const options = fixture(t);
  fs.mkdirSync(options.appPath);
  for (const field of ["sourcePath", "targetPath"]) {
    const candidate = path.join(options.appPath, "runtime-data");
    if (field === "sourcePath") fs.mkdirSync(candidate);
    assert.throws(() => validateMigrationPaths({ ...options, [field]: candidate }));
  }
  const packagedAppPath = path.join(options.appPath, "resources", "app.asar");
  fs.mkdirSync(path.dirname(packagedAppPath), { recursive: true });
  fs.writeFileSync(packagedAppPath, "asar");
  assert.throws(() => validateMigrationPaths({ ...options,
    appPath: packagedAppPath, targetPath: path.join(path.dirname(packagedAppPath), "runtime-data") }));
});

test("queueMigration writes an atomic pending request", t => {
  const options = fixture(t);
  const state = queueMigration(options);
  const bootstrapPath = path.join(options.appDataPath, "SmartTodo", "bootstrap.json");
  assert.deepEqual(state, {
    schemaVersion: 1,
    activeRuntimePath: options.sourcePath,
    pendingMigration: {
      requestId: "request-1", sourcePath: options.sourcePath, targetPath: options.targetPath,
      createdAt: "2026-10-13T02:00:00.000Z"
    },
    migrationResult: null
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(bootstrapPath, "utf8")), state);
  const oldContents = fs.readFileSync(bootstrapPath, "utf8");
  assert.throws(() => queueMigration({ ...options, targetPath: options.sourcePath }));
  assert.throws(() => queueMigration({ ...options, requestId: "../escape" }));
  assert.equal(fs.readFileSync(bootstrapPath, "utf8"), oldContents);
  assert.deepEqual(fs.readdirSync(path.dirname(bootstrapPath)), ["bootstrap.json"]);
});

function writeRuntimeFiles(options) {
  fs.mkdirSync(path.join(options.sourcePath, "Local Storage", "leveldb"), { recursive: true });
  fs.mkdirSync(path.join(options.sourcePath, "task-attachments", "task-1"), { recursive: true });
  fs.mkdirSync(path.join(options.sourcePath, "empty-directory"));
  fs.writeFileSync(path.join(options.sourcePath, "Local Storage", "leveldb", "000003.log"), "tasks, chats, keys");
  fs.writeFileSync(path.join(options.sourcePath, "task-attachments", "task-1", "附件.bin"), Buffer.alloc(1024 * 1024 + 7, 42));
  fs.writeFileSync(path.join(options.sourcePath, "widget-preferences.json"), '{"visible":true}');
}

test("manifest hashes every ordinary file in stable relative order", t => {
  const options = fixture(t);
  fs.mkdirSync(path.join(options.sourcePath, "nested"));
  fs.writeFileSync(path.join(options.sourcePath, "z.txt"), "abc");
  fs.writeFileSync(path.join(options.sourcePath, "nested", "a.bin"), Buffer.alloc(1024 * 1024 + 7, 42));
  fs.writeFileSync(path.join(options.sourcePath, "a.txt"), "");
  assert.deepEqual(buildFileManifest(options.sourcePath), [
    { relativePath: "a.txt", size: 0, sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
    { relativePath: "nested/a.bin", size: 1024 * 1024 + 7, sha256: createHash("sha256").update(Buffer.alloc(1024 * 1024 + 7, 42)).digest("hex") },
    { relativePath: "z.txt", size: 3, sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" }
  ]);
});

test("migration copies all files verifies hashes and keeps a timestamped backup", t => {
  const options = fixture(t);
  writeRuntimeFiles(options);
  fs.mkdirSync(options.targetPath);
  const original = buildFileManifest(options.sourcePath);
  queueMigration(options);
  const outcome = performPendingMigration({ ...options, now: "2026-10-13T02:03:04.000Z" });
  assert.equal(outcome.runtimePath, options.targetPath);
  assert.equal(outcome.migrationResult.status, "success");
  assert.equal(outcome.migrationResult.backupPath, path.join(options.root, "source.backup-20261013-020304"));
  assert.match(path.basename(outcome.migrationResult.backupPath), /^source\.backup-\d{8}-\d{6}$/);
  assert.deepEqual(buildFileManifest(options.targetPath), original);
  assert.deepEqual(buildFileManifest(outcome.migrationResult.backupPath), original);
  assert.equal(fs.existsSync(path.join(options.targetPath, "empty-directory")), true);
  assert.equal(fs.existsSync(options.sourcePath), false);
  assert.equal(readBootstrapState(options).activeRuntimePath, options.targetPath);
  assert.equal(readBootstrapState(options).pendingMigration, null);
  assert.deepEqual(consumeMigrationResult(options), outcome.migrationResult);
  assert.equal(consumeMigrationResult(options), null);
  assert.deepEqual(performPendingMigration(options), { runtimePath: options.targetPath, migrationResult: null });
  assert.equal(fs.readdirSync(options.root).some(name => name.includes("staging")), false);
});

test("migration rejects a symbolic link", t => {
  const options = fixture(t);
  const external = path.join(options.root, "external");
  fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, "keep.txt"), "outside user data");
  // Junctions are directory symbolic links and do not require Windows developer mode.
  fs.symlinkSync(external, path.join(options.sourcePath, "linked"), "junction");
  assert.throws(() => buildFileManifest(options.sourcePath));
  queueMigration(options);
  const outcome = performPendingMigration(options);
  assert.equal(outcome.runtimePath, options.sourcePath);
  assert.equal(outcome.migrationResult.status, "failure");
  assert.equal(fs.existsSync(options.targetPath), false);
  assert.equal(fs.readFileSync(path.join(external, "keep.txt"), "utf8"), "outside user data");
  assert.throws(() => validateMigrationPaths({ ...options, targetPath: path.join(options.sourcePath, "linked", "child") }));
});

test("migration revalidates a destination changed after queueing", t => {
  const options = fixture(t);
  writeRuntimeFiles(options);
  queueMigration(options);
  fs.mkdirSync(options.targetPath);
  fs.writeFileSync(path.join(options.targetPath, "keep.txt"), "new user data");
  const outcome = performPendingMigration(options);
  assert.equal(outcome.runtimePath, options.sourcePath);
  assert.equal(outcome.migrationResult.status, "failure");
  assert.equal(fs.readFileSync(path.join(options.targetPath, "keep.txt"), "utf8"), "new user data");
  assert.equal(readBootstrapState(options).pendingMigration, null);
});

test("migration detects a source file changed during verification", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  queueMigration(options);
  const originalCopy = fs.copyFileSync;
  t.mock.method(fs, "copyFileSync", (source, target, flags) => {
    originalCopy(source, target, flags);
    fs.writeFileSync(source, "modified");
  });
  const outcome = performPendingMigration(options);
  assert.equal(outcome.runtimePath, options.sourcePath);
  assert.equal(outcome.migrationResult.status, "failure");
  assert.equal(fs.readFileSync(path.join(options.sourcePath, "data.txt"), "utf8"), "modified");
  assert.equal(fs.existsSync(options.targetPath), false);
  assert.equal(fs.readdirSync(options.root).some(name => name.includes("staging")), false);
});

test("failed migration boots from the old path and records one consumable result", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  queueMigration(options);
  t.mock.method(fs, "copyFileSync", () => { throw new Error("secret API value must not leak"); });
  const outcome = performPendingMigration(options);
  assert.equal(outcome.runtimePath, options.sourcePath);
  assert.equal(outcome.migrationResult.status, "failure");
  assert.equal(outcome.migrationResult.requestId, "request-1");
  assert.equal(outcome.migrationResult.error.includes("secret"), false);
  assert.equal(outcome.migrationResult.failureCode, "copy");
  assert.equal(fs.readFileSync(path.join(options.sourcePath, "data.txt"), "utf8"), "original");
  assert.equal(fs.existsSync(options.targetPath), false);
  assert.equal(readBootstrapState(options).pendingMigration, null);
  assert.deepEqual(consumeMigrationResult(options), outcome.migrationResult);
  assert.equal(consumeMigrationResult(options), null);
  assert.equal(readBootstrapState(options).activeRuntimePath, options.sourcePath);
  assert.equal(fs.readdirSync(options.root).some(name => name.includes("staging")), false);
});

test("a destination replaced by a junction fails without losing the active path", t => {
  const options = fixture(t);
  queueMigration(options);
  const external = path.join(options.root, "external");
  fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, "keep.txt"), "outside");
  fs.symlinkSync(external, options.targetPath, "junction");
  const outcome = performPendingMigration(options);
  assert.equal(outcome.runtimePath, options.sourcePath);
  assert.equal(outcome.migrationResult.status, "failure");
  assert.equal(readBootstrapState(options).activeRuntimePath, options.sourcePath);
  assert.deepEqual(consumeMigrationResult(options), outcome.migrationResult);
  assert.equal(consumeMigrationResult(options), null);
  assert.equal(fs.readFileSync(path.join(external, "keep.txt"), "utf8"), "outside");
});

test("bootstrap storage cannot be included in a runtime migration", t => {
  const options = fixture(t);
  const bootstrapDirectory = path.join(options.appDataPath, "SmartTodo");
  fs.mkdirSync(bootstrapDirectory, { recursive: true });
  assert.throws(() => queueMigration({ ...options, sourcePath: bootstrapDirectory }));
  assert.throws(() => queueMigration({ ...options, targetPath: bootstrapDirectory }));
  assert.equal(fs.existsSync(path.join(bootstrapDirectory, "bootstrap.json")), false);
});

test("queue write failure preserves old bootstrap contents and removes its temporary file", t => {
  const options = fixture(t);
  const state = { schemaVersion: 1, activeRuntimePath: options.sourcePath, pendingMigration: null, migrationResult: null };
  writeBootstrap(options, state);
  const bootstrapPath = buildBootstrapPath(options.appDataPath);
  const original = fs.readFileSync(bootstrapPath, "utf8");
  t.mock.method(fs, "renameSync", () => { throw new Error("permission denied"); });
  assert.throws(() => queueMigration(options));
  assert.equal(fs.readFileSync(bootstrapPath, "utf8"), original);
  assert.deepEqual(fs.readdirSync(path.dirname(bootstrapPath)), ["bootstrap.json"]);
});

test("hash mismatch rejects a corrupted staging copy", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  queueMigration(options);
  const originalCopy = fs.copyFileSync;
  t.mock.method(fs, "copyFileSync", (source, target, flags) => {
    originalCopy(source, target, flags);
    fs.writeFileSync(target, "corrupt!");
  });
  const outcome = performPendingMigration(options);
  assert.equal(outcome.runtimePath, options.sourcePath);
  assert.equal(outcome.migrationResult.status, "failure");
  assert.equal(fs.existsSync(options.targetPath), false);
  assert.equal(fs.readFileSync(path.join(options.sourcePath, "data.txt"), "utf8"), "original");
});

test("an unrelated staging directory is never reused or deleted", t => {
  const options = fixture(t);
  queueMigration(options);
  const stagingPath = path.join(options.root, ".target.staging-request-1");
  fs.mkdirSync(stagingPath);
  fs.writeFileSync(path.join(stagingPath, "keep.txt"), "unrelated");
  const outcome = performPendingMigration(options);
  assert.equal(outcome.runtimePath, options.sourcePath);
  assert.equal(outcome.migrationResult.status, "failure");
  assert.equal(fs.readFileSync(path.join(stagingPath, "keep.txt"), "utf8"), "unrelated");
});

test("promotion rename failure retains source and cleans only request staging", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  queueMigration(options);
  const originalRename = fs.renameSync;
  t.mock.method(fs, "renameSync", (source, target) => {
    if (target === options.targetPath) throw new Error("locked target");
    originalRename(source, target);
  });
  const outcome = performPendingMigration(options);
  assert.equal(outcome.runtimePath, options.sourcePath);
  assert.equal(readBootstrapState(options).pendingMigration, null);
  assert.equal(fs.readFileSync(path.join(options.sourcePath, "data.txt"), "utf8"), "original");
  assert.equal(fs.existsSync(options.targetPath), false);
  assert.equal(fs.readdirSync(options.root).some(name => name.includes("staging")), false);
});

test("bootstrap commit failure retains both source and verified target", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  queueMigration(options);
  const originalRename = fs.renameSync;
  let failedOnce = false;
  t.mock.method(fs, "renameSync", (source, target) => {
    if (target === buildBootstrapPath(options.appDataPath) && JSON.parse(fs.readFileSync(source, "utf8")).activeRuntimePath === options.targetPath && !failedOnce) {
      failedOnce = true;
      throw new Error("locked bootstrap");
    }
    originalRename(source, target);
  });
  const outcome = performPendingMigration(options);
  assert.equal(outcome.runtimePath, options.sourcePath);
  assert.equal(outcome.migrationResult.status, "failure");
  assert.equal(readBootstrapState(options).activeRuntimePath, options.sourcePath);
  assert.equal(readBootstrapState(options).pendingMigration, null);
  assert.equal(fs.readFileSync(path.join(options.sourcePath, "data.txt"), "utf8"), "original");
  assert.equal(fs.readFileSync(path.join(options.targetPath, "data.txt"), "utf8"), "original");
});

test("backup rename failure records failure and keeps the original source active", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  queueMigration(options);
  const originalRename = fs.renameSync;
  let activatedTarget = false;
  t.mock.method(fs, "renameSync", (source, target) => {
    if (source === options.sourcePath) throw new Error("locked source");
    if (target === buildBootstrapPath(options.appDataPath) && JSON.parse(fs.readFileSync(source, "utf8")).activeRuntimePath === options.targetPath) {
      activatedTarget = true;
    }
    originalRename(source, target);
  });
  const outcome = performPendingMigration(options);
  assert.equal(outcome.runtimePath, options.sourcePath);
  assert.equal(outcome.migrationResult.status, "failure");
  assert.equal(outcome.migrationResult.backupPath, undefined);
  assert.ok(outcome.migrationResult.error);
  assert.equal(activatedTarget, false);
  assert.equal(readBootstrapState(options).activeRuntimePath, options.sourcePath);
  assert.deepEqual(consumeMigrationResult(options), outcome.migrationResult);
  assert.equal(fs.readFileSync(path.join(options.sourcePath, "data.txt"), "utf8"), "original");
  assert.equal(fs.readFileSync(path.join(options.targetPath, "data.txt"), "utf8"), "original");
});

test("source changes while the staged copy is hashed are detected", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  queueMigration(options);
  const originalOpen = fs.openSync;
  let changed = false;
  t.mock.method(fs, "openSync", (filePath, ...args) => {
    if (typeof filePath === "string" && filePath.includes(".staging-request-1") && !changed) {
      changed = true;
      fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "modified");
    }
    return originalOpen(filePath, ...args);
  });
  const outcome = performPendingMigration(options);
  assert.equal(outcome.runtimePath, options.sourcePath);
  assert.equal(outcome.migrationResult.status, "failure");
  assert.equal(fs.existsSync(options.targetPath), false);
});

test("backup rename and failure-record write failures stop startup and preserve both copies", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  queueMigration(options);
  const originalRename = fs.renameSync;
  t.mock.method(fs, "renameSync", (source, target) => {
    if (source === options.sourcePath) throw new Error("locked source");
    if (target === buildBootstrapPath(options.appDataPath) && JSON.parse(fs.readFileSync(source, "utf8")).pendingMigration === null) throw new Error("locked result");
    originalRename(source, target);
  });
  assert.throws(() => performPendingMigration(options), { code: "ERR_RUNTIME_DATA_UNAVAILABLE" });
  const persisted = readBootstrapState(options);
  assert.equal(persisted.activeRuntimePath, options.sourcePath);
  assert.equal(readBootstrapState(options).pendingMigration.phase, "backup-planned");
  assert.equal(fs.readFileSync(path.join(options.sourcePath, "data.txt"), "utf8"), "original");
  assert.equal(fs.readFileSync(path.join(options.targetPath, "data.txt"), "utf8"), "original");
});

test("a timestamped backup collision fails without activating target or altering existing backup", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  queueMigration(options);
  const backupPath = path.join(options.root, "source.backup-20261013-020304");
  fs.mkdirSync(backupPath);
  fs.writeFileSync(path.join(backupPath, "keep.txt"), "older backup");
  const outcome = performPendingMigration({ ...options, now: "2026-10-13T02:03:04.000Z" });
  assert.equal(outcome.runtimePath, options.sourcePath);
  assert.equal(outcome.migrationResult.status, "failure");
  assert.equal(readBootstrapState(options).activeRuntimePath, options.sourcePath);
  assert.equal(readBootstrapState(options).pendingMigration, null);
  assert.equal(fs.readFileSync(path.join(backupPath, "keep.txt"), "utf8"), "older backup");
  assert.equal(fs.readFileSync(path.join(options.sourcePath, "data.txt"), "utf8"), "original");
  assert.equal(fs.readFileSync(path.join(options.targetPath, "data.txt"), "utf8"), "original");
});

test("bootstrap commit and source-restore failures retain original data in backup without activating target", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  queueMigration(options);
  const backupPath = path.join(options.root, "source.backup-20261013-020304");
  const originalRename = fs.renameSync;
  let commitFailed = false;
  t.mock.method(fs, "renameSync", (source, target) => {
    if (target === buildBootstrapPath(options.appDataPath) && JSON.parse(fs.readFileSync(source, "utf8")).activeRuntimePath === options.targetPath && !commitFailed) {
      commitFailed = true;
      throw new Error("locked bootstrap");
    }
    if (source === backupPath && target === options.sourcePath) throw new Error("locked restore");
    originalRename(source, target);
  });
  const outcome = performPendingMigration({ ...options, now: "2026-10-13T02:03:04.000Z" });
  assert.equal(outcome.runtimePath, backupPath);
  assert.equal(outcome.migrationResult.status, "failure");
  assert.equal(outcome.migrationResult.backupPath, backupPath);
  assert.ok(outcome.migrationResult.warning);
  assert.deepEqual(outcome.migrationResult.warningCodes, ["rollback-backup"]);
  assert.equal(readBootstrapState(options).activeRuntimePath, backupPath);
  assert.equal(readBootstrapState(options).pendingMigration, null);
  assert.equal(fs.readFileSync(path.join(backupPath, "data.txt"), "utf8"), "original");
  assert.equal(fs.readFileSync(path.join(options.targetPath, "data.txt"), "utf8"), "original");
});

test("compound commit restore and failure-record errors preserve backup and verified target", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  queueMigration(options);
  const backupPath = path.join(options.root, "source.backup-20261013-020304");
  const originalRename = fs.renameSync;
  t.mock.method(fs, "renameSync", (source, target) => {
    if (target === buildBootstrapPath(options.appDataPath) && JSON.parse(fs.readFileSync(source, "utf8")).pendingMigration === null) throw new Error("private bootstrap error");
    if (source === backupPath && target === options.sourcePath) throw new Error("private restore error");
    originalRename(source, target);
  });
  assert.throws(() => performPendingMigration({ ...options, now: "2026-10-13T02:03:04.000Z" }), { code: "ERR_RUNTIME_DATA_UNAVAILABLE" });
  assert.equal(readBootstrapState(options).pendingMigration.recoveryPath, backupPath);
  assert.equal(fs.readFileSync(path.join(backupPath, "data.txt"), "utf8"), "original");
  assert.equal(fs.readFileSync(path.join(options.targetPath, "data.txt"), "utf8"), "original");
  t.mock.restoreAll();
  const restarted = performPendingMigration(options);
  assert.equal(restarted.runtimePath, backupPath);
  assert.equal(fs.readFileSync(path.join(restarted.runtimePath, "data.txt"), "utf8"), "original");
  assert.equal(readBootstrapState(options).pendingMigration, null);
});

test("source restoration never overwrites a directory created at the old source path", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  queueMigration(options);
  const backupPath = path.join(options.root, "source.backup-20261013-020304");
  const originalRename = fs.renameSync;
  let failedOnce = false;
  t.mock.method(fs, "renameSync", (source, target) => {
    if (target === buildBootstrapPath(options.appDataPath) && JSON.parse(fs.readFileSync(source, "utf8")).activeRuntimePath === options.targetPath && !failedOnce) {
      failedOnce = true;
      fs.mkdirSync(options.sourcePath);
      fs.writeFileSync(path.join(options.sourcePath, "keep.txt"), "new unrelated data");
      throw new Error("locked bootstrap");
    }
    originalRename(source, target);
  });
  const outcome = performPendingMigration({ ...options, now: "2026-10-13T02:03:04.000Z" });
  assert.equal(outcome.runtimePath, backupPath);
  assert.equal(outcome.migrationResult.status, "failure");
  assert.equal(readBootstrapState(options).activeRuntimePath, backupPath);
  assert.equal(fs.readFileSync(path.join(options.sourcePath, "keep.txt"), "utf8"), "new unrelated data");
  assert.equal(fs.readFileSync(path.join(backupPath, "data.txt"), "utf8"), "original");
  assert.equal(fs.readFileSync(path.join(options.targetPath, "data.txt"), "utf8"), "original");
});

test("an unwritable destination parent is rejected before queue state changes", t => {
  const options = fixture(t);
  const state = { schemaVersion: 1, activeRuntimePath: options.sourcePath, pendingMigration: null, migrationResult: null };
  writeBootstrap(options, state);
  const originalAccess = fs.accessSync;
  t.mock.method(fs, "accessSync", (directory, mode) => {
    if (directory === options.root && (mode & fs.constants.W_OK)) {
      const error = new Error("permission denied");
      error.code = "EACCES";
      throw error;
    }
    originalAccess(directory, mode);
  });
  assert.throws(() => queueMigration(options));
  assert.deepEqual(JSON.parse(fs.readFileSync(buildBootstrapPath(options.appDataPath), "utf8")), state);
  assert.equal(fs.existsSync(options.targetPath), false);
});

function interruptAfterBackupRename(options) {
  const script = `
    const fs = require("node:fs");
    const options = JSON.parse(process.argv[1]);
    const manager = require(process.argv[2]);
    const rename = fs.renameSync;
    fs.renameSync = (source, target) => {
      rename(source, target);
      if (source === options.sourcePath) process.exit(73);
    };
    manager.performPendingMigration({ ...options, now: "2026-10-13T02:03:04.000Z" });
  `;
  return spawnSync(process.execPath, ["-e", script, JSON.stringify(options), path.resolve(__dirname, "../runtime-data-manager.js")], { encoding: "utf8" });
}

test("restart after interruption between source rename and active-path commit selects original backup", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  queueMigration(options);
  const child = interruptAfterBackupRename(options);
  assert.equal(child.status, 73, child.stderr);
  const backupPath = path.join(options.root, "source.backup-20261013-020304");
  const journal = JSON.parse(fs.readFileSync(buildBootstrapPath(options.appDataPath), "utf8"));
  assert.equal(journal.activeRuntimePath, options.sourcePath);
  assert.equal(journal.pendingMigration.phase, "backup-planned");
  assert.equal(journal.pendingMigration.recoveryPath, backupPath);
  assert.match(journal.pendingMigration.recoveryManifestSha256, /^[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(options.sourcePath), false);
  const restarted = performPendingMigration(options);
  assert.equal(restarted.runtimePath, backupPath);
  assert.equal(restarted.migrationResult.status, "failure");
  assert.equal(restarted.migrationResult.failureCode, "interrupted");
  assert.equal(fs.readFileSync(path.join(restarted.runtimePath, "data.txt"), "utf8"), "original");
  assert.equal(readBootstrapState(options).activeRuntimePath, backupPath);
  assert.equal(readBootstrapState(options).pendingMigration, null);
  assert.equal(fs.existsSync(options.sourcePath), false);
});

function writePlannedBackupJournal(options) {
  const backupPath = path.join(options.root, "source.backup-20261013-020304");
  const expectedManifest = [{ relativePath: "data.txt", size: 8, sha256: createHash("sha256").update("original").digest("hex") }];
  const journal = {
    schemaVersion: 1, activeRuntimePath: options.sourcePath, migrationResult: null,
    pendingMigration: {
      requestId: options.requestId, sourcePath: options.sourcePath, targetPath: options.targetPath,
      createdAt: options.createdAt, phase: "backup-planned", recoveryPath: backupPath,
      recoveryManifestSha256: createHash("sha256").update(JSON.stringify(expectedManifest)).digest("hex")
    }
  };
  writeBootstrap(options, journal);
  return { backupPath, journal };
}

test("restart before source rename retains existing source and clears the journal as failure", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  writePlannedBackupJournal(options);
  const restarted = performPendingMigration(options);
  assert.equal(restarted.runtimePath, options.sourcePath);
  assert.equal(restarted.migrationResult.status, "failure");
  assert.equal(fs.readFileSync(path.join(restarted.runtimePath, "data.txt"), "utf8"), "original");
  assert.equal(readBootstrapState(options).pendingMigration, null);
});

test("restart never selects a planned backup whose original-data manifest no longer matches", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  const { backupPath, journal } = writePlannedBackupJournal(options);
  fs.renameSync(options.sourcePath, backupPath);
  fs.writeFileSync(path.join(backupPath, "data.txt"), "tampered");
  assert.throws(() => performPendingMigration(options), { code: "ERR_RUNTIME_DATA_UNAVAILABLE" });
  assert.deepEqual(JSON.parse(fs.readFileSync(buildBootstrapPath(options.appDataPath), "utf8")), journal);
  assert.equal(fs.existsSync(options.sourcePath), false);
  assert.equal(fs.readFileSync(path.join(backupPath, "data.txt"), "utf8"), "tampered");
});

test("restart with no original-data location stops before an empty profile can be selected", t => {
  const options = fixture(t);
  const { journal } = writePlannedBackupJournal(options);
  fs.rmdirSync(options.sourcePath);
  assert.throws(() => performPendingMigration(options), { code: "ERR_RUNTIME_DATA_UNAVAILABLE" });
  assert.deepEqual(JSON.parse(fs.readFileSync(buildBootstrapPath(options.appDataPath), "utf8")), journal);
  assert.equal(fs.existsSync(options.sourcePath), false);
});

test("repeated restarts stop without exposing original backup while bootstrap writes remain unavailable", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  queueMigration(options);
  const child = interruptAfterBackupRename(options);
  assert.equal(child.status, 73, child.stderr);
  const journalContents = fs.readFileSync(buildBootstrapPath(options.appDataPath), "utf8");
  const backupPath = path.join(options.root, "source.backup-20261013-020304");
  t.mock.method(fs, "renameSync", () => { throw new Error("unavailable bootstrap"); });
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.throws(() => performPendingMigration(options), { code: "ERR_RUNTIME_DATA_UNAVAILABLE" });
    assert.equal(fs.readFileSync(path.join(backupPath, "data.txt"), "utf8"), "original");
    assert.equal(fs.readFileSync(buildBootstrapPath(options.appDataPath), "utf8"), journalContents);
    assert.equal(fs.existsSync(options.sourcePath), false);
  }
});

test("a journal write failure stops source rename and retains original runtime data", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  queueMigration(options);
  const originalRename = fs.renameSync;
  t.mock.method(fs, "renameSync", (source, target) => {
    if (target === buildBootstrapPath(options.appDataPath) && JSON.parse(fs.readFileSync(source, "utf8")).pendingMigration?.phase) {
      throw new Error("journal denied");
    }
    originalRename(source, target);
  });
  const outcome = performPendingMigration({ ...options, now: "2026-10-13T02:03:04.000Z" });
  assert.equal(outcome.runtimePath, options.sourcePath);
  assert.equal(outcome.migrationResult.status, "failure");
  assert.equal(fs.existsSync(path.join(options.root, "source.backup-20261013-020304")), false);
  assert.equal(fs.readFileSync(path.join(options.sourcePath, "data.txt"), "utf8"), "original");
  assert.equal(fs.readFileSync(path.join(options.targetPath, "data.txt"), "utf8"), "original");
  assert.equal(readBootstrapState(options).pendingMigration, null);
});

test("older pending records with an unavailable source stop without selecting a missing profile", t => {
  const options = fixture(t);
  queueMigration(options);
  const originalContents = fs.readFileSync(buildBootstrapPath(options.appDataPath), "utf8");
  fs.rmdirSync(options.sourcePath);
  assert.throws(() => performPendingMigration(options), { code: "ERR_RUNTIME_DATA_UNAVAILABLE" });
  assert.equal(fs.readFileSync(buildBootstrapPath(options.appDataPath), "utf8"), originalContents);
  assert.equal(fs.existsSync(options.sourcePath), false);
});

test("restart with a recreated empty source selects the verified original backup", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  queueMigration(options);
  const child = interruptAfterBackupRename(options);
  assert.equal(child.status, 73, child.stderr);
  fs.mkdirSync(options.sourcePath);
  const backupPath = path.join(options.root, "source.backup-20261013-020304");
  const restarted = performPendingMigration(options);
  assert.equal(restarted.runtimePath, backupPath);
  assert.equal(readBootstrapState(options).activeRuntimePath, backupPath);
  assert.equal(readBootstrapState(options).pendingMigration, null);
  assert.equal(fs.readFileSync(path.join(restarted.runtimePath, "data.txt"), "utf8"), "original");
  assert.deepEqual(fs.readdirSync(options.sourcePath), []);
});

test("restart rejects a changed source when no verified original backup exists", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  const { journal } = writePlannedBackupJournal(options);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "unrelated");
  assert.throws(() => performPendingMigration(options), { code: "ERR_RUNTIME_DATA_UNAVAILABLE" });
  assert.deepEqual(JSON.parse(fs.readFileSync(buildBootstrapPath(options.appDataPath), "utf8")), journal);
  assert.equal(fs.readFileSync(path.join(options.sourcePath, "data.txt"), "utf8"), "unrelated");
});

test("failed recovery persistence returns no writable path and the next startup remains recoverable", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  queueMigration(options);
  const child = interruptAfterBackupRename(options);
  assert.equal(child.status, 73, child.stderr);
  const backupPath = path.join(options.root, "source.backup-20261013-020304");
  const journalContents = fs.readFileSync(buildBootstrapPath(options.appDataPath), "utf8");
  t.mock.method(fs, "renameSync", () => { throw new Error("private recovery persistence error"); });
  let returnedPath;
  let startupError;
  try {
    returnedPath = performPendingMigration(options).runtimePath;
    // Simulate Chromium only when startup actually supplied a writable path.
    fs.writeFileSync(path.join(returnedPath, "data.txt"), "legitimate profile update");
  } catch (error) { startupError = error; }
  assert.equal(returnedPath, undefined);
  assert.equal(startupError.code, "ERR_RUNTIME_DATA_UNAVAILABLE");
  assert.equal(startupError.message.includes("private"), false);
  assert.ok(startupError.message.length <= 300);
  assert.equal(fs.readFileSync(path.join(backupPath, "data.txt"), "utf8"), "original");
  assert.equal(fs.readFileSync(buildBootstrapPath(options.appDataPath), "utf8"), journalContents);

  t.mock.restoreAll();
  const restarted = performPendingMigration(options);
  assert.equal(restarted.runtimePath, backupPath);
  assert.equal(readBootstrapState(options).activeRuntimePath, backupPath);
  assert.equal(readBootstrapState(options).pendingMigration, null);
  fs.writeFileSync(path.join(restarted.runtimePath, "data.txt"), "legitimate profile update");
  assert.equal(performPendingMigration(options).runtimePath, backupPath);
  assert.equal(fs.readFileSync(path.join(backupPath, "data.txt"), "utf8"), "legitimate profile update");
});
