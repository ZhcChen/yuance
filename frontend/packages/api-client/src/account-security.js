// @ts-check

/** @typedef {{ method?: string, headers?: Record<string, string>, body?: string }} ApiRequestOptions */
/** @typedef {(url: string, options?: ApiRequestOptions) => Promise<any>} ApiRequest */
/** @typedef {() => Promise<void>} PrepareWrite */
/** @typedef {{ updateOwnPassword(payload: { currentPassword: string, newPassword: string, newPasswordConfirm: string }): Promise<any>, getApiTokens(): Promise<any>, createApiToken(payload: { name: string, scopes: string[], projectScope: string, expiresAt?: string }): Promise<any>, updateApiToken(tokenId: number, payload: { name: string, scopes: string[], projectScope: string }): Promise<any>, deleteApiToken(tokenId: number): Promise<any>, getDeviceSessions(): Promise<any>, revokeDeviceSession(familyId: string): Promise<any> }} AccountSecurityClient */

/** @param {{ request: ApiRequest, prepareWrite?: PrepareWrite }} dependencies @returns {AccountSecurityClient} */
export function createAccountSecurityClient({ request, prepareWrite = async () => {} }) {
  /** @param {string} url @param {string} method @param {Record<string, unknown>} [body] */
  const write = async (url, method, body) => {
    await prepareWrite();
    return request(url, {
      method,
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
  };
  return {
    /** @param {{ currentPassword: string, newPassword: string, newPasswordConfirm: string }} payload */
    updateOwnPassword(payload) {
      return write('/api/v1/me/password', 'PATCH', {
        current_password: payload.currentPassword,
        new_password: payload.newPassword,
        new_password_confirm: payload.newPasswordConfirm,
      });
    },
    getApiTokens() { return request('/api/v1/me/tokens'); },
    /** @param {{ name: string, scopes: string[], projectScope: string, expiresAt?: string }} payload */
    createApiToken(payload) {
      return write('/api/v1/me/tokens', 'POST', {
        name: payload.name, scopes: payload.scopes, project_scope: payload.projectScope, expires_at: payload.expiresAt || '',
      });
    },
    /** @param {number} tokenId @param {{ name: string, scopes: string[], projectScope: string }} payload */
    updateApiToken(tokenId, payload) {
      return write(`/api/v1/me/tokens/${encodeURIComponent(String(tokenId))}`, 'PATCH', {
        name: payload.name, scopes: payload.scopes, project_scope: payload.projectScope,
      });
    },
    /** @param {number} tokenId */
    deleteApiToken(tokenId) { return write(`/api/v1/me/tokens/${encodeURIComponent(String(tokenId))}`, 'DELETE'); },
    getDeviceSessions() { return request('/api/v1/me/device-sessions'); },
    /** @param {string} familyId */
    revokeDeviceSession(familyId) { return write(`/api/v1/me/device-sessions/${encodeURIComponent(familyId)}`, 'DELETE'); },
  };
}
