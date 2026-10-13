function readAutoStartState({ app, platform = process.platform, execPath = process.execPath }) {
  if (platform !== "win32") return { available: false, enabled: false };
  const settings = app.getLoginItemSettings({ path: execPath, args: ["--hidden"] });
  return { available: true, enabled: Boolean(settings.openAtLogin) };
}

function writeAutoStartState({ app, platform = process.platform, execPath = process.execPath, enabled }) {
  if (platform !== "win32") return { available: false, enabled: false };
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), path: execPath, args: ["--hidden"] });
  return readAutoStartState({ app, platform, execPath });
}

module.exports = { readAutoStartState, writeAutoStartState };
