const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { registerTaskAttachmentIpc } = require("../task-attachment-ipc");

const ATTACHMENT_PAYLOAD = {
  taskId: "task_1",
  storageName: "stored_file.txt"
};

function createHarness({ openPathResult = "" } = {}) {
  const handlers = new Map();
  const calls = {
    imports: [],
    removals: [],
    cleanups: [],
    urls: [],
    resolutions: [],
    openedPaths: [],
    openedExternalUrls: []
  };
  const ipcMain = {
    handle(channel, handler) {
      assert.equal(handlers.has(channel), false, `duplicate handler for ${channel}`);
      handlers.set(channel, handler);
    }
  };
  const attachmentStore = {
    async importFiles(payload) {
      calls.imports.push(payload);
      return [{ id: "attachment_1" }];
    },
    async removeAttachment(payload) {
      calls.removals.push(payload);
    },
    async removeTaskAttachments(taskId) {
      calls.cleanups.push(taskId);
    },
    async getAttachmentUrl(payload) {
      calls.urls.push(payload);
      return "file:///managed/task_1/stored_file.txt";
    },
    async resolveAttachmentPath(payload) {
      calls.resolutions.push(payload);
      return "C:\\managed\\task_1\\stored_file.txt";
    }
  };
  const shell = {
    async openPath(filePath) {
      calls.openedPaths.push(filePath);
      return openPathResult;
    },
    async openExternal(url) {
      calls.openedExternalUrls.push(url);
    }
  };

  const registration = registerTaskAttachmentIpc({ ipcMain, shell, attachmentStore });
  return { handlers, calls, registration };
}

test("registers only the fixed task attachment channels", () => {
  const { handlers } = createHarness();

  assert.deepEqual([...handlers.keys()].sort(), [
    "task-attachment:get-url",
    "task-attachment:import",
    "task-attachment:open",
    "task-attachment:open-external",
    "task-attachment:remove",
    "task-attachment:remove-task-directories"
  ]);
});

test("delegates a valid import payload and returns attachment metadata", async () => {
  const { handlers, calls } = createHarness();
  const sourcePath = path.resolve("selected.txt");

  const result = await handlers.get("task-attachment:import")(null, {
    taskId: "task_1",
    sourcePaths: [sourcePath],
    existingCount: 2
  });

  assert.deepEqual(result, [{ id: "attachment_1" }]);
  assert.deepEqual(calls.imports, [{
    taskId: "task_1",
    sourcePaths: [sourcePath],
    existingCount: 2
  }]);
});

test("rejects unsafe attachment identifiers before store delegation", async () => {
  const { handlers, calls } = createHarness();

  await assert.rejects(
    handlers.get("task-attachment:remove")(null, {
      taskId: "../task",
      storageName: "stored_file.txt"
    }),
    /任务 ID/
  );
  await assert.rejects(
    async () => handlers.get("task-attachment:get-url")(null, {
      taskId: "task_1",
      storageName: "../secret.txt"
    }),
    /存储名称/
  );

  assert.deepEqual(calls.removals, []);
  assert.deepEqual(calls.urls, []);
});

test("rejects malformed import payloads before store delegation", async () => {
  const { handlers, calls } = createHarness();
  const sourcePath = path.resolve("selected.txt");
  const invalidPayloads = [
    { taskId: "../task", sourcePaths: [sourcePath], existingCount: 0 },
    { taskId: "task_1", sourcePaths: ["relative.txt"], existingCount: 0 },
    { taskId: "task_1", sourcePaths: [sourcePath], existingCount: -1 },
    { taskId: "task_1", sourcePaths: [sourcePath], existingCount: 0.5 },
    { taskId: "task_1", sourcePaths: [sourcePath], existingCount: "0" },
    {
      taskId: "task_1",
      sourcePaths: [sourcePath],
      existingCount: 0,
      destinationPath: path.resolve("managed")
    }
  ];

  for (const payload of invalidPayloads) {
    await assert.rejects(async () => handlers.get("task-attachment:import")(null, payload));
  }

  assert.deepEqual(calls.imports, []);
});

test("rejects invalid task directory ID lists before cleanup", async () => {
  const { handlers, calls } = createHarness();
  const cleanup = handlers.get("task-attachment:remove-task-directories");

  await assert.rejects(cleanup(null, "task_1"), /列表/);
  await assert.rejects(cleanup(null, ["task_1", "../task"]), /任务 ID/);
  await assert.rejects(cleanup(null, ["task_1", 2]), /任务 ID/);

  assert.deepEqual(calls.cleanups, []);
});

test("opens normalized HTTP and HTTPS URLs", async () => {
  const { handlers, calls } = createHarness();
  const openExternal = handlers.get("task-attachment:open-external");

  assert.equal(await openExternal(null, "http://example.com/docs"), true);
  assert.equal(await openExternal(null, "https://example.com/help?q=1"), true);
  assert.deepEqual(calls.openedExternalUrls, [
    "http://example.com/docs",
    "https://example.com/help?q=1"
  ]);
});

test("rejects unsafe or invalid external URLs without calling shell", async () => {
  const { handlers, calls } = createHarness();
  const openExternal = handlers.get("task-attachment:open-external");

  for (const url of ["javascript:alert(1)", "file:///tmp/file.txt", "not a url"]) {
    await assert.rejects(openExternal(null, url));
  }

  assert.deepEqual(calls.openedExternalUrls, []);
});

test("resolves attachment paths through the store before opening", async () => {
  const { handlers, calls } = createHarness();

  const result = await handlers.get("task-attachment:open")(null, ATTACHMENT_PAYLOAD);

  assert.equal(result, true);
  assert.deepEqual(calls.resolutions, [ATTACHMENT_PAYLOAD]);
  assert.deepEqual(calls.openedPaths, ["C:\\managed\\task_1\\stored_file.txt"]);
});

test("turns a non-empty shell openPath result into a failure", async () => {
  const { handlers, calls } = createHarness({ openPathResult: "Access denied" });

  await assert.rejects(
    handlers.get("task-attachment:open")(null, ATTACHMENT_PAYLOAD),
    /Access denied/
  );
  assert.deepEqual(calls.resolutions, [ATTACHMENT_PAYLOAD]);
  assert.deepEqual(calls.openedPaths, ["C:\\managed\\task_1\\stored_file.txt"]);
});

test("delegates valid attachment removal and URL lookup", async () => {
  const { handlers, calls } = createHarness();

  assert.equal(await handlers.get("task-attachment:remove")(null, ATTACHMENT_PAYLOAD), true);
  assert.equal(
    await handlers.get("task-attachment:get-url")(null, ATTACHMENT_PAYLOAD),
    "file:///managed/task_1/stored_file.txt"
  );
  assert.deepEqual(calls.removals, [ATTACHMENT_PAYLOAD]);
  assert.deepEqual(calls.urls, [ATTACHMENT_PAYLOAD]);
});

test("delegates cleanup for every validated task ID", async () => {
  const { handlers, calls } = createHarness();

  const result = await handlers.get("task-attachment:remove-task-directories")(
    null,
    ["task_1", "child-2"]
  );

  assert.equal(result, true);
  assert.deepEqual(calls.cleanups, ["task_1", "child-2"]);
});
