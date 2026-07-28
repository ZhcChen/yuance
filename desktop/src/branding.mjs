import path from "node:path";

export const BRAND_ICON_RESOURCE_DIR = "brand";
export const RELEASE_DOCK_ICON_NAME = "yuance-dock.png";
export const DEVELOPMENT_DOCK_ICON_NAME = "yuance-dev-dock.png";

export function resolveDockIconName(isDevRuntime) {
  return isDevRuntime ? DEVELOPMENT_DOCK_ICON_NAME : RELEASE_DOCK_ICON_NAME;
}

export function resolvePngBrandIconPath({
  isDevRuntime,
  isPackaged,
  moduleDir,
  resourcesPath,
}) {
  const iconName = resolveDockIconName(isDevRuntime);
  if (isPackaged) {
    return path.join(resourcesPath, BRAND_ICON_RESOURCE_DIR, iconName);
  }
  return path.resolve(moduleDir, "../build", iconName);
}

export function shouldApplyRuntimeDockIcon(platform, hasDock, isDevRuntime) {
  return platform === "darwin" && hasDock && isDevRuntime;
}
