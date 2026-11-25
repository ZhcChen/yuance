use axum::{
    Json,
    body::Bytes,
    extract::{Path, Query, State, rejection::JsonRejection},
    http::{HeaderMap, Method, StatusCode, header},
    response::{
        AppendHeaders, IntoResponse, Response,
        sse::{Event, KeepAlive, Sse},
    },
};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::{
    collections::{HashMap, HashSet},
    convert::Infallible,
};

use crate::{
    domains::{
        api_tokens, audit, auth, bootstrap, database_stats, files, notifications,
        project_resources, projects, rbac, storage, system_api_tokens, users,
    },
    platform::{
        error::{AppError, AppResult},
        file_crypto, realtime,
        security::csrf,
    },
    web::{
        attachment_preview, attachment_stream, audit_context, auth_limits,
        response::{ApiEnvelope, json},
        router::{AppState, app_release_version},
        test_storage::{
            TestStorageDownloadQuery, TestStorageUploadQuery, bind_test_storage_download_grant,
            bind_test_storage_upload_grant, verify_test_storage_download_grant,
            verify_test_storage_upload_grant,
        },
    },
};

mod system_api;
pub use system_api::*;
mod resources_api;
pub use resources_api::*;
mod work_items_api;
pub use work_items_api::*;
mod projects_api;
pub use projects_api::*;
mod account_api;
pub use account_api::*;

#[derive(Debug, Serialize)]
pub struct HealthPayload<'a> {
    pub service: &'a str,
    pub status: &'a str,
    pub version: &'a str,
}

#[derive(Debug, Serialize)]
pub struct ReadyPayload<'a> {
    pub service: &'a str,
    pub status: &'a str,
    pub database: &'a str,
    pub environment: String,
}

#[derive(Debug, Serialize)]
pub struct BootstrapStatusPayload {
    pub required: bool,
}

#[derive(Debug, Serialize)]
pub struct SystemDashboardLinkPayload {
    pub id: &'static str,
    pub title: &'static str,
    pub description: &'static str,
    pub path: &'static str,
}

#[derive(Debug, Serialize)]
pub struct SystemDashboardPayload {
    pub links: Vec<SystemDashboardLinkPayload>,
}

#[derive(Debug, Serialize)]
pub struct AuthUserPayload {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub is_super_admin: bool,
}

#[derive(Debug, Serialize)]
pub struct OwnProfilePayload {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub email: String,
    pub mobile: String,
    pub status: String,
    pub is_super_admin: bool,
    pub roles: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateOwnProfileRequest {
    display_name: String,
    #[serde(default)]
    email: String,
    #[serde(default)]
    mobile: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Debug, Deserialize)]
pub struct BootstrapInitRequest {
    username: String,
    display_name: String,
    password: String,
    password_confirm: String,
}

#[derive(Debug, Serialize)]
pub struct LoginPayload {
    pub user: AuthUserPayload,
    pub csrf_token: String,
}

#[derive(Debug, Serialize)]
pub struct LogoutPayload {
    pub revoked: bool,
}

