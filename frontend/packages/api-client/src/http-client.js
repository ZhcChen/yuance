// @ts-check

import { createNotificationClient } from './notifications.js';
import { createSearchClient } from './search.js';
import { createTopbarClient } from './topbar.js';
import { createWorkItemClient } from './work-items.js';

/** @typedef {{ method?: string, headers?: Record<string, string>, body?: string }} ApiRequestOptions */
/** @typedef {(url: string, options?: ApiRequestOptions) => Promise<any>} ApiRequest */
/** @typedef {() => Promise<void>} PrepareWrite */
/** @typedef {{ id: number, username: string, display_name: string, is_super_admin: boolean }} AuthUser */
/** @typedef {import('./work-items.js').WorkItemClient} WorkItemClient */
/** @typedef {import('./notifications.js').NotificationClient} NotificationClient */
/** @typedef {import('./search.js').SearchClient} SearchClient */
/** @typedef {import('./topbar.js').TopbarClient} TopbarClient */
/** @typedef {WorkItemClient & NotificationClient & SearchClient & TopbarClient & { getCurrentUser(): Promise<AuthUser>, getProjects(query?: { status?: string, page?: number, perPage?: number }): Promise<{ items: Array<{ key: string, name: string, status: string, owner: string, work_item_count: number, active_work_item_count: number, updated_at: string }>, pagination: { page: number, per_page: number, total_items: number, total_pages: number } }>, updateCurrentProject(projectKey: string): Promise<{ key: string, name: string }>, logout(): Promise<{ revoked: boolean }> }} ApiClient */

/**
 * @param {{ request: ApiRequest, prepareWrite?: PrepareWrite }} dependencies
 * @returns {ApiClient}
 */
export function createApiClient({ request, prepareWrite = async () => {} }) {
  const workItems = createWorkItemClient({ request, prepareWrite });
  const notifications = createNotificationClient({ request, prepareWrite });
  const search = createSearchClient({ request });
  const topbar = createTopbarClient({ request });

  return {
    /** @returns {Promise<AuthUser>} */
    getCurrentUser() {
      return request('/api/v1/auth/me');
    },

    /**
     * @param {{ status?: string, page?: number, perPage?: number }} [query]
     */
    getProjects(query = {}) {
      const params = new URLSearchParams();
      if (typeof query.status === 'string' && query.status.trim() && query.status.trim() !== 'all') {
        params.set('status', query.status.trim());
      }
      if (typeof query.page === 'number' && Number.isInteger(query.page) && query.page > 0) {
        params.set('page', String(query.page));
      }
      if (typeof query.perPage === 'number' && Number.isInteger(query.perPage) && query.perPage > 0) {
        params.set('per_page', String(query.perPage));
      }
      const suffix = params.size > 0 ? `?${params.toString()}` : '';
      return request(`/api/v1/projects${suffix}`);
    },

    /** @param {string} projectKey */
    async updateCurrentProject(projectKey) {
      await prepareWrite();
      return request('/api/v1/current-project', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ project_key: projectKey }),
      });
    },

    async logout() {
      await prepareWrite();
      return request('/api/v1/auth/logout', {
        method: 'POST',
      });
    },

    ...topbar,
    ...workItems,
    ...notifications,
    ...search,
  };
}
