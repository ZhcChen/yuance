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

  return { openTopbarEvents };
}
