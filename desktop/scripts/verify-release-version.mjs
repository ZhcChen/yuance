import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, "..");
const packageJson = JSON.parse(
  await readFile(path.join(desktopRoot, "package.json"), "utf8"),
);
const rawTag = process.env.RELEASE_TAG || process.argv[2];

if (!rawTag) {
  throw new Error("Missing release tag. Provide RELEASE_TAG or argv[2].");
}

const tag = rawTag.replace(/^refs\/tags\//, "");
const expectedTag = `desktop-v${packageJson.version}`;
if (tag !== expectedTag) {
  throw new Error(`Release tag ${tag} does not match ${expectedTag}.`);
}

console.log(`Verified ${tag} matches desktop version ${packageJson.version}.`);
