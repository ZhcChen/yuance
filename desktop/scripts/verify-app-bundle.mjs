import asar from "@electron/asar";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateResourceManifest } from "../src/protocol/resource-manifest.mjs";

const REQUIRED_ARCHIVE_FILES = Object.freeze([
  "src/main.mjs",
  "src/preload.cjs",
  "src/protocol/app-protocol.mjs",
  "src/protocol/app-protocol-handler.mjs",
  "renderer-dist/resource-manifest.json",
]);
const REQUIRED_CSP_DIRECTIVES = Object.freeze([
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
]);

function archivePath(value) {
  return value.replace(/^[/\\]+/u, "").replaceAll("\\", "/");
}

function rawArchivePath(value) {
  return value.replace(/^[/\\]+/u, "");
}

function extract(archive, entries, relativePath) {
  return asar.extractFile(archive, entries.get(relativePath) ?? relativePath, false);
}

function assertArchivedRegularFile(archive, entries, relativePath) {
  const stats = asar.statFile(archive, entries.get(relativePath) ?? relativePath, false);
  if (!stats || typeof stats.size !== "number" || "files" in stats || "link" in stats || stats.unpacked) {
    throw new Error(`Required ASAR file is missing or unpacked: ${relativePath}`);
  }
}

function verifyCspSource(source) {
  const expectedDeclaration = [
    "export const APP_CONTENT_SECURITY_POLICY = [",
    ...REQUIRED_CSP_DIRECTIVES.map((directive) => `  ${JSON.stringify(directive)},`),
    '].join("; ");',
  ].join("\n");
  if (!source.replaceAll("\r\n", "\n").includes(expectedDeclaration)) {
    throw new Error("Bundled CSP declaration does not match the fixed baseline.");
  }
  if (!source.includes('"Content-Security-Policy": APP_CONTENT_SECURITY_POLICY,')) {
    throw new Error("Bundled protocol response does not bind the fixed CSP baseline.");
  }
  if (/unsafe-inline|unsafe-eval|bypassCSP|allowServiceWorkers/u.test(source)) {
    throw new Error("Bundled protocol source weakens the CSP baseline.");
  }
}

function verifyProtocolHandlerSource(source) {
  if (!source.includes("headers: resolution.headers,")) {
    throw new Error("Bundled protocol handler does not forward verified response headers.");
  }
}

async function verifyPackagedWindowsFileGuard(archive, entries) {
  if (process.platform !== "win32") return;
  const expectedNames = Object.freeze({
    x64: "index.win32-x64-msvc.node",
    arm64: "index.win32-arm64-msvc.node",
  });
  const expectedName = expectedNames[process.arch];
  if (!expectedName) throw new Error("Packaged native file guard architecture is unsupported.");
  const nativeEntries = [...entries.keys()].filter((entry) => entry.startsWith("src/native/") && entry.endsWith(".node"));
  const expectedEntry = `src/native/${expectedName}`;
  if (nativeEntries.length !== 1 || nativeEntries[0] !== expectedEntry) {
    throw new Error("Packaged native file guard does not match the current architecture.");
  }
  const stats = asar.statFile(archive, entries.get(expectedEntry) ?? expectedEntry, false);
  if (!stats || typeof stats.size !== "number" || !stats.unpacked || "link" in stats || "files" in stats) {
    throw new Error("Packaged native file guard is not an unpacked regular file.");
  }
  const bindingPath = path.join(`${archive}.unpacked`, "src", "native", expectedName);
  let root;
  try {
    const bindingStats = await fs.lstat(bindingPath);
    if (!bindingStats.isFile() || bindingStats.isSymbolicLink()) throw new Error("invalid binding");
    const native = createRequire(import.meta.url)(bindingPath);
    for (const operation of ["captureWindowsFile", "secureWindowsSpoolRoot", "cleanupWindowsSpool", "removeWindowsSnapshot", "verifyWindowsSnapshotHandle", "commitWindowsDownload"]) {
      if (typeof native?.[operation] !== "function") throw new Error("invalid exports");
    }
    root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-packaged-file-guard-"));
    const sourceRoot = path.join(root, "source");
    const spoolRoot = path.join(root, "spool");
    await fs.mkdir(sourceRoot);
    const sourcePath = path.join(sourceRoot, "canary.txt");
    const content = Buffer.from("yuance-packaged-file-guard-canary");
    await fs.writeFile(sourcePath, content);
    await native.secureWindowsSpoolRoot(spoolRoot);
    const captured = await native.captureWindowsFile({
      sourcePath,
      spoolRoot,
      nonce: crypto.randomBytes(16).toString("hex"),
      maxBytes: 1024,
    });
    if (captured?.byteSize !== content.length || captured?.sha256 !== crypto.createHash("sha256").update(content).digest("hex")) {
      throw new Error("invalid capture");
    }
    const snapshotHandle = await fs.open(captured.privatePath, "r");
    try { await native.verifyWindowsSnapshotHandle(spoolRoot, captured.privatePath, snapshotHandle.fd); }
    finally { await snapshotHandle.close(); }
    await native.removeWindowsSnapshot(spoolRoot, captured.privatePath);
    if (await native.cleanupWindowsSpool(spoolRoot) !== 0) throw new Error("invalid cleanup");
    const downloadPath = path.join(root, "download.bin");
    const temporaryPath = path.join(root, `.yuance-download-${crypto.randomBytes(16).toString("hex")}.tmp`);
    const parentHandle = await fs.open(root, "r");
    const temporaryHandle = await fs.open(temporaryPath, "wx", 0o600);
    try {
      await temporaryHandle.writeFile(content);
      await temporaryHandle.sync();
      await native.commitWindowsDownload({ directory: root, targetPath: downloadPath, temporaryPath, parentFd: parentHandle.fd, temporaryFd: temporaryHandle.fd, targetFd: -1 });
    } finally {
      await temporaryHandle.close();
      await parentHandle.close();
    }
    if (!content.equals(await fs.readFile(downloadPath))) throw new Error("invalid download commit");
  } catch {
    throw new Error("Packaged native file guard verification failed.");
  } finally {
    if (root) await fs.rm(root, { recursive: true, force: true }).catch(() => {});
  }
}

