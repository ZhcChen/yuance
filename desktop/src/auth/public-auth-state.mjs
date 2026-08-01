const INTERNAL_TO_PUBLIC_STATUS = Object.freeze({
  unauthenticated: "unauthenticated",
  authorizing: "authorizing",
  authenticated: "authenticated",
  refreshing: "authenticated",
  locked: "locked",
  revoked: "reauthorization_required",
  error: "reauthorization_required",
});

export function toPublicAuthState(snapshot) {
  const status = snapshot && typeof snapshot === "object"
    ? INTERNAL_TO_PUBLIC_STATUS[snapshot.status]
    : undefined;
  return Object.freeze({ status: status || "fatal" });
}

export function bindCredentialCoordinatorState({ coordinator, onState }) {
  if (!coordinator || typeof coordinator.subscribe !== "function" || typeof onState !== "function") {
    throw new TypeError("Credential coordinator state binding requires subscribe and onState.");
  }
  let active = true;
  const unsubscribe = coordinator.subscribe((snapshot) => {
    if (active) onState(toPublicAuthState(snapshot));
  });
  return () => {
    if (!active) return;
    active = false;
    unsubscribe();
  };
}
