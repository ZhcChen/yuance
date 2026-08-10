import { randomBytes as nodeRandomBytes } from "node:crypto";

const MAX_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 16;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

export function createFileCapabilityVault({
  now = Date.now,
  randomBytes = nodeRandomBytes,
  ttlMs = MAX_TTL_MS,
  maxEntries = MAX_ENTRIES,
  maxTotalBytes = MAX_TOTAL_BYTES,
} = {}) {
  assertLimit(ttlMs, MAX_TTL_MS, "ttlMs");
  assertLimit(maxEntries, MAX_ENTRIES, "maxEntries");
  assertLimit(maxTotalBytes, MAX_TOTAL_BYTES, "maxTotalBytes");
  const entries = new Map();
  const cleanup = new Set();
  const failedCleanup = new Set();
  let totalBytes = 0;

  function issue(snapshot, binding) {
    validateSnapshot(snapshot);
    validateBinding(binding);
    pruneExpired();
    if (entries.size >= maxEntries || totalBytes + snapshot.byteSize > maxTotalBytes) {
      throw capabilityError("file_capability_quota", "File capability quota exceeded");
    }
    const entropy = randomBytes(24);
    if (!Buffer.isBuffer(entropy) || entropy.length !== 24) throw new TypeError("randomBytes must return 24 bytes");
    const capability = `yfc_${entropy.toString("base64url")}`;
    if (entries.has(capability)) throw capabilityError("file_capability_quota", "Capability collision");
    entries.set(capability, Object.freeze({ snapshot, binding: Object.freeze({ ...binding }), expiresAt: now() + ttlMs }));
    totalBytes += snapshot.byteSize;
    return Object.freeze({ capability, filename: snapshot.filename, contentType: snapshot.contentType, byteSize: snapshot.byteSize });
  }

  function consume(capability, binding) {
    validateConsumptionBinding(binding);
    const entry = take(capability);
    if (!entry || entry.expiresAt <= now() || !sameBinding(entry.binding, binding)) {
      if (entry) scheduleRemove(entry.snapshot);
      throw capabilityError("file_capability_invalid", "File capability is invalid");
    }
    return entry.snapshot;
  }

  function describe(capability, binding) {
    validateConsumptionBinding(binding);
    const entry = entries.get(capability);
    if (!entry || entry.expiresAt <= now() || !sameBinding(entry.binding, binding)) {
      const removed = take(capability);
      if (removed) scheduleRemove(removed.snapshot);
      throw capabilityError("file_capability_invalid", "File capability is invalid");
    }
    return Object.freeze({
      filename: entry.snapshot.filename,
      contentType: entry.snapshot.contentType,
      byteSize: entry.snapshot.byteSize,
      sha256: entry.snapshot.sha256,
    });
  }

  function take(capability) {
    if (typeof capability !== "string" || !/^yfc_[A-Za-z0-9_-]{32}$/.test(capability)) return undefined;
    const entry = entries.get(capability);
    if (!entry) return undefined;
    entries.delete(capability);
    totalBytes -= entry.snapshot.byteSize;
    return entry;
  }

  function pruneExpired() {
    for (const [capability, entry] of entries) {
      if (entry.expiresAt <= now()) {
        entries.delete(capability);
        totalBytes -= entry.snapshot.byteSize;
        scheduleRemove(entry.snapshot);
      }
    }
  }

  async function invalidateAll() {
    for (const entry of entries.values()) scheduleRemove(entry.snapshot);
    entries.clear();
    totalBytes = 0;
    await drainCleanup();
  }

  function scheduleRemove(snapshot) {
    const work = Promise.resolve()
      .then(() => snapshot.remove())
      .catch(() => failedCleanup.add(snapshot))
      .finally(() => cleanup.delete(work));
    cleanup.add(work);
  }
  async function drainCleanup() {
    await Promise.all([...cleanup]);
    const retry = [...failedCleanup];
    failedCleanup.clear();
    const results = await Promise.allSettled(retry.map((snapshot) => snapshot.remove()));
    results.forEach((result, index) => {
      if (result.status === "rejected") failedCleanup.add(retry[index]);
    });
    if (failedCleanup.size > 0) throw capabilityError("file_snapshot_cleanup_failed", "File snapshot cleanup failed");
  }

  return Object.freeze({ issue, describe, consume, invalidateAll, drainCleanup, pruneExpired, snapshot: () => Object.freeze({ entries: entries.size, totalBytes }) });
}

function sameBinding(left, right) {
  return ["profileEpoch", "webContentsId", "frameRoutingId", "purpose"].every((key) => left[key] === right[key]);
}
function validateBinding(value) {
  if (!value || !Number.isSafeInteger(value.profileEpoch) || !Number.isSafeInteger(value.webContentsId) || !Number.isSafeInteger(value.frameRoutingId) || value.purpose !== "upload") {
    throw new TypeError("Invalid file capability binding");
  }
}
function validateConsumptionBinding(value) {
  if (!value || !Number.isSafeInteger(value.profileEpoch) || !Number.isSafeInteger(value.webContentsId) || !Number.isSafeInteger(value.frameRoutingId) || typeof value.purpose !== "string") {
    throw new TypeError("Invalid file capability binding");
  }
}
function validateSnapshot(value) {
  if (!value || typeof value.privatePath !== "string" || typeof value.filename !== "string" || typeof value.contentType !== "string" || !Number.isSafeInteger(value.byteSize) || value.byteSize < 0 || !/^[0-9a-f]{64}$/.test(value.sha256) || typeof value.remove !== "function") {
    throw new TypeError("Invalid file snapshot");
  }
}
function capabilityError(code, message) { return Object.assign(new Error(message), { code }); }
function assertLimit(value, maximum, name) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) throw new TypeError(`${name} exceeds the fixed safety limit`);
}
