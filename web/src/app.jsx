// @ts-check

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  getCurrentUser,
  getNotificationTarget,
  getNotifications,
  getTopbarStatus,
  logout,
  markAllNotificationsRead,
  markNotificationRead,
  openTopbarEvents,
  restorePendingReturnToHash,
} from './lib/api.js';
import { notificationTargetPath } from './lib/notification-target.js';
import { buildHomePath, buildMessagesPath, parseAppRoute } from './lib/routes.js';

/**
 * @typedef AppUser
 * @property {number} id
 * @property {string} username
 * @property {string} display_name
 * @property {boolean} is_super_admin
 */

/**
 * @typedef AppProjectBadge
 * @property {string} project_key
 * @property {number} pending_count
 */

/**
 * @typedef AppCurrentProject
 * @property {string} key
 * @property {string} name
 * @property {number} pending_count
 */

/**
 * @typedef AppTopbarStatus
 * @property {number} requirements_count
 * @property {number} tasks_count
 * @property {number} bugs_count
 * @property {number} notifications_count
 * @property {AppProjectBadge[]} project_badges
 * @property {AppCurrentProject | null} current_project
 */

/**
 * @typedef AppNotificationTarget
 * @property {'work_item'} kind
 * @property {string} project_key
 * @property {string} work_item_key
 * @property {number | null} comment_id
 */

/**
 * @typedef AppNotification
 * @property {number} id
 * @property {string} kind
 * @property {string} title
 * @property {string} body
 * @property {string} actor
 * @property {string} created_at
 * @property {boolean} read
 * @property {AppNotificationTarget | null} target
 */

/**
 * @typedef AppNotificationFeed
 * @property {AppNotification[]} items
 * @property {number} unread_count
 * @property {number} pending_count
 * @property {string} filter
 * @property {number} page
 * @property {number} per_page
 * @property {number} total_items
 * @property {number} total_pages
 */

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** @param {ApiError | Error | null} error */
function errorMessage(error) {
  if (!error) {
    return '';
  }
  if (error instanceof ApiError) {
    return error.message;
  }
  return error.message || '加载失败。';
}

/** @param {'all' | 'unread' | 'pending' | 'read'} filter */
function filterLabel(filter) {
  switch (filter) {
    case 'unread':
      return '未读消息';
    case 'pending':
      return '待处理讨论';
    case 'read':
      return '已读消息';
    default:
      return '全部消息';
  }
}

/** @param {ReturnType<typeof parseAppRoute>} route */
function routeDescription(route) {
  switch (route.id) {
    case 'messages':
      return '通过 JSON 契约加载、筛选和处理通知，兼容旧 URL 与前进后退。';
    case 'unsupported':
      return '这个 URL 还没有迁移到新应用壳，当前保留回旧版 SSR 页面的安全退路。';
    default:
      return '当前入口只依赖 REST / SSE 契约，不再读取 Askama HTML 或消息跳转页面作为业务协议。';
  }
}

/** @param {ReturnType<typeof parseAppRoute>} route */
function routeEyebrow(route) {
  return route.id === 'messages' ? 'Message Center' : 'Web App';
}

/** @param {ReturnType<typeof parseAppRoute>} route */
function emptyMessageTitle(route) {
  if (route.id !== 'messages') {
    return '暂无最近消息。';
  }
  switch (route.filter) {
    case 'unread':
      return '没有未读消息。';
    case 'pending':
      return '没有待处理讨论。';
    case 'read':
      return '没有已读消息。';
    default:
      return '暂无消息。';
  }
}

function notificationKindLabel(kind) {
  switch (kind) {
    case 'comment_replied':
      return '回复';
    case 'comment_mentioned':
      return '提及';
    default:
      return '指派';
  }
}

