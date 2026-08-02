import { app, BrowserWindow, session } from "electron";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { createUploadExecutor } from "../../src/files/upload-executor.mjs";
import { createDownloadExecutor } from "../../src/files/download-executor.mjs";
import { createDownloadTargetManager } from "../../src/files/download-target.mjs";
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
