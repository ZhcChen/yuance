import {
  app,
  BrowserWindow,
  dialog,
  Notification,
  ipcMain,
  nativeImage,
  protocol,
  safeStorage,
  session,
  shell,
} from "electron";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolvePngBrandIconPath,
  shouldApplyRuntimeDockIcon,
} from "./branding.mjs";
import {
  isDevelopmentRuntime,
  normalizeNotificationPayload,
  resolveDesktopAppIdentity,
  resolveDeviceAuthEndpoint,
  resolveDevelopmentDataPaths,
} from "./config.mjs";
import { createProfileCredentialStore } from "./auth/credential-store.mjs";
import { createDesktopProfile } from "./auth/profile.mjs";
import { createDeviceAuthClient } from "./auth/device-auth-client.mjs";
import { loadOrCreateInstallationId } from "./auth/installation-id.mjs";
import {
  createCredentialCoordinator,
  createPendingAuthorizationStore,
  createPendingRevocationStore,
} from "./auth/credential-coordinator.mjs";
import { runSafeStorageSmoke } from "./auth/safe-storage-smoke.mjs";
import { createHostStatePublisher } from "./ipc/host-state.mjs";
import {
  createIpcSenderPolicy,
  createRendererReadinessTracker,
  parseNotificationPayload,
} from "./ipc/sender-policy.mjs";
import { registerAppProtocol } from "./protocol/app-protocol-handler.mjs";
import {
  browserWindowWebPreferences,
  decideNavigation,
  isTrustedRendererUrl,
  normalizeSafeExternalUrl,
  resolveRendererTarget,
} from "./window/security-policy.mjs";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true },
  },
]);

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const isDevRuntime = isDevelopmentRuntime({
  isPackaged: app.isPackaged,
});
const appIdentity = resolveDesktopAppIdentity(isDevRuntime);
const rendererTarget = resolveRendererTarget({
  isPackaged: app.isPackaged,
  rawDevServerUrl: process.env.YUANCE_DESKTOP_RENDERER_URL,
});
const appProtocolSmoke = app.isPackaged && process.argv.includes("--app-protocol-smoke");
const APP_PROTOCOL_SMOKE_STABILITY_MS = 1_000;
const appProtocolSmokeRequests = [];
const appProtocolSmokeResponses = [];
let appProtocolSmokePermissionChecks = 0;
let appProtocolSmokeDataPath;
let appProtocolSmokeInitialRenderer;
let appProtocolSmokePhase = "initial";
const activeNotifications = new Set();
let mainWindow = null;
let credentialStoreForProfile = null;
const hostStatePublisher = createHostStatePublisher();
const rendererReadiness = createRendererReadinessTracker(rendererTarget);
const assertTrustedIpcSender = createIpcSenderPolicy({
  getMainWindow: () => mainWindow,
  isNavigationPending: rendererReadiness.isPending,
  rendererTarget,
});

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function settleWithin(promise, timeoutMs) {
  return Promise.race([promise, delay(timeoutMs)]);
}

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
  const safeUrl = normalizeSafeExternalUrl(value, {
    isDevelopment: isDevRuntime,
    devOrigin: rendererTarget.kind === "dev-server" ? rendererTarget.origin : undefined,
  });
  if (!safeUrl) return false;
  shell.openExternal(safeUrl).catch(() => {});
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

function handleNavigation(event) {
  const decision = decideNavigation({
    url: event.url,
    isMainFrame: event.isMainFrame,
    rendererTarget,
  });
  if (decision.action === "allow") return;
  event.preventDefault();
  if (decision.action === "external") openExternalIfSafe(event.url);
}

