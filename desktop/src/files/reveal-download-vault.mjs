import { randomBytes as nodeRandomBytes } from "node:crypto";

const MAX_ENTRIES = 16;
const MAX_TTL_MS = 60_000;
const BINDING_KEYS = ["authorizationVersion", "frameRoutingId", "profileEpoch", "purpose", "webContentsId"];

export function createRevealDownloadVault({ now = Date.now, randomBytes = nodeRandomBytes, ttlMs = MAX_TTL_MS } = {}) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > MAX_TTL_MS) throw new TypeError("reveal ttl exceeds the fixed safety limit");
  const entries = new Map();

  function issue(locator, binding) {
    validateLocator(locator);
    validateBinding(binding);
    pruneExpired();
    if (entries.size >= MAX_ENTRIES) throw revealError("file_reveal_quota");
    const entropy = randomBytes(24);
    if (!Buffer.isBuffer(entropy) || entropy.length !== 24) throw new TypeError("randomBytes must return 24 bytes");
    const capability = `yrd_${entropy.toString("base64url")}`;
    if (entries.has(capability)) throw revealError("file_reveal_quota");
    entries.set(capability, Object.freeze({ locator, binding: Object.freeze({ ...binding }), expiresAt: now() + ttlMs }));
    return Object.freeze({ capability });
  }

  function consume(capability, binding) {
    validateBinding(binding);
    const entry = take(capability);
    if (!entry || entry.expiresAt <= now() || !sameBinding(entry.binding, binding)) throw revealError("file_reveal_invalid");
    return entry.locator;
  }

  function take(capability) {
    if (typeof capability !== "string" || !/^yrd_[A-Za-z0-9_-]{32}$/u.test(capability)) return undefined;
    const entry = entries.get(capability);
    if (entry) entries.delete(capability);
    return entry;
  }

  function pruneExpired() {
    const current = now();
    for (const [capability, entry] of entries) if (entry.expiresAt <= current) entries.delete(capability);
  }

  function invalidateAll() { entries.clear(); }

  return Object.freeze({ issue, consume, pruneExpired, invalidateAll, snapshot: () => Object.freeze({ entries: entries.size }) });
}

function validateLocator(value) {
  if (!value || !Object.isFrozen(value) || !sameKeys(value, ["identity", "privatePath"]) || typeof value.privatePath !== "string" || !value.identity || !Object.isFrozen(value.identity) || !sameKeys(value.identity, ["ctimeNs", "dev", "ino", "mtimeNs", "size"]) || Object.values(value.identity).some((entry) => typeof entry !== "string")) throw new TypeError("reveal locator is invalid");
}
function validateBinding(value) {
  if (!value || !sameKeys(value, BINDING_KEYS) || value.purpose !== "reveal-download" || ![value.authorizationVersion, value.frameRoutingId, value.profileEpoch, value.webContentsId].every((entry) => Number.isSafeInteger(entry) && entry >= 0) || value.authorizationVersion < 1) throw new TypeError("reveal binding is invalid");
}
function sameBinding(left, right) { return BINDING_KEYS.every((key) => left[key] === right[key]); }
function sameKeys(value, expected) { const keys = Object.keys(value).sort(); return keys.length === expected.length && keys.every((key, index) => key === expected[index]); }
function revealError(code) { return Object.assign(new Error("Reveal download capability is invalid"), { code }); }
