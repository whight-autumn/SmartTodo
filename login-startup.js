const path = require("node:path");

function readAutoStartState({ app, platform = process.platform, execPath = process.execPath }) {
  if (platform !== "win32") return { available: false, enabled: false };
  const settings = app.getLoginItemSettings({ path: execPath, args: ["--hidden"] });
  let enabled = Boolean(settings.openAtLogin);
  // openAtLogin describes the Run entry, which Windows can separately disable.
  if (typeof settings.executableWillLaunchAtLogin === "boolean") {
    enabled = enabled && settings.executableWillLaunchAtLogin;
  }
  if (Array.isArray(settings.launchItems)) {
    const executable = path.win32.normalize(execPath).toLowerCase();
    enabled = enabled && settings.launchItems.some(item =>
      typeof item.path === "string" &&
      path.win32.normalize(item.path).toLowerCase() === executable &&
      Array.isArray(item.args) && item.args.length === 1 && item.args[0] === "--hidden" &&
      item.enabled === true
    );
  }
  return { available: true, enabled };
}

function writeAutoStartState({ app, platform = process.platform, execPath = process.execPath, enabled }) {
  if (platform !== "win32") return { available: false, enabled: false };
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), path: execPath, args: ["--hidden"] });
  return readAutoStartState({ app, platform, execPath });
}

module.exports = { readAutoStartState, writeAutoStartState };
