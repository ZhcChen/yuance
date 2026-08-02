import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "src", "native");
const expected = Object.freeze({
  x64: "index.win32-x64-msvc.node",
  arm64: "index.win32-arm64-msvc.node",
});

await fs.mkdir(outputDirectory, { recursive: true });
for (const name of await fs.readdir(outputDirectory)) {
  if (/^index\..+\.node$/.test(name) || name === "index.d.ts") await fs.unlink(path.join(outputDirectory, name));
}

if (process.platform !== "win32") process.exit(0);
const expectedName = expected[process.arch];
if (!expectedName) throw new Error("Unsupported Windows architecture for file guard");

await run("cargo", [
  "build",
  "--release",
  "--manifest-path",
  "native/file-guard/Cargo.toml",
], root);
await fs.copyFile(
  path.join(root, "native", "file-guard", "target", "release", "yuance_file_guard.dll"),
  path.join(outputDirectory, expectedName),
);

const outputs = (await fs.readdir(outputDirectory)).filter((name) => name.endsWith(".node"));
if (outputs.length !== 1 || outputs[0] !== expectedName) throw new Error("File guard build output does not match the current platform");
await fs.unlink(path.join(outputDirectory, "index.d.ts")).catch((error) => {
  if (error?.code !== "ENOENT") throw error;
});

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`File guard build failed (${signal ?? code})`));
    });
  });
}
