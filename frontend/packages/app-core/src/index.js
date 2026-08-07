// @ts-check

export const APP_CORE_PACKAGE_NAME = '@yuance/frontend-app-core';
export { PUBLIC_HOST_AUTH_STATES, normalizeHostAuthState } from './host-auth-state.js';
export { notificationTargetPath } from './notification-target.js';
export {
  buildHomePath,
  buildMessagesPath,
  buildProfilePath,
  buildProjectDetailPath,
  buildProjectCycleDetailPath,
  buildProjectResourceDetailPath,
  buildProjectsPath,
  buildSearchPath,
  buildWorkItemDetailPath,
  buildWorkItemListPath,
  parseAppRoute,
  routePathForOwner,
} from './routes.js';
export {
  createWorkItemComment,
  downloadWorkItemAttachment,
  downloadWorkItemCommentAttachment,
  downloadProjectAttachment,
  downloadProjectResourceAttachment,
  handoffWorkItem,
  saveWorkItem,
  updateWorkItemComment,
  uploadWorkItemAttachment,
  uploadWorkItemCommentAttachment,
  uploadProjectAttachment,
  uploadProjectResourceAttachment,
} from './work-item-collaboration.js';
export { createProjectResourceWithAttachments } from './project-resource-creation.js';
