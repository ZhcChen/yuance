// @ts-check

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildHomePath,
  buildMessagesPath,
  buildProfilePath,
  buildProjectsPath,
  buildSearchPath,
  buildWorkItemDetailPath,
  buildWorkItemListPath,
  createWorkItemComment as createWorkItemCommentUseCase,
  downloadWorkItemAttachment as downloadWorkItemAttachmentUseCase,
  downloadWorkItemCommentAttachment as downloadWorkItemCommentAttachmentUseCase,
  handoffWorkItem as handoffWorkItemUseCase,
  notificationTargetPath,
  routePathForOwner,
  saveWorkItem,
  updateWorkItemComment as updateWorkItemCommentUseCase,
  uploadWorkItemAttachment,
  uploadWorkItemCommentAttachment,
} from '@yuance/frontend-app-core';
import {
  Button,
  Feedback,
  Field,
  GlobalNavigation,
  Modal,
  WorkItemAttachments,
  WorkItemComments,
  WorkItemDetail,
  attachmentIsUploaded,
} from '@yuance/frontend-ui';
import { errorMessage } from './errors.js';

/** @typedef {import('@yuance/frontend-api-client').ApiError} ApiError */

/** @typedef {Omit<ReturnType<typeof import('@yuance/frontend-api-client').createApiClient>, 'createWorkItemCommentDraft' | 'publishWorkItemCommentDraft'> & { restorePendingReturnToHash(): void }} AppApiService */
/** @typedef {Pick<import('@yuance/frontend-platform-contract').PlatformCapabilities, 'files' | 'downloads' | 'transfers'> & { attachments?: import('@yuance/frontend-platform-contract').HostDelegatedAttachmentCapabilities }} AppFileService */
/** @typedef {import('@yuance/frontend-platform-contract').RouterCapabilities & { assign(path: string): void, currentRoute(): ReturnType<typeof import('@yuance/frontend-app-core').parseAppRoute>, setTitle(title: string): void, subscribe(callback: () => void): () => void }} AppRouterService */

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

/**
 * @typedef AppAttachment
 * @property {number} id
 * @property {string} filename
 * @property {string} content_type
 * @property {number} byte_size
 * @property {string} status
 * @property {string} created_by
 * @property {string} created_at
 */

/**
 * @typedef WorkItemAttachmentBundle
 * @property {AppAttachment[]} attachments
 * @property {Record<string, AppAttachment[]>} commentAttachments
 * @property {boolean} loadFailed
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

/**
 * @param {AppAttachment[]} attachments
 * @param {AppAttachment} attachment
 */
