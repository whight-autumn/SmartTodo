const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const { createTaskAttachmentStore } = require("../task-attachment-store");

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

function createTestPaths(t) {
  const tempPath = fs.mkdtempSync(path.join(os.tmpdir(), "smart-task-attachments-"));
  const rootPath = path.join(tempPath, "managed");
  const sourcePath = path.join(tempPath, "sources");
  fs.mkdirSync(sourcePath, { recursive: true });
  t.after(() => fs.rmSync(tempPath, { recursive: true, force: true }));
  return { tempPath, rootPath, sourcePath };
}

function createSizedFile(filePath, size) {
  const handle = fs.openSync(filePath, "w");
  try {
    fs.ftruncateSync(handle, size);
  } finally {
    fs.closeSync(handle);
  }
}

test("imports a selected file under a randomized managed name", async t => {
  const { rootPath, sourcePath: sourceDirectory } = createTestPaths(t);
  const sourcePath = path.join(sourceDirectory, "参考图.png");
  fs.writeFileSync(sourcePath, "image-content");
  const store = createTaskAttachmentStore({ rootPath });

  const [attachment] = await store.importFiles({
    taskId: "task_1",
    sourcePaths: [sourcePath],
    existingCount: 0,
    now: 1234
  });

  assert.deepEqual(Object.keys(attachment).sort(), [
    "addedAt", "id", "mimeType", "name", "size", "storageName"
  ]);
  assert.match(attachment.id, /^[a-f0-9-]+$/);
  assert.equal(attachment.name, "参考图.png");
  assert.equal(attachment.mimeType, "image/png");
  assert.equal(attachment.size, 13);
  assert.equal(attachment.addedAt, 1234);
  assert.match(attachment.storageName, /^[a-f0-9-]+\.png$/);
  assert.equal(Object.values(attachment).includes(sourcePath), false);

  const managedPath = path.join(rootPath, "task_1", attachment.storageName);
  assert.equal(fs.readFileSync(managedPath, "utf8"), "image-content");
  assert.equal(
    await store.resolveAttachmentPath({ taskId: "task_1", storageName: attachment.storageName }),
    managedPath
  );
  assert.equal(
    await store.getAttachmentUrl({ taskId: "task_1", storageName: attachment.storageName }),
    pathToFileURL(managedPath).href
  );
});

test("imports a file exactly at the 20 MB limit", async t => {
  const { rootPath, sourcePath: sourceDirectory } = createTestPaths(t);
  const sourcePath = path.join(sourceDirectory, "limit.bin");
  createSizedFile(sourcePath, MAX_ATTACHMENT_BYTES);
  const store = createTaskAttachmentStore({ rootPath });

  const [attachment] = await store.importFiles({
    taskId: "task_limit",
    sourcePaths: [sourcePath],
    existingCount: 0,
    now: 2000
  });

  assert.equal(attachment.size, MAX_ATTACHMENT_BYTES);
  assert.equal(fs.statSync(path.join(rootPath, "task_limit", attachment.storageName)).size, MAX_ATTACHMENT_BYTES);
});

test("rejects a file one byte above the 20 MB limit", async t => {
  const { rootPath, sourcePath: sourceDirectory } = createTestPaths(t);
  const sourcePath = path.join(sourceDirectory, "too-large.bin");
  createSizedFile(sourcePath, MAX_ATTACHMENT_BYTES + 1);
  const store = createTaskAttachmentStore({ rootPath });

  await assert.rejects(
    store.importFiles({ taskId: "task_large", sourcePaths: [sourcePath], existingCount: 0, now: 2000 }),
    /20 MB/
  );
  assert.equal(fs.existsSync(path.join(rootPath, "task_large")), false);
});

