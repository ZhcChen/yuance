// @ts-check

/** @typedef {{ id: string, title: string, description: string, path: string }} SystemDashboardLink */
/** @typedef {{ links: SystemDashboardLink[] }} SystemDashboard */
/** @typedef {{ getSystemDashboard(): Promise<SystemDashboard> }} SystemClient */

/**
 * @param {{ request: (url: string) => Promise<any> }} dependencies
 * @returns {SystemClient}
 */
export function createSystemClient({ request }) {
  return {
    getSystemDashboard() {
      return request('/api/v1/system/dashboard');
    },
  };
}
