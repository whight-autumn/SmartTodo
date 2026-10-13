const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
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
    if (target === buildBootstrapPath(options.appDataPath) && !failedOnce) {
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

test("backup rename failure keeps the verified target active and retains the original", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  queueMigration(options);
  const originalRename = fs.renameSync;
  t.mock.method(fs, "renameSync", (source, target) => {
    if (source === options.sourcePath) throw new Error("locked source");
    originalRename(source, target);
  });
  const outcome = performPendingMigration(options);
  assert.equal(outcome.runtimePath, options.targetPath);
  assert.equal(outcome.migrationResult.status, "success");
  assert.equal(outcome.migrationResult.backupPath, undefined);
  assert.ok(outcome.migrationResult.warning);
  assert.equal(readBootstrapState(options).activeRuntimePath, options.targetPath);
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

test("unsaved backup warning never persists a nonexistent backup path", t => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.sourcePath, "data.txt"), "original");
  queueMigration(options);
  const originalRename = fs.renameSync;
  let committed = false;
  t.mock.method(fs, "renameSync", (source, target) => {
    if (source === options.sourcePath) throw new Error("locked source");
    if (target === buildBootstrapPath(options.appDataPath)) {
      if (committed) throw new Error("locked result");
      committed = true;
    }
    originalRename(source, target);
  });
  const outcome = performPendingMigration(options);
  assert.equal(outcome.runtimePath, options.targetPath);
  assert.equal(outcome.migrationResult.status, "success");
  const persisted = readBootstrapState(options);
  assert.equal(persisted.activeRuntimePath, options.targetPath);
  assert.equal(persisted.migrationResult.backupPath, undefined);
  assert.ok(outcome.migrationResult.warning);
  assert.equal(fs.existsSync(options.sourcePath), true);
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