test("repeated imports cannot exceed 10 attachments when existingCount stays falsely low", async t => {
  const { rootPath, sourcePath: sourceDirectory } = createTestPaths(t);
  const sourcePath = path.join(sourceDirectory, "extra.txt");
  fs.writeFileSync(sourcePath, "extra");
  const store = createTaskAttachmentStore({ rootPath });

  for (let index = 0; index < 10; index += 1) {
    await store.importFiles({
      taskId: "task_full",
      sourcePaths: [sourcePath],
      existingCount: 0,
      now: 2000 + index
    });
  }

  await assert.rejects(
    store.importFiles({ taskId: "task_full", sourcePaths: [sourcePath], existingCount: 0, now: 3000 }),
    /10/
  );
  assert.equal(fs.readdirSync(path.join(rootPath, "task_full")).length, 10);
});

test("rejects symbolic-link sources where symbolic links are supported", async t => {
  const { rootPath, sourcePath: sourceDirectory } = createTestPaths(t);
  const targetPath = path.join(sourceDirectory, "target.txt");
  const linkPath = path.join(sourceDirectory, "link.txt");
  fs.writeFileSync(targetPath, "target");
  try {
    fs.symlinkSync(targetPath, linkPath, "file");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.skip("symbolic links are not supported in this environment");
      return;
    }
    throw error;
  }
  const store = createTaskAttachmentStore({ rootPath });

  await assert.rejects(
    store.importFiles({ taskId: "task_link", sourcePaths: [linkPath], existingCount: 0, now: 2000 }),
    /符号链接/
  );
  assert.equal(fs.existsSync(path.join(rootPath, "task_link")), false);
});

test("rejects non-file sources", async t => {
  const { rootPath, sourcePath: sourceDirectory } = createTestPaths(t);
  const store = createTaskAttachmentStore({ rootPath });

  await assert.rejects(
    store.importFiles({ taskId: "task_directory", sourcePaths: [sourceDirectory], existingCount: 0, now: 2000 }),
    /普通文件/
  );
  assert.equal(fs.existsSync(path.join(rootPath, "task_directory")), false);
});

test("rejects unsafe task IDs", async t => {
  const { rootPath, sourcePath: sourceDirectory } = createTestPaths(t);
  const sourcePath = path.join(sourceDirectory, "safe.txt");
  fs.writeFileSync(sourcePath, "safe");
  const store = createTaskAttachmentStore({ rootPath });

  for (const taskId of ["../task", "task/subtask", "task\\subtask", "task:drive"]) {
    await assert.rejects(
      store.importFiles({ taskId, sourcePaths: [sourcePath], existingCount: 0, now: 2000 }),
      /任务 ID/
    );
  }
  assert.equal(fs.existsSync(rootPath), false);
});

test("rejects unsafe storage names", async t => {
  const { rootPath } = createTestPaths(t);
  const store = createTaskAttachmentStore({ rootPath });

  for (const storageName of ["../secret.txt", "nested/file.txt", "nested\\file.txt", "file.abcdefghijklmn"]) {
    await assert.rejects(
      store.resolveAttachmentPath({ taskId: "task_1", storageName }),
      /存储名称/
    );
  }
  assert.equal(fs.existsSync(rootPath), false);
});

test("rejects missing and non-regular managed attachment entries", async t => {
  const { rootPath } = createTestPaths(t);
  const taskPath = path.join(rootPath, "task_entries");
  fs.mkdirSync(path.join(taskPath, "folder.bin"), { recursive: true });
  const store = createTaskAttachmentStore({ rootPath });

  await assert.rejects(
    store.resolveAttachmentPath({ taskId: "task_entries", storageName: "missing.txt" }),
    /不存在/
  );
  await assert.rejects(
    store.resolveAttachmentPath({ taskId: "task_entries", storageName: "folder.bin" }),
    /普通文件/
  );
  await assert.rejects(
    store.getAttachmentUrl({ taskId: "task_entries", storageName: "folder.bin" }),
    /普通文件/
  );
});

