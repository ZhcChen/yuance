// @ts-check

import {
  ApiError,
  createApiClient,
} from '@yuance/frontend-api-client';
import { createBrowserApiTransport } from '../platform/browser/api-transport.js';
import { createBrowserEvents } from '../platform/browser/events.js';

export { ApiError };

/** @typedef {{ id: number, username: string, display_name: string, is_super_admin: boolean }} AuthUser */
/** @typedef {{ project_key: string, pending_count: number }} TopbarProjectBadge */
/** @typedef {{ key: string, name: string, pending_count: number }} TopbarCurrentProject */
/** @typedef {{ requirements_count: number, tasks_count: number, bugs_count: number, notifications_count: number, project_badges: TopbarProjectBadge[], current_project: TopbarCurrentProject | null }} TopbarStatus */
/** @typedef {{ kind: 'work_item', project_key: string, work_item_key: string, comment_id: number | null }} NotificationTarget */
/** @typedef {{ id: number, kind: string, title: string, body: string, actor: string, created_at: string, read: boolean, target: NotificationTarget | null }} NotificationItem */
/** @typedef {{ items: NotificationItem[], unread_count: number, pending_count: number, filter: string, page: number, per_page: number, total_items: number, total_pages: number }} NotificationFeed */
/** @typedef {{ notification_id: number, read: boolean, target: NotificationTarget | null }} NotificationTargetPayload */
/** @typedef {{ key: string, item_type: string, title: string, status: string, priority: string, project_key: string, project_name: string, assignee: string, updated_at: string }} WorkItemSummary */
/** @typedef {{ key: string, item_type: string, title: string, description: string, status: string, priority: string, project_key: string, project_name: string, parent_item_key: string, parent_title: string, assignee_username: string, assignee: string, reporter: string, due_date: string, created_at: string, updated_at: string, deleted_at: string }} WorkItemDetail */
/** @typedef {{ id: number, parent_comment_id: number | null, parent_author: string, body: string, body_format: string, author: string, created_at: string, updated_at: string, is_flow: boolean, is_draft: boolean }} WorkItemComment */
/** @typedef {{ id: number, filename: string, content_type: string, byte_size: number, status: string, created_by: string, created_at: string }} Attachment */
/** @typedef {{ method: string, url: string, headers: Array<[string, string]> }} SignedObjectRequest */
/** @typedef {{ attachment: Attachment, request: SignedObjectRequest, expires_in_seconds: number }} AttachmentSignedUrl */
/** @typedef {{ title?: string, description?: string, status?: string, priority?: string, assigneeUsername?: string, dueDate?: string, parentItemKey?: string }} WorkItemUpdatePayload */
/** @typedef {{ status: string, assigneeUsername: string, body: string, sourceCommentId?: number | null }} WorkItemHandoffPayload */
/** @typedef {{ body: string, bodyFormat?: string, parentCommentId?: number | null }} CommentRequestPayload */
/** @typedef {{ originalFilename: string, contentType: string, byteSize: number }} AttachmentCreatePayload */
/** @typedef {{ expiresInSeconds?: number }} SignedUrlOptions */

const browserApiTransport = createBrowserApiTransport();
const browserEvents = createBrowserEvents();

export const redirectToLogin = browserApiTransport.redirectToLogin;
export const restorePendingReturnToHash = browserApiTransport.restorePendingReturnToHash;
export const refreshCsrfToken = browserApiTransport.refreshCsrfToken;
export const fetchJson = browserApiTransport.request;

const apiClient = createApiClient({
  request: fetchJson,
  prepareWrite: async () => {
    await refreshCsrfToken();
  },
});

export const getCurrentUser = /** @type {() => Promise<AuthUser>} */ (apiClient.getCurrentUser);

export const getTopbarStatus = /** @type {() => Promise<TopbarStatus>} */ (apiClient.getTopbarStatus);

export const getProjects = /** @type {(query?: { status?: string, page?: number, perPage?: number }) => Promise<{ items: Array<{ key: string, name: string, status: string, owner: string, work_item_count: number, active_work_item_count: number, updated_at: string }>, pagination: { page: number, per_page: number, total_items: number, total_pages: number } }>} */ (apiClient.getProjects);

export const updateCurrentProject = /** @type {(projectKey: string) => Promise<{ key: string, name: string }>} */ (apiClient.updateCurrentProject);

export const getWorkItems = /** @type {(query?: { itemType?: string, q?: string, status?: string, priority?: string, assigneeUsername?: string, projectKey?: string, page?: number, perPage?: number }) => Promise<{ items: WorkItemSummary[], pagination: { page: number, per_page: number, total_items: number, total_pages: number } }>} */ (apiClient.getWorkItems);

export const getWorkItem = /** @type {(itemKey: string) => Promise<WorkItemDetail>} */ (apiClient.getWorkItem);

export const getWorkItemComments = /** @type {(itemKey: string) => Promise<WorkItemComment[]>} */ (apiClient.getWorkItemComments);

export const updateWorkItem = /** @type {(itemKey: string, payload: WorkItemUpdatePayload) => Promise<WorkItemDetail>} */ (apiClient.updateWorkItem);

