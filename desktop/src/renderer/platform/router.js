// @ts-check

import { defineRouterCapabilities } from "@yuance/frontend-platform-contract";
import { normalizeAppRoute } from "../../routes/app-route.mjs";

export { normalizeAppRoute as normalizeDesktopRoute } from "../../routes/app-route.mjs";

/** @typedef {{ pathname: string }} RouteLocation */
/** @typedef {{ pushState(state: object, title: string, url: string): void, replaceState(state: object, title: string, url: string): void }} RouteHistory */
/** @typedef {{ addEventListener(type: string, callback: () => void): void, removeEventListener(type: string, callback: () => void): void, dispatchEvent(event: Event): void }} RouteEventTarget */

/** @param {{ location?: RouteLocation, history?: RouteHistory, eventTarget?: RouteEventTarget }} [dependencies] */
export function createDesktopRouter(dependencies = {}) {
  const location = dependencies.location ?? /** @type {RouteLocation} */ (globalThis.location);
  const history = dependencies.history ?? /** @type {RouteHistory} */ (globalThis.history);
  const eventTarget = dependencies.eventTarget ?? /** @type {RouteEventTarget} */ (globalThis.window);
  const router = {
    currentPath() {
      return normalizeAppRoute(location?.pathname ?? "/");
    },
    navigate(pathname, { replace = false } = {}) {
      const target = normalizeAppRoute(pathname);
      if (target !== pathname) throw new Error("Desktop route is not allowed.");
      history?.[replace ? "replaceState" : "pushState"]({}, "", target);
      eventTarget?.dispatchEvent(new Event("popstate"));
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
