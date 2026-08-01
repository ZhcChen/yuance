import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import electron from "electron";

import { startNetworkFixture } from "./support/network-fixture.mjs";

test("Electron session.fetch honors direct, proxy, PAC, 407, redirect, and TLS boundaries", {
  timeout: 60_000,
}, async (t) => {
  const fixture = await startNetworkFixture();
  t.after(() => fixture.close());

  const directRequestCount = fixture.state.enrollmentRequests;
  const direct = await runElectron("direct", fixture.targetOrigin, [
    "--seed-cookie",
    "--seed-auth-cache",
    "--repeat=2",
  ]);
  assert.equal(direct.ok, true, JSON.stringify(direct));
  assert.equal(direct.partition, "persist:yuance-network-development-v1");
  assert.equal(direct.profile.serverInstanceId, "electron-network-test");
  assert.deepEqual(direct.observations, [{
    method: "GET",
    path: "/.well-known/yuance-desktop",
    status: 200,
  }, {
    method: "GET",
    path: "/.well-known/yuance-desktop",
    status: 200,
  }]);
  assert.equal(direct.cookieCount, 0);
  assert.equal(fixture.state.enrollmentRequests - directRequestCount, 2);
  assert.deepEqual(fixture.state.cookieHeaders.slice(-2), ["", ""]);
  assert.ok(fixture.state.authorizationHeaders.some((value) => value.startsWith("Basic ")));
  assert.deepEqual(fixture.state.authorizationHeaders.slice(-2), ["", ""]);

  const proxy = await runElectron("proxy", fixture.targetOrigin, [`--proxy-rules=${fixture.proxyRules}`]);
  assert.equal(proxy.ok, true, JSON.stringify(proxy));
  assert.ok(fixture.state.proxyRequests >= 1);

  const pac = await runElectron("pac", fixture.targetOrigin, [`--pac-script=${fixture.pacUrl}`]);
  assert.equal(pac.ok, true, JSON.stringify(pac));
  assert.ok(fixture.state.pacRequests >= 1);

  const rejected = await runElectron("proxy-407", fixture.targetOrigin, [
    `--proxy-rules=${fixture.rejectingProxyRules}`,
  ]);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "http_error");
  assert.equal(rejected.status, 407);

  const targetRequestsBeforeRedirect = fixture.state.targetRequests;
  const redirected = await runElectron("redirect", fixture.redirectOrigin);
  assert.equal(redirected.ok, false);
  assert.equal(redirected.code, "network_error");
  assert.equal(fixture.state.targetRequests, targetRequestsBeforeRedirect);

  const untrustedTls = await runElectron("untrusted-tls", fixture.tlsOrigin);
  assert.equal(untrustedTls.ok, false);
  assert.equal(untrustedTls.code, "network_error");
});

async function runElectron(label, origin, extraArgs = []) {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-network-electron-"));
  try {
    const driverApp = new URL("./support/network-electron-app/", import.meta.url);
    const args = [
      fileURLToPath(driverApp),
      "--mode=development",
      `--origin=${origin}`,
      `--user-data-path=${userDataPath}`,
      ...extraArgs,
      ...(process.platform === "linux" ? ["--no-sandbox"] : []),
    ];
    const output = await spawnAndCollect(electron, args, label);
    if (!output.stdout.trim()) {
      throw new Error(`Electron ${label} produced no result: ${output.stderr}`);
    }
    return JSON.parse(output.stdout.trim().split("\n").at(-1));
  } finally {
    await fs.rm(userDataPath, { recursive: true, force: true });
  }
}

function spawnAndCollect(command, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: new URL("..", import.meta.url),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Electron ${label} scenario timed out: ${stderr || stdout}`));
    }, 15_000);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Electron ${label} exited with ${signal || code}: ${stderr || stdout}`));
    });
  });
}
