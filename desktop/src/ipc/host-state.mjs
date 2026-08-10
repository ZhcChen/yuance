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

const PUBLIC_LOCKED_REASONS = new Set(["profile_mismatch"]);

export function normalizePublicHostState(value) {
  const status = value && typeof value === "object" ? value.status : undefined;
  if (!PUBLIC_STATES.has(status)) return Object.freeze({ status: "fatal" });
  const reason = value && typeof value === "object" ? value.reason : undefined;
  return Object.freeze(
    status === "locked" && PUBLIC_LOCKED_REASONS.has(reason) ? { status, reason } : { status },
  );
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
