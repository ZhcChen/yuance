import path from "node:path";

const CONTENT_TYPES = new Map([
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain"],
  [".md", "text/markdown"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

const GENERIC_CONTENT_TYPES = new Set(["", "application/octet-stream"]);

export function createFileDialog({ dialog, spool, vault } = {}) {
  const canChoose = typeof dialog?.showOpenDialog === "function" && typeof spool?.capture === "function";
  const canSelectPasted = typeof spool?.captureBuffer === "function";
  if ((!canChoose && !canSelectPasted) || typeof vault?.issue !== "function") {
    throw new TypeError("file dialog requires dialog, spool, and vault");
  }

  async function choose({ window, binding } = {}) {
    const result = await dialog.showOpenDialog(window, Object.freeze({
      title: "选择文件",
      properties: Object.freeze(["openFile", "dontAddToRecent"]),
    }));
    if (result?.canceled === true) return null;
    if (!Array.isArray(result?.filePaths) || result.filePaths.length !== 1 || typeof result.filePaths[0] !== "string") {
      throw publicError("file_selection_invalid", "File selection is invalid");
    }
    const filePath = result.filePaths[0];
    const filename = safeFilename(filePath);
    let snapshot;
    try {
      snapshot = await spool.capture(filePath, { filename, contentType: contentTypeFor(filename) });
    } catch (error) {
      throw publicFileError(error);
    }
    try {
      return vault.issue(snapshot, binding);
    } catch (error) {
      await snapshot.remove().catch(() => {});
      throw error;
    }
  }

  async function selectPasted({ filename = "pasted-file", contentType = "", data } = {}, binding) {
    if (typeof data?.byteLength !== "number" || !Number.isSafeInteger(data.byteLength) || data.byteLength < 0) {
      throw publicError("file_selection_invalid", "Pasted file is invalid");
    }
    const safeName = safeFilename(filename);
    let snapshot;
    try {
      snapshot = await spool.captureBuffer(data, { filename: safeName, contentType: resolveContentType(contentType, safeName) });
    } catch (error) {
      throw publicFileError(error);
    }
    try {
      return vault.issue(snapshot, binding);
    } catch (error) {
      await snapshot.remove().catch(() => {});
      throw error;
    }
  }

  return Object.freeze({ choose, selectPasted });
}

function safeFilename(filePath) {
  const filename = path.basename(filePath).normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, "");
  return filename && filename !== "." && filename !== ".." ? filename.slice(0, 255) : "file";
}

function contentTypeFor(filename) {
  return CONTENT_TYPES.get(path.extname(filename).toLowerCase()) ?? "application/octet-stream";
}

function resolveContentType(contentType, filename) {
  const normalized = baseContentType(contentType);
  if (normalized && !GENERIC_CONTENT_TYPES.has(normalized)) return normalized;
  return contentTypeFor(filename);
}

function baseContentType(contentType) {
  return contentType.split(";", 1)[0].trim().toLowerCase();
}

function publicError(code, message) { return Object.assign(new Error(message), { code }); }

function publicFileError(error) {
  const allowed = new Set(["file_not_regular", "file_link_not_allowed", "file_identity_changed", "file_too_large", "file_spool_quota", "file_spool_unavailable", "file_native_guard_required", "file_spool_write_failed"]);
  const code = allowed.has(error?.code) ? error.code : "file_unavailable";
  return publicError(code, "File could not be selected");
}
