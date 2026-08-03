import {
  app,
  BrowserWindow,
  dialog,
  Notification,
  ipcMain,
  nativeImage,
  protocol,
  powerMonitor,
  safeStorage,
  session,
  shell,
} from "electron";
import fs from "node:fs/promises";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { notificationTargetPath } from "@yuance/frontend-app-core";

import {
  resolvePngBrandIconPath,
  shouldApplyRuntimeDockIcon,
} from "./branding.mjs";
import {
  isDevelopmentRuntime,
  resolveDesktopAppIdentity,
  resolveDesktopNetworkOrigin,
  resolveDeviceAuthEndpoint,
  resolveDevelopmentDataPaths,
} from "./config.mjs";
import { loadOrCreateInstallationId } from "./auth/installation-id.mjs";
import { createCredentialRuntime } from "./auth/credential-runtime.mjs";
import { runSafeStorageSmoke } from "./auth/safe-storage-smoke.mjs";
import { createHostStatePublisher } from "./ipc/host-state.mjs";
import { registerAuthCommandHandlers } from "./ipc/auth-commands.mjs";
import { createNetworkStatePublisher } from "./ipc/network-state.mjs";
import { registerFileCommandHandlers } from "./ipc/file-commands.mjs";
import { registerBusinessCommandHandlers } from "./ipc/business-commands.mjs";
import { createFileStateController } from "./ipc/file-state.mjs";
import {
  createIpcSenderPolicy,
  createRendererReadinessTracker,
} from "./ipc/sender-policy.mjs";
import { registerAppProtocol } from "./protocol/app-protocol-handler.mjs";
import { enrollDesktop } from "./network/enrollment-client.mjs";
import { createTrustedNetworkSession } from "./network/network-session.mjs";
import { createNetworkCoordinator } from "./network/network-coordinator.mjs";
import { bindNetworkPowerLifecycle } from "./network/power-lifecycle.mjs";
import { createRestTransport } from "./network/rest-transport.mjs";
import { createSseClient } from "./network/sse-client.mjs";
import { createOperationRegistry } from "./network/operation-registry.mjs";
import { createNotificationController } from "./notifications/notification-controller.mjs";
import { createFileCapabilityVault } from "./files/file-capability-vault.mjs";
import { createFileSpool } from "./files/file-spool.mjs";
import { createFileDialog } from "./files/file-dialog.mjs";
import { createTransferGrantVault } from "./files/transfer-grant-vault.mjs";
import { createRevealDownloadVault } from "./files/reveal-download-vault.mjs";
import { createRevealDownloadController } from "./files/reveal-download-controller.mjs";
import { parseTransferContract } from "./files/transfer-contract.mjs";
import { createUploadExecutor } from "./files/upload-executor.mjs";
import { createDownloadExecutor } from "./files/download-executor.mjs";
import { createBusinessAttachmentCoordinator } from "./files/business-attachment-coordinator.mjs";
import { createAttachmentOperationRegistry } from "./network/attachment-operation-registry.mjs";
import { createDownloadTargetManager } from "./files/download-target.mjs";
import { loadWindowsFileGuard } from "./files/windows-file-guard.mjs";
import {
  browserWindowWebPreferences,
  decideNavigation,
  isTrustedRendererUrl,
  normalizeSafeExternalUrl,
  resolveRendererTarget,
} from "./window/security-policy.mjs";

const UI_ATTACHMENT_TIMEOUT_MS = 60_000;
const UI_MUTATION_TIMEOUT_MS = 60_000;

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
const desktopNetworkSmokePhase = app.isPackaged
  ? process.argv.find((value) => value.startsWith("--desktop-network-smoke-phase="))?.split("=", 2)[1]
  : undefined;
const desktopNetworkSmokeOrigin = app.isPackaged
  ? process.argv.find((value) => value.startsWith("--desktop-network-smoke-origin="))?.split("=", 2)[1]
  : undefined;
const desktopFileSmokePhase = app.isPackaged
  ? process.argv.find((value) => value.startsWith("--desktop-file-smoke-phase="))?.split("=", 2)[1]
  : undefined;
const desktopFileSmokeOrigin = app.isPackaged
  ? process.argv.find((value) => value.startsWith("--desktop-file-smoke-origin="))?.split("=", 2)[1]
  : undefined;
const desktopBusinessFileSmokeOrigin = app.isPackaged
  ? process.argv.find((value) => value.startsWith("--desktop-business-file-smoke-origin="))?.split("=", 2)[1]
  : undefined;
const desktopFeatureParityUiSmokeOrigin = app.isPackaged
  ? process.argv.find((value) => value.startsWith("--desktop-feature-parity-ui-smoke-origin="))?.split("=", 2)[1]
  : undefined;
const desktopFeatureParityUiSmokeProfile = app.isPackaged
  ? process.argv.find((value) => value.startsWith("--desktop-feature-parity-ui-smoke-profile="))?.split("=", 2)[1]
  : undefined;
const APP_PROTOCOL_SMOKE_STABILITY_MS = 1_000;
const appProtocolSmokeRequests = [];
const appProtocolSmokeResponses = [];
const credentialStorage = process.platform === "darwin" ? createEphemeralCredentialStorage() : safeStorage;
let appProtocolSmokePermissionChecks = 0;
let appProtocolSmokeDataPath;
let appProtocolSmokeInitialRenderer;
let appProtocolSmokePhase = "initial";
let featureParityUiSmokeStarted = false;
const activeNotifications = new Set();
let mainWindow = null;
let credentialRuntime = null;
let networkCoordinator = null;
let notificationController = null;
let fileRuntime = null;
let businessTransport = null;
let credentialRuntimeGeneration = 0;
const hostStatePublisher = createHostStatePublisher();
const networkStatePublisher = createNetworkStatePublisher();
let disposeAuthCommands = () => {};
let disposeNetworkPowerLifecycle = () => {};
let disposeFileCommands = () => {};
let disposeFilePowerLifecycle = () => {};
let disposeBusinessCommands = () => {};
let quitCleanupStarted = false;
let quitCleanupComplete = false;
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

function revealWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function publishBusinessFact(fact) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("yuance:business-fact", fact);
}

function showNativeNotification({ title, body, onClick }) {
  const notification = new Notification({ title, body, silent: false });
  activeNotifications.add(notification);
  notification.once("click", onClick);
  notification.once("close", () => activeNotifications.delete(notification));
  notification.show();
}

