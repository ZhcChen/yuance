// @ts-check

export const APP_CORE_PACKAGE_NAME = '@yuance/frontend-app-core';
export {
  APP_UPDATE_CHECK_INTERVAL_MS,
  APP_UPDATE_MANIFEST_URL,
  createAppUpdateController,
  isReleaseUpdate,
  releaseVersionFromPayload,
} from './app-update.js';
export {
  PUBLIC_HOST_AUTH_LOCKED_REASONS,
  PUBLIC_HOST_AUTH_STATES,
  normalizeHostAuthState,
} from './host-auth-state.js';
export { notificationTargetPath } from './notification-target.js';
export {
  createNotificationActionCoordinator,
} from './notification-actions.js';
export {
  createNotificationEventCoordinator,
  createNotificationEventState,
  reduceNotificationEvent,
} from './notification-events.js';
export { createWorkItemEventCoordinator, createWorkItemTypingController } from './work-item-events.js';
export {
  buildHomePath,
  buildMessagesPath,
  buildProfilePath,
  buildProjectDetailPath,
  buildProjectCycleDetailPath,
  buildProjectResourceDetailPath,
  buildProjectPersonalAnalysisPath,
  buildProjectsPath,
  buildSearchPath,
  buildSystemPath,
  buildSystemOpenApiPath,
  buildSystemApiDocsPath,
  buildSystemDatabaseStatsPath,
  buildSystemAuditPath,
  buildSystemPermissionsPath,
  buildSystemRolesPath,
  buildSystemReleasesPath,
  buildSystemStoragePath,
  buildSystemUsersPath,
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
export { downloadSystemReleaseAsset, uploadSystemReleaseAsset } from './system-release-assets.js';
