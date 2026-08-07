// @ts-check

/** @typedef {{ readAllPending: boolean, openingId: number | null }} NotificationActionState */

/**
 * @param {{
 *   markAllRead: () => Promise<unknown>,
 *   markRead: (notificationId: number) => Promise<{ target?: NotificationTarget | null }>,
 *   getTarget: (notificationId: number) => Promise<{ target?: NotificationTarget | null }>,
 *   setCurrentProject: (projectKey: string) => Promise<unknown>,
 *   currentProjectKey: () => string,
 *   refresh: () => Promise<void>,
 *   navigate: (path: string) => void,
 *   targetPath: (target: NotificationTarget) => string,
 *   onState?: (state: Readonly<NotificationActionState>) => void,
 * }} dependencies
 */
export function createNotificationActionCoordinator({
  markAllRead,
  markRead,
  getTarget,
  setCurrentProject,
  currentProjectKey,
  refresh,
  navigate,
  targetPath,
  onState = () => {},
}) {
  for (const dependency of [markAllRead, markRead, getTarget, setCurrentProject, currentProjectKey, refresh, navigate, targetPath, onState]) {
    if (typeof dependency !== 'function') throw new TypeError('notification action dependency is required');
  }

  let state = freezeState({ readAllPending: false, openingId: null });
  /** @type {Promise<void> | null} */
  let readAllPromise = null;
  /** @type {Promise<void> | null} */
  let openPromise = null;

  function publish(patch) {
    state = freezeState({ ...state, ...patch });
    onState(state);
  }

  function markAll() {
    if (readAllPromise) return readAllPromise;
    publish({ readAllPending: true });
    readAllPromise = (async () => {
      try {
        await markAllRead();
        await refresh();
      } finally {
        readAllPromise = null;
        publish({ readAllPending: false });
      }
    })();
    return readAllPromise;
  }

  /** @param {{ id: number, read: boolean }} item */
  function open(item) {
    if (!item || !Number.isSafeInteger(item.id) || item.id < 1 || typeof item.read !== 'boolean') {
      return Promise.reject(new TypeError('notification item is invalid'));
    }
    if (openPromise) return openPromise;
    publish({ openingId: item.id });
    openPromise = (async () => {
      try {
        const result = item.read ? await getTarget(item.id) : await markRead(item.id);
        const target = parseTarget(result?.target);
        if (!target) throw notificationTargetUnavailable();
        const activeProjectKey = currentProjectKey().trim().toUpperCase();
        if (target.project_key.toUpperCase() !== activeProjectKey) {
          await setCurrentProject(target.project_key);
        }
        navigate(targetPath(target));
      } catch (error) {
        try { await refresh(); } catch {
          // Preserve the decisive target error when final-state refresh also fails.
        }
        throw error;
      } finally {
        openPromise = null;
        publish({ openingId: null });
      }
    })();
    return openPromise;
  }

  return Object.freeze({ markAll, open, snapshot: () => state });
}

/**
 * @typedef {{ kind: 'work_item', project_key: string, work_item_key: string, comment_id: number | null }} NotificationTarget
 */

/** @param {unknown} value @returns {NotificationTarget | null} */
function parseTarget(value) {
  if (!value || typeof value !== 'object') return null;
  const target = /** @type {Record<string, unknown>} */ (value);
  if (
    target.kind !== 'work_item'
    || typeof target.project_key !== 'string'
    || !target.project_key.trim()
    || typeof target.work_item_key !== 'string'
    || !target.work_item_key.trim()
    || !(target.comment_id === null || Number.isSafeInteger(target.comment_id) && Number(target.comment_id) > 0)
  ) return null;
  return /** @type {NotificationTarget} */ (target);
}

function notificationTargetUnavailable() {
  const error = new Error('消息目标已不存在或你已无权访问。');
  error.name = 'NotificationTargetUnavailableError';
  return error;
}

/** @param {NotificationActionState} state */
function freezeState(state) {
  return Object.freeze(state);
}
