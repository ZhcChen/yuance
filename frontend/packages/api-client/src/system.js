// @ts-check

/** @typedef {{ id: string, title: string, description: string, path: string }} SystemDashboardLink */
/** @typedef {{ links: SystemDashboardLink[] }} SystemDashboard */
/** @typedef {{ page?: number, perPage?: number }} SystemUsersQuery */
/** @typedef {{ username: string, displayName: string, email?: string, mobile?: string, password: string, roleCode: string }} CreateSystemUserPayload */
/** @typedef {{ getSystemDashboard(): Promise<SystemDashboard>, getSystemUsersView(query?: SystemUsersQuery): Promise<any>, createSystemUser(payload: CreateSystemUserPayload): Promise<any>, updateSystemUserStatus(username: string, status: string): Promise<any>, updateSystemUserRole(username: string, roleCode: string): Promise<any>, resetSystemUserPassword(username: string, password: string): Promise<any> }} SystemClient */

/**
 * @param {{ request: (url: string, options?: { method?: string, headers?: Record<string, string>, body?: string }) => Promise<any>, prepareWrite?: () => Promise<void> }} dependencies
 * @returns {SystemClient}
 */
export function createSystemClient({ request, prepareWrite = async () => {} }) {
  const write = async (url, method, body) => {
    await prepareWrite();
    return request(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  };
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
    createSystemUser(payload) {
      return write('/api/v1/system/users', 'POST', {
        username: payload.username, display_name: payload.displayName, email: payload.email || '', mobile: payload.mobile || '',
        password: payload.password, role_code: payload.roleCode,
      });
    },
    updateSystemUserStatus(username, status) {
      return write(`/api/v1/system/users/${encodeURIComponent(username)}/status`, 'PATCH', { status });
    },
    updateSystemUserRole(username, roleCode) {
      return write(`/api/v1/system/users/${encodeURIComponent(username)}/role`, 'PATCH', { role_code: roleCode });
    },
    resetSystemUserPassword(username, password) {
      return write(`/api/v1/system/users/${encodeURIComponent(username)}/password`, 'POST', { password });
    },
  };
}
