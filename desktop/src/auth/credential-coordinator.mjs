import { createHash, randomBytes as nodeRandomBytes, randomUUID as nodeRandomUUID } from "node:crypto";

const STATES = Object.freeze([
  "unauthenticated",
  "authorizing",
  "authenticated",
  "refreshing",
  "locked",
  "revoked",
  "error",
]);
const REVOKED_CODES = new Set([
  "device_revoked",
  "family_revoked",
  "device_session_revoked",
  "user_inactive",
  "device_refresh_replay",
  "rotation_recovery_failed",
  "idempotency_expired",
]);
export class CredentialCoordinatorError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "CredentialCoordinatorError";
    this.code = code;
  }
}

export function createCredentialCoordinator({
  profile,
  credentialStore,
  pendingAuthorizationStore,
  pendingRevocationStore,
  client,
  now = Date.now,
  randomUUID = nodeRandomUUID,
  createPkce = defaultPkce,
} = {}) {
  requireAdapter(profile, credentialStore, pendingAuthorizationStore, pendingRevocationStore, client);
  let status = "unauthenticated";
  let reason;
  let credential = null;
  let access = null;
  let operationEpoch = 0;
  let refreshFlight = null;
  let authorizationFlight = null;
  let logoutFlight = null;
  let revocationFlight = null;
  let credentialMutationTail = Promise.resolve();
  let authorizationMutationTail = Promise.resolve();
  const stateSubscribers = new Set();

  function mutateCredential(operation) {
    const result = credentialMutationTail.then(operation, operation);
    credentialMutationTail = result.catch(() => {});
    return result;
  }

  function mutateAuthorization(operation) {
    const result = authorizationMutationTail.then(operation, operation);
    authorizationMutationTail = result.catch(() => {});
    return result;
  }

  function snapshot() {
    return Object.freeze({
      status,
      ...(reason ? { reason } : {}),
      hasAccessToken: access !== null,
      ...(credential ? {
        deviceId: credential.deviceId,
        familyId: credential.familyId,
        generation: credential.generation,
        authorizationVersion: credential.authorizationVersion,
      } : {}),
    });
  }

  function notifyStateSubscribers() {
    const current = snapshot();
    for (const subscriber of [...stateSubscribers]) {
      try {
        subscriber(current);
      } catch (_error) {
        // A host observer cannot interrupt credential state transitions.
      }
    }
  }

  function subscribe(subscriber) {
    if (typeof subscriber !== "function") throw new TypeError("State subscriber must be a function");
    stateSubscribers.add(subscriber);
    try {
      subscriber(snapshot());
    } catch (error) {
      stateSubscribers.delete(subscriber);
      throw error;
    }
    return () => stateSubscribers.delete(subscriber);
  }

  function transition(next, nextReason) {
    if (!STATES.includes(next)) throw new TypeError(`Unknown coordinator state: ${next}`);
    status = next;
    reason = nextReason;
    notifyStateSubscribers();
  }

  async function initialize() {
    operationEpoch += 1;
    const epoch = operationEpoch;
    access = null;
    const pendingRevocation = await pendingRevocationStore.has(profile.key);
    if (epoch !== operationEpoch) throw staleOperation();
    const loaded = await credentialStore.load();
    if (epoch !== operationEpoch) throw staleOperation();
    if (loaded.status === "empty") {
      credential = null;
      if (pendingRevocation) {
        transition("locked", "pending_revocation");
        return snapshot();
      }
      const pendingAuthorization = await pendingAuthorizationStore.load();
      if (epoch !== operationEpoch) throw staleOperation();
      if (pendingAuthorization.status === "available") {
        try {
          await resumeAuthorization(pendingAuthorization.authorization);
        } catch {
          // resumeAuthorization selected the fail-closed state.
        }
        return snapshot();
      }
      if (pendingAuthorization.status !== "empty") {
        transition("locked", pendingAuthorization.reason ?? "authorization_store_unavailable");
        return snapshot();
      }
      transition("unauthenticated");
      return snapshot();
    }
    if (loaded.status !== "available") {
      credential = null;
      transition("locked", loaded.reason ?? "credential_store_unavailable");
      return snapshot();
    }
    credential = loaded.credential;
    const staleAuthorizationRemoved = await mutateAuthorization(() => pendingAuthorizationStore.remove());
    if (epoch !== operationEpoch) throw staleOperation();
    if (staleAuthorizationRemoved.status !== "removed") {
      access = null;
      transition("locked", staleAuthorizationRemoved.reason ?? "authorization_cleanup_failed");
      return snapshot();
    }
    if (pendingRevocation) {
      transition("locked", "pending_revocation");
      return snapshot();
    }
    if (credential.pendingRotation) {
      if (epoch !== operationEpoch) throw staleOperation();
      try {
        await rotate({ recovery: true });
      } catch {
        // rotate already chose a fail-closed terminal state.
      }
      return snapshot();
    }
    transition("authenticated");
    return snapshot();
  }

  async function authorize(input) {
    if (authorizationFlight) return authorizationFlight;
    authorizationFlight = runAuthorization(input).finally(() => {
      authorizationFlight = null;
    });
    return authorizationFlight;
  }

  async function runAuthorization(input) {
    if (status !== "unauthenticated") {
      throw new CredentialCoordinatorError(status, `Credential coordinator is ${status}`);
    }
    operationEpoch += 1;
    const epoch = operationEpoch;
    access = null;
    credential = null;
    transition("authorizing");
    const pkce = createPkce();
    const exchangeTransactionId = randomUUID();
    try {
      const prepared = {
        phase: "prepared",
        codeVerifier: pkce.verifier,
        codeChallenge: pkce.challenge,
        exchangeTransactionId,
        installationId: input.installationId,
        deviceName: input.deviceName,
        platform: input.platform,
        clientVersion: input.clientVersion,
      };
      await savePendingAuthorization(prepared);
      const started = await client.startAuthorization({
        codeChallenge: pkce.challenge,
        installationId: input.installationId,
        deviceName: input.deviceName,
        platform: input.platform,
        clientVersion: input.clientVersion,
      });
      if (epoch !== operationEpoch) throw staleOperation();
      const pending = {
        ...prepared,
        phase: "started",
        deviceCode: started.deviceCode,
        userCode: started.userCode,
        verificationUrl: started.verificationUrl,
        intervalSeconds: started.intervalSeconds,
        expiresAt: started.expiresAt,
      };
      await savePendingAuthorization(pending);
      if (typeof input.openExternal === "function") await input.openExternal(started.verificationUrl);
      if (typeof input.onUserCode === "function") input.onUserCode(started.userCode);
      return await completeAuthorization(pending, epoch);
    } catch (error) {
      access = null;
      if (status !== "locked" && error?.code !== "stale_operation") {
        transition(REVOKED_CODES.has(error?.code) ? "revoked" : "error", error?.code ?? "authorization_failed");
      }
      throw error;
    }
  }

  async function resumeAuthorization(pending) {
    transition("authorizing", "recovering_authorization");
    const epoch = operationEpoch;
    try {
      let resumable = pending;
      if (pending.phase === "prepared") {
        const started = await client.startAuthorization({
          codeChallenge: pending.codeChallenge,
          installationId: pending.installationId,
          deviceName: pending.deviceName,
          platform: pending.platform,
          clientVersion: pending.clientVersion,
        });
        resumable = {
          ...pending,
          phase: "started",
          deviceCode: started.deviceCode,
          userCode: started.userCode,
          verificationUrl: started.verificationUrl,
          intervalSeconds: started.intervalSeconds,
          expiresAt: started.expiresAt,
        };
        await savePendingAuthorization(resumable);
      }
      return await completeAuthorization(resumable, epoch);
    } catch (error) {
      access = null;
      if (status !== "locked") {
        transition(REVOKED_CODES.has(error?.code) ? "revoked" : "error", error?.code ?? "authorization_recovery_failed");
      }
      throw error;
    }
  }

  async function completeAuthorization(pending, epoch) {
    const issued = await client.pollAuthorization({
      deviceCode: pending.deviceCode,
      codeVerifier: pending.codeVerifier,
      exchangeTransactionId: pending.exchangeTransactionId,
      intervalSeconds: pending.intervalSeconds,
      expiresAt: pending.expiresAt,
    });
    if (epoch !== operationEpoch) throw staleOperation();
    let userId = issued.userId;
    if (userId === undefined && typeof client.probe === "function") {
      const probe = await client.probe(issued.accessToken);
      assertIssuedBinding(issued, probe);
      userId = probe.userId;
    }
    const next = persistedCredential(issued, userId);
    if (epoch !== operationEpoch) throw staleOperation();
    const saved = await mutateCredential(() => credentialStore.save(next));
    if (saved.status !== "saved") {
      transition("locked", saved.reason ?? "credential_persist_failed");
      throw new CredentialCoordinatorError("credential_persist_failed", "Could not persist device credential");
    }
    const removed = await mutateAuthorization(() => pendingAuthorizationStore.remove());
    if (removed.status !== "removed") {
      transition("locked", removed.reason ?? "authorization_cleanup_failed");
      throw new CredentialCoordinatorError("authorization_cleanup_failed", "Could not remove pending authorization");
    }
    if (epoch !== operationEpoch) throw staleOperation();
    credential = next;
    access = memoryAccess(issued);
    transition("authenticated");
    return snapshot();
  }

  async function savePendingAuthorization(value) {
    const saved = await mutateAuthorization(() => pendingAuthorizationStore.save(value));
    if (saved.status !== "saved") {
      transition("locked", saved.reason ?? "authorization_persist_failed");
      throw new CredentialCoordinatorError("authorization_persist_failed", "Could not persist pending authorization");
    }
  }

  async function getAccessToken() {
    return (await getAccessLease()).token;
  }

  async function getAccessLease() {
    if (status === "locked" || status === "revoked" || status === "error") {
      throw new CredentialCoordinatorError(status, `Credential coordinator is ${status}`);
    }
    if (!credential) throw new CredentialCoordinatorError("unauthenticated", "No device credential is available");
    if (access && Date.parse(access.expiresAt) > now()) return access;
    await refresh();
    if (!access) throw new CredentialCoordinatorError("locked", "No committed access token is available");
    return access;
  }

  function refresh() {
    if (refreshFlight) return refreshFlight;
    refreshFlight = rotate({ recovery: false }).finally(() => {
      refreshFlight = null;
    });
    return refreshFlight;
  }

  async function rotate({ recovery, allowLocked = false }) {
    if (!credential) throw new CredentialCoordinatorError("unauthenticated", "No refresh credential is available");
    if (["locked", "revoked", "error"].includes(status) && !recovery && !allowLocked) {
      throw new CredentialCoordinatorError(status, `Credential coordinator is ${status}`);
    }
    const source = credential;
    const pending = recovery && source.pendingRotation
      ? source.pendingRotation
      : { sourceGeneration: source.generation, transactionId: randomUUID() };
    if (pending.sourceGeneration !== source.generation) {
      transition("locked", "pending_generation_mismatch");
      throw new CredentialCoordinatorError("pending_generation_mismatch", "Pending rotation generation is invalid");
    }
    const epoch = operationEpoch;
    if (!recovery) {
      const pendingCredential = { ...source, pendingRotation: pending };
      const saved = await mutateCredential(() => credentialStore.save(pendingCredential));
      if (saved.status !== "saved") {
        access = null;
        transition("locked", saved.reason ?? "pending_persist_failed");
        throw new CredentialCoordinatorError("pending_persist_failed", "Could not persist pending rotation");
      }
      credential = pendingCredential;
    }
    transition("refreshing");
    try {
      const issued = await client.refresh({
        refreshToken: source.refreshToken,
        generation: source.generation,
        transactionId: pending.transactionId,
        deviceId: source.deviceId,
      });
      if (
        epoch !== operationEpoch || credential?.generation !== pending.sourceGeneration ||
        credential?.pendingRotation?.transactionId !== pending.transactionId
      ) {
        throw staleOperation();
      }
      assertRotationBinding(source, issued);
      const next = persistedCredential(issued, source.userId);
      const saved = await mutateCredential(() => credentialStore.save(next));
      if (saved.status !== "saved") {
        access = null;
        transition("locked", saved.reason ?? "rotation_commit_failed");
        throw new CredentialCoordinatorError("rotation_commit_failed", "Could not persist rotated credential");
      }
      if (epoch !== operationEpoch) throw staleOperation();
      credential = next;
      access = memoryAccess(issued);
      transition("authenticated");
      return access.token;
    } catch (error) {
      access = null;
      if (error?.code === "stale_operation") throw error;
      if (REVOKED_CODES.has(error?.code) || error?.securityFailure === true) {
        transition("revoked", error.code);
      } else if (status !== "locked") {
        transition("locked", error?.code ?? "refresh_failed");
      }
      throw error;
    }
  }

  function retryPendingRevocation() {
    if (revocationFlight) return revocationFlight;
    revocationFlight = runPendingRevocation().finally(() => {
      revocationFlight = null;
    });
    return revocationFlight;
  }

  async function runPendingRevocation() {
    if (!(await pendingRevocationStore.has(profile.key))) {
      throw new CredentialCoordinatorError("no_pending_revocation", "No pending revocation is available");
    }
    if (!credential) {
      const cleared = await pendingRevocationStore.clear(profile.key);
      if (cleared.status !== "removed") {
        throw new CredentialCoordinatorError("revocation_marker_remove_failed", "Could not clear revocation marker");
      }
      transition("unauthenticated");
      return snapshot();
    }
    try {
      if (!access) await rotate({ recovery: Boolean(credential.pendingRotation), allowLocked: true });
      return await logout();
    } catch (error) {
      if (status === "revoked" || REVOKED_CODES.has(error?.code) || error?.securityFailure === true) {
        return discardLocalSession();
      }
      transition("locked", "pending_revocation");
      throw error;
    }
  }

  async function discardLocalSession() {
    operationEpoch += 1;
    access = null;
    const removed = await mutateCredential(() => credentialStore.remove());
    if (removed.status !== "removed") {
      transition("locked", removed.reason ?? "credential_remove_failed");
      throw new CredentialCoordinatorError("credential_remove_failed", "Could not remove local credential");
    }
    credential = null;
    const authorizationRemoved = await mutateAuthorization(() => pendingAuthorizationStore.remove());
    if (authorizationRemoved.status !== "removed") {
      transition("locked", authorizationRemoved.reason ?? "authorization_cleanup_failed");
      throw new CredentialCoordinatorError("authorization_cleanup_failed", "Could not remove pending authorization");
    }
    const markerRemoved = await pendingRevocationStore.clear(profile.key);
    if (markerRemoved.status !== "removed") {
      transition("locked", markerRemoved.reason ?? "revocation_marker_remove_failed");
      throw new CredentialCoordinatorError("revocation_marker_remove_failed", "Could not clear revocation marker");
    }
    transition("unauthenticated");
    return snapshot();
  }

  async function acceptAccess(issued) {
    if (!credential) throw new CredentialCoordinatorError("unauthenticated", "No credential is loaded");
    if (status !== "authenticated") {
      throw new CredentialCoordinatorError(status, `Credential coordinator is ${status}`);
    }
    if (
      issued.deviceId !== credential.deviceId || issued.familyId !== credential.familyId ||
      issued.generation !== credential.generation ||
      issued.authorizationVersion !== credential.authorizationVersion
    ) {
      throw new CredentialCoordinatorError("credential_binding_mismatch", "Access credential binding changed");
    }
    access = memoryAccess(issued);
    transition("authenticated");
    return snapshot();
  }

  async function lock(lockReason = "locked") {
    operationEpoch += 1;
    access = null;
    transition("locked", lockReason);
    return snapshot();
  }

  function logout() {
    if (logoutFlight) return logoutFlight;
    logoutFlight = runLogout().finally(() => {
      logoutFlight = null;
    });
    return logoutFlight;
  }

  async function runLogout() {
    operationEpoch += 1;
    let token = access?.token;
    access = null;
    transition("locked", "pending_revocation");
    const marker = await pendingRevocationStore.mark(profile.key);
    const authorizationRemoved = await mutateAuthorization(() => pendingAuthorizationStore.remove());
    if (marker.status !== "saved") {
      const removed = await mutateCredential(() => credentialStore.remove());
      if (removed.status === "removed") credential = null;
      transition("locked", marker.reason ?? "revocation_marker_failed");
      throw new CredentialCoordinatorError("revocation_marker_failed", "Could not persist pending revocation");
    }
    if (authorizationRemoved.status !== "removed") {
      transition("locked", authorizationRemoved.reason ?? "authorization_cleanup_failed");
      throw new CredentialCoordinatorError("authorization_cleanup_failed", "Could not remove pending authorization");
    }
    try {
      if (!token && credential) {
        await rotate({ recovery: Boolean(credential.pendingRotation), allowLocked: true });
        token = access?.token;
        access = null;
        transition("locked", "pending_revocation");
      }
      if (!token) throw new CredentialCoordinatorError("access_unavailable", "Device access is unavailable for logout");
      const result = await client.logout(token);
      if (credential && result.familyId !== credential.familyId) {
        throw new CredentialCoordinatorError("logout_binding_mismatch", "Logout family binding changed");
      }
      const removed = await mutateCredential(() => credentialStore.remove());
      if (removed.status !== "removed") {
        throw new CredentialCoordinatorError("credential_remove_failed", "Could not remove local credential");
      }
      const cleared = await pendingRevocationStore.clear(profile.key);
      if (cleared.status !== "removed") {
        throw new CredentialCoordinatorError("revocation_marker_remove_failed", "Could not clear revocation marker");
      }
      credential = null;
      transition("unauthenticated");
      return snapshot();
    } catch (error) {
      if (status === "revoked" || REVOKED_CODES.has(error?.code) || error?.securityFailure === true) {
        return discardLocalSession();
      }
      transition("locked", "pending_revocation");
      throw error;
    }
  }

  return Object.freeze({
    states: STATES,
    snapshot,
    subscribe,
    initialize,
    authorize,
    getAccessToken,
    getAccessLease,
    refresh,
    logout,
    retryPendingRevocation,
    discardLocalSession,
    lock,
    acceptAccess,
  });
}

