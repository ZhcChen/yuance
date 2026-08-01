import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scanner = new URL("../scripts/scan-credential-leaks.mjs", import.meta.url);

test("credential leak scanner accepts clean artifacts and rejects complete credentials", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-leak-scan-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const artifact = path.join(directory, "app.asar");

  await fs.writeFile(artifact, "runtime artifact without credentials");
  const clean = await execFileAsync(process.execPath, [scanner.pathname, directory]);
  assert.match(clean.stdout, /credential leak scan passed/);

  await fs.writeFile(artifact, "yuance_drt_fixture-refresh-token-value-0123456789");
  await assert.rejects(
    execFileAsync(process.execPath, [scanner.pathname, directory]),
    (error) => error.code === 1 && /device refresh token/.test(error.stderr),
  );

  await assert.rejects(
    execFileAsync(process.execPath, [scanner.pathname, path.join(directory, "missing")]),
    (error) => error.code === 1 && /scan root is missing/.test(error.stderr),
  );
});
