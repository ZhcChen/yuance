import { createDesktopProfile, canonicalizeServerOrigin } from "../auth/profile.mjs";
import { isTrustedSessionFetch } from "./network-session.mjs";

const ENROLLMENT_PATH = "/.well-known/yuance-desktop";
const JSON_CONTENT_TYPE = /^application\/json(?:\s*;|$)/iu;
const EXPECTED_FIELDS = Object.freeze([
  "api_protocol_version",
  "capabilities",
  "schema_version",
  "server_instance_id",
]);
const EXPECTED_CAPABILITIES = Object.freeze([
  "device-authorization.v1",
  "device-session.probe.v1",
]);

export class DesktopEnrollmentError extends Error {
  constructor(code, message, { status } = {}) {
    super(message);
    this.name = "DesktopEnrollmentError";
    this.code = code;
    this.status = status;
  }
}

export async function enrollDesktop({
  origin,
  mode,
  fetchImpl,
  expectedServerInstanceId,
  timeoutMs = 10_000,
  maxResponseBytes = 64 * 1024,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl is required");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new TypeError("timeoutMs is invalid");
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) {
    throw new TypeError("maxResponseBytes is invalid");
  }
  const normalizedOrigin = canonicalizeServerOrigin(origin, {
    mode,
    allowLoopbackHttp: mode === "development",
  });
  const url = `${normalizedOrigin}${ENROLLMENT_PATH}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    clearTimeout(timeout);
    if (controller.signal.aborted) {
      throw new DesktopEnrollmentError("request_timeout", "Desktop enrollment timed out");
    }
    throw new DesktopEnrollmentError("network_error", "Desktop enrollment request failed");
  }

  try {
    if (response.redirected || (response.status >= 300 && response.status < 400)) {
      throw new DesktopEnrollmentError(
        "redirect_not_allowed",
        "Desktop enrollment redirects are not allowed",
        { status: response.status },
      );
    }
    if (response.url !== url && !(response.url === "" && isTrustedSessionFetch(fetchImpl))) {
      throw new DesktopEnrollmentError(
        "response_url_mismatch",
        "Desktop enrollment response URL changed",
      );
    }
    if (!response.ok) {
      throw new DesktopEnrollmentError("http_error", "Desktop enrollment request failed", {
        status: response.status,
      });
    }
    const contentType = response.headers.get("content-type") || "";
    if (!JSON_CONTENT_TYPE.test(contentType)) {
      throw new DesktopEnrollmentError(
        "invalid_content_type",
        "Desktop enrollment response must be JSON",
        { status: response.status },
      );
    }
    const payload = await readJson(response, maxResponseBytes, controller.signal);
    validateEnrollment(payload, expectedServerInstanceId);
    const profile = createDesktopProfile({
      endpoint: normalizedOrigin,
      serverInstanceId: payload.server_instance_id,
      mode,
      allowLoopbackHttp: mode === "development",
    });
    return Object.freeze({
      profile,
      capabilities: Object.freeze([...payload.capabilities]),
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new DesktopEnrollmentError("request_timeout", "Desktop enrollment response timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(response, maxResponseBytes, signal) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
    throw new DesktopEnrollmentError("response_too_large", "Desktop enrollment response is too large");
  }
  const reader = response.body?.getReader();
  const chunks = [];
  let length = 0;
  while (reader) {
    if (signal.aborted) throw signal.reason ?? new Error("aborted");
    const { done, value } = await abortableRead(reader, signal);
    if (done) break;
    length += value.byteLength;
    if (length > maxResponseBytes) {
      await reader.cancel().catch(() => {});
      throw new DesktopEnrollmentError("response_too_large", "Desktop enrollment response is too large");
    }
    chunks.push(value);
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
    throw new DesktopEnrollmentError("invalid_json", "Desktop enrollment response is invalid JSON");
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

function validateEnrollment(payload, expectedServerInstanceId) {
  if (!isPlainObject(payload)) invalidContract();
  const fields = Object.keys(payload).sort();
  if (fields.length !== EXPECTED_FIELDS.length || fields.some((field, index) => field !== EXPECTED_FIELDS[index])) {
    invalidContract();
  }
  if (payload.schema_version !== 1 || payload.api_protocol_version !== 1) invalidContract();
  if (
    typeof payload.server_instance_id !== "string" ||
    payload.server_instance_id.length === 0 ||
    payload.server_instance_id.trim() !== payload.server_instance_id ||
    /[\u0000-\u001f\u007f]/u.test(payload.server_instance_id)
  ) {
    invalidContract();
  }
  if (
    !Array.isArray(payload.capabilities) ||
    payload.capabilities.length !== EXPECTED_CAPABILITIES.length ||
    payload.capabilities.some((value, index) => value !== EXPECTED_CAPABILITIES[index])
  ) {
    invalidContract();
  }
  if (
    expectedServerInstanceId !== undefined &&
    payload.server_instance_id !== expectedServerInstanceId
  ) {
    throw new DesktopEnrollmentError(
      "server_instance_mismatch",
      "Desktop enrollment server identity changed",
    );
  }
}

function invalidContract() {
  throw new DesktopEnrollmentError("invalid_contract", "Desktop enrollment contract is invalid");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
