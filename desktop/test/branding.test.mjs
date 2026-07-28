import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BRAND_ICON_RESOURCE_DIR,
  DEVELOPMENT_DOCK_ICON_NAME,
  RELEASE_DOCK_ICON_NAME,
  resolveDockIconName,
  resolvePngBrandIconPath,
  shouldApplyRuntimeDockIcon,
} from "../src/branding.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("selects a distinct development Dock icon", () => {
  const sourceModuleDir = path.join("repo", "desktop", "src");
  const resourcesPath = path.join("Applications", "元策.app", "Contents", "Resources");
  assert.equal(resolveDockIconName(true), DEVELOPMENT_DOCK_ICON_NAME);
  assert.equal(resolveDockIconName(false), RELEASE_DOCK_ICON_NAME);
  assert.equal(
    resolvePngBrandIconPath({
      isDevRuntime: true,
      isPackaged: false,
      moduleDir: sourceModuleDir,
      resourcesPath: "unused",
    }),
    path.resolve(sourceModuleDir, "../build", DEVELOPMENT_DOCK_ICON_NAME),
  );
  assert.equal(
    resolvePngBrandIconPath({
      isDevRuntime: false,
      isPackaged: true,
      moduleDir: "unused",
      resourcesPath,
    }),
    path.join(resourcesPath, BRAND_ICON_RESOURCE_DIR, RELEASE_DOCK_ICON_NAME),
  );
});

test("applies the runtime icon only to macOS development builds", () => {
  assert.equal(shouldApplyRuntimeDockIcon("darwin", true, true), true);
  assert.equal(shouldApplyRuntimeDockIcon("darwin", true, false), false);
  assert.equal(shouldApplyRuntimeDockIcon("darwin", false, true), false);
  assert.equal(shouldApplyRuntimeDockIcon("win32", true, true), false);
});

test("bundles release and development Dock PNGs without replacing the macOS release icon", () => {
  const config = readFileSync(path.join(desktopRoot, "electron-builder.yml"), "utf8");
  assert.match(config, new RegExp(`to: ${BRAND_ICON_RESOURCE_DIR}`));
  assert.match(config, new RegExp(`- ${RELEASE_DOCK_ICON_NAME}`));
  assert.match(config, new RegExp(`- ${DEVELOPMENT_DOCK_ICON_NAME}`));
  assert.match(config, /mac:\n(?:  .+\n)*  icon: build\/icon\.icns/);

  for (const iconName of [RELEASE_DOCK_ICON_NAME, DEVELOPMENT_DOCK_ICON_NAME]) {
    const iconPath = path.join(desktopRoot, "build", iconName);
    assert.equal(existsSync(iconPath), true);
    assert.ok(statSync(iconPath).size > 0);
  }
});
