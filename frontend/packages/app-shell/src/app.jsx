// @ts-check

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildHomePath,
  buildMessagesPath,
  buildProfilePath,
  buildProjectDetailPath,
  buildProjectCycleDetailPath,
  buildProjectResourceDetailPath,
  buildProjectsPath,
  buildSearchPath,
  buildWorkItemDetailPath,
  buildWorkItemListPath,
  createWorkItemComment as createWorkItemCommentUseCase,
  downloadProjectAttachment as downloadProjectAttachmentUseCase,
  downloadProjectResourceAttachment as downloadProjectResourceAttachmentUseCase,
  downloadWorkItemAttachment as downloadWorkItemAttachmentUseCase,
  downloadWorkItemCommentAttachment as downloadWorkItemCommentAttachmentUseCase,
  handoffWorkItem as handoffWorkItemUseCase,
  notificationTargetPath,
  routePathForOwner,
  saveWorkItem,
  updateWorkItemComment as updateWorkItemCommentUseCase,
  uploadWorkItemAttachment,
  uploadWorkItemCommentAttachment,
  uploadProjectAttachment,
  uploadProjectResourceAttachment,
} from '@yuance/frontend-app-core';
import {
  AttachmentList,
  AttachmentPreview,
  Button,
  DataTable,
  Feedback,
  Field,
  GlobalNavigation,
  Modal,
  RichTextContent,
  RichTextEditor,
  WorkItemAttachments,
  WorkItemComments,
  WorkItemDetail,
  attachmentIsUploaded,
  plainTextToRichHtml,
  richTextAttachmentIds,
  richTextHasContent,
} from '@yuance/frontend-ui';
import { errorMessage } from './errors.js';

/** @typedef {import('@yuance/frontend-api-client').ApiError} ApiError */
/** @typedef {Awaited<ReturnType<AppApiService['getProjectAttachmentPreview']>>['preview']['kind']} AppPreviewKind */

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
 * @typedef AppProjectResource
 * @property {number} id
 * @property {string} project_key
 * @property {string} title
 * @property {string} category
 * @property {string} body
 * @property {string} body_format
 * @property {string} summary
 * @property {string} status
 * @property {boolean} is_protected
 * @property {readonly string[]} tags
 * @property {{ key: string, item_type: string, title: string, url: string } | null} related_work_item
 * @property {{ id: number, name: string, start_date: string, end_date: string, url: string } | null} related_cycle
 * @property {string} created_by
 * @property {string} updated_by
 * @property {string} created_at
 * @property {string} updated_at
 * @property {string} url
 * @property {string} access_token
 */

/**
 * @typedef AppProjectCycle
 * @property {number} id
 * @property {string} name
 * @property {string} goal
 * @property {string} description
 * @property {string} owner_username
 * @property {string} owner
 * @property {string} start_date
 * @property {string} end_date
 * @property {string} closed_at
 * @property {boolean} is_closed
 * @property {number} total_items
 * @property {number} requirement_count
 * @property {number} task_count
 * @property {number} bug_count
 * @property {number} pending_count
 * @property {string} created_at
 * @property {string} updated_at
 * @property {Array<{ key: string, item_type: string, title: string, status: string, priority: string, assignee_username: string, assignee: string, due_date: string, updated_at: string }>} work_items
 */

