import { app, BrowserWindow, Notification, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isSafeExternalUrl,
  isTrustedAppUrl,
  normalizeNotificationPayload,
  resolveWebUrl,
} from "./config.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const webConfig = resolveWebUrl();
const activeNotifications = new Set();
let mainWindow = null;

function openExternalIfSafe(value) {
  if (!isSafeExternalUrl(value)) {
    return false;
  }
  shell.openExternal(value).catch(() => {});
  return true;
}

function revealWindow(targetPath) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send("yuance:notification-click", targetPath);
}

function handleInAppNavigation(event, targetUrl) {
  if (isTrustedAppUrl(targetUrl, webConfig.origin)) {
    return;
  }
  event.preventDefault();
  openExternalIfSafe(targetUrl);
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: "#f4f7f8",
    title: "元策",
    webPreferences: {
      preload: path.join(moduleDir, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.on("will-navigate", handleInAppNavigation);
  window.webContents.on("will-redirect", handleInAppNavigation);
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfSafe(url);
    return { action: "deny" };
  });
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
  window.loadURL(webConfig.url).catch((error) => {
    console.error("Failed to load Yuance web application:", error);
  });
  return window;
}

function notifyFromRenderer(event, payload) {
  if (!isTrustedAppUrl(event.sender.getURL(), webConfig.origin)) {
    throw new Error("Untrusted renderer attempted to create a native notification.");
  }
  if (!Notification.isSupported() || (mainWindow && mainWindow.isFocused())) {
    return { shown: false };
  }

  const notificationPayload = normalizeNotificationPayload(payload, webConfig.origin);
  const notification = new Notification({
    title: notificationPayload.title,
    body: notificationPayload.body,
    silent: false,
  });
  activeNotifications.add(notification);
  notification.once("click", () => revealWindow(notificationPayload.targetPath));
  notification.once("close", () => activeNotifications.delete(notification));
  notification.show();
  return { shown: true };
}

app.setAppUserModelId("com.quanxinfu.yuance");
ipcMain.handle("yuance:notify", notifyFromRenderer);

app.whenReady().then(() => {
  mainWindow = createMainWindow();
  app.on("activate", () => {
    if (!mainWindow) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
