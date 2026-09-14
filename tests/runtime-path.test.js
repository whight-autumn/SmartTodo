const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { buildManagedUserDataPath, buildTaskAttachmentPath } = require("../main-paths.js");

test("managed runtime path is inside appData and named 运行数据", () => {
  assert.equal(
    buildManagedUserDataPath("C:/Users/test/AppData/Roaming"),
    path.join("C:/Users/test/AppData/Roaming", "智能任务管家", "运行数据")
  );
});

test("task attachment path is inside the managed runtime path", () => {
  assert.equal(
    buildTaskAttachmentPath("C:\\Users\\test\\AppData\\Roaming\\智能任务管家\\运行数据"),
    path.join("C:\\Users\\test\\AppData\\Roaming\\智能任务管家\\运行数据", "task-attachments")
  );
});
