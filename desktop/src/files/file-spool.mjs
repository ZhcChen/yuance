import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import fsPromises from "node:fs/promises";
import path from "node:path";

import { openRegularFile, sameFileIdentity } from "./file-identity.mjs";

const MARKER = ".yuance-file-spool-v1";
const MARKER_CONTENT = "yuance-file-spool-v1\n";
const OWNED_FILE = /^snapshot-[0-9a-f]{32}\.bin$/;
const STAGING_FILE = /^\.capture-[0-9a-f]{32}\.tmp$/;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

export function createFileSpool({
  rootDirectory,
  fs = fsPromises,
  platform = process.platform,
  randomBytes = nodeRandomBytes,
  windowsGuard,
  maxFileBytes = MAX_FILE_BYTES,
  maxTotalBytes = MAX_TOTAL_BYTES,
} = {}) {
  const pathApi = platform === "win32" ? path.win32 : path;
  if (!pathApi.isAbsolute(rootDirectory ?? "")) throw new TypeError("file spool rootDirectory must be absolute");
  if (platform === "win32" && !isWindowsGuard(windowsGuard)) throw spoolError("file_native_guard_required", "Native file guard is required");
  assertLimit(maxFileBytes, MAX_FILE_BYTES, "maxFileBytes");
  assertLimit(maxTotalBytes, MAX_TOTAL_BYTES, "maxTotalBytes");
  if (maxTotalBytes < maxFileBytes) throw new TypeError("maxTotalBytes must cover maxFileBytes");
  let totalBytes = 0;
  let initialized = false;
  let cleaned = false;
  let operationTail = Promise.resolve();

  async function initialize() {
    if (initialized) return;
    if (platform === "win32") {
      await windowsGuard.secureSpoolRoot(rootDirectory);
      initialized = true;
      return;
    }
    await fs.mkdir(path.dirname(rootDirectory), { recursive: true, mode: 0o700 });
    let created = false;
    let createdIdentity;
    let markerCreated = false;
    try {
      await fs.mkdir(rootDirectory, { mode: 0o700 });
      created = true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    const markerPath = path.join(rootDirectory, MARKER);
    try {
      const rootStats = await fs.lstat(rootDirectory);
      if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) throw spoolError("file_spool_unavailable", "File spool is unavailable");
      if (created) createdIdentity = fileIdentity(rootStats);
      if (platform !== "win32") await fs.chmod(rootDirectory, 0o700);
      if (created) {
        const marker = await fs.open(markerPath, "wx", 0o600);
        markerCreated = true;
        try {
          await marker.writeFile(MARKER_CONTENT, "utf8");
          await marker.sync();
        } finally {
          await marker.close();
        }
      } else {
        let markerStats;
        try {
          markerStats = await fs.lstat(markerPath);
        } catch (error) {
          if (error?.code === "ENOENT") throw spoolError("file_spool_unavailable", "File spool ownership is unproven");
          throw error;
        }
        if (markerStats.isSymbolicLink() || !markerStats.isFile()) throw spoolError("file_spool_unavailable", "File spool is unavailable");
        const markerContents = await fs.readFile(markerPath, "utf8");
        if (markerContents !== MARKER_CONTENT) throw spoolError("file_spool_unavailable", "File spool ownership is unproven");
        const verifiedMarkerStats = await fs.lstat(markerPath);
        if (verifiedMarkerStats.isSymbolicLink() || !verifiedMarkerStats.isFile()) throw spoolError("file_spool_unavailable", "File spool is unavailable");
      }
      if (platform !== "win32") await fs.chmod(markerPath, 0o600);
      initialized = true;
    } catch (error) {
      if (created && createdIdentity) await rollbackCreatedRoot({ fs, rootDirectory, markerPath, markerCreated, createdIdentity });
      throw error;
    }
  }

  function capture(filePath, metadata = {}) {
    return serialize(async () => {
      await initialize();
      if (!cleaned) await cleanupOwnedFiles();
      return captureExclusive(filePath, metadata);
    });
  }

  async function captureExclusive(filePath, { filename, contentType = "application/octet-stream" } = {}) {
    if (platform === "win32") return captureWindowsExclusive(filePath, { filename, contentType });
    const opened = await openRegularFile({ filePath, fs, platform });
    const expectedBytes = opened.identity.size;
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > maxFileBytes) {
      await opened.handle.close();
      throw spoolError("file_too_large", "File exceeds the local limit");
    }
    if (totalBytes + expectedBytes > maxTotalBytes) {
      await opened.handle.close();
      throw spoolError("file_spool_quota", "File spool quota exceeded");
    }
    totalBytes += expectedBytes;
    const nonce = secureNonce(randomBytes);
    const privatePath = path.join(rootDirectory, `snapshot-${nonce}.bin`);
    const stagingPath = path.join(rootDirectory, `.capture-${nonce}.tmp`);
    let destination;
    let committed = false;
    try {
      destination = await fs.open(stagingPath, "wx", 0o600);
      const hash = createHash("sha256");
      const buffer = Buffer.allocUnsafe(64 * 1024);
      let byteSize = 0;
      while (true) {
        const { bytesRead } = await opened.handle.read(buffer, 0, buffer.length, null);
        if (bytesRead === 0) break;
        byteSize += bytesRead;
        if (byteSize > expectedBytes || byteSize > maxFileBytes) throw spoolError("file_identity_changed", "File changed during capture");
        const chunk = buffer.subarray(0, bytesRead);
        hash.update(chunk);
        await writeAll(destination, chunk);
      }
      const finalIdentity = await opened.currentIdentity();
      if (byteSize !== expectedBytes || !sameFileIdentity(opened.identity, finalIdentity)) {
        throw spoolError("file_identity_changed", "File changed during capture");
      }
      if (platform !== "win32") await destination.chmod(0o600);
      const destinationStats = await destination.stat();
      if (destinationStats.size !== byteSize) throw spoolError("file_spool_write_failed", "File snapshot write was incomplete");
      await destination.sync();
      await destination.close();
      destination = undefined;
      await fs.rename(stagingPath, privatePath);
      committed = true;
      let removed = false;
      return Object.freeze({
        privatePath,
        filename: sanitizeFilename(filename),
        contentType: sanitizeContentType(contentType),
        byteSize,
        sha256: hash.digest("hex"),
        remove: async () => {
          if (removed) return;
          try {
            await fs.unlink(privatePath);
          } catch (error) {
            if (error?.code !== "ENOENT") throw error;
          }
          removed = true;
          totalBytes = Math.max(0, totalBytes - expectedBytes);
        },
      });
    } finally {
      await destination?.close().catch(() => {});
      await opened.handle.close().catch(() => {});
      if (!committed) {
        totalBytes = Math.max(0, totalBytes - expectedBytes);
        await fs.unlink(stagingPath).catch(() => {});
        await fs.unlink(privatePath).catch(() => {});
      }
    }
  }

  async function captureWindowsExclusive(filePath, { filename, contentType = "application/octet-stream" } = {}) {
    const nonce = secureNonce(randomBytes);
    const remainingBytes = Math.min(maxFileBytes, maxTotalBytes - totalBytes);
    if (remainingBytes <= 0) throw spoolError("file_spool_quota", "File spool quota exceeded");
    const captured = await windowsGuard.captureFile({
      sourcePath: filePath,
      spoolRoot: rootDirectory,
      nonce,
      maxBytes: remainingBytes,
    });
    if (!captured || typeof captured.privatePath !== "string" || !Number.isSafeInteger(captured.byteSize) || captured.byteSize < 0 || captured.byteSize > remainingBytes || !/^[0-9a-f]{64}$/.test(captured.sha256)) {
      if (typeof captured?.privatePath === "string") {
        try {
          await windowsGuard.removeSnapshot(rootDirectory, captured.privatePath);
        } catch {
          throw spoolError("file_snapshot_cleanup_failed", "Native file snapshot cleanup failed");
        }
      }
      throw spoolError("file_spool_write_failed", "Native file snapshot is invalid");
    }
    totalBytes += captured.byteSize;
    let removed = false;
    return Object.freeze({
      privatePath: captured.privatePath,
      filename: sanitizeFilename(filename),
      contentType: sanitizeContentType(contentType),
      byteSize: captured.byteSize,
      sha256: captured.sha256,
      remove: async () => {
        if (removed) return;
        await windowsGuard.removeSnapshot(rootDirectory, captured.privatePath);
        removed = true;
        totalBytes = Math.max(0, totalBytes - captured.byteSize);
      },
    });
  }

  function cleanupOrphans() {
    return serialize(async () => {
      await initialize();
      if (cleaned) return Object.freeze({ removed: 0 });
      return cleanupOwnedFiles();
    });
  }

  async function cleanupOwnedFiles() {
    if (platform === "win32") {
      const removed = await windowsGuard.cleanupSpool(rootDirectory);
      if (!Number.isSafeInteger(removed) || removed < 0) throw spoolError("file_spool_unavailable", "Native cleanup result is invalid");
      totalBytes = 0;
      cleaned = true;
      return Object.freeze({ removed });
    }
    let removed = 0;
    for (const name of await fs.readdir(rootDirectory)) {
      if (!OWNED_FILE.test(name) && !STAGING_FILE.test(name)) continue;
      const candidate = path.join(rootDirectory, name);
      const stats = await fs.lstat(candidate);
      if (!stats.isFile() || stats.isSymbolicLink()) continue;
      await fs.unlink(candidate);
      removed += 1;
    }
    totalBytes = 0;
    cleaned = true;
    return Object.freeze({ removed });
  }

  function serialize(operation) {
    const result = operationTail.then(operation, operation);
    operationTail = result.catch(() => {});
    return result;
  }

  return Object.freeze({ rootDirectory, initialize, capture, cleanupOrphans, snapshot: () => Object.freeze({ totalBytes }) });
}

