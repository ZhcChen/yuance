// @ts-check

import { normalizeHostAuthState } from "@yuance/frontend-app-core";

export { normalizeHostAuthState as normalizePublicAuthState } from "@yuance/frontend-app-core";

/** @param {{ getSnapshot?: () => unknown, subscribe?: (callback: (state: unknown) => void) => (() => void) }} [bridge] */
export function createDesktopAuthState(bridge = {}) {
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
  });
}
