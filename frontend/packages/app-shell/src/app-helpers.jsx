// @ts-check
/* global DOMParser */
// 应用壳层的纯函数与常量（从 app.jsx 拆出，不含组件状态）。
/** @typedef {import('./app.jsx').ApiError} ApiError */
/** @typedef {import('./app.jsx').AppApiService} AppApiService */
/** @typedef {import('./app.jsx').AppAttachment} AppAttachment */
/** @typedef {import('./app.jsx').AppCurrentProject} AppCurrentProject */
/** @typedef {import('./app.jsx').AppFileService} AppFileService */
/** @typedef {import('./app.jsx').AppNotification} AppNotification */
/** @typedef {import('./app.jsx').AppNotificationFeed} AppNotificationFeed */
/** @typedef {import('./app.jsx').AppNotificationTarget} AppNotificationTarget */
/** @typedef {import('./app.jsx').AppPreviewKind} AppPreviewKind */
/** @typedef {import('./app.jsx').AppProject} AppProject */
/** @typedef {import('./app.jsx').AppProjectBadge} AppProjectBadge */
/** @typedef {import('./app.jsx').AppProjectCycle} AppProjectCycle */
/** @typedef {import('./app.jsx').AppProjectDetail} AppProjectDetail */
/** @typedef {import('./app.jsx').AppProjectMember} AppProjectMember */
/** @typedef {import('./app.jsx').AppProjectMemberCandidate} AppProjectMemberCandidate */
/** @typedef {import('./app.jsx').AppProjectPage} AppProjectPage */
/** @typedef {import('./app.jsx').AppProjectPersonalAnalysis} AppProjectPersonalAnalysis */
/** @typedef {import('./app.jsx').AppProjectResource} AppProjectResource */
/** @typedef {import('./app.jsx').AppProjectResourceLinkedWorkItemPost} AppProjectResourceLinkedWorkItemPost */
/** @typedef {import('./app.jsx').AppRichTextAttachmentOption} AppRichTextAttachmentOption */
/** @typedef {import('./app.jsx').AppRouterService} AppRouterService */
/** @typedef {import('./app.jsx').AppTimeAllocation} AppTimeAllocation */
/** @typedef {import('./app.jsx').AppTopbarStatus} AppTopbarStatus */
/** @typedef {import('./app.jsx').AppUser} AppUser */
/** @typedef {import('./app.jsx').AppWorkItem} AppWorkItem */
/** @typedef {import('./app.jsx').AppWorkItemComment} AppWorkItemComment */
/** @typedef {import('./app.jsx').AppWorkItemDetail} AppWorkItemDetail */
/** @typedef {import('./app.jsx').AppWorkItemPage} AppWorkItemPage */
/** @typedef {import('./app.jsx').RichTextPasteUploadOptions} RichTextPasteUploadOptions */
/** @typedef {import('./app.jsx').WorkItemAttachmentBundle} WorkItemAttachmentBundle */

import {
  formatBusinessTimestamp,
  plainTextToRichHtml,
} from '@yuance/frontend-ui';

export function formatTimestamp(value) {
  return formatBusinessTimestamp(value, { compact: true });
}

export function formatChangeTimestamp(value) {
  return formatBusinessTimestamp(value);
}

export function timeAllocationActionLabel(action) {
  switch (action) {
    case 'time_allocation.created':
      return '新增';
    case 'time_allocation.deleted':
      return '删除';
    case 'time_allocation.restored':
      return '回退';
    case 'time_allocation.updated':
    default:
      return '更新';
  }
}

export function timeAllocationActionTone(action) {
  switch (action) {
    case 'time_allocation.created':
      return 'success';
    case 'time_allocation.deleted':
      return 'danger';
    case 'time_allocation.restored':
      return 'warning';
    default:
      return 'info';
  }
}

