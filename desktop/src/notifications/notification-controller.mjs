const DEFAULT_DEDUPLICATION_TTL_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_DEDUPLICATION_ENTRIES = 500;

export function createNotificationController({
  execute,
  publishFact,
  isWindowFocused,
  isWindowMinimized,
  isNativeNotificationSupported,
  isNativeNotificationEnabled = () => true,
  showNativeNotification,
  now = Date.now,
  deduplicationTtlMs = DEFAULT_DEDUPLICATION_TTL_MS,
  maxDeduplicationEntries = DEFAULT_MAX_DEDUPLICATION_ENTRIES,
} = {}) {
  for (const dependency of [execute, publishFact, isWindowFocused, isWindowMinimized, isNativeNotificationSupported, isNativeNotificationEnabled, showNativeNotification, now]) {
    if (typeof dependency !== "function") throw new TypeError("notification controller dependency is required");
  }
  if (!Number.isSafeInteger(deduplicationTtlMs) || deduplicationTtlMs < 1) throw new TypeError("deduplicationTtlMs is invalid");
  if (!Number.isSafeInteger(maxDeduplicationEntries) || maxDeduplicationEntries < 1 || maxDeduplicationEntries > 10_000) throw new TypeError("maxDeduplicationEntries is invalid");

  let generation = 0;
  const delivered = new Map();

  function invalidate() {
    generation += 1;
    delivered.clear();
  }

  async function handleFact(value) {
    const fact = parseFact(value);
    if (!fact) return;
    const current = generation;
    if (fact.type === "release-version") {
      publishFact(Object.freeze({ schemaVersion: 1, type: fact.type, version: fact.version }));
      return;
    }

    publishFact(Object.freeze({ schemaVersion: 1, type: "topbar" }));
    let feed;
    try {
      feed = await execute("notification.list", { filter: "unread", limit: 100 });
    } catch {
      return;
    }
    if (current !== generation || !Array.isArray(feed?.items)) return;
    if (isWindowFocused() && !isWindowMinimized()) return;
    if (!isNativeNotificationSupported() || !isNativeNotificationEnabled()) return;

    pruneDelivered(now());
    for (const item of feed.items) {
      if (!isNotification(item)) continue;
      const key = `${fact.epoch}:${item.id}`;
      if (delivered.has(key)) continue;
      delivered.set(key, now() + deduplicationTtlMs);
      trimDelivered();
      try {
        showNativeNotification(Object.freeze({
          id: item.id,
          title: item.title,
          body: item.body,
          target: item.target,
          epoch: fact.epoch,
        }));
      } catch {}
    }
  }

  function pruneDelivered(timestamp) {
    for (const [key, expiry] of delivered) if (expiry <= timestamp) delivered.delete(key);
  }

  function trimDelivered() {
    while (delivered.size > maxDeduplicationEntries) delivered.delete(delivered.keys().next().value);
  }

  return Object.freeze({ handleFact, invalidate });
}

function parseFact(value) {
  if (!isPlainObject(value) || !Number.isSafeInteger(value.epoch) || value.epoch < 1) return null;
  if (value.type === "topbar" && (value.reason === "connected" || value.reason === "refresh") && sameKeys(value, ["epoch", "reason", "type"])) return value;
  if (value.type === "release-version" && typeof value.version === "string" && value.version.length > 0 && value.version.length <= 256 && sameKeys(value, ["epoch", "type", "version"])) return value;
  return null;
}

function isNotification(value) {
  return isPlainObject(value)
    && Number.isSafeInteger(value.id) && value.id >= 1
    && typeof value.title === "string" && value.title.length <= 4096
    && typeof value.body === "string" && value.body.length <= 128 * 1024
    && value.read === false;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function sameKeys(value, expected) {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}
