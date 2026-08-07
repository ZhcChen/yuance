// @ts-check

/** @typedef {{ id: string, title: string, description: string, path: string }} SystemDashboardLink */
/** @typedef {{ links: SystemDashboardLink[] }} SystemDashboard */
/** @typedef {{ page?: number, perPage?: number }} SystemUsersQuery */
/** @typedef {{ username: string, displayName: string, email?: string, mobile?: string, password: string, roleCode: string }} CreateSystemUserPayload */
/** @typedef {{ endpoint: string, region: string, bucket: string, accessKeyId: string, accessKeySecret: string, activate: boolean }} SaveStorageConfigPayload */
/** @typedef {{ versionName: string, title?: string, notes?: string, channel?: string, manifestSha256?: string, signingKeyId?: string, sourceCommit?: string, sourceTag?: string }} CreateSystemReleasePayload */
/** @typedef {{ platform: string, architecture: string, artifactKind: string, originalFilename: string, contentType: string, byteSize: number, checksumSha256?: string }} CreateSystemReleaseAssetPayload */
/** @typedef {{ getSystemDashboard(): Promise<SystemDashboard>, getSystemPermissions(): Promise<any[]>, getSystemUsersView(query?: SystemUsersQuery): Promise<any>, getSystemRolesView(query?: { role?: string, page?: number, perPage?: number }): Promise<any>, getSystemStorageView(query?: SystemUsersQuery): Promise<any>, getSystemOpenApiView(): Promise<any>, createSystemApiToken(name: string, scopes: string[]): Promise<any>, updateSystemApiToken(tokenId: number, name: string, scopes: string[]): Promise<any>, deleteSystemApiToken(tokenId: number): Promise<any>, getSystemReleasesView(query?: SystemUsersQuery): Promise<any>, updateSystemReleaseSettings(retentionCount: number): Promise<any>, createSystemRelease(payload: CreateSystemReleasePayload): Promise<any>, updateSystemRelease(releaseId: number, payload: { versionName: string, title?: string, notes?: string, publish?: boolean }): Promise<any>, verifySystemRelease(releaseId: number): Promise<any>, withdrawSystemRelease(releaseId: number, reason: string): Promise<any>, createSystemReleaseAsset(releaseId: number, payload: CreateSystemReleaseAssetPayload): Promise<any>, getSystemReleaseAssetUploadUrl(releaseId: number, assetId: number): Promise<any>, markSystemReleaseAssetUploaded(releaseId: number, assetId: number): Promise<any>, getSystemReleaseAssetDownloadUrl(releaseId: number, assetId: number): Promise<any>, deleteSystemReleaseAsset(releaseId: number, assetId: number): Promise<any>, saveStorageConfig(payload: SaveStorageConfigPayload): Promise<any>, probeStorageConfig(): Promise<any>, initializeStorageConfig(): Promise<any>, rollbackStorageConfig(version: number): Promise<any>, createSystemRole(roleCode: string, roleName: string, dataScopeType: string): Promise<any>, updateSystemRoleStatus(roleCode: string, status: string): Promise<any>, updateSystemRolePermissions(roleCode: string, permissionKeys: string[]): Promise<any>, createSystemUser(payload: CreateSystemUserPayload): Promise<any>, updateSystemUserStatus(username: string, status: string): Promise<any>, updateSystemUserRole(username: string, roleCode: string): Promise<any>, resetSystemUserPassword(username: string, password: string): Promise<any>, assignSystemUserProjects(username: string, projectKeys: string[], memberRole: string): Promise<any>, removeSystemUserProjects(username: string, projectKeys: string[]): Promise<any>, removeSystemUserProject(username: string, projectKey: string): Promise<any>, updateSystemUserProjectRole(username: string, projectKey: string, memberRole: string): Promise<any> }} SystemClient */

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
    getSystemPermissions() {
      return request('/api/v1/system/permissions');
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
    getSystemOpenApiView() {
      return request('/api/v1/system/openapi-view');
    },
    createSystemApiToken(name, scopes) {
      return write('/api/v1/system/api-tokens', 'POST', { name, scopes });
    },
    updateSystemApiToken(tokenId, name, scopes) {
      return write(`/api/v1/system/api-tokens/${encodeURIComponent(String(tokenId))}`, 'PATCH', { name, scopes });
    },
    deleteSystemApiToken(tokenId) {
      return write(`/api/v1/system/api-tokens/${encodeURIComponent(String(tokenId))}`, 'DELETE');
    },
    getSystemReleasesView(query = {}) {
      const params = new URLSearchParams();
      if (Number.isInteger(query.page) && Number(query.page) > 1) params.set('page', String(query.page));
      if (Number.isInteger(query.perPage) && Number(query.perPage) !== 10) params.set('per_page', String(query.perPage));
      const suffix = params.size ? `?${params.toString()}` : '';
      return request(`/api/v1/system/releases-view${suffix}`);
    },
    updateSystemReleaseSettings(retentionCount) {
      return write('/api/v1/system/releases/settings', 'PATCH', { retention_count: retentionCount });
    },
    createSystemRelease(payload) {
      return write('/api/v1/system/releases', 'POST', {
        version_name: payload.versionName, title: payload.title || '', notes: payload.notes || '', channel: payload.channel || 'legacy',
        manifest_sha256: payload.manifestSha256 || '', signing_key_id: payload.signingKeyId || '',
        source_commit: payload.sourceCommit || '', source_tag: payload.sourceTag || '',
      });
    },
    updateSystemRelease(releaseId, payload) {
      return write(`/api/v1/system/releases/${encodeURIComponent(String(releaseId))}`, 'PATCH', {
        version_name: payload.versionName, title: payload.title || '', notes: payload.notes || '', publish: Boolean(payload.publish),
      });
    },
    verifySystemRelease(releaseId) {
      return write(`/api/v1/system/releases/${encodeURIComponent(String(releaseId))}/verify`, 'POST');
    },
    withdrawSystemRelease(releaseId, reason) {
      return write(`/api/v1/system/releases/${encodeURIComponent(String(releaseId))}/withdraw`, 'POST', { reason, github_withdrawal_status: 'pending' });
    },
    async createSystemReleaseAsset(releaseId, payload) {
      return publicReleaseAsset(await write(`/api/v1/system/releases/${encodeURIComponent(String(releaseId))}/assets`, 'POST', {
        platform: payload.platform, architecture: payload.architecture, artifact_kind: payload.artifactKind,
        original_filename: payload.originalFilename, content_type: payload.contentType, byte_size: payload.byteSize,
        checksum_sha256: payload.checksumSha256 || '',
      }));
    },
    async getSystemReleaseAssetUploadUrl(releaseId, assetId) {
      return signedReleaseAsset(await request(`/api/v1/system/releases/${encodeURIComponent(String(releaseId))}/assets/${encodeURIComponent(String(assetId))}/upload-url?expires_in_seconds=60`));
    },
    async markSystemReleaseAssetUploaded(releaseId, assetId) {
      return publicReleaseAsset(await write(`/api/v1/system/releases/${encodeURIComponent(String(releaseId))}/assets/${encodeURIComponent(String(assetId))}/uploaded`, 'POST'));
    },
    async getSystemReleaseAssetDownloadUrl(releaseId, assetId) {
      return signedReleaseAsset(await request(`/api/v1/system/releases/${encodeURIComponent(String(releaseId))}/assets/${encodeURIComponent(String(assetId))}/download-url?expires_in_seconds=60`));
    },
    async deleteSystemReleaseAsset(releaseId, assetId) {
      return publicReleaseAsset(await write(`/api/v1/system/releases/${encodeURIComponent(String(releaseId))}/assets/${encodeURIComponent(String(assetId))}`, 'DELETE'));
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

function publicReleaseAsset(value) {
  if (!value || typeof value !== 'object') throw new TypeError('system release asset is invalid');
  return Object.freeze({
    id: value.id, release_id: value.release_id, platform: value.platform, architecture: value.architecture,
    artifact_kind: value.artifact_kind, filename: value.filename, content_type: value.content_type,
    byte_size: value.byte_size, status: value.status, checksum_sha256: value.checksum_sha256, created_at: value.created_at,
  });
}

function signedReleaseAsset(value) {
  if (!value || typeof value !== 'object') throw new TypeError('signed system release asset is invalid');
  return Object.freeze({
    attachment: signedReleaseAssetAttachment(value.attachment),
    request: value.request, expires_in_seconds: value.expires_in_seconds, expires_at: value.expires_at, checksum_sha256: value.checksum_sha256,
  });
}

function signedReleaseAssetAttachment(value) {
  if (!value || typeof value !== 'object') throw new TypeError('signed system release asset attachment is invalid');
  return Object.freeze({
    id: value.id, filename: value.filename, content_type: value.content_type,
    byte_size: value.byte_size, status: value.status, created_at: value.created_at,
  });
}
