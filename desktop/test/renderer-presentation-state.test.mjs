import assert from "node:assert/strict";
import test from "node:test";

import {
  createDesktopPresentationState,
  reduceDesktopPresentationState,
} from "../src/renderer/platform/presentation-state.js";

const auth = (status) => Object.freeze({ status });
const network = (status) => Object.freeze({ status });

test("keeps unresolved startup hidden until authentication becomes presentable", () => {
  let state = createDesktopPresentationState({ authState: auth("starting"), networkState: network("idle") });
  assert.deepEqual(summary(state), ["bootstrap", false, "starting", "idle"]);

  state = reduceDesktopPresentationState(state, { networkState: network("connecting") });
  assert.deepEqual(summary(state), ["bootstrap", false, "starting", "connecting"]);

  state = reduceDesktopPresentationState(state, { authState: auth("authenticated") });
  assert.deepEqual(summary(state), ["bootstrap", true, "authenticated", "connecting"]);
});

test("moves an unauthenticated device directly to authorization", () => {
  let state = createDesktopPresentationState({ authState: auth("starting"), networkState: network("idle") });
  state = reduceDesktopPresentationState(state, { authState: auth("unauthenticated") });
  assert.deepEqual(summary(state), ["authorization", true, "unauthenticated", "idle"]);
  state = reduceDesktopPresentationState(state, { authState: auth("authorizing") });
  assert.deepEqual(summary(state), ["authorization", true, "authorizing", "idle"]);
});

test("enters workspace once and preserves it through transient network states", () => {
  let state = createDesktopPresentationState({ authState: auth("authenticated"), networkState: network("connecting") });
  assert.deepEqual(summary(state), ["bootstrap", true, "authenticated", "connecting"]);
  state = reduceDesktopPresentationState(state, { networkState: network("online") });
  assert.deepEqual(summary(state), ["workspace", true, "authenticated", "online"]);

  for (const status of ["offline", "connecting", "idle", "suspended", "online"]) {
    state = reduceDesktopPresentationState(state, { networkState: network(status) });
    assert.equal(state.stage, "workspace", status);
    assert.equal(state.presentable, true, status);
  }
});

test("routes initial failures and terminal session states to recovery", () => {
  for (const networkStatus of ["offline", "reauthorization_required", "fatal"]) {
    const state = createDesktopPresentationState({ authState: auth("authenticated"), networkState: network(networkStatus) });
    assert.deepEqual(summary(state), ["recovery", true, "authenticated", networkStatus]);
  }
  for (const authStatus of ["locked", "reauthorization_required", "fatal"]) {
    const state = createDesktopPresentationState({ authState: auth(authStatus), networkState: network("online") });
    assert.deepEqual(summary(state), ["recovery", true, authStatus, "online"]);
  }
});

test("leaves workspace only for terminal auth or network states", () => {
  let state = createDesktopPresentationState({ authState: auth("authenticated"), networkState: network("online") });
  state = reduceDesktopPresentationState(state, { networkState: network("reauthorization_required") });
  assert.equal(state.stage, "recovery");

  state = createDesktopPresentationState({ authState: auth("authenticated"), networkState: network("online") });
  state = reduceDesktopPresentationState(state, { authState: auth("unauthenticated") });
  assert.equal(state.stage, "authorization");
});

test("coalesces duplicate and stale-equivalent updates", () => {
  const state = createDesktopPresentationState({ authState: auth("authenticated"), networkState: network("online") });
  assert.equal(reduceDesktopPresentationState(state, {}), state);
  assert.equal(reduceDesktopPresentationState(state, { authState: state.authState }), state);
  assert.equal(reduceDesktopPresentationState(state, { networkState: network("online") }), state);
});

function summary(state) {
  return [state.stage, state.presentable, state.authState.status, state.networkState.status];
}
