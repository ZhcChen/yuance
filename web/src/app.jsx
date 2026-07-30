// @ts-check

import { useEffect, useMemo, useState } from 'react';
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

/** @returns {React.ReactElement} */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [releaseVersion, setReleaseVersion] = useState('');
  const [user, setUser] = useState(/** @type {AppUser | null} */ (null));
  const [topbar, setTopbar] = useState(/** @type {AppTopbarStatus | null} */ (null));
  const [notifications, setNotifications] = useState(/** @type {AppNotification[]} */ ([]));
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState(/** @type {ApiError | Error | null} */ (null));
  const currentProject = topbar?.current_project || null;

  const sortedNotifications = useMemo(() => notifications.slice(0, 8), [notifications]);

  async function loadShellState(mode = 'load') {
    if (mode === 'load') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const [nextUser, nextTopbar, nextFeed] = await Promise.all([
        getCurrentUser(),
        getTopbarStatus(),
        getNotifications(),
      ]);
      setUser(nextUser);
      setTopbar(nextTopbar);
      setNotifications(nextFeed.items);
      setUnreadCount(nextFeed.unread_count);
      restorePendingReturnToHash();
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error('加载失败。'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadShellState('load');
    const close = openTopbarEvents({
      onRefresh: () => {
        void loadShellState('refresh');
      },
      onReleaseVersion: (value) => {
        setReleaseVersion(value);
      },
    });
    return close;
  }, []);

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
      const targetPath = notificationTargetPath(result.target || item.target);
      window.location.assign(targetPath);
    } catch (_error) {
      window.location.assign('/web/messages');
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead();
      await loadShellState('refresh');
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error('标记消息失败。'));
    }
  }

  if (loading) {
    return (
      <main className="app-shell" aria-busy="true">
        <section className="shell-panel shell-loading">
          <p className="shell-eyebrow">Web App</p>
          <h1>正在加载元策工作台</h1>
          <p>正在通过 REST / SSE 恢复当前会话与顶部状态。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="shell-header">
        <div>
          <p className="shell-eyebrow">Web App</p>
          <h1>元策浏览器工作台</h1>
          <p className="shell-subtitle">
            当前入口只依赖 REST / SSE 契约，不再读取 Askama HTML 或消息跳转页面作为业务协议。
          </p>
        </div>
        <div className="shell-actions">
          <a className="shell-link" href="/web">返回现有工作台</a>
          <button className="shell-button shell-button-secondary" type="button" onClick={() => void loadShellState('refresh')}>
            {refreshing ? '刷新中…' : '刷新'}
          </button>
          <button className="shell-button" type="button" onClick={handleLogout}>退出登录</button>
        </div>
      </section>

      {error ? (
        <section className="shell-banner" role="alert">
          <strong>加载失败</strong>
          <span>{errorMessage(error)}</span>
        </section>
      ) : null}

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
          {sortedNotifications.length ? (
            <ul className="notification-list">
              {sortedNotifications.map((item) => (
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
    </main>
  );
}
