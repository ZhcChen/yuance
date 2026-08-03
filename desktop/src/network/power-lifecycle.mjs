export function bindNetworkPowerLifecycle({ powerEvents, getCoordinator, onSuspend = () => {} } = {}) {
  if (!powerEvents || typeof powerEvents.on !== "function" || typeof powerEvents.removeListener !== "function") {
    throw new TypeError("powerEvents must support on and removeListener");
  }
  if (typeof getCoordinator !== "function") throw new TypeError("getCoordinator is required");
  if (typeof onSuspend !== "function") throw new TypeError("onSuspend is required");

  const suspend = () => {
    onSuspend();
    getCoordinator()?.suspend();
  };
  const resume = () => getCoordinator()?.resume();
  powerEvents.on("suspend", suspend);
  powerEvents.on("resume", resume);

  return () => {
    powerEvents.removeListener("suspend", suspend);
    powerEvents.removeListener("resume", resume);
  };
}
