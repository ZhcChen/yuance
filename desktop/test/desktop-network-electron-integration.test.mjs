import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { assertDesktopNetworkSmokeReport } from "../scripts/smoke-desktop-network.mjs";

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