function invalidateNotifications() {
  notificationController?.invalidate();
  for (const notification of activeNotifications) {
    try { notification.close(); } catch {}
  }
  activeNotifications.clear();
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
  window.webContents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
    if (isMainFrame) rendererReadiness.didCommit(url);
  });
  window.webContents.on("did-finish-load", () => {
    if (rendererReadiness.didCommit(window.webContents.getURL())) {
      hostStatePublisher.publishTo(window);
      networkStatePublisher.publishTo(window);
      if (appProtocolSmoke) {
        runAppProtocolSmoke(window).catch((error) => {
          process.stderr.write(`app protocol smoke failed: ${error.message}\n`, () => app.exit(1));
        });
      }
      if (desktopFeatureParityUiSmokeOrigin && !featureParityUiSmokeStarted) {
        featureParityUiSmokeStarted = true;
        runFeatureParityUiSmoke(window).catch((error) => {
          process.stderr.write(`desktop feature parity UI smoke failed: ${error.message}\n`, () => app.quit());
        });
      }
    }
  });
  window.webContents.on("did-fail-load", (_event, _code, _description, _url, isMainFrame) => {
    if (isMainFrame) rendererReadiness.didCancelOrFail();
  });
  window.webContents.on("render-process-gone", () => {
    rendererReadiness.reset();
    fileRuntime?.state.invalidateAll().catch(() => {});
  });
  window.on("closed", () => {
    rendererReadiness.reset();
    if (mainWindow === window) {
      mainWindow = null;
      invalidateNotifications();
      networkCoordinator?.stop();
      fileRuntime?.state.invalidateAll().catch(() => {});
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
    const invalidPayloadRejected = !bridge.notifications
      && Object.keys(bridge.events).length === 1
      && typeof bridge.events.subscribe === "function";
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

async function runFeatureParityUiSmoke(window) {
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll("button")].find((value) => value.textContent.trim() === "开始授权");
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`), 10_000, "authorization action");
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`(() => !document.querySelector(".host-status-shell") && Boolean(document.querySelector("main")))()`), 30_000, "shared app load");
  const business = await runFeatureParityBusinessUiSmoke(window);
  const resilience = await runFeatureParityResilienceSmoke(window);
  window.focus();
  window.webContents.focus();
  await window.webContents.executeJavaScript("document.body.focus()");
  for (let index = 0; index < 12; index += 1) {
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Tab" });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Tab" });
    await delay(50);
    const focused = await window.webContents.executeJavaScript(`(() => {
      const active = document.activeElement;
      return Boolean(active && ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(active.tagName));
    })()`);
    if (focused) break;
  }
  const resources = desktopUiSmokeResourceMetrics();
  const report = await window.webContents.executeJavaScript(`(() => {
    const bridge = window.yuanceDesktop;
    const active = document.activeElement;
    return {
      kind: "yuance-desktop-feature-parity-ui-smoke",
      sharedApp: !document.querySelector(".host-status-shell") && Boolean(document.querySelector("main")),
      restrictedBridge: Object.keys(bridge).sort().join(",") === "auth,business,events,files,hostState,network,schemaVersion" && bridge.schemaVersion === 7,
      semanticMain: document.querySelectorAll("main").length === 1,
      semanticNavigation: document.querySelectorAll("nav a[href]").length > 0,
      workItemDetail: ${business.workItemDetail},
      workItemEdited: ${business.workItemEdited},
      workItemHandedOff: ${business.workItemHandedOff},
      commentCreated: ${business.commentCreated},
      commentEdited: ${business.commentEdited},
      workItemAttachmentUploaded: ${business.workItemAttachmentUploaded},
      workItemAttachmentDownloaded: ${business.workItemAttachmentDownloaded},
      workItemAttachmentRevealed: ${business.workItemAttachmentRevealed},
      commentAttachmentUploaded: ${business.commentAttachmentUploaded},
      commentAttachmentDownloaded: ${business.commentAttachmentDownloaded},
      commentAttachmentRevealed: ${business.commentAttachmentRevealed},
      messageTargetOpened: ${business.messageTargetOpened},
      messageTargetFocused: ${business.messageTargetFocused},
      permissionDenied: ${business.permissionDenied},
      permissionInputPreserved: ${business.permissionInputPreserved},
      validationError: ${business.validationError},
      validationFocused: ${business.validationFocused},
      notFoundVisible: ${business.notFoundVisible},
      offlineStateVisible: ${business.offlineStateVisible},
      offlineRecoveryVisible: ${business.offlineRecoveryVisible},
      interruptionRecovered: ${business.interruptionRecovered},
      interruptionCycles: ${business.interruptionCycles},
      processCount: ${resources.processCount},
      workingSetKb: ${resources.workingSetKb},
      cpuPercent: ${resources.cpuPercent},
      hiddenWindow: ${resilience.hiddenWindow},
      lifecycleCycles: ${resilience.lifecycleCycles},
      networkRecovered: ${resilience.networkRecovered},
      postResumeRefresh: ${resilience.postResumeRefresh},
      liveRegions: document.querySelectorAll("[aria-live]").length,
      accessibilityViolations: (() => {
        const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
        const duplicateIds = ids.length - new Set(ids).size;
        const unnamedControls = [...document.querySelectorAll("button, a[href], input, select, textarea")].filter((element) => {
          if (element instanceof HTMLInputElement && element.type === "hidden") return false;
          const labelledBy = element.getAttribute("aria-labelledby");
          const hasLabelledBy = labelledBy?.split(/\s+/u).every((id) => Boolean(document.getElementById(id)));
          const hasLabel = Boolean(element.getAttribute("aria-label") || hasLabelledBy || element.closest("label") || element.id && document.querySelector('label[for="' + CSS.escape(element.id) + '"]') || element.textContent?.trim() || element.getAttribute("title"));
          return !hasLabel;
        }).length;
        return duplicateIds + unnamedControls + (document.querySelectorAll("main").length === 1 ? 0 : 1) + (document.querySelectorAll("h1").length === 1 ? 0 : 1);
      })(),
      keyboardFocus: Boolean(active && ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(active.tagName)),
      genericBridgeMethods: ["invoke", "request", "fetch", "openExternal", "readFile", "writeFile"].filter((name) => name in bridge).length,
    };
  })()`);
  await new Promise((resolve) => process.stdout.write(`${JSON.stringify(report)}\n`, resolve));
  app.quit();
}

async function runFeatureParityResilienceSmoke(window) {
  window.hide();
  await delay(500);
  const hiddenWindow = !window.isVisible();
  for (let index = 0; index < 3; index += 1) {
    networkCoordinator?.suspend();
    await waitForUiSmoke(() => networkStatePublisher.snapshot().status === "suspended", 5_000, "network suspend");
    networkCoordinator?.resume();
    await waitForUiSmoke(() => networkStatePublisher.snapshot().status === "online", 15_000, "network resume");
  }
  window.show();
  window.focus();
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find((value) => value.textContent.trim() === "刷新")?.click()`);
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].some((value) => value.textContent.trim() === "刷新" && !value.disabled)`), 30_000, "post-resume refresh");
  return Object.freeze({ hiddenWindow, lifecycleCycles: 3, networkRecovered: true, postResumeRefresh: true });
}

function desktopUiSmokeResourceMetrics() {
  const metrics = app.getAppMetrics();
  return Object.freeze({
    processCount: metrics.length,
    workingSetKb: Math.ceil(metrics.reduce((total, value) => total + (value.memory?.workingSetSize || 0), 0)),
    cpuPercent: Math.ceil(metrics.reduce((total, value) => total + (value.cpu?.percentCPUUsage || 0), 0)),
  });
}

async function runFeatureParityBusinessUiSmoke(window) {
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`(() => {
    const link = [...document.querySelectorAll('a[href]')].find((value) => value.textContent.trim() === "任务");
    if (!link) return false;
    link.click();
    return true;
  })()`), 10_000, "task navigation");
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`(() => {
    const row = [...document.querySelectorAll('.work-item-row')].find((value) => value.querySelector('strong')?.textContent.startsWith("YCE-TASK-2"));
    const link = row?.querySelector('a[href]');
    if (!link) return false;
    link.click();
    return true;
  })()`), 30_000, "work item link");
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`document.querySelector('#work-item-detail-title')?.textContent.startsWith("YCE-TASK-2")`), 30_000, "work item detail");

  await executeFeatureParityUiScript(window, `(() => {
    const panel = [...document.querySelectorAll('.work-item-detail-panel')].find((value) => value.querySelector('h3')?.textContent === "编辑工作项");
    const input = panel?.querySelector('input[name="title"]');
    const button = panel?.querySelector('button[type="submit"]');
    if (!input || !button) throw new Error("work item edit form is unavailable");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, "Desktop packaged UI edit");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    button.click();
  })()`, "work item edit submit");
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`document.querySelector('#work-item-detail-title')?.textContent.includes("Desktop packaged UI edit")`), UI_MUTATION_TIMEOUT_MS, "work item edit");

  const workItemStatusBeforeHandoff = await executeFeatureParityUiScript(window, `(() => {
    const meta = [...document.querySelectorAll('.work-item-detail-meta div')].find((value) => value.querySelector('dt')?.textContent === "状态");
    const panel = [...document.querySelectorAll('.work-item-detail-panel')].find((value) => value.querySelector('h3')?.textContent === "推进并指派");
    const select = panel?.querySelector('select[name="status"]');
    const textarea = panel?.querySelector('textarea[name="body"]');
    const button = panel?.querySelector('button[type="submit"]');
    if (!meta?.querySelector('dd') || !select || !textarea || !button) throw new Error("work item handoff form is unavailable");
    const currentStatus = meta.querySelector('dd').textContent;
    const nextStatus = select.value === "in_progress" ? "pending_confirmation" : "in_progress";
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, nextStatus);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(textarea, "Desktop packaged UI handoff");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    button.click();
    return currentStatus;
  })()`, "work item handoff submit");
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`(() => {
    const meta = [...document.querySelectorAll('.work-item-detail-meta div')].find((value) => value.querySelector('dt')?.textContent === "状态");
    const panel = [...document.querySelectorAll('.work-item-detail-panel')].find((value) => value.querySelector('h3')?.textContent === "推进并指派");
    const button = panel?.querySelector('button[type="submit"]');
    const currentStatus = meta?.querySelector('dd')?.textContent;
    return Boolean(currentStatus && currentStatus !== ${JSON.stringify(workItemStatusBeforeHandoff)} && button && !button.disabled);
  })()`), UI_MUTATION_TIMEOUT_MS, "work item handoff");

  await window.webContents.executeJavaScript(`(() => {
    const textarea = [...document.querySelectorAll('textarea')].find((value) => value.closest('label')?.textContent.includes("新增评论"));
    const button = [...document.querySelectorAll('button')].find((value) => value.textContent.trim() === "发布评论");
    if (!textarea || !button) throw new Error("comment create form is unavailable");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(textarea, "@yuance_admin Desktop packaged UI comment");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    button.click();
  })()`);
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`[...document.querySelectorAll('.work-item-comment-body')].some((value) => value.textContent === "@yuance_admin Desktop packaged UI comment")`), UI_MUTATION_TIMEOUT_MS, "comment create");

  await window.webContents.executeJavaScript(`(() => {
    const row = [...document.querySelectorAll('.work-item-comment-row')].find((value) => value.querySelector('.work-item-comment-body')?.textContent === "@yuance_admin Desktop packaged UI comment");
    const button = row?.querySelector('button[data-comment-edit]');
    if (!button) throw new Error("comment edit action is unavailable");
    button.click();
  })()`);
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`Boolean(document.querySelector('.work-item-comment-edit-form textarea'))`), 10_000, "comment edit form");
  await window.webContents.executeJavaScript(`(() => {
    const textarea = document.querySelector('.work-item-comment-edit-form textarea');
    const button = [...document.querySelectorAll('.work-item-comment-edit-form button')].find((value) => value.textContent.trim() === "保存评论");
    if (!textarea || !button) throw new Error("comment edit form is unavailable");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(textarea, "@yuance_admin Desktop packaged UI comment updated");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    button.click();
  })()`);
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`[...document.querySelectorAll('.work-item-comment-body')].some((value) => value.textContent === "@yuance_admin Desktop packaged UI comment updated")`), UI_MUTATION_TIMEOUT_MS, "comment edit");

  let workItemAttachmentUploaded = await runWorkItemAttachmentUploadAttempt(window);
  if (!workItemAttachmentUploaded) workItemAttachmentUploaded = await runWorkItemAttachmentUploadAttempt(window);
  if (!workItemAttachmentUploaded) throw new Error("UI smoke work item attachment retry failed");
  await window.webContents.executeJavaScript(`(() => {
    const row = [...document.querySelectorAll('.work-item-attachments-panel .work-item-attachment-row')].find((value) => value.querySelector('strong')?.textContent === "fixture-upload.txt");
    row?.querySelector('button[aria-label^="下载附件"]')?.click();
  })()`);
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`Boolean(document.querySelector('.work-item-attachments-panel .work-item-attachment-row button:not([aria-label])'))`), UI_ATTACHMENT_TIMEOUT_MS, "work item attachment download");
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('.work-item-attachments-panel .work-item-attachment-row button')].find((value) => value.textContent.trim() === "在文件夹中显示")?.click()`);
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`document.querySelector('.work-item-attachments-panel .work-item-attachment-status')?.textContent.includes("已在文件夹中定位")`), 10_000, "work item attachment reveal");

  await window.webContents.executeJavaScript(`(() => {
    const row = [...document.querySelectorAll('.work-item-comment-row')].find((value) => value.querySelector('.work-item-comment-body')?.textContent === "@yuance_admin Desktop packaged UI comment updated");
    [...(row?.querySelectorAll('button') || [])].find((value) => value.textContent.trim() === "选择评论附件")?.click();
  })()`);
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`(() => {
    const row = [...document.querySelectorAll('.work-item-comment-row')].find((value) => value.querySelector('.work-item-comment-body')?.textContent === "@yuance_admin Desktop packaged UI comment updated");
    return [...(row?.querySelectorAll('.work-item-attachment-row') || [])].some((value) => value.querySelector('strong')?.textContent === "fixture-upload.txt" && value.classList.contains("is-uploaded"));
  })()`), UI_ATTACHMENT_TIMEOUT_MS, "comment attachment upload");
  await window.webContents.executeJavaScript(`(() => {
    const row = [...document.querySelectorAll('.work-item-comment-row')].find((value) => value.querySelector('.work-item-comment-body')?.textContent === "@yuance_admin Desktop packaged UI comment updated");
    row?.querySelector('button[aria-label^="下载评论附件"]')?.click();
  })()`);
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`(() => {
    const row = [...document.querySelectorAll('.work-item-comment-row')].find((value) => value.querySelector('.work-item-comment-body')?.textContent === "@yuance_admin Desktop packaged UI comment updated");
    return [...(row?.querySelectorAll('button') || [])].some((value) => value.textContent.trim() === "在文件夹中显示");
  })()`), UI_ATTACHMENT_TIMEOUT_MS, "comment attachment download");
  await window.webContents.executeJavaScript(`(() => {
    const row = [...document.querySelectorAll('.work-item-comment-row')].find((value) => value.querySelector('.work-item-comment-body')?.textContent === "@yuance_admin Desktop packaged UI comment updated");
    [...(row?.querySelectorAll('button') || [])].find((value) => value.textContent.trim() === "在文件夹中显示")?.click();
  })()`);
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`(() => {
    const row = [...document.querySelectorAll('.work-item-comment-row')].find((value) => value.querySelector('.work-item-comment-body')?.textContent === "@yuance_admin Desktop packaged UI comment updated");
    return row?.querySelector('.work-item-attachment-status')?.textContent.includes("已在文件夹中定位");
  })()`), 10_000, "comment attachment reveal");

  for (let index = 0; index < 3; index += 1) {
    await writeFeatureParityUiEvent("yuance-desktop-feature-parity-ui-api-stop");
    await waitForUiSmoke(() => networkStatePublisher.snapshot().status === "offline", 30_000, `network interruption ${index + 1}`);
    if (index === 0) {
      await waitForUiSmoke(() => window.webContents.executeJavaScript(`(() => {
        const shell = document.querySelector('.host-status-shell');
        return Boolean(shell && !document.querySelector('.work-item-action-form') && [...shell.querySelectorAll('button')].some((value) => !value.disabled));
      })()`), 10_000, "offline state shell");
    }
    await writeFeatureParityUiEvent("yuance-desktop-feature-parity-ui-api-start");
    await waitForUiSmoke(() => networkStatePublisher.snapshot().status === "online", 30_000, `network interruption recovery ${index + 1}`);
  }
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`(() => {
    const logout = [...document.querySelectorAll('button')].find((value) => value.textContent.trim() === "退出登录");
    return !document.querySelector('.host-status-shell') && Boolean(document.querySelector('main') && logout && !logout.disabled);
  })()`), 30_000, "offline shared app recovery");

  await executeFeatureParityUiScript(window, `(() => {
    const button = [...document.querySelectorAll('button')].find((value) => value.textContent.trim() === "退出登录");
    if (!button) throw new Error("logout button is unavailable");
    button.click();
  })()`, "logout");
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].some((value) => value.textContent.trim() === "开始授权")`), 30_000, "member authorization shell");
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find((value) => value.textContent.trim() === "开始授权")?.click()`);
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`!document.querySelector('.host-status-shell') && [...document.querySelectorAll('nav[aria-label="应用导航"] a')].some((value) => value.textContent.includes("消息中心"))`), 30_000, "member shared app load");
  await executeFeatureParityUiScript(window, `(() => {
    const link = [...document.querySelectorAll('nav[aria-label="应用导航"] a')].find((value) => value.textContent.includes("消息中心"));
    if (!link) throw new Error("message navigation is unavailable");
    link.click();
  })()`, "message navigation");
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`Boolean(document.querySelector('.message-row button'))`), 30_000, "message list");
  await window.webContents.executeJavaScript(`document.querySelector('.message-row button')?.click()`);
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`!document.querySelector('.message-list') && document.querySelector('h1') === document.activeElement`), 30_000, "message target focus");
  await window.webContents.executeJavaScript(`(() => {
    const panel = [...document.querySelectorAll('.work-item-detail-panel')].find((value) => value.querySelector('h3')?.textContent === "编辑工作项");
    const input = panel?.querySelector('input[name="title"]');
    const button = panel?.querySelector('button[type="submit"]');
    if (!input || !button) throw new Error("permission test edit form is unavailable");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "Desktop permission denied edit");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    button.click();
  })()`);
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`(() => {
    const panel = [...document.querySelectorAll('.work-item-detail-panel')].find((value) => value.querySelector('h3')?.textContent === "编辑工作项");
    return Boolean(document.querySelector('.work-item-action-error[role="alert"]') && panel?.querySelector('input[name="title"]')?.value === "Desktop permission denied edit" && !panel?.querySelector('button[type="submit"]')?.disabled);
  })()`), 30_000, "permission denied edit");
  await window.webContents.executeJavaScript(`(() => {
    const textarea = [...document.querySelectorAll('textarea')].find((value) => value.closest('label')?.textContent.includes("新增评论"));
    const button = [...document.querySelectorAll('button')].find((value) => value.textContent.trim() === "发布评论");
    if (!textarea || !button) throw new Error("validation test comment form is unavailable");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(textarea, "   ");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    button.click();
  })()`);
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`(() => {
    const textarea = [...document.querySelectorAll('textarea')].find((value) => value.closest('label')?.textContent.includes("新增评论"));
    return Boolean(document.querySelector('.work-item-comments-panel [role="alert"]') && textarea?.value === "   " && document.activeElement === textarea);
  })()`), 10_000, "comment validation focus");
  await window.webContents.executeJavaScript(`history.pushState({}, "", "/work-items/YCE-TASK-999999"); dispatchEvent(new Event("popstate"))`);
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`(() => {
    const alert = document.querySelector('.shell-banner[role="alert"]');
    return Boolean(alert?.textContent.includes("加载失败") && document.querySelector('#work-item-detail-title')?.textContent === "YCE-TASK-999999");
  })()`), 30_000, "work item not found");
  await window.webContents.executeJavaScript(`history.pushState({}, "", "/work-items/YCE-TASK-2"); dispatchEvent(new Event("popstate"))`);
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`document.querySelector('#work-item-detail-title')?.textContent.startsWith("YCE-TASK-2") && !document.querySelector('.shell-banner[role="alert"]')`), 30_000, "work item recovery after not found");
  return Object.freeze({
    workItemDetail: true,
    workItemEdited: true,
    workItemHandedOff: true,
    commentCreated: true,
    commentEdited: true,
    workItemAttachmentUploaded: true,
    workItemAttachmentDownloaded: true,
    workItemAttachmentRevealed: true,
    commentAttachmentUploaded: true,
    commentAttachmentDownloaded: true,
    commentAttachmentRevealed: true,
    messageTargetOpened: true,
    messageTargetFocused: true,
    permissionDenied: true,
    permissionInputPreserved: true,
    validationError: true,
    validationFocused: true,
    notFoundVisible: true,
    offlineStateVisible: true,
    offlineRecoveryVisible: true,
    interruptionRecovered: true,
    interruptionCycles: 3,
  });
}

