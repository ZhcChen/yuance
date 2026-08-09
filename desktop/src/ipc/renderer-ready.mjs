import { isTrustedRendererUrl } from "../window/security-policy.mjs";

export const RENDERER_READY_CHANNEL = "yuance:renderer-ready";

/**
 * @param {{
 *   getMainWindow?: () => any,
 *   rendererTarget?: Record<string, unknown>,
 *   onReady?: (value: Readonly<{ generation: number }>) => void,
 * }} dependencies
 */
export function createRendererReadyController({ getMainWindow, rendererTarget, onReady } = {}) {
  if (typeof getMainWindow !== "function" || typeof onReady !== "function" || !rendererTarget) {
    throw new TypeError("renderer readiness requires window, target, and callback dependencies");
  }
  const resolveMainWindow = getMainWindow;
  const notifyReady = onReady;
  let generation = 0;
  let committedGeneration = -1;
  let consumedGeneration = -1;

  function reset() {
    generation += 1;
    committedGeneration = -1;
    consumedGeneration = -1;
  }

  /** @param {{ url?: string, isMainFrame?: boolean, isInPlace?: boolean }} navigation */
  function didStart({ url, isMainFrame, isInPlace = false } = {}) {
    if (!isMainFrame || isInPlace || !isTrustedRendererUrl(url, rendererTarget)) return false;
    reset();
    return true;
  }

  function didCommit(url) {
    if (!isTrustedRendererUrl(url, rendererTarget)) return false;
    committedGeneration = generation;
    return true;
  }

  function accept(event, args = []) {
    const window = resolveMainWindow();
    const sender = event?.sender;
    const senderFrame = event?.senderFrame;
    if (
      args.length !== 0 ||
      committedGeneration !== generation ||
      consumedGeneration === generation ||
      !window ||
      window.isDestroyed() ||
      !sender ||
      sender !== window.webContents ||
      sender.isDestroyed() ||
      !senderFrame ||
      senderFrame !== sender.mainFrame ||
      !isTrustedRendererUrl(senderFrame.url, rendererTarget)
    ) return false;
    consumedGeneration = generation;
    notifyReady(Object.freeze({ generation }));
    return true;
  }

  function snapshot() {
    return Object.freeze({ generation, committedGeneration, consumedGeneration });
  }

  return Object.freeze({ reset, didStart, didCommit, accept, snapshot });
}

/**
 * @param {{
 *   ipcMain?: { on: Function, removeListener: Function },
 *   controller?: { accept: (event: unknown, args?: unknown[]) => boolean },
 * }} dependencies
 */
export function registerRendererReadyHandler({ ipcMain, controller } = {}) {
  if (!ipcMain || typeof ipcMain.on !== "function" || typeof ipcMain.removeListener !== "function" || !controller) {
    throw new TypeError("renderer readiness handler dependencies are required");
  }
  const listener = (event, ...args) => controller.accept(event, args);
  ipcMain.on(RENDERER_READY_CHANNEL, listener);
  return () => ipcMain.removeListener(RENDERER_READY_CHANNEL, listener);
}
