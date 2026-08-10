// @ts-check
/* global clearTimeout, setTimeout */

/**
 * @param {{
 *   itemKey: string,
 *   refresh: () => Promise<void> | void,
 *   onTyping?: (users: ReadonlyArray<{ userId: number, displayName: string }>) => void,
 * }} dependencies
 */
export function createWorkItemEventCoordinator({ itemKey, refresh, onTyping = () => {} }) {
  if (typeof itemKey !== 'string' || !itemKey || typeof refresh !== 'function' || typeof onTyping !== 'function') throw new TypeError('work item event dependencies are required');
  let connectionId = '';
  let lastSequence = 0;
  let refreshing = false;
  let pendingRefresh = false;
  let disposed = false;

  function handle(value) {
    const event = parseEvent(value, itemKey);
    if (disposed || !event) return;
    if (event.connectionId !== connectionId) {
      connectionId = event.connectionId;
      lastSequence = 0;
    }
    if (event.sequence <= lastSequence) return;
    lastSequence = event.sequence;
    if (event.type === 'work-item-typing') {
      onTyping(event.users);
      return;
    }
    scheduleRefresh();
  }

  function scheduleRefresh() {
    if (refreshing) {
      pendingRefresh = true;
      return;
    }
    refreshing = true;
    void runRefreshLoop();
  }

  async function runRefreshLoop() {
    do {
      pendingRefresh = false;
      try { await refresh(); } catch {
        // A later invalidation or manual refresh can recover the final server state.
      }
    } while (!disposed && pendingRefresh);
    refreshing = false;
  }

  function dispose() {
    disposed = true;
    pendingRefresh = false;
    onTyping([]);
  }

  function snapshot() {
    return Object.freeze({ connectionId, lastSequence, refreshing, pendingRefresh, disposed });
  }

  return Object.freeze({ handle, dispose, snapshot });
}

/**
 * @param {{
 *   itemKey: string,
 *   clientId: string,
 *   send: (itemKey: string, payload: { clientId: string, active: boolean }) => Promise<void> | void,
 *   now?: () => number,
 *   schedule?: (callback: () => void, delay: number) => unknown,
 *   cancel?: (timer: unknown) => void,
 *   renewalMs?: number,
 *   idleMs?: number,
 * }} dependencies
 */
export function createWorkItemTypingController({
  itemKey,
  clientId,
  send,
  now = Date.now,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (timer) => clearTimeout(/** @type {ReturnType<typeof setTimeout>} */ (timer)),
  renewalMs = 5_000,
  idleMs = 10_000,
}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(itemKey) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(clientId) || typeof send !== 'function') throw new TypeError('work item typing dependencies are invalid');
  if (!Number.isFinite(renewalMs) || renewalMs < 1 || !Number.isFinite(idleMs) || idleMs <= renewalMs) throw new TypeError('work item typing intervals are invalid');
  let active = false;
  let disposed = false;
  let lastSentAt = 0;
  let idleTimer = /** @type {unknown} */ (null);

  function start() {
    if (disposed) return;
    publishActive(false);
    scheduleIdleStop();
  }

  function activity() {
    if (disposed) return;
    publishActive(true);
    scheduleIdleStop();
  }

  function stop() {
    clearIdleTimer();
    if (!active) return;
    active = false;
    void Promise.resolve(send(itemKey, { clientId, active: false })).catch(() => {});
  }

  function dispose() {
    if (disposed) return;
    stop();
    disposed = true;
  }

  /** @param {boolean} allowRenewal */
  function publishActive(allowRenewal) {
    const timestamp = now();
    if (active && (!allowRenewal || timestamp - lastSentAt < renewalMs)) return;
    active = true;
    lastSentAt = timestamp;
    void Promise.resolve(send(itemKey, { clientId, active: true })).catch(() => {});
  }

  function scheduleIdleStop() {
    clearIdleTimer();
    idleTimer = schedule(stop, idleMs);
  }

  function clearIdleTimer() {
    if (idleTimer !== null) cancel(idleTimer);
    idleTimer = null;
  }

  return Object.freeze({ start, activity, stop, dispose });
}

function parseEvent(value, itemKey) {
  if (!value || typeof value !== 'object') return null;
  const event = /** @type {Record<string, any>} */ (value);
  if (event.itemKey !== itemKey || typeof event.connectionId !== 'string' || !event.connectionId || !Number.isSafeInteger(event.sequence) || event.sequence < 1) return null;
  if (event.type === 'work-item-discussion-invalidated') return event;
  if (event.type !== 'work-item-typing' || !Array.isArray(event.users) || event.users.length > 100) return null;
  if (!event.users.every((user) => user && Number.isSafeInteger(user.userId) && user.userId > 0 && typeof user.displayName === 'string' && user.displayName.length > 0 && user.displayName.length <= 128)) return null;
  return event;
}
