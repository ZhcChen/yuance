import crypto from "node:crypto";
import path from "node:path";

import { resolveAppProtocolRequest } from "./app-protocol.mjs";
import { validateResourceManifest } from "./resource-manifest.mjs";

function errorResponse(status) {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function readVerifiedResource({ fs, rendererRoot, resource }) {
  const resourcePath = path.join(rendererRoot, ...resource.relativePath.split("/"));
  const stats = await fs.lstat(resourcePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`Renderer resource is not a regular file: ${resource.relativePath}`);
  }
  const contents = await fs.readFile(resourcePath);
  const digest = crypto.createHash("sha256").update(contents).digest("hex");
  if (contents.byteLength !== resource.bytes || digest !== resource.sha256) {
    throw new Error(`Renderer resource integrity check failed: ${resource.relativePath}`);
  }
  return contents;
}

export async function verifyManifestResources({ fs, rendererRoot, manifest }) {
  const validatedManifest = validateResourceManifest(manifest);
  for (const resource of Object.values(validatedManifest.files)) {
    await readVerifiedResource({ fs, rendererRoot, resource });
  }
  return validatedManifest;
}

export async function loadResourceManifest({ fs, manifestPath }) {
  const contents = await fs.readFile(manifestPath, "utf8");
  return validateResourceManifest(JSON.parse(contents));
}

export function createAppProtocolHandler({ fs, rendererRoot, manifest, previewHandler }) {
  const validatedManifest = validateResourceManifest(manifest);
  if (previewHandler !== undefined && typeof previewHandler !== "function") throw new TypeError("previewHandler must be a function");

  return async (request) => {
    if (previewHandler && isPreviewRequest(request)) return previewHandler(request);
    const resolution = resolveAppProtocolRequest(request, validatedManifest);
    if (!resolution.ok) return errorResponse(resolution.status);

    let contents;
    try {
      contents = await readVerifiedResource({ fs, rendererRoot, resource: resolution.resource });
    } catch (_error) {
      return errorResponse(500);
    }
    return new Response(resolution.headOnly ? null : contents, {
      status: resolution.status,
      headers: resolution.headers,
    });
  };
}

export async function registerAppProtocol({ protocol, fs, rendererRoot, manifestPath, previewHandler }) {
  const manifest = await loadResourceManifest({ fs, manifestPath });
  await verifyManifestResources({ fs, rendererRoot, manifest });
  await protocol.handle("app", createAppProtocolHandler({ fs, rendererRoot, manifest, previewHandler }));
}

function isPreviewRequest(request) {
  try { return new URL(String(request?.url || "")).pathname.startsWith("/.preview/"); }
  catch { return false; }
}
