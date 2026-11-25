// @ts-check
/* global FormData, URL, clearInterval, clearTimeout, setInterval, setTimeout */

import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import {
  createNotificationActionCoordinator,
  createNotificationEventCoordinator,
  createAppUpdateController,
  createWorkItemEventCoordinator,
  createWorkItemTypingController,
  buildHomePath,
  buildMessagesPath,
  buildProfilePath,
  buildProjectDetailPath,
  buildProjectResourceLibraryPath,
  buildProjectResourceDetailPath,
  buildProjectPersonalAnalysisPath,
  buildProjectsPath,
  buildSearchPath,
  buildSystemRolesPath,
  buildSystemPath,
  buildTimeManagementPath,
  buildWorkItemDetailPath,
  buildWorkItemListPath,
  createWorkItemComment as createWorkItemCommentUseCase,
  downloadProjectResourceAttachment as downloadProjectResourceAttachmentUseCase,
  downloadWorkItemAttachment as downloadWorkItemAttachmentUseCase,
  downloadWorkItemCommentAttachment as downloadWorkItemCommentAttachmentUseCase,
  handoffWorkItem as handoffWorkItemUseCase,
  notificationTargetPath,
  parseAppRoute,
  updateWorkItemComment as updateWorkItemCommentUseCase,
  uploadWorkItemAttachment,
  uploadWorkItemCommentAttachment,
  uploadWorkItemDraftAttachment,
  uploadProjectResourceAttachment,
} from '@yuance/frontend-app-core';
import { workItemDraftAttachmentWebUrl } from '@yuance/frontend-api-client';
import {
  AppSidebar,
  LazyAttachmentPreview as BaseAttachmentPreview,
  Badge,
  Button,
  DEFER_RICH_TEXT_PASTE,
  EmptyState,
  ErrorToast,
  Feedback,
  Field,
  FilterBar,
  FilterField,
  formatNavigationBadge,
  GlobalNavigation,
  Icon,
  Metric,
  Modal,
  Pagination,
  Panel,
  PriorityBadge,
  LazyRichTextEditor as RichTextEditor,
  preloadRichTextEditor,
  Select,
  StatusPill,
  TextInput,
  useDirtyWhileOpen,
  attachmentIsUploaded,
  isPreviewableDocumentFile,
  plainTextToRichHtml,
  richTextAttachmentHtml,
  richTextAttachmentIds,
  richTextHasContent,
  useOverlayScrollbar,
  useOverlayScrollbars,
} from '@yuance/frontend-ui';
import { errorMessage, globalApiErrorMessage } from './errors.js';
import { createApiErrorWrappingProxy } from './api-proxy.js';
import { AppShellSkeleton } from './app-skeleton.jsx';
import { lazyPage } from './pages/lazy-page.jsx';

const loadSystemPages = () => import('./pages/system-pages.jsx');
const SystemPermissionsPage = lazyPage(loadSystemPages, 'SystemPermissionsPage');
const SystemDatabaseStatsPage = lazyPage(loadSystemPages, 'SystemDatabaseStatsPage');
const SystemAuditPage = lazyPage(loadSystemPages, 'SystemAuditPage');
const SystemApiDocsPage = lazyPage(loadSystemPages, 'SystemApiDocsPage');
const SystemOpenApiPage = lazyPage(loadSystemPages, 'SystemOpenApiPage');
const SystemStoragePage = lazyPage(loadSystemPages, 'SystemStoragePage');
const SystemRolesPage = lazyPage(loadSystemPages, 'SystemRolesPage');
const SystemUsersPage = lazyPage(loadSystemPages, 'SystemUsersPage');
const SystemDashboardPage = lazyPage(loadSystemPages, 'SystemDashboardPage');
const loadAccountPages = () => import('./pages/account-pages.jsx');
const MessagesPage = lazyPage(loadAccountPages, 'MessagesPage');
const SearchPage = lazyPage(loadAccountPages, 'SearchPage');
const ProfilePage = lazyPage(loadAccountPages, 'ProfilePage');
const loadProjectPages = () => import('./pages/project-pages.jsx');
const TimeManagementPage = lazyPage(loadProjectPages, 'TimeManagementPage');
const ProjectResourceLibraryPage = lazyPage(loadProjectPages, 'ProjectResourceLibraryPage');
const ProjectsPage = lazyPage(loadProjectPages, 'ProjectsPage');
const ProjectDetailPage = lazyPage(loadProjectPages, 'ProjectDetailPage');
const ProjectPersonalAnalysisPage = lazyPage(loadProjectPages, 'ProjectPersonalAnalysisPage');
const ProjectResourceDetailPage = lazyPage(loadProjectPages, 'ProjectResourceDetailPage');
const ProjectCycleDetailPage = lazyPage(loadProjectPages, 'ProjectCycleDetailPage');
const loadWorkPages = () => import('./pages/work-pages.jsx');
const WorkItemDetailPage = lazyPage(loadWorkPages, 'WorkItemDetailPage');
const HomePage = lazyPage(loadWorkPages, 'HomePage');

/**
 * 路由加载数据时并行预加载对应的页面模块，数据与页面代码都就绪后再渲染，避免出现加载占位。
 * @param {string} routeId
 */
function preloadRoutePage(routeId) {
  if (routeId.startsWith('system-')) return SystemDashboardPage.preload();
  if (routeId === 'messages' || routeId === 'search' || routeId === 'profile') return MessagesPage.preload();
  if (routeId === 'time-management' || routeId === 'projects' || routeId.startsWith('project-')) return ProjectsPage.preload();
  if (routeId === 'work-item-detail' || routeId === 'home') return HomePage.preload();
  return Promise.resolve();
}
import {
  buildProjectResourceLibraryRows,
  filterLabel,
  formatTimestamp,
  isWorkItemListRouteId,
  loadWorkItemAttachmentBundle,
  normalizeDatabaseStatsSnapshot,
  normalizeSystemApiDocs,
  projectCycleMemberLoad,
  projectCyclePace,
  projectResourceAttachmentOption,
  resourceBodyHasTitleHeading,
  routeDescription,
  routeEyebrow,
  upsertAttachment,
  workItemBatchChangeSummary,
  workItemCommentAttachmentOption,
  workItemCreateLabel,
  workItemEditFormFromDetail,
  workItemFilterSummary,
  workItemFormSubmitter,
  workItemHandoffFormFromDetail,
  workItemOwnerForRoute,
  workItemStatusLabel,
  workItemStatusPillTone,
  workItemTypeLabel,
} from './app-helpers.jsx';

/** @typedef {import('@yuance/frontend-api-client').ApiError} ApiError */
/** @typedef {Awaited<ReturnType<AppApiService['getProjectAttachmentPreview']>>['preview']['kind']} AppPreviewKind */

/** @typedef {ReturnType<typeof import('@yuance/frontend-api-client').createApiClient> & { restorePendingReturnToHash(): void }} AppApiService */
/** @typedef {{ id: number, filename: string, contentType: string, url: string }} AppRichTextAttachmentOption */
/** @typedef {{ inline?: boolean, onProgress?: (stage: 'registering' | 'signing' | 'uploading' | 'confirming') => void, onError?: (message: string) => void, onDeferred?: (message: string) => void, isCurrent?: () => boolean }} RichTextPasteUploadOptions */
/** @typedef {Pick<import('@yuance/frontend-platform-contract').PlatformCapabilities, 'files' | 'downloads' | 'transfers'> & { selectPastedFile?: (file: import('@yuance/frontend-platform-contract').PastedFile) => Promise<import('@yuance/frontend-platform-contract').SelectedFile | null> }} AppFileService */
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
 * @property {string} owner_username
 * @property {number} work_item_count
 * @property {number} active_work_item_count
 * @property {number} pending_requirements
 * @property {number} pending_tasks
 * @property {number} pending_bugs
 * @property {string} updated_at
 */

/**
 * @typedef AppProjectResource
 * @property {number} id
 * @property {string} project_key
 * @property {string} title
 * @property {string} category
 * @property {string} body
 * @property {string} source_body
 * @property {string} body_format
 * @property {string} body_html
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
 * @typedef AppProjectResourceLinkedWorkItemPost
 * @property {string} key
 * @property {string} item_type
 * @property {string} title
 * @property {string} summary
 * @property {string} author
 * @property {string} updated_at
 * @property {string} linked_at
 * @property {string} url
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
 * @typedef AppTimeAllocation
 * @property {number} id
 * @property {string} project_key
 * @property {string} project_name
 * @property {string} username
 * @property {string} display_name
 * @property {string} start_date
 * @property {string} end_date
 * @property {number} daily_hours
 * @property {string} phase_task_name
 * @property {string} note
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
 * @typedef AppProjectMemberCandidate
 * @property {string} display_name
 * @property {string} username
 * @property {string} roles
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
 * @property {string} due_date
 * @property {string} updated_at
 */

/**
 * @typedef AppWorkItemPage
 * @property {AppWorkItem[]} items
 * @property {{ page: number, per_page: number, total_items: number, total_pages: number }} pagination
 * @property {{ total_items: number, active_items: number, high_priority_items: number, completed_items: number }} summary
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
 * @property {string} reporter_username
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

/**
 * 为应用壳层中不属于共享 UI 组件的滚动区域接入统一浮层滚动条。
 * @param {{ as?: string, axis?: 'vertical' | 'horizontal' | 'both', enabled?: boolean, refreshKey?: unknown, label: string, className?: string, children?: React.ReactNode, [key: string]: unknown }} props
 */
function OverlayScrollTarget({ as = 'div', axis = 'both', enabled = true, refreshKey = null, label, className = '', children, ...props }) {
  const scrollbar = useOverlayScrollbar({ axis, enabled, label, refreshKey });
  return <>{createElement(as, { ...props, ref: scrollbar.ref, className: ['yc-overlay-scroll-target', className].filter(Boolean).join(' ') }, children)}{scrollbar.scrollbar}</>;
}

/**
 * @param {{ services: {
 *   api: AppApiService,
 *   events: { supportsTopbarPolling?: boolean, supportsWorkItemTyping?: boolean, openTopbarEvents(callbacks: { onEvent: (event: object) => void }): () => void, openWorkItemEvents?(itemKey: string, callbacks: { onEvent: (event: object) => void }): () => void },
 *   files: AppFileService,
 *   documentViewer?: (host: HTMLDivElement, input: { source: string, filename: string, previewType: string }) => Promise<{ destroy: () => unknown }>,
 *   previewSourceResolver?: (source: string, input: { filename: string, kind: string | null, strategy: string | null, contentType: string }) => Promise<string>,
 *   router: AppRouterService,
 *   runtime: {
 *     scheduleFrame(callback: () => void): void,
 *     observeResize(elements: HTMLElement[], callback: () => void): () => void,
 *     getElementById(id: string): HTMLElement | null,
 *     readFormValue(form: HTMLFormElement, name: string): string,
 *     createSessionId?(): string,
 *     readTheme?(): 'light' | 'dark',
 *     writeTheme?(theme: 'light' | 'dark'): void,
 *     readAppReleaseVersion?(): string,
 *     openAppUpdateManifest?(): Promise<unknown>,
 *     reloadPage?(): void,
 *     subscribeAppUpdateChecks?(check: () => void): () => void,
 *     readDatabaseStatsCache?(username: string): Promise<any | null>,
 *     writeDatabaseStatsCache?(username: string, snapshot: any): Promise<void>,
 *   },
 * } }} props
 * @returns {React.ReactElement}
 */
