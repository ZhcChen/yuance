// @ts-check

const PUBLIC_STATES = new Set(["idle", "connecting", "online", "offline", "suspended", "reauthorization_required", "fatal"]);

export function normalizePublicNetworkState(value) {
  const status = value && typeof value === "object" ? value.status : undefined;
  return Object.freeze({ status: PUBLIC_STATES.has(status) ? status : "fatal" });
}

/** @param {{ getSnapshot?: () => unknown, subscribe?: (callback: (state: unknown) => void) => (() => void) }} [bridge] */
export function createDesktopNetworkState(bridge = {}) {
  const valid = typeof bridge.getSnapshot === "function" && typeof bridge.subscribe === "function";
  return Object.freeze({
    getSnapshot() { return valid ? normalizePublicNetworkState(bridge.getSnapshot?.()) : normalizePublicNetworkState(null); },
    subscribe(callback) {
      if (!valid || typeof callback !== "function") return () => {};
      return bridge.subscribe?.((state) => callback(normalizePublicNetworkState(state))) ?? (() => {});
    },
  });
}