export function createPendingRevocationStore({ fs, directory }) {
  if (!fs || typeof fs.open !== "function" || typeof directory !== "string" || directory.length === 0) {
    throw new TypeError("pending revocation store requires fs and directory");
  }
  const markerPath = (profileKey) => {
    const digest = createHash("sha256").update(profileKey, "utf8").digest("hex");
    return `${directory}/${digest}.pending`;
  };
  return Object.freeze({
    async has(profileKey) {
      try {
        await fs.stat(markerPath(profileKey));
        return true;
      } catch (error) {
        if (error?.code === "ENOENT") return false;
        throw error;
      }
    },
    async mark(profileKey) {
      try {
        await fs.mkdir(directory, { recursive: true, mode: 0o700 });
        const handle = await fs.open(markerPath(profileKey), "w", 0o600);
        try {
          await handle.writeFile("pending-revocation\n", "utf8");
          await handle.chmod?.(0o600);
          await handle.sync();
        } finally {
          await handle.close();
        }
        await syncDirectory(fs, directory, process.platform);
        return { status: "saved" };
      } catch {
        return { status: "locked", reason: "marker_write_failed" };
      }
    },
    async clear(profileKey) {
      try {
        await fs.unlink(markerPath(profileKey));
        await syncDirectory(fs, directory, process.platform);
        return { status: "removed" };
      } catch (error) {
        if (error?.code === "ENOENT") return { status: "removed" };
        return { status: "locked", reason: "marker_remove_failed" };
      }
    },
  });
}

