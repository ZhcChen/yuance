import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";

import { approveDeviceAuthorization } from "./support/browser-approval-driver.mjs";
import { buildRealApi, startRealApiFixture } from "./support/real-api-fixture.mjs";

test("real API completes authorization, REST, SSE, and revoke-close flow", { timeout: 60_000 }, async (t) => {
  await buildRealApi();
  const fixture = await startRealApiFixture();
  t.after(() => fixture.stop());
  const session = await fixture.bootstrapAdmin();
  const verifier = "a".repeat(43);
  const started = await jsonRequest(`${fixture.origin}/api/v1/device-authorizations`, {
    method: "POST",
    body: {
      installation_id: randomUUID(), device_name: "Network Integration", platform: process.platform,
      client_version: "0.1.0", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
    },
  });
  await approveDeviceAuthorization({ origin: fixture.origin, userCode: started.user_code, session });
  await new Promise((resolve) => setTimeout(resolve, started.interval * 1_000));
  const credentials = await jsonRequest(`${fixture.origin}/api/v1/device-authorizations/exchange`, {
    method: "POST",
    body: { device_code: started.device_code, code_verifier: verifier, exchange_transaction_id: randomUUID() },
  });
  const headers = { Authorization: `Bearer ${credentials.access_token}` };
  const probe = await jsonRequest(`${fixture.origin}/api/v1/device-session`, { headers });
  assert.equal(probe.server_instance_id, fixture.serverInstanceId);

  const controller = new AbortController();
  const stream = await fetch(`${fixture.origin}/api/v1/device-session/events`, { headers, signal: controller.signal });
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /event: connected/);
  const startedAt = performance.now();
  const logout = await fetch(`${fixture.origin}/api/v1/device-session/logout`, { method: "POST", headers });
  assert.equal(logout.status, 200);
  await waitForEof(reader);
  assert.ok(performance.now() - startedAt < 5_000);
  controller.abort();
});

async function jsonRequest(url, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(url, { method, redirect: "manual", headers: { ...headers, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const value = await response.json();
  if (!response.ok) throw new Error(`request failed with ${response.status}: ${value.error?.code}`);
  return value.data;
}

async function waitForEof(reader) {
  const deadline = AbortSignal.timeout(5_000);
  while (!deadline.aborted) {
    const result = await Promise.race([reader.read(), new Promise((_resolve, reject) => deadline.addEventListener("abort", () => reject(new Error("SSE EOF timeout")), { once: true }))]);
    if (result.done) return;
  }
  throw new Error("SSE EOF timeout");
}