export async function findAppAsar(inputPath) {
  const stats = await fs.stat(inputPath);
  if (stats.isFile()) return inputPath;
  const pending = [inputPath];
  const matches = [];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile() && entry.name === "app.asar") matches.push(entryPath);
    }
  }
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one app.asar under ${inputPath}, found ${matches.length}.`);
  }
  return matches[0];
}

export async function verifyAppBundle(inputPath) {
  const archive = await findAppAsar(inputPath);
  const entries = new Map(
    asar.listPackage(archive).map((entry) => [archivePath(entry), rawArchivePath(entry)]),
  );
  const listed = new Set(entries.keys());
  for (const required of REQUIRED_ARCHIVE_FILES) {
    if (!listed.has(required)) throw new Error(`Required ASAR entry is missing: ${required}`);
    assertArchivedRegularFile(archive, entries, required);
  }

  const manifest = validateResourceManifest(
    JSON.parse(extract(archive, entries, "renderer-dist/resource-manifest.json").toString("utf8")),
  );
  const expectedRendererFiles = new Set(["renderer-dist/resource-manifest.json"]);
  for (const resource of Object.values(manifest.files)) {
    if (
      resource.relativePath.endsWith(".map") ||
      resource.relativePath.startsWith("test/") ||
      resource.relativePath.includes("/fixtures/")
    ) {
      throw new Error(`Forbidden renderer artifact is registered: ${resource.relativePath}`);
    }
    const relativePath = `renderer-dist/${resource.relativePath}`;
    expectedRendererFiles.add(relativePath);
    if (!listed.has(relativePath)) throw new Error(`Manifest resource is missing from ASAR: ${relativePath}`);
    assertArchivedRegularFile(archive, entries, relativePath);
    const contents = extract(archive, entries, relativePath);
    if (/(?:https?:\/\/(?:127\.0\.0\.1|localhost)|@vite\/client)/iu.test(contents.toString("utf8"))) {
      throw new Error(`Renderer resource contains a development runtime reference: ${relativePath}`);
    }
    const digest = crypto.createHash("sha256").update(contents).digest("hex");
    if (contents.byteLength !== resource.bytes || digest !== resource.sha256) {
      throw new Error(`Manifest resource integrity mismatch: ${relativePath}`);
    }
  }
  for (const entry of listed) {
    if (entry.startsWith("renderer-dist/") && !expectedRendererFiles.has(entry)) {
      const stats = asar.statFile(archive, entries.get(entry) ?? entry, false);
      if (typeof stats.size === "number" || "link" in stats) {
        throw new Error(`Unregistered renderer file is present in ASAR: ${entry}`);
      }
    }
  }
  verifyCspSource(extract(archive, entries, "src/protocol/app-protocol.mjs").toString("utf8"));
  verifyProtocolHandlerSource(
    extract(archive, entries, "src/protocol/app-protocol-handler.mjs").toString("utf8"),
  );
  await verifyPackagedWindowsFileGuard(archive, entries);
  return Object.freeze({ archive, resourceCount: manifest.files ? Object.keys(manifest.files).length : 0 });
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const inputPath = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist"));
  verifyAppBundle(inputPath)
    .then((result) => console.log(`Verified ${result.resourceCount} renderer resources in ${result.archive}.`))
    .catch((error) => {
      console.error(`Bundle verification failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
