// @ts-check

import { attachmentCreateRequestBody, attachmentFromPayload, attachmentSignedUrlFromPayload, attachmentsFromPayload, signedUrlSuffix } from './work-items.js';
import { attachmentPreviewFromPayload } from './attachment-preview.js';

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
  return attachmentPreviewFromPayload(payload, attachmentFromPayload);
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

export function projectCycleBody(payload) {
  return {
    name: payload.name, goal: payload.goal || '', description: payload.description || '',
    owner_username: payload.ownerUsername || '', start_date: payload.startDate, end_date: payload.endDate,
  };
}

function jsonRequest(method, body) {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}
