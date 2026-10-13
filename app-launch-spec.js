const path = require("node:path");

// Portable extraction paths expire on exit; the outer launcher is persistent.
function resolveAppLaunchSpec({ app, execPath = process.execPath, env = process.env,
  argv = process.argv, hidden = argv.includes("--hidden"), platform = process.platform }) {
  const pathApi = platform === "win32" ? path.win32 : path;
  const portablePath = env.PORTABLE_EXECUTABLE_FILE;
  let executable = execPath;
  let args = [];
  if (portablePath !== undefined) {
    if (typeof portablePath !== "string" || !portablePath.trim() || portablePath.includes("\0") ||
        !pathApi.isAbsolute(portablePath)) throw new Error("The portable launcher path is invalid.");
    executable = portablePath;
  } else if (app.isPackaged === false) {
    const entry = app.getAppPath();
    if (typeof entry !== "string" || !pathApi.isAbsolute(entry) || entry.includes("\0")) {
      throw new Error("The application entry path is invalid.");
    }
    args = [entry];
  }
  if (hidden) args.push("--hidden");
  return { execPath: executable, args };
}

module.exports = { resolveAppLaunchSpec };
