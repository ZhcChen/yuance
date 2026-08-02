import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_NAMES = Object.freeze({
  x64: "index.win32-x64-msvc.node",
  arm64: "index.win32-arm64-msvc.node",
});

export function loadWindowsFileGuard({
  platform = process.platform,
  arch = process.arch,
  nativeDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "native"),
  requireImpl = createRequire(import.meta.url),
} = {}) {
  if (platform !== "win32") return undefined;
  const moduleName = MODULE_NAMES[arch];
  if (!moduleName) throw guardError("file_native_guard_required");
  let native;
  try {
    native = requireImpl(path.win32.join(nativeDirectory, moduleName));
  } catch {
    throw guardError("file_native_guard_required");
  }
  for (const name of ["captureWindowsFile", "secureWindowsSpoolRoot", "cleanupWindowsSpool", "removeWindowsSnapshot"]) {
    if (typeof native?.[name] !== "function") throw guardError("file_native_guard_required");
  }
  return Object.freeze({
    secureSpoolRoot: (spoolRoot) => invoke(native.secureWindowsSpoolRoot, spoolRoot),
    cleanupSpool: (spoolRoot) => invoke(native.cleanupWindowsSpool, spoolRoot),
    captureFile: (input) => invoke(native.captureWindowsFile, input),
    removeSnapshot: (spoolRoot, privatePath) => invoke(native.removeWindowsSnapshot, spoolRoot, privatePath),
  });
}

async function invoke(operation, ...args) {
  try {
    return await operation(...args);
  } catch (error) {
    throw guardError(mapNativeError(String(error?.message ?? "")));
  }
}

function mapNativeError(message) {
  if (message.includes("LIMIT_EXCEEDED")) return "file_too_large";
  if (message.includes("SOURCE_CHANGED")) return "file_identity_changed";
  if (message.includes("REPARSE_POINT")) return "file_link_not_allowed";
  if (message.includes("NOT_REGULAR")) return "file_not_regular";
  if (message.includes("SNAPSHOT_WRITE") || message.includes("SNAPSHOT_SIZE") || message.includes("SNAPSHOT_SYNC")) return "file_spool_write_failed";
  if (message.includes("SPOOL") || message.includes("MARKER") || message.includes("OUTSIDE_SPOOL")) return "file_spool_unavailable";
  return "file_unavailable";
}

function guardError(code) { return Object.assign(new Error("Native file guard failed"), { code }); }
