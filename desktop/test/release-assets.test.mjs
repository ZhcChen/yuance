import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalReleaseAssetName,
  parseReleaseAssetName,
  releaseAssetContentType,
  validateReleaseAssets,
} from "../src/release-assets.mjs";

test("normalizes Electron Builder platform and architecture aliases", () => {
  const mac = parseReleaseAssetName("Yuance-0.1.0-mac-arm64.dmg", "0.1.0");
  const windows = parseReleaseAssetName("Yuance-0.1.0-win-x64.exe", "0.1.0");
  const linux = parseReleaseAssetName("Yuance-0.1.0-linux-x86_64.AppImage", "0.1.0");

  assert.deepEqual(mac?.key, "macos:arm64");
  assert.deepEqual(windows?.key, "windows:x64");
  assert.deepEqual(linux?.key, "linux:x64");
  assert.equal(linux?.canonicalName, "Yuance-0.1.0-linux-x64.AppImage");
});

test("rejects unexpected desktop asset names", () => {
  assert.equal(parseReleaseAssetName("Yuance-0.1.1-mac-arm64.dmg", "0.1.0"), null);
  assert.equal(parseReleaseAssetName("Yuance-0.1.0-linux-arm64.deb", "0.1.0"), null);
});

test("builds canonical names and content types", () => {
  assert.equal(
    canonicalReleaseAssetName({ version: "0.1.0", platform: "windows", architecture: "arm64" }),
    "Yuance-0.1.0-win-arm64.exe",
  );
  assert.equal(releaseAssetContentType("Yuance-0.1.0-mac-arm64.dmg"), "application/x-apple-diskimage");
  assert.equal(releaseAssetContentType("Yuance-0.1.0-win-x64.exe"), "application/x-msdownload");
  assert.equal(releaseAssetContentType("Yuance-0.1.0-linux-x64.AppImage"), "application/octet-stream");
});

test("requires a complete six-target release when requested", () => {
  const asset = parseReleaseAssetName("Yuance-0.1.0-mac-arm64.dmg", "0.1.0");
  assert.throws(() => validateReleaseAssets([asset]), /Missing desktop release assets/);
});

test("rejects duplicate platform and architecture assets", () => {
  const asset = parseReleaseAssetName("Yuance-0.1.0-mac-arm64.dmg", "0.1.0");
  assert.throws(
    () => validateReleaseAssets([asset, { ...asset, canonicalName: "duplicate.dmg" }], { requireComplete: false }),
    /Duplicate desktop release asset/,
  );
});
