// @ts-check

export const API_CLIENT_PACKAGE_NAME = '@yuance/frontend-api-client';
export { ApiError, apiErrorFromPayload } from './errors.js';
export { createApiClient } from './http-client.js';
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
