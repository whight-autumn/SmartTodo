const path = require("path");

function buildManagedUserDataPath(appDataPath) {
  return path.join(appDataPath, "智能任务管家", "运行数据");
}

module.exports = { buildManagedUserDataPath };
