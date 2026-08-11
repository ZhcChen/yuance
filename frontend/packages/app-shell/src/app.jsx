// @ts-check
/* global FormData, URL, btoa, clearInterval, clearTimeout, setInterval, setTimeout */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createNotificationActionCoordinator,
  createNotificationEventCoordinator,
  createWorkItemEventCoordinator,
  createWorkItemTypingController,
  createProjectResourceWithAttachments,
  buildHomePath,
  buildMessagesPath,
  buildProfilePath,
  buildProjectDetailPath,
  buildProjectCycleDetailPath,
  buildProjectResourceDetailPath,
  buildProjectPersonalAnalysisPath,
  buildProjectsPath,
  buildSearchPath,
  buildSystemAuditPath,
  buildSystemApiDocsPath,
  buildSystemOpenApiPath,
  buildSystemPermissionsPath,
  buildSystemReleasesPath,
  buildSystemRolesPath,
  buildSystemStoragePath,
  buildSystemUsersPath,
  buildWorkItemDetailPath,
  buildWorkItemListPath,
  createWorkItemComment as createWorkItemCommentUseCase,
  downloadProjectAttachment as downloadProjectAttachmentUseCase,
  downloadProjectResourceAttachment as downloadProjectResourceAttachmentUseCase,
  downloadWorkItemAttachment as downloadWorkItemAttachmentUseCase,
  downloadWorkItemCommentAttachment as downloadWorkItemCommentAttachmentUseCase,
  downloadSystemReleaseAsset as downloadSystemReleaseAssetUseCase,
  handoffWorkItem as handoffWorkItemUseCase,
  notificationTargetPath,
  parseAppRoute,
  routePathForOwner,
  updateWorkItemComment as updateWorkItemCommentUseCase,
  uploadWorkItemAttachment,
  uploadWorkItemCommentAttachment,
  uploadProjectAttachment,
  uploadProjectResourceAttachment,
  uploadSystemReleaseAsset,
} from '@yuance/frontend-app-core';
import {
  AttachmentList,
  AttachmentPreview,
  Badge,
  Button,
  ContentTab,
  ContentTabs,
  DEFER_RICH_TEXT_PASTE,
  DataTable,
  ErrorToast,
  Feedback,
  Field,
  FilterBar,
  FilterField,
  GlobalNavigation,
  Modal,
  Pagination,
  RichTextContent,
  RichTextEditor,
  Select,
  TextArea,
  TextInput,
  WorkItemAttachments,
  WorkItemComments,
  WorkItemDetail,
  attachmentIsUploaded,
  formatByteSize,
  plainTextToRichHtml,
  richTextAttachmentHtml,
  richTextAttachmentIds,
  richTextHasContent,
} from '@yuance/frontend-ui';
import { errorMessage, globalApiErrorMessage } from './errors.js';
import { createApiErrorWrappingProxy } from './api-proxy.js';
import { AppShellSkeleton } from './app-skeleton.jsx';

/** @typedef {import('@yuance/frontend-api-client').ApiError} ApiError */
/** @typedef {Awaited<ReturnType<AppApiService['getProjectAttachmentPreview']>>['preview']['kind']} AppPreviewKind */

/** @typedef {ReturnType<typeof import('@yuance/frontend-api-client').createApiClient> & { restorePendingReturnToHash(): void }} AppApiService */
/** @typedef {{ id: number, filename: string, contentType: string, url: string }} AppRichTextAttachmentOption */
/** @typedef {import('@yuance/frontend-platform-contract').SelectedFile & { tempId: number, previewUrl: string }} WorkItemCreatePendingPaste */
/** @typedef {Pick<import('@yuance/frontend-platform-contract').PlatformCapabilities, 'files' | 'downloads' | 'transfers'> & { attachments?: import('@yuance/frontend-platform-contract').HostDelegatedAttachmentCapabilities, releaseAssets?: import('@yuance/frontend-platform-contract').HostDelegatedReleaseAssetCapabilities, selectPastedFile?: (file: import('@yuance/frontend-platform-contract').PastedFile) => Promise<import('@yuance/frontend-platform-contract').SelectedFile | null> }} AppFileService */
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
 * @property {Array<{ key: string, name: string, pending_count: number }>} project_options
 * @property {Array<{ id: string, title: string, description: string, path: string }>} system_links
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
 * @typedef AppProjectPersonalAnalysis
 * @property {string} username
 * @property {string} display_name
 * @property {string} joined_at
 * @property {number} completed_total
 * @property {number} completed_requirements
 * @property {number} completed_tasks
 * @property {number} completed_bugs
 * @property {number} completed_last_30_days
 * @property {{ requirements: number, tasks: number, bugs: number }} pending
 * @property {number} daily_average
 * @property {number} daily_peak
 * @property {string} daily_peak_date
 * @property {number} monthly_average
 * @property {number} monthly_peak
 * @property {string} monthly_peak_month
 * @property {number} active_days
 * @property {number} comment_count
 * @property {number} handoff_count
 * @property {Array<{ key: string, item_type: string, title: string, completed_at: string }>} recent_completions
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
 * @property {number} requirements
 * @property {number} tasks
 * @property {number} bugs
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
 * @property {{ total_items: number, active_items: number, high_priority_items: number }} summary
 * @property {{ item_type: string, q: string, status: string, priority: string, project_key: string, assignee_username: string, cycle_id: string, sort: string }} filters
 * @property {{ username: string, display_name: string }[]} assignees
 * @property {{ id: number, name: string, is_closed: boolean }[]} cycles
 * @property {{ key: string, title: string }[]} parent_options
 * @property {{ id: number, name: string, filters: AppWorkItemPage['filters'], per_page: number, is_default: boolean }[]} saved_views
 * @property {boolean} can_manage_work_items
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
 * @property {string} author_username
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

function formatAnalysisAverage(value) {
  return value.toFixed(2);
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

/** @param {string} itemKey @param {number} commentId @param {AppAttachment} attachment @returns {AppRichTextAttachmentOption} */
function workItemCommentAttachmentOption(itemKey, commentId, attachment) {
  return {
    id: attachment.id,
    filename: attachment.filename,
    contentType: attachment.content_type,
    url: `/api/v1/work-items/${encodeURIComponent(itemKey)}/comments/${commentId}/attachments/${attachment.id}/preview/content`,
  };
}

/** @param {string} projectKey @param {number} resourceId @param {AppAttachment} attachment @returns {AppRichTextAttachmentOption} */
function projectResourceAttachmentOption(projectKey, resourceId, attachment) {
  return {
    id: attachment.id,
    filename: attachment.filename,
    contentType: attachment.content_type,
    url: `/web/projects/${projectKey}/resources/${resourceId}/attachments/${attachment.id}/download`,
  };
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

function dashboardProjectStatus(status) {
  const labels = { not_started: '待启动', in_progress: '进行中', acceptance: '验收中', completed: '已完成', on_hold: '已暂停', cancelled: '已取消', archived: '已归档' };
  const tones = { not_started: 'info', in_progress: 'ok', acceptance: 'warning', completed: 'ok', on_hold: 'warning', cancelled: 'danger', archived: 'neutral' };
  return { label: labels[status] || status, tone: tones[status] || 'neutral' };
}

function dashboardTimestamp(value) {
  return String(value || '').replace('T', ' ').replace(/(?:\.\d+)?Z$/u, '');
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

function workItemCreateLabel(itemType) {
  return itemType === 'bug' ? '新建 Bug' : `新建${workItemTypeLabel(itemType)}`;
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

const WORK_ITEM_PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3'];

/** @param {AppWorkItemDetail} item @param {AppWorkItemComment | null} [primaryPost] */
function workItemEditFormFromDetail(item, primaryPost = null) {
  return {
    title: item.title || '',
    description: primaryPost?.body || plainTextToRichHtml(item.description || ''),
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
    case 'project-personal-analysis':
      return '仅统计当前用户在该项目中的实际处理与协作记录，所有口径由服务端统一聚合。';
    case 'requirements':
    case 'tasks':
    case 'bugs':
      return '工作项列表已在浏览器壳中验证筛选、分页和详情跳转，旧版 SSR 页面仍可作为兼容回退。';
    case 'work-item-detail':
      return '工作项详情已在浏览器壳中接入只读信息、评论浏览、核心字段编辑和推进并指派。';
    case 'system-dashboard':
      return '系统入口严格按当前主体的服务端权限返回，Browser 与 Desktop 共用同一管理导航事实。';
    case 'system-users':
      return '用户、角色候选、项目关系和分页由服务端原子读取，两个宿主不拼接管理事实。';
    case 'system-roles':
      return '角色分页、选中角色和权限集合由服务端原子读取，Browser 与 Desktop 共用同一角色工作台。';
    case 'system-permissions':
      return '权限点由服务端固定目录提供，两个宿主共用同一搜索和只读展示。';
    case 'system-database-stats':
      return '进入页面只读取当前宿主缓存；手动刷新后才读取最新表清单、备注和数据量。';
    case 'system-audit':
      return '关键系统操作按操作人、动作和对象过滤，两个宿主共用同一只读审计事实。';
    case 'system-api-docs':
      return '仓库内置的 system OpenAPI 契约由共享查看器解析，不加载远程脚本或嵌入页面。';
    case 'system-storage':
      return '当前配置、初始化检查和版本历史由服务端原子读取，敏感凭证始终只显示脱敏提示。';
    case 'system-openapi':
      return '系统 Token 的创建、scope 和生命周期由两个宿主共用，明文只在创建成功后展示一次。';
    case 'system-releases':
      return '保留策略、版本状态和平台资产由服务端原子读取，两个宿主共用同一发布工作台。';
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
    case 'project-personal-analysis':
      return 'Projects';
    case 'requirements':
    case 'tasks':
    case 'bugs':
    case 'work-item-detail':
      return 'Work Items';
    case 'system-dashboard':
    case 'system-users':
    case 'system-roles':
    case 'system-permissions':
    case 'system-database-stats':
    case 'system-audit':
    case 'system-api-docs':
    case 'system-storage':
    case 'system-openapi':
    case 'system-releases':
      return 'System';
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

function normalizeDatabaseStatsSnapshot(value) {
  if (!value || typeof value !== 'object' || typeof value.refreshed_at !== 'string' || !Array.isArray(value.tables) || value.tables.length > 500) return null;
  const tables = [];
  for (const table of value.tables) {
    if (!table || typeof table !== 'object' || typeof table.table_name !== 'string' || typeof table.remark !== 'string' || !Number.isSafeInteger(table.row_count) || table.row_count < 0 || !Number.isSafeInteger(table.column_count) || table.column_count < 0 || !Array.isArray(table.columns) || table.columns.length > 500) return null;
    const columns = [];
    for (const column of table.columns) {
      if (!column || typeof column !== 'object' || typeof column.name !== 'string' || typeof column.data_type !== 'string' || typeof column.required !== 'boolean' || typeof column.primary_key !== 'boolean' || !(column.default_value === null || typeof column.default_value === 'string')) return null;
      columns.push({ name: column.name, data_type: column.data_type, required: column.required, primary_key: column.primary_key, default_value: column.default_value });
    }
    tables.push({ table_name: table.table_name, remark: table.remark, row_count: table.row_count, column_count: table.column_count, columns });
  }
  return { refreshed_at: value.refreshed_at, tables };
}

function auditActionLabel(action) {
  return ({
    'auth.login': '用户登录', 'auth.login.failed': '登录失败', 'auth.logout': '用户退出', 'bootstrap.init': '首次初始化',
    'storage.config.save': '保存对象存储配置', 'storage.config.probe': '探测对象存储配置', 'storage.bucket.initialize': '初始化对象存储桶',
    'file.download': '下载附件', 'file.download.url': '生成附件下载链接', 'permission.denied': '权限拒绝',
    'user.create': '创建用户', 'user.status.update': '更新用户状态', 'user.password.reset': '重置用户密码',
    'role.create': '创建角色', 'role.status.update': '更新角色状态', 'role.permissions.update': '更新角色权限',
    'api_token.create': '创建访问 Token', 'api_token.update': '更新访问 Token', 'api_token.delete': '删除访问 Token',
    'project_resource.password.reset': '重置资料保险箱密码',
  })[action] || action;
}

function normalizeSystemApiDocs(payload) {
  if (!payload || typeof payload.source !== 'string' || payload.source.length > 128 * 1024) throw new Error('系统 OpenAPI 文档无效。');
  let spec;
  try { spec = JSON.parse(payload.source); } catch { throw new Error('系统 OpenAPI 文档不是有效 JSON。'); }
  if (!spec || typeof spec !== 'object' || Array.isArray(spec) || !spec.info || typeof spec.info !== 'object' || Array.isArray(spec.info) || !spec.paths || typeof spec.paths !== 'object' || Array.isArray(spec.paths)) throw new Error('系统 OpenAPI 文档结构无效。');
  const title = typeof spec.info.title === 'string' ? spec.info.title : '';
  const version = typeof spec.info.version === 'string' ? spec.info.version : '';
  const description = typeof spec.info.description === 'string' ? spec.info.description : '';
  if (!title || !version || typeof spec.openapi !== 'string') throw new Error('系统 OpenAPI 文档元信息不完整。');
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);
  const operations = [];
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (operations.length >= 200 || typeof path !== 'string' || !path.startsWith('/') || !pathItem || typeof pathItem !== 'object' || Array.isArray(pathItem)) throw new Error('系统 OpenAPI 端点结构无效。');
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!methods.has(method)) continue;
      if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw new Error('系统 OpenAPI 操作结构无效。');
      operations.push({
        id: `api-operation-${operations.length + 1}`,
        method: method.toUpperCase(),
        path,
        summary: typeof operation.summary === 'string' ? operation.summary : '未命名操作',
        description: typeof operation.description === 'string' ? operation.description : '',
        tags: Array.isArray(operation.tags) ? operation.tags.filter((tag) => typeof tag === 'string').slice(0, 20) : [],
        contract: JSON.stringify(operation, null, 2),
      });
    }
  }
  return {
    title, version, description, openapi: spec.openapi, operations,
    components: JSON.stringify(spec.components || {}, null, 2),
    source: JSON.stringify(spec, null, 2),
  };
}

/**
 * @param {{ services: {
 *   api: AppApiService,
 *   events: { supportsTopbarPolling?: boolean, supportsWorkItemTyping?: boolean, openTopbarEvents(callbacks: { onEvent: (event: object) => void }): () => void, openWorkItemEvents?(itemKey: string, callbacks: { onEvent: (event: object) => void }): () => void },
 *   files: AppFileService,
 *   router: AppRouterService,
 *   runtime: {
 *     scheduleFrame(callback: () => void): void,
 *     observeResize(elements: HTMLElement[], callback: () => void): () => void,
 *     getElementById(id: string): HTMLElement | null,
 *     readFormValue(form: HTMLFormElement, name: string): string,
 *     createSessionId?(): string,
 *     readTheme?(): 'light' | 'dark',
 *     writeTheme?(theme: 'light' | 'dark'): void,
 *     readDatabaseStatsCache?(username: string): Promise<any | null>,
 *     writeDatabaseStatsCache?(username: string, snapshot: any): Promise<void>,
 *   },
 * } }} props
 * @returns {React.ReactElement}
 */
export function SharedApp({ services }) {
  const { api: baseApi, events, files, router, runtime } = services;
  const [route, setRoute] = useState(() => router.currentRoute());
  const [apiErrorToast, setApiErrorToast] = useState(/** @type {{ id: number, message: string } | null} */ (null));
  const api = useMemo(
    () => createApiErrorWrappingProxy(baseApi, (caught) => {
      setApiErrorToast({ id: Date.now(), message: globalApiErrorMessage(caught) });
    }),
    [baseApi],
  );
  const routeRef = useRef(route);
  const topbarRef = useRef(/** @type {AppTopbarStatus | null} */ (null));
  const headingRef = useRef(/** @type {HTMLHeadingElement | null} */ (null));
  const mainRef = useRef(/** @type {HTMLElement | null} */ (null));
  const mainContentRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const scrollbarTrackRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const scrollbarDragRef = useRef(/** @type {{ pointerId: number, startY: number, startScrollTop: number } | null} */ (null));
  const requestRef = useRef(0);
  const profileActionRef = useRef(0);
  const accountSecurityActionRef = useRef(false);
  const projectSwitchRef = useRef(false);
  const projectMutationRef = useRef(false);
  const projectAttachmentActionRef = useRef(0);
  const projectAttachmentMutationRef = useRef(false);
  const projectResourceAttachmentActionRef = useRef(0);
  const projectResourceAttachmentMutationRef = useRef(false);
  const projectResourceCreateAttachmentKeyRef = useRef(0);
  const projectAttachmentPreviewRequestRef = useRef(0);
  const projectAttachmentPreviewCapabilityRef = useRef('');
  const projectResourceActionRef = useRef(0);
  const projectResourceMutationRef = useRef(0);
  const projectPersonalAnalysisSelectionRef = useRef(/** @type {{ projectKey: string, promise: Promise<unknown> } | null} */ (null));
  const workItemActionRef = useRef(0);
  const workItemMutationRef = useRef(false);
  const workItemMutationActionRef = useRef(0);
  const workItemPrimaryPostRetryRef = useRef(/** @type {{ itemKey: string, fields: string } | null} */ (null));
  const workItemAttachmentActionRef = useRef(0);
  const workItemAttachmentMutationRef = useRef(false);
  const workItemCommentDraftRef = useRef(/** @type {{ itemKey: string, commentId: number } | null} */ (null));
  const workItemTypingControllerRef = useRef(/** @type {ReturnType<typeof createWorkItemTypingController> | null} */ (null));
  const workItemTypingClientIdRef = useRef('');
  const workItemBatchMutationRef = useRef(false);
  const workItemCreateAttachmentMutationRef = useRef(false);
  const workItemCreatePasteTempIdRef = useRef(0);
  const routeLoadModeRef = useRef(/** @type {'load' | 'refresh'} */ ('load'));
  const [loading, setLoading] = useState(true);
  const [shellReady, setShellReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(/** @type {AppUser | null} */ (null));
  const [topbar, setTopbar] = useState(/** @type {AppTopbarStatus | null} */ (null));
  const [homeFeed, setHomeFeed] = useState(/** @type {AppNotificationFeed | null} */ (null));
  const [messageFeed, setMessageFeed] = useState(/** @type {AppNotificationFeed | null} */ (null));
  const [messageReadAllSubmitting, setMessageReadAllSubmitting] = useState(false);
  const [messageOpeningId, setMessageOpeningId] = useState(/** @type {number | null} */ (null));
  const [messageActionError, setMessageActionError] = useState('');
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
  const [projectResourceCreateCheckpoint, setProjectResourceCreateCheckpoint] = useState(/** @type {AppProjectResource | null} */ (null));
  const [projectResourceCreateAttachments, setProjectResourceCreateAttachments] = useState(/** @type {Array<{ key: number, file?: any, existingAttachment?: AppAttachment | null, uploadedAttachment?: AppAttachment | null, filename: string, contentType: string, byteSize: number, inline: boolean, alreadyInline?: boolean, stage: string, error: string }>} */ ([]));
  const [projectResourcePasteUploading, setProjectResourcePasteUploading] = useState(false);
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
  const [projectAttachmentPreview, setProjectAttachmentPreview] = useState(/** @type {{ open: boolean, loading: boolean, error: string, attachment: AppAttachment | null, source: string, kind: AppPreviewKind, fileType: string | null, position: number, total: number, previousId: number | null, nextId: number | null, commentId?: number } | null} */ (null));
  const [projectCycleDetail, setProjectCycleDetail] = useState(/** @type {AppProjectCycle | null} */ (null));
  const [projectPersonalAnalysis, setProjectPersonalAnalysis] = useState(/** @type {AppProjectPersonalAnalysis | null} */ (null));
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
  const [dashboard, setDashboard] = useState(/** @type {Awaited<ReturnType<AppApiService['getDashboard']>> | null} */ (null));
  const [systemDashboard, setSystemDashboard] = useState(/** @type {Awaited<ReturnType<AppApiService['getSystemDashboard']>> | null} */ (null));
  const [systemPermissions, setSystemPermissions] = useState(/** @type {Awaited<ReturnType<AppApiService['getSystemPermissions']>>} */ ([]));
  const [systemDatabaseStats, setSystemDatabaseStats] = useState(/** @type {{ snapshot: any, source: 'cache' | 'fresh' } | null} */ (null));
  const [systemDatabaseStatsRefreshing, setSystemDatabaseStatsRefreshing] = useState(false);
  const [systemDatabaseStatsError, setSystemDatabaseStatsError] = useState('');
  const systemDatabaseStatsRefreshRef = useRef(false);
  const [systemAuditPage, setSystemAuditPage] = useState(/** @type {Awaited<ReturnType<AppApiService['getSystemAuditLogs']>> | null} */ (null));
  const [systemApiDocs, setSystemApiDocs] = useState(/** @type {ReturnType<typeof normalizeSystemApiDocs> | null} */ (null));
  const [systemUsersView, setSystemUsersView] = useState(/** @type {Awaited<ReturnType<AppApiService['getSystemUsersView']>> | null} */ (null));
  const [systemRolesView, setSystemRolesView] = useState(/** @type {Awaited<ReturnType<AppApiService['getSystemRolesView']>> | null} */ (null));
  const [systemStorageView, setSystemStorageView] = useState(/** @type {Awaited<ReturnType<AppApiService['getSystemStorageView']>> | null} */ (null));
  const [systemOpenApiView, setSystemOpenApiView] = useState(/** @type {Awaited<ReturnType<AppApiService['getSystemOpenApiView']>> | null} */ (null));
  const [systemApiTokenEditor, setSystemApiTokenEditor] = useState(/** @type {{ mode: 'create' | 'edit', tokenId?: number } | null} */ (null));
  const [systemApiTokenForm, setSystemApiTokenForm] = useState({ name: '', scopes: ['system_release:read'] });
  const [systemApiTokenDeleteTarget, setSystemApiTokenDeleteTarget] = useState(/** @type {any | null} */ (null));
  const [systemApiTokenSubmitting, setSystemApiTokenSubmitting] = useState(false);
  const [systemApiTokenError, setSystemApiTokenError] = useState('');
  const [createdSystemApiToken, setCreatedSystemApiToken] = useState('');
  const systemApiTokenMutationRef = useRef(false);
  const [systemReleasesView, setSystemReleasesView] = useState(/** @type {Awaited<ReturnType<AppApiService['getSystemReleasesView']>> | null} */ (null));
  const [systemReleaseSettingsCount, setSystemReleaseSettingsCount] = useState(5);
  const [systemReleaseEditor, setSystemReleaseEditor] = useState(/** @type {{ mode: 'create' | 'edit', releaseId?: number } | null} */ (null));
  const [systemReleaseForm, setSystemReleaseForm] = useState({ versionName: '', title: '', notes: '', channel: 'legacy', manifestSha256: '', signingKeyId: '', sourceCommit: '', sourceTag: '' });
  const [systemReleaseConfirmation, setSystemReleaseConfirmation] = useState(/** @type {{ kind: 'publish' | 'verify' | 'withdraw', release: any, reason?: string } | null} */ (null));
  const [systemReleaseSubmitting, setSystemReleaseSubmitting] = useState(false);
  const [systemReleaseError, setSystemReleaseError] = useState('');
  const [systemReleaseAssetForm, setSystemReleaseAssetForm] = useState({ platform: 'windows', architecture: 'x64', artifactKind: 'installer' });
  const [systemReleaseAssetStage, setSystemReleaseAssetStage] = useState('');
  const [systemReleaseAssetDownloadingId, setSystemReleaseAssetDownloadingId] = useState(/** @type {number | null} */ (null));
  const [systemReleaseAssetDeleteTarget, setSystemReleaseAssetDeleteTarget] = useState(/** @type {any | null} */ (null));
  const systemReleaseMutationRef = useRef(false);
  const systemReleaseAssetGenerationRef = useRef(0);
  const [systemStorageEditOpen, setSystemStorageEditOpen] = useState(false);
  const [systemStorageForm, setSystemStorageForm] = useState({ endpoint: '', region: '', bucket: '', accessKeyId: '', accessKeySecret: '' });
  const [systemStorageConfirmation, setSystemStorageConfirmation] = useState(/** @type {{ kind: 'save', payload: any } | { kind: 'initialize' } | { kind: 'rollback', version: number, bucket: string } | null} */ (null));
  const [systemStorageSubmitting, setSystemStorageSubmitting] = useState(false);
  const [systemStorageError, setSystemStorageError] = useState('');
  const systemStorageMutationRef = useRef(false);
  const [systemRoleCreateOpen, setSystemRoleCreateOpen] = useState(false);
  const [systemRoleCreateForm, setSystemRoleCreateForm] = useState({ roleCode: '', roleName: '', dataScopeType: 'self' });
  const [systemRoleStatusTarget, setSystemRoleStatusTarget] = useState(/** @type {any | null} */ (null));
  const [systemRolePermissionKeys, setSystemRolePermissionKeys] = useState(/** @type {string[]} */ ([]));
  const [systemRoleSubmitting, setSystemRoleSubmitting] = useState(false);
  const [systemRoleError, setSystemRoleError] = useState('');
  const systemRoleMutationRef = useRef(false);
  const [systemUserCreateOpen, setSystemUserCreateOpen] = useState(false);
  const [systemUserCreateForm, setSystemUserCreateForm] = useState({ username: '', displayName: '', email: '', mobile: '', password: '', passwordConfirm: '', roleCode: '' });
  const [systemUserAction, setSystemUserAction] = useState(/** @type {{ kind: 'status' | 'role' | 'password', user: any } | null} */ (null));
  const [systemUserRoleCode, setSystemUserRoleCode] = useState('');
  const [systemUserPasswordForm, setSystemUserPasswordForm] = useState({ password: '', passwordConfirm: '' });
  const [systemUserProjectDialog, setSystemUserProjectDialog] = useState(/** @type {{ kind: 'manage' | 'remove-one' | 'remove-batch' | 'role', username: string, projectKey?: string } | null} */ (null));
  const [systemUserProjectAssignKeys, setSystemUserProjectAssignKeys] = useState(/** @type {string[]} */ ([]));
  const [systemUserProjectAssignRole, setSystemUserProjectAssignRole] = useState('member');
  const [systemUserProjectRemoveKeys, setSystemUserProjectRemoveKeys] = useState(/** @type {string[]} */ ([]));
  const [systemUserProjectRole, setSystemUserProjectRole] = useState('member');
  const [systemUserSubmitting, setSystemUserSubmitting] = useState(false);
  const [systemUserError, setSystemUserError] = useState('');
  const systemUserMutationRef = useRef(false);
  const [workItemPage, setWorkItemPage] = useState(/** @type {AppWorkItemPage | null} */ (null));
  const [workItemCreateOpen, setWorkItemCreateOpen] = useState(false);
  const [workItemCreateSubmitting, setWorkItemCreateSubmitting] = useState(false);
  const [workItemCreateError, setWorkItemCreateError] = useState('');
  const [workItemCreatePasteHint, setWorkItemCreatePasteHint] = useState('');
  const [workItemCreatePendingPastes, setWorkItemCreatePendingPastes] = useState(/** @type {WorkItemCreatePendingPaste[]} */ ([]));
  const [workItemCreateForm, setWorkItemCreateForm] = useState({ title: '', description: '', priority: 'P2', assigneeUsername: '', cycleId: '', dueDate: '', parentItemKey: '' });
  const [workItemCreateCheckpoint, setWorkItemCreateCheckpoint] = useState(/** @type {{ item: AppWorkItemDetail, primaryPostId: number | null } | null} */ (null));
  const [workItemCreatePasteUploading, setWorkItemCreatePasteUploading] = useState(false);
  const [workItemCreateAttachmentStatus, setWorkItemCreateAttachmentStatus] = useState('');
  const [workItemSelection, setWorkItemSelection] = useState(/** @type {Set<string>} */ (new Set()));
  const [workItemBatchForm, setWorkItemBatchForm] = useState({ action: 'priority', value: 'P2' });
  const [workItemBatchConfirmOpen, setWorkItemBatchConfirmOpen] = useState(false);
  const [workItemBatchSubmitting, setWorkItemBatchSubmitting] = useState(false);
  const [workItemBatchError, setWorkItemBatchError] = useState('');
  const [workItemDetail, setWorkItemDetail] = useState(/** @type {AppWorkItemDetail | null} */ (null));
  const [workItemDetailView, setWorkItemDetailView] = useState(/** @type {Awaited<ReturnType<AppApiService['getWorkItemDetailView']>> | null} */ (null));
  const [workItemComments, setWorkItemComments] = useState(/** @type {AppWorkItemComment[]} */ ([]));
  const [workItemTyping, setWorkItemTyping] = useState(/** @type {{ itemKey: string, users: Array<{ userId: number, displayName: string }> }} */ ({ itemKey: '', users: [] }));
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
  const [workItemLifecycleAction, setWorkItemLifecycleAction] = useState(/** @type {'close' | 'reopen' | 'restore' | null} */ (null));
  const [workItemLifecycleSubmitting, setWorkItemLifecycleSubmitting] = useState(false);
  const [workItemNewCommentBody, setWorkItemNewCommentBody] = useState('');
  const [workItemNewCommentDraftId, setWorkItemNewCommentDraftId] = useState(/** @type {number | null} */ (null));
  const [workItemNewCommentAttachmentUploading, setWorkItemNewCommentAttachmentUploading] = useState(false);
  const [workItemCommentSubmitting, setWorkItemCommentSubmitting] = useState(false);
  const [workItemEditingCommentId, setWorkItemEditingCommentId] = useState(/** @type {number | null} */ (null));
  const [workItemEditCommentBody, setWorkItemEditCommentBody] = useState('');
  const [workItemEditCommentSubmitting, setWorkItemEditCommentSubmitting] = useState(false);
  const [workItemReplyingToCommentId, setWorkItemReplyingToCommentId] = useState(/** @type {number | null} */ (null));
  const [workItemReplyCommentBody, setWorkItemReplyCommentBody] = useState('');
  const [workItemReplySubmitting, setWorkItemReplySubmitting] = useState(false);
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
  const [workItemCommentAttachmentDeleteTarget, setWorkItemCommentAttachmentDeleteTarget] = useState(/** @type {{ commentId: number, attachment: AppAttachment, editorContext: 'comment-edit' | 'primary-post' } | null} */ (null));
  const [workItemCommentAttachmentDeletingId, setWorkItemCommentAttachmentDeletingId] = useState(/** @type {number | null} */ (null));
  const [error, setError] = useState(/** @type {ApiError | Error | null} */ (null));
  const [statusMessage, setStatusMessage] = useState('');
  const [theme, setTheme] = useState(() => runtime.readTheme?.() || 'light');
  const [scrollbar, setScrollbar] = useState({ visible: false, top: 0, height: 44 });
  if (!workItemTypingClientIdRef.current && events.supportsWorkItemTyping) workItemTypingClientIdRef.current = runtime.createSessionId?.() || '';

  function syncScrollbar() {
    const main = mainRef.current;
    const track = scrollbarTrackRef.current;
    if (!main || !track) return;
    const maxScrollTop = main.scrollHeight - main.clientHeight;
    const trackHeight = track.clientHeight;
    if (maxScrollTop <= 1 || trackHeight <= 0) {
      setScrollbar((current) => current.visible ? { ...current, visible: false } : current);
      return;
    }
    const height = Math.max(44, Math.min(trackHeight, (main.clientHeight / main.scrollHeight) * trackHeight));
    const top = (main.scrollTop / maxScrollTop) * (trackHeight - height);
    setScrollbar({ visible: true, top, height });
  }

  useEffect(() => {
    if (!shellReady) return undefined;
    const main = mainRef.current;
    const content = mainContentRef.current;
    const track = scrollbarTrackRef.current;
    if (!main || !content || !track) return undefined;
    const sync = () => runtime.scheduleFrame(syncScrollbar);
    const stopObserving = runtime.observeResize([main, content, track], sync);
    main.addEventListener('scroll', syncScrollbar, { passive: true });
    sync();
    return () => {
      stopObserving();
      main.removeEventListener('scroll', syncScrollbar);
    };
  }, [shellReady]);

  function handleScrollbarPointerDown(event) {
    const main = mainRef.current;
    if (!main) return;
    scrollbarDragRef.current = { pointerId: event.pointerId, startY: event.clientY, startScrollTop: main.scrollTop };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleScrollbarPointerMove(event) {
    const drag = scrollbarDragRef.current;
    const main = mainRef.current;
    const track = scrollbarTrackRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !main || !track) return;
    const thumbTravel = track.clientHeight - scrollbar.height;
    const maxScrollTop = main.scrollHeight - main.clientHeight;
    if (thumbTravel > 0) main.scrollTop = drag.startScrollTop + ((event.clientY - drag.startY) / thumbTravel) * maxScrollTop;
  }

  function handleScrollbarPointerUp(event) {
    if (scrollbarDragRef.current?.pointerId !== event.pointerId) return;
    scrollbarDragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleScrollbarTrackPointerDown(event) {
    if (event.target !== event.currentTarget || !mainRef.current) return;
    const trackBounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - trackBounds.top) / trackBounds.height;
    mainRef.current.scrollTop = ratio * (mainRef.current.scrollHeight - mainRef.current.clientHeight);
  }

  const currentProject = topbar?.current_project || null;
  topbarRef.current = topbar;
  const homePath = buildHomePath(route.owner);
  const messagesPath = buildMessagesPath({ owner: route.owner });
  const profilePath = buildProfilePath(route.owner);
  const systemDatabaseTables = systemDatabaseStats?.snapshot?.tables || [];
  const systemDatabaseTotalRows = systemDatabaseTables.reduce((sum, table) => sum + Number(table.row_count || 0), 0);
  const projectsPath = route.id === 'projects'
    ? buildProjectsPath({ owner: route.owner, status: route.status, page: route.page, perPage: route.perPage })
    : buildProjectsPath({ owner: 'app' });
  const messageRoute = route.id === 'messages' ? route : null;
  const searchRoute = route.id === 'search' ? route : null;
  const projectRoute = route.id === 'projects' ? route : null;
  const projectDetailRoute = route.id === 'project-detail' ? route : null;
  const projectResourceDetailRoute = route.id === 'project-resource-detail' ? route : null;
  const projectPersonalAnalysisRoute = route.id === 'project-personal-analysis' ? route : null;
  const workItemListRoute = isWorkItemListRouteId(route.id) ? route : null;
  const workItemSelectionScope = workItemListRoute
    ? [workItemListRoute.itemType, workItemListRoute.projectKey || currentProject?.key || '', workItemListRoute.q, workItemListRoute.status, workItemListRoute.priority, workItemListRoute.assigneeUsername, workItemListRoute.cycleId, workItemListRoute.sort, workItemListRoute.perPage].join('|')
    : '';
  const workItemDetailRoute = route.id === 'work-item-detail' ? route : null;
  const workItemOwner = workItemOwnerForRoute(route);
  const workItemNavQuery = workItemListRoute
    ? {
      q: workItemListRoute.q,
      status: workItemListRoute.status,
      priority: workItemListRoute.priority,
      assigneeUsername: workItemListRoute.assigneeUsername,
      projectKey: workItemListRoute.projectKey,
      cycleId: workItemListRoute.cycleId,
      sort: workItemListRoute.sort,
      perPage: workItemListRoute.perPage,
    }
    : {};
  const requirementsPath = buildWorkItemListPath({ owner: workItemOwner, itemType: 'requirement', ...workItemNavQuery });
  const tasksPath = buildWorkItemListPath({ owner: workItemOwner, itemType: 'task', ...workItemNavQuery });
  const bugsPath = buildWorkItemListPath({ owner: workItemOwner, itemType: 'bug', ...workItemNavQuery });
  const messageFilter = /** @type {'all' | 'unread' | 'pending' | 'read'} */ (messageRoute ? messageRoute.filter : 'all');
  const previewItems = useMemo(() => (homeFeed?.items || []).slice(0, 8), [homeFeed]);
  const notificationActions = useMemo(() => createNotificationActionCoordinator({
    markAllRead: () => api.markAllNotificationsRead(),
    markRead: (notificationId) => api.markNotificationRead(notificationId),
    getTarget: (notificationId) => api.getNotificationTarget(notificationId),
    setCurrentProject: (projectKey) => api.updateCurrentProject(projectKey),
    currentProjectKey: () => topbarRef.current?.current_project?.key || '',
    refresh: () => loadRouteState(routeRef.current, 'refresh'),
    navigate: (path) => navigate(path, '正在打开消息目标。'),
    targetPath: (target) => notificationTargetPath(target, /** @type {'app' | 'web'} */ (routeRef.current.owner)),
    onState: (state) => {
      setMessageReadAllSubmitting(state.readAllPending);
      setMessageOpeningId(state.openingId);
    },
  }), [api]);
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
  const currentWorkItemKeys = workItemPage?.items.map((item) => item.key) || [];
  const currentWorkItemPageSelected = currentWorkItemKeys.length > 0 && currentWorkItemKeys.every((key) => workItemSelection.has(key));
  const activeWorkItemDetail = workItemDetailRoute && workItemDetail?.key === workItemDetailRoute.itemKey
    ? workItemDetail
    : null;
  const activeWorkItemDetailView = activeWorkItemDetail && workItemDetailView?.item?.key === activeWorkItemDetail.key
    ? workItemDetailView
    : null;
  const projectScopeKey = projectDetailRoute?.projectKey || projectResourceDetailRoute?.projectKey || projectPersonalAnalysisRoute?.projectKey || '';
  const activeProjectDetail = projectScopeKey && projectDetail?.key === projectScopeKey ? projectDetail : null;
  const personalAnalysisPath = buildProjectPersonalAnalysisPath({ owner: route.owner, projectKey: projectScopeKey });
  const personalAnalysisPendingTotal = projectPersonalAnalysis
    ? projectPersonalAnalysis.pending.requirements + projectPersonalAnalysis.pending.tasks + projectPersonalAnalysis.pending.bugs
    : 0;
  const personalAnalysisPendingLinks = projectPersonalAnalysis ? [
    { itemType: 'requirement', label: '需求', count: projectPersonalAnalysis.pending.requirements },
    { itemType: 'task', label: '任务', count: projectPersonalAnalysis.pending.tasks },
    { itemType: 'bug', label: 'Bug', count: projectPersonalAnalysis.pending.bugs },
  ].map((item) => ({
    ...item,
    path: buildWorkItemListPath({ owner: route.owner, itemType: item.itemType, projectKey: projectScopeKey, status: 'pending', assigneeUsername: projectPersonalAnalysis.username }),
  })) : [];
  const currentProjectMember = user ? projectMembers.find((member) => member.username === user.username) : null;
  const systemUserProjectTarget = systemUserProjectDialog
    ? systemUsersView?.items.find((item) => item.username === systemUserProjectDialog.username) || null
    : null;
  const systemUserAssignedProjectKeys = new Set((systemUserProjectTarget?.assigned_projects || []).map((project) => project.key));
  const systemUserAssignableProjects = (systemUsersView?.project_options || []).filter((project) => !systemUserAssignedProjectKeys.has(project.key));
  const systemRolePermissionGroups = useMemo(() => {
    const groups = new Map();
    for (const permission of systemRolesView?.permissions || []) {
      const key = permission.resource_key || permission.permission_key;
      const group = groups.get(key) || { key, pages: [], actions: [] };
      if (permission.resource_type === 'page') group.pages.push(permission);
      else group.actions.push(permission);
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [systemRolesView?.permissions]);
  const filteredSystemPermissions = useMemo(() => {
    const query = (route.q || '').toLocaleLowerCase();
    return systemPermissions.filter((permission) => !query || [permission.permission_name, permission.permission_key, permission.resource_type, permission.resource_key].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [route.q, systemPermissions]);
  const systemPermissionGroups = useMemo(() => {
    const groups = new Map();
    for (const permission of filteredSystemPermissions) {
      const key = permission.resource_key || permission.permission_key;
      const group = groups.get(key) || { key, permissions: [] };
      group.permissions.push(permission);
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [filteredSystemPermissions]);
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
  const workItemAttachmentSubmitting = workItemAttachmentUploading || workItemCommentAttachmentUploadingId !== null || workItemNewCommentAttachmentUploading;
  const workItemMutationSubmitting = workItemEditSubmitting
    || workItemHandoffSubmitting
    || workItemLifecycleSubmitting
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
      const draft = workItemCommentDraftRef.current;
      const targetItemKey = targetRoute.id === 'work-item-detail' ? targetRoute.itemKey : '';
      if (draft && draft.itemKey !== targetItemKey) {
        try {
          await api.cancelWorkItemCommentDraft(draft.itemKey, draft.commentId);
          if (workItemCommentDraftRef.current?.commentId === draft.commentId) {
            workItemCommentDraftRef.current = null;
            setWorkItemNewCommentDraftId(null);
          }
        } catch {
          setStatusMessage(`${draft.itemKey} 评论草稿自动清理失败，请稍后重试。`);
        }
      }
      if (targetRoute.id !== 'project-personal-analysis' && projectPersonalAnalysisSelectionRef.current) {
        projectPersonalAnalysisSelectionRef.current = { projectKey: '', promise: projectPersonalAnalysisSelectionRef.current.promise };
      }
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
      if (targetRoute.id === 'project-personal-analysis') {
        setProjectDetail(null);
        setProjectPersonalAnalysis(null);
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
        setWorkItemLifecycleAction(null);
        setWorkItemLifecycleSubmitting(false);
        setWorkItemNewCommentBody('');
        setWorkItemNewCommentDraftId(null);
        setWorkItemNewCommentAttachmentUploading(false);
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
        setWorkItemCommentAttachmentDeleteTarget(null);
        setWorkItemCommentAttachmentDeletingId(null);
        setWorkItemFormKey('');
      }
    } else {
      setRefreshing(true);
    }

    let routeLoadWarning = null;
    try {
      if (targetRoute.id === 'project-personal-analysis') {
        const projectKey = String(targetRoute.projectKey);
        let selection = projectPersonalAnalysisSelectionRef.current;
        if (!selection || selection.projectKey !== projectKey) {
          const previous = selection?.promise || Promise.resolve();
          selection = {
            projectKey,
            promise: previous.catch(() => {}).then(() => api.updateCurrentProject(projectKey)),
          };
          projectPersonalAnalysisSelectionRef.current = selection;
        }
        try {
          await selection.promise;
        } catch (caught) {
          if (projectPersonalAnalysisSelectionRef.current === selection) projectPersonalAnalysisSelectionRef.current = null;
          throw caught;
        }
        if (requestRef.current !== requestId) return;
      }
      const [nextUser, nextTopbar, nextDashboard, nextProfile, nextFeed, nextProjects, nextSearch, nextWorkItems, nextWorkItemBundle, nextSecurity, nextProjectBundle, nextCycleDetailBundle, nextResourceDetailBundle, nextPersonalAnalysisBundle, nextSystemDashboard, nextSystemPermissions, nextSystemUsersView, nextSystemRolesView, nextSystemStorageView, nextSystemOpenApiView, nextSystemReleasesView, nextSystemAuditPage, nextSystemApiDocs] = await Promise.all([
        api.getCurrentUser(),
        api.getTopbarStatus(),
        ['home', 'profile', 'projects'].includes(targetRoute.id)
          ? api.getDashboard().catch((caught) => {
            const caughtError = caught instanceof Error ? /** @type {Error & { status?: number }} */ (caught) : null;
            routeLoadWarning = caughtError?.status === 404
              ? new Error('当前服务端尚未提供工作台聚合接口，请先发布配套 API 版本。')
              : (caughtError || new Error('工作台数据加载失败。'));
            return null;
          })
          : Promise.resolve(null),
        targetRoute.id === 'profile' ? api.getOwnProfile() : Promise.resolve(null),
        targetRoute.id === 'projects' || targetRoute.id === 'project-detail' || targetRoute.id === 'project-cycle-detail' || targetRoute.id === 'project-resource-detail' || targetRoute.id === 'project-personal-analysis' || targetRoute.id === 'search' || targetRoute.id === 'profile' || isWorkItemListRouteId(targetRoute.id) || targetRoute.id === 'work-item-detail'
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
          ? api.getWorkItemListView({
            itemType: targetRoute.itemType,
            q: targetRoute.q,
            status: targetRoute.status,
            priority: targetRoute.priority,
            assigneeUsername: targetRoute.assigneeUsername,
            projectKey: targetRoute.projectKey,
            cycleId: targetRoute.cycleId,
            sort: targetRoute.sort,
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
            const [detailView, comments, attachmentBundle] = await Promise.all([
              api.getWorkItemDetailView(itemKey),
              commentsPromise,
              commentsPromise.then((comments) => loadWorkItemAttachmentBundle(api, itemKey, comments, attachmentsPromise)),
            ]);
            return {
              detailView,
              item: detailView.item,
              comments: comments.filter((comment) => comment.id !== detailView.primary_post?.id),
              attachmentBundle,
            };
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
        targetRoute.id === 'project-personal-analysis'
          ? Promise.all([
            api.getProject(targetRoute.projectKey),
            api.getProjectPersonalAnalysis(targetRoute.projectKey),
          ])
          : Promise.resolve(null),
        targetRoute.id === 'system-dashboard'
          ? api.getSystemDashboard()
          : Promise.resolve(null),
        targetRoute.id === 'system-permissions'
          ? api.getSystemPermissions()
          : Promise.resolve(null),
        targetRoute.id === 'system-users'
          ? api.getSystemUsersView({ page: targetRoute.page, perPage: targetRoute.perPage })
          : Promise.resolve(null),
        targetRoute.id === 'system-roles'
          ? api.getSystemRolesView({ role: targetRoute.role, page: targetRoute.page, perPage: targetRoute.perPage })
          : Promise.resolve(null),
        targetRoute.id === 'system-storage'
          ? api.getSystemStorageView({ page: targetRoute.page, perPage: targetRoute.perPage })
          : Promise.resolve(null),
        targetRoute.id === 'system-openapi'
          ? api.getSystemOpenApiView()
          : Promise.resolve(null),
        targetRoute.id === 'system-releases'
          ? api.getSystemReleasesView({ page: targetRoute.page, perPage: targetRoute.perPage })
          : Promise.resolve(null),
        targetRoute.id === 'system-audit'
          ? api.getSystemAuditLogs({ actor: targetRoute.actor, action: targetRoute.action, targetType: targetRoute.targetType, targetId: targetRoute.targetId, page: targetRoute.page, perPage: targetRoute.perPage })
          : Promise.resolve(null),
        targetRoute.id === 'system-api-docs'
          ? api.getSystemApiDocs().then(normalizeSystemApiDocs)
          : Promise.resolve(null),
      ]);
      if (requestRef.current !== requestId) {
        return;
      }
      setUser(nextUser);
      setTopbar(nextTopbar);
      if (targetRoute.id === 'home') setDashboard(nextDashboard);
      if (targetRoute.id === 'profile' && nextProfile) {
        setDashboard(nextDashboard);
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
        setDashboard(nextDashboard);
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
      if (targetRoute.id === 'project-personal-analysis') {
        setProjectDetail(nextPersonalAnalysisBundle?.[0] || null);
        setProjectPersonalAnalysis(nextPersonalAnalysisBundle?.[1] || null);
      }
      if (targetRoute.id === 'search') {
        setSearchPage(nextSearch);
      }
      if (targetRoute.id === 'system-dashboard') {
        setSystemDashboard(nextSystemDashboard);
      }
      if (targetRoute.id === 'system-permissions') setSystemPermissions(nextSystemPermissions || []);
      if (targetRoute.id === 'system-database-stats') {
        const cached = normalizeDatabaseStatsSnapshot(nextUser && runtime.readDatabaseStatsCache ? await runtime.readDatabaseStatsCache(nextUser.username) : null);
        if (requestRef.current !== requestId) return;
        setSystemDatabaseStats(cached ? { snapshot: cached, source: 'cache' } : null);
        setSystemDatabaseStatsError('');
      }
      if (targetRoute.id === 'system-users') {
        setSystemUsersView(nextSystemUsersView);
      }
      if (targetRoute.id === 'system-roles') {
        setSystemRolesView(nextSystemRolesView);
        setSystemRolePermissionKeys((nextSystemRolesView?.permissions || []).filter((permission) => permission.granted).map((permission) => permission.permission_key));
        setSystemRoleError('');
      }
      if (targetRoute.id === 'system-storage') setSystemStorageView(nextSystemStorageView);
      if (targetRoute.id === 'system-openapi') {
        setSystemOpenApiView(nextSystemOpenApiView);
        if (mode === 'load') setCreatedSystemApiToken('');
      }
      if (targetRoute.id === 'system-releases') {
        setSystemReleasesView(nextSystemReleasesView);
        setSystemReleaseSettingsCount(nextSystemReleasesView?.settings.retention_count || 5);
      }
      if (targetRoute.id === 'system-audit') setSystemAuditPage(nextSystemAuditPage);
      if (targetRoute.id === 'system-api-docs') setSystemApiDocs(nextSystemApiDocs);
      if (isWorkItemListRouteId(targetRoute.id)) {
        setWorkItemPage(nextWorkItems);
      }
      if (targetRoute.id === 'work-item-detail') {
        setWorkItemDetailView(nextWorkItemBundle?.detailView || null);
        setWorkItemDetail(nextWorkItemBundle?.item || null);
        setWorkItemComments(nextWorkItemBundle?.comments || []);
        setWorkItemAttachments(nextWorkItemBundle?.attachmentBundle?.attachments || []);
        setWorkItemCommentAttachments(nextWorkItemBundle?.attachmentBundle?.commentAttachments || {});
        setWorkItemAttachmentLoadWarning(
          nextWorkItemBundle?.attachmentBundle?.loadFailed ? '部分附件列表加载失败，请刷新重试。' : '',
        );
      }
      api.restorePendingReturnToHash();
      setError(routeLoadWarning);
    } catch (caught) {
      if (requestRef.current !== requestId) {
        return;
      }
      setError(new Error(globalApiErrorMessage(caught)));
    } finally {
      if (requestRef.current === requestId) {
        setShellReady(true);
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
    const currentRoute = routeRef.current;
    const targetUrl = new URL(path, 'http://yuance.local');
    const targetRoute = parseAppRoute(targetUrl.pathname, targetUrl.search, targetUrl.hash);
    if (targetRoute.id === currentRoute.id && targetRoute.pathname === currentRoute.pathname) {
      routeLoadModeRef.current = 'refresh';
    }
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

  /** @param {AppAttachment} attachment */
  async function openWorkItemAttachmentPreview(attachment) {
    if (!activeWorkItemDetail || !attachmentIsUploaded(attachment)) return;
    const itemKey = activeWorkItemDetail.key;
    const requestId = projectAttachmentPreviewRequestRef.current + 1;
    projectAttachmentPreviewRequestRef.current = requestId;
    const previousCapability = projectAttachmentPreviewCapabilityRef.current;
    projectAttachmentPreviewCapabilityRef.current = '';
    if (previousCapability && typeof files.attachments?.releaseProjectAttachmentPreview === 'function') void files.attachments.releaseProjectAttachmentPreview(previousCapability).catch(() => {});
    setProjectAttachmentPreview({ open: true, loading: true, error: '', attachment, source: '', kind: null, fileType: null, position: 0, total: 0, previousId: null, nextId: null });
    try {
      /** @type {{ capability: string, source: string, attachment: AppAttachment, preview: any, navigation: any }} */
      let result;
      if (typeof files.attachments?.openWorkItemAttachmentPreview === 'function') {
        const hostResult = await files.attachments.openWorkItemAttachmentPreview({ itemKey, attachmentId: attachment.id });
        result = { capability: hostResult.capability, source: hostResult.source, attachment: hostResult.attachment, preview: hostResult.preview, navigation: hostResult.navigation };
      } else {
        const browserResult = await api.getWorkItemAttachmentPreview(itemKey, attachment.id);
        result = { capability: '', source: browserResult.content_url, attachment: browserResult.attachment, preview: browserResult.preview, navigation: browserResult.navigation };
      }
      if (projectAttachmentPreviewRequestRef.current !== requestId || !isCurrentWorkItemDetailRoute(itemKey)) {
        if (result.capability && typeof files.attachments?.releaseProjectAttachmentPreview === 'function') void files.attachments.releaseProjectAttachmentPreview(result.capability).catch(() => {});
        return;
      }
      projectAttachmentPreviewCapabilityRef.current = result.capability || '';
      setProjectAttachmentPreview({ open: true, loading: false, error: '', attachment: result.attachment, source: result.source, kind: result.preview.kind, fileType: result.preview.file_type, position: result.navigation.position, total: result.navigation.total, previousId: result.navigation.previous?.id || null, nextId: result.navigation.next?.id || null });
    } catch (caught) {
      if (projectAttachmentPreviewRequestRef.current === requestId && isCurrentWorkItemDetailRoute(itemKey)) setProjectAttachmentPreview((current) => current ? { ...current, loading: false, error: errorMessage(caught instanceof Error ? caught : new Error('预览加载失败。')) } : current);
    }
  }

  function navigateWorkItemAttachmentPreview(attachmentId) {
    const attachment = workItemAttachments.find((item) => item.id === attachmentId);
    if (attachment) void openWorkItemAttachmentPreview(attachment);
  }

  /** @param {number} commentId @param {AppAttachment} attachment */
  async function openWorkItemCommentAttachmentPreview(commentId, attachment) {
    if (!activeWorkItemDetail || !attachmentIsUploaded(attachment)) return;
    const itemKey = activeWorkItemDetail.key;
    const requestId = projectAttachmentPreviewRequestRef.current + 1;
    projectAttachmentPreviewRequestRef.current = requestId;
    const previousCapability = projectAttachmentPreviewCapabilityRef.current;
    projectAttachmentPreviewCapabilityRef.current = '';
    if (previousCapability && typeof files.attachments?.releaseProjectAttachmentPreview === 'function') void files.attachments.releaseProjectAttachmentPreview(previousCapability).catch(() => {});
    setProjectAttachmentPreview({ open: true, loading: true, error: '', attachment, source: '', kind: null, fileType: null, position: 0, total: 0, previousId: null, nextId: null, commentId });
    try {
      let result;
      if (typeof files.attachments?.openWorkItemCommentAttachmentPreview === 'function') {
        const hostResult = await files.attachments.openWorkItemCommentAttachmentPreview({ itemKey, commentId, attachmentId: attachment.id });
        result = { ...hostResult, capability: hostResult.capability || '' };
      } else {
        const browserResult = await api.getWorkItemCommentAttachmentPreview(itemKey, commentId, attachment.id);
        result = { ...browserResult, source: browserResult.preview.content_enabled ? browserResult.content_url : '', capability: '' };
      }
      if (projectAttachmentPreviewRequestRef.current !== requestId || !isCurrentWorkItemDetailRoute(itemKey)) {
        if (result.capability && typeof files.attachments?.releaseProjectAttachmentPreview === 'function') void files.attachments.releaseProjectAttachmentPreview(result.capability).catch(() => {});
        return;
      }
      projectAttachmentPreviewCapabilityRef.current = result.capability || '';
      setProjectAttachmentPreview({ open: true, loading: false, error: '', attachment: result.attachment, source: result.source, kind: result.preview.kind, fileType: result.preview.file_type, position: result.navigation.position, total: result.navigation.total, previousId: result.navigation.previous?.id || null, nextId: result.navigation.next?.id || null, commentId });
    } catch (caught) {
      if (projectAttachmentPreviewRequestRef.current === requestId && isCurrentWorkItemDetailRoute(itemKey)) setProjectAttachmentPreview((current) => current ? { ...current, loading: false, error: errorMessage(caught instanceof Error ? caught : new Error('评论附件预览加载失败。')) } : current);
    }
  }

  function navigateWorkItemCommentAttachmentPreview(attachmentId) {
    const commentId = projectAttachmentPreview?.commentId;
    if (!commentId) return;
    const attachment = (workItemCommentAttachments[String(commentId)] || []).find((entry) => entry.id === attachmentId);
    if (attachment) void openWorkItemCommentAttachmentPreview(commentId, attachment);
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

  /** @param {number} commentId @param {number} attachmentId */
  async function resolveWorkItemCommentInlineAttachmentSource(commentId, attachmentId) {
    const itemKey = activeWorkItemDetail?.key;
    const attachmentPlatform = files.attachments;
    if (!itemKey) throw new Error('inline preview unavailable');
    if (typeof attachmentPlatform?.openWorkItemCommentAttachmentPreview === 'function' && typeof attachmentPlatform.releaseProjectAttachmentPreview === 'function') {
      const result = await attachmentPlatform.openWorkItemCommentAttachmentPreview({ itemKey, commentId, attachmentId });
      return { source: result.source, release: async () => { await attachmentPlatform.releaseProjectAttachmentPreview(result.capability); } };
    }
    const browserResult = await api.getWorkItemCommentAttachmentPreview(itemKey, commentId, attachmentId);
    return { source: browserResult.preview.content_enabled ? browserResult.content_url : '' };
  }

  /** @param {number} attachmentId */
  async function resolveWorkItemPrimaryPostInlineAttachmentSource(attachmentId) {
    const commentId = activeWorkItemDetailView?.primary_post?.id;
    if (!commentId) throw new Error('inline preview unavailable');
    return resolveWorkItemCommentInlineAttachmentSource(commentId, attachmentId);
  }

  /** @param {number} commentId @param {number} attachmentId */
  function activateWorkItemCommentInlineAttachment(commentId, attachmentId) {
    const attachment = (workItemCommentAttachments[String(commentId)] || []).find((entry) => entry.id === attachmentId);
    if (attachment && attachmentIsUploaded(attachment)) void openWorkItemCommentAttachmentPreview(commentId, attachment);
  }

  /** @param {number} attachmentId */
  function activateWorkItemPrimaryPostInlineAttachment(attachmentId) {
    const commentId = activeWorkItemDetailView?.primary_post?.id;
    if (commentId) activateWorkItemCommentInlineAttachment(commentId, attachmentId);
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

  async function refreshSystemUsersAfterMutation() {
    const current = routeRef.current;
    if (current.id !== 'system-users') return;
    const view = await api.getSystemUsersView({ page: current.page, perPage: current.perPage });
    if (routeRef.current.id === 'system-users' && routeRef.current.pathname === current.pathname && routeRef.current.search === current.search) setSystemUsersView(view);
  }

  async function runSystemUserMutation(action, successMessage) {
    if (systemUserMutationRef.current) return false;
    systemUserMutationRef.current = true;
    setSystemUserSubmitting(true);
    setSystemUserError('');
    try {
      await action();
      setStatusMessage(successMessage);
      try {
        await refreshSystemUsersAfterMutation();
      } catch (caught) {
        const detail = errorMessage(caught instanceof Error ? caught : new Error('用户列表刷新失败。'));
        setSystemUserError(`操作已成功，但用户列表刷新失败：${detail}`);
      }
      return true;
    } catch (caught) {
      let detail = errorMessage(caught instanceof Error ? caught : new Error('用户操作失败。'));
      try {
        await refreshSystemUsersAfterMutation();
      } catch (refreshError) {
        detail = `${detail}；最终状态刷新失败：${errorMessage(refreshError instanceof Error ? refreshError : new Error('用户列表刷新失败。'))}`;
      }
      setSystemUserError(detail);
      return false;
    } finally {
      systemUserMutationRef.current = false;
      setSystemUserSubmitting(false);
    }
  }

  async function refreshSystemRolesAfterMutation(roleCode = '') {
    const current = routeRef.current;
    if (current.id !== 'system-roles') return null;
    const view = await api.getSystemRolesView({ role: roleCode || current.role, page: current.page, perPage: current.perPage });
    if (routeRef.current.id === 'system-roles' && routeRef.current.pathname === current.pathname && routeRef.current.search === current.search) {
      setSystemRolesView(view);
      setSystemRolePermissionKeys(view.permissions.filter((permission) => permission.granted).map((permission) => permission.permission_key));
    }
    return view;
  }

  async function runSystemRoleMutation(action, successMessage, roleCode = '') {
    if (systemRoleMutationRef.current) return false;
    systemRoleMutationRef.current = true;
    setSystemRoleSubmitting(true);
    setSystemRoleError('');
    try {
      await action();
      setStatusMessage(successMessage);
      try { await refreshSystemRolesAfterMutation(roleCode); }
      catch (caught) { setSystemRoleError(`操作已成功，但角色工作台刷新失败：${errorMessage(caught instanceof Error ? caught : new Error('刷新失败。'))}`); }
      return true;
    } catch (caught) {
      setSystemRoleError(errorMessage(caught instanceof Error ? caught : new Error('角色操作失败。')));
      return false;
    } finally {
      systemRoleMutationRef.current = false;
      setSystemRoleSubmitting(false);
    }
  }

  async function submitSystemRoleCreate(event) {
    event.preventDefault();
    const roleCode = systemRoleCreateForm.roleCode.trim();
    const created = await runSystemRoleMutation(() => api.createSystemRole(roleCode, systemRoleCreateForm.roleName.trim(), systemRoleCreateForm.dataScopeType), '角色已创建。', roleCode);
    if (!created) return;
    setSystemRoleCreateOpen(false);
    setSystemRoleCreateForm({ roleCode: '', roleName: '', dataScopeType: 'self' });
    const totalItems = (systemRolesView?.pagination.total_items || 0) + 1;
    const perPage = systemRolesView?.pagination.per_page || 10;
    navigate(buildSystemRolesPath({ owner: route.owner, role: roleCode, page: Math.max(1, Math.ceil(totalItems / perPage)), perPage }), `正在打开${roleCode}。`);
  }

  async function confirmSystemRoleStatus() {
    if (!systemRoleStatusTarget) return;
    const nextStatus = systemRoleStatusTarget.status === 'active' ? 'disabled' : 'active';
    const updated = await runSystemRoleMutation(() => api.updateSystemRoleStatus(systemRoleStatusTarget.role_code, nextStatus), `角色已${nextStatus === 'active' ? '启用' : '禁用'}。`, systemRoleStatusTarget.role_code);
    if (updated) setSystemRoleStatusTarget(null);
  }

  function toggleSystemRolePermission(permission, checked) {
    if (!systemRolesView?.can_edit_permissions || systemRoleSubmitting) return;
    const group = systemRolePermissionGroups.find((item) => item.key === permission.resource_key);
    setSystemRolePermissionKeys((current) => {
      const next = new Set(current);
      if (permission.resource_type === 'page') {
        for (const item of [...(group?.pages || []), ...(group?.actions || [])]) checked ? next.add(item.permission_key) : next.delete(item.permission_key);
      } else if (checked) {
        next.add(permission.permission_key);
        for (const pagePermission of group?.pages || []) next.add(pagePermission.permission_key);
      } else next.delete(permission.permission_key);
      return [...next].sort();
    });
  }

  function toggleSystemRolePermissionGroup(group, checked) {
    if (!systemRolesView?.can_edit_permissions || systemRoleSubmitting) return;
    setSystemRolePermissionKeys((current) => {
      const next = new Set(current);
      for (const permission of [...group.pages, ...group.actions]) checked ? next.add(permission.permission_key) : next.delete(permission.permission_key);
      return [...next].sort();
    });
  }

  async function submitSystemRolePermissions(event) {
    event.preventDefault();
    const roleCode = systemRolesView?.selected_role?.role_code;
    if (!roleCode || !systemRolesView?.can_edit_permissions) return;
    await runSystemRoleMutation(() => api.updateSystemRolePermissions(roleCode, [...systemRolePermissionKeys].sort()), '角色权限已保存。', roleCode);
  }

  async function refreshSystemStorageAfterMutation() {
    const current = routeRef.current;
    if (current.id !== 'system-storage') return null;
    const view = await api.getSystemStorageView({ page: current.page, perPage: current.perPage });
    if (routeRef.current.id === 'system-storage' && routeRef.current.pathname === current.pathname && routeRef.current.search === current.search) setSystemStorageView(view);
    return view;
  }

  async function refreshSystemOpenApiAfterMutation() {
    const current = routeRef.current;
    if (current.id !== 'system-openapi') return null;
    const view = await api.getSystemOpenApiView();
    if (routeRef.current.id === 'system-openapi' && routeRef.current.pathname === current.pathname) setSystemOpenApiView(view);
    return view;
  }

  async function refreshSystemDatabaseStats() {
    const target = routeRef.current;
    if (target.id !== 'system-database-stats' || !user || systemDatabaseStatsRefreshRef.current) return;
    const requestId = requestRef.current;
    const username = user.username;
    systemDatabaseStatsRefreshRef.current = true;
    setSystemDatabaseStatsRefreshing(true);
    setSystemDatabaseStatsError('');
    try {
      const snapshot = normalizeDatabaseStatsSnapshot(await api.getSystemDatabaseStats());
      if (!snapshot) throw new Error('数据库统计响应格式无效。');
      await runtime.writeDatabaseStatsCache?.(username, snapshot);
      if (requestRef.current !== requestId || routeRef.current.pathname !== target.pathname || routeRef.current.search !== target.search) return;
      setSystemDatabaseStats({ snapshot, source: 'fresh' });
      setStatusMessage('数据库统计已刷新。');
    } catch (caught) {
      if (requestRef.current === requestId && routeRef.current.pathname === target.pathname && routeRef.current.search === target.search) {
        setSystemDatabaseStatsError(errorMessage(caught instanceof Error ? caught : new Error('数据库统计刷新失败。')));
      }
    } finally {
      systemDatabaseStatsRefreshRef.current = false;
      setSystemDatabaseStatsRefreshing(false);
    }
  }

  async function runSystemApiTokenMutation(action, successMessage) {
    if (systemApiTokenMutationRef.current) return null;
    systemApiTokenMutationRef.current = true;
    setSystemApiTokenSubmitting(true);
    setSystemApiTokenError('');
    try {
      const result = await action();
      setStatusMessage(successMessage);
      try { await refreshSystemOpenApiAfterMutation(); }
      catch (caught) { setSystemApiTokenError(`操作已成功，但 Token 列表刷新失败：${errorMessage(caught instanceof Error ? caught : new Error('刷新失败。'))}`); }
      return result;
    } catch (caught) {
      let detail = errorMessage(caught instanceof Error ? caught : new Error('系统 Token 操作失败。'));
      try { await refreshSystemOpenApiAfterMutation(); }
      catch (refreshError) { detail = `${detail}；最终状态刷新失败：${errorMessage(refreshError instanceof Error ? refreshError : new Error('刷新失败。'))}`; }
      setSystemApiTokenError(detail);
      return null;
    } finally {
      systemApiTokenMutationRef.current = false;
      setSystemApiTokenSubmitting(false);
    }
  }

  function openSystemApiTokenCreate() {
    setSystemApiTokenError('');
    setCreatedSystemApiToken('');
    setSystemApiTokenForm({ name: '', scopes: ['system_release:read'] });
    setSystemApiTokenEditor({ mode: 'create' });
  }

  function openSystemApiTokenEdit(token) {
    setSystemApiTokenError('');
    setCreatedSystemApiToken('');
    setSystemApiTokenForm({ name: token.name, scopes: [...token.scopes] });
    setSystemApiTokenEditor({ mode: 'edit', tokenId: token.id });
  }

  function toggleSystemApiTokenScope(scope, checked) {
    setSystemApiTokenForm((current) => ({
      ...current,
      scopes: checked ? [...new Set([...current.scopes, scope])] : current.scopes.filter((value) => value !== scope),
    }));
  }

  async function submitSystemApiToken(event) {
    event.preventDefault();
    if (!systemApiTokenEditor || !systemApiTokenForm.name.trim() || systemApiTokenForm.scopes.length === 0) return;
    const result = systemApiTokenEditor.mode === 'create'
      ? await runSystemApiTokenMutation(() => api.createSystemApiToken(systemApiTokenForm.name.trim(), systemApiTokenForm.scopes), '系统 Token 已创建。')
      : await runSystemApiTokenMutation(() => api.updateSystemApiToken(Number(systemApiTokenEditor.tokenId), systemApiTokenForm.name.trim(), systemApiTokenForm.scopes), '系统 Token 已更新。');
    if (!result) return;
    if (systemApiTokenEditor.mode === 'create') setCreatedSystemApiToken(result.raw_token || '');
    setSystemApiTokenEditor(null);
  }

  async function confirmSystemApiTokenDelete() {
    if (!systemApiTokenDeleteTarget) return;
    const deleted = await runSystemApiTokenMutation(() => api.deleteSystemApiToken(systemApiTokenDeleteTarget.id), '系统 Token 已删除。');
    if (deleted) setSystemApiTokenDeleteTarget(null);
  }

  async function refreshSystemReleasesAfterMutation() {
    const current = routeRef.current;
    if (current.id !== 'system-releases') return null;
    const view = await api.getSystemReleasesView({ page: current.page, perPage: current.perPage });
    if (routeRef.current.id === 'system-releases' && routeRef.current.pathname === current.pathname && routeRef.current.search === current.search) {
      setSystemReleasesView(view);
      setSystemReleaseSettingsCount(view.settings.retention_count);
    }
    return view;
  }

  async function runSystemReleaseMutation(action, successMessage) {
    if (systemReleaseMutationRef.current) return false;
    systemReleaseMutationRef.current = true;
    setSystemReleaseSubmitting(true);
    setSystemReleaseError('');
    try {
      await action();
      setStatusMessage(successMessage);
      try { await refreshSystemReleasesAfterMutation(); }
      catch (caught) { setSystemReleaseError(`操作已成功，但发布工作台刷新失败：${errorMessage(caught instanceof Error ? caught : new Error('刷新失败。'))}`); }
      return true;
    } catch (caught) {
      let detail = errorMessage(caught instanceof Error ? caught : new Error('发布操作失败。'));
      try { await refreshSystemReleasesAfterMutation(); }
      catch (refreshError) { detail = `${detail}；最终状态刷新失败：${errorMessage(refreshError instanceof Error ? refreshError : new Error('刷新失败。'))}`; }
      setSystemReleaseError(detail);
      return false;
    } finally {
      systemReleaseMutationRef.current = false;
      setSystemReleaseSubmitting(false);
    }
  }

  function openSystemReleaseCreate() {
    setSystemReleaseError('');
    setSystemReleaseForm({ versionName: '', title: '', notes: '', channel: 'legacy', manifestSha256: '', signingKeyId: '', sourceCommit: '', sourceTag: '' });
    setSystemReleaseEditor({ mode: 'create' });
  }

  function openSystemReleaseEdit(release) {
    setSystemReleaseError('');
    setSystemReleaseForm({
      versionName: release.version_name, title: release.title, notes: release.notes, channel: release.channel,
      manifestSha256: release.manifest_sha256, signingKeyId: release.signing_key_id,
      sourceCommit: release.source_commit, sourceTag: release.source_tag,
    });
    setSystemReleaseEditor({ mode: 'edit', releaseId: release.id });
  }

  async function submitSystemReleaseSettings(event) {
    event.preventDefault();
    await runSystemReleaseMutation(() => api.updateSystemReleaseSettings(systemReleaseSettingsCount), '发布保留策略已更新。');
  }

  async function submitSystemReleaseEditor(event) {
    event.preventDefault();
    const releaseId = systemReleaseEditor?.mode === 'edit' ? systemReleaseEditor.releaseId : undefined;
    if (systemReleaseEditor?.mode === 'edit' && !releaseId) return;
    const editing = releaseId !== undefined;
    const saved = await runSystemReleaseMutation(
      () => editing
        ? api.updateSystemRelease(releaseId, { versionName: systemReleaseForm.versionName, title: systemReleaseForm.title, notes: systemReleaseForm.notes, publish: false })
        : api.createSystemRelease(systemReleaseForm),
      editing ? '版本草稿已更新。' : '版本草稿已创建。',
    );
    if (saved) setSystemReleaseEditor(null);
  }

  async function confirmSystemReleaseAction() {
    const confirmation = systemReleaseConfirmation;
    if (!confirmation) return;
    const release = confirmation.release;
    let action;
    let message;
    if (confirmation.kind === 'publish') {
      action = () => api.updateSystemRelease(release.id, { versionName: release.version_name, title: release.title, notes: release.notes, publish: true });
      message = `${release.version_name} 已发布。`;
    } else if (confirmation.kind === 'verify') {
      action = () => api.verifySystemRelease(release.id);
      message = `${release.version_name} 已通过发布校验。`;
    } else {
      action = () => api.withdrawSystemRelease(release.id, confirmation.reason || '');
      message = `${release.version_name} 已撤回。`;
    }
    const completed = await runSystemReleaseMutation(action, message);
    if (completed) setSystemReleaseConfirmation(null);
  }

  async function uploadSelectedSystemReleaseAsset() {
    const releaseId = systemReleaseEditor?.mode === 'edit' ? systemReleaseEditor.releaseId : undefined;
    if (!releaseId || systemReleaseSubmitting) return;
    setSystemReleaseError('');
    let file;
    try { file = await files.files.chooseFile(); }
    catch (caught) { setSystemReleaseError(errorMessage(caught instanceof Error ? caught : new Error('文件选择失败。'))); return; }
    if (!file) return;
    const generation = ++systemReleaseAssetGenerationRef.current;
    systemReleaseMutationRef.current = true;
    setSystemReleaseSubmitting(true);
    setSystemReleaseAssetStage('registering');
    try {
      const result = await uploadSystemReleaseAsset({
        api, platform: files, releaseId, platformName: systemReleaseAssetForm.platform,
        architecture: systemReleaseAssetForm.architecture, artifactKind: systemReleaseAssetForm.artifactKind, file,
        lifecycle: {
          isCurrent: () => generation === systemReleaseAssetGenerationRef.current && routeRef.current.id === 'system-releases',
          onStage: setSystemReleaseAssetStage,
          onCreated() {}, onUploaded() {}, refresh: refreshSystemReleasesAfterMutation,
        },
      });
      if (result.completed) setStatusMessage(`${file.filename} 已上传。`);
      if (result.refreshError) setSystemReleaseError(`文件已上传，但发布工作台刷新失败：${errorMessage(result.refreshError instanceof Error ? result.refreshError : new Error('刷新失败。'))}`);
    } catch (caught) {
      setSystemReleaseError(errorMessage(caught instanceof Error ? caught : new Error('版本资产上传失败。')));
      try { await refreshSystemReleasesAfterMutation(); }
      catch (_refreshError) { /* 原上传错误优先展示。 */ }
    } finally {
      if (generation === systemReleaseAssetGenerationRef.current) {
        systemReleaseMutationRef.current = false;
        setSystemReleaseSubmitting(false);
        setSystemReleaseAssetStage('');
      }
    }
  }

  async function downloadSystemReleaseAsset(asset) {
    if (systemReleaseAssetDownloadingId !== null) return;
    const generation = systemReleaseAssetGenerationRef.current;
    setSystemReleaseAssetDownloadingId(asset.id);
    setSystemReleaseError('');
    try {
      const result = await downloadSystemReleaseAssetUseCase({ api, platform: files, releaseId: asset.release_id, assetId: asset.id, suggestedFilename: asset.filename, isCurrent: () => generation === systemReleaseAssetGenerationRef.current && routeRef.current.id === 'system-releases' });
      if (result.status === 'completed') setStatusMessage(`${asset.filename} 下载已开始。`);
    } catch (caught) { setSystemReleaseError(errorMessage(caught instanceof Error ? caught : new Error('版本资产下载失败。'))); }
    finally { setSystemReleaseAssetDownloadingId(null); }
  }

  async function deleteSystemReleaseAsset() {
    const asset = systemReleaseAssetDeleteTarget;
    if (!asset) return;
    const completed = await runSystemReleaseMutation(() => api.deleteSystemReleaseAsset(asset.release_id, asset.id), `${asset.filename} 已删除。`);
    if (completed) setSystemReleaseAssetDeleteTarget(null);
  }

  async function runSystemStorageMutation(action, successMessage) {
    if (systemStorageMutationRef.current) return false;
    systemStorageMutationRef.current = true;
    setSystemStorageSubmitting(true);
    setSystemStorageError('');
    try {
      const result = await action();
      setStatusMessage(typeof successMessage === 'function' ? successMessage(result) : successMessage);
      try {
        await refreshSystemStorageAfterMutation();
      } catch (caught) {
        setSystemStorageError(`操作已成功，但存储工作台刷新失败：${errorMessage(caught instanceof Error ? caught : new Error('刷新失败。'))}`);
      }
      return true;
    } catch (caught) {
      let detail = errorMessage(caught instanceof Error ? caught : new Error('存储操作失败。'));
      try { await refreshSystemStorageAfterMutation(); }
      catch (refreshError) { detail = `${detail}；最终状态刷新失败：${errorMessage(refreshError instanceof Error ? refreshError : new Error('刷新失败。'))}`; }
      setSystemStorageError(detail);
      return false;
    } finally {
      systemStorageMutationRef.current = false;
      setSystemStorageSubmitting(false);
    }
  }

  function openSystemStorageEdit() {
    if (!systemStorageView?.can_manage_storage || systemStorageSubmitting) return;
    const config = systemStorageView.config;
    setSystemStorageForm({
      endpoint: config?.endpoint || 'https://oss-cn-hangzhou.aliyuncs.com',
      region: config?.region || 'oss-cn-hangzhou',
      bucket: config?.bucket || 'yuance-files',
      accessKeyId: '', accessKeySecret: '',
    });
    setSystemStorageError('');
    setSystemStorageEditOpen(true);
  }

  function closeSystemStorageEdit() {
    if (systemStorageSubmitting) return;
    setSystemStorageEditOpen(false);
    setSystemStorageForm({ endpoint: '', region: '', bucket: '', accessKeyId: '', accessKeySecret: '' });
  }

  async function executeSystemStorageSave(payload) {
    const completed = await runSystemStorageMutation(
      () => api.saveStorageConfig(payload),
      payload.activate ? '对象存储配置已保存并激活。' : '对象存储配置草稿已保存。',
    );
    if (completed) closeSystemStorageEdit();
    return completed;
  }

  async function requestSystemStorageSave(activate) {
    const form = /** @type {HTMLFormElement | null} */ (runtime.getElementById('system-storage-form'));
    if (!form?.checkValidity()) { form?.reportValidity(); return; }
    const payload = {
      endpoint: systemStorageForm.endpoint.trim(), region: systemStorageForm.region.trim(), bucket: systemStorageForm.bucket.trim(),
      accessKeyId: systemStorageForm.accessKeyId.trim(), accessKeySecret: systemStorageForm.accessKeySecret, activate,
    };
    const current = systemStorageView?.config;
    if (current && (current.endpoint !== payload.endpoint || current.bucket !== payload.bucket)) {
      setSystemStorageConfirmation({ kind: 'save', payload });
      return;
    }
    await executeSystemStorageSave(payload);
  }

  async function probeSystemStorage() {
    await runSystemStorageMutation(() => api.probeStorageConfig(), (result) => result?.message || '对象存储连接检测完成。');
  }

  async function confirmSystemStorageAction() {
    const confirmation = systemStorageConfirmation;
    if (!confirmation || systemStorageSubmitting) return;
    let completed = false;
    if (confirmation.kind === 'save') completed = await executeSystemStorageSave(confirmation.payload);
    else if (confirmation.kind === 'initialize') completed = await runSystemStorageMutation(() => api.initializeStorageConfig(), (result) => result?.message || '对象存储 Bucket 已初始化。');
    else completed = await runSystemStorageMutation(() => api.rollbackStorageConfig(confirmation.version), `已回滚到 v${confirmation.version} 的配置快照并生成新的激活版本。`);
    if (completed) setSystemStorageConfirmation(null);
  }

  async function submitSystemUserCreate(event) {
    event.preventDefault();
    if (systemUserCreateForm.password !== systemUserCreateForm.passwordConfirm) { setSystemUserError('两次输入的密码不一致。'); return; }
    const completed = await runSystemUserMutation(() => api.createSystemUser(systemUserCreateForm), `用户 ${systemUserCreateForm.username} 已创建。`);
    if (completed) { setSystemUserCreateOpen(false); setSystemUserCreateForm({ username: '', displayName: '', email: '', mobile: '', password: '', passwordConfirm: '', roleCode: '' }); }
  }

  function closeSystemUserCreate() {
    if (systemUserSubmitting) return;
    setSystemUserCreateOpen(false);
    setSystemUserCreateForm({ username: '', displayName: '', email: '', mobile: '', password: '', passwordConfirm: '', roleCode: '' });
    setSystemUserError('');
  }

  function closeSystemUserAction() {
    if (systemUserSubmitting) return;
    setSystemUserAction(null);
    setSystemUserRoleCode('');
    setSystemUserPasswordForm({ password: '', passwordConfirm: '' });
    setSystemUserError('');
  }

  function closeSystemUserProjects() {
    if (systemUserSubmitting) return;
    setSystemUserProjectDialog(null);
    setSystemUserProjectAssignKeys([]);
    setSystemUserProjectRemoveKeys([]);
    setSystemUserProjectRole('member');
    setSystemUserError('');
  }

  function openSystemUserProjects(item) {
    setSystemUserError('');
    setSystemUserProjectAssignKeys([]);
    setSystemUserProjectRemoveKeys([]);
    setSystemUserProjectAssignRole('member');
    setSystemUserProjectDialog({ kind: 'manage', username: item.username });
  }

  async function submitSystemUserProjectAssign(event) {
    event.preventDefault();
    if (!systemUserProjectTarget || systemUserProjectAssignKeys.length === 0) { setSystemUserError('请至少选择一个要分配的项目。'); return; }
    const completed = await runSystemUserMutation(
      () => api.assignSystemUserProjects(systemUserProjectTarget.username, systemUserProjectAssignKeys, systemUserProjectAssignRole),
      `已为 ${systemUserProjectTarget.display_name} 分配 ${systemUserProjectAssignKeys.length} 个项目。`,
    );
    if (completed) setSystemUserProjectAssignKeys([]);
  }

  async function confirmSystemUserProjectRemove() {
    if (!systemUserProjectTarget || !systemUserProjectDialog) return;
    const keys = systemUserProjectDialog.kind === 'remove-one'
      ? [systemUserProjectDialog.projectKey || '']
      : systemUserProjectRemoveKeys;
    const completed = await runSystemUserMutation(
      () => systemUserProjectDialog.kind === 'remove-one'
        ? api.removeSystemUserProject(systemUserProjectTarget.username, keys[0])
        : api.removeSystemUserProjects(systemUserProjectTarget.username, keys),
      `已移除 ${systemUserProjectTarget.display_name} 的 ${keys.length} 个项目关系。`,
    );
    if (completed) { setSystemUserProjectRemoveKeys([]); setSystemUserProjectDialog({ kind: 'manage', username: systemUserProjectTarget.username }); }
  }

  async function submitSystemUserProjectRole(event) {
    event.preventDefault();
    const projectKey = systemUserProjectDialog?.projectKey;
    if (!systemUserProjectTarget || !projectKey) return;
    const completed = await runSystemUserMutation(
      () => api.updateSystemUserProjectRole(systemUserProjectTarget.username, projectKey, systemUserProjectRole),
      `${systemUserProjectTarget.display_name} 的项目角色已更新。`,
    );
    if (completed) setSystemUserProjectDialog({ kind: 'manage', username: systemUserProjectTarget.username });
  }

  async function submitSystemUserRole(event) {
    event.preventDefault();
    if (!systemUserAction || systemUserAction.kind !== 'role') return;
    const completed = await runSystemUserMutation(() => api.updateSystemUserRole(systemUserAction.user.username, systemUserRoleCode), `${systemUserAction.user.display_name} 的全局角色已更新。`);
    if (completed) setSystemUserAction(null);
  }

  async function submitSystemUserPassword(event) {
    event.preventDefault();
    if (!systemUserAction || systemUserAction.kind !== 'password') return;
    if (systemUserPasswordForm.password !== systemUserPasswordForm.passwordConfirm) { setSystemUserError('两次输入的密码不一致。'); return; }
    const completed = await runSystemUserMutation(() => api.resetSystemUserPassword(systemUserAction.user.username, systemUserPasswordForm.password), `${systemUserAction.user.display_name} 的密码已重置，现有会话已撤销。`);
    if (completed) { setSystemUserAction(null); setSystemUserPasswordForm({ password: '', passwordConfirm: '' }); }
  }

  async function confirmSystemUserStatus() {
    if (!systemUserAction || systemUserAction.kind !== 'status') return;
    const targetStatus = systemUserAction.user.status === 'active' ? 'disabled' : 'active';
    const completed = await runSystemUserMutation(() => api.updateSystemUserStatus(systemUserAction.user.username, targetStatus), `${systemUserAction.user.display_name} 已${targetStatus === 'active' ? '启用' : '停用'}。`);
    if (completed) setSystemUserAction(null);
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
    if (!resource) { setProjectResourceCreateCheckpoint(null); setProjectResourceCreateAttachments([]); }
    setProjectResourceModalOpen(true);
  }

  async function chooseProjectResourceCreateAttachment(index = -1) {
    if (projectResourceSubmitting) return;
    setProjectResourceError('');
    let file;
    try { file = await files.files.chooseFile(); }
    catch (caught) { setProjectResourceError(errorMessage(caught instanceof Error ? caught : new Error('选择资料附件失败。'))); return; }
    if (!file) return;
    if (!file.byteSize || file.byteSize <= 0) { setProjectResourceError('请选择非空文件。'); return; }
    if (index >= 0) {
      setProjectResourceCreateAttachments((entries) => entries.map((entry, entryIndex) => {
        if (entryIndex !== index) return entry;
        if (entry.filename !== file.filename || entry.contentType !== file.contentType || entry.byteSize !== file.byteSize) {
          setProjectResourceError(`请选择与 ${entry.filename} 名称、类型和大小一致的原文件。`);
          return entry;
        }
        return { ...entry, file, stage: '已重新选择，等待上传', error: '' };
      }));
      return;
    }
    projectResourceCreateAttachmentKeyRef.current += 1;
    setProjectResourceCreateAttachments((entries) => [...entries, { key: projectResourceCreateAttachmentKeyRef.current, file, filename: file.filename || 'attachment.bin', contentType: file.contentType, byteSize: file.byteSize, inline: true, stage: '等待上传', error: '' }]);
  }

  function closeProjectResourceForm() {
    if (projectResourceSubmitting || projectResourcePasteUploading) return;
    if (projectResourceCreateCheckpoint) {
      const current = routeRef.current;
      const path = buildProjectResourceDetailPath({ owner: current.owner, projectKey: String(current.projectKey || ''), resourceId: projectResourceCreateCheckpoint.id });
      setProjectResourceModalOpen(false);
      setProjectResourceCreateCheckpoint(null);
      setProjectResourceCreateAttachments([]);
      navigate(path, '已打开刚创建的项目资料。');
      return;
    }
    setProjectResourceModalOpen(false);
    setProjectResourceForm((current) => ({ ...current, accessPassword: '' }));
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
    if (projectResourceMutationRef.current || projectResourceAttachmentMutationRef.current || (editing && current.id !== 'project-resource-detail') || (!editing && (current.id !== 'project-detail' || current.tab !== 'resources'))) return;
    if (!richTextHasContent(projectResourceForm.body)) { setProjectResourceError('资料正文不能为空。'); return; }
    const projectKey = String(current.projectKey || '');
    const resourceId = editing ? projectResourceForm.id : 0;
    const actionId = projectResourceActionRef.current + 1;
    projectResourceActionRef.current = actionId;
    projectResourceMutationRef.current = actionId;
    setProjectResourceSubmitting(true);
    setProjectResourceError('');
    let committedCreateResource = projectResourceCreateCheckpoint;
    const isCurrent = () => {
      const active = routeRef.current;
      return projectResourceActionRef.current === actionId
        && active.projectKey === projectKey
        && (editing ? active.id === 'project-resource-detail' && active.resourceId === resourceId : active.id === 'project-detail' && active.tab === 'resources');
    };
    try {
      const payload = projectResourcePayload();
      let resource;
      if (editing) resource = await api.updateProjectResource(projectKey, resourceId, payload);
      else if (projectResourceCreateCheckpoint) {
        resource = await api.updateProjectResource(projectKey, projectResourceCreateCheckpoint.id, payload);
        committedCreateResource = resource;
        setProjectResourceCreateCheckpoint(resource);
        if (projectResourceCreateAttachments.length) {
          const result = await createProjectResourceWithAttachments({
            api, platform: files, projectKey, payload, resource,
            attachments: projectResourceCreateAttachments.map((entry) => ({
              file: entry.file,
              existingAttachment: entry.existingAttachment,
              uploadedAttachment: entry.uploadedAttachment,
              inlineHtml: entry.inline && !entry.alreadyInline ? (/** @type {AppProjectResource} */ created, /** @type {AppAttachment} */ attachment) => richTextAttachmentHtml({
                id: attachment.id,
                filename: entry.filename,
                contentType: entry.contentType,
                url: `/web/projects/${projectKey}/resources/${created.id}/attachments/${attachment.id}/download`,
              }) : undefined,
            })),
            lifecycle: {
              isCurrent,
              onResourceCreated: () => {},
              onAttachmentStage: (index, stage) => setProjectResourceCreateAttachments((entries) => entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, stage: { registering: '正在登记', signing: '正在获取上传签名', uploading: '正在上传', confirming: '正在确认上传结果' }[stage], error: '' } : entry)),
              onAttachmentCreated: (index, /** @type {AppAttachment} */ attachment) => setProjectResourceCreateAttachments((entries) => entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, existingAttachment: attachment } : entry)),
              onAttachmentUploaded: (index, /** @type {AppAttachment} */ attachment) => setProjectResourceCreateAttachments((entries) => entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, uploadedAttachment: attachment, file: undefined, stage: '上传完成', error: '' } : entry)),
              onBodySaved: (/** @type {AppProjectResource} */ updated) => setProjectResourceCreateCheckpoint(updated),
            },
          });
          resource = result.resource;
          if (!result.completed) return;
        }
      }
      else if (projectResourceCreateAttachments.length) {
        const result = await createProjectResourceWithAttachments({
          api, platform: files, projectKey, payload, resource: projectResourceCreateCheckpoint,
          attachments: projectResourceCreateAttachments.map((entry) => ({
            file: entry.file,
            existingAttachment: entry.existingAttachment,
            uploadedAttachment: entry.uploadedAttachment,
            inlineHtml: entry.inline && !entry.alreadyInline ? (/** @type {AppProjectResource} */ created, /** @type {AppAttachment} */ attachment) => richTextAttachmentHtml({
              id: attachment.id,
              filename: entry.filename,
              contentType: entry.contentType,
              url: `/web/projects/${projectKey}/resources/${created.id}/attachments/${attachment.id}/download`,
            }) : undefined,
          })),
          lifecycle: {
            isCurrent,
            onResourceCreated: (/** @type {AppProjectResource} */ created) => { committedCreateResource = created; setProjectResourceCreateCheckpoint(created); setProjectResourceStatus(`资料“${created.title}”已创建，正在上传附件。`); },
            onAttachmentStage: (index, stage) => setProjectResourceCreateAttachments((entries) => entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, stage: { registering: '正在登记', signing: '正在获取上传签名', uploading: '正在上传', confirming: '正在确认上传结果' }[stage], error: '' } : entry)),
            onAttachmentCreated: (index, /** @type {AppAttachment} */ attachment) => setProjectResourceCreateAttachments((entries) => entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, existingAttachment: attachment } : entry)),
            onAttachmentUploaded: (index, /** @type {AppAttachment} */ attachment) => setProjectResourceCreateAttachments((entries) => entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, uploadedAttachment: attachment, file: undefined, stage: '上传完成', error: '' } : entry)),
            onBodySaved: (/** @type {AppProjectResource} */ updated) => setProjectResourceCreateCheckpoint(updated),
          },
        });
        resource = result.resource;
        if (!result.completed) return;
      } else resource = await api.createProjectResource(projectKey, payload);
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
        setProjectResourceCreateCheckpoint(null);
        setProjectResourceCreateAttachments([]);
        setProjectResourceModalOpen(false);
        setProjectResourceStatus(`资料“${resource.title}”已创建。`);
      }
    } catch (caught) {
      if (isCurrent()) {
        if (!editing && committedCreateResource) setProjectResourceCreateAttachments((entries) => entries.map((entry) => entry.uploadedAttachment ? entry : { ...entry, file: undefined, stage: entry.existingAttachment ? '上传未完成，需要重新选择原文件' : '等待重新选择', error: '上传未完成' }));
        setProjectResourceError(errorMessage(caught instanceof Error ? caught : new Error(editing ? '资料更新失败。' : '资料创建失败。')));
      }
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

  /** @param {AppAttachment | null} [existingAttachment] @param {import('@yuance/frontend-platform-contract').PastedFile | null} [pastedFile] @returns {Promise<AppAttachment | null>} */
  async function uploadSelectedProjectResourceAttachment(existingAttachment = null, pastedFile = null) {
    const current = routeRef.current;
    if (current.id !== 'project-resource-detail' || !projectResourceDetail || projectResourceLocked || projectResourceDetail.status === 'archived' || projectResourceAttachmentMutationRef.current || projectResourceMutationRef.current) return null;
    const projectKey = String(current.projectKey || '');
    const resourceId = Number(current.resourceId);
    const actionId = projectResourceAttachmentActionRef.current + 1;
    projectResourceAttachmentActionRef.current = actionId;
    projectResourceAttachmentMutationRef.current = true;
    setProjectResourceAttachmentUploading(true);
    setProjectResourceError('');
    setProjectResourceAttachmentStatus('正在选择资料附件。');
    let file;
    try {
      const selectPastedFile = files.selectPastedFile;
      if (pastedFile) {
        if (typeof selectPastedFile !== 'function') throw new Error('当前环境不支持粘贴文件。');
        file = await selectPastedFile(pastedFile);
      } else {
        file = await files.files.chooseFile();
      }
    }
    catch (caught) {
      if (isCurrentProjectResourceAttachmentRoute(projectKey, resourceId, actionId)) setProjectResourceError(errorMessage(caught instanceof Error ? caught : new Error('选择资料附件失败。')));
      clearProjectResourceAttachmentUpload(actionId); return null;
    }
    if (!isCurrentProjectResourceAttachmentRoute(projectKey, resourceId, actionId) || !file) {
      if (isCurrentProjectResourceAttachmentRoute(projectKey, resourceId, actionId)) setProjectResourceAttachmentStatus('已取消选择资料附件。');
      clearProjectResourceAttachmentUpload(actionId); return null;
    }
    if (!file.byteSize || file.byteSize <= 0) {
      setProjectResourceError('请选择非空文件。'); setProjectResourceAttachmentStatus(`${file.filename || '文件'} 未上传。`);
      clearProjectResourceAttachmentUpload(actionId); return null;
    }
    const filename = file.filename || 'attachment.bin';
    if (existingAttachment && (filename !== existingAttachment.filename || file.contentType !== existingAttachment.content_type || file.byteSize !== existingAttachment.byte_size)) {
      setProjectResourceError(`请选择与 ${existingAttachment.filename} 名称、类型和大小一致的原文件。`);
      clearProjectResourceAttachmentUpload(actionId); return null;
    }
    let createdAttachment = /** @type {AppAttachment | null} */ (null);
    let completedUpload = /** @type {AppAttachment | null} */ (null);
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
        completedUpload = result.uploaded || null;
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
    return completedUpload;
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
      : route.id === 'system-dashboard'
        ? '系统管理 - 元策'
      : route.id === 'system-users'
        ? '用户管理 - 元策'
      : route.id === 'system-roles'
        ? '角色权限 - 元策'
      : route.id === 'system-permissions'
        ? '权限目录 - 元策'
      : route.id === 'system-database-stats'
        ? '数据库统计 - 元策'
      : route.id === 'system-audit'
        ? '审计日志 - 元策'
      : route.id === 'system-api-docs'
        ? '系统 API 文档 - 元策'
      : route.id === 'system-storage'
        ? '对象存储 - 元策'
      : route.id === 'system-openapi'
        ? '系统 OpenAPI - 元策'
      : route.id === 'system-releases'
        ? '版本管理 - 元策'
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
          : route.id === 'project-personal-analysis' && activeProjectDetail
            ? `我的项目分析 - ${activeProjectDetail.name} - 元策`
            : route.id === 'project-personal-analysis'
              ? '个人项目分析 - 元策'
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
    const mode = routeLoadModeRef.current;
    routeLoadModeRef.current = 'load';
    void loadRouteState(route, mode);
  }, [route]);

  useEffect(() => {
    if (!apiErrorToast) return undefined;
    const timer = setTimeout(() => setApiErrorToast(null), 5000);
    return () => clearTimeout(timer);
  }, [apiErrorToast]);

  useEffect(() => {
    setWorkItemSelection(new Set());
    setWorkItemBatchConfirmOpen(false);
    setWorkItemBatchError('');
  }, [workItemSelectionScope]);

  useEffect(() => {
    if (workItemPage && !workItemPage.can_manage_work_items) setWorkItemSelection(new Set());
  }, [workItemPage?.can_manage_work_items]);

  useEffect(() => () => {
    const capability = projectAttachmentPreviewCapabilityRef.current;
    projectAttachmentPreviewCapabilityRef.current = '';
    if (capability && typeof files.attachments?.releaseProjectAttachmentPreview === 'function') void files.attachments.releaseProjectAttachmentPreview(capability).catch(() => {});
  }, [files]);

  useEffect(() => {
    if (!activeWorkItemDetail || workItemFormKey === activeWorkItemDetail.key) {
      return;
    }
    setWorkItemEditForm(workItemEditFormFromDetail(activeWorkItemDetail, activeWorkItemDetailView?.primary_post || null));
    setWorkItemHandoffForm(workItemHandoffFormFromDetail(activeWorkItemDetail));
    setWorkItemActionError('');
    setWorkItemNewCommentBody('');
    setWorkItemEditingCommentId(null);
    setWorkItemEditCommentBody('');
    setWorkItemReplyingToCommentId(null);
    setWorkItemReplyCommentBody('');
    setWorkItemCommentActionError('');
    setWorkItemFormKey(activeWorkItemDetail.key);
  }, [activeWorkItemDetail, activeWorkItemDetailView?.primary_post, workItemFormKey]);

  useEffect(() => {
    return router.subscribe(() => {
      setStatusMessage('已根据浏览器历史恢复页面。');
      syncRouteFromLocation();
    });
  }, [router]);

  useEffect(() => {
    const coordinator = createNotificationEventCoordinator({
      refresh: () => loadRouteState(routeRef.current, 'refresh'),
      onNavigate: (path) => router.assign(path),
    });
    const pollingCoordinator = createNotificationEventCoordinator({
      refresh: async () => {
        const status = await baseApi.getTopbarStatus();
        setTopbar(status);
      },
    });
    const close = events.openTopbarEvents({
      onEvent: (event) => coordinator.handle(event),
    });
    const pollingTimer = events.supportsTopbarPolling
      ? setInterval(() => pollingCoordinator.invalidate(), 30_000)
      : null;
    return () => {
      if (pollingTimer !== null) clearInterval(pollingTimer);
      pollingCoordinator.dispose();
      coordinator.dispose();
      close();
    };
  }, [baseApi, events, router]);

  useEffect(() => {
    const itemKey = route.id === 'work-item-detail' ? route.itemKey || '' : '';
    setWorkItemTyping({ itemKey, users: [] });
    if (!itemKey || typeof events.openWorkItemEvents !== 'function') return undefined;
    const coordinator = createWorkItemEventCoordinator({
      itemKey,
      refresh: () => refreshWorkItemRealtimeState(itemKey),
      onTyping: (users) => {
        const current = routeRef.current;
        if (current.id === 'work-item-detail' && current.itemKey === itemKey) setWorkItemTyping({ itemKey, users: [...users] });
      },
    });
    const clientId = workItemTypingClientIdRef.current;
    const typingController = events.supportsWorkItemTyping && clientId && typeof baseApi.updateWorkItemTyping === 'function'
      ? createWorkItemTypingController({ itemKey, clientId, send: (key, payload) => baseApi.updateWorkItemTyping(key, payload) })
      : null;
    workItemTypingControllerRef.current = typingController;
    const close = events.openWorkItemEvents(itemKey, { onEvent: (event) => coordinator.handle(event) });
    return () => {
      if (workItemTypingControllerRef.current === typingController) workItemTypingControllerRef.current = null;
      typingController?.dispose();
      coordinator.dispose();
      close();
    };
  }, [baseApi, events, route.id, route.itemKey]);

  function startWorkItemTyping() { workItemTypingControllerRef.current?.start(); }
  function recordWorkItemTypingActivity() { workItemTypingControllerRef.current?.activity(); }
  function stopWorkItemTyping() { workItemTypingControllerRef.current?.stop(); }

  useEffect(() => {
    if (!loading) {
      runtime.scheduleFrame(() => {
        const commentId = route.id === 'work-item-detail' ? route.commentId : null;
        const target = commentId ? runtime.getElementById(`comment-${commentId}`) : null;
        if (target) {
          target.focus({ preventScroll: true });
          target.scrollIntoView({ block: 'center' });
        } else {
          headingRef.current?.focus();
        }
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
    setMessageActionError('');
    try {
      await notificationActions.open(item);
    } catch (caught) {
      setMessageActionError(errorMessage(caught instanceof Error ? caught : new Error('消息目标暂不可用。')));
    }
  }

  async function handleMarkAllRead() {
    setMessageActionError('');
    try {
      await notificationActions.markAll();
      setStatusMessage('消息已全部标为已读。');
    } catch (caught) {
      setMessageActionError(errorMessage(caught instanceof Error ? caught : new Error('标记消息失败。')));
    }
  }

  /** @param {{ key: string, name: string, pending_count?: number }} project */
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

  /** @param {string} value */
  function changeWorkItemNewComment(value) {
    setWorkItemNewCommentBody(value);
  }

  /** @param {string} value */
  function changeWorkItemEditComment(value) {
    setWorkItemEditCommentBody(value);
  }

  /** @param {AppWorkItemComment} comment */
  function startWorkItemCommentEdit(comment) {
    setWorkItemReplyingToCommentId(null);
    setWorkItemReplyCommentBody('');
    setWorkItemEditingCommentId(comment.id);
    setWorkItemEditCommentBody(comment.body_format === 'html' ? comment.body : plainTextToRichHtml(comment.body || ''));
    setWorkItemCommentActionError('');
    runtime.scheduleFrame(() => runtime.getElementById(`work-item-comment-edit-${comment.id}`)?.focus());
  }

  /** @param {AppWorkItemComment} comment */
  function startWorkItemCommentReply(comment) {
    setWorkItemEditingCommentId(null);
    setWorkItemEditCommentBody('');
    setWorkItemReplyingToCommentId(comment.id);
    setWorkItemReplyCommentBody('');
    setWorkItemCommentActionError('');
    runtime.scheduleFrame(() => runtime.getElementById(`work-item-comment-reply-${comment.id}`)?.focus());
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

  function cancelWorkItemCommentReply() {
    const commentId = workItemReplyingToCommentId;
    setWorkItemReplyingToCommentId(null);
    setWorkItemReplyCommentBody('');
    setWorkItemCommentActionError('');
    if (commentId !== null) runtime.scheduleFrame(() => {
      const button = /** @type {HTMLButtonElement | null | undefined} */ (runtime.getElementById(`comment-${commentId}`)?.querySelector('[data-comment-reply]'));
      button?.focus();
    });
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
    setWorkItemEditForm(workItemEditFormFromDetail(updated, workItemDetailView?.primary_post || null));
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
   * @param {AppWorkItemDetail | null} [committedItem]
   * @param {number | null} [primaryPostId]
   */
  async function refreshWorkItemCompanionState(itemKey, actionLabel, actionId, committedItem = null, primaryPostId = null) {
    const [detailViewResult, commentsResult, topbarResult] = await Promise.allSettled([
      api.getWorkItemDetailView(itemKey),
      api.getWorkItemComments(itemKey),
      api.getTopbarStatus(),
    ]);
    if (!isCurrentWorkItemDetailRoute(itemKey, actionId)) {
      return;
    }
    const refreshedPrimaryPostId = detailViewResult.status === 'fulfilled'
      ? detailViewResult.value.primary_post?.id
      : primaryPostId || workItemDetailView?.primary_post?.id || null;
    let failed = false;
    if (detailViewResult.status === 'fulfilled') {
      setWorkItemDetailView(committedItem
        ? { ...detailViewResult.value, item: committedItem }
        : detailViewResult.value);
    } else {
      failed = true;
    }
    if (commentsResult.status === 'fulfilled') {
      setWorkItemComments(commentsResult.value.filter((comment) => comment.id !== refreshedPrimaryPostId));
    } else {
      failed = true;
    }
    if (topbarResult.status === 'fulfilled') {
      setTopbar(topbarResult.value);
    } else {
      failed = true;
    }
    if (failed) {
      setWorkItemActionError(`${actionLabel}，但详情、评论或顶部状态刷新失败，请手动刷新。`);
    }
  }

  /** @param {string} itemKey */
  async function refreshWorkItemRealtimeState(itemKey) {
    const commentsPromise = api.getWorkItemComments(itemKey);
    const attachmentsPromise = api.getWorkItemAttachments(itemKey);
    void attachmentsPromise.catch(() => {});
    const [detailViewResult, commentsResult, attachmentBundleResult] = await Promise.allSettled([
      api.getWorkItemDetailView(itemKey),
      commentsPromise,
      commentsPromise.then((comments) => loadWorkItemAttachmentBundle(api, itemKey, comments, attachmentsPromise)),
    ]);
    const current = routeRef.current;
    if (current.id !== 'work-item-detail' || current.itemKey !== itemKey) return;
    const primaryPostId = detailViewResult.status === 'fulfilled'
      ? detailViewResult.value.primary_post?.id
      : workItemDetailView?.primary_post?.id || null;
    if (detailViewResult.status === 'fulfilled') {
      setWorkItemDetailView(detailViewResult.value);
      setWorkItemDetail(detailViewResult.value.item);
    }
    if (commentsResult.status === 'fulfilled') {
      setWorkItemComments(commentsResult.value.filter((comment) => comment.id !== primaryPostId));
    }
    if (attachmentBundleResult.status === 'fulfilled') {
      setWorkItemAttachments(attachmentBundleResult.value.attachments);
      setWorkItemCommentAttachments(attachmentBundleResult.value.commentAttachments);
      setWorkItemAttachmentLoadWarning(attachmentBundleResult.value.loadFailed ? '部分附件列表加载失败，请刷新重试。' : '');
    }
  }

  /** @param {React.FormEvent<HTMLFormElement>} event */
  async function submitWorkItemEdit(event) {
    event.preventDefault();
    if (!activeWorkItemDetail) {
      return false;
    }
    if (workItemMutationRef.current || workItemAttachmentMutationRef.current) {
      return false;
    }

    const title = workItemEditForm.title.trim();
    if (!title) {
      setWorkItemActionError('标题不能为空。');
      return false;
    }

    const itemKey = activeWorkItemDetail.key;
    const fields = {
      title,
      status: workItemEditForm.status,
      priority: workItemEditForm.priority,
      assigneeUsername: workItemEditForm.assigneeUsername.trim(),
      dueDate: workItemEditForm.dueDate,
      parentItemKey: workItemEditForm.parentItemKey.trim(),
    };
    const serializedFields = JSON.stringify(fields);
    const actionId = workItemActionRef.current + 1;
    workItemActionRef.current = actionId;
    workItemMutationRef.current = true;
    workItemMutationActionRef.current = actionId;
    setWorkItemEditSubmitting(true);
    setWorkItemActionError('');
    /** @type {AppWorkItemDetail | null} */
    let updated = null;
    try {
      const retry = workItemPrimaryPostRetryRef.current;
      const committed = retry?.itemKey === itemKey && retry.fields === serializedFields
        ? activeWorkItemDetail
        : await api.updateWorkItem(itemKey, fields);
      updated = committed;
      const primaryPost = await api.updateWorkItemPrimaryPost(itemKey, workItemEditForm.description);
      workItemPrimaryPostRetryRef.current = null;
      if (applyWorkItemMutationResult(committed, `${committed.key} 已保存。`, actionId)) {
        setWorkItemDetailView((current) => current ? { ...current, item: committed, primary_post: primaryPost } : current);
        setWorkItemEditForm(workItemEditFormFromDetail(committed, primaryPost));
        setWorkItemComments((comments) => comments.filter((comment) => comment.id !== primaryPost.id));
        await refreshWorkItemCompanionState(committed.key, '工作项已保存', actionId, committed, primaryPost.id);
        return true;
      }
      return false;
    } catch (caught) {
      if (isCurrentWorkItemDetailRoute(itemKey, actionId)) {
        if (updated) {
          const committed = updated;
          workItemPrimaryPostRetryRef.current = { itemKey, fields: serializedFields };
          requestRef.current += 1;
          setWorkItemDetail(committed);
          setWorkItemDetailView((current) => current ? { ...current, item: committed } : current);
          setWorkItemHandoffForm(workItemHandoffFormFromDetail(committed));
          setWorkItemFormKey(committed.key);
          setStatusMessage(`${committed.key} 字段已保存，主内容需要重试。`);
          setWorkItemActionError(`工作项字段已保存，但主内容保存失败：${errorMessage(caught instanceof Error ? caught : new Error('保存主内容失败。'))}`);
        } else {
          setWorkItemActionError(errorMessage(caught instanceof Error ? caught : new Error('保存工作项失败。')));
        }
      }
      return false;
    } finally {
      clearWorkItemMutation(actionId, setWorkItemEditSubmitting);
    }
  }

  /** @param {React.FormEvent<HTMLFormElement>} event */
  async function submitWorkItemHandoff(event) {
    event.preventDefault();
    if (!activeWorkItemDetail) {
      return false;
    }
    if (workItemMutationRef.current || workItemAttachmentMutationRef.current) {
      return false;
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
            updated,
          ),
        },
      });
      return true;
    } catch (caught) {
      if (isCurrentWorkItemDetailRoute(itemKey, actionId)) {
        setWorkItemActionError(errorMessage(caught instanceof Error ? caught : new Error('推进并指派失败。')));
      }
      return false;
    } finally {
      clearWorkItemMutation(actionId, setWorkItemHandoffSubmitting);
    }
  }

  async function confirmWorkItemLifecycleAction() {
    if (!activeWorkItemDetail || !workItemLifecycleAction || workItemMutationRef.current || workItemAttachmentMutationRef.current) return;
    const itemKey = activeWorkItemDetail.key;
    const action = workItemLifecycleAction;
    const actionId = workItemActionRef.current + 1;
    workItemActionRef.current = actionId;
    workItemMutationRef.current = true;
    workItemMutationActionRef.current = actionId;
    setWorkItemLifecycleSubmitting(true);
    setWorkItemActionError('');
    try {
      const updated = action === 'restore'
        ? await api.restoreWorkItem(itemKey)
        : await api.updateWorkItem(itemKey, { status: action === 'close' ? 'closed' : 'in_progress' });
      const label = action === 'close' ? '已关闭' : action === 'reopen' ? '已重新打开' : '已恢复';
      if (applyWorkItemMutationResult(updated, `${updated.key} ${label}。`, actionId)) {
        await refreshWorkItemCompanionState(updated.key, `工作项${label}`, actionId, updated);
        setWorkItemLifecycleAction(null);
      }
    } catch (caught) {
      if (isCurrentWorkItemDetailRoute(itemKey, actionId)) setWorkItemActionError(errorMessage(caught instanceof Error ? caught : new Error('更新工作项生命周期失败。')));
    } finally {
      clearWorkItemMutation(actionId, setWorkItemLifecycleSubmitting);
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

    const body = workItemNewCommentBody;
    if (!richTextHasContent(body)) {
      setWorkItemCommentActionError('评论内容不能为空。');
      runtime.scheduleFrame(() => runtime.getElementById('work-item-new-comment')?.focus());
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
      const draft = workItemCommentDraftRef.current;
      let created;
      if (draft?.itemKey === itemKey) {
        created = await api.publishWorkItemCommentDraft(itemKey, draft.commentId, { body, bodyFormat: 'html' });
        if (workItemCommentDraftRef.current?.commentId === draft.commentId) {
          workItemCommentDraftRef.current = null;
        }
      } else {
        const result = await createWorkItemCommentUseCase({
          api,
          itemKey,
          payload: { body, bodyFormat: 'html' },
          lifecycle: {
            isCurrent: () => isCurrentWorkItemDetailRoute(itemKey, actionId),
            onCommitted: () => {},
          },
        });
        created = result.value;
      }
      if (isCurrentWorkItemDetailRoute(itemKey, actionId)) {
        requestRef.current += 1;
        setRefreshing(false);
        setWorkItemComments((current) => [...current, created]);
        setWorkItemNewCommentBody('');
        setWorkItemNewCommentDraftId(null);
        setStatusMessage(`${itemKey} 评论已发布。`);
        try {
          await refreshWorkItemCompanionState(itemKey, '评论已发布', actionId);
        } catch {
          if (isCurrentWorkItemDetailRoute(itemKey, actionId)) {
            setStatusMessage(`${itemKey} 评论已发布，但关联状态刷新失败，请手动刷新。`);
          }
        }
      }
    } catch (caught) {
      if (isCurrentWorkItemDetailRoute(itemKey, actionId)) {
        setWorkItemCommentActionError(errorMessage(caught instanceof Error ? caught : new Error('发布评论失败。')));
      }
    } finally {
      clearWorkItemMutation(actionId, setWorkItemCommentSubmitting);
    }
  }

  async function cancelWorkItemCommentDraft() {
    const draft = workItemCommentDraftRef.current;
    if (!draft || workItemMutationRef.current || workItemAttachmentMutationRef.current) return;
    workItemMutationRef.current = true;
    setWorkItemCommentSubmitting(true);
    setWorkItemCommentActionError('');
    try {
      await api.cancelWorkItemCommentDraft(draft.itemKey, draft.commentId);
      if (workItemCommentDraftRef.current?.commentId === draft.commentId) {
        setWorkItemNewCommentBody('');
        setWorkItemCommentAttachments((current) => {
          const next = { ...current };
          delete next[String(draft.commentId)];
          return next;
        });
        setWorkItemCommentAttachmentStatus((current) => {
          const next = { ...current };
          delete next[String(draft.commentId)];
          return next;
        });
        setWorkItemNewCommentDraftId(null);
        workItemCommentDraftRef.current = null;
        setStatusMessage(`${draft.itemKey} 评论草稿已取消。`);
      }
    } catch (caught) {
      setWorkItemCommentActionError(errorMessage(caught instanceof Error ? caught : new Error('取消评论草稿失败。')));
    } finally {
      workItemMutationRef.current = false;
      setWorkItemCommentSubmitting(false);
    }
  }

  /** @param {React.FormEvent<HTMLFormElement>} event */
  async function submitWorkItemCommentReply(event) {
    event.preventDefault();
    if (!activeWorkItemDetail || workItemReplyingToCommentId === null || workItemMutationRef.current || workItemAttachmentMutationRef.current) return;
    const body = workItemReplyCommentBody;
    if (!richTextHasContent(body)) {
      setWorkItemCommentActionError('回复内容不能为空。');
      runtime.scheduleFrame(() => runtime.getElementById(`work-item-comment-reply-${workItemReplyingToCommentId}`)?.focus());
      return;
    }
    const itemKey = activeWorkItemDetail.key;
    const parentCommentId = workItemReplyingToCommentId;
    const actionId = workItemActionRef.current + 1;
    workItemActionRef.current = actionId;
    workItemMutationRef.current = true;
    workItemMutationActionRef.current = actionId;
    setWorkItemReplySubmitting(true);
    setWorkItemCommentActionError('');
    try {
      await createWorkItemCommentUseCase({
        api,
        itemKey,
        payload: { body, bodyFormat: 'html', parentCommentId },
        lifecycle: {
          isCurrent: () => isCurrentWorkItemDetailRoute(itemKey, actionId),
          onCommitted: (created) => {
            requestRef.current += 1;
            setRefreshing(false);
            setWorkItemComments((current) => [...current, created]);
            setWorkItemReplyingToCommentId(null);
            setWorkItemReplyCommentBody('');
            setStatusMessage(`${itemKey} 回复已发布。`);
          },
          refreshCompanion: () => refreshWorkItemCompanionState(itemKey, '回复已发布', actionId),
        },
      });
    } catch (caught) {
      if (isCurrentWorkItemDetailRoute(itemKey, actionId)) setWorkItemCommentActionError(errorMessage(caught instanceof Error ? caught : new Error('发布回复失败。')));
    } finally {
      clearWorkItemMutation(actionId, setWorkItemReplySubmitting);
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

    const body = workItemEditCommentBody;
    if (!richTextHasContent(body)) {
      setWorkItemCommentActionError('评论内容不能为空。');
      runtime.scheduleFrame(() => runtime.getElementById(`work-item-comment-edit-${workItemEditingCommentId}`)?.focus());
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
        payload: { body, bodyFormat: 'html' },
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

  /** @param {number} commentId @param {AppAttachment} attachment */
  function requestWorkItemCommentAttachmentDelete(commentId, attachment) {
    if (workItemEditingCommentId !== commentId || workItemMutationRef.current || workItemAttachmentMutationRef.current) return;
    setWorkItemCommentActionError('');
    setWorkItemCommentAttachmentDeleteTarget({ commentId, attachment, editorContext: 'comment-edit' });
  }

  /** @param {{ id: number, filename: string }} attachment */
  function requestWorkItemPrimaryPostAttachmentDelete(attachment) {
    const primaryPostId = activeWorkItemDetailView?.primary_post?.id;
    if (!primaryPostId || !activeWorkItemDetailView?.permissions.can_edit_primary_post || workItemMutationRef.current || workItemAttachmentMutationRef.current) return;
    setWorkItemActionError('');
    const source = (workItemCommentAttachments[String(primaryPostId)] || []).find((candidate) => candidate.id === attachment.id);
    if (source) setWorkItemCommentAttachmentDeleteTarget({ commentId: primaryPostId, attachment: source, editorContext: 'primary-post' });
  }

  async function confirmWorkItemCommentAttachmentDelete() {
    const target = workItemCommentAttachmentDeleteTarget;
    const targetIsCurrent = target?.editorContext === 'primary-post'
      ? activeWorkItemDetailView?.primary_post?.id === target.commentId && activeWorkItemDetailView.permissions.can_edit_primary_post
      : workItemEditingCommentId === target?.commentId;
    if (!activeWorkItemDetail || !target || !targetIsCurrent || workItemMutationRef.current || workItemAttachmentMutationRef.current) return;
    const itemKey = activeWorkItemDetail.key;
    const editor = runtime.getElementById(target.editorContext === 'primary-post' ? 'work-item-primary-post' : `work-item-comment-edit-${target.commentId}`);
    const staging = editor?.ownerDocument.createElement('div');
    if (!staging) {
      if (target.editorContext === 'primary-post') setWorkItemActionError('主内容编辑器不可用。');
      else setWorkItemCommentActionError('评论编辑器不可用。');
      return;
    }
    staging.innerHTML = target.editorContext === 'primary-post' ? workItemEditForm.description : workItemEditCommentBody;
    for (const node of staging.querySelectorAll(`[data-yuance-attachment-id="${target.attachment.id}"]`)) node.remove();
    const nextBody = staging.innerHTML;
    const actionId = workItemAttachmentActionRef.current + 1;
    workItemAttachmentActionRef.current = actionId;
    workItemAttachmentMutationRef.current = true;
    setWorkItemCommentAttachmentDeletingId(target.attachment.id);
    if (target.editorContext === 'primary-post') setWorkItemActionError('');
    else setWorkItemCommentActionError('');
    try {
      if (target.editorContext === 'primary-post') await api.deleteWorkItemPrimaryPostAttachment(itemKey, target.commentId, target.attachment.id);
      else await api.deleteWorkItemCommentAttachment(itemKey, target.commentId, target.attachment.id);
      const targetStillCurrent = target.editorContext === 'primary-post'
        ? activeWorkItemDetailView?.primary_post?.id === target.commentId
        : workItemEditingCommentId === target.commentId;
      if (!isCurrentWorkItemDetailRoute(itemKey) || workItemAttachmentActionRef.current !== actionId || !targetStillCurrent) return;
      if (target.editorContext === 'primary-post') {
        setWorkItemEditForm((current) => ({ ...current, description: nextBody }));
        setWorkItemDetailView((current) => current?.primary_post?.id === target.commentId
          ? { ...current, primary_post: { ...current.primary_post, body: nextBody } }
          : current);
      } else {
        setWorkItemEditCommentBody(nextBody);
      }
      setWorkItemCommentAttachments((current) => ({
        ...current,
        [String(target.commentId)]: (current[String(target.commentId)] || []).filter((attachment) => attachment.id !== target.attachment.id),
      }));
      setWorkItemCommentAttachmentDeleteTarget(null);
      setStatusMessage(`${target.attachment.filename} 及正文引用已删除。`);
    } catch (caught) {
      if (isCurrentWorkItemDetailRoute(itemKey) && workItemAttachmentActionRef.current === actionId) {
        const message = errorMessage(caught instanceof Error ? caught : new Error('删除附件失败。'));
        if (target.editorContext === 'primary-post') setWorkItemActionError(message);
        else setWorkItemCommentActionError(message);
      }
    } finally {
      if (workItemAttachmentActionRef.current === actionId) {
        workItemAttachmentMutationRef.current = false;
        setWorkItemCommentAttachmentDeletingId(null);
      }
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

  /** @param {AppAttachment | null} [existingAttachment] */
  async function uploadSelectedWorkItemAttachment(existingAttachment = null) {
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

    if (existingAttachment && (
      file.filename !== existingAttachment.filename
      || file.contentType !== existingAttachment.content_type
      || file.byteSize !== existingAttachment.byte_size
    )) {
      setWorkItemAttachmentActionError('重试文件必须与原附件的名称、类型和大小一致。');
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
        existingAttachment,
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
   * @param {number | null} [requestedCommentId]
   * @param {import('@yuance/frontend-platform-contract').PastedFile | null} [pastedFile]
   * @returns {Promise<AppAttachment | null>}
   */
  async function uploadSelectedWorkItemCommentAttachment(requestedCommentId = null, pastedFile = null) {
    if (!activeWorkItemDetail || workItemAttachmentMutationRef.current || workItemMutationRef.current) {
      return null;
    }
    const itemKey = activeWorkItemDetail.key;
    let commentId = requestedCommentId;
    const actionId = workItemAttachmentActionRef.current + 1;
    workItemAttachmentActionRef.current = actionId;
    workItemAttachmentMutationRef.current = true;
    if (commentId === null) setWorkItemNewCommentAttachmentUploading(true);
    else setWorkItemCommentAttachmentUploadingId(commentId);
    let file;
    try {
      const selectPastedFile = files.selectPastedFile;
      if (pastedFile) {
        if (typeof selectPastedFile !== 'function') throw new Error('当前环境不支持粘贴文件。');
        file = await selectPastedFile(pastedFile);
      } else {
        file = await files.files.chooseFile();
      }
    }
    catch (caught) {
      workItemAttachmentMutationRef.current = false;
      setWorkItemCommentAttachmentUploadingId(null);
      setWorkItemNewCommentAttachmentUploading(false);
      if (isCurrentWorkItemAttachmentRoute(itemKey, actionId)) setWorkItemAttachmentActionError(errorMessage(caught instanceof Error ? caught : new Error('选择附件失败。')));
      return null;
    }
    if (!isCurrentWorkItemAttachmentRoute(itemKey, actionId)) {
      workItemAttachmentMutationRef.current = false;
      setWorkItemCommentAttachmentUploadingId(null);
      setWorkItemNewCommentAttachmentUploading(false);
      return null;
    }
    if (!file) {
      workItemAttachmentMutationRef.current = false;
      setWorkItemCommentAttachmentUploadingId(null);
      setWorkItemNewCommentAttachmentUploading(false);
      return null;
    }
    if (!file.byteSize || file.byteSize <= 0) {
      setWorkItemAttachmentActionError('请选择非空文件。');
      workItemAttachmentMutationRef.current = false;
      setWorkItemCommentAttachmentUploadingId(null);
      setWorkItemNewCommentAttachmentUploading(false);
      return null;
    }
    if (commentId === null) {
      try {
        const existingDraft = workItemCommentDraftRef.current;
        if (existingDraft && existingDraft.itemKey !== itemKey) {
          await api.cancelWorkItemCommentDraft(existingDraft.itemKey, existingDraft.commentId);
          if (workItemCommentDraftRef.current?.commentId === existingDraft.commentId) {
            workItemCommentDraftRef.current = null;
          }
        }
        const retainedDraft = workItemCommentDraftRef.current;
        const draft = retainedDraft?.itemKey === itemKey
          ? retainedDraft
          : await api.createWorkItemCommentDraft(itemKey, { body: '', bodyFormat: 'html' });
        commentId = 'commentId' in draft ? draft.commentId : draft.id;
        workItemCommentDraftRef.current = { itemKey, commentId };
        setWorkItemNewCommentDraftId(commentId);
      } catch (caught) {
        workItemAttachmentMutationRef.current = false;
        setWorkItemNewCommentAttachmentUploading(false);
        setWorkItemAttachmentActionError(errorMessage(caught instanceof Error ? caught : new Error('创建评论草稿失败。')));
        return null;
      }
    }
    if (commentId === null) return null;
    const resolvedCommentId = commentId;

    const filename = file.filename || 'attachment.bin';
    let createdAttachment = /** @type {AppAttachment | null} */ (null);
    let completedUpload = /** @type {AppAttachment | null} */ (null);
    let uploadStage = /** @type {'registering' | 'signing' | 'uploading' | 'confirming'} */ ('registering');
    let refreshed = [];
    setWorkItemAttachmentActionError('');
    setWorkItemCommentAttachmentStatus((current) => ({
      ...current,
      [String(resolvedCommentId)]: `${filename} 正在登记附件。`,
    }));
    try {
      const result = await uploadWorkItemCommentAttachment({
        api,
        platform: files,
        itemKey,
        commentId: resolvedCommentId,
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
              [String(resolvedCommentId)]: `${filename} ${labels[stage]}`,
            }));
          },
          onCreated: (created) => {
            createdAttachment = created;
            setWorkItemCommentAttachments((current) => ({
              ...current,
              [String(resolvedCommentId)]: upsertAttachment(current[String(resolvedCommentId)] || [], created),
            }));
          },
          onUploaded: (uploaded) => {
            requestRef.current += 1;
            setRefreshing(false);
            setWorkItemCommentAttachments((current) => ({
              ...current,
              [String(resolvedCommentId)]: upsertAttachment(current[String(resolvedCommentId)] || [], uploaded),
            }));
          },
          refresh: async () => { await refreshWorkItemCommentAttachmentList(itemKey, resolvedCommentId, actionId); },
        },
      });
      if (result.completed) {
        const uploaded = result.uploaded;
        if (uploaded) completedUpload = uploaded;
        if (requestedCommentId === null && uploaded && !pastedFile) {
          setWorkItemNewCommentBody((current) => `${current}${richTextAttachmentHtml({
            id: uploaded.id,
            filename: uploaded.filename,
            contentType: uploaded.content_type,
            url: `/api/v1/work-items/${encodeURIComponent(itemKey)}/comments/${resolvedCommentId}/attachments/${uploaded.id}/preview/content`,
          })}`);
        }
        setStatusMessage(`${itemKey} 评论附件已上传。`);
        setWorkItemCommentAttachmentStatus((current) => ({
          ...current,
          [String(resolvedCommentId)]: `${filename} 上传完成。`,
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
            const refreshed = await refreshWorkItemCommentAttachmentList(itemKey, resolvedCommentId, actionId);
            confirmedByRefresh = refreshed.some((attachment) => (
              attachment.id === createdAttachment?.id && attachment.status === 'uploaded'
            ));
          } catch {
            // The upload has completed; retain the locally known pending state when confirmation cannot be resolved.
          }
          if (confirmedByRefresh) {
            completedUpload = refreshed.find((attachment) => attachment.id === createdAttachment?.id) || null;
            setStatusMessage(`${itemKey} 评论附件已上传。`);
            setWorkItemCommentAttachmentStatus((current) => ({
              ...current,
              [String(resolvedCommentId)]: `${filename} 上传完成。`,
            }));
          } else {
            setWorkItemAttachmentActionError(`${filename} 已上传，但服务端确认失败，请手动刷新后检查。`);
            setWorkItemCommentAttachmentStatus((current) => ({
              ...current,
              [String(resolvedCommentId)]: `${filename} 上传结果待确认。`,
            }));
          }
        } else if (createdAttachment) {
          const failedAttachment = /** @type {AppAttachment} */ ({
            ...createdAttachment,
            status: 'failed',
          });
          setWorkItemCommentAttachments((current) => ({
            ...current,
            [String(resolvedCommentId)]: upsertAttachment(current[String(resolvedCommentId)] || [], failedAttachment),
          }));
          const message = errorMessage(caught instanceof Error ? caught : new Error('上传评论附件失败。'));
          setWorkItemAttachmentActionError(`${filename} 上传失败：${message}`);
          setWorkItemCommentAttachmentStatus((current) => ({
            ...current,
            [String(resolvedCommentId)]: `${filename} 上传失败，请重试。`,
          }));
        } else {
          const message = errorMessage(caught instanceof Error ? caught : new Error('上传评论附件失败。'));
          setWorkItemAttachmentActionError(`${filename} 上传失败：${message}`);
          setWorkItemCommentAttachmentStatus((current) => ({
            ...current,
            [String(resolvedCommentId)]: `${filename} 上传失败，请重试。`,
          }));
        }
      }
    } finally {
      if (workItemAttachmentActionRef.current === actionId) {
        workItemAttachmentMutationRef.current = false;
        setWorkItemCommentAttachmentUploadingId(null);
        setWorkItemNewCommentAttachmentUploading(false);
      }
    }
    return completedUpload;
  }

  /** @param {'new' | 'edit' | 'reply'} context @param {number | null} commentId @param {import('@yuance/frontend-platform-contract').PastedFile} file @returns {Promise<AppRichTextAttachmentOption | null>} */
  async function pasteWorkItemCommentFile(context, commentId, file) {
    if (!activeWorkItemDetail) return null;
    const itemKey = activeWorkItemDetail.key;
    const uploadCommentId = context === 'new' ? null : commentId;
    const uploaded = await uploadSelectedWorkItemCommentAttachment(uploadCommentId, file);
    if (!uploaded) return null;
    if (context === 'new') {
      const draftId = workItemCommentDraftRef.current?.commentId;
      return draftId ? workItemCommentAttachmentOption(itemKey, draftId, uploaded) : null;
    }
    return uploadCommentId ? workItemCommentAttachmentOption(itemKey, uploadCommentId, uploaded) : null;
  }

  /** @param {import('@yuance/frontend-platform-contract').PastedFile} file @returns {Promise<AppRichTextAttachmentOption | null>} */
  async function pasteWorkItemPrimaryPostFile(file) {
    if (!activeWorkItemDetail) return null;
    const commentId = activeWorkItemDetailView?.primary_post?.id;
    if (!commentId) return null;
    const uploaded = await uploadSelectedWorkItemCommentAttachment(commentId, file);
    return uploaded ? workItemCommentAttachmentOption(activeWorkItemDetail.key, commentId, uploaded) : null;
  }

  /** @param {import('@yuance/frontend-platform-contract').PastedFile} file @returns {Promise<AppRichTextAttachmentOption | null>} */
  async function pasteProjectResourceFile(file) {
    const current = routeRef.current;
    const projectKey = String(current.projectKey || '');
    if (current.id === 'project-resource-detail') {
      if (!projectResourceDetail || projectResourceLocked || projectResourceAttachmentMutationRef.current || projectResourceMutationRef.current) return null;
      const uploaded = await uploadSelectedProjectResourceAttachment(null, file);
      if (!uploaded) return null;
      return projectResourceAttachmentOption(projectKey, Number(current.resourceId), uploaded);
    }
    if (current.id !== 'project-detail' || current.tab !== 'resources' || projectResourceForm.id !== 0 || projectResourceSubmitting || projectResourcePasteUploading || projectResourceAttachmentMutationRef.current || projectResourceMutationRef.current) return null;

    const selectPastedFile = files.selectPastedFile;
    if (typeof selectPastedFile !== 'function') { setProjectResourceError('当前环境不支持粘贴文件。'); return null; }
    let selected;
    try { selected = await selectPastedFile(file); }
    catch (caught) { setProjectResourceError(errorMessage(caught instanceof Error ? caught : new Error('读取剪贴板图片失败。'))); return null; }
    if (!selected || !selected.byteSize || selected.byteSize <= 0) { setProjectResourceError('请粘贴非空图片文件。'); return null; }
    const filename = selected.filename || 'attachment.bin';
    if (!projectResourceForm.title.trim()) { setProjectResourceError('请先填写资料标题，再粘贴图片。'); return null; }

    const entryKey = projectResourceCreateAttachmentKeyRef.current + 1;
    projectResourceCreateAttachmentKeyRef.current = entryKey;
    setProjectResourceCreateAttachments((entries) => [...entries, {
      key: entryKey, filename, contentType: selected.contentType, byteSize: selected.byteSize, inline: true, alreadyInline: true, stage: '正在上传粘贴图片', error: '',
    }]);
    setProjectResourcePasteUploading(true);
    projectResourceAttachmentMutationRef.current = true;
    try {
      let checkpoint = projectResourceCreateCheckpoint;
      if (!checkpoint) {
        const payload = projectResourcePayload();
        const body = richTextHasContent(payload.body) ? payload.body : '<p><br></p>';
        checkpoint = await api.createProjectResource(projectKey, { ...payload, body, bodyFormat: 'html' });
        setProjectResourceCreateCheckpoint(checkpoint);
      }
      const result = await uploadProjectResourceAttachment({
        api, platform: files, projectKey, resourceId: checkpoint.id, file: selected, existingAttachment: null,
        lifecycle: {
          isCurrent: () => routeRef.current.id === 'project-detail' && routeRef.current.tab === 'resources',
          onStage: (stage) => setProjectResourceCreateAttachments((entries) => entries.map((entry) => entry.key === entryKey ? { ...entry, stage: { registering: '正在登记粘贴图片', signing: '正在获取上传签名', uploading: '正在上传图片', confirming: '正在确认上传结果' }[stage] || entry.stage } : entry)),
          onCreated: (/** @type {AppAttachment} */ created) => setProjectResourceCreateAttachments((entries) => entries.map((entry) => entry.key === entryKey ? { ...entry, existingAttachment: created } : entry)),
          onUploaded: (/** @type {AppAttachment} */ uploaded) => setProjectResourceCreateAttachments((entries) => entries.map((entry) => entry.key === entryKey ? { ...entry, uploadedAttachment: uploaded, stage: '上传完成' } : entry)),
          refresh: async () => {},
        },
      });
      const uploaded = /** @type {AppAttachment | null} */ (result.uploaded);
      if (!result.completed || !uploaded) {
        setProjectResourceError('粘贴图片上传未完成，请重试。');
        return null;
      }
      setProjectResourceCreateAttachments((entries) => entries.map((entry) => entry.key === entryKey ? { ...entry, uploadedAttachment: uploaded, file: undefined, stage: '上传完成', error: '' } : entry));
      return projectResourceAttachmentOption(projectKey, checkpoint.id, uploaded);
    } catch (caught) {
      setProjectResourceError(errorMessage(caught instanceof Error ? caught : new Error('上传粘贴图片失败。')));
      setProjectResourceCreateAttachments((entries) => entries.map((entry) => entry.key === entryKey ? { ...entry, stage: '上传失败', error: '上传失败' } : entry));
      return null;
    } finally {
      projectResourceAttachmentMutationRef.current = false;
      setProjectResourcePasteUploading(false);
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
    if (filter === messageFilter) return;
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
        projectKey: workItemListRoute.projectKey,
        cycleId: Number.parseInt(runtime.readFormValue(event.currentTarget, 'cycle_id'), 10) || 0,
        sort: runtime.readFormValue(event.currentTarget, 'sort'),
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
      buildWorkItemListPath({ owner: workItemOwner, itemType: workItemListRoute.itemType, projectKey: workItemListRoute.projectKey }),
      '已重置工作项筛选。',
    );
  }

  function openWorkItemCreate() {
    setWorkItemCreateError('');
    setWorkItemCreatePasteHint('');
    setWorkItemCreatePendingPastes([]);
    workItemCreatePasteTempIdRef.current = 0;
    setWorkItemCreateCheckpoint(null);
    setWorkItemCreatePasteUploading(false);
    setWorkItemCreateAttachmentStatus('');
    setWorkItemCreateForm({ title: '', description: '', priority: 'P2', assigneeUsername: '', cycleId: '', dueDate: '', parentItemKey: '' });
    setWorkItemCreateOpen(true);
  }

  function closeWorkItemCreate() {
    if (workItemCreateSubmitting || workItemCreatePasteUploading) return;
    if (workItemCreateCheckpoint) {
      const itemKey = workItemCreateCheckpoint.item.key;
      setWorkItemCreateOpen(false);
      setWorkItemCreateCheckpoint(null);
      setWorkItemCreateAttachmentStatus('');
      setWorkItemCreatePasteHint('');
      setWorkItemCreatePendingPastes([]);
      navigate(buildWorkItemDetailPath({ owner: workItemOwner, itemKey }), `已打开刚创建的 ${itemKey}。`);
      return;
    }
    setWorkItemCreateOpen(false);
    setWorkItemCreateAttachmentStatus('');
    setWorkItemCreatePasteHint('');
    setWorkItemCreatePendingPastes([]);
  }

  function workItemCreatePayload() {
    if (!workItemListRoute || !currentProject) return null;
    const itemType = workItemListRoute.itemType;
    if (!itemType) return null;
    return {
      projectKey: currentProject.key,
      itemType,
      title: workItemCreateForm.title.trim(),
      description: richTextHasContent(workItemCreateForm.description) ? workItemCreateBackendBody(workItemCreateForm.description) : '',
      priority: workItemCreateForm.priority,
      assigneeUsername: workItemCreateForm.assigneeUsername,
      cycleId: Number.parseInt(workItemCreateForm.cycleId, 10) || null,
      dueDate: workItemCreateForm.dueDate,
      parentItemKey: itemType === 'task' ? workItemCreateForm.parentItemKey : '',
    };
  }

  /** @returns {Promise<{ item: AppWorkItemDetail, primaryPostId: number | null }>} */
  async function ensureWorkItemCreateCheckpoint() {
    if (workItemCreateCheckpoint) return workItemCreateCheckpoint;
    const payload = workItemCreatePayload();
    if (!payload) throw new Error('当前页面无法创建工作项。');
    const item = await api.createWorkItem(payload);
    const checkpoint = { item, primaryPostId: null };
    setWorkItemCreateCheckpoint(checkpoint);
    return checkpoint;
  }

  /** @param {{ item: AppWorkItemDetail, primaryPostId: number | null }} checkpoint @returns {Promise<number>} */
  async function ensureWorkItemCreatePrimaryPost(checkpoint) {
    if (checkpoint.primaryPostId) return checkpoint.primaryPostId;
    // 附件必须挂在已存在的主帖下；标题为空时先写入占位正文，上传成功后随即替换为图片 HTML。
    const body = workItemCreateBackendBody(workItemCreateForm.description);
    const primaryPost = await api.updateWorkItemPrimaryPost(checkpoint.item.key, body);
    const next = { ...checkpoint, primaryPostId: primaryPost.id };
    setWorkItemCreateCheckpoint(next);
    return primaryPost.id;
  }

  /** @param {string} description @returns {string} 临时本地图片不能提交后端，先替换为占位正文。 */
  function workItemCreateBackendBody(description) {
    let body = description;
    for (const entry of workItemCreatePendingPastes) {
      if (!entry.tempId) continue;
      body = body.replace(workItemCreateTempNodePattern(entry.tempId), '<p>图片上传中…</p>');
    }
    return richTextHasContent(body) ? body : '<p>图片上传中…</p>';
  }

  /** @param {import('@yuance/frontend-platform-contract').PastedFile} file @param {string} contentType */
  async function pastedFileDataUrl(file, contentType) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return `data:${contentType || 'application/octet-stream'};base64,${btoa(binary)}`;
  }

  /** @param {number} tempId */
  function workItemCreateTempNodePattern(tempId) {
    return new RegExp(`<(?:figure|a)\\b[^>]*\\bdata-yuance-attachment-id="${tempId}"[^>]*>.*?<\\/(?:figure|a)>`, 'is');
  }

  /** @param {import('@yuance/frontend-platform-contract').PastedFile} file @returns {Promise<AppRichTextAttachmentOption | null | typeof DEFER_RICH_TEXT_PASTE>} */
  async function pasteWorkItemCreateFile(file) {
    if (!workItemListRoute || !currentProject || workItemCreateSubmitting || workItemCreateAttachmentMutationRef.current) return null;
    const selectPastedFile = files.selectPastedFile;
    if (typeof selectPastedFile !== 'function') {
      setWorkItemCreateError('当前环境不支持粘贴文件。');
      return DEFER_RICH_TEXT_PASTE;
    }
    let selected;
    try { selected = await selectPastedFile(file); }
    catch (caught) {
      setWorkItemCreateError(errorMessage(caught instanceof Error ? caught : new Error('读取剪贴板图片失败。')));
      return DEFER_RICH_TEXT_PASTE;
    }
    if (!selected || !selected.byteSize || selected.byteSize <= 0) {
      setWorkItemCreateError('请粘贴非空文件。');
      return DEFER_RICH_TEXT_PASTE;
    }
    if (!workItemCreateForm.title.trim()) {
      if (!selected.contentType.startsWith('image/')) {
        setWorkItemCreatePendingPastes((current) => [...current, { ...selected, tempId: 0, previewUrl: '' }]);
        setWorkItemCreatePasteHint(`已暂存 ${workItemCreatePendingPastes.length + 1} 个文件，填写标题后将自动上传。`);
        runtime.getElementById('work-item-create-title')?.focus();
        return DEFER_RICH_TEXT_PASTE;
      }
      let previewUrl;
      try { previewUrl = await pastedFileDataUrl(file, selected.contentType); }
      catch (caught) {
        setWorkItemCreateError(errorMessage(caught instanceof Error ? caught : new Error('读取剪贴板图片失败。')));
        return DEFER_RICH_TEXT_PASTE;
      }
      const tempId = -(++workItemCreatePasteTempIdRef.current);
      const entry = /** @type {WorkItemCreatePendingPaste} */ ({ ...selected, tempId, previewUrl });
      setWorkItemCreatePendingPastes((current) => [...current, entry]);
      setWorkItemCreatePasteHint(`图片已加入正文，填写标题后将自动上传。`);
      runtime.getElementById('work-item-create-title')?.focus();
      return {
        id: entry.tempId,
        filename: entry.filename,
        contentType: entry.contentType,
        url: entry.previewUrl,
      };
    }
    setWorkItemCreatePasteHint('');
    workItemCreateAttachmentMutationRef.current = true;
    setWorkItemCreatePasteUploading(true);
    setWorkItemCreateError('');
    setWorkItemCreatePasteHint('');
    setWorkItemCreateAttachmentStatus(`正在上传 ${selected.filename}…`);
    try {
      const checkpoint = await ensureWorkItemCreateCheckpoint();
      const primaryPostId = await ensureWorkItemCreatePrimaryPost(checkpoint);
      const result = await uploadWorkItemCommentAttachment({
        api,
        platform: files,
        itemKey: checkpoint.item.key,
        commentId: primaryPostId,
        file: selected,
        lifecycle: {
          isCurrent: () => workItemCreateOpen && !workItemCreateSubmitting,
          onStage: (stage) => {
            const labels = {
              registering: '正在登记附件',
              signing: '正在获取上传签名',
              uploading: '正在上传到对象存储',
              confirming: '正在确认上传结果',
            };
            setWorkItemCreateAttachmentStatus(`${selected.filename} ${labels[stage]}`);
          },
          onCreated: () => {},
          onUploaded: () => {},
          refresh: async () => {},
        },
      });
      if (!result.completed || !result.uploaded) {
        setWorkItemCreateError('粘贴文件上传未完成，请重试。');
        return null;
      }
      const attachmentOption = workItemCommentAttachmentOption(checkpoint.item.key, primaryPostId, result.uploaded);
      const nextBody = `${workItemCreateForm.description}${richTextAttachmentHtml({
        id: result.uploaded.id,
        filename: result.uploaded.filename,
        contentType: result.uploaded.content_type,
        url: attachmentOption.url,
      })}`;
      await api.updateWorkItemPrimaryPost(checkpoint.item.key, nextBody);
      setWorkItemCreateAttachmentStatus(`${selected.filename} 上传完成。`);
      return attachmentOption;
    } catch (caught) {
      setWorkItemCreateError(errorMessage(caught instanceof Error ? caught : new Error('上传粘贴图片失败。')));
      return null;
    } finally {
      workItemCreateAttachmentMutationRef.current = false;
      setWorkItemCreatePasteUploading(false);
    }
  }

  /** @returns {Promise<void>} */
  async function flushWorkItemCreatePendingPastes() {
    const pending = workItemCreatePendingPastes;
    if (!pending.length || workItemCreateSubmitting || workItemCreateAttachmentMutationRef.current) return;
    workItemCreateAttachmentMutationRef.current = true;
    setWorkItemCreatePasteUploading(true);
    setWorkItemCreateError('');
    setWorkItemCreatePasteHint('');
    let description = workItemCreateForm.description;
    const processed = [];
    try {
      let checkpoint = workItemCreateCheckpoint;
      if (!checkpoint) checkpoint = await ensureWorkItemCreateCheckpoint();
      const primaryPostId = await ensureWorkItemCreatePrimaryPost(checkpoint);
      for (const entry of pending) {
        if (entry.tempId && !description.includes(`data-yuance-attachment-id="${entry.tempId}"`)) {
          processed.push(entry);
          continue;
        }
        const result = await uploadWorkItemCommentAttachment({
          api,
          platform: files,
          itemKey: checkpoint.item.key,
          commentId: primaryPostId,
          file: entry,
          lifecycle: {
            isCurrent: () => workItemCreateOpen && !workItemCreateSubmitting,
            onStage: (stage) => {
              const labels = {
                registering: '正在登记附件',
                signing: '正在获取上传签名',
                uploading: '正在上传到对象存储',
                confirming: '正在确认上传结果',
              };
              setWorkItemCreateAttachmentStatus(`${entry.filename} ${labels[stage]}`);
            },
            onCreated: () => {},
            onUploaded: () => {},
            refresh: async () => {},
          },
        });
        if (!result.completed || !result.uploaded) {
          throw new Error('粘贴文件上传未完成，请重试。');
        }
        const attachmentOption = workItemCommentAttachmentOption(checkpoint.item.key, primaryPostId, result.uploaded);
        const realHtml = richTextAttachmentHtml({
          id: result.uploaded.id,
          filename: result.uploaded.filename,
          contentType: result.uploaded.content_type,
          url: attachmentOption.url,
        });
        description = entry.tempId
          ? description.replace(workItemCreateTempNodePattern(entry.tempId), realHtml)
          : `${description}${realHtml}`;
        await api.updateWorkItemPrimaryPost(checkpoint.item.key, description);
        processed.push(entry);
        setWorkItemCreatePendingPastes((current) => current.filter((entry) => !processed.includes(entry)));
        setWorkItemCreateForm((current) => ({ ...current, description }));
        setWorkItemCreateAttachmentStatus(`${entry.filename} 上传完成。`);
      }
      setWorkItemCreateCheckpoint({ ...checkpoint, primaryPostId });
      setWorkItemCreateAttachmentStatus('');
    } catch (caught) {
      setWorkItemCreatePendingPastes((current) => {
        const nextPending = current.filter((entry) => !processed.includes(entry));
        return nextPending.length === current.length ? current : nextPending;
      });
      setWorkItemCreateForm((current) => ({ ...current, description }));
      setWorkItemCreateError(errorMessage(caught instanceof Error ? caught : new Error('上传粘贴图片失败。')));
    } finally {
      workItemCreateAttachmentMutationRef.current = false;
      setWorkItemCreatePasteUploading(false);
    }
  }

  useEffect(() => {
    if (!workItemCreateForm.title.trim() || !workItemCreatePendingPastes.length) return;
    void flushWorkItemCreatePendingPastes();
  }, [workItemCreateForm.title, workItemCreatePendingPastes]);

  /** @param {React.FormEvent<HTMLFormElement>} event */
  async function submitWorkItemCreate(event) {
    event.preventDefault();
    if (!workItemListRoute || !currentProject || workItemCreateSubmitting || workItemCreatePasteUploading) return;
    const payload = workItemCreatePayload();
    if (!payload) {
      setWorkItemCreateError('工作项类型无效。');
      return;
    }
    if (!payload.title) {
      setWorkItemCreateError('请输入工作项标题。');
      return;
    }
    if (!payload.itemType) {
      setWorkItemCreateError('工作项类型无效。');
      return;
    }
    setWorkItemCreateSubmitting(true);
    setWorkItemCreateError('');
    setWorkItemCreatePasteHint('');
    try {
      let description = workItemCreateForm.description;
      let checkpoint = workItemCreateCheckpoint;
      let item = checkpoint?.item || null;
      const pendingPastes = workItemCreatePendingPastes;
      if (item || pendingPastes.length) {
        if (!checkpoint) checkpoint = await ensureWorkItemCreateCheckpoint();
        const primaryPostId = await ensureWorkItemCreatePrimaryPost(checkpoint);
        const processed = [];
        try {
          for (const entry of pendingPastes) {
            if (entry.tempId && !description.includes(`data-yuance-attachment-id="${entry.tempId}"`)) {
              processed.push(entry);
              continue;
            }
            const result = await uploadWorkItemCommentAttachment({
              api,
              platform: files,
              itemKey: checkpoint.item.key,
              commentId: primaryPostId,
              file: entry,
              lifecycle: {
                isCurrent: () => workItemCreateOpen && workItemCreateSubmitting,
                onStage: (stage) => {
                  const labels = {
                    registering: '正在登记附件',
                    signing: '正在获取上传签名',
                    uploading: '正在上传到对象存储',
                    confirming: '正在确认上传结果',
                  };
                  setWorkItemCreateAttachmentStatus(`${entry.filename} ${labels[stage]}`);
                },
                onCreated: () => {},
                onUploaded: () => {},
                refresh: async () => {},
              },
            });
            if (!result.completed || !result.uploaded) {
              throw new Error('粘贴文件上传未完成，请重试。');
            }
            const attachmentOption = workItemCommentAttachmentOption(checkpoint.item.key, primaryPostId, result.uploaded);
            const realHtml = richTextAttachmentHtml({
              id: result.uploaded.id,
              filename: result.uploaded.filename,
              contentType: result.uploaded.content_type,
              url: attachmentOption.url,
            });
            description = entry.tempId
              ? description.replace(workItemCreateTempNodePattern(entry.tempId), realHtml)
              : `${description}${realHtml}`;
            await api.updateWorkItemPrimaryPost(checkpoint.item.key, description);
            processed.push(entry);
            setWorkItemCreatePendingPastes((current) => current.filter((entry) => !processed.includes(entry)));
            setWorkItemCreateForm((current) => ({ ...current, description }));
            setWorkItemCreateAttachmentStatus(`${entry.filename} 上传完成。`);
          }
        } catch (caught) {
          setWorkItemCreatePendingPastes((current) => current.filter((entry) => !processed.includes(entry)));
          setWorkItemCreateForm((current) => ({ ...current, description }));
          throw caught;
        }
        item = checkpoint.item;
        setWorkItemCreateCheckpoint({ ...checkpoint, primaryPostId });
      }
      if (item) {
        item = await api.updateWorkItem(item.key, {
          title: payload.title,
          priority: payload.priority,
          assigneeUsername: payload.assigneeUsername,
          cycleId: payload.cycleId,
          dueDate: payload.dueDate,
          parentItemKey: payload.parentItemKey,
        });
      } else {
        item = await api.createWorkItem({ ...payload, description: richTextHasContent(description) ? description : '' });
      }
      const needsPrimaryPost = Boolean(checkpoint) || richTextHasContent(description);
      if (needsPrimaryPost) {
        const body = richTextHasContent(description) ? description : '<p><br></p>';
        const primaryPost = await api.updateWorkItemPrimaryPost(item.key, body);
        setWorkItemCreateCheckpoint({ item, primaryPostId: primaryPost.id });
      }
      setWorkItemCreatePendingPastes([]);
      setWorkItemCreateOpen(false);
      setWorkItemCreateCheckpoint(null);
      setWorkItemCreateAttachmentStatus('');
      setStatusMessage(`${item.key} 已创建。`);
      navigate(buildWorkItemDetailPath({ owner: workItemOwner, itemKey: item.key }), `${item.key} 已创建。`);
    } catch (caught) {
      setWorkItemCreateError(errorMessage(/** @type {ApiError | Error} */ (caught)));
    } finally {
      setWorkItemCreateSubmitting(false);
    }
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
        projectKey: workItemListRoute.projectKey,
        cycleId: workItemListRoute.cycleId,
        sort: workItemListRoute.sort,
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
        projectKey: workItemListRoute.projectKey,
        cycleId: workItemListRoute.cycleId,
        sort: workItemListRoute.sort,
        page: 1,
        perPage: nextPerPage,
      }),
      `工作项列表每页切换为 ${nextPerPage} 条。`,
    );
  }

  /** @param {string} itemKey @param {boolean} selected */
  function toggleWorkItemSelection(itemKey, selected) {
    if (selected && !workItemSelection.has(itemKey) && workItemSelection.size >= 100) {
      setWorkItemBatchError('单次最多只能选择 100 个工作项。');
      return;
    }
    setWorkItemSelection((current) => {
      const next = new Set(current);
      if (selected) next.add(itemKey); else next.delete(itemKey);
      return next;
    });
  }

  /** @param {boolean} selected */
  function toggleCurrentWorkItemPage(selected) {
    const newItemKeys = currentWorkItemKeys.filter((itemKey) => !workItemSelection.has(itemKey));
    if (selected && workItemSelection.size + newItemKeys.length > 100) {
      setWorkItemBatchError('单次最多只能选择 100 个工作项。');
      return;
    }
    setWorkItemSelection((current) => {
      const next = new Set(current);
      for (const itemKey of currentWorkItemKeys) {
        if (selected) next.add(itemKey); else next.delete(itemKey);
      }
      return next;
    });
  }

  /** @param {React.ChangeEvent<HTMLSelectElement>} event */
  function changeWorkItemBatchAction(event) {
    const action = event.target.value;
    const defaults = { assignee: '', status: 'in_progress', priority: 'P2', cycle: '' };
    setWorkItemBatchForm({ action, value: defaults[action] ?? '' });
    setWorkItemBatchError('');
  }

  async function confirmWorkItemBatchUpdate() {
    if (!workItemListRoute || !workItemPage?.can_manage_work_items || workItemBatchMutationRef.current || workItemSelection.size === 0) return;
    workItemBatchMutationRef.current = true;
    setWorkItemBatchSubmitting(true);
    setWorkItemBatchError('');
    try {
      const action = /** @type {'assignee' | 'status' | 'priority' | 'cycle'} */ (workItemBatchForm.action);
      const result = await api.batchUpdateWorkItems({
        projectKey: workItemPage.filters.project_key,
        itemType: workItemPage.filters.item_type,
        itemKeys: [...workItemSelection],
        action,
        status: action === 'status' ? workItemBatchForm.value : '',
        assigneeUsername: action === 'assignee' ? workItemBatchForm.value : '',
        priority: action === 'priority' ? workItemBatchForm.value : '',
        cycleId: action === 'cycle' ? (Number.parseInt(workItemBatchForm.value, 10) || null) : null,
      });
      setWorkItemSelection(new Set(result.failed_items.map((item) => item.item_key)));
      setWorkItemBatchConfirmOpen(false);
      if (result.failed_count) {
        setWorkItemBatchError(result.failed_items.map((item) => `${item.item_key}：${item.message}`).join('；'));
        setStatusMessage(`已更新 ${result.updated_count} 项，${result.failed_count} 项未更新。`);
      } else {
        setStatusMessage(`已批量更新 ${result.updated_count} 个工作项。`);
      }
      await loadRouteState(routeRef.current, 'refresh');
    } catch (caught) {
      setWorkItemBatchError(errorMessage(caught instanceof Error ? caught : new Error('批量更新失败。')));
    } finally {
      workItemBatchMutationRef.current = false;
      setWorkItemBatchSubmitting(false);
    }
  }

  if (loading && !shellReady) {
    return <AppShellSkeleton />;
  }

  return (
    <div className="app-shell" aria-busy={loading || refreshing}>
      <ErrorToast open={Boolean(apiErrorToast)} message={apiErrorToast?.message || ''} onClose={() => setApiErrorToast(null)} />
      <p className="shell-live-region" role="status" aria-live="polite">
        {statusMessage || (refreshing ? '正在刷新页面数据。' : '')}
      </p>

      <GlobalNavigation
        productName="元策"
        links={[
          { id: 'home', label: '工作台', href: homePath, active: route.id === 'home' },
          { id: 'projects', label: '项目', href: currentProject ? buildProjectDetailPath({ owner: route.owner, projectKey: currentProject.key }) : projectsPath, active: route.id === 'projects' || route.id === 'project-detail' || route.id === 'project-cycle-detail' || route.id === 'project-resource-detail' || route.id === 'project-personal-analysis' },
          { id: 'requirements', label: '需求', href: requirementsPath, active: route.id === 'requirements', badge: topbar?.requirements_count || 0 },
          { id: 'tasks', label: '任务', href: tasksPath, active: route.id === 'tasks', badge: topbar?.tasks_count || 0 },
          { id: 'bugs', label: 'Bug', href: bugsPath, active: route.id === 'bugs', badge: topbar?.bugs_count || 0 },
        ]}
        currentProject={currentProject}
        projectOptions={topbar?.project_options || []}
        projectsHref={projectsPath}
        downloadsHref={route.owner === 'app' ? 'https://yuance.quanxinfu.com/web/downloads' : '/web/downloads'}
        systemLinks={(topbar?.system_links || []).map((link) => ({
          id: link.id,
          label: link.title,
          href: routePathForOwner(link.path, route.owner),
          active: link.id === 'dashboard' ? route.id === 'system-dashboard' : route.id === `system-${link.id}`,
        }))}
        messagesHref={messagesPath}
        unreadCount={unreadCount}
        notifications={previewItems.map((item) => ({ ...item, createdAt: formatTimestamp(item.created_at) }))}
        notificationBusy={messageReadAllSubmitting || messageOpeningId !== null}
        projectSwitchingKey={projectSwitchingKey}
        user={user}
        profileHref={profilePath}
        theme={theme}
        onNavigate={(event, path, label) => handleNavigate(event, path, `已切换到${label}。`)}
        onSearch={(query) => navigate(buildSearchPath({ owner: route.owner, q: query }), query ? `正在搜索 ${query}。` : '请输入搜索内容。')}
        onProjectChange={(project) => void handleSetCurrentProject(project)}
        onOpenNotification={(notification) => {
          const item = previewItems.find((candidate) => candidate.id === notification.id);
          if (item) void handleOpenNotification(item);
        }}
        onMarkAllRead={() => void handleMarkAllRead()}
        onThemeChange={handleThemeChange}
        onLogout={handleLogout}
      />

      <main ref={mainRef} className="main">
      <div ref={mainContentRef} className="main-content">

      {loading ? (
        <section className="shell-route-loading" role="status" aria-live="polite" aria-label={`正在加载${route.title}`}>
          <p className="shell-eyebrow">{routeEyebrow(route)}</p>
          <h1>{route.title}</h1>
          <p className="shell-subtitle">正在加载页面数据。</p>
          <div className="shell-route-loading-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </section>
      ) : (
        <>

      {error ? (
        <section className="shell-banner" role="alert">
          <strong>加载失败</strong>
          <span>{errorMessage(error)}</span>
        </section>
      ) : null}

      {!isWorkItemListRouteId(route.id) && !['home', 'unsupported', 'messages', 'search', 'profile', 'projects', 'project-detail', 'project-cycle-detail', 'project-resource-detail', 'project-personal-analysis', 'system-dashboard', 'system-users', 'system-permissions', 'system-roles', 'system-database-stats', 'system-audit', 'system-storage', 'system-openapi', 'system-releases'].includes(route.id) ? <header className="page-heading"><h1 ref={headingRef} tabIndex={-1}>{route.title}</h1><button className="page-heading-refresh" type="button" aria-label="刷新" title="刷新" disabled={refreshing} onClick={() => void loadRouteState(routeRef.current, 'refresh')}>↻</button></header> : null}

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
          {route.id === 'system-permissions' ? (
            <section className="page-stack system-permissions-page" aria-labelledby="system-permissions-title">
              <header className="page-hero"><div><p className="eyebrow">系统管理</p><h1 id="system-permissions-title" ref={headingRef} tabIndex={-1}>权限点</h1><p>权限点由 core seed 管理；角色权限维护推荐在角色权限工作台完成。</p></div><a className="yc-button yc-button-secondary" href={buildSystemRolesPath({ owner: route.owner })} onClick={(event) => handleNavigate(event, buildSystemRolesPath({ owner: route.owner }), '正在打开角色权限。')}>返回角色权限</a></header>
              <section className="shell-card system-permissions-panel" aria-labelledby="system-permission-tree-title">
              <div className="shell-panel-header"><div><h2 id="system-permission-tree-title">权限树</h2><p className="shell-muted">权限点由 core seed 维护，共 {systemPermissions.length} 项。</p></div></div>
              <FilterBar ariaLabel="权限筛选" onSubmit={(event) => { event.preventDefault(); const input = /** @type {HTMLInputElement | null} */ (event.currentTarget.elements.namedItem('q')); navigate(buildSystemPermissionsPath({ owner: route.owner, q: input?.value || '' }), '正在筛选权限目录。'); }} actions={<><Button type="submit">搜索</Button>{route.q ? <Button variant="secondary" onClick={() => navigate(buildSystemPermissionsPath({ owner: route.owner }), '已清除权限筛选。')}>清除</Button> : null}</>}>
                <FilterField id="system-permissions-query" label="搜索权限"><TextInput name="q" defaultValue={route.q} placeholder="名称、权限键或资源" /></FilterField>
              </FilterBar>
              {systemPermissionGroups.length ? <div className="permission-tree" aria-label="系统权限目录">{systemPermissionGroups.map((group) => <section className="permission-group" key={group.key}><header className="permission-group-head"><div className="permission-check permission-check-group"><span><strong>{group.key}</strong><em>{group.permissions.length} 个权限点</em></span></div></header><div className="permission-pages">{group.permissions.map((permission) => <article className="permission-page" key={permission.permission_key}><div className="permission-check permission-check-page"><span><strong>{permission.permission_name}</strong><em>{permission.permission_key} · {permission.resource_type === 'page' ? '页面' : '操作'}</em></span></div></article>)}</div></section>)}</div> : <Feedback tone="info" title={route.q ? '没有匹配的权限点。' : '暂无权限点。'} />}
              </section>
            </section>
          ) : route.id === 'system-database-stats' ? (
            <section className="shell-card system-ops-panel database-stats-panel" aria-labelledby="system-database-stats-title" aria-busy={systemDatabaseStatsRefreshing}>
              <div className="shell-panel-header system-ops-panel-head">
                <div>
                  <h1 id="system-database-stats-title" ref={headingRef} tabIndex={-1}>数据库统计</h1>
                  <p className="shell-muted">进入页面时仅展示浏览器缓存；点击刷新后才会重新读取最新表清单、备注与数据量。</p>
                </div>
                <Button loading={systemDatabaseStatsRefreshing} onClick={() => void refreshSystemDatabaseStats()}>刷新</Button>
              </div>
              {systemDatabaseStatsError ? <Feedback tone="danger" title="刷新失败">{systemDatabaseStatsError}{systemDatabaseStats ? ' 当前继续展示上一次缓存。' : ''}</Feedback> : null}
              {systemDatabaseStats ? (
                <>
                  <div className="database-stats-toolbar"><div className="database-stats-summary">
                    <strong>共 {systemDatabaseTables.length.toLocaleString('zh-CN')} 张表，合计 {systemDatabaseTotalRows.toLocaleString('zh-CN')} 行数据</strong>
                    <span className="shell-muted">{systemDatabaseStats.source === 'cache' ? '当前展示宿主缓存' : '已读取最新数据库快照'} · 上次刷新 {formatTimestamp(systemDatabaseStats.snapshot.refreshed_at)}</span>
                  </div></div>
                  <DataTable caption="数据库统计大表" rows={systemDatabaseTables} rowKey={(table) => table.table_name} emptyText="数据库中暂未发现可展示的业务表。" columns={[
                    { key: 'name', label: '表名', render: (table) => <strong>{table.table_name}</strong> },
                    { key: 'remark', label: '备注', render: (table) => table.remark || '业务表（备注待补充）' },
                    { key: 'count', label: '数据量', render: (table) => <><strong>{Number(table.row_count || 0).toLocaleString('zh-CN')}</strong><br /><span className="shell-muted">{Number(table.column_count || 0).toLocaleString('zh-CN')} 个字段</span></> },
                  ]} />
                </>
              ) : (
                <Feedback tone={systemDatabaseStatsError ? 'danger' : 'info'} title={systemDatabaseStatsError ? '刷新失败' : '当前宿主暂无缓存'}>
                  {systemDatabaseStatsError || '点击“刷新”后，系统会读取最新的表清单、表备注和数据量。'}
                </Feedback>
              )}
            </section>
          ) : route.id === 'system-audit' ? (
            <section className="shell-card system-ops-panel audit-panel" aria-labelledby="system-audit-title">
              <div className="shell-panel-header system-ops-panel-head">
                <div><h1 id="system-audit-title" ref={headingRef} tabIndex={-1}>审计日志</h1><p className="shell-muted">记录登录、首次初始化、用户角色维护、对象存储配置等关键操作，支持按操作人、动作和对象过滤。</p></div>
              </div>
              <FilterBar className="audit-filter-bar" ariaLabel="审计日志筛选" onSubmit={(event) => {
                event.preventDefault();
                const values = new FormData(event.currentTarget);
                navigate(buildSystemAuditPath({ owner: route.owner, actor: String(values.get('actor') || ''), action: String(values.get('action') || ''), targetType: String(values.get('target_type') || ''), targetId: String(values.get('target_id') || ''), perPage: route.perPage }), '正在筛选审计日志。');
              }} actions={<><Button type="submit">筛选</Button><Button variant="secondary" onClick={() => navigate(buildSystemAuditPath({ owner: route.owner }), '已重置审计筛选。')}>重置</Button></>}>
                <FilterField id="system-audit-actor" label="操作人"><TextInput name="actor" defaultValue={route.actor} placeholder="用户名或显示名称" /></FilterField>
                <FilterField id="system-audit-action" label="动作"><TextInput name="action" defaultValue={route.action} placeholder="如 auth.login" /></FilterField>
                <FilterField id="system-audit-target-type" label="对象类型"><TextInput name="target_type" defaultValue={route.targetType} placeholder="如 user / project" /></FilterField>
                <FilterField id="system-audit-target-id" label="对象 ID"><TextInput name="target_id" defaultValue={route.targetId} placeholder="对象编号或主键" /></FilterField>
              </FilterBar>
              <DataTable caption="审计日志列表" rows={systemAuditPage?.items || []} rowKey={(log) => log.id} emptyText="暂无审计记录。" columns={[
                { key: 'time', label: '时间', render: (log) => formatTimestamp(log.created_at) },
                { key: 'actor', label: '操作人', render: (log) => log.actor_username ? `${log.actor_display_name} @${log.actor_username}` : log.actor_display_name },
                { key: 'action', label: '动作', render: (log) => <><strong>{auditActionLabel(log.action)}</strong><br /><code>{log.action}</code></> },
                { key: 'target', label: '对象', render: (log) => log.target_type || log.target_id ? `${log.target_type}${log.target_id ? ` / ${log.target_id}` : ''}` : '系统' },
                { key: 'source', label: '来源', render: (log) => <>{log.ip || '-'}<br /><span className="shell-muted">{log.user_agent || '-'}</span></> },
                { key: 'metadata', label: '元数据', render: (log) => <code>{log.metadata || '{}'}</code> },
              ]} />
              {systemAuditPage ? <div className="system-ops-pager"><Pagination page={systemAuditPage.pagination.page} totalPages={systemAuditPage.pagination.total_pages} totalItems={systemAuditPage.pagination.total_items} onPageChange={(page) => navigate(buildSystemAuditPath({ owner: route.owner, actor: route.actor, action: route.action, targetType: route.targetType, targetId: route.targetId, page, perPage: route.perPage }), `正在打开第 ${page} 页审计日志。`)} /><label className="shell-page-size">每页<select value={route.perPage} onChange={(event) => navigate(buildSystemAuditPath({ owner: route.owner, actor: route.actor, action: route.action, targetType: route.targetType, targetId: route.targetId, perPage: Number(event.target.value) }), '正在更新每页数量。')}><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option></select></label></div> : null}
            </section>
          ) : route.id === 'system-api-docs' ? (
            <section className="shell-card shell-panel-wide" aria-labelledby="system-api-docs-title">
              <div className="shell-panel-header">
                <div><h2 id="system-api-docs-title">{systemApiDocs?.title || '系统 API 文档'}</h2><p className="shell-muted">OpenAPI {systemApiDocs?.openapi || '-'} · 契约版本 {systemApiDocs?.version || '-'}</p></div>
                <a className="shell-link" href={buildSystemOpenApiPath(route.owner)} onClick={(event) => handleNavigate(event, buildSystemOpenApiPath(route.owner), '正在打开系统 Token 管理。')}>系统 Token 管理</a>
              </div>
              {systemApiDocs ? <>
                <p>{systemApiDocs.description}</p>
                <nav className="api-docs-nav" aria-label="API 端点导航">
                  {systemApiDocs.operations.map((operation) => <a key={operation.id} className="shell-link" href={`#${operation.id}`}><strong className={`api-docs-method api-docs-method-${operation.method.toLowerCase()}`}>{operation.method}</strong> <code>{operation.path}</code><span>{operation.summary}</span></a>)}
                </nav>
                {systemApiDocs.operations.length === 0 ? <Feedback tone="info" title="当前契约没有登记 API 操作。" /> : null}
                <div className="api-docs-operations" aria-label="API 操作契约">
                  {systemApiDocs.operations.map((operation) => <article id={operation.id} className="api-docs-operation" key={operation.id}>
                    <div className="shell-panel-header"><div className="api-docs-heading"><span className={`api-docs-method api-docs-method-${operation.method.toLowerCase()}`}>{operation.method}</span><h3><code>{operation.path}</code></h3></div><a className="shell-link" href="#system-api-docs-title">返回顶部</a></div>
                    <p><strong>{operation.summary}</strong></p>
                    {operation.description ? <p className="shell-muted">{operation.description}</p> : null}
                    {operation.tags.length ? <p className="shell-muted">标签：{operation.tags.join('、')}</p> : null}
                    <details><summary>查看完整操作契约</summary><pre className="shell-code-block">{operation.contract}</pre></details>
                  </article>)}
                </div>
                <details><summary>查看 Components</summary><pre className="shell-code-block">{systemApiDocs.components}</pre></details>
                <details><summary>查看完整 OpenAPI JSON</summary><pre className="shell-code-block">{systemApiDocs.source}</pre></details>
              </> : null}
            </section>
          ) : route.id === 'system-openapi' ? (
            <section className="page-stack system-openapi-page" aria-labelledby="system-openapi-title">
              <header className="page-hero"><div><p className="eyebrow">系统管理</p><h1 id="system-openapi-title" ref={headingRef} tabIndex={-1}>系统 OpenAPI</h1><p>独立于普通业务 OpenAPI，当前用于版本管理自动化接入。适合 GitHub Actions、发布脚本和系统级集成。</p></div>{systemOpenApiView?.can_manage_tokens ? <Button disabled={systemApiTokenSubmitting || (systemOpenApiView.active_count >= systemOpenApiView.token_limit)} onClick={openSystemApiTokenCreate}>创建系统 Token</Button> : null}</header>
              <section className="storage-layout system-openapi-layout">
                <section className="shell-card system-openapi-access-panel"><div className="shell-panel-header system-openapi-panel-head"><div><h2>文档与接入</h2><p className="shell-muted">system token 使用 Bearer 认证；第一阶段仅开放版本读取与版本写入能力。</p></div></div><div className="system-openapi-body"><div className="system-openapi-actions"><a className="yc-button yc-button-secondary" href="/api/system/openapi.json" target="_blank" rel="noreferrer">下载 OpenAPI JSON</a><a className="yc-button yc-button-secondary" href={buildSystemApiDocsPath(route.owner)} onClick={(event) => handleNavigate(event, buildSystemApiDocsPath(route.owner), '正在打开系统 API 文档。')}>打开在线文档</a></div><dl className="system-openapi-summary"><div className="system-openapi-summary-item"><dt>认证方式</dt><dd><code>Authorization: Bearer &lt;system_token&gt;</code></dd></div><div className="system-openapi-summary-item"><dt>当前开放</dt><dd><div className="system-openapi-scope-list" aria-label="当前开放接口范围">{['版本列表', '版本详情', '创建版本', '编辑版本', '发布版本', '资产上传签名', '上传确认'].map((label) => <span className="system-openapi-scope" key={label}>{label}</span>)}</div></dd></div><div className="system-openapi-summary-item system-openapi-summary-item-muted"><dt>暂未开放</dt><dd>版本保留策略、对象存储设置、用户 / 角色 / 审计等其它系统接口。</dd></div></dl></div></section>
                <aside className="shell-card storage-side"><h2>接入提示</h2><ul className="check-list"><li>优先为自动化任务创建最小权限 token。</li><li>版本资产上传采用：创建资产 → 获取上传地址 → 上传文件 → 确认已上传。</li><li>{systemOpenApiView?.can_manage_tokens ? 'Token 明文仅在创建成功后展示一次；删除后立即失效。' : '你当前只有查看权限，无法修改 token。'}</li></ul></aside>
              </section>
              <section className="shell-card api-token-panel"><div className="shell-panel-header system-openapi-panel-head"><div><h2>System Access Token</h2><p className="shell-muted">用于 system OpenAPI 的独立访问凭证，和普通用户 PAT 分离。</p></div><div className="token-panel-actions"><span className="token-quota">有效 Token {systemOpenApiView?.active_count || 0}/{systemOpenApiView?.token_limit || 100}</span>{systemOpenApiView?.can_manage_tokens ? <Button disabled={systemApiTokenSubmitting || (systemOpenApiView.active_count >= systemOpenApiView.token_limit)} onClick={openSystemApiTokenCreate}>创建 Token</Button> : null}</div></div>
              {createdSystemApiToken ? <Feedback tone="success" title="系统 Token 已创建"><Field id="system-api-token-created" label="Token 明文" hint="关闭或刷新后不再显示。"><TextInput readOnly value={createdSystemApiToken} onFocus={(event) => event.currentTarget.select()} /></Field></Feedback> : null}
              {systemApiTokenError && !systemApiTokenEditor && !systemApiTokenDeleteTarget ? <Feedback tone="danger" title="系统 Token 操作失败">{systemApiTokenError}</Feedback> : null}
              <DataTable caption="系统 OpenAPI Token 列表" rows={systemOpenApiView?.items || []} rowKey={(item) => item.id} emptyText="暂无系统 Token。" columns={[
                { key: 'name', label: '名称', render: (item) => <><strong>{item.name}</strong><br /><code>****{item.token_suffix}</code></> },
                { key: 'scopes', label: 'Scope', render: (item) => item.scopes.map((scope) => scope === 'system_release:read' ? '版本读取' : '版本写入 / 发布 / 资产上传').join('、') },
                { key: 'creator', label: '创建 / 更新', render: (item) => <>{item.created_by || '系统'}<br /><span className="shell-muted">{item.updated_by || '系统'}</span></> },
                { key: 'activity', label: '最近使用', render: (item) => item.last_used_at ? formatTimestamp(item.last_used_at) : '从未使用' },
                { key: 'created', label: '创建时间', render: (item) => formatTimestamp(item.created_at) },
                { key: 'actions', label: '操作', render: (item) => systemOpenApiView?.can_manage_tokens ? <div className="shell-actions-inline"><Button variant="secondary" disabled={systemApiTokenSubmitting} onClick={() => openSystemApiTokenEdit(item)}>编辑</Button><Button variant="danger" disabled={systemApiTokenSubmitting} onClick={() => { setSystemApiTokenError(''); setCreatedSystemApiToken(''); setSystemApiTokenDeleteTarget(item); }}>删除</Button></div> : '只读' },
              ]} />
              </section>
              <Modal open={Boolean(systemApiTokenEditor)} title={systemApiTokenEditor?.mode === 'create' ? '创建系统 Token' : '编辑系统 Token'} onClose={() => { if (!systemApiTokenSubmitting) { setSystemApiTokenEditor(null); setSystemApiTokenError(''); } }} footer={<><Button variant="secondary" disabled={systemApiTokenSubmitting} onClick={() => setSystemApiTokenEditor(null)}>取消</Button><Button loading={systemApiTokenSubmitting} disabled={!systemApiTokenForm.name.trim() || systemApiTokenForm.scopes.length === 0} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('system-api-token-form'))?.requestSubmit()}>{systemApiTokenEditor?.mode === 'create' ? '创建' : '保存'}</Button></>}>
                <form id="system-api-token-form" onSubmit={submitSystemApiToken}>
                  <Field id="system-api-token-name" label="名称" required><TextInput maxLength={80} value={systemApiTokenForm.name} onChange={(event) => setSystemApiTokenForm((current) => ({ ...current, name: event.target.value }))} /></Field>
                  <fieldset disabled={systemApiTokenSubmitting}><legend>Scope</legend>
                    <label><input type="checkbox" checked={systemApiTokenForm.scopes.includes('system_release:read')} onChange={(event) => toggleSystemApiTokenScope('system_release:read', event.target.checked)} /> 版本读取</label>
                    <label><input type="checkbox" checked={systemApiTokenForm.scopes.includes('system_release:write')} onChange={(event) => toggleSystemApiTokenScope('system_release:write', event.target.checked)} /> 版本写入 / 发布 / 资产上传</label>
                  </fieldset>
                  {systemApiTokenError ? <Feedback tone="danger" title="保存失败">{systemApiTokenError}</Feedback> : null}
                </form>
              </Modal>
              <Modal open={Boolean(systemApiTokenDeleteTarget)} title="删除系统 Token" onClose={() => { if (!systemApiTokenSubmitting) { setSystemApiTokenDeleteTarget(null); setSystemApiTokenError(''); } }} footer={<><Button variant="secondary" disabled={systemApiTokenSubmitting} onClick={() => setSystemApiTokenDeleteTarget(null)}>取消</Button><Button variant="danger" loading={systemApiTokenSubmitting} onClick={() => void confirmSystemApiTokenDelete()}>确认删除</Button></>}><p>确认删除 {systemApiTokenDeleteTarget?.name || ''}？使用该 Token 的自动化会立即失去访问权限。</p>{systemApiTokenError ? <Feedback tone="danger" title="删除失败">{systemApiTokenError}</Feedback> : null}</Modal>
            </section>
          ) : route.id === 'system-releases' ? (
            <section className="page-stack system-release-page" aria-label="发布工作台">
              <header className="page-hero"><div><p className="eyebrow">系统管理</p><h1 id="system-releases-title" ref={headingRef} tabIndex={-1}>版本管理</h1><p>维护桌面端与移动端发布版本，安装包统一走当前已激活的对象存储。</p></div>{systemReleasesView?.can_manage_releases ? <Button disabled={systemReleaseSubmitting} onClick={openSystemReleaseCreate}>新建版本</Button> : null}</header>
              <section className="storage-layout system-release-policy-layout"><section className="shell-card system-release-policy-panel"><div className="shell-panel-header system-release-panel-head"><div><h2>保留策略</h2><p className="shell-muted">仅对已发布版本生效。超过保留数的旧版本会自动删除数据库记录和 OSS 对象。</p></div></div>
              {systemReleaseError && !systemReleaseEditor && !systemReleaseConfirmation ? <Feedback tone="danger" title="发布操作需要处理">{systemReleaseError}</Feedback> : null}
              {systemReleasesView ? <dl className="config-summary-grid storage-meta"><div className="config-summary-item"><dt>当前保留数</dt><dd>{systemReleasesView.settings.retention_count}</dd></div><div className="config-summary-item"><dt>最近更新人</dt><dd>{systemReleasesView.settings.updated_by || '系统'}</dd></div><div className="config-summary-item"><dt>更新时间</dt><dd>{formatTimestamp(systemReleasesView.settings.updated_at)}</dd></div></dl> : null}
              {systemReleasesView?.can_manage_releases ? <form className="system-release-settings-form" onSubmit={submitSystemReleaseSettings}>
                <Field id="system-release-retention" label="已发布版本保留数"><TextInput type="number" min="1" max="50" required value={systemReleaseSettingsCount} onChange={(event) => setSystemReleaseSettingsCount(Number(event.target.value))} /></Field>
                <Button type="submit" variant="secondary" loading={systemReleaseSubmitting}>更新保留策略</Button>
              </form> : null}</section><aside className="shell-card storage-side"><h2>发布约束</h2><ul className="check-list"><li>新建版本默认是草稿，满足通道校验后才能发布。</li><li>一个版本可以包含 Windows、macOS、Linux、Android 和 iOS 等平台产物。</li><li>安装包通过临时签名地址上传，不在页面暴露长期 OSS 凭证。</li><li>internal 桌面版本仅代表项目完整性签名：macOS ad-hoc、Windows 未签名、Linux minisign，不代表生产系统信任。</li><li>已撤回版本不再作为 latest，也不会再签发新下载地址；旧预签名 URL 最长残余 5 分钟。</li></ul></aside></section>
              <section className="shell-card system-release-list-panel" aria-labelledby="system-release-list-title">
                <div className="shell-panel-header system-release-panel-head"><div><h2 id="system-release-list-title">版本列表</h2><p className="shell-muted">已发布版本优先，其余按更新时间倒序。</p></div></div>
                <DataTable caption="系统版本列表" rows={systemReleasesView?.items || []} rowKey={(item) => item.release.id} emptyText="暂无版本记录。" columns={[
                  { key: 'version', label: '版本', render: (item) => <><strong>{item.release.version_name}</strong><br /><span className="shell-muted">{item.release.channel}</span></> },
                  { key: 'title', label: '标题 / 说明', render: (item) => <><strong>{item.release.title || '未填写标题'}</strong><br /><span className="shell-muted">{item.release.notes || '暂无版本说明'}</span></> },
                  { key: 'status', label: '状态', render: (item) => <>{item.release.status}<br /><span className="shell-muted">{item.release.verification_status || '未校验'}</span></> },
                  { key: 'signing', label: '签名 / 来源', render: (item) => item.release.channel === 'internal' ? <><code>{item.release.signing_key_id || '-'}</code><br /><span className="shell-muted">{item.release.source_tag || '-'} · {item.release.manifest_sha256?.slice(0, 12) || '-'}…</span></> : '-' },
                  { key: 'withdrawal', label: '撤回状态', render: (item) => item.release.withdrawn_at ? <><strong>已撤回</strong><br /><span className="shell-muted">{item.release.withdrawal_reason || '-'} · GitHub {item.release.github_withdrawal_status || '-'}</span></> : <span className="shell-muted">未撤回</span> },
                  { key: 'assets', label: '平台 / 资产', render: (item) => <>{item.release.platform_count} 个平台 · {item.release.asset_count} 个文件<br /><span className="shell-muted">{item.assets.map((asset) => `${asset.platform} ${asset.architecture}`).join('，') || '暂无安装包'}</span></> },
                  { key: 'updated', label: '更新', render: (item) => <>{item.release.updated_by || '系统'}<br /><span className="shell-muted">{formatTimestamp(item.release.updated_at)}</span></> },
                  { key: 'actions', label: '操作', render: (item) => systemReleasesView?.can_manage_releases ? <div className="shell-actions-inline">
                    {item.release.status === 'draft' ? <Button variant="secondary" disabled={systemReleaseSubmitting} onClick={() => openSystemReleaseEdit(item.release)}>编辑</Button> : null}
                    {item.release.status === 'draft' && item.release.channel === 'internal' && item.release.verification_status === 'pending' ? <Button variant="secondary" disabled={systemReleaseSubmitting} onClick={() => setSystemReleaseConfirmation({ kind: 'verify', release: item.release })}>校验</Button> : null}
                    {item.release.status === 'draft' && (item.release.channel === 'legacy' || item.release.verification_status === 'verified') ? <Button disabled={systemReleaseSubmitting} onClick={() => setSystemReleaseConfirmation({ kind: 'publish', release: item.release })}>发布</Button> : null}
                    {item.release.status === 'published' ? <Button variant="danger" disabled={systemReleaseSubmitting} onClick={() => setSystemReleaseConfirmation({ kind: 'withdraw', release: item.release, reason: '' })}>撤回</Button> : null}
                  </div> : null },
                ]} />
              <section aria-labelledby="system-release-assets-title">
                <div className="shell-panel-header"><div><h3 id="system-release-assets-title">版本资产</h3></div></div>
                <DataTable caption="系统版本资产" rows={(systemReleasesView?.items || []).flatMap((item) => item.assets.map((asset) => ({ ...asset, version_name: item.release.version_name, release_status: item.release.status })))} rowKey={(item) => item.id} emptyText="当前页版本暂无资产。" columns={[
                  { key: 'version', label: '版本', render: (item) => item.version_name },
                  { key: 'platform', label: '平台', render: (item) => `${item.platform} · ${item.architecture}` },
                  { key: 'filename', label: '文件', render: (item) => <><strong>{item.filename}</strong><br /><span className="shell-muted">{item.content_type}</span></> },
                  { key: 'kind', label: '类型', render: (item) => item.artifact_kind },
                  { key: 'size', label: '字节数', render: (item) => item.byte_size.toLocaleString() },
                  { key: 'status', label: '状态', render: (item) => item.status },
                  { key: 'created', label: '创建时间', render: (item) => formatTimestamp(item.created_at) },
                  { key: 'actions', label: '操作', render: (item) => <div className="shell-actions-inline">{item.status === 'uploaded' ? <Button variant="secondary" loading={systemReleaseAssetDownloadingId === item.id} disabled={systemReleaseAssetDownloadingId !== null || systemReleaseSubmitting} onClick={() => void downloadSystemReleaseAsset(item)}>下载</Button> : null}{systemReleasesView?.can_manage_releases && item.release_status === 'draft' ? <Button variant="danger" disabled={systemReleaseSubmitting || systemReleaseAssetDownloadingId !== null} onClick={() => setSystemReleaseAssetDeleteTarget(item)}>删除</Button> : null}</div> },
                ]} />
              </section>
              {systemReleasesView ? <div className="shell-panel-header"><Pagination page={systemReleasesView.pagination.page} totalPages={systemReleasesView.pagination.total_pages} totalItems={systemReleasesView.pagination.total_items} onPageChange={(page) => navigate(buildSystemReleasesPath({ owner: route.owner, page, perPage: systemReleasesView.pagination.per_page }), `正在加载第 ${page} 页版本。`)} /><label className="shell-page-size">每页<select value={systemReleasesView.pagination.per_page} onChange={(event) => navigate(buildSystemReleasesPath({ owner: route.owner, perPage: Number(event.target.value) }), '正在更新每页数量。')}><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option></select></label></div> : null}
              </section>
              <Modal open={Boolean(systemReleaseEditor)} title={systemReleaseEditor?.mode === 'edit' ? '编辑版本草稿' : '新建版本草稿'} onClose={() => { if (!systemReleaseSubmitting) setSystemReleaseEditor(null); }} footer={<><Button variant="secondary" disabled={systemReleaseSubmitting} onClick={() => setSystemReleaseEditor(null)}>取消</Button><Button type="submit" form="system-release-editor-form" loading={systemReleaseSubmitting}>保存草稿</Button></>}>
                <form id="system-release-editor-form" onSubmit={submitSystemReleaseEditor}>
                  <Field id="system-release-version" label="版本号" required><TextInput required value={systemReleaseForm.versionName} onChange={(event) => setSystemReleaseForm((current) => ({ ...current, versionName: event.target.value }))} /></Field>
                  <Field id="system-release-title" label="版本标题"><TextInput value={systemReleaseForm.title} onChange={(event) => setSystemReleaseForm((current) => ({ ...current, title: event.target.value }))} /></Field>
                  <Field id="system-release-notes" label="版本说明"><TextArea rows={6} value={systemReleaseForm.notes} onChange={(event) => setSystemReleaseForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
                  {systemReleaseEditor?.mode === 'create' ? <Field id="system-release-channel" label="发布通道"><select value={systemReleaseForm.channel} onChange={(event) => setSystemReleaseForm((current) => ({ ...current, channel: event.target.value }))}><option value="legacy">常规发布</option><option value="internal">内部桌面发布</option></select></Field> : <p className="shell-muted">发布通道：{systemReleaseForm.channel}</p>}
                  {systemReleaseEditor?.mode === 'create' && systemReleaseForm.channel === 'internal' ? <>
                    <Field id="system-release-manifest" label="Manifest SHA-256" required><TextInput required value={systemReleaseForm.manifestSha256} onChange={(event) => setSystemReleaseForm((current) => ({ ...current, manifestSha256: event.target.value }))} /></Field>
                    <Field id="system-release-signing-key" label="签名 Key ID" required><TextInput required value={systemReleaseForm.signingKeyId} onChange={(event) => setSystemReleaseForm((current) => ({ ...current, signingKeyId: event.target.value }))} /></Field>
                    <Field id="system-release-source-commit" label="Source Commit" required><TextInput required value={systemReleaseForm.sourceCommit} onChange={(event) => setSystemReleaseForm((current) => ({ ...current, sourceCommit: event.target.value }))} /></Field>
                    <Field id="system-release-source-tag" label="Source Tag" required><TextInput required value={systemReleaseForm.sourceTag} onChange={(event) => setSystemReleaseForm((current) => ({ ...current, sourceTag: event.target.value }))} /></Field>
                  </> : null}
                  {systemReleaseError ? <Feedback tone="danger" title="版本保存失败">{systemReleaseError}</Feedback> : null}
                </form>
                {systemReleaseEditor?.mode === 'edit' ? <section aria-labelledby="system-release-upload-title">
                  <div className="shell-panel-header"><div><h3 id="system-release-upload-title">版本资产</h3><p className="shell-muted">选择资产坐标后由当前宿主安全上传。</p></div></div>
                  <div className="shell-actions-inline">
                    <Field id="system-release-asset-platform" label="平台"><select value={systemReleaseAssetForm.platform} onChange={(event) => setSystemReleaseAssetForm((current) => ({ ...current, platform: event.target.value }))}><option value="windows">Windows</option><option value="macos">macOS</option><option value="linux">Linux</option><option value="android">Android</option><option value="ios">iOS</option></select></Field>
                    <Field id="system-release-asset-architecture" label="架构"><select value={systemReleaseAssetForm.architecture} onChange={(event) => setSystemReleaseAssetForm((current) => ({ ...current, architecture: event.target.value }))}><option value="x64">x64</option><option value="arm64">ARM64</option><option value="universal">通用</option></select></Field>
                    <Field id="system-release-asset-kind" label="资产类型"><select value={systemReleaseAssetForm.artifactKind} onChange={(event) => setSystemReleaseAssetForm((current) => ({ ...current, artifactKind: event.target.value }))}><option value="installer">安装包</option><option value="signature">签名</option><option value="sbom">SBOM</option><option value="manifest">Manifest</option><option value="checksums">Checksums</option></select></Field>
                    <Button type="button" variant="secondary" loading={systemReleaseSubmitting} onClick={() => void uploadSelectedSystemReleaseAsset()}>选择并上传</Button>
                  </div>
                  {systemReleaseAssetStage ? <p role="status" className="shell-muted">上传阶段：{systemReleaseAssetStage}</p> : null}
                </section> : null}
              </Modal>
              <Modal open={Boolean(systemReleaseConfirmation)} title={systemReleaseConfirmation?.kind === 'publish' ? '发布版本' : systemReleaseConfirmation?.kind === 'verify' ? '校验内部版本' : '撤回版本'} onClose={() => { if (!systemReleaseSubmitting) setSystemReleaseConfirmation(null); }} footer={<><Button variant="secondary" disabled={systemReleaseSubmitting} onClick={() => setSystemReleaseConfirmation(null)}>取消</Button><Button variant={systemReleaseConfirmation?.kind === 'withdraw' ? 'danger' : 'primary'} loading={systemReleaseSubmitting} disabled={systemReleaseConfirmation?.kind === 'withdraw' && !systemReleaseConfirmation.reason?.trim()} onClick={() => void confirmSystemReleaseAction()}>确认</Button></>}>
                <p>{systemReleaseConfirmation?.kind === 'publish' ? `确认发布 ${systemReleaseConfirmation.release.version_name}？发布后版本元数据和资产不可修改。` : systemReleaseConfirmation?.kind === 'verify' ? `确认校验 ${systemReleaseConfirmation.release.version_name} 的平台资产、签名和供应链证据？` : `确认撤回 ${systemReleaseConfirmation?.release.version_name || ''}？下载入口将立即失效。`}</p>
                {systemReleaseConfirmation?.kind === 'withdraw' ? <Field id="system-release-withdraw-reason" label="撤回原因" required><TextArea required rows={4} value={systemReleaseConfirmation.reason || ''} onChange={(event) => setSystemReleaseConfirmation((current) => current ? { ...current, reason: event.target.value } : current)} /></Field> : null}
                {systemReleaseError ? <Feedback tone="danger" title="操作失败">{systemReleaseError}</Feedback> : null}
              </Modal>
              <Modal open={Boolean(systemReleaseAssetDeleteTarget)} title="删除版本资产" onClose={() => { if (!systemReleaseSubmitting) setSystemReleaseAssetDeleteTarget(null); }} footer={<><Button variant="secondary" disabled={systemReleaseSubmitting} onClick={() => setSystemReleaseAssetDeleteTarget(null)}>取消</Button><Button variant="danger" loading={systemReleaseSubmitting} onClick={() => void deleteSystemReleaseAsset()}>确认删除</Button></>}><p>确认删除 {systemReleaseAssetDeleteTarget?.filename || ''}？对象存储中的文件也会被删除。</p></Modal>
            </section>
          ) : route.id === 'system-storage' ? (
            <section className="storage-page" aria-label="存储工作台">
              <section className="storage-layout">
                <section className="shell-card storage-form" aria-labelledby="system-storage-title">
                  <div className="shell-panel-header storage-panel-head"><div><h1 id="system-storage-title" ref={headingRef} tabIndex={-1}>阿里云 OSS</h1><p className="shell-muted">长期密钥加密入库，页面只展示 AccessKey ID 脱敏 hint。</p></div>{systemStorageView?.can_manage_storage ? <div className="shell-actions-inline">{systemStorageView.config ? <Button variant="secondary" disabled={systemStorageSubmitting} onClick={() => void probeSystemStorage()}>测试连接</Button> : null}<Button disabled={systemStorageSubmitting} onClick={openSystemStorageEdit}>编辑配置</Button></div> : null}</div>
                  {systemStorageError ? <Feedback tone="danger" title="存储操作需要处理">{systemStorageError}</Feedback> : null}
                  {systemStorageView?.config ? <dl className="config-summary-grid storage-meta">
                    <div className="config-summary-item"><dt>Provider</dt><dd>{systemStorageView.config.provider}</dd></div>
                    <div className="config-summary-item"><dt>状态</dt><dd><span className={`status status-${systemStorageView.config.status === 'active' ? 'success' : 'muted'}`}>{systemStorageView.config.status}</span></dd></div>
                    <div className="config-summary-item"><dt>Bucket</dt><dd>{systemStorageView.config.bucket}</dd></div>
                    <div className="config-summary-item"><dt>AccessKey</dt><dd>{systemStorageView.config.access_key_id_hint || '未配置'}</dd></div>
                    <div className="config-summary-item"><dt>版本</dt><dd>v{systemStorageView.config.version} · {formatTimestamp(systemStorageView.config.updated_at)}</dd></div>
                  </dl> : <div className="storage-empty"><strong>尚未配置对象存储</strong><span>{systemStorageView?.inspection_error || '保存并激活配置后，文件上传底座将使用 OSS 生成短期签名 URL。'}</span></div>}
                </section>
                <aside className="shell-card storage-side"><h2>配置边界</h2><ul className="check-list"><li>长期密钥不进入页面、日志或静态文件。</li><li>业务上传使用服务端短期签名 URL。</li><li>每次保存和回滚都会生成不可变配置快照。</li></ul></aside>
              </section>
              <section className="shell-card storage-bucket-panel" aria-labelledby="system-storage-inspection-title">
                <div className="shell-panel-header storage-panel-head"><div><h2 id="system-storage-inspection-title">桶状态</h2><p className="shell-muted">检测当前激活 Bucket 的读写权限；初始化会按需创建 Bucket、补齐浏览器直传 CORS，并写入元策初始化标记。</p></div>{systemStorageView?.can_manage_storage && systemStorageView.config ? <div className="shell-actions-inline"><Button variant="secondary" disabled={systemStorageSubmitting} onClick={() => void probeSystemStorage()}>检测桶状态</Button><Button disabled={systemStorageSubmitting} onClick={() => setSystemStorageConfirmation({ kind: 'initialize' })}>初始化桶</Button></div> : null}</div>
                {systemStorageView?.inspection ? <div className="storage-bucket-body"><div className="storage-bucket-summary"><div><strong>{systemStorageView.config?.bucket || '未配置 Bucket'}</strong><span>{systemStorageView.config?.provider || 'aliyun_oss'}</span></div><span className={`status status-${systemStorageView.inspection.ok ? 'success' : systemStorageView.inspection.needs_initialization ? 'warning' : 'danger'}`}>{systemStorageView.inspection.ok ? '运行就绪' : systemStorageView.inspection.needs_initialization ? '需要初始化' : '检测异常'}</span></div><p className="storage-bucket-message">{systemStorageView.inspection.message}</p>{systemStorageView.inspection.checks?.length ? <div className="storage-check-list" aria-label="存储检查项目">{systemStorageView.inspection.checks.map((item) => <article className="storage-check-row" key={item.code}><span className={`status status-${item.status === 'ok' ? 'success' : item.status === 'missing' ? 'warning' : 'info'}`}>{item.status}</span><div><strong>{item.code}</strong><p>{item.message}</p></div></article>)}</div> : null}</div> : systemStorageView?.config ? <div className="storage-bucket-body"><Feedback tone="warning" title="Bucket 检查不可用">{systemStorageView.inspection_error}</Feedback></div> : null}
              </section>
              <section className="shell-card storage-versions-panel" aria-labelledby="system-storage-versions-title">
                <div className="shell-panel-header storage-panel-head"><div><h2 id="system-storage-versions-title">配置版本</h2><p className="shell-muted">按时间倒序保留对象存储快照；回滚会生成新的激活版本，不直接修改历史记录。</p></div></div>
                {(systemStorageView?.versions || []).length ? <div className="storage-version-list" aria-label="存储配置版本">{systemStorageView.versions.map((item) => <article className="storage-version-row" key={item.id}><div className="storage-version-main"><div className="storage-version-title"><strong>v{item.version}</strong><span className={`status status-${item.current_status === 'active' ? 'success' : 'muted'}`}>{item.current_status}</span></div><div className="storage-version-meta"><span>{item.bucket}</span><span>{item.endpoint}</span><span>{item.access_key_id_hint || '未配置'}</span></div><div className="storage-version-foot"><span>{item.provider}</span><span>{item.region || '未填写地域'}</span><span>{item.created_by || '系统'} · {formatTimestamp(item.created_at)}</span></div></div>{systemStorageView?.can_manage_storage ? <div className="storage-version-actions">{item.current_status === 'active' ? <span className="shell-muted">当前激活</span> : <Button variant="secondary" disabled={systemStorageSubmitting} onClick={() => setSystemStorageConfirmation({ kind: 'rollback', version: item.version, bucket: item.bucket })}>回滚到此版本</Button>}</div> : null}</article>)}</div> : <div className="storage-empty"><strong>暂无配置版本</strong><span>保存对象存储配置后，系统会自动记录版本快照。</span></div>}
                {systemStorageView ? <div className="storage-pager"><Pagination page={systemStorageView.pagination.page} totalPages={systemStorageView.pagination.total_pages} totalItems={systemStorageView.pagination.total_items} onPageChange={(page) => navigate(buildSystemStoragePath({ owner: route.owner, page, perPage: systemStorageView.pagination.per_page }), `正在加载第 ${page} 页存储版本。`)} /><label className="shell-page-size">每页<select value={systemStorageView.pagination.per_page} onChange={(event) => navigate(buildSystemStoragePath({ owner: route.owner, perPage: Number(event.target.value) }), '正在更新每页数量。')}><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option></select></label></div> : null}
              </section>
              <Modal open={systemStorageEditOpen} title="编辑阿里云 OSS 配置" onClose={closeSystemStorageEdit} footer={<><Button variant="secondary" disabled={systemStorageSubmitting} onClick={closeSystemStorageEdit}>取消</Button><Button variant="secondary" loading={systemStorageSubmitting} onClick={() => void requestSystemStorageSave(false)}>保存草稿</Button><Button loading={systemStorageSubmitting} onClick={() => void requestSystemStorageSave(true)}>保存并激活</Button></>}>
                <form id="system-storage-form" onSubmit={(event) => { event.preventDefault(); void requestSystemStorageSave(true); }}>
                  <Field id="system-storage-endpoint" label="Endpoint" required><TextInput value={systemStorageForm.endpoint} onChange={(event) => setSystemStorageForm((current) => ({ ...current, endpoint: event.target.value }))} /></Field>
                  <Field id="system-storage-region" label="Region"><TextInput value={systemStorageForm.region} onChange={(event) => setSystemStorageForm((current) => ({ ...current, region: event.target.value }))} /></Field>
                  <Field id="system-storage-bucket" label="Bucket" required><TextInput value={systemStorageForm.bucket} onChange={(event) => setSystemStorageForm((current) => ({ ...current, bucket: event.target.value }))} /></Field>
                  <Field id="system-storage-access-key-id" label="AccessKey ID" hint={systemStorageView?.config?.access_key_id_hint ? `当前仅显示脱敏值：${systemStorageView.config.access_key_id_hint}` : '保存后不再回显明文。'} required><TextInput autoComplete="off" value={systemStorageForm.accessKeyId} onChange={(event) => setSystemStorageForm((current) => ({ ...current, accessKeyId: event.target.value }))} /></Field>
                  <Field id="system-storage-access-key-secret" label="AccessKey Secret" hint="保存后不再回显明文。" required><TextInput type="password" autoComplete="new-password" value={systemStorageForm.accessKeySecret} onChange={(event) => setSystemStorageForm((current) => ({ ...current, accessKeySecret: event.target.value }))} /></Field>
                  {systemStorageError ? <Feedback tone="danger" title="配置保存失败">{systemStorageError}</Feedback> : null}
                </form>
              </Modal>
              <Modal open={Boolean(systemStorageConfirmation)} title={systemStorageConfirmation?.kind === 'save' ? '切换对象存储目标' : systemStorageConfirmation?.kind === 'initialize' ? '初始化对象存储 Bucket' : '回滚对象存储配置'} onClose={() => { if (!systemStorageSubmitting) setSystemStorageConfirmation(null); }} footer={<><Button variant="secondary" disabled={systemStorageSubmitting} onClick={() => setSystemStorageConfirmation(null)}>取消</Button><Button variant={systemStorageConfirmation?.kind === 'save' ? 'primary' : 'danger'} loading={systemStorageSubmitting} onClick={() => void confirmSystemStorageAction()}>确认</Button></>}>
                <p>{systemStorageConfirmation?.kind === 'save' ? 'Endpoint 或 Bucket 已变化。现有对象不会自动迁移，确认保存这个新目标？' : systemStorageConfirmation?.kind === 'initialize' ? '初始化会按需创建 Bucket、配置浏览器直传 CORS 并写入元策初始化标记。' : `确认回滚到 v${systemStorageConfirmation?.kind === 'rollback' ? systemStorageConfirmation.version : ''}（${systemStorageConfirmation?.kind === 'rollback' ? systemStorageConfirmation.bucket : ''}）？系统会生成新的激活版本。`}</p>
                {systemStorageError ? <Feedback tone="danger" title="操作失败">{systemStorageError}</Feedback> : null}
              </Modal>
            </section>
          ) : route.id === 'system-roles' ? (
            <section className="page-stack system-roles-page" aria-labelledby="system-roles-title">
              <header className="page-hero"><div><p className="eyebrow">系统管理</p><h1 id="system-roles-title" ref={headingRef} tabIndex={-1}>角色权限</h1><p>按 RBAC 模型维护角色、状态、数据范围与功能权限树；项目内数据范围仍由项目成员关系控制。</p></div><a className="yc-button yc-button-secondary" href={buildSystemPermissionsPath({ owner: route.owner })} onClick={(event) => handleNavigate(event, buildSystemPermissionsPath({ owner: route.owner }), '正在打开权限目录。')}>全部权限点</a></header>
              <section className="role-workbench">
              <aside className="shell-card role-workbench-sidebar" aria-label="角色列表">
              <div className="shell-panel-header"><div><h2>角色列表</h2><p className="shell-muted">选择左侧角色后，在右侧直接维护权限树。</p></div>{systemRolesView?.can_manage_roles ? <Button onClick={() => { setSystemRoleError(''); setSystemRoleCreateOpen(true); }}>新建角色</Button> : null}</div>
              {systemRoleError && !systemRoleCreateOpen && !systemRoleStatusTarget ? <Feedback tone="danger" title="角色操作失败">{systemRoleError}</Feedback> : null}
              {(systemRolesView?.items || []).length ? <div className="role-list">{systemRolesView.items.map((item) => <div className={`role-list-row ${item.role_code === systemRolesView.selected_role?.role_code ? 'active' : ''}`} key={item.role_code}><a className="role-list-item" href={buildSystemRolesPath({ owner: route.owner, role: item.role_code, page: systemRolesView.pagination.page, perPage: systemRolesView.pagination.per_page })} onClick={(event) => handleNavigate(event, buildSystemRolesPath({ owner: route.owner, role: item.role_code, page: systemRolesView.pagination.page, perPage: systemRolesView.pagination.per_page }), `正在打开${item.role_name}。`)}><span><strong>{item.role_name}</strong><em>{item.role_code}{item.is_system ? ' · 系统内置' : ''}</em></span><span className="role-list-meta"><span className={`status status-${item.status === 'active' ? 'success' : 'muted'}`}>{item.status}</span><span>{item.permission_count} 项</span></span></a>{systemRolesView.can_manage_roles && !item.is_system ? <div className="role-status-action"><Button variant="secondary" disabled={systemRoleSubmitting} onClick={() => { setSystemRoleError(''); setSystemRoleStatusTarget(item); }}>{item.status === 'active' ? '禁用' : '启用'}</Button></div> : null}</div>)}</div> : <Feedback tone="info" title="暂无角色">运行 core seed 后会生成系统角色。</Feedback>}
              {systemRolesView ? <div className="shell-panel-header">
                <Pagination page={systemRolesView.pagination.page} totalPages={systemRolesView.pagination.total_pages} totalItems={systemRolesView.pagination.total_items} onPageChange={(page) => navigate(buildSystemRolesPath({ owner: route.owner, role: systemRolesView.selected_role?.role_code || '', page, perPage: systemRolesView.pagination.per_page }), `正在加载第 ${page} 页角色。`)} />
                <label className="shell-page-size">每页<select value={systemRolesView.pagination.per_page} onChange={(event) => navigate(buildSystemRolesPath({ owner: route.owner, role: systemRolesView.selected_role?.role_code || '', perPage: Number(event.target.value) }), '正在更新每页数量。')}><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option></select></label>
              </div> : null}
              </aside>
              <section className="shell-card role-permission-panel" aria-label="权限树">
              {systemRolesView?.selected_role ? <form onSubmit={submitSystemRolePermissions} aria-labelledby="system-role-permissions-title"><div className="shell-panel-header role-permission-head"><div><h2 id="system-role-permissions-title">权限树</h2><p className="shell-muted">当前角色：{systemRolesView.selected_role.role_name} · 已授权 {systemRolePermissionKeys.length}/{systemRolesView.permissions.length} 项</p></div><div className="shell-actions-inline"><span className={`status status-${systemRolesView.selected_role.status === 'active' ? 'success' : 'muted'}`}>{systemRolesView.selected_role.status}</span>{systemRolesView.can_edit_permissions ? <Button type="submit" loading={systemRoleSubmitting}>保存权限</Button> : null}</div></div><div className="role-summary-strip"><span>编码 <strong>{systemRolesView.selected_role.role_code}</strong></span><span>数据范围 <strong>{systemRolesView.selected_role.data_scope_type === 'all' ? '全部数据' : '本人数据'}</strong></span><span>已绑定 <strong>{systemRolesView.selected_role.permission_count}</strong> 项权限</span>{systemRolesView.selected_role.is_system ? <span>系统内置角色只读</span> : null}</div>{systemRolePermissionGroups.length ? <div className="permission-tree">{systemRolePermissionGroups.map((group) => { const permissions = [...group.pages, ...group.actions]; const granted = permissions.filter((permission) => systemRolePermissionKeys.includes(permission.permission_key)).length; return <section className="permission-group" key={group.key}><header className="permission-group-head"><label className="permission-check permission-check-group"><input type="checkbox" checked={granted === permissions.length && permissions.length > 0} disabled={!systemRolesView.can_edit_permissions || systemRoleSubmitting} onChange={(event) => toggleSystemRolePermissionGroup(group, event.target.checked)} /><span><strong>{group.key}</strong><em>{granted}/{permissions.length} 项已授权</em></span></label></header><div className="permission-pages">{group.pages.map((permission) => <article className="permission-page" key={permission.permission_key}><label className="permission-check permission-check-page"><input type="checkbox" checked={systemRolePermissionKeys.includes(permission.permission_key)} disabled={!systemRolesView.can_edit_permissions || systemRoleSubmitting} aria-label={`${permission.permission_name} ${systemRolePermissionKeys.includes(permission.permission_key) ? '已授权' : '未授权'}`} onChange={(event) => toggleSystemRolePermission(permission, event.target.checked)} /><span><strong>{permission.permission_name}</strong><em>{permission.permission_key} · {permission.resource_key}</em></span></label></article>)}{group.actions.length ? <article className="permission-page"><div className="permission-actions">{group.actions.map((permission) => <label className="permission-check permission-check-action" key={permission.permission_key}><input type="checkbox" checked={systemRolePermissionKeys.includes(permission.permission_key)} disabled={!systemRolesView.can_edit_permissions || systemRoleSubmitting} aria-label={`${permission.permission_name} ${systemRolePermissionKeys.includes(permission.permission_key) ? '已授权' : '未授权'}`} onChange={(event) => toggleSystemRolePermission(permission, event.target.checked)} /><span><strong>{permission.permission_name}</strong><em>{permission.permission_key}</em></span></label>)}</div></article> : null}</div></section>; })}</div> : <Feedback tone="info" title="暂无权限点">权限点由 core seed 维护。</Feedback>}</form> : <Feedback tone="info" title="请选择角色">当前分页没有可查看的角色。</Feedback>}
              </section>
              </section>
              <Modal open={systemRoleCreateOpen} title="创建角色" onClose={() => { if (!systemRoleSubmitting) { setSystemRoleCreateOpen(false); setSystemRoleError(''); } }} footer={<><Button variant="secondary" disabled={systemRoleSubmitting} onClick={() => setSystemRoleCreateOpen(false)}>取消</Button><Button loading={systemRoleSubmitting} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('system-role-create-form'))?.requestSubmit()}>创建</Button></>}>
                <form id="system-role-create-form" onSubmit={submitSystemRoleCreate}>{systemRoleError ? <Feedback tone="danger" title="创建失败">{systemRoleError}</Feedback> : null}<Field id="system-role-code" label="角色编码" required><TextInput value={systemRoleCreateForm.roleCode} maxLength={64} placeholder="project_manager" onChange={(event) => setSystemRoleCreateForm((current) => ({ ...current, roleCode: event.target.value }))} /></Field><Field id="system-role-name" label="角色名称" required><TextInput value={systemRoleCreateForm.roleName} maxLength={64} placeholder="项目经理" onChange={(event) => setSystemRoleCreateForm((current) => ({ ...current, roleName: event.target.value }))} /></Field><Field id="system-role-scope" label="数据范围"><select value={systemRoleCreateForm.dataScopeType} onChange={(event) => setSystemRoleCreateForm((current) => ({ ...current, dataScopeType: event.target.value }))}><option value="self">本人数据</option><option value="all">全部数据</option></select></Field></form>
              </Modal>
              <Modal open={Boolean(systemRoleStatusTarget)} title={systemRoleStatusTarget?.status === 'active' ? '确认禁用角色' : '确认启用角色'} onClose={() => { if (!systemRoleSubmitting) { setSystemRoleStatusTarget(null); setSystemRoleError(''); } }} footer={<><Button variant="secondary" disabled={systemRoleSubmitting} onClick={() => setSystemRoleStatusTarget(null)}>取消</Button><Button variant={systemRoleStatusTarget?.status === 'active' ? 'danger' : 'primary'} loading={systemRoleSubmitting} onClick={() => void confirmSystemRoleStatus()}>确认{systemRoleStatusTarget?.status === 'active' ? '禁用' : '启用'}</Button></>}><p>{systemRoleStatusTarget?.status === 'active' ? `确认禁用角色“${systemRoleStatusTarget?.role_name}”？禁用后该角色授权不会再生效。` : `确认启用角色“${systemRoleStatusTarget?.role_name}”？启用后该角色授权会重新生效。`}</p>{systemRoleError ? <Feedback tone="danger" title="状态更新失败">{systemRoleError}</Feedback> : null}</Modal>
            </section>
          ) : route.id === 'system-users' ? (
            <section className="page-stack system-users-page" aria-labelledby="system-users-title">
              <header className="page-hero">
                <div><p className="eyebrow">系统管理</p><h1 id="system-users-title" ref={headingRef} tabIndex={-1}>用户管理</h1><p>维护登录账号、基础资料和系统角色绑定。</p></div>
                {systemUsersView?.can_manage_users ? <Button onClick={() => { setSystemUserError(''); setSystemUserCreateForm((current) => ({ ...current, roleCode: current.roleCode || systemUsersView.roles.find((role) => role.status === 'active')?.role_code || '' })); setSystemUserCreateOpen(true); }}>新建用户</Button> : null}
              </header>
              <section className="shell-card system-users-panel" aria-labelledby="system-users-list-title">
              <div className="shell-panel-header"><div><h2 id="system-users-list-title">用户列表</h2><p className="shell-muted">按创建时间倒序排列。</p></div></div>
              {systemUserError && !systemUserCreateOpen && !systemUserAction ? <Feedback tone="danger" title="用户操作失败">{systemUserError}</Feedback> : null}
              <DataTable
                caption="系统用户列表"
                rows={systemUsersView?.items || []}
                rowKey={(item) => item.username}
                emptyText="暂无用户。"
                columns={[
                  { key: 'user', label: '用户', render: (item) => <><strong>{item.display_name}</strong><br /><span className="shell-muted">@{item.username}{item.is_super_admin ? ' · 超级管理员' : ''}</span></> },
                  { key: 'contact', label: '联系方式', render: (item) => item.email || item.mobile || '未填写' },
                  { key: 'projects', label: '项目', render: (item) => item.is_super_admin ? <div className="user-project-stack"><span className="status status-info">全项目访问</span><span className="shell-muted">无需单独加入项目</span></div> : <div className="user-project-stack"><strong>{item.assigned_projects.length} 个项目</strong>{item.assigned_projects.length ? <div className="user-project-chip-list">{item.assigned_projects.slice(0, 2).map((project) => <span className="user-project-chip" title={`${project.key} · ${project.name}`} key={project.key}>{project.key}</span>)}{item.assigned_projects.length > 2 ? <span className="user-project-chip user-project-chip-muted">+{item.assigned_projects.length - 2}</span> : null}</div> : <span className="shell-muted">暂未加入任何项目</span>}</div> },
                  { key: 'roles', label: '角色', render: (item) => item.role_names || '未分配' },
                  { key: 'status', label: '状态', render: (item) => <span className={`status status-${item.status === 'active' ? 'success' : item.status === 'locked' ? 'warning' : 'muted'}`}>{item.status}</span> },
                  { key: 'updated', label: '更新', render: (item) => formatTimestamp(item.updated_at) },
                  { key: 'actions', label: '操作', render: (item) => systemUsersView?.can_manage_users ? <div className="shell-actions-inline">
                    {systemUsersView.can_manage_user_projects && !item.is_super_admin ? <Button variant="secondary" disabled={systemUserSubmitting} onClick={() => openSystemUserProjects(item)}>项目</Button> : null}
                    {!item.is_super_admin ? <><Button variant="secondary" disabled={systemUserSubmitting} onClick={() => { setSystemUserError(''); setSystemUserRoleCode(item.role_code); setSystemUserAction({ kind: 'role', user: item }); }}>角色</Button><Button variant={item.status === 'active' ? 'danger' : 'secondary'} disabled={systemUserSubmitting} onClick={() => { setSystemUserError(''); setSystemUserAction({ kind: 'status', user: item }); }}>{item.status === 'active' ? '停用' : '启用'}</Button></> : null}
                    <Button variant="secondary" disabled={systemUserSubmitting} onClick={() => { setSystemUserError(''); setSystemUserPasswordForm({ password: '', passwordConfirm: '' }); setSystemUserAction({ kind: 'password', user: item }); }}>重置密码</Button>
                  </div> : '无权限' },
                ]}
              />
              {systemUsersView ? <Pagination
                ariaLabel="用户列表分页"
                page={systemUsersView.pagination.page}
                totalPages={systemUsersView.pagination.total_pages}
                totalItems={systemUsersView.pagination.total_items}
                itemLabel="个用户"
                rangeLabel={systemUsersView.pagination.total_items ? `当前显示 ${(systemUsersView.pagination.page - 1) * systemUsersView.pagination.per_page + 1}-${Math.min(systemUsersView.pagination.page * systemUsersView.pagination.per_page, systemUsersView.pagination.total_items)}` : '当前没有用户'}
                pageSize={systemUsersView.pagination.per_page}
                pageSizes={[10, 20, 50, 100]}
                onPageSizeChange={(event) => navigate(buildSystemUsersPath({ owner: route.owner, perPage: Number(event.target.value) }), '正在更新每页数量。')}
                onPageChange={(page) => navigate(buildSystemUsersPath({ owner: route.owner, page, perPage: systemUsersView.pagination.per_page }), `正在加载第 ${page} 页用户。`)}
              /> : null}
              </section>
              <Modal open={systemUserCreateOpen} title="新建用户" onClose={closeSystemUserCreate} footer={<><Button variant="secondary" disabled={systemUserSubmitting} onClick={closeSystemUserCreate}>取消</Button><Button loading={systemUserSubmitting} onClick={() => { const form = /** @type {HTMLFormElement | null} */ (runtime.getElementById('system-user-create-form')); form?.requestSubmit(); }}>创建</Button></>}>
                <form id="system-user-create-form" onSubmit={submitSystemUserCreate}>
                  {systemUserError ? <Feedback tone="danger" title="创建失败">{systemUserError}</Feedback> : null}
                  <Field id="system-user-username" label="用户名" required><TextInput value={systemUserCreateForm.username} maxLength={64} autoComplete="off" onChange={(event) => setSystemUserCreateForm((current) => ({ ...current, username: event.target.value }))} /></Field>
                  <Field id="system-user-display-name" label="显示名称" required><TextInput value={systemUserCreateForm.displayName} maxLength={64} onChange={(event) => setSystemUserCreateForm((current) => ({ ...current, displayName: event.target.value }))} /></Field>
                  <Field id="system-user-email" label="邮箱"><TextInput type="email" value={systemUserCreateForm.email} maxLength={254} onChange={(event) => setSystemUserCreateForm((current) => ({ ...current, email: event.target.value }))} /></Field>
                  <Field id="system-user-mobile" label="手机号"><TextInput value={systemUserCreateForm.mobile} maxLength={32} onChange={(event) => setSystemUserCreateForm((current) => ({ ...current, mobile: event.target.value }))} /></Field>
                  <Field id="system-user-role" label="全局角色" required><select value={systemUserCreateForm.roleCode} onChange={(event) => setSystemUserCreateForm((current) => ({ ...current, roleCode: event.target.value }))}>{(systemUsersView?.roles || []).filter((role) => role.status === 'active').map((role) => <option key={role.role_code} value={role.role_code}>{role.role_name}</option>)}</select></Field>
                  <Field id="system-user-password" label="初始密码" required><TextInput type="password" autoComplete="new-password" value={systemUserCreateForm.password} maxLength={256} onChange={(event) => setSystemUserCreateForm((current) => ({ ...current, password: event.target.value }))} /></Field>
                  <Field id="system-user-password-confirm" label="确认初始密码" required><TextInput type="password" autoComplete="new-password" value={systemUserCreateForm.passwordConfirm} maxLength={256} onChange={(event) => setSystemUserCreateForm((current) => ({ ...current, passwordConfirm: event.target.value }))} /></Field>
                </form>
              </Modal>
              <Modal open={systemUserAction?.kind === 'role'} title="调整全局角色" onClose={closeSystemUserAction} footer={<><Button variant="secondary" disabled={systemUserSubmitting} onClick={closeSystemUserAction}>取消</Button><Button loading={systemUserSubmitting} onClick={() => { const form = /** @type {HTMLFormElement | null} */ (runtime.getElementById('system-user-role-form')); form?.requestSubmit(); }}>保存</Button></>}>
                <form id="system-user-role-form" onSubmit={submitSystemUserRole}>{systemUserError ? <Feedback tone="danger" title="更新失败">{systemUserError}</Feedback> : null}<p>{systemUserAction?.user.display_name} @{systemUserAction?.user.username}</p><Field id="system-user-role-value" label="全局角色" required><select value={systemUserRoleCode} onChange={(event) => setSystemUserRoleCode(event.target.value)}>{(systemUsersView?.roles || []).filter((role) => role.status === 'active').map((role) => <option key={role.role_code} value={role.role_code}>{role.role_name}</option>)}</select></Field></form>
              </Modal>
              <Modal open={systemUserAction?.kind === 'password'} title="重置用户密码" onClose={closeSystemUserAction} footer={<><Button variant="secondary" disabled={systemUserSubmitting} onClick={closeSystemUserAction}>取消</Button><Button variant="danger" loading={systemUserSubmitting} onClick={() => { const form = /** @type {HTMLFormElement | null} */ (runtime.getElementById('system-user-password-form')); form?.requestSubmit(); }}>确认重置</Button></>}>
                <form id="system-user-password-form" onSubmit={submitSystemUserPassword}>{systemUserError ? <Feedback tone="danger" title="重置失败">{systemUserError}</Feedback> : null}<p>重置“{systemUserAction?.user.display_name}”的密码后，该用户现有会话将立即撤销，新密码不会再次显示。</p><Field id="system-user-new-password" label="新密码" required><TextInput type="password" autoComplete="new-password" maxLength={256} value={systemUserPasswordForm.password} onChange={(event) => setSystemUserPasswordForm((current) => ({ ...current, password: event.target.value }))} /></Field><Field id="system-user-new-password-confirm" label="确认新密码" required><TextInput type="password" autoComplete="new-password" maxLength={256} value={systemUserPasswordForm.passwordConfirm} onChange={(event) => setSystemUserPasswordForm((current) => ({ ...current, passwordConfirm: event.target.value }))} /></Field></form>
              </Modal>
              <Modal open={systemUserAction?.kind === 'status'} title={systemUserAction?.user.status === 'active' ? '停用用户' : '启用用户'} onClose={closeSystemUserAction} footer={<><Button variant="secondary" disabled={systemUserSubmitting} onClick={closeSystemUserAction}>取消</Button><Button variant={systemUserAction?.user.status === 'active' ? 'danger' : 'primary'} loading={systemUserSubmitting} onClick={() => void confirmSystemUserStatus()}>确认{systemUserAction?.user.status === 'active' ? '停用' : '启用'}</Button></>}><p>{systemUserAction?.user.status === 'active' ? `停用“${systemUserAction?.user.display_name}”将立即撤销其 Browser/Desktop 会话、Token 和设备访问。` : `确认重新启用“${systemUserAction?.user.display_name}”？`}</p>{systemUserError ? <Feedback tone="danger" title="状态更新失败">{systemUserError}</Feedback> : null}</Modal>
              <Modal open={systemUserProjectDialog?.kind === 'manage'} title="管理用户项目" onClose={() => { if (systemUserProjectDialog?.kind === 'manage') closeSystemUserProjects(); }} footer={<Button variant="secondary" disabled={systemUserSubmitting} onClick={closeSystemUserProjects}>关闭</Button>}>
                {systemUserError ? <Feedback tone="danger" title="项目关系操作失败">{systemUserError}</Feedback> : null}
                <p><strong>{systemUserProjectTarget?.display_name}</strong> @{systemUserProjectTarget?.username}</p>
                <form id="system-user-project-assign-form" onSubmit={submitSystemUserProjectAssign}>
                  <fieldset disabled={systemUserSubmitting || systemUserAssignableProjects.length === 0}><legend>分配项目</legend>{systemUserAssignableProjects.length ? systemUserAssignableProjects.map((project) => <label key={project.key}><input type="checkbox" checked={systemUserProjectAssignKeys.includes(project.key)} onChange={(event) => setSystemUserProjectAssignKeys((current) => event.target.checked ? [...current, project.key] : current.filter((key) => key !== project.key))} /> {project.key} · {project.name}</label>) : <p className="shell-muted">没有可分配项目。</p>}<Field id="system-user-project-assign-role" label="项目角色"><select value={systemUserProjectAssignRole} onChange={(event) => setSystemUserProjectAssignRole(event.target.value)}><option value="viewer">只读成员</option><option value="member">项目成员</option><option value="maintainer">项目管理员</option></select></Field><Button loading={systemUserSubmitting} disabled={systemUserProjectAssignKeys.length === 0} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('system-user-project-assign-form'))?.requestSubmit()}>分配所选项目</Button></fieldset>
                </form>
                <DataTable caption="已分配项目" rows={systemUserProjectTarget?.assigned_projects || []} rowKey={(project) => project.key} emptyText="尚未分配项目。" columns={[
                  { key: 'select', label: '选择', render: (project) => <input type="checkbox" aria-label={`选择移除 ${project.name}`} disabled={!project.can_remove || systemUserSubmitting} checked={systemUserProjectRemoveKeys.includes(project.key)} title={project.remove_block_reason || ''} onChange={(event) => setSystemUserProjectRemoveKeys((current) => event.target.checked ? [...current, project.key] : current.filter((key) => key !== project.key))} /> },
                  { key: 'project', label: '项目', render: (project) => <><strong>{project.name}</strong><br /><span className="shell-muted">{project.key} · {project.status}</span></> },
                  { key: 'role', label: '角色', render: (project) => projectMemberRoleLabel(project.role_code) },
                  { key: 'constraint', label: '约束', render: (project) => project.remove_block_reason || (project.active_assigned_count ? `${project.active_assigned_count} 个活跃工作项` : '可调整') },
                  { key: 'actions', label: '操作', render: (project) => <div className="shell-actions-inline"><Button variant="secondary" disabled={!project.can_update_role || systemUserSubmitting} onClick={() => { setSystemUserError(''); setSystemUserProjectRole(project.role_code); setSystemUserProjectDialog({ kind: 'role', username: systemUserProjectTarget?.username || '', projectKey: project.key }); }}>角色</Button><Button variant="danger" disabled={!project.can_remove || systemUserSubmitting} onClick={() => { setSystemUserError(''); setSystemUserProjectDialog({ kind: 'remove-one', username: systemUserProjectTarget?.username || '', projectKey: project.key }); }}>移除</Button></div> },
                ]} />
                <Button variant="danger" disabled={systemUserProjectRemoveKeys.length === 0 || systemUserSubmitting} onClick={() => setSystemUserProjectDialog({ kind: 'remove-batch', username: systemUserProjectTarget?.username || '' })}>移除所选项目</Button>
              </Modal>
              <Modal open={systemUserProjectDialog?.kind === 'role'} title="调整项目角色" onClose={() => { if (!systemUserSubmitting && systemUserProjectTarget) setSystemUserProjectDialog({ kind: 'manage', username: systemUserProjectTarget.username }); }} footer={<><Button variant="secondary" disabled={systemUserSubmitting} onClick={() => { if (systemUserProjectTarget) setSystemUserProjectDialog({ kind: 'manage', username: systemUserProjectTarget.username }); }}>取消</Button><Button loading={systemUserSubmitting} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('system-user-project-role-form'))?.requestSubmit()}>保存</Button></>}><form id="system-user-project-role-form" onSubmit={submitSystemUserProjectRole}><p>{systemUserProjectTarget?.display_name} · {systemUserProjectDialog?.projectKey}</p><Field id="system-user-project-role" label="项目角色"><select value={systemUserProjectRole} onChange={(event) => setSystemUserProjectRole(event.target.value)}><option value="viewer">只读成员</option><option value="member">项目成员</option><option value="maintainer">项目管理员</option></select></Field>{systemUserError ? <Feedback tone="danger" title="角色更新失败">{systemUserError}</Feedback> : null}</form></Modal>
              <Modal open={systemUserProjectDialog?.kind === 'remove-one' || systemUserProjectDialog?.kind === 'remove-batch'} title="移除项目关系" onClose={() => { if (!systemUserSubmitting && systemUserProjectTarget) setSystemUserProjectDialog({ kind: 'manage', username: systemUserProjectTarget.username }); }} footer={<><Button variant="secondary" disabled={systemUserSubmitting} onClick={() => { if (systemUserProjectTarget) setSystemUserProjectDialog({ kind: 'manage', username: systemUserProjectTarget.username }); }}>取消</Button><Button variant="danger" loading={systemUserSubmitting} onClick={() => void confirmSystemUserProjectRemove()}>确认移除</Button></>}><p>确认移除 {systemUserProjectTarget?.display_name} 的 {systemUserProjectDialog?.kind === 'remove-one' ? '1' : systemUserProjectRemoveKeys.length} 个项目关系？目标用户将立即失去对应项目访问和实时订阅。</p>{systemUserError ? <Feedback tone="danger" title="移除失败">{systemUserError}</Feedback> : null}</Modal>
            </section>
          ) : route.id === 'system-dashboard' ? (
            <section className="system-dashboard-page" aria-label="管理入口">
              {systemDashboard?.links.length ? (
                <div className="system-grid">
                  {systemDashboard.links.map((link) => {
                    const path = routePathForOwner(link.path, route.owner);
                    return (
                      <a key={link.id} className="system-card" href={path} onClick={(event) => handleNavigate(event, path, `正在打开${link.title}。`)}>
                        <strong>{link.title}</strong>
                        <span>{link.description}</span>
                      </a>
                    );
                  })}
                </div>
              ) : (
                <Feedback tone="info" title="暂无可用管理入口">当前角色没有其他系统管理权限。</Feedback>
              )}
            </section>
          ) : route.id === 'messages' ? (
            <section className="page-stack messages-page" aria-labelledby="message-center-title" aria-busy={refreshing || messageOpeningId !== null}>
              <header className="page-heading messages-heading">
                <div>
                  <span className="section-kicker">协作通知</span>
                  <h1 id="message-center-title" ref={headingRef} tabIndex={-1}>消息中心</h1>
                  <p>查看工作项指派、提及和讨论回复，未读消息 {messageFeed?.unread_count || 0} 条，待处理讨论 {pendingCount} 条。</p>
                </div>
                {(messageFeed?.unread_count || 0) > 0 ? <Button variant="secondary" disabled={messageReadAllSubmitting} onClick={handleMarkAllRead}>{messageReadAllSubmitting ? '处理中…' : '全部标为已读'}</Button> : null}
              </header>

              {messageActionError ? <Feedback tone="danger" title="消息操作失败">{messageActionError}</Feedback> : null}

              <ContentTabs ariaLabel="消息筛选">
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
                  <ContentTab
                    key={tab.value}
                    active={messageFilter === tab.value}
                    badge={tab.count}
                    onClick={() => changeMessageFilter(/** @type {'all' | 'unread' | 'pending' | 'read'} */ (tab.value))}
                  >
                    <span>{tab.label}</span>
                  </ContentTab>
                ))}
              </ContentTabs>

              {messageFeed?.items?.length ? (
                <>
                  <ul className="message-list" aria-label={`${filterLabel(messageFilter)}列表`}>
                    {messageFeed.items.map((item) => (
                      <li key={item.id} className={`message-row ${item.read ? '' : 'unread'}`}>
                        <span className="message-unread-dot" aria-hidden="true" />
                        <span className="message-kind">{notificationKindLabel(item.kind)}</span>
                        <span className="message-content">
                          <strong>{item.title}</strong>
                          <span>{item.body}</span>
                          <small>{item.actor} · {dashboardTimestamp(item.created_at)}</small>
                        </span>
                        <button className="message-open" type="button" aria-label="打开" disabled={messageOpeningId !== null || messageReadAllSubmitting} onClick={() => void handleOpenNotification(item)}>{messageOpeningId === item.id ? '打开中…' : '查看'}</button>
                      </li>
                    ))}
                  </ul>

                  <Pagination ariaLabel="消息分页" page={messageFeed.page} totalPages={messageFeed.total_pages} totalItems={messageFeed.total_items} rangeLabel={`当前显示 ${pageRangeStart}-${pageRangeEnd}`} pageSize={messageFeed.per_page} onPageSizeChange={changeMessagePageSize} onPageChange={changeMessagePage} />
                </>
              ) : (
                <div className="empty-state message-empty"><strong>{emptyMessageTitle(route)}</strong><span>新的指派、提及和回复会显示在这里。</span></div>
              )}
            </section>
          ) : route.id === 'search' ? (
            <section className="page-stack search-page">
              <section className="page-hero"><div><p className="shell-eyebrow">全局搜索</p><h1 ref={headingRef} tabIndex={-1}>搜索项目、需求、任务、Bug 和资料库</h1><p>搜索结果遵循项目成员数据范围；系统管理员可查看全部项目协作数据。</p></div><div className="toolbar-actions"><a className="yc-button yc-button-secondary" href={homePath} onClick={(event) => handleNavigate(event, homePath, '已返回工作台。')}>返回工作台</a></div></section>
              <section className="panel search-panel"><FilterBar className="search-form" role="search" ariaLabel="全局搜索" onSubmit={(event) => { event.preventDefault(); const input = /** @type {HTMLInputElement | null} */ (event.currentTarget.elements.namedItem('q')); navigate(buildSearchPath({ owner: route.owner, q: input?.value || '', perPage: searchPage?.pagination.per_page })); }} actions={<Button type="submit">搜索</Button>}><FilterField id="search-page-input" label="关键词"><TextInput name="q" type="search" defaultValue={searchRoute?.q || ''} placeholder="输入项目编号、工作项编号、资料标题或描述" /></FilterField></FilterBar></section>
              <section className="panel" aria-labelledby="search-results-title">
                <div className="panel-head"><div><h2 id="search-results-title">搜索结果</h2><p>{searchRoute?.q ? `关键词：${searchRoute.q}` : '输入关键词后开始检索。'}</p></div></div>
                {searchPage?.items.length ? <>
                  <div className="search-result-list" role="list" aria-label="搜索结果列表">
                    {searchPage.items.map((item) => {
                      const target = routePathForOwner(item.target, route.owner);
                      return (
                        <article key={`${item.kind}:${item.key}`} className="search-result" role="listitem"><div><Badge>{item.kind}</Badge> <code>{item.key}</code><h3><a href={target} onClick={(event) => handleNavigate(event, target, `已打开 ${item.key}。`)}>{item.title}</a></h3><p>{item.context}</p></div><span className="search-result-time">{dashboardTimestamp(item.updated_at)}</span></article>
                      );
                    })}
                  </div>
                  <Pagination ariaLabel="搜索结果分页" page={searchPage.pagination.page} totalPages={searchPage.pagination.total_pages} totalItems={searchPage.pagination.total_items} onPageChange={(page) => navigate(buildSearchPath({ owner: route.owner, q: searchRoute?.q, page, perPage: searchPage.pagination.per_page }))} />
                </> : <div className="empty-state"><strong>{searchRoute?.q ? '没有找到结果' : '等待搜索'}</strong><span>{searchRoute?.q ? '可以换一个项目编号、工作项编号、资料标题或正文关键词。' : '例如搜索 YCE、对象存储、资料库、Bug 或工作项编号。'}</span></div>}
              </section>
            </section>
          ) : route.id === 'profile' ? (
            <section className="page-stack profile-page" aria-labelledby="profile-title">
              <section className="page-hero profile-hero">
                <div className="profile-hero-main"><div className="profile-hero-overview"><div className="profile-hero-avatar" aria-hidden="true">{(profile?.display_name || profile?.username || '我').slice(0, 1)}</div><div className="profile-hero-copy"><p className="shell-eyebrow">个人工作区</p><div className="profile-hero-identity"><h1 id="profile-title" ref={headingRef} tabIndex={-1}>{profile?.display_name || user?.display_name || user?.username}</h1><span>@{profile?.username || user?.username}</span></div><div className="profile-hero-meta"><Badge>{profile?.roles || '普通成员'}</Badge><Badge tone="success">{profile?.status === 'active' ? '正常' : profile?.status}</Badge>{profile?.is_super_admin ? <Badge tone="danger">超级管理员</Badge> : null}<span>加入 {profile?.created_at ? dashboardTimestamp(profile.created_at) : '-'}</span></div></div></div><dl className="profile-hero-details" aria-label="账号资料"><div><dt>邮箱</dt><dd>{profile?.email || '未填写'}</dd></div><div><dt>手机号</dt><dd>{profile?.mobile || '未填写'}</dd></div><div><dt>最近更新</dt><dd>{profile?.updated_at ? dashboardTimestamp(profile.updated_at) : '-'}</dd></div></dl></div>
                <div className="toolbar-actions profile-hero-actions"><Button variant="secondary" onClick={() => { setProfileError(''); setProfileModalOpen(true); }}>编辑资料</Button><Button variant="secondary" onClick={() => { setAccountSecurityError(''); setPasswordModalOpen(true); }}>修改密码</Button><Button variant="secondary" disabled={apiTokens.filter((token) => !token.revoked_at).length >= 100} onClick={() => { setAccountSecurityError(''); setTokenForm({ id: 0, name: '', scopes: ['project:read'], projectScope: 'all', expiresAt: '' }); setTokenModalOpen(true); }}>创建访问 Token</Button></div>
              </section>
              <section className="metric-grid profile-metrics" aria-label="我的概览"><article className="metric metric-info"><span>参与项目</span><strong>{dashboard?.projects?.length || 0}</strong></article><article className="metric metric-warning"><span>指派给我</span><strong>{dashboard?.metrics?.assigned_total || 0}</strong></article><article className="metric metric-danger"><span>高优先级</span><strong>{dashboard?.metrics?.high_priority || 0}</strong></article></section>
              {accountSecurityError ? <Feedback tone="danger" title="账户安全操作失败">{accountSecurityError}</Feedback> : null}
              {createdRawToken ? <Feedback tone="success" title="访问 Token 仅显示一次"><code>{createdRawToken}</code><Button variant="secondary" onClick={() => setCreatedRawToken('')}>我已保存</Button></Feedback> : null}
              <section className="profile-detail-grid"><div className="profile-detail-main"><section className="panel api-token-panel">
                <div className="panel-head"><div><h2>Personal Access Token</h2><p>用于 OpenAPI、Codex Skill 或外部脚本调用。</p></div><div className="token-panel-actions"><span>可用 Token {apiTokens.filter((token) => !token.revoked_at).length}/100</span><Button disabled={apiTokens.filter((token) => !token.revoked_at).length >= 100} onClick={() => { setAccountSecurityError(''); setTokenForm({ id: 0, name: '', scopes: ['project:read'], projectScope: 'all', expiresAt: '' }); setTokenModalOpen(true); }}>创建 Token</Button></div></div>
                {apiTokens.length ? <div className="account-security-list">{apiTokens.map((token) => <div className="account-security-row" key={token.id}><div><strong>{token.name}</strong><p className="shell-muted">尾号 {token.token_suffix} · {token.scopes.join('、')}</p></div><div className="shell-actions-inline"><Button variant="secondary" disabled={accountSecuritySubmitting} onClick={() => { setTokenForm({ id: token.id, name: token.name, scopes: token.scopes, projectScope: token.project_scope, expiresAt: '' }); setTokenModalOpen(true); }}>编辑</Button><Button variant="danger" disabled={accountSecuritySubmitting} onClick={() => setAccountConfirmation({ kind: 'token', id: token.id, label: token.name })}>删除</Button></div></div>)}</div> : <div className="empty-state"><strong>暂无访问 Token</strong><span>如需让 AI Agent 或脚本访问元策 API，可以创建最小权限 Token。</span></div>}
              </section></div><aside className="profile-detail-side"><section className="panel"><div className="panel-head compact"><h2>我的项目</h2></div>{dashboard?.projects?.length ? <ol className="activity-list">{dashboard.projects.map((project) => { const path = buildProjectDetailPath({ owner: route.owner, projectKey: project.key }); return <li key={project.key}><span className="activity-dot" aria-hidden="true" /><strong><a href={path} onClick={(event) => handleNavigate(event, path, `已打开 ${project.key}。`)}>{project.name}</a></strong><span>{project.key} · {project.status} · {project.active_work_item_count} 个活跃工作项</span></li>; })}</ol> : <div className="empty-state"><strong>暂无项目</strong><span>加入项目后会出现在这里。</span></div>}</section></aside></section>
              <section className="panel profile-security-panel"><div className="panel-head"><div><h2>账户安全</h2><p>修改登录密码并管理 Desktop 授权设备。</p></div></div>
                {deviceSessions.length ? <div className="account-security-list">{deviceSessions.map((session) => <div className="account-security-row" key={session.family_id}><div><strong>{session.device_name}{session.is_current ? '（当前设备）' : ''}</strong><p className="shell-muted">{session.platform} · {session.client_version} · {session.status}</p></div><Button variant="danger" disabled={accountSecuritySubmitting || session.status !== 'active'} onClick={() => setAccountConfirmation({ kind: 'device', id: session.family_id, label: session.device_name })}>撤销</Button></div>)}</div> : <div className="empty-state"><strong>暂无已授权设备</strong><span>通过 Desktop 登录后，设备会显示在这里。</span></div>}
              </section>
              <Modal open={Boolean(accountConfirmation)} title={accountConfirmation?.kind === 'token' ? '删除访问 Token' : '撤销设备会话'} onClose={() => { if (!accountSecuritySubmitting) setAccountConfirmation(null); }} footer={<><Button variant="secondary" disabled={accountSecuritySubmitting} onClick={() => setAccountConfirmation(null)}>取消</Button><Button variant="danger" loading={accountSecuritySubmitting} onClick={() => void confirmAccountAction()}>确认</Button></>}><p>确认处理“{accountConfirmation?.label}”？此操作会立即失效且不可撤销。</p></Modal>
              <Modal open={passwordModalOpen} title="修改密码" onClose={() => { if (!accountSecuritySubmitting) setPasswordModalOpen(false); }} footer={<><Button variant="secondary" disabled={accountSecuritySubmitting} onClick={() => setPasswordModalOpen(false)}>取消</Button><Button loading={accountSecuritySubmitting} onClick={() => { const form = /** @type {HTMLFormElement | null} */ (runtime.getElementById('password-form')); form?.requestSubmit(); }}>保存</Button></>}>
                <form id="password-form" onSubmit={submitPassword}><Field id="current-password" label="当前密码" required><TextInput id="current-password" type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} /></Field><Field id="new-password" label="新密码" required><TextInput id="new-password" type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} /></Field><Field id="new-password-confirm" label="确认新密码" required><TextInput id="new-password-confirm" type="password" value={passwordForm.newPasswordConfirm} onChange={(event) => setPasswordForm((current) => ({ ...current, newPasswordConfirm: event.target.value }))} /></Field></form>
              </Modal>
              <Modal open={tokenModalOpen} title={tokenForm.id ? '编辑访问 Token' : '新建访问 Token'} onClose={() => { if (!accountSecuritySubmitting) setTokenModalOpen(false); }} footer={<><Button variant="secondary" disabled={accountSecuritySubmitting} onClick={() => setTokenModalOpen(false)}>取消</Button><Button loading={accountSecuritySubmitting} onClick={() => { const form = /** @type {HTMLFormElement | null} */ (runtime.getElementById('token-form')); form?.requestSubmit(); }}>保存</Button></>}>
                <form id="token-form" onSubmit={submitToken}>
                  <Field id="token-name" label="名称" required><TextInput id="token-name" value={tokenForm.name} onChange={(event) => setTokenForm((current) => ({ ...current, name: event.target.value }))} /></Field>
                  <fieldset className="account-security-options"><legend>权限</legend>{[['project:read', '读取项目'], ['work_item:read', '读取工作项'], ['work_item:write', '修改工作项'], ['comment:write', '发表评论'], ['resource:read', '读取资源'], ['resource:write', '修改资源'], ['resource:unlock', '解锁资源'], ['notification:read', '读取通知']].map(([scope, label]) => <label key={scope}><input type="checkbox" checked={tokenForm.scopes.includes(scope)} onChange={(event) => setTokenForm((current) => ({ ...current, scopes: event.target.checked ? [...current.scopes, scope] : current.scopes.filter((value) => value !== scope) }))} />{label}</label>)}</fieldset>
                  <Field id="token-project-scope-mode" label="项目范围" required><select value={tokenForm.projectScope === 'all' ? 'all' : 'selected'} onChange={(event) => setTokenForm((current) => ({ ...current, projectScope: event.target.value === 'all' ? 'all' : '' }))}><option value="all">全部项目（含后续新增）</option><option value="selected">指定项目</option></select></Field>
                  {tokenForm.projectScope !== 'all' ? <Field id="token-project-scope" label="项目 Key（逗号分隔）" required><TextInput placeholder="YCE, DEMO" value={tokenForm.projectScope} onChange={(event) => setTokenForm((current) => ({ ...current, projectScope: event.target.value }))} /></Field> : null}
                  {!tokenForm.id ? <Field id="token-expires-at" label="到期时间"><TextInput type="datetime-local" value={tokenForm.expiresAt} onChange={(event) => setTokenForm((current) => ({ ...current, expiresAt: event.target.value }))} /></Field> : null}
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
                    <TextInput value={profileForm.displayName} onChange={(event) => setProfileForm((current) => ({ ...current, displayName: event.target.value }))} />
                  </Field>
                  <Field id="profile-email" label="邮箱">
                    <TextInput type="email" value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} />
                  </Field>
                  <Field id="profile-mobile" label="手机号">
                    <TextInput value={profileForm.mobile} onChange={(event) => setProfileForm((current) => ({ ...current, mobile: event.target.value }))} />
                  </Field>
                </form>
              </Modal>
            </section>
          ) : route.id === 'projects' ? (
            <section className="page-stack projects-page" aria-labelledby="project-center-title">
              <section className="page-hero"><div><p className="shell-eyebrow">项目中心</p><h1 id="project-center-title" ref={headingRef} tabIndex={-1}>项目</h1><p>以项目组织需求、任务、Bug、成员、动态和文件协作。</p></div><div className="toolbar-actions"><Button onClick={() => { setProjectCreateError(''); setProjectCreateOpen(true); }}>新建项目</Button></div></section>
              <section className="metric-grid project-list-metrics" aria-label="项目概览"><article className="metric metric-info"><span>全部项目</span><strong>{dashboard?.projects?.length || 0}</strong></article><article className="metric metric-success"><span>进行中</span><strong>{dashboard?.projects?.filter((project) => project.status === 'in_progress').length || 0}</strong></article><article className="metric metric-warning"><span>待处理 / 进行中 / 待确认</span><strong>{dashboard?.projects?.reduce((total, project) => total + project.active_work_item_count, 0) || 0}</strong></article></section>

              <Modal open={projectCreateOpen} title="新建项目" onClose={() => { if (!projectCreateSubmitting) setProjectCreateOpen(false); }} footer={<><Button variant="secondary" disabled={projectCreateSubmitting} onClick={() => setProjectCreateOpen(false)}>取消</Button><Button loading={projectCreateSubmitting} onClick={() => { const form = /** @type {HTMLFormElement | null} */ (runtime.getElementById('project-create-form')); form?.requestSubmit(); }}>创建</Button></>}>
                <form id="project-create-form" onSubmit={submitProjectCreate}>
                  {projectCreateError ? <Feedback tone="danger" title="创建失败">{projectCreateError}</Feedback> : null}
                  <Field id="project-create-name" label="项目名称" required><TextInput value={projectCreateForm.name} maxLength={120} onChange={(event) => setProjectCreateForm((current) => ({ ...current, name: event.target.value }))} /></Field>
                  <Field id="project-create-status" label="状态" required><select value={projectCreateForm.status} onChange={(event) => setProjectCreateForm((current) => ({ ...current, status: event.target.value }))}><option value="not_started">待启动</option><option value="in_progress">进行中</option><option value="acceptance">验收中</option><option value="completed">已完成</option><option value="on_hold">已暂停</option><option value="cancelled">已取消</option><option value="archived">已归档</option></select></Field>
                  <Field id="project-create-start" label="开始日期"><TextInput type="date" value={projectCreateForm.startDate} onChange={(event) => setProjectCreateForm((current) => ({ ...current, startDate: event.target.value }))} /></Field>
                  <Field id="project-create-due" label="截止日期"><TextInput type="date" min={projectCreateForm.startDate || undefined} value={projectCreateForm.dueDate} onChange={(event) => setProjectCreateForm((current) => ({ ...current, dueDate: event.target.value }))} /></Field>
                  <Field id="project-create-description" label="项目描述"><TextArea value={projectCreateForm.description} maxLength={2000} onChange={(event) => setProjectCreateForm((current) => ({ ...current, description: event.target.value }))} /></Field>
                </form>
              </Modal>

              <section className="panel project-list-panel"><div className="panel-head"><div><h2>项目列表</h2><p>按最近更新排序，创建后会自动把当前用户加入为项目负责人。</p></div><ContentTabs ariaLabel="项目状态筛选">{[['', '全部'], ['not_started', '待启动'], ['in_progress', '进行中'], ['acceptance', '验收中'], ['completed', '已完成'], ['on_hold', '已暂停'], ['cancelled', '已取消'], ['archived', '已归档']].map(([status, label]) => { const path = buildProjectsPath({ owner: route.owner, status, perPage: projectRoute?.perPage }); return <ContentTab key={status || 'all'} active={(projectRoute?.status || '') === status} href={path} onClick={(event) => handleNavigate(/** @type {import('react').MouseEvent<HTMLAnchorElement>} */ (event), path, `已筛选${label}项目。`)}>{label}</ContentTab>; })}</ContentTabs></div>
              {projectPage?.items?.length ? (
                <>
                  <div className="project-card-grid" role="list" aria-label="项目列表">
                    {projectPage.items.map((project) => {
                      const isCurrentProject = currentProject?.key === project.key;
                      const path = buildProjectDetailPath({ owner: route.owner, projectKey: project.key });
                      return (
                        <article key={project.key} className={`project-card project-row ${isCurrentProject ? 'current' : ''}`} role="listitem"><div className="project-card-topline"><code>{project.key}</code><Badge tone={isCurrentProject ? 'info' : 'neutral'}>{isCurrentProject ? '当前项目' : projectStatusLabel(project.status)}</Badge></div><a className="project-card-title" href={path} onClick={(event) => handleNavigate(event, path, `已打开项目 ${project.key}。`)}>{project.name}</a><span className="project-card-meta">项目负责人：{project.owner || '未分配'}</span><span className="project-card-stats"><span><strong>{project.active_work_item_count}</strong><em>待处理 / 进行中 / 待确认</em></span><span><strong>{project.work_item_count}</strong><em>全部工作项</em></span></span><span className="project-card-foot">更新于 {dashboardTimestamp(project.updated_at)}</span><Button variant="secondary" disabled={isCurrentProject || Boolean(projectSwitchingKey)} onClick={() => void handleSetCurrentProject(project)}>{isCurrentProject ? '当前项目' : projectSwitchingKey === project.key ? '切换中…' : '设为当前项目'}</Button></article>
                      );
                    })}
                  </div>

                  <Pagination ariaLabel="项目分页" page={projectPage.pagination.page} totalPages={projectPage.pagination.total_pages} totalItems={projectPage.pagination.total_items} itemLabel="个项目" rangeLabel={`当前显示 ${projectRangeStart}-${projectRangeEnd}`} pageSize={projectPage.pagination.per_page} onPageSizeChange={changeProjectPageSize} onPageChange={changeProjectPage} />
                </>
              ) : (
                <div className="empty-state"><strong>暂无项目</strong><span>创建第一个项目后，需求、任务和 Bug 都会归属到项目下。</span></div>
              )}
              </section>
            </section>
          ) : route.id === 'project-detail' ? (
            <section className="page-stack project-detail-page" aria-labelledby="project-detail-title">
              <section className="page-hero detail-hero"><div><p className="shell-eyebrow">项目 / {activeProjectDetail?.key || route.projectKey}</p><h1 id="project-detail-title" ref={headingRef} tabIndex={-1}>{activeProjectDetail?.name || route.projectKey}</h1><p>{activeProjectDetail?.description || '正在加载项目详情。'}</p>{activeProjectDetail ? <div className="project-detail-meta"><Badge>{projectStatusLabel(activeProjectDetail.status)}</Badge><span>项目负责人：{activeProjectDetail.owner || activeProjectDetail.owner_username}</span><span>创建：{dashboardTimestamp(activeProjectDetail.created_at)}</span><span>更新：{dashboardTimestamp(activeProjectDetail.updated_at)}</span></div> : null}</div><div className="toolbar-actions"><a className="yc-button yc-button-secondary" href={buildProjectsPath({ owner: route.owner })} onClick={(event) => handleNavigate(event, buildProjectsPath({ owner: route.owner }), '已返回项目列表。')}>项目列表</a>{canManageProject ? <Button variant="secondary" onClick={openProjectEdit}>编辑项目</Button> : null}<a className="yc-button yc-button-secondary" href={personalAnalysisPath} onClick={(event) => handleNavigate(event, personalAnalysisPath, '已打开个人项目分析。')}>个人分析</a></div></section>
              <section className="metric-grid project-detail-metrics" aria-label="项目详情概览">{[
                ['需求', activeProjectDetail?.requirements || 0, 'info', 'doc'],
                ['任务', activeProjectDetail?.tasks || 0, 'warning', 'tasks'],
                ['Bug', activeProjectDetail?.bugs || 0, 'danger', 'bug'],
                ['成员', projectMembers.length, 'success', 'users'],
              ].map(([label, value, tone, icon]) => <article key={label} className={`metric metric-${tone}`}><div className="metric-head"><span className="metric-label">{label}</span><span className={`metric-ornament metric-icon-${icon}`} aria-hidden="true" /></div><strong>{value}</strong></article>)}</section>
              <section className="project-tabs-card"><div className="project-tabs-head"><div><p className="shell-eyebrow">项目详情</p><h2>项目资料</h2></div><ContentTabs ariaLabel="项目详情导航">
                {[['info', '详情'], ['cycles', '周期'], ['members', '成员'], ['resources', '资料库'], ['files', '项目文件']].map(([tab, label]) => {
                  const path = buildProjectDetailPath({ owner: route.owner, projectKey: route.projectKey, tab });
                  return <ContentTab key={tab} active={route.tab === tab} href={path} onClick={(event) => handleNavigate(/** @type {import('react').MouseEvent<HTMLAnchorElement>} */ (event), path, `已切换到${label}。`)}>{label}</ContentTab>;
                })}
              </ContentTabs></div><div className="project-tab-panels">
              {projectMutationError ? <Feedback tone="danger" title="项目操作失败">{projectMutationError}</Feedback> : null}
              {activeProjectDetail && route.tab === 'info' ? (
                <div className="project-detail-overview">
                  <section className="project-tab-section"><div className="project-tab-section-head"><div><h3>基础信息</h3><p>项目身份、项目负责人和生命周期状态。</p></div></div><dl className="project-detail-dl">
                    <div><dt>项目编号</dt><dd><code>{activeProjectDetail.key}</code></dd></div>
                    <div><dt>项目状态</dt><dd><Badge>{projectStatusLabel(activeProjectDetail.status)}</Badge></dd></div>
                    <div><dt>项目负责人</dt><dd>{activeProjectDetail.owner || activeProjectDetail.owner_username}</dd></div>
                    <div><dt>开始日期</dt><dd>{activeProjectDetail.start_date || '未设置'}</dd></div>
                    <div><dt>截止日期</dt><dd>{activeProjectDetail.due_date || '未设置'}</dd></div>
                    <div><dt>创建时间</dt><dd>{formatTimestamp(activeProjectDetail.created_at)}</dd></div>
                    <div><dt>更新时间</dt><dd>{formatTimestamp(activeProjectDetail.updated_at)}</dd></div>
                  </dl></section>
                  <section className="project-tab-section project-description-section"><div className="project-tab-section-head"><div><h3>项目说明</h3><p>目标、范围和协作边界。</p></div></div><p>{activeProjectDetail.description || '暂无描述。'}</p></section>
                </div>
              ) : null}

              {activeProjectDetail && route.tab === 'members' ? (
                <section className="project-tab-section" aria-labelledby="project-members-title">
                  <div className="project-tab-section-head"><div><h3 id="project-members-title">项目成员</h3><p>共 {projectMembers.length} 名成员</p></div>{canManageProject ? <Button variant="secondary" onClick={() => { setProjectMutationError(''); setProjectMemberOpen(true); }}>添加成员</Button> : null}</div>
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
                <section className="project-tab-section" aria-labelledby="project-cycles-title">
                  <div className="project-tab-section-head"><div><h3 id="project-cycles-title">项目周期</h3><p>共 {projectCycles.length} 个周期</p></div>{canManageProject ? <Button variant="secondary" onClick={() => openProjectCycle()}>新建周期</Button> : null}</div>
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
                <section className="project-tab-section project-files-section" aria-labelledby="project-files-title">
                  <div className="project-tab-section-head"><div><h3 id="project-files-title">项目文件</h3><p>共 {projectAttachments.length} 个文件</p></div>{canManageProject ? <Button variant="secondary" disabled={projectAttachmentUploading || projectMutationSubmitting} onClick={() => void uploadSelectedProjectAttachment()}>{projectAttachmentUploading ? '处理中…' : '选择文件上传'}</Button> : null}</div>
                  <p className="shell-muted">文件将直接上传到对象存储，页面只保留受控附件信息。</p>
                  {projectAttachmentStatus ? <p className="work-item-attachment-status" aria-live="polite">{projectAttachmentStatus}</p> : null}
                  {projectAttachmentError ? <Feedback tone="danger" title="项目文件操作失败">{projectAttachmentError}</Feedback> : null}
                  {projectAttachments.length ? <AttachmentList attachments={projectAttachments} ariaLabel="项目文件列表" downloadLabel="附件" downloadingId={projectAttachmentDownloadingId} revealableId={projectAttachmentReveal?.attachmentId || null} onPreview={(attachment) => void openProjectAttachmentPreview(attachment)} onDownload={(attachment) => void downloadProjectAttachment(attachment)} onReveal={(attachment) => void revealProjectAttachment(attachment)} showCreator renderExtraAction={(attachment) => canManageProject && attachment.status !== 'deleted' ? <><Button variant="danger" disabled={projectAttachmentUploading || projectAttachmentArchiving} onClick={() => { setProjectAttachmentError(''); setProjectAttachmentArchiveTarget(attachment); }}>归档</Button>{['pending', 'failed'].includes(attachment.status) ? <Button variant="secondary" disabled={projectAttachmentUploading || projectAttachmentArchiving} onClick={() => void uploadSelectedProjectAttachment(attachment)}>继续上传</Button> : null}</> : null} /> : <p className="shell-empty">当前项目暂无文件。</p>}
                </section>
              ) : null}

              {activeProjectDetail && route.tab === 'resources' ? (
                <section className="project-tab-section project-resources-section" aria-labelledby="project-resources-title">
                  <div className="project-tab-section-head"><div><h3 id="project-resources-title">项目资料库</h3><p>当前筛选共 {projectResources.length} 条资料</p></div>{canManageProject ? <Button variant="secondary" disabled={projectResourceSubmitting} onClick={() => openProjectResourceForm()}>新建资料</Button> : null}</div>
                  <FilterBar className="work-item-filter-bar" ariaLabel="项目资料筛选" onSubmit={submitProjectResourceFilters} actions={<><Button type="submit" variant="secondary">筛选</Button><Button type="button" variant="secondary" onClick={() => void resetProjectResourceFilters()}>重置</Button></>}>
                    <FilterField id="project-resource-filter-q" label="关键词"><TextInput value={projectResourceFilters.q} placeholder="标题、摘要或正文" onChange={(event) => setProjectResourceFilters((current) => ({ ...current, q: event.target.value }))} /></FilterField>
                    <FilterField id="project-resource-filter-category" label="分类"><TextInput value={projectResourceFilters.category} placeholder="例如 integration" onChange={(event) => setProjectResourceFilters((current) => ({ ...current, category: event.target.value }))} /></FilterField>
                    <FilterField id="project-resource-filter-status" label="状态"><Select value={projectResourceFilters.status} onChange={(event) => setProjectResourceFilters((current) => ({ ...current, status: event.target.value }))}><option value="">全部状态</option><option value="active">生效中</option><option value="archived">已归档</option></Select></FilterField>
                    <FilterField id="project-resource-filter-tag" label="标签"><TextInput value={projectResourceFilters.tag} placeholder="标签" onChange={(event) => setProjectResourceFilters((current) => ({ ...current, tag: event.target.value }))} /></FilterField>
                  </FilterBar>
                  {projectResourceError ? <Feedback tone="danger" title="资料列表加载失败">{projectResourceError}</Feedback> : null}
                  {projectResourceStatus ? <p className="work-item-attachment-status" aria-live="polite">{projectResourceStatus}</p> : null}
                  {projectResources.length ? <ul className="resource-list" aria-label="项目资料列表">{projectResources.map((resource) => {
                    const resourcePath = buildProjectResourceDetailPath({ owner: route.owner, projectKey: route.projectKey, resourceId: resource.id });
                    return <li key={resource.id}><a className={`resource-card${resource.is_protected ? ' resource-card-protected' : ''}`} href={resourcePath} onClick={(event) => handleNavigate(event, resourcePath, `已打开资料 ${resource.title}。`)}><div className="resource-card-main"><div className="resource-card-title-row"><span className="resource-category">{resource.category || '未分类'}</span><Badge tone={resource.status === 'archived' ? undefined : 'success'}>{resource.status === 'archived' ? '已归档' : '生效中'}</Badge>{resource.is_protected ? <span className="resource-lock-badge">保险箱</span> : null}</div><h4>{resource.title}</h4><p>{resource.summary || '暂无摘要。'}</p>{resource.tags.length ? <div className="resource-chip-row">{resource.tags.map((tag) => <span className="resource-chip" key={tag}>#{tag}</span>)}</div> : null}{resource.related_work_item || resource.related_cycle ? <div className="resource-link-row">{resource.related_work_item ? <span className="resource-link-chip">关联工作项 · {resource.related_work_item.key}</span> : null}{resource.related_cycle ? <span className="resource-link-chip">关联周期 · {resource.related_cycle.name}</span> : null}</div> : null}<div className="resource-card-meta"><span>更新：{resource.updated_by} · {formatTimestamp(resource.updated_at)}</span></div></div></a></li>;
                  })}</ul> : <p className="shell-empty">当前筛选下没有项目资料。</p>}
                </section>
              ) : null}
              </div></section>

              <AttachmentPreview open={Boolean(projectAttachmentPreview?.open)} title={projectAttachmentPreview?.attachment?.filename || '附件预览'} source={projectAttachmentPreview?.source || ''} kind={projectAttachmentPreview?.kind || null} fileType={projectAttachmentPreview?.fileType || null} loading={projectAttachmentPreview?.loading} error={projectAttachmentPreview?.error} position={projectAttachmentPreview?.position} total={projectAttachmentPreview?.total} hasPrevious={Boolean(projectAttachmentPreview?.previousId)} hasNext={Boolean(projectAttachmentPreview?.nextId)} onPrevious={() => { if (projectAttachmentPreview?.previousId) navigateProjectAttachmentPreview(projectAttachmentPreview.previousId); }} onNext={() => { if (projectAttachmentPreview?.nextId) navigateProjectAttachmentPreview(projectAttachmentPreview.nextId); }} onDownload={() => { if (projectAttachmentPreview?.attachment) void downloadProjectAttachment(projectAttachmentPreview.attachment); }} onClose={() => void releaseProjectAttachmentPreview()} />

              <Modal open={projectEditOpen} title="编辑项目" onClose={() => { if (!projectMutationSubmitting) setProjectEditOpen(false); }} footer={<><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => setProjectEditOpen(false)}>取消</Button><Button loading={projectMutationSubmitting} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('project-edit-form'))?.requestSubmit()}>保存</Button></>}>
                <form id="project-edit-form" onSubmit={submitProjectEdit}>
                  <Field id="project-edit-name" label="项目名称" required><TextInput value={projectEditForm.name} maxLength={120} onChange={(event) => setProjectEditForm((current) => ({ ...current, name: event.target.value }))} /></Field>
                  <Field id="project-edit-status" label="状态" required><select value={projectEditForm.status} onChange={(event) => setProjectEditForm((current) => ({ ...current, status: event.target.value }))}>{['not_started', 'in_progress', 'acceptance', 'completed', 'on_hold', 'cancelled', 'archived'].map((status) => <option key={status} value={status}>{projectStatusLabel(status)}</option>)}</select></Field>
                  <Field id="project-edit-owner" label="负责人用户名" required><TextInput value={projectEditForm.ownerUsername} maxLength={64} onChange={(event) => setProjectEditForm((current) => ({ ...current, ownerUsername: event.target.value }))} /></Field>
                  <Field id="project-edit-start" label="开始日期"><TextInput type="date" value={projectEditForm.startDate} onChange={(event) => setProjectEditForm((current) => ({ ...current, startDate: event.target.value }))} /></Field>
                  <Field id="project-edit-due" label="截止日期"><TextInput type="date" min={projectEditForm.startDate || undefined} value={projectEditForm.dueDate} onChange={(event) => setProjectEditForm((current) => ({ ...current, dueDate: event.target.value }))} /></Field>
                  <Field id="project-edit-description" label="项目描述"><TextArea value={projectEditForm.description} maxLength={2000} onChange={(event) => setProjectEditForm((current) => ({ ...current, description: event.target.value }))} /></Field>
                </form>
              </Modal>
              <Modal open={projectMemberOpen} title="添加项目成员" onClose={() => { if (!projectMutationSubmitting) setProjectMemberOpen(false); }} footer={<><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => setProjectMemberOpen(false)}>取消</Button><Button loading={projectMutationSubmitting} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('project-member-form'))?.requestSubmit()}>添加</Button></>}>
                <form id="project-member-form" onSubmit={submitProjectMember}><Field id="project-member-username" label="用户名" required><TextInput value={projectMemberForm.username} maxLength={64} onChange={(event) => setProjectMemberForm((current) => ({ ...current, username: event.target.value }))} /></Field><Field id="project-member-role" label="项目角色" required><select value={projectMemberForm.memberRole} onChange={(event) => setProjectMemberForm((current) => ({ ...current, memberRole: event.target.value }))}><option value="member">项目成员</option><option value="maintainer">项目管理员</option><option value="viewer">只读成员</option></select></Field></form>
              </Modal>
              <Modal open={Boolean(projectMemberTarget)} title="调整成员角色" onClose={() => { if (!projectMutationSubmitting) setProjectMemberTarget(null); }} footer={<><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => setProjectMemberTarget(null)}>取消</Button><Button loading={projectMutationSubmitting} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('project-member-role-form'))?.requestSubmit()}>保存</Button></>}>
                <form id="project-member-role-form" onSubmit={submitProjectMemberRole}><p>{projectMemberTarget?.display_name} @{projectMemberTarget?.username}</p><Field id="project-member-role-value" label="项目角色" required><select key={`${projectMemberTarget?.username || ''}:${projectMemberTarget?.member_role || ''}`} name="memberRole" defaultValue={projectMemberTarget?.member_role || 'member'}><option value="viewer">只读成员</option><option value="member">项目成员</option><option value="maintainer">项目管理员</option></select></Field></form>
              </Modal>
              <Modal open={Boolean(projectMemberRemoveTarget)} title="移除项目成员" onClose={() => { if (!projectMutationSubmitting) setProjectMemberRemoveTarget(null); }} footer={<><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => setProjectMemberRemoveTarget(null)}>取消</Button><Button variant="danger" loading={projectMutationSubmitting} onClick={() => void confirmProjectMemberRemove()}>确认移除</Button></>}><p>确认从项目中移除 {projectMemberRemoveTarget?.display_name} @{projectMemberRemoveTarget?.username}？</p></Modal>
              <Modal open={projectCycleOpen} title={projectCycleForm.id ? '编辑项目周期' : '新建项目周期'} onClose={() => { if (!projectMutationSubmitting) setProjectCycleOpen(false); }} footer={<><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => setProjectCycleOpen(false)}>取消</Button><Button loading={projectMutationSubmitting} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('project-cycle-form'))?.requestSubmit()}>保存</Button></>}>
                <form id="project-cycle-form" onSubmit={submitProjectCycle}><Field id="project-cycle-name" label="周期名称" required><TextInput value={projectCycleForm.name} maxLength={120} onChange={(event) => setProjectCycleForm((current) => ({ ...current, name: event.target.value }))} /></Field><Field id="project-cycle-goal" label="周期目标"><TextInput value={projectCycleForm.goal} maxLength={240} onChange={(event) => setProjectCycleForm((current) => ({ ...current, goal: event.target.value }))} /></Field><Field id="project-cycle-owner" label="负责人用户名"><TextInput value={projectCycleForm.ownerUsername} maxLength={64} onChange={(event) => setProjectCycleForm((current) => ({ ...current, ownerUsername: event.target.value }))} /></Field><Field id="project-cycle-start" label="开始日期" required><TextInput type="date" value={projectCycleForm.startDate} onChange={(event) => setProjectCycleForm((current) => ({ ...current, startDate: event.target.value }))} /></Field><Field id="project-cycle-end" label="结束日期" required><TextInput type="date" min={projectCycleForm.startDate || undefined} value={projectCycleForm.endDate} onChange={(event) => setProjectCycleForm((current) => ({ ...current, endDate: event.target.value }))} /></Field><Field id="project-cycle-description" label="周期说明"><TextArea value={projectCycleForm.description} maxLength={5000} onChange={(event) => setProjectCycleForm((current) => ({ ...current, description: event.target.value }))} /></Field></form>
              </Modal>
              <Modal open={Boolean(projectCycleCloseTarget)} title="关闭项目周期" onClose={() => { if (!projectMutationSubmitting) setProjectCycleCloseTarget(null); }} footer={<><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => setProjectCycleCloseTarget(null)}>取消</Button><Button variant="danger" loading={projectMutationSubmitting} onClick={() => void confirmProjectCycleClose()}>确认关闭</Button></>}><p>确认关闭周期“{projectCycleCloseTarget?.name}”？关闭后不能继续编辑。</p></Modal>
              <Modal open={Boolean(projectAttachmentArchiveTarget)} title="归档项目文件" onClose={() => { if (!projectAttachmentArchiving) setProjectAttachmentArchiveTarget(null); }} footer={<><Button variant="secondary" disabled={projectAttachmentArchiving} onClick={() => setProjectAttachmentArchiveTarget(null)}>取消</Button><Button variant="danger" loading={projectAttachmentArchiving} onClick={() => void confirmProjectAttachmentArchive()}>确认归档</Button></>}><p>确认归档文件“{projectAttachmentArchiveTarget?.filename}”？归档后不能继续下载，但文件记录会保留。</p></Modal>
            </section>
          ) : route.id === 'project-personal-analysis' ? (
            <section className="page-stack personal-analysis-page" aria-labelledby="personal-analysis-title">
              <header className="analysis-header"><div><a className="work-item-back" href={buildProjectDetailPath({ owner: route.owner, projectKey: projectScopeKey })} onClick={(event) => handleNavigate(event, buildProjectDetailPath({ owner: route.owner, projectKey: projectScopeKey }), '已返回项目详情。')}>← 返回项目详情</a><p className="shell-eyebrow">{projectScopeKey} / 个人项目分析</p><h1 id="personal-analysis-title" ref={headingRef} tabIndex={-1}>{activeProjectDetail?.name || projectScopeKey}</h1><p>仅统计 {projectPersonalAnalysis?.display_name || user?.display_name || '当前用户'} 在该项目中的实际处理与协作记录。</p></div>{activeProjectDetail ? <Badge>{projectStatusLabel(activeProjectDetail.status)}</Badge> : null}</header>
              {projectPersonalAnalysis ? <>
                <section className="metric-grid personal-analysis-output" aria-label="个人处理产出">{[
                  ['累计处理', projectPersonalAnalysis.completed_total, 'info', 'check'],
                  ['近 30 日', projectPersonalAnalysis.completed_last_30_days, 'success', 'calendar'],
                  ['已处理 Bug', projectPersonalAnalysis.completed_bugs, 'danger', 'bug'],
                  ['当前待处理', personalAnalysisPendingTotal, 'warning', 'tasks'],
                ].map(([label, value, tone, icon]) => <article className={`metric metric-${tone}`} key={label}><div className="metric-head"><span className="metric-label">{label}</span><span className={`metric-ornament metric-icon-${icon}`} aria-hidden="true" /></div><strong>{value}</strong></article>)}</section>

                <section className="analysis-section" aria-labelledby="personal-analysis-efficiency-title">
                  <div className="section-heading"><div><p className="shell-eyebrow">处理效率</p><h2 id="personal-analysis-efficiency-title">自然周期效率</h2></div><span>统计起点：{projectPersonalAnalysis.joined_at}</span></div>
                  <div className="metric-grid compact-metrics">
                    {[
                      ['日平均处理', formatAnalysisAverage(projectPersonalAnalysis.daily_average), 'info'],
                      ['单日最大处理', projectPersonalAnalysis.daily_peak, 'success'],
                      ['月平均处理', formatAnalysisAverage(projectPersonalAnalysis.monthly_average), 'warning'],
                      ['单月最大处理', projectPersonalAnalysis.monthly_peak, 'danger'],
                    ].map(([label, value, tone]) => <article className={`metric metric-${tone}`} key={label}><div className="metric-head"><span className="metric-label">{label}</span><span className="metric-ornament metric-icon-trend" aria-hidden="true" /></div><strong>{value}</strong></article>)}
                  </div>
                </section>

                <div className="analysis-columns">
                  <section className="analysis-section" aria-labelledby="personal-analysis-pending-title">
                    <div className="section-heading"><div><p className="shell-eyebrow">当前负载</p><h2 id="personal-analysis-pending-title">我的待处理</h2></div></div>
                    <div className="analysis-pending-list">{personalAnalysisPendingLinks.map((item) => <a href={item.path} key={item.itemType} onClick={(event) => handleNavigate(event, item.path, `已打开待处理${item.label}。`)}><span>{item.label}</span><strong>{item.count}</strong></a>)}</div>
                  </section>
                  <section className="analysis-section" aria-labelledby="personal-analysis-collaboration-title">
                    <div className="section-heading"><div><p className="shell-eyebrow">协作参与</p><h2 id="personal-analysis-collaboration-title">沟通与推进</h2></div></div>
                    <dl className="analysis-collaboration"><div><dt>活跃天数</dt><dd>{projectPersonalAnalysis.active_days}</dd></div><div><dt>评论 / 回复</dt><dd>{projectPersonalAnalysis.comment_count}</dd></div><div><dt>指派 / 流转</dt><dd>{projectPersonalAnalysis.handoff_count}</dd></div></dl>
                  </section>
                </div>

                <section className="analysis-section" aria-labelledby="personal-analysis-completions-title">
                  <div className="section-heading"><div><p className="shell-eyebrow">最近产出</p><h2 id="personal-analysis-completions-title">最近完成记录</h2></div><span>以实际终态操作时间排序</span></div>
                  {projectPersonalAnalysis.recent_completions.length ? <div className="analysis-completion-list">{projectPersonalAnalysis.recent_completions.map((item) => { const itemPath = buildWorkItemDetailPath({ owner: /** @type {'app' | 'web'} */ (route.owner), itemKey: item.key }); return <a href={itemPath} key={`${item.key}-${item.completed_at}`} onClick={(event) => handleNavigate(event, itemPath, `已打开 ${item.key}。`)}><Badge>{workItemTypeLabel(item.item_type)}</Badge><code>{item.key}</code><strong>{item.title}</strong><time>{formatTimestamp(item.completed_at)}</time></a>; })}</div> : <div className="empty-state"><strong>暂无完成记录</strong><span>工作项由你推进到完成、解决、验证或关闭后会记录在这里。</span></div>}
                </section>
                <p className="analysis-note">处理量按你实际执行的终态流转事件统计；日均和月均从加入项目起按自然周期计算，并包含无处理记录的日期。</p>
              </> : null}
            </section>
          ) : route.id === 'project-resource-detail' ? (
            <section className="page-stack resource-detail-page" aria-labelledby="project-resource-detail-title">
              <section className="page-hero detail-hero resource-hero"><div><p className="shell-eyebrow">资料库 / {route.projectKey}</p><h1 id="project-resource-detail-title" ref={headingRef} tabIndex={-1}>{projectResourceDetail?.title || `资料 #${route.resourceId}`}</h1><p>{projectResourceLocked ? '这条资料已设置访问密码，验证通过后可查看正文和附件。' : projectResourceDetail?.summary || '暂无摘要。'}</p>{projectResourceDetail ? <div className="project-detail-meta"><span className="resource-category">{projectResourceDetail.category || '未分类'}</span><Badge>{projectResourceDetail.status === 'archived' ? '已归档' : '生效中'}</Badge>{projectResourceDetail.is_protected ? <span className="resource-lock-badge">保险箱</span> : null}<span>更新：{projectResourceDetail.updated_by} · {formatTimestamp(projectResourceDetail.updated_at)}</span></div> : null}</div><div className="toolbar-actions"><a className="yc-button yc-button-secondary" href={resourceFallbackPath} onClick={(event) => handleNavigate(event, resourceFallbackPath, '已返回项目资料库。')}>返回资料库</a>{canManageProject && projectResourceDetail?.status !== 'archived' && !projectResourceLocked ? <Button variant="secondary" disabled={projectResourceSubmitting || projectResourceAttachmentUploading || projectResourceAttachmentDeleting} onClick={() => openProjectResourceForm(projectResourceDetail)}>编辑资料</Button> : null}{user?.is_super_admin && projectResourceDetail?.status !== 'archived' ? <Button variant="secondary" disabled={projectResourceSubmitting || projectResourceAttachmentUploading || projectResourceAttachmentDeleting} onClick={() => { setProjectResourceError(''); setProjectResourcePasswordResetForm({ accessPasswordAction: 'set', accessPassword: '' }); setProjectResourcePasswordResetOpen(true); }}>重置保险箱密码</Button> : null}{canManageProject && projectResourceDetail?.status !== 'archived' && !projectResourceLocked ? <Button variant="secondary" disabled={projectResourceSubmitting || projectResourceAttachmentUploading || projectResourceAttachmentDeleting} onClick={() => { setProjectResourceError(''); setProjectResourceArchiveTarget(projectResourceDetail); }}>归档</Button> : null}</div></section>
              {projectResourceError ? <Feedback tone="danger" title="资料操作失败">{projectResourceError}</Feedback> : null}
              {projectResourceStatus ? <p className="work-item-attachment-status" aria-live="polite">{projectResourceStatus}</p> : null}
              {projectResourceDetail ? <>
                <section className="project-tabs-card resource-summary-card"><div className="project-tabs-head"><div><p className="shell-eyebrow">资料标签与关联</p><h2>结构化信息</h2></div></div><div className="resource-summary-grid"><div className="resource-summary-block"><strong>标签</strong><div className="resource-chip-row">{projectResourceDetail.tags.length ? projectResourceDetail.tags.map((tag) => <span className="resource-chip" key={tag}>#{tag}</span>) : <span className="shell-muted">未设置标签</span>}</div></div><div className="resource-summary-block"><strong>关联对象</strong><div className="resource-link-row">{projectResourceDetail.related_work_item ? <span className="resource-link-chip">关联工作项 · {projectResourceDetail.related_work_item.key}</span> : projectResourceDetail.related_cycle ? <span className="resource-link-chip">关联周期 · {projectResourceDetail.related_cycle.name}</span> : <span className="shell-muted">未关联工作项或周期</span>}</div></div></div></section>
                {projectResourceLocked ? <section className="resource-lock-panel"><div className="resource-lock-card"><span className="resource-lock-mark" aria-hidden="true">⌁</span><div><p className="shell-eyebrow">访问验证</p><h2>这条资料已设置访问密码</h2><p>请输入创建该资料时设置的访问密码。验证通过后会展示正文和正文内附件。</p></div><form className="resource-unlock-form" onSubmit={submitProjectResourceUnlock}><Field id="project-resource-password" label="访问密码" required><TextInput type="password" autoComplete="off" value={projectResourcePassword} onChange={(event) => setProjectResourcePassword(event.target.value)} /></Field><Button type="submit" loading={projectResourceUnlocking} disabled={!projectResourcePassword}>验证并查看</Button></form></div></section> : <><section className="project-tabs-card resource-content-card"><div className="project-tabs-head"><div><p className="shell-eyebrow">资料正文</p><h2>{projectResourceDetail.title}</h2></div><div className="resource-detail-side"><span>{projectResourceDetail.category || '未分类'}</span><span>{formatTimestamp(projectResourceDetail.updated_at)}</span></div></div><article className="resource-rich-body"><RichTextContent html={projectResourceDetail.body} format={projectResourceDetail.body_format} onAttachmentActivate={activateProjectResourceInlineAttachment} resolveAttachmentSource={typeof files.attachments?.openProjectResourceAttachmentPreview === 'function' ? resolveProjectResourceInlineAttachmentSource : undefined} /></article></section><section className="project-tabs-card resource-attachments-card" aria-labelledby="project-resource-attachments-title"><div className="project-tabs-head"><div><p className="shell-eyebrow">资料文件</p><h2 id="project-resource-attachments-title">资料附件</h2><p>共 {projectResourceAttachments.length} 个附件</p></div>{canManageProject && projectResourceDetail.status !== 'archived' ? <Button variant="secondary" disabled={projectResourceAttachmentUploading || projectResourceAttachmentDeleting || projectResourceSubmitting} onClick={() => void uploadSelectedProjectResourceAttachment()}>{projectResourceAttachmentUploading ? '处理中…' : '选择附件上传'}</Button> : null}</div><div className="project-tab-panels">{projectResourceAttachmentStatus ? <p className="work-item-attachment-status" aria-live="polite">{projectResourceAttachmentStatus}</p> : null}{projectResourceAttachments.length ? <AttachmentList attachments={projectResourceAttachments} ariaLabel="资料附件列表" downloadLabel="附件" downloadingId={projectResourceAttachmentDownloadingId} revealableId={projectResourceAttachmentReveal?.attachmentId || null} onPreview={(attachment) => void openProjectResourceAttachmentPreview(attachment)} onDownload={(attachment) => void downloadProjectResourceAttachment(attachment)} onReveal={(attachment) => void revealProjectResourceAttachment(attachment)} showCreator renderExtraAction={(attachment) => canManageProject && projectResourceDetail.status !== 'archived' && attachment.status !== 'deleted' ? <><Button variant="danger" disabled={projectResourceAttachmentUploading || projectResourceAttachmentDeleting} onClick={() => { setProjectResourceError(''); setProjectResourceAttachmentDeleteTarget(attachment); }}>删除</Button>{['pending', 'failed'].includes(attachment.status) ? <Button variant="secondary" disabled={projectResourceAttachmentUploading || projectResourceAttachmentDeleting} onClick={() => void uploadSelectedProjectResourceAttachment(attachment)}>继续上传</Button> : null}</> : null} /> : <p className="shell-empty">当前资料暂无附件。</p>}</div></section><AttachmentPreview open={Boolean(projectAttachmentPreview?.open)} title={projectAttachmentPreview?.attachment?.filename || '附件预览'} source={projectAttachmentPreview?.source || ''} kind={projectAttachmentPreview?.kind || null} fileType={projectAttachmentPreview?.fileType || null} loading={projectAttachmentPreview?.loading} error={projectAttachmentPreview?.error} position={projectAttachmentPreview?.position} total={projectAttachmentPreview?.total} hasPrevious={Boolean(projectAttachmentPreview?.previousId)} hasNext={Boolean(projectAttachmentPreview?.nextId)} onPrevious={() => { if (projectAttachmentPreview?.previousId) navigateProjectResourceAttachmentPreview(projectAttachmentPreview.previousId); }} onNext={() => { if (projectAttachmentPreview?.nextId) navigateProjectResourceAttachmentPreview(projectAttachmentPreview.nextId); }} onDownload={() => { if (projectAttachmentPreview?.attachment) void downloadProjectResourceAttachment(projectAttachmentPreview.attachment); }} onClose={() => void releaseProjectAttachmentPreview()} /></>}
              </> : null}
            </section>
          ) : route.id === 'project-cycle-detail' ? (
            <section className="page-stack cycle-detail-page" aria-labelledby="project-cycle-detail-title">
              <section className="page-hero detail-hero"><div><p className="shell-eyebrow">项目周期 / {route.projectKey}</p><h1 id="project-cycle-detail-title" ref={headingRef} tabIndex={-1}>{projectCycleDetail?.name || `周期 #${route.cycleId}`}</h1><p>{projectCycleDetail?.goal || projectCycleDetail?.description || '当前周期还没有填写目标说明。'}</p>{projectCycleDetail ? <div className="project-detail-meta"><Badge>{projectCycleStatusLabel(projectCycleDetail)}</Badge><span>所属项目：{activeProjectDetail?.name || route.projectKey}</span><span>总工作项：{projectCycleDetail.total_items}</span><span>{projectCycleDetail.start_date} ~ {projectCycleDetail.end_date}</span></div> : null}</div><div className="toolbar-actions"><a className="yc-button yc-button-secondary" href={cycleBackPath} onClick={(event) => handleNavigate(event, cycleBackPath, cycleBackPath === cycleFallbackPath ? '已返回项目周期。' : '已返回上一页。')}>{cycleBackPath === cycleFallbackPath ? '返回项目周期' : '返回上一页'}</a></div></section>
              {projectMutationError ? <Feedback tone="danger" title="周期操作失败">{projectMutationError}</Feedback> : null}
              {projectCycleDetail ? <>
                <section className="metric-grid cycle-detail-metrics" aria-label="周期统计">{[['工作项', projectCycleDetail.total_items, 'info', 'tasks'], ['待处理', projectCycleDetail.pending_count, 'warning', 'calendar'], ['需求', projectCycleDetail.requirement_count, 'success', 'doc'], ['Bug', projectCycleDetail.bug_count, 'danger', 'bug']].map(([label, value, tone, icon]) => <article className={`metric metric-${tone}`} key={label}><div className="metric-head"><span className="metric-label">{label}</span><span className={`metric-ornament metric-icon-${icon}`} aria-hidden="true" /></div><strong>{value}</strong></article>)}</section>
                <section className="project-tabs-card"><div className="project-tabs-head"><div><p className="shell-eyebrow">周期概览</p><h2>基础信息</h2></div></div><div className="project-tab-panels"><div className="project-detail-overview cycle-detail-overview"><section className="project-tab-section"><div className="project-tab-section-head"><div><h3>核心字段</h3><p>把周期身份、负责人和交付规模放在同一处查看。</p></div></div><dl className="project-detail-dl"><div><dt>负责人</dt><dd>{projectCycleDetail.owner || '未设置'}</dd></div><div><dt>开始日期</dt><dd>{projectCycleDetail.start_date}</dd></div><div><dt>结束日期</dt><dd>{projectCycleDetail.end_date}</dd></div><div><dt>任务数量</dt><dd>{projectCycleDetail.task_count}</dd></div><div><dt>状态</dt><dd>{projectCycleStatusLabel(projectCycleDetail)}</dd></div><div><dt>更新时间</dt><dd>{formatTimestamp(projectCycleDetail.updated_at)}</dd></div></dl></section><section className="project-tab-section cycle-detail-description"><div className="project-tab-section-head"><div><h3>目标与说明</h3><p>明确这一轮周期要交付什么、关注什么。</p></div></div><div className="cycle-detail-description-body"><article><strong>周期目标</strong><p>{projectCycleDetail.goal || '未填写周期目标'}</p></article><article><strong>补充说明</strong><p>{projectCycleDetail.description || '暂无补充说明'}</p></article></div></section></div></div></section>
                <section className="project-tabs-card"><div className="project-tabs-head"><div><p className="shell-eyebrow">时间状态</p><h2 id="cycle-pace-title">当前节奏</h2></div></div><div className="project-tab-panels cycle-progress-panel"><div className="cycle-progress-summary"><div className="cycle-progress-figure"><strong>{cyclePace?.percent}%</strong><span>时间进度</span></div><div className="cycle-progress-track"><strong>{cyclePace?.duration}</strong><span>{cyclePace?.hint}</span><progress max="100" value={cyclePace?.percent || 0} aria-label="周期时间进度">{cyclePace?.percent}%</progress></div></div></div></section>
                <section className="project-tabs-card"><div className="project-tabs-head"><div><p className="shell-eyebrow">状态看板</p><h2>工作项状态看板</h2></div></div><div className="cycle-board-grid">{[['open', '待处理', 'warning'], ['in_progress', '进行中', 'info'], ['pending_confirmation', '待确认', 'info'], ['done', '已完成', 'success']].map(([status, label, tone]) => { const items = projectCycleDetail.work_items.filter((item) => status === 'done' ? !['open', 'in_progress', 'pending_confirmation'].includes(item.status) : item.status === status); return <article className="cycle-board-column" data-tone={tone} key={status}><div className="cycle-board-column-head"><strong>{label}</strong><span>{items.length} 项</span></div><div className="cycle-board-items">{items.length ? items.map((item) => { const itemPath = buildWorkItemDetailPath({ owner: /** @type {'app' | 'web'} */ (route.owner), itemKey: item.key }); return <article className="cycle-board-item" key={item.key}><a className="cycle-board-item-title" href={itemPath} onClick={(event) => handleNavigate(event, itemPath, `已打开 ${item.key}。`)}>{item.key} · {item.title}</a><div className="cycle-board-item-meta"><span>{item.priority}</span><span>{item.assignee || '未指派'}</span><span>{item.due_date || '无截止日期'}</span></div></article>; }) : <p className="shell-empty">暂无工作项。</p>}</div></article>; })}</div></section>
                <section className="project-tabs-card" aria-labelledby="cycle-member-load-title"><div className="project-tabs-head"><div><p className="shell-eyebrow">成员负载</p><h2 id="cycle-member-load-title">按成员看待推进压力</h2></div></div><div className="project-tab-panels"><DataTable caption="周期成员负载" rows={cycleMemberLoad} rowKey={(row) => row.key || 'unassigned'} emptyText="当前周期暂无待推进负载。" columns={[{ key: 'member', label: '成员', render: (row) => <><strong>{row.member}</strong><br /><span className="shell-muted">{row.subtitle}</span></> }, { key: 'open', label: '待处理', render: (row) => row.open }, { key: 'in_progress', label: '进行中', render: (row) => row.in_progress }, { key: 'pending_confirmation', label: '待确认', render: (row) => row.pending_confirmation }, { key: 'high', label: '高优先级', render: (row) => row.high }, { key: 'overdue', label: '逾期', render: (row) => row.overdue }, { key: 'active', label: '活跃合计', render: (row) => row.active }]} /></div></section>
              </> : null}
            </section>
          ) : isWorkItemListRouteId(route.id) ? (
            <section className="page-stack work-item-list-page" aria-labelledby="work-item-center-title">
              {workItemPage ? <section className="metric-grid compact-metrics work-item-list-metrics" aria-label="工作项概览">{[
                ['全部', workItemPage.summary.total_items, 'info', 'projects'],
                ['待处理 / 进行中 / 待确认', workItemPage.summary.active_items, 'warning', 'tasks'],
                ['高优先级', workItemPage.summary.high_priority_items, 'danger', 'bug'],
              ].map(([label, value, tone, icon]) => <article className={`metric metric-${tone}`} key={label}><div className="metric-head"><span className="metric-label">{label}</span><span className={`metric-ornament metric-icon-${icon}`} aria-hidden="true" /></div><strong>{value}</strong></article>)}</section> : null}
              <section className="panel work-list-panel">
              <div className="panel-head work-item-center-header">
                <div>
                  <h2 id="work-item-center-title">{workItemTypeLabel(route.itemType)}列表</h2>
                  <p>当前项目：{currentProject ? `${currentProject.key} · ${currentProject.name}` : '未选择项目'}，支持按关键词、状态、优先级和处理人筛选。</p>
                </div>
                <div className="toolbar-actions">
                  {workItemPage?.can_manage_work_items ? <Button disabled={workItemCreateSubmitting} onClick={openWorkItemCreate}>{workItemCreateLabel(route.itemType)}</Button> : null}
                </div>
              </div>

              {workItemPage ? <>
                <div className="filter-shell"><div className="filter-shell-head"><strong>筛选条件</strong><span>组合条件可快速缩小当前项目中的{workItemTypeLabel(route.itemType)}范围</span></div>

              <FilterBar key={workItemPage ? JSON.stringify(workItemPage.filters) : route.id} className="work-item-filter-bar" ariaLabel="工作项筛选" onSubmit={submitWorkItemFilters} actions={<><Button type="submit">筛选</Button><Button variant="secondary" onClick={resetWorkItemFilters}>重置</Button></>}>
                <FilterField id="work-item-filter-keyword" label="关键词"><TextInput name="q" defaultValue={workItemPage?.filters.q ?? route.q} placeholder="标题或编号" /></FilterField>
                <FilterField id="work-item-filter-status" label="状态">
                  <Select name="status" defaultValue={workItemPage?.filters.status ?? route.status}>
                    <option value="">全部状态</option>
                    <option value="open">待处理</option>
                    <option value="in_progress">进行中</option>
                    <option value="pending_confirmation">待确认</option>
                    <option value="done">已完成</option>
                    <option value="resolved">已解决</option>
                    <option value="verified">已验证</option>
                    <option value="closed">已关闭</option>
                    <option value="cancelled">已取消</option>
                  </Select>
                </FilterField>
                <FilterField id="work-item-filter-priority" label="优先级">
                  <Select name="priority" defaultValue={workItemPage?.filters.priority ?? route.priority}>
                    <option value="">全部优先级</option>
                    <option value="P0">P0</option>
                    <option value="P1">P1</option>
                    <option value="P2">P2</option>
                    <option value="P3">P3</option>
                  </Select>
                </FilterField>
                <FilterField id="work-item-filter-assignee" label="处理人">
                  <Select name="assignee_username" defaultValue={workItemPage?.filters.assignee_username ?? route.assigneeUsername}>
                    <option value="">全部处理人</option>
                    {(workItemPage?.assignees || []).map((assignee) => <option key={assignee.username} value={assignee.username}>{assignee.display_name} · {assignee.username}</option>)}
                  </Select>
                </FilterField>
                <FilterField id="work-item-filter-cycle" label="周期">
                  <Select name="cycle_id" defaultValue={workItemPage?.filters.cycle_id || route.cycleId || ''}>
                    <option value="">全部周期</option>
                    {(workItemPage?.cycles || []).map((cycle) => <option key={cycle.id} value={String(cycle.id)}>{cycle.name}{cycle.is_closed ? ' · 已关闭' : ''}</option>)}
                  </Select>
                </FilterField>
                <FilterField id="work-item-filter-sort" label="排序">
                  <Select name="sort" defaultValue={workItemPage?.filters.sort ?? route.sort}>
                    <option value="">最近更新</option>
                    <option value="updated_desc">最近更新</option>
                    <option value="created_desc">最近创建</option>
                    <option value="priority_desc">优先级从高到低</option>
                    <option value="due_date_asc">截止日期最近</option>
                  </Select>
                </FilterField>
              </FilterBar>
              </div></> : null}

              {workItemPage?.items?.length ? (
                <>
                  {workItemPage.can_manage_work_items ? <div className="work-item-batch-bar" aria-label="批量操作">
                    <label className="work-item-batch-select-all"><input type="checkbox" checked={currentWorkItemPageSelected} onChange={(event) => toggleCurrentWorkItemPage(event.target.checked)} /> 选择当前页</label>
                    <strong>已选择 {workItemSelection.size} 项</strong>
                    <Select aria-label="批量操作类型" value={workItemBatchForm.action} disabled={workItemBatchSubmitting} onChange={changeWorkItemBatchAction}>
                      <option value="priority">修改优先级</option><option value="status">修改状态</option><option value="assignee">修改处理人</option><option value="cycle">修改周期</option>
                    </Select>
                    {workItemBatchForm.action === 'priority' ? <Select aria-label="目标优先级" value={workItemBatchForm.value} disabled={workItemBatchSubmitting} onChange={(event) => setWorkItemBatchForm((current) => ({ ...current, value: event.target.value }))}><option value="P0">P0</option><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option></Select> : null}
                    {workItemBatchForm.action === 'status' ? <Select aria-label="目标状态" value={workItemBatchForm.value} disabled={workItemBatchSubmitting} onChange={(event) => setWorkItemBatchForm((current) => ({ ...current, value: event.target.value }))}><option value="open">待处理</option><option value="in_progress">进行中</option><option value="pending_confirmation">待确认</option>{route.itemType === 'bug' ? <><option value="resolved">已解决</option><option value="verified">已验证</option></> : <option value="done">已完成</option>}<option value="closed">已关闭</option></Select> : null}
                    {workItemBatchForm.action === 'assignee' ? <Select aria-label="目标处理人" value={workItemBatchForm.value} disabled={workItemBatchSubmitting} onChange={(event) => setWorkItemBatchForm((current) => ({ ...current, value: event.target.value }))}><option value="">请选择处理人</option>{workItemPage.assignees.map((assignee) => <option key={assignee.username} value={assignee.username}>{assignee.display_name} · {assignee.username}</option>)}</Select> : null}
                    {workItemBatchForm.action === 'cycle' ? <Select aria-label="目标周期" value={workItemBatchForm.value} disabled={workItemBatchSubmitting} onChange={(event) => setWorkItemBatchForm((current) => ({ ...current, value: event.target.value }))}><option value="">取消周期关联</option>{workItemPage.cycles.map((cycle) => <option key={cycle.id} value={String(cycle.id)}>{cycle.name}{cycle.is_closed ? ' · 已关闭' : ''}</option>)}</Select> : null}
                    <Button disabled={workItemSelection.size === 0 || workItemBatchSubmitting || (workItemBatchForm.action === 'assignee' && !workItemBatchForm.value)} onClick={() => setWorkItemBatchConfirmOpen(true)}>应用</Button>
                    {workItemSelection.size ? <Button variant="secondary" disabled={workItemBatchSubmitting} onClick={() => setWorkItemSelection(new Set())}>清空选择</Button> : null}
                  </div> : null}
                  {workItemBatchError ? <Feedback tone="danger" title="部分工作项未更新">{workItemBatchError}</Feedback> : null}
                  <div className="yc-table-wrap work-table-wrap"><table className="yc-table work-item-table" aria-label={route.title}><thead><tr>{workItemPage.can_manage_work_items ? <th className="work-table-select"><span className="visually-hidden">选择</span></th> : null}<th>编号</th><th className="work-table-title">标题</th><th>项目</th><th>处理人</th><th>优先级</th><th>状态</th><th className="work-table-actions">操作</th></tr></thead><tbody>{workItemPage.items.map((item) => { const detailPath = buildWorkItemDetailPath({ owner: workItemOwner, itemKey: item.key }); return <tr key={item.key} className="work-item-row">{workItemPage.can_manage_work_items ? <td className="work-table-select"><input className="work-item-selection-checkbox" type="checkbox" aria-label={`选择 ${item.key}`} checked={workItemSelection.has(item.key)} onChange={(event) => toggleWorkItemSelection(item.key, event.target.checked)} /></td> : null}<td><div className="work-table-key"><Badge>{workItemTypeLabel(item.item_type)}</Badge><code>{item.key}</code></div></td><td className="work-table-title"><a className="work-table-title-link" href={detailPath} onClick={(event) => handleNavigate(event, detailPath, `已打开 ${item.key}。`)}>{item.title}</a></td><td className="work-table-muted">{item.project_name || item.project_key}</td><td>{item.assignee || '未分配'}</td><td><Badge tone="warning">{item.priority || '未设置'}</Badge></td><td><Badge>{workItemStatusLabel(item.status)}</Badge></td><td className="work-table-actions"><a className="yc-button yc-button-secondary yc-button-sm" href={detailPath} onClick={(event) => handleNavigate(event, detailPath, `已打开 ${item.key}。`)}>打开详情</a></td></tr>; })}</tbody></table></div>

                  <Pagination ariaLabel="工作项分页" page={workItemPage.pagination.page} totalPages={workItemPage.pagination.total_pages} totalItems={workItemPage.pagination.total_items} rangeLabel={`当前显示 ${workItemRangeStart}-${workItemRangeEnd}`} pageSize={workItemPage.pagination.per_page} onPageSizeChange={changeWorkItemPageSize} onPageChange={changeWorkItemPage} />
                </>
              ) : (
                <div className="empty-state work-item-list-empty" role="status">
                  <strong>暂无{workItemTypeLabel(route.itemType)}</strong>
                  <span>当前筛选条件下没有匹配项，可以调整筛选条件或重置后查看。</span>
                </div>
              )}
              <Modal open={workItemBatchConfirmOpen} title="确认批量更新" onClose={() => { if (!workItemBatchSubmitting) setWorkItemBatchConfirmOpen(false); }} footer={<><Button variant="secondary" disabled={workItemBatchSubmitting} onClick={() => setWorkItemBatchConfirmOpen(false)}>取消</Button><Button loading={workItemBatchSubmitting} onClick={() => void confirmWorkItemBatchUpdate()}>确认更新</Button></>}><p>将对已选择的 {workItemSelection.size} 个工作项执行批量更新。每个工作项独立提交，未成功的项目会保留选择。</p></Modal>
              <Modal wide open={workItemCreateOpen} title={workItemCreateLabel(route.itemType)} onClose={closeWorkItemCreate} footer={<><Button variant="secondary" disabled={workItemCreateSubmitting || workItemCreatePasteUploading} onClick={closeWorkItemCreate}>{workItemCreateCheckpoint ? '转到详情' : '取消'}</Button><Button loading={workItemCreateSubmitting} disabled={workItemCreateSubmitting || workItemCreatePasteUploading} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('work-item-create-form'))?.requestSubmit()}>创建</Button></>}>
                <form id="work-item-create-form" onSubmit={submitWorkItemCreate}>
                  <div className="field-grid">
                    <Field id="work-item-create-priority" label="优先级" required><select id="work-item-create-priority" value={workItemCreateForm.priority} disabled={workItemCreateSubmitting} onChange={(event) => setWorkItemCreateForm((current) => ({ ...current, priority: event.target.value }))}><option value="P0">紧急</option><option value="P1">高</option><option value="P2">中</option><option value="P3">低</option></select></Field>
                    <Field id="work-item-create-cycle" label="周期"><select id="work-item-create-cycle" value={workItemCreateForm.cycleId} disabled={workItemCreateSubmitting || workItemCreatePasteUploading} onChange={(event) => setWorkItemCreateForm((current) => ({ ...current, cycleId: event.target.value }))}><option value="">不关联</option>{(workItemPage?.cycles || []).map((cycle) => <option key={cycle.id} value={String(cycle.id)}>{cycle.name}{cycle.is_closed ? ' · 已关闭' : ''}</option>)}</select></Field>
                    <Field id="work-item-create-due-date" label="截止日期"><TextInput id="work-item-create-due-date" type="date" value={workItemCreateForm.dueDate} disabled={workItemCreateSubmitting} onChange={(event) => setWorkItemCreateForm((current) => ({ ...current, dueDate: event.target.value }))} /></Field>
                    <Field id="work-item-create-assignee" label="处理人"><select id="work-item-create-assignee" value={workItemCreateForm.assigneeUsername} disabled={workItemCreateSubmitting} onChange={(event) => setWorkItemCreateForm((current) => ({ ...current, assigneeUsername: event.target.value }))}><option value="">默认指派给我</option>{(workItemPage?.assignees || []).map((assignee) => <option key={assignee.username} value={assignee.username}>{assignee.display_name} · {assignee.username}</option>)}</select></Field>
                    {route.itemType === 'task' ? <Field id="work-item-create-parent" label="父级需求"><select id="work-item-create-parent" value={workItemCreateForm.parentItemKey} disabled={workItemCreateSubmitting} onChange={(event) => setWorkItemCreateForm((current) => ({ ...current, parentItemKey: event.target.value }))}><option value="">不关联</option>{(workItemPage?.parent_options || []).map((item) => <option key={item.key} value={item.key}>{item.key} · {item.title}</option>)}</select></Field> : null}
                    <Field id="work-item-create-title" label="标题" required><TextInput id="work-item-create-title" maxLength={160} value={workItemCreateForm.title} disabled={workItemCreateSubmitting} autoFocus onChange={(event) => { setWorkItemCreateForm((current) => ({ ...current, title: event.target.value })); if (event.target.value.trim() && workItemCreatePendingPastes.length) setWorkItemCreatePasteHint(`正在自动上传 ${workItemCreatePendingPastes.length} 个图片…`); }} /></Field>
                  </div>
                  <div className="yc-field"><label htmlFor="work-item-create-description">说明内容</label><RichTextEditor id="work-item-create-description" value={workItemCreateForm.description} disabled={workItemCreateSubmitting || workItemCreatePasteUploading} label="说明内容" onPasteFile={pasteWorkItemCreateFile} onChange={(description) => setWorkItemCreateForm((current) => ({ ...current, description }))} /></div>
                  {workItemCreateAttachmentStatus ? <p className="work-item-attachment-status" role="status">{workItemCreateAttachmentStatus}</p> : null}
                  {workItemCreatePasteHint ? <p className="work-item-attachment-status" role="status">{workItemCreatePasteHint}</p> : null}
                  {workItemCreateError ? <Feedback tone="danger" title="创建失败">{workItemCreateError}</Feedback> : null}
                </form>
              </Modal>
              </section>
            </section>
          ) : route.id === 'work-item-detail' ? (
            <section className="work-item-detail-center" aria-label="工作项详情">
              {activeWorkItemDetail ? (
                <>
                  <WorkItemDetail
                    item={activeWorkItemDetail}
                    primaryPost={activeWorkItemDetailView?.primary_post || null}
                    primaryPostAttachments={(workItemCommentAttachments[String(activeWorkItemDetailView?.primary_post?.id || '')] || []).filter((attachment) => attachment.status !== 'deleted').map((attachment) => ({ id: attachment.id, filename: attachment.filename, contentType: attachment.content_type, url: `/api/v1/work-items/${encodeURIComponent(activeWorkItemDetail.key)}/comments/${activeWorkItemDetailView?.primary_post?.id}/attachments/${attachment.id}/preview/content` }))}
                    resolveAttachmentSource={activeWorkItemDetailView?.primary_post ? resolveWorkItemPrimaryPostInlineAttachmentSource : undefined}
                    onAttachmentActivate={activeWorkItemDetailView?.primary_post ? activateWorkItemPrimaryPostInlineAttachment : undefined}
                    editForm={workItemEditForm}
                    handoffForm={workItemHandoffForm}
                    statusOptions={activeWorkItemDetailView?.status_options || []}
                    assigneeOptions={activeWorkItemDetailView?.assignees || []}
                    parentOptions={activeWorkItemDetailView?.parent_options || []}
                    priorityOptions={WORK_ITEM_PRIORITY_OPTIONS}
                    statusLabel={workItemStatusLabel}
                    mutationBusy={workItemMutationSubmitting || workItemCommentAttachmentDeletingId !== null}
                    editSubmitting={workItemEditSubmitting}
                    handoffSubmitting={workItemHandoffSubmitting}
                    error={workItemActionError}
                    canManageWorkItems={Boolean(activeWorkItemDetailView?.permissions.can_manage_work_items)}
                    canEditPrimaryPost={Boolean(activeWorkItemDetailView?.permissions.can_edit_primary_post)}
                    canCloseWorkItem={Boolean(activeWorkItemDetailView?.permissions.can_close_work_item)}
                    canReopenWorkItem={Boolean(activeWorkItemDetailView?.permissions.can_reopen_work_item)}
                    canRestoreWorkItem={Boolean(activeWorkItemDetailView?.permissions.can_restore_work_item)}
                    cycleLabel={activeWorkItemDetailView?.cycle?.label || ''}
                    navigation={activeWorkItemDetailView?.navigation || { previous: null, next: null }}
                    flowHistory={activeWorkItemDetailView?.flow_history || { items: [], pagination: { page: 1, per_page: 10, total_items: 0, total_pages: 1 } }}
                    buildDetailHref={(itemKey) => buildWorkItemDetailPath({ owner: workItemOwner, itemKey })}
                    onOpenDetail={(event, itemKey) => handleNavigate(event, buildWorkItemDetailPath({ owner: workItemOwner, itemKey }), `已打开 ${itemKey}。`)}
                    parentHref={buildWorkItemDetailPath({ owner: workItemOwner, itemKey: activeWorkItemDetail.parent_item_key })}
                    onOpenParent={(event) => handleNavigate(event, buildWorkItemDetailPath({ owner: workItemOwner, itemKey: activeWorkItemDetail.parent_item_key }), `已打开 ${activeWorkItemDetail.parent_item_key}。`)}
                    onChangeEdit={changeWorkItemEditField}
                    onChangeDescription={(description) => setWorkItemEditForm((current) => ({ ...current, description }))}
                    onChangeHandoff={changeWorkItemHandoffField}
                    onSubmitEdit={submitWorkItemEdit}
                    onSubmitHandoff={submitWorkItemHandoff}
                    onRequestLifecycleAction={setWorkItemLifecycleAction}
                    onRequestDeletePrimaryPostAttachment={requestWorkItemPrimaryPostAttachmentDelete}
                    onPasteFile={(file) => pasteWorkItemPrimaryPostFile(file)}
                    backHref={detailBackPath}
                    onOpenBack={(event) => handleNavigate(event, detailBackPath, '已返回工作项列表。')}
                  >

                  <AttachmentPreview open={Boolean(projectAttachmentPreview?.open)} title={projectAttachmentPreview?.attachment?.filename || '附件预览'} source={projectAttachmentPreview?.source || ''} kind={projectAttachmentPreview?.kind || null} fileType={projectAttachmentPreview?.fileType || null} loading={projectAttachmentPreview?.loading} error={projectAttachmentPreview?.error} position={projectAttachmentPreview?.position} total={projectAttachmentPreview?.total} hasPrevious={Boolean(projectAttachmentPreview?.previousId)} hasNext={Boolean(projectAttachmentPreview?.nextId)} onPrevious={() => { if (projectAttachmentPreview?.previousId) { if (projectAttachmentPreview.commentId) navigateWorkItemCommentAttachmentPreview(projectAttachmentPreview.previousId); else navigateWorkItemAttachmentPreview(projectAttachmentPreview.previousId); } }} onNext={() => { if (projectAttachmentPreview?.nextId) { if (projectAttachmentPreview.commentId) navigateWorkItemCommentAttachmentPreview(projectAttachmentPreview.nextId); else navigateWorkItemAttachmentPreview(projectAttachmentPreview.nextId); } }} onDownload={() => { if (projectAttachmentPreview?.attachment) { if (projectAttachmentPreview.commentId) void downloadWorkItemCommentAttachment(projectAttachmentPreview.commentId, projectAttachmentPreview.attachment); else void downloadWorkItemAttachment(projectAttachmentPreview.attachment); } }} onClose={() => void releaseProjectAttachmentPreview()} />

                  <WorkItemComments
                    comments={workItemComments}
                    attachmentsByComment={workItemCommentAttachments}
                    attachmentStatusByComment={workItemCommentAttachmentStatus}
                    uploadingCommentId={workItemCommentAttachmentUploadingId}
                    downloadingKey={workItemCommentAttachmentDownloadingKey}
                    revealableKey={workItemCommentAttachmentReveal?.key || ''}
                    mutationBusy={workItemMutationSubmitting}
                    canWriteComments={Boolean(activeWorkItemDetailView?.permissions.can_manage_work_items && !activeWorkItemDetail.deleted_at)}
                    currentUsername={user?.username || ''}
                    mentionOptions={(activeWorkItemDetailView?.assignees || []).map((option) => ({ username: option.value, displayName: option.label }))}
                    editingCommentId={workItemEditingCommentId}
                    replyingToCommentId={workItemReplyingToCommentId}
                    newCommentBody={workItemNewCommentBody}
                    newCommentDraftId={workItemNewCommentDraftId}
                    newCommentAttachments={workItemNewCommentDraftId === null ? [] : (workItemCommentAttachments[String(workItemNewCommentDraftId)] || [])}
                    newCommentAttachmentStatus={workItemNewCommentDraftId === null ? '' : (workItemCommentAttachmentStatus[String(workItemNewCommentDraftId)] || '')}
                    newCommentAttachmentUploading={workItemNewCommentAttachmentUploading}
                    editCommentBody={workItemEditCommentBody}
                    replyCommentBody={workItemReplyCommentBody}
                    commentSubmitting={workItemCommentSubmitting}
                    editSubmitting={workItemEditCommentSubmitting}
                    deletingAttachmentId={workItemCommentAttachmentDeletingId}
                    replySubmitting={workItemReplySubmitting}
                    error={workItemCommentActionError}
                    typingUsers={workItemTyping.itemKey === activeWorkItemDetail.key ? workItemTyping.users : []}
                    onTypingStart={startWorkItemTyping}
                    onTypingActivity={recordWorkItemTypingActivity}
                    onTypingStop={stopWorkItemTyping}
                    onSubmitNew={submitWorkItemComment}
                    onChangeNew={changeWorkItemNewComment}
                    onUploadNewAttachment={() => void uploadSelectedWorkItemCommentAttachment(null)}
                    onCancelNewDraft={() => void cancelWorkItemCommentDraft()}
                    onSubmitEdit={submitWorkItemCommentEdit}
                    onChangeEdit={changeWorkItemEditComment}
                    onSubmitReply={submitWorkItemCommentReply}
                    onChangeReply={setWorkItemReplyCommentBody}
                    onCancelEdit={cancelWorkItemCommentEdit}
                    onCancelReply={cancelWorkItemCommentReply}
                    onStartEdit={startWorkItemCommentEdit}
                    onStartReply={startWorkItemCommentReply}
                    onUploadAttachment={(commentId) => void uploadSelectedWorkItemCommentAttachment(commentId)}
                    onPreviewAttachment={(commentId, attachment) => void openWorkItemCommentAttachmentPreview(commentId, attachment)}
                    onDownloadAttachment={(commentId, attachment) => void downloadWorkItemCommentAttachment(commentId, attachment)}
                    onRevealAttachment={(commentId, attachment) => void revealWorkItemCommentAttachment(commentId, attachment)}
                    onRequestDeleteAttachment={requestWorkItemCommentAttachmentDelete}
                    onPasteFile={pasteWorkItemCommentFile}
                    resolveAttachmentSource={resolveWorkItemCommentInlineAttachmentSource}
                    onAttachmentActivate={activateWorkItemCommentInlineAttachment}
                  />
                  <WorkItemAttachments
                    attachments={workItemAttachments}
                    status={workItemAttachmentStatus}
                    warning={workItemAttachmentLoadWarning}
                    error={workItemAttachmentActionError}
                    uploading={workItemAttachmentUploading}
                    mutationBusy={workItemMutationSubmitting}
                    canUpload={Boolean(activeWorkItemDetailView?.permissions.can_manage_work_items && !activeWorkItemDetail.deleted_at)}
                    downloadingId={workItemAttachmentDownloadingId}
                    revealableId={workItemAttachmentReveal?.attachmentId || null}
                    onChooseUpload={() => void uploadSelectedWorkItemAttachment()}
                    onRetryUpload={(attachment) => void uploadSelectedWorkItemAttachment(attachment)}
                    onPreview={(attachment) => void openWorkItemAttachmentPreview(attachment)}
                    onDownload={(attachment) => void downloadWorkItemAttachment(attachment)}
                    onReveal={(attachment) => void revealWorkItemAttachment(attachment)}
                  />
                  </WorkItemDetail>
                  <Modal open={Boolean(workItemCommentAttachmentDeleteTarget)} title={workItemCommentAttachmentDeleteTarget?.editorContext === 'primary-post' ? '删除主内容附件' : '删除评论附件'} onClose={() => { if (workItemCommentAttachmentDeletingId === null) setWorkItemCommentAttachmentDeleteTarget(null); }} footer={<><Button variant="secondary" disabled={workItemCommentAttachmentDeletingId !== null} onClick={() => setWorkItemCommentAttachmentDeleteTarget(null)}>取消</Button><Button variant="danger" loading={workItemCommentAttachmentDeletingId !== null} onClick={() => void confirmWorkItemCommentAttachmentDelete()}>确认删除</Button></>}>
                    <p>确认删除“{workItemCommentAttachmentDeleteTarget?.attachment.filename}”？对象存储中的文件和{workItemCommentAttachmentDeleteTarget?.editorContext === 'primary-post' ? '主内容' : '评论正文'}中的附件引用都会立即删除。</p>
                  </Modal>
                </>
              ) : (
                <p className="shell-empty">工作项详情暂不可用。</p>
              )}
            </section>
          ) : route.id === 'home' ? (
            <section className="workspace-grid">
              <div className="workspace-main">
                <section className="metric-grid" aria-label="项目统计">
                  {[
                    ['进行中项目', dashboard?.metrics.active_projects || 0, 'info', 'projects'],
                    ['指派需求', dashboard?.metrics.requirements || 0, 'info', 'doc'],
                    ['指派任务', dashboard?.metrics.tasks || 0, 'warning', 'tasks'],
                    ['指派 Bug', dashboard?.metrics.bugs || 0, 'danger', 'bug'],
                  ].map(([label, value, tone, icon]) => <article className={`metric metric-${tone}`} key={label}><div className="metric-head"><span className="metric-label">{label}</span><span className={`metric-ornament metric-icon-${icon}`} aria-hidden="true" /></div><strong>{value}</strong></article>)}
                </section>
                <section className="panel">
                  <div className="panel-head">
                    <div><h1 ref={headingRef} tabIndex={-1}>项目推进</h1><p>按最近更新排序，展示你有权限查看的全部项目待处理 / 进行中 / 待确认情况。</p></div>
                    {dashboard?.can_manage_projects ? <div className="toolbar-actions"><Button onClick={() => setProjectCreateOpen(true)}>新建项目</Button></div> : null}
                  </div>
                  <div className="table-wrap">
                    <table className="compact-table"><thead><tr><th>编号</th><th>项目</th><th>项目负责人</th><th>工作项</th><th>我的待处理</th><th>状态</th><th>更新</th><th className="table-actions">操作</th></tr></thead>
                      <tbody>{dashboard?.projects.length ? dashboard.projects.map((project) => {
                        const detailPath = buildProjectDetailPath({ owner: route.owner, projectKey: project.key });
                        const analysisPath = buildProjectPersonalAnalysisPath({ owner: route.owner, projectKey: project.key });
                        const requirementPath = buildWorkItemListPath({ owner: route.owner, itemType: 'requirement', projectKey: project.key, status: 'pending', assigneeUsername: user?.username || '' });
                        const taskPath = buildWorkItemListPath({ owner: route.owner, itemType: 'task', projectKey: project.key, status: 'pending', assigneeUsername: user?.username || '' });
                        const bugPath = buildWorkItemListPath({ owner: route.owner, itemType: 'bug', projectKey: project.key, status: 'pending', assigneeUsername: user?.username || '' });
                        const status = dashboardProjectStatus(project.status);
                        return <tr key={project.key}><td><code>{project.key}</code></td><td><a href={detailPath} onClick={(event) => handleNavigate(event, detailPath, `已打开项目 ${project.name}。`)}>{project.name}</a></td><td>{project.owner}</td><td><div className="work-count-cell"><strong>{project.active_work_item_count}</strong><span>待处理 / 进行中 / 待确认 · 共 {project.work_item_count}</span></div></td><td><div className="pending-shortcuts" aria-label={`${project.name}个人待处理`}><a href={requirementPath} onClick={(event) => handleNavigate(event, requirementPath, '已打开个人待处理需求。')}>需求 <strong>{project.pending_requirements}</strong></a><a href={taskPath} onClick={(event) => handleNavigate(event, taskPath, '已打开个人待处理任务。')}>任务 <strong>{project.pending_tasks}</strong></a><a href={bugPath} onClick={(event) => handleNavigate(event, bugPath, '已打开个人待处理 Bug。')}>Bug <strong>{project.pending_bugs}</strong></a></div></td><td><span className={`dashboard-status dashboard-status-${status.tone}`}>{status.label}</span></td><td>{dashboardTimestamp(project.updated_at)}</td><td className="table-actions"><a className="yc-button yc-button-secondary yc-button-sm" href={analysisPath} onClick={(event) => handleNavigate(event, analysisPath, `已打开 ${project.name} 个人分析。`)}>查看</a></td></tr>;
                      }) : <tr><td colSpan={8} className="dashboard-table-empty">暂无可查看的项目。</td></tr>}</tbody>
                    </table>
                  </div>
                </section>
              </div>
              <aside className="workspace-side" aria-label="最近动态">
                <section className="panel inspector-panel"><div className="panel-head compact"><div><h2>待我处理讨论</h2><p>优先查看被提及和被回复的最新讨论，当前 {dashboard?.pending_discussion_count || 0} 条。</p></div><a className="yc-button yc-button-secondary yc-button-sm" href={messagesPath} onClick={(event) => handleNavigate(event, messagesPath, '已打开消息中心。')}>消息中心</a></div>
                  {dashboard?.pending_discussions.length ? <div className="discussion-reminder-list" aria-label="待我处理讨论">{dashboard.pending_discussions.map((item) => <button className="discussion-reminder-row" type="button" key={item.id} disabled={messageOpeningId !== null} onClick={() => void handleOpenNotification(item)}><span className="discussion-reminder-kind">{notificationKindLabel(item.kind)}</span><strong>{item.title}</strong><span>{item.body}</span><small>{item.actor} · {formatTimestamp(item.created_at)}</small></button>)}</div> : <div className="empty-state message-empty"><strong>暂无待处理讨论</strong><span>新的提及和回复会显示在这里。</span></div>}
                </section>
                <section className="panel inspector-panel"><div className="panel-head compact"><h2>最近动态</h2></div><ol className="activity-list">{dashboard?.activities.length ? dashboard.activities.map((activity) => <li key={activity.id}><span className="activity-dot" aria-hidden="true" /><strong>{activity.summary}</strong><span>{activity.project_key} · {activity.actor} · {dashboardTimestamp(activity.created_at)}</span></li>) : <li><strong>暂无最近动态</strong><span>项目活动会显示在这里。</span></li>}</ol></section>
              </aside>
            </section>
          ) : (
            <section className="shell-card shell-panel-wide"><h1 ref={headingRef} tabIndex={-1}>{route.title}</h1><p className="shell-muted">{routeDescription(route)}</p></section>
          )}
          <Modal open={Boolean(workItemLifecycleAction)} title={workItemLifecycleAction === 'close' ? '关闭工作项' : workItemLifecycleAction === 'reopen' ? '重新打开工作项' : '恢复工作项'} onClose={() => { if (!workItemLifecycleSubmitting) setWorkItemLifecycleAction(null); }} footer={<><Button variant="secondary" disabled={workItemLifecycleSubmitting} onClick={() => setWorkItemLifecycleAction(null)}>取消</Button><Button variant={workItemLifecycleAction === 'close' ? 'danger' : 'primary'} loading={workItemLifecycleSubmitting} onClick={() => void confirmWorkItemLifecycleAction()}>确认</Button></>}><p>确认{workItemLifecycleAction === 'close' ? '关闭' : workItemLifecycleAction === 'reopen' ? '重新打开' : '恢复'}“{activeWorkItemDetail?.key} · {activeWorkItemDetail?.title}”？</p></Modal>
          <Modal wide open={projectResourceModalOpen} title={projectResourceForm.id ? '编辑项目资料' : '新建项目资料'} onClose={closeProjectResourceForm} footer={<><Button variant="secondary" disabled={projectResourceSubmitting || projectResourcePasteUploading} onClick={closeProjectResourceForm}>{projectResourceCreateCheckpoint ? '转到资料详情' : '取消'}</Button><Button loading={projectResourceSubmitting} disabled={projectResourceSubmitting || projectResourcePasteUploading} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('project-resource-form'))?.requestSubmit()}>保存</Button></>}>
            <form id="project-resource-form" onSubmit={submitProjectResource}>
              <Field id="project-resource-title" label="资料标题" required><TextInput value={projectResourceForm.title} maxLength={120} onChange={(event) => setProjectResourceForm((current) => ({ ...current, title: event.target.value }))} /></Field>
              <Field id="project-resource-category" label="分类" required><select value={projectResourceForm.category} onChange={(event) => setProjectResourceForm((current) => ({ ...current, category: event.target.value }))}><option value="integration">集成</option><option value="customer">客户</option><option value="meeting">会议</option><option value="implementation">实施</option><option value="other">其他</option></select></Field>
              <Field id="project-resource-tags" label="标签"><TextInput value={projectResourceForm.tagsText} placeholder="多个标签使用逗号分隔" onChange={(event) => setProjectResourceForm((current) => ({ ...current, tagsText: event.target.value }))} /></Field>
              <Field id="project-resource-related-item" label="关联工作项 Key"><TextInput value={projectResourceForm.relatedWorkItemKey} maxLength={64} onChange={(event) => setProjectResourceForm((current) => ({ ...current, relatedWorkItemKey: event.target.value }))} /></Field>
              <Field id="project-resource-related-cycle" label="关联周期 ID"><TextInput type="number" min="1" value={projectResourceForm.relatedCycleId} onChange={(event) => setProjectResourceForm((current) => ({ ...current, relatedCycleId: event.target.value }))} /></Field>
              <div className="yc-field"><label htmlFor="project-resource-body">资料正文<span aria-hidden="true"> *</span></label><RichTextEditor id="project-resource-body" value={projectResourceForm.body} disabled={projectResourceSubmitting} required attachments={projectResourceForm.id ? projectResourceRichAttachmentOptions() : []} onPasteFile={pasteProjectResourceFile} onChange={(body) => setProjectResourceForm((current) => ({ ...current, body, bodyFormat: 'html' }))} /></div>
              {!projectResourceForm.id ? <div className="yc-field"><div className="shell-panel-header"><label>资料附件</label><Button type="button" variant="secondary" disabled={projectResourceSubmitting || projectResourcePasteUploading || Boolean(projectResourceCreateCheckpoint)} onClick={() => void chooseProjectResourceCreateAttachment()}>选择附件</Button></div>{projectResourceCreateAttachments.length ? <ul className="project-resource-create-attachments">{projectResourceCreateAttachments.map((entry, index) => <li key={entry.key}><div><strong>{entry.filename}</strong><span className="shell-muted">{formatByteSize(entry.byteSize)} · {entry.stage}</span></div><label><input type="checkbox" checked={entry.inline} disabled={projectResourceSubmitting || projectResourcePasteUploading || Boolean(entry.uploadedAttachment)} onChange={(event) => setProjectResourceCreateAttachments((entries) => entries.map((item, itemIndex) => itemIndex === index ? { ...item, inline: event.target.checked } : item))} /> 插入正文</label>{!entry.file && !entry.uploadedAttachment ? <Button type="button" variant="secondary" disabled={projectResourceSubmitting || projectResourcePasteUploading} onClick={() => void chooseProjectResourceCreateAttachment(index)}>重新选择</Button> : null}{!projectResourceCreateCheckpoint || entry.error ? <Button type="button" variant="danger" disabled={projectResourceSubmitting || projectResourcePasteUploading} onClick={() => setProjectResourceCreateAttachments((entries) => entries.filter((_, itemIndex) => itemIndex !== index))}>移除</Button> : null}</li>)}</ul> : <p className="shell-muted">尚未选择附件。</p>}</div> : null}
              {projectResourceForm.id ? <Field id="project-resource-password-action" label="密码处理方式" required><select value={projectResourceForm.accessPasswordAction} onChange={(event) => setProjectResourceForm((current) => ({ ...current, accessPasswordAction: event.target.value, accessPassword: '' }))}><option value="keep">保持不变</option><option value="set">设置密码</option><option value="clear">清除密码</option></select></Field> : null}
              {(!projectResourceForm.id || projectResourceForm.accessPasswordAction === 'set') ? <Field id="project-resource-access-password" label={projectResourceForm.id ? '新访问密码' : '初始访问密码'}><TextInput type="password" autoComplete="new-password" minLength={projectResourceForm.accessPassword ? 4 : undefined} maxLength={128} value={projectResourceForm.accessPassword} onChange={(event) => setProjectResourceForm((current) => ({ ...current, accessPassword: event.target.value }))} /></Field> : null}
            </form>
          </Modal>
          <Modal open={Boolean(projectResourceArchiveTarget)} title="归档项目资料" onClose={() => { if (!projectResourceSubmitting) setProjectResourceArchiveTarget(null); }} footer={<><Button variant="secondary" disabled={projectResourceSubmitting} onClick={() => setProjectResourceArchiveTarget(null)}>取消</Button><Button variant="danger" loading={projectResourceSubmitting} onClick={() => void confirmProjectResourceArchive()}>确认归档</Button></>}><p>确认归档资料“{projectResourceArchiveTarget?.title}”？归档后不能继续编辑，但资料记录会保留。</p></Modal>
          <Modal open={Boolean(projectResourceAttachmentDeleteTarget)} title="删除资料附件" onClose={() => { if (!projectResourceAttachmentDeleting) setProjectResourceAttachmentDeleteTarget(null); }} footer={<><Button variant="secondary" disabled={projectResourceAttachmentDeleting} onClick={() => setProjectResourceAttachmentDeleteTarget(null)}>取消</Button><Button variant="danger" loading={projectResourceAttachmentDeleting} onClick={() => void confirmProjectResourceAttachmentDelete()}>确认删除</Button></>}><p>确认删除附件“{projectResourceAttachmentDeleteTarget?.filename}”？对象存储中的文件也会一并删除。</p></Modal>
          <Modal open={projectResourcePasswordResetOpen} title="重置资料访问密码" onClose={() => { if (!projectResourceSubmitting) { setProjectResourcePasswordResetOpen(false); setProjectResourcePasswordResetForm({ accessPasswordAction: 'set', accessPassword: '' }); } }} footer={<><Button variant="secondary" disabled={projectResourceSubmitting} onClick={() => setProjectResourcePasswordResetOpen(false)}>取消</Button><Button variant="danger" loading={projectResourceSubmitting} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('project-resource-password-reset-form'))?.requestSubmit()}>确认重置</Button></>}>
            <form id="project-resource-password-reset-form" onSubmit={submitProjectResourcePasswordReset}>
              <p>此操作仅限超级管理员。设置或清除密码会立即改变其他宿主后续访问此资料的方式，并记录安全审计。</p>
              <Field id="project-resource-password-reset-action" label="重置方式" required><select value={projectResourcePasswordResetForm.accessPasswordAction} onChange={(event) => setProjectResourcePasswordResetForm({ accessPasswordAction: event.target.value, accessPassword: '' })}><option value="set">设置新密码</option><option value="clear">清除密码保护</option></select></Field>
              {projectResourcePasswordResetForm.accessPasswordAction === 'set' ? <Field id="project-resource-password-reset-value" label="新访问密码" required><TextInput type="password" autoComplete="new-password" minLength={4} maxLength={128} value={projectResourcePasswordResetForm.accessPassword} onChange={(event) => setProjectResourcePasswordResetForm((current) => ({ ...current, accessPassword: event.target.value }))} /></Field> : null}
            </form>
          </Modal>
        </>
      )}
        </>
      )}
      </div>
      </main>
      <div ref={scrollbarTrackRef} className={`app-scrollbar${scrollbar.visible ? ' is-visible' : ''}`} aria-hidden="true" onPointerDown={handleScrollbarTrackPointerDown}>
        <div
          className="app-scrollbar-thumb"
          style={{ height: `${scrollbar.height}px`, transform: `translateY(${scrollbar.top}px)` }}
          onPointerDown={handleScrollbarPointerDown}
          onPointerMove={handleScrollbarPointerMove}
          onPointerUp={handleScrollbarPointerUp}
          onPointerCancel={handleScrollbarPointerUp}
        />
      </div>
    </div>
  );
}
