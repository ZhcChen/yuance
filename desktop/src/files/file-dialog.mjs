import path from "node:path";

const CONTENT_TYPES = new Map([
  [".txt", "text/plain; charset=utf-8"],
  [".md", "text/markdown"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
]);

export function createFileDialog({ dialog, spool, vault } = {}) {
  if (typeof dialog?.showOpenDialog !== "function" || typeof spool?.capture !== "function" || typeof vault?.issue !== "function") {
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

  return Object.freeze({ choose });
}

function safeFilename(filePath) {
  const filename = path.basename(filePath).normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, "");
  return filename && filename !== "." && filename !== ".." ? filename.slice(0, 255) : "file";
}

function contentTypeFor(filename) {
  return CONTENT_TYPES.get(path.extname(filename).toLowerCase()) ?? "application/octet-stream";
}

function publicError(code, message) { return Object.assign(new Error(message), { code }); }

function publicFileError(error) {
  const allowed = new Set(["file_not_regular", "file_link_not_allowed", "file_identity_changed", "file_too_large", "file_spool_quota", "file_spool_unavailable", "file_native_guard_required", "file_spool_write_failed"]);
  const code = allowed.has(error?.code) ? error.code : "file_unavailable";
  return publicError(code, "File could not be selected");
}
