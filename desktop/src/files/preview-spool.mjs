import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import fsPromises from "node:fs/promises";
import path from "node:path";

const MARKER = ".yuance-preview-spool-v1";
const OWNED = /^(?:snapshot-[0-9a-f]{32}\.bin|\.capture-[0-9a-f]{32}\.tmp)$/u;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

export function createPreviewSpool({ rootDirectory, fs = fsPromises, platform = process.platform, windowsGuard, randomBytes = nodeRandomBytes, maxFileBytes = MAX_FILE_BYTES, maxTotalBytes = MAX_TOTAL_BYTES } = {}) {
  const pathApi = platform === "win32" ? path.win32 : path;
  if (!pathApi.isAbsolute(rootDirectory ?? "")) throw new TypeError("preview spool root must be absolute");
  if (platform === "win32" && typeof windowsGuard?.secureSpoolRoot !== "function") throw previewError("preview_native_guard_required");
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > MAX_FILE_BYTES || !Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < maxFileBytes || maxTotalBytes > MAX_TOTAL_BYTES) throw new TypeError("preview spool limits are invalid");
  let initialized = false;
  let totalBytes = 0;
  let tail = Promise.resolve();

  async function initialize() {
    if (initialized) return;
    if (platform === "win32") await windowsGuard.secureSpoolRoot(rootDirectory);
    else {
      await fs.mkdir(path.dirname(rootDirectory), { recursive: true, mode: 0o700 });
      let created = false;
      try { await fs.mkdir(rootDirectory, { mode: 0o700 }); created = true; }
      catch (error) { if (error?.code !== "EEXIST") throw error; }
      const stats = await fs.lstat(rootDirectory);
      if (stats.isSymbolicLink() || !stats.isDirectory()) throw previewError("preview_spool_unavailable");
      await fs.chmod(rootDirectory, 0o700);
      const marker = path.join(rootDirectory, MARKER);
      if (created) await fs.writeFile(marker, "yuance-preview-spool-v1\n", { flag: "wx", mode: 0o600 });
      else if (await fs.readFile(marker, "utf8").catch(() => "") !== "yuance-preview-spool-v1\n") throw previewError("preview_spool_unavailable");
    }
    initialized = true;
  }

  function capture(stream, { contentType, expectedBytes, expectedSha256 } = {}) {
    return serialize(async () => {
      await initialize();
      if (!stream || typeof stream.getReader !== "function" || !Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > maxFileBytes || totalBytes + expectedBytes > maxTotalBytes || typeof contentType !== "string" || contentType.length < 1 || contentType.length > 255 || (expectedSha256 !== undefined && !/^[0-9a-f]{64}$/u.test(expectedSha256))) throw previewError("preview_content_invalid");
      const nonce = secureNonce(randomBytes);
      const temporaryPath = path.join(rootDirectory, `.capture-${nonce}.tmp`);
      const privatePath = path.join(rootDirectory, `snapshot-${nonce}.bin`);
      const handle = await fs.open(temporaryPath, "wx", 0o600);
      const reader = stream.getReader();
      const hash = createHash("sha256");
      let bytes = 0;
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          if (!(result.value instanceof Uint8Array)) throw previewError("preview_content_invalid");
          bytes += result.value.byteLength;
          if (bytes > expectedBytes || bytes > maxFileBytes) throw previewError("preview_size_mismatch");
          hash.update(result.value);
          await writeAll(handle, result.value);
        }
        const digest = hash.digest("hex");
        if (bytes !== expectedBytes || (expectedSha256 && digest !== expectedSha256)) throw previewError("preview_size_mismatch");
        await handle.sync();
        await handle.close();
        await fs.rename(temporaryPath, privatePath);
        totalBytes += bytes;
        let removed = false;
        return Object.freeze({ privatePath, contentType, byteSize: bytes, remove: async () => {
          if (removed) return;
          if (platform === "win32" && typeof windowsGuard?.removeSnapshot === "function") await windowsGuard.removeSnapshot(rootDirectory, privatePath);
          else await fs.unlink(privatePath).catch((error) => { if (error?.code !== "ENOENT") throw error; });
          removed = true;
          totalBytes = Math.max(0, totalBytes - bytes);
        } });
      } catch (error) {
        await handle.close().catch(() => {});
        await reader.cancel().catch(() => {});
        await fs.unlink(temporaryPath).catch(() => {});
        throw error?.code?.startsWith("preview_") ? error : previewError("preview_spool_write_failed");
      }
    });
  }

  function cleanupOrphans() { return serialize(async () => {
    await initialize();
    let removed = 0;
    for (const name of await fs.readdir(rootDirectory)) {
      if (!OWNED.test(name)) continue;
      const candidate = path.join(rootDirectory, name);
      const stats = await fs.lstat(candidate);
      if (stats.isSymbolicLink() || !stats.isFile()) continue;
      if (platform === "win32" && typeof windowsGuard?.removeSnapshot === "function") await windowsGuard.removeSnapshot(rootDirectory, candidate);
      else await fs.unlink(candidate);
      removed += 1;
    }
    totalBytes = 0;
    return Object.freeze({ removed });
  }); }

  function serialize(operation) { const result = tail.then(operation, operation); tail = result.catch(() => {}); return result; }
  return Object.freeze({ rootDirectory, initialize, capture, cleanupOrphans, snapshot: () => Object.freeze({ totalBytes }) });
}

async function writeAll(handle, bytes) { let offset = 0; while (offset < bytes.byteLength) { const result = await handle.write(bytes, offset, bytes.byteLength - offset); if (!Number.isSafeInteger(result.bytesWritten) || result.bytesWritten < 1) throw previewError("preview_spool_write_failed"); offset += result.bytesWritten; } }
function secureNonce(randomBytes) { const value = randomBytes(16); if (!Buffer.isBuffer(value) || value.length !== 16) throw new TypeError("randomBytes must return 16 bytes"); return value.toString("hex"); }
function previewError(code) { return Object.assign(new Error("Preview spool failed"), { code }); }
