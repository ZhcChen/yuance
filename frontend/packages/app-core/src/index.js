// @ts-check

export const APP_CORE_PACKAGE_NAME = '@yuance/frontend-app-core';
export { notificationTargetPath } from './notification-target.js';
export {
  buildHomePath,
  buildMessagesPath,
  buildProjectsPath,
  buildWorkItemDetailPath,
  buildWorkItemListPath,
  parseAppRoute,
} from './routes.js';
export {
  createWorkItemComment,
  handoffWorkItem,
  saveWorkItem,
  updateWorkItemComment,
} from './work-item-collaboration.js';
