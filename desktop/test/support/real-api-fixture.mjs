import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export async function startRealApiFixture({ repoRoot = DEFAULT_REPO_ROOT, fetchImpl = fetch } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-real-api-"));
  const databasePath = path.join(root, "yuance.db");
  const logPath = path.join(root, "api.log");
  const port = await reserveLoopbackPort();
  const origin = `http://127.0.0.1:${port}`;
  const binary = path.join(repoRoot, "target", "debug", process.platform === "win32" ? "yuance-api.exe" : "yuance-api");
  const env = {
    ...process.env,
    YUANCE_ENV: "test",
    YUANCE_DATABASE_URL: `sqlite://${databasePath}?mode=rwc`,
    YUANCE_DATA_DIR: root,
    YUANCE_SESSION_SECRET: "desktop-network-fixture-session-secret",
    YUANCE_SECURITY_MASTER_KEY: "desktop-network-fixture-master-key-32-bytes",
    YUANCE_SERVER_INSTANCE_ID: "desktop-network-fixture",
    YUANCE_DEVICE_POLL_INTERVAL: "2s",
    YUANCE_LOG_LEVEL: "warn",
  };
  let child;
  let logStream;
  let stopped = false;
  try {
    await run(path.join(repoRoot, "target", "debug", process.platform === "win32" ? "yuance-api.exe" : "yuance-api"), ["migrate", "up"], { cwd: repoRoot, env });
    child = spawn(binary, ["serve", `--http-addr=127.0.0.1:${port}`], { cwd: repoRoot, env, stdio: ["ignore", "pipe", "pipe"] });
    logStream = createWriteStream(logPath, { flags: "a", mode: 0o600 });
    child.stdout.pipe(logStream, { end: false });
    child.stderr.pipe(logStream, { end: false });
    await waitForReady(origin, child, fetchImpl);
    return Object.freeze({
      origin,
      serverInstanceId: "desktop-network-fixture",
      root,
      logPath,
      async bootstrapAdmin() {
        const response = await fetchImpl(`${origin}/api/v1/bootstrap/init`, {
          method: "POST", redirect: "manual", headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: "desktop_admin", display_name: "Desktop Admin", password: "DesktopAdmin2026!", password_confirm: "DesktopAdmin2026!" }),
        });
        if (response.status !== 201) throw new Error(`API bootstrap failed with ${response.status}`);
        const cookies = response.headers.getSetCookie?.() ?? [];
        const csrfToken = response.headers.get("x-yuance-csrf-token") || (await response.json()).data?.csrf_token;
        return Object.freeze({ cookie: cookies.map(cookiePair).join("; "), csrfToken });
      },
      async activateTestStorage(session) {
        const body = new URLSearchParams({
          _csrf: session.csrfToken,
          endpoint: "memory://yuance-tests",
          region: "test",
          bucket: "desktop-file-canary",
          access_key_id: "DesktopFileFixtureAccessKey",
          access_key_secret: "DesktopFileFixtureSecret2026",
          activate: "on",
        });
        const response = await fetchImpl(`${origin}/web/system/storage`, {
          method: "POST",
          redirect: "manual",
          headers: { cookie: session.cookie, "content-type": "application/x-www-form-urlencoded" },
          body,
        });
        if (response.status !== 200) throw new Error(`test storage activation failed with ${response.status}`);
      },
      async stop({ beforeRemove = async () => {} } = {}) {
        if (stopped) return;
        stopped = true;
        try {
          await stopChild(child);
          await endStream(logStream);
          await beforeRemove(Object.freeze({ root, logPath }));
        } finally {
          await fs.rm(root, { recursive: true, force: true });
        }
      },
    });
  } catch (error) {
    await stopChild(child);
    if (logStream) await endStream(logStream);
    await fs.rm(root, { recursive: true, force: true });
    throw error;
  }
}

export async function buildRealApi({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  await run("cargo", ["build", "--manifest-path", path.join(repoRoot, "api", "Cargo.toml"), "--bin", "yuance-api"], { cwd: repoRoot, env: process.env });
}

async function waitForReady(origin, child, fetchImpl) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API exited before ready with ${child.exitCode}`);
    try { const response = await fetchImpl(`${origin}/api/readyz`); if (response.status === 200) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("API readiness timed out");
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited with ${code}: ${stderr}`)));
  });
}

function stopChild(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => { child.kill("SIGKILL"); }, 4_000);
    child.once("exit", finish);
    child.kill("SIGTERM");
    if (child.exitCode !== null) finish();
  });
}

function cookiePair(value) { return value.split(";", 1)[0]; }
function endStream(stream) {
  if (stream.closed) return Promise.resolve();
  return new Promise((resolve) => stream.end(resolve));
}
