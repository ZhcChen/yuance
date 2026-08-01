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
  /** @param {{ onRefresh: () => void, onReleaseVersion?: (version: string) => void }} callbacks */
  function openTopbarEvents(callbacks) {
    const EventSourceImpl = dependencies.EventSourceImpl
      || /** @type {new (url: string, options: { withCredentials: boolean }) => EventSourceLike} */ (globalThis.EventSource);
    const source = new EventSourceImpl('/api/v1/topbar/events', { withCredentials: true });
    source.addEventListener('release-version', (event) => {
      if (typeof callbacks.onReleaseVersion === 'function') {
        callbacks.onReleaseVersion(/** @type {MessageEvent} */ (event).data);
      }
    });
    source.addEventListener('topbar', callbacks.onRefresh);
    source.onerror = () => {
      // Browser EventSource owns reconnect behavior.
    };
    return () => source.close();
  }

  return { openTopbarEvents };
}
