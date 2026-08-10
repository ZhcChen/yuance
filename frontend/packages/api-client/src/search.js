// @ts-check

/** @typedef {{ method?: string, headers?: Record<string, string>, body?: string }} ApiRequestOptions */
/** @typedef {(url: string, options?: ApiRequestOptions) => Promise<any>} ApiRequest */
/** @typedef {{ kind: string, key: string, title: string, context: string, target: string, updated_at: string }} SearchResult */
/** @typedef {{ items: SearchResult[], pagination: { page: number, per_page: number, total_items: number, total_pages: number } }} SearchPage */
/** @typedef {{ search(query?: { q?: string, page?: number, perPage?: number }): Promise<SearchPage> }} SearchClient */

/**
 * @param {{ request: ApiRequest }} dependencies
 * @returns {SearchClient}
 */
export function createSearchClient({ request }) {
  return {
    search(query = {}) {
      const params = new URLSearchParams();
      if (typeof query.q === 'string' && query.q.trim()) params.set('q', query.q.trim());
      if (Number.isInteger(query.page) && Number(query.page) > 0) params.set('page', String(query.page));
      if (Number.isInteger(query.perPage) && Number(query.perPage) > 0) params.set('per_page', String(query.perPage));
      const suffix = params.size > 0 ? `?${params.toString()}` : '';
      return request(`/api/v1/search${suffix}`);
    },
  };
}
