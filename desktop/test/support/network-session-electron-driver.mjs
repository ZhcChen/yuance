import { app, BrowserWindow, safeStorage, session } from "electron";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { createUploadExecutor } from "../../src/files/upload-executor.mjs";
import { createDownloadExecutor } from "../../src/files/download-executor.mjs";
import { createDownloadTargetManager } from "../../src/files/download-target.mjs";
import { createFileCapabilityVault } from "../../src/files/file-capability-vault.mjs";
import { createFileSpool } from "../../src/files/file-spool.mjs";
import { createFileDialog } from "../../src/files/file-dialog.mjs";
import { createTransferGrantVault } from "../../src/files/transfer-grant-vault.mjs";
import { createRevealDownloadVault } from "../../src/files/reveal-download-vault.mjs";
import { createRevealDownloadController } from "../../src/files/reveal-download-controller.mjs";
import { createBusinessAttachmentCoordinator } from "../../src/files/business-attachment-coordinator.mjs";
import { parseTransferContract } from "../../src/files/transfer-contract.mjs";
import { createOperationRegistry } from "../../src/network/operation-registry.mjs";
import { createAttachmentOperationRegistry } from "../../src/network/attachment-operation-registry.mjs";
import { createRestTransport } from "../../src/network/rest-transport.mjs";
import { createSseClient } from "../../src/network/sse-client.mjs";
import { createNetworkCoordinator } from "../../src/network/network-coordinator.mjs";
import { createNotificationController } from "../../src/notifications/notification-controller.mjs";
import { createCredentialRuntime } from "../../src/auth/credential-runtime.mjs";
import { loadWindowsFileGuard } from "../../src/files/windows-file-guard.mjs";
import { enrollDesktop } from "../../src/network/enrollment-client.mjs";
import {
  createTrustedNetworkSession,
  networkPartitionForMode,
} from "../../src/network/network-session.mjs";

const userDataPath = option("--user-data-path");
if (userDataPath) app.setPath("userData", userDataPath);

app.whenReady().then(run).catch(reportFailure);