export function SharedApp({ services }) {
  const { api: baseApi, events, files, documentViewer, previewSourceResolver, router, runtime } = services;
  const AttachmentPreview = useMemo(
    () => {
      const WrappedAttachmentPreview = (props) => createElement(BaseAttachmentPreview, { ...props, documentViewer, resolveSource: previewSourceResolver });
      WrappedAttachmentPreview.displayName = 'AttachmentPreviewWithDocumentViewer';
      return WrappedAttachmentPreview;
    },
    [documentViewer, previewSourceResolver],
  );
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
  const dashboardTableRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const workTableRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const appUpdateControllerRef = useRef(/** @type {ReturnType<typeof createAppUpdateController> | null} */ (null));
  const requestRef = useRef(0);
  const profileActionRef = useRef(0);
  const accountSecurityActionRef = useRef(false);
  const projectSwitchRef = useRef(false);
  const projectMutationRef = useRef(false);
  const projectResourceAttachmentActionRef = useRef(0);
  const projectResourceAttachmentMutationRef = useRef(false);
  const projectAttachmentPreviewRequestRef = useRef(0);
  const projectResourceActionRef = useRef(0);
  const projectResourceMutationRef = useRef(0);
  const projectPersonalAnalysisSelectionRef = useRef(/** @type {{ projectKey: string, promise: Promise<unknown> } | null} */ (null));
  const workItemActionRef = useRef(0);
  const workItemMutationRef = useRef(false);
  const workItemMutationActionRef = useRef(0);
  const workItemResourceLibraryMutationRef = useRef(false);
  const workItemResourceLibraryLinkGenerationRef = useRef(0);
  const workItemPrimaryPostRetryRef = useRef(/** @type {{ itemKey: string, fields: string } | null} */ (null));
  const workItemAttachmentActionRef = useRef(0);
  const workItemAttachmentMutationRef = useRef(false);
  const workItemCommentDraftRef = useRef(/** @type {{ itemKey: string, commentId: number } | null} */ (null));
  const workItemTypingControllerRef = useRef(/** @type {ReturnType<typeof createWorkItemTypingController> | null} */ (null));
  const workItemTypingClientIdRef = useRef('');
  const workItemBatchMutationRef = useRef(false);
  const workItemCreateUploadCountRef = useRef(0);
  const workItemCreateDraftIdsRef = useRef(/** @type {Set<number>} */ (new Set()));
  const workItemCreateCloseSaveFailedRef = useRef(false);
  const workItemCreateDescriptionRef = useRef('');
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
  const [projectResources, setProjectResources] = useState(/** @type {readonly AppProjectResource[]} */ ([]));
  const [projectResourceLinkedWorkItemPosts, setProjectResourceLinkedWorkItemPosts] = useState(/** @type {readonly AppProjectResourceLinkedWorkItemPost[]} */ ([]));
  const [projectResourceDetail, setProjectResourceDetail] = useState(/** @type {AppProjectResource | null} */ (null));
  const [projectResourceLocked, setProjectResourceLocked] = useState(false);
  const [projectResourcePassword, setProjectResourcePassword] = useState('');
  const [projectResourceUnlocking, setProjectResourceUnlocking] = useState(false);
  const [projectResourceError, setProjectResourceError] = useState('');
  const [projectResourceLinkedError, setProjectResourceLinkedError] = useState('');
  const [projectResourceFilters, setProjectResourceFilters] = useState({ q: '', category: '', status: '', tag: '' });
  // 已提交（已用于查询）的资料筛选条件；筛选框随输入变化，后台刷新必须沿用已提交的条件。
  const projectResourceAppliedFiltersRef = useRef({ q: '', category: '', status: '', tag: '' });
  // 当前已解锁的受保护资料（含访问凭证）；后台刷新不得把它重新锁上。
  const projectResourceUnlockedRef = useRef(/** @type {{ key: string, resource: AppProjectResource } | null} */ (null));
  const [projectResourceSubmitting, setProjectResourceSubmitting] = useState(false);
  const [projectResourceModalOpen, setProjectResourceModalOpen] = useState(false);
  const [projectResourceForm, setProjectResourceForm] = useState({ id: 0, title: '', category: 'other', body: '', bodyFormat: 'html', accessPasswordAction: 'keep', accessPassword: '', tagsText: '' });
  const [projectResourceInitialInlineAttachmentIds, setProjectResourceInitialInlineAttachmentIds] = useState(/** @type {number[]} */ ([]));
  const [projectResourceCreateCheckpoint, setProjectResourceCreateCheckpoint] = useState(/** @type {AppProjectResource | null} */ (null));
  const [projectResourcePasteUploading, setProjectResourcePasteUploading] = useState(false);
  const [projectResourceArchiveTarget, setProjectResourceArchiveTarget] = useState(/** @type {AppProjectResource | null} */ (null));
  const [projectResourceStatus, setProjectResourceStatus] = useState('');
  const [projectResourcePasswordResetOpen, setProjectResourcePasswordResetOpen] = useState(false);
  const [projectResourcePasswordResetForm, setProjectResourcePasswordResetForm] = useState({ accessPasswordAction: 'set', accessPassword: '' });
  const [projectResourceAttachments, setProjectResourceAttachments] = useState(/** @type {AppAttachment[]} */ ([]));
  const [projectResourceFileMenu, setProjectResourceFileMenu] = useState(/** @type {{ attachmentId: number, title: string, href: string, fileExt: string, fileKind: string, x: number, y: number } | null} */ (null));
  const [projectResourceAttachmentUploading, setProjectResourceAttachmentUploading] = useState(false);
  const [projectResourceDownloadingId, setProjectResourceDownloadingId] = useState(/** @type {number | null} */ (null));
  const [projectAttachmentPreview, setProjectAttachmentPreview] = useState(/** @type {{ open: boolean, loading: boolean, error: string, attachment: AppAttachment | null, source: string, kind: AppPreviewKind, strategy: string | null, fileType: string | null, position: number, total: number, previousId: number | null, nextId: number | null, commentId?: number } | null} */ (null));
  const [projectCycleDetail, setProjectCycleDetail] = useState(/** @type {AppProjectCycle | null} */ (null));
  const [projectPersonalAnalysis, setProjectPersonalAnalysis] = useState(/** @type {AppProjectPersonalAnalysis | null} */ (null));
  const [timeAllocations, setTimeAllocations] = useState(/** @type {AppTimeAllocation[]} */ ([]));
  const [projectTimeAllocations, setProjectTimeAllocations] = useState(/** @type {AppTimeAllocation[]} */ ([]));
  const [projectTimeAllocationsError, setProjectTimeAllocationsError] = useState('');
  const [timeProjects, setTimeProjects] = useState(/** @type {Array<{ key: string, name: string }>} */ ([]));
  const [timeMembers, setTimeMembers] = useState(/** @type {Array<{ username: string, display_name: string }>} */ ([]));
  const [timeChangesOpen, setTimeChangesOpen] = useState(false);
  const [timeChangesPage, setTimeChangesPage] = useState(/** @type {{ items: any[], pagination: { page: number, per_page: number, total_items: number, total_pages: number } } | null} */ (null));
  const [timeChangesPerPage, setTimeChangesPerPage] = useState(10);
  const [timeChangesLoading, setTimeChangesLoading] = useState(false);
  const [timeChangesError, setTimeChangesError] = useState('');
  const [timeChangeRestoreTarget, setTimeChangeRestoreTarget] = useState(/** @type {{ id: number, summary: string, action: string } | null} */ (null));
  const [timeChangeRestoring, setTimeChangeRestoring] = useState(false);
  const [timeChangeRestoreError, setTimeChangeRestoreError] = useState('');
  const [projectCycleOpen, setProjectCycleOpen] = useState(false);
  const [projectCycleForm, setProjectCycleForm] = useState({ id: 0, name: '', goal: '', description: '', ownerUsername: '', startDate: '', endDate: '' });
  const [projectCycleCloseTarget, setProjectCycleCloseTarget] = useState(/** @type {AppProjectCycle | null} */ (null));
  const [previousPath, setPreviousPath] = useState('');
  const [workItemListReturnPaths, setWorkItemListReturnPaths] = useState(/** @type {Record<string, string>} */ ({}));
  const [projectMutationSubmitting, setProjectMutationSubmitting] = useState(false);
  const [projectMutationError, setProjectMutationError] = useState('');
  const [projectEditOpen, setProjectEditOpen] = useState(false);
  const [projectEditForm, setProjectEditForm] = useState({ name: '', description: '', status: 'not_started', ownerUsername: '', startDate: '', dueDate: '' });
  const [projectMemberOpen, setProjectMemberOpen] = useState(false);
  const [projectMemberCandidates, setProjectMemberCandidates] = useState(/** @type {AppProjectMemberCandidate[]} */ ([]));
  const [projectMemberCandidateSearch, setProjectMemberCandidateSearch] = useState('');
  const [projectMemberCandidateLoading, setProjectMemberCandidateLoading] = useState(false);
  const [projectMemberCandidateError, setProjectMemberCandidateError] = useState('');
  const [projectMemberSelectedUsernames, setProjectMemberSelectedUsernames] = useState(/** @type {string[]} */ ([]));
  const [projectMemberForm, setProjectMemberForm] = useState({ memberRole: 'member' });
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
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', newPasswordConfirm: '' });
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [tokenForm, setTokenForm] = useState({ id: 0, name: '', scopes: ['project:read'], projectScope: 'all', expiresAt: '' });
  const [accountSecuritySubmitting, setAccountSecuritySubmitting] = useState(false);
  const [accountSecurityError, setAccountSecurityError] = useState('');
  const [createdRawToken, setCreatedRawToken] = useState('');
  const [accountConfirmation, setAccountConfirmation] = useState(/** @type {{ kind: 'token', id: string | number, label: string } | null} */ (null));
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
  // 记录存在未保存权限修改的角色编码。实时通知触发的后台刷新不得覆盖这些修改，
  // 否则用户勾选后再保存会提交被重置的权限列表（最坏情况撤销该角色全部权限）。
  const systemRolePermissionEditRef = useRef(/** @type {string | null} */ (null));
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
  const [workItemCreateDiscardOpen, setWorkItemCreateDiscardOpen] = useState(false);
  const [workItemCreateSubmitting, setWorkItemCreateSubmitting] = useState(false);
  const [workItemCreateError, setWorkItemCreateError] = useState('');
  const [workItemCreateForm, setWorkItemCreateForm] = useState({ title: '', description: '', priority: 'P2', assigneeUsername: '', cycleId: '', dueDate: '', parentItemKey: '' });
  const [workItemCreateCheckpoint, setWorkItemCreateCheckpoint] = useState(/** @type {{ item: AppWorkItemDetail, primaryPostId: number | null } | null} */ (null));
  const [workItemCreatePasteUploading, setWorkItemCreatePasteUploading] = useState(false);
  const [workItemSelection, setWorkItemSelection] = useState(/** @type {Set<string>} */ (new Set()));
  const [workItemBatchForm, setWorkItemBatchForm] = useState({ action: 'priority', value: 'P2' });
  const [workItemBatchConfirmOpen, setWorkItemBatchConfirmOpen] = useState(false);
  const [workItemBatchSubmitting, setWorkItemBatchSubmitting] = useState(false);
  const [workItemBatchError, setWorkItemBatchError] = useState('');
  const [workItemDetail, setWorkItemDetail] = useState(/** @type {AppWorkItemDetail | null} */ (null));
  const [workItemDetailView, setWorkItemDetailView] = useState(/** @type {Awaited<ReturnType<AppApiService['getWorkItemDetailView']>> | null} */ (null));
  const [workItemResourceLibraryLink, setWorkItemResourceLibraryLink] = useState(/** @type {Awaited<ReturnType<AppApiService['getWorkItemResourceLibraryLink']>> | null} */ (null));
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
  const [workItemResourceLibrarySubmitting, setWorkItemResourceLibrarySubmitting] = useState(false);
  const [workItemActionError, setWorkItemActionError] = useState('');
  const [workItemLifecycleAction, setWorkItemLifecycleAction] = useState(/** @type {'close' | 'reopen' | 'restore' | null} */ (null));
  const [workItemLifecycleSubmitting, setWorkItemLifecycleSubmitting] = useState(false);
  const [workItemNewCommentBody, setWorkItemNewCommentBody] = useState('');
  const [workItemNewCommentDraftId, setWorkItemNewCommentDraftId] = useState(/** @type {number | null} */ (null));
  const [workItemNewCommentAttachmentUploading, setWorkItemNewCommentAttachmentUploading] = useState(false);
  const [workItemCommentSubmitting, setWorkItemCommentSubmitting] = useState(false);
  const [workItemNewCommentAssignStatus, setWorkItemNewCommentAssignStatus] = useState('');
  const [workItemReplyAssignStatus, setWorkItemReplyAssignStatus] = useState('');
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
  const [workItemCommentAttachmentUploadingId, setWorkItemCommentAttachmentUploadingId] = useState(/** @type {number | null} */ (null));
  const [workItemCommentAttachmentDownloadingKey, setWorkItemCommentAttachmentDownloadingKey] = useState('');
  const [workItemCommentAttachmentStatus, setWorkItemCommentAttachmentStatus] = useState(/** @type {Record<string, string>} */ ({}));
  const [workItemCommentAttachmentDeleteTarget, setWorkItemCommentAttachmentDeleteTarget] = useState(/** @type {{ commentId: number, attachment: AppAttachment, editorContext: 'comment-edit' | 'primary-post' } | null} */ (null));
  const [workItemCommentAttachmentDeletingId, setWorkItemCommentAttachmentDeletingId] = useState(/** @type {number | null} */ (null));
  const [error, setError] = useState(/** @type {ApiError | Error | null} */ (null));
  const [statusMessage, setStatusMessage] = useState('');
  const [theme, setTheme] = useState(() => runtime.readTheme?.() || 'light');
  const [appUpdatePrompt, setAppUpdatePrompt] = useState(/** @type {{ version: string } | null} */ (null));
  const mainScrollbar = useOverlayScrollbar({ axis: 'vertical', targetRef: mainRef, enabled: shellReady, label: '页面', refreshKey: `${shellReady}:${route.id}` });
  const dashboardTableScrollbar = useOverlayScrollbar({ axis: 'horizontal', targetRef: dashboardTableRef, enabled: shellReady && route.id === 'home', label: '项目推进列表', refreshKey: `${shellReady}:${route.id}` });
  const workTableScrollbar = useOverlayScrollbar({ axis: 'horizontal', targetRef: workTableRef, enabled: shellReady && isWorkItemListRouteId(route.id), label: '工作项列表', refreshKey: `${shellReady}:${route.id}` });
  useOverlayScrollbars({ enabled: shellReady, targetRef: mainRef });
  if (!workItemTypingClientIdRef.current && events.supportsWorkItemTyping) workItemTypingClientIdRef.current = runtime.createSessionId?.() || '';

  const currentProject = topbar?.current_project || null;
  topbarRef.current = topbar;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const homePath = buildHomePath(route.owner);
  const messagesPath = buildMessagesPath({ owner: route.owner });
  const profilePath = buildProfilePath(route.owner);
  const timeManagementPath = buildTimeManagementPath(route.owner);
  const systemDatabaseTables = systemDatabaseStats?.snapshot?.tables || [];
  const systemDatabaseTotalRows = systemDatabaseTables.reduce((sum, table) => sum + Number(table.row_count || 0), 0);
  const projectsPath = route.id === 'projects'
    ? buildProjectsPath({ owner: route.owner, status: route.status, page: route.page, perPage: route.perPage })
    : buildProjectsPath({ owner: 'app' });
  const resourceLibraryPath = currentProject
    ? buildProjectResourceLibraryPath({ owner: route.owner, projectKey: currentProject.key })
    : projectsPath;
  const projectVisibleProjects = dashboard?.projects || [];
  const projectMetrics = {
    total: projectVisibleProjects.length,
    active: dashboard?.metrics?.active_projects || 0,
    owned: projectVisibleProjects.filter((project) => Boolean(project.owner_username) && project.owner_username === user?.username).length,
    pending: projectVisibleProjects.reduce((total, project) => total + (project.pending_requirements || 0) + (project.pending_tasks || 0) + (project.pending_bugs || 0), 0),
  };
  const dashboardQueuePath = buildWorkItemListPath({
    owner: route.owner,
    itemType: 'task',
    status: 'pending',
    assigneeUsername: user?.username || '',
    projectKey: currentProject?.key || '',
  });
  const messageRoute = route.id === 'messages' ? route : null;
  const searchRoute = route.id === 'search' ? route : null;
  const projectRoute = route.id === 'projects' ? route : null;
  const projectDetailRoute = route.id === 'project-detail' ? route : null;
  const projectResourceDetailRoute = route.id === 'project-resource-detail' ? route : null;
  const projectResourceTitleIsInBody = useMemo(
    () => Boolean(projectResourceDetail && !projectResourceLocked && resourceBodyHasTitleHeading(
      projectResourceDetail.body_html || projectResourceDetail.body,
      projectResourceDetail.title,
    )),
    [projectResourceDetail, projectResourceLocked],
  );
  const projectResourceRelatedWorkItem = projectResourceDetail?.related_work_item || null;
  const searchResultGroups = useMemo(() => {
    const groups = new Map();
    for (const item of searchPage?.items || []) {
      const kind = item.kind || 'other';
      if (!groups.has(kind)) groups.set(kind, []);
      groups.get(kind).push(item);
    }
    return [...groups.entries()].map(([kind, items]) => ({ kind, items }));
  }, [searchPage?.items]);

  const projectPersonalAnalysisRoute = route.id === 'project-personal-analysis' ? route : null;
  const workItemListRoute = isWorkItemListRouteId(route.id) ? route : null;
  const workItemListProjectKey = workItemListRoute
    ? (workItemPage?.filters?.project_key || workItemListRoute.projectKey || currentProject?.key || '').toUpperCase()
    : '';
  const workItemListProject = workItemListProjectKey
    ? (topbar?.project_options || []).find((project) => project.key === workItemListProjectKey)
      || (currentProject?.key === workItemListProjectKey ? currentProject : { key: workItemListProjectKey, name: workItemListProjectKey })
    : null;
  const workItemSelectionScope = workItemListRoute
    ? [workItemListRoute.itemType, workItemListRoute.projectKey || currentProject?.key || '', workItemListRoute.q, workItemListRoute.status, workItemListRoute.priority, workItemListRoute.assigneeUsername, workItemListRoute.cycleId, workItemListRoute.sort, workItemListRoute.perPage].join('|')
    : '';
  const workItemDetailRoute = route.id === 'work-item-detail' ? route : null;
  const workItemOwner = workItemOwnerForRoute(route);
  const workItemNavQuery = {
    q: workItemListRoute?.q || '',
    status: workItemListRoute?.status || '',
    priority: workItemListRoute?.priority || '',
    assigneeUsername: workItemListRoute?.assigneeUsername || '',
    projectKey: currentProject?.key || '',
    sort: workItemListRoute?.sort || '',
    perPage: workItemListRoute?.perPage || '',
  };
  const requirementsPath = buildWorkItemListPath({ owner: workItemOwner, itemType: 'requirement', ...workItemNavQuery });
  const tasksPath = buildWorkItemListPath({ owner: workItemOwner, itemType: 'task', ...workItemNavQuery });
  const bugsPath = buildWorkItemListPath({ owner: workItemOwner, itemType: 'bug', ...workItemNavQuery });
  const messageFilter = /** @type {'all' | 'unread' | 'pending' | 'read'} */ (messageRoute ? messageRoute.filter : 'all');
  const previewItems = useMemo(() => (homeFeed?.items || []).slice(0, 8), [homeFeed]);
  // 空闲时预取富文本编辑器代码：首次打开新建/编辑弹窗时不必等待下载。
  useEffect(() => {
    const timer = setTimeout(() => { void preloadRichTextEditor(); }, 2000);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const detailRoute = route.id === 'project-resource-detail' ? route : null;
    projectResourceUnlockedRef.current = detailRoute && projectResourceDetail?.is_protected && !projectResourceLocked && projectResourceDetail.access_token
      ? { key: `${detailRoute.projectKey}:${detailRoute.resourceId}`, resource: projectResourceDetail }
      : null;
  }, [route, projectResourceDetail, projectResourceLocked]);
  const loadRouteStateRef = useRef(/** @type {(targetRoute: any, mode: 'load' | 'refresh') => Promise<void>} */ (async () => {}));
  const notificationActions = useMemo(() => createNotificationActionCoordinator({
    markAllRead: () => api.markAllNotificationsRead(),
    markRead: (notificationId) => api.markNotificationRead(notificationId),
    getTarget: (notificationId) => api.getNotificationTarget(notificationId),
    setCurrentProject: (projectKey) => api.updateCurrentProject(projectKey),
    currentProjectKey: () => topbarRef.current?.current_project?.key || '',
    refresh: () => loadRouteStateRef.current(routeRef.current, 'refresh'),
    navigate: (path) => navigate(path, '正在打开消息目标。'),
    targetPath: (target) => notificationTargetPath(target, /** @type {'app' | 'web'} */ (routeRef.current.owner)),
    onState: (state) => {
      setMessageReadAllSubmitting(state.readAllPending);
      setMessageOpeningId(state.openingId);
    },
  }), [api]);
  const activeFeed = route.id === 'messages' ? messageFeed : homeFeed;
  const unreadCount = activeFeed?.unread_count ?? topbar?.notifications_count ?? 0;

  // 一级导航分组，与设计稿的左侧栏一致。
  const sidebarGroups = [
    {
      id: 'overview',
      label: '概览',
      items: [
        { id: 'home', label: '工作台', href: homePath, icon: 'home', active: route.id === 'home' },
      ],
    },
    {
      id: 'projects',
      label: '项目',
      items: [
        { id: 'projects', label: '项目', href: currentProject ? buildProjectDetailPath({ owner: route.owner, projectKey: currentProject.key }) : projectsPath, icon: 'folder', active: ['projects', 'project-detail', 'project-cycle-detail', 'project-resource-detail', 'project-personal-analysis'].includes(route.id) },
        { id: 'resource-library', label: '资料库', href: resourceLibraryPath, icon: 'book', active: route.id === 'project-resource-library' || route.id === 'project-resource-detail' },
      ],
    },
    {
      id: 'delivery',
      label: '交付',
      items: [
        { id: 'requirements', label: '需求', href: requirementsPath, icon: 'inbox', badge: formatNavigationBadge(topbar?.requirements_count || 0), active: route.id === 'requirements' },
        { id: 'tasks', label: '任务', href: tasksPath, icon: 'task', badge: formatNavigationBadge(topbar?.tasks_count || 0), active: route.id === 'tasks' },
        { id: 'bugs', label: 'Bug', href: bugsPath, icon: 'bug', badge: formatNavigationBadge(topbar?.bugs_count || 0), active: route.id === 'bugs' },
      ],
    },
    {
      id: 'collaboration',
      label: '协作',
      items: [
        { id: 'messages', label: '消息中心', href: messagesPath, icon: 'message', badge: formatNavigationBadge(unreadCount), active: route.id === 'messages' },
      ],
    },
    {
      id: 'tools',
      label: '工具',
      items: [
        { id: 'time-management', label: '时间管理', href: timeManagementPath, icon: 'clock', active: route.id === 'time-management' },
      ],
    },
    {
      id: 'system',
      label: '系统',
      items: [
        { id: 'system', label: '系统管理', href: buildSystemPath(route.owner), icon: 'settings', active: route.id.startsWith('system-') },
      ],
    },
  ];
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
  const baseActiveWorkItemDetailView = activeWorkItemDetail && workItemDetailView?.item?.key === activeWorkItemDetail.key
    ? workItemDetailView
    : null;
  const activeWorkItemResourceLibraryLink = activeWorkItemDetail
    && workItemResourceLibraryLink?.item_key === activeWorkItemDetail.key
    ? workItemResourceLibraryLink
    : null;
  const activeWorkItemDetailView = baseActiveWorkItemDetailView;
  const projectScopeKey = projectDetailRoute?.projectKey
    || projectResourceDetailRoute?.projectKey
    || projectPersonalAnalysisRoute?.projectKey
    || (route.id === 'project-resource-library' ? route.projectKey || '' : '')
    || (route.id === 'time-management' ? currentProject?.key || '' : '')
    || '';
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
  // 表单弹窗的放弃保护：打开后内容被修改时，Esc / 右上角关闭先确认。
  const projectCreateDirty = useDirtyWhileOpen(projectCreateOpen, projectCreateForm);
  const projectEditDirty = useDirtyWhileOpen(projectEditOpen, projectEditForm);
  const projectCycleDirty = useDirtyWhileOpen(projectCycleOpen, projectCycleForm);
  const profileDirty = useDirtyWhileOpen(profileModalOpen, profileForm);
  const passwordDirty = useDirtyWhileOpen(passwordModalOpen, passwordForm);
  const tokenDirty = useDirtyWhileOpen(tokenModalOpen, tokenForm);
  const systemUserCreateDirty = useDirtyWhileOpen(systemUserCreateOpen, systemUserCreateForm);
  const systemRoleCreateDirty = useDirtyWhileOpen(systemRoleCreateOpen, systemRoleCreateForm);
  const systemApiTokenDirty = useDirtyWhileOpen(Boolean(systemApiTokenEditor), systemApiTokenForm);
  const systemStorageDirty = useDirtyWhileOpen(systemStorageEditOpen, systemStorageForm);
  const projectResourceDirty = useDirtyWhileOpen(projectResourceModalOpen, projectResourceForm);
  const systemUserAssignableKeySignature = systemUserAssignableProjects.map((project) => project.key).join('\n');
  // 分配部分失败或后台刷新后，已分配（不再可选）的项目不应仍保持勾选，避免重复提交。
  useEffect(() => {
    const assignable = new Set(systemUserAssignableKeySignature ? systemUserAssignableKeySignature.split('\n') : []);
    setSystemUserProjectAssignKeys((current) => {
      const next = current.filter((key) => assignable.has(key));
      return next.length === current.length ? current : next;
    });
  }, [systemUserAssignableKeySignature]);
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
  const canWriteProjectContent = Boolean(user?.is_super_admin || ['owner', 'maintainer', 'member'].includes(currentProjectMember?.member_role || ''));
  const projectAcceptsContentWrites = ['not_started', 'in_progress', 'acceptance'].includes(activeProjectDetail?.status || '');
  const canManageProjectContent = canWriteProjectContent && projectAcceptsContentWrites;
  const normalizedProjectMemberCandidateSearch = projectMemberCandidateSearch.trim().toLocaleLowerCase('zh-CN');
  const visibleProjectMemberCandidates = projectMemberCandidates.filter((candidate) => !normalizedProjectMemberCandidateSearch
    || [candidate.display_name, candidate.username, candidate.roles].some((value) => value.toLocaleLowerCase('zh-CN').includes(normalizedProjectMemberCandidateSearch)));
  const cyclePace = projectCycleDetail ? projectCyclePace(projectCycleDetail) : null;
  const cycleMemberLoad = projectCycleDetail ? projectCycleMemberLoad(projectCycleDetail, projectMembers) : [];
  const cycleFallbackPath = buildProjectDetailPath({ owner: route.owner, projectKey: route.projectKey, tab: 'cycles' });
  const cycleBackPath = previousPath && previousPath !== router.currentPath()
    ? previousPath
    : cycleFallbackPath;
  const resourceFallbackPath = buildProjectResourceLibraryPath({ owner: route.owner, projectKey: projectScopeKey || currentProject?.key || '' });
  const detailBackPath = workItemListReturnPaths[activeWorkItemDetail?.item_type || 'task'] || buildWorkItemListPath({
    owner: workItemOwner,
    itemType: activeWorkItemDetail?.item_type || 'task',
  });
  const workItemWorkbenchPath = workItemOwner === 'app' ? '/web/app' : '/web';
  const workItemProjectPath = activeWorkItemDetail?.project_key
    ? buildProjectDetailPath({ owner: workItemOwner, projectKey: activeWorkItemDetail.project_key })
    : detailBackPath;
  const workItemAttachmentSubmitting = workItemAttachmentUploading || workItemCommentAttachmentUploadingId !== null || workItemNewCommentAttachmentUploading;
  const workItemMutationSubmitting = workItemEditSubmitting
    || workItemHandoffSubmitting
    || workItemResourceLibrarySubmitting
    || workItemLifecycleSubmitting
    || workItemCommentSubmitting
    || workItemEditCommentSubmitting
    || workItemAttachmentSubmitting;

  routeRef.current = route;

  /**
   * @param {ReturnType<typeof import('@yuance/frontend-app-core').parseAppRoute>} targetRoute
   * @param {'load' | 'refresh'} mode
   */
  // 订阅类回调（实时事件、通知协调器）在首次渲染时创建，须经 ref 调用最新的加载函数，避免读到过期状态。
  loadRouteStateRef.current = loadRouteState;

  async function loadRouteState(targetRoute, mode) {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    if (mode === 'load') {
      const draft = workItemCommentDraftRef.current;
      const targetItemKey = targetRoute.id === 'work-item-detail' ? targetRoute.itemKey : '';
      if (draft && draft.itemKey !== targetItemKey) {
        try {
          // 离开页面时的后台清理：失败不打扰用户（不经全局错误提示）。
          await baseApi.cancelWorkItemCommentDraft(draft.itemKey, draft.commentId);
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
      if (targetRoute.id === 'project-detail' || targetRoute.id === 'project-resource-library') {
        projectResourceActionRef.current += 1;
        projectResourceAttachmentActionRef.current += 1;
        projectResourceAttachmentMutationRef.current = false;
        setProjectDetail(null);
        setProjectMembers([]);
        setProjectMutationSubmitting(projectMutationRef.current);
        setProjectMutationError('');
        setProjectEditOpen(false);
        setProjectMemberOpen(false);
        setProjectMemberCandidates([]);
        setProjectMemberCandidateSearch('');
        setProjectMemberCandidateLoading(false);
        setProjectMemberCandidateError('');
        setProjectMemberSelectedUsernames([]);
        setProjectMemberForm({ memberRole: 'member' });
        setProjectMemberTarget(null);
        setProjectMemberRemoveTarget(null);
        setProjectCycles([]);
        setProjectResources([]);
        setProjectResourceLinkedWorkItemPosts([]);
        setProjectResourceFilters({ q: '', category: '', status: '', tag: '' });
        setProjectResourceError('');
        setProjectResourceLinkedError('');
        setProjectResourceModalOpen(false);
        setProjectResourceArchiveTarget(null);
        setProjectResourceStatus('');
        setProjectResourcePasswordResetOpen(false);
        setProjectResourcePasswordResetForm({ accessPasswordAction: 'set', accessPassword: '' });
        setProjectResourceAttachments([]);
        setProjectResourceAttachmentUploading(false);
        setProjectResourceDownloadingId(null);
        setProjectCycleOpen(false);
        setProjectCycleCloseTarget(null);
      }
      if (targetRoute.id === 'time-management') {
        projectResourceActionRef.current += 1;
        setProjectDetail(null);
        setProjectMembers([]);
        setProjectResources([]);
        setProjectResourceLinkedWorkItemPosts([]);
        setProjectResourceFilters({ q: '', category: '', status: '', tag: '' });
        setProjectResourceError('');
        setProjectResourceLinkedError('');
        setProjectResourceStatus('');
        setProjectResourceModalOpen(false);
        setProjectResourceArchiveTarget(null);
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
        workItemResourceLibraryLinkGenerationRef.current += 1;
        workItemAttachmentActionRef.current += 1;
        workItemMutationActionRef.current = 0;
        workItemMutationRef.current = false;
        workItemResourceLibraryMutationRef.current = false;
        workItemAttachmentMutationRef.current = false;
        setWorkItemEditSubmitting(false);
        setWorkItemHandoffSubmitting(false);
        setWorkItemResourceLibrarySubmitting(false);
        setWorkItemDetail(null);
        setWorkItemResourceLibraryLink(null);
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
        setWorkItemCommentAttachmentUploadingId(null);
        setWorkItemCommentAttachmentDownloadingKey('');
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
      const routePagePreload = preloadRoutePage(targetRoute.id);
      const [nextUser, nextTopbar, nextDashboard, nextProfile, nextFeed, nextProjects, nextSearch, nextWorkItems, nextWorkItemBundle, nextSecurity, nextProjectBundle, nextProjectResourceLibraryBundle, nextCycleDetailBundle, nextResourceDetailBundle, nextPersonalAnalysisBundle, nextSystemDashboard, nextSystemPermissions, nextSystemUsersView, nextSystemRolesView, nextSystemStorageView, nextSystemOpenApiView, nextSystemAuditPage, nextSystemApiDocs, nextTimeManagement] = await Promise.all([
        api.getCurrentUser(),
        api.getTopbarStatus(),
        ['home', 'profile', 'projects'].includes(targetRoute.id)
          ? baseApi.getDashboard().catch((caught) => {
            const caughtError = caught instanceof Error ? /** @type {Error & { status?: number }} */ (caught) : null;
            routeLoadWarning = caughtError?.status === 404
              ? new Error('当前服务端尚未提供工作台聚合接口，请先发布配套 API 版本。')
              : (caughtError || new Error('工作台数据加载失败。'));
            return null;
          })
          : Promise.resolve(null),
        targetRoute.id === 'profile' ? api.getOwnProfile() : Promise.resolve(null),
        targetRoute.id === 'projects' || targetRoute.id === 'project-detail' || targetRoute.id === 'project-cycle-detail' || targetRoute.id === 'project-resource-detail' || targetRoute.id === 'project-resource-library' || targetRoute.id === 'project-personal-analysis' || targetRoute.id === 'search' || targetRoute.id === 'profile' || isWorkItemListRouteId(targetRoute.id) || targetRoute.id === 'work-item-detail'
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
            q: targetRoute.q,
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
            // 附件与资料库链接失败时页面内给出提示或降级，不经全局错误提示重复打扰。
            const attachmentsPromise = baseApi.getWorkItemAttachments(itemKey);
            const resourceLibraryLinkPromise = baseApi.getWorkItemResourceLibraryLink(itemKey).catch(() => null);
            void attachmentsPromise.catch(() => {});
            const [detailView, comments, attachmentBundle, resourceLibraryLink] = await Promise.all([
              api.getWorkItemDetailView(itemKey),
              commentsPromise,
              commentsPromise.then((comments) => loadWorkItemAttachmentBundle(baseApi, itemKey, comments, attachmentsPromise)),
              resourceLibraryLinkPromise,
            ]);
            return {
              detailView,
              item: detailView.item,
              comments: comments.filter((comment) => comment.id !== detailView.primary_post?.id),
              attachmentBundle,
              resourceLibraryLink,
            };
          })()
          : Promise.resolve(null),
        targetRoute.id === 'profile'
          ? Promise.all([api.getApiTokens()])
          : Promise.resolve(null),
        targetRoute.id === 'project-detail'
          ? Promise.all([
            api.getProject(targetRoute.projectKey),
            api.getProjectMembers(targetRoute.projectKey),
            api.getProjectCycles(targetRoute.projectKey),
            Promise.resolve([]),
            // 排期加载失败不影响项目详情其它部分，在排期页内提示，不弹全局错误。
            baseApi.getProjectTimeAllocations(targetRoute.projectKey).then(
              (items) => ({ items, error: '' }),
              (caught) => ({ items: null, error: errorMessage(caught instanceof Error ? caught : new Error('时间排期加载失败。')) }),
            ),
          ])
          : Promise.resolve(null),
        targetRoute.id === 'project-resource-library'
          ? (async () => {
            // 先同步记录操作编号与筛选，再发请求：加载期间用户提交的筛选不应被这里重置或覆盖。
            if (mode === 'load') projectResourceAppliedFiltersRef.current = { q: '', category: '', status: '', tag: '' };
            const resourceFilters = mode === 'load' ? {} : projectResourceAppliedFiltersRef.current;
            const resourceActionId = projectResourceActionRef.current;
            const [project, members] = await Promise.all([
              api.getProject(targetRoute.projectKey),
              api.getProjectMembers(targetRoute.projectKey),
            ]);
            // 失败在页面内展示（resourceError / linkedError），不重复弹出全局提示。
            const [resourcesResult, linkedPostsResult] = await Promise.allSettled([
              baseApi.getProjectResources(targetRoute.projectKey, resourceFilters),
              baseApi.getProjectResourceLinkedWorkItemPosts(targetRoute.projectKey, { q: resourceFilters.q || '' }),
            ]);
            return {
              project,
              members,
              resourceActionId,
              resources: resourcesResult.status === 'fulfilled' ? resourcesResult.value : [],
              resourceError: resourcesResult.status === 'rejected'
                ? errorMessage(resourcesResult.reason instanceof Error ? resourcesResult.reason : new Error('资料列表加载失败。'))
                : '',
              linkedWorkItemPosts: linkedPostsResult.status === 'fulfilled' ? linkedPostsResult.value : [],
              linkedError: linkedPostsResult.status === 'rejected'
                ? errorMessage(linkedPostsResult.reason instanceof Error ? linkedPostsResult.reason : new Error('关联发布内容加载失败。'))
                : '',
            };
          })()
          : Promise.resolve(null),
        targetRoute.id === 'project-cycle-detail'
          ? Promise.all([api.getProjectCycle(targetRoute.projectKey, targetRoute.cycleId), api.getProjectMembers(targetRoute.projectKey)])
          : Promise.resolve(null),
        targetRoute.id === 'project-resource-detail'
          ? (async () => {
            const resourceActionId = projectResourceActionRef.current;
            const unlocked = projectResourceUnlockedRef.current;
            const [project, members, resources] = await Promise.all([
              api.getProject(targetRoute.projectKey),
              api.getProjectMembers(targetRoute.projectKey),
              api.getProjectResources(targetRoute.projectKey),
            ]);
            const summary = resources.find((resource) => resource.id === targetRoute.resourceId) || null;
            if (!summary) {
              const resource = await api.getProjectResource(targetRoute.projectKey, targetRoute.resourceId);
              return { project, members, resourceActionId, resource, locked: false, attachments: await api.getProjectResourceAttachments(targetRoute.projectKey, targetRoute.resourceId) };
            }
            const locked = summary.is_protected;
            // 后台刷新时，同一资料已解锁则保持解锁：沿用解锁后的详情，用访问凭证刷新附件。
            // 凭证过期或密码已被重置（403）时回退为锁定，让用户重新输入密码；不弹全局错误提示。
            if (mode === 'refresh' && locked && unlocked && unlocked.key === `${targetRoute.projectKey}:${targetRoute.resourceId}`) {
              try {
                return {
                  project,
                  members,
                  resourceActionId,
                  resource: unlocked.resource,
                  locked: false,
                  attachments: await baseApi.getProjectResourceAttachments(targetRoute.projectKey, targetRoute.resourceId, unlocked.resource.access_token),
                };
              } catch (caught) {
                if (!(caught && typeof caught === 'object' && 'status' in caught && caught.status === 403)) throw caught;
                return { project, members, resourceActionId, resource: summary, locked: true, attachments: [] };
              }
            }
            const resource = locked ? summary : await api.getProjectResource(targetRoute.projectKey, targetRoute.resourceId);
            return {
              project,
              members,
              resourceActionId,
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
        targetRoute.id === 'system-audit'
          ? api.getSystemAuditLogs({ actor: targetRoute.actor, action: targetRoute.action, targetType: targetRoute.targetType, targetId: targetRoute.targetId, page: targetRoute.page, perPage: targetRoute.perPage })
          : Promise.resolve(null),
        targetRoute.id === 'system-api-docs'
          ? api.getSystemApiDocs().then(normalizeSystemApiDocs)
          : Promise.resolve(null),
        targetRoute.id === 'time-management'
          ? (async () => {
            const overview = await baseApi.getTimeManagementOverview().catch((caught) => {
              const caughtError = caught instanceof Error ? /** @type {Error & { status?: number }} */ (caught) : null;
              if (caughtError?.status === 404) {
                throw new Error('当前服务端未提供时间管理接口，请先部署配套 API 版本。');
              }
              throw caught;
            });
            const projectPage = await baseApi.getProjects({ perPage: 100 }).catch(() => null);
            const projects = (projectPage?.items || []).map((project) => ({ key: project.key, name: project.name }));
            const seen = new Map();
            const systemMembers = await baseApi.getTimeManagementMembers().catch(() => null);
            if (systemMembers) {
              for (const member of systemMembers) {
                if (!seen.has(member.username)) {
                  seen.set(member.username, {
                    username: member.username,
                    display_name: member.display_name || member.username,
                  });
                }
              }
            } else {
              const memberGroups = await Promise.all(
                projects.map((project) => baseApi.getProjectMembers(project.key).catch(() => [])),
              );
              for (const group of memberGroups) {
                for (const member of group) {
                  if (!seen.has(member.username)) {
                    seen.set(member.username, { username: member.username, display_name: member.display_name });
                  }
                }
              }
            }
            return {
              allocations: overview,
              projects,
              members: [...seen.values()],
            };
          })()
          : Promise.resolve(null),
      ]);
      await routePagePreload;
      if (requestRef.current !== requestId) {
        return;
      }
      setUser(nextUser);
      setTopbar(nextTopbar);
      if (targetRoute.id === 'home') setDashboard(nextDashboard);
      if (targetRoute.id === 'profile' && nextProfile) {
        setDashboard(nextDashboard);
        setProfile(nextProfile);
        setApiTokens(nextSecurity?.[0] || []);
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
        setProjectResources(nextProjectBundle?.[3] || []);
        const timeAllocations = nextProjectBundle?.[4];
        // 后台刷新失败时保留已显示的排期，只给出提示；首次加载失败则显示为空并提示。
        if (timeAllocations?.items) setProjectTimeAllocations(timeAllocations.items);
        else if (mode === 'load') setProjectTimeAllocations([]);
        setProjectTimeAllocationsError(timeAllocations?.error || '');
      }
      if (targetRoute.id === 'project-resource-library') {
        setProjectDetail(nextProjectResourceLibraryBundle?.project || null);
        setProjectMembers(nextProjectResourceLibraryBundle?.members || []);
        // 加载期间用户已提交新的筛选（或其他资料操作）时，以其结果为准，不用较早发起的刷新结果覆盖。
        if (nextProjectResourceLibraryBundle?.resourceActionId === projectResourceActionRef.current) {
          setProjectResources(nextProjectResourceLibraryBundle?.resources || []);
          setProjectResourceLinkedWorkItemPosts(nextProjectResourceLibraryBundle?.linkedWorkItemPosts || []);
          setProjectResourceError(nextProjectResourceLibraryBundle?.resourceError || '');
          setProjectResourceLinkedError(nextProjectResourceLibraryBundle?.linkedError || '');
        }
      }
      if (targetRoute.id === 'project-cycle-detail') {
        setProjectCycleDetail(nextCycleDetailBundle?.[0] || null);
        setProjectMembers(nextCycleDetailBundle?.[1] || []);
      }
      if (targetRoute.id === 'project-resource-detail') {
        setProjectDetail(nextResourceDetailBundle?.project || null);
        setProjectMembers(nextResourceDetailBundle?.members || []);
        // 加载期间用户已解锁、编辑或重置密码时，以该操作的结果为准，不用较早发起的加载结果覆盖。
        if (nextResourceDetailBundle?.resourceActionId === projectResourceActionRef.current) {
          setProjectResourceDetail(nextResourceDetailBundle?.resource || null);
          setProjectResourceLocked(Boolean(nextResourceDetailBundle?.locked));
          setProjectResourceAttachments(nextResourceDetailBundle?.attachments || []);
        }
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
        const nextRoleCode = nextSystemRolesView?.selected_role?.role_code || '';
        const keepUnsavedPermissions = mode === 'refresh' && systemRolePermissionEditRef.current !== null && systemRolePermissionEditRef.current === nextRoleCode;
        if (!keepUnsavedPermissions) {
          systemRolePermissionEditRef.current = null;
          setSystemRolePermissionKeys((nextSystemRolesView?.permissions || []).filter((permission) => permission.granted).map((permission) => permission.permission_key));
        }
        setSystemRoleError('');
      }
      if (targetRoute.id === 'system-storage') setSystemStorageView(nextSystemStorageView);
      if (targetRoute.id === 'system-openapi') {
        setSystemOpenApiView(nextSystemOpenApiView);
        if (mode === 'load') setCreatedSystemApiToken('');
      }
      if (targetRoute.id === 'system-audit') setSystemAuditPage(nextSystemAuditPage);
      if (targetRoute.id === 'system-api-docs') setSystemApiDocs(nextSystemApiDocs);
      if (targetRoute.id === 'time-management') {
        setTimeAllocations(nextTimeManagement?.allocations || []);
        setTimeProjects(nextTimeManagement?.projects || []);
        setTimeMembers(nextTimeManagement?.members || []);
      }
      if (isWorkItemListRouteId(targetRoute.id)) {
        setWorkItemPage(nextWorkItems);
      }
      if (targetRoute.id === 'work-item-detail') {
        setWorkItemDetailView(nextWorkItemBundle?.detailView || null);
        setWorkItemDetail(nextWorkItemBundle?.item || null);
        setWorkItemResourceLibraryLink(nextWorkItemBundle?.resourceLibraryLink || null);
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
      const message = globalApiErrorMessage(caught);
      if (targetRoute.id === 'project-resource-detail') {
        setProjectResourceError(message);
      }
      setError(new Error(message));
      if (!topbarRef.current) {
        void Promise.allSettled([baseApi.getCurrentUser(), baseApi.getTopbarStatus()]).then(([userResult, topbarResult]) => {
          if (requestRef.current !== requestId) return;
          if (userResult.status === 'fulfilled') setUser(userResult.value);
          if (topbarResult.status === 'fulfilled') setTopbar(topbarResult.value);
        });
      }
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
   * @param {import('react').FormEvent<HTMLFormElement>} event
   */
  function submitProjectSearch(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const keyword = String(new FormData(form).get('q') || '').trim();
    navigate(
      buildProjectsPath({ owner: route.owner, status: projectRoute?.status || '', q: keyword, page: 1, perPage: projectRoute?.perPage }),
      keyword ? `已按「${keyword}」筛选项目。` : '已清除项目关键词。',
    );
  }

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

  async function persistTimeCreate(payload) {
    await api.createProjectTimeAllocation(payload.projectKey, payload);
    setTimeAllocations(await api.getTimeManagementOverview());
    setStatusMessage('排期已创建。');
  }

  async function persistTimeUpdate(id, payload) {
    await api.updateProjectTimeAllocation(payload.projectKey, id, payload);
    setTimeAllocations(await api.getTimeManagementOverview());
    setStatusMessage('排期已更新。');
  }

  async function persistTimeDelete(id) {
    const allocation = timeAllocations.find((item) => item.id === id);
    if (!allocation) return;
    await api.deleteProjectTimeAllocation(allocation.project_key, id);
    setTimeAllocations(await api.getTimeManagementOverview());
    setStatusMessage('排期已删除。');
  }

  function timeAllocationApiPayload(item) {
    return {
      username: item.username,
      projectKey: item.project_key,
      startDate: item.start_date,
      endDate: item.end_date,
      dailyHours: item.daily_hours,
      phaseTaskName: item.phase_task_name || '',
      note: item.note || '',
    };
  }

  async function persistTimeSave(_items, operations) {
    for (const item of operations.created) {
      await api.createProjectTimeAllocation(item.project_key, timeAllocationApiPayload(item));
    }
    for (const item of operations.updated) {
      await api.updateProjectTimeAllocation(item.project_key, item.id, timeAllocationApiPayload(item));
    }
    for (const item of operations.deleted) {
      await api.deleteProjectTimeAllocation(item.project_key, item.id);
    }
    setTimeAllocations(await api.getTimeManagementOverview());
    setStatusMessage('排期已保存。');
  }

  async function loadTimeManagementChanges(page = 1, perPage = timeChangesPerPage) {
    setTimeChangesLoading(true);
    setTimeChangesError('');
    try {
      setTimeChangesPage(await api.getTimeManagementChanges({ page, perPage }));
    } catch (caught) {
      setTimeChangesError(errorMessage(caught instanceof Error ? caught : new Error('修改记录加载失败。')));
    } finally {
      setTimeChangesLoading(false);
    }
  }

  function changeTimeManagementChangesPageSize(event) {
    const perPage = Number(event.currentTarget.value);
    setTimeChangesPerPage(perPage);
    void loadTimeManagementChanges(1, perPage);
  }

  async function confirmTimeChangeRestore() {
    if (!timeChangeRestoreTarget || timeChangeRestoring) return;
    setTimeChangeRestoring(true);
    setTimeChangeRestoreError('');
    try {
      await api.restoreTimeManagementChange(timeChangeRestoreTarget.id);
      setTimeChangeRestoreTarget(null);
      setTimeAllocations(await api.getTimeManagementOverview());
      await loadTimeManagementChanges(timeChangesPage?.pagination.page || 1);
      setStatusMessage('已回退该修改记录。');
    } catch (caught) {
      setTimeChangeRestoreError(errorMessage(caught instanceof Error ? caught : new Error('回退修改记录失败。')));
    } finally {
      setTimeChangeRestoring(false);
    }
  }

  async function persistProjectTimeCreate(payload) {
    await api.createProjectTimeAllocation(payload.projectKey, payload);
    setProjectTimeAllocations(await api.getProjectTimeAllocations(payload.projectKey));
    setStatusMessage('项目排期已创建。');
  }

  async function persistProjectTimeUpdate(id, payload) {
    await api.updateProjectTimeAllocation(payload.projectKey, id, payload);
    setProjectTimeAllocations(await api.getProjectTimeAllocations(payload.projectKey));
    setStatusMessage('项目排期已更新。');
  }

  async function persistProjectTimeDelete(id) {
    const allocation = projectTimeAllocations.find((item) => item.id === id);
    if (!allocation) return;
    await api.deleteProjectTimeAllocation(allocation.project_key, id);
    setProjectTimeAllocations(await api.getProjectTimeAllocations(allocation.project_key));
    setStatusMessage('项目排期已删除。');
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
    if (!activeProjectDetail || projectMemberCandidateLoading) return;
    if (!projectMemberSelectedUsernames.length) {
      setProjectMemberCandidateError('请至少选择一个要加入的项目成员。');
      return;
    }
    try {
      const usernames = projectMemberSelectedUsernames;
      if (await runProjectMutation(
        () => api.addProjectMembers(activeProjectDetail.key, { usernames, memberRole: projectMemberForm.memberRole }),
        `已添加 ${usernames.length} 名项目成员。`,
      )) {
        setProjectMemberCandidates((current) => current.filter((candidate) => !usernames.includes(candidate.username)));
        setProjectMemberOpen(false);
        setProjectMemberCandidateSearch('');
        setProjectMemberCandidateError('');
        setProjectMemberSelectedUsernames([]);
        setProjectMemberForm({ memberRole: 'member' });
      }
    } catch { return; }
  }

  async function openProjectMemberDialog() {
    if (!activeProjectDetail || projectMutationSubmitting || projectMemberCandidateLoading) return;
    setProjectMutationError('');
    setProjectMemberCandidateError('');
    setProjectMemberCandidateSearch('');
    setProjectMemberSelectedUsernames([]);
    setProjectMemberForm({ memberRole: 'member' });
    setProjectMemberOpen(true);
    setProjectMemberCandidateLoading(true);
    try {
      const candidates = await api.getProjectMemberCandidates(activeProjectDetail.key);
      if (routeRef.current.id !== 'project-detail' || routeRef.current.projectKey !== activeProjectDetail.key) return;
      setProjectMemberCandidates(candidates);
    } catch (caught) {
      setProjectMemberCandidateError(errorMessage(caught instanceof Error ? caught : new Error('候选成员加载失败。')));
    } finally {
      setProjectMemberCandidateLoading(false);
    }
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

  function releaseProjectAttachmentPreview() {
    projectAttachmentPreviewRequestRef.current += 1;
    setProjectAttachmentPreview(null);
  }

  /** @param {AppAttachment} attachment */
  async function openWorkItemAttachmentPreview(attachment) {
    if (!activeWorkItemDetail || !attachmentIsUploaded(attachment)) return;
    const itemKey = activeWorkItemDetail.key;
    const requestId = projectAttachmentPreviewRequestRef.current + 1;
    projectAttachmentPreviewRequestRef.current = requestId;
    setProjectAttachmentPreview({ open: true, loading: true, error: '', attachment, source: '', kind: null, strategy: null, fileType: null, position: 0, total: 0, previousId: null, nextId: null });
    try {
      /** @type {{ source: string, attachment: AppAttachment, preview: any, navigation: any }} */
      let result;
      const browserResult = await api.getWorkItemAttachmentPreview(itemKey, attachment.id);
      result = { source: browserResult.content_url, attachment: browserResult.attachment, preview: browserResult.preview, navigation: browserResult.navigation };
      if (projectAttachmentPreviewRequestRef.current !== requestId || !isCurrentWorkItemDetailRoute(itemKey)) {
        return;
      }
      setProjectAttachmentPreview({ open: true, loading: false, error: '', attachment: result.attachment, source: result.source, kind: result.preview.kind, strategy: result.preview.strategy, fileType: result.preview.file_type, position: result.navigation.position, total: result.navigation.total, previousId: result.navigation.previous?.id || null, nextId: result.navigation.next?.id || null });
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
    setProjectAttachmentPreview({ open: true, loading: true, error: '', attachment, source: '', kind: null, strategy: null, fileType: null, position: 0, total: 0, previousId: null, nextId: null, commentId });
    try {
      let result;
      const browserResult = await api.getWorkItemCommentAttachmentPreview(itemKey, commentId, attachment.id);
      result = { ...browserResult, source: browserResult.preview.content_enabled ? browserResult.content_url : '' };
      if (projectAttachmentPreviewRequestRef.current !== requestId || !isCurrentWorkItemDetailRoute(itemKey)) {
        return;
      }
      setProjectAttachmentPreview({ open: true, loading: false, error: '', attachment: result.attachment, source: result.source, kind: result.preview.kind, strategy: result.preview.strategy, fileType: result.preview.file_type, position: result.navigation.position, total: result.navigation.total, previousId: result.navigation.previous?.id || null, nextId: result.navigation.next?.id || null, commentId });
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
    setProjectAttachmentPreview({ open: true, loading: true, error: '', attachment, source: '', kind: null, strategy: null, fileType: null, position: 0, total: 0, previousId: null, nextId: null });
    try {
      /** @type {{ source: string, attachment: AppAttachment, preview: any, navigation: any }} */
      let result;
      const browserResult = await api.getProjectResourceAttachmentPreview(projectKey, resourceId, attachment.id, accessToken);
      result = { source: browserResult.content_url, attachment: browserResult.attachment, preview: browserResult.preview, navigation: browserResult.navigation };
      if (projectAttachmentPreviewRequestRef.current !== requestId || !isCurrentProjectResourceAttachmentRoute(projectKey, resourceId)) {
        return;
      }
      setProjectAttachmentPreview({ open: true, loading: false, error: '', attachment: result.attachment, source: result.source, kind: result.preview.kind, strategy: result.preview.strategy, fileType: result.preview.file_type, position: result.navigation.position, total: result.navigation.total, previousId: result.navigation.previous?.id || null, nextId: result.navigation.next?.id || null });
    } catch (caught) {
      if (projectAttachmentPreviewRequestRef.current === requestId && isCurrentProjectResourceAttachmentRoute(projectKey, resourceId)) setProjectAttachmentPreview((value) => value ? { ...value, loading: false, error: errorMessage(caught instanceof Error ? caught : new Error('预览加载失败。')) } : value);
    }
  }

  function navigateProjectResourceAttachmentPreview(attachmentId) {
    const attachment = projectResourceAttachments.find((value) => value.id === attachmentId);
    if (attachment) void openProjectResourceAttachmentPreview(attachment);
  }

  /** @param {number} attachmentId @param {{ source?: string, title?: string } | undefined} [inlineImage] */
  function activateProjectResourceInlineAttachment(attachmentId, inlineImage) {
    if (attachmentId === 0 && inlineImage?.source?.startsWith('data:image/svg+xml;base64,')) {
      setProjectAttachmentPreview({ open: true, loading: false, error: '', attachment: null, source: inlineImage.source, kind: 'image', strategy: null, fileType: 'svg', position: 0, total: 0, previousId: null, nextId: null });
      return;
    }
    const attachment = projectResourceAttachments.find((value) => value.id === attachmentId);
    if (attachment && attachmentIsUploaded(attachment)) void openProjectResourceAttachmentPreview(attachment);
  }

  /** @param {string} url */
  function appendProjectResourceAccess(url) {
    const accessToken = projectResourceDetail?.access_token || '';
    if (!accessToken || !url) return url;
    return url.includes('?') ? `${url}&access=${encodeURIComponent(accessToken)}` : `${url}?access=${encodeURIComponent(accessToken)}`;
  }

  /** @param {number} attachmentId @param {{ href: string, title: string, fileExt: string, fileKind: string, x: number, y: number }} file */
  function openProjectResourceFileMenu(attachmentId, file) {
    setProjectResourceFileMenu({ attachmentId, title: file.title, href: file.href, fileExt: file.fileExt, fileKind: file.fileKind, x: file.x, y: file.y });
  }

  function closeProjectResourceFileMenu() {
    setProjectResourceFileMenu(null);
  }

  function projectResourceFileMenuDownloadHandler() {
    const menu = projectResourceFileMenu;
    if (!menu) return undefined;
    const attachment = projectResourceAttachments.find((entry) => entry.id === menu.attachmentId) || null;
    return attachment && attachmentIsUploaded(attachment)
      ? () => void downloadProjectResourceAttachment(attachment)
      : undefined;
  }

  function projectResourceFileMenuCanPreview() {
    const menu = projectResourceFileMenu;
    if (!menu) return false;
    const attachment = projectResourceAttachments.find((entry) => entry.id === menu.attachmentId) || null;
    return isPreviewableDocumentFile(menu.title, attachment?.content_type || '')
      && menu.href.includes('/download');
  }

  async function resolveProjectResourceInlineAttachmentSource(attachmentId) {
    const current = routeRef.current;
    if (current.id !== 'project-resource-detail' || !projectResourceDetail) throw new Error('inline preview unavailable');
    const projectKey = String(current.projectKey || '');
    const resourceId = current.resourceId;
    const accessToken = String(projectResourceDetail.access_token || '');
    if (typeof previewSourceResolver !== 'function') throw new Error('inline preview unavailable');
    const result = await api.getProjectResourceAttachmentPreview(projectKey, resourceId, attachmentId, accessToken);
    if (!result.preview.content_enabled || !['image', 'video'].includes(result.preview.kind || '') || !result.content_url) throw new Error('inline preview unavailable');
    const source = await previewSourceResolver(result.content_url, {
      filename: result.attachment.filename,
      contentType: result.attachment.content_type,
      kind: result.preview.kind,
      strategy: result.preview.strategy,
    });
    return { source, release: () => { if (source.startsWith('blob:')) URL.revokeObjectURL(source); } };
  }

  /** @param {number} commentId @param {number} attachmentId */
  async function resolveWorkItemCommentInlineAttachmentSource(commentId, attachmentId) {
    const itemKey = activeWorkItemDetail?.key;
    if (!itemKey) throw new Error('inline preview unavailable');
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

  /** @param {() => Promise<any>} action @param {string} successMessage */
  async function runAccountSecurity(action, successMessage) {
    if (accountSecurityActionRef.current) return;
    accountSecurityActionRef.current = true;
    setAccountSecuritySubmitting(true);
    setAccountSecurityError('');
    try {
      const result = await action();
      const tokens = await api.getApiTokens();
      setApiTokens(tokens); setStatusMessage(successMessage);
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
      systemRolePermissionEditRef.current = null;
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
    systemRolePermissionEditRef.current = systemRolesView.selected_role?.role_code || null;
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
    systemRolePermissionEditRef.current = systemRolesView.selected_role?.role_code || null;
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
      `已为 ${systemUserProjectTarget.display_name} 分配所选项目。`,
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

  /** @param {ReturnType<typeof import('@yuance/frontend-app-core').parseAppRoute>} currentRoute */
  function isProjectResourceListRoute(currentRoute) {
    return currentRoute.id === 'project-resource-library';
  }

  /** @param {ReturnType<typeof import('@yuance/frontend-app-core').parseAppRoute>} currentRoute */
  function projectResourceListProjectKey(currentRoute) {
    if (currentRoute.id === 'project-resource-library') {
      return String(currentRoute.projectKey || '');
    }
    return '';
  }

  async function submitProjectResourceFilters(event) {
    event.preventDefault();
    const current = routeRef.current;
    if (!isProjectResourceListRoute(current) || !projectResourceListProjectKey(current)) return;
    await loadFilteredProjectResources(projectResourceFilters);
  }

  async function resetProjectResourceFilters() {
    const filters = { q: '', category: '', status: '', tag: '' };
    setProjectResourceFilters(filters);
    await loadFilteredProjectResources(filters);
  }

  async function loadFilteredProjectResources(filters) {
    const current = routeRef.current;
    if (!isProjectResourceListRoute(current)) return;
    const projectKey = projectResourceListProjectKey(current);
    if (!projectKey) return;
    const actionId = projectResourceActionRef.current + 1;
    projectResourceActionRef.current = actionId;
    projectResourceAppliedFiltersRef.current = { ...filters };
    setProjectResourceError('');
    setProjectResourceLinkedError('');
    const [resourcesResult, linkedPostsResult] = await Promise.allSettled([
      baseApi.getProjectResources(projectKey, filters),
      baseApi.getProjectResourceLinkedWorkItemPosts(projectKey, { q: filters.q || '' }),
    ]);
    const currentRoute = routeRef.current;
    if (projectResourceActionRef.current !== actionId || !isProjectResourceListRoute(currentRoute) || projectResourceListProjectKey(currentRoute) !== projectKey) return;
    if (resourcesResult.status === 'fulfilled') {
      setProjectResources(resourcesResult.value);
    } else {
      setProjectResourceError(errorMessage(resourcesResult.reason instanceof Error ? resourcesResult.reason : new Error('资料列表加载失败。')));
    }
    if (linkedPostsResult.status === 'fulfilled') {
      setProjectResourceLinkedWorkItemPosts(linkedPostsResult.value);
    } else {
      setProjectResourceLinkedError(errorMessage(linkedPostsResult.reason instanceof Error ? linkedPostsResult.reason : new Error('关联发布内容加载失败。')));
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
      body: resource.body_format === 'html' ? (resource.source_body || resource.body) : plainTextToRichHtml(resource.source_body || resource.body),
      bodyFormat: 'html',
      accessPasswordAction: 'keep',
      accessPassword: '',
      tagsText: resource.tags.join('，'),
    } : { id: 0, title: '', category: 'other', body: '', bodyFormat: 'html', accessPasswordAction: 'keep', accessPassword: '', tagsText: '' });
    setProjectResourceInitialInlineAttachmentIds(resource ? richTextAttachmentIds(resource.body) : []);
    if (!resource) setProjectResourceCreateCheckpoint(null);
    setProjectResourceModalOpen(true);
  }

  function closeProjectResourceForm() {
    if (projectResourceSubmitting || projectResourcePasteUploading) return;
    if (projectResourceCreateCheckpoint) {
      const current = routeRef.current;
      const path = buildProjectResourceDetailPath({ owner: current.owner, projectKey: String(current.projectKey || ''), resourceId: projectResourceCreateCheckpoint.id });
      setProjectResourceModalOpen(false);
      setProjectResourceCreateCheckpoint(null);
      navigate(path, '已打开刚创建的项目资料。');
      return;
    }
    setProjectResourceModalOpen(false);
    setProjectResourceForm((current) => ({ ...current, accessPassword: '' }));
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
    };
  }

  async function submitProjectResource(event) {
    event.preventDefault();
    const current = routeRef.current;
    const editing = projectResourceForm.id > 0;
    if (projectResourceMutationRef.current || projectResourceAttachmentMutationRef.current || (editing && current.id !== 'project-resource-detail') || (!editing && !isProjectResourceListRoute(current))) return;
    if (!richTextHasContent(projectResourceForm.body)) { setProjectResourceError('资料正文不能为空。'); return; }
    const projectKey = projectResourceListProjectKey(current) || String(current.projectKey || '');
    const resourceId = editing ? projectResourceForm.id : 0;
    const actionId = projectResourceActionRef.current + 1;
    projectResourceActionRef.current = actionId;
    projectResourceMutationRef.current = actionId;
    setProjectResourceSubmitting(true);
    setProjectResourceError('');
    const isCurrent = () => {
      const active = routeRef.current;
      return projectResourceActionRef.current === actionId
        && (editing
          ? active.id === 'project-resource-detail' && active.projectKey === projectKey && active.resourceId === resourceId
          : isProjectResourceListRoute(active) && projectResourceListProjectKey(active) === projectKey);
    };
    try {
      const payload = projectResourcePayload();
      let resource;
      if (editing) resource = await api.updateProjectResource(projectKey, resourceId, payload);
      else if (projectResourceCreateCheckpoint) {
        resource = await api.updateProjectResource(projectKey, projectResourceCreateCheckpoint.id, payload);
        setProjectResourceCreateCheckpoint(resource);
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
        const resources = await api.getProjectResources(projectKey, projectResourceAppliedFiltersRef.current);
        if (!isCurrent()) return;
        setProjectResources(resources);
        setProjectResourceCreateCheckpoint(null);
        setProjectResourceModalOpen(false);
        setProjectResourceStatus(`资料“${resource.title}”已创建。`);
      }
    } catch (caught) {
      if (isCurrent()) {
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
      navigate(buildProjectResourceLibraryPath({ owner: current.owner, projectKey }), `资料“${target.title}”已归档。`);
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

  function clearProjectResourceAttachmentUpload(actionId) {
    if (projectResourceAttachmentActionRef.current !== actionId) return;
    projectResourceAttachmentMutationRef.current = false;
    setProjectResourceAttachmentUploading(false);
  }

  /** @param {AppAttachment | null} [existingAttachment] @param {import('@yuance/frontend-platform-contract').PastedFile | null} [pastedFile] @param {RichTextPasteUploadOptions} [options] @returns {Promise<AppAttachment | null>} */
  async function uploadSelectedProjectResourceAttachment(existingAttachment = null, pastedFile = null, options = {}) {
    const current = routeRef.current;
    if (current.id !== 'project-resource-detail' || !projectResourceDetail || projectResourceLocked || projectResourceDetail.status === 'archived' || projectResourceAttachmentMutationRef.current || projectResourceMutationRef.current) return null;
    const projectKey = String(current.projectKey || '');
    const resourceId = Number(current.resourceId);
    const inline = Boolean(options.inline);
    const actionId = projectResourceAttachmentActionRef.current + 1;
    projectResourceAttachmentActionRef.current = actionId;
    projectResourceAttachmentMutationRef.current = true;
    setProjectResourceAttachmentUploading(true);
    setProjectResourceError('');
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
      if (isCurrentProjectResourceAttachmentRoute(projectKey, resourceId, actionId)) {
        if (inline) options.onError?.(errorMessage(caught instanceof Error ? caught : new Error('选择资料附件失败。')));
        else setProjectResourceError(errorMessage(caught instanceof Error ? caught : new Error('选择资料附件失败。')));
      }
      clearProjectResourceAttachmentUpload(actionId); return null;
    }
    if (!isCurrentProjectResourceAttachmentRoute(projectKey, resourceId, actionId) || !file) {
      clearProjectResourceAttachmentUpload(actionId); return null;
    }
    if (!file.byteSize || file.byteSize <= 0) {
      if (inline) options.onError?.('请选择非空文件。');
      else setProjectResourceError('请选择非空文件。');
      clearProjectResourceAttachmentUpload(actionId); return null;
    }
    const filename = file.filename || 'attachment.bin';
    if (existingAttachment && (filename !== existingAttachment.filename || file.contentType !== existingAttachment.content_type || file.byteSize !== existingAttachment.byte_size)) {
      const message = `请选择与 ${existingAttachment.filename} 名称、类型和大小一致的原文件。`;
      if (inline) options.onError?.(message);
      else setProjectResourceError(message);
      clearProjectResourceAttachmentUpload(actionId); return null;
    }
    let createdAttachment = /** @type {AppAttachment | null} */ (null);
    let completedUpload = /** @type {AppAttachment | null} */ (null);
    let stage = /** @type {'registering' | 'signing' | 'uploading' | 'confirming'} */ (existingAttachment ? 'signing' : 'registering');
    const refreshAttachments = async () => {
      const refreshed = await api.getProjectResourceAttachments(projectKey, resourceId, projectResourceDetail.access_token);
      if (!inline && isCurrentProjectResourceAttachmentRoute(projectKey, resourceId, actionId)) setProjectResourceAttachments(refreshed);
      return refreshed;
    };
    try {
      const result = await uploadProjectResourceAttachment({ api, platform: files, projectKey, resourceId, file, existingAttachment, lifecycle: {
        isCurrent: () => isCurrentProjectResourceAttachmentRoute(projectKey, resourceId, actionId) && (options.isCurrent?.() ?? true),
        onStage: (nextStage) => { stage = nextStage; options.onProgress?.(nextStage); },
        onCreated: (created) => {
          createdAttachment = created;
          if (!inline) setProjectResourceAttachments((items) => upsertAttachment(items, created));
        },
        onUploaded: (uploaded) => { if (!inline) setProjectResourceAttachments((items) => upsertAttachment(items, uploaded)); },
        refresh: async () => { await refreshAttachments(); },
      } });
      if (result.completed) {
        completedUpload = result.uploaded || null;
        if (result.refreshError) {
          if (inline) options.onError?.('附件已上传，但列表刷新失败，请手动刷新。');
          else setProjectResourceError('附件已上传，但列表刷新失败，请手动刷新。');
        }
      }
    } catch (caught) {
      if (isCurrentProjectResourceAttachmentRoute(projectKey, resourceId, actionId)) {
        if (stage === 'confirming') {
          const message = `${filename} 已上传，但确认失败，请刷新后检查。`;
          if (inline) options.onError?.(message);
          else setProjectResourceError(message);
        }
        else {
          if (!inline && createdAttachment) setProjectResourceAttachments((items) => upsertAttachment(items, /** @type {AppAttachment} */ ({ ...createdAttachment, status: 'failed' })));
          const message = errorMessage(caught instanceof Error ? caught : new Error('上传资料附件失败。'));
          if (inline) options.onError?.(message);
          else setProjectResourceError(message);
        }
      }
    } finally { clearProjectResourceAttachmentUpload(actionId); }
    return completedUpload;
  }

  async function downloadProjectResourceAttachment(attachment) {
    const current = routeRef.current;
    if (current.id !== 'project-resource-detail' || !projectResourceDetail || projectResourceLocked || !attachmentIsUploaded(attachment)) return;
    if (projectResourceDownloadingId !== null) return;
    const { projectKey, resourceId } = current;
    setProjectResourceError('');
    setProjectResourceDownloadingId(attachment.id);
    try {
      const result = await downloadProjectResourceAttachmentUseCase({ api, platform: files, projectKey, resourceId, attachmentId: attachment.id, accessToken: projectResourceDetail.access_token, suggestedFilename: attachment.filename, isCurrent: () => isCurrentProjectResourceAttachmentRoute(projectKey, resourceId) });
      if (result.completed) setProjectResourceStatus(`${attachment.filename} 下载完成。`);
    } catch (caught) { if (isCurrentProjectResourceAttachmentRoute(projectKey, resourceId)) setProjectResourceError(errorMessage(caught instanceof Error ? caught : new Error('下载资料附件失败。'))); }
    finally { setProjectResourceDownloadingId((current) => (current === attachment.id ? null : current)); }
  }

  async function confirmAccountAction() {
    if (!accountConfirmation) return;
    try {
      await runAccountSecurity(() => api.deleteApiToken(Number(accountConfirmation.id)), '访问 Token 已删除。');
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
                      ? '页面不存在 - 元策'
                      : route.id === 'time-management'
                        ? '时间管理 - 元策'
                        : route.id === 'project-resource-library' && activeProjectDetail
                          ? `资料库 - ${activeProjectDetail.name} - 元策`
                          : route.id === 'project-resource-library'
                            ? '项目资料库 - 元策'
                      : '元策浏览器工作台 - 元策';
    router.setTitle(title);
  }, [route, activeProjectDetail, activeWorkItemDetail, projectCycleDetail, router]);

  useEffect(() => {
    if (!isWorkItemListRouteId(route.id) || !route.itemType) return;
    const listPath = `${route.pathname}${route.search}`;
    setWorkItemListReturnPaths((current) => (current[route.itemType] === listPath ? current : { ...current, [route.itemType]: listPath }));
  }, [route]);

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

  useEffect(() => {
    if (!activeWorkItemDetail || workItemFormKey === activeWorkItemDetail.key) {
      return;
    }
    setWorkItemEditForm(workItemEditFormFromDetail(activeWorkItemDetail, activeWorkItemDetailView?.primary_post || null));
    setWorkItemHandoffForm(workItemHandoffFormFromDetail(activeWorkItemDetail));
    setWorkItemActionError('');
    setWorkItemNewCommentBody('');
    setWorkItemNewCommentAssignStatus(activeWorkItemDetail.status || 'open');
    setWorkItemReplyAssignStatus(activeWorkItemDetail.status || 'open');
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
    if (typeof runtime.readAppReleaseVersion !== 'function'
      || typeof runtime.openAppUpdateManifest !== 'function'
      || typeof runtime.subscribeAppUpdateChecks !== 'function') {
      return undefined;
    }
    const openManifest = runtime.openAppUpdateManifest;
    const subscribeAppUpdateChecks = runtime.subscribeAppUpdateChecks;
    const currentVersion = runtime.readAppReleaseVersion().trim();
    if (!currentVersion) return undefined;
    const controller = createAppUpdateController({
      currentVersion,
      fetchManifest: () => openManifest(),
      onPrompt: (version) => setAppUpdatePrompt((current) => current ? current : { version }),
    });
    appUpdateControllerRef.current = controller;
    const unsubscribe = subscribeAppUpdateChecks(() => controller.check());
    return () => {
      if (appUpdateControllerRef.current === controller) appUpdateControllerRef.current = null;
      unsubscribe();
      controller.dispose();
    };
  }, [runtime]);

  useEffect(() => {
    const coordinator = createNotificationEventCoordinator({
      refresh: () => loadRouteStateRef.current(routeRef.current, 'refresh'),
      onNavigate: (path) => router.assign(path),
      onReleaseVersion: (version) => appUpdateControllerRef.current?.handleRealtimeVersion(version),
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

  function closeAppUpdatePrompt() {
    const version = appUpdatePrompt?.version || '';
    if (version) appUpdateControllerRef.current?.defer(version);
    setAppUpdatePrompt(null);
  }

  function confirmAppUpdateRefresh() {
    runtime.reloadPage?.();
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
      const currentRoute = routeRef.current;
      if (isWorkItemListRouteId(currentRoute.id)) {
        navigate(buildWorkItemListPath({
          owner: currentRoute.owner,
          itemType: currentRoute.itemType,
          q: currentRoute.q,
          status: currentRoute.status,
          priority: currentRoute.priority,
          assigneeUsername: currentRoute.assigneeUsername,
          projectKey: project.key,
          sort: currentRoute.sort,
          perPage: currentRoute.perPage,
        }), `已切换当前项目到 ${project.key}。`);
      } else if (currentRoute.id === 'project-resource-library' || currentRoute.id === 'project-resource-detail') {
        navigate(buildProjectResourceLibraryPath({
          owner: currentRoute.owner,
          projectKey: project.key,
        }), `已切换当前项目到 ${project.key}。`);
      } else if (currentRoute.id === 'project-personal-analysis') {
        navigate(buildProjectPersonalAnalysisPath({
          owner: currentRoute.owner,
          projectKey: project.key,
        }), `已切换当前项目到 ${project.key}。`);
      } else if (currentRoute.id === 'project-cycle-detail') {
        navigate(buildProjectDetailPath({
          owner: currentRoute.owner,
          projectKey: project.key,
          tab: 'cycles',
        }), `已切换当前项目到 ${project.key}。`);
      } else if (currentRoute.id === 'project-detail') {
        navigate(buildProjectDetailPath({
          owner: currentRoute.owner,
          projectKey: project.key,
          tab: currentRoute.tab,
        }), `已切换当前项目到 ${project.key}。`);
      } else {
        await loadRouteState(routeRef.current, 'refresh');
      }
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
    setWorkItemReplyAssignStatus(activeWorkItemDetail?.status || 'open');
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
    const attachmentsPromise = baseApi.getWorkItemAttachments(itemKey);
    const resourceLibraryLinkGeneration = workItemResourceLibraryLinkGenerationRef.current;
    const resourceLibraryLinkPromise = baseApi.getWorkItemResourceLibraryLink(itemKey);
    void attachmentsPromise.catch(() => {});
    const [detailViewResult, commentsResult, attachmentBundleResult, resourceLibraryLinkResult] = await Promise.allSettled([
      api.getWorkItemDetailView(itemKey),
      commentsPromise,
      commentsPromise.then((comments) => loadWorkItemAttachmentBundle(baseApi, itemKey, comments, attachmentsPromise)),
      resourceLibraryLinkPromise,
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
    if (workItemResourceLibraryLinkGenerationRef.current === resourceLibraryLinkGeneration && resourceLibraryLinkResult.status === 'fulfilled') {
      setWorkItemResourceLibraryLink(resourceLibraryLinkResult.value);
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
    if (!richTextHasContent(workItemEditForm.description)) {
      setWorkItemActionError('主内容不能为空，请输入文字或上传图片/附件。');
      runtime.scheduleFrame(() => runtime.getElementById('work-item-primary-post')?.focus());
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
      const updated = action === 'close'
        ? await api.closeWorkItem(itemKey)
        : action === 'restore'
          ? await api.restoreWorkItem(itemKey)
          : await api.updateWorkItem(itemKey, { status: 'in_progress' });
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

  /** @param {'link' | 'unlink'} action */
  async function requestWorkItemResourceLibraryLink(action) {
    if (!activeWorkItemDetail || !activeWorkItemResourceLibraryLink?.can_manage) {
      return false;
    }
    if (workItemMutationRef.current || workItemAttachmentMutationRef.current || workItemResourceLibraryMutationRef.current) {
      return false;
    }
    const itemKey = activeWorkItemDetail.key;
    const actionId = workItemActionRef.current + 1;
    workItemActionRef.current = actionId;
    workItemResourceLibraryLinkGenerationRef.current += 1;
    workItemMutationRef.current = true;
    workItemMutationActionRef.current = actionId;
    workItemResourceLibraryMutationRef.current = true;
    setWorkItemResourceLibrarySubmitting(true);
    setWorkItemActionError('');
    try {
      const result = action === 'link'
        ? await api.linkWorkItemToResourceLibrary(itemKey)
        : await api.unlinkWorkItemFromResourceLibrary(itemKey);
      if (!isCurrentWorkItemDetailRoute(itemKey, actionId)) {
        return false;
      }
      workItemResourceLibraryLinkGenerationRef.current += 1;
      setWorkItemResourceLibraryLink(result);
      setStatusMessage(result.linked ? `${itemKey} 已链接到资料库。` : `${itemKey} 已取消资料库链接。`);
      return true;
    } catch (caught) {
      if (isCurrentWorkItemDetailRoute(itemKey, actionId)) {
        setWorkItemActionError(errorMessage(caught instanceof Error ? caught : new Error(action === 'link' ? '链接到资料库失败。' : '取消资料库链接失败。')));
      }
      return false;
    } finally {
      if (workItemMutationActionRef.current === actionId) {
        workItemResourceLibraryMutationRef.current = false;
        clearWorkItemMutation(actionId, setWorkItemResourceLibrarySubmitting);
      }
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

    const submitter = workItemFormSubmitter(event);
    const shouldAssign = Boolean(submitter?.closest?.('[data-discussion-assign]'));
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
      }
      if (shouldAssign) {
        const assigneeUsername = activeWorkItemDetail.reporter_username || '';
        if (!assigneeUsername) {
          throw new Error('无法识别指派对象，请刷新页面后重试。');
        }
        const updated = await api.handoffWorkItem(itemKey, {
          status: workItemNewCommentAssignStatus,
          assigneeUsername,
          body: '由讨论内容自动指派',
          sourceCommentId: created.id,
        });
        if (isCurrentWorkItemDetailRoute(itemKey, actionId)) {
          if (applyWorkItemMutationResult(updated, `${itemKey} 评论已发布并指派。`, actionId)) {
            await refreshWorkItemCompanionState(itemKey, '评论已发布并指派', actionId, updated);
          }
        }
      } else if (isCurrentWorkItemDetailRoute(itemKey, actionId)) {
        setStatusMessage(`${itemKey} 评论已发布。`);
        await refreshWorkItemCompanionState(itemKey, '评论已发布', actionId);
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
      const submitter = workItemFormSubmitter(event);
      const shouldAssign = Boolean(submitter?.closest?.('[data-discussion-assign]'));
      const parentComment = workItemComments.find((comment) => comment.id === parentCommentId);
      const result = await createWorkItemCommentUseCase({
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
          refreshCompanion: shouldAssign ? undefined : () => refreshWorkItemCompanionState(itemKey, '回复已发布', actionId),
        },
      });
      if (shouldAssign) {
        const created = result.value;
        const assigneeUsername = parentComment?.author_username || '';
        if (!assigneeUsername) {
          throw new Error('无法识别指派对象，请刷新页面后重试。');
        }
        const updated = await api.handoffWorkItem(itemKey, {
          status: workItemReplyAssignStatus,
          assigneeUsername,
          body: '由讨论内容自动指派',
          sourceCommentId: created.id,
        });
        if (isCurrentWorkItemDetailRoute(itemKey, actionId)) {
          if (applyWorkItemMutationResult(updated, `${itemKey} 回复已发布并指派。`, actionId)) {
            await refreshWorkItemCompanionState(itemKey, '回复已发布并指派', actionId, updated);
          }
        }
      }
    } catch (caught) {
      if (isCurrentWorkItemDetailRoute(itemKey, actionId)) {
        setWorkItemCommentActionError(errorMessage(caught instanceof Error ? caught : new Error('发布回复失败。')));
      }
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
   * @param {AppAttachment} attachment
   */
  async function downloadWorkItemAttachment(attachment) {
    if (!activeWorkItemDetail || !attachmentIsUploaded(attachment)) {
      return;
    }
    const itemKey = activeWorkItemDetail.key;
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
   * @param {RichTextPasteUploadOptions} [options]
   * @returns {Promise<AppAttachment | null>}
   */
  async function uploadSelectedWorkItemCommentAttachment(requestedCommentId = null, pastedFile = null, options = {}) {
    if (!activeWorkItemDetail || workItemAttachmentMutationRef.current || workItemMutationRef.current) {
      return null;
    }
    const itemKey = activeWorkItemDetail.key;
    let commentId = requestedCommentId;
    const inline = Boolean(options.inline);
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
      if (isCurrentWorkItemAttachmentRoute(itemKey, actionId)) {
        if (inline) options.onError?.(errorMessage(caught instanceof Error ? caught : new Error('选择附件失败。')));
        else setWorkItemAttachmentActionError(errorMessage(caught instanceof Error ? caught : new Error('选择附件失败。')));
      }
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
      if (inline) options.onError?.('请选择非空文件。');
      else setWorkItemAttachmentActionError('请选择非空文件。');
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
        if (inline) options.onError?.(errorMessage(caught instanceof Error ? caught : new Error('创建评论草稿失败。')));
        else setWorkItemAttachmentActionError(errorMessage(caught instanceof Error ? caught : new Error('创建评论草稿失败。')));
        return null;
      }
    }
    if (commentId === null) return null;
    const resolvedCommentId = commentId;

    const filename = file.filename || 'attachment.bin';
    let createdAttachment = /** @type {AppAttachment | null} */ (null);
    let completedUpload = /** @type {AppAttachment | null} */ (null);
    let uploadStage = /** @type {'registering' | 'signing' | 'uploading' | 'confirming'} */ ('registering');
    const refreshCommentAttachments = async () => {
      const refreshed = await api.getWorkItemCommentAttachments(itemKey, resolvedCommentId);
      if (!inline && isCurrentWorkItemAttachmentRoute(itemKey, actionId)) {
        setWorkItemCommentAttachments((current) => ({
          ...current,
          [String(resolvedCommentId)]: refreshed,
        }));
      }
      return refreshed;
    };
    if (!inline) setWorkItemAttachmentActionError('');
    if (!inline) setWorkItemCommentAttachmentStatus((current) => ({
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
          isCurrent: () => isCurrentWorkItemAttachmentRoute(itemKey, actionId) && (options.isCurrent?.() ?? true),
          onStage: (stage) => {
            uploadStage = stage;
            options.onProgress?.(stage);
            const labels = {
              registering: '正在登记附件。',
              signing: '正在获取上传签名。',
              uploading: '正在上传到对象存储。',
              confirming: '正在确认上传结果。',
            };
            if (!inline) setWorkItemCommentAttachmentStatus((current) => ({
              ...current,
              [String(resolvedCommentId)]: `${filename} ${labels[stage]}`,
            }));
          },
          onCreated: (created) => {
            createdAttachment = created;
            if (!inline) setWorkItemCommentAttachments((current) => ({
              ...current,
              [String(resolvedCommentId)]: upsertAttachment(current[String(resolvedCommentId)] || [], created),
            }));
          },
          onUploaded: (uploaded) => {
            requestRef.current += 1;
            setRefreshing(false);
            if (!inline) setWorkItemCommentAttachments((current) => ({
              ...current,
              [String(resolvedCommentId)]: upsertAttachment(current[String(resolvedCommentId)] || [], uploaded),
            }));
          },
          refresh: async () => { await refreshCommentAttachments(); },
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
            url: `/web/work-items/${encodeURIComponent(itemKey)}/comments/${resolvedCommentId}/attachments/${uploaded.id}/download`,
          })}`);
        }
        if (!inline) setStatusMessage(`${itemKey} 评论附件已上传。`);
        if (!inline) setWorkItemCommentAttachmentStatus((current) => ({
          ...current,
          [String(resolvedCommentId)]: `${filename} 上传完成。`,
        }));
        if (result.refreshError) {
          if (!inline) setWorkItemAttachmentActionError('评论附件已上传，但列表刷新失败，请手动刷新。');
        }
      }
    } catch (caught) {
      if (isCurrentWorkItemAttachmentRoute(itemKey, actionId)) {
        if (uploadStage === 'confirming') {
          let confirmedByRefresh = false;
          let confirmedRefresh = /** @type {AppAttachment[]} */ ([]);
          try {
            confirmedRefresh = await refreshCommentAttachments();
            confirmedByRefresh = confirmedRefresh.some((attachment) => (
              attachment.id === createdAttachment?.id && attachment.status === 'uploaded'
            ));
          } catch {
            // The upload has completed; retain the locally known pending state when confirmation cannot be resolved.
          }
          if (confirmedByRefresh) {
            completedUpload = confirmedRefresh.find((attachment) => attachment.id === createdAttachment?.id) || null;
            if (!inline) setStatusMessage(`${itemKey} 评论附件已上传。`);
            if (!inline) setWorkItemCommentAttachmentStatus((current) => ({
              ...current,
              [String(resolvedCommentId)]: `${filename} 上传完成。`,
            }));
          } else {
            const message = `${filename} 已上传，但服务端确认失败，请手动刷新后检查。`;
            if (inline) options.onError?.(message);
            else {
              setWorkItemAttachmentActionError(message);
              setWorkItemCommentAttachmentStatus((current) => ({
                ...current,
                [String(resolvedCommentId)]: `${filename} 上传结果待确认。`,
              }));
            }
          }
        } else if (createdAttachment) {
          const failedAttachment = /** @type {AppAttachment} */ ({
            ...createdAttachment,
            status: 'failed',
          });
          if (!inline) setWorkItemCommentAttachments((current) => ({
            ...current,
            [String(resolvedCommentId)]: upsertAttachment(current[String(resolvedCommentId)] || [], failedAttachment),
          }));
          const message = errorMessage(caught instanceof Error ? caught : new Error('上传评论附件失败。'));
          if (inline) options.onError?.(`${filename} 上传失败：${message}`);
          else {
            setWorkItemAttachmentActionError(`${filename} 上传失败：${message}`);
            setWorkItemCommentAttachmentStatus((current) => ({
              ...current,
              [String(resolvedCommentId)]: `${filename} 上传失败，请重试。`,
            }));
          }
        } else {
          const message = errorMessage(caught instanceof Error ? caught : new Error('上传评论附件失败。'));
          if (inline) options.onError?.(`${filename} 上传失败：${message}`);
          else {
            setWorkItemAttachmentActionError(`${filename} 上传失败：${message}`);
            setWorkItemCommentAttachmentStatus((current) => ({
              ...current,
              [String(resolvedCommentId)]: `${filename} 上传失败，请重试。`,
            }));
          }
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

  /** @param {'new' | 'edit' | 'reply'} context @param {number | null} commentId @param {import('@yuance/frontend-platform-contract').PastedFile} file @param {RichTextPasteUploadOptions} [options] @returns {Promise<AppRichTextAttachmentOption | null | typeof DEFER_RICH_TEXT_PASTE>} */
  async function pasteWorkItemCommentFile(context, commentId, file, options) {
    if (!activeWorkItemDetail) return null;
    if (workItemAttachmentMutationRef.current || workItemMutationRef.current) return DEFER_RICH_TEXT_PASTE;
    const itemKey = activeWorkItemDetail.key;
    const uploadCommentId = context === 'new' ? null : commentId;
    const uploaded = await uploadSelectedWorkItemCommentAttachment(uploadCommentId, file, { inline: true, ...options });
    if (!uploaded) return null;
    if (context === 'new') {
      const draftId = workItemCommentDraftRef.current?.commentId;
      return draftId ? workItemCommentAttachmentOption(itemKey, draftId, uploaded) : null;
    }
    return uploadCommentId ? workItemCommentAttachmentOption(itemKey, uploadCommentId, uploaded) : null;
  }

  /** @param {import('@yuance/frontend-platform-contract').PastedFile} file @param {RichTextPasteUploadOptions} [options] @returns {Promise<AppRichTextAttachmentOption | null | typeof DEFER_RICH_TEXT_PASTE>} */
  async function pasteWorkItemPrimaryPostFile(file, options) {
    if (!activeWorkItemDetail) return null;
    if (workItemAttachmentMutationRef.current || workItemMutationRef.current) return DEFER_RICH_TEXT_PASTE;
    const itemKey = activeWorkItemDetail.key;
    let commentId = activeWorkItemDetailView?.primary_post?.id || null;
    if (!commentId) {
      if (!activeWorkItemDetailView?.permissions.can_edit_primary_post) {
        options?.onError?.('当前没有主内容编辑权限，无法上传图片。');
        return null;
      }
      try {
        // 附件必须挂在主帖评论下；没有主帖时先创建占位主帖再上传。
        const primaryPost = await api.updateWorkItemPrimaryPost(itemKey, '<p>图片上传中…</p>');
        commentId = primaryPost.id;
        setWorkItemDetailView((current) => current ? { ...current, primary_post: primaryPost } : current);
      } catch (caught) {
        options?.onError?.(errorMessage(caught instanceof Error ? caught : new Error('创建主内容失败。')));
        return null;
      }
    }
    const uploaded = await uploadSelectedWorkItemCommentAttachment(commentId, file, { inline: true, ...options });
    return uploaded ? workItemCommentAttachmentOption(itemKey, commentId, uploaded) : null;
  }

  /** @param {import('@yuance/frontend-platform-contract').PastedFile} file @param {RichTextPasteUploadOptions} [options] @returns {Promise<AppRichTextAttachmentOption | null | typeof DEFER_RICH_TEXT_PASTE>} */
  async function pasteProjectResourceFile(file, options) {
    const current = routeRef.current;
    const projectKey = projectResourceListProjectKey(current) || String(current.projectKey || '');
    if (current.id === 'project-resource-detail') {
      if (!projectResourceDetail || projectResourceLocked) {
        options?.onError?.('资料当前不可编辑，无法粘贴文件。');
        return null;
      }
      if (projectResourceAttachmentMutationRef.current || projectResourceMutationRef.current) return DEFER_RICH_TEXT_PASTE;
      const uploaded = await uploadSelectedProjectResourceAttachment(null, file, { inline: true, ...options });
      if (!uploaded) return null;
      return projectResourceAttachmentOption(projectKey, Number(current.resourceId), uploaded);
    }
    if (!isProjectResourceListRoute(current) || projectResourceForm.id !== 0 || projectResourceSubmitting) {
      options?.onError?.('资料当前不可编辑，无法粘贴文件。');
      return null;
    }
    if (projectResourcePasteUploading || projectResourceAttachmentMutationRef.current || projectResourceMutationRef.current) return DEFER_RICH_TEXT_PASTE;

    setProjectResourcePasteUploading(true);
    projectResourceAttachmentMutationRef.current = true;
    try {
      const selectPastedFile = files.selectPastedFile;
      if (typeof selectPastedFile !== 'function') { options?.onError?.('当前环境不支持粘贴文件。'); return null; }
      let selected;
      try { selected = await selectPastedFile(file); }
      catch (caught) { options?.onError?.(errorMessage(caught instanceof Error ? caught : new Error('读取剪贴板图片失败。'))); return null; }
      if (!selected || !selected.byteSize || selected.byteSize <= 0) { options?.onError?.('请粘贴非空图片文件。'); return null; }
      if (!projectResourceForm.title.trim()) { options?.onError?.('请先完善资料标题后再上传附件。'); return null; }
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
          isCurrent: () => isProjectResourceListRoute(routeRef.current) && projectResourceListProjectKey(routeRef.current) === projectKey && (options?.isCurrent?.() ?? true),
          onStage: (stage) => options?.onProgress?.(stage),
          onCreated: () => {},
          onUploaded: () => {},
          refresh: async () => {},
        },
      });
      const uploaded = /** @type {AppAttachment | null} */ (result.uploaded);
      if (!result.completed || !uploaded) {
        options?.onError?.('粘贴图片上传未完成，请重试。');
        return null;
      }
      return projectResourceAttachmentOption(projectKey, checkpoint.id, uploaded);
    } catch (caught) {
      options?.onError?.(errorMessage(caught instanceof Error ? caught : new Error('上传粘贴图片失败。')));
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
    setWorkItemCreateCheckpoint(null);
    workItemCreateUploadCountRef.current = 0;
    workItemCreateCloseSaveFailedRef.current = false;
    setWorkItemCreatePasteUploading(false);
    workItemCreateDraftIdsRef.current = new Set();
    workItemCreateDescriptionRef.current = '';
    setWorkItemCreateForm({ title: '', description: '', priority: 'P2', assigneeUsername: '', cycleId: '', dueDate: '', parentItemKey: '' });
    setWorkItemCreateOpen(true);
  }

  /**
   * 删除本次新建中上传但未被正文引用（或放弃创建）的草稿附件；失败不影响主流程，过期清理兜底。
   * @param {string} projectKey
   * @param {string} [keptBody]
   */
  function discardWorkItemCreateDrafts(projectKey, keptBody = '') {
    const drafts = [...workItemCreateDraftIdsRef.current];
    workItemCreateDraftIdsRef.current = new Set();
    const kept = new Set(richTextAttachmentIds(keptBody));
    for (const attachmentId of drafts) {
      if (kept.has(attachmentId)) continue;
      void baseApi.deleteWorkItemDraftAttachment(projectKey, attachmentId).catch(() => {});
    }
  }

  async function closeWorkItemCreate({ discard = false } = {}) {
    if (workItemCreateSubmitting || workItemCreatePasteUploading) return;
    if (!discard && !workItemCreateCheckpoint && (workItemCreateForm.title.trim() || richTextHasContent(workItemCreateDescriptionRef.current))) {
      setWorkItemCreateDiscardOpen(true);
      return;
    }
    setWorkItemCreateDiscardOpen(false);
    if (workItemCreateCheckpoint) {
      // 工作项已创建但上次写主帖失败：离开前再保存一次说明内容（含草稿附件绑定），避免正文丢失。
      // 若仍失败则留在弹窗提示；再次点击才放弃保存并打开详情，草稿附件由过期清理兜底。
      const itemKey = workItemCreateCheckpoint.item.key;
      const description = workItemCreateDescriptionRef.current;
      if (richTextHasContent(description) && !workItemCreateCloseSaveFailedRef.current) {
        setWorkItemCreateSubmitting(true);
        setWorkItemCreateError('');
        try {
          await api.updateWorkItemPrimaryPost(itemKey, description);
          if (workItemListProject) discardWorkItemCreateDrafts(workItemListProject.key, description);
        } catch (caught) {
          workItemCreateCloseSaveFailedRef.current = true;
          setWorkItemCreateError(`${itemKey} 已创建，但说明内容保存失败：${errorMessage(/** @type {ApiError | Error} */ (caught))}。可点击「创建」重试；再次点击「转到详情」将放弃本次说明内容。`);
          return;
        } finally {
          setWorkItemCreateSubmitting(false);
        }
      }
      workItemCreateCloseSaveFailedRef.current = false;
      setWorkItemCreateOpen(false);
      setWorkItemCreateCheckpoint(null);
      navigate(buildWorkItemDetailPath({ owner: workItemOwner, itemKey }), `已打开刚创建的 ${itemKey}。`);
      return;
    }
    if (workItemListProject) discardWorkItemCreateDrafts(workItemListProject.key);
    setWorkItemCreateOpen(false);
  }

  function workItemCreatePayload() {
    if (!workItemListRoute || !workItemListProject) return null;
    const itemType = workItemListRoute.itemType;
    if (!itemType) return null;
    return {
      projectKey: workItemListProject.key,
      itemType,
      title: workItemCreateForm.title.trim(),
      description: richTextHasContent(workItemCreateDescriptionRef.current) ? workItemCreateDescriptionRef.current : '',
      priority: workItemCreateForm.priority,
      assigneeUsername: workItemCreateForm.assigneeUsername,
      cycleId: Number.parseInt(workItemCreateForm.cycleId, 10) || null,
      dueDate: workItemCreateForm.dueDate,
      parentItemKey: itemType === 'task' ? workItemCreateForm.parentItemKey : '',
    };
  }

  /**
   * 新建弹窗上传附件：先暂存为项目草稿附件，无需标题、无需提前创建工作项；创建时由服务端绑定到主帖。
   * @param {import('@yuance/frontend-platform-contract').PastedFile} file @param {RichTextPasteUploadOptions} [options] @returns {Promise<AppRichTextAttachmentOption | null>}
   */
  async function pasteWorkItemCreateFile(file, options) {
    const projectKey = workItemListProject?.key;
    if (!workItemListRoute || !projectKey || workItemCreateSubmitting) {
      options?.onError?.('当前无法上传文件。');
      return null;
    }
    const selectPastedFile = files.selectPastedFile;
    if (typeof selectPastedFile !== 'function') {
      options?.onError?.('当前环境不支持上传文件。');
      return null;
    }
    workItemCreateUploadCountRef.current += 1;
    setWorkItemCreatePasteUploading(true);
    try {
      let selected;
      try { selected = await selectPastedFile(file); }
      catch (caught) {
        options?.onError?.(errorMessage(caught instanceof Error ? caught : new Error('读取文件失败。')));
        return null;
      }
      if (!selected || !selected.byteSize || selected.byteSize <= 0) {
        options?.onError?.('请选择非空文件。');
        return null;
      }
      const result = await uploadWorkItemDraftAttachment({
        api,
        platform: files,
        projectKey,
        file: selected,
        lifecycle: {
          isCurrent: () => options?.isCurrent?.() ?? true,
          onStage: (stage) => options?.onProgress?.(stage),
          onCreated: (created) => { workItemCreateDraftIdsRef.current.add(created.id); },
          onUploaded: () => {},
          refresh: async () => {},
        },
      });
      if (result.created) workItemCreateDraftIdsRef.current.add(result.created.id);
      if (!result.completed || !result.uploaded) {
        if (result.created) {
          workItemCreateDraftIdsRef.current.delete(result.created.id);
          void baseApi.deleteWorkItemDraftAttachment(projectKey, result.created.id).catch(() => {});
        }
        options?.onError?.('文件上传未完成，请重试。');
        return null;
      }
      return {
        id: result.uploaded.id,
        filename: result.uploaded.filename,
        contentType: result.uploaded.content_type,
        url: workItemDraftAttachmentWebUrl(projectKey, result.uploaded.id),
      };
    } catch (caught) {
      options?.onError?.(errorMessage(caught instanceof Error ? caught : new Error('上传文件失败。')));
      return null;
    } finally {
      workItemCreateUploadCountRef.current = Math.max(0, workItemCreateUploadCountRef.current - 1);
      if (workItemCreateUploadCountRef.current === 0) setWorkItemCreatePasteUploading(false);
    }
  }

  /** @param {React.FormEvent<HTMLFormElement>} event */
  async function submitWorkItemCreate(event) {
    event.preventDefault();
    if (!workItemListRoute || !workItemListProject || workItemCreateSubmitting || workItemCreatePasteUploading) return;
    const payload = workItemCreatePayload();
    if (!payload) {
      setWorkItemCreateError('工作项类型无效。');
      return;
    }
    if (!payload.title) {
      setWorkItemCreateError('请输入工作项标题。');
      runtime.getElementById('work-item-create-title')?.focus();
      return;
    }
    if (!payload.itemType) {
      setWorkItemCreateError('工作项类型无效。');
      return;
    }
    setWorkItemCreateSubmitting(true);
    setWorkItemCreateError('');
    try {
      const description = workItemCreateDescriptionRef.current;
      const hasDescription = richTextHasContent(description);
      let item = workItemCreateCheckpoint?.item || null;
      if (item) {
        // 上次已创建工作项但主帖写入失败：只更新字段并重写主帖，避免重复创建。
        item = await api.updateWorkItem(item.key, {
          title: payload.title,
          priority: payload.priority,
          assigneeUsername: payload.assigneeUsername,
          cycleId: payload.cycleId,
          dueDate: payload.dueDate,
          parentItemKey: payload.parentItemKey,
        });
      } else {
        // 正文中的草稿附件由写主帖时服务端绑定，创建工作项只携带纯摘要占位，避免草稿地址进入描述。
        item = await api.createWorkItem({ ...payload, description: hasDescription && richTextAttachmentIds(description).length === 0 ? description : '' });
        setWorkItemCreateCheckpoint({ item, primaryPostId: null });
      }
      if (hasDescription) {
        await api.updateWorkItemPrimaryPost(item.key, description);
      }
      discardWorkItemCreateDrafts(payload.projectKey, hasDescription ? description : '');
      setWorkItemCreateOpen(false);
      setWorkItemCreateCheckpoint(null);
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

  const projectResourceLibraryRows = useMemo(
    () => buildProjectResourceLibraryRows(projectResources, projectResourceLinkedWorkItemPosts),
    [projectResources, projectResourceLinkedWorkItemPosts],
  );
  const projectResourcesPanel = activeProjectDetail && route.id === 'project-resource-library' ? (
    <ProjectResourceLibraryPage ctx={{ activeProjectDetail, canManageProjectContent, currentProject, handleNavigate, headingRef, openProjectResourceForm, projectResourceError, projectResourceFilters, projectResourceLibraryRows, projectResourceLinkedError, projectResourceStatus, projectResourceSubmitting, projectScopeKey, resetProjectResourceFilters, route, setProjectResourceFilters, submitProjectResourceFilters }} />
  ) : null;

  if (loading && !shellReady) {
    return <AppShellSkeleton />;
  }

  return (
    <div className="app-shell" aria-busy={loading || refreshing}>
      {/* 页面横幅已经说明加载失败时，同文案的全局提示只会重复；并发请求会在横幅出现后继续触发提示，所以在渲染时过滤。 */}
      <ErrorToast open={Boolean(apiErrorToast) && !(error && errorMessage(error) === apiErrorToast?.message)} message={apiErrorToast?.message || ''} onClose={() => setApiErrorToast(null)} />
      <p className="shell-live-region" role="status" aria-live="polite">
        {statusMessage || (refreshing ? '正在刷新页面数据。' : '')}
      </p>

      <AppSidebar
        productName="元策"
        groups={sidebarGroups}
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        onNavigate={(event, path, label) => handleNavigate(event, path, `已切换到${label}。`)}
      />

      <div className="app-shell__body">
      <GlobalNavigation
        currentProject={currentProject}
        projectOptions={topbar?.project_options || []}
        projectsHref={projectsPath}
        messagesHref={messagesPath}
        unreadCount={unreadCount}
        notifications={previewItems.map((item) => ({ ...item, createdAt: formatTimestamp(item.created_at) }))}
        notificationBusy={messageReadAllSubmitting || messageOpeningId !== null}
        projectSwitchingKey={projectSwitchingKey}
        user={user}
        profileHref={profilePath}
        theme={theme}
        onNavigate={(event, path, label) => handleNavigate(event, path, `已切换到${label}。`)}
        onSearch={(query) => navigate(buildSearchPath({ owner: route.owner, q: query }), query ? '正在搜索 ' + query + '。' : '请输入搜索内容。')}
        onProjectChange={(project) => void handleSetCurrentProject(project)}
        onOpenNotification={(notification) => {
          const item = previewItems.find((candidate) => candidate.id === notification.id);
          if (item) void handleOpenNotification(item);
        }}
        onMarkAllRead={() => void handleMarkAllRead()}
        onThemeChange={handleThemeChange}
        onLogout={handleLogout}
        onToggleNavigation={() => setSidebarOpen((open) => !open)}
        navigationOpen={sidebarOpen}
      />

      <main ref={mainScrollbar.ref} className="main yc-overlay-scroll-target">
      <div className="main-content">

      {loading && route.id !== 'project-resource-detail' ? (
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
          <Button variant="secondary" size="sm" className="shell-banner-retry" loading={refreshing} onClick={() => { setRefreshing(true); void loadRouteState(routeRef.current, 'refresh'); }}>重试</Button>
        </section>
      ) : null}

      {!isWorkItemListRouteId(route.id) && !['home', 'unsupported', 'messages', 'search', 'profile', 'projects', 'project-detail', 'project-cycle-detail', 'project-resource-detail', 'project-resource-library', 'project-personal-analysis', 'time-management', 'system-dashboard', 'system-users', 'system-permissions', 'system-roles', 'system-database-stats', 'system-audit', 'system-storage', 'system-openapi', 'work-item-detail'].includes(route.id) ? <header className="page-heading"><h1 ref={headingRef} tabIndex={-1}>{route.title}</h1><button className="page-heading-refresh" type="button" aria-label="刷新" title="刷新" disabled={refreshing} onClick={() => void loadRouteState(routeRef.current, 'refresh')}>↻</button></header> : null}

      {route.id === 'unsupported' ? (
        <section className="page-stack not-found-page" aria-labelledby="unsupported-title">
          <EmptyState
            icon={<Icon name="alert" />}
            title={<h1 id="unsupported-title" ref={headingRef} tabIndex={-1}>页面不存在</h1>}
            description={`没有找到地址 ${route.pathname}${route.search} 对应的页面，可能是链接有误或页面已调整。`}
            action={<a className="yc-button yc-button-primary" href={homePath} onClick={(event) => handleNavigate(event, homePath, '已返回工作台。')}>返回工作台</a>}
          />
        </section>
      ) : (
        <>
          {route.id === 'time-management' ? (
            <TimeManagementPage ctx={{ OverlayScrollTarget, changeTimeManagementChangesPageSize, confirmTimeChangeRestore, headingRef, loadTimeManagementChanges, persistTimeCreate, persistTimeDelete, persistTimeSave, persistTimeUpdate, setTimeChangeRestoreError, setTimeChangeRestoreTarget, setTimeChangesOpen, timeAllocations, timeChangeRestoreError, timeChangeRestoreTarget, timeChangeRestoring, timeChangesError, timeChangesLoading, timeChangesOpen, timeChangesPage, timeMembers, timeProjects, user }} />
          ) : route.id === 'project-resource-library' ? (
            <section className="page-stack project-resource-library-page" aria-label="项目资料库">
              {activeProjectDetail ? projectResourcesPanel : projectResourceError ? <Feedback tone="danger" title="资料库加载失败">{projectResourceError}</Feedback> : <p className="shell-empty">当前项目资料库不可用。</p>}
            </section>
          ) : route.id === 'system-permissions' ? (
            <SystemPermissionsPage ctx={{ handleNavigate, headingRef, navigate, route, systemPermissionGroups, systemPermissions }} />
          ) : route.id === 'system-database-stats' ? (
            <SystemDatabaseStatsPage ctx={{ headingRef, refreshSystemDatabaseStats, systemDatabaseStats, systemDatabaseStatsError, systemDatabaseStatsRefreshing, systemDatabaseTables, systemDatabaseTotalRows }} />
          ) : route.id === 'system-audit' ? (
            <SystemAuditPage ctx={{ FormData, headingRef, navigate, route, systemAuditPage }} />
          ) : route.id === 'system-api-docs' ? (
            <SystemApiDocsPage ctx={{ OverlayScrollTarget, handleNavigate, route, systemApiDocs }} />
          ) : route.id === 'system-openapi' ? (
            <SystemOpenApiPage ctx={{ confirmSystemApiTokenDelete, createdSystemApiToken, handleNavigate, headingRef, openSystemApiTokenCreate, openSystemApiTokenEdit, route, runtime, setCreatedSystemApiToken, setSystemApiTokenDeleteTarget, setSystemApiTokenEditor, setSystemApiTokenError, setSystemApiTokenForm, submitSystemApiToken, systemApiTokenDeleteTarget, systemApiTokenDirty, systemApiTokenEditor, systemApiTokenError, systemApiTokenForm, systemApiTokenSubmitting, systemOpenApiView, toggleSystemApiTokenScope }} />
          ) : route.id === 'system-storage' ? (
            <SystemStoragePage ctx={{ closeSystemStorageEdit, confirmSystemStorageAction, headingRef, navigate, openSystemStorageEdit, probeSystemStorage, requestSystemStorageSave, route, setSystemStorageConfirmation, setSystemStorageForm, systemStorageConfirmation, systemStorageDirty, systemStorageEditOpen, systemStorageError, systemStorageForm, systemStorageSubmitting, systemStorageView }} />
          ) : route.id === 'system-roles' ? (
            <SystemRolesPage ctx={{ confirmSystemRoleStatus, handleNavigate, headingRef, navigate, route, runtime, setSystemRoleCreateForm, setSystemRoleCreateOpen, setSystemRoleError, setSystemRoleStatusTarget, submitSystemRoleCreate, submitSystemRolePermissions, systemRoleCreateDirty, systemRoleCreateForm, systemRoleCreateOpen, systemRoleError, systemRolePermissionGroups, systemRolePermissionKeys, systemRoleStatusTarget, systemRoleSubmitting, systemRolesView, toggleSystemRolePermission, toggleSystemRolePermissionGroup }} />
          ) : route.id === 'system-users' ? (
            <SystemUsersPage ctx={{ closeSystemUserAction, closeSystemUserCreate, closeSystemUserProjects, confirmSystemUserProjectRemove, confirmSystemUserStatus, headingRef, navigate, openSystemUserProjects, route, runtime, setSystemUserAction, setSystemUserCreateForm, setSystemUserCreateOpen, setSystemUserError, setSystemUserPasswordForm, setSystemUserProjectAssignKeys, setSystemUserProjectAssignRole, setSystemUserProjectDialog, setSystemUserProjectRemoveKeys, setSystemUserProjectRole, setSystemUserRoleCode, submitSystemUserCreate, submitSystemUserPassword, submitSystemUserProjectAssign, submitSystemUserProjectRole, submitSystemUserRole, systemUserAction, systemUserAssignableProjects, systemUserCreateDirty, systemUserCreateForm, systemUserCreateOpen, systemUserError, systemUserPasswordForm, systemUserProjectAssignKeys, systemUserProjectAssignRole, systemUserProjectDialog, systemUserProjectRemoveKeys, systemUserProjectRole, systemUserProjectTarget, systemUserRoleCode, systemUserSubmitting, systemUsersView }} />
          ) : route.id === 'system-dashboard' ? (
            <SystemDashboardPage ctx={{ handleNavigate, headingRef, route, systemDashboard }} />
          ) : route.id === 'messages' ? (
            <MessagesPage ctx={{ changeMessageFilter, changeMessagePage, changeMessagePageSize, handleMarkAllRead, handleOpenNotification, headingRef, messageActionError, messageFeed, messageFilter, messageOpeningId, messageReadAllSubmitting, messageRoute, pageRangeEnd, pageRangeStart, pendingCount, refreshing, route }} />
          ) : route.id === 'search' ? (
            <SearchPage ctx={{ handleNavigate, headingRef, homePath, navigate, route, searchPage, searchResultGroups, searchRoute }} />
          ) : route.id === 'profile' ? (
            <ProfilePage ctx={{ accountConfirmation, accountSecurityError, accountSecuritySubmitting, apiTokens, confirmAccountAction, createdRawToken, dashboard, handleNavigate, headingRef, passwordDirty, passwordForm, passwordModalOpen, profile, profileDirty, profileError, profileForm, profileModalOpen, profileSubmitting, route, runtime, setAccountConfirmation, setAccountSecurityError, setCreatedRawToken, setPasswordForm, setPasswordModalOpen, setProfileError, setProfileForm, setProfileModalOpen, setTokenForm, setTokenModalOpen, submitPassword, submitProfile, submitToken, tokenDirty, tokenForm, tokenModalOpen, user }} />
          ) : route.id === 'projects' ? (
            <ProjectsPage ctx={{ changeProjectPage, changeProjectPageSize, currentProject, handleNavigate, handleSetCurrentProject, headingRef, projectCreateDirty, projectCreateError, projectCreateForm, projectCreateOpen, projectCreateSubmitting, projectMetrics, projectPage, projectRangeEnd, projectRangeStart, projectRoute, projectSwitchingKey, route, runtime, setProjectCreateError, setProjectCreateForm, setProjectCreateOpen, submitProjectCreate, submitProjectSearch }} />
          ) : route.id === 'project-detail' ? (
            <ProjectDetailPage ctx={{ OverlayScrollTarget, activeProjectDetail, canManageProject, confirmProjectCycleClose, confirmProjectMemberRemove, handleNavigate, headingRef, openProjectCycle, openProjectEdit, openProjectMemberDialog, persistProjectTimeCreate, persistProjectTimeDelete, persistProjectTimeUpdate, personalAnalysisPath, projectCycleCloseTarget, projectCycleDirty, projectCycleForm, projectCycleOpen, projectCycles, projectEditDirty, projectEditForm, projectEditOpen, projectMemberCandidateError, projectMemberCandidateLoading, projectMemberCandidateSearch, projectMemberCandidates, projectMemberForm, projectMemberOpen, projectMemberRemoveTarget, projectMemberSelectedUsernames, projectMemberTarget, projectMembers, projectMutationError, projectMutationSubmitting, projectTimeAllocations, projectTimeAllocationsError, route, runtime, setProjectCycleCloseTarget, setProjectCycleForm, setProjectCycleOpen, setProjectEditForm, setProjectEditOpen, setProjectMemberCandidateSearch, setProjectMemberForm, setProjectMemberOpen, setProjectMemberRemoveTarget, setProjectMemberSelectedUsernames, setProjectMemberTarget, setProjectMutationError, submitProjectCycle, submitProjectEdit, submitProjectMember, submitProjectMemberRole, visibleProjectMemberCandidates }} />
          ) : route.id === 'project-personal-analysis' ? (
            <ProjectPersonalAnalysisPage ctx={{ activeProjectDetail, handleNavigate, headingRef, personalAnalysisPendingLinks, personalAnalysisPendingTotal, projectPersonalAnalysis, projectScopeKey, route, user }} />
          ) : route.id === 'project-resource-detail' ? (
            <ProjectResourceDetailPage ctx={{ AttachmentPreview, OverlayScrollTarget, activateProjectResourceInlineAttachment, appendProjectResourceAccess, canManageProjectContent, closeProjectResourceFileMenu, downloadProjectResourceAttachment, handleNavigate, headingRef, navigateProjectResourceAttachmentPreview, openProjectResourceFileMenu, openProjectResourceForm, projectAttachmentPreview, projectResourceAttachmentUploading, projectResourceDetail, projectResourceDownloadingId, projectResourceError, projectResourceFileMenu, projectResourceFileMenuCanPreview, projectResourceFileMenuDownloadHandler, projectResourceLocked, projectResourcePassword, projectResourceRelatedWorkItem, projectResourceStatus, projectResourceSubmitting, projectResourceTitleIsInBody, projectResourceUnlocking, releaseProjectAttachmentPreview, resolveProjectResourceInlineAttachmentSource, resourceFallbackPath, route, setProjectResourceArchiveTarget, setProjectResourceError, setProjectResourcePassword, setProjectResourcePasswordResetForm, setProjectResourcePasswordResetOpen, setStatusMessage, submitProjectResourceUnlock, user }} />
          ) : route.id === 'project-cycle-detail' ? (
            <ProjectCycleDetailPage ctx={{ activeProjectDetail, cycleBackPath, cycleFallbackPath, cycleMemberLoad, cyclePace, handleNavigate, headingRef, projectCycleDetail, projectMutationError, route }} />
          ) : isWorkItemListRouteId(route.id) ? (
            <section className="page-stack work-item-list-page" aria-labelledby="work-item-center-title">
              <div className="page-head">
                <div className="page-head__text">
                  <h1 id="work-item-center-title" ref={headingRef} tabIndex={-1}>{workItemTypeLabel(route.itemType)}</h1>
                  <p className="page-head__desc">项目：{workItemListProject ? `${workItemListProject.key} · ${workItemListProject.name}` : '未选择项目'}，组合筛选、优先级、负责人和截止日期，以最快速度定位目标{workItemTypeLabel(route.itemType)}。</p>
                </div>
                <div className="page-head__actions">
                  {workItemPage?.can_manage_work_items ? <Button disabled={workItemCreateSubmitting} onClick={openWorkItemCreate}>{workItemCreateLabel(route.itemType)}</Button> : null}
                </div>
              </div>

              {workItemPage ? <section className="metric-grid work-item-list-metrics" aria-label="工作项概览">
                <Metric label={`全部${workItemTypeLabel(route.itemType)}`} value={workItemPage.summary.total_items} delta={`项目 ${workItemListProject?.key || '未选择'}`} icon={<Icon name="inbox" />} variant="brand" />
                <Metric label="待处理 / 进行中 / 待确认" value={workItemPage.summary.active_items} delta="未完成工作项" icon={<Icon name="task" />} variant="warning" />
                <Metric label="高优先级" value={workItemPage.summary.high_priority_items} delta="P0 / P1" icon={<Icon name="alert" />} variant="danger" />
                <Metric label="已完成" value={workItemPage.summary.completed_items} delta="已完成 / 已验证" icon={<Icon name="check" />} variant="success" />
              </section> : null}

              {workItemPage ? <>
                <Panel title="筛选条件" description={workItemFilterSummary(workItemPage?.filters, route)}>

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
                </Panel>

                <Panel title={`${workItemTypeLabel(route.itemType)}列表`} description={`共 ${workItemPage.pagination.total_items || 0} 条`} flush>
              {workItemPage?.items?.length ? (
                <>
                  {workItemPage.can_manage_work_items ? <div className="work-item-batch-bar" aria-label="批量操作">
                    <label className="work-item-batch-select-all"><input type="checkbox" checked={currentWorkItemPageSelected} onChange={(event) => toggleCurrentWorkItemPage(event.target.checked)} /> 选择当前页</label>
                    <strong>已选择 {workItemSelection.size} 项</strong>
                    <span className="work-item-batch-label">更新字段</span>
                    <Select aria-label="批量操作类型" value={workItemBatchForm.action} disabled={workItemBatchSubmitting} onChange={changeWorkItemBatchAction}>
                      <option value="priority">修改优先级</option><option value="status">修改状态</option><option value="assignee">修改处理人</option><option value="cycle">修改周期</option>
                    </Select>
                    <span className="work-item-batch-label">目标值</span>
                    {workItemBatchForm.action === 'priority' ? <Select aria-label="目标优先级" value={workItemBatchForm.value} disabled={workItemBatchSubmitting} onChange={(event) => setWorkItemBatchForm((current) => ({ ...current, value: event.target.value }))}><option value="P0">P0</option><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option></Select> : null}
                    {workItemBatchForm.action === 'status' ? <Select aria-label="目标状态" value={workItemBatchForm.value} disabled={workItemBatchSubmitting} onChange={(event) => setWorkItemBatchForm((current) => ({ ...current, value: event.target.value }))}><option value="open">待处理</option><option value="in_progress">进行中</option><option value="pending_confirmation">待确认</option>{route.itemType === 'bug' ? <><option value="resolved">已解决</option><option value="verified">已验证</option></> : <option value="done">已完成</option>}<option value="closed">已关闭</option></Select> : null}
                    {workItemBatchForm.action === 'assignee' ? <Select aria-label="目标处理人" value={workItemBatchForm.value} disabled={workItemBatchSubmitting} onChange={(event) => setWorkItemBatchForm((current) => ({ ...current, value: event.target.value }))}><option value="">请选择处理人</option>{workItemPage.assignees.map((assignee) => <option key={assignee.username} value={assignee.username}>{assignee.display_name} · {assignee.username}</option>)}</Select> : null}
                    {workItemBatchForm.action === 'cycle' ? <Select aria-label="目标周期" value={workItemBatchForm.value} disabled={workItemBatchSubmitting} onChange={(event) => setWorkItemBatchForm((current) => ({ ...current, value: event.target.value }))}><option value="">取消周期关联</option>{workItemPage.cycles.map((cycle) => <option key={cycle.id} value={String(cycle.id)}>{cycle.name}{cycle.is_closed ? ' · 已关闭' : ''}</option>)}</Select> : null}
                    <Button disabled={workItemSelection.size === 0 || workItemBatchSubmitting || (workItemBatchForm.action === 'assignee' && !workItemBatchForm.value)} onClick={() => setWorkItemBatchConfirmOpen(true)}>应用</Button>
                    {workItemSelection.size ? <Button variant="secondary" disabled={workItemBatchSubmitting} onClick={() => setWorkItemSelection(new Set())}>清空选择</Button> : null}
                  </div> : null}
                  {workItemBatchError ? <Feedback tone="danger" title="部分工作项未更新">{workItemBatchError}</Feedback> : null}
                  <div ref={workTableRef} className="yc-table-wrap work-table-wrap yc-overlay-scroll-target"><table className="yc-table work-item-table" aria-label={route.title}><thead><tr>{workItemPage.can_manage_work_items ? <th className="work-table-select"><span className="visually-hidden">选择</span></th> : null}<th>编号</th><th className="work-table-title">标题</th><th>状态</th><th>优先级</th><th>处理人</th><th>截止</th><th>更新</th><th className="work-table-actions">操作</th></tr></thead><tbody>{workItemPage.items.map((item) => { const detailPath = buildWorkItemDetailPath({ owner: workItemOwner, itemKey: item.key }); return <tr key={item.key} className="work-item-row">{workItemPage.can_manage_work_items ? <td className="work-table-select"><input className="work-item-selection-checkbox" type="checkbox" aria-label={`选择 ${item.key}`} checked={workItemSelection.has(item.key)} onChange={(event) => toggleWorkItemSelection(item.key, event.target.checked)} /></td> : null}<td><div className="work-table-key"><Badge>{workItemTypeLabel(item.item_type)}</Badge><code>{item.key}</code></div></td><td className="work-table-title"><a className="work-table-title-link" href={detailPath} onClick={(event) => handleNavigate(event, detailPath, `已打开 ${item.key}。`)}>{item.title}</a></td><td><StatusPill tone={workItemStatusPillTone(item.status)}>{workItemStatusLabel(item.status)}</StatusPill></td><td><PriorityBadge priority={item.priority} /></td><td>{item.assignee || '未分配'}</td><td className="work-table-muted">{item.due_date || '—'}</td><td className="work-table-muted">{formatTimestamp(item.updated_at)}</td><td className="work-table-actions"><a className="yc-button yc-button-secondary yc-button-sm" href={detailPath} onClick={(event) => handleNavigate(event, detailPath, `已打开 ${item.key}。`)}>打开详情</a></td></tr>; })}</tbody></table></div>{workTableScrollbar.scrollbar}

                  <div className="work-item-list-pager">
                    <Pagination ariaLabel="工作项分页" page={workItemPage.pagination.page} totalPages={workItemPage.pagination.total_pages} totalItems={workItemPage.pagination.total_items} rangeLabel={`当前显示 ${workItemRangeStart}-${workItemRangeEnd}`} pageSize={workItemPage.pagination.per_page} onPageSizeChange={changeWorkItemPageSize} onPageChange={changeWorkItemPage} />
                  </div>
                </>
              ) : (
                (route.q || route.status || route.priority || route.assigneeUsername || route.cycleId) ? (
                  <EmptyState icon={<Icon name="inbox" />} title={`没有匹配的${workItemTypeLabel(route.itemType)}`} description="当前筛选条件下没有匹配项，可以调整筛选条件或清除筛选后查看。" action={<Button variant="secondary" onClick={resetWorkItemFilters}>清除筛选</Button>} />
                ) : (
                  <EmptyState icon={<Icon name="inbox" />} title={`暂无${workItemTypeLabel(route.itemType)}`} description={workItemPage?.can_manage_work_items ? `这个项目还没有${workItemTypeLabel(route.itemType)}，新建后会显示在这里。` : `这个项目还没有${workItemTypeLabel(route.itemType)}。`} action={workItemPage?.can_manage_work_items ? <Button onClick={openWorkItemCreate}>{workItemCreateLabel(route.itemType)}</Button> : null} />
                )
              )}
                </Panel>
              </> : null}
              <Modal open={workItemBatchConfirmOpen} title="确认批量更新" onClose={() => { if (!workItemBatchSubmitting) setWorkItemBatchConfirmOpen(false); }} footer={<><Button variant="secondary" disabled={workItemBatchSubmitting} onClick={() => setWorkItemBatchConfirmOpen(false)}>取消</Button><Button loading={workItemBatchSubmitting} onClick={() => void confirmWorkItemBatchUpdate()}>确认更新</Button></>}><p>将对已选择的 {workItemSelection.size} 个工作项执行批量更新。</p><p className="work-item-batch-confirm-target">{workItemBatchChangeSummary(workItemBatchForm.action, workItemBatchForm.value, workItemSelection.size, workItemPage?.assignees || [], workItemPage?.cycles || [])}</p><p>每个工作项独立提交，未成功的项目会保留选择。</p></Modal>
              <Modal open={workItemCreateDiscardOpen} title="放弃未保存的内容？" onClose={() => setWorkItemCreateDiscardOpen(false)} footer={<><Button variant="secondary" onClick={() => setWorkItemCreateDiscardOpen(false)}>继续编辑</Button><Button variant="danger" onClick={() => closeWorkItemCreate({ discard: true })}>放弃并关闭</Button></>}><p>已填写的标题和说明内容尚未创建，关闭后将无法恢复。</p></Modal>
              <Modal wide open={workItemCreateOpen} title={workItemCreateLabel(route.itemType)} onClose={() => closeWorkItemCreate()} footer={<><Button variant="secondary" disabled={workItemCreateSubmitting || workItemCreatePasteUploading} onClick={() => closeWorkItemCreate()}>{workItemCreateCheckpoint ? '转到详情' : '取消'}</Button><Button loading={workItemCreateSubmitting} disabled={workItemCreateSubmitting || workItemCreatePasteUploading} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('work-item-create-form'))?.requestSubmit()}>创建</Button></>}>
                <form id="work-item-create-form" className="work-item-create-form" onSubmit={submitWorkItemCreate}>
                  {workItemListProject ? <p className="work-item-create-scope">将创建在项目 <strong>{workItemListProject.name}</strong> <code>{workItemListProject.key}</code></p> : null}
                  <div className="work-item-create-fields">
                    <Field id="work-item-create-title" label="标题" required><TextInput id="work-item-create-title" maxLength={160} value={workItemCreateForm.title} disabled={workItemCreateSubmitting} data-autofocus="" onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} onChange={(event) => setWorkItemCreateForm((current) => ({ ...current, title: event.target.value }))} /></Field>
                    <Field id="work-item-create-priority" label="优先级" required><Select id="work-item-create-priority" value={workItemCreateForm.priority} disabled={workItemCreateSubmitting} onChange={(event) => setWorkItemCreateForm((current) => ({ ...current, priority: event.target.value }))}><option value="P0">P0 · 紧急</option><option value="P1">P1 · 高</option><option value="P2">P2 · 中</option><option value="P3">P3 · 低</option></Select></Field>
                    <Field id="work-item-create-cycle" label="周期"><Select id="work-item-create-cycle" value={workItemCreateForm.cycleId} disabled={workItemCreateSubmitting || workItemCreatePasteUploading} onChange={(event) => setWorkItemCreateForm((current) => ({ ...current, cycleId: event.target.value }))}><option value="">不关联</option>{(workItemPage?.cycles || []).map((cycle) => <option key={cycle.id} value={String(cycle.id)}>{cycle.name}{cycle.is_closed ? ' · 已关闭' : ''}</option>)}</Select></Field>
                    <Field id="work-item-create-due-date" label="截止日期"><TextInput id="work-item-create-due-date" type="date" value={workItemCreateForm.dueDate} disabled={workItemCreateSubmitting} onChange={(event) => setWorkItemCreateForm((current) => ({ ...current, dueDate: event.target.value }))} /></Field>
                    <Field id="work-item-create-assignee" label="处理人"><Select id="work-item-create-assignee" searchable searchPlaceholder="搜索处理人" value={workItemCreateForm.assigneeUsername} disabled={workItemCreateSubmitting} onChange={(event) => setWorkItemCreateForm((current) => ({ ...current, assigneeUsername: event.target.value }))}><option value="">默认指派给我</option>{(workItemPage?.assignees || []).map((assignee) => <option key={assignee.username} value={assignee.username}>{assignee.display_name} · {assignee.username}</option>)}</Select></Field>
                    {route.itemType === 'task' ? <Field id="work-item-create-parent" label="父级需求"><Select id="work-item-create-parent" value={workItemCreateForm.parentItemKey} disabled={workItemCreateSubmitting} onChange={(event) => setWorkItemCreateForm((current) => ({ ...current, parentItemKey: event.target.value }))}><option value="">不关联</option>{(workItemPage?.parent_options || []).map((item) => <option key={item.key} value={item.key}>{item.key} · {item.title}</option>)}</Select></Field> : null}
                  </div>
                  <div className="yc-field yc-rich-field"><label htmlFor="work-item-create-description">说明内容</label><RichTextEditor id="work-item-create-description" value={workItemCreateForm.description} disabled={workItemCreateSubmitting} label="说明内容" onPasteFile={(file, options) => pasteWorkItemCreateFile(file, options)} onChange={(description) => { workItemCreateDescriptionRef.current = description; setWorkItemCreateForm((current) => ({ ...current, description })); }} /></div>
                  {workItemCreateError ? <Feedback tone="danger" title="创建失败">{workItemCreateError}</Feedback> : null}
                </form>
              </Modal>
              </section>
          ) : route.id === 'work-item-detail' ? (
            <WorkItemDetailPage ctx={{ AttachmentPreview, activateWorkItemCommentInlineAttachment, activateWorkItemPrimaryPostInlineAttachment, activeWorkItemDetail, activeWorkItemDetailView, activeWorkItemResourceLibraryLink, cancelWorkItemCommentDraft, cancelWorkItemCommentEdit, cancelWorkItemCommentReply, changeWorkItemEditComment, changeWorkItemEditField, changeWorkItemHandoffField, changeWorkItemNewComment, confirmWorkItemCommentAttachmentDelete, detailBackPath, documentViewer, downloadWorkItemAttachment, downloadWorkItemCommentAttachment, handleNavigate, navigateWorkItemAttachmentPreview, navigateWorkItemCommentAttachmentPreview, openWorkItemAttachmentPreview, openWorkItemCommentAttachmentPreview, pasteWorkItemCommentFile, pasteWorkItemPrimaryPostFile, projectAttachmentPreview, recordWorkItemTypingActivity, releaseProjectAttachmentPreview, requestWorkItemCommentAttachmentDelete, requestWorkItemResourceLibraryLink, resolveWorkItemCommentInlineAttachmentSource, resolveWorkItemPrimaryPostInlineAttachmentSource, setWorkItemCommentAttachmentDeleteTarget, setWorkItemEditForm, setWorkItemLifecycleAction, setWorkItemNewCommentAssignStatus, setWorkItemReplyAssignStatus, setWorkItemReplyCommentBody, startWorkItemCommentEdit, startWorkItemCommentReply, startWorkItemTyping, stopWorkItemTyping, submitWorkItemComment, submitWorkItemCommentEdit, submitWorkItemCommentReply, submitWorkItemEdit, submitWorkItemHandoff, uploadSelectedWorkItemAttachment, uploadSelectedWorkItemCommentAttachment, user, workItemActionError, workItemAttachmentActionError, workItemAttachmentDownloadingId, workItemAttachmentLoadWarning, workItemAttachmentStatus, workItemAttachmentUploading, workItemAttachments, workItemCommentActionError, workItemCommentAttachmentDeleteTarget, workItemCommentAttachmentDeletingId, workItemCommentAttachmentDownloadingKey, workItemCommentAttachmentStatus, workItemCommentAttachmentUploadingId, workItemCommentAttachments, workItemCommentSubmitting, workItemComments, workItemEditCommentBody, workItemEditCommentSubmitting, workItemEditForm, workItemEditSubmitting, workItemEditingCommentId, workItemHandoffForm, workItemHandoffSubmitting, workItemMutationSubmitting, workItemNewCommentAssignStatus, workItemNewCommentAttachmentUploading, workItemNewCommentBody, workItemNewCommentDraftId, workItemOwner, workItemProjectPath, workItemReplyAssignStatus, workItemReplyCommentBody, workItemReplySubmitting, workItemReplyingToCommentId, workItemResourceLibrarySubmitting, workItemTyping, workItemWorkbenchPath }} />
          ) : route.id === 'home' ? (
            <HomePage ctx={{ currentProject, dashboard, dashboardQueuePath, dashboardTableRef, dashboardTableScrollbar, handleNavigate, handleOpenNotification, headingRef, loadRouteState, messageOpeningId, messagesPath, projectsPath, route, routeRef, setProjectCreateOpen, user }} />
          ) : (
            <section className="shell-card shell-panel-wide"><h1 ref={headingRef} tabIndex={-1}>{route.title}</h1><p className="shell-muted">{routeDescription(route)}</p></section>
          )}
          <Modal open={Boolean(workItemLifecycleAction)} title={workItemLifecycleAction === 'close' ? '关闭工作项' : workItemLifecycleAction === 'reopen' ? '重新打开工作项' : '恢复工作项'} onClose={() => { if (!workItemLifecycleSubmitting) setWorkItemLifecycleAction(null); }} footer={<><Button variant="secondary" disabled={workItemLifecycleSubmitting} onClick={() => setWorkItemLifecycleAction(null)}>取消</Button><Button variant={workItemLifecycleAction === 'close' ? 'danger' : 'primary'} loading={workItemLifecycleSubmitting} onClick={() => void confirmWorkItemLifecycleAction()}>确认</Button></>}><p>确认{workItemLifecycleAction === 'close' ? '关闭' : workItemLifecycleAction === 'reopen' ? '重新打开' : '恢复'}“{activeWorkItemDetail?.key} · {activeWorkItemDetail?.title}”？</p></Modal>
          <Modal wide open={projectResourceModalOpen} dirty={projectResourceDirty} title={projectResourceForm.id ? '编辑项目资料' : '新建项目资料'} onClose={closeProjectResourceForm} footer={<><Button variant="secondary" disabled={projectResourceSubmitting || projectResourcePasteUploading} onClick={closeProjectResourceForm}>{projectResourceCreateCheckpoint ? '转到资料详情' : '取消'}</Button><Button loading={projectResourceSubmitting} disabled={projectResourceSubmitting || projectResourcePasteUploading} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('project-resource-form'))?.requestSubmit()}>保存</Button></>}>
            <form id="project-resource-form" className="project-resource-form" onSubmit={submitProjectResource}>
              <div className="project-resource-form-fields">
                <Field id="project-resource-title" label="资料标题" required><TextInput value={projectResourceForm.title} maxLength={120} onChange={(event) => setProjectResourceForm((current) => ({ ...current, title: event.target.value }))} /></Field>
                <Field id="project-resource-category" label="分类" required><Select value={projectResourceForm.category} onChange={(event) => setProjectResourceForm((current) => ({ ...current, category: event.target.value }))}><option value="integration">集成</option><option value="customer">客户</option><option value="meeting">会议</option><option value="implementation">实施</option><option value="other">其他</option></Select></Field>
                <Field id="project-resource-tags" label="标签"><TextInput value={projectResourceForm.tagsText} placeholder="多个标签使用逗号分隔" onChange={(event) => setProjectResourceForm((current) => ({ ...current, tagsText: event.target.value }))} /></Field>
                {projectResourceForm.id ? <Field id="project-resource-password-action" label="密码处理方式" required><Select value={projectResourceForm.accessPasswordAction} onChange={(event) => setProjectResourceForm((current) => ({ ...current, accessPasswordAction: event.target.value, accessPassword: '' }))}><option value="keep">保持不变</option><option value="set">设置密码</option><option value="clear">清除密码</option></Select></Field> : null}
                {(!projectResourceForm.id || projectResourceForm.accessPasswordAction === 'set') ? <Field id="project-resource-access-password" label={projectResourceForm.id ? '新访问密码' : '初始访问密码'}><TextInput type="password" autoComplete="new-password" minLength={projectResourceForm.accessPassword ? 4 : undefined} maxLength={128} value={projectResourceForm.accessPassword} onChange={(event) => setProjectResourceForm((current) => ({ ...current, accessPassword: event.target.value }))} /></Field> : null}
              </div>
              <div className="yc-field yc-rich-field"><label htmlFor="project-resource-body">资料正文<span aria-hidden="true"> *</span></label><RichTextEditor id="project-resource-body" value={projectResourceForm.body} disabled={projectResourceSubmitting} required sectionLinks onPasteFile={pasteProjectResourceFile} onChange={(body) => setProjectResourceForm((current) => ({ ...current, body, bodyFormat: 'html' }))} /></div>
            </form>
          </Modal>
          <Modal open={Boolean(projectResourceArchiveTarget)} title="归档项目资料" onClose={() => { if (!projectResourceSubmitting) setProjectResourceArchiveTarget(null); }} footer={<><Button variant="secondary" disabled={projectResourceSubmitting} onClick={() => setProjectResourceArchiveTarget(null)}>取消</Button><Button variant="danger" loading={projectResourceSubmitting} onClick={() => void confirmProjectResourceArchive()}>确认归档</Button></>}><p>确认归档资料“{projectResourceArchiveTarget?.title}”？归档后不能继续编辑，但资料记录会保留。</p></Modal>
          <Modal open={projectResourcePasswordResetOpen} title="重置资料访问密码" onClose={() => { if (!projectResourceSubmitting) { setProjectResourcePasswordResetOpen(false); setProjectResourcePasswordResetForm({ accessPasswordAction: 'set', accessPassword: '' }); } }} footer={<><Button variant="secondary" disabled={projectResourceSubmitting} onClick={() => setProjectResourcePasswordResetOpen(false)}>取消</Button><Button variant="danger" loading={projectResourceSubmitting} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('project-resource-password-reset-form'))?.requestSubmit()}>确认重置</Button></>}>
            <form id="project-resource-password-reset-form" onSubmit={submitProjectResourcePasswordReset}>
              <p>此操作仅限超级管理员。设置或清除密码会立即改变其他宿主后续访问此资料的方式，并记录安全审计。</p>
              <Field id="project-resource-password-reset-action" label="重置方式" required><Select value={projectResourcePasswordResetForm.accessPasswordAction} onChange={(event) => setProjectResourcePasswordResetForm({ accessPasswordAction: event.target.value, accessPassword: '' })}><option value="set">设置新密码</option><option value="clear">清除密码保护</option></Select></Field>
              {projectResourcePasswordResetForm.accessPasswordAction === 'set' ? <Field id="project-resource-password-reset-value" label="新访问密码" required><TextInput type="password" autoComplete="new-password" minLength={4} maxLength={128} value={projectResourcePasswordResetForm.accessPassword} onChange={(event) => setProjectResourcePasswordResetForm((current) => ({ ...current, accessPassword: event.target.value }))} /></Field> : null}
            </form>
          </Modal>
          <Modal open={Boolean(appUpdatePrompt)} title="发现新版本" onClose={closeAppUpdatePrompt} footer={<><Button variant="secondary" onClick={closeAppUpdatePrompt}>稍后刷新</Button><Button onClick={confirmAppUpdateRefresh}>立即刷新</Button></>}>
            <div className="app-update-copy"><p>系统已发布新版本。刷新后可继续使用最新功能。</p></div>
            <div className="app-update-meta" aria-label="版本信息">
              <div className="app-update-meta-item"><span>当前版本</span><strong>{runtime.readAppReleaseVersion?.() || '--'}</strong></div>
              <div className="app-update-meta-arrow" aria-hidden="true" />
              <div className="app-update-meta-item is-next"><span>最新版本</span><strong>{appUpdatePrompt?.version || '--'}</strong></div>
            </div>
          </Modal>
        </>
      )}
        </>
      )}
      </div>
      </main>
      {mainScrollbar.scrollbar}
      </div>
    </div>
  );
}
