const { contextBridge, ipcRenderer } = require("electron");

const HOST_STATE_CHANNEL = "yuance:host-state";
const NOTIFICATION_CLICK_CHANNEL = "yuance:notification-click";
const NETWORK_STATE_CHANNEL = "yuance:network-state";
const BUSINESS_EXECUTE_CHANNEL = "yuance:business-execute";
const ATTACHMENT_PROGRESS_CHANNEL = "yuance:file-attachment-progress";
const ATTACHMENT_STAGES = new Set(["registering", "signing", "uploading", "confirming"]);
const PUBLIC_HOST_STATES = new Set([
  "starting",
  "unauthenticated",
  "authorizing",
  "authenticated",
  "locked",
  "reauthorization_required",
  "fatal",
]);
let hostStateSnapshot = Object.freeze({ status: "starting" });
const hostStateSubscribers = new Set();
const PUBLIC_NETWORK_STATES = new Set([
  "idle", "connecting", "online", "offline", "suspended", "reauthorization_required", "fatal",
]);
let networkStateSnapshot = Object.freeze({ status: "idle" });
const networkStateSubscribers = new Set();

function normalizeHostState(value) {
  const status = value && typeof value === "object" ? value.status : undefined;
  return Object.freeze({ status: PUBLIC_HOST_STATES.has(status) ? status : "fatal" });
}

ipcRenderer.on(HOST_STATE_CHANNEL, (_event, value) => {
  hostStateSnapshot = normalizeHostState(value);
  for (const callback of [...hostStateSubscribers]) {
    try {
      callback(hostStateSnapshot);
    } catch (_error) {
      // One renderer subscriber must not prevent other subscribers from receiving state.
    }
  }
});

ipcRenderer.on(NETWORK_STATE_CHANNEL, (_event, value) => {
  const status = value && typeof value === "object" ? value.status : undefined;
  networkStateSnapshot = Object.freeze({ status: PUBLIC_NETWORK_STATES.has(status) ? status : "fatal" });
  for (const callback of [...networkStateSubscribers]) {
    try { callback(networkStateSnapshot); } catch (_error) {}
  }
});

const bridge = Object.freeze({
  schemaVersion: 5,
  auth: Object.freeze({
    authorize() { return ipcRenderer.invoke("yuance:auth-authorize"); },
    retry() { return ipcRenderer.invoke("yuance:auth-retry"); },
    logout() { return ipcRenderer.invoke("yuance:auth-logout"); },
  }),
  hostState: Object.freeze({
    getSnapshot() {
      return hostStateSnapshot;
    },
    subscribe(callback) {
      if (typeof callback !== "function") return () => {};
      hostStateSubscribers.add(callback);
      try {
        callback(hostStateSnapshot);
      } catch (error) {
        hostStateSubscribers.delete(callback);
        throw error;
      }
      return () => hostStateSubscribers.delete(callback);
    },
  }),
  network: Object.freeze({
    getSnapshot() { return networkStateSnapshot; },
    subscribe(callback) {
      if (typeof callback !== "function") return () => {};
      networkStateSubscribers.add(callback);
      try { callback(networkStateSnapshot); }
      catch (error) { networkStateSubscribers.delete(callback); throw error; }
      return () => networkStateSubscribers.delete(callback);
    },
  }),
  business: Object.freeze({
    execute(operation, input) { return ipcRenderer.invoke(BUSINESS_EXECUTE_CHANNEL, { operation, input }); },
  }),
  files: Object.freeze({
    choose() { return ipcRenderer.invoke("yuance:file-choose"); },
    uploadCanary(capability) { return ipcRenderer.invoke("yuance:file-upload-canary", capability); },
    downloadCanary() { return ipcRenderer.invoke("yuance:file-download-canary"); },
    uploadWorkItemAttachment(input, onStage) { return invokeAttachmentUpload("yuance:file-upload-work-item-attachment", input, onStage); },
    uploadWorkItemCommentAttachment(input, onStage) { return invokeAttachmentUpload("yuance:file-upload-work-item-comment-attachment", input, onStage); },
    downloadWorkItemAttachment(input) { return ipcRenderer.invoke("yuance:file-download-work-item-attachment", input); },
    downloadWorkItemCommentAttachment(input) { return ipcRenderer.invoke("yuance:file-download-work-item-comment-attachment", input); },
  }),
  notifications: Object.freeze({
    show(payload) {
      return ipcRenderer.invoke("yuance:notify", payload);
    },
    onClick(callback) {
      if (typeof callback !== "function") {
        return () => {};
      }
      const listener = (_event, targetPath) => callback(targetPath);
      ipcRenderer.on(NOTIFICATION_CLICK_CHANNEL, listener);
      return () => ipcRenderer.removeListener(NOTIFICATION_CLICK_CHANNEL, listener);
    },
  }),
});

function invokeAttachmentUpload(channel, input, onStage) {
  const operationId = globalThis.crypto.randomUUID();
  const listener = (_event, value) => {
    if (value && value.operationId === operationId && ATTACHMENT_STAGES.has(value.stage) && typeof onStage === "function") onStage(value.stage);
  };
  ipcRenderer.on(ATTACHMENT_PROGRESS_CHANNEL, listener);
  return ipcRenderer.invoke(channel, { operationId, input }).finally(() => ipcRenderer.removeListener(ATTACHMENT_PROGRESS_CHANNEL, listener));
}

contextBridge.exposeInMainWorld("yuanceDesktop", bridge);
