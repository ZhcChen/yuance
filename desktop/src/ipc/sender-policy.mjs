import { isTrustedRendererUrl } from "../window/security-policy.mjs";

export function createRendererReadinessTracker(rendererTarget) {
  let ready = false;

  return Object.freeze({
    didStart({ url, isMainFrame }) {
      if (isMainFrame && isTrustedRendererUrl(url, rendererTarget)) ready = false;
    },
    didCommit(url) {
      ready = isTrustedRendererUrl(url, rendererTarget);
      return ready;
    },
    didCancelOrFail() {
      // Electron does not expose a stable navigation ID here. Only a trusted commit
      // may reopen IPC, so late failures cannot clear a newer pending navigation.
    },
    reset() {
      ready = false;
    },
    isPending() {
      return !ready;
    },
  });
}

export function createIpcSenderPolicy({ getMainWindow, isNavigationPending, rendererTarget }) {
  if (typeof getMainWindow !== "function" || typeof isNavigationPending !== "function") {
    throw new TypeError("IPC sender policy requires window and navigation state providers.");
  }

  return function assertTrustedSender(event) {
    const window = getMainWindow();
    const sender = event?.sender;
    const senderFrame = event?.senderFrame;
    if (
      !window ||
      window.isDestroyed() ||
      !sender ||
      sender !== window.webContents ||
      sender.isDestroyed() ||
      !senderFrame ||
      senderFrame !== sender.mainFrame ||
      isNavigationPending() ||
      !isTrustedRendererUrl(senderFrame.url, rendererTarget)
    ) {
      throw new Error("Untrusted renderer IPC sender.");
    }
    return true;
  };
}

export function parseNotificationPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("Notification payload must be an object.");
  }
  const prototype = Object.getPrototypeOf(payload);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Notification payload must be a plain object.");
  }
  const allowedKeys = new Set(["title", "body", "targetPath"]);
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key) || key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new TypeError(`Unknown notification payload field: ${key}`);
    }
  }
  for (const [key, limit] of [["title", 120], ["body", 240], ["targetPath", 512]]) {
    const value = payload[key];
    if (value !== undefined && (typeof value !== "string" || value.length > limit)) {
      throw new TypeError(`Invalid notification payload field: ${key}`);
    }
  }
  return Object.freeze({
    ...(payload.title !== undefined ? { title: payload.title } : {}),
    ...(payload.body !== undefined ? { body: payload.body } : {}),
    ...(payload.targetPath !== undefined ? { targetPath: payload.targetPath } : {}),
  });
}
