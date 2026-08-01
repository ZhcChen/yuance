import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createProfileCredentialStore } from "./credential-store.mjs";
import { createDesktopProfile } from "./profile.mjs";

export async function runSafeStorageSmoke({ safeStorage, platform = process.platform }) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-safe-storage-smoke-"));
  try {
    const profile = createDesktopProfile({
      endpoint: "https://safe-storage-smoke.invalid",
      serverInstanceId: "safe-storage-smoke",
    });
    const store = createProfileCredentialStore({
      safeStorage,
      fs,
      userDataPath: directory,
      profile,
      platform,
    });
    const capability = store.availability();
    const backend =
      platform === "linux"
        ? String(safeStorage.getSelectedStorageBackend?.() || "unknown")
        : "platform-native";

    if (capability.status === "available") {
      const credential = {
        userId: "smoke-user",
        deviceId: "smoke-device",
        familyId: "smoke-family",
        generation: 0,
        refreshToken: ["yuance", "drt", "smoke-only"].join("_"),
        pendingRotation: null,
        lastConfirmedServerGeneration: 0,
      };
      assert.deepEqual(await store.save(credential), { status: "saved" });
      assert.deepEqual(await store.load(), { status: "available", credential });
      assert.deepEqual(await store.remove(), { status: "removed" });
    } else if (platform === "linux") {
      assert.ok(["insecure_backend", "encryption_unavailable"].includes(capability.reason));
      assert.deepEqual(
        await store.save({ refreshToken: ["yuance", "drt", "never-written"].join("_") }),
        capability,
      );
    } else {
      throw new Error(`safeStorage unavailable on ${platform}: ${capability.reason}`);
    }

    return { platform, backend, status: capability.status };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
