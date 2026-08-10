import assert from "node:assert/strict";
import test from "node:test";

import {
  createHostStatePublisher,
  HOST_STATE_CHANNEL,
  normalizePublicHostState,
} from "../src/ipc/host-state.mjs";

test("host state normalization strips every non-public field and fails closed", () => {
  assert.deepEqual(normalizePublicHostState({ status: "authenticated", token: "secret", deviceId: "d-1" }), {
    status: "authenticated",
  });
  assert.deepEqual(normalizePublicHostState({ status: "locked", reason: "profile_mismatch" }), {
    status: "locked",
    reason: "profile_mismatch",
  });
  assert.deepEqual(normalizePublicHostState({ status: "locked", reason: "pending_revocation" }), {
    status: "locked",
  });
  assert.deepEqual(normalizePublicHostState({ status: "unknown" }), { status: "fatal" });
  assert.equal(Object.isFrozen(normalizePublicHostState({ status: "starting" })), true);
});

test("publisher sends only the latest normalized snapshot to a live window", () => {
  const sent = [];
  const window = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: (...args) => sent.push(args),
    },
  };
  const publisher = createHostStatePublisher();
  assert.deepEqual(publisher.snapshot(), { status: "starting" });
  publisher.update({ status: "authenticated", accessToken: "secret" });
  assert.equal(publisher.publishTo(window), true);
  assert.deepEqual(sent, [[HOST_STATE_CHANNEL, { status: "authenticated" }]]);
  assert.equal(publisher.publishTo({ ...window, isDestroyed: () => true }), false);
});
