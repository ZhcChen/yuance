import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadOrCreateInstallationId } from "../src/auth/installation-id.mjs";

const FIRST = "550e8400-e29b-41d4-a716-446655440000";
const SECOND = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";

test("installation ID is stable and owner-only", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-installation-id-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "state", "installation-id");
  const first = await loadOrCreateInstallationId({ fs, filePath, platform: "darwin", randomUUID: () => FIRST });
  const second = await loadOrCreateInstallationId({ fs, filePath, platform: "darwin", randomUUID: () => SECOND });

  assert.equal(first, FIRST);
  assert.equal(second, FIRST);
  assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600);
});

test("installation ID atomically replaces a truncated file", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-installation-id-invalid-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "installation-id");
  await fs.writeFile(filePath, "truncated", { mode: 0o600 });

  assert.equal(
    await loadOrCreateInstallationId({ fs, filePath, platform: "darwin", randomUUID: () => SECOND }),
    SECOND,
  );
  assert.equal((await fs.readFile(filePath, "utf8")).trim(), SECOND);
  assert.deepEqual(await fs.readdir(directory), ["installation-id"]);
});

test("Windows installation ID replaces a damaged target through a backup", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-installation-id-win-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "installation-id");
  await fs.writeFile(filePath, "truncated", { mode: 0o600 });

  assert.equal(
    await loadOrCreateInstallationId({ fs, filePath, platform: "win32", randomUUID: () => SECOND }),
    SECOND,
  );
  assert.equal((await fs.readFile(filePath, "utf8")).trim(), SECOND);
  assert.deepEqual(await fs.readdir(directory), ["installation-id"]);
});

test("Windows installation ID recovers a backup left between renames", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-installation-id-win-recovery-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "installation-id");
  await fs.writeFile(`${filePath}.previous`, `${FIRST}\n`, { mode: 0o600 });

  assert.equal(
    await loadOrCreateInstallationId({ fs, filePath, platform: "win32", randomUUID: () => SECOND }),
    FIRST,
  );
  assert.deepEqual(await fs.readdir(directory), ["installation-id"]);
});
