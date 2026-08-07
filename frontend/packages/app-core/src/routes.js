// @ts-check

const DEFAULT_FILTER = 'all';
const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 10;
const WORK_ITEM_ROUTE_META = {
  requirement: {
    id: 'requirements',
    title: '需求列表',
    appPath: '/web/app/requirements',
    webPath: '/web/requirements',
  },
  task: {
    id: 'tasks',
    title: '任务列表',
    appPath: '/web/app/tasks',
    webPath: '/web/tasks',
  },
  bug: {
    id: 'bugs',
    title: '缺陷列表',
    appPath: '/web/app/bugs',
    webPath: '/web/bugs',
  },
};

function normalizeOwner(pathname) {
  return pathname.startsWith('/web/app') ? 'app' : 'web';
}

function normalizeFilter(value) {
  switch ((value || '').trim().toLowerCase()) {
    case 'unread':
      return 'unread';
    case 'pending':
    case 'pending_discussion':
      return 'pending';
    case 'read':
      return 'read';
    default:
      return DEFAULT_FILTER;
  }
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function routeMetaForItemType(itemType = 'task') {
  return WORK_ITEM_ROUTE_META[itemType] || WORK_ITEM_ROUTE_META.task;
}

function buildWorkItemQuery({ q = '', status = '', priority = '', assigneeUsername = '', page = DEFAULT_PAGE, perPage = DEFAULT_PER_PAGE } = {}) {
  const params = new URLSearchParams();
  const normalizedPage = normalizePositiveInt(page, DEFAULT_PAGE);
  const normalizedPerPage = normalizePositiveInt(perPage, DEFAULT_PER_PAGE);
  if (typeof q === 'string' && q.trim()) {
    params.set('q', q.trim());
  }
  if (typeof status === 'string' && status.trim()) {
    params.set('status', status.trim());
  }
  if (typeof priority === 'string' && priority.trim()) {
    params.set('priority', priority.trim().toUpperCase());
  }
  if (typeof assigneeUsername === 'string' && assigneeUsername.trim()) {
    params.set('assignee_username', assigneeUsername.trim());
  }
  if (normalizedPage > DEFAULT_PAGE) {
    params.set('page', String(normalizedPage));
  }
  if (normalizedPerPage !== DEFAULT_PER_PAGE) {
    params.set('per_page', String(normalizedPerPage));
  }
  return params.toString();
}

export function buildHomePath(owner = 'web') {
  return owner === 'app' ? '/web/app' : '/web';
}

export function buildProfilePath(owner = 'web') {
  return owner === 'app' ? '/web/app/me' : '/web/me';
}

export function buildSearchPath({ owner = 'web', q = '', page = DEFAULT_PAGE, perPage = DEFAULT_PER_PAGE } = {}) {
  const params = new URLSearchParams();
  const normalizedPage = normalizePositiveInt(page, DEFAULT_PAGE);
  const normalizedPerPage = normalizePositiveInt(perPage, DEFAULT_PER_PAGE);
  if (typeof q === 'string' && q.trim()) {
    params.set('q', q.trim());
  }
  if (normalizedPage > DEFAULT_PAGE) {
    params.set('page', String(normalizedPage));
  }
  if (normalizedPerPage !== DEFAULT_PER_PAGE) {
    params.set('per_page', String(normalizedPerPage));
  }
  const basePath = owner === 'app' ? '/web/app/search' : '/web/search';
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function routePathForOwner(path, owner = 'web') {
  if (typeof path !== 'string' || !(path === '/web' || path.startsWith('/web/')) || path.startsWith('/web/app')) {
    return buildHomePath(owner);
  }
  let parsed;
  try {
    parsed = new globalThis.URL(path, 'https://routes.invalid');
  } catch {
    return buildHomePath(owner);
  }
  if (parsed.origin !== 'https://routes.invalid' || `${parsed.pathname}${parsed.search}${parsed.hash}` !== path) {
    return buildHomePath(owner);
  }
  if (owner === 'app') {
    const suffix = parsed.pathname === '/web' ? '' : parsed.pathname.slice('/web'.length);
    return `/web/app${suffix}${parsed.search}${parsed.hash}`;
  }
  return path;
}

export function buildMessagesPath({ owner = 'web', filter = DEFAULT_FILTER, page = DEFAULT_PAGE, perPage = DEFAULT_PER_PAGE } = {}) {
  const params = new URLSearchParams();
  const normalizedFilter = normalizeFilter(filter);
  const normalizedPage = normalizePositiveInt(page, DEFAULT_PAGE);
  const normalizedPerPage = normalizePositiveInt(perPage, DEFAULT_PER_PAGE);
  if (normalizedFilter !== DEFAULT_FILTER) {
    params.set('filter', normalizedFilter);
  }
  if (normalizedPage > DEFAULT_PAGE) {
    params.set('page', String(normalizedPage));
  }
  if (normalizedPerPage !== DEFAULT_PER_PAGE) {
    params.set('per_page', String(normalizedPerPage));
  }
  const basePath = owner === 'app' ? '/web/app/messages' : '/web/messages';
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function buildProjectsPath({ owner = 'app', status = '', page = DEFAULT_PAGE, perPage = DEFAULT_PER_PAGE } = {}) {
  const params = new URLSearchParams();
  const normalizedPage = normalizePositiveInt(page, DEFAULT_PAGE);
  const normalizedPerPage = normalizePositiveInt(perPage, DEFAULT_PER_PAGE);
  if (typeof status === 'string' && status.trim() && status.trim() !== 'all') {
    params.set('status', status.trim());
  }
  if (normalizedPage > DEFAULT_PAGE) {
    params.set('page', String(normalizedPage));
  }
  if (normalizedPerPage !== DEFAULT_PER_PAGE) {
    params.set('per_page', String(normalizedPerPage));
  }
  const basePath = owner === 'app' ? '/web/app/projects' : '/web/projects';
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function buildProjectDetailPath({ owner = 'app', projectKey = '', tab = 'info' } = {}) {
  const normalizedKey = String(projectKey || '').trim();
  if (!normalizedKey) {
    return buildProjectsPath({ owner });
  }
  const basePath = owner === 'app'
    ? `/web/app/projects/${encodeURIComponent(normalizedKey)}`
    : `/web/projects/${encodeURIComponent(normalizedKey)}`;
  return tab === 'members' ? `${basePath}?tab=members` : basePath;
}

export function buildWorkItemListPath({ owner = 'app', itemType = 'task', q = '', status = '', priority = '', assigneeUsername = '', page = DEFAULT_PAGE, perPage = DEFAULT_PER_PAGE } = {}) {
  const meta = routeMetaForItemType(itemType);
  const basePath = owner === 'app' ? meta.appPath : meta.webPath;
  const query = buildWorkItemQuery({ q, status, priority, assigneeUsername, page, perPage });
  return query ? `${basePath}?${query}` : basePath;
}

/**
 * @param {{ owner?: 'app' | 'web', itemKey?: string, commentId?: number | null }} [options]
 */
export function buildWorkItemDetailPath({ owner = 'app', itemKey = '', commentId = null } = {}) {
  const normalizedKey = String(itemKey || '').trim();
  if (!normalizedKey) {
    return buildWorkItemListPath({ owner, itemType: 'task' });
  }
  const basePath = owner === 'app'
    ? `/web/app/work-items/${encodeURIComponent(normalizedKey)}`
    : `/web/work-items/${encodeURIComponent(normalizedKey)}`;
  if (typeof commentId === 'number' && Number.isInteger(commentId) && commentId > 0) {
    return `${basePath}#comment-${commentId}`;
  }
  return basePath;
}

export function parseAppRoute(pathname = '/web', search = '') {
  const owner = normalizeOwner(pathname);
  const query = new URLSearchParams(search);
  const filter = normalizeFilter(query.get('filter') || '');
  const page = normalizePositiveInt(query.get('page'), DEFAULT_PAGE);
  const perPage = normalizePositiveInt(query.get('per_page'), DEFAULT_PER_PAGE);

  if (pathname === '/web' || pathname === '/web/' || pathname === '/web/app' || pathname === '/web/app/') {
    return {
      id: 'home',
      owner,
      pathname,
      search,
      title: '元策浏览器工作台',
    };
  }

  if (pathname === '/web/messages' || pathname.startsWith('/web/messages/') || pathname === '/web/app/messages' || pathname.startsWith('/web/app/messages/')) {
    return {
      id: 'messages',
      owner,
      pathname,
      search,
      filter,
      page,
      perPage,
      title: '消息中心',
    };
  }

  if (pathname === '/web/search' || pathname === '/web/app/search') {
    return {
      id: 'search',
      owner,
      pathname,
      search,
      q: (query.get('q') || '').trim(),
      page,
      perPage,
      title: '全局搜索',
    };
  }

  if (pathname === '/web/me' || pathname === '/web/app/me') {
    return {
      id: 'profile',
      owner,
      pathname,
      search,
      title: '个人中心',
    };
  }

  if (pathname === '/web/projects' || pathname === '/web/app/projects') {
    return {
      id: 'projects',
      owner,
      pathname,
      search,
      status: (query.get('status') || '').trim(),
      page,
      perPage,
      title: '项目列表',
    };
  }


  const projectDetailMatch = pathname.match(/^\/web(?:\/app)?\/projects\/([^/]+)$/);
  if (projectDetailMatch) {
    return {
      id: 'project-detail',
      owner,
      pathname,
      search,
      projectKey: decodeURIComponent(projectDetailMatch[1]),
      tab: query.get('tab') === 'members' ? 'members' : 'info',
      title: '项目详情',
    };
  }

  for (const [itemType, meta] of Object.entries(WORK_ITEM_ROUTE_META)) {
    if (pathname === meta.webPath || pathname === meta.appPath) {
      return {
        id: meta.id,
        owner,
        pathname,
        search,
        itemType,
        q: (query.get('q') || '').trim(),
        status: (query.get('status') || '').trim(),
        priority: (query.get('priority') || '').trim().toUpperCase(),
        assigneeUsername: (query.get('assignee_username') || '').trim(),
        page,
        perPage,
        title: meta.title,
      };
    }
  }

  const workItemDetailMatch = pathname.match(/^\/web(?:\/app)?\/work-items\/([^/]+)$/);
  if (workItemDetailMatch) {
    return {
      id: 'work-item-detail',
      owner,
      pathname,
      search,
      itemKey: decodeURIComponent(workItemDetailMatch[1]),
      title: '工作项详情',
    };
  }

  const legacyPath = owner === 'app' && pathname.startsWith('/web/app/')
    ? `/web/${pathname.slice('/web/app/'.length)}`
    : '/web';

  return {
    id: 'unsupported',
    owner,
    pathname,
    search,
    legacyPath,
    title: '未迁移路由',
  };
}
