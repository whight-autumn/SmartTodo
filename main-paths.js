const path = require("path");

function buildManagedUserDataPath(appDataPath) {
  return path.join(appDataPath, "智能任务管家", "运行数据");
}

function buildTaskAttachmentPath(managedUserDataPath) {
  return path.join(managedUserDataPath, "task-attachments");
}

module.exports = { buildManagedUserDataPath, buildTaskAttachmentPath };
