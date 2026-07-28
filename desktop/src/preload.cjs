const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yuanceDesktop", Object.freeze({
  notify(payload) {
    return ipcRenderer.invoke("yuance:notify", payload);
  },
  onNotificationClick(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }
    const listener = (_event, targetPath) => callback(targetPath);
    ipcRenderer.on("yuance:notification-click", listener);
    return () => ipcRenderer.removeListener("yuance:notification-click", listener);
  },
}));
