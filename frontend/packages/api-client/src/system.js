// @ts-check

/** @typedef {{ id: string, title: string, description: string, path: string }} SystemDashboardLink */
/** @typedef {{ links: SystemDashboardLink[] }} SystemDashboard */
/** @typedef {{ page?: number, perPage?: number }} SystemUsersQuery */
/** @typedef {{ username: string, displayName: string, email?: string, mobile?: string, password: string, roleCode: string }} CreateSystemUserPayload */
/** @typedef {{ endpoint: string, region: string, bucket: string, accessKeyId: string, accessKeySecret: string, activate: boolean }} SaveStorageConfigPayload */
/** @typedef {{ getSystemDashboard(): Promise<SystemDashboard>, getSystemUsersView(query?: SystemUsersQuery): Promise<any>, getSystemRolesView(query?: { role?: string, page?: number, perPage?: number }): Promise<any>, getSystemStorageView(query?: SystemUsersQuery): Promise<any>, saveStorageConfig(payload: SaveStorageConfigPayload): Promise<any>, probeStorageConfig(): Promise<any>, initializeStorageConfig(): Promise<any>, rollbackStorageConfig(version: number): Promise<any>, createSystemRole(roleCode: string, roleName: string, dataScopeType: string): Promise<any>, updateSystemRoleStatus(roleCode: string, status: string): Promise<any>, updateSystemRolePermissions(roleCode: string, permissionKeys: string[]): Promise<any>, createSystemUser(payload: CreateSystemUserPayload): Promise<any>, updateSystemUserStatus(username: string, status: string): Promise<any>, updateSystemUserRole(username: string, roleCode: string): Promise<any>, resetSystemUserPassword(username: string, password: string): Promise<any>, assignSystemUserProjects(username: string, projectKeys: string[], memberRole: string): Promise<any>, removeSystemUserProjects(username: string, projectKeys: string[]): Promise<any>, removeSystemUserProject(username: string, projectKey: string): Promise<any>, updateSystemUserProjectRole(username: string, projectKey: string, memberRole: string): Promise<any> }} SystemClient */

/**
 * @param {{ request: (url: string, options?: { method?: string, headers?: Record<string, string>, body?: string }) => Promise<any>, prepareWrite?: () => Promise<void> }} dependencies
 * @returns {SystemClient}
 */
export function createSystemClient({ request, prepareWrite = async () => {} }) {
  const write = async (url, method, body) => {
    await prepareWrite();
    return body === undefined
      ? request(url, { method })
      : request(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
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
    getSystemRolesView(query = {}) {
      const params = new URLSearchParams();
      if (typeof query.role === 'string' && query.role.trim()) params.set('role', query.role.trim());
      if (Number.isInteger(query.page) && Number(query.page) > 1) params.set('page', String(query.page));
      if (Number.isInteger(query.perPage) && Number(query.perPage) !== 10) params.set('per_page', String(query.perPage));
      const suffix = params.size ? `?${params.toString()}` : '';
      return request(`/api/v1/system/roles-view${suffix}`);
    },
    getSystemStorageView(query = {}) {
      const params = new URLSearchParams();
      if (Number.isInteger(query.page) && Number(query.page) > 1) params.set('page', String(query.page));
      if (Number.isInteger(query.perPage) && Number(query.perPage) !== 10) params.set('per_page', String(query.perPage));
      const suffix = params.size ? `?${params.toString()}` : '';
      return request(`/api/v1/system/storage-view${suffix}`);
    },
    saveStorageConfig(payload) {
      return write('/api/v1/storage/config', 'POST', {
        endpoint: payload.endpoint,
        region: payload.region,
        bucket: payload.bucket,
        access_key_id: payload.accessKeyId,
        access_key_secret: payload.accessKeySecret,
        activate: payload.activate,
      });
    },
    probeStorageConfig() {
      return write('/api/v1/storage/config/probe', 'POST');
    },
    initializeStorageConfig() {
      return write('/api/v1/storage/config/initialize', 'POST');
    },
    rollbackStorageConfig(version) {
      return write(`/api/v1/storage/config/versions/${encodeURIComponent(String(version))}/rollback`, 'POST');
    },
    createSystemRole(roleCode, roleName, dataScopeType) {
      return write('/api/v1/system/roles', 'POST', { role_code: roleCode, role_name: roleName, data_scope_type: dataScopeType });
    },
    updateSystemRoleStatus(roleCode, status) {
      return write(`/api/v1/system/roles/${encodeURIComponent(roleCode)}/status`, 'PATCH', { status });
    },
    updateSystemRolePermissions(roleCode, permissionKeys) {
      return write(`/api/v1/system/roles/${encodeURIComponent(roleCode)}/permissions`, 'PATCH', { permission_keys: permissionKeys });
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
    assignSystemUserProjects(username, projectKeys, memberRole) {
      return write(`/api/v1/system/users/${encodeURIComponent(username)}/projects`, 'POST', { project_keys: projectKeys, member_role: memberRole });
    },
    removeSystemUserProjects(username, projectKeys) {
      return write(`/api/v1/system/users/${encodeURIComponent(username)}/projects`, 'DELETE', { project_keys: projectKeys });
    },
    removeSystemUserProject(username, projectKey) {
      return write(`/api/v1/system/users/${encodeURIComponent(username)}/projects/${encodeURIComponent(projectKey)}`, 'DELETE');
    },
    updateSystemUserProjectRole(username, projectKey, memberRole) {
      return write(`/api/v1/system/users/${encodeURIComponent(username)}/projects/${encodeURIComponent(projectKey)}/role`, 'PATCH', { member_role: memberRole });
    },
  };
}
