const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const MAX_TASK_ATTACHMENTS = 10;
const MAX_TASK_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const TASK_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const STORAGE_NAME_PATTERN = /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]{1,12})?$/;
const SAFE_EXTENSION_PATTERN = /^\.[a-zA-Z0-9]{1,12}$/;
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
  const taskImportQueues = new Map();

  function resolveContainedPath(...segments) {
    const resolvedPath = path.resolve(resolvedRoot, ...segments);
    if (!resolvedPath.startsWith(rootPrefix)) {
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

  async function ensureTaskDirectory(taskPath) {
    await fs.promises.mkdir(resolvedRoot, { recursive: true });
    try {
      await fs.promises.mkdir(taskPath);
      return true;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const stats = await fs.promises.lstat(taskPath);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new AttachmentStoreError("任务附件目录不安全");
      }
      return false;
    }
  }

  function queueTaskImport(taskId, operation) {
    const previous = taskImportQueues.get(taskId) || Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    taskImportQueues.set(taskId, current);
    return current.finally(() => {
      if (taskImportQueues.get(taskId) === current) taskImportQueues.delete(taskId);
    });
  }

  async function importFilesForTask({ taskId, sourcePaths, now }) {
    const selectedPaths = Array.isArray(sourcePaths) ? sourcePaths : [];
    if (selectedPaths.length === 0) return [];

    const addedAt = now === undefined ? Date.now() : Number(now);
    if (!Number.isFinite(addedAt) || addedAt <= 0) {
      throw new AttachmentStoreError("附件添加时间无效");
    }

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
    return queueTaskImport(taskId, () => importFilesForTask({ taskId, sourcePaths, now }));
  }

  async function resolveAttachmentPath(value, storageNameValue) {
    const { taskId, storageName } = getAttachmentArguments(value, storageNameValue);
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
      if (error.code === "ENOENT") throw new AttachmentStoreError("附件文件已不存在");
      throw error;
    }
    if (taskStats.isSymbolicLink()) throw new AttachmentStoreError("任务附件目录不能是符号链接");
    if (!taskStats.isDirectory()) throw new AttachmentStoreError("任务附件目录不安全");
    if (attachmentStats.isSymbolicLink()) throw new AttachmentStoreError("附件文件不能是符号链接");
    if (!attachmentStats.isFile()) throw new AttachmentStoreError("附件必须是普通文件");

    const [realRoot, realAttachmentPath] = await Promise.all([
      fs.promises.realpath(resolvedRoot),
      fs.promises.realpath(attachmentPath)
    ]);
    const relativePath = path.relative(realRoot, realAttachmentPath);
    if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${path.sep}`)
        || path.isAbsolute(relativePath)) {
      throw new AttachmentStoreError("附件路径超出存储目录");
    }
    return realAttachmentPath;
  }

  async function getAttachmentUrl(value, storageNameValue) {
    const resolvedPath = await resolveAttachmentPath(value, storageNameValue);
    return pathToFileURL(resolvedPath).href;
  }

  async function removeAttachment(value, storageNameValue) {
    let resolvedPath;
    try {
      resolvedPath = await resolveAttachmentPath(value, storageNameValue);
    } catch (error) {
      if (error instanceof AttachmentStoreError && error.message === "附件文件已不存在") return;
      throw error;
    }
    await fs.promises.rm(resolvedPath, { force: true });
  }

  async function removeTaskAttachments(value) {
    const taskId = getTaskId(value);
    const taskPath = resolveContainedPath(taskId);
    await fs.promises.rm(taskPath, { recursive: true, force: true });
  }

  return {
    importFiles,
    removeAttachment,
    removeTaskAttachments,
    resolveAttachmentPath,
    getAttachmentUrl
  };
}

module.exports = { createTaskAttachmentStore };
