// @ts-check

/**
 * @typedef {{
 *   connectionId: string,
 *   connected: boolean,
 *   lastSequence: number,
 *   refreshRevision: number,
 *   releaseVersion: string,
 *   targetPath: string,
 *   targetRevision: number,
 * }} NotificationEventState
 */

/**
 * @typedef {{ type: 'stream-connected' | 'topbar-invalidated', connectionId: string, sequence: number }
 *   | { type: 'release-version', connectionId: string, sequence: number, version: string }
 *   | { type: 'notification-target', path: string }} NotificationEvent
 */

/** @returns {Readonly<NotificationEventState>} */
export function createNotificationEventState() {
  return freezeState({
    connectionId: '',
    connected: false,
    lastSequence: 0,
    refreshRevision: 0,
    releaseVersion: '',
    targetPath: '',
    targetRevision: 0,
  });
}

/**
 * @param {Readonly<NotificationEventState>} state
 * @param {unknown} value
 * @returns {Readonly<NotificationEventState>}
 */
export function reduceNotificationEvent(state, value) {
  const event = parseEvent(value);
  if (!event) return state;

  if (event.type === 'notification-target') {
    return freezeState({
      ...state,
      targetPath: event.path,
      targetRevision: state.targetRevision + 1,
    });
  }

  const isNewConnection = event.connectionId !== state.connectionId;
  if (!isNewConnection && event.sequence <= state.lastSequence) return state;

  const next = {
    ...state,
    connectionId: event.connectionId,
    lastSequence: event.sequence,
  };
  if (event.type === 'stream-connected') {
    // 首次连接时页面数据刚由路由加载取得，无需再全量刷新（否则每个页面首屏请求翻倍）；
    // 之前已连接过（断线重连或换新连接）才补拉期间可能遗漏的变更。
    // 服务端会先推送 release-version 再推送 connected，因此以“是否收到过连接事件”判断，而非连接 id。
    if (state.connected || (state.connectionId && isNewConnection)) next.refreshRevision += 1;
    next.connected = true;
  } else if (event.type === 'topbar-invalidated') {
    next.refreshRevision += 1;
  } else if (event.type === 'release-version') {
    next.releaseVersion = event.version;
  }
  return freezeState(next);
}

/**
 * @param {{
 *   refresh: () => Promise<void> | void,
 *   onReleaseVersion?: (version: string) => void,
 *   onNavigate?: (path: string) => void,
 * }} dependencies
 */
export function createNotificationEventCoordinator({ refresh, onReleaseVersion = () => {}, onNavigate = () => {} }) {
  if (typeof refresh !== 'function' || typeof onReleaseVersion !== 'function' || typeof onNavigate !== 'function') {
    throw new TypeError('notification event coordinator dependencies are required');
  }

  let state = createNotificationEventState();
  let refreshing = false;
  let pendingRefresh = false;
  let disposed = false;

  function handle(value) {
    if (disposed) return;
    const previous = state;
    state = reduceNotificationEvent(state, value);
    if (state === previous) return;

    if (state.releaseVersion !== previous.releaseVersion) onReleaseVersion(state.releaseVersion);
    if (state.targetRevision !== previous.targetRevision) onNavigate(state.targetPath);
    if (state.refreshRevision !== previous.refreshRevision) scheduleRefresh();
  }

  function scheduleRefresh() {
    if (refreshing) {
      pendingRefresh = true;
      return;
    }
    refreshing = true;
    void runRefreshLoop();
  }

  function invalidate() {
    if (!disposed) scheduleRefresh();
  }

  async function runRefreshLoop() {
    do {
      pendingRefresh = false;
      try {
        await refresh();
      } catch {
        // The shared page owns visible request errors; realtime remains recoverable.
      }
    } while (!disposed && pendingRefresh);
    refreshing = false;
  }

  function snapshot() {
    return Object.freeze({ ...state, refreshing, pendingRefresh });
  }

  function dispose() {
    disposed = true;
    pendingRefresh = false;
  }

  return Object.freeze({ handle, invalidate, snapshot, dispose });
}

/** @param {unknown} value @returns {NotificationEvent | null} */
function parseEvent(value) {
  if (!isPlainObject(value)) return null;
  const record = /** @type {Record<string, unknown>} */ (value);
  if (record.type === 'notification-target') {
    if (sameKeys(record, ['path', 'type']) && typeof record.path === 'string' && /^\/web\/(?:app\/)?(?:messages|work-items\/)/u.test(record.path)) {
      return /** @type {NotificationEvent} */ (record);
    }
    return null;
  }
  if (!['stream-connected', 'topbar-invalidated', 'release-version'].includes(String(record.type))) return null;
  if (typeof record.connectionId !== 'string' || record.connectionId.length < 1 || record.connectionId.length > 128) return null;
  if (!Number.isSafeInteger(record.sequence) || Number(record.sequence) < 1) return null;
  if (record.type === 'release-version') {
    if (!sameKeys(record, ['connectionId', 'sequence', 'type', 'version']) || typeof record.version !== 'string' || record.version.length < 1 || record.version.length > 256) return null;
  } else if (!sameKeys(record, ['connectionId', 'sequence', 'type'])) {
    return null;
  }
  return /** @type {NotificationEvent} */ (record);
}

/** @param {NotificationEventState} state */
function freezeState(state) {
  return Object.freeze(state);
}

/** @param {unknown} value */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

/** @param {Record<string, unknown>} value @param {string[]} expected */
function sameKeys(value, expected) {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}
