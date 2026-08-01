import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { assertDesktopNetworkSmokeReport } from "../scripts/smoke-desktop-network.mjs";
import { verifyDesktopNetworkArtifacts } from "../scripts/verify-desktop-network-artifacts.mjs";

function validReport() {
  return {
    kind: "yuance-desktop-network-smoke", recovered: true, probe: true,
    firstStream: true, rotated: true, secondStream: true, loggedOut: true,
    revokeResponseToEofMs: 900,
    publicAuthStates: ["authenticated", "unauthenticated"],
  };
}

test("accepts only complete credential-free packaged network reports", () => {
  assert.equal(assertDesktopNetworkSmokeReport(validReport()).kind, "yuance-desktop-network-smoke");
  for (const mutation of [
    { recovered: false }, { probe: false }, { firstStream: false }, { rotated: false },
    { secondStream: false }, { loggedOut: false }, { revokeResponseToEofMs: 5_000 },
    { diagnostic: "Authorization: Bearer secret" }, { diagnostic: "yuance_dat_secret" },
    { diagnostic: "device_code=secret" }, { diagnostic: "csrf=secret" },
  ]) {
    assert.throws(() => assertDesktopNetworkSmokeReport({ ...validReport(), ...mutation }), /invariant failed/);
  }
});

test("packaged smoke source restricts endpoint override to exact loopback HTTP", async () => {
  const source = await fs.readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
  assert.match(source, /origin\.protocol !== "http:"/u);
  assert.match(source, /origin\.hostname !== "127\.0\.0\.1"/u);
  assert.match(source, /origin\.pathname !== "\/"/u);
  assert.doesNotMatch(source, /desktopNetworkSmokeOrigin\s*=\s*process\.env/u);
  assert.match(source, /desktopNetworkSmokePhase \? `\$\{appIdentity\.displayName\} Network Smoke`/u);
});

test("packaged smoke preserves only scanned logs and records cleanup", async () => {
  const source = await fs.readFile(new URL("../scripts/smoke-desktop-network.mjs", import.meta.url), "utf8");
  assert.match(source, /assertCredentialFreeText\(log, "API fixture log"\)/u);
  assert.match(source, /desktop-network-api\.log/u);
  assert.match(source, /apiProcess: "stopped", profile: "removed"/u);
});

test("verification artifacts require smoke, scanned log, and cleanup evidence", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-network-artifacts-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await Promise.all([
    fs.writeFile(path.join(root, "desktop-network-smoke.json"), JSON.stringify(validReport())),
    fs.writeFile(path.join(root, "desktop-network-cleanup.json"), JSON.stringify({ kind: "yuance-desktop-network-cleanup", apiProcess: "stopped", profile: "removed" })),
    fs.writeFile(path.join(root, "desktop-network-api.log"), ""),
  ]);
  assert.equal((await verifyDesktopNetworkArtifacts(root)).cleanup.apiProcess, "stopped");
  await fs.rm(path.join(root, "desktop-network-api.log"));
  await assert.rejects(verifyDesktopNetworkArtifacts(root), /ENOENT/u);
});