function sanitizeFilename(value) {
  const name = typeof value === "string" ? path.basename(value).normalize("NFC") : "file";
  return name && name !== "." && name !== ".." ? name.slice(0, 255) : "file";
}

function sanitizeContentType(value) {
  return typeof value === "string" && value.length <= 255 && /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*(?:; [a-z0-9!#$&^_.+-]+=[a-z0-9!#$&^_.+-]+)*$/i.test(value)
    ? value.toLowerCase()
    : "application/octet-stream";
}

function spoolError(code, message) { return Object.assign(new Error(message), { code }); }

async function writeAll(handle, chunk) {
  let offset = 0;
  while (offset < chunk.length) {
    const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset);
    if (!Number.isSafeInteger(bytesWritten) || bytesWritten <= 0) throw spoolError("file_spool_write_failed", "File snapshot write made no progress");
    offset += bytesWritten;
  }
}

function secureNonce(randomBytes) {
  const value = randomBytes(16);
  if (!Buffer.isBuffer(value) || value.length !== 16) throw new TypeError("randomBytes must return 16 bytes");
  return value.toString("hex");
}

function assertLimit(value, maximum, name) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) throw new TypeError(`${name} exceeds the fixed safety limit`);
}

function isWindowsGuard(value) {
  return value && ["secureSpoolRoot", "cleanupSpool", "captureFile", "removeSnapshot"].every((name) => typeof value[name] === "function");
}

function fileIdentity(stats) {
  return Object.freeze({ dev: stats.dev, ino: stats.ino });
}

async function rollbackCreatedRoot({ fs, rootDirectory, markerPath, markerCreated, createdIdentity }) {
  try {
    const current = await fs.lstat(rootDirectory);
    if (current.isSymbolicLink() || !current.isDirectory() || current.dev !== createdIdentity.dev || current.ino !== createdIdentity.ino) return;
    if (markerCreated) await fs.unlink(markerPath).catch((error) => { if (error?.code !== "ENOENT") throw error; });
    await fs.rmdir(rootDirectory);
  } catch {
    // Preserve the initialization error; only an unchanged empty directory is eligible for rollback.
  }
}