test("rejects managed attachment symlinks where symbolic links are supported", async t => {
  const { rootPath } = createTestPaths(t);
  const taskPath = path.join(rootPath, "task_managed_link");
  const targetPath = path.join(taskPath, "target.txt");
  const linkPath = path.join(taskPath, "link.txt");
  fs.mkdirSync(taskPath, { recursive: true });
  fs.writeFileSync(targetPath, "target");
  try {
    fs.symlinkSync(targetPath, linkPath, "file");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.skip("managed attachment symlinks are not supported in this environment");
      return;
    }
    throw error;
  }
  const store = createTaskAttachmentStore({ rootPath });

  await assert.rejects(
    store.resolveAttachmentPath({ taskId: "task_managed_link", storageName: "link.txt" }),
    /符号链接/
  );
  await assert.rejects(
    store.getAttachmentUrl({ taskId: "task_managed_link", storageName: "link.txt" }),
    /符号链接/
  );
});

test("normalizes safe extensions and falls back for unknown MIME types", async t => {
  const { rootPath, sourcePath: sourceDirectory } = createTestPaths(t);
  const jpegPath = path.join(sourceDirectory, "PHOTO.JPEG");
  const unsafeExtensionPath = path.join(sourceDirectory, "archive.abcdefghijklmn");
  fs.writeFileSync(jpegPath, "jpeg");
  fs.writeFileSync(unsafeExtensionPath, "archive");
  const store = createTaskAttachmentStore({ rootPath });

  const [jpeg, unknown] = await store.importFiles({
    taskId: "task_types",
    sourcePaths: [jpegPath, unsafeExtensionPath],
    existingCount: 0,
    now: 3000
  });

  assert.match(jpeg.storageName, /^[a-f0-9-]+\.jpeg$/);
  assert.equal(jpeg.mimeType, "image/jpeg");
  assert.match(unknown.storageName, /^[a-f0-9-]+$/);
  assert.equal(unknown.mimeType, "application/octet-stream");
});

test("rolls back the first copy when the second copy fails", async t => {
  const { rootPath, sourcePath: sourceDirectory } = createTestPaths(t);
  const firstPath = path.join(sourceDirectory, "first.txt");
  const secondPath = path.join(sourceDirectory, "second.txt");
  fs.writeFileSync(firstPath, "first");
  fs.writeFileSync(secondPath, "second");
  const originalCopyFile = fs.promises.copyFile.bind(fs.promises);
  let copyCount = 0;
  t.mock.method(fs.promises, "copyFile", async (...args) => {
    copyCount += 1;
    if (copyCount === 2) throw new Error("controlled second-copy failure");
    return originalCopyFile(...args);
  });
  const store = createTaskAttachmentStore({ rootPath });

  await assert.rejects(
    store.importFiles({
      taskId: "task_rollback",
      sourcePaths: [firstPath, secondPath],
      existingCount: 0,
      now: 4000
    }),
    /导入附件失败/
  );

  assert.equal(copyCount, 2);
  assert.equal(fs.existsSync(path.join(rootPath, "task_rollback")), false);
});

test("rolls back prepared imports and restores staged removals", async t => {
  const { rootPath, sourcePath: sourceDirectory } = createTestPaths(t);
  const oldPath = path.join(sourceDirectory, "old.txt");
  const newPath = path.join(sourceDirectory, "new.txt");
  fs.writeFileSync(oldPath, "old");
  fs.writeFileSync(newPath, "new");
  const store = createTaskAttachmentStore({ rootPath });
  const [oldAttachment] = await store.importFiles({
    taskId: "task_transaction_rollback",
    sourcePaths: [oldPath],
    existingCount: 0,
    now: 4100
  });

  const prepared = await store.prepareChanges({
    taskId: "task_transaction_rollback",
    sourcePaths: [newPath],
    removeStorageNames: [oldAttachment.storageName],
    existingCount: 1,
    now: 4200
  });
  const newAttachment = prepared.attachments[0];

  assert.match(prepared.transactionId, /^[a-f0-9-]+$/);
  assert.deepEqual(prepared.removedStorageNames, [oldAttachment.storageName]);
  assert.deepEqual(prepared.failedStorageNames, []);
  assert.equal(fs.existsSync(path.join(rootPath, "task_transaction_rollback", oldAttachment.storageName)), false);
  assert.equal(fs.existsSync(path.join(rootPath, "task_transaction_rollback", newAttachment.storageName)), true);

  await store.rollbackChanges({
    taskId: "task_transaction_rollback",
    transactionId: prepared.transactionId
  });

  assert.equal(fs.readFileSync(path.join(rootPath, "task_transaction_rollback", oldAttachment.storageName), "utf8"), "old");
  assert.equal(fs.existsSync(path.join(rootPath, "task_transaction_rollback", newAttachment.storageName)), false);
  assert.equal(fs.existsSync(path.join(rootPath, ".transactions", "task_transaction_rollback")), false);
});