/** @returns {React.ReactElement} */
export default function App() {
  const [route, setRoute] = useState(() => parseAppRoute());
  const routeRef = useRef(route);
  const headingRef = useRef(/** @type {HTMLHeadingElement | null} */ (null));
  const requestRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [releaseVersion, setReleaseVersion] = useState('');
  const [user, setUser] = useState(/** @type {AppUser | null} */ (null));
  const [topbar, setTopbar] = useState(/** @type {AppTopbarStatus | null} */ (null));
  const [homeFeed, setHomeFeed] = useState(/** @type {AppNotificationFeed | null} */ (null));
  const [messageFeed, setMessageFeed] = useState(/** @type {AppNotificationFeed | null} */ (null));
  const [error, setError] = useState(/** @type {ApiError | Error | null} */ (null));
  const [statusMessage, setStatusMessage] = useState('');

  const currentProject = topbar?.current_project || null;
  const homePath = buildHomePath(route.owner);
  const messagesPath = buildMessagesPath({ owner: route.owner });
  const messageRoute = route.id === 'messages' ? route : null;
  const messageFilter = /** @type {'all' | 'unread' | 'pending' | 'read'} */ (messageRoute ? messageRoute.filter : 'all');
  const previewItems = useMemo(() => (homeFeed?.items || []).slice(0, 8), [homeFeed]);
  const activeFeed = route.id === 'messages' ? messageFeed : homeFeed;
  const unreadCount = activeFeed?.unread_count ?? topbar?.notifications_count ?? 0;
  const pendingCount = messageFeed?.pending_count ?? 0;
  const pageRangeStart = activeFeed && activeFeed.total_items > 0
    ? (activeFeed.page - 1) * activeFeed.per_page + 1
    : 0;
  const pageRangeEnd = activeFeed && activeFeed.total_items > 0
    ? Math.min(activeFeed.page * activeFeed.per_page, activeFeed.total_items)
    : 0;

  routeRef.current = route;

  /**
   * @param {ReturnType<typeof parseAppRoute>} targetRoute
   * @param {'load' | 'refresh'} mode
   */
  async function loadRouteState(targetRoute, mode) {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    if (mode === 'load') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const [nextUser, nextTopbar, nextFeed] = await Promise.all([
        getCurrentUser(),
        getTopbarStatus(),
        targetRoute.id === 'messages'
          ? getNotifications({
            filter: targetRoute.filter,
            page: targetRoute.page,
            perPage: targetRoute.perPage,
          })
          : getNotifications({ limit: 8 }),
      ]);
      if (requestRef.current !== requestId) {
        return;
      }
      setUser(nextUser);
      setTopbar(nextTopbar);
      if (targetRoute.id === 'messages') {
        setMessageFeed(nextFeed);
      } else {
        setHomeFeed(nextFeed);
      }
      restorePendingReturnToHash();
      setError(null);
    } catch (caught) {
      if (requestRef.current !== requestId) {
        return;
      }
      setError(caught instanceof Error ? caught : new Error('加载失败。'));
    } finally {
      if (requestRef.current === requestId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  function syncRouteFromLocation() {
    setRoute(parseAppRoute(window.location.pathname, window.location.search));
  }

  /**
   * @param {string} path
   * @param {string} [nextStatusMessage]
   * @param {boolean} [replace]
   */
  function navigate(path, nextStatusMessage = '', replace = false) {
    if (replace) {
      window.history.replaceState(null, '', path);
    } else {
      window.history.pushState(null, '', path);
    }
    setStatusMessage(nextStatusMessage);
    syncRouteFromLocation();
  }

  useEffect(() => {
    const title = route.id === 'messages'
      ? '消息中心 - 元策'
      : route.id === 'unsupported'
        ? '未迁移路由 - 元策'
        : '元策浏览器工作台 - 元策';
    document.title = title;
  }, [route]);

  useEffect(() => {
    void loadRouteState(route, 'load');
  }, [route]);

  useEffect(() => {
    const handlePopState = () => {
      setStatusMessage('已根据浏览器历史恢复页面。');
      syncRouteFromLocation();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const close = openTopbarEvents({
      onRefresh: () => {
        void loadRouteState(routeRef.current, 'refresh');
      },
      onReleaseVersion: (value) => {
        setReleaseVersion(value);
      },
    });
    return close;
  }, []);

  useEffect(() => {
    if (!loading) {
      window.requestAnimationFrame(() => {
        headingRef.current?.focus();
      });
    }
  }, [loading, route]);

  async function handleLogout() {
    try {
      await logout();
    } catch (_error) {
      // Even if logout fails after the session is gone, returning to the login page is the safest path.
    }
    window.location.assign('/web/login');
  }

  /** @param {AppNotification} item */
  async function handleOpenNotification(item) {
    try {
      const result = item.target ? await markNotificationRead(item.id) : await getNotificationTarget(item.id);
      setStatusMessage('正在打开消息目标。');
      window.location.assign(notificationTargetPath(result.target || item.target));
    } catch (_error) {
      window.location.assign(messagesPath);
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead();
      setStatusMessage('消息已全部标为已读。');
      await loadRouteState(routeRef.current, 'refresh');
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error('标记消息失败。'));
    }
  }

  /** @param {React.MouseEvent<HTMLAnchorElement>} event @param {string} path @param {string} message */
  function handleNavigate(event, path, message) {
    event.preventDefault();
    if (`${window.location.pathname}${window.location.search}` === path) {
      return;
    }
    navigate(path, message);
  }

  /** @param {'all' | 'unread' | 'pending' | 'read'} filter */
  function changeMessageFilter(filter) {
    navigate(
      buildMessagesPath({
        owner: route.owner,
        filter,
        page: 1,
        perPage: route.id === 'messages' ? route.perPage : 10,
      }),
      `已切换到${filterLabel(filter)}。`,
    );
  }

  /** @param {number} nextPage */
  function changeMessagePage(nextPage) {
    if (route.id !== 'messages') {
      return;
    }
    navigate(
      buildMessagesPath({
        owner: route.owner,
        filter: route.filter,
        page: nextPage,
        perPage: route.perPage,
      }),
      `已切换到第 ${nextPage} 页。`,
    );
  }

  /** @param {React.ChangeEvent<HTMLSelectElement>} event */
  function changeMessagePageSize(event) {
    if (route.id !== 'messages') {
      return;
    }
    const nextPerPage = Number.parseInt(event.target.value, 10);
    navigate(
      buildMessagesPath({
        owner: route.owner,
        filter: route.filter,
        page: 1,
        perPage: nextPerPage,
      }),
      `每页切换为 ${nextPerPage} 条。`,
    );
  }

  if (loading) {
    return (
      <main className="app-shell" aria-busy="true">
        <p className="shell-live-region" role="status" aria-live="polite">正在加载元策浏览器工作台。</p>
        <section className="shell-loading">
          <p className="shell-eyebrow">Web App</p>
          <h1>正在恢复当前会话</h1>
          <p>正在通过 REST / SSE 恢复用户、项目上下文和消息状态。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <p className="shell-live-region" role="status" aria-live="polite">
        {statusMessage || (refreshing ? '正在刷新页面数据。' : '')}
      </p>

      <nav className="app-topbar" aria-label="应用导航">
        <div className="app-topbar-group">
          <a
            className={`app-nav-link ${route.id === 'home' ? 'active' : ''}`}
            href={homePath}
            aria-current={route.id === 'home' ? 'page' : undefined}
            onClick={(event) => handleNavigate(event, homePath, '已切换到浏览器工作台。')}
          >
            工作台
          </a>
          <a
            className={`app-nav-link ${route.id === 'messages' ? 'active' : ''}`}
            href={messagesPath}
            aria-current={route.id === 'messages' ? 'page' : undefined}
            onClick={(event) => handleNavigate(event, messagesPath, '已切换到消息中心。')}
          >
            消息中心
            {unreadCount > 0 ? <span className="app-nav-badge">{unreadCount}</span> : null}
          </a>
          <a className="app-nav-link" href={currentProject ? `/web/projects/${currentProject.key}` : '/web/projects'}>
            项目页
          </a>
          <a className="app-nav-link" href="/web/me">我的账号</a>
        </div>
        <div className="app-topbar-group app-topbar-meta">
          <span>{user?.display_name || user?.username || '未知用户'}</span>
          <span>{releaseVersion ? `release ${releaseVersion}` : 'release unknown'}</span>
        </div>
      </nav>

      {error ? (
        <section className="shell-banner" role="alert">
          <strong>加载失败</strong>
          <span>{errorMessage(error)}</span>
        </section>
      ) : null}

      <section className="shell-header">
        <div>
          <p className="shell-eyebrow">{routeEyebrow(route)}</p>
          <h1 ref={headingRef} tabIndex={-1}>{route.title}</h1>
          <p className="shell-subtitle">{routeDescription(route)}</p>
        </div>
        <div className="shell-actions">
          {route.id === 'messages' ? (
            <a className="shell-link" href={homePath} onClick={(event) => handleNavigate(event, homePath, '已返回浏览器工作台。')}>
              返回工作台
            </a>
          ) : (
            <a className="shell-link" href={messagesPath} onClick={(event) => handleNavigate(event, messagesPath, '已打开消息中心。')}>
              打开消息中心
            </a>
          )}
          <button className="shell-button shell-button-secondary" type="button" onClick={() => void loadRouteState(routeRef.current, 'refresh')}>
            {refreshing ? '刷新中…' : '刷新'}
          </button>
          <button className="shell-button" type="button" onClick={handleLogout}>退出登录</button>
        </div>
      </section>

      {route.id === 'unsupported' ? (
        <section className="shell-card shell-panel-wide" aria-labelledby="unsupported-title">
          <h2 id="unsupported-title">当前路由尚未迁移</h2>
          <p className="shell-muted">{route.pathname}{route.search}</p>
          <p className="shell-copy">这个入口仍由旧版 SSR 页面负责。为了避免错误解析 HTML，这里只提供明确的退回动作。</p>
          <div className="shell-actions-inline">
            <a className="shell-link" href={route.legacyPath}>打开旧版页面</a>
            <a className="shell-link" href={homePath} onClick={(event) => handleNavigate(event, homePath, '已返回浏览器工作台。')}>
              返回工作台
            </a>
          </div>
        </section>
      ) : (
        <>
          <section className="shell-grid" aria-label="顶部状态摘要">
            <article className="shell-card">
              <h2>当前用户</h2>
              <p className="shell-primary">{user?.display_name || user?.username || '未知用户'}</p>
              <p className="shell-muted">{user?.is_super_admin ? '超级管理员' : '普通成员'}</p>
            </article>
            <article className="shell-card">
              <h2>当前项目</h2>
              <p className="shell-primary">{currentProject ? `${currentProject.key} · ${currentProject.name}` : '未选择项目'}</p>
              <p className="shell-muted">待处理 {currentProject?.pending_count || 0}</p>
            </article>
            <article className="shell-card shell-stats">
              <h2>我的待处理</h2>
              <dl>
                <div><dt>需求</dt><dd>{topbar?.requirements_count || 0}</dd></div>
                <div><dt>任务</dt><dd>{topbar?.tasks_count || 0}</dd></div>
                <div><dt>缺陷</dt><dd>{topbar?.bugs_count || 0}</dd></div>
                <div><dt>消息</dt><dd>{topbar?.notifications_count || 0}</dd></div>
              </dl>
            </article>
          </section>

          {route.id === 'messages' ? (
            <section className="shell-card shell-panel-wide message-center" aria-labelledby="message-center-title">
              <div className="shell-panel-header message-center-header">
                <div>
                  <h2 id="message-center-title">消息中心</h2>
                  <p className="shell-muted">未读 {messageFeed?.unread_count || 0} 条，待处理讨论 {pendingCount} 条。</p>
                </div>
                <div className="shell-actions-inline">
                  <button className="shell-button shell-button-secondary" type="button" onClick={handleMarkAllRead}>
                    全部已读
                  </button>
                </div>
              </div>

              <nav className="message-tabs" aria-label="消息筛选">
                {[
                  { value: 'all', label: '全部消息', count: messageFeed?.total_items || 0 },
                  { value: 'unread', label: '未读消息', count: messageFeed?.unread_count || 0 },
                  { value: 'pending', label: '待处理讨论', count: pendingCount },
                  {
                    value: 'read',
                    label: '已读消息',
                    count: messageRoute ? Math.max((messageFeed?.total_items || 0) - (messageFeed?.unread_count || 0), 0) : 0,
                  },
                ].map((tab) => (
                  <button
                    key={tab.value}
                    className={`message-tab ${messageFilter === tab.value ? 'active' : ''}`}
                    type="button"
                    aria-pressed={messageFilter === tab.value}
                    onClick={() => changeMessageFilter(/** @type {'all' | 'unread' | 'pending' | 'read'} */ (tab.value))}
                  >
                    <span>{tab.label}</span>
                    {tab.count > 0 ? <strong>{tab.count}</strong> : null}
                  </button>
                ))}
              </nav>

              {messageFeed?.items?.length ? (
                <>
                  <ul className="message-list" aria-label={`${filterLabel(messageFilter)}列表`}>
                    {messageFeed.items.map((item) => (
                      <li key={item.id} className={`message-row ${item.read ? '' : 'unread'}`}>
                        <div className="message-body">
                          <div className="message-heading">
                            <span className="message-kind">{notificationKindLabel(item.kind)}</span>
                            {!item.read ? <span className="notification-pill">未读</span> : null}
                          </div>
                          <strong>{item.title}</strong>
                          <p>{item.body}</p>
                          <p className="shell-muted">{item.actor} · {formatTimestamp(item.created_at)}</p>
                        </div>
                        <button className="shell-button shell-button-secondary" type="button" onClick={() => void handleOpenNotification(item)}>
                          打开
                        </button>
                      </li>
                    ))}
                  </ul>

                  <div className="message-pagination" aria-label="消息分页">
                    <div className="message-pagination-meta">
                      <strong>共 {messageFeed.total_items} 条</strong>
                      <span>当前显示 {pageRangeStart}-{pageRangeEnd}</span>
                    </div>
                    <div className="message-pagination-controls">
                      <button
                        className="shell-button shell-button-secondary"
                        type="button"
                        disabled={messageFeed.page <= 1}
                        onClick={() => changeMessagePage(messageFeed.page - 1)}
                      >
                        上一页
                      </button>
                      <span className="shell-meta">第 {messageFeed.page} / {messageFeed.total_pages} 页</span>
                      <button
                        className="shell-button shell-button-secondary"
                        type="button"
                        disabled={messageFeed.page >= messageFeed.total_pages}
                        onClick={() => changeMessagePage(messageFeed.page + 1)}
                      >
                        下一页
                      </button>
                      <label className="page-size-control">
                        <span>每页</span>
                        <select value={String(messageFeed.per_page)} onChange={changeMessagePageSize}>
                          {[10, 20, 50].map((value) => (
                            <option key={value} value={String(value)}>{value}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                </>
              ) : (
                <p className="shell-empty">{emptyMessageTitle(route)}</p>
              )}
            </section>
          ) : (
            <section className="shell-columns">
              <article className="shell-card shell-panel-wide" aria-labelledby="project-badges-title">
                <div className="shell-panel-header">
                  <h2 id="project-badges-title">项目角标</h2>
                  <span className="shell-meta">release {releaseVersion || 'unknown'}</span>
                </div>
                {topbar?.project_badges?.length ? (
                  <ul className="badge-list">
                    {topbar.project_badges.map((badge) => (
                      <li key={badge.project_key} className="badge-row">
                        <span>{badge.project_key}</span>
                        <strong>{badge.pending_count}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="shell-empty">当前没有项目级待处理角标。</p>
                )}
              </article>

              <article className="shell-card shell-panel-wide" aria-labelledby="notification-title">
                <div className="shell-panel-header">
                  <h2 id="notification-title">最近消息</h2>
                  <div className="shell-actions-inline">
                    <span className="shell-meta">未读 {unreadCount}</span>
                    <button className="shell-button shell-button-secondary" type="button" onClick={handleMarkAllRead}>
                      全部已读
                    </button>
                  </div>
                </div>
                {previewItems.length ? (
                  <ul className="notification-list">
                    {previewItems.map((item) => (
                      <li key={item.id} className="notification-row">
                        <div>
                          <div className="notification-heading">
                            <strong>{item.title}</strong>
                            {!item.read ? <span className="notification-pill">未读</span> : null}
                          </div>
                          <p>{item.body}</p>
                          <p className="shell-muted">{item.actor} · {formatTimestamp(item.created_at)}</p>
                        </div>
                        <button className="shell-button shell-button-secondary" type="button" onClick={() => void handleOpenNotification(item)}>
                          打开
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="shell-empty">暂无最近消息。</p>
                )}
              </article>
            </section>
          )}
        </>
      )}
    </main>
  );
}
