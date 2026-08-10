import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createCredentialStore,
  createProfileCredentialStore,
} from "../src/auth/credential-store.mjs";

const profile = {
  environment: "production",
  origin: "https://yuance.example",
  serverInstanceId: "server-1",
};
const credential = {
  userId: "user-secret",
  deviceId: "device-secret",
  familyId: "family-secret",
  generation: 3,
  refreshToken: "yuance_drt_raw-secret",
  accessExpiresAt: "2026-08-01T12:00:00Z",
  pendingRotation: null,
  lastConfirmedServerGeneration: 3,
};

async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-credential-store-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "credentials", "device.json");
  return {
    filePath,
    store: createCredentialStore({
      fs: options.fs ?? fs,
      filePath,
      profileIdentity: options.profileIdentity ?? profile,
      platform: options.platform ?? process.platform,
      randomBytes: () => Buffer.alloc(12, options.nonce ?? 1),
      secureDirectory: options.secureDirectory ?? (async () => {}),
    }),
  };
}

test("persists the complete payload in the owner-only versioned file", async (t) => {
  const { store, filePath } = await fixture(t);
  assert.deepEqual(await store.save(credential), { status: "saved" });
  assert.deepEqual(await store.load(), { status: "available", credential });

  const serialized = await fs.readFile(filePath, "utf8");
  const envelope = JSON.parse(serialized);
  assert.deepEqual(Object.keys(envelope).sort(), ["credential", "profileIdentity", "version"]);
  assert.equal(envelope.version, 2);
  assert.deepEqual(envelope.profileIdentity, profile);
  assert.deepEqual(envelope.credential, credential);
});

test("supports owner-only files on Linux without a desktop keyring", async (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX atomic storage is covered by Linux CI");
    return;
  }
  const { store, filePath } = await fixture(t, { platform: "linux" });
  assert.deepEqual(await store.save(credential), { status: "saved" });
  assert.deepEqual(await store.load(), { status: "available", credential });
  assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600);
});

test("requires a native private-directory guard on Windows", () => {
  assert.throws(() => createCredentialStore({
    fs,
    filePath: "C:\\Users\\test\\credential.json",
    profileIdentity: profile,
    platform: "win32",
  }), /secureDirectory is required on Windows/u);
});

test("replaces an existing Windows record through the controlled backup path", async (t) => {
  const { store, filePath } = await fixture(t, { platform: "win32" });
  assert.deepEqual(await store.save(credential), { status: "saved" });
  const rotated = { ...credential, generation: 4, lastConfirmedServerGeneration: 4 };
  assert.deepEqual(await store.save(rotated), { status: "saved" });
  assert.deepEqual(await store.load(), { status: "available", credential: rotated });
  assert.deepEqual(await fs.readdir(path.dirname(filePath)), [path.basename(filePath)]);
});

test("recovers the last confirmed Windows record after a crash between renames", async (t) => {
  const { store, filePath } = await fixture(t, { platform: "win32" });
  await store.save(credential);
  await fs.rename(filePath, `${filePath}.previous`);

  const restarted = createCredentialStore({
    fs,
    filePath,
    profileIdentity: profile,
    platform: "win32",
    secureDirectory: async () => {},
  });
  assert.deepEqual(await restarted.load(), { status: "available", credential });
  assert.deepEqual(await fs.readdir(path.dirname(filePath)), [path.basename(filePath)]);
});

test("Windows removal tombstone prevents previous credentials from reviving", async (t) => {
  for (const failTarget of ["previous", "target"]) {
    const { store, filePath } = await fixture(t, {
      platform: "win32",
      nonce: failTarget === "previous" ? 40 : 41,
    });
    await store.save(credential);
    await fs.copyFile(filePath, `${filePath}.previous`);
    const failingFs = {
      ...fs,
      unlink: async (candidate) => {
        if (
          (failTarget === "previous" && candidate === `${filePath}.previous`) ||
          (failTarget === "target" && candidate === filePath)
        ) {
          throw new Error("injected removal interruption");
        }
        return fs.unlink(candidate);
      },
    };
    const interrupted = createCredentialStore({
      fs: failingFs,
      filePath,
      profileIdentity: profile,
      platform: "win32",
      secureDirectory: async () => {},
    });
    assert.deepEqual(await interrupted.remove(), {
      status: "locked",
      reason: "remove_failed",
    });

    const restarted = createCredentialStore({
      fs,
      filePath,
      profileIdentity: profile,
      platform: "win32",
      secureDirectory: async () => {},
    });
    assert.deepEqual(await restarted.load(), { status: "empty" });
    assert.deepEqual(await fs.readdir(path.dirname(filePath)), []);
  }
});

test("strictly binds credentials to the current profile", async (t) => {
  const { store, filePath } = await fixture(t);
  await store.save(credential);
  const otherProfileStore = createCredentialStore({
    fs,
    filePath,
    profileIdentity: { ...profile, serverInstanceId: "server-2" },
    platform: process.platform,
    secureDirectory: async () => {},
  });
  assert.deepEqual(await otherProfileStore.load(), {
    status: "locked",
    reason: "profile_mismatch",
  });
});

