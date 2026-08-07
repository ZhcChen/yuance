// @ts-check

/** @typedef {{ request: (url: string, options?: { method?: string, headers?: Record<string, string>, body?: string }) => Promise<any>, prepareWrite: () => Promise<void> }} ProjectClientDependencies */
/** @typedef {ReturnType<typeof createProjectClient>} ProjectClient */

export function projectApiPath(projectKey) {
  return `/api/v1/projects/${encodeURIComponent(String(projectKey))}`;
}

export function projectMemberApiPath(projectKey, username) {
  const base = `${projectApiPath(projectKey)}/members`;
  return username === undefined ? base : `${base}/${encodeURIComponent(String(username))}`;
}

export function createProjectClient({ request, prepareWrite }) {
  return {
    getProject(projectKey) {
      return request(projectApiPath(projectKey));
    },
    getProjectMembers(projectKey) {
      return request(projectMemberApiPath(projectKey));
    },
    async updateProject(projectKey, payload) {
      await prepareWrite();
      return request(projectApiPath(projectKey), jsonRequest('PATCH', projectUpdateBody(payload)));
    },
    async addProjectMember(projectKey, payload) {
      await prepareWrite();
      return request(projectMemberApiPath(projectKey), jsonRequest('POST', {
        username: payload.username,
        member_role: payload.memberRole,
      }));
    },
    async updateProjectMemberRole(projectKey, username, memberRole) {
      await prepareWrite();
      return request(projectMemberApiPath(projectKey, username), jsonRequest('PATCH', { member_role: memberRole }));
    },
    async removeProjectMember(projectKey, username) {
      await prepareWrite();
      return request(projectMemberApiPath(projectKey, username), { method: 'DELETE' });
    },
  };
}

export function projectUpdateBody(payload) {
  const fields = {
    name: 'name', description: 'description', status: 'status', ownerUsername: 'owner_username',
    startDate: 'start_date', dueDate: 'due_date',
  };
  return Object.fromEntries(Object.entries(fields)
    .filter(([name]) => payload[name] !== undefined)
    .map(([name, wireName]) => [wireName, payload[name]]));
}

function jsonRequest(method, body) {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}