export function createPendingAuthorizationStore({
  fs,
  filePath,
  profile,
  platform = process.platform,
  randomBytes = nodeRandomBytes,
  secureDirectory,
}) {
  if (
    !fs || typeof fs.readFile !== "function" || typeof filePath !== "string" || !profile
  ) {
    throw new TypeError("pending authorization store adapter is invalid");
  }
  if (platform === "win32" && typeof secureDirectory !== "function") {
    throw new TypeError("secureDirectory is required on Windows");
  }
  const expectedProfile = canonicalJson(profile);

  async function load() {
    try {
      await prepareSecretDirectory(fs, filePath, platform, secureDirectory);
      await recoverSecretFile(fs, filePath, platform);
    } catch {
      return { status: "locked", reason: "recovery_failed" };
    }
    let envelope;
    try {
      if (platform !== "win32" && ((await fs.stat(filePath)).mode & 0o077) !== 0) {
        return { status: "locked", reason: "insecure_permissions" };
      }
      envelope = JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return { status: "empty" };
      return { status: "locked", reason: "read_failed" };
    }
    if (
      !isPlainObject(envelope) || envelope.version !== 2 ||
      !isPlainObject(envelope.profile) || !("authorization" in envelope)
    ) {
      return { status: "locked", reason: "corrupt_envelope" };
    }
    if (canonicalJson(envelope.profile) !== expectedProfile) {
      return { status: "locked", reason: "profile_mismatch" };
    }
    try {
      validatePendingAuthorization(envelope.authorization, profile.origin);
    } catch {
      return { status: "locked", reason: "invalid_payload" };
    }
    return { status: "available", authorization: envelope.authorization };
  }

  async function save(authorization) {
    try {
      await prepareSecretDirectory(fs, filePath, platform, secureDirectory);
      await recoverSecretFile(fs, filePath, platform);
      validatePendingAuthorization(authorization, profile.origin);
      const envelope = `${JSON.stringify({
        version: 2,
        profile: JSON.parse(expectedProfile),
        authorization,
      })}\n`;
      await replaceSecretFile(fs, filePath, envelope, platform, randomBytes);
      return { status: "saved" };
    } catch {
      return { status: "locked", reason: "write_failed" };
    }
  }

  async function remove() {
    try {
      await prepareSecretDirectory(fs, filePath, platform, secureDirectory);
      await writeSecretRemovalMarker(fs, filePath, platform);
      await unlinkIfPresent(fs, filePath);
      await unlinkIfPresent(fs, `${filePath}.previous`);
      await syncDirectory(fs, parentDirectory(filePath), platform);
      await unlinkIfPresent(fs, `${filePath}.delete`);
      await syncDirectory(fs, parentDirectory(filePath), platform);
      return { status: "removed" };
    } catch (error) {
      if (error?.code === "ENOENT") return { status: "removed" };
      return { status: "locked", reason: "remove_failed" };
    }
  }

  return Object.freeze({ load, save, remove });
}

