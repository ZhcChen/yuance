const ROUTE_PREFIXES = Object.freeze(["/auth", "/messages", "/projects", "/requirements", "/tasks", "/bugs", "/work-items", "/system"]);

/** @param {string} pathname */
export function isCanonicalAppPathname(pathname) {
  if (pathname === "/") return true;
  return Boolean(
    typeof pathname === "string" &&
    pathname.startsWith("/") &&
    /^\/[A-Za-z0-9._~/-]*$/.test(pathname) &&
    !pathname.includes("?") &&
    !pathname.includes("#") &&
    !pathname.includes("%") &&
    !pathname.includes("\\") &&
    !pathname.includes("\0") &&
    !pathname.includes("\u2044") &&
    !pathname.includes("\u2215") &&
    !pathname.includes("\uff0f") &&
    !pathname.slice(1).split("/").some((segment) => !segment || segment === "." || segment === "..")
  );
}

/** @param {string} pathname */
export function isAllowedAppRoute(pathname) {
  if (!isCanonicalAppPathname(pathname)) return false;
  if (pathname === "/") return true;
  return ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** @param {string} pathname */
export function normalizeAppRoute(pathname) {
  return isAllowedAppRoute(pathname) ? pathname : "/";
}