test("commits prepared changes and reports removal failures without deleting metadata targets", async t => {
  const { rootPath, sourcePath: sourceDirectory } = createTestPaths(t);
  const oldPath = path.join(sourceDirectory, "old.txt");
  const newPath = path.join(sourceDirectory, "new.txt");
  fs.writeFileSync(oldPath, "old");
  fs.writeFileSync(newPath, "new");
  const store = createTaskAttachmentStore({ rootPath });
  const [oldAttachment] = await store.importFiles({
    taskId: "task_transaction_commit",
    sourcePaths: [oldPath],
    existingCount: 0,
    now: 4300
  });

  const prepared = await store.prepareChanges({
    taskId: "task_transaction_commit",
    sourcePaths: [newPath],
    removeStorageNames: [oldAttachment.storageName, "missing.txt"],
    existingCount: 1,
    now: 4400
  });

  assert.deepEqual(prepared.removedStorageNames, [oldAttachment.storageName]);
  assert.deepEqual(prepared.failedStorageNames, ["missing.txt"]);
  await store.commitChanges({
    taskId: "task_transaction_commit",
    transactionId: prepared.transactionId
  });

  assert.equal(fs.existsSync(path.join(rootPath, "task_transaction_commit", oldAttachment.storageName)), false);
  assert.equal(fs.existsSync(path.join(rootPath, "task_transaction_commit", prepared.attachments[0].storageName)), true);
  assert.equal(fs.existsSync(path.join(rootPath, ".transactions", "task_transaction_commit")), false);
});

test("rejects a non-directory replacement of the managed root", async t => {
  const { rootPath, sourcePath: sourceDirectory } = createTestPaths(t);
  const sourcePath = path.join(sourceDirectory, "safe.txt");
  fs.writeFileSync(sourcePath, "safe");
  const store = createTaskAttachmentStore({ rootPath });
  const [attachment] = await store.importFiles({
    taskId: "task_root_file",
    sourcePaths: [sourcePath],
    existingCount: 0,
    now: 4500
  });

  fs.rmSync(rootPath, { recursive: true, force: true });
  fs.writeFileSync(rootPath, "replacement");

  await assert.rejects(
    store.resolveAttachmentPath({ taskId: "task_root_file", storageName: attachment.storageName }),
    /根目录/
  );
  await assert.rejects(
    store.importFiles({ taskId: "task_root_file", sourcePaths: [sourcePath], existingCount: 0, now: 4600 }),
    /根目录/
  );
});

test("rejects a symbolic-link replacement of the managed root where supported", async t => {
  const { tempPath, rootPath, sourcePath: sourceDirectory } = createTestPaths(t);
  const sourcePath = path.join(sourceDirectory, "safe.txt");
  const outsidePath = path.join(tempPath, "outside");
  fs.writeFileSync(sourcePath, "safe");
  fs.mkdirSync(outsidePath);
  const store = createTaskAttachmentStore({ rootPath });
  await store.importFiles({
    taskId: "task_root_link",
    sourcePaths: [sourcePath],
    existingCount: 0,
    now: 4700
  });
  fs.rmSync(rootPath, { recursive: true, force: true });
  try {
    fs.symlinkSync(outsidePath, rootPath, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.skip("managed-root symbolic links/junctions are not supported in this environment");
      return;
    }
    throw error;
  }

  await assert.rejects(
    store.importFiles({ taskId: "task_root_link", sourcePaths: [sourcePath], existingCount: 0, now: 4800 }),
    /根目录/
  );
});

