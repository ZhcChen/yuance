import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeDesktopVersion,
  parseReleaseAssetName,
  releaseAssetContentType,
  validateReleaseAssets,
} from "../desktop/src/release-assets.mjs";

const args = process.argv.slice(2);
const versionArgument = args.find((argument) => !argument.startsWith("--"));
const dryRun = process.env.YUANCE_DRY_RUN === "1" || args.includes("--dry-run");

function requiredEnvironment(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

function releaseVersion() {
  return normalizeDesktopVersion(process.env.YUANCE_DESKTOP_VERSION || versionArgument);
}

function systemApiBaseUrl() {
  const value = requiredEnvironment("YUANCE_API_BASE_URL");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("YUANCE_API_BASE_URL must use http or https.");
  }
  return parsed.toString().replace(/\/$/, "");
}

async function walkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

async function resolveReleaseAssetDirectory(version) {
  const localDirectory = String(process.env.YUANCE_DESKTOP_ASSET_DIR || "").trim();
  if (localDirectory) {
    return { directory: path.resolve(localDirectory), cleanup: false };
  }

  const repository = String(
    process.env.YUANCE_GITHUB_REPOSITORY || process.env.GITHUB_REPOSITORY || "",
  ).trim();
  if (!repository) {
    throw new Error(
      "Set YUANCE_DESKTOP_ASSET_DIR or YUANCE_GITHUB_REPOSITORY to locate build artifacts.",
    );
  }
  const tag = String(process.env.YUANCE_DESKTOP_RELEASE_TAG || `desktop-v${version}`).trim();
  const directory = await mkdtemp(path.join(os.tmpdir(), "yuance-desktop-release-"));
  const token = String(process.env.YUANCE_GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  const result = spawnSync(
    "gh",
    ["release", "download", tag, "--repo", repository, "--dir", directory],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        ...(token ? { GH_TOKEN: token } : {}),
      },
    },
  );
  if (result.error) {
    throw new Error(`Unable to start gh: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Failed to download GitHub Release ${tag} from ${repository}.`);
  }
  return { directory, cleanup: true };
}

async function collectReleaseAssets(directory, version) {
  const files = await walkFiles(directory);
  const assets = [];
  for (const filePath of files) {
    const descriptor = parseReleaseAssetName(path.basename(filePath), version);
    if (!descriptor) {
      continue;
    }
    const fileStat = await stat(filePath);
    assets.push({
      ...descriptor,
      filePath,
      byteSize: fileStat.size,
      contentType: releaseAssetContentType(descriptor.canonicalName),
    });
  }
  return [...validateReleaseAssets(assets).values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
}

function releaseNotes() {
  const notesFile = String(process.env.YUANCE_RELEASE_NOTES_FILE || "").trim();
  if (notesFile) {
    return readFile(path.resolve(notesFile), "utf8");
  }
  const notes = String(process.env.YUANCE_RELEASE_NOTES || "").trim();
  return Promise.resolve(notes || "桌面端版本已发布。");
}

class SystemReleaseApi {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async request(method, pathname, body) {
    const headers = {
      accept: "application/json",
      authorization: `Bearer ${this.token}`,
    };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message = payload?.error?.message || response.statusText || "Unknown system API error.";
      throw new Error(`${method} ${pathname} failed: ${message}`);
    }
    return payload.data;
  }

  async findRelease(version) {
    let page = 1;
    while (true) {
      const result = await this.request("GET", `/api/v1/system/releases?page=${page}&per_page=100`);
      const matched = (result.items || []).find((item) => item.version_name === version);
      if (matched) {
        return this.request("GET", `/api/v1/system/releases/${matched.id}`);
      }
      if (!result.pagination || page >= result.pagination.total_pages) {
        return null;
      }
      page += 1;
    }
  }

  createRelease(input) {
    return this.request("POST", "/api/v1/system/releases", input);
  }

  createAsset(releaseId, input) {
    return this.request("POST", `/api/v1/system/releases/${releaseId}/assets`, input);
  }

  uploadUrl(releaseId, assetId) {
    return this.request("GET", `/api/v1/system/releases/${releaseId}/assets/${assetId}/upload-url`);
  }

  markUploaded(releaseId, assetId) {
    return this.request("POST", `/api/v1/system/releases/${releaseId}/assets/${assetId}/uploaded`);
  }

  updateRelease(releaseId, input) {
    return this.request("PATCH", `/api/v1/system/releases/${releaseId}`, input);
  }
}

