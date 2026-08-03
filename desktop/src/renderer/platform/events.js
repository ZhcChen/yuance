// @ts-check

export function createDesktopEvents(bridge, router) {
  return Object.freeze({
    openTopbarEvents(callbacks) {
      if (typeof bridge?.subscribe !== "function") return () => {};
      return bridge.subscribe((fact) => {
        if (fact?.type === "topbar") callbacks.onRefresh();
        else if (fact?.type === "release-version") callbacks.onReleaseVersion?.(fact.version);
        else if (fact?.type === "notification-target") router.assign(fact.path);
      });
    },
  });
}
