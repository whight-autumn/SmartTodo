const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const MAX_TASK_ATTACHMENTS = 10;
const MAX_TASK_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const TASK_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const STORAGE_NAME_PATTERN = /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]{1,12})?$/;
const TRANSACTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_EXTENSION_PATTERN = /^\.[a-zA-Z0-9]{1,12}$/;
const TRANSACTION_DIRECTORY_NAME = ".transactions";
const IMAGE_MIME_TYPES = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

class AttachmentStoreError extends Error {}

function createTaskAttachmentStore({ rootPath } = {}) {
  if (typeof rootPath !== "string" || !rootPath.trim()) {
    throw new Error("附件存储根目录无效");
  }

  const resolvedRoot = path.resolve(rootPath);
  const rootPrefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  const taskOperationQueues = new Map();
  const activeTransactions = new Map();
  let rootIdentity = null;

  function resolveContainedPath(...segments) {
    const resolvedPath = path.resolve(resolvedRoot, ...segments);
    const comparisonPath = process.platform === "win32" ? resolvedPath.toLowerCase() : resolvedPath;
    const comparisonRoot = process.platform === "win32" ? rootPrefix.toLowerCase() : rootPrefix;
    if (!comparisonPath.startsWith(comparisonRoot)) {
      throw new AttachmentStoreError("附件路径超出存储目录");
    }
    return resolvedPath;
  }

  function validateTaskId(value) {
    const taskId = String(value ?? "");
    if (!TASK_ID_PATTERN.test(taskId)) {
      throw new AttachmentStoreError("任务 ID 不安全");
    }
    return taskId;
  }

  function validateStorageName(value) {
    const storageName = String(value ?? "");
    if (!STORAGE_NAME_PATTERN.test(storageName)) {
      throw new AttachmentStoreError("附件存储名称不安全");
    }
    return storageName;
  }

  function validateTransactionId(value) {
    const transactionId = String(value ?? "");
    if (!TRANSACTION_ID_PATTERN.test(transactionId)) {
      throw new AttachmentStoreError("附件事务 ID 不安全");
    }
    return transactionId;
  }

  function getAttachmentArguments(value, storageNameValue) {
    if (value && typeof value === "object") {
      return {
        taskId: validateTaskId(value.taskId),
        storageName: validateStorageName(value.storageName)
      };
    }
    return {
      taskId: validateTaskId(value),
      storageName: validateStorageName(storageNameValue)
    };
  }

  function getTransactionArguments(value, transactionIdValue) {
    if (value && typeof value === "object") {
      return {
        taskId: validateTaskId(value.taskId),
        transactionId: validateTransactionId(value.transactionId)
      };
    }
    return {
      taskId: validateTaskId(value),
      transactionId: validateTransactionId(transactionIdValue)
    };
  }

  function getTaskId(value) {
    return validateTaskId(value && typeof value === "object" ? value.taskId : value);
  }

  function getSafeExtension(sourcePath) {
    const extension = path.extname(sourcePath);
    return SAFE_EXTENSION_PATTERN.test(extension) ? extension.toLowerCase() : "";
  }

  function getMimeType(extension) {
    return IMAGE_MIME_TYPES[extension] || "application/octet-stream";
  }

  function getIdentity(stats) {
    return `${String(stats.dev)}:${String(stats.ino)}`;
  }

  function samePath(firstPath, secondPath) {
    if (process.platform === "win32") {
      return firstPath.toLowerCase() === secondPath.toLowerCase();
    }
    return firstPath === secondPath;
  }

  async function assertManagedRoot() {
    if (!rootIdentity) {
      try {
        await fs.promises.mkdir(resolvedRoot, { recursive: true });
      } catch (error) {
        throw new AttachmentStoreError(`附件存储根目录不安全：${error.message}`);
      }
    }

    let beforeStats;
    let afterStats;
    let realRoot;
    try {
      beforeStats = await fs.promises.lstat(resolvedRoot);
      if (beforeStats.isSymbolicLink() || !beforeStats.isDirectory()) {
        throw new AttachmentStoreError("附件存储根目录必须是非链接目录");
      }
      realRoot = await fs.promises.realpath(resolvedRoot);
      afterStats = await fs.promises.lstat(resolvedRoot);
    } catch (error) {
      if (error instanceof AttachmentStoreError) throw error;
      throw new AttachmentStoreError(`附件存储根目录不安全：${error.message}`);
    }

    if (afterStats.isSymbolicLink() || !afterStats.isDirectory()
        || getIdentity(beforeStats) !== getIdentity(afterStats)) {
      throw new AttachmentStoreError("附件存储根目录在检查期间发生变化");
    }

    const currentIdentity = {
      realPath: realRoot,
      fileIdentity: getIdentity(afterStats)
    };
    if (!rootIdentity) {
      rootIdentity = currentIdentity;
    } else if (!samePath(rootIdentity.realPath, currentIdentity.realPath)
        || rootIdentity.fileIdentity !== currentIdentity.fileIdentity) {
      throw new AttachmentStoreError("附件存储根目录已被替换");
    }
    return rootIdentity;
  }

  function assertCanonicalContainment(realPath, identity) {
    const relativePath = path.relative(identity.realPath, realPath);
    if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${path.sep}`)
        || path.isAbsolute(relativePath)) {
      throw new AttachmentStoreError("附件路径超出存储目录");
    }
  }

  async function assertSafeDirectory(directoryPath, message) {
    const identity = await assertManagedRoot();
    const stats = await fs.promises.lstat(directoryPath);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new AttachmentStoreError(message);
    }
    const realPath = await fs.promises.realpath(directoryPath);
    assertCanonicalContainment(realPath, identity);
    return realPath;
  }

  async function ensureSafeDirectory(directoryPath, message) {
    await assertManagedRoot();
    try {
      await fs.promises.mkdir(directoryPath);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    return assertSafeDirectory(directoryPath, message);
  }

  async function ensureTaskDirectory(taskPath) {
    await assertManagedRoot();
    let created = false;
    try {
      await fs.promises.mkdir(taskPath);
      created = true;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    await assertSafeDirectory(taskPath, "任务附件目录不安全");
    return created;
  }

  function queueTaskOperation(taskId, operation) {
    const previous = taskOperationQueues.get(taskId) || Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    taskOperationQueues.set(taskId, current);
    return current.finally(() => {
      if (taskOperationQueues.get(taskId) === current) taskOperationQueues.delete(taskId);
    });
  }

  function assertNoActiveTransaction(taskId) {
    if (activeTransactions.has(taskId)) {
      throw new AttachmentStoreError("任务附件变更正在处理中");
    }
  }

  async function copyFilesForTask({ taskId, sourcePaths, now }) {
    const selectedPaths = Array.isArray(sourcePaths) ? sourcePaths : [];
    if (selectedPaths.length === 0) return [];

    const addedAt = now === undefined ? Date.now() : Number(now);
    if (!Number.isFinite(addedAt) || addedAt <= 0) {
      throw new AttachmentStoreError("附件添加时间无效");
    }

    await assertManagedRoot();
    const taskPath = resolveContainedPath(taskId);
    const copiedPaths = [];
    let taskDirectoryCreated = false;

    try {
      taskDirectoryCreated = await ensureTaskDirectory(taskPath);
      const storedEntries = await fs.promises.readdir(taskPath);
      if (storedEntries.length + selectedPaths.length > MAX_TASK_ATTACHMENTS) {
        throw new AttachmentStoreError("每个任务最多只能有 10 个附件");
      }
      const attachments = [];

      for (const selectedPath of selectedPaths) {
        if (typeof selectedPath !== "string" || !path.isAbsolute(selectedPath)) {
          throw new AttachmentStoreError("附件源路径必须是绝对路径");
        }

        const sourcePath = path.resolve(selectedPath);
        const stats = await fs.promises.lstat(sourcePath);
        if (stats.isSymbolicLink()) {
          throw new AttachmentStoreError("不能导入符号链接附件");
        }
        if (!stats.isFile()) {
          throw new AttachmentStoreError("只能导入普通文件");
        }
        if (stats.size > MAX_TASK_ATTACHMENT_BYTES) {
          throw new AttachmentStoreError("单个附件不能超过 20 MB");
        }

        const name = path.basename(sourcePath);
        if (!name.trim() || /[\\/:]/.test(name)) {
          throw new AttachmentStoreError("附件文件名无效");
        }

        const extension = getSafeExtension(sourcePath);
        const storageName = `${crypto.randomUUID()}${extension}`;
        const destinationPath = resolveContainedPath(taskId, storageName);
        await assertManagedRoot();
        await fs.promises.copyFile(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
        copiedPaths.push(destinationPath);
        attachments.push({
          id: crypto.randomUUID(),
          name,
          storageName,
          mimeType: getMimeType(extension),
          size: stats.size,
          addedAt
        });
      }

      return attachments;
    } catch (error) {
      await Promise.allSettled(copiedPaths.map(filePath => fs.promises.rm(filePath, { force: true })));
      if (taskDirectoryCreated) {
        await fs.promises.rmdir(taskPath).catch(() => {});
      }
      const detail = error instanceof AttachmentStoreError ? `：${error.message}` : "，请重试";
      throw new Error(`导入附件失败${detail}`);
    }
  }

  async function importFiles({ taskId: taskIdValue, sourcePaths, now } = {}) {
    const taskId = validateTaskId(taskIdValue);
    return queueTaskOperation(taskId, async () => {
      assertNoActiveTransaction(taskId);
      return copyFilesForTask({ taskId, sourcePaths, now });
    });
  }

  async function resolveAttachmentPathForTask(taskId, storageName) {
    const identity = await assertManagedRoot();
    const taskPath = resolveContainedPath(taskId);
    const attachmentPath = resolveContainedPath(taskId, storageName);
    let taskStats;
    let attachmentStats;
    try {
      [taskStats, attachmentStats] = await Promise.all([
        fs.promises.lstat(taskPath),
        fs.promises.lstat(attachmentPath)
      ]);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") {
        throw new AttachmentStoreError("附件文件已不存在");
      }
      throw error;
    }
    if (taskStats.isSymbolicLink()) throw new AttachmentStoreError("任务附件目录不能是符号链接");
    if (!taskStats.isDirectory()) throw new AttachmentStoreError("任务附件目录不安全");
    if (attachmentStats.isSymbolicLink()) throw new AttachmentStoreError("附件文件不能是符号链接");
    if (!attachmentStats.isFile()) throw new AttachmentStoreError("附件必须是普通文件");

    const [realTaskPath, realAttachmentPath, finalAttachmentStats] = await Promise.all([
      fs.promises.realpath(taskPath),
      fs.promises.realpath(attachmentPath),
      fs.promises.lstat(attachmentPath)
    ]);
    if (finalAttachmentStats.isSymbolicLink() || !finalAttachmentStats.isFile()
        || getIdentity(finalAttachmentStats) !== getIdentity(attachmentStats)) {
      throw new AttachmentStoreError("附件文件在检查期间发生变化");
    }
    assertCanonicalContainment(realTaskPath, identity);
    assertCanonicalContainment(realAttachmentPath, identity);
    await assertManagedRoot();
    return realAttachmentPath;
  }

  async function resolveAttachmentPath(value, storageNameValue) {
    const { taskId, storageName } = getAttachmentArguments(value, storageNameValue);
    return resolveAttachmentPathForTask(taskId, storageName);
  }

  async function getAttachmentUrl(value, storageNameValue) {
    const resolvedPath = await resolveAttachmentPath(value, storageNameValue);
    return pathToFileURL(resolvedPath).href;
  }

  async function removeAttachment(value, storageNameValue) {
    const { taskId, storageName } = getAttachmentArguments(value, storageNameValue);
    return queueTaskOperation(taskId, async () => {
      assertNoActiveTransaction(taskId);
      let resolvedPath;
      try {
        resolvedPath = await resolveAttachmentPathForTask(taskId, storageName);
      } catch (error) {
        if (error instanceof AttachmentStoreError && error.message === "附件文件已不存在") return;
        throw error;
      }
      await assertManagedRoot();
      await fs.promises.rm(resolvedPath, { force: true });
    });
  }

  async function createTransactionDirectory(taskId, transactionId) {
    const transactionsPath = resolveContainedPath(TRANSACTION_DIRECTORY_NAME);
    const taskTransactionsPath = resolveContainedPath(TRANSACTION_DIRECTORY_NAME, taskId);
    const transactionPath = resolveContainedPath(TRANSACTION_DIRECTORY_NAME, taskId, transactionId);
    await ensureSafeDirectory(transactionsPath, "附件事务目录不安全");
    await ensureSafeDirectory(taskTransactionsPath, "任务附件事务目录不安全");
    await fs.promises.mkdir(transactionPath);
    await assertSafeDirectory(transactionPath, "附件事务目录不安全");
    return { transactionPath, taskTransactionsPath, transactionsPath };
  }

  async function removeDirectoryIfEmpty(directoryPath) {
    await assertManagedRoot();
    await fs.promises.rmdir(directoryPath).catch(error => {
      if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error;
    });
  }

  async function safeRemoveDirectory(directoryPath, message) {
    await assertManagedRoot();
    let stats;
    try {
      stats = await fs.promises.lstat(directoryPath);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new AttachmentStoreError(message);
    }
    const identity = await assertManagedRoot();
    const realPath = await fs.promises.realpath(directoryPath);
    assertCanonicalContainment(realPath, identity);
    await assertManagedRoot();
    await fs.promises.rm(directoryPath, { recursive: true, force: true });
  }

  async function undoPreparedChanges(transaction) {
    const failures = [];

    for (const storageName of transaction.removedStorageNames) {
      const stagedPath = resolveContainedPath(
        TRANSACTION_DIRECTORY_NAME,
        transaction.taskId,
        transaction.transactionId,
        storageName
      );
      const destinationPath = resolveContainedPath(transaction.taskId, storageName);
      try {
        await assertManagedRoot();
        const stagedStats = await fs.promises.lstat(stagedPath);
        if (stagedStats.isSymbolicLink() || !stagedStats.isFile()) {
          throw new AttachmentStoreError("暂存附件不是普通文件");
        }
        await fs.promises.lstat(destinationPath).then(() => {
          throw new AttachmentStoreError("原附件位置已被占用");
        }).catch(error => {
          if (error.code !== "ENOENT") throw error;
        });
        await fs.promises.rename(stagedPath, destinationPath);
      } catch (error) {
        failures.push(error);
      }
    }

    for (const storageName of transaction.importedStorageNames) {
      const importedPath = resolveContainedPath(transaction.taskId, storageName);
      try {
        await assertManagedRoot();
        const stats = await fs.promises.lstat(importedPath);
        if (stats.isSymbolicLink() || !stats.isFile()) {
          throw new AttachmentStoreError("待回滚附件不是普通文件");
        }
        await fs.promises.rm(importedPath, { force: true });
      } catch (error) {
        if (error.code !== "ENOENT") failures.push(error);
      }
    }

    if (failures.length) {
      throw new AttachmentStoreError(`回滚附件变更失败：${failures[0].message}`);
    }
    await safeRemoveDirectory(transaction.transactionPath, "附件事务目录不安全");
    await removeDirectoryIfEmpty(transaction.taskTransactionsPath);
    await removeDirectoryIfEmpty(transaction.transactionsPath);
  }

  async function prepareChanges({
    taskId: taskIdValue,
    sourcePaths,
    removeStorageNames: removeStorageNamesValue,
    now
  } = {}) {
    const taskId = validateTaskId(taskIdValue);
    const removeStorageNames = Array.isArray(removeStorageNamesValue)
      ? removeStorageNamesValue.map(validateStorageName)
      : [];
    if (new Set(removeStorageNames).size !== removeStorageNames.length) {
      throw new AttachmentStoreError("待移除附件列表无效");
    }

    return queueTaskOperation(taskId, async () => {
      assertNoActiveTransaction(taskId);
      const attachments = await copyFilesForTask({ taskId, sourcePaths, now });
      const transactionId = crypto.randomUUID();
      let transaction;
      try {
        const directories = await createTransactionDirectory(taskId, transactionId);
        transaction = {
          taskId,
          transactionId,
          importedStorageNames: attachments.map(attachment => attachment.storageName),
          removedStorageNames: [],
          ...directories
        };

        const failedStorageNames = [];
        for (const storageName of removeStorageNames) {
          let attachmentPath;
          try {
            attachmentPath = await resolveAttachmentPathForTask(taskId, storageName);
            const stagedPath = resolveContainedPath(
              TRANSACTION_DIRECTORY_NAME,
              taskId,
              transactionId,
              storageName
            );
            await assertManagedRoot();
            await fs.promises.rename(attachmentPath, stagedPath);
            transaction.removedStorageNames.push(storageName);
          } catch {
            failedStorageNames.push(storageName);
          }
        }

        activeTransactions.set(taskId, transaction);
        return {
          transactionId,
          attachments,
          removedStorageNames: [...transaction.removedStorageNames],
          failedStorageNames
        };
      } catch (error) {
        if (transaction) {
          await undoPreparedChanges(transaction).catch(() => {});
        } else {
          await Promise.allSettled(attachments.map(attachment => (
            fs.promises.rm(resolveContainedPath(taskId, attachment.storageName), { force: true })
          )));
        }
        throw error;
      }
    });
  }

  function getActiveTransaction(taskId, transactionId) {
    const transaction = activeTransactions.get(taskId);
    if (!transaction || transaction.transactionId !== transactionId) {
      throw new AttachmentStoreError("附件事务不存在或已结束");
    }
    return transaction;
  }

  async function rollbackChanges(value, transactionIdValue) {
    const { taskId, transactionId } = getTransactionArguments(value, transactionIdValue);
    return queueTaskOperation(taskId, async () => {
      const transaction = getActiveTransaction(taskId, transactionId);
      await undoPreparedChanges(transaction);
      activeTransactions.delete(taskId);
    });
  }

  async function commitChanges(value, transactionIdValue) {
    const { taskId, transactionId } = getTransactionArguments(value, transactionIdValue);
    return queueTaskOperation(taskId, async () => {
      const transaction = getActiveTransaction(taskId, transactionId);
      await safeRemoveDirectory(transaction.transactionPath, "附件事务目录不安全");
      await removeDirectoryIfEmpty(transaction.taskTransactionsPath);
      await removeDirectoryIfEmpty(transaction.transactionsPath);
      activeTransactions.delete(taskId);
    });
  }

  async function removeTaskAttachments(value) {
    const taskId = getTaskId(value);
    return queueTaskOperation(taskId, async () => {
      assertNoActiveTransaction(taskId);
      await assertManagedRoot();
      const taskPath = resolveContainedPath(taskId);
      const taskTransactionsPath = resolveContainedPath(TRANSACTION_DIRECTORY_NAME, taskId);
      await safeRemoveDirectory(taskPath, "任务附件目录不安全");
      await safeRemoveDirectory(taskTransactionsPath, "任务附件事务目录不安全");
      await removeDirectoryIfEmpty(resolveContainedPath(TRANSACTION_DIRECTORY_NAME));
    });
  }

  return {
    importFiles,
    prepareChanges,
    commitChanges,
    rollbackChanges,
    removeAttachment,
    removeTaskAttachments,
    resolveAttachmentPath,
    getAttachmentUrl
  };
}

module.exports = { createTaskAttachmentStore };
