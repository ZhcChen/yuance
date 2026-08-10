import { randomBytes as nodeRandomBytes } from "node:crypto";

const MAX_ENTRIES = 32;
const MAX_TTL_MS = 60 * 1_000;
const BINDING_KEYS = ["authorizationVersion", "frameRoutingId", "profileEpoch", "purpose", "webContentsId"];
const CONTRACT_KEYS = ["contentType", "expectedBytes", "expiresAt", "headers", "method", "origin", "purpose", "sha256", "url", "version"];

export function createTransferGrantVault({
  now = Date.now,
  randomBytes = nodeRandomBytes,
  maxEntries = MAX_ENTRIES,
} = {}) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > MAX_ENTRIES) throw new TypeError("maxEntries exceeds the fixed safety limit");
  const entries = new Map();

  function issue(contract, binding) {
    validateContract(contract);
    validateBinding(binding);
    pruneExpired();
    const currentTime = now();
    const expiresAt = Math.min(contract.expiresAt, currentTime + MAX_TTL_MS);
    if (!Number.isFinite(currentTime) || !Number.isFinite(expiresAt) || expiresAt <= currentTime) throw grantError();
    if (entries.size >= maxEntries) throw Object.assign(new Error("Transfer grant quota exceeded"), { code: "file_transfer_grant_quota" });
    const entropy = randomBytes(24);
    if (!Buffer.isBuffer(entropy) || entropy.length !== 24) throw new TypeError("randomBytes must return 24 bytes");
    const grant = `ytg_${entropy.toString("base64url")}`;
    if (entries.has(grant)) throw Object.assign(new Error("Transfer grant quota exceeded"), { code: "file_transfer_grant_quota" });
    entries.set(grant, Object.freeze({ contract, binding: Object.freeze({ ...binding }), expiresAt }));
    return Object.freeze({ grant });
  }

  function consume(grant, binding) {
    validateBinding(binding);
    const entry = take(grant);
    if (!entry || entry.expiresAt <= now() || !sameBinding(entry.binding, binding) || entry.contract.purpose !== binding.purpose) throw grantError();
    return entry.contract;
  }

  function take(grant) {
    if (typeof grant !== "string" || !/^ytg_[A-Za-z0-9_-]{32}$/.test(grant)) return undefined;
    const entry = entries.get(grant);
    if (!entry) return undefined;
    entries.delete(grant);
    return entry;
  }

  function pruneExpired() {
    const currentTime = now();
    for (const [grant, entry] of entries) if (entry.expiresAt <= currentTime) entries.delete(grant);
  }

  function invalidateAll() { entries.clear(); }

  return Object.freeze({ issue, consume, pruneExpired, invalidateAll, snapshot: () => Object.freeze({ entries: entries.size }) });
}

function validateContract(value) {
  if (!value || !Object.isFrozen(value) || !sameKeys(value, CONTRACT_KEYS) || value.version !== 1 || !["upload", "download"].includes(value.purpose) || value.method !== (value.purpose === "upload" ? "PUT" : "GET") || typeof value.url !== "string" || typeof value.origin !== "string" || !Array.isArray(value.headers) || !Object.isFrozen(value.headers) || value.headers.some((entry) => !Object.isFrozen(entry)) || !Number.isSafeInteger(value.expectedBytes) || value.expectedBytes < 0 || typeof value.contentType !== "string" || !/^[0-9a-f]{64}$/.test(value.sha256) || !Number.isFinite(value.expiresAt)) throw new TypeError("Invalid transfer contract");
}
function validateBinding(value) {
  if (!value || !sameKeys(value, BINDING_KEYS) || !Number.isSafeInteger(value.profileEpoch) || value.profileEpoch < 0 || !Number.isSafeInteger(value.authorizationVersion) || value.authorizationVersion < 1 || !Number.isSafeInteger(value.webContentsId) || value.webContentsId < 0 || !Number.isSafeInteger(value.frameRoutingId) || value.frameRoutingId < 0 || !["upload", "download"].includes(value.purpose)) throw new TypeError("Invalid transfer grant binding");
}
function sameBinding(left, right) { return BINDING_KEYS.every((key) => left[key] === right[key]); }
function sameKeys(value, expected) { const keys = Object.keys(value).sort(); return keys.length === expected.length && keys.every((key, index) => key === expected[index]); }
function grantError() { return Object.assign(new Error("Transfer grant is invalid"), { code: "file_transfer_grant_invalid" }); }
