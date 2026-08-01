import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

import { createResourceManifest } from "../src/protocol/resource-manifest.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, "..");
const rendererRoot = path.join(desktopRoot, "renderer-dist");

export async function buildRendererResources() {
  await build({ configFile: path.join(desktopRoot, "vite.config.js") });
  const manifest = await createResourceManifest({ fs, rootDirectory: rendererRoot });
  await fs.writeFile(
    path.join(rendererRoot, "resource-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  return manifest;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  buildRendererResources().catch((error) => {
    console.error(`Renderer build failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
