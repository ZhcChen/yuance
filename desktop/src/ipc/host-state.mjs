export const HOST_STATE_CHANNEL = "yuance:host-state";
export const HOST_BRIDGE_SCHEMA_VERSION = 1;

const PUBLIC_STATES = new Set([
  "starting",
  "unauthenticated",
  "authorizing",
  "authenticated",
  "locked",
  "reauthorization_required",
  "fatal",
]);

export function normalizePublicHostState(value) {
  const status = value && typeof value === "object" ? value.status : undefined;
  return Object.freeze({ status: PUBLIC_STATES.has(status) ? status : "fatal" });
}

export function createHostStatePublisher({ getSnapshot = () => ({ status: "starting" }) } = {}) {
  let current = normalizePublicHostState(getSnapshot());

  function snapshot() {
    return current;
  }

  function update(value) {
    current = normalizePublicHostState(value);
    return current;
  }

  function publishTo(window) {
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return false;
    window.webContents.send(HOST_STATE_CHANNEL, current);
    return true;
  }

  return Object.freeze({ snapshot, update, publishTo });
}
