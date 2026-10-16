"use strict";

const { contextBridge, ipcRenderer } = require("electron");

function clonePayload(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

contextBridge.exposeInMainWorld("taskWidget", {
  getSnapshot: () => ipcRenderer.invoke("widget:get-snapshot"),
  toggleTask: taskId => ipcRenderer.invoke("widget:toggle-task", { taskId }),
  setVisible: visible => ipcRenderer.invoke("widget:set-visible", { visible }),
  showMainWindow: () => ipcRenderer.invoke("widget:show-main"),
  onSnapshot: callback => {
    const listener = (_event, payload) => callback(clonePayload(payload));
    ipcRenderer.on("widget:snapshot", listener);
    return () => ipcRenderer.removeListener("widget:snapshot", listener);
  }
});
