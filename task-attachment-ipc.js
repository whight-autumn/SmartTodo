const path = require("node:path");

const TASK_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const STORAGE_NAME_PATTERN = /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]{1,12})?$/;
const TRANSACTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

function validatePreparePayload(value) {
  const payload = validateExactPayload(
    value,
    ["taskId", "sourcePaths", "removeStorageNames", "existingCount"],
    "准备附件变更"
  );
  if (!Array.isArray(payload.sourcePaths) || payload.sourcePaths.some(sourcePath => (
    typeof sourcePath !== "string" || !path.isAbsolute(sourcePath)
  ))) {
    throw new Error("附件源路径无效");
  }
  if (!Array.isArray(payload.removeStorageNames)) {
    throw new Error("待移除附件列表无效");
  }
  const removeStorageNames = payload.removeStorageNames.map(validateStorageName);
  if (new Set(removeStorageNames).size !== removeStorageNames.length) {
    throw new Error("待移除附件列表无效");
  }
  if (!Number.isInteger(payload.existingCount) || payload.existingCount < 0) {
    throw new Error("现有附件数量无效");
  }
  return {
    taskId: validateTaskId(payload.taskId),
    sourcePaths: [...payload.sourcePaths],
    removeStorageNames,
    existingCount: payload.existingCount
  };
}

function validateTransactionPayload(value, operationName) {
  const payload = validateExactPayload(value, ["taskId", "transactionId"], operationName);
  if (typeof payload.transactionId !== "string" || !TRANSACTION_ID_PATTERN.test(payload.transactionId)) {
    throw new Error("附件事务 ID 不安全");
  }
  return {
    taskId: validateTaskId(payload.taskId),
    transactionId: payload.transactionId
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

  ipcMain.handle("task-attachment:prepare-changes", async (_event, payload) => (
    attachmentStore.prepareChanges(validatePreparePayload(payload))
  ));
  ipcMain.handle("task-attachment:commit-changes", async (_event, payload) => {
    await attachmentStore.commitChanges(validateTransactionPayload(payload, "提交附件变更"));
    return true;
  });
  ipcMain.handle("task-attachment:rollback-changes", async (_event, payload) => {
    await attachmentStore.rollbackChanges(validateTransactionPayload(payload, "回滚附件变更"));
    return true;
  });
  ipcMain.handle("task-attachment:remove-task-directories", async (_event, taskIds) => {
    await Promise.all(validateTaskIds(taskIds).map(taskId => attachmentStore.removeTaskAttachments(taskId)));
    return true;
  });
  ipcMain.handle("task-attachment:get-url", async (_event, payload) => (
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
