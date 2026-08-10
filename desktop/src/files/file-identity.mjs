import fsPromises from "node:fs/promises";
import fsConstants from "node:fs";

export async function openRegularFile({ filePath, fs = fsPromises, constants = fsConstants.constants, platform = process.platform } = {}) {
  if (typeof filePath !== "string" || filePath.length === 0) throw fileError("file_invalid", "File path is required");
  if (platform === "win32" || !Number.isInteger(constants.O_NOFOLLOW)) {
    throw fileError("file_native_guard_required", "Native file guard is required");
  }
  const before = await fs.lstat(filePath, { bigint: true });
  if (before.isSymbolicLink()) throw fileError("file_link_not_allowed", "File links are not allowed");
  if (!before.isFile()) throw fileError("file_not_regular", "Only regular files are allowed");

  let handle;
  try {
    handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const after = await handle.stat({ bigint: true });
    if (!after.isFile()) throw fileError("file_not_regular", "Only regular files are allowed");
    const beforeIdentity = toIdentity(before);
    const identity = toIdentity(after);
    if (!sameFileIdentity(beforeIdentity, identity)) {
      throw fileError("file_identity_changed", "File identity changed while opening");
    }
    return Object.freeze({
      handle,
      identity,
      currentIdentity: async () => {
        const handleIdentity = toIdentity(await handle.stat({ bigint: true }));
        const pathStats = await fs.lstat(filePath, { bigint: true });
        if (pathStats.isSymbolicLink()) throw fileError("file_link_not_allowed", "File links are not allowed");
        const pathIdentity = toIdentity(pathStats);
        return sameFileIdentity(handleIdentity, pathIdentity) ? handleIdentity : pathIdentity;
      },
    });
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error?.code === "ELOOP") throw fileError("file_link_not_allowed", "File links are not allowed");
    throw error;
  }
}

export function sameFileIdentity(left, right) {
  return Boolean(left && right) && ["dev", "ino", "size", "mtimeNs", "ctimeNs"].every((key) => left[key] === right[key]);
}

function toIdentity(stats) {
  return Object.freeze({
    dev: String(stats.dev),
    ino: String(stats.ino),
    size: Number(stats.size),
    mtimeNs: String(stats.mtimeNs ?? BigInt(Math.trunc(Number(stats.mtimeMs) * 1_000_000))),
    ctimeNs: String(stats.ctimeNs ?? BigInt(Math.trunc(Number(stats.ctimeMs) * 1_000_000))),
  });
}

function fileError(code, message) {
  return Object.assign(new Error(message), { code });
}
