import crypto from "node:crypto";
import path from "node:path";

export const CREDENTIAL_ENVELOPE_VERSION = 1;
export const CREDENTIAL_PAYLOAD_VERSION = 1;

const ENVELOPE_KEYS = ["ciphertext", "encryption", "version"];
const ENCRYPTION_NAME = "electron-safe-storage";
const LINUX_SECURE_BACKENDS = new Set([
  "gnome_libsecret",
  "kwallet",
  "kwallet5",
  "kwallet6",
]);
const CREDENTIAL_KEYS = [
  "accessExpiresAt",
  "authorizationVersion",
  "deviceId",
  "familyId",
  "generation",
  "lastConfirmedServerGeneration",
  "pendingRotation",
  "refreshAbsoluteExpiresAt",
  "refreshExpiresAt",
  "refreshToken",
  "userId",
];
const REQUIRED_CREDENTIAL_KEYS = [
  "deviceId",
  "familyId",
  "generation",
  "lastConfirmedServerGeneration",
  "pendingRotation",
  "refreshToken",
  "userId",
];

export function createProfileCredentialStore({
  safeStorage,
  fs,
  userDataPath,
  profile,
  platform = process.platform,
  randomBytes = crypto.randomBytes,
}) {
  if (typeof userDataPath !== "string" || userDataPath.length === 0) {
    throw new TypeError("userDataPath is required");
  }
  if (!isPlainObject(profile) || typeof profile.key !== "string") {
    throw new TypeError("profile with a stable key is required");
  }
  const match = /^yuance-desktop-profile-v1:([a-f0-9]{64})$/.exec(profile.key);
  if (!match) throw new TypeError("profile key is invalid");
  return createCredentialStore({
    safeStorage,
    fs,
    filePath: path.join(userDataPath, "Device Credentials", `${match[1]}.enc.json`),
    profileIdentity: profile,
    platform,
    randomBytes,
  });
}

export function createCredentialStore({
  safeStorage,
  fs,
  filePath,
  profileIdentity,
  platform = process.platform,
  randomBytes = crypto.randomBytes,
}) {
  requireAdapter(safeStorage, fs, filePath);
  if (!isPlainObject(profileIdentity)) throw new TypeError("profileIdentity must be an object");
  const expectedProfile = canonicalJson(profileIdentity, "profile identity");
  const storedProfile = JSON.parse(expectedProfile);

  function availability() {
    if (platform !== "darwin" && platform !== "win32" && platform !== "linux") {
      return unavailable("unsupported_platform");
    }

    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return unavailable("encryption_unavailable");
      }
      if (platform === "linux") {
        if (typeof safeStorage.getSelectedStorageBackend !== "function") {
          return unavailable("backend_unavailable");
        }
        const backend = String(safeStorage.getSelectedStorageBackend() || "").toLowerCase();
        if (!LINUX_SECURE_BACKENDS.has(backend)) {
          return unavailable(backend === "basic_text" ? "insecure_backend" : "backend_unavailable");
        }
      }
    } catch {
      return unavailable("backend_unavailable");
    }
    return { status: "available" };
  }

  async function load() {
    const backend = availability();
    if (backend.status !== "available") return backend;
    try {
      await finishPendingRemoval(fs, filePath, platform);
    } catch {
      return locked("recovery_failed");
    }
    if (platform === "win32") {
      try {
        await recoverWindowsReplace(fs, filePath);
      } catch {
        return locked("recovery_failed");
      }
    }

    let serialized;
    try {
      serialized = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return { status: "empty" };
      return locked("read_failed");
    }

    let envelope;
    try {
      envelope = JSON.parse(serialized);
      validateEnvelope(envelope);
    } catch {
      return locked("corrupt_envelope");
    }

    let plaintext;
    try {
      plaintext = safeStorage.decryptString(Buffer.from(envelope.ciphertext, "base64"));
    } catch {
      return locked("decryption_failed");
    }

    let payload;
    try {
      payload = JSON.parse(plaintext);
      validatePayload(payload);
    } catch {
      return locked("invalid_payload");
    }

    let actualProfile;
    try {
      actualProfile = canonicalJson(payload.profileIdentity, "stored profile identity");
    } catch {
      return locked("invalid_payload");
    }
    if (actualProfile !== expectedProfile) return locked("profile_mismatch");

    return { status: "available", credential: payload.credential };
  }

  async function save(credential) {
    const backend = availability();
    if (backend.status !== "available") return backend;
    try {
      await finishPendingRemoval(fs, filePath, platform);
    } catch {
      return locked("recovery_failed");
    }
    if (platform === "win32") {
      try {
        await recoverWindowsReplace(fs, filePath);
      } catch {
        return locked("recovery_failed");
      }
    }

    try {
      assertCredential(credential);
    } catch {
      return locked("invalid_credential");
    }

    let envelope;
    try {
      const plaintext = JSON.stringify({
        version: CREDENTIAL_PAYLOAD_VERSION,
        profileIdentity: storedProfile,
        credential,
      });
      envelope = JSON.stringify({
        version: CREDENTIAL_ENVELOPE_VERSION,
        encryption: ENCRYPTION_NAME,
        ciphertext: safeStorage.encryptString(plaintext).toString("base64"),
      });
    } catch {
      return locked("encryption_failed");
    }

    try {
      await atomicReplace(fs, filePath, `${envelope}\n`, platform, randomBytes);
      return { status: "saved" };
    } catch {
      return locked("write_failed");
    }
  }

  async function remove() {
    try {
      await writeRemovalMarker(fs, filePath, platform);
      await finishPendingRemoval(fs, filePath, platform);
      return { status: "removed" };
    } catch {
      return locked("remove_failed");
    }
  }

  return { availability, load, save, remove };
}

