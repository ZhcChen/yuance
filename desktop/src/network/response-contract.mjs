const JSON_CONTENT_TYPE = /^application\/json(?:\s*;|$)/iu;
const ERROR_CODE = /^[a-z][a-z0-9_]{0,63}$/u;
const DATA_KINDS = new Set(["object", "array", "nullable-object"]);

export class ResponseContractError extends Error {
  constructor(code, message, { status } = {}) {
    super(message);
    this.name = "ResponseContractError";
    this.code = code;
    this.status = status;
  }
}

export async function parseJsonResponse(response, {
  expectedUrl,
  maxResponseBytes = 256 * 1024,
  signal = new AbortController().signal,
  errorFactory = defaultErrorFactory,
  allowEmptyUrl = false,
  dataKind = "object",
} = {}) {
  if (!response || typeof response.status !== "number") throw new TypeError("response is required");
  if (typeof expectedUrl !== "string" || expectedUrl.length === 0) throw new TypeError("expectedUrl is required");
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) throw new TypeError("maxResponseBytes is invalid");
  if (!DATA_KINDS.has(dataKind)) throw new TypeError("dataKind is invalid");
  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    throw errorFactory("redirect_not_allowed", "Response redirects are not allowed", { status: response.status });
  }
  if ((!response.url && !allowEmptyUrl) || (response.url && response.url !== expectedUrl)) {
    throw errorFactory("response_url_mismatch", "Response URL changed", { status: response.status });
  }
  if (!JSON_CONTENT_TYPE.test(response.headers.get("content-type") || "")) {
    throw errorFactory("invalid_content_type", "Response must be JSON", { status: response.status });
  }
  const parsed = await readBoundedJson(response, maxResponseBytes, signal, errorFactory);
  if (!response.ok) {
    if (!validErrorEnvelope(parsed)) throw errorFactory("invalid_error_response", "Error response envelope is invalid", { status: response.status });
    const code = parsed.error.code;
    throw errorFactory(code, "Request failed", { status: response.status, body: parsed, response });
  }
  if (!isPlainObject(parsed) || Object.keys(parsed).length !== 1 || !validDataRoot(parsed.data, dataKind)) {
    throw errorFactory("invalid_response", "Response envelope is invalid", { status: response.status });
  }
  return parsed.data;
}

function validDataRoot(value, dataKind) {
  if (dataKind === "array") return Array.isArray(value);
  if (dataKind === "nullable-object") return value === null || isPlainObject(value);
  return isPlainObject(value);
}

async function readBoundedJson(response, limit, signal, errorFactory) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw errorFactory("response_too_large", "Response is too large");
  const reader = response.body?.getReader();
  const chunks = [];
  let length = 0;
  while (reader) {
    if (signal.aborted) throw errorFactory("request_aborted", "Request was aborted");
    let result;
    try { result = await abortableRead(reader, signal, errorFactory); }
    catch {
      if (signal.aborted) throw errorFactory("request_aborted", "Request was aborted");
      throw errorFactory("response_read_failed", "Response body could not be read");
    }
    const { done, value } = result;
    if (signal.aborted) throw errorFactory("request_aborted", "Request was aborted");
    if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel().catch(() => {}); throw errorFactory("response_too_large", "Response is too large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw errorFactory("invalid_json", "Response is invalid JSON"); }
}

async function abortableRead(reader, signal, errorFactory) {
  let onAbort;
  const aborted = new Promise((_resolve, reject) => {
    onAbort = () => { reader.cancel().catch(() => {}); reject(errorFactory("request_aborted", "Request was aborted")); };
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([reader.read(), aborted]); }
  finally { signal.removeEventListener("abort", onAbort); }
}

function defaultErrorFactory(code, message, { status } = {}) { return new ResponseContractError(code, message, { status }); }
function isPlainObject(value) { return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype; }
function validErrorEnvelope(value) {
  if (!isPlainObject(value) || Object.keys(value).length !== 1 || !isPlainObject(value.error)) return false;
  const keys = Object.keys(value.error).sort();
  if (keys.some((key) => !["code", "message", "retry_after"].includes(key))) return false;
  return ERROR_CODE.test(value.error.code) && typeof value.error.message === "string" &&
    (value.error.retry_after === undefined || (Number.isSafeInteger(value.error.retry_after) && value.error.retry_after > 0));
}
