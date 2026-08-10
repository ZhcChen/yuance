import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createDatabaseStatsCacheStore } from "../src/preferences/database-stats-cache-store.mjs";

const snapshot = { refreshed_at: "2026-08-08T00:00:00Z", tables: [{ table_name: "users", remark: "用户账号", row_count: 2, column_count: 1, columns: [{ name: "id", data_type: "INTEGER", required: true, primary_key: true, default_value: null }] }] };

test("database stats cache persists bounded snapshots per user", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-database-stats-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "Preferences", "database-stats.json");
  const store = createDatabaseStatsCacheStore({ fs, filePath });
  assert.equal(await store.read("admin"), null);
  assert.deepEqual(await store.write("admin", snapshot), snapshot);
  assert.deepEqual(await store.read("admin"), snapshot);
  assert.equal(await store.read("other"), null);
  if (process.platform !== "win32") assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600);
  assert.throws(() => store.write("../admin", snapshot), /username/i);
  assert.throws(() => store.write("admin", { ...snapshot, secret: "no" }), /snapshot/i);
});

test("database stats cache ignores malformed persisted data", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-database-stats-invalid-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "database-stats.json");
  await fs.writeFile(filePath, "not-json");
  assert.equal(await createDatabaseStatsCacheStore({ fs, filePath }).read("admin"), null);
});