function createMainWindow() {
  rendererReadiness.reset();
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: "#f4f7f8",
    title: appIdentity.displayName,
    webPreferences: browserWindowWebPreferences({
      preloadPath: path.join(moduleDir, "preload.cjs"),
      partition: rendererTarget.partition,
    }),
  });

  if (!appProtocolSmoke) {
    window.once("ready-to-show", () => {
      window.maximize();
      window.show();
    });
  }
  window.webContents.on("will-navigate", handleNavigation);
  window.webContents.on("will-redirect", handleNavigation);
  window.webContents.on("will-frame-navigate", (event) => {
    if (!event.isMainFrame) handleNavigation(event);
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfSafe(url);
    return { action: "deny" };
  });
  window.webContents.session.setPermissionCheckHandler(() => {
    if (appProtocolSmoke) appProtocolSmokePermissionChecks += 1;
    return false;
  });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  window.webContents.on("did-start-navigation", (event) => {
    rendererReadiness.didStart(event);
  });
  window.webContents.on("did-finish-load", () => {
    if (rendererReadiness.didCommit(window.webContents.getURL())) {
      hostStatePublisher.publishTo(window);
      if (appProtocolSmoke) {
        runAppProtocolSmoke(window).catch((error) => {
          process.stderr.write(`app protocol smoke failed: ${error.message}\n`, () => app.exit(1));
        });
      }
    }
  });
  window.webContents.on("did-fail-load", (_event, _code, _description, _url, isMainFrame) => {
    if (isMainFrame) rendererReadiness.didCancelOrFail();
  });
  window.webContents.on("render-process-gone", () => {
    rendererReadiness.reset();
  });
  window.on("closed", () => {
    rendererReadiness.reset();
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
  window.loadURL(rendererTarget.url).catch((error) => {
    console.error("Failed to load Yuance renderer:", error);
    if (!window.isDestroyed()) window.destroy();
    if (appProtocolSmoke) app.exit(1);
    else {
      dialog.showErrorBox("元策无法启动", "应用界面加载失败，请重新启动或重新安装后再试。");
      app.quit();
    }
  });
  return window;
}

async function rendererSmokeSnapshot(window) {
  return window.webContents.executeJavaScript(`(async () => {
    const resourceUrls = performance.getEntriesByType("resource").map((entry) => entry.name);
    const bridge = window.yuanceDesktop;
    const frame = document.createElement("iframe");
    frame.id = "yuance-smoke-subframe";
    frame.hidden = true;
    document.body.append(frame);
    const subframeBridgeExposed = Boolean(frame.contentWindow && frame.contentWindow.yuanceDesktop);
    let invalidPayloadRejected = false;
    try {
      await bridge.notifications.show({ title: "smoke", unexpected: true });
    } catch (_error) {
      invalidPayloadRejected = true;
    }
    const permissionResult = await Promise.race([
      navigator.permissions.query({ name: "geolocation" }).then((result) => result.state, () => "error"),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 500)),
    ]);
    const networkProbeRejected = await fetch("https://127.0.0.1:9/yuance-smoke", {
      cache: "no-store",
      credentials: "omit",
    }).then(() => false, () => true);
    return {
      url: location.href,
      title: document.title,
      bodyText: document.body.innerText,
      bridgeSchemaVersion: bridge.schemaVersion,
      bridgeState: bridge.hostState.getSnapshot().status,
      resourceUrls,
      subframeBridgeExposed,
      invalidPayloadRejected,
      permissionResult,
      networkProbeRejected,
      windowOpenDenied: window.open("app://other/") === null,
    };
  })()`);
}

async function probeAppProtocolStatus(url) {
  const probeWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
      partition: rendererTarget.partition,
    },
  });
  const webContentsId = probeWindow.webContents.id;
  try {
    await settleWithin(probeWindow.loadURL(url).catch(() => {}), 500);
    await delay(50);
    return appProtocolSmokeResponses.findLast((entry) => entry.webContentsId === webContentsId)?.statusCode ?? 0;
  } finally {
    if (!probeWindow.isDestroyed()) probeWindow.destroy();
  }
}

