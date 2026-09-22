const fs = require("node:fs");
const path = require("path");

function buildManagedUserDataPath(appDataPath) {
  return path.join(appDataPath, "SmartTodo", "运行数据");
}

function buildLegacyUserDataPaths(appDataPath) {
  return [
    path.join(appDataPath, "智能任务管家", "运行数据"),
    path.join(appDataPath, "smart-assistant")
  ];
}

function buildTaskAttachmentPath(managedUserDataPath) {
  return path.join(managedUserDataPath, "task-attachments");
}

function migrateLegacyUserData({ appDataPath }) {
  const targetPath = buildManagedUserDataPath(appDataPath);
  const targetLocalStoragePath = path.join(targetPath, "Local Storage");
  fs.mkdirSync(targetPath, { recursive: true });
  if (fs.existsSync(targetLocalStoragePath)) return null;

  const sourcePath = buildLegacyUserDataPaths(appDataPath)
    .find(candidate => fs.existsSync(path.join(candidate, "Local Storage")));
  if (!sourcePath) return null;

  fs.cpSync(sourcePath, targetPath, {
    recursive: true,
    force: false,
    errorOnExist: false
  });
  return sourcePath;
}

module.exports = {
  buildManagedUserDataPath,
  buildLegacyUserDataPaths,
  buildTaskAttachmentPath,
  migrateLegacyUserData
};
