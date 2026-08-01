// @ts-check

import { parseAppRoute } from '@yuance/frontend-app-core';

/**
 * @param {{
 *   location?: Pick<Location, 'pathname' | 'search' | 'assign'>,
 *   history?: Pick<History, 'pushState' | 'replaceState'>,
 *   eventTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>,
 *   document?: Pick<Document, 'title'>,
 * }} [dependencies]
 */
export function createBrowserRouter(dependencies = {}) {
  const location = () => dependencies.location || globalThis.window.location;
  const history = () => dependencies.history || globalThis.window.history;
  const eventTarget = () => dependencies.eventTarget || globalThis.window;
  const document = () => dependencies.document || globalThis.document;

  function currentRoute() {
    const currentLocation = location();
    return parseAppRoute(currentLocation.pathname, currentLocation.search);
  }

  /** @param {string} path @param {{ replace?: boolean }} [options] */
  function navigate(path, options = {}) {
    if (options.replace) history().replaceState(null, '', path);
    else history().pushState(null, '', path);
  }

  /** @param {() => void} callback */
  function subscribe(callback) {
    const target = eventTarget();
    target.addEventListener('popstate', callback);
    return () => target.removeEventListener('popstate', callback);
  }

  return {
    assign: (path) => location().assign(path),
    currentPath: () => `${location().pathname}${location().search}`,
    currentRoute,
    navigate,
    setTitle: (title) => { document().title = title; },
    subscribe,
  };
}
