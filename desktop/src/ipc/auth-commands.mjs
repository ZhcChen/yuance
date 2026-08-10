export const AUTH_CHANNELS = Object.freeze({
  authorize: "yuance:auth-authorize",
  retry: "yuance:auth-retry",
  logout: "yuance:auth-logout",
});

export function registerAuthCommandHandlers({ ipcMain, assertSender, getRuntime, getNetworkCoordinator, openExternal, onUserCode } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== "function" || typeof ipcMain.removeHandler !== "function") throw new TypeError("ipcMain is required");
  if (typeof assertSender !== "function" || typeof getRuntime !== "function" || typeof getNetworkCoordinator !== "function" || typeof openExternal !== "function") throw new TypeError("auth command dependencies are required");
  if (onUserCode !== undefined && typeof onUserCode !== "function") throw new TypeError("onUserCode must be a function");
  const handlers = {
    [AUTH_CHANNELS.authorize]: command((runtime) => runtime.authorize({ openExternal, onUserCode })),
    [AUTH_CHANNELS.retry]: command((runtime) => {
      const status = runtime.snapshot().status;
      if (status === "authenticated") { getNetworkCoordinator()?.start(); return runtime.snapshot(); }
      if (status === "locked") return runtime.retryPendingRevocation();
      return runtime.authorize({ openExternal, onUserCode });
    }),
    [AUTH_CHANNELS.logout]: command((runtime) => runtime.logout()),
  };
  function command(operation) {
    let flight;
    return async (event, payload) => {
      assertSender(event);
      if (payload !== undefined) throw new TypeError("auth commands do not accept payloads");
      const runtime = getRuntime();
      if (!runtime) throw new Error("credential runtime is unavailable");
      if (flight) return flight;
      flight = Promise.resolve(operation(runtime))
        .then(normalizeAuthResult)
        .finally(() => { flight = undefined; });
      return flight;
    };
  }
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler);
  return () => { for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel); };
}

function normalizeAuthResult(value) {
  const allowed = new Set(["unauthenticated", "authorizing", "authenticated", "locked", "reauthorization_required", "fatal"]);
  return Object.freeze({ status: allowed.has(value?.status) ? value.status : "fatal" });
}
