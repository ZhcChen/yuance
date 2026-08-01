export const NETWORK_STATE_CHANNEL = "yuance:network-state";
const PUBLIC_STATES = new Set(["idle", "connecting", "online", "offline", "suspended", "reauthorization_required", "fatal"]);

export function normalizePublicNetworkState(value) {
  return Object.freeze({ status: PUBLIC_STATES.has(value?.status) ? value.status : "fatal" });
}

export function createNetworkStatePublisher() {
  let current = normalizePublicNetworkState({ status: "idle" });
  function snapshot() { return current; }
  function update(value) { current = normalizePublicNetworkState(value); return current; }
  function publishTo(window) {
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return false;
    window.webContents.send(NETWORK_STATE_CHANNEL, current);
    return true;
  }
  return Object.freeze({ snapshot, update, publishTo });
}
