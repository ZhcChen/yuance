export const FILE_CHANNELS = Object.freeze({
  choose: "yuance:file-choose",
  uploadCanary: "yuance:file-upload-canary",
  downloadCanary: "yuance:file-download-canary",
});

export function registerFileCommandHandlers({ ipcMain, assertSender, getBinding, getWindow, fileDialog, issueTransferGrant, uploadExecutor, downloadExecutor } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== "function" || typeof ipcMain.removeHandler !== "function") throw new TypeError("ipcMain is required");
  if (typeof assertSender !== "function" || typeof getBinding !== "function" || typeof getWindow !== "function" || typeof fileDialog?.choose !== "function" || typeof issueTransferGrant !== "function" || typeof uploadExecutor?.execute !== "function" || typeof downloadExecutor?.execute !== "function") {
    throw new TypeError("file command dependencies are required");
  }

  const handlers = {
    [FILE_CHANNELS.choose]: async (event, payload) => {
      assertSender(event);
      rejectPayload(payload);
      return normalizeSelection(await fileDialog.choose({ window: getWindow(), binding: getBinding(event, "upload") }));
    },
    [FILE_CHANNELS.uploadCanary]: async (event, capability) => {
      assertSender(event);
      if (typeof capability !== "string" || !/^yfc_[A-Za-z0-9_-]{32}$/.test(capability)) throw publicError("file_capability_invalid");
      const binding = getBinding(event, "upload");
      const transferGrant = await issueTransferGrant("upload", binding);
      return normalizeResult(await uploadExecutor.execute({ fileCapability: capability, transferGrant, binding }));
    },
    [FILE_CHANNELS.downloadCanary]: async (event, payload) => {
      assertSender(event);
      rejectPayload(payload);
      const binding = getBinding(event, "download");
      const transferGrant = await issueTransferGrant("download", binding);
      return normalizeResult(await downloadExecutor.execute({ window: getWindow(), suggestedFilename: "yuance-file-transfer-canary.txt", transferGrant, binding }));
    },
  };
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, sanitize(handler));
  return () => { for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel); };
}

function sanitize(handler) {
  return async (...args) => {
    try { return await handler(...args); }
    catch (error) {
      if (typeof error?.code === "string" && error.code.startsWith("file_")) throw publicError(error.code);
      throw publicError("file_unavailable");
    }
  };
}
function rejectPayload(payload) { if (payload !== undefined) throw new TypeError("file command does not accept payload"); }
function normalizeSelection(value) {
  if (value === null) return null;
  if (!value || typeof value.capability !== "string" || typeof value.filename !== "string" || typeof value.contentType !== "string" || !Number.isSafeInteger(value.byteSize)) throw publicError("file_unavailable");
  return Object.freeze({ capability: value.capability, filename: value.filename, contentType: value.contentType, byteSize: value.byteSize });
}
function normalizeResult(value) {
  if (!value || !["completed", "cancelled"].includes(value.status)) throw publicError("file_unavailable");
  return Object.freeze({ status: value.status, ...(Number.isSafeInteger(value.byteSize) ? { byteSize: value.byteSize } : {}), ...(typeof value.filename === "string" ? { filename: value.filename } : {}) });
}
function publicError(code) { return Object.assign(new Error("File operation failed"), { code }); }
