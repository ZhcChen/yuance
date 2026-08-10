import crypto from "node:crypto";
import path from "node:path";

export const RESOURCE_MANIFEST_VERSION = 1;

function validateRelativePath(relativePath) {
  const segments = relativePath.split("/");
  if (
    !relativePath ||
    path.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.includes("\0") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Invalid renderer resource path: ${relativePath}`);
  }
  return relativePath;
}

function toCanonicalRelativePath(relativePath) {
  return validateRelativePath(relativePath.split(path.sep).join("/"));
}

function toManifestPath(relativePath) {
  return `/${relativePath}`;
}

async function collectFiles({ fs, rootDirectory, currentDirectory, files }) {
  const entries = await fs.readdir(currentDirectory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const absolutePath = path.join(currentDirectory, entry.name);
    const relativePath = toCanonicalRelativePath(path.relative(rootDirectory, absolutePath));

    const stats = await fs.lstat(absolutePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`Renderer resources cannot contain symbolic links: ${relativePath}`);
    }
    if (stats.isDirectory()) {
      await collectFiles({ fs, rootDirectory, currentDirectory: absolutePath, files });
      continue;
    }
    if (!stats.isFile()) {
      throw new Error(`Renderer resources must be regular files: ${relativePath}`);
    }

    const manifestPath = toManifestPath(relativePath);
    if (files[manifestPath]) {
      throw new Error(`Duplicate renderer resource path: ${manifestPath}`);
    }
    const contents = await fs.readFile(absolutePath);
    files[manifestPath] = Object.freeze({
      bytes: contents.byteLength,
      sha256: crypto.createHash("sha256").update(contents).digest("hex"),
      relativePath,
    });
  }
}

export async function createResourceManifest({ fs, rootDirectory, entrypoint = "index.html" }) {
  const rootStats = await fs.lstat(rootDirectory);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error("Renderer resource root must be a real directory.");
  }

  const canonicalEntrypoint = validateRelativePath(entrypoint);
  const files = Object.create(null);
  await collectFiles({ fs, rootDirectory, currentDirectory: rootDirectory, files });

  const entrypointPath = toManifestPath(canonicalEntrypoint);
  if (!files[entrypointPath]) {
    throw new Error(`Renderer entrypoint is missing: ${entrypoint}`);
  }

  return Object.freeze({
    version: RESOURCE_MANIFEST_VERSION,
    entrypoint: entrypointPath,
    files: Object.freeze(files),
  });
}

export function validateResourceManifest(manifest) {
  if (!manifest || manifest.version !== RESOURCE_MANIFEST_VERSION) {
    throw new Error("Unsupported renderer resource manifest version.");
  }
  if (typeof manifest.entrypoint !== "string" || !manifest.files?.[manifest.entrypoint]) {
    throw new Error("Renderer resource manifest entrypoint is invalid.");
  }

  const relativePaths = new Set();
  for (const [resourcePath, entry] of Object.entries(manifest.files)) {
    if (
      !entry ||
      typeof entry.relativePath !== "string" ||
      (() => {
        try {
          validateRelativePath(entry.relativePath);
          return false;
        } catch (_error) {
          return true;
        }
      })() ||
      resourcePath !== `/${entry.relativePath}` ||
      relativePaths.has(entry.relativePath) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    ) {
      throw new Error(`Renderer resource manifest entry is invalid: ${resourcePath}`);
    }
    relativePaths.add(entry.relativePath);
  }
  return manifest;
}
