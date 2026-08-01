import assert from "node:assert/strict";
import test from "node:test";

import {
  bindCredentialCoordinatorState,
  toPublicAuthState,
} from "../src/auth/public-auth-state.mjs";

test("maps every coordinator state to a credential-free public state", () => {
  const cases = {
    unauthenticated: "unauthenticated",
    authorizing: "authorizing",
    authenticated: "authenticated",
    refreshing: "authenticated",
    locked: "locked",
    revoked: "reauthorization_required",
    error: "reauthorization_required",
    unknown: "fatal",
  };
  for (const [internal, expected] of Object.entries(cases)) {
    const result = toPublicAuthState({
      status: internal,
      reason: "secret_reason",
      accessToken: "secret",
      refreshToken: "secret",
      deviceId: "device-1",
      familyId: "family-1",
    });
    assert.deepEqual(result, { status: expected });
    assert.equal(Object.isFrozen(result), true);
  }
  assert.deepEqual(toPublicAuthState(null), { status: "fatal" });
});

test("binding forwards current and future state until disposal", () => {
  let listener;
  let unsubscribed = false;
  const coordinator = {
    subscribe(callback) {
      listener = callback;
      callback({ status: "unauthenticated" });
      return () => { unsubscribed = true; };
    },
  };
  const values = [];
  const dispose = bindCredentialCoordinatorState({ coordinator, onState: (value) => values.push(value) });
  listener({ status: "authenticated", token: "secret" });
  dispose();
  listener({ status: "revoked" });
  dispose();
  assert.deepEqual(values, [{ status: "unauthenticated" }, { status: "authenticated" }]);
  assert.equal(unsubscribed, true);
});
