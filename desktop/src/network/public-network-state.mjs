const PUBLIC_STATUS = new Set([
  "idle", "connecting", "online", "offline", "suspended", "reauthorization_required", "fatal",
]);

export function toPublicNetworkState(snapshot) {
  const status = snapshot && PUBLIC_STATUS.has(snapshot.status) ? snapshot.status : "fatal";
  return Object.freeze({ status });
}
