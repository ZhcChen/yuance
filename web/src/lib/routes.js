// @ts-check

export {
  buildHomePath,
  buildMessagesPath,
  buildProjectsPath,
  buildWorkItemDetailPath,
  buildWorkItemListPath,
} from '@yuance/frontend-app-core';

import { parseAppRoute as parseCoreAppRoute } from '@yuance/frontend-app-core';

export function parseAppRoute(pathname = window.location.pathname, search = window.location.search) {
  return parseCoreAppRoute(pathname, search);
}
