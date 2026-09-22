const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  buildManagedUserDataPath,
  buildLegacyUserDataPaths,
  buildTaskAttachmentPath,
  migrateLegacyUserData
} = require("../main-paths.js");

function createTemporaryAppData(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "smarttodo-migration-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("managed runtime path is inside appData and named 运行数据", () => {
  assert.equal(
    buildManagedUserDataPath("C:/Users/test/AppData/Roaming"),
    path.join("C:/Users/test/AppData/Roaming", "SmartTodo", "运行数据")
  );
});

test("legacy runtime paths retain both previous product identities", () => {
  assert.deepEqual(
    buildLegacyUserDataPaths("C:/Users/test/AppData/Roaming"),
    [
      path.join("C:/Users/test/AppData/Roaming", "智能任务管家", "运行数据"),
      path.join("C:/Users/test/AppData/Roaming", "smart-assistant")
    ]
  );
});

test("task attachment path is inside the managed runtime path", () => {
  assert.equal(
    buildTaskAttachmentPath("C:\\Users\\test\\AppData\\Roaming\\SmartTodo\\运行数据"),
    path.join("C:\\Users\\test\\AppData\\Roaming\\SmartTodo\\运行数据", "task-attachments")
  );
});

test("migration prefers the previous SmartTodo data directory and copies all runtime data", t => {
  assert.equal(typeof migrateLegacyUserData, "function");
  const appDataPath = createTemporaryAppData(t);
  const targetPath = buildManagedUserDataPath(appDataPath);
  const [previousPath, oldestPath] = buildLegacyUserDataPaths(appDataPath);
  fs.mkdirSync(path.join(previousPath, "Local Storage"), { recursive: true });
  fs.mkdirSync(path.join(previousPath, "task-attachments", "task_1"), { recursive: true });
  fs.writeFileSync(path.join(previousPath, "Local Storage", "leveldb.txt"), "previous");
  fs.writeFileSync(path.join(previousPath, "task-attachments", "task_1", "note.txt"), "attachment");
  fs.mkdirSync(path.join(oldestPath, "Local Storage"), { recursive: true });
  fs.writeFileSync(path.join(oldestPath, "Local Storage", "leveldb.txt"), "oldest");

  const sourcePath = migrateLegacyUserData({ appDataPath });

  assert.equal(sourcePath, previousPath);
  assert.equal(fs.readFileSync(path.join(targetPath, "Local Storage", "leveldb.txt"), "utf8"), "previous");
  assert.equal(
    fs.readFileSync(path.join(targetPath, "task-attachments", "task_1", "note.txt"), "utf8"),
    "attachment"
  );
});

test("migration uses the oldest identity as a fallback and never overwrites current data", t => {
  assert.equal(typeof migrateLegacyUserData, "function");
  const appDataPath = createTemporaryAppData(t);
  const targetPath = buildManagedUserDataPath(appDataPath);
  const [, oldestPath] = buildLegacyUserDataPaths(appDataPath);
  fs.mkdirSync(path.join(oldestPath, "Local Storage"), { recursive: true });
  fs.writeFileSync(path.join(oldestPath, "Local Storage", "leveldb.txt"), "oldest");

  assert.equal(migrateLegacyUserData({ appDataPath }), oldestPath);
  assert.equal(fs.readFileSync(path.join(targetPath, "Local Storage", "leveldb.txt"), "utf8"), "oldest");

  fs.writeFileSync(path.join(targetPath, "Local Storage", "leveldb.txt"), "current");
  assert.equal(migrateLegacyUserData({ appDataPath }), null);
  assert.equal(fs.readFileSync(path.join(targetPath, "Local Storage", "leveldb.txt"), "utf8"), "current");
});