async function run() {
  try {
    const mode = option("--mode") || "development";
    const origin = option("--origin");
    const chromiumSession = session.fromPartition(networkPartitionForMode(mode), { cache: false });
    const proxyRules = option("--proxy-rules");
    const pacScript = option("--pac-script");
    if (process.argv.includes("--seed-cookie")) {
      await chromiumSession.cookies.set({
        url: origin,
        name: "ambient",
        value: "secret",
      });
    }
    if (process.argv.includes("--seed-auth-cache")) {
      const authWindow = new BrowserWindow({
        show: false,
        webPreferences: { partition: networkPartitionForMode(mode) },
      });
      authWindow.webContents.on("login", (event, _details, _authInfo, callback) => {
        event.preventDefault();
        callback("yuance-test", "secret");
      });
      await authWindow.loadURL(`${origin}/auth-seed`);
    }
    if (proxyRules) {
      await chromiumSession.setProxy({ proxyRules, proxyBypassRules: "<-loopback>" });
    }
    if (pacScript) {
      await chromiumSession.setProxy({ pacScript, proxyBypassRules: "<-loopback>" });
    }
    if (proxyRules || pacScript) await chromiumSession.forceReloadProxyConfig();

    const observations = [];
    const network = await createTrustedNetworkSession({
      electronSession: session,
      mode,
      allowedOrigin: origin,
      testObserver: (value) => observations.push(value),
    });
    if (process.argv.includes("--file-api")) {
      await runRealFileApi({ origin, mode, network, observations });
      return;
    }
    if (process.argv.includes("--business-api")) {
      await runRealBusinessApi({ origin, mode, network });
      return;
    }
    if (process.argv.includes("--business-file-api")) {
      await runRealBusinessFileApi({ origin, mode, network });
      return;
    }
    if (process.argv.includes("--upload")) {
      const content = Buffer.from("yuance-electron-upload-canary");
      const sourcePath = path.join(userDataPath, "upload-source.bin");
      await fs.writeFile(sourcePath, content);
      const sha256 = createHash("sha256").update(content).digest("hex");
      let removed = false;
      const windowsGuard = loadWindowsFileGuard();
      const spoolRoot = path.join(userDataPath, "upload-spool");
      const nativeSnapshot = windowsGuard
        ? await windowsGuard.captureFile({ sourcePath, spoolRoot, nonce: "0123456789abcdef0123456789abcdef", maxBytes: 1024 })
        : { privatePath: path.join(userDataPath, "upload-snapshot.bin") };
      if (!windowsGuard) await fs.copyFile(sourcePath, nativeSnapshot.privatePath);
      const snapshot = Object.freeze({ privatePath: nativeSnapshot.privatePath, filename: "canary.bin", contentType: "application/octet-stream", byteSize: content.length, sha256, remove: async () => { removed = true; if (windowsGuard) await windowsGuard.removeSnapshot(spoolRoot, nativeSnapshot.privatePath); else await fs.unlink(nativeSnapshot.privatePath); } });
      const contract = Object.freeze({ version: 1, purpose: "upload", method: "PUT", url: `${origin}/upload`, origin, headers: Object.freeze([Object.freeze(["content-type", "application/octet-stream"])]), expectedBytes: content.length, contentType: "application/octet-stream", sha256, expiresAt: Date.now() + 60_000 });
      const executor = createUploadExecutor({
        fileVault: { consume: () => snapshot },
        grantVault: { consume: () => contract },
        fetchImpl: network.transferFetch,
        platform: process.platform,
        windowsGuard,
        spoolRoot,
      });
      const result = await executor.execute({ fileCapability: "file", transferGrant: "grant", binding: {} });
      process.stdout.write(`${JSON.stringify({ ok: true, result, removed, observations })}\n`);
      app.exit(0);
      return;
    }
    if (process.argv.includes("--download")) {
      const content = Buffer.from("yuance-electron-download-canary");
      const sha256 = createHash("sha256").update(content).digest("hex");
      const windowsGuard = loadWindowsFileGuard();
      const targets = [path.join(userDataPath, "new-download.bin"), path.join(userDataPath, "existing-download.bin")];
      await fs.writeFile(targets[1], "existing-content-must-be-replaced");
      let targetIndex = 0;
      const targetManager = createDownloadTargetManager({
        dialog: { showSaveDialog: async () => ({ canceled: false, filePath: targets[targetIndex++] }) },
        windowsGuard,
      });
      const contract = Object.freeze({ version: 1, purpose: "download", method: "GET", url: `${origin}/download`, origin, headers: Object.freeze([]), expectedBytes: content.length, contentType: "application/octet-stream", sha256, expiresAt: Date.now() + 60_000 });
      const executor = createDownloadExecutor({
        grantVault: { consume: () => contract },
        targetManager,
        fetchImpl: network.transferFetch,
      });
      const first = await executor.execute({ transferGrant: "first", binding: {}, suggestedFilename: "first.bin" });
      const second = await executor.execute({ transferGrant: "second", binding: {}, suggestedFilename: "second.bin" });
      const files = await Promise.all(targets.map((target) => fs.readFile(target)));
      const temporaryFiles = (await fs.readdir(userDataPath)).filter((name) => name.startsWith(".yuance-download-"));
      process.stdout.write(`${JSON.stringify({ ok: true, results: [first, second], hashes: files.map((value) => createHash("sha256").update(value).digest("hex")), temporaryFiles, observations })}\n`);
      app.exit(0);
      return;
    }
    const repeat = Number(option("--repeat") || 1);
    let enrolled;
    for (let index = 0; index < repeat; index += 1) {
      enrolled = await enrollDesktop({
        origin,
        mode,
        fetchImpl: network.fetch,
        timeoutMs: 5_000,
      });
    }
    const cookies = await chromiumSession.cookies.get({ url: origin });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      partition: network.partition,
      profile: {
        mode: enrolled.profile.mode,
        origin: enrolled.profile.origin,
        serverInstanceId: enrolled.profile.serverInstanceId,
      },
      observations,
      cookieCount: cookies.length,
    })}\n`);
  } catch (error) {
    reportFailure(error);
    return;
  }
  app.exit(0);
}

async function runRealBusinessFileApi({ origin, mode, network }) {
  const stage = (value) => process.stdout.write(`${JSON.stringify({ kind: "yuance-business-file-stage", stage: value })}\n`);
  const enrolled = await enrollDesktop({ origin, mode, fetchImpl: network.fetch });
  const runtime = createCredentialRuntime({
    profile: enrolled.profile,
    fetchImpl: network.fetch,
    safeStorage: process.platform === "darwin" ? createEphemeralStorage() : safeStorage,
    fs,
    userDataPath,
    platform: process.platform,
    installationId: async () => randomUUID(),
    deviceName: "Yuance Business File Integration",
    clientVersion: "0.1.0",
  });
  await runtime.initialize();
  await runtime.authorize({ openExternal: async () => {}, onUserCode: (userCode) => process.stdout.write(`${JSON.stringify({ kind: "yuance-business-file-user-code", userCode })}\n`) });
  stage("authorized");

  const rest = createRestTransport({ profile: enrolled.profile, credentialRuntime: runtime, fetchImpl: network.fetch });
  const attachmentRest = createRestTransport({ profile: enrolled.profile, credentialRuntime: runtime, fetchImpl: network.fetch, registry: createAttachmentOperationRegistry() });
  stage("work-items");
  const workItems = await rest.execute("workitem.list", { projectKey: "YCE", page: 1, perPage: 20 });
  const itemKey = workItems.items.find((item) => item.key === "YCE-TASK-2")?.key;
  if (!itemKey) throw new Error("seeded work item is unavailable");
  stage("comments");
  const comments = await rest.execute("workitem.comments", { itemKey });
  const commentId = comments.find((comment) => !comment.is_flow && !comment.is_draft)?.id;
  if (!commentId) throw new Error("seeded comment is unavailable");

  const windowsGuard = loadWindowsFileGuard();
  const spoolRoot = path.join(userDataPath, "business-file-spool");
  const spool = createFileSpool({ rootDirectory: spoolRoot, platform: process.platform, windowsGuard });
  const fileVault = createFileCapabilityVault();
  const grantVault = createTransferGrantVault();
  const revealVault = createRevealDownloadVault();
  const registry = createOperationRegistry();
  const bindingVersion = runtime.fileBindingVersion();
  const baseBinding = Object.freeze({ ...bindingVersion, webContentsId: 1, frameRoutingId: 1 });
  const binding = (purpose) => Object.freeze({ ...baseBinding, purpose });
  const itemContent = Buffer.from("yuance-business-item-attachment-v1");
  const commentContent = Buffer.from("yuance-business-comment-attachment-v1");
  const sourcePaths = [path.join(userDataPath, "item-source.txt"), path.join(userDataPath, "comment-source.txt")];
  await Promise.all([fs.writeFile(sourcePaths[0], itemContent), fs.writeFile(sourcePaths[1], commentContent)]);
  let sourceIndex = 0;
  const fileDialog = createFileDialog({ dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [sourcePaths[sourceIndex++]] }) }, spool, vault: fileVault });
  const itemFile = await fileDialog.choose({ binding: binding("upload") });
  const commentFile = await fileDialog.choose({ binding: binding("upload") });
  if (!itemFile || !commentFile) throw new Error("business file selection was cancelled");
  stage("selected");

  const downloadPaths = [path.join(userDataPath, "item-download.txt"), path.join(userDataPath, "comment-download.txt")];
  let downloadIndex = 0;
  const targetManager = createDownloadTargetManager({
    dialog: { showSaveDialog: async () => downloadIndex < downloadPaths.length ? { canceled: false, filePath: downloadPaths[downloadIndex++] } : { canceled: true } },
    platform: process.platform,
    windowsGuard,
  });
  const uploadExecutor = createUploadExecutor({ fileVault, grantVault, fetchImpl: network.transferFetch, registry, platform: process.platform, windowsGuard, spoolRoot });
  const downloadExecutor = createDownloadExecutor({ grantVault, targetManager, fetchImpl: network.transferFetch, registry });
  const coordinator = createBusinessAttachmentCoordinator({
    restTransport: attachmentRest,
    fileVault,
    grantVault,
    revealVault,
    uploadExecutor,
    downloadExecutor,
    apiOrigin: enrolled.profile.origin,
    allowLoopbackHttp: true,
    allowedRelativePaths: { upload: "/api/v1/test-storage/upload", download: "/api/v1/test-storage/download" },
  });
  const stages = [];
  const recordStage = (target) => (value) => {
    stages.push(`${target}:${value}`);
    stage(`${target}-${value}`);
  };
  stage("item-upload");
  const itemUpload = await coordinator.uploadWorkItemAttachment({ itemKey, fileCapability: itemFile.capability, binding: baseBinding, signal: undefined, onStage: recordStage("item") });
  stage("comment-upload");
  const commentUpload = await coordinator.uploadWorkItemCommentAttachment({ itemKey, commentId, fileCapability: commentFile.capability, binding: baseBinding, signal: undefined, onStage: recordStage("comment") });
  stage("uploaded");
  stage("lists");
  const [itemList, commentList] = await Promise.all([
    rest.execute("workitem.attachments", { itemKey }),
    rest.execute("workitem.commentattachments", { itemKey, commentId }),
  ]);
  stage("downloads");
  const itemDownload = await coordinator.downloadWorkItemAttachment({ itemKey, attachmentId: itemUpload.uploaded.id, binding: baseBinding, signal: undefined, window: undefined });
  const commentDownload = await coordinator.downloadWorkItemCommentAttachment({ itemKey, commentId, attachmentId: commentUpload.uploaded.id, binding: baseBinding, signal: undefined, window: undefined });
  const cancelled = await coordinator.downloadWorkItemAttachment({ itemKey, attachmentId: itemUpload.uploaded.id, binding: baseBinding, signal: undefined, window: undefined });
  const revealed = [];
  const revealController = createRevealDownloadController({ vault: revealVault, shell: { showItemInFolder: () => revealed.push(true) } });
  await revealController.reveal(itemDownload.revealCapability, binding("reveal-download"));
  await revealController.reveal(commentDownload.revealCapability, binding("reveal-download"));
  const downloaded = await Promise.all(downloadPaths.map((value) => fs.readFile(value)));
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  await runtime.logout();
  runtime.dispose();
  process.stdout.write(`${JSON.stringify({
    kind: "yuance-business-file-result",
    itemUploaded: itemUpload.uploaded.status === "uploaded",
    commentUploaded: commentUpload.uploaded.status === "uploaded",
    itemListed: itemList.some((value) => value.id === itemUpload.uploaded.id),
    commentListed: commentList.some((value) => value.id === commentUpload.uploaded.id),
    hashesMatch: hash(downloaded[0]) === hash(itemContent) && hash(downloaded[1]) === hash(commentContent),
    revealCount: revealed.length,
    cancelled: cancelled.status === "cancelled" && !cancelled.revealCapability,
    stages,
    activeOperations: registry.snapshot().active,
  })}\n`);
  app.exit(0);
}

async function runRealFileApi({ origin, mode, network, observations }) {
  const stage = (value) => process.stdout.write(`${JSON.stringify({ kind: "yuance-file-stage", stage: value })}\n`);
  const enrolled = await enrollDesktop({ origin, mode, fetchImpl: network.fetch });
  stage("enrolled");
  const runtime = createCredentialRuntime({
    profile: enrolled.profile,
    fetchImpl: network.fetch,
    safeStorage: process.platform === "darwin" ? createEphemeralStorage() : safeStorage,
    fs,
    userDataPath,
    platform: process.platform,
    installationId: async () => randomUUID(),
    deviceName: "Yuance File Integration",
    clientVersion: "0.1.0",
  });
  await runtime.initialize();
  await runtime.authorize({
    openExternal: async () => {},
    onUserCode: (userCode) => process.stdout.write(`${JSON.stringify({ kind: "yuance-file-user-code", userCode })}\n`),
  });
  stage("authorized");
  const rest = createRestTransport({ profile: enrolled.profile, credentialRuntime: runtime, fetchImpl: network.fetch });
  const windowsGuard = loadWindowsFileGuard();
  const spoolRoot = path.join(userDataPath, "file-spool");
  const spool = createFileSpool({ rootDirectory: spoolRoot, platform: process.platform, windowsGuard });
  const fileVault = createFileCapabilityVault();
  const grantVault = createTransferGrantVault();
  const registry = createOperationRegistry();
  const content = Buffer.from("yuance-desktop-file-canary-v1-data");
  const sourcePath = path.join(userDataPath, "canary-source.txt");
  const downloadPath = path.join(userDataPath, "canary-download.txt");
  await fs.writeFile(sourcePath, content);
  const bindingVersion = runtime.fileBindingVersion();
  const binding = (purpose) => Object.freeze({ ...bindingVersion, webContentsId: 1, frameRoutingId: 1, purpose });
  const fileDialog = createFileDialog({ dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [sourcePath] }) }, spool, vault: fileVault });
  const selected = await fileDialog.choose({ binding: binding("upload") });
  stage("selected");
  const uploadContract = parseTransferContract(await rest.execute("file.canaryupload", {}), { apiOrigin: enrolled.profile.origin, expectedPurpose: "upload", allowLoopbackHttp: true });
  stage("upload-granted");
  const uploadGrant = grantVault.issue(uploadContract, binding("upload")).grant;
  const upload = createUploadExecutor({ fileVault, grantVault, fetchImpl: network.transferFetch, registry, platform: process.platform, windowsGuard, spoolRoot });
  const uploaded = await upload.execute({ fileCapability: selected.capability, transferGrant: uploadGrant, binding: binding("upload") });
  stage("uploaded");
  const downloadContract = parseTransferContract(await rest.execute("file.canarydownload", {}), { apiOrigin: enrolled.profile.origin, expectedPurpose: "download", allowLoopbackHttp: true });
  stage("download-granted");
  const downloadGrant = grantVault.issue(downloadContract, binding("download")).grant;
  const targetManager = createDownloadTargetManager({ dialog: { showSaveDialog: async () => ({ canceled: false, filePath: downloadPath }) }, platform: process.platform, windowsGuard });
  const download = createDownloadExecutor({ grantVault, targetManager, fetchImpl: network.transferFetch, registry });
  const downloaded = await download.execute({ suggestedFilename: "canary.txt", transferGrant: downloadGrant, binding: binding("download") });
  const downloadedBytes = await fs.readFile(downloadPath);
  const sourceHash = createHash("sha256").update(content).digest("hex");
  const downloadHash = createHash("sha256").update(downloadedBytes).digest("hex");
  await runtime.logout();
  runtime.dispose();
  const temporaryFiles = (await fs.readdir(userDataPath)).filter((name) => name.startsWith(".yuance-download-"));
  process.stdout.write(`${JSON.stringify({ kind: "yuance-file-api-result", upload: uploaded.status === "completed", download: downloaded.status === "completed", byteSize: content.length, hashMatch: sourceHash === downloadHash, temporaryFiles: temporaryFiles.length, activeOperations: registry.snapshot().active, observations: observations.filter((value) => value.phase === "transfer") })}\n`);
  app.exit(0);
}

async function runRealBusinessApi({ origin, mode, network }) {
  const stage = (value) => process.stdout.write(`${JSON.stringify({ kind: "yuance-business-stage", stage: value })}\n`);
  const enrolled = await enrollDesktop({ origin, mode, fetchImpl: network.fetch });
  stage("enrolled");
  const runtime = createCredentialRuntime({
    profile: enrolled.profile,
    fetchImpl: network.fetch,
    safeStorage: process.platform === "darwin" ? createEphemeralStorage() : safeStorage,
    fs,
    userDataPath,
    platform: process.platform,
    installationId: async () => randomUUID(),
    deviceName: "Yuance Business Integration",
    clientVersion: "0.1.0",
  });
  await runtime.initialize();
  await runtime.authorize({
    openExternal: async () => {},
    onUserCode: (userCode) => process.stdout.write(`${JSON.stringify({ kind: "yuance-business-user-code", userCode })}\n`),
  });
  stage("authorized");
  const operationCounts = new Map();
  const registry = createOperationRegistry();
  const countingRegistry = Object.freeze({
    resolve(name, input) {
      operationCounts.set(name, (operationCounts.get(name) || 0) + 1);
      return registry.resolve(name, input);
    },
  });
  const rest = createRestTransport({ profile: enrolled.profile, credentialRuntime: runtime, fetchImpl: network.fetch, registry: countingRegistry });
  const businessFacts = [];
  const nativeNotifications = [];
  let controllerQueryCompleted = false;
  const notificationController = createNotificationController({
    execute: async (operation, input) => {
      try { return await rest.execute(operation, input); }
      finally { if (operation === "notification.list") controllerQueryCompleted = true; }
    },
    publishFact: (fact) => businessFacts.push(fact),
    isWindowFocused: () => true,
    isWindowMinimized: () => false,
    isNativeNotificationSupported: () => true,
    showNativeNotification: (value) => nativeNotifications.push(value),
    focusWindow: () => {},
    resolveTargetPath: () => "/web/app/messages",
  });
  const networkCoordinator = createNetworkCoordinator({
    credentialRuntime: runtime,
    sseClient: createSseClient({ profile: enrolled.profile, fetchImpl: network.fetch }),
    probe: () => rest.execute("session.probe", {}),
    onFact: (fact) => notificationController.handleFact(fact),
  });
  networkCoordinator.start();
  await waitUntil(() => controllerQueryCompleted
    && businessFacts.some((fact) => fact.type === "topbar")
    && businessFacts.some((fact) => fact.type === "release-version"));
  stage("identity");
  const user = await rest.execute("identity.current", {});
  stage("profile");
  const profile = await rest.execute("identity.profile", {});
  stage("topbar");
  const topbar = await rest.execute("shell.topbar", {});
  stage("projects");
  const projects = await rest.execute("project.list", { page: 1, perPage: 20 });
  stage("current-project");
  const currentProject = await rest.execute("project.current", {});
  stage("search");
  const search = await rest.execute("search.list", { q: "YCE-TASK-2", page: 1, perPage: 20 });
  stage("notifications");
  const notifications = await rest.execute("notification.list", { filter: "all", page: 1, perPage: 20 });
  stage("work-items");
  const workItems = await rest.execute("workitem.list", { projectKey: "YCE", page: 1, perPage: 20 });
  const itemKey = workItems.items.find((item) => item.key === "YCE-TASK-2")?.key;
  if (!itemKey) throw new Error("seeded work item is unavailable");
  stage("detail");
  const detail = await rest.execute("workitem.detail", { itemKey });
  stage("comments");
  const comments = await rest.execute("workitem.comments", { itemKey });
  stage("attachments");
  const attachments = await rest.execute("workitem.attachments", { itemKey });
  stage("comment-attachments");
  const commentAttachments = comments.length > 0
    ? await rest.execute("workitem.commentattachments", { itemKey, commentId: comments[0].id })
    : [];
  stage("select-project");
  const selectedProject = await rest.execute("project.select", { projectKey: "YCE" });
  stage("update-profile");
  const updatedProfile = await rest.execute("identity.profileupdate", {
    displayName: "Desktop profile integration",
    email: "desktop@yuance.test",
    mobile: "13800000000",
  });
  stage("update-work-item");
  const updated = await rest.execute("workitem.update", {
    itemKey,
    payload: {
      title: "Desktop mutation integration",
      description: "Desktop mutation integration description",
      priority: "P1",
    },
  });
  const nextStatus = updated.status === "in_progress" ? "pending_confirmation" : "in_progress";
  stage("handoff-work-item");
  const handedOff = await rest.execute("workitem.handoff", {
    itemKey,
    payload: {
      status: nextStatus,
      assigneeUsername: "yuance_admin",
      body: "Desktop handoff integration",
    },
  });
  stage("create-comment");
  const createdComment = await rest.execute("workitem.commentcreate", {
    itemKey,
    payload: { body: "Desktop comment integration", bodyFormat: "plain" },
  });
  stage("update-comment");
  const updatedComment = await rest.execute("workitem.commentupdate", {
    itemKey,
    commentId: createdComment.id,
    payload: { body: "Desktop comment integration updated", bodyFormat: "plain" },
  });
  stage("verify-mutations");
  const verifiedDetail = await rest.execute("workitem.detail", { itemKey });
  const verifiedProfile = await rest.execute("identity.profile", {});
  const verifiedComments = await rest.execute("workitem.comments", { itemKey });
  const notificationsAfterMutation = await rest.execute("notification.list", { filter: "all", page: 1, perPage: 20 });
  let notificationRead = true;
  if (notificationsAfterMutation.items.length > 0) {
    const readResult = await rest.execute("notification.read", { notificationId: notificationsAfterMutation.items[0].id });
    notificationRead = readResult.read === true;
  }
  const readAllResult = await rest.execute("notification.readall", {});
  const mutationOperations = [
    "project.select",
    "identity.profileupdate",
    "workitem.update",
    "workitem.handoff",
    "workitem.commentcreate",
    "workitem.commentupdate",
    "notification.readall",
  ];
  if (notificationsAfterMutation.items.length > 0) mutationOperations.push("notification.read");
  networkCoordinator.stop();
  notificationController.invalidate();
  await runtime.logout();
  runtime.dispose();
  process.stdout.write(`${JSON.stringify({
    kind: "yuance-business-api-result",
    user: user.username === "yuance_admin",
    profile: profile.username === "yuance_admin",
    search: search.items.some((item) => item.key === "YCE-TASK-2"),
    topbar: Number.isSafeInteger(topbar.tasks_count),
    projects: projects.items.length,
    currentProject: currentProject?.key === "YCE",
    notifications: notifications.items.length,
    workItems: workItems.items.length,
    detail: detail.key === itemKey,
    comments: comments.length,
    attachments: attachments.length,
    commentAttachments: commentAttachments.length,
    projectSelected: selectedProject.key === "YCE",
    profileUpdated: updatedProfile.display_name === "Desktop profile integration"
      && verifiedProfile.display_name === updatedProfile.display_name,
    workItemUpdated: updated.key === itemKey && updated.priority === "P1",
    workItemHandedOff: handedOff.key === itemKey && handedOff.status === nextStatus,
    commentCreated: createdComment.id > 0 && createdComment.body_format === "plain",
    commentUpdated: updatedComment.id === createdComment.id,
    mutationsPersisted: verifiedDetail.status === nextStatus
      && verifiedDetail.priority === "P1"
      && verifiedComments.some((comment) => comment.id === createdComment.id && comment.body === updatedComment.body),
    notificationRead,
    notificationsReadAll: Number.isSafeInteger(readAllResult.affected),
    sseRefresh: businessFacts.some((fact) => fact.type === "topbar"),
    releaseVersion: businessFacts.some((fact) => fact.type === "release-version"),
    foregroundSuppressed: nativeNotifications.length === 0,
    mutationsExecutedOnce: mutationOperations.every((name) => operationCounts.get(name) === 1),
  })}\n`);
  app.exit(0);
}

async function waitUntil(predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("business SSE integration timed out");
}

function createEphemeralStorage() {
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

function reportFailure(error) {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    name: error?.name,
    code: error?.code,
    diagnosticCode: error?.diagnosticCode,
    status: error?.status,
  })}\n`);
  app.exit(0);
}

function option(name) {
  const prefix = `${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
