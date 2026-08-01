import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import electron from "electron";

test("Electron headless persists, recovers, and revokes a device session", { timeout: 45_000 }, async (t) => {
  const capability = await runElectron(["--safe-storage-smoke"]);
  const smoke = JSON.parse(capability.stdout.trim().split("\n").at(-1));
  if (smoke.status !== "available") {
    t.skip(`safeStorage unavailable with backend ${smoke.backend}`);
    return;
  }

  const state = { exchanges: 0, probes: 0, refreshes: 0, logouts: 0, failNextLogout: false };
  const server = http.createServer(async (request, response) => {
    const body = await readJson(request);
    response.setHeader("content-type", "application/json");
    response.setHeader("cache-control", "private, no-store");
    if (request.url === "/api/v1/device-authorizations" && request.method === "POST") {
      return send(response, 201, { data: {
        device_code: "yuance_dc_electron-integration-device-code",
        user_code: "ABCD-EFGH",
        verification_path: "/web/device-authorization",
        expires_in: 600,
        interval: 1,
        server_instance_id: "electron-integration-server",
      } });
    }
    if (request.url === "/api/v1/device-authorizations/exchange" && request.method === "POST") {
      state.exchanges += 1;
      assert.equal(typeof body.exchange_transaction_id, "string");
      if (state.exchanges === 1) {
        response.setHeader("retry-after", "1");
        return send(response, 400, { error: { code: "authorization_pending", message: "pending", retry_after: 1 } });
      }
      return send(response, 200, { data: credentials(0) });
    }
    if (request.url === "/api/v1/device-session" && request.method === "GET") {
      state.probes += 1;
      assert.match(request.headers.authorization || "", /^Bearer yuance_dat_/);
      return send(response, 200, { data: {
        user_id: 7,
        username: "electron-user",
        display_name: "Electron User",
        device_id: "electron-device",
        family_id: "electron-family",
        generation: 0,
        authorization_version: 1,
        access_expires_at: new Date(Date.now() + 300_000).toISOString(),
        server_instance_id: "electron-integration-server",
      } });
    }
    if (request.url === "/api/v1/device-session/logout" && request.method === "POST") {
      state.logouts += 1;
      assert.match(request.headers.authorization || "", /^Bearer yuance_dat_/);
      if (state.failNextLogout) {
        state.failNextLogout = false;
        return send(response, 503, { error: { code: "temporarily_unavailable", message: "retry" } });
      }
      return send(response, 200, { data: { revoked: true, family_id: "electron-family" } });
    }
    if (request.url === "/api/v1/device-sessions/refresh" && request.method === "POST") {
      state.refreshes += 1;
      return send(response, 200, { data: credentials(body.generation + 1) });
    }
    return send(response, 404, { error: { code: "not_found", message: "not found" } });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-device-auth-electron-"));
  t.after(() => fs.rm(userDataPath, { recursive: true, force: true }));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const args = [
    "--device-auth-headless",
    "--server-instance-id=electron-integration-server",
    `--user-data-path=${userDataPath}`,
    "--no-open-external",
  ];
  const env = { YUANCE_DESKTOP_CHANNEL: "dev", YUANCE_DESKTOP_WEB_URL: endpoint };

  const authorized = await runElectron(args, env);
  assert.match(authorized.stdout, /user_code=ABCD-EFGH/);
  assert.match(authorized.stdout, /"status":"authenticated"/);
  assert.equal(state.exchanges, 2);

  const filesAfterAuthorization = await readTree(userDataPath);
  assert.ok(filesAfterAuthorization.length > 0);
  const disk = Buffer.concat(filesAfterAuthorization).toString("latin1");
  assert.equal(disk.includes("yuance_dat_electron-access-token-value"), false);
  assert.equal(disk.includes("yuance_drt_electron-refresh-token-value"), false);

  const recovered = await runElectron(args, env);
  assert.match(recovered.stdout, /"recovered":true/);
  assert.ok(state.probes >= 1);

  state.failNextLogout = true;
  await assert.rejects(runElectron([...args, "--device-auth-action=logout"], env), /retry/);
  const loggedOut = await runElectron([...args, "--device-auth-action=logout"], env);
  assert.match(loggedOut.stdout, /"loggedOut":true/);
  assert.match(loggedOut.stdout, /"recovered":true/);
  assert.equal(state.refreshes, 2);
  assert.equal(state.logouts, 2);
});

function credentials(generation) {
  const metadata = (audience) => ({
    token_type: "Bearer",
    issuer: "yuance-device-session",
    audience,
    device_id: "electron-device",
    family_id: "electron-family",
    generation,
    authorization_version: 1,
  });
  return {
    access_token: `yuance_dat_electron-access-token-value-${generation}`,
    refresh_token: `yuance_drt_electron-refresh-token-value-${generation}`,
    access_expires_in: 300,
    refresh_expires_in: 3600,
    access: metadata("yuance-api"),
    refresh: metadata("yuance-device-refresh"),
  };
}

function runElectron(args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const runtimeArgs = [".", ...args, ...(process.platform === "linux" ? ["--no-sandbox"] : [])];
    const child = spawn(electron, runtimeArgs, {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Electron exited with ${signal || code}: ${stderr || stdout}`));
    });
  });
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
}

function send(response, status, value) {
  response.statusCode = status;
  response.end(JSON.stringify(value));
}

async function readTree(root) {
  const buffers = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) buffers.push(...await readTree(target));
    else if (entry.isFile()) buffers.push(await fs.readFile(target));
  }
  return buffers;
}
