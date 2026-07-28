import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseReleaseAssetName,
  validateReleaseAssets,
} from "../src/release-assets.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, "..");
const packageJson = JSON.parse(
  await readFile(path.join(desktopRoot, "package.json"), "utf8"),
);
const version = packageJson.version;
const args = process.argv.slice(2);
const sourceDir = path.resolve(args.find((argument) => !argument.startsWith("--")) || path.join(desktopRoot, "dist"));
const targetDir = path.resolve(
  args.filter((argument) => !argument.startsWith("--"))[1] || path.join(desktopRoot, ".artifacts", "release-assets"),
);
const requireComplete = args.includes("--require-complete");

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

async function main() {
  const files = await listFiles(sourceDir);
  const assets = files
    .map((filePath) => {
      const descriptor = parseReleaseAssetName(path.basename(filePath), version);
      return descriptor ? { ...descriptor, filePath } : null;
    })
    .filter(Boolean);
  const assetsByKey = validateReleaseAssets(assets, { requireComplete });

  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  for (const asset of [...assetsByKey.values()].sort((left, right) => left.key.localeCompare(right.key))) {
    await copyFile(asset.filePath, path.join(targetDir, asset.canonicalName));
  }
  console.log(`Collected ${assetsByKey.size} desktop release asset(s) into ${targetDir}.`);
}

main().catch((error) => {
  console.error(`::error title=collect-release-assets::${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
