// @ts-check

import { parseAppRoute } from "@yuance/frontend-app-core";
import { defineRouterCapabilities } from "@yuance/frontend-platform-contract";
import { normalizeAppRoute } from "../../routes/app-route.mjs";

export { normalizeAppRoute as normalizeDesktopRoute } from "../../routes/app-route.mjs";

/** @typedef {{ pathname: string, search?: string, hash?: string }} RouteLocation */
/** @typedef {{ pushState(state: object, title: string, url: string): void, replaceState(state: object, title: string, url: string): void }} RouteHistory */
/** @typedef {{ addEventListener(type: string, callback: () => void): void, removeEventListener(type: string, callback: () => void): void, dispatchEvent(event: Event): void }} RouteEventTarget */

/** @param {{ location?: RouteLocation, history?: RouteHistory, eventTarget?: RouteEventTarget, document?: { title: string } }} [dependencies] */
export function createDesktopRouter(dependencies = {}) {
  const location = dependencies.location ?? /** @type {RouteLocation} */ (globalThis.location);
  const history = dependencies.history ?? /** @type {RouteHistory} */ (globalThis.history);
  const eventTarget = dependencies.eventTarget ?? /** @type {RouteEventTarget} */ (globalThis.window);
  const document = dependencies.document ?? globalThis.document;
  const router = {
    currentPath() {
      return desktopToSharedPath(location);
    },
    currentRoute() {
      const shared = new URL(desktopToSharedPath(location), "https://desktop.invalid");
      return parseAppRoute(shared.pathname, shared.search, shared.hash);
    },
    navigate(pathname, { replace = false } = {}) {
      const target = sharedToDesktopPath(pathname);
      history?.[replace ? "replaceState" : "pushState"]({}, "", target);
      eventTarget?.dispatchEvent(new Event("popstate"));
    },
    assign(pathname) {
      if (pathname === "/web/login") return;
      router.navigate(pathname);
    },
    setTitle(title) {
      if (typeof title === "string") document.title = title;
    },
    subscribe(callback) {
      const listener = () => callback();
      eventTarget?.addEventListener("popstate", listener);
      return () => eventTarget?.removeEventListener("popstate", listener);
    },
  };
  defineRouterCapabilities(router);
  return Object.freeze(router);
}

function desktopToSharedPath(location) {
  const pathname = normalizeAppRoute(location?.pathname ?? "/");
  const suffix = `${location?.search ?? ""}${location?.hash ?? ""}`;
  return `${pathname === "/" ? "/web/app" : `/web/app${pathname}`}${suffix}`;
}

function sharedToDesktopPath(value) {
  if (typeof value !== "string" || !value.startsWith("/web/app")) throw new Error("Desktop route is not allowed.");
  const parsed = new URL(value, "https://desktop.invalid");
  if (parsed.origin !== "https://desktop.invalid" || `${parsed.pathname}${parsed.search}${parsed.hash}` !== value) throw new Error("Desktop route is not allowed.");
  const pathname = parsed.pathname === "/web/app" ? "/" : parsed.pathname.slice("/web/app".length);
  if (normalizeAppRoute(pathname) !== pathname) throw new Error("Desktop route is not allowed.");
  return `${pathname}${parsed.search}${parsed.hash}`;
}