async function atomicReplace(fs, targetPath, contents, platform, randomBytes) {
  const directory = path.dirname(targetPath);
  const nonce = randomBytes(12).toString("hex");
  const temporaryPath = path.join(directory, `.${path.basename(targetPath)}.${nonce}.tmp`);
  const backupPath =
    platform === "win32"
      ? `${targetPath}.previous`
      : path.join(directory, `.${path.basename(targetPath)}.${nonce}.bak`);
  let temporaryHandle;
  let backupCreated = false;
  let replacementCommitted = false;
  let preserveBackup = false;

  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    temporaryHandle = await fs.open(temporaryPath, "wx", 0o600);
    await temporaryHandle.writeFile(contents, "utf8");
    if (platform !== "win32") await temporaryHandle.chmod(0o600);
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = undefined;

    if (platform === "win32") {
      try {
        await fs.rename(targetPath, backupPath);
        backupCreated = true;
        await syncDirectory(fs, directory, platform);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    } else {
      try {
        await fs.copyFile(targetPath, backupPath, fs.constants?.COPYFILE_EXCL ?? 1);
        backupCreated = true;
        const backupHandle = await fs.open(backupPath, "r");
        try {
          await backupHandle.sync();
        } finally {
          await backupHandle.close();
        }
        await fs.chmod(backupPath, 0o600);
        await syncDirectory(fs, directory, platform);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }

    await fs.rename(temporaryPath, targetPath);
    replacementCommitted = true;
    if (platform !== "win32") await fs.chmod(targetPath, 0o600);
    await syncDirectory(fs, directory, platform);

    if (backupCreated) {
      await fs.unlink(backupPath);
      backupCreated = false;
      await syncDirectory(fs, directory, platform);
    }
  } catch (error) {
    if (replacementCommitted && backupCreated) {
      try {
        if (platform === "win32") await fs.unlink(targetPath).catch(() => {});
        await fs.rename(backupPath, targetPath);
        backupCreated = false;
        await syncDirectory(fs, directory, platform);
      } catch {
        // The caller receives locked; retaining the backup is safer than deleting it.
        preserveBackup = true;
      }
    } else if (platform === "win32" && backupCreated) {
      try {
        await fs.rename(backupPath, targetPath);
        backupCreated = false;
        await syncDirectory(fs, directory, platform);
      } catch {
        // Keep the backup when restoring the old record cannot be confirmed.
        preserveBackup = true;
      }
    }
    throw error;
  } finally {
    if (temporaryHandle) await temporaryHandle.close().catch(() => {});
    await fs.unlink(temporaryPath).catch(() => {});
    if (backupCreated && !replacementCommitted && !preserveBackup) {
      await fs.unlink(backupPath).catch(() => {});
    }
  }
}

async function recoverWindowsReplace(fs, targetPath) {
  const backupPath = `${targetPath}.previous`;
  if (!(await pathExists(fs, backupPath))) return;
  if (await pathExists(fs, targetPath)) {
    await fs.unlink(backupPath);
  } else {
    await fs.rename(backupPath, targetPath);
  }
}

async function writeRemovalMarker(fs, targetPath, platform) {
  const directory = path.dirname(targetPath);
  const markerPath = `${targetPath}.delete`;
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const handle = await fs.open(markerPath, "w", 0o600);
  try {
    await handle.writeFile("delete", "utf8");
    if (platform !== "win32") await handle.chmod(0o600);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(fs, directory, platform);
}

async function finishPendingRemoval(fs, targetPath, platform) {
  const markerPath = `${targetPath}.delete`;
  if (!(await pathExists(fs, markerPath))) return;
  if (platform === "win32") await unlinkIfExists(fs, `${targetPath}.previous`);
  await unlinkIfExists(fs, targetPath);
  await syncDirectory(fs, path.dirname(targetPath), platform);
  await fs.unlink(markerPath);
  await syncDirectory(fs, path.dirname(targetPath), platform);
}

async function unlinkIfExists(fs, candidate) {
  try {
    await fs.unlink(candidate);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function pathExists(fs, candidate) {
  try {
    await fs.stat(candidate);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
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

function validateEnvelope(value) {
  if (!isPlainObject(value) || Object.keys(value).sort().join(",") !== ENVELOPE_KEYS.join(",")) {
    throw new Error("invalid envelope");
  }
  if (value.version !== CREDENTIAL_ENVELOPE_VERSION || value.encryption !== ENCRYPTION_NAME) {
    throw new Error("unsupported envelope");
  }
  if (typeof value.ciphertext !== "string" || !isCanonicalBase64(value.ciphertext)) {
    throw new Error("invalid ciphertext");
  }
}

function validatePayload(value) {
  if (
    !isPlainObject(value) ||
    value.version !== CREDENTIAL_PAYLOAD_VERSION ||
    !("profileIdentity" in value) ||
    !("credential" in value)
  ) {
    throw new Error("invalid payload");
  }
  assertCredential(value.credential);
}

function assertCredential(value) {
  if (!isPlainObject(value)) throw new Error("credential must be an object");
  const keys = Object.keys(value).sort();
  if (keys.some((key) => !CREDENTIAL_KEYS.includes(key))) throw new Error("unknown credential field");
  if (REQUIRED_CREDENTIAL_KEYS.some((key) => !keys.includes(key))) {
    throw new Error("missing credential field");
  }
  for (const key of ["userId", "deviceId", "familyId"]) requireNonEmptyString(value[key]);
  requireNonNegativeInteger(value.generation);
  requireNonNegativeInteger(value.lastConfirmedServerGeneration);
  if (!/^yuance_drt_[A-Za-z0-9_-]+$/.test(value.refreshToken)) {
    throw new Error("invalid refresh token");
  }
  if (value.authorizationVersion !== undefined) requirePositiveInteger(value.authorizationVersion);
  for (const key of ["accessExpiresAt", "refreshExpiresAt", "refreshAbsoluteExpiresAt"]) {
    if (value[key] !== undefined && !isTimestamp(value[key])) throw new Error(`invalid ${key}`);
  }
  validatePendingRotation(value.pendingRotation);
  canonicalJson(value, "credential");
}

function validatePendingRotation(value) {
  if (value === null) return;
  if (!isPlainObject(value)) throw new Error("invalid pending rotation");
  if (Object.keys(value).sort().join(",") !== "sourceGeneration,transactionId") {
    throw new Error("invalid pending rotation");
  }
  requireNonNegativeInteger(value.sourceGeneration);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.transactionId)) {
    throw new Error("invalid pending rotation transaction");
  }
}

function requireNonEmptyString(value) {
  if (typeof value !== "string" || value.length === 0) throw new Error("invalid string field");
}

function requireNonNegativeInteger(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("invalid generation");
}

function requirePositiveInteger(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("invalid version");
}

function isTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function canonicalJson(value, label) {
  const seen = new Set();
  function normalize(candidate) {
    if (candidate === null || ["string", "boolean"].includes(typeof candidate)) return candidate;
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (!isPlainObject(candidate) || seen.has(candidate)) throw new Error(`invalid ${label}`);
    seen.add(candidate);
    const normalized = {};
    for (const key of Object.keys(candidate).sort()) normalized[key] = normalize(candidate[key]);
    seen.delete(candidate);
    return normalized;
  }
  return JSON.stringify(normalize(value));
}

function isCanonicalBase64(value) {
  if (value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return false;
  }
  return Buffer.from(value, "base64").toString("base64") === value;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireAdapter(safeStorage, fs, filePath) {
  for (const name of ["isEncryptionAvailable", "encryptString", "decryptString"]) {
    if (typeof safeStorage?.[name] !== "function") throw new TypeError(`safeStorage.${name} is required`);
  }
  for (const name of ["readFile", "mkdir", "open", "copyFile", "rename", "unlink", "chmod", "stat"]) {
    if (typeof fs?.[name] !== "function") throw new TypeError(`fs.${name} is required`);
  }
  if (typeof filePath !== "string" || filePath.length === 0) throw new TypeError("filePath is required");
}

function locked(reason) {
  return { status: "locked", reason };
}

function unavailable(reason) {
  return { status: "unavailable", reason };
}
