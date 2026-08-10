// @ts-check

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

function parseEvent(value, itemKey) {
  if (!value || typeof value !== 'object') return null;
  const event = /** @type {Record<string, any>} */ (value);
  if (event.itemKey !== itemKey || typeof event.connectionId !== 'string' || !event.connectionId || !Number.isSafeInteger(event.sequence) || event.sequence < 1) return null;
  if (event.type === 'work-item-discussion-invalidated') return event;
  if (event.type !== 'work-item-typing' || !Array.isArray(event.users) || event.users.length > 100) return null;
  if (!event.users.every((user) => user && Number.isSafeInteger(user.userId) && user.userId > 0 && typeof user.displayName === 'string' && user.displayName.length > 0 && user.displayName.length <= 128)) return null;
  return event;
}
