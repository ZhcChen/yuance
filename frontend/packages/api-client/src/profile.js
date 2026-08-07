// @ts-check

/** @typedef {{ method?: string, headers?: Record<string, string>, body?: string }} ApiRequestOptions */
/** @typedef {(url: string, options?: ApiRequestOptions) => Promise<any>} ApiRequest */
/** @typedef {() => Promise<void>} PrepareWrite */
/** @typedef {{ id: number, username: string, display_name: string, email: string, mobile: string, status: string, is_super_admin: boolean, roles: string, created_at: string, updated_at: string }} OwnProfile */
/** @typedef {{ getOwnProfile(): Promise<OwnProfile>, updateOwnProfile(payload: { displayName: string, email?: string, mobile?: string }): Promise<OwnProfile> }} ProfileClient */

/** @param {{ request: ApiRequest, prepareWrite?: PrepareWrite }} dependencies @returns {ProfileClient} */
export function createProfileClient({ request, prepareWrite = async () => {} }) {
  return {
    getOwnProfile() {
      return request('/api/v1/me/profile');
    },
    async updateOwnProfile(payload) {
      await prepareWrite();
      return request('/api/v1/me/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          display_name: payload.displayName,
          email: payload.email || '',
          mobile: payload.mobile || '',
        }),
      });
    },
  };
}
