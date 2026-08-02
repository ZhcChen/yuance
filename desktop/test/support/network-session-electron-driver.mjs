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
import { parseTransferContract } from "../../src/files/transfer-contract.mjs";
import { createOperationRegistry } from "../../src/network/operation-registry.mjs";
import { createRestTransport } from "../../src/network/rest-transport.mjs";
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
    status: error?.status,
  })}\n`);
  app.exit(0);
}

function option(name) {
  const prefix = `${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