test("serializes whole-task cleanup after an in-flight task import", async t => {
  const { rootPath, sourcePath: sourceDirectory } = createTestPaths(t);
  const sourcePath = path.join(sourceDirectory, "slow.txt");
  fs.writeFileSync(sourcePath, "slow");
  const originalCopyFile = fs.promises.copyFile.bind(fs.promises);
  const originalRemove = fs.promises.rm.bind(fs.promises);
  let releaseCopy;
  let markCopyStarted;
  let markCleanupStarted;
  const copyStarted = new Promise(resolve => { markCopyStarted = resolve; });
  const copyGate = new Promise(resolve => { releaseCopy = resolve; });
  const cleanupStarted = new Promise(resolve => { markCleanupStarted = resolve; });
  t.mock.method(fs.promises, "copyFile", async (...args) => {
    markCopyStarted();
    await copyGate;
    return originalCopyFile(...args);
  });
  t.mock.method(fs.promises, "rm", async (targetPath, options) => {
    if (targetPath === path.join(rootPath, "task_serialized_cleanup") && options?.recursive) {
      markCleanupStarted();
    }
    return originalRemove(targetPath, options);
  });
  const store = createTaskAttachmentStore({ rootPath });

  const importPromise = store.importFiles({
    taskId: "task_serialized_cleanup",
    sourcePaths: [sourcePath],
    existingCount: 0,
    now: 4900
  });
  await copyStarted;
  const cleanupPromise = store.removeTaskAttachments("task_serialized_cleanup");
  const cleanupStartedBeforeRelease = await Promise.race([
    cleanupStarted.then(() => true),
    new Promise(resolve => setTimeout(() => resolve(false), 20))
  ]);
  releaseCopy();

  const results = await Promise.allSettled([importPromise, cleanupPromise]);
  assert.equal(cleanupStartedBeforeRelease, false);
  assert.deepEqual(results.map(result => result.status), ["fulfilled", "fulfilled"]);
  assert.equal(fs.existsSync(path.join(rootPath, "task_serialized_cleanup")), false);
});

test("removes one attachment without removing its task directory", async t => {
  const { rootPath, sourcePath: sourceDirectory } = createTestPaths(t);
  const firstPath = path.join(sourceDirectory, "first.txt");
  const secondPath = path.join(sourceDirectory, "second.txt");
  fs.writeFileSync(firstPath, "first");
  fs.writeFileSync(secondPath, "second");
  const store = createTaskAttachmentStore({ rootPath });
  const [first, second] = await store.importFiles({
    taskId: "task_remove_one",
    sourcePaths: [firstPath, secondPath],
    existingCount: 0,
    now: 5000
  });

  await store.removeAttachment({ taskId: "task_remove_one", storageName: first.storageName });

  assert.equal(fs.existsSync(path.join(rootPath, "task_remove_one", first.storageName)), false);
  assert.equal(fs.existsSync(path.join(rootPath, "task_remove_one", second.storageName)), true);
});

test("removes a task attachment directory", async t => {
  const { rootPath, sourcePath: sourceDirectory } = createTestPaths(t);
  const sourcePath = path.join(sourceDirectory, "only.txt");
  fs.writeFileSync(sourcePath, "only");
  const store = createTaskAttachmentStore({ rootPath });
  await store.importFiles({
    taskId: "task_remove_all",
    sourcePaths: [sourcePath],
    existingCount: 0,
    now: 6000
  });

  await store.removeTaskAttachments("task_remove_all");

  assert.equal(fs.existsSync(path.join(rootPath, "task_remove_all")), false);
});
