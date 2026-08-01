const NETWORK_PARTITIONS = Object.freeze({
  production: "persist:yuance-network-production-v1",
  development: "persist:yuance-network-development-v1",
});
const TRUSTED_SESSION_FETCH = Symbol("yuance.trusted-session-fetch");

export function networkPartitionForMode(mode) {
  const partition = NETWORK_PARTITIONS[mode];
  if (!partition) throw new TypeError("network session mode must be production or development");
  return partition;
}

export async function createTrustedNetworkSession({
  electronSession,
  mode,
  allowedOrigin,
  testObserver,
} = {}) {
  if (!electronSession || typeof electronSession.fromPartition !== "function") {
    throw new TypeError("electronSession.fromPartition is required");
  }
  if (testObserver !== undefined && typeof testObserver !== "function") {
    throw new TypeError("testObserver must be a function");
  }
  const parsedAllowedOrigin = parseNetworkUrl(allowedOrigin, "allowedOrigin must be a canonical origin");
  if (
    parsedAllowedOrigin.origin !== allowedOrigin ||
    parsedAllowedOrigin.pathname !== "/" ||
    parsedAllowedOrigin.search ||
    parsedAllowedOrigin.hash ||
    parsedAllowedOrigin.username ||
    parsedAllowedOrigin.password
  ) {
    throw new TypeError("allowedOrigin must be a canonical origin");
  }

  const partition = networkPartitionForMode(mode);
  const chromiumSession = electronSession.fromPartition(partition, { cache: false });
  for (const method of ["clearStorageData", "clearCache", "clearAuthCache", "fetch"]) {
    if (typeof chromiumSession?.[method] !== "function") {
      throw new TypeError(`Electron session.${method} is required`);
    }
  }

  await chromiumSession.clearStorageData({ storages: ["cookies"] });
  await chromiumSession.clearCache();
  await chromiumSession.clearAuthCache();

  async function fetchWithChromium(url, options = {}) {
    validateRequest(url, options, allowedOrigin);
    const response = await chromiumSession.fetch(url, options);
    if (testObserver) {
      const parsed = new URL(url);
      testObserver(Object.freeze({
        method: String(options.method || "GET").toUpperCase(),
        path: parsed.pathname,
        status: response.status,
      }));
    }
    return response;
  }
  Object.defineProperty(fetchWithChromium, TRUSTED_SESSION_FETCH, { value: true });

  return Object.freeze({
    partition,
    fetch: fetchWithChromium,
  });
}

function validateRequest(url, options, allowedOrigin) {
  const parsed = parseNetworkUrl(url, "trusted network request URL is invalid");
  if (parsed.origin !== allowedOrigin || parsed.username || parsed.password) {
    throw new TypeError("trusted network request must use the allowed origin");
  }
  if (options.redirect !== "manual") {
    throw new TypeError("trusted network request must disable redirects");
  }
  if (options.credentials !== "omit") {
    throw new TypeError("trusted network request must omit ambient credentials");
  }
  if (options.cache !== "no-store") {
    throw new TypeError("trusted network request must disable caching");
  }
  const headers = new Headers(options.headers);
  for (const name of ["cookie", "origin", "referer"]) {
    if (headers.has(name)) throw new TypeError(`trusted network request must not set ${name}`);
  }
}

function parseNetworkUrl(value, message) {
  try {
    return new URL(value);
  } catch {
    throw new TypeError(message);
  }
}

export function isTrustedSessionFetch(value) {
  return typeof value === "function" && value[TRUSTED_SESSION_FETCH] === true;
}
