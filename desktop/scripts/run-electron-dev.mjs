import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, "..");
const require = createRequire(import.meta.url);
const electronCliPath = require.resolve("electron/cli.js");
const viteCliPath = path.join(path.dirname(require.resolve("vite/package.json")), "bin", "vite.js");
const rendererUrl = process.env.YUANCE_DESKTOP_RENDERER_URL || "http://127.0.0.1:4273";
const parsedRendererUrl = new URL(rendererUrl);
if (
  parsedRendererUrl.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "[::1]"].includes(parsedRendererUrl.hostname) ||
  !parsedRendererUrl.port ||
  parsedRendererUrl.pathname !== "/" ||
  parsedRendererUrl.search ||
  parsedRendererUrl.hash ||
  parsedRendererUrl.username ||
  parsedRendererUrl.password
) {
  throw new Error("YUANCE_DESKTOP_RENDERER_URL must be a loopback HTTP origin with a port.");
}
const viteHost = parsedRendererUrl.hostname.replace(/^\[|\]$/g, "");

function assertPortAvailable(host, port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => {
      reject(new Error(`Renderer dev server port is unavailable (${host}:${port}): ${error.message}`));
    });
    server.listen({ host, port: Number(port), exclusive: true }, () => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });
}

async function waitForRenderer(url, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      await response.body?.cancel();
      return;
    } catch (_error) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Renderer dev server did not become ready: ${url}`);
}

await assertPortAvailable(viteHost, parsedRendererUrl.port);

const vite = spawn(
  process.execPath,
  [viteCliPath, "--host", viteHost, "--port", parsedRendererUrl.port, "--strictPort"],
  {
    cwd: desktopRoot,
    stdio: "inherit",
    env: process.env,
  },
);

const viteStartupFailure = new Promise((_, reject) => {
  vite.once("error", reject);
  vite.once("exit", (code, signal) => {
    reject(new Error(`Vite exited before Electron startup (${signal || code || 0}).`));
  });
});

let child;
let viteFailed = false;
let shuttingDown = false;
try {
  await Promise.race([waitForRenderer(rendererUrl), viteStartupFailure]);
  if (vite.exitCode !== null || vite.signalCode !== null) {
    throw new Error("Vite exited before Electron startup.");
  }
  child = spawn(process.execPath, [electronCliPath, "."], {
    cwd: desktopRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      YUANCE_DESKTOP_RENDERER_URL: rendererUrl,
    },
  });
} catch (error) {
  vite.kill();
  console.error("Failed to start Electron development runtime:", error);
  process.exit(1);
}

function stopVite() {
  shuttingDown = true;
  if (!vite.killed) vite.kill();
}

vite.once("exit", (code, signal) => {
  if (shuttingDown || !child) return;
  viteFailed = true;
  console.error(`Renderer dev server exited unexpectedly (${signal || code || 0}).`);
  if (!child.killed) child.kill();
});

child.on("error", (error) => {
  stopVite();
  console.error("Failed to start Electron development runtime:", error);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  stopVite();
  if (viteFailed) {
    process.exit(1);
    return;
  }
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
