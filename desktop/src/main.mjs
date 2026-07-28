import { app, BrowserWindow, Notification, ipcMain, nativeImage, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolvePngBrandIconPath,
  shouldApplyRuntimeDockIcon,
} from "./branding.mjs";
import {
  isDevelopmentRuntime,
  isSafeExternalUrl,
  isTrustedAppUrl,
  normalizeNotificationPayload,
  resolveDesktopAppIdentity,
  resolveDevelopmentDataPaths,
  resolveWebUrl,
} from "./config.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const isDevRuntime = isDevelopmentRuntime({
  isPackaged: app.isPackaged,
  channel: process.env.YUANCE_DESKTOP_CHANNEL,
});
const appIdentity = resolveDesktopAppIdentity(isDevRuntime);
const webConfig = resolveWebUrl();
const activeNotifications = new Set();
let mainWindow = null;

function resolveCurrentPngBrandIconPath() {
  return resolvePngBrandIconPath({
    isDevRuntime,
    isPackaged: app.isPackaged,
    moduleDir,
    resourcesPath: process.resourcesPath,
  });
}

function applyRuntimeBrandIcon() {
  const dock = app.dock;
  if (!shouldApplyRuntimeDockIcon(process.platform, Boolean(dock), isDevRuntime)) {
    return;
  }
  const icon = nativeImage.createFromPath(resolveCurrentPngBrandIconPath());
  if (!icon.isEmpty()) {
    dock.setIcon(icon);
  }
}

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
    title: appIdentity.displayName,
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

app.setName(appIdentity.displayName);
app.setAppUserModelId(appIdentity.appUserModelId);
if (isDevRuntime) {
  const developmentDataPaths = resolveDevelopmentDataPaths(app.getPath("appData"));
  app.setPath("userData", developmentDataPaths.userData);
  app.setPath("sessionData", developmentDataPaths.sessionData);
}
ipcMain.handle("yuance:notify", notifyFromRenderer);

app.whenReady().then(() => {
  applyRuntimeBrandIcon();
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
