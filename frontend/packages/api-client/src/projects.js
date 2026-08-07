// @ts-check

import { attachmentCreateRequestBody, attachmentFromPayload, attachmentSignedUrlFromPayload, attachmentsFromPayload, signedUrlSuffix } from './work-items.js';

/** @typedef {{ request: (url: string, options?: { method?: string, headers?: Record<string, string>, body?: string }) => Promise<any>, prepareWrite: () => Promise<void> }} ProjectClientDependencies */
/** @typedef {ReturnType<typeof createProjectClient>} ProjectClient */

export function projectApiPath(projectKey) {
  return `/api/v1/projects/${encodeURIComponent(String(projectKey))}`;
}

export function projectMemberApiPath(projectKey, username) {
  const base = `${projectApiPath(projectKey)}/members`;
  return username === undefined ? base : `${base}/${encodeURIComponent(String(username))}`;
}

export function projectCycleApiPath(projectKey, cycleId) {
  const base = `${projectApiPath(projectKey)}/cycles`;
  return cycleId === undefined ? base : `${base}/${encodeURIComponent(String(cycleId))}`;
}

export function projectPersonalAnalysisApiPath(projectKey) {
  return `${projectApiPath(projectKey)}/my-analysis`;
}

export function projectAttachmentApiPath(projectKey, attachmentId) {
  const base = `${projectApiPath(projectKey)}/attachments`;
  return attachmentId === undefined ? base : `${base}/${encodeURIComponent(String(attachmentId))}`;
}

export function projectAttachmentPreviewApiPath(projectKey, attachmentId) {
  return `${projectAttachmentApiPath(projectKey, attachmentId)}/preview`;
}

export function createProjectClient({ request, prepareWrite }) {
  return {
    getProject(projectKey) {
      return request(projectApiPath(projectKey));
    },
    getProjectMembers(projectKey) {
      return request(projectMemberApiPath(projectKey));
    },
    getProjectCycles(projectKey) { return request(projectCycleApiPath(projectKey)); },
    getProjectCycle(projectKey, cycleId) { return request(projectCycleApiPath(projectKey, cycleId)); },
    getProjectPersonalAnalysis(projectKey) { return request(projectPersonalAnalysisApiPath(projectKey)); },
    async getProjectAttachments(projectKey) { return attachmentsFromPayload(await request(projectAttachmentApiPath(projectKey))); },
    async getProjectAttachmentPreview(projectKey, attachmentId) {
      return projectAttachmentPreviewFromPayload(await request(projectAttachmentPreviewApiPath(projectKey, attachmentId)));
    },
    async createProjectAttachment(projectKey, payload) {
      await prepareWrite();
      return attachmentFromPayload(await request(projectAttachmentApiPath(projectKey), jsonRequest('POST', attachmentCreateRequestBody(payload))));
    },
    async getProjectAttachmentUploadUrl(projectKey, attachmentId, query) {
      return attachmentSignedUrlFromPayload(await request(`${projectAttachmentApiPath(projectKey, attachmentId)}/upload-url${signedUrlSuffix(query)}`));
    },
    async markProjectAttachmentUploaded(projectKey, attachmentId) {
      await prepareWrite();
      return attachmentFromPayload(await request(`${projectAttachmentApiPath(projectKey, attachmentId)}/uploaded`, { method: 'POST' }));
    },
    async getProjectAttachmentDownloadUrl(projectKey, attachmentId, query) {
      return attachmentSignedUrlFromPayload(await request(`${projectAttachmentApiPath(projectKey, attachmentId)}/download-url${signedUrlSuffix(query)}`));
    },
    async archiveProjectAttachment(projectKey, attachmentId) {
      await prepareWrite();
      return attachmentFromPayload(await request(projectAttachmentApiPath(projectKey, attachmentId), { method: 'DELETE' }));
    },
    async createProjectCycle(projectKey, payload) {
      await prepareWrite();
      return request(projectCycleApiPath(projectKey), jsonRequest('POST', projectCycleBody(payload)));
    },
    async updateProjectCycle(projectKey, cycleId, payload) {
      await prepareWrite();
      return request(projectCycleApiPath(projectKey, cycleId), jsonRequest('PATCH', projectCycleBody(payload)));
    },
    async closeProjectCycle(projectKey, cycleId) {
      await prepareWrite();
      return request(`${projectCycleApiPath(projectKey, cycleId)}/close`, { method: 'POST' });
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

export function projectAttachmentPreviewFromPayload(payload) {
  const value = requireObject(payload, 'project attachment preview');
  const preview = requireObject(value.preview, 'attachment preview capability');
  const navigation = requireObject(value.navigation, 'attachment preview navigation');
  return Object.freeze({
    attachment: attachmentFromPayload(value.attachment),
    preview: Object.freeze({
      kind: nullableEnum(preview.kind, ['image', 'video', 'document'], 'preview kind'),
      strategy: nullableString(preview.strategy, 'preview strategy'),
      file_type: nullableString(preview.file_type, 'preview file type'),
      kind_label: nullableString(preview.kind_label, 'preview kind label'),
      is_experimental: requiredBoolean(preview.is_experimental, 'preview experimental flag'),
      legacy_preview_enabled: requiredBoolean(preview.legacy_preview_enabled, 'legacy preview flag'),
      content_enabled: requiredBoolean(preview.content_enabled, 'preview content flag'),
    }),
    navigation: Object.freeze({
      position: nonNegativeInteger(navigation.position, 'preview position'),
      total: nonNegativeInteger(navigation.total, 'preview total'),
      previous: previewNavigationLink(navigation.previous),
      next: previewNavigationLink(navigation.next),
    }),
    content_url: internalPath(value.content_url, 'preview content URL'),
    download_url: internalPath(value.download_url, 'preview download URL'),
  });
}

function previewNavigationLink(value) {
  if (value === null) return null;
  const link = requireObject(value, 'preview navigation link');
  return Object.freeze({
    id: positiveInteger(link.id, 'preview attachment ID'),
    title: requiredString(link.title, 'preview title'),
    url: internalPath(link.url, 'preview navigation URL'),
  });
}

function requireObject(value, name) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} is invalid`); return value; }
function requiredString(value, name) { if (typeof value !== 'string' || value.length < 1 || value.length > 4096) throw new TypeError(`${name} is invalid`); return value; }
function nullableString(value, name) { return value === null ? null : requiredString(value, name); }
function nullableEnum(value, allowed, name) { if (value === null) return null; if (!allowed.includes(value)) throw new TypeError(`${name} is invalid`); return value; }
function requiredBoolean(value, name) { if (typeof value !== 'boolean') throw new TypeError(`${name} is invalid`); return value; }
function positiveInteger(value, name) { if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${name} is invalid`); return value; }
function nonNegativeInteger(value, name) { if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} is invalid`); return value; }
function internalPath(value, name) { const text = requiredString(value, name); if (!text.startsWith('/api/v1/')) throw new TypeError(`${name} is invalid`); return text; }

export function projectUpdateBody(payload) {
  const fields = {
    name: 'name', description: 'description', status: 'status', ownerUsername: 'owner_username',
    startDate: 'start_date', dueDate: 'due_date',
  };
  return Object.fromEntries(Object.entries(fields)
    .filter(([name]) => payload[name] !== undefined)
    .map(([name, wireName]) => [wireName, payload[name]]));
}

export function projectCycleBody(payload) {
  return {
    name: payload.name, goal: payload.goal || '', description: payload.description || '',
    owner_username: payload.ownerUsername || '', start_date: payload.startDate, end_date: payload.endDate,
  };
}

function jsonRequest(method, body) {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}
