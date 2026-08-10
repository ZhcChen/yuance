export const BUSINESS_EXECUTE_CHANNEL = "yuance:business-execute";

const PUBLIC_ERROR_CODE = /^[a-z][a-z0-9_]{0,63}$/u;

export function registerBusinessCommandHandlers({ ipcMain, assertSender, execute } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== "function" || typeof ipcMain.removeHandler !== "function") throw new TypeError("ipcMain is required");
  if (typeof assertSender !== "function" || typeof execute !== "function") throw new TypeError("business command dependencies are required");

  ipcMain.handle(BUSINESS_EXECUTE_CHANNEL, async (event, payload) => {
    assertSender(event);
    try {
      const { operation, input } = parsePayload(payload);
      return Object.freeze({ ok: true, data: await execute(operation, input) });
    } catch (error) {
      return Object.freeze({ ok: false, error: normalizePublicError(error) });
    }
  });
  return () => ipcMain.removeHandler(BUSINESS_EXECUTE_CHANNEL);
}

function parsePayload(value) {
  if (!isPlainObject(value) || !sameKeys(value, ["input", "operation"]) || typeof value.operation !== "string" || !isPlainObject(value.input)) {
    throw Object.assign(new TypeError("business request is invalid"), { code: "invalid_request" });
  }
  return value;
}

function normalizePublicError(error) {
  const code = typeof error?.code === "string" && PUBLIC_ERROR_CODE.test(error.code) ? error.code : "business_unavailable";
  const status = Number.isSafeInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : undefined;
  return Object.freeze({ code, ...(status === undefined ? {} : { status }) });
}

function isPlainObject(value) { return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype; }
function sameKeys(value, expected) { const keys = Object.keys(value).sort(); return keys.length === expected.length && keys.every((key, index) => key === expected[index]); }
