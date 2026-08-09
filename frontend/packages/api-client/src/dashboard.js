// @ts-check

/** @typedef {(url: string) => Promise<any>} ApiRequest */

/** @param {{ request: ApiRequest }} dependencies */
export function createDashboardClient({ request }) {
  return {
    getDashboard() {
      return request('/api/v1/dashboard');
    },
  };
}
