// @ts-check

/** @typedef {import('@yuance/frontend-api-client').CommentRequestPayload} CommentRequestPayload */
/** @typedef {import('@yuance/frontend-api-client').WorkItemHandoffPayload} WorkItemHandoffPayload */
/** @typedef {import('@yuance/frontend-api-client').WorkItemUpdatePayload} WorkItemUpdatePayload */

/**
 * @template T
 * @typedef {object} MutationLifecycle
 * @property {() => boolean} isCurrent
 * @property {(value: T) => boolean | void} onCommitted
 * @property {(value: T) => void | Promise<void>} [refreshCompanion]
 */

/**
 * @template T
 * @typedef {object} MutationResult
 * @property {boolean} applied
 * @property {T} value
 * @property {unknown | null} refreshError
 */

/**
 * @template T
 * @param {() => Promise<T>} mutate
 * @param {MutationLifecycle<T>} lifecycle
 * @returns {Promise<MutationResult<T>>}
 */
async function runMutation(mutate, lifecycle) {
  const value = await mutate();
  if (!lifecycle.isCurrent()) {
    return { applied: false, value, refreshError: null };
  }

  const committed = lifecycle.onCommitted(value);
  if (committed === false || !lifecycle.isCurrent()) {
    return { applied: false, value, refreshError: null };
  }

  let refreshError = null;
  try {
    await lifecycle.refreshCompanion?.(value);
  } catch (error) {
    refreshError = error;
  }
  return { applied: true, value, refreshError };
}

/**
 * @template T
 * @param {{
 *   api: { updateWorkItem(itemKey: string, payload: WorkItemUpdatePayload): Promise<T> },
 *   itemKey: string,
 *   payload: WorkItemUpdatePayload,
 *   lifecycle: MutationLifecycle<T>,
 * }} options
 * @returns {Promise<MutationResult<T>>}
 */
export function saveWorkItem({ api, itemKey, payload, lifecycle }) {
  return runMutation(() => api.updateWorkItem(itemKey, payload), lifecycle);
}

/**
 * @template T
 * @param {{
 *   api: { handoffWorkItem(itemKey: string, payload: WorkItemHandoffPayload): Promise<T> },
 *   itemKey: string,
 *   payload: WorkItemHandoffPayload,
 *   lifecycle: MutationLifecycle<T>,
 * }} options
 * @returns {Promise<MutationResult<T>>}
 */
export function handoffWorkItem({ api, itemKey, payload, lifecycle }) {
  return runMutation(() => api.handoffWorkItem(itemKey, payload), lifecycle);
}

/**
 * @template T
 * @param {{
 *   api: { createWorkItemComment(itemKey: string, payload: CommentRequestPayload): Promise<T> },
 *   itemKey: string,
 *   payload: CommentRequestPayload,
 *   lifecycle: MutationLifecycle<T>,
 * }} options
 * @returns {Promise<MutationResult<T>>}
 */
export function createWorkItemComment({ api, itemKey, payload, lifecycle }) {
  return runMutation(() => api.createWorkItemComment(itemKey, payload), lifecycle);
}

/**
 * @template T
 * @param {{
 *   api: { updateWorkItemComment(itemKey: string, commentId: number, payload: CommentRequestPayload): Promise<T> },
 *   itemKey: string,
 *   commentId: number,
 *   payload: CommentRequestPayload,
 *   lifecycle: MutationLifecycle<T>,
 * }} options
 * @returns {Promise<MutationResult<T>>}
 */
export function updateWorkItemComment({ api, itemKey, commentId, payload, lifecycle }) {
  return runMutation(() => api.updateWorkItemComment(itemKey, commentId, payload), lifecycle);
}
