// @ts-check

import { normalizeHostAuthState } from "@yuance/frontend-app-core";

export { normalizeHostAuthState as normalizePublicAuthState } from "@yuance/frontend-app-core";

/**
 * @param {{ getSnapshot?: () => unknown, subscribe?: (callback: (state: unknown) => void) => (() => void) }} [bridge]
 * @param {{ authorize?: () => Promise<unknown>, retry?: () => Promise<unknown>, logout?: () => Promise<unknown>, discardMismatchedProfile?: () => Promise<unknown> }} [commands]
 */
export function createDesktopAuthState(bridge = {}, commands = {}) {
  const validBridge = typeof bridge.getSnapshot === "function" && typeof bridge.subscribe === "function";
  return Object.freeze({
    getSnapshot() {
      return validBridge
        ? normalizeHostAuthState(bridge.getSnapshot?.())
        : normalizeHostAuthState({ status: "fatal" });
    },
    subscribe(callback) {
      if (typeof callback !== "function") return () => {};
      if (!validBridge) return () => {};
      return bridge.subscribe?.((state) => callback(normalizeHostAuthState(state))) ?? (() => {});
    },
    authorize() { return invokeCommand(commands.authorize); },
    retry() { return invokeCommand(commands.retry); },
    logout() { return invokeCommand(commands.logout); },
    discardMismatchedProfile() { return invokeCommand(commands.discardMismatchedProfile); },
  });
}

function invokeCommand(command) {
  if (typeof command !== "function") return Promise.reject(new Error("auth command is unavailable"));
  return command();
}
