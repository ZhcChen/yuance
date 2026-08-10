// @ts-check

export function createDesktopEvents(bridge) {
  return Object.freeze({
    supportsTopbarPolling: false,
    supportsWorkItemTyping: false,
    openTopbarEvents(callbacks) {
      if (typeof bridge?.subscribe !== "function") return () => {};
      const connectionId = "topbar";
      let sequence = 0;
      let connected = false;
      return bridge.subscribe((fact) => {
        if (fact?.type === "topbar") {
          callbacks.onEvent(Object.freeze({
            type: connected ? "topbar-invalidated" : "stream-connected",
            connectionId,
            sequence: ++sequence,
          }));
          connected = true;
        } else if (fact?.type === "release-version") {
          callbacks.onEvent(Object.freeze({ type: "release-version", connectionId, sequence: ++sequence, version: fact.version }));
        } else if (fact?.type === "notification-target") {
          callbacks.onEvent(Object.freeze({ type: "notification-target", path: fact.path }));
        }
      });
    },
    openWorkItemEvents(_itemKey, _callbacks) {
      return () => {};
    },
  });
}
