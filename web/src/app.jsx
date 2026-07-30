// @ts-check

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  getCurrentUser,
  getNotificationTarget,
  getNotifications,
  getProjects,
  getTopbarStatus,
  getWorkItem,
  getWorkItemComments,
  getWorkItems,
  handoffWorkItem,
  logout,
  markAllNotificationsRead,
  markNotificationRead,
  openTopbarEvents,
  restorePendingReturnToHash,
  updateCurrentProject,
  updateWorkItem,
} from './lib/api.js';
import { notificationTargetPath } from './lib/notification-target.js';
import {
  buildHomePath,
  buildMessagesPath,
  buildProjectsPath,
  buildWorkItemDetailPath,
  buildWorkItemListPath,
  parseAppRoute,
} from './lib/routes.js';

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

/**
 * @typedef AppProject
 * @property {string} key
 * @property {string} name
 * @property {string} status
 * @property {string} owner
 * @property {number} work_item_count
 * @property {number} active_work_item_count
 * @property {string} updated_at
 */

/**
 * @typedef AppProjectPage
 * @property {AppProject[]} items
 * @property {{ page: number, per_page: number, total_items: number, total_pages: number }} pagination
 */

/**
 * @typedef AppWorkItem
 * @property {string} key
 * @property {string} item_type
 * @property {string} title
 * @property {string} status
 * @property {string} priority
 * @property {string} project_key
 * @property {string} project_name
 * @property {string} assignee
 * @property {string} updated_at
 */

/**
 * @typedef AppWorkItemPage
 * @property {AppWorkItem[]} items
 * @property {{ page: number, per_page: number, total_items: number, total_pages: number }} pagination
 */

/**
 * @typedef AppWorkItemDetail
 * @property {string} key
 * @property {string} item_type
 * @property {string} title
 * @property {string} description
 * @property {string} status
 * @property {string} priority
 * @property {string} project_key
 * @property {string} project_name
 * @property {string} parent_item_key
 * @property {string} parent_title
 * @property {string} assignee_username
 * @property {string} assignee
 * @property {string} reporter
 * @property {string} due_date
 * @property {string} created_at
 * @property {string} updated_at
 * @property {string} deleted_at
 */

/**
 * @typedef AppWorkItemComment
 * @property {number} id
 * @property {number | null} parent_comment_id
 * @property {string} parent_author
 * @property {string} body
 * @property {string} body_format
 * @property {string} author
 * @property {string} created_at
 * @property {string} updated_at
 * @property {boolean} is_flow
 * @property {boolean} is_draft
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

function projectStatusLabel(status) {
  switch (status) {
    case 'not_started':
      return '未开始';
    case 'in_progress':
      return '进行中';
    case 'acceptance':
      return '验收中';
    case 'completed':
      return '已完成';
    case 'on_hold':
      return '已搁置';
    case 'cancelled':
      return '已取消';
    case 'archived':
      return '已归档';
    default:
      return '全部状态';
  }
}

function workItemTypeLabel(itemType) {
  switch (itemType) {
    case 'requirement':
      return '需求';
    case 'bug':
      return '缺陷';
    default:
      return '任务';
  }
}

function workItemStatusLabel(status) {
  switch (status) {
    case 'open':
      return '待处理';
    case 'in_progress':
      return '进行中';
    case 'pending_confirmation':
      return '待确认';
    case 'done':
      return '已完成';
    case 'resolved':
      return '已解决';
    case 'verified':
      return '已验证';
    case 'closed':
      return '已关闭';
    case 'cancelled':
      return '已取消';
    default:
      return status || '未知状态';
  }
}

const WORK_ITEM_STATUS_OPTIONS = [
  'open',
  'in_progress',
  'pending_confirmation',
  'done',
  'resolved',
  'verified',
  'closed',
  'cancelled',
];

const WORK_ITEM_PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3'];

/** @param {AppWorkItemDetail} item */
function workItemEditFormFromDetail(item) {
  return {
    title: item.title || '',
    description: item.description || '',
    status: item.status || 'open',
    priority: item.priority || 'P2',
    assigneeUsername: item.assignee_username || '',
    dueDate: item.due_date || '',
    parentItemKey: item.parent_item_key || '',
  };
}

/** @param {AppWorkItemDetail} item */
function workItemHandoffFormFromDetail(item) {
  return {
    status: item.status || 'open',
    assigneeUsername: item.assignee_username || '',
    body: '',
  };
}

function isWorkItemListRouteId(routeId) {
  return routeId === 'requirements' || routeId === 'tasks' || routeId === 'bugs';
}

/** @param {ReturnType<typeof parseAppRoute>} route */
function workItemOwnerForRoute(route) {
  return /** @type {'app' | 'web'} */ (
    isWorkItemListRouteId(route.id) || route.id === 'work-item-detail'
      ? route.owner
      : 'app'
  );
}

/** @param {ReturnType<typeof parseAppRoute>} route */
function routeDescription(route) {
  switch (route.id) {
    case 'messages':
      return '通过 JSON 契约加载、筛选和处理通知，兼容旧 URL 与前进后退。';
    case 'projects':
      return '项目列表已切到浏览器应用壳，当前项目切换仍复用既有服务端权限与偏好存储。';
    case 'requirements':
    case 'tasks':
    case 'bugs':
      return '工作项列表已在浏览器壳中验证筛选、分页和详情跳转，旧版 SSR 页面仍可作为兼容回退。';
    case 'work-item-detail':
      return '工作项详情已在浏览器壳中接入只读信息、评论浏览、核心字段编辑和推进并指派。';
    case 'unsupported':
      return '这个 URL 还没有迁移到新应用壳，当前保留回旧版 SSR 页面的安全退路。';
    default:
      return '当前入口只依赖 REST / SSE 契约，不再读取 Askama HTML 或消息跳转页面作为业务协议。';
  }
}

