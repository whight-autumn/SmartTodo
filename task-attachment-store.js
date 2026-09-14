const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const MAX_ATTACHMENTS_PER_TASK = 10;
const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024;
const TASK_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const STORAGE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}(?:\.[A-Za-z0-9]{1,10})?$/;
const IMAGE_MIME_TYPES = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

class TaskAttachmentStoreError extends Error {
  constructor(message, code = "TASK_ATTACHMENT_ERROR") {
    super(message);
    this.name = "TaskAttachmentStoreError";
    this.code = code;
  }
}

function normalizedPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isSamePath(left, right) {
  return normalizedPath(left) === normalizedPath(right);
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function validateTaskId(taskId) {
  if (typeof taskId !== "string" || !TASK_ID_PATTERN.test(taskId)) {
    throw new TaskAttachmentStoreError("任务 ID 不安全", "INVALID_TASK_ID");
  }
  return taskId;
}

function validateStorageName(storageName) {
  if (typeof storageName !== "string" || !STORAGE_NAME_PATTERN.test(storageName)) {
    throw new TaskAttachmentStoreError("附件存储名称不安全", "INVALID_STORAGE_NAME");
  }
  return storageName;
}

function extensionFor(sourcePath) {
  const sourceExtension = path.extname(sourcePath).toLowerCase();
  if (/^\.[a-z0-9]{1,10}$/.test(sourceExtension)) {
    return sourceExtension;
  }
  return "";
}

function normalizeSourcePaths(sourcePaths) {
  if (!Array.isArray(sourcePaths)) {
    throw new TaskAttachmentStoreError("附件列表无效", "INVALID_FILES");
  }
  return sourcePaths.map((sourcePath) => {
    if (typeof sourcePath !== "string" || !path.isAbsolute(sourcePath)) {
      throw new TaskAttachmentStoreError("附件路径无效", "INVALID_SOURCE_PATH");
    }
    return sourcePath;
  });
}

function createTaskAttachmentStore({ rootPath } = {}) {
  if (typeof rootPath !== "string" || !rootPath.trim()) {
    throw new TaskAttachmentStoreError("附件根目录无效", "INVALID_ROOT");
  }

  const expectedRoot = path.resolve(rootPath);
  let rootIdentity = null;
  const taskQueues = new Map();
  const activeTransactions = new Map();

  function enqueueTask(taskId, operation) {
    const previous = taskQueues.get(taskId) || Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    taskQueues.set(taskId, current);
    current.finally(() => {
      if (taskQueues.get(taskId) === current) taskQueues.delete(taskId);
    }).catch(() => undefined);
    return current;
  }

  async function inspectDirectory(directoryPath, label) {
    const stats = await fs.promises.lstat(directoryPath);
    if (stats.isSymbolicLink()) {
      throw new TaskAttachmentStoreError(`${label}不能是符号链接`, "UNSAFE_DIRECTORY");
    }
    if (!stats.isDirectory()) {
      throw new TaskAttachmentStoreError(`${label}不是安全目录`, "UNSAFE_DIRECTORY");
    }
    const realPath = await fs.promises.realpath(directoryPath);
    if (!isSamePath(realPath, directoryPath)) {
      throw new TaskAttachmentStoreError(`${label}不是安全目录`, "UNSAFE_DIRECTORY");
    }
    return { stats, realPath };
  }

  async function assertManagedRoot() {
    if (!rootIdentity) {
      await fs.promises.mkdir(expectedRoot, { recursive: true });
      const inspected = await inspectDirectory(expectedRoot, "附件根目录");
      rootIdentity = { realPath: inspected.realPath, dev: inspected.stats.dev, ino: inspected.stats.ino };
      return expectedRoot;
    }
    let inspected;
    try {
      inspected = await inspectDirectory(expectedRoot, "附件根目录");
    } catch (error) {
      if (error instanceof TaskAttachmentStoreError) throw error;
      throw new TaskAttachmentStoreError("附件根目录不可用", "UNSAFE_ROOT");
    }
    if (!isSamePath(inspected.realPath, rootIdentity.realPath)
      || inspected.stats.dev !== rootIdentity.dev
      || inspected.stats.ino !== rootIdentity.ino) {
      throw new TaskAttachmentStoreError("附件根目录已被替换", "UNSAFE_ROOT");
    }
    return expectedRoot;
  }

  function taskPathFor(taskId) {
    validateTaskId(taskId);
    const taskPath = path.join(expectedRoot, taskId);
    if (!isWithin(expectedRoot, taskPath)) {
      throw new TaskAttachmentStoreError("任务附件目录越界", "PATH_OUTSIDE_ROOT");
    }
    return taskPath;
  }

  async function inspectTaskDirectory(taskId, { create = false, allowMissing = false } = {}) {
    await assertManagedRoot();
    const taskPath = taskPathFor(taskId);
    if (create) {
      await fs.promises.mkdir(taskPath, { recursive: false }).catch((error) => {
        if (error.code !== "EEXIST") throw error;
      });
    }
    let inspected;
    try {
      inspected = await inspectDirectory(taskPath, "任务附件目录");
    } catch (error) {
      if (allowMissing && error.code === "ENOENT") return null;
      if (error instanceof TaskAttachmentStoreError) throw error;
      if (error.code === "ENOENT") {
        throw new TaskAttachmentStoreError("任务附件目录不存在", "TASK_DIRECTORY_MISSING");
      }
      throw error;
    }
    if (!isWithin(expectedRoot, inspected.realPath)) {
      throw new TaskAttachmentStoreError("任务附件目录越界", "PATH_OUTSIDE_ROOT");
    }
    return { path: taskPath, ...inspected };
  }

  async function inspectManagedFile(taskId, storageName, { allowMissing = false } = {}) {
    validateStorageName(storageName);
    const taskDirectory = await inspectTaskDirectory(taskId, { allowMissing });
    if (!taskDirectory) return null;
    const filePath = path.join(taskDirectory.path, storageName);
    if (!isWithin(taskDirectory.path, filePath)) {
      throw new TaskAttachmentStoreError("附件路径越界", "PATH_OUTSIDE_ROOT");
    }
    let stats;
    try {
      stats = await fs.promises.lstat(filePath);
    } catch (error) {
      if (allowMissing && error.code === "ENOENT") return null;
      if (error.code === "ENOENT") {
        throw new TaskAttachmentStoreError("附件文件不存在", "ATTACHMENT_MISSING");
      }
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw new TaskAttachmentStoreError("附件不能是符号链接", "UNSAFE_ATTACHMENT");
    }
    if (!stats.isFile()) {
      throw new TaskAttachmentStoreError("附件必须是普通文件", "UNSAFE_ATTACHMENT");
    }
    const realPath = await fs.promises.realpath(filePath);
    if (!isSamePath(realPath, filePath) || !isWithin(expectedRoot, realPath)) {
      throw new TaskAttachmentStoreError("附件路径越界", "PATH_OUTSIDE_ROOT");
    }
    return { path: filePath, stats };
  }

  async function listValidatedTaskFiles(taskId, { create = false, allowMissing = false } = {}) {
    const taskDirectory = await inspectTaskDirectory(taskId, { create, allowMissing });
    if (!taskDirectory) return { taskDirectory: null, files: [] };
    const names = await fs.promises.readdir(taskDirectory.path);
    const files = [];
    for (const name of names) {
      validateStorageName(name);
      const inspected = await inspectManagedFile(taskId, name);
      files.push({ storageName: name, ...inspected });
    }
    return { taskDirectory, files };
  }

  async function validateSourceFile(sourcePath) {
    const stats = await fs.promises.lstat(sourcePath);
    if (stats.isSymbolicLink()) {
      throw new TaskAttachmentStoreError("附件源文件不能是符号链接", "INVALID_SOURCE_FILE");
    }
    if (!stats.isFile()) {
      throw new TaskAttachmentStoreError("只能导入普通文件", "INVALID_SOURCE_FILE");
    }
    const realPath = await fs.promises.realpath(sourcePath);
    const realStats = await fs.promises.stat(realPath);
    if (!realStats.isFile()) {
      throw new TaskAttachmentStoreError("只能导入普通文件", "INVALID_SOURCE_FILE");
    }
    if (realStats.size > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new TaskAttachmentStoreError("单个附件不能超过 20 MB", "ATTACHMENT_TOO_LARGE");
    }
    return { sourcePath: realPath, size: realStats.size };
  }

  async function removeEmptyTaskDirectory(taskId) {
    const taskDirectory = await inspectTaskDirectory(taskId, { allowMissing: true });
    if (!taskDirectory) return;
    await fs.promises.rmdir(taskDirectory.path).catch((error) => {
      if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error;
    });
  }

  async function removeImportedFiles(taskId, storageNames) {
    const failedStorageNames = [];
    for (const storageName of storageNames) {
      try {
        const inspected = await inspectManagedFile(taskId, storageName, { allowMissing: true });
        if (inspected) await fs.promises.rm(inspected.path, { force: false });
      } catch (_error) {
        failedStorageNames.push(storageName);
      }
    }
    if (failedStorageNames.length === 0) await removeEmptyTaskDirectory(taskId);
    return failedStorageNames;
  }

  async function copyFilesForTask({ taskId, sourcePaths, now }) {
    const paths = normalizeSourcePaths(sourcePaths);
    if (paths.length === 0) return [];
    const addedAt = now === undefined ? Date.now() : Number(now);
    if (!Number.isFinite(addedAt) || addedAt <= 0) {
      throw new TaskAttachmentStoreError("附件添加时间无效", "INVALID_ADDED_AT");
    }
    const validatedSources = [];
    for (const sourcePath of paths) validatedSources.push(await validateSourceFile(sourcePath));
    const current = await listValidatedTaskFiles(taskId, { create: true });
    if (current.files.length + validatedSources.length > MAX_ATTACHMENTS_PER_TASK) {
      throw new TaskAttachmentStoreError("每个任务最多添加 10 个附件", "ATTACHMENT_LIMIT");
    }
    const imported = [];
    try {
      for (const file of validatedSources) {
        await assertManagedRoot();
        await inspectTaskDirectory(taskId);
        const extension = extensionFor(file.sourcePath);
        const storageName = `${crypto.randomUUID()}${extension}`;
        const destination = path.join(current.taskDirectory.path, storageName);
        if (!isWithin(expectedRoot, destination)) {
          throw new TaskAttachmentStoreError("附件路径越界", "PATH_OUTSIDE_ROOT");
        }
        await fs.promises.copyFile(file.sourcePath, destination, fs.constants.COPYFILE_EXCL);
        await inspectManagedFile(taskId, storageName);
        imported.push({
          id: crypto.randomUUID(),
          name: path.basename(file.sourcePath),
          storageName,
          mimeType: IMAGE_MIME_TYPES[extension] || "application/octet-stream",
          size: file.size,
          addedAt
        });
      }
      return imported;
    } catch (error) {
      await removeImportedFiles(taskId, imported.map((attachment) => attachment.storageName));
      throw new TaskAttachmentStoreError(`导入附件失败：${error.message}`, "ATTACHMENT_IMPORT_FAILED");
    }
  }

  async function importFiles({ taskId, sourcePaths, now } = {}) {
    validateTaskId(taskId);
    return enqueueTask(taskId, async () => {
      if (activeTransactions.has(taskId)) {
        throw new TaskAttachmentStoreError("任务附件事务正在进行", "TRANSACTION_ACTIVE");
      }
      return copyFilesForTask({ taskId, sourcePaths, now });
    });
  }

  async function prepareChanges({ taskId, sourcePaths = [], removeStorageNames = [], now } = {}) {
    validateTaskId(taskId);
    if (!Array.isArray(removeStorageNames)) {
      throw new TaskAttachmentStoreError("待删除附件列表无效", "INVALID_REMOVALS");
    }
    const removals = [...new Set(removeStorageNames.map(validateStorageName))];
    return enqueueTask(taskId, async () => {
      await assertManagedRoot();
      if (activeTransactions.has(taskId)) {
        throw new TaskAttachmentStoreError("任务附件事务正在进行", "TRANSACTION_ACTIVE");
      }
      const attachments = await copyFilesForTask({ taskId, sourcePaths, now });
      const transactionId = crypto.randomUUID();
      activeTransactions.set(taskId, {
        transactionId,
        importedStorageNames: attachments.map((attachment) => attachment.storageName),
        removeStorageNames: removals
      });
      return { transactionId, attachments };
    });
  }

  function requireTransaction(taskId, transactionId) {
    validateTaskId(taskId);
    if (typeof transactionId !== "string" || !transactionId) {
      throw new TaskAttachmentStoreError("附件事务 ID 无效", "INVALID_TRANSACTION");
    }
    const transaction = activeTransactions.get(taskId);
    if (!transaction || transaction.transactionId !== transactionId) {
      throw new TaskAttachmentStoreError("附件事务不存在", "TRANSACTION_MISSING");
    }
    return transaction;
  }

  async function rollbackChanges({ taskId, transactionId }) {
    return enqueueTask(taskId, async () => {
      const transaction = requireTransaction(taskId, transactionId);
      let failedStorageNames = [];
      try {
        failedStorageNames = await removeImportedFiles(taskId, transaction.importedStorageNames);
      } finally {
        activeTransactions.delete(taskId);
      }
      return { failedStorageNames };
    });
  }

  async function commitChanges({ taskId, transactionId }) {
    return enqueueTask(taskId, async () => {
      const transaction = requireTransaction(taskId, transactionId);
      const failedStorageNames = [];
      try {
        for (const storageName of transaction.removeStorageNames) {
          try {
            const inspected = await inspectManagedFile(taskId, storageName, { allowMissing: true });
            if (inspected) await fs.promises.rm(inspected.path, { force: false });
          } catch (_error) {
            failedStorageNames.push(storageName);
          }
        }
        if (failedStorageNames.length === 0) await removeEmptyTaskDirectory(taskId);
      } finally {
        activeTransactions.delete(taskId);
      }
      return { failedStorageNames };
    });
  }

  async function removeAttachment({ taskId, storageName }) {
    validateTaskId(taskId);
    validateStorageName(storageName);
    return enqueueTask(taskId, async () => {
      if (activeTransactions.has(taskId)) {
        throw new TaskAttachmentStoreError("任务附件事务正在进行", "TRANSACTION_ACTIVE");
      }
      const inspected = await inspectManagedFile(taskId, storageName, { allowMissing: true });
      if (inspected) await fs.promises.rm(inspected.path, { force: false });
      await removeEmptyTaskDirectory(taskId);
      return true;
    });
  }

  async function reconcileTask({ taskId, storageNames }) {
    validateTaskId(taskId);
    if (!Array.isArray(storageNames)) {
      throw new TaskAttachmentStoreError("附件引用列表无效", "INVALID_REFERENCES");
    }
    const referenced = new Set(storageNames.map(validateStorageName));
    return enqueueTask(taskId, async () => {
      if (activeTransactions.has(taskId)) {
        throw new TaskAttachmentStoreError("任务附件事务正在进行", "TRANSACTION_ACTIVE");
      }
      const current = await listValidatedTaskFiles(taskId, { allowMissing: true });
      if (!current.taskDirectory) return { taskId, removedStorageNames: [] };
      const stale = current.files.filter((file) => !referenced.has(file.storageName));
      const removedStorageNames = [];
      for (const file of stale) {
        await assertManagedRoot();
        const inspected = await inspectManagedFile(taskId, file.storageName);
        await fs.promises.rm(inspected.path, { force: false });
        removedStorageNames.push(file.storageName);
      }
      await removeEmptyTaskDirectory(taskId);
      return { taskId, removedStorageNames };
    });
  }

  async function reconcileTasks(references) {
    if (!Array.isArray(references)) {
      throw new TaskAttachmentStoreError("任务附件引用无效", "INVALID_REFERENCES");
    }
    const seen = new Set();
    for (const reference of references) {
      if (!reference || typeof reference !== "object" || Array.isArray(reference)) {
        throw new TaskAttachmentStoreError("任务附件引用无效", "INVALID_REFERENCES");
      }
      validateTaskId(reference.taskId);
      if (seen.has(reference.taskId)) {
        throw new TaskAttachmentStoreError("任务附件引用重复", "DUPLICATE_REFERENCE");
      }
      seen.add(reference.taskId);
      if (!Array.isArray(reference.storageNames)) {
        throw new TaskAttachmentStoreError("附件引用列表无效", "INVALID_REFERENCES");
      }
      reference.storageNames.forEach(validateStorageName);
    }
    return Promise.all(references.map(reconcileTask));
  }

  async function resolveAttachmentPath({ taskId, storageName }) {
    const inspected = await inspectManagedFile(taskId, storageName);
    return inspected.path;
  }

  async function getAttachmentUrl(payload) {
    return pathToFileURL(await resolveAttachmentPath(payload)).href;
  }

  async function removeTaskAttachments(taskIdOrPayload) {
    const taskId = typeof taskIdOrPayload === "string" ? taskIdOrPayload : taskIdOrPayload?.taskId;
    validateTaskId(taskId);
    return enqueueTask(taskId, async () => {
      if (activeTransactions.has(taskId)) {
        throw new TaskAttachmentStoreError("任务附件事务正在进行", "TRANSACTION_ACTIVE");
      }
      const current = await listValidatedTaskFiles(taskId, { allowMissing: true });
      if (!current.taskDirectory) return true;
      await assertManagedRoot();
      for (const file of current.files) {
        await assertManagedRoot();
        const inspected = await inspectManagedFile(taskId, file.storageName);
        await fs.promises.rm(inspected.path, { force: false });
      }
      await fs.promises.rmdir(current.taskDirectory.path);
      return true;
    });
  }

  return {
    importFiles,
    prepareChanges,
    commitChanges,
    rollbackChanges,
    reconcileTasks,
    removeAttachment,
    removeTaskAttachments,
    resolveAttachmentPath,
    getAttachmentUrl
  };
}

module.exports = {
  MAX_ATTACHMENTS_PER_TASK,
  MAX_ATTACHMENT_SIZE_BYTES,
  TaskAttachmentStoreError,
  createTaskAttachmentStore
};
