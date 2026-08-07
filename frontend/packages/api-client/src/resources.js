// @ts-check

/** @typedef {{ request: (url: string, options?: { method?: string, headers?: Record<string, string>, body?: string }) => Promise<any>, prepareWrite: () => Promise<void> }} ResourceClientDependencies */
/** @typedef {ReturnType<typeof createResourceClient>} ResourceClient */

export function projectResourceApiPath(projectKey, resourceId) {
  const base = `/api/v1/projects/${encodeURIComponent(String(projectKey))}/resources`;
  return resourceId === undefined ? base : `${base}/${encodeURIComponent(String(resourceId))}`;
}

export function createResourceClient({ request, prepareWrite }) {
  return {
    async getProjectResources(projectKey, query = {}) {
      const params = new URLSearchParams();
      for (const [name, wireName] of [['q', 'q'], ['category', 'category'], ['status', 'status'], ['tag', 'tag'], ['relatedWorkItemKey', 'related_work_item_key'], ['relatedCycleId', 'related_cycle_id']]) {
        const value = query[name];
        if (value !== undefined && String(value).trim()) params.set(wireName, String(value).trim());
      }
      const suffix = params.size ? `?${params}` : '';
      return projectResourcesFromPayload(await request(`${projectResourceApiPath(projectKey)}${suffix}`));
    },
    async getProjectResource(projectKey, resourceId) {
      return projectResourceFromPayload(await request(projectResourceApiPath(projectKey, resourceId)));
    },
    async unlockProjectResource(projectKey, resourceId, accessPassword) {
      await prepareWrite();
      return projectResourceFromPayload(await request(`${projectResourceApiPath(projectKey, resourceId)}/unlock`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ access_password: accessPassword }),
      }));
    },
    async createProjectResource(projectKey, payload) {
      await prepareWrite();
      return projectResourceFromPayload(await request(projectResourceApiPath(projectKey), jsonRequest('POST', projectResourceMutationBody(payload, false))));
    },
    async updateProjectResource(projectKey, resourceId, payload) {
      await prepareWrite();
      return projectResourceFromPayload(await request(projectResourceApiPath(projectKey, resourceId), jsonRequest('PATCH', projectResourceMutationBody(payload, true))));
    },
    async archiveProjectResource(projectKey, resourceId) {
      await prepareWrite();
      return projectResourceFromPayload(await request(projectResourceApiPath(projectKey, resourceId), { method: 'DELETE' }));
    },
    async resetProjectResourcePassword(projectKey, resourceId, payload) {
      await prepareWrite();
      return projectResourceFromPayload(await request(`${projectResourceApiPath(projectKey, resourceId)}/password/reset`, jsonRequest('POST', {
        access_password_action: payload.accessPasswordAction,
        access_password: payload.accessPassword || '',
      })));
    },
  };
}

export function projectResourceMutationBody(payload, update) {
  return {
    title: payload.title,
    category: payload.category || 'other',
    body: payload.body || '',
    body_format: payload.bodyFormat || 'plain',
    ...(update ? { access_password_action: payload.accessPasswordAction || 'keep' } : {}),
    access_password: payload.accessPassword || '',
    tags: payload.tags || [],
    related_work_item_key: payload.relatedWorkItemKey || '',
    related_cycle_id: payload.relatedCycleId || null,
  };
}

export function projectResourcesFromPayload(payload) {
  if (!Array.isArray(payload)) throw new TypeError('project resources are invalid');
  return Object.freeze(payload.map(projectResourceFromPayload));
}

export function projectResourceFromPayload(payload) {
  const value = object(payload, 'project resource');
  return Object.freeze({
    id: positiveInteger(value.id, 'resource ID'), project_key: string(value.project_key, 64, 'project key'), title: string(value.title, 512, 'resource title'),
    category: string(value.category, 64, 'resource category'), body: string(value.body, 128 * 1024, 'resource body'), body_format: string(value.body_format, 32, 'resource body format'),
    summary: string(value.summary, 4096, 'resource summary'), status: string(value.status, 64, 'resource status'), is_protected: boolean(value.is_protected, 'resource protected flag'),
    tags: strings(value.tags, 100, 128, 'resource tags'), related_work_item: nullableRelation(value.related_work_item, workItemRelation), related_cycle: nullableRelation(value.related_cycle, cycleRelation),
    created_by: string(value.created_by, 256, 'resource creator'), updated_by: string(value.updated_by, 256, 'resource updater'),
    created_at: string(value.created_at, 128, 'resource created time'), updated_at: string(value.updated_at, 128, 'resource updated time'), url: internalPath(value.url, 'resource URL'),
  });
}

function workItemRelation(value) { const item = object(value, 'related work item'); return Object.freeze({ key: string(item.key, 64, 'work item key'), item_type: string(item.item_type, 32, 'work item type'), title: string(item.title, 512, 'work item title'), url: internalPath(item.url, 'work item URL') }); }
function cycleRelation(value) { const cycle = object(value, 'related cycle'); return Object.freeze({ id: positiveInteger(cycle.id, 'cycle ID'), name: string(cycle.name, 512, 'cycle name'), start_date: string(cycle.start_date, 32, 'cycle start date'), end_date: string(cycle.end_date, 32, 'cycle end date'), url: internalPath(cycle.url, 'cycle URL') }); }
function nullableRelation(value, parser) { return value === null ? null : parser(value); }
function object(value, name) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} is invalid`); return value; }
function string(value, maximum, name) { if (typeof value !== 'string' || value.length > maximum) throw new TypeError(`${name} is invalid`); return value; }
function boolean(value, name) { if (typeof value !== 'boolean') throw new TypeError(`${name} is invalid`); return value; }
function positiveInteger(value, name) { if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${name} is invalid`); return value; }
function strings(value, count, length, name) { if (!Array.isArray(value) || value.length > count) throw new TypeError(`${name} is invalid`); return Object.freeze(value.map((item) => string(item, length, name))); }
function internalPath(value, name) { const result = string(value, 4096, name); if (!result.startsWith('/web/')) throw new TypeError(`${name} is invalid`); return result; }
function jsonRequest(method, body) { return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }; }
