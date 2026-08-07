import { randomBytes as nodeRandomBytes } from "node:crypto";

const MAX_ENTRIES = 8;
const MAX_TTL_MS = 60_000;
const BINDING_KEYS = ["authorizationVersion", "frameRoutingId", "profileEpoch", "webContentsId"];

export function createPreviewCapabilityVault({ now = Date.now, randomBytes = nodeRandomBytes, ttlMs = MAX_TTL_MS } = {}) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > MAX_TTL_MS) throw new TypeError("preview ttl exceeds the fixed safety limit");
  const entries = new Map();
  let cleanup = Promise.resolve();

  function issue(snapshot, binding) {
    validateSnapshot(snapshot);
    validateBinding(binding);
    pruneExpired();
    if (entries.size >= MAX_ENTRIES) throw previewError("preview_capability_quota");
    const entropy = randomBytes(24);
    if (!Buffer.isBuffer(entropy) || entropy.length !== 24) throw new TypeError("randomBytes must return 24 bytes");
    const capability = `ypv_${entropy.toString("base64url")}`;
    if (entries.has(capability)) throw previewError("preview_capability_quota");
    entries.set(capability, Object.freeze({ snapshot, binding: Object.freeze({ ...binding }), expiresAt: now() + ttlMs }));
    return Object.freeze({ capability, source: `app://yuance/.preview/${capability}`, contentType: snapshot.contentType, byteSize: snapshot.byteSize });
  }

  function resolve(capability, binding) {
    validateBinding(binding);
    const entry = entries.get(capability);
    if (!entry || entry.expiresAt <= now() || !sameBinding(entry.binding, binding)) {
      if (entry) remove(capability, entry);
      throw previewError("preview_capability_invalid");
    }
    return entry.snapshot;
  }

  function release(capability) {
    const entry = entries.get(capability);
    if (entry) remove(capability, entry);
  }

  function pruneExpired() {
    const current = now();
    for (const [capability, entry] of entries) if (entry.expiresAt <= current) remove(capability, entry);
  }

  async function invalidateAll() {
    for (const [capability, entry] of entries) remove(capability, entry);
    await cleanup;
  }

  function remove(capability, entry) {
    entries.delete(capability);
    cleanup = cleanup.then(() => entry.snapshot.remove()).catch(() => {});
  }

  return Object.freeze({ issue, resolve, release, pruneExpired, invalidateAll, snapshot: () => Object.freeze({ entries: entries.size }) });
}

function validateSnapshot(value) {
  if (!value || !Object.isFrozen(value) || !sameKeys(value, ["byteSize", "contentType", "privatePath", "remove"]) || typeof value.privatePath !== "string" || typeof value.contentType !== "string" || !Number.isSafeInteger(value.byteSize) || value.byteSize < 0 || typeof value.remove !== "function") throw new TypeError("preview snapshot is invalid");
}
function validateBinding(value) {
  if (!value || !sameKeys(value, BINDING_KEYS) || !Object.values(value).every((entry) => Number.isSafeInteger(entry) && entry >= 0) || value.authorizationVersion < 1) throw new TypeError("preview binding is invalid");
}
function sameBinding(left, right) { return BINDING_KEYS.every((key) => left[key] === right[key]); }
function sameKeys(value, expected) { const keys = Object.keys(value).sort(); return keys.length === expected.length && keys.every((key, index) => key === expected[index]); }
function previewError(code) { return Object.assign(new Error("Preview capability is invalid"), { code }); }
