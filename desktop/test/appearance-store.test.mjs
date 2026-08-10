import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createAppearanceStore } from "../src/preferences/appearance-store.mjs";

test("appearance store defaults safely and persists a bounded theme", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-appearance-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "Preferences", "appearance.json");
  const store = createAppearanceStore({ fs, filePath, platform: process.platform });
  assert.equal(await store.getTheme(), "light");
  assert.equal(await store.setTheme("dark"), "dark");
  assert.equal(await store.getTheme(), "dark");
  assert.deepEqual(JSON.parse(await fs.readFile(filePath, "utf8")), { theme: "dark" });
  if (process.platform !== "win32") assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600);
  assert.throws(() => store.setTheme("system"), /theme is invalid/);

  await Promise.all([store.setTheme("light"), store.setTheme("dark")]);
  assert.equal(await store.getTheme(), "dark");
});

test("appearance store treats malformed persisted data as light", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-appearance-invalid-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "appearance.json");
  await fs.writeFile(filePath, "not-json", { mode: 0o600 });
  assert.equal(await createAppearanceStore({ fs, filePath }).getTheme(), "light");
});
