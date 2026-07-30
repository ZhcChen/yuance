// @ts-check

const DEFAULT_FILTER = 'all';
const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 10;

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

export function buildHomePath(owner = 'web') {
  return owner === 'app' ? '/web/app' : '/web';
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

export function parseAppRoute(pathname = window.location.pathname, search = window.location.search) {
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
