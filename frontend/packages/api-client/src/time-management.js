// @ts-check

/** @typedef {{ request: (url: string, options?: { method?: string, headers?: Record<string, string>, body?: string }) => Promise<any>, prepareWrite: () => Promise<void> }} TimeManagementClientDependencies */
/** @typedef {ReturnType<typeof createTimeManagementClient>} TimeManagementClient */

export function timeManagementOverviewApiPath(query = {}) {
  const params = new URLSearchParams();
  if (typeof query.projectKey === 'string' && query.projectKey.trim()) {
    params.set('project_key', query.projectKey.trim());
  }
  if (typeof query.username === 'string' && query.username.trim()) {
    params.set('username', query.username.trim());
  }
  if (typeof query.start === 'string' && query.start.trim()) {
    params.set('start', query.start.trim());
  }
  if (typeof query.end === 'string' && query.end.trim()) {
    params.set('end', query.end.trim());
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return `/api/v1/time-management/overview${suffix}`;
}

export function timeManagementChangesApiPath(query = {}) {
  const params = new URLSearchParams();
  if (typeof query.page === 'number') {
    params.set('page', String(query.page));
  }
  if (typeof query.perPage === 'number') {
    params.set('per_page', String(query.perPage));
  }
  if (typeof query.projectKey === 'string' && query.projectKey.trim()) {
    params.set('project_key', query.projectKey.trim());
  }
  if (typeof query.actor === 'string' && query.actor.trim()) {
    params.set('actor', query.actor.trim());
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return `/api/v1/time-management/changes${suffix}`;
}

export function timeManagementMembersApiPath() {
  return '/api/v1/time-management/members';
}

export function timeManagementChangeRestoreApiPath(recordId) {
  return `/api/v1/time-management/changes/${encodeURIComponent(String(recordId))}/restore`;
}

export function projectTimeAllocationApiPath(projectKey, allocationId) {
  const base = `/api/v1/projects/${encodeURIComponent(String(projectKey))}/time-allocations`;
  return allocationId === undefined ? base : `${base}/${encodeURIComponent(String(allocationId))}`;
}

export function createTimeManagementClient({ request, prepareWrite }) {
  return {
    getTimeManagementOverview(query = {}) {
      return request(timeManagementOverviewApiPath(query));
    },
    getTimeManagementChanges(query = {}) {
      return request(timeManagementChangesApiPath(query));
    },
    getTimeManagementMembers() {
      return request(timeManagementMembersApiPath());
    },
    async restoreTimeManagementChange(recordId) {
      await prepareWrite();
      return request(timeManagementChangeRestoreApiPath(recordId), { method: 'POST' });
    },
    getProjectTimeAllocations(projectKey) {
      return request(projectTimeAllocationApiPath(projectKey));
    },
    async createProjectTimeAllocation(projectKey, payload) {
      await prepareWrite();
      return request(projectTimeAllocationApiPath(projectKey), jsonRequest('POST', timeAllocationBody(payload)));
    },
    async updateProjectTimeAllocation(projectKey, allocationId, payload) {
      await prepareWrite();
      return request(projectTimeAllocationApiPath(projectKey, allocationId), jsonRequest('PATCH', timeAllocationBody(payload)));
    },
    async deleteProjectTimeAllocation(projectKey, allocationId) {
      await prepareWrite();
      return request(projectTimeAllocationApiPath(projectKey, allocationId), { method: 'DELETE' });
    },
  };
}

export function timeAllocationBody(payload) {
  return {
    username: payload.username,
    start_date: payload.startDate,
    end_date: payload.endDate,
    daily_hours: payload.dailyHours,
    note: payload.note || '',
  };
}

function jsonRequest(method, body) {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}
