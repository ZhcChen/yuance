/*
 * 元策 UI v3 · hash 路由
 * 路径形如 #/requirements、P261102793662 之类的参数以 :name 声明。
 */

const routes = [];

/**
 * 注册路由。
 * @param {string} pattern 形如 "/work-items/:key"
 * @param {string} pageId 页面模块 id
 * @param {Function} handler (params, query) => void
 */
export function route(pattern, pageId, handler) {
  const keys = [];
  const regexSource = pattern
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');

  routes.push({ regex: new RegExp(`^${regexSource}$`), keys, pageId, handler });
}

/** 解析当前 hash，返回匹配的路由与参数。 */
export function resolve(pathname, search = '') {
  for (const entry of routes) {
    const match = entry.regex.exec(pathname);
    if (!match) continue;

    const params = {};
    entry.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(match[index + 1]);
    });

    const query = {};
    for (const [key, value] of new URLSearchParams(search)) {
      query[key] = value;
    }

    return { pageId: entry.pageId, params, query, handler: entry.handler };
  }
  return null;
}

/** 跳转到指定路径。 */
export function navigate(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (replace) {
    window.history.replaceState(null, '', target);
  } else {
    window.location.hash = target;
  }
}

/** 生成带参数的路径。 */
export function buildPath(pattern, params = {}, query = {}) {
  let path = pattern.replace(/:([A-Za-z0-9_]+)/g, (_, key) => encodeURIComponent(params[key] ?? ''));
  const entries = Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (entries.length) {
    path += `?${new URLSearchParams(entries).toString()}`;
  }
  return path;
}