/**
 * @typedef AppProjectDetail
 * @property {string} key
 * @property {string} name
 * @property {string} description
 * @property {string} status
 * @property {string} owner_username
 * @property {string} owner
 * @property {string} start_date
 * @property {string} due_date
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef AppProjectMember
 * @property {number} user_id
 * @property {string} display_name
 * @property {string} username
 * @property {string} member_role
 * @property {string} joined_at
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

function projectMemberRoleLabel(role) {
  return { owner: '项目负责人', maintainer: '项目管理员', member: '项目成员', viewer: '只读成员' }[role] || role;
}

function projectCycleStatusLabel(cycle) { return cycle.is_closed ? '已关闭' : '进行中'; }

function shanghaiToday(today = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(today);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function projectCyclePace(cycle, today = new Date()) {
  const start = new Date(`${cycle.start_date}T00:00:00Z`);
  const end = new Date(`${cycle.end_date}T00:00:00Z`);
  const current = new Date(`${shanghaiToday(today)}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return { percent: 0, duration: '日期范围不可用', hint: '请检查周期日期' };
  }
  const day = 86_400_000;
  const durationDays = Math.floor((end.getTime() - start.getTime()) / day) + 1;
  if (current < start) return { percent: 0, duration: `共 ${durationDays} 天`, hint: `${Math.ceil((start.getTime() - current.getTime()) / day)} 天后开始` };
  if (cycle.is_closed) return { percent: 100, duration: `共 ${durationDays} 天`, hint: '周期已关闭' };
  if (current > end) return { percent: 100, duration: `共 ${durationDays} 天`, hint: `已超计划 ${Math.floor((current.getTime() - end.getTime()) / day)} 天` };
  const elapsedDays = Math.floor((current.getTime() - start.getTime()) / day) + 1;
  const remainingDays = Math.floor((end.getTime() - current.getTime()) / day);
  return { percent: Math.max(1, Math.min(100, Math.floor((elapsedDays * 100) / durationDays))), duration: `共 ${durationDays} 天`, hint: remainingDays ? `剩余 ${remainingDays} 天` : '今天结束' };
}

function projectCycleMemberLoad(cycle, members, today = new Date()) {
  const todayText = shanghaiToday(today);
  const activeStatuses = new Set(['open', 'in_progress', 'pending_confirmation']);
  const rows = new Map(members.map((member) => [member.username, {
    key: member.username, member: member.display_name, subtitle: `@${member.username} · ${projectMemberRoleLabel(member.member_role)}`,
    open: 0, in_progress: 0, pending_confirmation: 0, high: 0, overdue: 0, active: 0,
  }]));
  const unassigned = { key: '', member: '未指派', subtitle: '当前周期仍有工作项未绑定处理人', open: 0, in_progress: 0, pending_confirmation: 0, high: 0, overdue: 0, active: 0 };
  for (const item of cycle.work_items) {
    if (!activeStatuses.has(item.status)) continue;
    const key = item.assignee_username || '';
    const row = key ? rows.get(key) : unassigned;
    if (!row) continue;
    row[item.status] += 1; row.active += 1;
    if (['P0', 'P1'].includes(item.priority)) row.high += 1;
    if (item.due_date && item.due_date < todayText) row.overdue += 1;
  }
  const result = [...rows.values()];
  if (!result.some((row) => row.active > 0) && unassigned.active === 0) return [];
  result.sort((left, right) => right.active - left.active || right.overdue - left.overdue || right.high - left.high || left.member.localeCompare(right.member));
  if (unassigned.active > 0) result.push(unassigned);
  return result;
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
    case 'project-detail':
      return '项目资料和成员管理由 Browser 与 Desktop 共用同一页面、表单和确认流程。';
    case 'project-cycle-detail':
      return '周期指标、状态看板和工作项入口由两个宿主共用同一派生视图。';
    case 'project-resource-detail':
      return '资料正文、关联信息和受保护内容解锁由两个宿主共用同一读取流程。';
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
    case 'project-detail':
    case 'project-cycle-detail':
    case 'project-resource-detail':
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
  const accountSecurityActionRef = useRef(false);
  const projectSwitchRef = useRef(false);
  const projectMutationRef = useRef(false);
  const projectAttachmentActionRef = useRef(0);
  const projectAttachmentMutationRef = useRef(false);
  const projectResourceAttachmentActionRef = useRef(0);
  const projectResourceAttachmentMutationRef = useRef(false);
  const projectAttachmentPreviewRequestRef = useRef(0);
  const projectAttachmentPreviewCapabilityRef = useRef('');
  const projectResourceActionRef = useRef(0);
  const projectResourceMutationRef = useRef(0);
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
  const [projectDetail, setProjectDetail] = useState(/** @type {AppProjectDetail | null} */ (null));
  const [projectMembers, setProjectMembers] = useState(/** @type {AppProjectMember[]} */ ([]));
  const [projectCycles, setProjectCycles] = useState(/** @type {AppProjectCycle[]} */ ([]));
  const [projectAttachments, setProjectAttachments] = useState(/** @type {AppAttachment[]} */ ([]));
  const [projectResources, setProjectResources] = useState(/** @type {readonly AppProjectResource[]} */ ([]));
  const [projectResourceDetail, setProjectResourceDetail] = useState(/** @type {AppProjectResource | null} */ (null));
  const [projectResourceLocked, setProjectResourceLocked] = useState(false);
  const [projectResourcePassword, setProjectResourcePassword] = useState('');
  const [projectResourceUnlocking, setProjectResourceUnlocking] = useState(false);
  const [projectResourceError, setProjectResourceError] = useState('');
  const [projectResourceFilters, setProjectResourceFilters] = useState({ q: '', category: '', status: '', tag: '' });
  const [projectResourceSubmitting, setProjectResourceSubmitting] = useState(false);
  const [projectResourceModalOpen, setProjectResourceModalOpen] = useState(false);
  const [projectResourceForm, setProjectResourceForm] = useState({ id: 0, title: '', category: 'other', body: '', bodyFormat: 'html', accessPasswordAction: 'keep', accessPassword: '', tagsText: '', relatedWorkItemKey: '', relatedCycleId: '' });
  const [projectResourceInitialInlineAttachmentIds, setProjectResourceInitialInlineAttachmentIds] = useState(/** @type {number[]} */ ([]));
  const [projectResourceArchiveTarget, setProjectResourceArchiveTarget] = useState(/** @type {AppProjectResource | null} */ (null));
  const [projectResourceStatus, setProjectResourceStatus] = useState('');
  const [projectResourcePasswordResetOpen, setProjectResourcePasswordResetOpen] = useState(false);
  const [projectResourcePasswordResetForm, setProjectResourcePasswordResetForm] = useState({ accessPasswordAction: 'set', accessPassword: '' });
  const [projectResourceAttachments, setProjectResourceAttachments] = useState(/** @type {AppAttachment[]} */ ([]));
  const [projectResourceAttachmentUploading, setProjectResourceAttachmentUploading] = useState(false);
  const [projectResourceAttachmentDeleting, setProjectResourceAttachmentDeleting] = useState(false);
  const [projectResourceAttachmentDownloadingId, setProjectResourceAttachmentDownloadingId] = useState(/** @type {number | null} */ (null));
  const [projectResourceAttachmentDeleteTarget, setProjectResourceAttachmentDeleteTarget] = useState(/** @type {AppAttachment | null} */ (null));
  const [projectResourceAttachmentStatus, setProjectResourceAttachmentStatus] = useState('');
  const [projectResourceAttachmentReveal, setProjectResourceAttachmentReveal] = useState(/** @type {{ attachmentId: number, capability: import('@yuance/frontend-platform-contract').RevealDownloadCapability } | null} */ (null));
  const [projectAttachmentUploading, setProjectAttachmentUploading] = useState(false);
  const [projectAttachmentArchiving, setProjectAttachmentArchiving] = useState(false);
  const [projectAttachmentDownloadingId, setProjectAttachmentDownloadingId] = useState(/** @type {number | null} */ (null));
  const [projectAttachmentArchiveTarget, setProjectAttachmentArchiveTarget] = useState(/** @type {AppAttachment | null} */ (null));
  const [projectAttachmentStatus, setProjectAttachmentStatus] = useState('');
  const [projectAttachmentError, setProjectAttachmentError] = useState('');
  const [projectAttachmentReveal, setProjectAttachmentReveal] = useState(/** @type {{ attachmentId: number, capability: import('@yuance/frontend-platform-contract').RevealDownloadCapability } | null} */ (null));
  const [projectAttachmentPreview, setProjectAttachmentPreview] = useState(/** @type {{ open: boolean, loading: boolean, error: string, attachment: AppAttachment | null, source: string, kind: AppPreviewKind, fileType: string | null, position: number, total: number, previousId: number | null, nextId: number | null } | null} */ (null));
  const [projectCycleDetail, setProjectCycleDetail] = useState(/** @type {AppProjectCycle | null} */ (null));
  const [projectCycleOpen, setProjectCycleOpen] = useState(false);
  const [projectCycleForm, setProjectCycleForm] = useState({ id: 0, name: '', goal: '', description: '', ownerUsername: '', startDate: '', endDate: '' });
  const [projectCycleCloseTarget, setProjectCycleCloseTarget] = useState(/** @type {AppProjectCycle | null} */ (null));
  const [previousPath, setPreviousPath] = useState('');
  const [projectMutationSubmitting, setProjectMutationSubmitting] = useState(false);
  const [projectMutationError, setProjectMutationError] = useState('');
  const [projectEditOpen, setProjectEditOpen] = useState(false);
  const [projectEditForm, setProjectEditForm] = useState({ name: '', description: '', status: 'not_started', ownerUsername: '', startDate: '', dueDate: '' });
  const [projectMemberOpen, setProjectMemberOpen] = useState(false);
  const [projectMemberForm, setProjectMemberForm] = useState({ username: '', memberRole: 'member' });
  const [projectMemberTarget, setProjectMemberTarget] = useState(/** @type {AppProjectMember | null} */ (null));
  const [projectMemberRemoveTarget, setProjectMemberRemoveTarget] = useState(/** @type {AppProjectMember | null} */ (null));
  const [projectSwitchingKey, setProjectSwitchingKey] = useState('');
  const [projectCreateOpen, setProjectCreateOpen] = useState(false);
  const [projectCreateSubmitting, setProjectCreateSubmitting] = useState(false);
  const [projectCreateError, setProjectCreateError] = useState('');
  const [projectCreateForm, setProjectCreateForm] = useState({ name: '', description: '', status: 'not_started', startDate: '', dueDate: '' });
  const [profile, setProfile] = useState(/** @type {Awaited<ReturnType<AppApiService['getOwnProfile']>> | null} */ (null));
  const [profileForm, setProfileForm] = useState({ displayName: '', email: '', mobile: '' });
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [apiTokens, setApiTokens] = useState(/** @type {any[]} */ ([]));
  const [deviceSessions, setDeviceSessions] = useState(/** @type {any[]} */ ([]));
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', newPasswordConfirm: '' });
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [tokenForm, setTokenForm] = useState({ id: 0, name: '', scopes: ['project:read'], projectScope: 'all', expiresAt: '' });
  const [accountSecuritySubmitting, setAccountSecuritySubmitting] = useState(false);
  const [accountSecurityError, setAccountSecurityError] = useState('');
  const [createdRawToken, setCreatedRawToken] = useState('');
  const [accountConfirmation, setAccountConfirmation] = useState(/** @type {{ kind: 'token' | 'device', id: string | number, label: string } | null} */ (null));
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
  const projectDetailRoute = route.id === 'project-detail' ? route : null;
  const projectResourceDetailRoute = route.id === 'project-resource-detail' ? route : null;
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
  const projectScopeKey = projectDetailRoute?.projectKey || projectResourceDetailRoute?.projectKey || '';
  const activeProjectDetail = projectScopeKey && projectDetail?.key === projectScopeKey ? projectDetail : null;
  const currentProjectMember = user ? projectMembers.find((member) => member.username === user.username) : null;
  const canManageProject = Boolean(user?.is_super_admin || ['owner', 'maintainer'].includes(currentProjectMember?.member_role || ''));
  const cyclePace = projectCycleDetail ? projectCyclePace(projectCycleDetail) : null;
  const cycleMemberLoad = projectCycleDetail ? projectCycleMemberLoad(projectCycleDetail, projectMembers) : [];
  const cycleFallbackPath = buildProjectDetailPath({ owner: route.owner, projectKey: route.projectKey, tab: 'cycles' });
  const cycleBackPath = previousPath && previousPath !== router.currentPath()
    ? previousPath
    : cycleFallbackPath;
  const resourceFallbackPath = buildProjectDetailPath({ owner: route.owner, projectKey: projectScopeKey, tab: 'resources' });
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
      void releaseProjectAttachmentPreview();
      setLoading(true);
      if (targetRoute.id === 'search') {
        setSearchPage(null);
      }
      if (targetRoute.id === 'project-detail') {
        projectResourceActionRef.current += 1;
        projectAttachmentActionRef.current += 1;
        projectAttachmentMutationRef.current = false;
        projectResourceAttachmentActionRef.current += 1;
        projectResourceAttachmentMutationRef.current = false;
        setProjectDetail(null);
        setProjectMembers([]);
        setProjectMutationSubmitting(projectMutationRef.current);
        setProjectMutationError('');
        setProjectEditOpen(false);
        setProjectMemberOpen(false);
        setProjectMemberTarget(null);
        setProjectMemberRemoveTarget(null);
        setProjectCycles([]);
        setProjectAttachments([]);
        setProjectResources([]);
        setProjectResourceFilters({ q: '', category: '', status: '', tag: '' });
        setProjectResourceError('');
        setProjectResourceModalOpen(false);
        setProjectResourceArchiveTarget(null);
        setProjectResourceStatus('');
        setProjectResourcePasswordResetOpen(false);
        setProjectResourcePasswordResetForm({ accessPasswordAction: 'set', accessPassword: '' });
        setProjectResourceAttachments([]);
        setProjectResourceAttachmentUploading(false);
        setProjectResourceAttachmentDeleting(false);
        setProjectResourceAttachmentDownloadingId(null);
        setProjectResourceAttachmentDeleteTarget(null);
        setProjectResourceAttachmentStatus('');
        setProjectResourceAttachmentReveal(null);
        setProjectAttachmentUploading(false);
        setProjectAttachmentArchiving(false);
        setProjectAttachmentDownloadingId(null);
        setProjectAttachmentError('');
        setProjectAttachmentStatus('');
        setProjectAttachmentArchiveTarget(null);
        setProjectAttachmentReveal(null);
        setProjectCycleOpen(false);
        setProjectCycleCloseTarget(null);
      }
      if (targetRoute.id === 'project-resource-detail') {
        projectResourceActionRef.current += 1;
        setProjectDetail(null);
        setProjectMembers([]);
        setProjectResourceDetail(null);
        setProjectResourceLocked(false);
        setProjectResourcePassword('');
        setProjectResourceUnlocking(false);
        setProjectResourceError('');
        setProjectResourceModalOpen(false);
        setProjectResourceArchiveTarget(null);
        setProjectResourceStatus('');
        setProjectResourcePasswordResetOpen(false);
        setProjectResourcePasswordResetForm({ accessPasswordAction: 'set', accessPassword: '' });
      }
      if (targetRoute.id === 'project-cycle-detail') {
        setProjectMutationSubmitting(projectMutationRef.current);
        setProjectCycleDetail(null);
        setProjectMembers([]);
        setProjectMutationError('');
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
      const [nextUser, nextTopbar, nextProfile, nextFeed, nextProjects, nextSearch, nextWorkItems, nextWorkItemBundle, nextSecurity, nextProjectBundle, nextCycleDetailBundle, nextResourceDetailBundle] = await Promise.all([
        api.getCurrentUser(),
        api.getTopbarStatus(),
        targetRoute.id === 'profile' ? api.getOwnProfile() : Promise.resolve(null),
        targetRoute.id === 'projects' || targetRoute.id === 'project-detail' || targetRoute.id === 'project-cycle-detail' || targetRoute.id === 'project-resource-detail' || targetRoute.id === 'search' || targetRoute.id === 'profile' || isWorkItemListRouteId(targetRoute.id) || targetRoute.id === 'work-item-detail'
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
        targetRoute.id === 'profile'
          ? Promise.all([api.getApiTokens(), api.getDeviceSessions()])
          : Promise.resolve(null),
        targetRoute.id === 'project-detail'
          ? Promise.all([
            api.getProject(targetRoute.projectKey),
            api.getProjectMembers(targetRoute.projectKey),
            api.getProjectCycles(targetRoute.projectKey),
            api.getProjectAttachments(targetRoute.projectKey).then(
              (value) => ({ value, error: null }),
              (error) => ({ value: [], error }),
            ),
            targetRoute.tab === 'resources'
              ? api.getProjectResources(targetRoute.projectKey, mode === 'load' ? {} : projectResourceFilters)
              : Promise.resolve([]),
          ])
          : Promise.resolve(null),
        targetRoute.id === 'project-cycle-detail'
          ? Promise.all([api.getProjectCycle(targetRoute.projectKey, targetRoute.cycleId), api.getProjectMembers(targetRoute.projectKey)])
          : Promise.resolve(null),
        targetRoute.id === 'project-resource-detail'
          ? (async () => {
            const [project, members, resources] = await Promise.all([
              api.getProject(targetRoute.projectKey),
              api.getProjectMembers(targetRoute.projectKey),
              api.getProjectResources(targetRoute.projectKey),
            ]);
            const summary = resources.find((resource) => resource.id === targetRoute.resourceId) || null;
            if (!summary) {
              const resource = await api.getProjectResource(targetRoute.projectKey, targetRoute.resourceId);
              return { project, members, resource, locked: false, attachments: await api.getProjectResourceAttachments(targetRoute.projectKey, targetRoute.resourceId) };
            }
            const locked = summary.is_protected;
            const resource = locked ? summary : await api.getProjectResource(targetRoute.projectKey, targetRoute.resourceId);
            return {
              project,
              members,
              resource,
              locked,
              attachments: locked ? [] : await api.getProjectResourceAttachments(targetRoute.projectKey, targetRoute.resourceId),
            };
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
        setApiTokens(nextSecurity?.[0] || []);
        setDeviceSessions(nextSecurity?.[1] || []);
      }
      if (targetRoute.id === 'messages') {
        setMessageFeed(nextFeed);
      } else if (targetRoute.id === 'home') {
        setHomeFeed(nextFeed);
      }
      if (targetRoute.id === 'projects') {
        setProjectPage(nextProjects);
      }
      if (targetRoute.id === 'project-detail') {
        setProjectDetail(nextProjectBundle?.[0] || null);
        setProjectMembers(nextProjectBundle?.[1] || []);
        setProjectCycles(nextProjectBundle?.[2] || []);
        setProjectAttachments(nextProjectBundle?.[3]?.value || []);
        if (nextProjectBundle?.[3]?.error) setProjectAttachmentError('项目文件暂时无法加载，请刷新后重试。');
        setProjectResources(nextProjectBundle?.[4] || []);
      }
      if (targetRoute.id === 'project-cycle-detail') {
        setProjectCycleDetail(nextCycleDetailBundle?.[0] || null);
        setProjectMembers(nextCycleDetailBundle?.[1] || []);
      }
      if (targetRoute.id === 'project-resource-detail') {
        setProjectDetail(nextResourceDetailBundle?.project || null);
        setProjectMembers(nextResourceDetailBundle?.members || []);
        setProjectResourceDetail(nextResourceDetailBundle?.resource || null);
        setProjectResourceLocked(Boolean(nextResourceDetailBundle?.locked));
        setProjectResourceAttachments(nextResourceDetailBundle?.attachments || []);
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
    if (!replace && path !== router.currentPath()) setPreviousPath(router.currentPath());
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

  async function submitProjectCreate(event) {
    event.preventDefault();
    if (projectCreateSubmitting) return;
    setProjectCreateSubmitting(true); setProjectCreateError('');
    try {
      const created = await api.createProject(projectCreateForm);
      const nextProjects = await api.getProjects({ status: projectRoute?.status, page: 1, perPage: projectRoute?.perPage });
      setProjectPage(nextProjects); setProjectCreateOpen(false);
      setProjectCreateForm({ name: '', description: '', status: 'not_started', startDate: '', dueDate: '' });
      setStatusMessage(`项目 ${created.key} 已创建。`);
    } catch (caught) {
      setProjectCreateError(errorMessage(caught instanceof Error ? caught : new Error('项目创建失败。')));
    } finally { setProjectCreateSubmitting(false); }
  }

  function openProjectEdit() {
    if (!activeProjectDetail) return;
    setProjectMutationError('');
    setProjectEditForm({
      name: activeProjectDetail.name,
      description: activeProjectDetail.description,
      status: activeProjectDetail.status,
      ownerUsername: activeProjectDetail.owner_username,
      startDate: activeProjectDetail.start_date,
      dueDate: activeProjectDetail.due_date,
    });
    setProjectEditOpen(true);
  }

  /** @param {() => Promise<any>} action @param {string} successMessage */
  async function runProjectMutation(action, successMessage) {
    if (!projectDetailRoute || projectMutationRef.current) return false;
    const projectKey = projectDetailRoute.projectKey;
    projectMutationRef.current = true;
    setProjectMutationSubmitting(true);
    setProjectMutationError('');
    try {
      await action();
      const [detail, members, nextTopbar] = await Promise.all([
        api.getProject(projectKey), api.getProjectMembers(projectKey), api.getTopbarStatus(),
      ]);
      if (routeRef.current.id !== 'project-detail' || routeRef.current.projectKey !== projectKey) return false;
      setProjectDetail(detail); setProjectMembers(members); setTopbar(nextTopbar); setStatusMessage(successMessage);
      return true;
    } catch (caught) {
      if (routeRef.current.id === 'project-detail' && routeRef.current.projectKey === projectKey) {
        setProjectMutationError(errorMessage(caught instanceof Error ? caught : new Error('项目操作失败。')));
      }
      throw caught;
    } finally {
      projectMutationRef.current = false; setProjectMutationSubmitting(false);
    }
  }

  async function submitProjectEdit(event) {
    event.preventDefault();
    if (!activeProjectDetail) return;
    try {
      if (await runProjectMutation(() => api.updateProject(activeProjectDetail.key, projectEditForm), '项目资料已更新。')) setProjectEditOpen(false);
    } catch { return; }
  }

  async function submitProjectMember(event) {
    event.preventDefault();
    if (!activeProjectDetail) return;
    try {
      if (await runProjectMutation(() => api.addProjectMember(activeProjectDetail.key, projectMemberForm), '项目成员已添加。')) {
        setProjectMemberOpen(false); setProjectMemberForm({ username: '', memberRole: 'member' });
      }
    } catch { return; }
  }

  async function submitProjectMemberRole(event) {
    event.preventDefault();
    if (!activeProjectDetail || !projectMemberTarget) return;
    try {
      if (await runProjectMutation(
        () => api.updateProjectMemberRole(activeProjectDetail.key, projectMemberTarget.username, runtime.readFormValue(event.currentTarget, 'memberRole') || 'member'),
        '成员角色已更新。',
      )) setProjectMemberTarget(null);
    } catch { return; }
  }

  async function confirmProjectMemberRemove() {
    if (!activeProjectDetail || !projectMemberRemoveTarget) return;
    try {
      if (await runProjectMutation(
        () => api.removeProjectMember(activeProjectDetail.key, projectMemberRemoveTarget.username),
        '项目成员已移除。',
      )) setProjectMemberRemoveTarget(null);
    } catch { return; }
  }

  /** @param {AppProjectCycle | null} [cycle] */
  function openProjectCycle(cycle = null) {
    setProjectMutationError('');
    setProjectCycleForm(cycle ? {
      id: cycle.id, name: cycle.name, goal: cycle.goal, description: cycle.description,
      ownerUsername: cycle.owner_username, startDate: cycle.start_date, endDate: cycle.end_date,
    } : { id: 0, name: '', goal: '', description: '', ownerUsername: '', startDate: '', endDate: '' });
    setProjectCycleOpen(true);
  }

  async function runCycleMutation(action, successMessage) {
    const current = routeRef.current;
    if (!['project-detail', 'project-cycle-detail'].includes(current.id) || projectMutationRef.current) return false;
    const projectKey = current.projectKey;
    projectMutationRef.current = true; setProjectMutationSubmitting(true); setProjectMutationError('');
    try {
      await action();
      if (current.id === 'project-cycle-detail') {
        const cycle = await api.getProjectCycle(projectKey, current.cycleId);
        if (routeRef.current.id !== current.id || routeRef.current.projectKey !== projectKey || routeRef.current.cycleId !== current.cycleId) return false;
        setProjectCycleDetail(cycle);
      } else {
        const cycles = await api.getProjectCycles(projectKey);
        if (routeRef.current.id !== current.id || routeRef.current.projectKey !== projectKey) return false;
        setProjectCycles(cycles);
      }
      setStatusMessage(successMessage); return true;
    } catch (caught) {
      if (routeRef.current.id === current.id && routeRef.current.projectKey === projectKey) setProjectMutationError(errorMessage(caught instanceof Error ? caught : new Error('周期操作失败。')));
      throw caught;
    } finally { projectMutationRef.current = false; setProjectMutationSubmitting(false); }
  }

  async function submitProjectCycle(event) {
    event.preventDefault();
    const projectKey = routeRef.current.projectKey;
    if (!projectKey) return;
    try {
      const action = projectCycleForm.id
        ? () => api.updateProjectCycle(projectKey, projectCycleForm.id, projectCycleForm)
        : () => api.createProjectCycle(projectKey, projectCycleForm);
      if (await runCycleMutation(action, projectCycleForm.id ? '项目周期已更新。' : '项目周期已创建。')) setProjectCycleOpen(false);
    } catch { return; }
  }

  async function confirmProjectCycleClose() {
    if (!projectCycleCloseTarget) return;
    const projectKey = routeRef.current.projectKey;
    try {
      if (await runCycleMutation(() => api.closeProjectCycle(projectKey, projectCycleCloseTarget.id), '项目周期已关闭。')) setProjectCycleCloseTarget(null);
    } catch { return; }
  }

  function isCurrentProjectAttachmentRoute(projectKey, actionId = projectAttachmentActionRef.current) {
    return routeRef.current.id === 'project-detail' && routeRef.current.projectKey === projectKey && projectAttachmentActionRef.current === actionId;
  }

  async function refreshProjectAttachments(projectKey, actionId) {
    const attachments = await api.getProjectAttachments(projectKey);
    if (isCurrentProjectAttachmentRoute(projectKey, actionId)) setProjectAttachments(attachments);
    return attachments;
  }

  function clearProjectAttachmentUpload(actionId) {
    if (projectAttachmentActionRef.current !== actionId) return;
    projectAttachmentMutationRef.current = false;
    setProjectAttachmentUploading(false);
  }

  /** @param {AppAttachment | null} [existingAttachment] */
  async function uploadSelectedProjectAttachment(existingAttachment = null) {
    if (!activeProjectDetail || projectAttachmentMutationRef.current || projectMutationRef.current) return;
    const projectKey = activeProjectDetail.key;
    const actionId = projectAttachmentActionRef.current + 1;
    projectAttachmentActionRef.current = actionId; projectAttachmentMutationRef.current = true;
    setProjectAttachmentUploading(true); setProjectAttachmentError(''); setProjectAttachmentStatus('正在选择项目文件。');
    let file;
    try { file = await files.files.chooseFile(); }
    catch (caught) {
      if (isCurrentProjectAttachmentRoute(projectKey, actionId)) setProjectAttachmentError(errorMessage(caught instanceof Error ? caught : new Error('选择文件失败。')));
      clearProjectAttachmentUpload(actionId); return;
    }
    if (!isCurrentProjectAttachmentRoute(projectKey, actionId) || !file) {
      if (isCurrentProjectAttachmentRoute(projectKey, actionId)) setProjectAttachmentStatus('已取消选择文件。');
      clearProjectAttachmentUpload(actionId); return;
    }
    if (!file.byteSize || file.byteSize <= 0) {
      setProjectAttachmentError('请选择非空文件。'); setProjectAttachmentStatus(`${file.filename || '文件'} 未上传。`);
      clearProjectAttachmentUpload(actionId); return;
    }
    const filename = file.filename || 'attachment.bin';
    if (existingAttachment && (filename !== existingAttachment.filename || file.contentType !== existingAttachment.content_type || file.byteSize !== existingAttachment.byte_size)) {
      setProjectAttachmentError(`请选择与 ${existingAttachment.filename} 名称、类型和大小一致的原文件。`);
      setProjectAttachmentStatus(`${existingAttachment.filename} 未继续上传。`);
      clearProjectAttachmentUpload(actionId); return;
    }
    let createdAttachment = /** @type {AppAttachment | null} */ (null);
    let stage = /** @type {'registering' | 'signing' | 'uploading' | 'confirming'} */ (existingAttachment ? 'signing' : 'registering');
    try {
      const result = await uploadProjectAttachment({ api, platform: files, projectKey, file, existingAttachment, lifecycle: {
        isCurrent: () => isCurrentProjectAttachmentRoute(projectKey, actionId),
        onStage: (nextStage) => { stage = nextStage; setProjectAttachmentStatus({ registering: `${filename} 正在登记。`, signing: `${filename} 正在获取上传签名。`, uploading: `${filename} 正在上传。`, confirming: `${filename} 正在确认上传结果。` }[nextStage]); },
        onCreated: (created) => { createdAttachment = created; setProjectAttachments((current) => upsertAttachment(current, created)); },
        onUploaded: (uploaded) => setProjectAttachments((current) => upsertAttachment(current, uploaded)),
        refresh: async () => { await refreshProjectAttachments(projectKey, actionId); },
      } });
      if (result.completed) { setProjectAttachmentStatus(`${filename} 上传完成。`); setStatusMessage(`${projectKey} 项目文件已上传。`); if (result.refreshError) setProjectAttachmentError('文件已上传，但列表刷新失败，请手动刷新。'); }
    } catch (caught) {
      if (isCurrentProjectAttachmentRoute(projectKey, actionId)) {
        if (stage === 'confirming') setProjectAttachmentError(`${filename} 已上传，但确认失败，请刷新后检查。`);
        else { if (createdAttachment) setProjectAttachments((current) => upsertAttachment(current, /** @type {AppAttachment} */ ({ ...createdAttachment, status: 'failed' }))); setProjectAttachmentError(errorMessage(caught instanceof Error ? caught : new Error('上传项目文件失败。'))); }
      }
    } finally {
      clearProjectAttachmentUpload(actionId);
    }
  }

  async function downloadProjectAttachment(attachment) {
    if (!activeProjectDetail || !attachmentIsUploaded(attachment)) return;
    const projectKey = activeProjectDetail.key; setProjectAttachmentDownloadingId(attachment.id); setProjectAttachmentReveal(null); setProjectAttachmentError('');
    try {
      const result = await downloadProjectAttachmentUseCase({ api, platform: files, projectKey, attachmentId: attachment.id, suggestedFilename: attachment.filename, isCurrent: () => isCurrentProjectAttachmentRoute(projectKey) });
      if (result.completed) { setProjectAttachmentReveal(result.revealCapability ? { attachmentId: attachment.id, capability: result.revealCapability } : null); setProjectAttachmentStatus(`${attachment.filename} 下载完成。`); }
    } catch (caught) { if (isCurrentProjectAttachmentRoute(projectKey)) setProjectAttachmentError(errorMessage(caught instanceof Error ? caught : new Error('下载项目文件失败。'))); }
    finally { setProjectAttachmentDownloadingId((current) => current === attachment.id ? null : current); }
  }

  async function revealProjectAttachment(attachment) {
    const reveal = projectAttachmentReveal;
    if (!reveal || reveal.attachmentId !== attachment.id || typeof files.attachments?.revealDownload !== 'function') return;
    setProjectAttachmentReveal(null); setProjectAttachmentDownloadingId(attachment.id);
    try { await files.attachments.revealDownload(reveal.capability); setProjectAttachmentStatus(`${attachment.filename} 已在文件夹中定位。`); }
    catch (caught) { setProjectAttachmentError(errorMessage(caught instanceof Error ? caught : new Error('定位项目文件失败。'))); }
    finally { setProjectAttachmentDownloadingId(null); }
  }

  async function releaseProjectAttachmentPreview() {
    projectAttachmentPreviewRequestRef.current += 1;
    const capability = projectAttachmentPreviewCapabilityRef.current;
    projectAttachmentPreviewCapabilityRef.current = '';
    setProjectAttachmentPreview(null);
    if (capability && typeof files.attachments?.releaseProjectAttachmentPreview === 'function') {
      try { await files.attachments.releaseProjectAttachmentPreview(capability); } catch { /* Capability cleanup is best-effort after host invalidation. */ }
    }
  }

  async function openProjectAttachmentPreview(attachment) {
    if (!activeProjectDetail || !attachmentIsUploaded(attachment)) return;
    const projectKey = activeProjectDetail.key;
    const requestId = projectAttachmentPreviewRequestRef.current + 1;
    projectAttachmentPreviewRequestRef.current = requestId;
    const previousCapability = projectAttachmentPreviewCapabilityRef.current;
    projectAttachmentPreviewCapabilityRef.current = '';
    if (previousCapability && typeof files.attachments?.releaseProjectAttachmentPreview === 'function') void files.attachments.releaseProjectAttachmentPreview(previousCapability).catch(() => {});
    setProjectAttachmentPreview({ open: true, loading: true, error: '', attachment, source: '', kind: null, fileType: null, position: 0, total: 0, previousId: null, nextId: null });
    try {
      /** @type {{ capability: string, source: string, attachment: AppAttachment, preview: any, navigation: any }} */
      let result;
      if (typeof files.attachments?.openProjectAttachmentPreview === 'function') {
        const hostResult = await files.attachments.openProjectAttachmentPreview({ projectKey, attachmentId: attachment.id });
        result = { capability: hostResult.capability, source: hostResult.source, attachment: hostResult.attachment, preview: hostResult.preview, navigation: hostResult.navigation };
      } else {
        const browserResult = await api.getProjectAttachmentPreview(projectKey, attachment.id);
        result = { capability: '', source: browserResult.content_url, attachment: browserResult.attachment, preview: browserResult.preview, navigation: browserResult.navigation };
      }
      if (projectAttachmentPreviewRequestRef.current !== requestId || !isCurrentProjectAttachmentRoute(projectKey)) {
        if (result.capability && typeof files.attachments?.releaseProjectAttachmentPreview === 'function') void files.attachments.releaseProjectAttachmentPreview(result.capability).catch(() => {});
        return;
      }
      projectAttachmentPreviewCapabilityRef.current = result.capability || '';
      setProjectAttachmentPreview({ open: true, loading: false, error: '', attachment: result.attachment, source: result.source, kind: result.preview.kind, fileType: result.preview.file_type, position: result.navigation.position, total: result.navigation.total, previousId: result.navigation.previous?.id || null, nextId: result.navigation.next?.id || null });
    } catch (caught) {
      if (projectAttachmentPreviewRequestRef.current === requestId && isCurrentProjectAttachmentRoute(projectKey)) setProjectAttachmentPreview((current) => current ? { ...current, loading: false, error: errorMessage(caught instanceof Error ? caught : new Error('预览加载失败。')) } : current);
    }
  }

  function navigateProjectAttachmentPreview(attachmentId) {
    const attachment = projectAttachments.find((value) => value.id === attachmentId);
    if (attachment) void openProjectAttachmentPreview(attachment);
  }

  async function openProjectResourceAttachmentPreview(attachment) {
    const current = routeRef.current;
    if (current.id !== 'project-resource-detail' || !projectResourceDetail || projectResourceLocked || !attachmentIsUploaded(attachment)) return;
    const projectKey = String(current.projectKey || '');
    const resourceId = Number(current.resourceId);
    const accessToken = projectResourceDetail.access_token || '';
    const requestId = projectAttachmentPreviewRequestRef.current + 1;
    projectAttachmentPreviewRequestRef.current = requestId;
    const previousCapability = projectAttachmentPreviewCapabilityRef.current;
    projectAttachmentPreviewCapabilityRef.current = '';
    if (previousCapability && typeof files.attachments?.releaseProjectAttachmentPreview === 'function') void files.attachments.releaseProjectAttachmentPreview(previousCapability).catch(() => {});
    setProjectAttachmentPreview({ open: true, loading: true, error: '', attachment, source: '', kind: null, fileType: null, position: 0, total: 0, previousId: null, nextId: null });
    try {
      /** @type {{ capability: string, source: string, attachment: AppAttachment, preview: any, navigation: any }} */
      let result;
      if (typeof files.attachments?.openProjectResourceAttachmentPreview === 'function') {
        const hostResult = await files.attachments.openProjectResourceAttachmentPreview({ projectKey, resourceId, attachmentId: attachment.id, accessToken });
        result = { capability: hostResult.capability, source: hostResult.source, attachment: hostResult.attachment, preview: hostResult.preview, navigation: hostResult.navigation };
      } else {
        const browserResult = await api.getProjectResourceAttachmentPreview(projectKey, resourceId, attachment.id, accessToken);
        result = { capability: '', source: browserResult.content_url, attachment: browserResult.attachment, preview: browserResult.preview, navigation: browserResult.navigation };
      }
      if (projectAttachmentPreviewRequestRef.current !== requestId || !isCurrentProjectResourceAttachmentRoute(projectKey, resourceId)) {
        if (result.capability && typeof files.attachments?.releaseProjectAttachmentPreview === 'function') void files.attachments.releaseProjectAttachmentPreview(result.capability).catch(() => {});
        return;
      }
      projectAttachmentPreviewCapabilityRef.current = result.capability || '';
      setProjectAttachmentPreview({ open: true, loading: false, error: '', attachment: result.attachment, source: result.source, kind: result.preview.kind, fileType: result.preview.file_type, position: result.navigation.position, total: result.navigation.total, previousId: result.navigation.previous?.id || null, nextId: result.navigation.next?.id || null });
    } catch (caught) {
      if (projectAttachmentPreviewRequestRef.current === requestId && isCurrentProjectResourceAttachmentRoute(projectKey, resourceId)) setProjectAttachmentPreview((value) => value ? { ...value, loading: false, error: errorMessage(caught instanceof Error ? caught : new Error('预览加载失败。')) } : value);
    }
  }

  function navigateProjectResourceAttachmentPreview(attachmentId) {
    const attachment = projectResourceAttachments.find((value) => value.id === attachmentId);
    if (attachment) void openProjectResourceAttachmentPreview(attachment);
  }

  function activateProjectResourceInlineAttachment(attachmentId) {
    const attachment = projectResourceAttachments.find((value) => value.id === attachmentId);
    if (attachment && attachmentIsUploaded(attachment)) void openProjectResourceAttachmentPreview(attachment);
  }

  async function resolveProjectResourceInlineAttachmentSource(attachmentId) {
    const current = routeRef.current;
    const attachmentPlatform = files.attachments;
    if (current.id !== 'project-resource-detail' || !projectResourceDetail || typeof attachmentPlatform?.openProjectResourceAttachmentPreview !== 'function' || typeof attachmentPlatform.releaseProjectAttachmentPreview !== 'function') throw new Error('inline preview unavailable');
    const result = await attachmentPlatform.openProjectResourceAttachmentPreview({ projectKey: String(current.projectKey || ''), resourceId: current.resourceId, attachmentId, accessToken: String(projectResourceDetail.access_token || '') });
    return { source: result.source, release: async () => { await attachmentPlatform.releaseProjectAttachmentPreview(result.capability); } };
  }

  async function confirmProjectAttachmentArchive() {
    if (!activeProjectDetail || !projectAttachmentArchiveTarget || projectAttachmentMutationRef.current) return;
    const projectKey = activeProjectDetail.key; const target = projectAttachmentArchiveTarget;
    const actionId = projectAttachmentActionRef.current + 1; projectAttachmentActionRef.current = actionId; projectAttachmentMutationRef.current = true; setProjectAttachmentArchiving(true); setProjectAttachmentError('');
    try { await api.archiveProjectAttachment(projectKey, target.id); await refreshProjectAttachments(projectKey, actionId); if (isCurrentProjectAttachmentRoute(projectKey, actionId)) { setProjectAttachmentArchiveTarget(null); setProjectAttachmentStatus(`${target.filename} 已归档。`); } }
    catch (caught) { if (isCurrentProjectAttachmentRoute(projectKey, actionId)) setProjectAttachmentError(errorMessage(caught instanceof Error ? caught : new Error('归档项目文件失败。'))); }
    finally { if (projectAttachmentActionRef.current === actionId) { projectAttachmentMutationRef.current = false; setProjectAttachmentArchiving(false); } }
  }

  /** @param {() => Promise<any>} action @param {string} successMessage */
  async function runAccountSecurity(action, successMessage) {
    if (accountSecurityActionRef.current) return;
    accountSecurityActionRef.current = true;
    setAccountSecuritySubmitting(true);
    setAccountSecurityError('');
    try {
      const result = await action();
      const [tokens, sessions] = await Promise.all([api.getApiTokens(), api.getDeviceSessions()]);
      setApiTokens(tokens); setDeviceSessions(sessions); setStatusMessage(successMessage);
      return result;
    } catch (caught) {
      setAccountSecurityError(errorMessage(caught instanceof Error ? caught : new Error('操作失败。')));
      throw caught;
    } finally {
      accountSecurityActionRef.current = false; setAccountSecuritySubmitting(false);
    }
  }

  async function submitPassword(event) {
    event.preventDefault();
    try { await runAccountSecurity(() => api.updateOwnPassword(passwordForm), '密码已更新，其他登录会话已撤销。'); setPasswordModalOpen(false); setPasswordForm({ currentPassword: '', newPassword: '', newPasswordConfirm: '' }); } catch { return; }
  }

  async function submitToken(event) {
    event.preventDefault();
    try {
      if (tokenForm.id) await runAccountSecurity(() => api.updateApiToken(tokenForm.id, tokenForm), '访问 Token 已更新。');
      else {
        const created = await runAccountSecurity(() => api.createApiToken(tokenForm), '访问 Token 已创建。');
        setCreatedRawToken(created?.raw_token || '');
      }
      setTokenModalOpen(false);
    } catch { return; }
  }

  async function submitProjectResourceFilters(event) {
    event.preventDefault();
    if (!projectDetailRoute) return;
    await loadFilteredProjectResources(projectResourceFilters);
  }

  async function resetProjectResourceFilters() {
    const filters = { q: '', category: '', status: '', tag: '' };
    setProjectResourceFilters(filters);
    await loadFilteredProjectResources(filters);
  }

  async function loadFilteredProjectResources(filters) {
    if (!projectDetailRoute) return;
    const projectKey = projectDetailRoute.projectKey;
    const actionId = projectResourceActionRef.current + 1;
    projectResourceActionRef.current = actionId;
    setProjectResourceError('');
    try {
      const resources = await api.getProjectResources(projectKey, filters);
      const currentRoute = routeRef.current;
      if (projectResourceActionRef.current !== actionId || currentRoute.id !== 'project-detail' || currentRoute.projectKey !== projectKey || currentRoute.tab !== 'resources') return;
      setProjectResources(resources);
    } catch (caught) {
      const currentRoute = routeRef.current;
      if (projectResourceActionRef.current !== actionId || currentRoute.id !== 'project-detail' || currentRoute.projectKey !== projectKey || currentRoute.tab !== 'resources') return;
      setProjectResourceError(errorMessage(caught instanceof Error ? caught : new Error('资料列表加载失败。')));
    }
  }

  async function submitProjectResourceUnlock(event) {
    event.preventDefault();
    if (!projectResourceDetailRoute || projectResourceUnlocking || !projectResourcePassword) return;
    const projectKey = projectResourceDetailRoute.projectKey;
    const resourceId = projectResourceDetailRoute.resourceId;
    const actionId = projectResourceActionRef.current + 1;
    projectResourceActionRef.current = actionId;
    setProjectResourceUnlocking(true);
    setProjectResourceError('');
    const isCurrentResource = () => {
      const currentRoute = routeRef.current;
      return projectResourceActionRef.current === actionId
        && currentRoute.id === 'project-resource-detail'
        && currentRoute.projectKey === projectKey
        && currentRoute.resourceId === resourceId;
    };
    try {
      const resource = await api.unlockProjectResource(projectKey, resourceId, projectResourcePassword);
      const attachments = await api.getProjectResourceAttachments(projectKey, resourceId, resource.access_token);
      if (!isCurrentResource()) return;
      setProjectResourceDetail(resource);
      setProjectResourceAttachments(attachments);
      setProjectResourceLocked(false);
      setProjectResourcePassword('');
      setStatusMessage('资料已解锁。');
    } catch (caught) {
      if (!isCurrentResource()) return;
      setProjectResourceError(errorMessage(caught instanceof Error ? caught : new Error('资料解锁失败。')));
    } finally {
      if (isCurrentResource()) setProjectResourceUnlocking(false);
    }
  }

  /** @param {AppProjectResource | null} [resource] */
  function openProjectResourceForm(resource = null) {
    if (resource?.is_protected && projectResourceLocked) return;
    setProjectResourceError('');
    setProjectResourceForm(resource ? {
      id: resource.id,
      title: resource.title,
      category: resource.category || 'other',
      body: resource.body_format === 'html' ? resource.body : plainTextToRichHtml(resource.body),
      bodyFormat: 'html',
      accessPasswordAction: 'keep',
      accessPassword: '',
      tagsText: resource.tags.join('，'),
      relatedWorkItemKey: resource.related_work_item?.key || '',
      relatedCycleId: resource.related_cycle ? String(resource.related_cycle.id) : '',
    } : { id: 0, title: '', category: 'other', body: '', bodyFormat: 'html', accessPasswordAction: 'keep', accessPassword: '', tagsText: '', relatedWorkItemKey: '', relatedCycleId: '' });
    setProjectResourceInitialInlineAttachmentIds(resource ? richTextAttachmentIds(resource.body) : []);
    setProjectResourceModalOpen(true);
  }

  function projectResourceRichAttachmentOptions() {
    const current = routeRef.current;
    if (current.id !== 'project-resource-detail') return [];
    return projectResourceAttachments.filter(attachmentIsUploaded).map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      contentType: attachment.content_type,
      url: `/web/projects/${current.projectKey}/resources/${current.resourceId}/attachments/${attachment.id}/download`,
    }));
  }

  function projectResourcePayload() {
    return {
      title: projectResourceForm.title,
      category: projectResourceForm.category,
      body: projectResourceForm.body,
      bodyFormat: projectResourceForm.bodyFormat,
      accessPasswordAction: projectResourceForm.accessPasswordAction,
      accessPassword: projectResourceForm.accessPassword,
      tags: projectResourceForm.tagsText.split(/[,，;；]/u).map((tag) => tag.trim()).filter(Boolean),
      relatedWorkItemKey: projectResourceForm.relatedWorkItemKey.trim(),
      relatedCycleId: projectResourceForm.relatedCycleId ? Number(projectResourceForm.relatedCycleId) : null,
    };
  }

  async function submitProjectResource(event) {
    event.preventDefault();
    const current = routeRef.current;
    const editing = projectResourceForm.id > 0;
    if (projectResourceMutationRef.current || (editing && projectResourceAttachmentMutationRef.current) || (editing && current.id !== 'project-resource-detail') || (!editing && (current.id !== 'project-detail' || current.tab !== 'resources'))) return;
    if (!richTextHasContent(projectResourceForm.body)) { setProjectResourceError('资料正文不能为空。'); return; }
    const projectKey = current.projectKey;
    const resourceId = editing ? projectResourceForm.id : 0;
    const actionId = projectResourceActionRef.current + 1;
    projectResourceActionRef.current = actionId;
    projectResourceMutationRef.current = actionId;
    setProjectResourceSubmitting(true);
    setProjectResourceError('');
    const isCurrent = () => {
      const active = routeRef.current;
      return projectResourceActionRef.current === actionId
        && active.projectKey === projectKey
        && (editing ? active.id === 'project-resource-detail' && active.resourceId === resourceId : active.id === 'project-detail' && active.tab === 'resources');
    };
    try {
      const payload = projectResourcePayload();
      const resource = editing
        ? await api.updateProjectResource(projectKey, resourceId, payload)
        : await api.createProjectResource(projectKey, payload);
      if (!isCurrent()) return;
      if (editing) {
        const currentInlineAttachmentIds = new Set(richTextAttachmentIds(payload.body));
        const removedInlineAttachmentIds = projectResourceInitialInlineAttachmentIds.filter((attachmentId) => !currentInlineAttachmentIds.has(attachmentId));
        for (const attachmentId of removedInlineAttachmentIds) {
          try { await api.deleteProjectResourceAttachment(projectKey, resourceId, attachmentId); }
          catch { throw new Error('资料正文已保存，但移除正文附件失败，请重新打开编辑器重试。'); }
        }
        if (!isCurrent()) return;
        setProjectResourceDetail(resource);
        setProjectResourceAttachments((attachments) => attachments.filter((attachment) => !removedInlineAttachmentIds.includes(attachment.id)));
        setProjectResourceInitialInlineAttachmentIds([...currentInlineAttachmentIds]);
        setProjectResourceLocked(false);
        setProjectResourceModalOpen(false);
        setProjectResourceStatus('资料已更新。');
      } else {
        const resources = await api.getProjectResources(projectKey, projectResourceFilters);
        if (!isCurrent()) return;
        setProjectResources(resources);
        setProjectResourceModalOpen(false);
        setProjectResourceStatus(`资料“${resource.title}”已创建。`);
      }
    } catch (caught) {
      if (isCurrent()) setProjectResourceError(errorMessage(caught instanceof Error ? caught : new Error(editing ? '资料更新失败。' : '资料创建失败。')));
    } finally {
      if (projectResourceMutationRef.current === actionId) {
        projectResourceMutationRef.current = 0;
        setProjectResourceSubmitting(false);
      }
    }
  }

  async function confirmProjectResourceArchive() {
    const current = routeRef.current;
    const target = projectResourceArchiveTarget;
    if (!target || current.id !== 'project-resource-detail' || current.resourceId !== target.id || projectResourceMutationRef.current || projectResourceAttachmentMutationRef.current) return;
    const projectKey = current.projectKey;
    const actionId = projectResourceActionRef.current + 1;
    projectResourceActionRef.current = actionId;
    projectResourceMutationRef.current = actionId;
    setProjectResourceSubmitting(true);
    setProjectResourceError('');
    const isCurrent = () => {
      const active = routeRef.current;
      return projectResourceActionRef.current === actionId && active.id === 'project-resource-detail' && active.projectKey === projectKey && active.resourceId === target.id;
    };
    try {
      await api.archiveProjectResource(projectKey, target.id);
      if (!isCurrent()) return;
      setProjectResourceArchiveTarget(null);
      navigate(buildProjectDetailPath({ owner: current.owner, projectKey, tab: 'resources' }), `资料“${target.title}”已归档。`);
    } catch (caught) {
      if (isCurrent()) setProjectResourceError(errorMessage(caught instanceof Error ? caught : new Error('资料归档失败。')));
    } finally {
      if (projectResourceMutationRef.current === actionId) {
        projectResourceMutationRef.current = 0;
        setProjectResourceSubmitting(false);
      }
    }
  }

  async function submitProjectResourcePasswordReset(event) {
    event.preventDefault();
    const current = routeRef.current;
    if (!user?.is_super_admin || !projectResourceDetail || current.id !== 'project-resource-detail' || projectResourceMutationRef.current || projectResourceAttachmentMutationRef.current) return;
    const projectKey = current.projectKey;
    const resourceId = current.resourceId;
    const actionId = projectResourceActionRef.current + 1;
    projectResourceActionRef.current = actionId;
    projectResourceMutationRef.current = actionId;
    setProjectResourceSubmitting(true);
    setProjectResourceError('');
    const isCurrent = () => {
      const active = routeRef.current;
      return projectResourceActionRef.current === actionId && active.id === 'project-resource-detail' && active.projectKey === projectKey && active.resourceId === resourceId;
    };
    try {
      const resource = await api.resetProjectResourcePassword(projectKey, resourceId, projectResourcePasswordResetForm);
      const attachments = resource.is_protected ? [] : await api.getProjectResourceAttachments(projectKey, resourceId);
      if (!isCurrent()) return;
      setProjectResourceDetail(resource);
      setProjectResourceAttachments(attachments);
      setProjectResourceLocked(resource.is_protected);
      setProjectResourcePassword('');
      setProjectResourcePasswordResetOpen(false);
      setProjectResourcePasswordResetForm({ accessPasswordAction: 'set', accessPassword: '' });
      setProjectResourceStatus(resource.is_protected ? '资料访问密码已重置。' : '资料访问密码已清除。');
    } catch (caught) {
      if (isCurrent()) setProjectResourceError(errorMessage(caught instanceof Error ? caught : new Error('资料访问密码重置失败。')));
    } finally {
      if (projectResourceMutationRef.current === actionId) {
        projectResourceMutationRef.current = 0;
        setProjectResourceSubmitting(false);
      }
    }
  }

  function isCurrentProjectResourceAttachmentRoute(projectKey, resourceId, actionId = projectResourceAttachmentActionRef.current) {
    const current = routeRef.current;
    return current.id === 'project-resource-detail' && current.projectKey === projectKey && current.resourceId === resourceId && projectResourceAttachmentActionRef.current === actionId;
  }

  async function refreshProjectResourceAttachments(projectKey, resourceId, accessToken, actionId) {
    const attachments = await api.getProjectResourceAttachments(projectKey, resourceId, accessToken);
    if (isCurrentProjectResourceAttachmentRoute(projectKey, resourceId, actionId)) setProjectResourceAttachments(attachments);
    return attachments;
  }

  function clearProjectResourceAttachmentUpload(actionId) {
    if (projectResourceAttachmentActionRef.current !== actionId) return;
    projectResourceAttachmentMutationRef.current = false;
    setProjectResourceAttachmentUploading(false);
  }

  /** @param {AppAttachment | null} [existingAttachment] */
  async function uploadSelectedProjectResourceAttachment(existingAttachment = null) {
    const current = routeRef.current;
    if (current.id !== 'project-resource-detail' || !projectResourceDetail || projectResourceLocked || projectResourceDetail.status === 'archived' || projectResourceAttachmentMutationRef.current || projectResourceMutationRef.current) return;
    const projectKey = String(current.projectKey || '');
    const resourceId = Number(current.resourceId);
    const actionId = projectResourceAttachmentActionRef.current + 1;
    projectResourceAttachmentActionRef.current = actionId;
    projectResourceAttachmentMutationRef.current = true;
    setProjectResourceAttachmentUploading(true);
    setProjectResourceError('');
    setProjectResourceAttachmentStatus('正在选择资料附件。');
    let file;
    try { file = await files.files.chooseFile(); }
    catch (caught) {
      if (isCurrentProjectResourceAttachmentRoute(projectKey, resourceId, actionId)) setProjectResourceError(errorMessage(caught instanceof Error ? caught : new Error('选择资料附件失败。')));
      clearProjectResourceAttachmentUpload(actionId); return;
    }
    if (!isCurrentProjectResourceAttachmentRoute(projectKey, resourceId, actionId) || !file) {
      if (isCurrentProjectResourceAttachmentRoute(projectKey, resourceId, actionId)) setProjectResourceAttachmentStatus('已取消选择资料附件。');
      clearProjectResourceAttachmentUpload(actionId); return;
    }
    if (!file.byteSize || file.byteSize <= 0) {
      setProjectResourceError('请选择非空文件。'); setProjectResourceAttachmentStatus(`${file.filename || '文件'} 未上传。`);
      clearProjectResourceAttachmentUpload(actionId); return;
    }
    const filename = file.filename || 'attachment.bin';
    if (existingAttachment && (filename !== existingAttachment.filename || file.contentType !== existingAttachment.content_type || file.byteSize !== existingAttachment.byte_size)) {
      setProjectResourceError(`请选择与 ${existingAttachment.filename} 名称、类型和大小一致的原文件。`);
      clearProjectResourceAttachmentUpload(actionId); return;
    }
    let createdAttachment = /** @type {AppAttachment | null} */ (null);
    let stage = /** @type {'registering' | 'signing' | 'uploading' | 'confirming'} */ (existingAttachment ? 'signing' : 'registering');
    try {
      const result = await uploadProjectResourceAttachment({ api, platform: files, projectKey, resourceId, file, existingAttachment, lifecycle: {
        isCurrent: () => isCurrentProjectResourceAttachmentRoute(projectKey, resourceId, actionId),
        onStage: (nextStage) => { stage = nextStage; setProjectResourceAttachmentStatus({ registering: `${filename} 正在登记。`, signing: `${filename} 正在获取上传签名。`, uploading: `${filename} 正在上传。`, confirming: `${filename} 正在确认上传结果。` }[nextStage]); },
        onCreated: (created) => { createdAttachment = created; setProjectResourceAttachments((items) => upsertAttachment(items, created)); },
        onUploaded: (uploaded) => setProjectResourceAttachments((items) => upsertAttachment(items, uploaded)),
        refresh: async () => { await refreshProjectResourceAttachments(projectKey, resourceId, projectResourceDetail.access_token, actionId); },
      } });
      if (result.completed) {
        setProjectResourceAttachmentStatus(`${filename} 上传完成。`);
        if (result.refreshError) setProjectResourceError('附件已上传，但列表刷新失败，请手动刷新。');
      }
    } catch (caught) {
      if (isCurrentProjectResourceAttachmentRoute(projectKey, resourceId, actionId)) {
        if (stage === 'confirming') setProjectResourceError(`${filename} 已上传，但确认失败，请刷新后检查。`);
        else {
          if (createdAttachment) setProjectResourceAttachments((items) => upsertAttachment(items, /** @type {AppAttachment} */ ({ ...createdAttachment, status: 'failed' })));
          setProjectResourceError(errorMessage(caught instanceof Error ? caught : new Error('上传资料附件失败。')));
        }
      }
    } finally { clearProjectResourceAttachmentUpload(actionId); }
  }

  async function downloadProjectResourceAttachment(attachment) {
    const current = routeRef.current;
    if (current.id !== 'project-resource-detail' || !projectResourceDetail || projectResourceLocked || !attachmentIsUploaded(attachment)) return;
    const { projectKey, resourceId } = current;
    setProjectResourceAttachmentDownloadingId(attachment.id); setProjectResourceAttachmentReveal(null); setProjectResourceError('');
    try {
      const result = await downloadProjectResourceAttachmentUseCase({ api, platform: files, projectKey, resourceId, attachmentId: attachment.id, accessToken: projectResourceDetail.access_token, suggestedFilename: attachment.filename, isCurrent: () => isCurrentProjectResourceAttachmentRoute(projectKey, resourceId) });
      if (result.completed) { setProjectResourceAttachmentReveal(result.revealCapability ? { attachmentId: attachment.id, capability: result.revealCapability } : null); setProjectResourceAttachmentStatus(`${attachment.filename} 下载完成。`); }
    } catch (caught) { if (isCurrentProjectResourceAttachmentRoute(projectKey, resourceId)) setProjectResourceError(errorMessage(caught instanceof Error ? caught : new Error('下载资料附件失败。'))); }
    finally { setProjectResourceAttachmentDownloadingId((id) => id === attachment.id ? null : id); }
  }

  async function revealProjectResourceAttachment(attachment) {
    const reveal = projectResourceAttachmentReveal;
    if (!reveal || reveal.attachmentId !== attachment.id || typeof files.attachments?.revealDownload !== 'function') return;
    setProjectResourceAttachmentReveal(null); setProjectResourceAttachmentDownloadingId(attachment.id);
    try { await files.attachments.revealDownload(reveal.capability); setProjectResourceAttachmentStatus(`${attachment.filename} 已在文件夹中定位。`); }
    catch (caught) { setProjectResourceError(errorMessage(caught instanceof Error ? caught : new Error('定位资料附件失败。'))); }
    finally { setProjectResourceAttachmentDownloadingId(null); }
  }

  async function confirmProjectResourceAttachmentDelete() {
    const current = routeRef.current;
    const target = projectResourceAttachmentDeleteTarget;
    if (!target || current.id !== 'project-resource-detail' || projectResourceAttachmentMutationRef.current || projectResourceMutationRef.current) return;
    const { projectKey, resourceId } = current;
    const actionId = projectResourceAttachmentActionRef.current + 1;
    projectResourceAttachmentActionRef.current = actionId; projectResourceAttachmentMutationRef.current = true; setProjectResourceAttachmentDeleting(true); setProjectResourceError('');
    try {
      await api.deleteProjectResourceAttachment(projectKey, resourceId, target.id);
      await refreshProjectResourceAttachments(projectKey, resourceId, projectResourceDetail?.access_token || '', actionId);
      if (isCurrentProjectResourceAttachmentRoute(projectKey, resourceId, actionId)) { setProjectResourceAttachmentDeleteTarget(null); setProjectResourceAttachmentStatus(`${target.filename} 已删除。`); }
    } catch (caught) { if (isCurrentProjectResourceAttachmentRoute(projectKey, resourceId, actionId)) setProjectResourceError(errorMessage(caught instanceof Error ? caught : new Error('删除资料附件失败。'))); }
    finally { if (projectResourceAttachmentActionRef.current === actionId) { projectResourceAttachmentMutationRef.current = false; setProjectResourceAttachmentDeleting(false); } }
  }

  async function confirmAccountAction() {
    if (!accountConfirmation) return;
    try {
      if (accountConfirmation.kind === 'token') await runAccountSecurity(() => api.deleteApiToken(Number(accountConfirmation.id)), '访问 Token 已删除。');
      else await runAccountSecurity(() => api.revokeDeviceSession(String(accountConfirmation.id)), '设备会话已撤销。');
      setAccountConfirmation(null);
    } catch { return; }
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
          : route.id === 'project-detail' && activeProjectDetail
            ? `${activeProjectDetail.key} · ${activeProjectDetail.name} - 元策`
          : route.id === 'project-detail'
              ? '项目详情 - 元策'
          : route.id === 'project-cycle-detail' && projectCycleDetail
            ? `${projectCycleDetail.name} - 元策`
          : route.id === 'project-cycle-detail'
              ? '项目周期详情 - 元策'
          : route.id === 'project-resource-detail' && projectResourceDetail
            ? `${projectResourceDetail.title} - 元策`
            : route.id === 'project-resource-detail'
              ? '项目资料详情 - 元策'
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
  }, [route, activeProjectDetail, activeWorkItemDetail, projectCycleDetail, router]);

  useEffect(() => {
    void loadRouteState(route, 'load');
  }, [route]);

  useEffect(() => () => {
    const capability = projectAttachmentPreviewCapabilityRef.current;
    projectAttachmentPreviewCapabilityRef.current = '';
    if (capability && typeof files.attachments?.releaseProjectAttachmentPreview === 'function') void files.attachments.releaseProjectAttachmentPreview(capability).catch(() => {});
  }, [files]);

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
          { id: 'projects', label: '项目列表', href: projectsPath, active: route.id === 'projects' || route.id === 'project-detail' || route.id === 'project-cycle-detail' || route.id === 'project-resource-detail' },
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
          ) : route.id === 'projects' || route.id === 'project-detail' || route.id === 'project-cycle-detail' || route.id === 'project-resource-detail' ? (
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
              {accountSecurityError ? <Feedback tone="danger" title="账户安全操作失败">{accountSecurityError}</Feedback> : null}
              {createdRawToken ? <Feedback tone="success" title="访问 Token 仅显示一次"><code>{createdRawToken}</code><Button variant="secondary" onClick={() => setCreatedRawToken('')}>我已保存</Button></Feedback> : null}
              <div className="account-security-section">
                <div className="shell-panel-header"><div><h2>登录密码</h2><p className="shell-muted">修改后保留当前登录，撤销其他登录会话。</p></div><Button variant="secondary" onClick={() => { setAccountSecurityError(''); setPasswordModalOpen(true); }}>修改密码</Button></div>
              </div>
              <div className="account-security-section">
                <div className="shell-panel-header"><div><h2>Personal Access Token</h2><p className="shell-muted">共 {apiTokens.length} 个访问 Token，最多保留 100 个可用 Token</p></div><Button variant="secondary" disabled={apiTokens.filter((token) => !token.revoked_at).length >= 100} onClick={() => { setAccountSecurityError(''); setTokenForm({ id: 0, name: '', scopes: ['project:read'], projectScope: 'all', expiresAt: '' }); setTokenModalOpen(true); }}>新建 Token</Button></div>
                {apiTokens.length ? <div className="account-security-list">{apiTokens.map((token) => <div className="account-security-row" key={token.id}><div><strong>{token.name}</strong><p className="shell-muted">尾号 {token.token_suffix} · {token.scopes.join('、')}</p></div><div className="shell-actions-inline"><Button variant="secondary" disabled={accountSecuritySubmitting} onClick={() => { setTokenForm({ id: token.id, name: token.name, scopes: token.scopes, projectScope: token.project_scope, expiresAt: '' }); setTokenModalOpen(true); }}>编辑</Button><Button variant="danger" disabled={accountSecuritySubmitting} onClick={() => setAccountConfirmation({ kind: 'token', id: token.id, label: token.name })}>删除</Button></div></div>)}</div> : <p className="shell-empty">暂无访问 Token。</p>}
              </div>
              <div className="account-security-section">
                <div className="shell-panel-header"><div><h2>已授权设备</h2><p className="shell-muted">管理 Desktop 登录设备。</p></div></div>
                {deviceSessions.length ? <div className="account-security-list">{deviceSessions.map((session) => <div className="account-security-row" key={session.family_id}><div><strong>{session.device_name}{session.is_current ? '（当前设备）' : ''}</strong><p className="shell-muted">{session.platform} · {session.client_version} · {session.status}</p></div><Button variant="danger" disabled={accountSecuritySubmitting || session.status !== 'active'} onClick={() => setAccountConfirmation({ kind: 'device', id: session.family_id, label: session.device_name })}>撤销</Button></div>)}</div> : <p className="shell-empty">暂无已授权设备。</p>}
              </div>
              <Modal open={Boolean(accountConfirmation)} title={accountConfirmation?.kind === 'token' ? '删除访问 Token' : '撤销设备会话'} onClose={() => { if (!accountSecuritySubmitting) setAccountConfirmation(null); }} footer={<><Button variant="secondary" disabled={accountSecuritySubmitting} onClick={() => setAccountConfirmation(null)}>取消</Button><Button variant="danger" loading={accountSecuritySubmitting} onClick={() => void confirmAccountAction()}>确认</Button></>}><p>确认处理“{accountConfirmation?.label}”？此操作会立即失效且不可撤销。</p></Modal>
              <Modal open={passwordModalOpen} title="修改密码" onClose={() => { if (!accountSecuritySubmitting) setPasswordModalOpen(false); }} footer={<><Button variant="secondary" disabled={accountSecuritySubmitting} onClick={() => setPasswordModalOpen(false)}>取消</Button><Button loading={accountSecuritySubmitting} onClick={() => { const form = /** @type {HTMLFormElement | null} */ (runtime.getElementById('password-form')); form?.requestSubmit(); }}>保存</Button></>}>
                <form id="password-form" onSubmit={submitPassword}><Field id="current-password" label="当前密码" required><input id="current-password" type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} /></Field><Field id="new-password" label="新密码" required><input id="new-password" type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} /></Field><Field id="new-password-confirm" label="确认新密码" required><input id="new-password-confirm" type="password" value={passwordForm.newPasswordConfirm} onChange={(event) => setPasswordForm((current) => ({ ...current, newPasswordConfirm: event.target.value }))} /></Field></form>
              </Modal>
              <Modal open={tokenModalOpen} title={tokenForm.id ? '编辑访问 Token' : '新建访问 Token'} onClose={() => { if (!accountSecuritySubmitting) setTokenModalOpen(false); }} footer={<><Button variant="secondary" disabled={accountSecuritySubmitting} onClick={() => setTokenModalOpen(false)}>取消</Button><Button loading={accountSecuritySubmitting} onClick={() => { const form = /** @type {HTMLFormElement | null} */ (runtime.getElementById('token-form')); form?.requestSubmit(); }}>保存</Button></>}>
                <form id="token-form" onSubmit={submitToken}>
                  <Field id="token-name" label="名称" required><input id="token-name" value={tokenForm.name} onChange={(event) => setTokenForm((current) => ({ ...current, name: event.target.value }))} /></Field>
                  <fieldset className="account-security-options"><legend>权限</legend>{[['project:read', '读取项目'], ['work_item:read', '读取工作项'], ['work_item:write', '修改工作项'], ['comment:write', '发表评论'], ['resource:read', '读取资源'], ['resource:write', '修改资源'], ['resource:unlock', '解锁资源'], ['notification:read', '读取通知']].map(([scope, label]) => <label key={scope}><input type="checkbox" checked={tokenForm.scopes.includes(scope)} onChange={(event) => setTokenForm((current) => ({ ...current, scopes: event.target.checked ? [...current.scopes, scope] : current.scopes.filter((value) => value !== scope) }))} />{label}</label>)}</fieldset>
                  <Field id="token-project-scope-mode" label="项目范围" required><select value={tokenForm.projectScope === 'all' ? 'all' : 'selected'} onChange={(event) => setTokenForm((current) => ({ ...current, projectScope: event.target.value === 'all' ? 'all' : '' }))}><option value="all">全部项目（含后续新增）</option><option value="selected">指定项目</option></select></Field>
                  {tokenForm.projectScope !== 'all' ? <Field id="token-project-scope" label="项目 Key（逗号分隔）" required><input placeholder="YCE, DEMO" value={tokenForm.projectScope} onChange={(event) => setTokenForm((current) => ({ ...current, projectScope: event.target.value }))} /></Field> : null}
                  {!tokenForm.id ? <Field id="token-expires-at" label="到期时间"><input type="datetime-local" value={tokenForm.expiresAt} onChange={(event) => setTokenForm((current) => ({ ...current, expiresAt: event.target.value }))} /></Field> : null}
                </form>
              </Modal>
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
                  <Button variant="secondary" onClick={() => { setProjectCreateError(''); setProjectCreateOpen(true); }}>新建项目</Button>
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

              <Modal open={projectCreateOpen} title="新建项目" onClose={() => { if (!projectCreateSubmitting) setProjectCreateOpen(false); }} footer={<><Button variant="secondary" disabled={projectCreateSubmitting} onClick={() => setProjectCreateOpen(false)}>取消</Button><Button loading={projectCreateSubmitting} onClick={() => { const form = /** @type {HTMLFormElement | null} */ (runtime.getElementById('project-create-form')); form?.requestSubmit(); }}>创建</Button></>}>
                <form id="project-create-form" onSubmit={submitProjectCreate}>
                  {projectCreateError ? <Feedback tone="danger" title="创建失败">{projectCreateError}</Feedback> : null}
                  <Field id="project-create-name" label="项目名称" required><input value={projectCreateForm.name} maxLength={120} onChange={(event) => setProjectCreateForm((current) => ({ ...current, name: event.target.value }))} /></Field>
                  <Field id="project-create-status" label="状态" required><select value={projectCreateForm.status} onChange={(event) => setProjectCreateForm((current) => ({ ...current, status: event.target.value }))}><option value="not_started">待启动</option><option value="in_progress">进行中</option><option value="acceptance">验收中</option><option value="completed">已完成</option><option value="on_hold">已暂停</option><option value="cancelled">已取消</option><option value="archived">已归档</option></select></Field>
                  <Field id="project-create-start" label="开始日期"><input type="date" value={projectCreateForm.startDate} onChange={(event) => setProjectCreateForm((current) => ({ ...current, startDate: event.target.value }))} /></Field>
                  <Field id="project-create-due" label="截止日期"><input type="date" min={projectCreateForm.startDate || undefined} value={projectCreateForm.dueDate} onChange={(event) => setProjectCreateForm((current) => ({ ...current, dueDate: event.target.value }))} /></Field>
                  <Field id="project-create-description" label="项目描述"><textarea value={projectCreateForm.description} maxLength={2000} onChange={(event) => setProjectCreateForm((current) => ({ ...current, description: event.target.value }))} /></Field>
                </form>
              </Modal>

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
                            <a className="shell-link" href={buildProjectDetailPath({ owner: route.owner, projectKey: project.key })} onClick={(event) => handleNavigate(event, buildProjectDetailPath({ owner: route.owner, projectKey: project.key }), `已打开项目 ${project.key}。`)}>打开详情</a>
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
          ) : route.id === 'project-detail' ? (
            <section className="shell-card shell-panel-wide project-center" aria-labelledby="project-detail-title">
              <div className="shell-panel-header project-center-header">
                <div>
                  <h2 id="project-detail-title">{activeProjectDetail ? `${activeProjectDetail.key} · ${activeProjectDetail.name}` : route.projectKey}</h2>
                  <p className="shell-muted">{activeProjectDetail ? `${projectStatusLabel(activeProjectDetail.status)} · 负责人 ${activeProjectDetail.owner || activeProjectDetail.owner_username}` : '正在加载项目详情。'}</p>
                </div>
                <div className="shell-actions-inline">
                  <a className="shell-link" href={buildProjectsPath({ owner: route.owner })} onClick={(event) => handleNavigate(event, buildProjectsPath({ owner: route.owner }), '已返回项目列表。')}>返回项目列表</a>
                  {canManageProject ? <Button variant="secondary" onClick={openProjectEdit}>编辑项目</Button> : null}
                </div>
              </div>

              <nav className="message-tabs" aria-label="项目详情导航">
                {[['info', '项目信息'], ['members', '项目成员'], ['cycles', '项目周期'], ['files', '项目文件'], ['resources', '资料库']].map(([tab, label]) => {
                  const path = buildProjectDetailPath({ owner: route.owner, projectKey: route.projectKey, tab });
                  return <a key={tab} className={`message-tab ${route.tab === tab ? 'active' : ''}`} href={path} aria-current={route.tab === tab ? 'page' : undefined} onClick={(event) => handleNavigate(event, path, `已切换到${label}。`)}><span>{label}</span></a>;
                })}
              </nav>

              {projectMutationError ? <Feedback tone="danger" title="项目操作失败">{projectMutationError}</Feedback> : null}
              {activeProjectDetail && route.tab === 'info' ? (
                <div className="work-item-detail-grid">
                  <article className="work-item-detail-panel"><h3>项目描述</h3><p className="work-item-detail-description">{activeProjectDetail.description || '暂无描述。'}</p></article>
                  <article className="work-item-detail-panel"><h3>关键信息</h3><dl className="work-item-detail-meta">
                    <div><dt>状态</dt><dd>{projectStatusLabel(activeProjectDetail.status)}</dd></div>
                    <div><dt>负责人</dt><dd>{activeProjectDetail.owner || activeProjectDetail.owner_username}</dd></div>
                    <div><dt>开始日期</dt><dd>{activeProjectDetail.start_date || '未设置'}</dd></div>
                    <div><dt>截止日期</dt><dd>{activeProjectDetail.due_date || '未设置'}</dd></div>
                    <div><dt>创建时间</dt><dd>{formatTimestamp(activeProjectDetail.created_at)}</dd></div>
                    <div><dt>更新时间</dt><dd>{formatTimestamp(activeProjectDetail.updated_at)}</dd></div>
                  </dl></article>
                </div>
              ) : null}

              {activeProjectDetail && route.tab === 'members' ? (
                <section aria-labelledby="project-members-title">
                  <div className="shell-panel-header"><div><h3 id="project-members-title">项目成员</h3><p className="shell-muted">共 {projectMembers.length} 名成员</p></div>{canManageProject ? <Button variant="secondary" onClick={() => { setProjectMutationError(''); setProjectMemberOpen(true); }}>添加成员</Button> : null}</div>
                  <DataTable
                    caption="项目成员"
                    rows={projectMembers}
                    rowKey={(member) => member.username}
                    emptyText="当前项目暂无成员。"
                    columns={[
                      { key: 'member', label: '成员', render: (member) => <><strong>{member.display_name}</strong><br /><span className="shell-muted">@{member.username}</span></> },
                      { key: 'role', label: '角色', render: (member) => projectMemberRoleLabel(member.member_role) },
                      { key: 'joined', label: '加入时间', render: (member) => formatTimestamp(member.joined_at) },
                      { key: 'actions', label: '操作', render: (member) => member.username === activeProjectDetail.owner_username || !canManageProject ? <span className="shell-muted">{member.username === activeProjectDetail.owner_username ? '负责人' : '只读'}</span> : <div className="shell-actions-inline"><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => { setProjectMutationError(''); setProjectMemberTarget(member); }}>调整角色</Button><Button variant="danger" disabled={projectMutationSubmitting} onClick={() => { setProjectMutationError(''); setProjectMemberRemoveTarget(member); }}>移除</Button></div> },
                    ]}
                  />
                </section>
              ) : null}

              {activeProjectDetail && route.tab === 'cycles' ? (
                <section aria-labelledby="project-cycles-title">
                  <div className="shell-panel-header"><div><h3 id="project-cycles-title">项目周期</h3><p className="shell-muted">共 {projectCycles.length} 个周期</p></div>{canManageProject ? <Button variant="secondary" onClick={() => openProjectCycle()}>新建周期</Button> : null}</div>
                  <DataTable caption="项目周期" rows={projectCycles} rowKey={(cycle) => cycle.id} emptyText="当前项目暂无周期。" columns={[
                    { key: 'cycle', label: '周期', render: (cycle) => <><a className="shell-link" href={buildProjectCycleDetailPath({ owner: route.owner, projectKey: route.projectKey, cycleId: cycle.id })} onClick={(event) => handleNavigate(event, buildProjectCycleDetailPath({ owner: route.owner, projectKey: route.projectKey, cycleId: cycle.id }), `已打开周期 ${cycle.name}。`)}>{cycle.name}</a><br /><span className="shell-muted">{cycle.goal || '暂无目标'}</span></> },
                    { key: 'range', label: '日期', render: (cycle) => `${cycle.start_date} - ${cycle.end_date}` },
                    { key: 'owner', label: '负责人', render: (cycle) => cycle.owner || '未设置' },
                    { key: 'items', label: '工作项', render: (cycle) => `${cycle.total_items}（待处理 ${cycle.pending_count}）` },
                    { key: 'status', label: '状态', render: projectCycleStatusLabel },
                    { key: 'actions', label: '操作', render: (cycle) => canManageProject && !cycle.is_closed ? <div className="shell-actions-inline"><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => openProjectCycle(cycle)}>编辑</Button><Button variant="danger" disabled={projectMutationSubmitting} onClick={() => setProjectCycleCloseTarget(cycle)}>关闭</Button></div> : <span className="shell-muted">{cycle.is_closed ? '已关闭' : '只读'}</span> },
                  ]} />
                </section>
              ) : null}

              {activeProjectDetail && route.tab === 'files' ? (
                <section aria-labelledby="project-files-title">
                  <div className="shell-panel-header"><div><h3 id="project-files-title">项目文件</h3><p className="shell-muted">共 {projectAttachments.length} 个文件</p></div>{canManageProject ? <Button variant="secondary" disabled={projectAttachmentUploading || projectMutationSubmitting} onClick={() => void uploadSelectedProjectAttachment()}>{projectAttachmentUploading ? '处理中…' : '选择文件上传'}</Button> : null}</div>
                  <p className="shell-muted">文件将直接上传到对象存储，页面只保留受控附件信息。</p>
                  {projectAttachmentStatus ? <p className="work-item-attachment-status" aria-live="polite">{projectAttachmentStatus}</p> : null}
                  {projectAttachmentError ? <Feedback tone="danger" title="项目文件操作失败">{projectAttachmentError}</Feedback> : null}
                  {projectAttachments.length ? <AttachmentList attachments={projectAttachments} ariaLabel="项目文件列表" downloadLabel="附件" downloadingId={projectAttachmentDownloadingId} revealableId={projectAttachmentReveal?.attachmentId || null} onPreview={(attachment) => void openProjectAttachmentPreview(attachment)} onDownload={(attachment) => void downloadProjectAttachment(attachment)} onReveal={(attachment) => void revealProjectAttachment(attachment)} showCreator renderExtraAction={(attachment) => canManageProject && attachment.status !== 'deleted' ? <><Button variant="danger" disabled={projectAttachmentUploading || projectAttachmentArchiving} onClick={() => { setProjectAttachmentError(''); setProjectAttachmentArchiveTarget(attachment); }}>归档</Button>{['pending', 'failed'].includes(attachment.status) ? <Button variant="secondary" disabled={projectAttachmentUploading || projectAttachmentArchiving} onClick={() => void uploadSelectedProjectAttachment(attachment)}>继续上传</Button> : null}</> : null} /> : <p className="shell-empty">当前项目暂无文件。</p>}
                </section>
              ) : null}

              {activeProjectDetail && route.tab === 'resources' ? (
                <section aria-labelledby="project-resources-title">
                  <div className="shell-panel-header"><div><h3 id="project-resources-title">项目资料库</h3><p className="shell-muted">当前筛选共 {projectResources.length} 条资料</p></div>{canManageProject ? <Button variant="secondary" disabled={projectResourceSubmitting} onClick={() => openProjectResourceForm()}>新建资料</Button> : null}</div>
                  <form className="work-item-filter-bar" onSubmit={submitProjectResourceFilters}>
                    <label className="work-item-filter-field work-item-filter-keyword"><span>关键词</span><input value={projectResourceFilters.q} placeholder="标题、摘要或正文" onChange={(event) => setProjectResourceFilters((current) => ({ ...current, q: event.target.value }))} /></label>
                    <label className="work-item-filter-field"><span>分类</span><input value={projectResourceFilters.category} placeholder="例如 integration" onChange={(event) => setProjectResourceFilters((current) => ({ ...current, category: event.target.value }))} /></label>
                    <label className="work-item-filter-field"><span>状态</span><select value={projectResourceFilters.status} onChange={(event) => setProjectResourceFilters((current) => ({ ...current, status: event.target.value }))}><option value="">全部状态</option><option value="active">生效中</option><option value="archived">已归档</option></select></label>
                    <label className="work-item-filter-field"><span>标签</span><input value={projectResourceFilters.tag} placeholder="标签" onChange={(event) => setProjectResourceFilters((current) => ({ ...current, tag: event.target.value }))} /></label>
                    <div className="work-item-filter-actions"><Button type="submit" variant="secondary">筛选</Button><Button type="button" variant="secondary" onClick={() => void resetProjectResourceFilters()}>重置</Button></div>
                  </form>
                  {projectResourceError ? <Feedback tone="danger" title="资料列表加载失败">{projectResourceError}</Feedback> : null}
                  {projectResourceStatus ? <p className="work-item-attachment-status" aria-live="polite">{projectResourceStatus}</p> : null}
                  {projectResources.length ? <ul className="project-list" aria-label="项目资料列表">{projectResources.map((resource) => {
                    const resourcePath = buildProjectResourceDetailPath({ owner: route.owner, projectKey: route.projectKey, resourceId: resource.id });
                    return <li className="project-row" key={resource.id}><div className="project-main"><div className="project-heading"><a className="shell-link" href={resourcePath} onClick={(event) => handleNavigate(event, resourcePath, `已打开资料 ${resource.title}。`)}>{resource.title}</a><span className="project-status-pill">{resource.category || '未分类'}</span>{resource.is_protected ? <span className="project-status-pill">受保护</span> : null}{resource.status === 'archived' ? <span className="project-status-pill">已归档</span> : null}</div><p>{resource.summary || '暂无摘要。'}</p>{resource.tags.length ? <p className="shell-muted">标签：{resource.tags.join('、')}</p> : null}<p className="shell-muted">{resource.related_work_item ? `关联 ${resource.related_work_item.key}` : resource.related_cycle ? `关联周期 ${resource.related_cycle.name}` : '未关联工作项或周期'} · {resource.updated_by} 更新于 {formatTimestamp(resource.updated_at)}</p></div></li>;
                  })}</ul> : <p className="shell-empty">当前筛选下没有项目资料。</p>}
                </section>
              ) : null}

              <AttachmentPreview open={Boolean(projectAttachmentPreview?.open)} title={projectAttachmentPreview?.attachment?.filename || '附件预览'} source={projectAttachmentPreview?.source || ''} kind={projectAttachmentPreview?.kind || null} fileType={projectAttachmentPreview?.fileType || null} loading={projectAttachmentPreview?.loading} error={projectAttachmentPreview?.error} position={projectAttachmentPreview?.position} total={projectAttachmentPreview?.total} hasPrevious={Boolean(projectAttachmentPreview?.previousId)} hasNext={Boolean(projectAttachmentPreview?.nextId)} onPrevious={() => { if (projectAttachmentPreview?.previousId) navigateProjectAttachmentPreview(projectAttachmentPreview.previousId); }} onNext={() => { if (projectAttachmentPreview?.nextId) navigateProjectAttachmentPreview(projectAttachmentPreview.nextId); }} onDownload={() => { if (projectAttachmentPreview?.attachment) void downloadProjectAttachment(projectAttachmentPreview.attachment); }} onClose={() => void releaseProjectAttachmentPreview()} />

              <Modal open={projectEditOpen} title="编辑项目" onClose={() => { if (!projectMutationSubmitting) setProjectEditOpen(false); }} footer={<><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => setProjectEditOpen(false)}>取消</Button><Button loading={projectMutationSubmitting} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('project-edit-form'))?.requestSubmit()}>保存</Button></>}>
                <form id="project-edit-form" onSubmit={submitProjectEdit}>
                  <Field id="project-edit-name" label="项目名称" required><input value={projectEditForm.name} maxLength={120} onChange={(event) => setProjectEditForm((current) => ({ ...current, name: event.target.value }))} /></Field>
                  <Field id="project-edit-status" label="状态" required><select value={projectEditForm.status} onChange={(event) => setProjectEditForm((current) => ({ ...current, status: event.target.value }))}>{['not_started', 'in_progress', 'acceptance', 'completed', 'on_hold', 'cancelled', 'archived'].map((status) => <option key={status} value={status}>{projectStatusLabel(status)}</option>)}</select></Field>
                  <Field id="project-edit-owner" label="负责人用户名" required><input value={projectEditForm.ownerUsername} maxLength={64} onChange={(event) => setProjectEditForm((current) => ({ ...current, ownerUsername: event.target.value }))} /></Field>
                  <Field id="project-edit-start" label="开始日期"><input type="date" value={projectEditForm.startDate} onChange={(event) => setProjectEditForm((current) => ({ ...current, startDate: event.target.value }))} /></Field>
                  <Field id="project-edit-due" label="截止日期"><input type="date" min={projectEditForm.startDate || undefined} value={projectEditForm.dueDate} onChange={(event) => setProjectEditForm((current) => ({ ...current, dueDate: event.target.value }))} /></Field>
                  <Field id="project-edit-description" label="项目描述"><textarea value={projectEditForm.description} maxLength={2000} onChange={(event) => setProjectEditForm((current) => ({ ...current, description: event.target.value }))} /></Field>
                </form>
              </Modal>
              <Modal open={projectMemberOpen} title="添加项目成员" onClose={() => { if (!projectMutationSubmitting) setProjectMemberOpen(false); }} footer={<><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => setProjectMemberOpen(false)}>取消</Button><Button loading={projectMutationSubmitting} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('project-member-form'))?.requestSubmit()}>添加</Button></>}>
                <form id="project-member-form" onSubmit={submitProjectMember}><Field id="project-member-username" label="用户名" required><input value={projectMemberForm.username} maxLength={64} onChange={(event) => setProjectMemberForm((current) => ({ ...current, username: event.target.value }))} /></Field><Field id="project-member-role" label="项目角色" required><select value={projectMemberForm.memberRole} onChange={(event) => setProjectMemberForm((current) => ({ ...current, memberRole: event.target.value }))}><option value="member">项目成员</option><option value="maintainer">项目管理员</option><option value="viewer">只读成员</option></select></Field></form>
              </Modal>
              <Modal open={Boolean(projectMemberTarget)} title="调整成员角色" onClose={() => { if (!projectMutationSubmitting) setProjectMemberTarget(null); }} footer={<><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => setProjectMemberTarget(null)}>取消</Button><Button loading={projectMutationSubmitting} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('project-member-role-form'))?.requestSubmit()}>保存</Button></>}>
                <form id="project-member-role-form" onSubmit={submitProjectMemberRole}><p>{projectMemberTarget?.display_name} @{projectMemberTarget?.username}</p><Field id="project-member-role-value" label="项目角色" required><select key={`${projectMemberTarget?.username || ''}:${projectMemberTarget?.member_role || ''}`} name="memberRole" defaultValue={projectMemberTarget?.member_role || 'member'}><option value="viewer">只读成员</option><option value="member">项目成员</option><option value="maintainer">项目管理员</option></select></Field></form>
              </Modal>
              <Modal open={Boolean(projectMemberRemoveTarget)} title="移除项目成员" onClose={() => { if (!projectMutationSubmitting) setProjectMemberRemoveTarget(null); }} footer={<><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => setProjectMemberRemoveTarget(null)}>取消</Button><Button variant="danger" loading={projectMutationSubmitting} onClick={() => void confirmProjectMemberRemove()}>确认移除</Button></>}><p>确认从项目中移除 {projectMemberRemoveTarget?.display_name} @{projectMemberRemoveTarget?.username}？</p></Modal>
              <Modal open={projectCycleOpen} title={projectCycleForm.id ? '编辑项目周期' : '新建项目周期'} onClose={() => { if (!projectMutationSubmitting) setProjectCycleOpen(false); }} footer={<><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => setProjectCycleOpen(false)}>取消</Button><Button loading={projectMutationSubmitting} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('project-cycle-form'))?.requestSubmit()}>保存</Button></>}>
                <form id="project-cycle-form" onSubmit={submitProjectCycle}><Field id="project-cycle-name" label="周期名称" required><input value={projectCycleForm.name} maxLength={120} onChange={(event) => setProjectCycleForm((current) => ({ ...current, name: event.target.value }))} /></Field><Field id="project-cycle-goal" label="周期目标"><input value={projectCycleForm.goal} maxLength={240} onChange={(event) => setProjectCycleForm((current) => ({ ...current, goal: event.target.value }))} /></Field><Field id="project-cycle-owner" label="负责人用户名"><input value={projectCycleForm.ownerUsername} maxLength={64} onChange={(event) => setProjectCycleForm((current) => ({ ...current, ownerUsername: event.target.value }))} /></Field><Field id="project-cycle-start" label="开始日期" required><input type="date" value={projectCycleForm.startDate} onChange={(event) => setProjectCycleForm((current) => ({ ...current, startDate: event.target.value }))} /></Field><Field id="project-cycle-end" label="结束日期" required><input type="date" min={projectCycleForm.startDate || undefined} value={projectCycleForm.endDate} onChange={(event) => setProjectCycleForm((current) => ({ ...current, endDate: event.target.value }))} /></Field><Field id="project-cycle-description" label="周期说明"><textarea value={projectCycleForm.description} maxLength={5000} onChange={(event) => setProjectCycleForm((current) => ({ ...current, description: event.target.value }))} /></Field></form>
              </Modal>
              <Modal open={Boolean(projectCycleCloseTarget)} title="关闭项目周期" onClose={() => { if (!projectMutationSubmitting) setProjectCycleCloseTarget(null); }} footer={<><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => setProjectCycleCloseTarget(null)}>取消</Button><Button variant="danger" loading={projectMutationSubmitting} onClick={() => void confirmProjectCycleClose()}>确认关闭</Button></>}><p>确认关闭周期“{projectCycleCloseTarget?.name}”？关闭后不能继续编辑。</p></Modal>
              <Modal open={Boolean(projectAttachmentArchiveTarget)} title="归档项目文件" onClose={() => { if (!projectAttachmentArchiving) setProjectAttachmentArchiveTarget(null); }} footer={<><Button variant="secondary" disabled={projectAttachmentArchiving} onClick={() => setProjectAttachmentArchiveTarget(null)}>取消</Button><Button variant="danger" loading={projectAttachmentArchiving} onClick={() => void confirmProjectAttachmentArchive()}>确认归档</Button></>}><p>确认归档文件“{projectAttachmentArchiveTarget?.filename}”？归档后不能继续下载，但文件记录会保留。</p></Modal>
            </section>
          ) : route.id === 'project-resource-detail' ? (
            <section className="shell-card shell-panel-wide project-center" aria-labelledby="project-resource-detail-title">
              <div className="shell-panel-header project-center-header"><div><h2 id="project-resource-detail-title">{projectResourceDetail?.title || `资料 #${route.resourceId}`}</h2><p className="shell-muted">{activeProjectDetail ? `${activeProjectDetail.key} · ${activeProjectDetail.name}` : route.projectKey}</p></div><div className="shell-actions-inline">{canManageProject && projectResourceDetail?.status !== 'archived' && !projectResourceLocked ? <Button variant="secondary" disabled={projectResourceSubmitting || projectResourceAttachmentUploading || projectResourceAttachmentDeleting} onClick={() => openProjectResourceForm(projectResourceDetail)}>编辑</Button> : null}{user?.is_super_admin && projectResourceDetail?.status !== 'archived' ? <Button variant="secondary" disabled={projectResourceSubmitting || projectResourceAttachmentUploading || projectResourceAttachmentDeleting} onClick={() => { setProjectResourceError(''); setProjectResourcePasswordResetForm({ accessPasswordAction: 'set', accessPassword: '' }); setProjectResourcePasswordResetOpen(true); }}>重置访问密码</Button> : null}{canManageProject && projectResourceDetail?.status !== 'archived' ? <Button variant="danger" disabled={projectResourceSubmitting || projectResourceAttachmentUploading || projectResourceAttachmentDeleting} onClick={() => { setProjectResourceError(''); setProjectResourceArchiveTarget(projectResourceDetail); }}>归档</Button> : null}<a className="shell-link" href={resourceFallbackPath} onClick={(event) => handleNavigate(event, resourceFallbackPath, '已返回项目资料库。')}>返回资料库</a></div></div>
              {projectResourceError ? <Feedback tone="danger" title="资料操作失败">{projectResourceError}</Feedback> : null}
              {projectResourceStatus ? <p className="work-item-attachment-status" aria-live="polite">{projectResourceStatus}</p> : null}
              {projectResourceDetail ? <>
                <div className="work-item-detail-grid"><article className="work-item-detail-panel"><h3>资料信息</h3><dl className="work-item-detail-meta"><div><dt>分类</dt><dd>{projectResourceDetail.category || '未分类'}</dd></div><div><dt>状态</dt><dd>{projectResourceDetail.status === 'archived' ? '已归档' : '生效中'}</dd></div><div><dt>保护</dt><dd>{projectResourceDetail.is_protected ? '密码保护' : '公开可读'}</dd></div><div><dt>格式</dt><dd>{projectResourceDetail.body_format || 'plain'}</dd></div><div><dt>更新人</dt><dd>{projectResourceDetail.updated_by}</dd></div><div><dt>更新时间</dt><dd>{formatTimestamp(projectResourceDetail.updated_at)}</dd></div></dl></article><article className="work-item-detail-panel"><h3>摘要与关联</h3><p>{projectResourceDetail.summary || '暂无摘要。'}</p><p className="shell-muted">{projectResourceDetail.tags.length ? `标签：${projectResourceDetail.tags.join('、')}` : '暂无标签'}</p><p className="shell-muted">{projectResourceDetail.related_work_item ? `关联工作项：${projectResourceDetail.related_work_item.key} · ${projectResourceDetail.related_work_item.title}` : projectResourceDetail.related_cycle ? `关联周期：${projectResourceDetail.related_cycle.name}` : '暂无关联对象'}</p></article></div>
                {projectResourceLocked ? <article className="work-item-detail-panel project-resource-lock"><h3>此资料受密码保护</h3><p className="shell-muted">输入访问密码后可在当前页面读取完整正文与附件。</p><form onSubmit={submitProjectResourceUnlock}><Field id="project-resource-password" label="访问密码" required><input type="password" autoComplete="off" value={projectResourcePassword} onChange={(event) => setProjectResourcePassword(event.target.value)} /></Field><Button type="submit" loading={projectResourceUnlocking} disabled={!projectResourcePassword}>解锁资料</Button></form></article> : <><article className="work-item-detail-panel"><h3>资料正文</h3><RichTextContent html={projectResourceDetail.body} format={projectResourceDetail.body_format} onAttachmentActivate={activateProjectResourceInlineAttachment} resolveAttachmentSource={typeof files.attachments?.openProjectResourceAttachmentPreview === 'function' ? resolveProjectResourceInlineAttachmentSource : undefined} /></article><section aria-labelledby="project-resource-attachments-title"><div className="shell-panel-header"><div><h3 id="project-resource-attachments-title">资料附件</h3><p className="shell-muted">共 {projectResourceAttachments.length} 个附件</p></div>{canManageProject && projectResourceDetail.status !== 'archived' ? <Button variant="secondary" disabled={projectResourceAttachmentUploading || projectResourceAttachmentDeleting || projectResourceSubmitting} onClick={() => void uploadSelectedProjectResourceAttachment()}>{projectResourceAttachmentUploading ? '处理中…' : '选择附件上传'}</Button> : null}</div>{projectResourceAttachmentStatus ? <p className="work-item-attachment-status" aria-live="polite">{projectResourceAttachmentStatus}</p> : null}{projectResourceAttachments.length ? <AttachmentList attachments={projectResourceAttachments} ariaLabel="资料附件列表" downloadLabel="附件" downloadingId={projectResourceAttachmentDownloadingId} revealableId={projectResourceAttachmentReveal?.attachmentId || null} onPreview={(attachment) => void openProjectResourceAttachmentPreview(attachment)} onDownload={(attachment) => void downloadProjectResourceAttachment(attachment)} onReveal={(attachment) => void revealProjectResourceAttachment(attachment)} showCreator renderExtraAction={(attachment) => canManageProject && projectResourceDetail.status !== 'archived' && attachment.status !== 'deleted' ? <><Button variant="danger" disabled={projectResourceAttachmentUploading || projectResourceAttachmentDeleting} onClick={() => { setProjectResourceError(''); setProjectResourceAttachmentDeleteTarget(attachment); }}>删除</Button>{['pending', 'failed'].includes(attachment.status) ? <Button variant="secondary" disabled={projectResourceAttachmentUploading || projectResourceAttachmentDeleting} onClick={() => void uploadSelectedProjectResourceAttachment(attachment)}>继续上传</Button> : null}</> : null} /> : <p className="shell-empty">当前资料暂无附件。</p>}</section><AttachmentPreview open={Boolean(projectAttachmentPreview?.open)} title={projectAttachmentPreview?.attachment?.filename || '附件预览'} source={projectAttachmentPreview?.source || ''} kind={projectAttachmentPreview?.kind || null} fileType={projectAttachmentPreview?.fileType || null} loading={projectAttachmentPreview?.loading} error={projectAttachmentPreview?.error} position={projectAttachmentPreview?.position} total={projectAttachmentPreview?.total} hasPrevious={Boolean(projectAttachmentPreview?.previousId)} hasNext={Boolean(projectAttachmentPreview?.nextId)} onPrevious={() => { if (projectAttachmentPreview?.previousId) navigateProjectResourceAttachmentPreview(projectAttachmentPreview.previousId); }} onNext={() => { if (projectAttachmentPreview?.nextId) navigateProjectResourceAttachmentPreview(projectAttachmentPreview.nextId); }} onDownload={() => { if (projectAttachmentPreview?.attachment) void downloadProjectResourceAttachment(projectAttachmentPreview.attachment); }} onClose={() => void releaseProjectAttachmentPreview()} /></>}
              </> : null}
            </section>
          ) : route.id === 'project-cycle-detail' ? (
            <section className="shell-card shell-panel-wide project-center" aria-labelledby="project-cycle-detail-title">
              <div className="shell-panel-header"><div><h2 id="project-cycle-detail-title">{projectCycleDetail?.name || `周期 #${route.cycleId}`}</h2><p className="shell-muted">{projectCycleDetail ? `${projectCycleStatusLabel(projectCycleDetail)} · ${projectCycleDetail.start_date} - ${projectCycleDetail.end_date}` : '正在加载周期详情。'}</p></div><a className="shell-link" href={cycleBackPath} onClick={(event) => handleNavigate(event, cycleBackPath, cycleBackPath === cycleFallbackPath ? '已返回项目周期。' : '已返回上一页。')}>{cycleBackPath === cycleFallbackPath ? '返回周期列表' : '返回上一页'}</a></div>
              {projectMutationError ? <Feedback tone="danger" title="周期操作失败">{projectMutationError}</Feedback> : null}
              {projectCycleDetail ? <>
                <div className="work-item-detail-grid"><article className="work-item-detail-panel"><h3>周期目标</h3><p>{projectCycleDetail.goal || '暂无目标。'}</p><p className="work-item-detail-description">{projectCycleDetail.description || '暂无说明。'}</p></article><article className="work-item-detail-panel"><h3>周期指标</h3><dl className="work-item-detail-meta"><div><dt>工作项</dt><dd>{projectCycleDetail.total_items}</dd></div><div><dt>待处理</dt><dd>{projectCycleDetail.pending_count}</dd></div><div><dt>需求</dt><dd>{projectCycleDetail.requirement_count}</dd></div><div><dt>任务</dt><dd>{projectCycleDetail.task_count}</dd></div><div><dt>Bug</dt><dd>{projectCycleDetail.bug_count}</dd></div><div><dt>负责人</dt><dd>{projectCycleDetail.owner || '未设置'}</dd></div></dl></article></div>
                <section aria-labelledby="cycle-pace-title"><h3 id="cycle-pace-title">当前节奏</h3><article className="work-item-detail-panel"><div className="shell-panel-header"><strong>时间进度 {cyclePace?.percent}%</strong><span className="shell-muted">{cyclePace?.duration} · {cyclePace?.hint}</span></div><progress max="100" value={cyclePace?.percent || 0} aria-label="周期时间进度">{cyclePace?.percent}%</progress></article></section>
                <section><h3>工作项状态看板</h3><div className="work-item-action-grid">{[['open', '待处理'], ['in_progress', '进行中'], ['pending_confirmation', '待确认'], ['done', '已完成']].map(([status, label]) => { const items = projectCycleDetail.work_items.filter((item) => status === 'done' ? !['open', 'in_progress', 'pending_confirmation'].includes(item.status) : item.status === status); return <article className="work-item-detail-panel" key={status}><h4>{label} · {items.length}</h4>{items.length ? <ul className="project-list">{items.map((item) => { const itemPath = buildWorkItemDetailPath({ owner: /** @type {'app' | 'web'} */ (route.owner), itemKey: item.key }); return <li key={item.key}><a className="shell-link" href={itemPath} onClick={(event) => handleNavigate(event, itemPath, `已打开 ${item.key}。`)}>{item.key} · {item.title}</a><p className="shell-muted">{item.priority} · {item.assignee || '未指派'} · {item.due_date || '无截止日期'}</p></li>; })}</ul> : <p className="shell-empty">暂无工作项。</p>}</article>; })}</div></section>
                <section aria-labelledby="cycle-member-load-title"><h3 id="cycle-member-load-title">成员负载</h3><DataTable caption="周期成员负载" rows={cycleMemberLoad} rowKey={(row) => row.key || 'unassigned'} emptyText="当前周期暂无待推进负载。" columns={[{ key: 'member', label: '成员', render: (row) => <><strong>{row.member}</strong><br /><span className="shell-muted">{row.subtitle}</span></> }, { key: 'open', label: '待处理', render: (row) => row.open }, { key: 'in_progress', label: '进行中', render: (row) => row.in_progress }, { key: 'pending_confirmation', label: '待确认', render: (row) => row.pending_confirmation }, { key: 'high', label: '高优先级', render: (row) => row.high }, { key: 'overdue', label: '逾期', render: (row) => row.overdue }, { key: 'active', label: '活跃合计', render: (row) => row.active }]} /></section>
              </> : null}
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
          <Modal open={projectResourceModalOpen} title={projectResourceForm.id ? '编辑项目资料' : '新建项目资料'} onClose={() => { if (!projectResourceSubmitting) { setProjectResourceModalOpen(false); setProjectResourceForm((current) => ({ ...current, accessPassword: '' })); } }} footer={<><Button variant="secondary" disabled={projectResourceSubmitting} onClick={() => setProjectResourceModalOpen(false)}>取消</Button><Button loading={projectResourceSubmitting} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('project-resource-form'))?.requestSubmit()}>保存</Button></>}>
            <form id="project-resource-form" onSubmit={submitProjectResource}>
              <Field id="project-resource-title" label="资料标题" required><input value={projectResourceForm.title} maxLength={120} onChange={(event) => setProjectResourceForm((current) => ({ ...current, title: event.target.value }))} /></Field>
              <Field id="project-resource-category" label="分类" required><select value={projectResourceForm.category} onChange={(event) => setProjectResourceForm((current) => ({ ...current, category: event.target.value }))}><option value="integration">集成</option><option value="customer">客户</option><option value="meeting">会议</option><option value="implementation">实施</option><option value="other">其他</option></select></Field>
              <Field id="project-resource-tags" label="标签"><input value={projectResourceForm.tagsText} placeholder="多个标签使用逗号分隔" onChange={(event) => setProjectResourceForm((current) => ({ ...current, tagsText: event.target.value }))} /></Field>
              <Field id="project-resource-related-item" label="关联工作项 Key"><input value={projectResourceForm.relatedWorkItemKey} maxLength={64} onChange={(event) => setProjectResourceForm((current) => ({ ...current, relatedWorkItemKey: event.target.value }))} /></Field>
              <Field id="project-resource-related-cycle" label="关联周期 ID"><input type="number" min="1" value={projectResourceForm.relatedCycleId} onChange={(event) => setProjectResourceForm((current) => ({ ...current, relatedCycleId: event.target.value }))} /></Field>
              <div className="yc-field"><label htmlFor="project-resource-body">资料正文<span aria-hidden="true"> *</span></label><RichTextEditor id="project-resource-body" value={projectResourceForm.body} disabled={projectResourceSubmitting} required attachments={projectResourceForm.id ? projectResourceRichAttachmentOptions() : []} onChange={(body) => setProjectResourceForm((current) => ({ ...current, body, bodyFormat: 'html' }))} /></div>
              {projectResourceForm.id ? <Field id="project-resource-password-action" label="密码处理方式" required><select value={projectResourceForm.accessPasswordAction} onChange={(event) => setProjectResourceForm((current) => ({ ...current, accessPasswordAction: event.target.value, accessPassword: '' }))}><option value="keep">保持不变</option><option value="set">设置密码</option><option value="clear">清除密码</option></select></Field> : null}
              {(!projectResourceForm.id || projectResourceForm.accessPasswordAction === 'set') ? <Field id="project-resource-access-password" label={projectResourceForm.id ? '新访问密码' : '初始访问密码'}><input type="password" autoComplete="new-password" minLength={projectResourceForm.accessPassword ? 4 : undefined} maxLength={128} value={projectResourceForm.accessPassword} onChange={(event) => setProjectResourceForm((current) => ({ ...current, accessPassword: event.target.value }))} /></Field> : null}
            </form>
          </Modal>
          <Modal open={Boolean(projectResourceArchiveTarget)} title="归档项目资料" onClose={() => { if (!projectResourceSubmitting) setProjectResourceArchiveTarget(null); }} footer={<><Button variant="secondary" disabled={projectResourceSubmitting} onClick={() => setProjectResourceArchiveTarget(null)}>取消</Button><Button variant="danger" loading={projectResourceSubmitting} onClick={() => void confirmProjectResourceArchive()}>确认归档</Button></>}><p>确认归档资料“{projectResourceArchiveTarget?.title}”？归档后不能继续编辑，但资料记录会保留。</p></Modal>
          <Modal open={Boolean(projectResourceAttachmentDeleteTarget)} title="删除资料附件" onClose={() => { if (!projectResourceAttachmentDeleting) setProjectResourceAttachmentDeleteTarget(null); }} footer={<><Button variant="secondary" disabled={projectResourceAttachmentDeleting} onClick={() => setProjectResourceAttachmentDeleteTarget(null)}>取消</Button><Button variant="danger" loading={projectResourceAttachmentDeleting} onClick={() => void confirmProjectResourceAttachmentDelete()}>确认删除</Button></>}><p>确认删除附件“{projectResourceAttachmentDeleteTarget?.filename}”？对象存储中的文件也会一并删除。</p></Modal>
          <Modal open={projectResourcePasswordResetOpen} title="重置资料访问密码" onClose={() => { if (!projectResourceSubmitting) { setProjectResourcePasswordResetOpen(false); setProjectResourcePasswordResetForm({ accessPasswordAction: 'set', accessPassword: '' }); } }} footer={<><Button variant="secondary" disabled={projectResourceSubmitting} onClick={() => setProjectResourcePasswordResetOpen(false)}>取消</Button><Button variant="danger" loading={projectResourceSubmitting} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('project-resource-password-reset-form'))?.requestSubmit()}>确认重置</Button></>}>
            <form id="project-resource-password-reset-form" onSubmit={submitProjectResourcePasswordReset}>
              <p>此操作仅限超级管理员。设置或清除密码会立即改变其他宿主后续访问此资料的方式，并记录安全审计。</p>
              <Field id="project-resource-password-reset-action" label="重置方式" required><select value={projectResourcePasswordResetForm.accessPasswordAction} onChange={(event) => setProjectResourcePasswordResetForm({ accessPasswordAction: event.target.value, accessPassword: '' })}><option value="set">设置新密码</option><option value="clear">清除密码保护</option></select></Field>
              {projectResourcePasswordResetForm.accessPasswordAction === 'set' ? <Field id="project-resource-password-reset-value" label="新访问密码" required><input type="password" autoComplete="new-password" minLength={4} maxLength={128} value={projectResourcePasswordResetForm.accessPassword} onChange={(event) => setProjectResourcePasswordResetForm((current) => ({ ...current, accessPassword: event.target.value }))} /></Field> : null}
            </form>
          </Modal>
        </>
      )}
    </main>
  );
}