test("freezes the profile identity at store construction", async (t) => {
  const mutableProfile = { ...profile };
  const { store } = await fixture(t, { profileIdentity: mutableProfile });
  mutableProfile.serverInstanceId = "server-mutated";
  assert.deepEqual(await store.save(credential), { status: "saved" });
  assert.deepEqual(await store.load(), { status: "available", credential });
});

test("returns locked for corrupt and obsolete envelopes", async (t) => {
  const { store, filePath } = await fixture(t);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, "not-json", { mode: 0o600 });
  assert.deepEqual(await store.load(), { status: "locked", reason: "corrupt_envelope" });

  await fs.writeFile(
    filePath,
    `${JSON.stringify({ version: 1, ciphertext: "obsolete" })}\n`,
    { mode: 0o600 },
  );
  assert.deepEqual(await store.load(), { status: "locked", reason: "corrupt_envelope" });
});

test("preserves the last confirmed record when a temporary write fails", async (t) => {
  const { store, filePath } = await fixture(t);
  await store.save(credential);
  const original = await fs.readFile(filePath, "utf8");
  const failingFs = {
    ...fs,
    open: async (candidate, flags, mode) => {
      const handle = await fs.open(candidate, flags, mode);
      if (String(candidate).endsWith(".tmp")) {
        return { ...handle, writeFile: async () => { throw new Error("disk full"); } };
      }
      return handle;
    },
  };
  const failingStore = createCredentialStore({
    fs: failingFs, filePath, profileIdentity: profile, platform: process.platform,
    randomBytes: () => Buffer.alloc(12, 4),
    secureDirectory: async () => {},
  });
  assert.deepEqual(await failingStore.save({ ...credential, generation: 4 }), {
    status: "locked", reason: "write_failed",
  });
  assert.equal(await fs.readFile(filePath, "utf8"), original);
});

test("restores the last confirmed record when post-rename directory fsync fails", async (t) => {
  if (process.platform === "win32") {
    t.skip("directory fsync is a POSIX durability boundary");
    return;
  }
  const { store, filePath } = await fixture(t);
  await store.save(credential);
  let directorySyncs = 0;
  const failingFs = {
    ...fs,
    open: async (candidate, flags, mode) => {
      const handle = await fs.open(candidate, flags, mode);
      if (candidate === path.dirname(filePath)) {
        return {
          ...handle,
          sync: async () => {
            directorySyncs += 1;
            if (directorySyncs === 2) throw new Error("directory sync failed");
            return handle.sync();
          },
        };
      }
      return handle;
    },
  };
  const failingStore = createCredentialStore({
    fs: failingFs, filePath, profileIdentity: profile, platform: "darwin",
    randomBytes: () => Buffer.alloc(12, 5),
  });
  assert.deepEqual(await failingStore.save({ ...credential, generation: 4 }), {
    status: "locked", reason: "write_failed",
  });
  assert.deepEqual(await store.load(), { status: "available", credential });
});

test("uses owner-only POSIX permissions and leaves no transaction artifacts", async (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX permissions are covered by macOS and Linux CI");
    return;
  }
  const { store, filePath } = await fixture(t, { platform: "linux" });
  await store.save(credential);
  assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600);
  assert.deepEqual(await fs.readdir(path.dirname(filePath)), [path.basename(filePath)]);
});

test("refuses to read a POSIX credential file exposed to other users", async (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX permissions are covered by macOS and Linux CI");
    return;
  }
  const { store, filePath } = await fixture(t, { platform: "linux" });
  await store.save(credential);
  await fs.chmod(filePath, 0o644);
  assert.deepEqual(await store.load(), { status: "locked", reason: "insecure_permissions" });
});

test("refuses to persist an access token", async (t) => {
  const { store, filePath } = await fixture(t);
  assert.deepEqual(await store.save({ ...credential, accessToken: "yuance_dat_secret" }), {
    status: "locked",
    reason: "invalid_credential",
  });
  await assert.rejects(fs.access(filePath), { code: "ENOENT" });
});

test("rejects unknown fields and access-token aliases instead of using a blacklist", async (t) => {
  const aliases = [
    { accessToken: "yuance_dat_secret" },
    { access_token: "yuance_dat_secret" },
    { AccessToken: "yuance_dat_secret" },
    { currentAccessToken: "yuance_dat_secret" },
    { access: "yuance_dat_secret" },
    { token: { access: "yuance_dat_secret" } },
  ];
  for (const [index, extra] of aliases.entries()) {
    const { store } = await fixture(t, { nonce: 30 + index });
    assert.deepEqual(await store.save({ ...credential, ...extra }), {
      status: "locked",
      reason: "invalid_credential",
    });
  }
});

test("isolates credential files by the hash portion of the profile key", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-profile-store-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const profileWithKey = {
    ...profile,
    key: `yuance-desktop-profile-v1:${"a".repeat(64)}`,
  };
  const store = createProfileCredentialStore({
    fs,
    userDataPath: directory,
    profile: profileWithKey,
    platform: "win32",
    randomBytes: () => Buffer.alloc(12, 9),
    secureDirectory: async () => {},
  });
  assert.deepEqual(await store.save(credential), { status: "saved" });
  assert.deepEqual(await fs.readdir(path.join(directory, "Device Credentials")), [
    `${"a".repeat(64)}.json`,
  ]);
});
