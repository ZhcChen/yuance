import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, "..");
const require = createRequire(import.meta.url);
const electronCliPath = require.resolve("electron/cli.js");

const child = spawn(process.execPath, [electronCliPath, "."], {
  cwd: desktopRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    YUANCE_DESKTOP_CHANNEL: "dev",
  },
});

child.on("error", (error) => {
  console.error("Failed to start Electron development runtime:", error);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
