/* ==========================================================
   preload 脚本：安全暴露桌面 API 给渲染进程
   ========================================================== */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  // 原生系统通知
  notify: (title, body) => ipcRenderer.invoke("notify", { title, body }),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getDataPath: () => ipcRenderer.invoke("get-data-path"),
  onWindowShown: callback => {
    const listener = () => callback();
    ipcRenderer.on("window-shown", listener);
    return () => ipcRenderer.removeListener("window-shown", listener);
  },

  // 平台信息
  platforms: {
    isWindows: process.platform === "win32",
    isMac: process.platform === "darwin",
    isLinux: process.platform === "linux"
  },

  // 应用版本
  version: process.env.npm_package_version || "1.0.4"
});
