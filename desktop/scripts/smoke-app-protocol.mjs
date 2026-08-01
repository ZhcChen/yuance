import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function listFiles(root) {
  const pending = [root];
  const files = [];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile()) files.push(entryPath);
    }
  }
  return files;
}

export async function findUnpackedExecutable(root, platform = process.platform) {
  const files = await listFiles(root);
  const candidates = files.filter((filePath) => {
    const normalized = filePath.replaceAll("\\", "/");
    if (platform === "darwin") {
      return /\.app\/Contents\/MacOS\/[^/]+$/u.test(normalized) && !normalized.includes("/Frameworks/");
    }
    if (platform === "win32") return /win[^/]*-unpacked\/[^/]+\.exe$/iu.test(normalized) && !/uninstall/iu.test(normalized);
    return /linux[^/]*-unpacked\/yuance$/u.test(normalized);
  });
  if (candidates.length !== 1) {
    throw new Error(`Expected exactly one unpacked executable for ${platform}, found ${candidates.length}.`);
  }
  return candidates[0];
}

export async function smokeAppProtocol(inputPath, { platform = process.platform, timeoutMs = 30_000 } = {}) {
  const executable = await findUnpackedExecutable(inputPath, platform);
  const args = ["--app-protocol-smoke", ...(platform === "linux" ? ["--no-sandbox"] : [])];
  const child = spawn(executable, args, {
    cwd: path.dirname(executable),
    env: {
      ...process.env,
      YUANCE_DESKTOP_CHANNEL: "dev",
      YUANCE_DESKTOP_RENDERER_URL: "http://127.0.0.1:9",
      YUANCE_DESKTOP_WEB_URL: "http://127.0.0.1:9",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const timeout = setTimeout(() => child.kill(), timeoutMs);
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  }).finally(() => clearTimeout(timeout));
  if (result.code !== 0 || result.signal) {
    throw new Error(`Unpacked app smoke failed (${result.signal || result.code}): ${stderr || stdout}`);
  }
  const reportLine = stdout.split(/\r?\n/u).find((line) => line.includes('"kind":"yuance-app-protocol-smoke"'));
  if (!reportLine) throw new Error(`Unpacked app smoke report is missing: ${stderr || stdout}`);
  const report = JSON.parse(reportLine);
  if (
    report.url !== "app://yuance/" ||
    report.hostState !== "unauthenticated" ||
    report.externalRequestCount !== 0
  ) {
    throw new Error(`Unpacked app smoke invariant failed: ${JSON.stringify(report)}`);
  }
  return Object.freeze({ executable, report });
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const inputPath = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist"));
  smokeAppProtocol(inputPath)
    .then(({ executable }) => console.log(`Verified app:// smoke with ${executable}.`))
    .catch((error) => {
      console.error(`App protocol smoke failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
