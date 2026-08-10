import assert from "node:assert/strict";
import test from "node:test";
import { toPublicNetworkState } from "../src/network/public-network-state.mjs";

test("publishes only the fixed network status enum", () => {
  for (const status of ["idle", "connecting", "online", "offline", "suspended", "reauthorization_required", "fatal"]) {
    const value = toPublicNetworkState({ status, token: "secret", endpoint: "https://secret.example", reason: "private" });
    assert.deepEqual(value, { status }); assert.equal(Object.isFrozen(value), true);
  }
  assert.deepEqual(toPublicNetworkState({ status: "unknown" }), { status: "fatal" });
});