async function prepareSecretDirectory(fs, filePath, platform, secureDirectory) {
  const directory = parentDirectory(filePath);
  if (platform === "win32") {
    await secureDirectory(directory);
    return;
  }
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.chmod(directory, 0o700);
}

async function recoverSecretFile(fs, filePath, platform) {
  const removalMarker = `${filePath}.delete`;
  if (await fileExists(fs, removalMarker)) {
    await unlinkIfPresent(fs, filePath);
    await unlinkIfPresent(fs, `${filePath}.previous`);
    await syncDirectory(fs, parentDirectory(filePath), platform);
    await unlinkIfPresent(fs, removalMarker);
    await syncDirectory(fs, parentDirectory(filePath), platform);
    return;
  }
  const backup = `${filePath}.previous`;
  if (!(await fileExists(fs, backup))) return;
  if (await fileExists(fs, filePath)) {
    await fs.unlink(backup);
  } else {
    await fs.rename(backup, filePath);
  }
  await syncDirectory(fs, parentDirectory(filePath), platform);
}

async function writeSecretRemovalMarker(fs, filePath, platform) {
  const directory = parentDirectory(filePath);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const handle = await fs.open(`${filePath}.delete`, "w", 0o600);
  try {
    await handle.writeFile("delete\n", "utf8");
    if (platform !== "win32") await handle.chmod(0o600);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(fs, directory, platform);
}

async function fileExists(fs, filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function unlinkIfPresent(fs, filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function replaceSecretFile(fs, filePath, contents, platform, randomBytes) {
  const directory = parentDirectory(filePath);
  const temporary = `${filePath}.${randomBytes(12).toString("hex")}.tmp`;
  const backup = `${filePath}.previous`;
  let hasBackup = false;
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const handle = await fs.open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(contents, "utf8");
    if (platform !== "win32") await handle.chmod(0o600);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    try {
      await fs.rename(filePath, backup);
      hasBackup = true;
      await syncDirectory(fs, directory, platform);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await fs.rename(temporary, filePath);
    if (platform !== "win32") await fs.chmod(filePath, 0o600);
    await syncDirectory(fs, directory, platform);
    if (hasBackup) {
      await fs.unlink(backup);
      await syncDirectory(fs, directory, platform);
    }
  } catch (error) {
    if (hasBackup) {
      await fs.unlink(filePath).catch(() => {});
      await fs.rename(backup, filePath).catch(() => {});
    }
    throw error;
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
}

function parentDirectory(filePath) {
  const slash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return slash < 0 ? "." : filePath.slice(0, slash);
}

async function syncDirectory(fs, directory, platform) {
  if (platform === "win32") return;
  const handle = await fs.open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function validatePendingAuthorization(value, origin) {
  if (!isPlainObject(value) || (value.phase !== "prepared" && value.phase !== "started")) {
    throw new TypeError("pending authorization is invalid");
  }
  for (const key of [
    "codeVerifier", "codeChallenge", "exchangeTransactionId", "installationId",
    "deviceName", "platform", "clientVersion",
  ]) {
    if (typeof value[key] !== "string" || value[key].length === 0) throw new TypeError(`invalid ${key}`);
  }
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(value.exchangeTransactionId)) {
    throw new TypeError("invalid exchange transaction");
  }
  if (value.phase === "started") {
    for (const key of ["deviceCode", "userCode", "verificationUrl"]) {
      if (typeof value[key] !== "string" || value[key].length === 0) throw new TypeError(`invalid ${key}`);
    }
    const verification = new URL(value.verificationUrl);
    if (verification.origin !== origin || verification.pathname !== "/web/device-authorization") {
      throw new TypeError("invalid verification URL");
    }
    if (!Number.isSafeInteger(value.intervalSeconds) || value.intervalSeconds < 1 || !Number.isFinite(value.expiresAt)) {
      throw new TypeError("invalid authorization timing");
    }
  }
}

function canonicalJson(value) {
  if (value === null || ["string", "boolean", "number"].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isPlainObject(value)) throw new TypeError("value is not serializable");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function defaultPkce() {
  const verifier = nodeRandomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
  return Object.freeze({ verifier, challenge });
}

function persistedCredential(issued, userId) {
  if (userId === undefined || userId === null || String(userId).length === 0) {
    throw new CredentialCoordinatorError("user_binding_missing", "Credential user binding is missing");
  }
  return Object.freeze({
    userId: String(userId),
    deviceId: issued.deviceId,
    familyId: issued.familyId,
    generation: issued.generation,
    authorizationVersion: issued.authorizationVersion,
    refreshToken: issued.refreshToken,
    accessExpiresAt: issued.accessExpiresAt,
    refreshExpiresAt: issued.refreshExpiresAt,
    pendingRotation: null,
    lastConfirmedServerGeneration: issued.generation,
  });
}

function memoryAccess(issued) {
  return Object.freeze({ token: issued.accessToken, expiresAt: issued.accessExpiresAt });
}

function assertIssuedBinding(issued, probe) {
  if (
    issued.deviceId !== probe.deviceId || issued.familyId !== probe.familyId ||
    issued.generation !== probe.generation || issued.authorizationVersion !== probe.authorizationVersion
  ) {
    throw new CredentialCoordinatorError("credential_binding_mismatch", "Probe credential binding changed");
  }
}

function assertRotationBinding(source, issued) {
  if (
    issued.deviceId !== source.deviceId || issued.familyId !== source.familyId ||
    issued.generation !== source.generation + 1 ||
    (source.authorizationVersion !== undefined && issued.authorizationVersion < source.authorizationVersion)
  ) {
    throw new CredentialCoordinatorError("rotation_binding_mismatch", "Rotated credential binding changed");
  }
}

function staleOperation() {
  return new CredentialCoordinatorError("stale_operation", "Stale credential operation response was discarded");
}

function requireAdapter(profile, credentialStore, pendingAuthorizationStore, pendingRevocationStore, client) {
  if (!profile || typeof profile.key !== "string") throw new TypeError("profile is required");
  for (const [name, adapter, methods] of [
    ["credentialStore", credentialStore, ["load", "save", "remove"]],
    ["pendingAuthorizationStore", pendingAuthorizationStore, ["load", "save", "remove"]],
    ["pendingRevocationStore", pendingRevocationStore, ["has", "mark", "clear"]],
    ["client", client, []],
  ]) {
    if (!adapter || methods.some((method) => typeof adapter[method] !== "function")) {
      throw new TypeError(`${name} adapter is invalid`);
    }
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
