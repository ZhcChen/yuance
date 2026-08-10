// @ts-check

const WORKSPACE_NETWORK_STATES = new Set(["idle", "connecting", "online", "offline", "suspended"]);

/**
 * @typedef {'bootstrap' | 'authorization' | 'workspace' | 'recovery'} PresentationStage
 * @typedef {{ status: string, reason?: string }} PublicState
 * @typedef {{ stage: PresentationStage, presentable: boolean, authState: PublicState, networkState: PublicState }} DesktopPresentationState
 */

/**
 * @param {{ authState: PublicState, networkState: PublicState }} input
 * @returns {DesktopPresentationState}
 */
export function createDesktopPresentationState({ authState, networkState }) {
  return resolveDesktopPresentationState({
    stage: "bootstrap",
    presentable: false,
    authState,
    networkState,
  });
}

/**
 * @param {DesktopPresentationState} current
 * @param {{ authState?: PublicState, networkState?: PublicState }} update
 * @returns {DesktopPresentationState}
 */
export function reduceDesktopPresentationState(current, update) {
  const authState = update.authState ?? current.authState;
  const networkState = update.networkState ?? current.networkState;
  if (authState === current.authState && networkState === current.networkState) return current;
  const next = resolveDesktopPresentationState({ ...current, authState, networkState });
  if (
    next.stage === current.stage &&
    next.presentable === current.presentable &&
    next.authState.status === current.authState.status &&
    next.networkState.status === current.networkState.status
  ) return current;
  return next;
}

/** @param {DesktopPresentationState} current @returns {DesktopPresentationState} */
function resolveDesktopPresentationState(current) {
  const authStatus = current.authState.status;
  const networkStatus = current.networkState.status;

  if (authStatus === "starting") return freezeState(current, "bootstrap", false);
  if (authStatus === "unauthenticated" || authStatus === "authorizing") {
    return freezeState(current, "authorization", true);
  }
  if (authStatus !== "authenticated") return freezeState(current, "recovery", true);

  if (networkStatus === "online") return freezeState(current, "workspace", true);
  if (current.stage === "workspace" && WORKSPACE_NETWORK_STATES.has(networkStatus)) {
    return freezeState(current, "workspace", true);
  }
  if (networkStatus === "idle" || networkStatus === "connecting") {
    return freezeState(current, "bootstrap", true);
  }
  return freezeState(current, "recovery", true);
}

/**
 * @param {DesktopPresentationState} current
 * @param {PresentationStage} stage
 * @param {boolean} presentable
 * @returns {DesktopPresentationState}
 */
function freezeState(current, stage, presentable) {
  return Object.freeze({
    stage,
    presentable,
    authState: current.authState,
    networkState: current.networkState,
  });
}
