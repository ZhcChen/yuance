const OPERATION_NAME = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){1,3}$/u;
const ACTIVE_OPERATION_NAMES = new Set(["file.upload", "file.download"]);
const MAX_ACTIVE_OPERATIONS = 4;
const PROBE_KEYS = [
  "access_expires_at", "authorization_version", "device_id", "display_name", "family_id",
  "generation", "server_instance_id", "user_id", "username",
];

export function createOperationRegistry({ maxActiveOperations = MAX_ACTIVE_OPERATIONS } = {}) {
  if (!Number.isSafeInteger(maxActiveOperations) || maxActiveOperations < 1 || maxActiveOperations > MAX_ACTIVE_OPERATIONS) throw new TypeError("maxActiveOperations exceeds the fixed safety limit");
  const operations = new Map([
    ["session.probe", Object.freeze({ idempotent: true, method: "GET", path: "/api/v1/device-session", parse: parseSessionProbe })],
    ["file.canaryupload", Object.freeze({ idempotent: false, method: "POST", path: "/api/v1/device-file-transfer/canary/upload-request", parse: parseTransferEnvelope })],
    ["file.canarydownload", Object.freeze({ idempotent: true, method: "GET", path: "/api/v1/device-file-transfer/canary/download-request", parse: parseTransferEnvelope })],
  ]);
  const active = new Set();
  function resolve(name, input) {
    if (typeof name !== "string" || !OPERATION_NAME.test(name) || !operations.has(name)) throw new TypeError("unknown operation");
    if (!isPlainObject(input) || Object.keys(input).length !== 0) throw new TypeError("operation input must be an empty object");
    return operations.get(name);
  }
  function begin(name, controller) {
    if (!ACTIVE_OPERATION_NAMES.has(name) || !(controller instanceof AbortController)) throw new TypeError("active operation is invalid");
    if (active.size >= maxActiveOperations) throw Object.assign(new Error("Active operation quota exceeded"), { code: "file_transfer_concurrency_limit" });
    const entry = Object.freeze({ name, controller });
    active.add(entry);
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      active.delete(entry);
    };
  }
  function abortAll() {
    for (const entry of active) entry.controller.abort();
  }
  return Object.freeze({ resolve, begin, abortAll, snapshot: () => Object.freeze({ active: active.size }) });
}

function parseSessionProbe(data, profile) {
  if (!isPlainObject(data) || !sameKeys(data, PROBE_KEYS) || data.server_instance_id !== profile.serverInstanceId) {
    throw new TypeError("session probe identity is invalid");
  }
  return Object.freeze({
    userId: integer(data.user_id, 1, "user_id"),
    username: requiredString(data.username, "username"), displayName: requiredString(data.display_name, "display_name"),
    deviceId: requiredString(data.device_id, "device_id"), familyId: requiredString(data.family_id, "family_id"),
    generation: integer(data.generation, 0, "generation"), authorizationVersion: integer(data.authorization_version, 1, "authorization_version"),
    accessExpiresAt: timestamp(data.access_expires_at, "access_expires_at"),
  });
}
function parseTransferEnvelope(data) { if (!isPlainObject(data)) throw new TypeError("transfer envelope is invalid"); return data; }
function requiredString(value, name) { if (typeof value !== "string" || value.length === 0 || value.length > 1024) throw new TypeError(`${name} is invalid`); return value; }
function integer(value, minimum, name) { if (!Number.isSafeInteger(value) || value < minimum) throw new TypeError(`${name} is invalid`); return value; }
function timestamp(value, name) { const parsed = Date.parse(value); if (typeof value !== "string" || !Number.isFinite(parsed)) throw new TypeError(`${name} is invalid`); return new Date(parsed).toISOString(); }
function isPlainObject(value) { return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype; }
function sameKeys(value, expected) { const keys = Object.keys(value).sort(); return keys.length === expected.length && keys.every((key, index) => key === expected[index]); }
