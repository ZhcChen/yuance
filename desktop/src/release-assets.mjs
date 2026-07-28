import path from "node:path";

export const DESKTOP_RELEASE_TARGETS = Object.freeze([
  { platform: "macos", architecture: "x64", extension: ".dmg" },
  { platform: "macos", architecture: "arm64", extension: ".dmg" },
  { platform: "windows", architecture: "x64", extension: ".exe" },
  { platform: "windows", architecture: "arm64", extension: ".exe" },
  { platform: "linux", architecture: "x64", extension: ".AppImage" },
  { platform: "linux", architecture: "arm64", extension: ".AppImage" },
]);

const PLATFORM_ALIASES = Object.freeze({
  mac: "macos",
  macos: "macos",
  win: "windows",
  windows: "windows",
  linux: "linux",
});

const ARCHITECTURE_ALIASES = Object.freeze({
  x64: "x64",
  x86_64: "x64",
  amd64: "x64",
  arm64: "arm64",
  aarch64: "arm64",
});

const PLATFORM_FILE_TOKENS = Object.freeze({
  macos: "mac",
  windows: "win",
  linux: "linux",
});

const CONTENT_TYPES = Object.freeze({
  ".dmg": "application/x-apple-diskimage",
  ".exe": "application/x-msdownload",
  ".appimage": "application/octet-stream",
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeDesktopVersion(value) {
  const version = String(value || "").trim().replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("Desktop version must be a semantic version such as 0.1.0.");
  }
  return version;
}

export function releaseAssetKey(platform, architecture) {
  return `${platform}:${architecture}`;
}

export function canonicalReleaseAssetName({ version, platform, architecture }) {
  const normalizedVersion = normalizeDesktopVersion(version);
  const target = DESKTOP_RELEASE_TARGETS.find(
    (item) => item.platform === platform && item.architecture === architecture,
  );
  if (!target) {
    throw new Error(`Unsupported desktop target ${platform}/${architecture}.`);
  }
  return `Yuance-${normalizedVersion}-${PLATFORM_FILE_TOKENS[target.platform]}-${target.architecture}${target.extension}`;
}

export function parseReleaseAssetName(fileName, version) {
  const normalizedVersion = normalizeDesktopVersion(version);
  const name = path.basename(String(fileName || ""));
  const expression = new RegExp(
    `^Yuance-${escapeRegExp(normalizedVersion)}-(mac|macos|win|windows|linux)-(x64|x86_64|amd64|arm64|aarch64)\\.(dmg|exe|appimage)$`,
    "i",
  );
  const match = name.match(expression);
  if (!match) {
    return null;
  }

  const platform = PLATFORM_ALIASES[match[1].toLowerCase()];
  const architecture = ARCHITECTURE_ALIASES[match[2].toLowerCase()];
  const extension = `.${match[3].toLowerCase()}`;
  const target = DESKTOP_RELEASE_TARGETS.find(
    (item) => item.platform === platform && item.architecture === architecture,
  );
  if (!target || target.extension.toLowerCase() !== extension) {
    return null;
  }

  return {
    platform,
    architecture,
    extension: target.extension,
    key: releaseAssetKey(platform, architecture),
    canonicalName: canonicalReleaseAssetName({
      version: normalizedVersion,
      platform,
      architecture,
    }),
  };
}

export function releaseAssetContentType(fileName) {
  const extension = path.extname(String(fileName || "")).toLowerCase();
  return CONTENT_TYPES[extension] || "application/octet-stream";
}

export function validateReleaseAssets(assets, { requireComplete = true } = {}) {
  const map = new Map();
  for (const asset of assets) {
    if (!asset || !asset.key) {
      throw new Error("Release asset descriptor is invalid.");
    }
    if (map.has(asset.key)) {
      throw new Error(`Duplicate desktop release asset for ${asset.key}.`);
    }
    map.set(asset.key, asset);
  }
  if (map.size === 0) {
    throw new Error("No desktop release assets were found.");
  }
  if (requireComplete) {
    const missing = DESKTOP_RELEASE_TARGETS.filter(
      (target) => !map.has(releaseAssetKey(target.platform, target.architecture)),
    );
    if (missing.length > 0) {
      throw new Error(
        `Missing desktop release assets: ${missing
          .map((target) => releaseAssetKey(target.platform, target.architecture))
          .join(", ")}.`,
      );
    }
  }
  return map;
}
