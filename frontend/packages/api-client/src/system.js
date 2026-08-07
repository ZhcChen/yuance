// @ts-check

/** @typedef {{ id: string, title: string, description: string, path: string }} SystemDashboardLink */
/** @typedef {{ links: SystemDashboardLink[] }} SystemDashboard */
/** @typedef {{ page?: number, perPage?: number }} SystemUsersQuery */
/** @typedef {{ getSystemDashboard(): Promise<SystemDashboard>, getSystemUsersView(query?: SystemUsersQuery): Promise<any> }} SystemClient */

/**
 * @param {{ request: (url: string) => Promise<any> }} dependencies
 * @returns {SystemClient}
 */
export function createSystemClient({ request }) {
  return {
    getSystemDashboard() {
      return request('/api/v1/system/dashboard');
    },
    getSystemUsersView(query = {}) {
      const params = new URLSearchParams();
      if (Number.isInteger(query.page) && Number(query.page) > 1) params.set('page', String(query.page));
      if (Number.isInteger(query.perPage) && Number(query.perPage) !== 10) params.set('per_page', String(query.perPage));
      const suffix = params.size ? `?${params.toString()}` : '';
      return request(`/api/v1/system/users-view${suffix}`);
    },
  };
}