#[derive(Debug, Serialize)]
pub struct ProjectPayload {
    pub key: String,
    pub name: String,
    pub status: String,
    pub owner: String,
    pub owner_username: String,
    pub work_item_count: i64,
    pub active_work_item_count: i64,
    pub pending_requirements: i64,
    pub pending_tasks: i64,
    pub pending_bugs: i64,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct ProjectQuery {
    #[serde(default)]
    status: String,
    #[serde(default)]
    q: String,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    #[serde(default)]
    q: String,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct SearchResultPayload {
    pub kind: String,
    pub key: String,
    pub title: String,
    pub context: String,
    pub target: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct AuditLogQuery {
    #[serde(default)]
    actor: String,
    #[serde(default)]
    action: String,
    #[serde(default)]
    target_type: String,
    #[serde(default)]
    target_id: String,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct CurrentProjectPayload {
    pub key: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct ProjectDetailPayload {
    pub key: String,
    pub name: String,
    pub description: String,
    pub status: String,
    pub owner_username: String,
    pub owner: String,
    pub start_date: String,
    pub due_date: String,
    pub created_at: String,
    pub updated_at: String,
    pub requirements: i64,
    pub tasks: i64,
    pub bugs: i64,
}

#[derive(Debug, Serialize)]
pub struct ProjectCyclePayload {
    pub id: i64,
    pub name: String,
    pub goal: String,
    pub description: String,
    pub owner_username: String,
    pub owner: String,
    pub start_date: String,
    pub end_date: String,
    pub closed_at: String,
    pub is_closed: bool,
    pub total_items: i64,
    pub requirement_count: i64,
    pub task_count: i64,
    pub bug_count: i64,
    pub pending_count: i64,
    pub created_at: String,
    pub updated_at: String,
    pub work_items: Vec<ProjectCycleWorkItemPayload>,
}

#[derive(Debug, Serialize)]
pub struct ProjectCycleWorkItemPayload {
    pub key: String,
    pub item_type: String,
    pub title: String,
    pub status: String,
    pub priority: String,
    pub assignee_username: String,
    pub assignee: String,
    pub due_date: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct ProjectPersonalAnalysisPayload {
    pub username: String,
    pub display_name: String,
    pub joined_at: String,
    pub completed_total: i64,
    pub completed_requirements: i64,
    pub completed_tasks: i64,
    pub completed_bugs: i64,
    pub completed_last_30_days: i64,
    pub pending: ProjectPersonalAnalysisPendingPayload,
    pub daily_average: f64,
    pub daily_peak: i64,
    pub daily_peak_date: String,
    pub monthly_average: f64,
    pub monthly_peak: i64,
    pub monthly_peak_month: String,
    pub active_days: i64,
    pub comment_count: i64,
    pub handoff_count: i64,
    pub recent_completions: Vec<ProjectPersonalCompletionPayload>,
}

#[derive(Debug, Serialize)]
pub struct ProjectPersonalAnalysisPendingPayload {
    pub requirements: i64,
    pub tasks: i64,
    pub bugs: i64,
}

#[derive(Debug, Serialize)]
pub struct ProjectPersonalCompletionPayload {
    pub key: String,
    pub item_type: String,
    pub title: String,
    pub completed_at: String,
}

#[derive(Debug, Serialize)]
pub struct ProjectResourcePayload {
    pub id: i64,
    pub project_key: String,
    pub title: String,
    pub category: String,
    pub body: String,
    pub body_format: String,
    pub body_html: String,
    pub summary: String,
    pub status: String,
    pub is_protected: bool,
    pub tags: Vec<String>,
    pub related_work_item: Option<ProjectResourceWorkItemRelationPayload>,
    pub related_cycle: Option<ProjectResourceCycleRelationPayload>,
    pub created_by: String,
    pub updated_by: String,
    pub created_at: String,
    pub updated_at: String,
    pub url: String,
    pub access_token: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ProjectResourceWorkItemRelationPayload {
    pub key: String,
    pub item_type: String,
    pub title: String,
    pub url: String,
}

#[derive(Debug, Serialize)]
pub struct ProjectResourceCycleRelationPayload {
    pub id: i64,
    pub name: String,
    pub start_date: String,
    pub end_date: String,
    pub url: String,
}

#[derive(Debug, Serialize)]
pub struct WorkItemPayload {
    pub key: String,
    pub item_type: String,
    pub title: String,
    pub status: String,
    pub priority: String,
    pub project_key: String,
    pub project_name: String,
    pub assignee: String,
    pub due_date: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct PaginationPayload {
    pub page: i64,
    pub per_page: i64,
    pub total_items: i64,
    pub total_pages: i64,
}

#[derive(Debug, Serialize)]
pub struct PaginatedPayload<T>
where
    T: Serialize,
{
    pub items: Vec<T>,
    pub pagination: PaginationPayload,
}

#[derive(Debug, Serialize)]
pub struct WorkItemListSummaryPayload {
    pub total_items: i64,
    pub active_items: i64,
    pub high_priority_items: i64,
    pub completed_items: i64,
}

#[derive(Debug, Serialize)]
pub struct WorkItemListFilterPayload {
    pub item_type: String,
    pub q: String,
    pub status: String,
    pub priority: String,
    pub project_key: String,
    pub assignee_username: String,
    pub cycle_id: String,
    pub sort: String,
}

#[derive(Debug, Serialize)]
pub struct WorkItemListAssigneePayload {
    pub username: String,
    pub display_name: String,
}

#[derive(Debug, Serialize)]
pub struct WorkItemListCyclePayload {
    pub id: i64,
    pub name: String,
    pub is_closed: bool,
}

#[derive(Debug, Serialize)]
pub struct WorkItemParentOptionPayload {
    pub key: String,
    pub title: String,
}

#[derive(Debug, Serialize)]
pub struct WorkItemSavedViewPayload {
    pub id: i64,
    pub name: String,
    pub filters: WorkItemListFilterPayload,
    pub per_page: i64,
    pub is_default: bool,
}

#[derive(Debug, Serialize)]
pub struct WorkItemListViewPayload {
    pub items: Vec<WorkItemPayload>,
    pub pagination: PaginationPayload,
    pub summary: WorkItemListSummaryPayload,
    pub filters: WorkItemListFilterPayload,
    pub assignees: Vec<WorkItemListAssigneePayload>,
    pub cycles: Vec<WorkItemListCyclePayload>,
    pub parent_options: Vec<WorkItemParentOptionPayload>,
    pub saved_views: Vec<WorkItemSavedViewPayload>,
    pub can_manage_work_items: bool,
}

#[derive(Debug, Serialize)]
pub struct WorkItemDetailPayload {
    pub key: String,
    pub item_type: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: String,
    pub project_key: String,
    pub project_name: String,
    pub parent_item_key: String,
    pub parent_title: String,
    pub assignee_username: String,
    pub assignee: String,
    pub reporter: String,
    pub reporter_username: String,
    pub due_date: String,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: String,
}

#[derive(Debug, Serialize)]
pub struct WorkItemDetailViewOptionPayload {
    pub value: String,
    pub label: String,
}

#[derive(Debug, Serialize)]
pub struct WorkItemDetailViewPermissionsPayload {
    pub can_manage_work_items: bool,
    pub can_edit_primary_post: bool,
    pub can_close_work_item: bool,
    pub can_reopen_work_item: bool,
    pub can_restore_work_item: bool,
}

#[derive(Debug, Serialize)]
pub struct WorkItemDetailNavigationLinkPayload {
    pub item_key: String,
    pub title: String,
}

#[derive(Debug, Serialize)]
pub struct WorkItemDetailNavigationPayload {
    pub previous: Option<WorkItemDetailNavigationLinkPayload>,
    pub next: Option<WorkItemDetailNavigationLinkPayload>,
}

#[derive(Debug, Serialize)]
pub struct WorkItemFlowRecordPayload {
    pub source_kind: String,
    pub actor: String,
    pub created_at: String,
    pub summary: String,
}

#[derive(Debug, Serialize)]
pub struct WorkItemFlowHistoryPayload {
    pub items: Vec<WorkItemFlowRecordPayload>,
    pub pagination: PaginationPayload,
}

#[derive(Debug, Serialize)]
pub struct WorkItemDetailViewPayload {
    pub item: WorkItemDetailPayload,
    pub primary_post: Option<CommentPayload>,
    pub cycle: Option<WorkItemDetailViewOptionPayload>,
    pub assignees: Vec<WorkItemDetailViewOptionPayload>,
    pub parent_options: Vec<WorkItemParentOptionPayload>,
    pub status_options: Vec<WorkItemDetailViewOptionPayload>,
    pub permissions: WorkItemDetailViewPermissionsPayload,
    pub navigation: WorkItemDetailNavigationPayload,
    pub flow_history: WorkItemFlowHistoryPayload,
}

#[derive(Debug, Serialize)]
pub struct ProjectResourceLinkedWorkItemPostPayload {
    pub key: String,
    pub item_type: String,
    pub title: String,
    pub summary: String,
    pub author: String,
    pub updated_at: String,
    pub linked_at: String,
    pub url: String,
}

#[derive(Debug, Serialize)]
pub struct WorkItemResourceLibraryLinkPayload {
    pub item_key: String,
    pub linked: bool,
    pub linked_at: String,
    pub can_manage: bool,
}

#[derive(Debug, Serialize)]
pub struct CommentPayload {
    pub id: i64,
    pub parent_comment_id: Option<i64>,
    pub parent_author: String,
    pub body: String,
    pub body_format: String,
    pub author: String,
    pub author_username: String,
    pub created_at: String,
    pub updated_at: String,
    pub is_flow: bool,
    pub is_draft: bool,
}

#[derive(Debug, Serialize)]
pub struct WorkItemTypingUserPayload {
    pub user_id: i64,
    pub display_name: String,
}

#[derive(Debug, Serialize)]
pub struct WorkItemTypingSnapshotPayload {
    pub users: Vec<WorkItemTypingUserPayload>,
}

#[derive(Debug, Serialize)]
pub struct NotificationTargetPayload {
    pub kind: String,
    pub project_key: String,
    pub work_item_key: String,
    pub comment_id: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct NotificationPayload {
    pub id: i64,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub actor: String,
    pub created_at: String,
    pub read: bool,
    pub open_url: String,
    pub target: Option<NotificationTargetPayload>,
}

#[derive(Debug, Serialize)]
pub struct NotificationFeedPayload {
    pub items: Vec<NotificationPayload>,
    pub unread_count: i64,
    pub pending_count: i64,
    pub filter: String,
    pub page: i64,
    pub per_page: i64,
    pub total_items: i64,
    pub total_pages: i64,
}

#[derive(Debug, Serialize)]
pub struct NotificationTargetResultPayload {
    pub notification_id: i64,
    pub read: bool,
    pub target: Option<NotificationTargetPayload>,
}

#[derive(Debug, Serialize)]
pub struct NotificationMarkAllReadPayload {
    pub affected: u64,
}

#[derive(Debug, Serialize)]
pub struct TopbarProjectBadgePayload {
    pub project_key: String,
    pub pending_count: i64,
}

#[derive(Debug, Serialize)]
pub struct TopbarCurrentProjectPayload {
    pub key: String,
    pub name: String,
    pub pending_count: i64,
}

#[derive(Debug, Serialize)]
pub struct TopbarProjectOptionPayload {
    pub key: String,
    pub name: String,
    pub pending_count: i64,
}

#[derive(Debug, Serialize)]
pub struct TopbarStatusPayload {
    pub requirements_count: i64,
    pub tasks_count: i64,
    pub bugs_count: i64,
    pub notifications_count: i64,
    pub project_badges: Vec<TopbarProjectBadgePayload>,
    pub project_options: Vec<TopbarProjectOptionPayload>,
    pub system_links: Vec<SystemDashboardLinkPayload>,
    pub current_project: Option<TopbarCurrentProjectPayload>,
}

#[derive(Debug, Serialize)]
pub struct DashboardMetricsPayload {
    pub active_projects: usize,
    pub requirements: i64,
    pub tasks: i64,
    pub bugs: i64,
    pub assigned_total: usize,
    pub high_priority: usize,
}

#[derive(Debug, Serialize)]
pub struct DashboardProjectPayload {
    pub key: String,
    pub name: String,
    pub owner: String,
    pub owner_username: String,
    pub status: String,
    pub work_item_count: i64,
    pub active_work_item_count: i64,
    pub pending_requirements: i64,
    pub pending_tasks: i64,
    pub pending_bugs: i64,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct DashboardActivityPayload {
    pub id: i64,
    pub project_key: String,
    pub summary: String,
    pub actor: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct DashboardPayload {
    pub metrics: DashboardMetricsPayload,
    pub projects: Vec<DashboardProjectPayload>,
    pub pending_discussions: Vec<NotificationPayload>,
    pub pending_discussion_count: i64,
    pub activities: Vec<DashboardActivityPayload>,
    pub assigned_items: Vec<WorkItemPayload>,
    pub can_manage_projects: bool,
}

#[derive(Debug, Serialize)]
pub struct ApiTokenPayload {
    pub id: i64,
    pub name: String,
    pub scopes: Vec<String>,
    pub project_scope: String,
    pub token_suffix: String,
    pub expires_at: String,
    pub revoked_at: String,
    pub last_used_at: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct CreatedApiTokenPayload {
    pub token: ApiTokenPayload,
    pub raw_token: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateApiTokenRequest {
    name: String,
    #[serde(default)]
    scopes: Vec<String>,
    #[serde(default)]
    project_scope: String,
    #[serde(default)]
    expires_at: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateApiTokenRequest {
    name: String,
    #[serde(default)]
    scopes: Vec<String>,
    #[serde(default)]
    project_scope: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateOwnPasswordRequest {
    current_password: String,
    new_password: String,
    new_password_confirm: String,
}

#[derive(Debug, Deserialize)]
pub struct NotificationQuery {
    #[serde(default)]
    limit: Option<i64>,
    #[serde(default)]
    filter: String,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
}

fn no_store_json<T>(data: T) -> impl IntoResponse
where
    T: Serialize,
{
    (
        AppendHeaders([(header::CACHE_CONTROL, "private, no-store")]),
        json(data),
    )
}

#[derive(Debug, Serialize)]
pub struct ProjectMemberPayload {
    pub user_id: i64,
    pub display_name: String,
    pub username: String,
    pub member_role: String,
    pub joined_at: String,
}

#[derive(Debug, Serialize)]
pub struct ProjectMemberCandidatePayload {
    pub display_name: String,
    pub username: String,
    pub roles: String,
}

#[derive(Debug, Serialize)]
pub struct AttachmentPayload {
    pub id: i64,
    pub file_object_id: i64,
    pub object_key: String,
    pub filename: String,
    pub content_type: String,
    pub byte_size: i64,
    pub status: String,
    pub created_by: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct AttachmentSignedUrlPayload {
    pub attachment: AttachmentPayload,
    pub request: storage::SignedObjectRequest,
    pub expires_in_seconds: u64,
    pub expires_at: String,
    pub checksum_sha256: String,
    pub encryption: Option<AttachmentEncryptionPayload>,
}

#[derive(Debug, Serialize)]
pub struct AttachmentEncryptionPayload {
    pub algorithm: &'static str,
    pub format: String,
    pub chunk_size: i64,
    pub key: String,
    pub file_object_id: i64,
    pub plaintext_byte_size: i64,
    pub plaintext_sha256: String,
    pub encrypted_byte_size: i64,
    pub encrypted_checksum_sha256: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct EncryptedPreviewContentPayload {
    pub url: String,
    pub encryption: AttachmentEncryptionPayload,
}

#[derive(Debug, Serialize)]
pub struct ProjectAttachmentPreviewPayload {
    pub attachment: AttachmentPayload,
    pub preview: AttachmentPreviewPayload,
    pub navigation: AttachmentPreviewNavigationPayload,
    pub content_url: String,
    pub download_url: String,
}

#[derive(Debug, Serialize)]
pub struct AttachmentPreviewPayload {
    pub kind: Option<&'static str>,
    pub strategy: Option<&'static str>,
    pub file_type: Option<&'static str>,
    pub kind_label: Option<&'static str>,
    pub is_experimental: bool,
    pub legacy_preview_enabled: bool,
    pub content_enabled: bool,
}

#[derive(Debug, Serialize)]
pub struct AttachmentPreviewNavigationPayload {
    pub position: usize,
    pub total: usize,
    pub previous: Option<AttachmentPreviewNavigationLinkPayload>,
    pub next: Option<AttachmentPreviewNavigationLinkPayload>,
}

#[derive(Debug, Serialize)]
pub struct AttachmentPreviewNavigationLinkPayload {
    pub id: i64,
    pub title: String,
    pub url: String,
}

#[derive(Debug, Serialize)]
pub struct AuditLogPayload {
    pub id: i64,
    pub actor_display_name: String,
    pub actor_username: String,
    pub action: String,
    pub target_type: String,
    pub target_id: String,
    pub metadata: String,
    pub ip: String,
    pub user_agent: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct SystemUserPayload {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub email: String,
    pub mobile: String,
    pub status: String,
    pub is_super_admin: bool,
    pub role_code: String,
    pub role_names: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct SystemUsersViewQuery {
    page: Option<i64>,
    per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct SystemRolesViewQuery {
    role: Option<String>,
    page: Option<i64>,
    per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct SystemStorageViewQuery {
    page: Option<i64>,
    per_page: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct SystemUserProjectPayload {
    pub key: String,
    pub name: String,
    pub status: String,
    pub role_code: String,
    pub active_assigned_count: i64,
    pub can_remove: bool,
    pub can_update_role: bool,
    pub remove_block_reason: String,
}

#[derive(Debug, Serialize)]
pub struct SystemUserViewPayload {
    #[serde(flatten)]
    pub user: SystemUserPayload,
    pub assigned_projects: Vec<SystemUserProjectPayload>,
}

#[derive(Debug, Serialize)]
pub struct SystemProjectAssignmentOptionPayload {
    pub key: String,
    pub name: String,
    pub owner: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct SystemUsersViewPayload {
    pub items: Vec<SystemUserViewPayload>,
    pub roles: Vec<SystemRolePayload>,
    pub project_options: Vec<SystemProjectAssignmentOptionPayload>,
    pub pagination: PaginationPayload,
    pub can_manage_users: bool,
    pub can_manage_user_projects: bool,
}

#[derive(Debug, Serialize)]
pub struct SystemRolePayload {
    pub role_code: String,
    pub role_name: String,
    pub status: String,
    pub is_system: bool,
    pub data_scope_type: String,
    pub permission_count: i64,
}

#[derive(Debug, Serialize)]
pub struct SystemRolesViewPayload {
    pub items: Vec<SystemRolePayload>,
    pub selected_role: Option<SystemRolePayload>,
    pub permissions: Vec<SystemPermissionPayload>,
    pub pagination: PaginationPayload,
    pub can_manage_roles: bool,
    pub can_edit_permissions: bool,
}

#[derive(Debug, Serialize)]
pub struct SystemPermissionPayload {
    pub permission_key: String,
    pub permission_name: String,
    pub resource_type: String,
    pub resource_key: String,
    pub granted: bool,
}

#[derive(Debug, Serialize)]
pub struct DatabaseStatsColumnPayload {
    pub name: String,
    pub data_type: String,
    pub required: bool,
    pub primary_key: bool,
    pub default_value: String,
}

#[derive(Debug, Serialize)]
pub struct DatabaseTableStatsPayload {
    pub table_name: String,
    pub remark: String,
    pub row_count: i64,
    pub column_count: usize,
    pub columns: Vec<DatabaseStatsColumnPayload>,
}

#[derive(Debug, Serialize)]
pub struct DatabaseStatsSnapshotPayload {
    pub refreshed_at: String,
    pub tables: Vec<DatabaseTableStatsPayload>,
}

#[derive(Debug, Serialize)]
pub struct StorageConfigPayload {
    pub id: i64,
    pub provider: String,
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub access_key_id_hint: String,
    pub status: String,
    pub version: i64,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct StorageConfigVersionPayload {
    pub id: i64,
    pub storage_config_id: i64,
    pub version: i64,
    pub provider: String,
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub access_key_id_hint: String,
    pub snapshot_status: String,
    pub current_status: String,
    pub created_by: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct SystemStorageViewPayload {
    pub config: Option<StorageConfigPayload>,
    pub versions: Vec<StorageConfigVersionPayload>,
    pub pagination: PaginationPayload,
    pub inspection: Option<storage::StorageBucketInspection>,
    pub inspection_error: String,
    pub can_manage_storage: bool,
}

#[derive(Debug, Serialize)]
pub struct SystemApiTokenPayload {
    pub id: i64,
    pub name: String,
    pub scopes: Vec<String>,
    pub token_suffix: String,
    pub created_by: String,
    pub updated_by: String,
    pub last_used_at: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct SystemOpenApiViewPayload {
    pub items: Vec<SystemApiTokenPayload>,
    pub active_count: i64,
    pub token_limit: i64,
    pub can_manage_tokens: bool,
}

#[derive(Debug, Serialize)]
pub struct SystemApiDocsPayload {
    pub source: String,
}

#[derive(Debug, Serialize)]
pub struct CreatedSystemApiTokenPayload {
    pub token: SystemApiTokenPayload,
    pub raw_token: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateSystemApiTokenRequest {
    name: String,
    #[serde(default)]
    scopes: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSystemApiTokenRequest {
    name: String,
    #[serde(default)]
    scopes: Vec<String>,
}

#[derive(Debug, Clone)]
struct ApiTokenActor {
    display_name: String,
}

#[derive(Debug, Clone)]
enum ApiPrincipalKind {
    Session,
    ApiToken(ApiTokenActor),
}

#[derive(Debug, Clone)]
struct ApiPrincipal {
    user: auth::AuthUser,
    kind: ApiPrincipalKind,
}

impl ApiPrincipal {
    fn actor_display_name_snapshot(&self) -> String {
        match &self.kind {
            ApiPrincipalKind::ApiToken(actor) => actor.display_name.clone(),
            ApiPrincipalKind::Session => String::new(),
        }
    }

    fn audit_details(&self) -> String {
        match &self.kind {
            ApiPrincipalKind::Session => serde_json::json!({"source": "session"}).to_string(),
            ApiPrincipalKind::ApiToken(_) => serde_json::json!({"source": "api_token"}).to_string(),
        }
    }

    fn audit_details_with(&self, details: serde_json::Value) -> String {
        let mut base = serde_json::from_str::<serde_json::Value>(&self.audit_details())
            .unwrap_or_else(|_| serde_json::json!({}));
        if let (Some(base), Some(details)) = (base.as_object_mut(), details.as_object()) {
            base.extend(details.clone());
        }
        base.to_string()
    }
}

#[derive(Debug, Deserialize)]
pub struct WorkItemQuery {
    #[serde(default)]
    item_type: Option<String>,
    #[serde(default)]
    q: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    priority: String,
    #[serde(default)]
    project_key: String,
    #[serde(default)]
    assignee_username: String,
    #[serde(default)]
    cycle_id: String,
    #[serde(default)]
    sort: String,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProjectRequest {
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default = "default_project_status")]
    status: String,
    #[serde(default)]
    start_date: String,
    #[serde(default)]
    due_date: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProjectRequest {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    owner_username: Option<String>,
    #[serde(default)]
    start_date: Option<String>,
    #[serde(default)]
    due_date: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ResourceQuery {
    #[serde(default)]
    q: String,
    #[serde(default)]
    category: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    tag: String,
    #[serde(default)]
    related_work_item_key: String,
    #[serde(default)]
    related_cycle_id: String,
}

#[derive(Debug, Deserialize)]
pub struct LinkedWorkItemPostQuery {
    #[serde(default)]
    q: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateProjectResourceRequest {
    title: String,
    #[serde(default)]
    category: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    body_format: String,
    #[serde(default)]
    access_password: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    related_work_item_key: String,
    #[serde(default)]
    related_cycle_id: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProjectResourceRequest {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    category: Option<String>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    body_format: Option<String>,
    #[serde(default)]
    access_password_action: String,
    #[serde(default)]
    access_password: String,
    #[serde(default)]
    tags: Option<Vec<String>>,
    #[serde(default)]
    related_work_item_key: Option<String>,
    #[serde(default)]
    related_cycle_id: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct UnlockProjectResourceRequest {
    access_password: String,
}

#[derive(Debug, Deserialize)]
pub struct ResetProjectResourcePasswordRequest {
    access_password_action: String,
    #[serde(default)]
    access_password: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCurrentProjectRequest {
    project_key: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateWorkItemRequest {
    project_key: String,
    item_type: String,
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default = "default_priority")]
    priority: String,
    #[serde(default)]
    due_date: String,
    #[serde(default)]
    parent_item_key: String,
    #[serde(default)]
    assignee_username: String,
    #[serde(default)]
    cycle_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateWorkItemRequest {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    priority: Option<String>,
    #[serde(default)]
    assignee_username: Option<String>,
    #[serde(default)]
    due_date: Option<String>,
    #[serde(default)]
    parent_item_key: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_cycle_id")]
    cycle_id: Option<Option<i64>>,
    /// 可选乐观锁：传入读取时的 `updated_at`，期间被修改则返回 409。
    #[serde(default)]
    expected_updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateWorkItemPrimaryPostRequest {
    body: String,
    #[serde(default = "default_html_body_format")]
    body_format: String,
}

fn default_html_body_format() -> String {
    "html".to_string()
}

#[derive(Debug, Deserialize)]
pub struct HandoffWorkItemRequest {
    status: String,
    #[serde(default)]
    assignee_username: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    source_comment_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateWorkItemSavedViewRequest {
    project_key: String,
    item_type: String,
    name: String,
    #[serde(default)]
    q: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    priority: String,
    #[serde(default)]
    assignee_username: String,
    #[serde(default)]
    cycle_id: String,
    #[serde(default)]
    sort: String,
    #[serde(default = "default_work_item_saved_view_per_page")]
    per_page: i64,
    #[serde(default)]
    is_default: bool,
}

#[derive(Debug, Deserialize)]
pub struct RenameWorkItemSavedViewRequest {
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BatchUpdateWorkItemsRequest {
    project_key: String,
    item_type: String,
    item_keys: Vec<String>,
    action: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    assignee_username: String,
    #[serde(default)]
    priority: String,
    #[serde(default)]
    cycle_id: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct BatchUpdateWorkItemFailurePayload {
    pub item_key: String,
    pub code: &'static str,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct BatchUpdateWorkItemsPayload {
    pub updated_count: usize,
    pub updated_item_keys: Vec<String>,
    pub failed_count: usize,
    pub failed_items: Vec<BatchUpdateWorkItemFailurePayload>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCommentRequest {
    body: String,
    #[serde(default)]
    body_format: String,
    #[serde(default)]
    parent_comment_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct WorkItemTypingRequest {
    client_id: String,
    #[serde(default = "default_true")]
    active: bool,
}

#[derive(Debug, Deserialize)]
pub struct AddProjectMemberRequest {
    username: String,
    #[serde(default = "default_member_role")]
    member_role: String,
}

#[derive(Debug, Deserialize)]
pub struct AddProjectMembersRequest {
    #[serde(default)]
    usernames: Vec<String>,
    #[serde(default = "default_member_role")]
    member_role: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProjectMemberRequest {
    member_role: String,
}

#[derive(Debug, Deserialize)]
pub struct ProjectCycleRequest {
    name: String,
    #[serde(default)]
    goal: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    owner_username: String,
    start_date: String,
    end_date: String,
}

#[derive(Debug, Serialize)]
pub struct TimeAllocationPayload {
    pub id: i64,
    pub project_key: String,
    pub project_name: String,
    pub username: String,
    pub display_name: String,
    pub start_date: String,
    pub end_date: String,
    pub daily_hours: f64,
    pub phase_task_name: String,
    pub note: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct TimeAllocationMemberPayload {
    pub username: String,
    pub display_name: String,
}

#[derive(Debug, Deserialize)]
pub struct TimeAllocationListQuery {
    #[serde(default)]
    project_key: String,
    #[serde(default)]
    username: String,
    #[serde(default)]
    start: String,
    #[serde(default)]
    end: String,
}

#[derive(Debug, Deserialize)]
pub struct TimeAllocationChangePath {
    record_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct TimeAllocationChangeListQuery {
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
    #[serde(default)]
    project_key: String,
    #[serde(default)]
    actor: String,
}

#[derive(Debug, Serialize)]
pub struct TimeAllocationFieldChangePayload {
    pub field: String,
    pub before: Option<serde_json::Value>,
    pub after: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct TimeAllocationChangePayload {
    pub id: i64,
    pub allocation_id: i64,
    pub project_key: String,
    pub project_name: String,
    pub action: String,
    pub actor_username: String,
    pub actor_display_name: String,
    pub summary: String,
    pub changes: Vec<TimeAllocationFieldChangePayload>,
    pub before: Option<serde_json::Value>,
    pub after: Option<serde_json::Value>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTimeAllocationRequest {
    username: String,
    start_date: String,
    end_date: String,
    daily_hours: f64,
    #[serde(default)]
    phase_task_name: String,
    #[serde(default)]
    note: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTimeAllocationRequest {
    username: String,
    start_date: String,
    end_date: String,
    daily_hours: f64,
    #[serde(default)]
    phase_task_name: String,
    #[serde(default)]
    note: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAttachmentRequest {
    original_filename: String,
    content_type: String,
    byte_size: i64,
    #[serde(default)]
    checksum_sha256: String,
    #[serde(default)]
    folder_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateFolderRequest {
    #[serde(default)]
    parent_id: Option<i64>,
    name: String,
    #[serde(default)]
    description: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateFolderRequest {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    description: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FolderPayload {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub name: String,
    pub description: String,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct FolderTreePayload {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub name: String,
    pub description: String,
    pub children: Vec<FolderTreePayload>,
}

#[derive(Debug, Serialize)]
pub struct FolderContentPayload {
    pub folder_id: Option<i64>,
    pub folder_name: Option<String>,
    pub folders: Vec<FolderPayload>,
    pub files: Vec<AttachmentPayload>,
}

#[derive(Debug, Deserialize)]
pub struct SignedUrlQuery {
    #[serde(default)]
    expires_in_seconds: Option<u64>,
    #[serde(default)]
    access: String,
}

#[derive(Debug, Deserialize)]
pub struct PreviewContentQuery {
    #[serde(default)]
    access: String,
    #[serde(default)]
    client_decrypt: String,
}

fn client_decrypt_requested(value: &str) -> bool {
    matches!(value, "1" | "true" | "True" | "TRUE")
}

#[derive(Debug, Deserialize)]
pub struct CreateSystemUserRequest {
    username: String,
    display_name: String,
    #[serde(default)]
    email: String,
    #[serde(default)]
    mobile: String,
    password: String,
    role_code: String,
}

#[derive(Debug, Deserialize)]
pub struct SetUserStatusRequest {
    status: String,
}

#[derive(Debug, Deserialize)]
pub struct SetUserRoleRequest {
    role_code: String,
}

#[derive(Debug, Deserialize)]
pub struct ResetUserPasswordRequest {
    password: String,
}

#[derive(Debug, Deserialize)]
pub struct AssignSystemUserProjectsRequest {
    project_keys: Vec<String>,
    member_role: String,
}

#[derive(Debug, Deserialize)]
pub struct RemoveSystemUserProjectsRequest {
    project_keys: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct SetSystemUserProjectRoleRequest {
    member_role: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateSystemRoleRequest {
    role_code: String,
    role_name: String,
    #[serde(default = "default_data_scope_type")]
    data_scope_type: String,
}

#[derive(Debug, Deserialize)]
pub struct SetRoleStatusRequest {
    status: String,
}

#[derive(Debug, Deserialize)]
pub struct ReplaceRolePermissionsRequest {
    #[serde(default)]
    permission_keys: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct SaveStorageConfigRequest {
    endpoint: String,
    #[serde(default)]
    region: String,
    bucket: String,
    access_key_id: String,
    access_key_secret: String,
    #[serde(default = "default_activate_storage_config")]
    activate: bool,
}

pub async fn healthz() -> axum::Json<ApiEnvelope<HealthPayload<'static>>> {
    json(HealthPayload {
        service: "yuance-api",
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

pub async fn readyz(
    State(state): State<AppState>,
) -> (StatusCode, axum::Json<ApiEnvelope<ReadyPayload<'static>>>) {
    let Some(pool) = state.pool.as_ref() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            json(ReadyPayload {
                service: "yuance-api",
                status: "not_ready",
                database: "sqlite-not-connected",
                environment: state.settings.env,
            }),
        );
    };

    let database_ready = sqlx::query_scalar::<_, i64>("SELECT 1")
        .fetch_one(pool)
        .await
        .is_ok();

    let status = if database_ready {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    let database = if database_ready {
        "sqlite-connected"
    } else {
        "sqlite-unavailable"
    };
    let ready_status = if database_ready { "ready" } else { "not_ready" };

    (
        status,
        json(ReadyPayload {
            service: "yuance-api",
            status: ready_status,
            database,
            environment: state.settings.env,
        }),
    )
}

pub async fn me(State(state): State<AppState>, headers: HeaderMap) -> AppResult<impl IntoResponse> {
    let user = require_api_principal(&state, &headers).await?.user;

    Ok(no_store_json(auth_user_payload(user)))
}

/// 草稿附件保留期：超过该时长仍未绑定到工作项的草稿会被清理。
/// 取 72 小时，避免误删长时间打开的新建弹窗中仍在使用的草稿。
const DRAFT_ATTACHMENT_RETENTION_HOURS: i64 = 72;

struct AttachmentPreviewAudit<'a> {
    user_id: i64,
    target_type: &'a str,
    target_id: &'a str,
    detail: &'a str,
}

async fn attachment_preview_content_response(
    state: &AppState,
    pool: &SqlitePool,
    headers: &HeaderMap,
    method: Method,
    attachment: files::FileAttachmentSummary,
    audit: AttachmentPreviewAudit<'_>,
) -> AppResult<Response> {
    let AttachmentPreviewAudit {
        user_id,
        target_type: audit_target_type,
        target_id: audit_target_id,
        detail: audit_detail,
    } = audit;
    ensure_attachment_preview_content_enabled(
        &attachment,
        state.settings.experimental_legacy_preview_enabled(),
    )?;
    let encryption = files::get_file_object_encryption(pool, attachment.file_object_id).await?;
    let (stored_content_type, total_u64) =
        storage::stat_object(pool, &state.settings, &attachment.object_key).await?;
    let content_type = resolved_preview_content_type(
        &stored_content_type,
        &attachment.content_type,
        &attachment.original_filename,
    );
    let total = if encryption.is_some() {
        usize::try_from(attachment.byte_size)
            .map_err(|_| AppError::BadRequest("附件大小超出当前预览能力".to_string()))?
    } else {
        usize::try_from(total_u64)
            .map_err(|_| AppError::BadRequest("附件大小超出当前预览能力".to_string()))?
    };
    let range = match headers.get(header::RANGE) {
        Some(value) => match parse_single_byte_range(value.to_str().unwrap_or_default(), total) {
            Some(range) => Some(range),
            None => return range_not_satisfiable_response(total),
        },
        None => None,
    };
    let (status, start, end) = match range {
        Some((start, end)) => (StatusCode::PARTIAL_CONTENT, start, end),
        None => (StatusCode::OK, 0, total.saturating_sub(1)),
    };
    let selected_length = if total == 0 { 0 } else { end - start + 1 };
    // 按块流式输出（加密附件逐块解密），整文件与 Range 请求都不把文件读入内存。
    let body = if method == Method::HEAD || selected_length == 0 {
        axum::body::Body::empty()
    } else if let Some(encryption) = encryption {
        attachment_stream::EncryptedAttachmentSource::open(state, pool, &attachment, &encryption)
            .await?
            .into_body(start, end + 1)
    } else {
        attachment_stream::plain_object_body(
            pool,
            &state.settings,
            &attachment.object_key,
            start as u64,
            (end + 1) as u64,
        )
    };
    let mut response = (status, body).into_response();
    let response_headers = response.headers_mut();
    response_headers.insert(header::CONTENT_TYPE, content_type.parse()?);
    response_headers.insert(header::CONTENT_LENGTH, selected_length.to_string().parse()?);
    response_headers.insert(header::ACCEPT_RANGES, "bytes".parse()?);
    response_headers.insert(header::X_CONTENT_TYPE_OPTIONS, "nosniff".parse()?);
    response_headers.insert(header::CACHE_CONTROL, "private, no-store".parse()?);
    response_headers.insert(
        header::CONTENT_SECURITY_POLICY,
        "default-src 'none'; sandbox".parse()?,
    );
    response_headers.insert(header::CONTENT_DISPOSITION, "inline".parse()?);
    if status == StatusCode::PARTIAL_CONTENT {
        response_headers.insert(
            header::CONTENT_RANGE,
            format!("bytes {start}-{end}/{total}").parse()?,
        );
    }
    audit::record(
        pool,
        Some(user_id),
        "file.preview.content",
        audit_target_type,
        audit_target_id,
        audit_detail,
    )
    .await?;
    Ok(response)
}

pub(crate) async fn encrypted_preview_content_response(
    state: &AppState,
    pool: &SqlitePool,
    actor_user_id: i64,
    attachment: files::FileAttachmentSummary,
) -> AppResult<Response> {
    ensure_attachment_preview_content_enabled(
        &attachment,
        state.settings.experimental_legacy_preview_enabled(),
    )?;
    let encryption = files::get_file_object_encryption(pool, attachment.file_object_id)
        .await?
        .ok_or_else(|| AppError::BadRequest("附件未启用加密".to_string()))?;
    let expires_in_seconds = storage::DEFAULT_DOWNLOAD_URL_TTL_SECONDS as u64;
    let mut signed = storage::presign_download_url(
        pool,
        &state.settings,
        &attachment.object_key,
        expires_in_seconds,
    )
    .await?;
    bind_test_storage_download_grant(
        state,
        &attachment.object_key,
        "application/octet-stream",
        actor_user_id,
        expires_in_seconds,
        &mut signed,
    )?;
    let data_key = file_crypto::open_data_key(
        &state.settings.file_master_key,
        &encryption.data_key_envelope,
        attachment.object_key.as_bytes(),
    )?;
    let checksum_sha256 =
        sqlx::query_scalar::<_, String>("SELECT checksum_sha256 FROM file_objects WHERE id = ?1")
            .bind(attachment.file_object_id)
            .fetch_one(pool)
            .await?;
    let payload = EncryptedPreviewContentPayload {
        url: signed.url,
        encryption: AttachmentEncryptionPayload {
            algorithm: "AES-256-GCM",
            format: encryption.encryption_format,
            chunk_size: file_crypto::FILE_CHUNK_SIZE as i64,
            key: BASE64.encode(data_key),
            file_object_id: attachment.file_object_id,
            plaintext_byte_size: attachment.byte_size,
            plaintext_sha256: checksum_sha256,
            encrypted_byte_size: encryption.encrypted_byte_size,
            encrypted_checksum_sha256: encryption.encrypted_checksum_sha256,
        },
    };
    let mut response = Json(payload).into_response();
    let headers = response.headers_mut();
    headers.insert(header::CONTENT_TYPE, "application/json".parse()?);
    headers.insert(header::CACHE_CONTROL, "private, no-store".parse()?);
    headers.insert(header::X_CONTENT_TYPE_OPTIONS, "nosniff".parse()?);
    Ok(response)
}

pub use project_resources::RESOURCE_JSON_MAX_BYTES;

async fn validate_svg_attachment_content(
    state: &AppState,
    pool: &SqlitePool,
    attachment: &files::FileAttachmentSummary,
) -> AppResult<()> {
    if !attachment
        .content_type
        .eq_ignore_ascii_case("image/svg+xml")
    {
        return Ok(());
    }
    if attachment.byte_size > 16 * 1024 * 1024 {
        return Err(AppError::BadRequest("SVG 文件超过安全大小限制".to_string()));
    }

    let encryption = files::get_file_object_encryption(pool, attachment.file_object_id).await?;
    let (_, stored_content) =
        storage::read_object(pool, &state.settings, &attachment.object_key).await?;
    let content = if let Some(encryption) = encryption {
        let data_key = file_crypto::open_data_key(
            &state.settings.file_master_key,
            &encryption.data_key_envelope,
            attachment.object_key.as_bytes(),
        )?;
        file_crypto::decrypt_ciphertext_full(&data_key, attachment.file_object_id, &stored_content)?
    } else {
        stored_content
    };
    files::validate_svg_content(&content)
}

#[derive(Debug, Deserialize)]
struct MarkUploadedRequest {
    encrypted_sha256: Option<String>,
}

fn parse_mark_uploaded_request(body: &Bytes) -> AppResult<Option<MarkUploadedRequest>> {
    if body.is_empty() {
        return Ok(None);
    }
    serde_json::from_slice(body)
        .map(Some)
        .map_err(|error| AppError::BadRequest(format!("上传完成登记参数无效：{error}")))
}

/// 工作台「我的待处理」最多返回多少条工作项。
const DASHBOARD_ASSIGNED_ITEM_LIMIT: usize = 6;

fn ensure_account_principal(principal: &ApiPrincipal) -> AppResult<()> {
    match &principal.kind {
        ApiPrincipalKind::Session => Ok(()),
        ApiPrincipalKind::ApiToken(_) => Err(AppError::Forbidden(
            "访问 Token 不能读取或修改账户资料".to_string(),
        )),
    }
}

async fn require_api_user(state: &AppState, headers: &HeaderMap) -> AppResult<auth::AuthUser> {
    Ok(require_api_principal(state, headers).await?.user)
}

async fn require_api_principal(state: &AppState, headers: &HeaderMap) -> AppResult<ApiPrincipal> {
    let pool = state.pool()?;
    if let Some(raw_token) = single_bearer_token(headers)? {
        let authenticated = api_tokens::authenticated_token_from_bearer_token(pool, &raw_token)
            .await?
            .ok_or(AppError::Unauthorized)?;
        let display_name =
            api_token_actor_display_name(&authenticated.user, &authenticated.token_name);
        return Ok(ApiPrincipal {
            user: authenticated.user,
            kind: ApiPrincipalKind::ApiToken(ApiTokenActor { display_name }),
        });
    }
    let user = auth::user_from_headers(pool, headers)
        .await?
        .ok_or(AppError::Unauthorized)?;
    Ok(ApiPrincipal {
        user,
        kind: ApiPrincipalKind::Session,
    })
}

fn normalized_primary_post_summary(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

async fn ensure_api_permission(
    pool: &sqlx::SqlitePool,
    headers: &HeaderMap,
    user_id: i64,
    permission_key: &str,
) -> AppResult<()> {
    if let Some(required_scope) = api_scope_for_permission(permission_key) {
        ensure_api_token_scope(pool, headers, user_id, required_scope).await?;
    }

    if rbac::user_has_permission(pool, user_id, permission_key).await? {
        return Ok(());
    }

    let request_context = audit_context::from_headers(headers);
    audit::record_with_context(
        pool,
        Some(user_id),
        "permission.denied",
        "permission",
        permission_key,
        r#"{"source":"api"}"#,
        &request_context,
    )
    .await?;
    Err(AppError::Forbidden("缺少操作权限".to_string()))
}

fn api_scope_for_permission(permission_key: &str) -> Option<&'static str> {
    match permission_key {
        "project.view" => Some(api_tokens::SCOPE_PROJECT_READ),
        "work_item.view" => Some(api_tokens::SCOPE_WORK_ITEM_READ),
        "work_item.manage" => Some(api_tokens::SCOPE_WORK_ITEM_WRITE),
        "project.manage" => Some("project:write"),
        key if key.starts_with("system.") => Some("system:admin"),
        _ => None,
    }
}

#[derive(Clone, Copy)]
enum SignedUrlKind {
    Upload,
    Download,
}

async fn signed_attachment_url_payload(
    state: &AppState,
    pool: &sqlx::SqlitePool,
    attachment: files::FileAttachmentSummary,
    actor_user_id: i64,
    kind: SignedUrlKind,
    query: SignedUrlQuery,
) -> AppResult<AttachmentSignedUrlPayload> {
    if matches!(kind, SignedUrlKind::Upload) && !query.access.trim().is_empty() {
        return Err(AppError::BadRequest(
            "上传签名请求不接受资料访问凭证".to_string(),
        ));
    }
    if attachment.status == "deleted" {
        return Err(AppError::NotFound("附件已归档，不能生成签名".to_string()));
    }
    let expires_in_seconds = normalize_signed_url_expiration(kind, query.expires_in_seconds)?;
    if matches!(kind, SignedUrlKind::Upload) && attachment.status != "pending" {
        return Err(AppError::Conflict(
            "只有 pending 状态的附件可以生成上传签名".to_string(),
        ));
    }
    if matches!(kind, SignedUrlKind::Download) && attachment.status != "uploaded" {
        return Err(AppError::BadRequest(
            "附件尚未上传完成，不能下载".to_string(),
        ));
    }

    let encryption = files::get_file_object_encryption(pool, attachment.file_object_id).await?;
    let transfer_content_type = if encryption.is_some() {
        "application/octet-stream"
    } else {
        attachment.content_type.as_str()
    };
    let expires_at = (chrono::Utc::now() + chrono::Duration::seconds(expires_in_seconds as i64))
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let mut request = match kind {
        SignedUrlKind::Upload => {
            storage::presign_upload_url(
                pool,
                &state.settings,
                &attachment.object_key,
                transfer_content_type,
                expires_in_seconds,
            )
            .await?
        }
        SignedUrlKind::Download => {
            storage::presign_download_url(
                pool,
                &state.settings,
                &attachment.object_key,
                expires_in_seconds,
            )
            .await?
        }
    };
    if matches!(kind, SignedUrlKind::Upload) {
        if encryption.is_some() {
            let encrypted_byte_size = i64::try_from(file_crypto::encrypted_total_size(
                attachment.byte_size as u64,
            ))
            .map_err(|_| AppError::BadRequest("加密文件大小超出系统支持范围".to_string()))?;
            set_signed_upload_content_length(&mut request, encrypted_byte_size);
        }
        bind_test_storage_upload_grant(
            state,
            &attachment.object_key,
            actor_user_id,
            expires_in_seconds,
            &mut request,
        )?;
        let upload_expires_at =
            chrono::Utc::now() + chrono::Duration::seconds(expires_in_seconds as i64);
        let upload_expires_at_db = upload_expires_at.format("%Y-%m-%d %H:%M:%S").to_string();
        files::extend_file_object_upload_url_expiration(
            pool,
            attachment.file_object_id,
            &upload_expires_at_db,
        )
        .await?;
    } else {
        bind_test_storage_download_grant(
            state,
            &attachment.object_key,
            transfer_content_type,
            actor_user_id,
            expires_in_seconds,
            &mut request,
        )?;
    }

    let checksum_sha256 =
        sqlx::query_scalar::<_, String>("SELECT checksum_sha256 FROM file_objects WHERE id = ?1")
            .bind(attachment.file_object_id)
            .fetch_one(pool)
            .await?;

    let encryption_payload = if let Some(encryption) = encryption {
        let data_key = file_crypto::open_data_key(
            &state.settings.file_master_key,
            &encryption.data_key_envelope,
            attachment.object_key.as_bytes(),
        )?;
        let is_download = matches!(kind, SignedUrlKind::Download);
        let encrypted_byte_size = i64::try_from(file_crypto::encrypted_total_size(
            attachment.byte_size as u64,
        ))
        .map_err(|_| AppError::BadRequest("加密文件大小超出系统支持范围".to_string()))?;
        Some(AttachmentEncryptionPayload {
            algorithm: "AES-256-GCM",
            format: encryption.encryption_format,
            chunk_size: file_crypto::FILE_CHUNK_SIZE as i64,
            key: BASE64.encode(data_key),
            file_object_id: attachment.file_object_id,
            plaintext_byte_size: attachment.byte_size,
            plaintext_sha256: checksum_sha256.clone(),
            encrypted_byte_size: if is_download {
                encryption.encrypted_byte_size
            } else {
                encrypted_byte_size
            },
            encrypted_checksum_sha256: if is_download {
                encryption.encrypted_checksum_sha256
            } else {
                String::new()
            },
        })
    } else {
        None
    };

    Ok(AttachmentSignedUrlPayload {
        attachment: attachment_payload(attachment),
        request,
        expires_in_seconds,
        expires_at,
        checksum_sha256,
        encryption: encryption_payload,
    })
}

fn set_signed_upload_content_length(
    request: &mut storage::SignedObjectRequest,
    encrypted_byte_size: i64,
) {
    request
        .headers
        .retain(|(name, _)| !name.eq_ignore_ascii_case("content-length"));
    request.headers.push((
        "content-length".to_string(),
        encrypted_byte_size.to_string(),
    ));
}

fn normalize_signed_url_expiration(kind: SignedUrlKind, value: Option<u64>) -> AppResult<u64> {
    let default_value = match kind {
        SignedUrlKind::Upload => storage::DEFAULT_UPLOAD_URL_TTL_SECONDS as u64,
        SignedUrlKind::Download => storage::DEFAULT_DOWNLOAD_URL_TTL_SECONDS as u64,
    };
    let value = value.unwrap_or(default_value);
    if !(60..=3600).contains(&value) {
        return Err(AppError::BadRequest(
            "签名有效期必须在 60-3600 秒之间".to_string(),
        ));
    }
    Ok(value)
}

fn normalize_api_pagination(
    page: Option<i64>,
    per_page: Option<i64>,
) -> AppResult<projects::Pagination> {
    let page = page.unwrap_or(1);
    let per_page = per_page.unwrap_or(20);
    if page < 1 {
        return Err(AppError::BadRequest("页码不能小于 1".to_string()));
    }
    if !(1..=100).contains(&per_page) {
        return Err(AppError::BadRequest(
            "每页数量必须在 1-100 之间".to_string(),
        ));
    }
    Ok(projects::Pagination { page, per_page })
}

fn parse_api_optional_i64(value: &str) -> AppResult<Option<i64>> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    let parsed = value
        .parse::<i64>()
        .map_err(|_| AppError::BadRequest("参数必须是有效数字".to_string()))?;
    if parsed <= 0 {
        return Err(AppError::BadRequest("参数必须大于 0".to_string()));
    }
    Ok(Some(parsed))
}

fn paginate_api_items<T>(items: Vec<T>, pagination: projects::Pagination) -> PaginatedPayload<T>
where
    T: Serialize,
{
    let total_items = items.len() as i64;
    let offset = pagination.offset().min(total_items) as usize;
    let paged_items = items
        .into_iter()
        .skip(offset)
        .take(pagination.per_page as usize)
        .collect();

    PaginatedPayload {
        items: paged_items,
        pagination: PaginationPayload {
            page: pagination.page,
            per_page: pagination.per_page,
            total_items,
            total_pages: total_pages(total_items, pagination.per_page),
        },
    }
}

fn total_pages(total_items: i64, per_page: i64) -> i64 {
    if total_items == 0 {
        1
    } else {
        (total_items + per_page - 1) / per_page
    }
}

fn fallback_text(value: String, fallback: &str) -> String {
    if value.trim().is_empty() {
        fallback.to_string()
    } else {
        value
    }
}

fn attachment_payload(attachment: files::FileAttachmentSummary) -> AttachmentPayload {
    AttachmentPayload {
        id: attachment.id,
        file_object_id: attachment.file_object_id,
        object_key: attachment.object_key,
        filename: attachment.original_filename,
        content_type: attachment.content_type,
        byte_size: attachment.byte_size,
        status: attachment.status,
        created_by: attachment.created_by_display_name,
        created_at: attachment.created_at,
    }
}

fn attachment_preview_navigation(
    attachments: Vec<files::FileAttachmentSummary>,
    current_attachment_id: i64,
    legacy_preview_enabled: bool,
    link_url: impl Fn(&files::FileAttachmentSummary) -> String,
) -> AttachmentPreviewNavigationPayload {
    let previewable = attachments
        .into_iter()
        .filter(|attachment| {
            attachment.status == "uploaded"
                && attachment_preview::kind(
                    &attachment.original_filename,
                    &attachment.content_type,
                    legacy_preview_enabled,
                )
                .is_some()
        })
        .collect::<Vec<_>>();
    let total = previewable.len();
    let Some(current_index) = previewable
        .iter()
        .position(|attachment| attachment.id == current_attachment_id)
    else {
        return AttachmentPreviewNavigationPayload {
            position: 0,
            total,
            previous: None,
            next: None,
        };
    };
    let link = |attachment: &files::FileAttachmentSummary| AttachmentPreviewNavigationLinkPayload {
        id: attachment.id,
        title: attachment.original_filename.clone(),
        url: link_url(attachment),
    };

    AttachmentPreviewNavigationPayload {
        position: current_index + 1,
        total,
        previous: current_index
            .checked_sub(1)
            .and_then(|index| previewable.get(index))
            .map(link),
        next: previewable.get(current_index + 1).map(link),
    }
}

fn ensure_attachment_preview_content_enabled(
    attachment: &files::FileAttachmentSummary,
    legacy_preview_enabled: bool,
) -> AppResult<()> {
    if attachment.status == "deleted" {
        return Err(AppError::NotFound("附件已归档，不能预览".to_string()));
    }
    if attachment.status != "uploaded" {
        return Err(AppError::BadRequest(
            "附件尚未上传完成，请稍后再试".to_string(),
        ));
    }
    if attachment_preview::kind(
        &attachment.original_filename,
        &attachment.content_type,
        legacy_preview_enabled,
    )
    .is_none()
    {
        return Err(AppError::BadRequest("当前文件类型暂不支持预览".to_string()));
    }
    Ok(())
}

fn resolved_preview_content_type(
    stored_content_type: &str,
    registered_content_type: &str,
    filename: &str,
) -> String {
    if attachment_preview::strategy(filename, registered_content_type)
        == Some(attachment_preview::AttachmentPreviewStrategy::Text)
    {
        return "text/plain; charset=utf-8".to_string();
    }
    let normalized_stored = stored_content_type.trim().to_ascii_lowercase();
    if !normalized_stored.is_empty() && normalized_stored != "application/octet-stream" {
        return stored_content_type.to_string();
    }
    let normalized_registered = registered_content_type.trim().to_ascii_lowercase();
    if !normalized_registered.is_empty() && normalized_registered != "application/octet-stream" {
        return registered_content_type.trim().to_string();
    }
    attachment_preview::image_content_type_for_filename(filename)
        .unwrap_or("application/octet-stream")
        .to_string()
}

#[cfg(test)]
mod preview_content_type_tests {
    use super::resolved_preview_content_type;

    #[test]
    fn text_preview_uses_stable_plain_text_content_type() {
        assert_eq!(
            resolved_preview_content_type(
                "application/octet-stream",
                "application/octet-stream",
                "notes.md",
            ),
            "text/plain; charset=utf-8",
        );
        assert_eq!(
            resolved_preview_content_type("text/markdown", "text/markdown", "notes.md"),
            "text/plain; charset=utf-8",
        );
    }
}

fn parse_single_byte_range(value: &str, total: usize) -> Option<(usize, usize)> {
    let range = value.strip_prefix("bytes=")?;
    if total == 0 || range.contains(',') {
        return None;
    }
    let (start, end) = range.split_once('-')?;
    if start.is_empty() {
        let suffix = end.parse::<usize>().ok()?;
        if suffix == 0 {
            return None;
        }
        return Some((total.saturating_sub(suffix), total - 1));
    }
    let start = start.parse::<usize>().ok()?;
    if start >= total {
        return None;
    }
    let end = if end.is_empty() {
        total - 1
    } else {
        end.parse::<usize>().ok()?.min(total - 1)
    };
    (start <= end).then_some((start, end))
}

fn range_not_satisfiable_response(total: usize) -> AppResult<Response> {
    let mut response = StatusCode::RANGE_NOT_SATISFIABLE.into_response();
    let headers = response.headers_mut();
    headers.insert(header::CONTENT_RANGE, format!("bytes */{total}").parse()?);
    headers.insert(header::ACCEPT_RANGES, "bytes".parse()?);
    headers.insert(header::X_CONTENT_TYPE_OPTIONS, "nosniff".parse()?);
    headers.insert(header::CACHE_CONTROL, "private, no-store".parse()?);
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        "default-src 'none'; sandbox".parse()?,
    );
    Ok(response)
}

fn audit_log_payload(log: audit::AuditLogSummary) -> AuditLogPayload {
    AuditLogPayload {
        id: log.id,
        actor_display_name: log.actor_display_name,
        actor_username: log.actor_username,
        action: log.action,
        target_type: log.target_type,
        target_id: log.target_id,
        metadata: log.metadata,
        ip: log.ip,
        user_agent: log.user_agent,
        created_at: log.created_at,
    }
}

fn system_user_payload(user: users::UserSummary) -> SystemUserPayload {
    SystemUserPayload {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        email: user.email,
        mobile: user.mobile,
        status: user.status,
        is_super_admin: user.is_super_admin,
        role_code: user.role_code,
        role_names: user.role_names,
        created_at: user.created_at,
        updated_at: user.updated_at,
    }
}

async fn system_user_view_payload(
    pool: &SqlitePool,
    user: users::UserSummary,
) -> AppResult<SystemUserViewPayload> {
    if user.is_super_admin {
        return Ok(SystemUserViewPayload {
            user: system_user_payload(user),
            assigned_projects: Vec::new(),
        });
    }
    let active_counts =
        projects::count_pending_assigned_work_items_by_project(pool, user.id, false)
            .await?
            .into_iter()
            .map(|entry| (entry.project_key, entry.total))
            .collect::<HashMap<_, _>>();
    let assigned_projects = projects::list_user_project_memberships(pool, user.id)
        .await?
        .into_iter()
        .map(|project| system_user_project_payload(project, &active_counts))
        .collect();
    Ok(SystemUserViewPayload {
        user: system_user_payload(user),
        assigned_projects,
    })
}

fn system_user_project_payload(
    project: projects::UserProjectMembershipSummary,
    active_counts: &HashMap<String, i64>,
) -> SystemUserProjectPayload {
    let active_assigned_count = active_counts
        .get(&project.project_key)
        .copied()
        .unwrap_or(0);
    let can_update_role = project.member_role != "owner";
    let can_remove = can_update_role && active_assigned_count <= 0;
    let remove_block_reason = if !can_update_role {
        "该成员当前是项目负责人，请先在项目详情中转移负责人".to_string()
    } else if can_remove {
        String::new()
    } else {
        format!(
            "该成员在此项目仍有 {active_assigned_count} 个待处理 / 进行中 / 待确认工作项，需先转交处理人"
        )
    };
    SystemUserProjectPayload {
        key: project.project_key,
        name: project.project_name,
        status: project.project_status,
        role_code: project.member_role,
        active_assigned_count,
        can_remove,
        can_update_role,
        remove_block_reason,
    }
}

async fn ensure_system_user_project_management(
    pool: &SqlitePool,
    headers: &HeaderMap,
    actor: &auth::AuthUser,
) -> AppResult<()> {
    ensure_api_permission(pool, headers, actor.id, "system.users.manage").await?;
    ensure_api_permission(pool, headers, actor.id, "project.manage").await?;
    if api_user_can_access_all_projects(pool, actor).await? {
        return Ok(());
    }
    Err(AppError::Forbidden(
        "需要全项目管理权限才能管理用户项目关系".to_string(),
    ))
}

async fn require_manageable_system_user(
    pool: &SqlitePool,
    username: &str,
) -> AppResult<users::UserSummary> {
    let user = users::get_user_summary_by_username(pool, username)
        .await?
        .ok_or_else(|| AppError::BadRequest("用户不存在".to_string()))?;
    if user.is_super_admin {
        return Err(AppError::BadRequest(
            "超级管理员默认拥有全项目访问，无需管理项目关系".to_string(),
        ));
    }
    Ok(user)
}

async fn ensure_system_user_projects_removable(
    pool: &SqlitePool,
    user_id: i64,
    project_keys: &[String],
) -> AppResult<()> {
    let active_counts =
        projects::count_pending_assigned_work_items_by_project(pool, user_id, false)
            .await?
            .into_iter()
            .map(|entry| (entry.project_key, entry.total))
            .collect::<HashMap<_, _>>();
    let memberships = projects::list_user_project_memberships(pool, user_id)
        .await?
        .into_iter()
        .map(|project| (project.project_key.clone(), project))
        .collect::<HashMap<_, _>>();
    for project_key in project_keys {
        let project = memberships
            .get(project_key)
            .ok_or_else(|| AppError::BadRequest(format!("用户当前未加入项目 {project_key}")))?;
        let relation = system_user_project_payload(project.clone(), &active_counts);
        if !relation.can_remove {
            return Err(AppError::BadRequest(relation.remove_block_reason));
        }
    }
    Ok(())
}

fn normalize_unique_non_empty_strings(values: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .filter(|value| seen.insert((*value).to_string()))
        .map(str::to_string)
        .collect()
}

fn system_role_payload(role: rbac::RoleSummary) -> SystemRolePayload {
    SystemRolePayload {
        role_code: role.role_code,
        role_name: role.role_name,
        status: role.status,
        is_system: role.is_system,
        data_scope_type: role.data_scope_type,
        permission_count: role.permission_count,
    }
}

fn system_permission_payload(permission: rbac::PermissionSummary) -> SystemPermissionPayload {
    SystemPermissionPayload {
        permission_key: permission.permission_key,
        permission_name: permission.permission_name,
        resource_type: permission.resource_type,
        resource_key: permission.resource_key,
        granted: permission.granted,
    }
}

fn database_stats_snapshot_payload(
    snapshot: database_stats::DatabaseStatsSnapshot,
) -> DatabaseStatsSnapshotPayload {
    DatabaseStatsSnapshotPayload {
        refreshed_at: snapshot.refreshed_at,
        tables: snapshot
            .tables
            .into_iter()
            .map(|table| DatabaseTableStatsPayload {
                table_name: table.table_name,
                remark: table.remark,
                row_count: table.row_count,
                column_count: table.column_count,
                columns: table
                    .columns
                    .into_iter()
                    .map(|column| DatabaseStatsColumnPayload {
                        name: column.name,
                        data_type: column.data_type,
                        required: column.required,
                        primary_key: column.primary_key,
                        default_value: column.default_value,
                    })
                    .collect(),
            })
            .collect(),
    }
}

fn storage_config_payload(config: storage::StorageConfig) -> StorageConfigPayload {
    StorageConfigPayload {
        id: config.id,
        provider: config.provider,
        endpoint: config.endpoint,
        region: config.region,
        bucket: config.bucket,
        access_key_id_hint: config.access_key_id_hint,
        status: config.status,
        version: config.version,
        updated_at: config.updated_at,
    }
}

fn storage_config_version_payload(
    version: storage::StorageConfigVersion,
) -> StorageConfigVersionPayload {
    StorageConfigVersionPayload {
        id: version.id,
        storage_config_id: version.storage_config_id,
        version: version.version,
        provider: version.provider,
        endpoint: version.endpoint,
        region: version.region,
        bucket: version.bucket,
        access_key_id_hint: version.access_key_id_hint,
        snapshot_status: version.snapshot_status,
        current_status: version.current_status,
        created_by: version.created_by,
        created_at: version.created_at,
    }
}

fn system_api_token_payload(
    token: system_api_tokens::SystemApiTokenSummary,
) -> SystemApiTokenPayload {
    SystemApiTokenPayload {
        id: token.id,
        name: token.name,
        scopes: token.scopes,
        token_suffix: token.token_suffix,
        created_by: token.created_by_display_name,
        updated_by: token.updated_by_display_name,
        last_used_at: token.last_used_at,
        created_at: token.created_at,
        updated_at: token.updated_at,
    }
}

fn default_project_status() -> String {
    "not_started".to_string()
}

fn default_true() -> bool {
    true
}

fn default_priority() -> String {
    "P2".to_string()
}

fn default_member_role() -> String {
    "member".to_string()
}

fn default_data_scope_type() -> String {
    "self".to_string()
}

fn default_activate_storage_config() -> bool {
    true
}

pub async fn create_project_folder(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Json(payload): Json<CreateFolderRequest>,
) -> AppResult<impl IntoResponse> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let folder = files::create_folder(
        pool,
        files::CreateFolderInput {
            parent_id: payload.parent_id,
            project_id: project.id,
            name: payload.name,
            description: Some(payload.description),
            created_by_user_id: user.id,
            created_by_display_name_snapshot: principal.actor_display_name_snapshot(),
        },
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "folder.create",
        "project",
        &project_key,
        &format!(r#"{{"folder_id":{},"name":"{}"}}"#, folder.id, folder.name),
    )
    .await?;

    Ok((StatusCode::CREATED, json(folder_payload(folder))))
}

pub async fn list_project_folders(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<Vec<FolderPayload>>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    let payload = files::list_folders(pool, project.id, None)
        .await?
        .into_iter()
        .map(folder_payload)
        .collect();

    Ok(json(payload))
}

pub async fn get_project_folder_tree(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<Vec<FolderTreePayload>>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    let payload = files::get_folder_tree(pool, project.id)
        .await?
        .into_iter()
        .map(folder_tree_payload)
        .collect();

    Ok(json(payload))
}

pub async fn get_folder_content(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Query(query): Query<FolderContentQuery>,
) -> AppResult<axum::Json<ApiEnvelope<FolderContentPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    let content = files::get_folder_content(pool, project.id, query.folder_id).await?;

    Ok(json(folder_content_payload(content)))
}

#[derive(Debug, Deserialize)]
pub struct FolderContentQuery {
    #[serde(default)]
    folder_id: Option<i64>,
}

pub async fn update_folder(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(folder_id): Path<i64>,
    Json(payload): Json<UpdateFolderRequest>,
) -> AppResult<axum::Json<ApiEnvelope<FolderPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.manage").await?;
    let folder = files::get_folder(pool, folder_id).await?;
    let project = projects::get_project_detail_by_id(pool, folder.project_id)
        .await?
        .ok_or_else(|| AppError::NotFound("文件夹所属项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let updated = files::update_folder(
        pool,
        folder_id,
        files::UpdateFolderInput {
            name: payload.name,
            description: payload.description,
        },
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "folder.update",
        "project",
        &project.project_key,
        &format!(
            r#"{{"folder_id":{},"name":"{}"}}"#,
            updated.id, updated.name
        ),
    )
    .await?;

    Ok(json(folder_payload(updated)))
}

pub async fn delete_folder(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(folder_id): Path<i64>,
) -> AppResult<axum::Json<ApiEnvelope<FolderPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.manage").await?;
    let folder = files::get_folder(pool, folder_id).await?;
    let project = projects::get_project_detail_by_id(pool, folder.project_id)
        .await?
        .ok_or_else(|| AppError::NotFound("文件夹所属项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let deleted = files::delete_folder(pool, folder_id).await?;
    audit::record(
        pool,
        Some(user.id),
        "folder.delete",
        "project",
        &project.project_key,
        &format!(
            r#"{{"folder_id":{},"name":"{}"}}"#,
            deleted.id, deleted.name
        ),
    )
    .await?;

    Ok(json(folder_payload(deleted)))
}

pub async fn move_file_to_folder(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(file_object_id): Path<i64>,
    Json(payload): Json<MoveFileRequest>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.manage").await?;
    let project_attachment =
        files::get_project_attachment_for_file_object(pool, file_object_id).await?;
    let project = projects::get_project_detail_by_id(pool, project_attachment.project_id)
        .await?
        .ok_or_else(|| AppError::NotFound("文件所属项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let folder_id = payload.folder_id;

    if let Some(fid) = folder_id {
        let folder = files::get_folder(pool, fid).await?;
        if folder.project_id != project.id {
            return Err(AppError::BadRequest(
                "目标文件夹不属于文件所在项目".to_string(),
            ));
        }
    }

    let updated = files::move_file_to_folder(pool, file_object_id, folder_id).await?;
    let attachment = files::get_attachment(pool, project_attachment.attachment.id).await?;
    if attachment.file_object_id != updated.id {
        return Err(AppError::BadRequest("文件移动状态异常".to_string()));
    }

    Ok(json(attachment_payload(attachment)))
}

#[derive(Debug, Deserialize)]
pub struct MoveFileRequest {
    #[serde(default)]
    folder_id: Option<i64>,
}

fn folder_payload(folder: files::FileFolder) -> FolderPayload {
    FolderPayload {
        id: folder.id,
        parent_id: folder.parent_id,
        name: folder.name,
        description: folder.description,
        created_by: folder.created_by_display_name,
        created_at: folder.created_at,
        updated_at: folder.updated_at,
    }
}

fn folder_tree_payload(item: files::FolderTreeItem) -> FolderTreePayload {
    FolderTreePayload {
        id: item.id,
        parent_id: item.parent_id,
        name: item.name,
        description: item.description,
        children: item.children.into_iter().map(folder_tree_payload).collect(),
    }
}

fn folder_content_payload(content: files::FolderContentSummary) -> FolderContentPayload {
    FolderContentPayload {
        folder_id: content.folder_id,
        folder_name: content.folder_name,
        folders: content.folders.into_iter().map(folder_payload).collect(),
        files: content.files.into_iter().map(attachment_payload).collect(),
    }
}
