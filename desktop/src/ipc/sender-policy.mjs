import { isTrustedRendererUrl } from "../window/security-policy.mjs";

export function createRendererReadinessTracker(rendererTarget) {
  let ready = false;

  return Object.freeze({
    didStart({ url, isMainFrame, isInPlace = false }) {
      if (!isInPlace && isMainFrame && isTrustedRendererUrl(url, rendererTarget)) ready = false;
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
