// @ts-check

export const APP_CORE_PACKAGE_NAME = '@yuance/frontend-app-core';
export { PUBLIC_HOST_AUTH_STATES, normalizeHostAuthState } from './host-auth-state.js';
export { notificationTargetPath } from './notification-target.js';
export {
  buildHomePath,
  buildMessagesPath,
  buildProfilePath,
  buildProjectDetailPath,
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
  handoffWorkItem,
  saveWorkItem,
  updateWorkItemComment,
  uploadWorkItemAttachment,
  uploadWorkItemCommentAttachment,
} from './work-item-collaboration.js';
