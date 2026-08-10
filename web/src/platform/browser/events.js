// @ts-check

/**
 * @typedef {{
 *   addEventListener: (type: string, callback: EventListenerOrEventListenerObject) => void,
 *   onerror: ((event: Event) => void) | null,
 *   close: () => void,
 * }} EventSourceLike
 */

/**
 * @param {{ EventSourceImpl?: new (url: string, options: { withCredentials: boolean }) => EventSourceLike }} [dependencies]
 */
export function createBrowserEvents(dependencies = {}) {
  /** @param {{ onEvent: (event: object) => void }} callbacks */
  function openTopbarEvents(callbacks) {
    const EventSourceImpl = dependencies.EventSourceImpl
      || /** @type {new (url: string, options: { withCredentials: boolean }) => EventSourceLike} */ (globalThis.EventSource);
    const source = new EventSourceImpl('/api/v1/topbar/events', { withCredentials: true });
    const connectionId = 'topbar';
    let sequence = 0;
    source.addEventListener('release-version', (event) => {
      callbacks.onEvent(Object.freeze({
        type: 'release-version',
        connectionId,
        sequence: ++sequence,
        version: /** @type {MessageEvent} */ (event).data,
      }));
    });
    source.addEventListener('topbar', (event) => {
      callbacks.onEvent(Object.freeze({
        type: /** @type {MessageEvent} */ (event).data === 'connected' ? 'stream-connected' : 'topbar-invalidated',
        connectionId,
        sequence: ++sequence,
      }));
    });
    source.onerror = () => {
      // Browser EventSource owns reconnect behavior.
    };
    return () => source.close();
  }

  /** @param {string} itemKey @param {{ onEvent: (event: object) => void }} callbacks */
  function openWorkItemEvents(itemKey, callbacks) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(itemKey)) throw new TypeError('work item key is invalid');
    const EventSourceImpl = dependencies.EventSourceImpl
      || /** @type {new (url: string, options: { withCredentials: boolean }) => EventSourceLike} */ (globalThis.EventSource);
    const source = new EventSourceImpl(`/api/v1/work-items/${encodeURIComponent(itemKey)}/events`, { withCredentials: true });
    const connectionId = `work-item:${itemKey}`;
    let sequence = 0;
    source.addEventListener('discussion-refresh', () => {
      callbacks.onEvent(Object.freeze({ type: 'work-item-discussion-invalidated', itemKey, connectionId, sequence: ++sequence }));
    });
    source.addEventListener('typing', (event) => {
      const users = parseTypingUsers(/** @type {MessageEvent} */ (event).data);
      if (users) callbacks.onEvent(Object.freeze({ type: 'work-item-typing', itemKey, connectionId, sequence: ++sequence, users }));
    });
    source.onerror = () => {
      // Browser EventSource reconnects and the server sends a fresh typing snapshot.
    };
    return () => source.close();
  }

  return { supportsWorkItemTyping: true, openTopbarEvents, openWorkItemEvents };
}

/** @param {string} value */
function parseTypingUsers(value) {
  try {
    const payload = JSON.parse(value);
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.users) || payload.users.length > 100) return null;
    const users = [];
    for (const user of payload.users) {
      if (!user || typeof user !== 'object' || !Number.isSafeInteger(user.user_id) || user.user_id < 1 || typeof user.display_name !== 'string') return null;
      const displayName = user.display_name.trim();
      if (!displayName || displayName.length > 128) return null;
      users.push(Object.freeze({ userId: user.user_id, displayName }));
    }
    return Object.freeze(users);
  } catch {
    return null;
  }
}
