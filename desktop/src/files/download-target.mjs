import fsConstants from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { randomBytes as nodeRandomBytes } from "node:crypto";

const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function sanitizeDownloadFilename(value) {
  if (typeof value !== "string") return "download";
  const normalized = value.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, "");
  const basename = path.posix.basename(normalized.replaceAll("\\", "/")).trim().replace(/[. ]+$/g, "");
  if (!basename || basename === "." || basename === ".." || basename.includes(":") || WINDOWS_RESERVED.test(basename)) return "download";
  return Buffer.byteLength(basename) <= 240 ? basename : truncateUtf8(basename, 240);
}

export function createDownloadTargetManager({
  dialog,
  fs = fsPromises,
  constants = fsConstants.constants,
  randomBytes = nodeRandomBytes,
  platform = process.platform,
  windowsGuard,
} = {}) {
  if (typeof dialog?.showSaveDialog !== "function") throw new TypeError("download target requires save dialog");
  if (platform === "win32" && typeof windowsGuard?.commitDownload !== "function") throw targetError("file_native_guard_required");

  async function choose({ window, suggestedFilename } = {}) {
    const result = await dialog.showSaveDialog(window, Object.freeze({
      title: "保存文件",
      defaultPath: sanitizeDownloadFilename(suggestedFilename),
      properties: Object.freeze(["dontAddToRecent", "showOverwriteConfirmation"]),
    }));
    if (result?.canceled === true) return null;
    if (typeof result?.filePath !== "string" || !isAbsoluteForPlatform(result.filePath, platform)) throw targetError("file_download_target_invalid");
    const pathApi = platform === "win32" ? path.win32 : path;
    return prepare(result.filePath, sanitizeDownloadFilename(pathApi.basename(result.filePath)));
  }

  async function prepare(targetPath, publicFilename) {
    const pathApi = platform === "win32" ? path.win32 : path;
    const directory = pathApi.dirname(targetPath);
    const parentStats = await fs.lstat(directory, { bigint: true });
    if (parentStats.isSymbolicLink() || !parentStats.isDirectory()) throw targetError("file_download_target_invalid");
    const parentHandle = await fs.open(directory, constants.O_RDONLY);
    let targetHandle;
    let targetIdentity;
    try {
      try {
        const targetStats = await fs.lstat(targetPath, { bigint: true });
        if (targetStats.isSymbolicLink() || !targetStats.isFile()) throw targetError("file_download_target_invalid");
        targetIdentity = identity(targetStats);
        targetHandle = await fs.open(targetPath, constants.O_RDONLY);
        if (!sameIdentity(targetIdentity, identity(await targetHandle.stat({ bigint: true })))) throw targetError("file_download_target_changed");
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      const nonce = secureNonce(randomBytes);
      const temporaryPath = pathApi.join(directory, `.yuance-download-${nonce}.tmp`);
      const temporaryHandle = await fs.open(temporaryPath, "wx", 0o600);
      let committed = false;
      let closed = false;
      async function closeHandles() {
        if (closed) return;
        closed = true;
        await temporaryHandle.close().catch(() => {});
        await targetHandle?.close().catch(() => {});
        await parentHandle.close().catch(() => {});
      }
      return Object.freeze({
        publicFilename,
        handle: temporaryHandle,
        async commit(expectedBytes) {
          if (committed || !Number.isSafeInteger(expectedBytes) || expectedBytes < 0) throw targetError("file_download_commit_failed");
          const tempStats = await temporaryHandle.stat({ bigint: true });
          if (!tempStats.isFile() || Number(tempStats.size) !== expectedBytes) throw targetError("file_download_commit_failed");
          await temporaryHandle.sync();
          await verifyIdentity(fs, directory, parentHandle, directoryIdentity(parentStats), true);
          if (targetHandle) await verifyIdentity(fs, targetPath, targetHandle, targetIdentity, false);
          else await assertMissing(fs, targetPath);
          if (platform === "win32") {
            await windowsGuard.commitDownload({ directory, targetPath, temporaryPath, parentFd: parentHandle.fd, temporaryFd: temporaryHandle.fd, targetFd: targetHandle?.fd ?? -1 });
          } else {
            await fs.rename(temporaryPath, targetPath);
          }
          committed = true;
          await closeHandles();
          const finalStats = await fs.lstat(targetPath, { bigint: true });
          if (finalStats.isSymbolicLink() || !finalStats.isFile() || Number(finalStats.size) !== expectedBytes) throw targetError("file_download_commit_failed");
        },
        async cleanup() {
          await closeHandles();
          if (!committed) await fs.unlink(temporaryPath).catch((error) => { if (error?.code !== "ENOENT") throw error; });
        },
      });
    } catch (error) {
      await targetHandle?.close().catch(() => {});
      await parentHandle.close().catch(() => {});
      if (error?.code?.startsWith("file_download_")) throw error;
      throw targetError("file_download_target_invalid");
    }
  }

  return Object.freeze({ choose });
}

async function verifyIdentity(fs, filePath, handle, expected, directory) {
  const handleStats = await handle.stat({ bigint: true });
  const pathStats = await fs.lstat(filePath, { bigint: true });
  const convert = directory ? directoryIdentity : identity;
  if ((directory ? !pathStats.isDirectory() : !pathStats.isFile()) || pathStats.isSymbolicLink() || !sameIdentity(convert(handleStats), expected) || !sameIdentity(convert(pathStats), expected)) throw targetError("file_download_target_changed");
}
async function assertMissing(fs, filePath) {
  try { await fs.lstat(filePath); } catch (error) { if (error?.code === "ENOENT") return; throw error; }
  throw targetError("file_download_target_changed");
}
function identity(stats) { return Object.freeze({ dev: String(stats.dev), ino: String(stats.ino), size: String(stats.size), mtimeNs: String(stats.mtimeNs), ctimeNs: String(stats.ctimeNs) }); }
function directoryIdentity(stats) { return Object.freeze({ dev: String(stats.dev), ino: String(stats.ino) }); }
function sameIdentity(left, right) { return Object.keys(right ?? {}).every((key) => left?.[key] === right?.[key]); }
function secureNonce(randomBytes) { const value = randomBytes(16); if (!Buffer.isBuffer(value) || value.length !== 16) throw new TypeError("randomBytes must return 16 bytes"); return value.toString("hex"); }
function isAbsoluteForPlatform(value, platform) { return (platform === "win32" ? path.win32 : path).isAbsolute(value) && !value.includes("\0"); }
function truncateUtf8(value, maxBytes) { let result = ""; for (const char of value) { if (Buffer.byteLength(result + char) > maxBytes) break; result += char; } return result || "download"; }
function targetError(code) { return Object.assign(new Error("Download target is unavailable"), { code }); }
