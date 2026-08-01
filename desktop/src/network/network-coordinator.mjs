import { toPublicNetworkState } from "./public-network-state.mjs";

const SECURITY_CODES = new Set([
  "device_revoked", "family_revoked", "user_inactive", "server_instance_mismatch",
  "credential_binding_mismatch", "invalid_control_event", "invalid_utf8", "invalid_stream",
]);

export function createNetworkCoordinator({
  credentialRuntime,
  sseClient,
  probe,
  onState = () => {},
  now = Date.now,
  random = Math.random,
  sleep = delay,
  minRetryMs = 1_000,
  maxRetryMs = 30_000,
  expirySkewMs = 30_000,
} = {}) {
  if (!credentialRuntime || typeof credentialRuntime.withAccessLease !== "function" || typeof credentialRuntime.refreshAccess !== "function") throw new TypeError("credentialRuntime is required");
  if (!sseClient || typeof sseClient.subscribe !== "function") throw new TypeError("sseClient is required");
  if (typeof probe !== "function" || typeof onState !== "function") throw new TypeError("network observers are required");
  if (typeof sleep !== "function") throw new TypeError("sleep is required");
  for (const value of [minRetryMs, maxRetryMs, expirySkewMs]) if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("retry settings are invalid");
  if (minRetryMs < 1 || maxRetryMs < minRetryMs) throw new TypeError("retry range is invalid");

  let status = "idle";
  let generation = 0;
  let running;
  let controller;
  let suspended = false;
  const listeners = new Set();

  function publish(next) {
    status = next;
    const value = toPublicNetworkState({ status });
    try { onState(value); } catch {}
    for (const listener of listeners) { try { listener(value); } catch {} }
  }
  function snapshot() { return toPublicNetworkState({ status }); }
  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("listener is required");
    listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener);
  }
  function start() {
    if (running) return running;
    suspended = false;
    const current = ++generation;
    running = run(current).finally(() => { if (current === generation) running = undefined; });
    return running;
  }
  function invalidate() { generation += 1; controller?.abort(); controller = undefined; running = undefined; publish("idle"); }
  function suspend() { suspended = true; generation += 1; controller?.abort(); controller = undefined; running = undefined; publish("suspended"); }
  function resume() { if (!suspended) return running; suspended = false; return start(); }
  function stop() { invalidate(); listeners.clear(); }

  async function run(current) {
    let failures = 0;
    let retryHint;
    while (current === generation && !suspended) {
      controller = new AbortController();
      publish("connecting");
      try {
        const outcome = await credentialRuntime.withAccessLease(async ({ accessToken, accessExpiresAt, epoch }) => {
          const expiryDelay = Math.max(0, Date.parse(accessExpiresAt) - now() - expirySkewMs);
          const expiry = sleep(expiryDelay, controller.signal).then(() => ({ reason: "access_expiring", epoch }));
          const stream = sseClient.subscribe({
            accessToken,
            signal: controller.signal,
            onControl(value) { if (value.type === "connected" && current === generation) { failures = 0; publish("online"); } },
            onRetry(value) { if (Number.isSafeInteger(value)) retryHint = clamp(value, minRetryMs, maxRetryMs); },
          }).catch((error) => { if (controller.signal.aborted) return { reason: "cancelled" }; throw error; });
          try { return await Promise.race([stream, expiry]); }
          finally { controller.abort(); }
        });
        if (current !== generation || outcome.reason === "cancelled") return;
        if (outcome.reason === "access_expiring") {
          if (!await credentialRuntime.refreshAccess(outcome.epoch)) return;
          await probe();
          continue;
        }
        await probe();
      } catch (error) {
        if (current !== generation || controller.signal.aborted && error?.code === "stream_aborted") return;
        if (error?.code === "unauthorized") {
          try { await probe(); }
          catch (probeError) { error = probeError; }
        }
        if (SECURITY_CODES.has(error?.code) || error?.securityFailure === true) {
          publish("reauthorization_required"); return;
        }
      }
      if (current !== generation) return;
      publish("offline");
      failures += 1;
      const exponential = Math.min(maxRetryMs, minRetryMs * (2 ** Math.min(failures - 1, 10)));
      const base = retryHint === undefined ? exponential : clamp(retryHint, minRetryMs, maxRetryMs);
      retryHint = undefined;
      const wait = Math.max(minRetryMs, Math.floor(base * (0.5 + random() * 0.5)));
      controller = new AbortController();
      try { await sleep(wait, controller.signal); } catch { return; }
    }
  }

  return Object.freeze({ start, invalidate, suspend, resume, stop, snapshot, subscribe });
}

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function delay(ms, signal) {
  if (signal.aborted) return Promise.reject(new Error("aborted"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("aborted")); }, { once: true });
  });
}