async function finishAppProtocolSmoke(window) {
  const renderer = await rendererSmokeSnapshot(window);
  const subframe = window.webContents.mainFrame.frames.find((frame) => frame !== window.webContents.mainFrame);
  const subframeObserved = Boolean(subframe);
  let subframeIpcRejected = false;
  try {
    assertTrustedIpcSender({ sender: window.webContents, senderFrame: subframe });
  } catch (error) {
    subframeIpcRejected = error.message === "Untrusted renderer IPC sender.";
  }
  await window.webContents.executeJavaScript('document.querySelector("#yuance-smoke-subframe")?.remove()');
  await settleWithin(window.webContents.executeJavaScript('location.href = "app://other/"'), 500);
  await delay(100);
  const navigationDenied = window.webContents.getURL() === "app://yuance/projects/smoke";
  const protocolStatuses = {
    missing: await probeAppProtocolStatus("app://yuance/assets/missing.js"),
    traversal: await probeAppProtocolStatus("app://yuance/%252e%252e/index.html"),
    wrongHost: await probeAppProtocolStatus("app://other/"),
  };
  await delay(APP_PROTOCOL_SMOKE_STABILITY_MS);
  const documentResponse = appProtocolSmokeResponses.find((entry) => entry.url === "app://yuance/");
  const result = {
    kind: "yuance-app-protocol-smoke",
    url: renderer.url,
    hostState: hostStatePublisher.snapshot().status,
    externalRequestCount: appProtocolSmokeRequests.length,
    csp: documentResponse?.csp || "",
    initialRenderer: appProtocolSmokeInitialRenderer,
    reloadedRenderer: renderer,
    navigationDenied,
    permissionCheckCount: appProtocolSmokePermissionChecks,
    subframeObserved,
    subframeIpcRejected,
    protocolStatuses,
    resourceResponses: [...new Set(
      appProtocolSmokeResponses
        .filter((entry) => entry.url.startsWith("app://yuance/assets/") && entry.statusCode === 200)
        .map((entry) => entry.url),
    )],
    runtime: {
      isPackaged: app.isPackaged,
      rendererKind: rendererTarget.kind,
      partition: rendererTarget.partition,
      isolatedProfile: app.getPath("userData") === appProtocolSmokeDataPath
        && app.getPath("sessionData") === path.join(appProtocolSmokeDataPath, "Session Data"),
    },
  };
  if (appProtocolSmokeDataPath) {
    await fs.rm(appProtocolSmokeDataPath, { recursive: true, force: true }).catch(() => {});
  }
  await new Promise((resolve) => process.stdout.write(`${JSON.stringify(result)}\n`, resolve));
  app.exit(result.externalRequestCount === 0 ? 0 : 1);
}

async function runAppProtocolSmoke(window) {
  if (appProtocolSmokePhase === "initial") {
    appProtocolSmokePhase = "reloading";
    appProtocolSmokeInitialRenderer = await rendererSmokeSnapshot(window);
    await window.webContents.executeJavaScript('history.pushState({}, "", "/projects/smoke")');
    window.webContents.reload();
    return;
  }
  if (appProtocolSmokePhase !== "reloading") return;
  appProtocolSmokePhase = "finishing";
  await finishAppProtocolSmoke(window);
}

