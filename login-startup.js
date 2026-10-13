const path = require("node:path");
const { resolveAppLaunchSpec } = require("./app-launch-spec.js");

function readAutoStartState({ app, platform = process.platform, ...launchOptions }) {
  if (platform !== "win32") return { available: false, enabled: false };
  const { execPath, args } = resolveAppLaunchSpec({ app, platform, ...launchOptions, hidden: true });
  const settings = app.getLoginItemSettings({ path: execPath, args });
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
      Array.isArray(item.args) && item.args.length === args.length && item.args.every((arg, index) => arg === args[index]) &&
      item.enabled === true
    );
  }
  return { available: true, enabled };
}

function writeAutoStartState({ app, platform = process.platform, enabled, ...launchOptions }) {
  if (platform !== "win32") return { available: false, enabled: false };
  const { execPath, args } = resolveAppLaunchSpec({ app, platform, ...launchOptions, hidden: true });
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), path: execPath, args });
  return readAutoStartState({ app, platform, ...launchOptions });
}

module.exports = { readAutoStartState, writeAutoStartState };
