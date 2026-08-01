import { createProfileKey } from "./profile.mjs";

const PATHS = Object.freeze({
  start: "/api/v1/device-authorizations",
  exchange: "/api/v1/device-authorizations/exchange",
  refresh: "/api/v1/device-sessions/refresh",
  probe: "/api/v1/device-session",
  logout: "/api/v1/device-session/logout",
});
const VERIFICATION_PATH = "/web/device-authorization";
const JSON_CONTENT_TYPE = /^application\/json(?:\s*;|$)/iu;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const SECURITY_ERROR_CODES = new Set([
  "device_revoked",
  "device_session_revoked",
  "user_inactive",
  "device_refresh_replay",
  "rotation_recovery_failed",
  "idempotency_expired",
]);

export class DeviceAuthProtocolError extends Error {
  constructor(code, message, { status, retryAfterSeconds, cause } = {}) {
    super(message, { cause });
    this.name = "DeviceAuthProtocolError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.securityFailure = SECURITY_ERROR_CODES.has(code);
  }
}

export function createDeviceAuthClient({
  profile,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
  maxResponseBytes = 256 * 1024,
  now = Date.now,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  validateProfile(profile);
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl is required");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new TypeError("timeoutMs is invalid");
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) {
    throw new TypeError("maxResponseBytes is invalid");
  }

  async function request(path, { method = "POST", body, accessToken } = {}) {
    if (!Object.values(PATHS).includes(path)) throw new TypeError("untrusted device auth path");
    if (accessToken !== undefined && !/^yuance_dat_[A-Za-z0-9_-]+$/u.test(accessToken)) {
      throw new DeviceAuthProtocolError("invalid_device_access", "Invalid device access token shape");
    }
    const url = `${profile.origin}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        redirect: "manual",
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-store",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(accessToken === undefined ? {} : { Authorization: `Bearer ${accessToken}` }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new DeviceAuthProtocolError("request_timeout", "Device auth request timed out", {
          cause: error,
        });
      }
      throw new DeviceAuthProtocolError("network_error", "Device auth request failed", { cause: error });
    }
    try {
      if (response.redirected || (response.status >= 300 && response.status < 400)) {
        throw new DeviceAuthProtocolError("redirect_not_allowed", "Device auth redirects are not allowed", {
          status: response.status,
        });
      }
      if (response.url && response.url !== url) {
        throw new DeviceAuthProtocolError("response_origin_mismatch", "Device auth response URL changed");
      }
      const contentType = response.headers.get("content-type") || "";
      if (!JSON_CONTENT_TYPE.test(contentType)) {
        throw new DeviceAuthProtocolError("invalid_content_type", "Device auth response must be JSON", {
          status: response.status,
        });
      }
      const parsed = await readJsonResponse(response, maxResponseBytes, controller.signal);
      if (!response.ok) throw responseError(response, parsed);
      if (!isPlainObject(parsed) || !isPlainObject(parsed.data)) {
        throw new DeviceAuthProtocolError("invalid_response", "Device auth response envelope is invalid");
      }
      return parsed.data;
    } catch (error) {
      if (controller.signal.aborted && !(error instanceof DeviceAuthProtocolError)) {
        throw new DeviceAuthProtocolError("request_timeout", "Device auth response timed out", { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function startAuthorization(input) {
    requireObject(input, "authorization input");
    const data = await request(PATHS.start, {
      body: {
        code_challenge: requireString(input.codeChallenge, "codeChallenge"),
        code_challenge_method: "S256",
        installation_id: requireString(input.installationId, "installationId"),
        device_name: requireString(input.deviceName, "deviceName"),
        platform: requireString(input.platform, "platform"),
        client_version: requireString(input.clientVersion, "clientVersion"),
      },
    });
    const serverInstanceId = requireString(data.server_instance_id, "server_instance_id");
    if (serverInstanceId !== profile.serverInstanceId) {
      throw new DeviceAuthProtocolError("server_instance_mismatch", "Device auth server identity changed");
    }
    if (data.verification_path !== VERIFICATION_PATH) {
      throw new DeviceAuthProtocolError("invalid_verification_path", "Untrusted verification path");
    }
    const expiresIn = requirePositiveInteger(data.expires_in, "expires_in");
    const intervalSeconds = requirePositiveInteger(data.interval, "interval");
    const userCode = requireString(data.user_code, "user_code");
    const verificationUrl = new URL(VERIFICATION_PATH, profile.origin);
    verificationUrl.searchParams.set("user_code", userCode);
    return Object.freeze({
      deviceCode: requireString(data.device_code, "device_code"),
      userCode,
      verificationUrl: verificationUrl.toString(),
      expiresAt: now() + expiresIn * 1_000,
      intervalSeconds,
      serverInstanceId,
    });
  }

  async function exchangeAuthorization({ deviceCode, codeVerifier, exchangeTransactionId }) {
    requireUuid(exchangeTransactionId, "exchangeTransactionId");
    const data = await request(PATHS.exchange, {
      body: {
        device_code: requireString(deviceCode, "deviceCode"),
        code_verifier: requireString(codeVerifier, "codeVerifier"),
        exchange_transaction_id: exchangeTransactionId,
      },
    });
    const credentials = normalizeCredentials(data, profile, now());
    if (credentials.generation !== 0) {
      throw new DeviceAuthProtocolError("invalid_initial_generation", "Initial credential generation must be zero");
    }
    return credentials;
  }

  async function pollAuthorization({
    deviceCode,
    codeVerifier,
    exchangeTransactionId,
    intervalSeconds,
    expiresAt,
  }) {
    let delaySeconds = requirePositiveInteger(intervalSeconds, "intervalSeconds");
    if (!Number.isFinite(expiresAt)) throw new TypeError("expiresAt is invalid");
    while (now() < expiresAt) {
      await sleep(Math.min(delaySeconds * 1_000, Math.max(0, expiresAt - now())));
      if (now() >= expiresAt) break;
      try {
        return await exchangeAuthorization({ deviceCode, codeVerifier, exchangeTransactionId });
      } catch (error) {
        if (!(error instanceof DeviceAuthProtocolError)) throw error;
        if (error.code !== "authorization_pending" && error.code !== "slow_down") throw error;
        delaySeconds = Math.max(delaySeconds, error.retryAfterSeconds ?? delaySeconds);
      }
    }
    throw new DeviceAuthProtocolError("authorization_expired", "Device authorization expired");
  }

  async function refresh({ refreshToken, generation, transactionId, deviceId }) {
    if (!/^yuance_drt_[A-Za-z0-9_-]+$/u.test(refreshToken)) {
      throw new DeviceAuthProtocolError("invalid_device_refresh", "Invalid device refresh token shape");
    }
    requireUuid(transactionId, "transactionId");
    const data = await request(PATHS.refresh, {
      body: {
        refresh_token: refreshToken,
        generation: requireNonNegativeInteger(generation, "generation"),
        transaction_id: transactionId,
        device_id: requireString(deviceId, "deviceId"),
        server_instance_id: profile.serverInstanceId,
      },
    });
    return normalizeCredentials(data, profile, now());
  }

  async function probe(accessToken) {
    const data = await request(PATHS.probe, { method: "GET", accessToken });
    if (data.server_instance_id !== profile.serverInstanceId) {
      throw new DeviceAuthProtocolError("server_instance_mismatch", "Device probe server identity changed");
    }
    return Object.freeze({
      userId: data.user_id,
      username: requireString(data.username, "username"),
      displayName: requireString(data.display_name, "display_name"),
      deviceId: requireString(data.device_id, "device_id"),
      familyId: requireString(data.family_id, "family_id"),
      generation: requireNonNegativeInteger(data.generation, "generation"),
      authorizationVersion: requirePositiveInteger(data.authorization_version, "authorization_version"),
      accessExpiresAt: requireTimestamp(data.access_expires_at, "access_expires_at"),
    });
  }

  async function logout(accessToken) {
    const data = await request(PATHS.logout, { accessToken });
    if (data.revoked !== true) {
      throw new DeviceAuthProtocolError("invalid_response", "Logout response did not confirm revocation");
    }
    return Object.freeze({ revoked: true, familyId: requireString(data.family_id, "family_id") });
  }

  return Object.freeze({ startAuthorization, exchangeAuthorization, pollAuthorization, refresh, probe, logout });
}

async function readJsonResponse(response, maxResponseBytes, signal) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
    throw new DeviceAuthProtocolError("response_too_large", "Device auth response is too large");
  }
  const chunks = [];
  let length = 0;
  const reader = response.body?.getReader();
  if (reader) {
    while (true) {
      if (signal.aborted) {
        await reader.cancel().catch(() => {});
        throw signal.reason ?? new Error("aborted");
      }
      const { done, value } = await abortableRead(reader, signal);
      if (signal.aborted) throw signal.reason ?? new Error("aborted");
      if (done) break;
      length += value.byteLength;
      if (length > maxResponseBytes) {
        await reader.cancel().catch(() => {});
        throw new DeviceAuthProtocolError("response_too_large", "Device auth response is too large");
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new DeviceAuthProtocolError("invalid_json", "Device auth response is invalid JSON", { cause: error });
  }
}

async function abortableRead(reader, signal) {
  if (signal.aborted) throw signal.reason ?? new Error("aborted");
  let onAbort;
  const aborted = new Promise((_resolve, reject) => {
    onAbort = () => {
      reader.cancel().catch(() => {});
      reject(signal.reason ?? new Error("aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([reader.read(), aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function responseError(response, body) {
  const error = isPlainObject(body?.error) ? body.error : {};
  const code = typeof error.code === "string" ? error.code : "device_auth_error";
  const bodyRetry = positiveIntegerOrUndefined(error.retry_after);
  const headerRetry = parseRetryAfter(response.headers.get("retry-after"));
  return new DeviceAuthProtocolError(code, typeof error.message === "string" ? error.message : "Device auth request failed", {
    status: response.status,
    retryAfterSeconds: Math.max(bodyRetry ?? 0, headerRetry ?? 0) || undefined,
  });
}

function normalizeCredentials(data, profile, issuedAt) {
  requireObject(data, "credential response");
  const access = validateMetadata(data.access, "yuance-api");
  const refresh = validateMetadata(data.refresh, "yuance-device-refresh");
  if (
    access.deviceId !== refresh.deviceId || access.familyId !== refresh.familyId ||
    access.generation !== refresh.generation || access.authorizationVersion !== refresh.authorizationVersion
  ) {
    throw new DeviceAuthProtocolError("credential_binding_mismatch", "Credential metadata bindings differ");
  }
  const accessToken = requireString(data.access_token, "access_token");
  const refreshToken = requireString(data.refresh_token, "refresh_token");
  if (!/^yuance_dat_[A-Za-z0-9_-]+$/u.test(accessToken)) {
    throw new DeviceAuthProtocolError("invalid_device_access", "Invalid access token namespace");
  }
  if (!/^yuance_drt_[A-Za-z0-9_-]+$/u.test(refreshToken)) {
    throw new DeviceAuthProtocolError("invalid_device_refresh", "Invalid refresh token namespace");
  }
  const accessExpiresIn = requirePositiveInteger(data.access_expires_in, "access_expires_in");
  const refreshExpiresIn = requirePositiveInteger(data.refresh_expires_in, "refresh_expires_in");
  return Object.freeze({
    accessToken,
    refreshToken,
    accessExpiresAt: new Date(issuedAt + accessExpiresIn * 1_000).toISOString(),
    refreshExpiresAt: new Date(issuedAt + refreshExpiresIn * 1_000).toISOString(),
    deviceId: access.deviceId,
    familyId: access.familyId,
    generation: access.generation,
    authorizationVersion: access.authorizationVersion,
    serverInstanceId: profile.serverInstanceId,
  });
}

function validateMetadata(value, audience) {
  requireObject(value, "credential metadata");
  if (value.token_type !== "Bearer" || value.issuer !== "yuance-device-session" || value.audience !== audience) {
    throw new DeviceAuthProtocolError("invalid_credential_metadata", "Credential metadata is invalid");
  }
  return {
    deviceId: requireString(value.device_id, "device_id"),
    familyId: requireString(value.family_id, "family_id"),
    generation: requireNonNegativeInteger(value.generation, "generation"),
    authorizationVersion: requirePositiveInteger(value.authorization_version, "authorization_version"),
  };
}

function validateProfile(profile) {
  if (
    !isPlainObject(profile) || !Object.isFrozen(profile) || profile.version !== 1 ||
    typeof profile.origin !== "string" || typeof profile.serverInstanceId !== "string" ||
    (profile.mode !== "production" && profile.mode !== "development") || typeof profile.key !== "string"
  ) {
    throw new TypeError("trusted profile is required");
  }
  const parsed = new URL(profile.origin);
  if (parsed.origin !== profile.origin || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new TypeError("profile origin must be canonical");
  }
  const expectedKey = createProfileKey({
    origin: profile.origin,
    serverInstanceId: profile.serverInstanceId,
    mode: profile.mode,
  });
  if (profile.key !== expectedKey) throw new TypeError("trusted profile key is invalid");
}

function parseRetryAfter(value) {
  if (value === null || !/^\d+$/u.test(value)) return undefined;
  return positiveIntegerOrUndefined(Number(value));
}

function positiveIntegerOrUndefined(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function requireObject(value, label) {
  if (!isPlainObject(value)) throw new DeviceAuthProtocolError("invalid_response", `Invalid ${label}`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new DeviceAuthProtocolError("invalid_response", `Invalid ${label}`);
  }
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new DeviceAuthProtocolError("invalid_response", `Invalid ${label}`);
  }
  return value;
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DeviceAuthProtocolError("invalid_response", `Invalid ${label}`);
  }
  return value;
}

function requireTimestamp(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new DeviceAuthProtocolError("invalid_response", `Invalid ${label}`);
  }
  return value;
}

function requireUuid(value, label) {
  if (typeof value !== "string" || !UUID.test(value)) throw new TypeError(`${label} must be a UUID`);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
