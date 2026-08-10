import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, "..");
const require = createRequire(import.meta.url);
const electronBuilderCli = require.resolve("electron-builder/out/cli/cli.js");
const buildRendererScript = path.join(scriptDir, "build-renderer.mjs");
const args = process.argv.slice(2);

if (args[0] === "--") {
  args.shift();
}

const rendererBuild = spawn(process.execPath, [buildRendererScript], {
  cwd: desktopRoot,
  stdio: "inherit",
});
const rendererBuildExit = await new Promise((resolve, reject) => {
  rendererBuild.once("error", reject);
  rendererBuild.once("exit", (code, signal) => resolve({ code, signal }));
});
if (rendererBuildExit.signal) process.kill(process.pid, rendererBuildExit.signal);
if (rendererBuildExit.code !== 0) process.exit(rendererBuildExit.code ?? 1);

const child = spawn(
  process.execPath,
  [electronBuilderCli, "--config", "electron-builder.yml", "--publish", "never", ...args],
  {
    cwd: desktopRoot,
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  console.error("Failed to start electron-builder:", error);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