/** @param {ReturnType<typeof parseAppRoute>} route */
function routeEyebrow(route) {
  switch (route.id) {
    case 'messages':
      return 'Message Center';
    case 'projects':
      return 'Projects';
    case 'requirements':
    case 'tasks':
    case 'bugs':
    case 'work-item-detail':
      return 'Work Items';
    default:
      return 'Web App';
  }
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
  const workItemActionRef = useRef(0);
  const workItemMutationRef = useRef(false);
  const workItemMutationActionRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [releaseVersion, setReleaseVersion] = useState('');
  const [user, setUser] = useState(/** @type {AppUser | null} */ (null));
  const [topbar, setTopbar] = useState(/** @type {AppTopbarStatus | null} */ (null));
  const [homeFeed, setHomeFeed] = useState(/** @type {AppNotificationFeed | null} */ (null));
  const [messageFeed, setMessageFeed] = useState(/** @type {AppNotificationFeed | null} */ (null));
  const [projectPage, setProjectPage] = useState(/** @type {AppProjectPage | null} */ (null));
  const [workItemPage, setWorkItemPage] = useState(/** @type {AppWorkItemPage | null} */ (null));
  const [workItemDetail, setWorkItemDetail] = useState(/** @type {AppWorkItemDetail | null} */ (null));
  const [workItemComments, setWorkItemComments] = useState(/** @type {AppWorkItemComment[]} */ ([]));
  const [workItemFormKey, setWorkItemFormKey] = useState('');
  const [workItemEditForm, setWorkItemEditForm] = useState({
    title: '',
    description: '',
    status: 'open',
    priority: 'P2',
    assigneeUsername: '',
    dueDate: '',
    parentItemKey: '',
  });
  const [workItemHandoffForm, setWorkItemHandoffForm] = useState({
    status: 'open',
    assigneeUsername: '',
    body: '',
  });
  const [workItemEditSubmitting, setWorkItemEditSubmitting] = useState(false);
  const [workItemHandoffSubmitting, setWorkItemHandoffSubmitting] = useState(false);
  const [workItemActionError, setWorkItemActionError] = useState('');
  const [error, setError] = useState(/** @type {ApiError | Error | null} */ (null));
  const [statusMessage, setStatusMessage] = useState('');

  const currentProject = topbar?.current_project || null;
  const homePath = buildHomePath(route.owner);
  const messagesPath = buildMessagesPath({ owner: route.owner });
  const projectsPath = route.id === 'projects'
    ? buildProjectsPath({ owner: route.owner, status: route.status, page: route.page, perPage: route.perPage })
    : buildProjectsPath({ owner: 'app' });
  const messageRoute = route.id === 'messages' ? route : null;
  const projectRoute = route.id === 'projects' ? route : null;
  const workItemListRoute = isWorkItemListRouteId(route.id) ? route : null;
  const workItemDetailRoute = route.id === 'work-item-detail' ? route : null;
  const workItemOwner = workItemOwnerForRoute(route);
  const workItemNavQuery = workItemListRoute
    ? {
      q: workItemListRoute.q,
      status: workItemListRoute.status,
      priority: workItemListRoute.priority,
      assigneeUsername: workItemListRoute.assigneeUsername,
      perPage: workItemListRoute.perPage,
    }
    : {};
  const requirementsPath = buildWorkItemListPath({ owner: workItemOwner, itemType: 'requirement', ...workItemNavQuery });
  const tasksPath = buildWorkItemListPath({ owner: workItemOwner, itemType: 'task', ...workItemNavQuery });
  const bugsPath = buildWorkItemListPath({ owner: workItemOwner, itemType: 'bug', ...workItemNavQuery });
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
  const projectRangeStart = projectPage && projectPage.pagination.total_items > 0
    ? (projectPage.pagination.page - 1) * projectPage.pagination.per_page + 1
    : 0;
  const projectRangeEnd = projectPage && projectPage.pagination.total_items > 0
    ? Math.min(projectPage.pagination.page * projectPage.pagination.per_page, projectPage.pagination.total_items)
    : 0;
  const workItemRangeStart = workItemPage && workItemPage.pagination.total_items > 0
    ? (workItemPage.pagination.page - 1) * workItemPage.pagination.per_page + 1
    : 0;
  const workItemRangeEnd = workItemPage && workItemPage.pagination.total_items > 0
    ? Math.min(workItemPage.pagination.page * workItemPage.pagination.per_page, workItemPage.pagination.total_items)
    : 0;
  const legacyWorkItemListPath = workItemListRoute
    ? buildWorkItemListPath({
      owner: 'web',
      itemType: workItemListRoute.itemType,
      q: workItemListRoute.q,
      status: workItemListRoute.status,
      priority: workItemListRoute.priority,
      assigneeUsername: workItemListRoute.assigneeUsername,
      page: workItemListRoute.page,
      perPage: workItemListRoute.perPage,
    })
    : '';
  const legacyWorkItemDetailPath = workItemDetailRoute
    ? buildWorkItemDetailPath({ owner: 'web', itemKey: workItemDetailRoute.itemKey })
    : '';
  const activeWorkItemDetail = workItemDetailRoute && workItemDetail?.key === workItemDetailRoute.itemKey
    ? workItemDetail
    : null;
  const detailBackPath = buildWorkItemListPath({
    owner: workItemOwner,
    itemType: activeWorkItemDetail?.item_type || 'task',
  });
  const workItemMutationSubmitting = workItemEditSubmitting || workItemHandoffSubmitting;

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
      if (targetRoute.id === 'work-item-detail') {
        workItemActionRef.current += 1;
        workItemMutationActionRef.current = 0;
        workItemMutationRef.current = false;
        setWorkItemEditSubmitting(false);
        setWorkItemHandoffSubmitting(false);
        setWorkItemDetail(null);
        setWorkItemComments([]);
        setWorkItemActionError('');
        setWorkItemFormKey('');
      }
    } else {
      setRefreshing(true);
    }

    try {
      const [nextUser, nextTopbar, nextFeed, nextProjects, nextWorkItems, nextWorkItemBundle] = await Promise.all([
        getCurrentUser(),
        getTopbarStatus(),
        targetRoute.id === 'projects' || isWorkItemListRouteId(targetRoute.id) || targetRoute.id === 'work-item-detail'
          ? Promise.resolve(null)
          : targetRoute.id === 'messages'
            ? getNotifications({
              filter: targetRoute.filter,
              page: targetRoute.page,
              perPage: targetRoute.perPage,
            })
            : getNotifications({ limit: 8 }),
        targetRoute.id === 'projects'
          ? getProjects({
            status: targetRoute.status,
            page: targetRoute.page,
            perPage: targetRoute.perPage,
          })
          : Promise.resolve(null),
        isWorkItemListRouteId(targetRoute.id)
          ? getWorkItems({
            itemType: targetRoute.itemType,
            q: targetRoute.q,
            status: targetRoute.status,
            priority: targetRoute.priority,
            assigneeUsername: targetRoute.assigneeUsername,
            page: targetRoute.page,
            perPage: targetRoute.perPage,
          })
          : Promise.resolve(null),
        targetRoute.id === 'work-item-detail'
          ? Promise.all([
            getWorkItem(String(targetRoute.itemKey || '')),
            getWorkItemComments(String(targetRoute.itemKey || '')),
          ]).then(([item, comments]) => ({ item, comments }))
          : Promise.resolve(null),
      ]);
      if (requestRef.current !== requestId) {
        return;
      }
      setUser(nextUser);
      setTopbar(nextTopbar);
      if (targetRoute.id === 'messages') {
        setMessageFeed(nextFeed);
      } else if (targetRoute.id === 'home') {
        setHomeFeed(nextFeed);
      }
      if (targetRoute.id === 'projects') {
        setProjectPage(nextProjects);
      }
      if (isWorkItemListRouteId(targetRoute.id)) {
        setWorkItemPage(nextWorkItems);
      }
      if (targetRoute.id === 'work-item-detail') {
        setWorkItemDetail(nextWorkItemBundle?.item || null);
        setWorkItemComments(nextWorkItemBundle?.comments || []);
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
      : route.id === 'projects'
        ? '项目列表 - 元策'
        : route.id === 'requirements'
          ? '需求列表 - 元策'
          : route.id === 'tasks'
            ? '任务列表 - 元策'
            : route.id === 'bugs'
              ? '缺陷列表 - 元策'
              : route.id === 'work-item-detail' && activeWorkItemDetail
                ? `${activeWorkItemDetail.key} · ${activeWorkItemDetail.title} - 元策`
                : route.id === 'work-item-detail'
                  ? '工作项详情 - 元策'
                  : route.id === 'unsupported'
                    ? '未迁移路由 - 元策'
                    : '元策浏览器工作台 - 元策';
    document.title = title;
  }, [route, activeWorkItemDetail]);

  useEffect(() => {
    void loadRouteState(route, 'load');
  }, [route]);

  useEffect(() => {
    if (!activeWorkItemDetail || workItemFormKey === activeWorkItemDetail.key) {
      return;
    }
    setWorkItemEditForm(workItemEditFormFromDetail(activeWorkItemDetail));
    setWorkItemHandoffForm(workItemHandoffFormFromDetail(activeWorkItemDetail));
    setWorkItemActionError('');
    setWorkItemFormKey(activeWorkItemDetail.key);
  }, [activeWorkItemDetail, workItemFormKey]);

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
      const target = result.target || item.target;
      const owner = /** @type {'app' | 'web'} */ (
        target ? workItemOwnerForRoute(routeRef.current) : routeRef.current.owner === 'app' ? 'app' : 'web'
      );
      setStatusMessage('正在打开消息目标。');
      window.location.assign(notificationTargetPath(target, owner));
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

  /** @param {AppProject} project */
  async function handleSetCurrentProject(project) {
    try {
      await updateCurrentProject(project.key);
      setStatusMessage(`已切换当前项目到 ${project.key}。`);
      await loadRouteState(routeRef.current, 'refresh');
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error('切换当前项目失败。'));
    }
  }

  /**
   * @param {React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>} event
   */
  function changeWorkItemEditField(event) {
    const { name, value } = event.currentTarget;
    setWorkItemEditForm((current) => ({ ...current, [name]: value }));
  }

  /**
   * @param {React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>} event
   */
  function changeWorkItemHandoffField(event) {
    const { name, value } = event.currentTarget;
    setWorkItemHandoffForm((current) => ({ ...current, [name]: value }));
  }

  /**
   * @param {string} itemKey
   * @param {number} [actionId]
   */
  function isCurrentWorkItemDetailRoute(itemKey, actionId) {
    const currentRoute = routeRef.current;
    return currentRoute.id === 'work-item-detail'
      && currentRoute.itemKey === itemKey
      && (actionId === undefined || workItemActionRef.current === actionId);
  }

  /**
   * @param {AppWorkItemDetail} updated
   * @param {string} successMessage
   * @param {number} actionId
   */
  function applyWorkItemMutationResult(updated, successMessage, actionId) {
    if (!isCurrentWorkItemDetailRoute(updated.key, actionId)) {
      return false;
    }
    requestRef.current += 1;
    setWorkItemDetail(updated);
    setWorkItemEditForm(workItemEditFormFromDetail(updated));
    setWorkItemHandoffForm(workItemHandoffFormFromDetail(updated));
    setWorkItemFormKey(updated.key);
    setStatusMessage(successMessage);
    setRefreshing(false);
    return true;
  }

  /**
   * @param {number} actionId
   * @param {(value: boolean) => void} setSubmitting
   */
  function clearWorkItemMutation(actionId, setSubmitting) {
    if (workItemMutationActionRef.current !== actionId) {
      return;
    }
    workItemMutationActionRef.current = 0;
    workItemMutationRef.current = false;
    setSubmitting(false);
  }

  /**
   * @param {string} itemKey
   * @param {string} actionLabel
   * @param {number} actionId
   */
  async function refreshWorkItemCompanionState(itemKey, actionLabel, actionId) {
    const [commentsResult, topbarResult] = await Promise.allSettled([
      getWorkItemComments(itemKey),
      getTopbarStatus(),
    ]);
    if (!isCurrentWorkItemDetailRoute(itemKey, actionId)) {
      return;
    }
    let failed = false;
    if (commentsResult.status === 'fulfilled') {
      setWorkItemComments(commentsResult.value);
    } else {
      failed = true;
    }
    if (topbarResult.status === 'fulfilled') {
      setTopbar(topbarResult.value);
    } else {
      failed = true;
    }
    if (failed) {
      setWorkItemActionError(`${actionLabel}，但评论或顶部状态刷新失败，请手动刷新。`);
    }
  }

  /** @param {React.FormEvent<HTMLFormElement>} event */
  async function submitWorkItemEdit(event) {
    event.preventDefault();
    if (!activeWorkItemDetail) {
      return;
    }
    if (workItemMutationRef.current) {
      return;
    }

    const title = workItemEditForm.title.trim();
    if (!title) {
      setWorkItemActionError('标题不能为空。');
      return;
    }

    const itemKey = activeWorkItemDetail.key;
    const actionId = workItemActionRef.current + 1;
    workItemActionRef.current = actionId;
    workItemMutationRef.current = true;
    workItemMutationActionRef.current = actionId;
    setWorkItemEditSubmitting(true);
    setWorkItemActionError('');
    try {
      const updated = await updateWorkItem(itemKey, {
        title,
        description: workItemEditForm.description,
        status: workItemEditForm.status,
        priority: workItemEditForm.priority,
        assigneeUsername: workItemEditForm.assigneeUsername.trim(),
        dueDate: workItemEditForm.dueDate,
        parentItemKey: workItemEditForm.parentItemKey.trim(),
      });
      if (applyWorkItemMutationResult(updated, `${updated.key} 已保存。`, actionId)) {
        await refreshWorkItemCompanionState(updated.key, '工作项已保存', actionId);
      }
    } catch (caught) {
      if (isCurrentWorkItemDetailRoute(itemKey, actionId)) {
        setWorkItemActionError(errorMessage(caught instanceof Error ? caught : new Error('保存工作项失败。')));
      }
    } finally {
      clearWorkItemMutation(actionId, setWorkItemEditSubmitting);
    }
  }

  /** @param {React.FormEvent<HTMLFormElement>} event */
  async function submitWorkItemHandoff(event) {
    event.preventDefault();
    if (!activeWorkItemDetail) {
      return;
    }
    if (workItemMutationRef.current) {
      return;
    }

    const itemKey = activeWorkItemDetail.key;
    const actionId = workItemActionRef.current + 1;
    workItemActionRef.current = actionId;
    workItemMutationRef.current = true;
    workItemMutationActionRef.current = actionId;
    setWorkItemHandoffSubmitting(true);
    setWorkItemActionError('');
    try {
      const updated = await handoffWorkItem(itemKey, {
        status: workItemHandoffForm.status,
        assigneeUsername: workItemHandoffForm.assigneeUsername.trim(),
        body: workItemHandoffForm.body,
      });
      if (applyWorkItemMutationResult(updated, `${updated.key} 已推进并指派。`, actionId)) {
        await refreshWorkItemCompanionState(updated.key, '工作项已推进并指派', actionId);
      }
    } catch (caught) {
      if (isCurrentWorkItemDetailRoute(itemKey, actionId)) {
        setWorkItemActionError(errorMessage(caught instanceof Error ? caught : new Error('推进并指派失败。')));
      }
    } finally {
      clearWorkItemMutation(actionId, setWorkItemHandoffSubmitting);
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

  /** @param {React.ChangeEvent<HTMLSelectElement>} event */
  function changeProjectStatus(event) {
    navigate(
      buildProjectsPath({
        owner: route.id === 'projects' ? route.owner : 'app',
        status: event.target.value,
        page: 1,
        perPage: route.id === 'projects' ? route.perPage : 10,
      }),
      '已更新项目状态筛选。',
    );
  }

  /** @param {number} nextPage */
  function changeProjectPage(nextPage) {
    if (route.id !== 'projects') {
      return;
    }
    navigate(
      buildProjectsPath({
        owner: route.owner,
        status: route.status,
        page: nextPage,
        perPage: route.perPage,
      }),
      `已切换到第 ${nextPage} 页。`,
    );
  }

  /** @param {React.ChangeEvent<HTMLSelectElement>} event */
  function changeProjectPageSize(event) {
    if (route.id !== 'projects') {
      return;
    }
    const nextPerPage = Number.parseInt(event.target.value, 10);
    navigate(
      buildProjectsPath({
        owner: route.owner,
        status: route.status,
        page: 1,
        perPage: nextPerPage,
      }),
      `项目列表每页切换为 ${nextPerPage} 条。`,
    );
  }

  /** @param {React.FormEvent<HTMLFormElement>} event */
  function submitWorkItemFilters(event) {
    event.preventDefault();
    if (!workItemListRoute) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    navigate(
      buildWorkItemListPath({
        owner: workItemOwner,
        itemType: workItemListRoute.itemType,
        q: String(formData.get('q') || ''),
        status: String(formData.get('status') || ''),
        priority: String(formData.get('priority') || ''),
        assigneeUsername: String(formData.get('assignee_username') || ''),
        page: 1,
        perPage: workItemListRoute.perPage,
      }),
      '已更新工作项筛选。',
    );
  }

  function resetWorkItemFilters() {
    if (!workItemListRoute) {
      return;
    }
    navigate(
      buildWorkItemListPath({ owner: workItemOwner, itemType: workItemListRoute.itemType }),
      '已重置工作项筛选。',
    );
  }

  /** @param {number} nextPage */
  function changeWorkItemPage(nextPage) {
    if (!workItemListRoute) {
      return;
    }
    navigate(
      buildWorkItemListPath({
        owner: workItemOwner,
        itemType: workItemListRoute.itemType,
        q: workItemListRoute.q,
        status: workItemListRoute.status,
        priority: workItemListRoute.priority,
        assigneeUsername: workItemListRoute.assigneeUsername,
        page: nextPage,
        perPage: workItemListRoute.perPage,
      }),
      `已切换到第 ${nextPage} 页。`,
    );
  }

  /** @param {React.ChangeEvent<HTMLSelectElement>} event */
  function changeWorkItemPageSize(event) {
    if (!workItemListRoute) {
      return;
    }
    const nextPerPage = Number.parseInt(event.target.value, 10);
    navigate(
      buildWorkItemListPath({
        owner: workItemOwner,
        itemType: workItemListRoute.itemType,
        q: workItemListRoute.q,
        status: workItemListRoute.status,
        priority: workItemListRoute.priority,
        assigneeUsername: workItemListRoute.assigneeUsername,
        page: 1,
        perPage: nextPerPage,
      }),
      `工作项列表每页切换为 ${nextPerPage} 条。`,
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
          <a
            className={`app-nav-link ${route.id === 'projects' ? 'active' : ''}`}
            href={projectsPath}
            aria-current={route.id === 'projects' ? 'page' : undefined}
            onClick={(event) => handleNavigate(event, projectsPath, '已切换到项目列表。')}
          >
            项目列表
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
          ) : route.id === 'projects' ? (
            <a className="shell-link" href={homePath} onClick={(event) => handleNavigate(event, homePath, '已返回浏览器工作台。')}>
              返回工作台
            </a>
          ) : isWorkItemListRouteId(route.id) || route.id === 'work-item-detail' ? (
            <a className="shell-link" href={homePath} onClick={(event) => handleNavigate(event, homePath, '已返回浏览器工作台。')}>
              返回工作台
            </a>
          ) : (
            <a className="shell-link" href={messagesPath} onClick={(event) => handleNavigate(event, messagesPath, '已打开消息中心。')}>
              打开消息中心
            </a>
          )}
          <a className="shell-link" href={currentProject ? `/web/projects/${currentProject.key}` : '/web/projects'}>
            当前项目页
          </a>
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
              <div className="shell-actions-inline shell-compact-links">
                <a className="shell-link" href={requirementsPath} onClick={(event) => handleNavigate(event, requirementsPath, '已打开需求列表。')}>需求</a>
                <a className="shell-link" href={tasksPath} onClick={(event) => handleNavigate(event, tasksPath, '已打开任务列表。')}>任务</a>
                <a className="shell-link" href={bugsPath} onClick={(event) => handleNavigate(event, bugsPath, '已打开缺陷列表。')}>缺陷</a>
              </div>
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
          ) : route.id === 'projects' ? (
            <section className="shell-card shell-panel-wide project-center" aria-labelledby="project-center-title">
              <div className="shell-panel-header project-center-header">
                <div>
                  <h2 id="project-center-title">项目列表</h2>
                  <p className="shell-muted">当前项目：{currentProject ? `${currentProject.key} · ${currentProject.name}` : '未选择项目'}</p>
                </div>
                <div className="shell-actions-inline">
                  <label className="page-size-control">
                    <span>状态</span>
                    <select value={projectRoute?.status || ''} onChange={changeProjectStatus}>
                      <option value="">全部</option>
                      <option value="not_started">未开始</option>
                      <option value="in_progress">进行中</option>
                      <option value="acceptance">验收中</option>
                      <option value="completed">已完成</option>
                      <option value="on_hold">已搁置</option>
                      <option value="cancelled">已取消</option>
                      <option value="archived">已归档</option>
                    </select>
                  </label>
                </div>
              </div>

              {projectPage?.items?.length ? (
                <>
                  <ul className="project-list" aria-label="项目列表">
                    {projectPage.items.map((project) => {
                      const isCurrentProject = currentProject?.key === project.key;
                      return (
                        <li key={project.key} className={`project-row ${isCurrentProject ? 'current' : ''}`}>
                          <div className="project-main">
                            <div className="project-heading">
                              <strong>{project.key} · {project.name}</strong>
                              <span className="project-status-pill">{projectStatusLabel(project.status)}</span>
                              {isCurrentProject ? <span className="notification-pill">当前项目</span> : null}
                            </div>
                            <p className="shell-muted">负责人 {project.owner || '未分配'} · 最近更新 {formatTimestamp(project.updated_at)}</p>
                            <dl className="project-stats">
                              <div><dt>总工作项</dt><dd>{project.work_item_count}</dd></div>
                              <div><dt>进行中</dt><dd>{project.active_work_item_count}</dd></div>
                            </dl>
                          </div>
                          <div className="project-actions">
                            <a className="shell-link" href={`/web/projects/${project.key}`}>打开详情</a>
                            <button
                              className="shell-button shell-button-secondary"
                              type="button"
                              disabled={isCurrentProject}
                              onClick={() => void handleSetCurrentProject(project)}
                            >
                              {isCurrentProject ? '当前项目' : '设为当前项目'}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="message-pagination" aria-label="项目分页">
                    <div className="message-pagination-meta">
                      <strong>共 {projectPage.pagination.total_items} 个项目</strong>
                      <span>当前显示 {projectRangeStart}-{projectRangeEnd}</span>
                    </div>
                    <div className="message-pagination-controls">
                      <button
                        className="shell-button shell-button-secondary"
                        type="button"
                        disabled={projectPage.pagination.page <= 1}
                        onClick={() => changeProjectPage(projectPage.pagination.page - 1)}
                      >
                        上一页
                      </button>
                      <span className="shell-meta">第 {projectPage.pagination.page} / {projectPage.pagination.total_pages} 页</span>
                      <button
                        className="shell-button shell-button-secondary"
                        type="button"
                        disabled={projectPage.pagination.page >= projectPage.pagination.total_pages}
                        onClick={() => changeProjectPage(projectPage.pagination.page + 1)}
                      >
                        下一页
                      </button>
                      <label className="page-size-control">
                        <span>每页</span>
                        <select value={String(projectPage.pagination.per_page)} onChange={changeProjectPageSize}>
                          {[10, 20, 50].map((value) => (
                            <option key={value} value={String(value)}>{value}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                </>
              ) : (
                <p className="shell-empty">当前筛选下没有项目。</p>
              )}
            </section>
          ) : isWorkItemListRouteId(route.id) ? (
            <section className="shell-card shell-panel-wide work-item-center" aria-labelledby="work-item-center-title">
              <div className="shell-panel-header work-item-center-header">
                <div>
                  <h2 id="work-item-center-title">{route.title}</h2>
                  <p className="shell-muted">当前项目：{currentProject ? `${currentProject.key} · ${currentProject.name}` : '未选择项目'}</p>
                </div>
                <div className="shell-actions-inline">
                  {route.owner === 'app' ? <a className="shell-link" href={legacyWorkItemListPath}>打开旧版列表</a> : null}
                </div>
              </div>

              <nav className="message-tabs" aria-label="工作项类型导航">
                {[
                  { id: 'requirements', label: '需求', path: requirementsPath },
                  { id: 'tasks', label: '任务', path: tasksPath },
                  { id: 'bugs', label: '缺陷', path: bugsPath },
                ].map((tab) => (
                  <a
                    key={tab.id}
                    className={`message-tab ${route.id === tab.id ? 'active' : ''}`}
                    href={tab.path}
                    aria-current={route.id === tab.id ? 'page' : undefined}
                    onClick={(event) => handleNavigate(event, tab.path, `已切换到${tab.label}列表。`)}
                  >
                    <span>{tab.label}</span>
                  </a>
                ))}
              </nav>

              <form className="work-item-filter-bar" onSubmit={submitWorkItemFilters}>
                <label className="work-item-filter-field work-item-filter-keyword">
                  <span>关键词</span>
                  <input name="q" defaultValue={route.q} placeholder="标题或编号" />
                </label>
                <label className="work-item-filter-field">
                  <span>状态</span>
                  <select name="status" defaultValue={route.status}>
                    <option value="">全部状态</option>
                    <option value="open">待处理</option>
                    <option value="in_progress">进行中</option>
                    <option value="pending_confirmation">待确认</option>
                    <option value="done">已完成</option>
                    <option value="resolved">已解决</option>
                    <option value="verified">已验证</option>
                    <option value="closed">已关闭</option>
                    <option value="cancelled">已取消</option>
                  </select>
                </label>
                <label className="work-item-filter-field">
                  <span>优先级</span>
                  <select name="priority" defaultValue={route.priority}>
                    <option value="">全部优先级</option>
                    <option value="P0">P0</option>
                    <option value="P1">P1</option>
                    <option value="P2">P2</option>
                    <option value="P3">P3</option>
                  </select>
                </label>
                <label className="work-item-filter-field">
                  <span>处理人</span>
                  <input name="assignee_username" defaultValue={route.assigneeUsername} placeholder="用户名" />
                </label>
                <div className="work-item-filter-actions">
                  <button className="shell-button" type="submit">筛选</button>
                  <button className="shell-button shell-button-secondary" type="button" onClick={resetWorkItemFilters}>重置</button>
                </div>
              </form>

              {workItemPage?.items?.length ? (
                <>
                  <ul className="work-item-list" aria-label={route.title}>
                    {workItemPage.items.map((item) => {
                      const detailPath = buildWorkItemDetailPath({ owner: workItemOwner, itemKey: item.key });
                      return (
                        <li key={item.key} className="work-item-row">
                          <div className="work-item-main">
                            <div className="work-item-heading">
                              <span className="message-kind">{workItemTypeLabel(item.item_type)}</span>
                              <strong>{item.key} · {item.title}</strong>
                              <span className="project-status-pill">{workItemStatusLabel(item.status)}</span>
                              <span className="priority-pill">{item.priority || '未设置优先级'}</span>
                            </div>
                            <p className="shell-muted">{item.project_key} · {item.project_name} · 处理人 {item.assignee || '未分配'} · 最近更新 {formatTimestamp(item.updated_at)}</p>
                          </div>
                          <div className="project-actions">
                            <a className="shell-link" href={detailPath} onClick={(event) => handleNavigate(event, detailPath, `已打开 ${item.key}。`)}>
                              打开详情
                            </a>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="message-pagination" aria-label="工作项分页">
                    <div className="message-pagination-meta">
                      <strong>共 {workItemPage.pagination.total_items} 条</strong>
                      <span>当前显示 {workItemRangeStart}-{workItemRangeEnd}</span>
                    </div>
                    <div className="message-pagination-controls">
                      <button
                        className="shell-button shell-button-secondary"
                        type="button"
                        disabled={workItemPage.pagination.page <= 1}
                        onClick={() => changeWorkItemPage(workItemPage.pagination.page - 1)}
                      >
                        上一页
                      </button>
                      <span className="shell-meta">第 {workItemPage.pagination.page} / {workItemPage.pagination.total_pages} 页</span>
                      <button
                        className="shell-button shell-button-secondary"
                        type="button"
                        disabled={workItemPage.pagination.page >= workItemPage.pagination.total_pages}
                        onClick={() => changeWorkItemPage(workItemPage.pagination.page + 1)}
                      >
                        下一页
                      </button>
                      <label className="page-size-control">
                        <span>每页</span>
                        <select value={String(workItemPage.pagination.per_page)} onChange={changeWorkItemPageSize}>
                          {[10, 20, 50].map((value) => (
                            <option key={value} value={String(value)}>{value}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                </>
              ) : (
                <p className="shell-empty">当前筛选下没有{workItemTypeLabel(route.itemType)}。</p>
              )}
            </section>
          ) : route.id === 'work-item-detail' ? (
            <section className="shell-card shell-panel-wide work-item-detail-center" aria-labelledby="work-item-detail-title">
              <div className="shell-panel-header work-item-center-header">
                <div>
                  <h2 id="work-item-detail-title">{activeWorkItemDetail ? `${activeWorkItemDetail.key} · ${activeWorkItemDetail.title}` : route.itemKey}</h2>
                  <p className="shell-muted">{activeWorkItemDetail ? `${workItemTypeLabel(activeWorkItemDetail.item_type)} · ${activeWorkItemDetail.project_key} · ${activeWorkItemDetail.project_name}` : '正在加载工作项详情。'}</p>
                </div>
                <div className="shell-actions-inline">
                  <a className="shell-link" href={detailBackPath} onClick={(event) => handleNavigate(event, detailBackPath, '已返回工作项列表。')}>
                    返回列表
                  </a>
                  {route.owner === 'app' ? <a className="shell-link" href={legacyWorkItemDetailPath}>打开旧版详情</a> : null}
                </div>
              </div>

              <nav className="message-tabs" aria-label="工作项类型导航">
                {[
                  { id: 'requirements', label: '需求', path: requirementsPath },
                  { id: 'tasks', label: '任务', path: tasksPath },
                  { id: 'bugs', label: '缺陷', path: bugsPath },
                ].map((tab) => (
                  <a
                    key={tab.id}
                    className={`message-tab ${activeWorkItemDetail?.item_type === (tab.id === 'requirements' ? 'requirement' : tab.id === 'bugs' ? 'bug' : 'task') ? 'active' : ''}`}
                    href={tab.path}
                    onClick={(event) => handleNavigate(event, tab.path, `已切换到${tab.label}列表。`)}
                  >
                    <span>{tab.label}</span>
                  </a>
                ))}
              </nav>

              {activeWorkItemDetail ? (
                <>
                  <section className="work-item-detail-grid">
                    <article className="work-item-detail-panel">
                      <h3>描述</h3>
                      <p className="work-item-detail-description">{activeWorkItemDetail.description || '暂无描述。'}</p>
                    </article>
                    <article className="work-item-detail-panel">
                      <h3>关键信息</h3>
                      <dl className="work-item-detail-meta">
                        <div><dt>状态</dt><dd>{workItemStatusLabel(activeWorkItemDetail.status)}</dd></div>
                        <div><dt>优先级</dt><dd>{activeWorkItemDetail.priority || '未设置'}</dd></div>
                        <div><dt>处理人</dt><dd>{activeWorkItemDetail.assignee || '未分配'}</dd></div>
                        <div><dt>报告人</dt><dd>{activeWorkItemDetail.reporter || '未知'}</dd></div>
                        <div><dt>截止日期</dt><dd>{activeWorkItemDetail.due_date || '未设置'}</dd></div>
                        <div><dt>创建时间</dt><dd>{activeWorkItemDetail.created_at || '未知'}</dd></div>
                        <div><dt>更新时间</dt><dd>{activeWorkItemDetail.updated_at || '未知'}</dd></div>
                        <div><dt>所属项目</dt><dd>{activeWorkItemDetail.project_key} · {activeWorkItemDetail.project_name}</dd></div>
                        {activeWorkItemDetail.parent_item_key ? (
                          <div>
                            <dt>父级工作项</dt>
                            <dd>
                              <a
                                className="shell-link"
                                href={buildWorkItemDetailPath({ owner: workItemOwner, itemKey: activeWorkItemDetail.parent_item_key })}
                                onClick={(event) => handleNavigate(event, buildWorkItemDetailPath({ owner: workItemOwner, itemKey: activeWorkItemDetail.parent_item_key }), `已打开 ${activeWorkItemDetail.parent_item_key}。`)}
                              >
                                {activeWorkItemDetail.parent_item_key} · {activeWorkItemDetail.parent_title}
                              </a>
                            </dd>
                          </div>
                        ) : null}
                        {activeWorkItemDetail.deleted_at ? <div><dt>删除时间</dt><dd>{activeWorkItemDetail.deleted_at}</dd></div> : null}
                      </dl>
                    </article>
                  </section>

                  <section className="work-item-action-grid" aria-label="工作项写入操作">
                    <article className="work-item-detail-panel">
                      <h3>编辑工作项</h3>
                      <form className="work-item-action-form" onSubmit={submitWorkItemEdit}>
                        <label className="work-item-form-field work-item-form-field-wide">
                          <span>标题</span>
                          <input
                            name="title"
                            value={workItemEditForm.title}
                            onChange={changeWorkItemEditField}
                            required
                          />
                        </label>
                        <label className="work-item-form-field work-item-form-field-wide">
                          <span>描述</span>
                          <textarea
                            name="description"
                            rows={4}
                            value={workItemEditForm.description}
                            onChange={changeWorkItemEditField}
                          />
                        </label>
                        <label className="work-item-form-field">
                          <span>状态</span>
                          <select name="status" value={workItemEditForm.status} onChange={changeWorkItemEditField}>
                            {WORK_ITEM_STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>{workItemStatusLabel(status)}</option>
                            ))}
                          </select>
                        </label>
                        <label className="work-item-form-field">
                          <span>优先级</span>
                          <select name="priority" value={workItemEditForm.priority} onChange={changeWorkItemEditField}>
                            {WORK_ITEM_PRIORITY_OPTIONS.map((priority) => (
                              <option key={priority} value={priority}>{priority}</option>
                            ))}
                          </select>
                        </label>
                        <label className="work-item-form-field">
                          <span>处理人用户名</span>
                          <input
                            name="assigneeUsername"
                            value={workItemEditForm.assigneeUsername}
                            onChange={changeWorkItemEditField}
                            placeholder="例如 yuance_admin"
                          />
                        </label>
                        <label className="work-item-form-field">
                          <span>截止日期</span>
                          <input
                            name="dueDate"
                            type="date"
                            value={workItemEditForm.dueDate}
                            onChange={changeWorkItemEditField}
                          />
                        </label>
                        {activeWorkItemDetail.item_type === 'task' ? (
                          <label className="work-item-form-field work-item-form-field-wide">
                            <span>父级工作项 Key</span>
                            <input
                              name="parentItemKey"
                              value={workItemEditForm.parentItemKey}
                              onChange={changeWorkItemEditField}
                              placeholder="不关联可留空"
                            />
                          </label>
                        ) : null}
                        <div className="work-item-form-actions">
                          <button className="shell-button" type="submit" disabled={workItemMutationSubmitting}>
                            {workItemEditSubmitting ? '保存中…' : '保存修改'}
                          </button>
                        </div>
                      </form>
                    </article>

                    <article className="work-item-detail-panel">
                      <h3>推进并指派</h3>
                      <form className="work-item-action-form" onSubmit={submitWorkItemHandoff}>
                        <label className="work-item-form-field">
                          <span>目标状态</span>
                          <select name="status" value={workItemHandoffForm.status} onChange={changeWorkItemHandoffField}>
                            {WORK_ITEM_STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>{workItemStatusLabel(status)}</option>
                            ))}
                          </select>
                        </label>
                        <label className="work-item-form-field">
                          <span>指派给用户名</span>
                          <input
                            name="assigneeUsername"
                            value={workItemHandoffForm.assigneeUsername}
                            onChange={changeWorkItemHandoffField}
                            placeholder="例如 yuance_admin"
                          />
                        </label>
                        <label className="work-item-form-field work-item-form-field-wide">
                          <span>处理说明</span>
                          <textarea
                            name="body"
                            rows={5}
                            value={workItemHandoffForm.body}
                            onChange={changeWorkItemHandoffField}
                            placeholder="说明本次指派、处理进展或下一步"
                          />
                        </label>
                        <div className="work-item-form-actions">
                          <button className="shell-button" type="submit" disabled={workItemMutationSubmitting}>
                            {workItemHandoffSubmitting ? '提交中…' : '确认推进'}
                          </button>
                        </div>
                      </form>
                    </article>
                  </section>

                  {workItemActionError ? (
                    <p className="work-item-action-error" role="alert">{workItemActionError}</p>
                  ) : null}

                  <section className="work-item-comments-panel" aria-labelledby="work-item-comments-title">
                    <div className="shell-panel-header">
                      <h3 id="work-item-comments-title">评论与流转</h3>
                      <span className="shell-meta">共 {workItemComments.length} 条</span>
                    </div>
                    {workItemComments.length ? (
                      <ul className="work-item-comment-list">
                        {workItemComments.map((comment) => (
                          <li key={comment.id} id={`comment-${comment.id}`} className={`work-item-comment-row ${comment.is_flow ? 'is-flow' : ''}`}>
                            <div className="work-item-comment-heading">
                              <strong>{comment.author}</strong>
                              {comment.parent_comment_id ? <span className="shell-meta">回复 {comment.parent_author}</span> : null}
                              {comment.is_flow ? <span className="project-status-pill">流转记录</span> : null}
                              {comment.is_draft ? <span className="notification-pill">草稿</span> : null}
                            </div>
                            <p className="work-item-comment-body">{comment.body || '暂无内容。'}</p>
                            <p className="shell-muted">创建于 {comment.created_at || '未知'}，更新于 {comment.updated_at || '未知'}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="shell-empty">当前没有评论或流转记录。</p>
                    )}
                  </section>
                </>
              ) : (
                <p className="shell-empty">工作项详情暂不可用。</p>
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
