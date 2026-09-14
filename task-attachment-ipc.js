const path = require("node:path");

const TASK_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const STORAGE_NAME_PATTERN = /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]{1,12})?$/;
const EXTERNAL_PROTOCOLS = new Set(["http:", "https:"]);

function validateExactPayload(value, keys, operationName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${operationName}参数无效`);
  }
  const payloadKeys = Object.keys(value);
  if (payloadKeys.length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw new Error(`${operationName}参数无效`);
  }
  return value;
}

function validateTaskId(value) {
  if (typeof value !== "string" || !TASK_ID_PATTERN.test(value)) {
    throw new Error("任务 ID 不安全");
  }
  return value;
}

function validateStorageName(value) {
  if (typeof value !== "string" || !STORAGE_NAME_PATTERN.test(value)) {
    throw new Error("附件存储名称不安全");
  }
  return value;
}

function validateAttachmentPayload(value, operationName) {
  const payload = validateExactPayload(value, ["taskId", "storageName"], operationName);
  return {
    taskId: validateTaskId(payload.taskId),
    storageName: validateStorageName(payload.storageName)
  };
}

function validateImportPayload(value) {
  const payload = validateExactPayload(value, ["taskId", "sourcePaths", "existingCount"], "导入附件");
  if (!Array.isArray(payload.sourcePaths) || payload.sourcePaths.some(sourcePath => (
    typeof sourcePath !== "string" || !path.isAbsolute(sourcePath)
  ))) {
    throw new Error("附件源路径无效");
  }
  if (!Number.isInteger(payload.existingCount) || payload.existingCount < 0) {
    throw new Error("现有附件数量无效");
  }
  return {
    taskId: validateTaskId(payload.taskId),
    sourcePaths: [...payload.sourcePaths],
    existingCount: payload.existingCount
  };
}

function validateTaskIds(value) {
  if (!Array.isArray(value)) {
    throw new Error("任务 ID 列表无效");
  }
  return value.map(validateTaskId);
}

function registerTaskAttachmentIpc({ ipcMain, shell, attachmentStore }) {
  async function openExternalUrl(value) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error("外部链接无效");
    }

    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("外部链接无效");
    }
    if (!EXTERNAL_PROTOCOLS.has(url.protocol)) {
      throw new Error("仅支持打开 HTTP/HTTPS 链接");
    }
    await shell.openExternal(url.href);
    return true;
  }

  ipcMain.handle("task-attachment:import", (_event, payload) => (
    attachmentStore.importFiles(validateImportPayload(payload))
  ));
  ipcMain.handle("task-attachment:remove", async (_event, payload) => {
    await attachmentStore.removeAttachment(validateAttachmentPayload(payload, "删除附件"));
    return true;
  });
  ipcMain.handle("task-attachment:remove-task-directories", async (_event, taskIds) => {
    await Promise.all(validateTaskIds(taskIds).map(taskId => attachmentStore.removeTaskAttachments(taskId)));
    return true;
  });
  ipcMain.handle("task-attachment:get-url", (_event, payload) => (
    attachmentStore.getAttachmentUrl(validateAttachmentPayload(payload, "获取附件地址"))
  ));
  ipcMain.handle("task-attachment:open", async (_event, payload) => {
    const attachmentPath = await attachmentStore.resolveAttachmentPath(
      validateAttachmentPayload(payload, "打开附件")
    );
    const errorMessage = await shell.openPath(attachmentPath);
    if (errorMessage) {
      throw new Error(`打开附件失败：${errorMessage}`);
    }
    return true;
  });
  ipcMain.handle("task-attachment:open-external", (_event, value) => openExternalUrl(value));

  return { openExternalUrl };
}

module.exports = { registerTaskAttachmentIpc };