async function runWorkItemAttachmentUploadAttempt(window) {
  await waitForUiSmoke(() => window.webContents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('button')].find((value) => value.textContent.trim() === "选择工作项附件");
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`), 10_000, "work item attachment select action");
  await new Promise((resolve) => setTimeout(resolve, 250));
  try {
    await waitForUiSmoke(() => window.webContents.executeJavaScript(`(() => {
      const panel = document.querySelector('.work-item-attachments-panel');
      const uploaded = [...(panel?.querySelectorAll('.work-item-attachment-row') || [])].some((value) => value.querySelector('strong')?.textContent === "fixture-upload.txt" && value.classList.contains("is-uploaded"));
      return uploaded || Boolean(panel?.querySelector('.work-item-action-error'));
    })()`), UI_ATTACHMENT_TIMEOUT_MS, "work item attachment upload");
  } catch (error) {
    if (error.message === "UI smoke work item attachment upload timed out") return false;
    throw error;
  }
  return window.webContents.executeJavaScript(`[...document.querySelectorAll('.work-item-attachments-panel .work-item-attachment-row')].some((value) => value.querySelector('strong')?.textContent === "fixture-upload.txt" && value.classList.contains("is-uploaded"))`);
}

function writeFeatureParityUiEvent(kind) {
  return new Promise((resolve) => process.stdout.write(`${JSON.stringify({ kind })}\n`, resolve));
}

async function executeFeatureParityUiScript(window, source, label) {
  try { return await window.webContents.executeJavaScript(source); }
  catch { throw new Error(`UI smoke ${label} script failed`); }
}

async function waitForUiSmoke(operation, timeoutMs = 10_000, label = "condition") {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await operation()) return; } catch {}
    await delay(50);
  }
  throw new Error(`UI smoke ${label} timed out`);
}

function validatePackagedLoopbackOrigin(value) {
  const origin = new URL(value);
  if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || !origin.port || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") {
    throw new Error("desktop feature parity UI smoke origin must be an exact loopback HTTP origin");
  }
  return origin.origin;
}

async function installationId(userDataPath) {
  const filePath = path.join(userDataPath, "Device Credentials", "installation-id");
  return loadOrCreateInstallationId({ fs, filePath, platform: process.platform });
}

async function runDeviceAuthHeadless(serverInstanceId, { action = "authorize", openExternal = true } = {}) {
  const endpoint = resolveDeviceAuthEndpoint({ isDevRuntime });
  const network = await createTrustedNetworkSession({
    electronSession: session,
    mode: "development",
    allowedOrigin: endpoint,
  });
  const enrolled = await enrollDesktop({
    origin: endpoint,
    mode: "development",
    fetchImpl: network.fetch,
    expectedServerInstanceId: serverInstanceId,
  });
  const userDataPath = app.getPath("userData");
  const runtime = createCredentialRuntime({
    profile: enrolled.profile,
    fetchImpl: network.fetch,
    safeStorage: credentialStorage,
    fs,
    userDataPath,
    platform: process.platform,
    installationId: () => installationId(userDataPath),
    deviceName: `${appIdentity.displayName} (${process.platform})`,
    clientVersion: app.getVersion(),
  });
  const initialized = await normalizeMacEphemeralSession(runtime, await runtime.initialize());
  if (initialized.status === "authenticated") {
    if (action === "logout") {
      const loggedOut = await runtime.logout();
      process.stdout.write(`${JSON.stringify({ status: loggedOut.status, loggedOut: true })}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify({ status: initialized.status, recovered: true })}\n`);
    return;
  }
  if (action === "logout" && ["locked", "reauthorization_required"].includes(initialized.status)) {
    const loggedOut = await runtime.logout();
    process.stdout.write(`${JSON.stringify({ status: loggedOut.status, loggedOut: true, recovered: true })}\n`);
    return;
  }
  if (initialized.status === "locked" || initialized.status === "reauthorization_required") {
    throw new Error(`credential runtime is ${initialized.status}`);
  }
  const result = await runtime.authorize({
    onUserCode: (userCode) => process.stdout.write(`user_code=${userCode}\n`),
    openExternal: openExternal
      ? (verificationUrl) => shell.openExternal(verificationUrl)
      : async () => {},
  });
  process.stdout.write(`${JSON.stringify({ status: result.status })}\n`);
}

async function runDesktopNetworkSmoke() {
  if (!["authorize", "verify"].includes(desktopNetworkSmokePhase) || !desktopNetworkSmokeOrigin) {
    throw new Error("packaged network smoke arguments are invalid");
  }
  const origin = new URL(desktopNetworkSmokeOrigin);
  if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") {
    throw new Error("packaged network smoke origin must be an exact loopback HTTP origin");
  }
  writeDesktopNetworkSmokeStage("ready");
  const network = await createTrustedNetworkSession({ electronSession: session, mode: "development", allowedOrigin: origin.origin });
  writeDesktopNetworkSmokeStage("session-created");
  const enrolled = await enrollDesktop({ origin: origin.origin, mode: "development", fetchImpl: network.fetch });
  writeDesktopNetworkSmokeStage("enrolled");
  let activeController;
  const authStates = [];
  const runtime = createCredentialRuntime({
    profile: enrolled.profile, fetchImpl: network.fetch, safeStorage: credentialStorage, fs,
    userDataPath: app.getPath("userData"), platform: process.platform,
    installationId: () => installationId(app.getPath("userData")),
    deviceName: "Yuance Packaged Network Smoke", clientVersion: app.getVersion(),
    onNetworkInvalidated: () => activeController?.abort(),
    onPublicState: (state) => authStates.push(state.status),
  });
  const initialized = await normalizeMacEphemeralSession(runtime, await runtime.initialize());
  writeDesktopNetworkSmokeStage("credential-initialized");
  if (desktopNetworkSmokePhase === "authorize") {
    if (initialized.status !== "unauthenticated") throw new Error(`unexpected initial smoke state: ${initialized.status}`);
    await runtime.authorize({
      openExternal: async () => {},
      onUserCode: (userCode) => process.stdout.write(`${JSON.stringify({ kind: "yuance-desktop-network-user-code", userCode })}\n`),
    });
    process.stdout.write(`${JSON.stringify({ kind: "yuance-desktop-network-authorized", status: runtime.snapshot().status })}\n`);
    return;
  }
  let credentialRestart = "recovered";
  if (initialized.status !== "authenticated") {
    if (process.platform !== "darwin" || initialized.status !== "unauthenticated") throw new Error(`packaged credential recovery failed: ${initialized.status}`);
    credentialRestart = "reauthorized";
    await runtime.authorize({
      openExternal: async () => {},
      onUserCode: (userCode) => process.stdout.write(`${JSON.stringify({ kind: "yuance-desktop-network-user-code", userCode })}\n`),
    });
  }
  const rest = createRestTransport({ profile: enrolled.profile, credentialRuntime: runtime, fetchImpl: network.fetch });
  const sse = createSseClient({ profile: enrolled.profile, fetchImpl: network.fetch });
  const streamFacts = [];
  const messageFacts = [];
  const nativeNotifications = [];
  let messageQueryCompleted = false;
  const messages = createNotificationController({
    execute: async (operation, input) => {
      try { return await rest.execute(operation, input); }
      finally { if (operation === "notification.list") messageQueryCompleted = true; }
    },
    publishFact: (fact) => messageFacts.push(fact),
    isWindowFocused: () => true,
    isWindowMinimized: () => false,
    isNativeNotificationSupported: () => true,
    showNativeNotification: (value) => nativeNotifications.push(value),
    focusWindow: () => {},
    resolveTargetPath: () => notificationTargetPath(null, "app"),
  });
  await rest.execute("session.probe", {});
  const first = await openSmokeStream(runtime, sse, (controller) => { activeController = controller; }, (fact) => streamFacts.push(fact));
  const messageEvidence = process.platform === "darwin" ? "packaged-sse" : "integration-fallback";
  if (messageEvidence === "packaged-sse") {
    await waitForSmokeCondition(() => streamFacts.some((fact) => fact.type === "topbar")
      && streamFacts.some((fact) => fact.type === "release-version"));
    for (const fact of streamFacts) await messages.handleFact(fact);
    await waitForSmokeCondition(() => messageQueryCompleted
      && messageFacts.some((fact) => fact.type === "topbar")
      && messageFacts.some((fact) => fact.type === "release-version"));
  }
  await runtime.refreshAccess(first.epoch);
  await first.completion;
  await rest.execute("session.probe", {});
  const second = await openSmokeStream(runtime, sse, (controller) => { activeController = controller; });
  const revokeStartedAt = performance.now();
  await runtime.logout();
  await second.completion;
  const revokeResponseToEofMs = performance.now() - revokeStartedAt;
  if (revokeResponseToEofMs >= 5_000) throw new Error("packaged revoke-to-EOF deadline exceeded");
  messages.invalidate();
  process.stdout.write(`${JSON.stringify({
    kind: "yuance-desktop-network-smoke", credentialRestart, probe: true, firstStream: true,
    rotated: true, secondStream: true, loggedOut: true, revokeResponseToEofMs: Math.round(revokeResponseToEofMs),
    messageRefresh: messageEvidence === "packaged-sse" && messageFacts.some((fact) => fact.type === "topbar"),
    releaseVersion: messageEvidence === "packaged-sse" && messageFacts.some((fact) => fact.type === "release-version"),
    messageEvidence,
    foregroundSuppressed: nativeNotifications.length === 0,
    publicAuthStates: authStates,
  })}\n`);
}

async function runDesktopFileSmoke() {
  if (!["authorize", "verify"].includes(desktopFileSmokePhase) || !desktopFileSmokeOrigin) throw new Error("packaged file smoke arguments are invalid");
  const origin = new URL(desktopFileSmokeOrigin);
  if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") throw new Error("packaged file smoke origin must be an exact loopback HTTP origin");
  const userDataPath = app.getPath("userData");
  const network = await createTrustedNetworkSession({ electronSession: session, mode: "development", allowedOrigin: origin.origin });
  const enrolled = await enrollDesktop({ origin: origin.origin, mode: "development", fetchImpl: network.fetch });
  const fileSmokeStorage = process.platform === "darwin" ? createEphemeralCredentialStorage() : credentialStorage;
  const runtime = createCredentialRuntime({ profile: enrolled.profile, fetchImpl: network.fetch, safeStorage: fileSmokeStorage, fs, userDataPath, platform: process.platform, installationId: () => installationId(userDataPath), deviceName: "Yuance Packaged File Smoke", clientVersion: app.getVersion() });
  const initialized = await runtime.initialize();
  if (desktopFileSmokePhase === "authorize") {
    if (initialized.status !== "unauthenticated") throw new Error(`unexpected initial file smoke state: ${initialized.status}`);
    await runtime.authorize({ openExternal: async () => {}, onUserCode: (userCode) => process.stdout.write(`${JSON.stringify({ kind: "yuance-desktop-file-user-code", userCode })}\n`) });
    const spool = createFileSpool({ rootDirectory: path.join(userDataPath, "File Spool"), platform: process.platform, windowsGuard: loadWindowsFileGuard() });
    const sourcePath = path.join(userDataPath, "file-smoke-source.txt");
    await fs.writeFile(sourcePath, "yuance-desktop-file-canary-v1-data", { mode: 0o600 });
    const snapshot = await spool.capture(sourcePath, { filename: "canary.txt", contentType: "text/plain" });
    const stale = createFileCapabilityVault().issue(snapshot, { ...runtime.fileBindingVersion(), webContentsId: 1, frameRoutingId: 1, purpose: "upload" });
    await fs.writeFile(path.join(userDataPath, "file-smoke-stale.json"), JSON.stringify({ capability: stale.capability }), { mode: 0o600 });
    await runtime.logout();
    runtime.dispose();
    process.stdout.write(`${JSON.stringify({ kind: "yuance-desktop-file-authorized", prepared: true })}\n`);
    return;
  }
  if (initialized.status !== "authenticated") await runtime.authorize({ openExternal: async () => {}, onUserCode: (userCode) => process.stdout.write(`${JSON.stringify({ kind: "yuance-desktop-file-user-code", userCode })}\n`) });
  const windowsGuard = loadWindowsFileGuard();
  const spoolRoot = path.join(userDataPath, "File Spool");
  const spool = createFileSpool({ rootDirectory: spoolRoot, platform: process.platform, windowsGuard });
  await spool.cleanupOrphans();
  const stale = JSON.parse(await fs.readFile(path.join(userDataPath, "file-smoke-stale.json"), "utf8"));
  let staleCapabilityRejected = false;
  try { createFileCapabilityVault().consume(stale.capability, { ...runtime.fileBindingVersion(), webContentsId: 1, frameRoutingId: 1, purpose: "upload" }); }
  catch (error) { staleCapabilityRejected = error?.code === "file_capability_invalid"; }
  await fs.rm(path.join(userDataPath, "file-smoke-stale.json"), { force: true });
  const fileVault = createFileCapabilityVault();
  const grantVault = createTransferGrantVault();
  const registry = createOperationRegistry();
  const binding = (purpose) => Object.freeze({ ...runtime.fileBindingVersion(), webContentsId: 1, frameRoutingId: 1, purpose });
  const sourcePath = path.join(userDataPath, "file-smoke-source.txt");
  const downloadPath = path.join(userDataPath, "file-smoke-download.txt");
  const selected = await createFileDialog({ dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [sourcePath] }) }, spool, vault: fileVault }).choose({ binding: binding("upload") });
  const rest = createRestTransport({ profile: enrolled.profile, credentialRuntime: runtime, fetchImpl: network.fetch });
  const uploadContract = parseTransferContract(await rest.execute("file.canaryupload", {}), { apiOrigin: enrolled.profile.origin, expectedPurpose: "upload", allowLoopbackHttp: true });
  const uploadGrant = grantVault.issue(uploadContract, binding("upload")).grant;
  const uploaded = await createUploadExecutor({ fileVault, grantVault, fetchImpl: network.transferFetch, registry, platform: process.platform, windowsGuard, spoolRoot }).execute({ fileCapability: selected.capability, transferGrant: uploadGrant, binding: binding("upload") });
  const downloadContract = parseTransferContract(await rest.execute("file.canarydownload", {}), { apiOrigin: enrolled.profile.origin, expectedPurpose: "download", allowLoopbackHttp: true });
  const downloadGrant = grantVault.issue(downloadContract, binding("download")).grant;
  const downloaded = await createDownloadExecutor({ grantVault, targetManager: createDownloadTargetManager({ dialog: { showSaveDialog: async () => ({ canceled: false, filePath: downloadPath }) }, platform: process.platform, windowsGuard }), fetchImpl: network.transferFetch, registry }).execute({ suggestedFilename: "canary.txt", transferGrant: downloadGrant, binding: binding("download") });
  const sourceBytes = await fs.readFile(sourcePath);
  const downloadedBytes = await fs.readFile(downloadPath);
  await runtime.logout();
  runtime.dispose();
  await fileVault.invalidateAll();
  const spoolFiles = (await fs.readdir(spoolRoot).catch(() => [])).filter((name) => /^(?:snapshot-|\.capture-)/u.test(name));
  process.stdout.write(`${JSON.stringify({ kind: "yuance-desktop-file-smoke", upload: uploaded.status === "completed", download: downloaded.status === "completed", byteSize: sourceBytes.length, hashMatch: createHash("sha256").update(sourceBytes).digest("hex") === createHash("sha256").update(downloadedBytes).digest("hex"), staleCapabilityRejected, activeOperations: registry.snapshot().active, spoolFiles: spoolFiles.length })}\n`);
}

async function runDesktopBusinessFileSmoke() {
  if (!desktopBusinessFileSmokeOrigin) throw new Error("packaged business file smoke arguments are invalid");
  const origin = new URL(desktopBusinessFileSmokeOrigin);
  if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") throw new Error("packaged business file smoke origin must be an exact loopback HTTP origin");
  const userDataPath = app.getPath("userData");
  const network = await createTrustedNetworkSession({ electronSession: session, mode: "development", allowedOrigin: origin.origin });
  const enrolled = await enrollDesktop({ origin: origin.origin, mode: "development", fetchImpl: network.fetch });
  const runtime = createCredentialRuntime({ profile: enrolled.profile, fetchImpl: network.fetch, safeStorage: process.platform === "darwin" ? createEphemeralCredentialStorage() : credentialStorage, fs, userDataPath, platform: process.platform, installationId: () => installationId(userDataPath), deviceName: "Yuance Packaged Business File Smoke", clientVersion: app.getVersion() });
  await runtime.initialize();
  await runtime.authorize({ openExternal: async () => {}, onUserCode: (userCode) => process.stdout.write(`${JSON.stringify({ kind: "yuance-desktop-business-file-user-code", userCode })}\n`) });

  const rest = createRestTransport({ profile: enrolled.profile, credentialRuntime: runtime, fetchImpl: network.fetch });
  const attachmentRest = createRestTransport({ profile: enrolled.profile, credentialRuntime: runtime, fetchImpl: network.fetch, registry: createAttachmentOperationRegistry() });
  const workItems = await rest.execute("workitem.list", { projectKey: "YCE", page: 1, perPage: 20 });
  const itemKey = workItems.items.find((item) => item.key === "YCE-TASK-2")?.key;
  if (!itemKey) throw new Error("packaged business file work item is unavailable");
  const comments = await rest.execute("workitem.comments", { itemKey });
  const commentId = comments.find((comment) => !comment.is_flow && !comment.is_draft)?.id;
  if (!commentId) throw new Error("packaged business file comment is unavailable");

  const windowsGuard = loadWindowsFileGuard();
  const spoolRoot = path.join(userDataPath, "Business File Spool");
  const spool = createFileSpool({ rootDirectory: spoolRoot, platform: process.platform, windowsGuard });
  const fileVault = createFileCapabilityVault();
  const grantVault = createTransferGrantVault();
  const revealVault = createRevealDownloadVault();
  const registry = createOperationRegistry();
  const baseBinding = Object.freeze({ ...runtime.fileBindingVersion(), webContentsId: 1, frameRoutingId: 1 });
  const binding = (purpose) => Object.freeze({ ...baseBinding, purpose });
  const contents = [Buffer.from("yuance-packaged-business-item-v1"), Buffer.from("yuance-packaged-business-comment-v1")];
  const sources = [path.join(userDataPath, "business-item.txt"), path.join(userDataPath, "business-comment.txt")];
  await Promise.all(sources.map((source, index) => fs.writeFile(source, contents[index], { mode: 0o600 })));
  let sourceIndex = 0;
  const chooser = createFileDialog({ dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [sources[sourceIndex++]] }) }, spool, vault: fileVault });
  const selected = await Promise.all([chooser.choose({ binding: binding("upload") }), chooser.choose({ binding: binding("upload") })]);

  const downloads = [path.join(userDataPath, "business-item-download.txt"), path.join(userDataPath, "business-comment-download.txt")];
  let downloadIndex = 0;
  const targetManager = createDownloadTargetManager({ dialog: { showSaveDialog: async () => downloadIndex < downloads.length ? { canceled: false, filePath: downloads[downloadIndex++] } : { canceled: true } }, platform: process.platform, windowsGuard });
  const coordinator = createBusinessAttachmentCoordinator({
    restTransport: attachmentRest,
    fileVault,
    grantVault,
    revealVault,
    uploadExecutor: createUploadExecutor({ fileVault, grantVault, fetchImpl: network.transferFetch, registry, platform: process.platform, windowsGuard, spoolRoot }),
    downloadExecutor: createDownloadExecutor({ grantVault, targetManager, fetchImpl: network.transferFetch, registry }),
    apiOrigin: enrolled.profile.origin,
    allowLoopbackHttp: true,
    allowedRelativePaths: { upload: "/api/v1/test-storage/upload", download: "/api/v1/test-storage/download" },
  });
  const stages = [];
  const itemUpload = await coordinator.uploadWorkItemAttachment({ itemKey, fileCapability: selected[0].capability, binding: baseBinding, signal: undefined, onStage: (stage) => stages.push(`item:${stage}`) });
  const commentUpload = await coordinator.uploadWorkItemCommentAttachment({ itemKey, commentId, fileCapability: selected[1].capability, binding: baseBinding, signal: undefined, onStage: (stage) => stages.push(`comment:${stage}`) });
  const itemDownload = await coordinator.downloadWorkItemAttachment({ itemKey, attachmentId: itemUpload.uploaded.id, binding: baseBinding, signal: undefined, window: undefined });
  const commentDownload = await coordinator.downloadWorkItemCommentAttachment({ itemKey, commentId, attachmentId: commentUpload.uploaded.id, binding: baseBinding, signal: undefined, window: undefined });
  const cancelled = await coordinator.downloadWorkItemAttachment({ itemKey, attachmentId: itemUpload.uploaded.id, binding: baseBinding, signal: undefined, window: undefined });
  let revealCount = 0;
  const revealController = createRevealDownloadController({ vault: revealVault, shell: { showItemInFolder: (target) => { revealCount += 1; shell.showItemInFolder(target); } } });
  await revealController.reveal(itemDownload.revealCapability, binding("reveal-download"));
  await revealController.reveal(commentDownload.revealCapability, binding("reveal-download"));
  const downloaded = await Promise.all(downloads.map((target) => fs.readFile(target)));
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  await runtime.logout();
  runtime.dispose();
  await fileVault.invalidateAll();
  revealVault.invalidateAll();
  const spoolFiles = (await fs.readdir(spoolRoot).catch(() => [])).filter((name) => /^(?:snapshot-|\.capture-)/u.test(name));
  process.stdout.write(`${JSON.stringify({ kind: "yuance-desktop-business-file-smoke", itemUploaded: itemUpload.uploaded.status === "uploaded", commentUploaded: commentUpload.uploaded.status === "uploaded", downloadsMatch: hash(downloaded[0]) === hash(contents[0]) && hash(downloaded[1]) === hash(contents[1]), revealCount, cancelled: cancelled.status === "cancelled" && !cancelled.revealCapability, stageCount: stages.length, activeOperations: registry.snapshot().active, spoolFiles: spoolFiles.length })}\n`);
}

function createEphemeralCredentialStorage() {
  const key = randomBytes(32);
  return Object.freeze({
    isEncryptionAvailable: () => true,
    encryptString(value) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
    },
    decryptString(value) {
      const bytes = Buffer.from(value);
      const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
    },
  });
}

function createUnavailableMacCredentialStorage() {
  return Object.freeze({
    isEncryptionAvailable: () => false,
    encryptString: () => { throw new Error("macOS credential storage is unavailable"); },
    decryptString: () => { throw new Error("macOS credential storage is unavailable"); },
  });
}

async function normalizeMacEphemeralSession(runtime, initialized) {
  if (process.platform === "darwin" && ["locked", "reauthorization_required"].includes(initialized.status)) {
    return runtime.discardLocalSession();
  }
  return initialized;
}

function writeDesktopNetworkSmokeStage(stage) {
  process.stdout.write(`${JSON.stringify({ kind: "yuance-desktop-network-stage", stage })}\n`);
}

async function openSmokeStream(runtime, sse, setController, onFact = () => {}) {
  const controller = new AbortController();
  setController(controller);
  let connectedResolve;
  let connectedReject;
  const connected = new Promise((resolve, reject) => { connectedResolve = resolve; connectedReject = reject; });
  let epoch;
  const completion = runtime.withAccessLease(({ accessToken, epoch: leaseEpoch }) => {
    epoch = leaseEpoch;
    return sse.subscribe({ accessToken, signal: controller.signal, onControl: (event) => {
      if (event.type === "connected") connectedResolve();
      else if (["topbar", "release-version"].includes(event.type)) onFact(Object.freeze({ ...event, epoch: leaseEpoch }));
    } });
  }).catch((error) => {
    if (controller.signal.aborted) return;
    connectedReject(error);
    return;
  });
  await waitForSmokeConnected(connected);
  return Object.freeze({ epoch, completion });
}

async function waitForSmokeCondition(predicate) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(10);
  }
  throw new Error("packaged message smoke timed out");
}

async function waitForSmokeConnected(connected) {
  let timer;
  try {
    await Promise.race([connected, new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("packaged SSE connect timed out")), 15_000);
    })]);
  } finally { clearTimeout(timer); }
}

async function initializeDesktopCredentialRuntime() {
  const generation = ++credentialRuntimeGeneration;
  businessTransport = null;
  invalidateNotifications();
  notificationController = null;
  const mode = isDevRuntime || desktopFeatureParityUiSmokeOrigin ? "development" : "production";
  const origin = desktopFeatureParityUiSmokeOrigin
    ? validatePackagedLoopbackOrigin(desktopFeatureParityUiSmokeOrigin)
    : resolveDesktopNetworkOrigin({ isDevRuntime });
  const network = await createTrustedNetworkSession({
    electronSession: session,
    mode,
    allowedOrigin: origin,
  });
  const enrolled = await enrollDesktop({ origin, mode, fetchImpl: network.fetch });
  if (generation !== credentialRuntimeGeneration) return;
  const userDataPath = app.getPath("userData");
  let coordinator;
  const runtime = createCredentialRuntime({
    profile: enrolled.profile,
    fetchImpl: network.fetch,
    safeStorage: credentialStorage,
    fs,
    userDataPath,
    platform: process.platform,
    installationId: () => installationId(userDataPath),
    deviceName: `${appIdentity.displayName} (${process.platform})`,
    clientVersion: app.getVersion(),
    onNetworkInvalidated: () => {
      coordinator?.invalidate();
      invalidateNotifications();
      fileRuntime?.state.invalidateAll().catch(() => {});
    },
    onPublicState: (state) => {
      hostStatePublisher.update(state);
      hostStatePublisher.publishTo(mainWindow);
      if (state.status === "authenticated") coordinator?.start();
      else {
        invalidateNotifications();
        fileRuntime?.state.invalidateAll().catch(() => {});
      }
    },
  });
  const restTransport = createRestTransport({
    profile: enrolled.profile,
    credentialRuntime: runtime,
    fetchImpl: network.fetch,
  });
  const notifications = createNotificationController({
    execute: (operation, input) => restTransport.execute(operation, input),
    publishFact: publishBusinessFact,
    isWindowFocused: () => Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()),
    isWindowMinimized: () => Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized()),
    isNativeNotificationSupported: () => Notification.isSupported(),
    showNativeNotification,
    focusWindow: revealWindow,
    resolveTargetPath: (target) => notificationTargetPath(target, "app"),
  });
  coordinator = createNetworkCoordinator({
    credentialRuntime: runtime,
    sseClient: createSseClient({ profile: enrolled.profile, fetchImpl: network.fetch }),
    probe: () => restTransport.execute("session.probe", {}),
    onState: (state) => {
      networkStatePublisher.update(state);
      networkStatePublisher.publishTo(mainWindow);
    },
    onFact: (fact) => notifications.handleFact(fact),
    onReauthorizationRequired: () => runtime.discardLocalSession(),
  });
  credentialRuntime = runtime;
  networkCoordinator = coordinator;
  let initialized;
  try { initialized = await normalizeMacEphemeralSession(runtime, await runtime.initialize()); }
  catch (error) {
    coordinator.stop();
    runtime.dispose();
    if (credentialRuntime === runtime) credentialRuntime = null;
    if (networkCoordinator === coordinator) networkCoordinator = null;
    throw error;
  }
  if (generation !== credentialRuntimeGeneration) {
    notifications.invalidate();
    coordinator.stop();
    runtime.dispose();
    if (credentialRuntime === runtime) credentialRuntime = null;
    if (networkCoordinator === coordinator) networkCoordinator = null;
  } else if (initialized.status === "authenticated") {
    coordinator.start();
  }
  if (generation === credentialRuntimeGeneration) notificationController = notifications;
  if (generation === credentialRuntimeGeneration) businessTransport = restTransport;
  if (generation === credentialRuntimeGeneration) await initializeFileRuntime({ generation, runtime, network, profile: enrolled.profile, restTransport });
}

async function initializeFileRuntime({ generation, runtime, network, profile, restTransport }) {
  await disposeCurrentFileRuntime();
  if (generation !== credentialRuntimeGeneration) return;
  const windowsGuard = loadWindowsFileGuard();
  const spoolRoot = path.join(app.getPath("userData"), "File Spool");
  const spool = createFileSpool({ rootDirectory: spoolRoot, platform: process.platform, windowsGuard });
  await spool.cleanupOrphans();
  if (generation !== credentialRuntimeGeneration) return;
  const fileVault = createFileCapabilityVault();
  const grantVault = createTransferGrantVault();
  const revealVault = createRevealDownloadVault();
  let smokeDownloadIndex = 0;
  const runtimeDialog = desktopFeatureParityUiSmokeProfile
    ? {
        showOpenDialog: async () => ({ canceled: false, filePaths: [path.join(desktopFeatureParityUiSmokeProfile, "fixture-upload.txt")] }),
        showSaveDialog: async () => ({ canceled: false, filePath: path.join(desktopFeatureParityUiSmokeProfile, "Downloads", `attachment-${++smokeDownloadIndex}.bin`) }),
      }
    : dialog;
  const runtimeShell = desktopFeatureParityUiSmokeProfile ? { showItemInFolder: () => {} } : shell;
  const revealController = createRevealDownloadController({ vault: revealVault, shell: runtimeShell });
  const registry = createOperationRegistry();
  const state = createFileStateController({ fileVault, grantVault, revealVault, registry });
  const fileDialog = createFileDialog({ dialog: runtimeDialog, spool, vault: fileVault });
  const uploadExecutor = createUploadExecutor({ fileVault, grantVault, fetchImpl: network.transferFetch, registry, platform: process.platform, windowsGuard, spoolRoot });
  const downloadExecutor = createDownloadExecutor({ grantVault, targetManager: createDownloadTargetManager({ dialog: runtimeDialog, platform: process.platform, windowsGuard }), fetchImpl: network.transferFetch, registry });
  const attachmentRestTransport = createRestTransport({ profile, credentialRuntime: runtime, fetchImpl: network.fetch, registry: createAttachmentOperationRegistry() });
  const attachmentCoordinator = createBusinessAttachmentCoordinator({
    restTransport: attachmentRestTransport,
    fileVault,
    grantVault,
    uploadExecutor,
    downloadExecutor,
    revealVault,
    apiOrigin: profile.origin,
    allowLoopbackHttp: isDevRuntime || Boolean(desktopFeatureParityUiSmokeOrigin),
    allowedRelativePaths: isDevRuntime || desktopFeatureParityUiSmokeOrigin ? { upload: "/api/v1/test-storage/upload", download: "/api/v1/test-storage/download" } : {},
  });
  const getBinding = (event, purpose) => Object.freeze({
    ...runtime.fileBindingVersion(),
    webContentsId: event.sender.id,
    frameRoutingId: event.senderFrame.routingId,
    purpose,
  });
  const issueTransferGrant = async (purpose, binding) => {
    const raw = await restTransport.execute(`file.canary${purpose}`, {});
    const contract = parseTransferContract(raw, { apiOrigin: profile.origin, expectedPurpose: purpose, allowLoopbackHttp: isDevRuntime || Boolean(desktopFeatureParityUiSmokeOrigin) });
    return grantVault.issue(contract, binding).grant;
  };
  disposeFileCommands = registerFileCommandHandlers({ ipcMain, assertSender: assertTrustedIpcSender, getBinding, getWindow: () => mainWindow, fileDialog, issueTransferGrant, uploadExecutor, downloadExecutor, attachmentCoordinator, revealController });
  const onSuspend = () => { state.invalidateAll().catch(() => {}); };
  powerMonitor.on("suspend", onSuspend);
  disposeFilePowerLifecycle = () => powerMonitor.removeListener("suspend", onSuspend);
  fileRuntime = Object.freeze({ state });
}

async function disposeCurrentFileRuntime() {
  disposeFileCommands();
  disposeFileCommands = () => {};
  disposeFilePowerLifecycle();
  disposeFilePowerLifecycle = () => {};
  const current = fileRuntime;
  fileRuntime = null;
  await current?.state.invalidateAll();
}

app.setName(desktopNetworkSmokePhase ? `${appIdentity.displayName} Network Smoke` : desktopFileSmokePhase ? `${appIdentity.displayName} Network Smoke` : desktopFeatureParityUiSmokeOrigin ? `${appIdentity.displayName} Feature Parity Smoke` : appIdentity.displayName);
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
if (desktopFeatureParityUiSmokeOrigin || desktopFeatureParityUiSmokeProfile) {
  if (!desktopFeatureParityUiSmokeOrigin || !desktopFeatureParityUiSmokeProfile || !path.isAbsolute(desktopFeatureParityUiSmokeProfile)) throw new Error("desktop feature parity UI smoke arguments are invalid");
  validatePackagedLoopbackOrigin(desktopFeatureParityUiSmokeOrigin);
  app.setPath("userData", desktopFeatureParityUiSmokeProfile);
  app.setPath("sessionData", path.join(desktopFeatureParityUiSmokeProfile, "Session Data"));
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
      const result = await runSafeStorageSmoke({ safeStorage: process.platform === "darwin" ? createUnavailableMacCredentialStorage() : credentialStorage });
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
} else if (desktopNetworkSmokePhase) {
  const smokeProfile = process.argv.find((value) => value.startsWith("--desktop-network-smoke-profile="))?.split("=", 2)[1];
  if (!smokeProfile || !path.isAbsolute(smokeProfile)) throw new Error("packaged network smoke profile must be absolute");
  app.setPath("userData", smokeProfile);
  app.setPath("sessionData", path.join(smokeProfile, "Session Data"));
  app.whenReady().then(async () => {
    try { await runDesktopNetworkSmoke(); app.quit(); }
    catch (error) { process.stderr.write(`desktop network smoke failed: ${error.message}\n`); app.exit(1); }
  });
} else if (desktopFileSmokePhase) {
  const smokeProfile = process.argv.find((value) => value.startsWith("--desktop-file-smoke-profile="))?.split("=", 2)[1];
  if (!smokeProfile || !path.isAbsolute(smokeProfile)) throw new Error("packaged file smoke profile must be absolute");
  app.setPath("userData", smokeProfile);
  app.setPath("sessionData", path.join(smokeProfile, "Session Data"));
  app.whenReady().then(async () => {
    try { await runDesktopFileSmoke(); app.quit(); }
    catch (error) { process.stderr.write(`desktop file smoke failed: ${error.message}\n`); app.exit(1); }
  });
} else if (desktopBusinessFileSmokeOrigin) {
  const smokeProfile = process.argv.find((value) => value.startsWith("--desktop-business-file-smoke-profile="))?.split("=", 2)[1];
  if (!smokeProfile || !path.isAbsolute(smokeProfile)) throw new Error("packaged business file smoke profile must be absolute");
  app.setPath("userData", smokeProfile);
  app.setPath("sessionData", path.join(smokeProfile, "Session Data"));
  app.whenReady().then(async () => {
    try { await runDesktopBusinessFileSmoke(); app.quit(); }
    catch (error) { process.stderr.write(`desktop business file smoke failed: ${error.message}\n`); app.exit(1); }
  });
} else {
  disposeBusinessCommands = registerBusinessCommandHandlers({
    ipcMain,
    assertSender: assertTrustedIpcSender,
    execute: (operation, input) => {
      if (!businessTransport) throw Object.assign(new Error("Business transport is unavailable"), { code: "business_unavailable" });
      return businessTransport.execute(operation, input);
    },
  });
  disposeAuthCommands = registerAuthCommandHandlers({
    ipcMain,
    assertSender: assertTrustedIpcSender,
    getRuntime: () => credentialRuntime,
    getNetworkCoordinator: () => networkCoordinator,
    openExternal: desktopFeatureParityUiSmokeOrigin ? async () => {} : (verificationUrl) => shell.openExternal(verificationUrl),
    onUserCode: desktopFeatureParityUiSmokeOrigin
      ? (userCode) => process.stdout.write(`${JSON.stringify({ kind: "yuance-desktop-feature-parity-ui-user-code", userCode })}\n`)
      : undefined,
  });
  const hasSingleInstanceLock = app.requestSingleInstanceLock();
  if (!hasSingleInstanceLock) {
    app.quit();
  } else {
    app.on("second-instance", () => revealWindow());
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
        applyRuntimeBrandIcon();
        mainWindow = createMainWindow();
        disposeNetworkPowerLifecycle = bindNetworkPowerLifecycle({
          powerEvents: powerMonitor,
          getCoordinator: () => networkCoordinator,
          onSuspend: invalidateNotifications,
        });
        if (appProtocolSmoke) {
          hostStatePublisher.update({ status: "unauthenticated" });
        } else {
          initializeDesktopCredentialRuntime().catch(() => {
            hostStatePublisher.update({ status: "fatal" });
            hostStatePublisher.publishTo(mainWindow);
          });
        }
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
          networkCoordinator?.start();
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

app.on("before-quit", (event) => {
  if (quitCleanupComplete) return;
  event.preventDefault();
  if (quitCleanupStarted) return;
  quitCleanupStarted = true;
  credentialRuntimeGeneration += 1;
  businessTransport = null;
  invalidateNotifications();
  notificationController = null;
  disposeBusinessCommands();
  disposeBusinessCommands = () => {};
  disposeNetworkPowerLifecycle();
  disposeNetworkPowerLifecycle = () => {};
  networkCoordinator?.stop();
  networkCoordinator = null;
  disposeAuthCommands();
  credentialRuntime?.dispose();
  credentialRuntime = null;
  disposeCurrentFileRuntime()
    .catch(() => {})
    .finally(() => {
      quitCleanupComplete = true;
      app.quit();
    });
});