export const handoffWorkItem = /** @type {(itemKey: string, payload: WorkItemHandoffPayload) => Promise<WorkItemDetail>} */ (apiClient.handoffWorkItem);

export const createWorkItemComment = /** @type {(itemKey: string, payload: CommentRequestPayload) => Promise<WorkItemComment>} */ (apiClient.createWorkItemComment);

export const createWorkItemCommentDraft = /** @type {(itemKey: string, payload: CommentRequestPayload) => Promise<WorkItemComment>} */ (apiClient.createWorkItemCommentDraft);

export const updateWorkItemComment = /** @type {(itemKey: string, commentId: number, payload: CommentRequestPayload) => Promise<WorkItemComment>} */ (apiClient.updateWorkItemComment);

export const publishWorkItemCommentDraft = /** @type {(itemKey: string, commentId: number, payload: CommentRequestPayload) => Promise<WorkItemComment>} */ (apiClient.publishWorkItemCommentDraft);

export const getWorkItemAttachments = /** @type {(itemKey: string) => Promise<Attachment[]>} */ (apiClient.getWorkItemAttachments);

export const createWorkItemAttachment = /** @type {(itemKey: string, payload: AttachmentCreatePayload) => Promise<Attachment>} */ (apiClient.createWorkItemAttachment);

export const getWorkItemAttachmentUploadUrl = /** @type {(itemKey: string, attachmentId: number, query?: SignedUrlOptions) => Promise<AttachmentSignedUrl>} */ (apiClient.getWorkItemAttachmentUploadUrl);

export const markWorkItemAttachmentUploaded = /** @type {(itemKey: string, attachmentId: number) => Promise<Attachment>} */ (apiClient.markWorkItemAttachmentUploaded);

export const getWorkItemAttachmentDownloadUrl = /** @type {(itemKey: string, attachmentId: number, query?: SignedUrlOptions) => Promise<AttachmentSignedUrl>} */ (apiClient.getWorkItemAttachmentDownloadUrl);

export const getWorkItemCommentAttachments = /** @type {(itemKey: string, commentId: number) => Promise<Attachment[]>} */ (apiClient.getWorkItemCommentAttachments);

export const createWorkItemCommentAttachment = /** @type {(itemKey: string, commentId: number, payload: AttachmentCreatePayload) => Promise<Attachment>} */ (apiClient.createWorkItemCommentAttachment);

export const getWorkItemCommentAttachmentUploadUrl = /** @type {(itemKey: string, commentId: number, attachmentId: number, query?: SignedUrlOptions) => Promise<AttachmentSignedUrl>} */ (apiClient.getWorkItemCommentAttachmentUploadUrl);

export const markWorkItemCommentAttachmentUploaded = /** @type {(itemKey: string, commentId: number, attachmentId: number) => Promise<Attachment>} */ (apiClient.markWorkItemCommentAttachmentUploaded);

export const getWorkItemCommentAttachmentDownloadUrl = /** @type {(itemKey: string, commentId: number, attachmentId: number, query?: SignedUrlOptions) => Promise<AttachmentSignedUrl>} */ (apiClient.getWorkItemCommentAttachmentDownloadUrl);

export const getNotifications = /** @type {(query?: number | { limit?: number, filter?: string, page?: number, perPage?: number }) => Promise<NotificationFeed>} */ (apiClient.getNotifications);

export const getNotificationTarget = /** @type {(notificationId: number) => Promise<NotificationTargetPayload>} */ (apiClient.getNotificationTarget);

export const markNotificationRead = /** @type {(notificationId: number) => Promise<NotificationTargetPayload>} */ (apiClient.markNotificationRead);

export const markAllNotificationsRead = /** @type {() => Promise<{ affected: number }>} */ (apiClient.markAllNotificationsRead);

export const logout = /** @type {() => Promise<{ revoked: boolean }>} */ (apiClient.logout);

/**
 * @param {{ onRefresh: () => void, onReleaseVersion?: (version: string) => void }} callbacks
 */
export function openTopbarEvents(callbacks) {
  return browserEvents.openTopbarEvents(callbacks);
}

export const webApi = {
  createWorkItemAttachment,
  createWorkItemComment,
  createWorkItemCommentAttachment,
  getCurrentUser,
  getNotificationTarget,
  getNotifications,
  getProjects,
  getTopbarStatus,
  getWorkItem,
  getWorkItemAttachmentDownloadUrl,
  getWorkItemAttachmentUploadUrl,
  getWorkItemAttachments,
  getWorkItemCommentAttachmentDownloadUrl,
  getWorkItemCommentAttachmentUploadUrl,
  getWorkItemCommentAttachments,
  getWorkItemComments,
  getWorkItems,
  handoffWorkItem,
  logout,
  markAllNotificationsRead,
  markNotificationRead,
  markWorkItemAttachmentUploaded,
  markWorkItemCommentAttachmentUploaded,
  refreshCsrfToken,
  restorePendingReturnToHash,
  updateCurrentProject,
  updateWorkItem,
  updateWorkItemComment,
};