export function signedUploadHeaders(requestHeaders, asset) {
  const headers = new Headers();
  for (const entry of requestHeaders || []) {
    const [name, value] = Array.isArray(entry)
      ? entry
      : [entry?.name, entry?.value];
    if (name && value != null) {
      headers.set(name, value);
    }
  }
  if (!headers.has("content-type")) {
    headers.set("content-type", asset.contentType);
  }
  headers.set("content-length", String(asset.byteSize));
  return headers;
}

async function uploadSignedAsset(asset, signed) {
  const request = signed?.request || {};
  const headers = signedUploadHeaders(request.headers, asset);
  const response = await fetch(request.url, {
    method: request.method || "PUT",
    headers,
    body: createReadStream(asset.filePath),
    duplex: "half",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OSS upload failed for ${asset.canonicalName}: ${response.status} ${body.slice(0, 400)}`);
  }
}

export function existingAssetFor(asset, release) {
  const matches = (release.assets || []).filter(
    (item) => item.platform === asset.platform && item.architecture === asset.architecture,
  );
  if (matches.length > 1) {
    throw new Error(`Existing draft has duplicate assets for ${asset.key}. Clean it up before publishing.`);
  }
  const existing = matches[0] || null;
  if (
    existing &&
    (existing.filename !== asset.canonicalName ||
      existing.status !== "uploaded" ||
      Number(existing.byte_size) !== asset.byteSize)
  ) {
    throw new Error(
      `Existing draft asset for ${asset.key} does not match ${asset.canonicalName}. Clean it up before retrying.`,
    );
  }
  return existing;
}

export function planReleaseAssetUploads(assets, release) {
  return assets.map((asset) => ({ asset, existing: existingAssetFor(asset, release) }));
}

async function publishRelease(api, version, assets, title, notes) {
  let detail = await api.findRelease(version);
  if (detail?.release?.status === "published") {
    throw new Error(`Version ${version} is already published and cannot be modified.`);
  }
  if (!detail) {
    detail = await api.createRelease({ version_name: version, title, notes });
  }

  const uploadPlan = planReleaseAssetUploads(assets, detail);
  for (const { asset, existing } of uploadPlan) {
    if (existing) {
      console.log(`Reusing uploaded asset ${asset.canonicalName}.`);
      continue;
    }
    console.log(`Uploading ${asset.canonicalName}.`);
    const created = await api.createAsset(detail.release.id, {
      platform: asset.platform,
      architecture: asset.architecture,
      original_filename: asset.canonicalName,
      content_type: asset.contentType,
      byte_size: asset.byteSize,
    });
    const signed = await api.uploadUrl(detail.release.id, created.id);
    await uploadSignedAsset(asset, signed);
    await api.markUploaded(detail.release.id, created.id);
  }

  return api.updateRelease(detail.release.id, {
    version_name: version,
    title,
    notes,
    publish: true,
  });
}

async function main() {
  const version = releaseVersion();
  const source = await resolveReleaseAssetDirectory(version);
  try {
    const assets = await collectReleaseAssets(source.directory, version);
    console.log(`Resolved ${assets.length} release assets for desktop version ${version}.`);
    for (const asset of assets) {
      console.log(`- ${asset.platform}/${asset.architecture}: ${asset.canonicalName}`);
    }
    if (dryRun) {
      return;
    }

    const baseUrl = systemApiBaseUrl();
    const token = requiredEnvironment("YUANCE_SYSTEM_API_TOKEN");
    const title = String(process.env.YUANCE_RELEASE_TITLE || `元策桌面端 v${version}`).trim();
    const notes = await releaseNotes();
    const published = await publishRelease(
      new SystemReleaseApi(baseUrl, token),
      version,
      assets,
      title,
      notes,
    );
    console.log(`Published system release ${published.release.version_name} (id=${published.release.id}).`);
  } finally {
    if (source.cleanup) {
      await rm(source.directory, { recursive: true, force: true });
    }
  }
}

function isScriptEntrypoint() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isScriptEntrypoint()) {
  main().catch((error) => {
    console.error(`Desktop release publication failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