function notifyFromRenderer(event, payload) {
  assertTrustedIpcSender(event);
  if (!Notification.isSupported() || (mainWindow && mainWindow.isFocused())) {
    return { shown: false };
  }

  const notificationPayload = normalizeNotificationPayload(
    parseNotificationPayload(payload),
    rendererTarget.origin,
  );
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

function initializeCredentialStoreFactory() {
  const userDataPath = app.getPath("userData");
  credentialStoreForProfile = (profile) =>
    createProfileCredentialStore({
      safeStorage,
      fs,
      userDataPath,
      profile,
      platform: process.platform,
    });
}

async function installationId(userDataPath) {
  const filePath = path.join(userDataPath, "Device Credentials", "installation-id");
  return loadOrCreateInstallationId({ fs, filePath, platform: process.platform });
}

async function runDeviceAuthHeadless(serverInstanceId, { action = "authorize", openExternal = true } = {}) {
  const endpoint = resolveDeviceAuthEndpoint({ isDevRuntime });
  const profile = createDesktopProfile({
    endpoint,
    serverInstanceId,
    mode: "development",
    allowLoopbackHttp: endpoint.startsWith("http://"),
  });
  const userDataPath = app.getPath("userData");
  const credentialDirectory = path.join(userDataPath, "Device Credentials");
  const profileHash = profile.key.slice(profile.key.indexOf(":") + 1);
  const coordinator = createCredentialCoordinator({
    profile,
    credentialStore: credentialStoreForProfile(profile),
    pendingAuthorizationStore: createPendingAuthorizationStore({
      safeStorage,
      fs,
      filePath: path.join(credentialDirectory, `${profileHash}.authorization.enc.json`),
      profile,
      platform: process.platform,
    }),
    pendingRevocationStore: createPendingRevocationStore({
      fs,
      directory: path.join(credentialDirectory, "Pending Revocations"),
    }),
    client: createDeviceAuthClient({ profile }),
  });
  const initialized = await coordinator.initialize();
  if (action === "logout" && initialized.status === "locked" && initialized.reason === "pending_revocation") {
    const loggedOut = await coordinator.retryPendingRevocation();
    process.stdout.write(`${JSON.stringify({ status: loggedOut.status, loggedOut: true, recovered: true })}\n`);
    return;
  }
  if (action === "logout" && initialized.status === "revoked") {
    const loggedOut = await coordinator.discardLocalSession();
    process.stdout.write(`${JSON.stringify({ status: loggedOut.status, loggedOut: true, recovered: true })}\n`);
    return;
  }
  if (initialized.status === "authenticated") {
    if (action === "logout") {
      const loggedOut = await coordinator.logout();
      process.stdout.write(`${JSON.stringify({ status: loggedOut.status, loggedOut: true })}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify({ status: initialized.status, recovered: true })}\n`);
    return;
  }
  if (initialized.status === "locked" || initialized.status === "revoked") {
    throw new Error(`credential coordinator is ${initialized.status}: ${initialized.reason}`);
  }
  const result = await coordinator.authorize({
    installationId: await installationId(userDataPath),
    deviceName: `${appIdentity.displayName} (${process.platform})`,
    platform: process.platform,
    clientVersion: app.getVersion(),
    onUserCode: (userCode) => process.stdout.write(`user_code=${userCode}\n`),
    openExternal: openExternal
      ? (verificationUrl) => shell.openExternal(verificationUrl)
      : async () => {},
  });
  process.stdout.write(`${JSON.stringify({ status: result.status })}\n`);
}

app.setName(appIdentity.displayName);
app.setAppUserModelId(appIdentity.appUserModelId);
if (isDevRuntime) {
  const developmentDataPaths = resolveDevelopmentDataPaths(app.getPath("appData"));
  app.setPath("userData", developmentDataPaths.userData);
  app.setPath("sessionData", developmentDataPaths.sessionData);
}
if (appProtocolSmoke) {
  appProtocolSmokeDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-app-protocol-smoke-"));
  app.setPath("userData", appProtocolSmokeDataPath);
  app.setPath("sessionData", path.join(appProtocolSmokeDataPath, "Session Data"));
}
const headlessUserDataPath = !app.isPackaged
  ? process.argv.find((value) => value.startsWith("--user-data-path="))?.slice("--user-data-path=".length)
  : undefined;
if (headlessUserDataPath) {
  if (!path.isAbsolute(headlessUserDataPath)) throw new Error("--user-data-path must be absolute");
  app.setPath("userData", headlessUserDataPath);
  app.setPath("sessionData", path.join(headlessUserDataPath, "Session Data"));
}
const isSafeStorageSmoke = !app.isPackaged && process.argv.includes("--safe-storage-smoke");
const deviceAuthHeadless = !app.isPackaged && process.argv.includes("--device-auth-headless");
const headlessServerInstanceId = !app.isPackaged
  ? process.argv.find((value) => value.startsWith("--server-instance-id="))?.slice("--server-instance-id=".length)
  : undefined;
const headlessAction = !app.isPackaged
  ? process.argv.find((value) => value.startsWith("--device-auth-action="))?.slice("--device-auth-action=".length)
  : undefined;
const singleInstanceProbe = !app.isPackaged
  ? process.argv.find((value) => value.startsWith("--single-instance-lock-probe="))
  : undefined;
if (singleInstanceProbe) {
  const markerPath = singleInstanceProbe.slice(singleInstanceProbe.indexOf("=") + 1);
  const hasProbeLock = app.requestSingleInstanceLock();
  if (!hasProbeLock) {
    app.exit(2);
  } else {
    app.whenReady().then(async () => {
      await fs.writeFile(markerPath, "acquired", { mode: 0o600 });
      if (!process.argv.includes("--hold-lock-probe")) app.exit(0);
    });
  }
} else if (isSafeStorageSmoke) {
  app.whenReady().then(async () => {
    try {
      const result = await runSafeStorageSmoke({ safeStorage });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      app.exit(0);
    } catch (error) {
      process.stderr.write(`safeStorage smoke failed: ${error.message}\n`);
      app.exit(1);
    }
  });
} else if (deviceAuthHeadless) {
  const hasSingleInstanceLock = app.requestSingleInstanceLock();
  if (!hasSingleInstanceLock) {
    app.exit(2);
  } else {
    app.whenReady().then(async () => {
      try {
        if (!headlessServerInstanceId) throw new Error("--server-instance-id is required");
        initializeCredentialStoreFactory();
        if (headlessAction && !["authorize", "logout"].includes(headlessAction)) {
          throw new Error("--device-auth-action must be authorize or logout");
        }
        await runDeviceAuthHeadless(headlessServerInstanceId, {
          action: headlessAction || "authorize",
          openExternal: !process.argv.includes("--no-open-external"),
        });
        app.quit();
      } catch (error) {
        process.stderr.write(`device auth headless failed: ${error.message}\n`);
        app.exit(1);
      }
    });
  }
} else {
  ipcMain.handle("yuance:notify", notifyFromRenderer);
  const hasSingleInstanceLock = app.requestSingleInstanceLock();
  if (!hasSingleInstanceLock) {
    app.quit();
  } else {
    app.on("second-instance", () => revealWindow("/"));
    app.whenReady().then(async () => {
      try {
        if (rendererTarget.kind === "app-protocol") {
          const rendererRoot = path.join(moduleDir, "..", "renderer-dist");
          const rendererSession = session.fromPartition(rendererTarget.partition);
          await registerAppProtocol({
            protocol: rendererSession.protocol,
            fs,
            rendererRoot,
            manifestPath: path.join(rendererRoot, "resource-manifest.json"),
          });
          if (appProtocolSmoke) {
            rendererSession.webRequest.onBeforeRequest((details, callback) => {
              if (!details.url.startsWith("app:") && !details.url.startsWith("about:")) {
                appProtocolSmokeRequests.push(details.url);
                callback({ cancel: true });
                return;
              }
              callback({ cancel: !details.url.startsWith("app:") && !details.url.startsWith("about:") });
            });
            rendererSession.webRequest.onHeadersReceived((details, callback) => {
              appProtocolSmokeResponses.push({
                webContentsId: details.webContentsId,
                url: details.url,
                statusCode: details.statusCode,
                csp: details.responseHeaders?.["Content-Security-Policy"]?.[0]
                  || details.responseHeaders?.["content-security-policy"]?.[0]
                  || "",
              });
              callback({ responseHeaders: details.responseHeaders });
            });
          }
        }
        initializeCredentialStoreFactory();
        hostStatePublisher.update({ status: "unauthenticated" });
        applyRuntimeBrandIcon();
        mainWindow = createMainWindow();
      } catch (error) {
        console.error("Failed to initialize Yuance renderer:", error);
        if (appProtocolSmoke) app.exit(1);
        else {
          dialog.showErrorBox("元策无法启动", "应用资源校验失败，请重新安装后再试。");
          app.quit();
        }
        return;
      }
      app.on("activate", () => {
        if (!mainWindow) {
          mainWindow = createMainWindow();
        }
      });
    });
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