function upsertAttachment(attachments, attachment) {
  const nextAttachments = [...attachments];
  const index = nextAttachments.findIndex((item) => item.id === attachment.id);
  if (index >= 0) {
    nextAttachments[index] = attachment;
  } else {
    nextAttachments.push(attachment);
  }
  return nextAttachments;
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

/**
 * @param {AppApiService} api
 * @param {string} itemKey
 * @param {AppWorkItemComment[]} comments
 * @param {Promise<AppAttachment[]>} [attachmentsPromise]
 * @returns {Promise<WorkItemAttachmentBundle>}
 */
async function loadWorkItemAttachmentBundle(api, itemKey, comments, attachmentsPromise = api.getWorkItemAttachments(itemKey)) {
  const [attachmentsResult, commentAttachmentsResult] = await Promise.allSettled([
    attachmentsPromise,
    Promise.allSettled(
      comments
        .filter((comment) => !comment.is_draft)
        .map(async (comment) => {
          const nextAttachments = await api.getWorkItemCommentAttachments(itemKey, comment.id);
          return /** @type {[string, AppAttachment[]]} */ ([String(comment.id), nextAttachments]);
        }),
    ),
  ]);
  let loadFailed = false;
  const attachments = attachmentsResult.status === 'fulfilled' ? attachmentsResult.value : [];
  if (attachmentsResult.status === 'rejected') {
    loadFailed = true;
  }
  /** @type {Record<string, AppAttachment[]>} */
  const commentAttachments = {};
  if (commentAttachmentsResult.status === 'fulfilled') {
    for (const result of commentAttachmentsResult.value) {
      if (result.status === 'fulfilled') {
        const [commentId, nextAttachments] = result.value;
        commentAttachments[commentId] = nextAttachments;
      } else {
        loadFailed = true;
      }
    }
  } else {
    loadFailed = true;
  }
  return { attachments, commentAttachments, loadFailed };
}

function isWorkItemListRouteId(routeId) {
  return routeId === 'requirements' || routeId === 'tasks' || routeId === 'bugs';
}

/** @param {ReturnType<typeof import('@yuance/frontend-app-core').parseAppRoute>} route */
function workItemOwnerForRoute(route) {
  return /** @type {'app' | 'web'} */ (
    isWorkItemListRouteId(route.id) || route.id === 'work-item-detail'
      ? route.owner
      : 'app'
  );
}

/** @param {ReturnType<typeof import('@yuance/frontend-app-core').parseAppRoute>} route */
function routeDescription(route) {
  switch (route.id) {
    case 'messages':
      return '通过 JSON 契约加载、筛选和处理通知，兼容旧 URL 与前进后退。';
    case 'search':
      return '按当前权限搜索项目、工作项和资料，并在两个宿主中使用同一分页与目标解析。';
    case 'profile':
      return '查看并维护当前账户资料，保存结果会同步刷新全局账户信息。';
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

/** @param {ReturnType<typeof import('@yuance/frontend-app-core').parseAppRoute>} route */
function routeEyebrow(route) {
  switch (route.id) {
    case 'messages':
      return 'Message Center';
    case 'search':
      return 'Global Search';
    case 'profile':
      return 'Personal Workspace';
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

/** @param {ReturnType<typeof import('@yuance/frontend-app-core').parseAppRoute>} route */
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

/**
 * @param {{ services: {
 *   api: AppApiService,
 *   events: { openTopbarEvents(callbacks: { onRefresh: () => void, onReleaseVersion?: (version: string) => void }): () => void },
 *   files: AppFileService,
 *   router: AppRouterService,
 *   runtime: {
 *     scheduleFrame(callback: () => void): void,
 *     getElementById(id: string): HTMLElement | null,
 *     readFormValue(form: HTMLFormElement, name: string): string,
 *     readTheme?(): 'light' | 'dark',
 *     writeTheme?(theme: 'light' | 'dark'): void,
 *   },
 * } }} props
 * @returns {React.ReactElement}
 */
export function SharedApp({ services }) {
  const { api, events, files, router, runtime } = services;
  const [route, setRoute] = useState(() => router.currentRoute());
  const routeRef = useRef(route);
  const headingRef = useRef(/** @type {HTMLHeadingElement | null} */ (null));
  const newCommentTextareaRef = useRef(/** @type {HTMLTextAreaElement | null} */ (null));
  const editCommentTextareaRef = useRef(/** @type {HTMLTextAreaElement | null} */ (null));
  const requestRef = useRef(0);
  const profileActionRef = useRef(0);
  const projectSwitchRef = useRef(false);
  const workItemActionRef = useRef(0);
  const workItemMutationRef = useRef(false);
  const workItemMutationActionRef = useRef(0);
  const workItemAttachmentActionRef = useRef(0);
  const workItemAttachmentMutationRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [releaseVersion, setReleaseVersion] = useState('');
  const [user, setUser] = useState(/** @type {AppUser | null} */ (null));
  const [topbar, setTopbar] = useState(/** @type {AppTopbarStatus | null} */ (null));
  const [homeFeed, setHomeFeed] = useState(/** @type {AppNotificationFeed | null} */ (null));
  const [messageFeed, setMessageFeed] = useState(/** @type {AppNotificationFeed | null} */ (null));
  const [projectPage, setProjectPage] = useState(/** @type {AppProjectPage | null} */ (null));
  const [projectSwitchingKey, setProjectSwitchingKey] = useState('');
  const [profile, setProfile] = useState(/** @type {Awaited<ReturnType<AppApiService['getOwnProfile']>> | null} */ (null));
  const [profileForm, setProfileForm] = useState({ displayName: '', email: '', mobile: '' });
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [searchPage, setSearchPage] = useState(/** @type {Awaited<ReturnType<AppApiService['search']>> | null} */ (null));
  const [workItemPage, setWorkItemPage] = useState(/** @type {AppWorkItemPage | null} */ (null));
  const [workItemDetail, setWorkItemDetail] = useState(/** @type {AppWorkItemDetail | null} */ (null));
  const [workItemComments, setWorkItemComments] = useState(/** @type {AppWorkItemComment[]} */ ([]));
  const [workItemAttachments, setWorkItemAttachments] = useState(/** @type {AppAttachment[]} */ ([]));
  const [workItemCommentAttachments, setWorkItemCommentAttachments] = useState(/** @type {Record<string, AppAttachment[]>} */ ({}));
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
  const [workItemNewCommentBody, setWorkItemNewCommentBody] = useState('');
  const [workItemCommentSubmitting, setWorkItemCommentSubmitting] = useState(false);
  const [workItemEditingCommentId, setWorkItemEditingCommentId] = useState(/** @type {number | null} */ (null));
  const [workItemEditCommentBody, setWorkItemEditCommentBody] = useState('');
  const [workItemEditCommentSubmitting, setWorkItemEditCommentSubmitting] = useState(false);
  const [workItemCommentActionError, setWorkItemCommentActionError] = useState('');
  const [workItemAttachmentActionError, setWorkItemAttachmentActionError] = useState('');
  const [workItemAttachmentLoadWarning, setWorkItemAttachmentLoadWarning] = useState('');
  const [workItemAttachmentStatus, setWorkItemAttachmentStatus] = useState('');
  const [workItemAttachmentUploading, setWorkItemAttachmentUploading] = useState(false);
  const [workItemAttachmentDownloadingId, setWorkItemAttachmentDownloadingId] = useState(/** @type {number | null} */ (null));
  const [workItemAttachmentReveal, setWorkItemAttachmentReveal] = useState(/** @type {{ attachmentId: number, capability: import('@yuance/frontend-platform-contract').RevealDownloadCapability } | null} */ (null));
  const [workItemCommentAttachmentUploadingId, setWorkItemCommentAttachmentUploadingId] = useState(/** @type {number | null} */ (null));
  const [workItemCommentAttachmentDownloadingKey, setWorkItemCommentAttachmentDownloadingKey] = useState('');
  const [workItemCommentAttachmentReveal, setWorkItemCommentAttachmentReveal] = useState(/** @type {{ key: string, capability: import('@yuance/frontend-platform-contract').RevealDownloadCapability } | null} */ (null));
  const [workItemCommentAttachmentStatus, setWorkItemCommentAttachmentStatus] = useState(/** @type {Record<string, string>} */ ({}));
  const [error, setError] = useState(/** @type {ApiError | Error | null} */ (null));
  const [statusMessage, setStatusMessage] = useState('');
  const [theme, setTheme] = useState(() => runtime.readTheme?.() || 'light');

  const currentProject = topbar?.current_project || null;
  const homePath = buildHomePath(route.owner);
  const messagesPath = buildMessagesPath({ owner: route.owner });
  const profilePath = buildProfilePath(route.owner);
  const projectsPath = route.id === 'projects'
    ? buildProjectsPath({ owner: route.owner, status: route.status, page: route.page, perPage: route.perPage })
    : buildProjectsPath({ owner: 'app' });
  const messageRoute = route.id === 'messages' ? route : null;
  const searchRoute = route.id === 'search' ? route : null;
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
  const workItemAttachmentSubmitting = workItemAttachmentUploading || workItemCommentAttachmentUploadingId !== null;
  const workItemMutationSubmitting = workItemEditSubmitting
    || workItemHandoffSubmitting
    || workItemCommentSubmitting
    || workItemEditCommentSubmitting
    || workItemAttachmentSubmitting;

  routeRef.current = route;

  /**
   * @param {ReturnType<typeof import('@yuance/frontend-app-core').parseAppRoute>} targetRoute
   * @param {'load' | 'refresh'} mode
   */
  async function loadRouteState(targetRoute, mode) {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    if (mode === 'load') {
      setLoading(true);
      if (targetRoute.id === 'search') {
        setSearchPage(null);
      }
      if (targetRoute.id === 'work-item-detail') {
        workItemActionRef.current += 1;
        workItemAttachmentActionRef.current += 1;
        workItemMutationActionRef.current = 0;
        workItemMutationRef.current = false;
        workItemAttachmentMutationRef.current = false;
        setWorkItemEditSubmitting(false);
        setWorkItemHandoffSubmitting(false);
        setWorkItemDetail(null);
        setWorkItemComments([]);
        setWorkItemActionError('');
        setWorkItemNewCommentBody('');
        setWorkItemEditingCommentId(null);
        setWorkItemEditCommentBody('');
        setWorkItemCommentActionError('');
        setWorkItemCommentSubmitting(false);
        setWorkItemEditCommentSubmitting(false);
        setWorkItemAttachments([]);
        setWorkItemCommentAttachments({});
        setWorkItemAttachmentActionError('');
        setWorkItemAttachmentLoadWarning('');
        setWorkItemAttachmentStatus('');
        setWorkItemAttachmentUploading(false);
        setWorkItemAttachmentDownloadingId(null);
        setWorkItemAttachmentReveal(null);
        setWorkItemCommentAttachmentUploadingId(null);
        setWorkItemCommentAttachmentDownloadingKey('');
        setWorkItemCommentAttachmentReveal(null);
        setWorkItemCommentAttachmentStatus({});
        setWorkItemFormKey('');
      }
    } else {
      setRefreshing(true);
    }

    try {
      const [nextUser, nextTopbar, nextProfile, nextFeed, nextProjects, nextSearch, nextWorkItems, nextWorkItemBundle] = await Promise.all([
        api.getCurrentUser(),
        api.getTopbarStatus(),
        targetRoute.id === 'profile' ? api.getOwnProfile() : Promise.resolve(null),
        targetRoute.id === 'projects' || targetRoute.id === 'search' || targetRoute.id === 'profile' || isWorkItemListRouteId(targetRoute.id) || targetRoute.id === 'work-item-detail'
          ? Promise.resolve(null)
          : targetRoute.id === 'messages'
            ? api.getNotifications({
              filter: targetRoute.filter,
              page: targetRoute.page,
              perPage: targetRoute.perPage,
            })
            : api.getNotifications({ limit: 8 }),
        targetRoute.id === 'projects'
          ? api.getProjects({
            status: targetRoute.status,
            page: targetRoute.page,
            perPage: targetRoute.perPage,
          })
          : Promise.resolve(null),
        targetRoute.id === 'search'
          ? api.search({ q: targetRoute.q, page: targetRoute.page, perPage: targetRoute.perPage })
          : Promise.resolve(null),
        isWorkItemListRouteId(targetRoute.id)
          ? api.getWorkItems({
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
          ? (async () => {
            const itemKey = String(targetRoute.itemKey || '');
            const commentsPromise = api.getWorkItemComments(itemKey);
            const attachmentsPromise = api.getWorkItemAttachments(itemKey);
            void attachmentsPromise.catch(() => {});
            const [item, comments, attachmentBundle] = await Promise.all([
              api.getWorkItem(itemKey),
              commentsPromise,
              commentsPromise.then((comments) => loadWorkItemAttachmentBundle(api, itemKey, comments, attachmentsPromise)),
            ]);
            return { item, comments, attachmentBundle };
          })()
          : Promise.resolve(null),
      ]);
      if (requestRef.current !== requestId) {
        return;
      }
      setUser(nextUser);
      setTopbar(nextTopbar);
      if (targetRoute.id === 'profile' && nextProfile) {
        setProfile(nextProfile);
        setProfileForm({ displayName: nextProfile.display_name, email: nextProfile.email, mobile: nextProfile.mobile });
      }
      if (targetRoute.id === 'messages') {
        setMessageFeed(nextFeed);
      } else if (targetRoute.id === 'home') {
        setHomeFeed(nextFeed);
      }
      if (targetRoute.id === 'projects') {
        setProjectPage(nextProjects);
      }
      if (targetRoute.id === 'search') {
        setSearchPage(nextSearch);
      }
      if (isWorkItemListRouteId(targetRoute.id)) {
        setWorkItemPage(nextWorkItems);
      }
      if (targetRoute.id === 'work-item-detail') {
        setWorkItemDetail(nextWorkItemBundle?.item || null);
        setWorkItemComments(nextWorkItemBundle?.comments || []);
        setWorkItemAttachments(nextWorkItemBundle?.attachmentBundle?.attachments || []);
        setWorkItemCommentAttachments(nextWorkItemBundle?.attachmentBundle?.commentAttachments || {});
        setWorkItemAttachmentLoadWarning(
          nextWorkItemBundle?.attachmentBundle?.loadFailed ? '部分附件列表加载失败，请刷新重试。' : '',
        );
      }
      api.restorePendingReturnToHash();
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
    setRoute(router.currentRoute());
  }

  /**
   * @param {string} path
   * @param {string} [nextStatusMessage]
   * @param {boolean} [replace]
   */
  function navigate(path, nextStatusMessage = '', replace = false) {
    router.navigate(path, { replace });
    setStatusMessage(nextStatusMessage);
    syncRouteFromLocation();
  }

  async function submitProfile(event) {
    event.preventDefault();
    const actionId = profileActionRef.current + 1;
    profileActionRef.current = actionId;
    setProfileSubmitting(true);
    setProfileError('');
    try {
      const updated = await api.updateOwnProfile(profileForm);
      if (profileActionRef.current !== actionId) return;
      setProfile(updated);
      setUser((current) => current ? { ...current, display_name: updated.display_name } : current);
      setProfileForm({ displayName: updated.display_name, email: updated.email, mobile: updated.mobile });
      setProfileModalOpen(false);
      setStatusMessage('个人资料已保存。');
    } catch (caught) {
      if (profileActionRef.current === actionId) {
        setProfileError(errorMessage(caught instanceof Error ? caught : new Error('保存失败。')));
      }
    } finally {
      if (profileActionRef.current === actionId) setProfileSubmitting(false);
    }
  }

  useEffect(() => {
    const title = route.id === 'messages'
      ? '消息中心 - 元策'
      : route.id === 'search'
        ? '全局搜索 - 元策'
        : route.id === 'profile'
          ? '个人中心 - 元策'
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
    router.setTitle(title);
  }, [route, activeWorkItemDetail, router]);

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
    setWorkItemNewCommentBody('');
    setWorkItemEditingCommentId(null);
    setWorkItemEditCommentBody('');
    setWorkItemCommentActionError('');
    setWorkItemFormKey(activeWorkItemDetail.key);
  }, [activeWorkItemDetail, workItemFormKey]);

  useEffect(() => {
    return router.subscribe(() => {
      setStatusMessage('已根据浏览器历史恢复页面。');
      syncRouteFromLocation();
    });
  }, [router]);

  useEffect(() => {
    if (workItemEditingCommentId !== null) {
      runtime.scheduleFrame(() => editCommentTextareaRef.current?.focus());
    }
  }, [workItemEditingCommentId]);

  useEffect(() => {
    const close = events.openTopbarEvents({
      onRefresh: () => {
        void loadRouteState(routeRef.current, 'refresh');
      },
      onReleaseVersion: (value) => {
        setReleaseVersion(value);
      },
    });
    return close;
  }, [events]);

  useEffect(() => {
    if (!loading) {
      runtime.scheduleFrame(() => {
        headingRef.current?.focus();
      });
    }
  }, [loading, route]);

  async function handleLogout() {
    try {
      await api.logout();
    } catch (_error) {
      // Even if logout fails after the session is gone, returning to the login page is the safest path.
    }
    router.assign('/web/login');
  }

  /** @param {'light' | 'dark'} nextTheme */
  function handleThemeChange(nextTheme) {
    setTheme(nextTheme);
    runtime.writeTheme?.(nextTheme);
  }

  /** @param {AppNotification} item */
  async function handleOpenNotification(item) {
    try {
      const result = item.target ? await api.markNotificationRead(item.id) : await api.getNotificationTarget(item.id);
      const target = result.target || item.target;
      const owner = /** @type {'app' | 'web'} */ (
        target ? workItemOwnerForRoute(routeRef.current) : routeRef.current.owner === 'app' ? 'app' : 'web'
      );
      setStatusMessage('正在打开消息目标。');
      router.assign(notificationTargetPath(target, owner));
    } catch (_error) {
      router.assign(messagesPath);
    }
  }

  async function handleMarkAllRead() {
    try {
      await api.markAllNotificationsRead();
      setStatusMessage('消息已全部标为已读。');
      await loadRouteState(routeRef.current, 'refresh');
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error('标记消息失败。'));
    }
  }

  /** @param {AppProject} project */
  async function handleSetCurrentProject(project) {
    if (projectSwitchRef.current) return;
    projectSwitchRef.current = true;
    setProjectSwitchingKey(project.key);
    requestRef.current += 1;
    try {
      const selected = await api.updateCurrentProject(project.key);
      setTopbar((current) => current ? {
        ...current,
        current_project: {
          ...selected,
          pending_count: current.project_badges.find((badge) => badge.project_key === selected.key)?.pending_count || 0,
        },
      } : current);
      setStatusMessage(`已切换当前项目到 ${project.key}。`);
      await loadRouteState(routeRef.current, 'refresh');
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error('切换当前项目失败。'));
    } finally {
      projectSwitchRef.current = false;
      setProjectSwitchingKey('');
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

  /** @param {React.ChangeEvent<HTMLTextAreaElement>} event */
  function changeWorkItemNewComment(event) {
    setWorkItemNewCommentBody(event.currentTarget.value);
  }

  /** @param {React.ChangeEvent<HTMLTextAreaElement>} event */
  function changeWorkItemEditComment(event) {
    setWorkItemEditCommentBody(event.currentTarget.value);
  }

  /** @param {AppWorkItemComment} comment */
  function startWorkItemCommentEdit(comment) {
    setWorkItemEditingCommentId(comment.id);
    setWorkItemEditCommentBody(comment.body || '');
    setWorkItemCommentActionError('');
  }

  /** @param {number} commentId */
  function focusWorkItemCommentEditButton(commentId) {
    runtime.scheduleFrame(() => {
      runtime.scheduleFrame(() => {
        const row = runtime.getElementById(`comment-${commentId}`);
        const button = /** @type {HTMLButtonElement | null | undefined} */ (row?.querySelector('[data-comment-edit]'));
        button?.focus();
      });
    });
  }

  function cancelWorkItemCommentEdit() {
    const commentId = workItemEditingCommentId;
    setWorkItemEditingCommentId(null);
    setWorkItemEditCommentBody('');
    setWorkItemCommentActionError('');
    if (commentId !== null) {
      focusWorkItemCommentEditButton(commentId);
    }
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
   * @param {string} itemKey
   * @param {number} actionId
   */
  function isCurrentWorkItemAttachmentRoute(itemKey, actionId) {
    const currentRoute = routeRef.current;
    return currentRoute.id === 'work-item-detail'
      && currentRoute.itemKey === itemKey
      && workItemAttachmentActionRef.current === actionId;
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
      api.getWorkItemComments(itemKey),
      api.getTopbarStatus(),
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
    if (workItemMutationRef.current || workItemAttachmentMutationRef.current) {
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
      await saveWorkItem({
        api,
        itemKey,
        payload: {
          title,
          description: workItemEditForm.description,
          status: workItemEditForm.status,
          priority: workItemEditForm.priority,
          assigneeUsername: workItemEditForm.assigneeUsername.trim(),
          dueDate: workItemEditForm.dueDate,
          parentItemKey: workItemEditForm.parentItemKey.trim(),
        },
        lifecycle: {
          isCurrent: () => isCurrentWorkItemDetailRoute(itemKey, actionId),
          onCommitted: (updated) => applyWorkItemMutationResult(
            updated,
            `${updated.key} 已保存。`,
            actionId,
          ),
          refreshCompanion: (updated) => refreshWorkItemCompanionState(
            updated.key,
            '工作项已保存',
            actionId,
          ),
        },
      });
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
    if (workItemMutationRef.current || workItemAttachmentMutationRef.current) {
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
      await handoffWorkItemUseCase({
        api,
        itemKey,
        payload: {
          status: workItemHandoffForm.status,
          assigneeUsername: workItemHandoffForm.assigneeUsername.trim(),
          body: workItemHandoffForm.body,
        },
        lifecycle: {
          isCurrent: () => isCurrentWorkItemDetailRoute(itemKey, actionId),
          onCommitted: (updated) => applyWorkItemMutationResult(
            updated,
            `${updated.key} 已推进并指派。`,
            actionId,
          ),
          refreshCompanion: (updated) => refreshWorkItemCompanionState(
            updated.key,
            '工作项已推进并指派',
            actionId,
          ),
        },
      });
    } catch (caught) {
      if (isCurrentWorkItemDetailRoute(itemKey, actionId)) {
        setWorkItemActionError(errorMessage(caught instanceof Error ? caught : new Error('推进并指派失败。')));
      }
    } finally {
      clearWorkItemMutation(actionId, setWorkItemHandoffSubmitting);
    }
  }

  /** @param {React.FormEvent<HTMLFormElement>} event */
  async function submitWorkItemComment(event) {
    event.preventDefault();
    if (!activeWorkItemDetail) {
      return;
    }
    if (workItemMutationRef.current || workItemAttachmentMutationRef.current) {
      return;
    }

    const body = workItemNewCommentBody.trim();
    if (!body) {
      setWorkItemCommentActionError('评论内容不能为空。');
      runtime.scheduleFrame(() => newCommentTextareaRef.current?.focus());
      return;
    }

    const itemKey = activeWorkItemDetail.key;
    const actionId = workItemActionRef.current + 1;
    workItemActionRef.current = actionId;
    workItemMutationRef.current = true;
    workItemMutationActionRef.current = actionId;
    setWorkItemCommentSubmitting(true);
    setWorkItemCommentActionError('');
    try {
      await createWorkItemCommentUseCase({
        api,
        itemKey,
        payload: { body, bodyFormat: 'plain' },
        lifecycle: {
          isCurrent: () => isCurrentWorkItemDetailRoute(itemKey, actionId),
          onCommitted: (created) => {
            requestRef.current += 1;
            setRefreshing(false);
            setWorkItemComments((current) => [...current, created]);
            setWorkItemNewCommentBody('');
            setStatusMessage(`${itemKey} 评论已发布。`);
          },
          refreshCompanion: () => refreshWorkItemCompanionState(
            itemKey,
            '评论已发布',
            actionId,
          ),
        },
      });
    } catch (caught) {
      if (isCurrentWorkItemDetailRoute(itemKey, actionId)) {
        setWorkItemCommentActionError(errorMessage(caught instanceof Error ? caught : new Error('发布评论失败。')));
      }
    } finally {
      clearWorkItemMutation(actionId, setWorkItemCommentSubmitting);
    }
  }

  /** @param {React.FormEvent<HTMLFormElement>} event */
  async function submitWorkItemCommentEdit(event) {
    event.preventDefault();
    if (!activeWorkItemDetail || workItemEditingCommentId === null) {
      return;
    }
    if (workItemMutationRef.current || workItemAttachmentMutationRef.current) {
      return;
    }

    const body = workItemEditCommentBody.trim();
    if (!body) {
      setWorkItemCommentActionError('评论内容不能为空。');
      const textarea = event.currentTarget.querySelector('textarea');
      runtime.scheduleFrame(() => textarea?.focus());
      return;
    }

    const itemKey = activeWorkItemDetail.key;
    const commentId = workItemEditingCommentId;
    const actionId = workItemActionRef.current + 1;
    workItemActionRef.current = actionId;
    workItemMutationRef.current = true;
    workItemMutationActionRef.current = actionId;
    setWorkItemEditCommentSubmitting(true);
    setWorkItemCommentActionError('');
    try {
      await updateWorkItemCommentUseCase({
        api,
        itemKey,
        commentId,
        payload: { body, bodyFormat: 'plain' },
        lifecycle: {
          isCurrent: () => isCurrentWorkItemDetailRoute(itemKey, actionId),
          onCommitted: (updated) => {
            requestRef.current += 1;
            setRefreshing(false);
            setWorkItemComments((current) => current.map((comment) => (
              comment.id === updated.id ? updated : comment
            )));
            setWorkItemEditingCommentId(null);
            setWorkItemEditCommentBody('');
            setStatusMessage(`${itemKey} 评论已更新。`);
          },
          refreshCompanion: () => refreshWorkItemCompanionState(
            itemKey,
            '评论已更新',
            actionId,
          ),
        },
      });
      if (isCurrentWorkItemDetailRoute(itemKey, actionId)) {
        focusWorkItemCommentEditButton(commentId);
      }
    } catch (caught) {
      if (isCurrentWorkItemDetailRoute(itemKey, actionId)) {
        setWorkItemCommentActionError(errorMessage(caught instanceof Error ? caught : new Error('编辑评论失败。')));
      }
    } finally {
      clearWorkItemMutation(actionId, setWorkItemEditCommentSubmitting);
    }
  }

  /**
   * @param {string} itemKey
   * @param {number} actionId
   */
  async function refreshWorkItemAttachmentList(itemKey, actionId) {
    const refreshed = await api.getWorkItemAttachments(itemKey);
    if (isCurrentWorkItemAttachmentRoute(itemKey, actionId)) {
      setWorkItemAttachments(refreshed);
    }
    return refreshed;
  }

  /**
   * @param {string} itemKey
   * @param {number} commentId
   * @param {number} actionId
   */
  async function refreshWorkItemCommentAttachmentList(itemKey, commentId, actionId) {
    const refreshed = await api.getWorkItemCommentAttachments(itemKey, commentId);
    if (isCurrentWorkItemAttachmentRoute(itemKey, actionId)) {
      setWorkItemCommentAttachments((current) => ({
        ...current,
        [String(commentId)]: refreshed,
      }));
    }
    return refreshed;
  }

  /**
   * @param {AppAttachment} attachment
   */
  async function downloadWorkItemAttachment(attachment) {
    if (!activeWorkItemDetail || !attachmentIsUploaded(attachment)) {
      return;
    }
    const itemKey = activeWorkItemDetail.key;
    setWorkItemAttachmentReveal(null);
    setWorkItemAttachmentDownloadingId(attachment.id);
    setWorkItemAttachmentActionError('');
    setWorkItemAttachmentStatus(`正在获取 ${attachment.filename || '附件'} 的下载链接。`);
    try {
      const result = await downloadWorkItemAttachmentUseCase({
        api,
        platform: files,
        itemKey,
        attachmentId: attachment.id,
        suggestedFilename: attachment.filename,
        isCurrent: () => isCurrentWorkItemDetailRoute(itemKey),
      });
      if (result.completed) {
        setWorkItemAttachmentReveal(result.revealCapability ? { attachmentId: attachment.id, capability: result.revealCapability } : null);
        setWorkItemAttachmentStatus(`${attachment.filename || '附件'} 下载完成。`);
      }
    } catch (caught) {
      if (isCurrentWorkItemDetailRoute(itemKey)) {
        setWorkItemAttachmentActionError(errorMessage(caught instanceof Error ? caught : new Error('获取附件下载链接失败。')));
        setWorkItemAttachmentStatus(`${attachment.filename || '附件'} 下载失败。`);
      }
    } finally {
      setWorkItemAttachmentDownloadingId((current) => (current === attachment.id ? null : current));
    }
  }

  /** @param {AppAttachment} attachment */
  async function revealWorkItemAttachment(attachment) {
    const reveal = workItemAttachmentReveal;
    if (!reveal || reveal.attachmentId !== attachment.id || typeof files.attachments?.revealDownload !== 'function') return;
    setWorkItemAttachmentReveal(null);
    setWorkItemAttachmentDownloadingId(attachment.id);
    try {
      await files.attachments.revealDownload(reveal.capability);
      setWorkItemAttachmentStatus(`${attachment.filename || '附件'} 已在文件夹中定位。`);
    } catch (caught) {
      setWorkItemAttachmentActionError(errorMessage(caught instanceof Error ? caught : new Error('定位附件失败。')));
    } finally {
      setWorkItemAttachmentDownloadingId(null);
    }
  }

  /**
   * @param {number} commentId
   * @param {AppAttachment} attachment
   */
  async function downloadWorkItemCommentAttachment(commentId, attachment) {
    if (!activeWorkItemDetail || !attachmentIsUploaded(attachment)) {
      return;
    }
    const itemKey = activeWorkItemDetail.key;
    const busyKey = `${commentId}:${attachment.id}`;
    setWorkItemCommentAttachmentReveal(null);
    setWorkItemCommentAttachmentDownloadingKey(busyKey);
    setWorkItemAttachmentActionError('');
    setWorkItemCommentAttachmentStatus((current) => ({
      ...current,
      [String(commentId)]: `正在获取 ${attachment.filename || '附件'} 的下载链接。`,
    }));
    try {
      const result = await downloadWorkItemCommentAttachmentUseCase({
        api,
        platform: files,
        itemKey,
        commentId,
        attachmentId: attachment.id,
        suggestedFilename: attachment.filename,
        isCurrent: () => isCurrentWorkItemDetailRoute(itemKey),
      });
      if (result.completed) {
        setWorkItemCommentAttachmentReveal(result.revealCapability ? { key: busyKey, capability: result.revealCapability } : null);
        setWorkItemCommentAttachmentStatus((current) => ({
          ...current,
          [String(commentId)]: `${attachment.filename || '附件'} 下载完成。`,
        }));
      }
    } catch (caught) {
      if (isCurrentWorkItemDetailRoute(itemKey)) {
        setWorkItemAttachmentActionError(errorMessage(caught instanceof Error ? caught : new Error('获取评论附件下载链接失败。')));
        setWorkItemCommentAttachmentStatus((current) => ({
          ...current,
          [String(commentId)]: `${attachment.filename || '附件'} 下载失败。`,
        }));
      }
    } finally {
      setWorkItemCommentAttachmentDownloadingKey((current) => (current === busyKey ? '' : current));
    }
  }

  /** @param {number} commentId @param {AppAttachment} attachment */
  async function revealWorkItemCommentAttachment(commentId, attachment) {
    const key = `${commentId}:${attachment.id}`;
    const reveal = workItemCommentAttachmentReveal;
    if (!reveal || reveal.key !== key || typeof files.attachments?.revealDownload !== 'function') return;
    setWorkItemCommentAttachmentReveal(null);
    setWorkItemCommentAttachmentDownloadingKey(key);
    try {
      await files.attachments.revealDownload(reveal.capability);
      setWorkItemCommentAttachmentStatus((current) => ({ ...current, [String(commentId)]: `${attachment.filename || '附件'} 已在文件夹中定位。` }));
    } catch (caught) {
      setWorkItemAttachmentActionError(errorMessage(caught instanceof Error ? caught : new Error('定位评论附件失败。')));
    } finally {
      setWorkItemCommentAttachmentDownloadingKey('');
    }
  }

  async function uploadSelectedWorkItemAttachment() {
    if (!activeWorkItemDetail || workItemAttachmentMutationRef.current || workItemMutationRef.current) {
      return;
    }
    const itemKey = activeWorkItemDetail.key;
    const actionId = workItemAttachmentActionRef.current + 1;
    workItemAttachmentActionRef.current = actionId;
    workItemAttachmentMutationRef.current = true;
    setWorkItemAttachmentUploading(true);
    setWorkItemAttachmentStatus('正在选择工作项附件。');
    let file;
    try { file = await files.files.chooseFile(); }
    catch (caught) {
      workItemAttachmentMutationRef.current = false;
      setWorkItemAttachmentUploading(false);
      if (isCurrentWorkItemAttachmentRoute(itemKey, actionId)) setWorkItemAttachmentActionError(errorMessage(caught instanceof Error ? caught : new Error('选择附件失败。')));
      return;
    }
    if (!isCurrentWorkItemAttachmentRoute(itemKey, actionId)) {
      workItemAttachmentMutationRef.current = false;
      setWorkItemAttachmentUploading(false);
      return;
    }
    if (!file) {
      workItemAttachmentMutationRef.current = false;
      setWorkItemAttachmentUploading(false);
      setWorkItemAttachmentStatus('已取消选择附件。');
      return;
    }
    if (!file.byteSize || file.byteSize <= 0) {
      setWorkItemAttachmentActionError('请选择非空文件。');
      setWorkItemAttachmentStatus(`${file.filename || '附件'} 未上传。`);
      workItemAttachmentMutationRef.current = false;
      setWorkItemAttachmentUploading(false);
      return;
    }

    const filename = file.filename || 'attachment.bin';
    let createdAttachment = /** @type {AppAttachment | null} */ (null);
    let uploadStage = /** @type {'registering' | 'signing' | 'uploading' | 'confirming'} */ ('registering');
    setWorkItemAttachmentActionError('');
    setWorkItemAttachmentStatus(`${filename} 正在登记附件。`);
    try {
      const result = await uploadWorkItemAttachment({
        api,
        platform: files,
        itemKey,
        file,
        lifecycle: {
          isCurrent: () => isCurrentWorkItemAttachmentRoute(itemKey, actionId),
          onStage: (stage) => {
            uploadStage = stage;
            const messages = {
              registering: `${filename} 正在登记附件。`,
              signing: `${filename} 正在获取上传签名。`,
              uploading: `${filename} 正在上传到对象存储。`,
              confirming: `${filename} 正在确认上传结果。`,
            };
            setWorkItemAttachmentStatus(messages[stage]);
          },
          onCreated: (created) => {
            createdAttachment = created;
            setWorkItemAttachments((current) => upsertAttachment(current, created));
          },
          onUploaded: (uploaded) => {
            requestRef.current += 1;
            setRefreshing(false);
            setWorkItemAttachments((current) => upsertAttachment(current, uploaded));
          },
          refresh: async () => { await refreshWorkItemAttachmentList(itemKey, actionId); },
        },
      });
      if (result.completed) {
        setStatusMessage(`${itemKey} 附件已上传。`);
        setWorkItemAttachmentStatus(`${filename} 上传完成。`);
        if (result.refreshError) {
          setWorkItemAttachmentActionError('附件已上传，但列表刷新失败，请手动刷新。');
        }
      }
    } catch (caught) {
      if (isCurrentWorkItemAttachmentRoute(itemKey, actionId)) {
        if (uploadStage === 'confirming') {
          let confirmedByRefresh = false;
          try {
            const refreshed = await refreshWorkItemAttachmentList(itemKey, actionId);
            confirmedByRefresh = refreshed.some((attachment) => (
              attachment.id === createdAttachment?.id && attachment.status === 'uploaded'
            ));
          } catch {
            // The upload has completed; retain the locally known pending state when confirmation cannot be resolved.
          }
          if (confirmedByRefresh) {
            setStatusMessage(`${itemKey} 附件已上传。`);
            setWorkItemAttachmentStatus(`${filename} 上传完成。`);
          } else {
            setWorkItemAttachmentActionError(`${filename} 已上传，但服务端确认失败，请手动刷新后检查。`);
            setWorkItemAttachmentStatus(`${filename} 上传结果待确认。`);
          }
        } else if (createdAttachment) {
          const failedAttachment = /** @type {AppAttachment} */ ({ ...createdAttachment, status: 'failed' });
          setWorkItemAttachments((current) => upsertAttachment(current, failedAttachment));
          const message = errorMessage(caught instanceof Error ? caught : new Error('上传附件失败。'));
          setWorkItemAttachmentActionError(`${filename} 上传失败：${message}`);
          setWorkItemAttachmentStatus(`${filename} 上传失败，请重试。`);
        } else {
          const message = errorMessage(caught instanceof Error ? caught : new Error('上传附件失败。'));
          setWorkItemAttachmentActionError(`${filename} 上传失败：${message}`);
          setWorkItemAttachmentStatus(`${filename} 上传失败，请重试。`);
        }
      }
    } finally {
      if (workItemAttachmentActionRef.current === actionId) {
        workItemAttachmentMutationRef.current = false;
        setWorkItemAttachmentUploading(false);
      }
    }
  }

  /**
   * @param {number} commentId
   */
  async function uploadSelectedWorkItemCommentAttachment(commentId) {
    if (!activeWorkItemDetail || workItemAttachmentMutationRef.current || workItemMutationRef.current) {
      return;
    }
    const itemKey = activeWorkItemDetail.key;
    const actionId = workItemAttachmentActionRef.current + 1;
    workItemAttachmentActionRef.current = actionId;
    workItemAttachmentMutationRef.current = true;
    setWorkItemCommentAttachmentUploadingId(commentId);
    setWorkItemCommentAttachmentStatus((current) => ({ ...current, [String(commentId)]: '正在选择评论附件。' }));
    let file;
    try { file = await files.files.chooseFile(); }
    catch (caught) {
      workItemAttachmentMutationRef.current = false;
      setWorkItemCommentAttachmentUploadingId(null);
      if (isCurrentWorkItemAttachmentRoute(itemKey, actionId)) setWorkItemAttachmentActionError(errorMessage(caught instanceof Error ? caught : new Error('选择附件失败。')));
      return;
    }
    if (!isCurrentWorkItemAttachmentRoute(itemKey, actionId)) {
      workItemAttachmentMutationRef.current = false;
      setWorkItemCommentAttachmentUploadingId(null);
      return;
    }
    if (!file) {
      workItemAttachmentMutationRef.current = false;
      setWorkItemCommentAttachmentUploadingId(null);
      setWorkItemCommentAttachmentStatus((current) => ({ ...current, [String(commentId)]: '已取消选择附件。' }));
      return;
    }
    if (!file.byteSize || file.byteSize <= 0) {
      setWorkItemAttachmentActionError('请选择非空文件。');
      setWorkItemCommentAttachmentStatus((current) => ({
        ...current,
        [String(commentId)]: `${file.filename || '附件'} 未上传。`,
      }));
      workItemAttachmentMutationRef.current = false;
      setWorkItemCommentAttachmentUploadingId(null);
      return;
    }

    const filename = file.filename || 'attachment.bin';
    let createdAttachment = /** @type {AppAttachment | null} */ (null);
    let uploadStage = /** @type {'registering' | 'signing' | 'uploading' | 'confirming'} */ ('registering');
    setWorkItemAttachmentActionError('');
    setWorkItemCommentAttachmentStatus((current) => ({
      ...current,
      [String(commentId)]: `${filename} 正在登记附件。`,
    }));
    try {
      const result = await uploadWorkItemCommentAttachment({
        api,
        platform: files,
        itemKey,
        commentId,
        file,
        lifecycle: {
          isCurrent: () => isCurrentWorkItemAttachmentRoute(itemKey, actionId),
          onStage: (stage) => {
            uploadStage = stage;
            const labels = {
              registering: '正在登记附件。',
              signing: '正在获取上传签名。',
              uploading: '正在上传到对象存储。',
              confirming: '正在确认上传结果。',
            };
            setWorkItemCommentAttachmentStatus((current) => ({
              ...current,
              [String(commentId)]: `${filename} ${labels[stage]}`,
            }));
          },
          onCreated: (created) => {
            createdAttachment = created;
            setWorkItemCommentAttachments((current) => ({
              ...current,
              [String(commentId)]: upsertAttachment(current[String(commentId)] || [], created),
            }));
          },
          onUploaded: (uploaded) => {
            requestRef.current += 1;
            setRefreshing(false);
            setWorkItemCommentAttachments((current) => ({
              ...current,
              [String(commentId)]: upsertAttachment(current[String(commentId)] || [], uploaded),
            }));
          },
          refresh: async () => { await refreshWorkItemCommentAttachmentList(itemKey, commentId, actionId); },
        },
      });
      if (result.completed) {
        setStatusMessage(`${itemKey} 评论附件已上传。`);
        setWorkItemCommentAttachmentStatus((current) => ({
          ...current,
          [String(commentId)]: `${filename} 上传完成。`,
        }));
        if (result.refreshError) {
          setWorkItemAttachmentActionError('评论附件已上传，但列表刷新失败，请手动刷新。');
        }
      }
    } catch (caught) {
      if (isCurrentWorkItemAttachmentRoute(itemKey, actionId)) {
        if (uploadStage === 'confirming') {
          let confirmedByRefresh = false;
          try {
            const refreshed = await refreshWorkItemCommentAttachmentList(itemKey, commentId, actionId);
            confirmedByRefresh = refreshed.some((attachment) => (
              attachment.id === createdAttachment?.id && attachment.status === 'uploaded'
            ));
          } catch {
            // The upload has completed; retain the locally known pending state when confirmation cannot be resolved.
          }
          if (confirmedByRefresh) {
            setStatusMessage(`${itemKey} 评论附件已上传。`);
            setWorkItemCommentAttachmentStatus((current) => ({
              ...current,
              [String(commentId)]: `${filename} 上传完成。`,
            }));
          } else {
            setWorkItemAttachmentActionError(`${filename} 已上传，但服务端确认失败，请手动刷新后检查。`);
            setWorkItemCommentAttachmentStatus((current) => ({
              ...current,
              [String(commentId)]: `${filename} 上传结果待确认。`,
            }));
          }
        } else if (createdAttachment) {
          const failedAttachment = /** @type {AppAttachment} */ ({
            ...createdAttachment,
            status: 'failed',
          });
          setWorkItemCommentAttachments((current) => ({
            ...current,
            [String(commentId)]: upsertAttachment(current[String(commentId)] || [], failedAttachment),
          }));
          const message = errorMessage(caught instanceof Error ? caught : new Error('上传评论附件失败。'));
          setWorkItemAttachmentActionError(`${filename} 上传失败：${message}`);
          setWorkItemCommentAttachmentStatus((current) => ({
            ...current,
            [String(commentId)]: `${filename} 上传失败，请重试。`,
          }));
        } else {
          const message = errorMessage(caught instanceof Error ? caught : new Error('上传评论附件失败。'));
          setWorkItemAttachmentActionError(`${filename} 上传失败：${message}`);
          setWorkItemCommentAttachmentStatus((current) => ({
            ...current,
            [String(commentId)]: `${filename} 上传失败，请重试。`,
          }));
        }
      }
    } finally {
      if (workItemAttachmentActionRef.current === actionId) {
        workItemAttachmentMutationRef.current = false;
        setWorkItemCommentAttachmentUploadingId(null);
      }
    }
  }

  /** @param {React.MouseEvent<HTMLAnchorElement>} event @param {string} path @param {string} message */
  function handleNavigate(event, path, message) {
    event.preventDefault();
    if (router.currentPath() === path) {
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
    navigate(
      buildWorkItemListPath({
        owner: workItemOwner,
        itemType: workItemListRoute.itemType,
        q: runtime.readFormValue(event.currentTarget, 'q'),
        status: runtime.readFormValue(event.currentTarget, 'status'),
        priority: runtime.readFormValue(event.currentTarget, 'priority'),
        assigneeUsername: runtime.readFormValue(event.currentTarget, 'assignee_username'),
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

      <GlobalNavigation
        productName="元策"
        links={[
          { id: 'home', label: '工作台', href: homePath, active: route.id === 'home' },
          { id: 'messages', label: '消息中心', href: messagesPath, active: route.id === 'messages', badge: unreadCount },
          { id: 'projects', label: '项目列表', href: projectsPath, active: route.id === 'projects' },
        ]}
        currentProject={currentProject}
        projectsHref={projectsPath}
        user={user}
        profileHref={profilePath}
        theme={theme}
        onNavigate={(event, path, label) => handleNavigate(event, path, `已切换到${label}。`)}
        onSearch={(query) => navigate(buildSearchPath({ owner: route.owner, q: query }), query ? `正在搜索 ${query}。` : '请输入搜索内容。')}
        onThemeChange={handleThemeChange}
        onLogout={handleLogout}
      />

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
          {route.id === 'messages' || route.id === 'search' || route.id === 'profile' ? (
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
          <button className="shell-button shell-button-secondary" type="button" onClick={() => void loadRouteState(routeRef.current, 'refresh')}>
            {refreshing ? '刷新中…' : '刷新'}
          </button>
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
          ) : route.id === 'search' ? (
            <section className="shell-card shell-panel-wide" aria-labelledby="search-results-title">
              <div className="shell-panel-header">
                <div>
                  <h2 id="search-results-title">搜索结果</h2>
                  <p className="shell-muted">
                    {searchRoute?.q ? `“${searchRoute.q}” 共 ${searchPage?.pagination.total_items || 0} 条结果` : '在顶部搜索框输入关键词。'}
                  </p>
                </div>
              </div>
              {searchPage?.items.length ? (
                <>
                  <ul className="message-list" aria-label="搜索结果列表">
                    {searchPage.items.map((item) => {
                      const target = routePathForOwner(item.target, route.owner);
                      return (
                        <li key={`${item.kind}:${item.key}`} className="message-row">
                          <div className="message-body">
                            <div className="message-heading"><span className="message-kind">{item.kind}</span></div>
                            <strong>{item.title}</strong>
                            <p>{item.context}</p>
                            <p className="shell-muted">{item.key} · {formatTimestamp(item.updated_at)}</p>
                          </div>
                          <a className="shell-link" href={target} onClick={(event) => handleNavigate(event, target, `已打开 ${item.key}。`)}>打开</a>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="message-pagination" aria-label="搜索结果分页">
                    <div className="message-pagination-meta"><strong>共 {searchPage.pagination.total_items} 条</strong></div>
                    <div className="message-pagination-controls">
                      <button className="shell-button shell-button-secondary" type="button" disabled={searchPage.pagination.page <= 1}
                        onClick={() => navigate(buildSearchPath({ owner: route.owner, q: searchRoute?.q, page: searchPage.pagination.page - 1, perPage: searchPage.pagination.per_page }))}>
                        上一页
                      </button>
                      <span className="shell-meta">第 {searchPage.pagination.page} / {searchPage.pagination.total_pages} 页</span>
                      <button className="shell-button shell-button-secondary" type="button" disabled={searchPage.pagination.page >= searchPage.pagination.total_pages}
                        onClick={() => navigate(buildSearchPath({ owner: route.owner, q: searchRoute?.q, page: searchPage.pagination.page + 1, perPage: searchPage.pagination.per_page }))}>
                        下一页
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="shell-empty">{searchRoute?.q ? '没有找到匹配结果。' : '请输入搜索关键词。'}</p>
              )}
            </section>
          ) : route.id === 'profile' ? (
            <section className="shell-card shell-panel-wide" aria-labelledby="profile-title">
              <div className="shell-panel-header">
                <div>
                  <h2 id="profile-title">{profile?.display_name || user?.display_name || user?.username}</h2>
                  <p className="shell-muted">@{profile?.username || user?.username}</p>
                </div>
                <Button variant="secondary" onClick={() => { setProfileError(''); setProfileModalOpen(true); }}>编辑资料</Button>
              </div>
              <dl className="work-item-detail-meta">
                <div><dt>角色</dt><dd>{profile?.roles || (profile?.is_super_admin ? '超级管理员' : '普通成员')}</dd></div>
                <div><dt>状态</dt><dd>{profile?.status || 'active'}</dd></div>
                <div><dt>邮箱</dt><dd>{profile?.email || '未填写'}</dd></div>
                <div><dt>手机号</dt><dd>{profile?.mobile || '未填写'}</dd></div>
                <div><dt>加入时间</dt><dd>{profile?.created_at ? formatTimestamp(profile.created_at) : '-'}</dd></div>
                <div><dt>最近更新</dt><dd>{profile?.updated_at ? formatTimestamp(profile.updated_at) : '-'}</dd></div>
              </dl>
              <Modal
                open={profileModalOpen}
                title="编辑个人资料"
                onClose={() => { if (!profileSubmitting) setProfileModalOpen(false); }}
                footer={(
                  <>
                    <Button variant="secondary" disabled={profileSubmitting} onClick={() => setProfileModalOpen(false)}>取消</Button>
                    <Button loading={profileSubmitting} ariaLabel="保存个人资料" onClick={() => {
                      const form = /** @type {HTMLFormElement | null} */ (runtime.getElementById('profile-form'));
                      form?.requestSubmit();
                    }}>保存</Button>
                  </>
                )}
              >
                <form id="profile-form" onSubmit={submitProfile}>
                  {profileError ? <Feedback tone="danger" title="保存失败">{profileError}</Feedback> : null}
                  <Field id="profile-display-name" label="显示名称" required>
                    <input value={profileForm.displayName} onChange={(event) => setProfileForm((current) => ({ ...current, displayName: event.target.value }))} />
                  </Field>
                  <Field id="profile-email" label="邮箱">
                    <input type="email" value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} />
                  </Field>
                  <Field id="profile-mobile" label="手机号">
                    <input value={profileForm.mobile} onChange={(event) => setProfileForm((current) => ({ ...current, mobile: event.target.value }))} />
                  </Field>
                </form>
              </Modal>
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
                              disabled={isCurrentProject || Boolean(projectSwitchingKey)}
                              onClick={() => void handleSetCurrentProject(project)}
                            >
                              {isCurrentProject ? '当前项目' : projectSwitchingKey === project.key ? '切换中…' : '设为当前项目'}
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
                  <WorkItemDetail
                    item={activeWorkItemDetail}
                    editForm={workItemEditForm}
                    handoffForm={workItemHandoffForm}
                    statusOptions={WORK_ITEM_STATUS_OPTIONS}
                    priorityOptions={WORK_ITEM_PRIORITY_OPTIONS}
                    statusLabel={workItemStatusLabel}
                    mutationBusy={workItemMutationSubmitting}
                    editSubmitting={workItemEditSubmitting}
                    handoffSubmitting={workItemHandoffSubmitting}
                    error={workItemActionError}
                    parentHref={buildWorkItemDetailPath({ owner: workItemOwner, itemKey: activeWorkItemDetail.parent_item_key })}
                    onOpenParent={(event) => handleNavigate(event, buildWorkItemDetailPath({ owner: workItemOwner, itemKey: activeWorkItemDetail.parent_item_key }), `已打开 ${activeWorkItemDetail.parent_item_key}。`)}
                    onChangeEdit={changeWorkItemEditField}
                    onChangeHandoff={changeWorkItemHandoffField}
                    onSubmitEdit={submitWorkItemEdit}
                    onSubmitHandoff={submitWorkItemHandoff}
                  />

                  <WorkItemAttachments
                    attachments={workItemAttachments}
                    status={workItemAttachmentStatus}
                    warning={workItemAttachmentLoadWarning}
                    error={workItemAttachmentActionError}
                    uploading={workItemAttachmentUploading}
                    mutationBusy={workItemMutationSubmitting}
                    downloadingId={workItemAttachmentDownloadingId}
                    revealableId={workItemAttachmentReveal?.attachmentId || null}
                    onChooseUpload={() => void uploadSelectedWorkItemAttachment()}
                    onDownload={(attachment) => void downloadWorkItemAttachment(attachment)}
                    onReveal={(attachment) => void revealWorkItemAttachment(attachment)}
                  />

                  <WorkItemComments
                    comments={workItemComments}
                    attachmentsByComment={workItemCommentAttachments}
                    attachmentStatusByComment={workItemCommentAttachmentStatus}
                    uploadingCommentId={workItemCommentAttachmentUploadingId}
                    downloadingKey={workItemCommentAttachmentDownloadingKey}
                    revealableKey={workItemCommentAttachmentReveal?.key || ''}
                    mutationBusy={workItemMutationSubmitting}
                    editingCommentId={workItemEditingCommentId}
                    newCommentBody={workItemNewCommentBody}
                    editCommentBody={workItemEditCommentBody}
                    commentSubmitting={workItemCommentSubmitting}
                    editSubmitting={workItemEditCommentSubmitting}
                    error={workItemCommentActionError}
                    newCommentTextareaRef={newCommentTextareaRef}
                    editCommentTextareaRef={editCommentTextareaRef}
                    onSubmitNew={submitWorkItemComment}
                    onChangeNew={changeWorkItemNewComment}
                    onSubmitEdit={submitWorkItemCommentEdit}
                    onChangeEdit={changeWorkItemEditComment}
                    onCancelEdit={cancelWorkItemCommentEdit}
                    onStartEdit={startWorkItemCommentEdit}
                    onUploadAttachment={(commentId) => void uploadSelectedWorkItemCommentAttachment(commentId)}
                    onDownloadAttachment={(commentId, attachment) => void downloadWorkItemCommentAttachment(commentId, attachment)}
                    onRevealAttachment={(commentId, attachment) => void revealWorkItemCommentAttachment(commentId, attachment)}
                  />
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
