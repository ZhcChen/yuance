// @ts-check

import { defineHostDelegatedFileCapabilities } from "@yuance/frontend-platform-contract";

export function createDesktopFiles(bridge) {
  return defineHostDelegatedFileCapabilities({
    chooseFile: async () => normalizeSelection(await requireOperation(bridge, "choose")()),
    uploadCanary: async (capability) => normalizeResult(await requireOperation(bridge, "uploadCanary")(capability)),
    downloadCanary: async () => normalizeResult(await requireOperation(bridge, "downloadCanary")()),
  });
}

function requireOperation(bridge, name) {
  const operation = bridge?.[name];
  if (typeof operation !== "function") throw new Error("file operation is unavailable");
  return operation;
}
function normalizeSelection(value) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || typeof value.capability !== "string" || typeof value.filename !== "string" || typeof value.contentType !== "string" || !Number.isSafeInteger(value.byteSize)) throw new Error("file result is invalid");
  return Object.freeze({ capability: value.capability, filename: value.filename, contentType: value.contentType, byteSize: value.byteSize });
}
function normalizeResult(value) {
  if (!value || typeof value !== "object" || !["completed", "cancelled"].includes(value.status)) throw new Error("file result is invalid");
  return Object.freeze({ status: value.status, ...(Number.isSafeInteger(value.byteSize) ? { byteSize: value.byteSize } : {}), ...(typeof value.filename === "string" ? { filename: value.filename } : {}) });
}
