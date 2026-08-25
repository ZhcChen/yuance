// @ts-check

/** @typedef {import('./work-items.js').CommentRequestPayload} CommentRequestPayload */
/** @typedef {import('./work-items.js').AttachmentCreatePayload} AttachmentCreatePayload */
/** @typedef {import('./work-items.js').WorkItemHandoffPayload} WorkItemHandoffPayload */
/** @typedef {import('./work-items.js').WorkItemUpdatePayload} WorkItemUpdatePayload */

export const API_CLIENT_PACKAGE_NAME = '@yuance/frontend-api-client';
export { ApiError, apiErrorFromPayload } from './errors.js';
export { createApiClient } from './http-client.js';
export { createDashboardClient } from './dashboard.js';
export { createAccountSecurityClient } from './account-security.js';
export { createProfileClient } from './profile.js';
export { createProjectClient, projectApiPath, projectAttachmentApiPath, projectAttachmentPreviewApiPath, projectAttachmentPreviewFromPayload, projectCycleApiPath, projectCycleBody, projectMemberApiPath, projectMemberBatchApiPath, projectMemberCandidatesApiPath, projectPersonalAnalysisApiPath, projectUpdateBody } from './projects.js';
export { createResourceClient, projectResourceApiPath, projectResourceFromPayload, projectResourceMutationBody, projectResourcesFromPayload } from './resources.js';
export { createSearchClient } from './search.js';
export { createSystemClient } from './system.js';
export {
  createTimeManagementClient,
  projectTimeAllocationApiPath,
  timeAllocationBody,
  timeManagementChangeRestoreApiPath,
  timeManagementChangesApiPath,
  timeManagementMembersApiPath,
  timeManagementOverviewApiPath,
} from './time-management.js';
export {
  attachmentCreateRequestBody,
  attachmentFromPayload,
  attachmentSignedUrlFromPayload,
  attachmentsFromPayload,
  commentRequestBody,
  omitUndefined,
  signedUrlSuffix,
  workItemApiPath,
  workItemAttachmentApiPath,
  workItemCommentApiPath,
  workItemCommentAttachmentApiPath,
} from './work-items.js';
