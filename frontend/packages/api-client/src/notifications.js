// @ts-check

/** @typedef {{ method?: string, headers?: Record<string, string>, body?: string }} ApiRequestOptions */
/** @typedef {(url: string, options?: ApiRequestOptions) => Promise<any>} ApiRequest */
/** @typedef {() => Promise<void>} PrepareWrite */
/** @typedef {{ kind: 'work_item', project_key: string, work_item_key: string, comment_id: number | null }} NotificationTarget */
/** @typedef {{ id: number, kind: string, title: string, body: string, actor: string, created_at: string, read: boolean, target: NotificationTarget | null }} NotificationItem */
/** @typedef {{ items: NotificationItem[], unread_count: number, pending_count: number, filter: string, page: number, per_page: number, total_items: number, total_pages: number }} NotificationFeed */
/** @typedef {{ notification_id: number, read: boolean, target: NotificationTarget | null }} NotificationTargetPayload */
/** @typedef {{ getNotifications(query?: number | { limit?: number, filter?: string, page?: number, perPage?: number }): Promise<NotificationFeed>, getNotificationTarget(notificationId: number): Promise<NotificationTargetPayload>, markNotificationRead(notificationId: number): Promise<NotificationTargetPayload>, markAllNotificationsRead(): Promise<{ affected: number }> }} NotificationClient */

/**
 * @param {{ request: ApiRequest, prepareWrite: PrepareWrite }} dependencies
 * @returns {NotificationClient}
 */
export function createNotificationClient({ request, prepareWrite }) {
  return {
    /**
     * @param {number | { limit?: number, filter?: string, page?: number, perPage?: number }} [query]
     */
    getNotifications(query = {}) {
      const params = new URLSearchParams();
      if (typeof query === 'number') {
        params.set('limit', String(query));
      } else {
        const limit = query.limit;
        const filter = query.filter;
        const page = query.page;
        const perPage = query.perPage;
        if (typeof limit === 'number' && Number.isInteger(limit) && limit > 0) {
          params.set('limit', String(limit));
        }
        if (typeof filter === 'string' && filter.trim()) {
          params.set('filter', filter.trim());
        }
        if (typeof page === 'number' && Number.isInteger(page) && page > 0) {
          params.set('page', String(page));
        }
        if (typeof perPage === 'number' && Number.isInteger(perPage) && perPage > 0) {
          params.set('per_page', String(perPage));
        }
      }
      const suffix = params.size > 0 ? `?${params.toString()}` : '';
      return request(`/api/v1/notifications${suffix}`);
    },

    /** @param {number} notificationId */
    getNotificationTarget(notificationId) {
      return request(`/api/v1/notifications/${notificationId}/target`);
    },

    /** @param {number} notificationId */
    async markNotificationRead(notificationId) {
      await prepareWrite();
      return request(`/api/v1/notifications/${notificationId}/read`, {
        method: 'POST',
      });
    },

    async markAllNotificationsRead() {
      await prepareWrite();
      return request('/api/v1/notifications/read-all', {
        method: 'POST',
      });
    },
  };
}