export function timeAllocationFieldLabel(field) {
  switch (field) {
    case 'username':
      return '成员';
    case 'start_date':
      return '开始日期';
    case 'end_date':
      return '结束日期';
    case 'daily_hours':
      return '每天投入';
    case 'phase_task_name':
      return '阶段任务名称';
    case 'note':
      return '备注';
    default:
      return field;
  }
}

export function timeAllocationChangeValue(value) {
  if (value === null || value === undefined || value === '') {
    return '无';
  }
  return String(value);
}

export function formatAnalysisAverage(value) {
  return value.toFixed(2);
}

/**
 * @param {AppAttachment[]} attachments
 * @param {AppAttachment} attachment
 */
export function upsertAttachment(attachments, attachment) {
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
export function workItemCommentAttachmentOption(itemKey, commentId, attachment) {
  return {
    id: attachment.id,
    filename: attachment.filename,
    contentType: attachment.content_type,
    url: `/web/work-items/${encodeURIComponent(itemKey)}/comments/${commentId}/attachments/${attachment.id}/download`,
  };
}

/** @param {string} body @param {string} title */
export function resourceBodyHasTitleHeading(body, title) {
  const normalize = (value) => String(value || '').replace(/\s+/gu, ' ').trim();
  const normalizedTitle = normalize(title);
  if (!body || !normalizedTitle || typeof DOMParser === 'undefined') return false;
  const parsed = new DOMParser().parseFromString(body, 'text/html');
  const firstHeading = parsed.querySelector('h1, h2, h3, h4, h5, h6');
  return normalize(firstHeading?.textContent) === normalizedTitle;
}

/** @param {string} projectKey @param {number} resourceId @param {AppAttachment} attachment @returns {AppRichTextAttachmentOption} */
export function projectResourceAttachmentOption(projectKey, resourceId, attachment) {
  return {
    id: attachment.id,
    filename: attachment.filename,
    contentType: attachment.content_type,
    url: `/web/projects/${projectKey}/resources/${resourceId}/attachments/${attachment.id}/download`,
  };
}

/** @param {'all' | 'unread' | 'pending' | 'read'} filter */
export function filterLabel(filter) {
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

export function projectStatusLabel(status) {
  switch (status) {
    case 'not_started':
      return '待启动';
    case 'in_progress':
      return '进行中';
    case 'acceptance':
      return '验收中';
    case 'completed':
      return '已完成';
    case 'on_hold':
      return '已暂停';
    case 'cancelled':
      return '已取消';
    case 'archived':
      return '已归档';
    default:
      return '全部状态';
  }
}

export const PROJECT_RESOURCE_CATEGORY_OPTIONS = [
  { value: 'integration', label: '集成' },
  { value: 'customer', label: '客户' },
  { value: 'meeting', label: '会议' },
  { value: 'implementation', label: '实施' },
  { value: 'other', label: '其他' },
];

/** @param {string} category */
export function projectResourceCategoryLabel(category) {
  return PROJECT_RESOURCE_CATEGORY_OPTIONS.find((option) => option.value === category)?.label || category || '未分类';
}

export function dashboardProjectStatus(status) {
  const labels = { not_started: '待启动', in_progress: '进行中', acceptance: '验收中', completed: '已完成', on_hold: '已暂停', cancelled: '已取消', archived: '已归档' };
  const tones = { not_started: 'info', in_progress: 'ok', acceptance: 'warning', completed: 'ok', on_hold: 'warning', cancelled: 'danger', archived: 'neutral' };
  return { label: labels[status] || status, tone: tones[status] || 'neutral' };
}

export function dashboardTimestamp(value) {
  return formatBusinessTimestamp(value);
}

/**
 * 系统账号与角色的状态中文化。
 *
 * @param {string} status
 */
export function systemAccountStatusLabel(status) {
  if (status === 'active') return '启用';
  if (status === 'locked') return '已锁定';
  if (status === 'disabled') return '已停用';
  if (status === 'inactive') return '未激活';
  return status;
}

/**
 * 全局搜索结果类型的中文标签。
 *
 * @param {string} kind
 */
export function searchResultKindLabel(kind) {
  if (kind === 'project') return '项目';
  if (kind === 'requirement') return '需求';
  if (kind === 'task') return '任务';
  if (kind === 'bug') return 'Bug';
  if (kind === 'resource') return '资料';
  return kind;
}

/**
 * 资料库筛选条件：整理成一句可读的摘要。
 *
 * @param {{ q: string, category: string, status: string, tag: string }} filters
 */
export function projectResourceFilterSummary(filters) {
  const parts = [];
  if (filters.q) parts.push(`关键词：${filters.q}`);
  if (filters.category) parts.push(`分类：${projectResourceCategoryLabel(filters.category)}`);
  if (filters.status) parts.push(`状态：${filters.status === 'archived' ? '已归档' : '生效中'}`);
  if (filters.tag) parts.push(`标签：${filters.tag}`);
  return parts.length ? parts.join(' · ') : '未设置筛选条件';
}

/**
 * 工作项列表：把当前筛选条件整理成一句可读的摘要。
 *
 * @param {{ q?: string, status?: string, priority?: string, assignee_username?: string, cycle_id?: string } | null | undefined} filters
 * @param {{ q?: string, status?: string, priority?: string, assigneeUsername?: string, cycleId?: number | null } | null | undefined} route
 */
export function workItemFilterSummary(filters, route) {
  const status = filters?.status || route?.status || '';
  const parts = [];
  const keyword = filters?.q || route?.q || '';
  if (keyword) parts.push(`关键词：${keyword}`);
  if (status) parts.push(`状态：${status === 'pending' ? '待处理 / 进行中 / 待确认' : workItemStatusLabel(status)}`);
  const priority = filters?.priority || route?.priority || '';
  if (priority) parts.push(`优先级：${priority.toUpperCase()}`);
  if (filters?.assignee_username) parts.push(`处理人：${filters.assignee_username}`);
  if (filters?.cycle_id) parts.push(`周期：${filters.cycle_id}`);
  return parts.length ? parts.join(' · ') : '未设置筛选条件';
}

/**
 * 工作台指标：我的待处理数量（只统计未完成状态）。
 *
 * @param {{ requirements?: number, tasks?: number, bugs?: number } | null | undefined} metrics
 */
export function dashboardPendingAssignedTotal(metrics) {
  if (!metrics) return 0;
  return (metrics.requirements || 0) + (metrics.tasks || 0) + (metrics.bugs || 0);
}

/**
 * 工作台指标：已完成项目数量。
 *
 * @param {Array<{ status?: string }> | null | undefined} projects
 */
export function dashboardCompletedProjectCount(projects) {
  return (projects || []).filter((project) => project.status === 'completed' || project.status === 'archived').length;
}

/**
 * 项目状态色映射到状态胶囊的语义色。
 *
 * @param {string} tone
 */
export function dashboardProjectStatusTone(tone) {
  switch (tone) {
    case 'ok':
      return 'success';
    case 'info':
      return 'info';
    case 'warning':
      return 'warning';
    case 'danger':
      return 'danger';
    default:
      return 'neutral';
  }
}

/**
 * 工作项状态色映射到状态胶囊的语义色。
 *
 * @param {string} status
 */
export function workItemStatusPillTone(status) {
  const tone = workItemStatusTone(status);
  switch (tone) {
    case 'sand':
      return 'warning';
    case 'violet':
      return 'brand';
    default:
      return tone;
  }
}

export function projectMemberRoleLabel(role) {
  return { owner: '项目负责人', maintainer: '项目管理员', member: '项目成员', viewer: '只读成员' }[role] || role;
}

export function projectCycleStatusLabel(cycle) { return cycle.is_closed ? '已关闭' : '进行中'; }

export function shanghaiToday(today = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(today);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function projectCyclePace(cycle, today = new Date()) {
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

export function projectCycleMemberLoad(cycle, members, today = new Date()) {
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

export function workItemTypeLabel(itemType) {
  switch (itemType) {
    case 'requirement':
      return '需求';
    case 'bug':
      return '缺陷';
    default:
      return '任务';
  }
}

export function linkedWorkItemTypeLabel(itemType) {
  return itemType === 'bug' ? 'Bug' : workItemTypeLabel(itemType);
}

export function buildProjectResourceLibraryRows(resources, linkedPosts) {
  return [
    ...resources.map((resource) => ({ ...resource, row_type: 'resource' })),
    ...linkedPosts.map((post) => ({
      ...post,
      id: `linked:${post.key}`,
      row_type: 'linked-work-item',
      category: 'work-item',
      status: 'active',
      is_protected: false,
      tags: [],
      related_work_item: null,
      related_cycle: null,
      created_by: post.author,
      updated_by: post.author,
      created_at: post.linked_at,
      updated_at: post.updated_at,
    })),
  ];
}

export function workItemCreateLabel(itemType) {
  return itemType === 'bug' ? '新建 Bug' : `新建${workItemTypeLabel(itemType)}`;
}

export function workItemStatusLabel(status) {
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

/** @param {string} status */
export function workItemStatusTone(status) {
  switch (status) {
    case 'open':
      return 'sand';
    case 'in_progress':
      return 'info';
    case 'pending_confirmation':
      return 'warning';
    case 'done':
    case 'verified':
      return 'success';
    case 'resolved':
      return 'violet';
    case 'closed':
      return 'neutral';
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** @param {string} action */
export function workItemBatchActionLabel(action) {
  return { priority: '修改优先级', status: '修改状态', assignee: '修改处理人', cycle: '修改周期' }[action] || action;
}

/** @param {string} action @param {string} value @param {Array<{ username: string, display_name: string }>} assignees @param {Array<{ id: number, name: string }>} cycles */
export function workItemBatchTargetLabel(action, value, assignees = [], cycles = []) {
  switch (action) {
    case 'priority':
      return value;
    case 'status':
      return workItemStatusLabel(value);
    case 'assignee':
      return assignees.find((assignee) => assignee.username === value)?.display_name || value;
    case 'cycle':
      return cycles.find((cycle) => String(cycle.id) === String(value))?.name || (value ? value : '取消周期关联');
    default:
      return value || '';
  }
}

/** @param {string} action @param {string} value @param {number} count @param {Array<{ username: string, display_name: string }>} assignees @param {Array<{ id: number, name: string }>} cycles */
export function workItemBatchChangeSummary(action, value, count, assignees = [], cycles = []) {
  const target = workItemBatchTargetLabel(action, value, assignees, cycles);
  const prefix = `将已选择的 ${count} 个工作项`;
  if (action === 'cycle' && !value) return `${prefix}取消周期关联`;
  return `${prefix}${workItemBatchActionLabel(action).replace('修改', '修改为')}“${target}”`;
}

export const WORK_ITEM_PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3'];

/** @param {import('react').FormEvent<HTMLFormElement>} event */
export function workItemFormSubmitter(event) {
  return /** @type {HTMLButtonElement | null | undefined} */ (
    /** @type {Event & { submitter?: HTMLButtonElement | null }} */ (event.nativeEvent).submitter
  );
}

/** @param {AppWorkItemDetail} item @param {AppWorkItemComment | null} [primaryPost] */
export function workItemEditFormFromDetail(item, primaryPost = null) {
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
export function workItemHandoffFormFromDetail(item) {
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
export async function loadWorkItemAttachmentBundle(api, itemKey, comments, attachmentsPromise = api.getWorkItemAttachments(itemKey)) {
  const publishedComments = comments.filter((comment) => !comment.is_draft);
  // 评论附件一次批量读取，避免按评论逐条请求（N+1）。
  const [attachmentsResult, commentAttachmentsResult] = await Promise.allSettled([
    attachmentsPromise,
    publishedComments.length ? api.getWorkItemCommentAttachmentsBatch(itemKey) : Promise.resolve({}),
  ]);
  let loadFailed = false;
  const attachments = attachmentsResult.status === 'fulfilled' ? attachmentsResult.value : [];
  if (attachmentsResult.status === 'rejected') {
    loadFailed = true;
  }
  /** @type {Record<string, AppAttachment[]>} */
  const commentAttachments = {};
  if (commentAttachmentsResult.status === 'fulfilled') {
    for (const comment of publishedComments) {
      const key = String(comment.id);
      commentAttachments[key] = commentAttachmentsResult.value[key] || [];
    }
  } else {
    loadFailed = true;
  }
  return { attachments, commentAttachments, loadFailed };
}

export function isWorkItemListRouteId(routeId) {
  return routeId === 'requirements' || routeId === 'tasks' || routeId === 'bugs';
}

/** @param {ReturnType<typeof import('@yuance/frontend-app-core').parseAppRoute>} route */
export function workItemOwnerForRoute(route) {
  return /** @type {'app' | 'web'} */ (
    isWorkItemListRouteId(route.id) || route.id === 'work-item-detail'
      ? route.owner
      : 'app'
  );
}

/** @param {ReturnType<typeof import('@yuance/frontend-app-core').parseAppRoute>} route */
export function routeDescription(route) {
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
      return '项目资料和成员管理使用同一页面、表单和确认流程。';
    case 'project-cycle-detail':
      return '周期指标、状态看板和工作项入口由两个宿主共用同一派生视图。';
    case 'project-resource-detail':
      return '资料正文、关联信息和受保护内容解锁由两个宿主共用同一读取流程。';
    case 'project-resource-library':
      return '项目资料库按当前项目独立展示、筛选和维护，正文与附件由两个宿主共用同一列表流程。';
    case 'project-personal-analysis':
      return '仅统计当前用户在该项目中的实际处理与协作记录，所有口径由服务端统一聚合。';
    case 'time-management':
      return '跨项目排期表按成员聚合时间投入，拖拽创建、移动、缩放色块并高亮冲突。';
    case 'requirements':
    case 'tasks':
    case 'bugs':
      return '工作项列表已在浏览器壳中验证筛选、分页和详情跳转，旧版 SSR 页面仍可作为兼容回退。';
    case 'work-item-detail':
      return '工作项详情已在浏览器壳中接入只读信息、评论浏览、核心字段编辑和推进并指派。';
    case 'system-dashboard':
      return '系统入口严格按当前主体的服务端权限返回，共用同一管理导航事实。';
    case 'system-users':
      return '用户、角色候选、项目关系和分页由服务端原子读取，两个宿主不拼接管理事实。';
    case 'system-roles':
      return '角色分页、选中角色和权限集合由服务端原子读取，共用同一角色工作台。';
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
      return '系统 Token 的创建、scope 和生命周期统一管理，明文只在创建成功后展示一次。';
    case 'unsupported':
      return '这个 URL 还没有迁移到新应用壳，当前保留回旧版 SSR 页面的安全退路。';
    default:
      return '当前入口只依赖 REST / SSE 契约，不再读取 Askama HTML 或消息跳转页面作为业务协议。';
  }
}

/** @param {ReturnType<typeof import('@yuance/frontend-app-core').parseAppRoute>} route */
export function routeEyebrow(route) {
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
    case 'project-resource-library':
    case 'project-personal-analysis':
      return 'Projects';
    case 'time-management':
      return 'Time Management';
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
      return 'System';
    default:
      return 'Web App';
  }
}

/** @param {ReturnType<typeof import('@yuance/frontend-app-core').parseAppRoute>} route */
export function emptyMessageTitle(route) {
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

export function notificationKindLabel(kind) {
  switch (kind) {
    case 'comment_replied':
      return '回复';
    case 'comment_mentioned':
      return '提及';
    default:
      return '指派';
  }
}

export function normalizeDatabaseStatsSnapshot(value) {
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

export function auditActionLabel(action) {
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

export function normalizeSystemApiDocs(payload) {
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
