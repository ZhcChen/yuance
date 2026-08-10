// @ts-check

/** @typedef {{ method?: string, headers?: Record<string, string>, body?: string }} ApiRequestOptions */
/** @typedef {(url: string, options?: ApiRequestOptions) => Promise<any>} ApiRequest */
/** @typedef {{ project_key: string, pending_count: number }} TopbarProjectBadge */
/** @typedef {{ key: string, name: string, pending_count: number }} TopbarCurrentProject */
/** @typedef {{ key: string, name: string, pending_count: number }} TopbarProjectOption */
/** @typedef {{ id: string, title: string, description: string, path: string }} TopbarSystemLink */
/** @typedef {{ requirements_count: number, tasks_count: number, bugs_count: number, notifications_count: number, project_badges: TopbarProjectBadge[], project_options: TopbarProjectOption[], system_links: TopbarSystemLink[], current_project: TopbarCurrentProject | null }} TopbarStatus */
/** @typedef {{ getTopbarStatus(): Promise<TopbarStatus> }} TopbarClient */

/**
 * @param {{ request: ApiRequest }} dependencies
 * @returns {TopbarClient}
 */
export function createTopbarClient({ request }) {
  return {
    getTopbarStatus() {
      return request('/api/v1/topbar/status');
    },
  };
}
