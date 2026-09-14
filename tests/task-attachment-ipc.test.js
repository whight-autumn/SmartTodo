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
    prepares: [],
    commits: [],
    rollbacks: [],
    reconciliations: [],
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
    async prepareChanges(payload) {
      calls.prepares.push(payload);
      return {
        transactionId: "00000000-0000-4000-8000-000000000001",
        attachments: [{ id: "attachment_1" }],
        removedStorageNames: [],
        failedStorageNames: []
      };
    },
    async commitChanges(payload) {
      calls.commits.push(payload);
      return { failedStorageNames: [] };
    },
    async rollbackChanges(payload) {
      calls.rollbacks.push(payload);
      return { failedStorageNames: [] };
    },
    async reconcileTasks(references) {
      calls.reconciliations.push(references);
      return references.map(reference => ({ ...reference, removedStorageNames: [] }));
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
    "task-attachment:commit-changes",
    "task-attachment:get-url",
    "task-attachment:open",
    "task-attachment:open-external",
    "task-attachment:prepare-changes",
    "task-attachment:reconcile",
    "task-attachment:remove-task-directories",
    "task-attachment:rollback-changes"
  ]);
});

test("delegates a valid prepare payload and returns transaction metadata", async () => {
  const { handlers, calls } = createHarness();
  const sourcePath = path.resolve("selected.txt");

  const result = await handlers.get("task-attachment:prepare-changes")(null, {
    taskId: "task_1",
    sourcePaths: [sourcePath],
    removeStorageNames: ["old.txt"],
    existingCount: 2
  });

  assert.deepEqual(result.attachments, [{ id: "attachment_1" }]);
  assert.deepEqual(calls.prepares, [{
    taskId: "task_1",
    sourcePaths: [sourcePath],
    removeStorageNames: ["old.txt"],
    existingCount: 2
  }]);
});

test("rejects unsafe attachment identifiers before store delegation", async () => {
  const { handlers, calls } = createHarness();

  await assert.rejects(
    handlers.get("task-attachment:get-url")(null, {
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

  assert.deepEqual(calls.urls, []);
});

test("rejects malformed prepare payloads before store delegation", async () => {
  const { handlers, calls } = createHarness();
  const sourcePath = path.resolve("selected.txt");
  const invalidPayloads = [
    { taskId: "../task", sourcePaths: [sourcePath], removeStorageNames: [], existingCount: 0 },
    { taskId: "task_1", sourcePaths: ["relative.txt"], removeStorageNames: [], existingCount: 0 },
    { taskId: "task_1", sourcePaths: [sourcePath], removeStorageNames: ["../old.txt"], existingCount: 0 },
    { taskId: "task_1", sourcePaths: [sourcePath], removeStorageNames: [], existingCount: -1 },
    { taskId: "task_1", sourcePaths: [sourcePath], removeStorageNames: [], existingCount: 0.5 },
    { taskId: "task_1", sourcePaths: [sourcePath], removeStorageNames: [], existingCount: "0" },
    {
      taskId: "task_1",
      sourcePaths: [sourcePath],
      removeStorageNames: [],
      existingCount: 0,
      destinationPath: path.resolve("managed")
    }
  ];

  for (const payload of invalidPayloads) {
    await assert.rejects(async () => handlers.get("task-attachment:prepare-changes")(null, payload));
  }

  assert.deepEqual(calls.prepares, []);
});

test("validates fixed commit and rollback transaction payloads", async () => {
  const { handlers, calls } = createHarness();
  const payload = {
    taskId: "task_1",
    transactionId: "00000000-0000-4000-8000-000000000001"
  };

  assert.deepEqual(await handlers.get("task-attachment:commit-changes")(null, payload), { failedStorageNames: [] });
  assert.deepEqual(await handlers.get("task-attachment:rollback-changes")(null, payload), { failedStorageNames: [] });
  await assert.rejects(handlers.get("task-attachment:commit-changes")(null, {
    taskId: "task_1",
    transactionId: "../transaction"
  }));
  await assert.rejects(handlers.get("task-attachment:rollback-changes")(null, {
    ...payload,
    sourcePath: path.resolve("secret.txt")
  }));

  assert.deepEqual(calls.commits, [payload]);
  assert.deepEqual(calls.rollbacks, [payload]);
});

test("validates and delegates startup attachment reconciliation", async () => {
  const { handlers, calls } = createHarness();
  const reconcile = handlers.get("task-attachment:reconcile");
  const references = [{ taskId: "task_1", storageNames: ["first.txt", "second.png"] }];

  assert.deepEqual(await reconcile(null, references), [{
    ...references[0],
    removedStorageNames: []
  }]);
  for (const invalid of [
    "task_1",
    [{ taskId: "../task", storageNames: [] }],
    [{ taskId: "task_1", storageNames: "first.txt" }],
    [{ taskId: "task_1", storageNames: ["../first.txt"] }],
    [{ taskId: "task_1", storageNames: [], sourcePath: path.resolve("secret.txt") }],
    [{ taskId: "task_1", storageNames: [] }, { taskId: "task_1", storageNames: [] }]
  ]) {
    await assert.rejects(async () => reconcile(null, invalid));
  }

  assert.deepEqual(calls.reconciliations, [references]);
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

test("delegates valid attachment URL lookup", async () => {
  const { handlers, calls } = createHarness();

  assert.equal(
    await handlers.get("task-attachment:get-url")(null, ATTACHMENT_PAYLOAD),
    "file:///managed/task_1/stored_file.txt"
  );
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
require("node:test")("reconciliation uses a fixed validated IPC channel", () => {
  const localAssert = require("node:assert/strict");
  const source = require("node:fs").readFileSync(require.resolve("../task-attachment-ipc"), "utf8");

  localAssert.match(source, /task-attachment:reconcile/);
  localAssert.match(source, /validateReconciliationReferences/);
  localAssert.match(source, /attachmentStore\.reconcileTasks/);
});
