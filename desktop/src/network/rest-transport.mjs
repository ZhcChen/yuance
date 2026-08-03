import { createOperationRegistry } from "./operation-registry.mjs";
import { parseJsonResponse, ResponseContractError } from "./response-contract.mjs";
import { createProfileKey } from "../auth/profile.mjs";
import { isTrustedSessionFetch } from "./network-session.mjs";

export function createRestTransport({ profile, credentialRuntime, fetchImpl, registry = createOperationRegistry(), timeoutMs = 15_000, maxResponseBytes = 256 * 1024 } = {}) {
  validateProfile(profile);
  if (!credentialRuntime || typeof credentialRuntime.withAccessLease !== "function" || typeof credentialRuntime.refreshAccess !== "function") throw new TypeError("credentialRuntime is required");
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl is required");
  if (!isTrustedSessionFetch(fetchImpl)) throw new TypeError("trusted Electron session fetch is required");
  async function execute(name, input) {
    const operation = registry.resolve(name, input);
    const first = await executeOnce(operation, true);
    if (!first.expired) return first.value;
    const refreshed = await credentialRuntime.refreshAccess(first.epoch);
    if (!refreshed) throw new ResponseContractError("stale_network_epoch", "Network lease is stale");
    return (await executeOnce(operation, false)).value;
  }
  function executeOnce(operation, allowExpiryRetry) {
    return credentialRuntime.withAccessLease(async ({ accessToken, epoch }) => {
      const url = `${profile.origin}${operation.path}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        let response;
        try {
          response = await fetchImpl(url, { method: operation.method, redirect: "manual", credentials: "omit", cache: "no-store", signal: controller.signal,
            headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}`, "Cache-Control": "no-store" } });
        } catch {
          if (controller.signal.aborted) throw new ResponseContractError("request_timeout", "Request timed out");
          throw new ResponseContractError("network_error", "Request failed");
        }
        try {
          const data = await parseJsonResponse(response, { expectedUrl: url, maxResponseBytes, signal: controller.signal, allowEmptyUrl: true, dataKind: operation.dataKind });
          try { return Object.freeze({ expired: false, value: operation.parse(data, profile) }); }
          catch { throw new ResponseContractError("invalid_response", "Response data is invalid"); }
        } catch (error) {
          if (controller.signal.aborted) throw new ResponseContractError("request_timeout", "Request timed out");
          if (allowExpiryRetry && operation.idempotent && error instanceof ResponseContractError &&
            error.code === "device_access_expired" && error.status === 401) {
            return Object.freeze({ expired: true, epoch });
          }
          if (error instanceof ResponseContractError) throw error;
          throw new ResponseContractError("response_read_failed", "Response could not be processed");
        }
      } finally { clearTimeout(timeout); }
    });
  }
  return Object.freeze({ execute });
}

function validateProfile(profile) {
  if (!profile || !Object.isFrozen(profile) || profile.version !== 1 || typeof profile.key !== "string") {
    throw new TypeError("trusted profile is required");
  }
  if (createProfileKey(profile) !== profile.key) throw new TypeError("trusted profile is invalid");
}
