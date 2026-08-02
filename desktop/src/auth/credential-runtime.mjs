import path from "node:path";

import { createProfileCredentialStore } from "./credential-store.mjs";
import {
  createCredentialCoordinator,
  createPendingAuthorizationStore,
  createPendingRevocationStore,
} from "./credential-coordinator.mjs";
import { createDeviceAuthClient } from "./device-auth-client.mjs";
import { toPublicAuthState } from "./public-auth-state.mjs";

const INVALIDATING_STATES = new Set(["unauthenticated", "locked", "revoked", "error"]);
const PROFILE_EVIDENCE = /^([a-f0-9]{64})(?:\.authorization)?\.enc\.json$/u;

export function createCredentialRuntime({
  profile,
  fetchImpl,
  safeStorage,
  fs,
  userDataPath,
  platform = process.platform,
  installationId,
  deviceName,
  clientVersion,
  onPublicState = () => {},
  onNetworkInvalidated = () => {},
  createClient = createDeviceAuthClient,
  createCoordinator = createCredentialCoordinator,
  createCredentialStore = createProfileCredentialStore,
  createAuthorizationStore = createPendingAuthorizationStore,
  createRevocationStore = createPendingRevocationStore,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl is required");
  if (!profile || typeof profile.key !== "string") throw new TypeError("profile is required");
  if (!fs || typeof fs.readdir !== "function") throw new TypeError("fs.readdir is required");
  if (typeof userDataPath !== "string" || userDataPath.length === 0) {
    throw new TypeError("userDataPath is required");
  }
  if (typeof onPublicState !== "function" || typeof onNetworkInvalidated !== "function") {
    throw new TypeError("runtime observers must be functions");
  }

  const credentialDirectory = path.join(userDataPath, "Device Credentials");
  const profileHash = profile.key.slice(profile.key.indexOf(":") + 1);
  const client = createClient({ profile, fetchImpl });
  const coordinator = createCoordinator({
    profile,
    credentialStore: createCredentialStore({
      safeStorage,
      fs,
      userDataPath,
      profile,
      platform,
    }),
    pendingAuthorizationStore: createAuthorizationStore({
      safeStorage,
      fs,
      filePath: path.join(credentialDirectory, `${profileHash}.authorization.enc.json`),
      profile,
      platform,
    }),
    pendingRevocationStore: createRevocationStore({
      fs,
      directory: path.join(credentialDirectory, "Pending Revocations"),
    }),
    client,
  });

  let epoch = 0;
  let disposed = false;
  let blockedReason;
  let mismatchedEvidence = [];

  function invalidateNetwork(status, reason = status) {
    epoch += 1;
    try {
      onNetworkInvalidated(Object.freeze({ epoch, status, reason }));
    } catch {
      // Cancellation observers cannot interrupt credential state transitions.
    }
  }

  function publishCoordinatorState(snapshot) {
    if (disposed) return;
    if (INVALIDATING_STATES.has(snapshot?.status)) {
      invalidateNetwork(snapshot.status, snapshot.reason);
    }
    try {
      onPublicState(toPublicAuthState(snapshot));
    } catch {
      // Renderer publication cannot interrupt credential state transitions.
    }
  }

  let unsubscribe = () => {};
  let subscribed = false;

  async function initialize() {
    requireActive();
    mismatchedEvidence = await findMismatchedProfileEvidence(fs, credentialDirectory, profileHash);
    requireActive();
    if (mismatchedEvidence.length > 0) {
      blockedReason = "profile_mismatch";
      invalidateNetwork("locked", blockedReason);
      const state = Object.freeze({ status: "locked" });
      onPublicState(state);
      return state;
    }
    const snapshot = await coordinator.initialize();
    requireActive();
    if (!subscribed) {
      unsubscribe = coordinator.subscribe(publishCoordinatorState);
      subscribed = true;
    }
    return toPublicAuthState(snapshot);
  }

  async function authorize({ openExternal, onUserCode } = {}) {
    requireUsable();
    if (typeof installationId !== "function") throw new TypeError("installationId is required");
    return coordinator.authorize({
      installationId: await installationId(),
      deviceName,
      platform,
      clientVersion,
      openExternal,
      onUserCode,
    });
  }

  async function withAccessLease(operation) {
    requireUsable();
    if (typeof operation !== "function") throw new TypeError("access lease operation is required");
    const leaseEpoch = epoch;
    const lease = typeof coordinator.getAccessLease === "function"
      ? await coordinator.getAccessLease()
      : Object.freeze({ token: await coordinator.getAccessToken(), expiresAt: undefined });
    if (leaseEpoch !== epoch) throw new Error("stale network epoch");
    const result = await operation(Object.freeze({
      accessToken: lease.token,
      accessExpiresAt: lease.expiresAt,
      epoch: leaseEpoch,
    }));
    if (leaseEpoch !== epoch) throw new Error("stale network epoch");
    return result;
  }

  async function refreshAccess(expectedEpoch) {
    requireUsable();
    if (!Number.isSafeInteger(expectedEpoch) || expectedEpoch !== epoch) return false;
    invalidateNetwork("refreshing", "access_expired");
    await coordinator.refresh();
    requireUsable();
    return true;
  }

  function logout() {
    requireUsable();
    const state = coordinator.snapshot();
    if (state.status === "locked" && state.reason === "pending_revocation") {
      return coordinator.retryPendingRevocation();
    }
    if (state.status === "revoked") return coordinator.discardLocalSession();
    return coordinator.logout();
  }

  function retryPendingRevocation() {
    requireUsable();
    return coordinator.retryPendingRevocation();
  }

  function discardLocalSession() {
    requireUsable();
    return coordinator.discardLocalSession();
  }

  async function discardMismatchedProfile() {
    requireActive();
    if (blockedReason !== "profile_mismatch") throw new Error("profile_mismatch_not_present");
    await removeProfileEvidence(fs, credentialDirectory, mismatchedEvidence);
    requireActive();
    mismatchedEvidence = [];
    blockedReason = undefined;
    return initialize();
  }

  function networkEpoch() {
    return epoch;
  }

  function fileBindingVersion() {
    requireUsable();
    const state = coordinator.snapshot();
    if (!["authenticated", "refreshing"].includes(state.status) || !Number.isSafeInteger(state.authorizationVersion) || state.authorizationVersion < 1) {
      throw new Error("authenticated file binding is unavailable");
    }
    return Object.freeze({ profileEpoch: epoch, authorizationVersion: state.authorizationVersion });
  }

  function snapshot() {
    return blockedReason ? Object.freeze({ status: "locked" }) : toPublicAuthState(coordinator.snapshot());
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    epoch += 1;
    unsubscribe();
    coordinator.lock?.("runtime_disposed");
    onNetworkInvalidated(Object.freeze({ epoch, status: "locked", reason: "runtime_disposed" }));
  }

  function requireActive() {
    if (disposed) throw new Error("credential runtime is disposed");
  }

  function requireUsable() {
    requireActive();
    if (blockedReason) throw new Error(blockedReason);
  }

  return Object.freeze({
    initialize,
    authorize,
    withAccessLease,
    refreshAccess,
    logout,
    retryPendingRevocation,
    discardLocalSession,
    discardMismatchedProfile,
    networkEpoch,
    fileBindingVersion,
    snapshot,
    dispose,
  });
}

async function findMismatchedProfileEvidence(fs, directory, expectedHash) {
  let entries;
  try {
    entries = await fs.readdir(directory);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw new Error("credential evidence cannot be inspected");
  }
  return entries.flatMap((entry) => {
    const name = typeof entry === "string" ? entry : entry?.name;
    const match = PROFILE_EVIDENCE.exec(name);
    return match && match[1] !== expectedHash ? [name] : [];
  });
}

async function removeProfileEvidence(fs, directory, entries) {
  if (typeof fs.rm !== "function") throw new Error("credential evidence cannot be removed");
  try {
    await Promise.all(entries.map((entry) => fs.rm(path.join(directory, entry), { force: true })));
  } catch {
    throw new Error("credential evidence cannot be removed");
  }
}
