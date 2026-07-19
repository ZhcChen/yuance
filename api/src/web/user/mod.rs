use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path as FsPath, PathBuf},
    process::Command,
};

use askama::Template;
use axum::{
    Form,
    extract::{Path, Query, RawForm, State},
    http::{HeaderMap, StatusCode, header},
    response::{Html, IntoResponse, Redirect, Response},
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::Digest;
use sqlx::SqlitePool;

use crate::{
    domains::{
        api_tokens, audit, auth,
        bootstrap::{self, BootstrapInitInput},
        files, notifications, project_resources, projects, rbac, storage, users,
    },
    platform::error::{AppError, AppResult},
    platform::{crypto, security::csrf},
    web::{audit_context, response, router::AppState},
};

#[derive(Debug, Clone)]
struct Metric {
    label: &'static str,
    value: String,
    tone: &'static str,
    icon: &'static str,
}

#[derive(Debug, Clone)]
struct ProjectRow {
    code: String,
    name: String,
    owner: String,
    pending_in_progress_confirmation_count: i64,
    total_work_items: i64,
    status_code: String,
    status: String,
    status_tone: &'static str,
    updated_at: String,
    pending_requirements: i64,
    pending_tasks: i64,
    pending_bugs: i64,
}

#[derive(Debug, Clone)]
struct PersonalAnalysisMetric {
    label: &'static str,
    value: String,
    tone: &'static str,
    icon: &'static str,
}

#[derive(Debug, Clone)]
struct PersonalCompletionView {
    key: String,
    kind_code: &'static str,
    kind: &'static str,
    title: String,
    completed_at: String,
}

#[derive(Template)]
#[template(path = "web/projects/personal_analysis.html")]
struct PersonalProjectAnalysisTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    topbar_project_options: Vec<ProjectOption>,
    project: ProjectDetailView,
    output_metrics: Vec<PersonalAnalysisMetric>,
    efficiency_metrics: Vec<PersonalAnalysisMetric>,
    pending: projects::WorkItemAssignmentCounts,
    active_days: i64,
    comment_count: i64,
    handoff_count: i64,
    joined_at: String,
    recent_completions: Vec<PersonalCompletionView>,
    has_recent_completions: bool,
    current_username: String,
}

#[derive(Debug, Clone)]
struct ProjectListSummary {
    total_projects: usize,
    active_projects: usize,
    pending_in_progress_confirmation_count: i64,
}

#[derive(Debug, Clone)]
struct ProjectOption {
    key: String,
    name: String,
}

#[derive(Debug, Clone)]
struct CurrentProjectView {
    key: String,
    name: String,
}

#[derive(Debug, Clone)]
struct ProjectDetailView {
    code: String,
    name: String,
    description: String,
    owner_username: String,
    owner: String,
    status_code: String,
    status: String,
    status_tone: &'static str,
    start_date: String,
    due_date: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone)]
struct ProjectMemberView {
    display_name: String,
    username: String,
    role_code: String,
    role: String,
    joined_at: String,
}

#[derive(Debug, Clone)]
struct ProjectUserOption {
    display_name: String,
    username: String,
    roles: String,
}

#[derive(Debug, Clone)]
struct ProjectResourceView {
    id: i64,
    title: String,
    category_code: String,
    category: String,
    summary: String,
    status_code: String,
    status: String,
    status_tone: &'static str,
    is_protected: bool,
    created_by: String,
    updated_by: String,
    created_at: String,
    updated_at: String,
    url: String,
}

#[derive(Debug, Clone, Default)]
struct ProjectResourceFilterView {
    q: String,
    category: String,
    status: String,
}

#[derive(Debug, Clone)]
struct ProjectResourceCategoryOption {
    value: &'static str,
    label: &'static str,
}

#[derive(Debug, Clone)]
struct ProjectResourceDetailView {
    id: i64,
    title: String,
    category_code: String,
    category: String,
    body: String,
    body_format: String,
    body_html: String,
    editor_body_html: String,
    summary: String,
    status_code: String,
    status: String,
    status_tone: &'static str,
    is_protected: bool,
    created_by: String,
    updated_by: String,
    archived_by: String,
    archived_at: String,
    created_at: String,
    updated_at: String,
    edit_url: String,
    archive_url: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct ProjectResourceAccessGrant {
    resource_id: i64,
    user_id: i64,
    expires_at: i64,
}

const PROJECT_RESOURCE_ACCESS_AAD: &[u8] = b"yuance:project-resource-access:v1";
const PROJECT_RESOURCE_ACCESS_TTL_SECONDS: i64 = 15 * 60;

#[derive(Debug, Clone)]
struct AttachmentView {
    id: i64,
    filename: String,
    content_type: String,
    is_previewable_image: bool,
    is_previewable_video: bool,
    is_previewable_document: bool,
    byte_size: String,
    status_code: String,
    status: String,
    status_tone: &'static str,
    created_by: String,
    created_at: String,
}

#[derive(Debug, Clone)]
struct ProjectDetailSummary {
    requirements: usize,
    tasks: usize,
    bugs: usize,
    pending_in_progress_confirmation_count: usize,
    members: usize,
}

#[derive(Debug, Clone)]
struct WorkItem {
    key: String,
    kind_code: String,
    kind: String,
    title: String,
    project: String,
    assignee: String,
    priority_code: String,
    priority: String,
    status_code: String,
    status: String,
    status_tone: &'static str,
}

#[derive(Debug, Clone)]
struct WorkItemDetailView {
    id: i64,
    key: String,
    kind_code: String,
    kind: String,
    title: String,
    description: String,
    description_html: String,
    project_key: String,
    project_name: String,
    parent_item_key: String,
    parent_title: String,
    has_parent: bool,
    assignee_username: String,
    assignee: String,
    reporter_username: String,
    reporter: String,
    priority_code: String,
    priority: String,
    status_code: String,
    status: String,
    status_tone: &'static str,
    due_date: String,
    created_at: String,
    updated_at: String,
    deleted_at: String,
    is_deleted: bool,
}

#[derive(Debug, Clone)]
struct WorkItemComment {
    id: i64,
    parent_comment_id: Option<i64>,
    parent_author: String,
    body: String,
    body_format: String,
    body_html: String,
    author: String,
    author_username: String,
    created_at: String,
    updated_at: String,
    is_edited: bool,
    is_flow: bool,
    attachments: Vec<AttachmentView>,
    has_attachments: bool,
    can_manage: bool,
}

#[derive(Debug, Clone)]
struct WorkItemFlowRecord {
    actor: String,
    created_at: String,
    status_change: String,
    assignee_change: String,
    note: String,
}

#[derive(Debug, Clone)]
struct WorkItemListSummary {
    total_items: i64,
    pending_in_progress_confirmation_count: i64,
    high_priority_items: i64,
}

#[derive(Debug, Clone, Default)]
struct WorkItemListFilterView {
    q: String,
    status: String,
    priority: String,
    project_key: String,
    assignee_username: String,
}

#[derive(Debug, Clone)]
struct PaginationView {
    page: i64,
    per_page: i64,
    total_items: i64,
    total_pages: i64,
    has_previous: bool,
    has_next: bool,
    previous_url: String,
    next_url: String,
    range_start: i64,
    range_end: i64,
}

#[derive(Debug, Clone)]
struct PaginationPageView {
    page: i64,
    url: String,
    current: bool,
}

#[derive(Debug, Clone)]
struct NotificationView {
    id: i64,
    kind_label: &'static str,
    title: String,
    body: String,
    actor: String,
    created_at: String,
    is_unread: bool,
}

#[derive(Debug, Clone)]
struct Activity {
    title: String,
    meta: String,
}

#[derive(Debug, Clone)]
struct SystemNav {
    visible: bool,
    dashboard: bool,
    users: bool,
    roles: bool,
    storage: bool,
    database_stats: bool,
    audit: bool,
    requirements_badge: String,
    tasks_badge: String,
    bugs_badge: String,
    notifications_badge: String,
}

impl SystemNav {
    fn all() -> Self {
        Self {
            visible: true,
            dashboard: true,
            users: true,
            roles: true,
            storage: true,
            database_stats: true,
            audit: true,
            requirements_badge: String::new(),
            tasks_badge: String::new(),
            bugs_badge: String::new(),
            notifications_badge: String::new(),
        }
    }
}

#[derive(Debug, Clone)]
struct UserRow {
    username: String,
    display_name: String,
    contact: String,
    role_code: String,
    status_code: String,
    status: String,
    status_tone: &'static str,
    role_names: String,
    is_super_admin: bool,
    updated_at: String,
}

#[derive(Debug, Clone)]
struct RoleRow {
    code: String,
    name: String,
    status_code: String,
    status: String,
    status_tone: &'static str,
    is_system: bool,
    data_scope: String,
    permission_count: i64,
}

#[derive(Debug, Clone)]
struct PermissionActionView {
    key: String,
    name: String,
    granted: bool,
}

#[derive(Debug, Clone)]
struct PermissionPageView {
    key: String,
    name: String,
    resource: String,
    granted: bool,
    actions: Vec<PermissionActionView>,
    has_actions: bool,
    total_count: usize,
    granted_count: usize,
}

#[derive(Debug, Clone)]
struct PermissionGroupView {
    key: String,
    name: String,
    pages: Vec<PermissionPageView>,
    total_count: usize,
    granted_count: usize,
    all_granted: bool,
}

#[derive(Debug, Clone)]
struct AuditLogRow {
    actor: String,
    action: String,
    target: String,
    metadata: String,
    ip: String,
    user_agent: String,
    created_at: String,
}

#[derive(Debug, Clone, Default)]
struct AuditLogFilterView {
    actor: String,
    action: String,
    target_type: String,
    target_id: String,
}

#[derive(Debug, Clone)]
struct UserProfileView {
    username: String,
    display_name: String,
    email: String,
    mobile: String,
    roles: String,
    status: String,
    status_tone: &'static str,
    created_at: String,
    updated_at: String,
    is_super_admin: bool,
}

#[derive(Debug, Clone)]
struct ApiTokenView {
    id: i64,
    name: String,
    scopes_label: String,
    project_scope: String,
    token_suffix: String,
    expires_at: String,
    last_used_at: String,
    created_at: String,
    status: &'static str,
    status_tone: &'static str,
    is_revoked: bool,
}

#[derive(Debug, Clone)]
struct MySummary {
    project_count: usize,
    assigned_count: usize,
    high_priority_count: usize,
}

#[derive(Debug, Clone)]
struct SearchResult {
    kind_code: String,
    kind: String,
    key: String,
    title: String,
    context: String,
    url: String,
    updated_at: String,
}

#[derive(Debug, Clone)]
struct StorageConfigView {
    has_config: bool,
    provider: String,
    endpoint: String,
    region: String,
    bucket: String,
    access_key_id_hint: String,
    status: String,
    status_tone: &'static str,
    version: i64,
    updated_at: String,
}

#[derive(Debug, Clone)]
struct StorageConfigVersionView {
    version: i64,
    provider: String,
    endpoint: String,
    region: String,
    bucket: String,
    access_key_id_hint: String,
    snapshot_status: String,
    snapshot_status_tone: &'static str,
    current_status: String,
    current_status_tone: &'static str,
    created_by: String,
    created_at: String,
    is_current_active: bool,
}

#[derive(Debug, Clone)]
struct StorageVersionsPageView {
    versions: Vec<StorageConfigVersionView>,
    has_versions: bool,
    pagination: PaginationView,
    pagination_pages: Vec<PaginationPageView>,
}

#[derive(Debug, Clone)]
struct StorageBucketInspectionView {
    provider: String,
    bucket: String,
    status: String,
    status_tone: &'static str,
    initialized: bool,
    needs_initialization: bool,
    can_write: bool,
    can_read: bool,
    can_delete: bool,
    marker_key: String,
    message: String,
    checks: Vec<StorageBucketCheckView>,
    has_checks: bool,
}

#[derive(Debug, Clone)]
struct StorageBucketCheckView {
    code: String,
    status: String,
    status_tone: &'static str,
    message: String,
}

#[derive(Template)]
#[template(path = "web/system/audit.html")]
struct SystemAuditTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    topbar_project_options: Vec<ProjectOption>,
    logs: Vec<AuditLogRow>,
    has_logs: bool,
    filters: AuditLogFilterView,
    pagination: PaginationView,
    pagination_pages: Vec<PaginationPageView>,
}

#[derive(Template)]
#[template(path = "web/dashboard.html")]
struct DashboardTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    topbar_project_options: Vec<ProjectOption>,
    metrics: Vec<Metric>,
    projects: Vec<ProjectRow>,
    activities: Vec<Activity>,
    can_manage_projects: bool,
    current_username: String,
}

struct DashboardRenderContext<'a> {
    pool: Option<&'a SqlitePool>,
    user_id: i64,
    can_access_all_projects: bool,
    current_user: String,
    current_username: String,
    csrf_token: String,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    topbar_project_options: Vec<ProjectOption>,
}

#[derive(Template)]
#[template(path = "web/me.html")]
struct MeTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    topbar_project_options: Vec<ProjectOption>,
    profile: UserProfileView,
    summary: MySummary,
    projects: Vec<ProjectRow>,
    api_tokens: Vec<ApiTokenView>,
    has_api_tokens: bool,
    api_token_active_count: usize,
    api_token_limit: i64,
    can_create_api_token: bool,
    created_api_token: String,
    has_created_api_token: bool,
    has_projects: bool,
}

#[derive(Template)]
#[template(path = "web/search.html")]
struct SearchTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    topbar_project_options: Vec<ProjectOption>,
    query: String,
    has_query: bool,
    results: Vec<SearchResult>,
    has_results: bool,
    pagination: PaginationView,
    pagination_pages: Vec<PaginationPageView>,
}

#[derive(Template)]
#[template(path = "web/projects.html")]
struct ProjectsTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    topbar_project_options: Vec<ProjectOption>,
    projects: Vec<ProjectRow>,
    summary: ProjectListSummary,
    has_projects: bool,
    can_manage_projects: bool,
    status_filter: String,
    pagination: PaginationView,
    pagination_pages: Vec<PaginationPageView>,
}

#[derive(Template)]
#[template(path = "web/projects/detail.html")]
struct ProjectDetailTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    topbar_project_options: Vec<ProjectOption>,
    project: ProjectDetailView,
    summary: ProjectDetailSummary,
    requirements: Vec<WorkItem>,
    members: Vec<ProjectMemberView>,
    member_candidates: Vec<ProjectUserOption>,
    resources: Vec<ProjectResourceView>,
    has_resources: bool,
    resource_filters: ProjectResourceFilterView,
    resource_category_options: Vec<ProjectResourceCategoryOption>,
    activities: Vec<Activity>,
    has_activities: bool,
    has_member_candidates: bool,
    project_item_type_options: Vec<WorkItemTypeOption>,
    can_edit_project: bool,
    can_manage_project: bool,
    can_manage_work_items: bool,
    active_tab: &'static str,
}

#[derive(Template)]
#[template(path = "web/projects/resource_detail.html")]
struct ProjectResourceDetailTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    topbar_project_options: Vec<ProjectOption>,
    project: ProjectDetailView,
    resource: ProjectResourceDetailView,
    resource_category_options: Vec<ProjectResourceCategoryOption>,
    can_manage_resources: bool,
    is_unlocked: bool,
    unlock_error: String,
}

#[derive(Template)]
#[template(path = "web/work_items/list.html")]
struct WorkItemListTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    current_project_required: bool,
    topbar_project_options: Vec<ProjectOption>,
    title: &'static str,
    create_label: &'static str,
    item_type: &'static str,
    items: Vec<WorkItem>,
    parent_options: Vec<WorkItem>,
    assignee_options: Vec<ProjectMemberView>,
    filters: WorkItemListFilterView,
    summary: WorkItemListSummary,
    pagination: PaginationView,
    pagination_pages: Vec<PaginationPageView>,
    has_items: bool,
    can_manage_work_items: bool,
}

#[derive(Template)]
#[template(path = "web/messages.html")]
struct MessagesTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    topbar_project_options: Vec<ProjectOption>,
    notifications: Vec<NotificationView>,
    unread_count: i64,
    unread_badge_label: String,
    filter: &'static str,
    filter_all: bool,
    filter_unread: bool,
    filter_read: bool,
    all_tab_url: String,
    unread_tab_url: String,
    read_tab_url: String,
    empty_title: &'static str,
    has_notifications: bool,
    pagination: PaginationView,
    pagination_pages: Vec<PaginationPageView>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MessageFilter {
    All,
    Unread,
    Read,
}

impl MessageFilter {
    fn from_query(filter: &str, unread: bool) -> Self {
        match filter.trim().to_ascii_lowercase().as_str() {
            "unread" => Self::Unread,
            "read" => Self::Read,
            _ if unread => Self::Unread,
            _ => Self::All,
        }
    }

    fn as_query_value(self) -> &'static str {
        match self {
            Self::All => "all",
            Self::Unread => "unread",
            Self::Read => "read",
        }
    }

    fn as_notification_filter(self) -> notifications::NotificationFilter {
        match self {
            Self::All => notifications::NotificationFilter::All,
            Self::Unread => notifications::NotificationFilter::Unread,
            Self::Read => notifications::NotificationFilter::Read,
        }
    }

    fn empty_title(self) -> &'static str {
        match self {
            Self::All => "暂无消息",
            Self::Unread => "没有未读消息",
            Self::Read => "没有已读消息",
        }
    }
}

#[derive(Debug, Clone)]
struct WorkItemTypeOption {
    value: &'static str,
    label: &'static str,
}

#[derive(Debug, Clone)]
struct WorkItemStatusOption {
    value: &'static str,
    label: &'static str,
    selected: bool,
}

#[derive(Template)]
#[template(path = "web/work_items/detail.html")]
struct WorkItemDetailTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    topbar_project_options: Vec<ProjectOption>,
    item: WorkItemDetailView,
    assignee_options: Vec<ProjectMemberView>,
    parent_options: Vec<WorkItem>,
    status_options: Vec<WorkItemStatusOption>,
    attachments: Vec<AttachmentView>,
    comments: Vec<WorkItemComment>,
    discussion_count: usize,
    has_comments: bool,
    flow_history_records: Vec<WorkItemFlowRecord>,
    has_flow_history: bool,
    flow_history_pagination: PaginationView,
    flow_history_pagination_pages: Vec<PaginationPageView>,
    has_attachments: bool,
    can_manage_work_items: bool,
    can_restore_work_items: bool,
}

#[derive(Template)]
#[template(path = "web/partials/work_item_detail.html")]
struct WorkItemDetailPartialTemplate {
    csrf_token: String,
    item: WorkItemDetailView,
    status_options: Vec<WorkItemStatusOption>,
    comments: Vec<WorkItemComment>,
    discussion_count: usize,
    has_comments: bool,
    can_manage_work_items: bool,
}

#[derive(Template)]
#[template(path = "web/partials/work_item_flow_history.html")]
struct WorkItemFlowHistoryPartialTemplate {
    item: WorkItemDetailView,
    flow_history_records: Vec<WorkItemFlowRecord>,
    has_flow_history: bool,
    flow_history_pagination: PaginationView,
    flow_history_pagination_pages: Vec<PaginationPageView>,
}

#[derive(Template)]
#[template(path = "web/document_preview.html")]
struct DocumentPreviewTemplate {
    title: String,
    source_url: String,
    source_label: String,
    kind_label: String,
    file_type_badge: String,
    meta_text: String,
    position_text: String,
    has_previous: bool,
    previous_url: String,
    previous_title: String,
    has_next: bool,
    next_url: String,
    next_title: String,
    download_url: String,
    has_error: bool,
    error_message: String,
    preview_hint: String,
    has_pdf_preview: bool,
    pdf_preview_url: String,
    has_text_preview: bool,
    text_preview_content: String,
    text_preview_line_count: usize,
    text_preview_is_truncated: bool,
    has_csv_preview: bool,
    csv_preview_headers: Vec<String>,
    csv_preview_rows: Vec<Vec<String>>,
    csv_preview_is_truncated: bool,
}

#[derive(Debug, Clone, Default)]
struct DocumentPreviewNavigation {
    position_text: String,
    previous: Option<DocumentPreviewNavigationLink>,
    next: Option<DocumentPreviewNavigationLink>,
}

#[derive(Debug, Clone)]
struct DocumentPreviewNavigationLink {
    title: String,
    url: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AttachmentPreviewStrategy {
    Pdf,
    Text,
    Csv,
    OfficePdf,
}

#[derive(Debug, Clone)]
struct TextPreviewContent {
    content: String,
    line_count: usize,
    is_truncated: bool,
}

#[derive(Debug, Clone)]
struct CsvPreviewTable {
    headers: Vec<String>,
    rows: Vec<Vec<String>>,
    is_truncated: bool,
}

#[derive(Template)]
#[template(path = "web/login.html")]
struct LoginTemplate {
    environment: String,
    csrf_token: String,
    error_message: String,
}

#[derive(Template)]
#[template(path = "web/bootstrap.html")]
struct BootstrapTemplate {
    environment: String,
    csrf_token: String,
}

#[derive(Template)]
#[template(path = "web/system/dashboard.html")]
struct SystemDashboardTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    topbar_project_options: Vec<ProjectOption>,
}

#[derive(Template)]
#[template(path = "web/system/storage.html")]
struct StorageSettingsTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    topbar_project_options: Vec<ProjectOption>,
    config: StorageConfigView,
    versions: Vec<StorageConfigVersionView>,
    has_versions: bool,
    pagination: PaginationView,
    pagination_pages: Vec<PaginationPageView>,
    bucket_inspection: StorageBucketInspectionView,
    message: String,
    message_tone: &'static str,
    can_manage_storage: bool,
}

#[derive(Template)]
#[template(path = "web/system/database_stats.html")]
struct SystemDatabaseStatsTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    topbar_project_options: Vec<ProjectOption>,
    cache_key: String,
}

#[derive(Template)]
#[template(path = "web/system/users.html")]
struct SystemUsersTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    topbar_project_options: Vec<ProjectOption>,
    users: Vec<UserRow>,
    roles: Vec<RoleRow>,
    has_users: bool,
    pagination: PaginationView,
    pagination_pages: Vec<PaginationPageView>,
    can_manage_users: bool,
}

#[derive(Template)]
#[template(path = "web/system/roles.html")]
struct SystemRolesTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    topbar_project_options: Vec<ProjectOption>,
    roles: Vec<RoleRow>,
    has_roles: bool,
    pagination: PaginationView,
    pagination_pages: Vec<PaginationPageView>,
    selected_role_code: String,
    selected_role_name: String,
    selected_role_status: String,
    selected_role_status_tone: &'static str,
    selected_role_is_system: bool,
    selected_role_data_scope: String,
    selected_role_permission_count: i64,
    has_selected_role: bool,
    can_manage_roles: bool,
    can_edit_selected_permissions: bool,
    permission_groups: Vec<PermissionGroupView>,
    has_permission_groups: bool,
    permission_total_count: usize,
    permission_granted_count: usize,
}

#[derive(Template)]
#[template(path = "web/system/permissions.html")]
struct SystemPermissionsTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    topbar_project_options: Vec<ProjectOption>,
    role_code: String,
    role_name: String,
    can_edit_permissions: bool,
    permission_groups: Vec<PermissionGroupView>,
    has_permission_groups: bool,
    permission_total_count: usize,
    permission_granted_count: usize,
}

#[derive(Template)]
#[template(path = "web/partials/work_items.html")]
struct WorkItemsPartialTemplate {
    items: Vec<WorkItem>,
    has_items: bool,
    empty_message: String,
}

#[derive(Debug, Deserialize)]
pub struct BootstrapForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    username: String,
    display_name: String,
    password: String,
    password_confirm: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    username: String,
    password: String,
}

#[derive(Debug, Deserialize)]
pub struct LogoutForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
    username: String,
    display_name: String,
    email: String,
    mobile: String,
    password: String,
    role_code: String,
}

#[derive(Debug, Deserialize)]
pub struct UserStatusForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
    status: String,
}

#[derive(Debug, Deserialize)]
pub struct UserRoleForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
    role_code: String,
}

#[derive(Debug, Deserialize)]
pub struct ResetPasswordForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
    password: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateRoleForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
    role_code: String,
    role_name: String,
    data_scope_type: String,
}

#[derive(Debug, Deserialize)]
pub struct RoleStatusForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
    status: String,
}

#[derive(Debug, Deserialize)]
pub struct RoleWorkbenchQuery {
    #[serde(default)]
    role: String,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct StorageSettingsQuery {
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct StorageConfigForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
    endpoint: String,
    region: String,
    bucket: String,
    access_key_id: String,
    access_key_secret: String,
    #[serde(default)]
    activate: String,
}

#[derive(Debug, Deserialize)]
pub struct StorageProbeForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct StorageInitializeForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct StorageRollbackForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProjectForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    name: String,
    description: String,
    status: String,
    #[serde(default)]
    start_date: String,
    #[serde(default)]
    due_date: String,
}

#[derive(Debug, Deserialize)]
pub struct ProjectEditForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    name: String,
    description: String,
    status: String,
    owner_username: String,
    #[serde(default)]
    start_date: String,
    #[serde(default)]
    due_date: String,
}

#[derive(Debug, Deserialize)]
pub struct CurrentProjectForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    project_key: String,
    #[serde(default)]
    return_to: String,
}

#[derive(Debug, Deserialize)]
pub struct ProjectListQuery {
    #[serde(default)]
    status: String,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateWorkItemForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    project_key: String,
    item_type: String,
    title: String,
    description: String,
    priority: String,
    #[serde(default)]
    assignee_username: String,
    #[serde(default)]
    due_date: String,
    #[serde(default)]
    parent_item_key: String,
    #[serde(default)]
    redirect_to: String,
}

#[derive(Debug, Deserialize)]
pub struct WorkItemStatusForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    status: String,
}

#[derive(Debug, Deserialize)]
pub struct WorkItemHandoffForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    status: String,
    #[serde(default)]
    assignee_username: String,
    #[serde(default)]
    body: String,
}

#[derive(Debug, Deserialize)]
pub struct WorkItemEditForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    title: String,
    description: String,
    status: String,
    priority: String,
    assignee_username: String,
    #[serde(default)]
    due_date: String,
    #[serde(default)]
    parent_item_key: String,
}

#[derive(Debug, Deserialize)]
pub struct WorkItemRestoreForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
}

#[derive(Debug, Deserialize)]
pub struct AttachmentForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    original_filename: String,
    content_type: String,
    byte_size: i64,
    #[serde(default)]
    folder_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct AttachmentDeleteForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
}

#[derive(Debug, Deserialize)]
pub struct ProjectResourceForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    title: String,
    category: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    body_format: String,
    #[serde(default)]
    access_password: String,
    #[serde(default)]
    access_password_action: String,
}

#[derive(Debug, Deserialize)]
pub struct ProjectResourceUnlockForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    password: String,
}

#[derive(Debug, Deserialize)]
pub struct WorkItemCommentForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    body: String,
    #[serde(default)]
    body_format: String,
    #[serde(default)]
    parent_comment_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct ProjectMemberRemoveForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
}

#[derive(Debug, Deserialize)]
pub struct ProjectMemberRoleForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    member_role: String,
}

#[derive(Debug, Deserialize)]
pub struct WorkItemsQuery {
    kind: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ProjectDetailQuery {
    #[serde(default)]
    tab: String,
    #[serde(default)]
    q: String,
    #[serde(default)]
    category: String,
    #[serde(default)]
    status: String,
}

#[derive(Debug, Deserialize)]
pub struct ResourceAccessQuery {
    #[serde(default)]
    access: String,
}

#[derive(Debug, Deserialize)]
pub struct MeProfileForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    display_name: String,
    #[serde(default)]
    email: String,
    #[serde(default)]
    mobile: String,
}

#[derive(Debug, Deserialize)]
pub struct MePasswordForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    current_password: String,
    new_password: String,
    new_password_confirm: String,
}

#[derive(Debug, Deserialize)]
pub struct MeApiTokenCreateForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    name: String,
    #[serde(default)]
    scopes: Vec<String>,
    #[serde(default)]
    project_scope: String,
    #[serde(default)]
    expires_at: String,
}

#[derive(Debug, Deserialize)]
pub struct MeApiTokenDeleteForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
}

#[derive(Debug, Deserialize)]
pub struct WorkItemListQuery {
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
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct WorkItemFlowHistoryQuery {
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    q: Option<String>,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct MessagesQuery {
    #[serde(default)]
    filter: String,
    #[serde(default)]
    unread: bool,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct MessageActionForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    #[serde(default)]
    filter: String,
    #[serde(default)]
    unread: bool,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct SystemUsersQuery {
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
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

pub async fn dashboard(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Response> {
    let Some(pool) = state.pool.as_ref() else {
        let csrf_token = csrf::ensure_token(&headers);
        return with_csrf_cookie(
            &state,
            &csrf_token,
            render_dashboard(
                &state,
                DashboardRenderContext {
                    pool: None,
                    user_id: 0,
                    can_access_all_projects: true,
                    current_user: "yuance_admin".to_string(),
                    current_username: "yuance_admin".to_string(),
                    csrf_token: csrf_token.clone(),
                    system_nav: SystemNav::all(),
                    current_project: None,
                    topbar_project_options: sample_project_options(),
                },
            )
            .await?
            .into_response(),
        );
    };

    if bootstrap::bootstrap_required(pool).await? {
        return bootstrap_redirect(&headers);
    }

    let Some(user) = auth::user_from_headers(pool, &headers).await? else {
        return login_redirect(&headers);
    };

    let can_access_all_projects =
        user_can_access_all_projects(pool, user.id, user.is_super_admin).await?;
    let (current_project, topbar_project_options) =
        build_project_context(pool, user.id, can_access_all_projects).await?;
    let system_nav = build_system_nav(
        pool,
        user.id,
        can_access_all_projects,
        current_project.as_ref().map(|project| project.key.as_str()),
    )
    .await?;

    let csrf_token = csrf::ensure_token(&headers);
    with_csrf_cookie(
        &state,
        &csrf_token,
        render_dashboard(
            &state,
            DashboardRenderContext {
                pool: Some(pool),
                user_id: user.id,
                can_access_all_projects,
                current_user: user.display_name,
                current_username: user.username,
                csrf_token: csrf_token.clone(),
                system_nav,
                current_project,
                topbar_project_options,
            },
        )
        .await?
        .into_response(),
    )
}

pub async fn me_page(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };

    render_me_response(&state, &headers, context, String::new()).await
}

async fn render_me_response(
    state: &AppState,
    headers: &HeaderMap,
    context: WebContext<'_>,
    created_api_token: String,
) -> AppResult<Response> {
    let (profile, projects, assigned_items, api_tokens) = match context.pool {
        Some(pool) => {
            let Some(profile) = users::get_user_summary(pool, context.user_id).await? else {
                return login_redirect(headers);
            };
            let projects =
                if rbac::user_has_permission(pool, context.user_id, "project.view").await? {
                    projects::list_project_summaries_for_user(
                        pool,
                        context.user_id,
                        context.can_access_all_projects,
                    )
                    .await?
                    .into_iter()
                    .map(project_from_summary)
                    .collect::<Vec<_>>()
                } else {
                    Vec::new()
                };
            let assigned_items =
                if rbac::user_has_permission(pool, context.user_id, "work_item.view").await? {
                    projects::list_assigned_work_item_summaries(pool, context.user_id, None)
                        .await?
                        .into_iter()
                        .map(work_item_from_summary)
                        .collect::<Vec<_>>()
                } else {
                    Vec::new()
                };
            let api_tokens = api_tokens::list_tokens(pool, context.user_id)
                .await?
                .into_iter()
                .map(api_token_view)
                .collect::<Vec<_>>();

            (
                user_profile_from_summary(profile),
                projects,
                assigned_items,
                api_tokens,
            )
        }
        None => (
            sample_user_profile(),
            sample_projects(),
            sample_work_items(None),
            Vec::new(),
        ),
    };
    let summary = my_summary(&projects, &assigned_items);
    let csrf_token = context.csrf_token.clone();
    let has_created_api_token = !created_api_token.is_empty();
    let api_token_active_count = api_tokens.iter().filter(|token| !token.is_revoked).count();
    let can_create_api_token =
        (api_token_active_count as i64) < api_tokens::MAX_ACTIVE_TOKENS_PER_USER;

    with_csrf_cookie(
        state,
        &csrf_token,
        response::html(MeTemplate {
            active: "me",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            has_projects: !projects.is_empty(),
            has_api_tokens: !api_tokens.is_empty(),
            api_token_active_count,
            api_token_limit: api_tokens::MAX_ACTIVE_TOKENS_PER_USER,
            can_create_api_token,
            api_tokens,
            created_api_token,
            has_created_api_token,
            profile,
            summary,
            projects,
        })?
        .into_response(),
    )
}

pub async fn me_profile_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(form): Form<MeProfileForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        let updated = users::update_own_profile(
            pool,
            context.user_id,
            users::UpdateOwnProfileInput {
                display_name: form.display_name,
                email: form.email,
                mobile: form.mobile,
            },
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "me.profile.update",
            "user",
            &updated.username,
            "{}",
        )
        .await?;
    }

    Ok(Redirect::to("/web/me").into_response())
}

pub async fn me_password_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(form): Form<MePasswordForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    if form.new_password != form.new_password_confirm {
        return Err(AppError::BadRequest("两次输入的新密码不一致".to_string()));
    }
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        let raw_session = auth::session_cookie(&headers).ok_or(AppError::Unauthorized)?;
        let raw_refresh = auth::refresh_cookie(&headers);
        users::change_own_password(
            pool,
            context.user_id,
            &form.current_password,
            &form.new_password,
            &raw_session,
            raw_refresh.as_deref(),
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "me.password.update",
            "user",
            &context.current_user,
            "{}",
        )
        .await?;
    }

    Ok(Redirect::to("/web/me").into_response())
}

pub async fn me_api_token_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    RawForm(form): RawForm,
) -> AppResult<Response> {
    let form = parse_api_token_create_form(&form)?;
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let mut raw_token = String::new();
    if let Some(pool) = context.pool {
        let created = api_tokens::create_token(
            pool,
            context.user_id,
            api_tokens::CreateApiTokenInput {
                name: form.name,
                scopes: form.scopes,
                project_scope: form.project_scope,
                expires_at: form.expires_at,
            },
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "api_token.create",
            "api_token",
            &created.token.id.to_string(),
            r#"{"source":"web"}"#,
        )
        .await?;
        raw_token = created.raw_token;
    }

    render_me_response(&state, &headers, context, raw_token).await
}

pub async fn me_api_token_delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(token_id): Path<i64>,
    Form(form): Form<MeApiTokenDeleteForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        let token = api_tokens::delete_token(pool, context.user_id, token_id).await?;
        audit::record(
            pool,
            Some(context.user_id),
            "api_token.delete",
            "api_token",
            &token.id.to_string(),
            r#"{"source":"web"}"#,
        )
        .await?;
    }

    Ok(Redirect::to("/web/me").into_response())
}

pub async fn search_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<SearchQuery>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let pagination = normalize_web_pagination(query.page, query.per_page)?;
    let query = query.q.unwrap_or_default().trim().to_string();
    if query.chars().count() > 128 {
        return Err(AppError::BadRequest(
            "搜索关键词不能超过 128 个字符".to_string(),
        ));
    }

    let (results, total_items, page_number, per_page) = if query.is_empty() {
        (Vec::new(), 0, pagination.page, pagination.per_page)
    } else {
        match context.pool {
            Some(pool) => {
                let can_view_projects =
                    rbac::user_has_permission(pool, context.user_id, "project.view").await?;
                let can_view_work_items =
                    rbac::user_has_permission(pool, context.user_id, "work_item.view").await?;
                let page = projects::search_visible_paginated(
                    pool,
                    context.user_id,
                    context.can_access_all_projects,
                    &query,
                    can_view_projects,
                    can_view_work_items,
                    pagination,
                )
                .await?;
                (
                    page.items.into_iter().map(search_result_from_hit).collect(),
                    page.total_items,
                    page.page,
                    page.per_page,
                )
            }
            None => {
                let sample_results = sample_search_results(&query);
                let total_items = sample_results.len() as i64;
                (
                    paginate_search_results(sample_results, pagination),
                    total_items,
                    pagination.page,
                    pagination.per_page,
                )
            }
        }
    };
    let total_pages = total_pages(total_items, per_page);
    let pagination =
        search_pagination_view(&query, page_number, per_page, total_items, total_pages);
    let pagination_pages = search_pagination_pages(
        &query,
        pagination.page,
        pagination.per_page,
        pagination.total_pages,
    );
    let csrf_token = context.csrf_token.clone();

    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(SearchTemplate {
            active: "search",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            has_query: !query.is_empty(),
            has_results: !results.is_empty(),
            query,
            results,
            pagination,
            pagination_pages,
        })?
        .into_response(),
    )
}

pub async fn messages_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<MessagesQuery>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let requested_pagination = normalize_web_pagination(query.page, query.per_page)?;
    let filter = MessageFilter::from_query(&query.filter, query.unread);
    let (items, total_items, page_number, per_page, unread_count) = match context.pool {
        Some(pool) => {
            let total_items = notifications::count_for_user_filtered(
                pool,
                context.user_id,
                filter.as_notification_filter(),
            )
            .await?;
            let total_pages = total_pages(total_items, requested_pagination.per_page);
            let page_number = requested_pagination.page.min(total_pages);
            let items = notifications::list_for_user_page_filtered(
                pool,
                context.user_id,
                filter.as_notification_filter(),
                page_number,
                requested_pagination.per_page,
            )
            .await?
            .into_iter()
            .map(notification_view)
            .collect::<Vec<_>>();
            (
                items,
                total_items,
                page_number,
                requested_pagination.per_page,
                notifications::unread_count(pool, context.user_id).await?,
            )
        }
        None => (
            Vec::new(),
            0,
            requested_pagination.page,
            requested_pagination.per_page,
            0,
        ),
    };
    let total_pages = total_pages(total_items, per_page);
    let pagination =
        message_pagination_view(filter, page_number, per_page, total_items, total_pages);
    let pagination_pages = message_pagination_pages(
        filter,
        pagination.page,
        pagination.per_page,
        pagination.total_pages,
    );
    let filter_all = filter == MessageFilter::All;
    let filter_unread = filter == MessageFilter::Unread;
    let filter_read = filter == MessageFilter::Read;
    response::html(MessagesTemplate {
        active: "messages",
        environment: state.settings.env.clone(),
        current_user: context.current_user,
        csrf_token: context.csrf_token,
        system_nav: context.system_nav,
        current_project: context.current_project,
        topbar_project_options: context.topbar_project_options,
        has_notifications: !items.is_empty(),
        notifications: items,
        unread_count,
        unread_badge_label: topnav_badge(unread_count),
        filter: filter.as_query_value(),
        filter_all,
        filter_unread,
        filter_read,
        all_tab_url: message_page_url(MessageFilter::All, 1, per_page),
        unread_tab_url: message_page_url(MessageFilter::Unread, 1, per_page),
        read_tab_url: message_page_url(MessageFilter::Read, 1, per_page),
        empty_title: filter.empty_title(),
        pagination,
        pagination_pages,
    })
    .map(IntoResponse::into_response)
}

pub async fn messages_mark_all_read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(form): Form<MessageActionForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let pagination = normalize_web_pagination(form.page, form.per_page)?;
    let filter = MessageFilter::from_query(&form.filter, form.unread);
    let redirect_url = message_page_url(filter, pagination.page, pagination.per_page);
    if let Some(pool) = context.pool {
        notifications::mark_all_read(pool, context.user_id).await?;
    }
    Ok(Redirect::to(&redirect_url).into_response())
}

pub async fn message_open(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(notification_id): Path<i64>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let Some(pool) = context.pool else {
        return Ok(Redirect::to("/web").into_response());
    };
    let notification = notifications::mark_read(pool, context.user_id, notification_id).await?;
    let target = match notification.comment_id {
        Some(comment_id) => format!(
            "/web/work-items/{}#comment-{}",
            notification.work_item_key, comment_id
        ),
        None => format!("/web/work-items/{}", notification.work_item_key),
    };
    Ok(Redirect::to(&target).into_response())
}

pub async fn projects_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ProjectListQuery>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "project.view").await?;
    }
    let status_filter = normalize_project_status_filter(&query.status)?;
    let pagination = normalize_web_pagination(query.page, query.per_page)?;
    let (projects, total_items, page_number, per_page) = match context.pool {
        Some(pool) => {
            let page = projects::list_project_summaries_for_user_paginated(
                pool,
                context.user_id,
                context.can_access_all_projects,
                projects::ProjectListFilter {
                    status: status_filter.clone(),
                },
                pagination,
            )
            .await?;
            let projects = page
                .items
                .into_iter()
                .map(project_from_summary)
                .collect::<Vec<_>>();
            (projects, page.total_items, page.page, page.per_page)
        }
        None => {
            let filtered = sample_projects()
                .into_iter()
                .filter(|project| project_matches_status_filter(project, &status_filter))
                .collect::<Vec<_>>();
            let total_items = filtered.len() as i64;
            let projects = paginate_project_views(filtered, pagination);
            (projects, total_items, pagination.page, pagination.per_page)
        }
    };
    let summary_projects: Vec<ProjectRow> = match context.pool {
        Some(pool) => projects::list_project_summaries_for_user(
            pool,
            context.user_id,
            context.can_access_all_projects,
        )
        .await?
        .into_iter()
        .map(project_from_summary)
        .filter(|project| project_matches_status_filter(project, &status_filter))
        .collect(),
        None => sample_projects()
            .into_iter()
            .filter(|project| project_matches_status_filter(project, &status_filter))
            .collect(),
    };
    let total_pages = total_pages(total_items, per_page);
    let summary = project_list_summary(&summary_projects);
    let pagination = project_pagination_view(
        &status_filter,
        page_number,
        per_page,
        total_items,
        total_pages,
    );
    let pagination_pages = project_pagination_pages(
        &status_filter,
        pagination.page,
        pagination.per_page,
        pagination.total_pages,
    );
    let can_manage_projects = match context.pool {
        Some(pool) => rbac::user_has_permission(pool, context.user_id, "project.manage").await?,
        None => true,
    };

    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(ProjectsTemplate {
            active: "projects",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            has_projects: !projects.is_empty(),
            projects,
            summary,
            can_manage_projects,
            status_filter,
            pagination_pages,
            pagination,
        })?
        .into_response(),
    )
}

pub async fn projects_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(form): Form<CreateProjectForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_manage_permission(pool, &headers, context.user_id, "project.manage").await?;
        let project = projects::create_project(
            pool,
            context.user_id,
            projects::CreateProjectInput {
                name: form.name,
                description: form.description,
                status: form.status,
                start_date: form.start_date,
                due_date: form.due_date,
            },
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "project.create",
            "project",
            &project.project_key,
            "{}",
        )
        .await?;

        return Ok(Redirect::to(&format!("/web/projects/{}", project.project_key)).into_response());
    }

    Ok(Redirect::to("/web/projects/YCE").into_response())
}

pub async fn project_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Form(form): Form<ProjectEditForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_manage_permission(pool, &headers, context.user_id, "project.manage").await?;
        let project = projects::get_project_detail(pool, &project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
        ensure_project_access(pool, &context, project.id).await?;
        ensure_project_member_manage_access(pool, &context, project.id).await?;
        let updated = projects::update_project(
            pool,
            context.user_id,
            &project_key,
            projects::UpdateProjectInput {
                name: form.name,
                description: form.description,
                status: form.status,
                owner_username: form.owner_username,
                start_date: form.start_date,
                due_date: form.due_date,
            },
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "project.update",
            "project",
            &updated.project_key,
            &format!(
                r#"{{"status":"{}","owner_username":"{}"}}"#,
                updated.status, updated.owner_username
            ),
        )
        .await?;

        return Ok(Redirect::to(&project_info_url(&updated.project_key)).into_response());
    }

    Ok(Redirect::to("/web/projects/YCE").into_response())
}

pub async fn current_project_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(form): Form<CurrentProjectForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };

    let mut selected_project_key = form.project_key.trim().to_ascii_uppercase();
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "project.view").await?;
        let selected = projects::set_current_project_for_user(
            pool,
            context.user_id,
            context.can_access_all_projects,
            &form.project_key,
        )
        .await?;
        selected_project_key = selected.project_key;
    }

    let return_to = project_switch_return_to(&form.return_to, &selected_project_key);
    Ok(Redirect::to(&return_to).into_response())
}

pub async fn project_detail_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Query(query): Query<ProjectDetailQuery>,
) -> AppResult<Response> {
    let mut context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let Some(pool) = context.pool else {
        return render_sample_project_detail(&state, context);
    };
    ensure_view_permission(pool, &headers, context.user_id, "project.view").await?;

    let Some(project) = projects::get_project_detail(pool, &project_key).await? else {
        return Ok(StatusCode::NOT_FOUND.into_response());
    };
    ensure_project_access(pool, &context, project.id).await?;
    let selected_project = projects::set_current_project_for_user(
        pool,
        context.user_id,
        context.can_access_all_projects,
        &project_key,
    )
    .await?;
    context.current_project = Some(current_project_from_domain(selected_project));
    refresh_context_system_nav(pool, &mut context).await?;

    let all_items = projects::list_project_work_items(pool, project.id, None).await?;
    let requirements = all_items
        .iter()
        .filter(|item| item.item_type == "requirement")
        .cloned()
        .map(work_item_from_summary)
        .collect::<Vec<_>>();
    let tasks = all_items
        .iter()
        .filter(|item| item.item_type == "task")
        .cloned()
        .map(work_item_from_summary)
        .collect::<Vec<_>>();
    let bugs = all_items
        .iter()
        .filter(|item| item.item_type == "bug")
        .cloned()
        .map(work_item_from_summary)
        .collect::<Vec<_>>();
    let members = projects::list_project_members(pool, project.id)
        .await?
        .into_iter()
        .map(project_member_from_summary)
        .collect::<Vec<_>>();
    let resource_filters = ProjectResourceFilterView {
        q: query.q.trim().to_string(),
        category: query.category.trim().to_string(),
        status: if query.status.trim().is_empty() {
            "active".to_string()
        } else {
            query.status.trim().to_string()
        },
    };
    let resources = project_resources::list_resources(
        pool,
        project.id,
        project_resources::ProjectResourceFilter {
            keyword: resource_filters.q.clone(),
            category: resource_filters.category.clone(),
            status: resource_filters.status.clone(),
        },
    )
    .await?
    .into_iter()
    .map(project_resource_from_summary)
    .collect::<Vec<_>>();
    let summary = project_detail_summary(&requirements, &tasks, &bugs, &members);
    let has_project_manage_permission =
        rbac::user_has_permission(pool, context.user_id, "project.manage").await?;
    let project_accepts_writes = projects::ensure_project_accepts_writes(&project.status).is_ok();
    let can_edit_project = has_project_manage_permission
        && user_can_manage_project_members_for_context(pool, &context, project.id).await?;
    let can_manage_project = can_edit_project && project_accepts_writes;
    let can_manage_work_items =
        user_can_write_project_content_for_context(pool, &context, project.id).await?
            && project_accepts_writes;
    let member_usernames = members
        .iter()
        .map(|member| member.username.as_str())
        .collect::<HashSet<_>>();
    let member_candidates = if can_manage_project {
        users::list_users(pool)
            .await?
            .into_iter()
            .filter(|user| {
                user.status == "active" && !member_usernames.contains(user.username.as_str())
            })
            .map(project_user_option_from_summary)
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    let activities = projects::list_project_activities(pool, project.id, 10)
        .await?
        .into_iter()
        .map(activity_from_summary)
        .collect::<Vec<_>>();
    let project = project_detail_from_domain(project);

    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(ProjectDetailTemplate {
            active: "projects",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            has_activities: !activities.is_empty(),
            project,
            summary,
            requirements,
            members,
            has_member_candidates: !member_candidates.is_empty(),
            member_candidates,
            has_resources: !resources.is_empty(),
            resources,
            resource_filters,
            resource_category_options: project_resource_category_options(),
            activities,
            project_item_type_options: work_item_type_options(),
            can_edit_project,
            can_manage_project,
            can_manage_work_items,
            active_tab: project_detail_tab(Some(query.tab.as_str())),
        })?
        .into_response(),
    )
}

pub async fn project_personal_analysis_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
) -> AppResult<Response> {
    let mut context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let Some(pool) = context.pool else {
        return Ok(Redirect::to("/web").into_response());
    };
    ensure_view_permission(pool, &headers, context.user_id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_project_access(pool, &context, project.id).await?;
    let selected = projects::set_current_project_for_user(
        pool,
        context.user_id,
        context.can_access_all_projects,
        &project_key,
    )
    .await?;
    context.current_project = Some(current_project_from_domain(selected));
    refresh_context_system_nav(pool, &mut context).await?;

    let username = sqlx::query_scalar::<_, String>("SELECT username FROM users WHERE id = ?1")
        .bind(context.user_id)
        .fetch_one(pool)
        .await?;
    let analysis = projects::personal_project_analysis(pool, project.id, context.user_id).await?;
    let output_metrics = vec![
        PersonalAnalysisMetric {
            label: "累计处理",
            value: analysis.completed_total.to_string(),
            tone: "info",
            icon: "pulse",
        },
        PersonalAnalysisMetric {
            label: "近 30 日",
            value: analysis.completed_last_30_days.to_string(),
            tone: "ok",
            icon: "calendar",
        },
        PersonalAnalysisMetric {
            label: "已处理 Bug",
            value: analysis.completed_bugs.to_string(),
            tone: "danger",
            icon: "bug",
        },
        PersonalAnalysisMetric {
            label: "当前待处理",
            value: (analysis.pending.requirements + analysis.pending.tasks + analysis.pending.bugs)
                .to_string(),
            tone: "warning",
            icon: "inbox",
        },
    ];
    let efficiency_metrics = vec![
        PersonalAnalysisMetric {
            label: "日平均处理",
            value: format!("{:.2}", analysis.daily_average),
            tone: "info",
            icon: "trend",
        },
        PersonalAnalysisMetric {
            label: "单日最大处理",
            value: analysis.daily_peak.to_string(),
            tone: "warning",
            icon: "peak",
        },
        PersonalAnalysisMetric {
            label: "月平均处理",
            value: format!("{:.2}", analysis.monthly_average),
            tone: "info",
            icon: "trend",
        },
        PersonalAnalysisMetric {
            label: "单月最大处理",
            value: analysis.monthly_peak.to_string(),
            tone: "ok",
            icon: "target",
        },
    ];
    let recent_completions = analysis
        .recent_completions
        .iter()
        .map(|item| PersonalCompletionView {
            key: item.item_key.clone(),
            kind_code: work_item_kind_code(&item.item_type),
            kind: work_item_kind_label(&item.item_type),
            title: item.title.clone(),
            completed_at: display_timestamp(item.completed_at.clone()),
        })
        .collect::<Vec<_>>();

    response::html(PersonalProjectAnalysisTemplate {
        active: "dashboard",
        environment: state.settings.env.clone(),
        current_user: context.current_user,
        csrf_token: context.csrf_token,
        system_nav: context.system_nav,
        current_project: context.current_project,
        topbar_project_options: context.topbar_project_options,
        project: project_detail_from_domain(project),
        output_metrics,
        efficiency_metrics,
        pending: analysis.pending,
        active_days: analysis.active_days,
        comment_count: analysis.comment_count,
        handoff_count: analysis.handoff_count,
        joined_at: display_timestamp(analysis.joined_at),
        has_recent_completions: !recent_completions.is_empty(),
        recent_completions,
        current_username: username,
    })
    .map(IntoResponse::into_response)
}

pub async fn project_member_add(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    RawForm(form): RawForm,
) -> AppResult<Response> {
    let form = parse_project_member_form(&form)?;
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_manage_permission(pool, &headers, context.user_id, "project.manage").await?;
        let project = projects::get_project_detail(pool, &project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
        ensure_project_access(pool, &context, project.id).await?;
        ensure_project_member_manage_access(pool, &context, project.id).await?;
        let mut seen_usernames = HashSet::new();
        let usernames = form
            .usernames
            .iter()
            .map(|username| username.trim())
            .filter(|username| !username.is_empty())
            .filter(|username| seen_usernames.insert((*username).to_string()))
            .map(str::to_string)
            .collect::<Vec<_>>();
        if usernames.is_empty() {
            return Err(AppError::BadRequest(
                "请至少选择一个要加入的项目成员".to_string(),
            ));
        }
        let mut added_usernames = Vec::new();
        for username in usernames {
            let member = projects::add_project_member(
                pool,
                context.user_id,
                &project_key,
                &username,
                &form.member_role,
            )
            .await?;
            added_usernames.push(member.username);
        }
        let added_usernames_json =
            serde_json::to_string(&added_usernames).unwrap_or_else(|_| "[]".to_string());
        let member_role_json =
            serde_json::to_string(&form.member_role).unwrap_or_else(|_| "\"member\"".to_string());
        audit::record(
            pool,
            Some(context.user_id),
            "project.member.add",
            "project",
            &project_key,
            &format!(r#"{{"usernames":{added_usernames_json},"member_role":{member_role_json}}}"#),
        )
        .await?;

        return Ok(Redirect::to(&project_members_url(&project_key)).into_response());
    }

    Ok(Redirect::to("/web/projects/YCE").into_response())
}

pub async fn project_member_remove(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, username)): Path<(String, String)>,
    Form(form): Form<ProjectMemberRemoveForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_manage_permission(pool, &headers, context.user_id, "project.manage").await?;
        let project = projects::get_project_detail(pool, &project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
        ensure_project_access(pool, &context, project.id).await?;
        ensure_project_member_manage_access(pool, &context, project.id).await?;
        projects::remove_project_member(pool, context.user_id, &project_key, &username).await?;
        audit::record(
            pool,
            Some(context.user_id),
            "project.member.remove",
            "project",
            &project_key,
            &format!(r#"{{"username":"{}"}}"#, username),
        )
        .await?;

        return Ok(Redirect::to(&project_members_url(&project_key)).into_response());
    }

    Ok(Redirect::to("/web/projects/YCE").into_response())
}

pub async fn project_member_role_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, username)): Path<(String, String)>,
    Form(form): Form<ProjectMemberRoleForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_manage_permission(pool, &headers, context.user_id, "project.manage").await?;
        let project = projects::get_project_detail(pool, &project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
        ensure_project_access(pool, &context, project.id).await?;
        ensure_project_member_manage_access(pool, &context, project.id).await?;
        let member = projects::update_project_member_role(
            pool,
            context.user_id,
            &project_key,
            &username,
            &form.member_role,
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "project.member.role.update",
            "project",
            &project_key,
            &format!(
                r#"{{"username":"{}","member_role":"{}"}}"#,
                member.username, member.member_role
            ),
        )
        .await?;

        return Ok(Redirect::to(&project_members_url(&project_key)).into_response());
    }

    Ok(Redirect::to("/web/projects/YCE").into_response())
}

pub async fn project_attachment_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Form(form): Form<AttachmentForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_manage_permission(pool, &headers, context.user_id, "work_item.manage").await?;
        let project = projects::get_project_detail(pool, &project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
        ensure_project_access(pool, &context, project.id).await?;
        ensure_project_content_write_access(pool, &context, project.id).await?;
        projects::ensure_project_accepts_writes(&project.status)?;
        let config = storage::active_config(pool)
            .await?
            .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
        let original_filename = form.original_filename;
        let activity_summary = format!("登记项目附件 {original_filename}");
        let attachment = files::create_attachment(
            pool,
            &config,
            files::CreateAttachmentInput {
                target_type: "project".to_string(),
                target_id: project.id,
                project_id: Some(project.id),
                folder_id: form.folder_id,
                original_filename,
                content_type: form.content_type,
                byte_size: form.byte_size,
                created_by_user_id: context.user_id,
                activity_summary: Some(activity_summary),
            },
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "file.attach.project",
            "project",
            &project_key,
            &format!(r#"{{"file_object_id":{}}}"#, attachment.file_object_id),
        )
        .await?;

        return Ok(Redirect::to(&project_info_url(&project_key)).into_response());
    }

    Ok(Redirect::to("/web/projects/YCE").into_response())
}

pub async fn project_attachment_delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, attachment_id)): Path<(String, i64)>,
    Form(form): Form<AttachmentDeleteForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_manage_permission(pool, &headers, context.user_id, "work_item.manage").await?;
        let project = projects::get_project_detail(pool, &project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
        ensure_project_access(pool, &context, project.id).await?;
        ensure_project_content_write_access(pool, &context, project.id).await?;
        projects::ensure_project_accepts_writes(&project.status)?;
        let attachment =
            files::get_attachment_for_target(pool, attachment_id, "project", project.id).await?;
        let activity_summary = format!("归档项目附件 {}", attachment.original_filename);
        let archived = files::archive_attachment(
            pool,
            attachment_id,
            "project",
            project.id,
            context.user_id,
            Some(project.id),
            Some(&activity_summary),
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "file.archive.project",
            "project",
            &project_key,
            &format!(
                r#"{{"attachment_id":{},"file_object_id":{}}}"#,
                archived.id, archived.file_object_id
            ),
        )
        .await?;

        return Ok(Redirect::to(&project_info_url(&project_key)).into_response());
    }

    Ok(Redirect::to("/web/projects/YCE").into_response())
}

pub async fn project_attachment_download(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, attachment_id)): Path<(String, i64)>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "project.view").await?;
        let project = projects::get_project_detail(pool, &project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
        ensure_project_access(pool, &context, project.id).await?;
        let attachment =
            files::get_attachment_for_target(pool, attachment_id, "project", project.id).await?;

        return attachment_download_redirect(
            &state,
            pool,
            context.user_id,
            attachment,
            "project",
            &project_key,
            format!(r#"{{"source":"web","attachment_id":{attachment_id}}}"#),
        )
        .await;
    }

    Ok(Redirect::to("/web/projects/YCE").into_response())
}

pub async fn project_attachment_preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, attachment_id)): Path<(String, i64)>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "project.view").await?;
        let project = projects::get_project_detail(pool, &project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
        ensure_project_access(pool, &context, project.id).await?;
        let attachment =
            files::get_attachment_for_target(pool, attachment_id, "project", project.id).await?;
        let download_url =
            format!("/web/projects/{project_key}/attachments/{attachment_id}/download");
        let navigation = document_preview_navigation(
            files::list_attachments(pool, "project", project.id).await?,
            attachment.id,
            |sibling_id| format!("/web/projects/{project_key}/attachments/{sibling_id}/preview"),
        );

        return attachment_document_preview_response(
            &state,
            pool,
            context.user_id,
            attachment,
            format!("/web/projects/{project_key}"),
            "返回项目".to_string(),
            navigation,
            &format!("/web/projects/{project_key}/attachments/{attachment_id}/preview/content"),
            "project",
            &project_key,
            format!(
                r#"{{"source":"web","project":"{}","attachment_id":{attachment_id}}}"#,
                project_key
            ),
            &download_url,
        )
        .await;
    }

    Ok(Redirect::to("/web/projects/YCE").into_response())
}

pub async fn project_attachment_preview_content(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, attachment_id)): Path<(String, i64)>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "project.view").await?;
        let project = projects::get_project_detail(pool, &project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
        ensure_project_access(pool, &context, project.id).await?;
        let attachment =
            files::get_attachment_for_target(pool, attachment_id, "project", project.id).await?;
        return attachment_document_preview_content_response(&state, pool, attachment).await;
    }

    Ok(Redirect::to("/web/projects/YCE").into_response())
}

pub async fn project_resource_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Form(form): Form<ProjectResourceForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "project.view").await?;
        let project = projects::get_project_detail(pool, &project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
        ensure_project_access(pool, &context, project.id).await?;
        ensure_project_content_write_access(pool, &context, project.id).await?;
        projects::ensure_project_accepts_writes(&project.status)?;
        let resource = project_resources::create_resource(
            pool,
            context.user_id,
            project_resources::CreateProjectResourceInput {
                project_id: project.id,
                title: form.title,
                category: form.category,
                body: form.body,
                body_format: form.body_format,
                access_password: form.access_password,
            },
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "project_resource.create",
            "project_resource",
            &resource.id.to_string(),
            &format!(r#"{{"project":"{}"}}"#, project.project_key),
        )
        .await?;

        return Ok(
            Redirect::to(&project_resource_url(&project.project_key, resource.id)).into_response(),
        );
    }

    Ok(Redirect::to("/web/projects/YCE?tab=library").into_response())
}

pub async fn project_resource_detail_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, resource_id)): Path<(String, i64)>,
) -> AppResult<Response> {
    let mut context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let Some(pool) = context.pool else {
        return Ok(Redirect::to("/web/projects/YCE?tab=library").into_response());
    };
    ensure_view_permission(pool, &headers, context.user_id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_project_access(pool, &context, project.id).await?;
    let selected_project = projects::set_current_project_for_user(
        pool,
        context.user_id,
        context.can_access_all_projects,
        &project_key,
    )
    .await?;
    context.current_project = Some(current_project_from_domain(selected_project));
    refresh_context_system_nav(pool, &mut context).await?;
    let resource = project_resources::get_project_resource(pool, project.id, resource_id).await?;
    let project_accepts_writes = projects::ensure_project_accepts_writes(&project.status).is_ok();
    let can_manage_resources =
        user_can_write_project_content_for_context(pool, &context, project.id).await?
            && project_accepts_writes
            && resource.status != "archived";
    let is_unlocked = !resource.is_protected;

    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(ProjectResourceDetailTemplate {
            active: "projects",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            project: project_detail_from_domain(project),
            resource: project_resource_from_detail(resource, None),
            resource_category_options: project_resource_category_options(),
            can_manage_resources,
            is_unlocked,
            unlock_error: String::new(),
        })?
        .into_response(),
    )
}

pub async fn project_resource_unlock(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, resource_id)): Path<(String, i64)>,
    Form(form): Form<ProjectResourceUnlockForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let mut context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let Some(pool) = context.pool else {
        return Ok(Redirect::to("/web/projects/YCE?tab=library").into_response());
    };
    ensure_view_permission(pool, &headers, context.user_id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_project_access(pool, &context, project.id).await?;
    let selected_project = projects::set_current_project_for_user(
        pool,
        context.user_id,
        context.can_access_all_projects,
        &project_key,
    )
    .await?;
    context.current_project = Some(current_project_from_domain(selected_project));
    refresh_context_system_nav(pool, &mut context).await?;
    let resource = project_resources::get_project_resource(pool, project.id, resource_id).await?;
    let verified =
        project_resources::verify_resource_password(pool, resource.id, &form.password).await?;
    let audit_action = if verified {
        "project_resource.unlock.success"
    } else {
        "project_resource.unlock.failed"
    };
    audit::record(
        pool,
        Some(context.user_id),
        audit_action,
        "project_resource",
        &resource.id.to_string(),
        &format!(r#"{{"project":"{}"}}"#, project.project_key),
    )
    .await?;
    let access_token = if verified && resource.is_protected {
        Some(issue_project_resource_access_token(
            &state,
            context.user_id,
            resource.id,
        )?)
    } else {
        None
    };
    let project_accepts_writes = projects::ensure_project_accepts_writes(&project.status).is_ok();
    let can_manage_resources =
        user_can_write_project_content_for_context(pool, &context, project.id).await?
            && project_accepts_writes
            && resource.status != "archived";
    let unlock_error = if verified {
        String::new()
    } else {
        "访问密码不正确，请重新输入。".to_string()
    };

    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(ProjectResourceDetailTemplate {
            active: "projects",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            project: project_detail_from_domain(project),
            resource: project_resource_from_detail(resource, access_token.as_deref()),
            resource_category_options: project_resource_category_options(),
            can_manage_resources,
            is_unlocked: verified,
            unlock_error,
        })?
        .into_response(),
    )
}

pub async fn project_resource_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, resource_id)): Path<(String, i64)>,
    Form(form): Form<ProjectResourceForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "project.view").await?;
        let project = projects::get_project_detail(pool, &project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
        ensure_project_access(pool, &context, project.id).await?;
        ensure_project_content_write_access(pool, &context, project.id).await?;
        projects::ensure_project_accepts_writes(&project.status)?;
        let existing =
            project_resources::get_project_resource(pool, project.id, resource_id).await?;
        let resource = project_resources::update_resource(
            pool,
            context.user_id,
            existing.id,
            project_resources::UpdateProjectResourceInput {
                title: form.title,
                category: form.category,
                body: form.body,
                body_format: form.body_format,
                access_password_action: form.access_password_action,
                access_password: form.access_password,
            },
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "project_resource.update",
            "project_resource",
            &resource.id.to_string(),
            &format!(r#"{{"project":"{}"}}"#, project.project_key),
        )
        .await?;

        return Ok(
            Redirect::to(&project_resource_url(&project.project_key, resource.id)).into_response(),
        );
    }

    Ok(Redirect::to("/web/projects/YCE?tab=library").into_response())
}

pub async fn project_resource_archive(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, resource_id)): Path<(String, i64)>,
    Form(form): Form<AttachmentDeleteForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "project.view").await?;
        let project = projects::get_project_detail(pool, &project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
        ensure_project_access(pool, &context, project.id).await?;
        ensure_project_content_write_access(pool, &context, project.id).await?;
        projects::ensure_project_accepts_writes(&project.status)?;
        let resource =
            project_resources::archive_resource(pool, context.user_id, project.id, resource_id)
                .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "project_resource.archive",
            "project_resource",
            &resource.id.to_string(),
            &format!(r#"{{"project":"{}"}}"#, project.project_key),
        )
        .await?;

        return Ok(Redirect::to(&project_library_url(&project.project_key)).into_response());
    }

    Ok(Redirect::to("/web/projects/YCE?tab=library").into_response())
}

pub async fn project_resource_attachment_download(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, resource_id, attachment_id)): Path<(String, i64, i64)>,
    Query(query): Query<ResourceAccessQuery>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "project.view").await?;
        let project = projects::get_project_detail(pool, &project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
        ensure_project_access(pool, &context, project.id).await?;
        let resource =
            project_resources::get_project_resource(pool, project.id, resource_id).await?;
        if resource.is_protected
            && !verify_project_resource_access_token(
                &state,
                &query.access,
                context.user_id,
                resource.id,
            )?
        {
            return Err(AppError::Forbidden("请先验证资料访问密码".to_string()));
        }
        let attachment =
            files::get_attachment_for_target(pool, attachment_id, "project_resource", resource.id)
                .await?;

        return attachment_download_redirect(
            &state,
            pool,
            context.user_id,
            attachment,
            "project_resource",
            &resource.id.to_string(),
            format!(
                r#"{{"source":"web","project":"{}","attachment_id":{attachment_id}}}"#,
                project.project_key
            ),
        )
        .await;
    }

    Ok(Redirect::to("/web/projects/YCE?tab=library").into_response())
}

pub async fn project_resource_attachment_preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, resource_id, attachment_id)): Path<(String, i64, i64)>,
    Query(query): Query<ResourceAccessQuery>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "project.view").await?;
        let project = projects::get_project_detail(pool, &project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
        ensure_project_access(pool, &context, project.id).await?;
        let resource =
            project_resources::get_project_resource(pool, project.id, resource_id).await?;
        if resource.is_protected
            && !verify_project_resource_access_token(
                &state,
                &query.access,
                context.user_id,
                resource.id,
            )?
        {
            return Err(AppError::Forbidden("请先验证资料访问密码".to_string()));
        }
        let attachment =
            files::get_attachment_for_target(pool, attachment_id, "project_resource", resource.id)
                .await?;
        let mut download_url = format!(
            "/web/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/download"
        );
        if !query.access.trim().is_empty() {
            let access_query = serde_urlencoded::to_string([("access", query.access.as_str())])
                .unwrap_or_else(|_| String::new());
            if !access_query.is_empty() {
                download_url.push('?');
                download_url.push_str(&access_query);
            }
        }
        let access_suffix = if !query.access.trim().is_empty() {
            let encoded = serde_urlencoded::to_string([("access", query.access.as_str())])
                .unwrap_or_else(|_| String::new());
            if encoded.is_empty() {
                String::new()
            } else {
                format!("?{encoded}")
            }
        } else {
            String::new()
        };
        let navigation = document_preview_navigation(
            files::list_attachments(pool, "project_resource", resource.id).await?,
            attachment.id,
            |sibling_id| {
                format!(
                    "/web/projects/{project_key}/resources/{resource_id}/attachments/{sibling_id}/preview{access_suffix}"
                )
            },
        );

        return attachment_document_preview_response(
            &state,
            pool,
            context.user_id,
            attachment,
            format!("/web/projects/{project_key}/resources/{resource_id}{access_suffix}"),
            "返回资料".to_string(),
            navigation,
            &format!(
                "/web/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/preview/content{access_suffix}"
            ),
            "project_resource",
            &resource.id.to_string(),
            format!(
                r#"{{"source":"web","project":"{}","resource_id":{},"attachment_id":{attachment_id}}}"#,
                project_key, resource.id
            ),
            &download_url,
        )
        .await;
    }

    Ok(Redirect::to("/web/projects/YCE?tab=library").into_response())
}

pub async fn project_resource_attachment_preview_content(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, resource_id, attachment_id)): Path<(String, i64, i64)>,
    Query(query): Query<ResourceAccessQuery>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "project.view").await?;
        let project = projects::get_project_detail(pool, &project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
        ensure_project_access(pool, &context, project.id).await?;
        let resource =
            project_resources::get_project_resource(pool, project.id, resource_id).await?;
        if resource.is_protected
            && !verify_project_resource_access_token(
                &state,
                &query.access,
                context.user_id,
                resource.id,
            )?
        {
            return Err(AppError::Forbidden("请先验证资料访问密码".to_string()));
        }
        let attachment =
            files::get_attachment_for_target(pool, attachment_id, "project_resource", resource.id)
                .await?;
        return attachment_document_preview_content_response(&state, pool, attachment).await;
    }

    Ok(Redirect::to("/web/projects/YCE?tab=library").into_response())
}

pub async fn work_items_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(form): Form<CreateWorkItemForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "work_item.view").await?;
        let project = projects::get_project_detail(pool, &form.project_key)
            .await?
            .ok_or_else(|| AppError::BadRequest("项目不存在".to_string()))?;
        ensure_project_access(pool, &context, project.id).await?;
        ensure_project_content_write_access(pool, &context, project.id).await?;
        let item = projects::create_work_item(
            pool,
            context.user_id,
            projects::CreateWorkItemInput {
                project_key: form.project_key,
                item_type: form.item_type,
                title: form.title,
                description: form.description,
                priority: form.priority,
                assignee_username: form.assignee_username,
                due_date: form.due_date,
                parent_item_key: form.parent_item_key,
                actor_display_name_snapshot: String::new(),
            },
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "work_item.create",
            "work_item",
            &item.item_key,
            "{}",
        )
        .await?;

        if form.redirect_to == "project" {
            return Ok(Redirect::to(&project_info_url(&item.project_key)).into_response());
        }

        return Ok(Redirect::to(&format!("/web/work-items/{}", item.item_key)).into_response());
    }

    Ok(Redirect::to("/web/work-items/YCE-TASK-2").into_response())
}

pub async fn requirements_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<WorkItemListQuery>,
) -> AppResult<Response> {
    work_item_list_page(
        state,
        &headers,
        Some("requirement"),
        WorkItemListPageMeta::requirements(),
        query,
    )
    .await
}

pub async fn tasks_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<WorkItemListQuery>,
) -> AppResult<Response> {
    work_item_list_page(
        state,
        &headers,
        Some("task"),
        WorkItemListPageMeta::tasks(),
        query,
    )
    .await
}

pub async fn bugs_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<WorkItemListQuery>,
) -> AppResult<Response> {
    work_item_list_page(
        state,
        &headers,
        Some("bug"),
        WorkItemListPageMeta::bugs(),
        query,
    )
    .await
}

pub async fn work_item_detail_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let Some(pool) = context.pool else {
        return render_sample_work_item_detail_page(&state, context);
    };
    ensure_view_permission(pool, &headers, context.user_id, "work_item.view").await?;
    let Some((item, comments)) = load_work_item_detail_for_user(
        pool,
        &item_key,
        context.user_id,
        context.can_access_all_projects,
    )
    .await?
    else {
        return Ok(StatusCode::NOT_FOUND.into_response());
    };
    ensure_project_key_access(
        pool,
        context.user_id,
        context.can_access_all_projects,
        &item.project_key,
    )
    .await?;
    let assignee_options = load_project_member_options(pool, &item.project_key).await?;
    let parent_options = if item.kind == "任务" {
        projects::list_work_item_summaries_filtered_for_user(
            pool,
            context.user_id,
            context.can_access_all_projects,
            projects::WorkItemListFilter {
                item_type: Some("requirement".to_string()),
                project_key: item.project_key.clone(),
                ..projects::WorkItemListFilter::default()
            },
        )
        .await?
        .into_iter()
        .map(work_item_from_summary)
        .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    let attachments = files::list_attachments(pool, "work_item", item.id)
        .await?
        .into_iter()
        .map(attachment_from_summary)
        .collect::<Vec<_>>();
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    let project_accepts_writes = projects::ensure_project_accepts_writes(&project.status).is_ok();
    let can_manage_work_items =
        user_can_write_project_content_for_context(pool, &context, project.id).await?
            && project_accepts_writes;
    let can_restore_work_items =
        rbac::user_has_permission(pool, context.user_id, "work_item.manage").await?
            && can_manage_work_items;
    let status_options = work_item_status_options(&item.kind, &item.status_code)?;
    let flow_history_pagination = normalize_web_pagination(None, None)?;
    let (flow_history_records, flow_history_pagination, flow_history_pagination_pages) =
        load_work_item_flow_history(pool, &item, flow_history_pagination).await?;
    let discussion_count = discussion_comment_count(&comments);

    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(WorkItemDetailTemplate {
            active: work_item_active_key(&item.kind),
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            discussion_count,
            has_comments: discussion_count > 0,
            item,
            assignee_options,
            parent_options,
            status_options,
            has_attachments: !attachments.is_empty(),
            attachments,
            comments,
            can_manage_work_items,
            can_restore_work_items,
            has_flow_history: !flow_history_records.is_empty(),
            flow_history_records,
            flow_history_pagination,
            flow_history_pagination_pages,
        })?
        .into_response(),
    )
}

pub async fn work_item_flow_history_partial(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
    Query(query): Query<WorkItemFlowHistoryQuery>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let Some(pool) = context.pool else {
        let partial = sample_work_item_detail_partial()?;
        let pagination = normalize_web_pagination(query.page, query.per_page)?;
        let (records, pagination, pagination_pages) =
            sample_work_item_flow_history(&partial.item, pagination);
        return Ok(response::html(WorkItemFlowHistoryPartialTemplate {
            item: partial.item,
            has_flow_history: !records.is_empty(),
            flow_history_records: records,
            flow_history_pagination: pagination,
            flow_history_pagination_pages: pagination_pages,
        })?
        .into_response());
    };

    ensure_view_permission(pool, &headers, context.user_id, "work_item.view").await?;
    let Some(item) = projects::get_work_item_detail(pool, &item_key).await? else {
        return Ok(StatusCode::NOT_FOUND.into_response());
    };
    ensure_project_key_access(
        pool,
        context.user_id,
        context.can_access_all_projects,
        &item.project_key,
    )
    .await?;

    let item = work_item_detail_from_domain(item);
    let requested_pagination = normalize_web_pagination(query.page, query.per_page)?;
    let (records, pagination, pagination_pages) =
        load_work_item_flow_history(pool, &item, requested_pagination).await?;

    Ok(response::html(WorkItemFlowHistoryPartialTemplate {
        has_flow_history: !records.is_empty(),
        item,
        flow_history_records: records,
        flow_history_pagination: pagination,
        flow_history_pagination_pages: pagination_pages,
    })?
    .into_response())
}

pub async fn work_item_status_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
    Form(form): Form<WorkItemStatusForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "work_item.view").await?;
        let Some((item, _comments)) = load_work_item_detail(pool, &item_key).await? else {
            return Ok(StatusCode::NOT_FOUND.into_response());
        };
        ensure_project_key_access(
            pool,
            context.user_id,
            context.is_super_admin,
            &item.project_key,
        )
        .await?;
        let project = projects::get_project_detail(pool, &item.project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
        ensure_project_content_write_access(pool, &context, project.id).await?;
        let updated =
            projects::update_work_item_status(pool, context.user_id, &item_key, &form.status)
                .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "work_item.status.update",
            "work_item",
            &updated.item_key,
            &format!(r#"{{"status":"{}"}}"#, updated.status),
        )
        .await?;

        return Ok(Redirect::to(&work_item_discussion_url(&updated.item_key)).into_response());
    }

    Ok(Redirect::to("/web/work-items/YCE-TASK-2").into_response())
}

pub async fn work_item_handoff(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
    Form(form): Form<WorkItemHandoffForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "work_item.view").await?;
        let Some((item, _comments)) = load_work_item_detail(pool, &item_key).await? else {
            return Ok(StatusCode::NOT_FOUND.into_response());
        };
        ensure_work_item_accepts_writes(&item)?;
        ensure_project_key_access(
            pool,
            context.user_id,
            context.is_super_admin,
            &item.project_key,
        )
        .await?;
        let project = projects::get_project_detail(pool, &item.project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
        ensure_project_content_write_access(pool, &context, project.id).await?;
        let updated = projects::handoff_work_item(
            pool,
            context.user_id,
            &item_key,
            projects::HandoffWorkItemInput {
                status: form.status,
                assignee_username: form.assignee_username,
                body: form.body,
                source_comment_id: None,
                actor_display_name_snapshot: String::new(),
            },
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "work_item.handoff",
            "work_item",
            &updated.item_key,
            &format!(
                r#"{{"status":"{}","assignee_username":"{}"}}"#,
                updated.status, updated.assignee_username
            ),
        )
        .await?;

        return Ok(Redirect::to(&work_item_discussion_url(&updated.item_key)).into_response());
    }

    Ok(Redirect::to("/web/work-items/YCE-TASK-2").into_response())
}

pub async fn work_item_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
    Form(form): Form<WorkItemEditForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "work_item.view").await?;
        let Some((item, _comments)) = load_work_item_detail(pool, &item_key).await? else {
            return Ok(StatusCode::NOT_FOUND.into_response());
        };
        ensure_project_key_access(
            pool,
            context.user_id,
            context.is_super_admin,
            &item.project_key,
        )
        .await?;
        let project = projects::get_project_detail(pool, &item.project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
        ensure_project_content_write_access(pool, &context, project.id).await?;
        let updated = projects::update_work_item(
            pool,
            context.user_id,
            &item_key,
            projects::UpdateWorkItemInput {
                title: form.title,
                description: form.description,
                status: form.status,
                priority: form.priority,
                assignee_username: form.assignee_username,
                due_date: form.due_date,
                parent_item_key: form.parent_item_key,
                actor_display_name_snapshot: String::new(),
            },
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "work_item.update",
            "work_item",
            &updated.item_key,
            "{}",
        )
        .await?;

        return Ok(Redirect::to(&format!("/web/work-items/{}", updated.item_key)).into_response());
    }

    Ok(Redirect::to("/web/work-items/YCE-TASK-2").into_response())
}

pub async fn work_item_restore(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
    Form(form): Form<WorkItemRestoreForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_manage_permission(pool, &headers, context.user_id, "work_item.manage").await?;
        let Some((item, _comments)) = load_work_item_detail(pool, &item_key).await? else {
            return Ok(StatusCode::NOT_FOUND.into_response());
        };
        ensure_project_key_access(
            pool,
            context.user_id,
            context.is_super_admin,
            &item.project_key,
        )
        .await?;
        let project = projects::get_project_detail(pool, &item.project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
        ensure_project_content_write_access(pool, &context, project.id).await?;
        let restored = projects::restore_work_item(pool, context.user_id, &item_key).await?;
        audit::record(
            pool,
            Some(context.user_id),
            "work_item.restore",
            "work_item",
            &restored.item_key,
            "{}",
        )
        .await?;

        return Ok(Redirect::to(&format!("/web/work-items/{}", restored.item_key)).into_response());
    }

    Ok(Redirect::to("/web/work-items/YCE-TASK-2").into_response())
}

pub async fn work_item_comment_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
    Form(form): Form<WorkItemCommentForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "work_item.view").await?;
        let Some((item, _comments)) = load_work_item_detail(pool, &item_key).await? else {
            return Ok(StatusCode::NOT_FOUND.into_response());
        };
        ensure_work_item_accepts_writes(&item)?;
        ensure_project_key_access(
            pool,
            context.user_id,
            context.is_super_admin,
            &item.project_key,
        )
        .await?;
        let project = projects::get_project_detail(pool, &item.project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
        ensure_project_content_write_access(pool, &context, project.id).await?;
        let comment = projects::add_work_item_comment_reply_with_format(
            pool,
            context.user_id,
            &item_key,
            &form.body,
            &form.body_format,
            form.parent_comment_id,
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "work_item.comment.create",
            "work_item",
            &item_key,
            "{}",
        )
        .await?;

        return Ok(Redirect::to(&work_item_comment_url(&item_key, comment.id)).into_response());
    }

    Ok(Redirect::to("/web/work-items/YCE-TASK-2").into_response())
}

pub async fn work_item_comment_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, comment_id)): Path<(String, i64)>,
    Form(form): Form<WorkItemCommentForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "work_item.view").await?;
        let Some((item, _comments)) = load_work_item_detail(pool, &item_key).await? else {
            return Ok(StatusCode::NOT_FOUND.into_response());
        };
        ensure_work_item_accepts_writes(&item)?;
        ensure_project_key_access(
            pool,
            context.user_id,
            context.is_super_admin,
            &item.project_key,
        )
        .await?;
        let project = projects::get_project_detail(pool, &item.project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
        ensure_project_content_write_access(pool, &context, project.id).await?;
        let comment = projects::update_work_item_comment_with_format(
            pool,
            context.user_id,
            context.is_super_admin,
            &item_key,
            comment_id,
            &form.body,
            &form.body_format,
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "work_item.comment.update",
            "comment",
            &comment_id.to_string(),
            &format!(r#"{{"work_item":"{item_key}"}}"#),
        )
        .await?;

        return Ok(Redirect::to(&work_item_comment_url(&item_key, comment.id)).into_response());
    }

    Ok(Redirect::to("/web/work-items/YCE-TASK-2").into_response())
}

pub async fn work_item_attachment_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
    Form(form): Form<AttachmentForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "work_item.view").await?;
        let Some((item, _comments)) = load_work_item_detail(pool, &item_key).await? else {
            return Ok(StatusCode::NOT_FOUND.into_response());
        };
        ensure_work_item_accepts_writes(&item)?;
        ensure_project_key_access(
            pool,
            context.user_id,
            context.is_super_admin,
            &item.project_key,
        )
        .await?;
        let project = projects::get_project_detail(pool, &item.project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
        ensure_project_content_write_access(pool, &context, project.id).await?;
        projects::ensure_project_accepts_writes(&project.status)?;
        let config = storage::active_config(pool)
            .await?
            .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
        let original_filename = form.original_filename;
        let activity_summary = format!("登记工作项附件 {original_filename}");
        let attachment = files::create_attachment(
            pool,
            &config,
            files::CreateAttachmentInput {
                target_type: "work_item".to_string(),
                target_id: item.id,
                project_id: Some(project.id),
                folder_id: None,
                original_filename,
                content_type: form.content_type,
                byte_size: form.byte_size,
                created_by_user_id: context.user_id,
                activity_summary: Some(activity_summary),
            },
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "file.attach.work_item",
            "work_item",
            &item_key,
            &format!(r#"{{"file_object_id":{}}}"#, attachment.file_object_id),
        )
        .await?;

        return Ok(Redirect::to(&work_item_attachments_url(&item_key)).into_response());
    }

    Ok(Redirect::to("/web/work-items/YCE-TASK-2").into_response())
}

pub async fn work_item_attachment_download(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, attachment_id)): Path<(String, i64)>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "work_item.view").await?;
        let Some((item, _comments)) = load_work_item_detail(pool, &item_key).await? else {
            return Ok(StatusCode::NOT_FOUND.into_response());
        };
        ensure_project_key_access(
            pool,
            context.user_id,
            context.is_super_admin,
            &item.project_key,
        )
        .await?;
        let attachment =
            files::get_attachment_for_target(pool, attachment_id, "work_item", item.id).await?;

        return attachment_download_redirect(
            &state,
            pool,
            context.user_id,
            attachment,
            "work_item",
            &item_key,
            format!(r#"{{"source":"web","attachment_id":{attachment_id}}}"#),
        )
        .await;
    }

    Ok(Redirect::to("/web/work-items/YCE-TASK-2").into_response())
}

pub async fn work_item_attachment_preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, attachment_id)): Path<(String, i64)>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "work_item.view").await?;
        let Some((item, _comments)) = load_work_item_detail(pool, &item_key).await? else {
            return Ok(StatusCode::NOT_FOUND.into_response());
        };
        ensure_project_key_access(
            pool,
            context.user_id,
            context.is_super_admin,
            &item.project_key,
        )
        .await?;
        let attachment =
            files::get_attachment_for_target(pool, attachment_id, "work_item", item.id).await?;
        let download_url =
            format!("/web/work-items/{item_key}/attachments/{attachment_id}/download");
        let navigation = document_preview_navigation(
            files::list_attachments(pool, "work_item", item.id).await?,
            attachment.id,
            |sibling_id| format!("/web/work-items/{item_key}/attachments/{sibling_id}/preview"),
        );

        return attachment_document_preview_response(
            &state,
            pool,
            context.user_id,
            attachment,
            format!("/web/work-items/{item_key}"),
            "返回工作项".to_string(),
            navigation,
            &format!("/web/work-items/{item_key}/attachments/{attachment_id}/preview/content"),
            "work_item",
            &item_key,
            format!(
                r#"{{"source":"web","work_item":"{}","attachment_id":{attachment_id}}}"#,
                item_key
            ),
            &download_url,
        )
        .await;
    }

    Ok(Redirect::to("/web/work-items/YCE-TASK-2").into_response())
}

pub async fn work_item_attachment_preview_content(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, attachment_id)): Path<(String, i64)>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "work_item.view").await?;
        let Some((item, _comments)) = load_work_item_detail(pool, &item_key).await? else {
            return Ok(StatusCode::NOT_FOUND.into_response());
        };
        ensure_project_key_access(
            pool,
            context.user_id,
            context.is_super_admin,
            &item.project_key,
        )
        .await?;
        let attachment =
            files::get_attachment_for_target(pool, attachment_id, "work_item", item.id).await?;
        return attachment_document_preview_content_response(&state, pool, attachment).await;
    }

    Ok(Redirect::to("/web/work-items/YCE-TASK-2").into_response())
}

pub async fn work_item_comment_attachment_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, comment_id)): Path<(String, i64)>,
    Form(form): Form<AttachmentForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "work_item.view").await?;
        let (item, project, comment) =
            load_comment_attachment_context(pool, &item_key, comment_id).await?;
        ensure_comment_accepts_attachments(&comment)?;
        ensure_work_item_accepts_writes(&item)?;
        ensure_project_key_access(
            pool,
            context.user_id,
            context.is_super_admin,
            &item.project_key,
        )
        .await?;
        ensure_project_content_write_access(pool, &context, project.id).await?;
        projects::ensure_project_accepts_writes(&project.status)?;
        let config = storage::active_config(pool)
            .await?
            .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
        let original_filename = form.original_filename;
        let activity_summary = format!("登记评论附件 {original_filename}");
        let attachment = files::create_attachment(
            pool,
            &config,
            files::CreateAttachmentInput {
                target_type: "comment".to_string(),
                target_id: comment.id,
                project_id: Some(project.id),
                folder_id: None,
                original_filename,
                content_type: form.content_type,
                byte_size: form.byte_size,
                created_by_user_id: context.user_id,
                activity_summary: Some(activity_summary),
            },
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "file.attach.comment",
            "comment",
            &comment_id.to_string(),
            &format!(
                r#"{{"work_item":"{}","file_object_id":{}}}"#,
                item.key, attachment.file_object_id
            ),
        )
        .await?;

        return Ok(Redirect::to(&work_item_comment_url(&item_key, comment.id)).into_response());
    }

    Ok(Redirect::to("/web/work-items/YCE-TASK-2").into_response())
}

pub async fn work_item_comment_attachment_download(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, comment_id, attachment_id)): Path<(String, i64, i64)>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "work_item.view").await?;
        let (item, _project, comment) =
            load_comment_attachment_context(pool, &item_key, comment_id).await?;
        ensure_project_key_access(
            pool,
            context.user_id,
            context.is_super_admin,
            &item.project_key,
        )
        .await?;
        let attachment =
            files::get_attachment_for_target(pool, attachment_id, "comment", comment.id).await?;

        return attachment_download_redirect(
            &state,
            pool,
            context.user_id,
            attachment,
            "comment",
            &comment_id.to_string(),
            format!(
                r#"{{"source":"web","work_item":"{}","attachment_id":{attachment_id}}}"#,
                item.key
            ),
        )
        .await;
    }

    Ok(Redirect::to("/web/work-items/YCE-TASK-2").into_response())
}

pub async fn work_item_comment_attachment_preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, comment_id, attachment_id)): Path<(String, i64, i64)>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "work_item.view").await?;
        let (item, _project, comment) =
            load_comment_attachment_context(pool, &item_key, comment_id).await?;
        ensure_project_key_access(
            pool,
            context.user_id,
            context.is_super_admin,
            &item.project_key,
        )
        .await?;
        let attachment =
            files::get_attachment_for_target(pool, attachment_id, "comment", comment.id).await?;
        let download_url = format!(
            "/web/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/download"
        );
        let navigation = document_preview_navigation(
            files::list_attachments(pool, "comment", comment.id).await?,
            attachment.id,
            |sibling_id| {
                format!(
                    "/web/work-items/{item_key}/comments/{comment_id}/attachments/{sibling_id}/preview"
                )
            },
        );

        return attachment_document_preview_response(
            &state,
            pool,
            context.user_id,
            attachment,
            format!("/web/work-items/{item_key}#comment-{comment_id}"),
            "返回评论".to_string(),
            navigation,
            &format!(
                "/web/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/preview/content"
            ),
            "comment",
            &comment_id.to_string(),
            format!(
                r#"{{"source":"web","work_item":"{}","comment_id":{},"attachment_id":{attachment_id}}}"#,
                item.key, comment.id
            ),
            &download_url,
        )
        .await;
    }

    Ok(Redirect::to("/web/work-items/YCE-TASK-2").into_response())
}

pub async fn work_item_comment_attachment_preview_content(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, comment_id, attachment_id)): Path<(String, i64, i64)>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "work_item.view").await?;
        let (item, _project, comment) =
            load_comment_attachment_context(pool, &item_key, comment_id).await?;
        ensure_project_key_access(
            pool,
            context.user_id,
            context.is_super_admin,
            &item.project_key,
        )
        .await?;
        let attachment =
            files::get_attachment_for_target(pool, attachment_id, "comment", comment.id).await?;
        return attachment_document_preview_content_response(&state, pool, attachment).await;
    }

    Ok(Redirect::to("/web/work-items/YCE-TASK-2").into_response())
}

pub async fn login(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Response> {
    if let Some(pool) = state.pool.as_ref()
        && bootstrap::bootstrap_required(pool).await?
    {
        let csrf_token = csrf::ensure_token(&headers);
        return with_csrf_cookie(
            &state,
            &csrf_token,
            response::html(BootstrapTemplate {
                environment: state.settings.env.clone(),
                csrf_token: csrf_token.clone(),
            })?
            .into_response(),
        );
    }

    let csrf_token = csrf::ensure_token(&headers);
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(LoginTemplate {
            environment: state.settings.env.clone(),
            csrf_token: csrf_token.clone(),
            error_message: String::new(),
        })?
        .into_response(),
    )
}

pub async fn login_submit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(form): Form<LoginForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let pool = state.pool()?;
    let session = match auth::login_with_ttls(
        pool,
        &form.username,
        &form.password,
        state.settings.session_ttl_seconds()?,
        state.settings.refresh_session_ttl_seconds()?,
    )
    .await
    {
        Ok(session) => session,
        Err(error) => {
            let request_context = audit_context::from_headers(&headers);
            if let Err(audit_error) = audit::record_with_context(
                pool,
                None,
                "auth.login.failed",
                "user",
                &form.username,
                "{}",
                &request_context,
            )
            .await
            {
                tracing::warn!(%audit_error, "failed to record web login failure audit");
            }
            let csrf_token = csrf::ensure_token(&headers);
            let message = match error {
                AppError::Unauthorized => "用户名或密码错误，请重新输入。".to_string(),
                _ => error.to_string(),
            };
            return with_csrf_cookie(
                &state,
                &csrf_token,
                response::html(LoginTemplate {
                    environment: state.settings.env.clone(),
                    csrf_token: csrf_token.clone(),
                    error_message: message,
                })?
                .into_response(),
            );
        }
    };
    let actor_user_id = auth::user_from_raw_session(pool, &session.raw_token)
        .await?
        .map(|user| user.id);
    let request_context = audit_context::from_headers(&headers);
    audit::record_with_context(
        pool,
        actor_user_id,
        "auth.login",
        "user",
        &form.username,
        "{}",
        &request_context,
    )
    .await?;
    redirect_with_session(&state, session, is_htmx(&headers))
}

pub async fn bootstrap(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Response> {
    if let Some(pool) = state.pool.as_ref()
        && !bootstrap::bootstrap_required(pool).await?
    {
        return login_redirect(&headers);
    }

    let csrf_token = csrf::ensure_token(&headers);
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(BootstrapTemplate {
            environment: state.settings.env.clone(),
            csrf_token: csrf_token.clone(),
        })?
        .into_response(),
    )
}

pub async fn bootstrap_init(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(form): Form<BootstrapForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let pool = state.pool()?;
    let result = bootstrap::bootstrap_init(
        pool,
        BootstrapInitInput {
            username: form.username,
            display_name: form.display_name,
            password: form.password,
            password_confirm: form.password_confirm,
        },
    )
    .await?;

    let request_context = audit_context::from_headers(&headers);
    audit::record_with_context(
        pool,
        Some(result.user_id),
        "bootstrap.init",
        "user",
        &result.user_id.to_string(),
        "{}",
        &request_context,
    )
    .await?;
    tracing::info!(user_id = result.user_id, "bootstrap initialized");
    let _ = auth::revoke_session(pool, &result.session.raw_token, "session_ttl_reissue").await;
    let _ =
        auth::revoke_refresh_session(pool, &result.session.refresh_token, "session_ttl_reissue")
            .await;
    let session = auth::issue_session_with_ttls(
        pool,
        result.user_id,
        state.settings.session_ttl_seconds()?,
        state.settings.refresh_session_ttl_seconds()?,
    )
    .await?;
    redirect_with_session(&state, session, is_htmx(&headers))
}

pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(form): Form<LogoutForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    if let Some(pool) = state.pool.as_ref()
        && let Some(raw_token) = auth::session_cookie(&headers)
    {
        let actor_user_id = auth::user_from_raw_session(pool, &raw_token)
            .await?
            .map(|user| user.id);
        auth::revoke_session(pool, &raw_token, "logout").await?;
        if let Some(raw_refresh) = auth::refresh_cookie(&headers) {
            auth::revoke_refresh_session(pool, &raw_refresh, "logout").await?;
        }
        let request_context = audit_context::from_headers(&headers);
        audit::record_with_context(
            pool,
            actor_user_id,
            "auth.logout",
            "session",
            "",
            "{}",
            &request_context,
        )
        .await?;
    }

    let mut response = Redirect::to("/web/login").into_response();
    let secure = state.settings.env == "production";
    response.headers_mut().insert(
        header::SET_COOKIE,
        auth::clear_session_cookie_header(secure).parse()?,
    );
    response.headers_mut().append(
        header::SET_COOKIE,
        auth::clear_refresh_cookie_header(secure).parse()?,
    );
    response.headers_mut().append(
        header::SET_COOKIE,
        csrf::expired_cookie_header(secure).parse()?,
    );
    Ok(response)
}

pub async fn system_dashboard(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Response> {
    let context =
        match system_context_or_redirect(&state, &headers, "system.dashboard.view").await? {
            Ok(context) => context,
            Err(response) => return Ok(response),
        };
    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(SystemDashboardTemplate {
            active: "system",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
        })?
        .into_response(),
    )
}

pub async fn system_users_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<SystemUsersQuery>,
) -> AppResult<Response> {
    let context = match system_context_or_redirect(&state, &headers, "system.users.view").await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let pool = state.pool()?;
    let requested_pagination = normalize_web_pagination(query.page, query.per_page)?;
    let total_items = users::count_users(pool).await?;
    let total_pages = total_pages(total_items, requested_pagination.per_page);
    let page_number = requested_pagination.page.min(total_pages);
    let users = users::list_users_page(pool, page_number, requested_pagination.per_page)
        .await?
        .into_iter()
        .map(user_row_from_summary)
        .collect::<Vec<_>>();
    let pagination = system_users_pagination_view(
        page_number,
        requested_pagination.per_page,
        total_items,
        total_pages,
    );
    let pagination_pages =
        system_users_pagination_pages(pagination.page, pagination.per_page, pagination.total_pages);
    let roles = rbac::list_roles(pool)
        .await?
        .into_iter()
        .map(role_row_from_summary)
        .collect::<Vec<_>>();
    let can_manage_users =
        rbac::user_has_permission(pool, context.user_id, "system.users.manage").await?;

    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(SystemUsersTemplate {
            active: "system-users",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            has_users: !users.is_empty(),
            users,
            roles,
            pagination,
            pagination_pages,
            can_manage_users,
        })?
        .into_response(),
    )
}

pub async fn system_database_stats_page(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Response> {
    let context =
        match system_context_or_redirect(&state, &headers, "system.database_stats.view").await? {
            Ok(context) => context,
            Err(response) => return Ok(response),
        };
    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(SystemDatabaseStatsTemplate {
            active: "system-database-stats",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            cache_key: context.user_id.to_string(),
        })?
        .into_response(),
    )
}

pub async fn system_users_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(form): Form<CreateUserForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let _context = match system_context_or_redirect(&state, &headers, "system.users.manage").await?
    {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let pool = state.pool()?;
    let requested_pagination = normalize_web_pagination(form.page, form.per_page)?;
    let redirect_url = system_users_page_url(1, requested_pagination.per_page);
    let audit_username = form.username.clone();
    users::create_user(
        pool,
        users::CreateUserInput {
            username: form.username,
            display_name: form.display_name,
            email: form.email,
            mobile: form.mobile,
            password: form.password,
            role_code: form.role_code,
        },
    )
    .await?;
    audit::record(
        pool,
        Some(_context.user_id),
        "user.create",
        "user",
        &audit_username,
        "{}",
    )
    .await?;

    Ok(Redirect::to(&redirect_url).into_response())
}

pub async fn system_user_status_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(username): Path<String>,
    Form(form): Form<UserStatusForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let _context = match system_context_or_redirect(&state, &headers, "system.users.manage").await?
    {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let redirect_url = system_users_redirect_url(form.page, form.per_page)?;
    users::set_user_status(state.pool()?, &username, &form.status).await?;
    audit::record(
        state.pool()?,
        Some(_context.user_id),
        "user.status.update",
        "user",
        &username,
        &format!(r#"{{"status":"{}"}}"#, form.status),
    )
    .await?;

    Ok(Redirect::to(&redirect_url).into_response())
}

pub async fn system_user_role_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(username): Path<String>,
    Form(form): Form<UserRoleForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let _context = match system_context_or_redirect(&state, &headers, "system.users.manage").await?
    {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let redirect_url = system_users_redirect_url(form.page, form.per_page)?;
    users::replace_user_role(state.pool()?, &username, &form.role_code).await?;
    audit::record(
        state.pool()?,
        Some(_context.user_id),
        "user.role.update",
        "user",
        &username,
        &format!(r#"{{"role_code":"{}"}}"#, form.role_code),
    )
    .await?;

    Ok(Redirect::to(&redirect_url).into_response())
}

pub async fn system_user_password_reset(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(username): Path<String>,
    Form(form): Form<ResetPasswordForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let _context = match system_context_or_redirect(&state, &headers, "system.users.manage").await?
    {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let redirect_url = system_users_redirect_url(form.page, form.per_page)?;
    users::reset_user_password(state.pool()?, &username, &form.password).await?;
    audit::record(
        state.pool()?,
        Some(_context.user_id),
        "user.password.reset",
        "user",
        &username,
        "{}",
    )
    .await?;

    Ok(Redirect::to(&redirect_url).into_response())
}

pub async fn system_roles_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<RoleWorkbenchQuery>,
) -> AppResult<Response> {
    let context = match system_context_or_redirect(&state, &headers, "system.roles.view").await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let pool = state.pool()?;
    let requested_pagination = normalize_web_pagination(query.page, query.per_page)?;
    let total_items = rbac::count_roles(pool).await?;
    let total_pages = total_pages(total_items, requested_pagination.per_page);
    let page_number = requested_pagination.page.min(total_pages);
    let role_summaries =
        rbac::list_roles_page(pool, page_number, requested_pagination.per_page).await?;
    let selected_role = selected_role_summary(pool, &role_summaries, &query.role).await?;
    let selected_role_code = selected_role
        .as_ref()
        .map(|role| role.role_code.clone())
        .unwrap_or_default();
    let permissions = if selected_role_code.is_empty() {
        Vec::new()
    } else {
        rbac::list_permissions_for_role(state.pool()?, Some(&selected_role_code)).await?
    };
    let permission_groups = permission_tree_from_summaries(permissions);
    let (permission_total_count, permission_granted_count) =
        permission_tree_counts(&permission_groups);
    let pagination = role_workbench_pagination_view(
        &selected_role_code,
        page_number,
        requested_pagination.per_page,
        total_items,
        total_pages,
    );
    let pagination_pages = role_workbench_pagination_pages(
        &selected_role_code,
        pagination.page,
        pagination.per_page,
        pagination.total_pages,
    );
    let roles = role_summaries
        .into_iter()
        .map(role_row_from_summary)
        .collect::<Vec<_>>();
    let can_manage_roles =
        rbac::user_has_permission(state.pool()?, context.user_id, "system.roles.manage").await?;
    let selected_role_row = selected_role.clone().map(role_row_from_summary);
    let selected_role_is_system = selected_role
        .as_ref()
        .map(|role| role.is_system)
        .unwrap_or(false);

    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(SystemRolesTemplate {
            active: "system-roles",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            has_roles: !roles.is_empty(),
            roles,
            pagination,
            pagination_pages,
            selected_role_code,
            selected_role_name: selected_role
                .as_ref()
                .map(|role| role.role_name.clone())
                .unwrap_or_else(|| "请选择角色".to_string()),
            selected_role_status: selected_role_row
                .as_ref()
                .map(|role| role.status.clone())
                .unwrap_or_default(),
            selected_role_status_tone: selected_role_row
                .as_ref()
                .map(|role| role.status_tone)
                .unwrap_or("info"),
            selected_role_is_system,
            selected_role_data_scope: selected_role_row
                .as_ref()
                .map(|role| role.data_scope.clone())
                .unwrap_or_default(),
            selected_role_permission_count: selected_role
                .as_ref()
                .map(|role| role.permission_count)
                .unwrap_or(0),
            has_selected_role: selected_role.is_some(),
            can_manage_roles,
            can_edit_selected_permissions: can_manage_roles && !selected_role_is_system,
            has_permission_groups: !permission_groups.is_empty(),
            permission_groups,
            permission_total_count,
            permission_granted_count,
        })?
        .into_response(),
    )
}

pub async fn system_roles_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(form): Form<CreateRoleForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let _context = match system_context_or_redirect(&state, &headers, "system.roles.manage").await?
    {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let requested_pagination = normalize_web_pagination(form.page, form.per_page)?;
    rbac::create_role(
        state.pool()?,
        &form.role_code,
        &form.role_name,
        &form.data_scope_type,
    )
    .await?;
    let total_items = rbac::count_roles(state.pool()?).await?;
    let total_pages = total_pages(total_items, requested_pagination.per_page);
    let redirect_url = role_workbench_page_url(
        form.role_code.trim(),
        total_pages,
        requested_pagination.per_page,
    );
    audit::record(
        state.pool()?,
        Some(_context.user_id),
        "role.create",
        "role",
        &form.role_code,
        "{}",
    )
    .await?;

    Ok(Redirect::to(&redirect_url).into_response())
}

pub async fn system_role_status_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(role_code): Path<String>,
    Form(form): Form<RoleStatusForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let _context = match system_context_or_redirect(&state, &headers, "system.roles.manage").await?
    {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let redirect_url = role_workbench_redirect_url(&role_code, form.page, form.per_page)?;
    rbac::set_role_status(state.pool()?, &role_code, &form.status).await?;
    audit::record(
        state.pool()?,
        Some(_context.user_id),
        "role.status.update",
        "role",
        &role_code,
        &format!(r#"{{"status":"{}"}}"#, form.status),
    )
    .await?;

    Ok(Redirect::to(&redirect_url).into_response())
}

pub async fn system_role_permissions_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(role_code): Path<String>,
) -> AppResult<Response> {
    let context = match system_context_or_redirect(&state, &headers, "system.roles.view").await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let roles = rbac::list_roles(state.pool()?).await?;
    let Some(role) = roles.iter().find(|role| role.role_code == role_code) else {
        return Ok(StatusCode::NOT_FOUND.into_response());
    };
    let permission_groups = permission_tree_from_summaries(
        rbac::list_permissions_for_role(state.pool()?, Some(&role_code)).await?,
    );
    let (permission_total_count, permission_granted_count) =
        permission_tree_counts(&permission_groups);
    let can_edit_permissions = !role.is_system
        && rbac::user_has_permission(state.pool()?, context.user_id, "system.roles.manage").await?;

    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(SystemPermissionsTemplate {
            active: "system-roles",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            role_code,
            role_name: role.role_name.clone(),
            can_edit_permissions,
            has_permission_groups: !permission_groups.is_empty(),
            permission_groups,
            permission_total_count,
            permission_granted_count,
        })?
        .into_response(),
    )
}

pub async fn system_role_permissions_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(role_code): Path<String>,
    RawForm(form): RawForm,
) -> AppResult<Response> {
    let permission_keys = parse_permission_keys_form(&form)?;
    let submitted_csrf = parse_csrf_token_form(&form)?;
    let page = parse_i64_form_value(&form, "page")?;
    let per_page = parse_i64_form_value(&form, "per_page")?;
    csrf::verify(&headers, &submitted_csrf)?;
    let _context = match system_context_or_redirect(&state, &headers, "system.roles.manage").await?
    {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let redirect_url = role_workbench_redirect_url(&role_code, page, per_page)?;
    rbac::replace_role_permissions(state.pool()?, &role_code, &permission_keys).await?;
    audit::record(
        state.pool()?,
        Some(_context.user_id),
        "role.permissions.update",
        "role",
        &role_code,
        &format!(r#"{{"permission_count":{}}}"#, permission_keys.len()),
    )
    .await?;

    Ok(Redirect::to(&redirect_url).into_response())
}

pub async fn system_permissions_page(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Response> {
    let context = match system_context_or_redirect(&state, &headers, "system.roles.view").await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let permission_groups =
        permission_tree_from_summaries(rbac::list_permissions_for_role(state.pool()?, None).await?);
    let (permission_total_count, permission_granted_count) =
        permission_tree_counts(&permission_groups);

    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(SystemPermissionsTemplate {
            active: "system-roles",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            role_code: "all".to_string(),
            role_name: "全部权限点".to_string(),
            can_edit_permissions: false,
            has_permission_groups: !permission_groups.is_empty(),
            permission_groups,
            permission_total_count,
            permission_granted_count,
        })?
        .into_response(),
    )
}

pub async fn storage_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<StorageSettingsQuery>,
) -> AppResult<Response> {
    let context = match system_context_or_redirect(&state, &headers, "system.storage.view").await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let config = storage::latest_config(state.pool()?)
        .await?
        .map(storage_config_view_from_domain)
        .unwrap_or_else(empty_storage_config_view);
    let requested_pagination = normalize_web_pagination(query.page, query.per_page)?;
    let versions_page = storage_versions_page_for_view(state.pool()?, requested_pagination).await?;
    let bucket_inspection = storage_bucket_inspection_for_page(state.pool()?, &state).await;
    let can_manage_storage =
        rbac::user_has_permission(state.pool()?, context.user_id, "system.storage.manage").await?;
    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(StorageSettingsTemplate {
            active: "system-storage",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            config,
            versions: versions_page.versions,
            has_versions: versions_page.has_versions,
            pagination: versions_page.pagination,
            pagination_pages: versions_page.pagination_pages,
            bucket_inspection,
            message: String::new(),
            message_tone: "info",
            can_manage_storage,
        })?
        .into_response(),
    )
}

pub async fn storage_settings_save(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(form): Form<StorageConfigForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context =
        match system_context_or_redirect(&state, &headers, "system.storage.manage").await? {
            Ok(context) => context,
            Err(response) => return Ok(response),
        };
    let requested_pagination = normalize_web_pagination(form.page, form.per_page)?;
    let saved = storage::save_config(
        state.pool()?,
        &state.settings,
        context.user_id,
        storage::SaveStorageConfigInput {
            endpoint: form.endpoint,
            region: form.region,
            bucket: form.bucket,
            access_key_id: form.access_key_id,
            access_key_secret: form.access_key_secret,
            activate: form.activate == "on",
        },
    )
    .await?;
    let request_context = audit_context::from_headers(&headers);
    audit::record_with_context(
        state.pool()?,
        Some(context.user_id),
        "storage.config.save",
        "storage_config",
        &saved.id.to_string(),
        &format!(
            r#"{{"provider":"{}","bucket":"{}","status":"{}"}}"#,
            saved.provider, saved.bucket, saved.status
        ),
        &request_context,
    )
    .await?;

    let csrf_token = context.csrf_token.clone();
    let versions_page = storage_versions_page_for_view(state.pool()?, requested_pagination).await?;
    let bucket_inspection = storage_bucket_inspection_for_page(state.pool()?, &state).await;
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(StorageSettingsTemplate {
            active: "system-storage",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            config: storage_config_view_from_domain(saved),
            versions: versions_page.versions,
            has_versions: versions_page.has_versions,
            pagination: versions_page.pagination,
            pagination_pages: versions_page.pagination_pages,
            bucket_inspection,
            message: "对象存储配置已保存，密钥已加密入库。".to_string(),
            message_tone: "success",
            can_manage_storage: true,
        })?
        .into_response(),
    )
}

pub async fn storage_settings_probe(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(form): Form<StorageProbeForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context =
        match system_context_or_redirect(&state, &headers, "system.storage.manage").await? {
            Ok(context) => context,
            Err(response) => return Ok(response),
        };
    let requested_pagination = normalize_web_pagination(form.page, form.per_page)?;
    let pool = state.pool()?;
    let (message, probe_ok, message_tone, bucket_inspection) =
        match storage::inspect_active_config(pool, &state.settings).await {
            Ok(result) => {
                let probe_ok = result.can_write && result.can_read && result.can_delete;
                let message_tone = if result.ok {
                    "success"
                } else if result.needs_initialization {
                    "warning"
                } else {
                    "error"
                };
                (
                    result.message.clone(),
                    probe_ok,
                    message_tone,
                    storage_bucket_inspection_view_from_domain(result),
                )
            }
            Err(error) => {
                let message = storage_probe_error_message(&error);
                (
                    message.clone(),
                    false,
                    "error",
                    storage_bucket_inspection_error_view(message),
                )
            }
        };
    let target_id = storage::active_config(pool)
        .await?
        .map(|config| config.bucket)
        .unwrap_or_default();
    let request_context = audit_context::from_headers(&headers);
    audit::record_with_context(
        pool,
        Some(context.user_id),
        "storage.config.probe",
        "storage_config",
        &target_id,
        &format!(r#"{{"source":"web","ok":{probe_ok}}}"#),
        &request_context,
    )
    .await?;
    let config = storage::latest_config(pool)
        .await?
        .map(storage_config_view_from_domain)
        .unwrap_or_else(empty_storage_config_view);
    let versions_page = storage_versions_page_for_view(pool, requested_pagination).await?;

    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(StorageSettingsTemplate {
            active: "system-storage",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            config,
            versions: versions_page.versions,
            has_versions: versions_page.has_versions,
            pagination: versions_page.pagination,
            pagination_pages: versions_page.pagination_pages,
            bucket_inspection,
            message,
            message_tone,
            can_manage_storage: true,
        })?
        .into_response(),
    )
}

pub async fn storage_settings_initialize(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(form): Form<StorageInitializeForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context =
        match system_context_or_redirect(&state, &headers, "system.storage.manage").await? {
            Ok(context) => context,
            Err(response) => return Ok(response),
        };
    let requested_pagination = normalize_web_pagination(form.page, form.per_page)?;
    let pool = state.pool()?;
    let (message, init_ok, bucket_inspection) =
        match storage::initialize_active_config(pool, &state.settings).await {
            Ok(result) => {
                let inspection = storage::inspect_active_initialization(pool, &state.settings)
                    .await
                    .map(storage_bucket_inspection_view_from_domain)
                    .unwrap_or_else(|error| {
                        storage_bucket_inspection_error_view(storage_probe_error_message(&error))
                    });
                (result.message, result.ok, inspection)
            }
            Err(error) => {
                let message = storage_initialize_error_message(&error);
                (
                    message.clone(),
                    false,
                    storage_bucket_inspection_error_view(message),
                )
            }
        };
    let target_id = storage::active_config(pool)
        .await?
        .map(|config| config.bucket)
        .unwrap_or_default();
    let request_context = audit_context::from_headers(&headers);
    audit::record_with_context(
        pool,
        Some(context.user_id),
        "storage.bucket.initialize",
        "storage_config",
        &target_id,
        &format!(r#"{{"source":"web","ok":{init_ok}}}"#),
        &request_context,
    )
    .await?;

    let config = storage::latest_config(pool)
        .await?
        .map(storage_config_view_from_domain)
        .unwrap_or_else(empty_storage_config_view);
    let versions_page = storage_versions_page_for_view(pool, requested_pagination).await?;
    let csrf_token = context.csrf_token.clone();

    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(StorageSettingsTemplate {
            active: "system-storage",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            config,
            versions: versions_page.versions,
            has_versions: versions_page.has_versions,
            pagination: versions_page.pagination,
            pagination_pages: versions_page.pagination_pages,
            bucket_inspection,
            message,
            message_tone: if init_ok { "success" } else { "error" },
            can_manage_storage: true,
        })?
        .into_response(),
    )
}

pub async fn storage_settings_rollback(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(version): Path<i64>,
    Form(form): Form<StorageRollbackForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context =
        match system_context_or_redirect(&state, &headers, "system.storage.manage").await? {
            Ok(context) => context,
            Err(response) => return Ok(response),
        };
    let requested_pagination = normalize_web_pagination(form.page, form.per_page)?;
    let pool = state.pool()?;
    let restored =
        storage::rollback_config(pool, &state.settings, context.user_id, version).await?;
    let request_context = audit_context::from_headers(&headers);
    audit::record_with_context(
        pool,
        Some(context.user_id),
        "storage.config.rollback",
        "storage_config",
        &restored.id.to_string(),
        &format!(
            r#"{{"source":"web","from_version":{},"new_version":{},"provider":"{}","bucket":"{}"}}"#,
            version, restored.version, restored.provider, restored.bucket
        ),
        &request_context,
    )
    .await?;
    let versions_page = storage_versions_page_for_view(pool, requested_pagination).await?;
    let bucket_inspection = storage_bucket_inspection_for_page(pool, &state).await;

    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(StorageSettingsTemplate {
            active: "system-storage",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            config: storage_config_view_from_domain(restored),
            versions: versions_page.versions,
            has_versions: versions_page.has_versions,
            pagination: versions_page.pagination,
            pagination_pages: versions_page.pagination_pages,
            bucket_inspection,
            message: format!("已回滚到 v{version} 的配置快照，并生成新的激活版本。"),
            message_tone: "success",
            can_manage_storage: true,
        })?
        .into_response(),
    )
}

pub async fn system_audit_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<AuditLogQuery>,
) -> AppResult<Response> {
    let context = match system_context_or_redirect(&state, &headers, "system.audit.view").await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let filters = AuditLogFilterView {
        actor: query.actor.trim().to_string(),
        action: query.action.trim().to_string(),
        target_type: query.target_type.trim().to_string(),
        target_id: query.target_id.trim().to_string(),
    };
    let pagination = normalize_web_pagination(query.page, query.per_page)?;
    let page = audit::list_filtered(
        state.pool()?,
        audit::AuditLogFilter {
            actor: filters.actor.clone(),
            action: filters.action.clone(),
            target_type: filters.target_type.clone(),
            target_id: filters.target_id.clone(),
        },
        pagination.page,
        pagination.per_page,
    )
    .await?;
    let total_pages = page.total_pages();
    let logs = page
        .items
        .into_iter()
        .map(audit_log_row_from_summary)
        .collect::<Vec<_>>();
    let pagination = audit_pagination_view(
        &filters,
        page.page,
        page.per_page,
        page.total_items,
        total_pages,
    );
    let pagination_pages = audit_pagination_pages(
        &filters,
        pagination.page,
        pagination.per_page,
        pagination.total_pages,
    );

    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(SystemAuditTemplate {
            active: "system-audit",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            has_logs: !logs.is_empty(),
            logs,
            filters,
            pagination,
            pagination_pages,
        })?
        .into_response(),
    )
}

struct WorkItemListPageMeta {
    active: &'static str,
    title: &'static str,
    create_label: &'static str,
}

impl WorkItemListPageMeta {
    fn requirements() -> Self {
        Self {
            active: "requirements",
            title: "需求",
            create_label: "新建需求",
        }
    }

    fn tasks() -> Self {
        Self {
            active: "tasks",
            title: "任务",
            create_label: "新建任务",
        }
    }

    fn bugs() -> Self {
        Self {
            active: "bugs",
            title: "Bug",
            create_label: "新建 Bug",
        }
    }
}

async fn work_item_list_page(
    state: AppState,
    headers: &HeaderMap,
    item_type: Option<&'static str>,
    meta: WorkItemListPageMeta,
    query: WorkItemListQuery,
) -> AppResult<Response> {
    let mut context = match web_context_or_redirect(&state, headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_view_permission(pool, headers, context.user_id, "work_item.view").await?;
    }
    let requested_project_key = query.project_key.trim().to_ascii_uppercase();
    if !requested_project_key.is_empty()
        && let Some(pool) = context.pool
    {
        let selected = projects::set_current_project_for_user(
            pool,
            context.user_id,
            context.can_access_all_projects,
            &requested_project_key,
        )
        .await?;
        context.current_project = Some(current_project_from_domain(selected));
        refresh_context_system_nav(pool, &mut context).await?;
    }
    let current_project = context.current_project.clone();
    let project_key = current_project
        .as_ref()
        .map(|project| project.key.clone())
        .unwrap_or_else(|| query.project_key.trim().to_ascii_uppercase());
    let filters = WorkItemListFilterView {
        q: query.q.trim().to_string(),
        status: query.status.trim().to_string(),
        priority: query.priority.trim().to_string(),
        project_key,
        assignee_username: query.assignee_username.trim().to_string(),
    };
    let pagination = normalize_web_pagination(query.page, query.per_page)?;
    let current_project_required = current_project.is_none();
    let list_filter = projects::WorkItemListFilter {
        item_type: item_type.map(ToOwned::to_owned),
        keyword: filters.q.clone(),
        status: filters.status.clone(),
        priority: filters.priority.clone(),
        project_key: filters.project_key.clone(),
        assignee_username: filters.assignee_username.clone(),
    };
    let (items, total_items, page_number, per_page, summary) = if current_project_required {
        (
            Vec::new(),
            0,
            pagination.page,
            pagination.per_page,
            WorkItemListSummary {
                total_items: 0,
                pending_in_progress_confirmation_count: 0,
                high_priority_items: 0,
            },
        )
    } else {
        match context.pool {
            Some(pool) => {
                let page = projects::list_work_item_summaries_filtered_for_user_paginated(
                    pool,
                    context.user_id,
                    context.can_access_all_projects,
                    list_filter.clone(),
                    pagination,
                )
                .await?;
                let stats = projects::work_item_list_stats_filtered_for_user(
                    pool,
                    context.user_id,
                    context.can_access_all_projects,
                    list_filter,
                )
                .await?;
                let items = page
                    .items
                    .into_iter()
                    .map(work_item_from_summary)
                    .collect::<Vec<_>>();
                (
                    items,
                    page.total_items,
                    page.page,
                    page.per_page,
                    work_item_list_summary_from_stats(stats),
                )
            }
            None => {
                let sample_items = sample_work_items(item_type);
                let total_items = sample_items.len() as i64;
                let items = paginate_work_item_views(sample_items, pagination);
                let summary = work_item_list_summary_from_items(&items, total_items);
                (
                    items,
                    total_items,
                    pagination.page,
                    pagination.per_page,
                    summary,
                )
            }
        }
    };
    let total_pages = total_pages(total_items, per_page);
    let pagination = work_item_pagination_view(
        meta.active,
        &filters,
        page_number,
        per_page,
        total_items,
        total_pages,
    );
    let (can_manage_work_items, assignee_options) = match (context.pool, current_project.as_ref()) {
        (Some(pool), Some(project_context)) => {
            let project = projects::get_project_detail(pool, &project_context.key)
                .await?
                .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
            let project_accepts_writes =
                projects::ensure_project_accepts_writes(&project.status).is_ok();
            let can_write = user_can_write_project_content_for_context(pool, &context, project.id)
                .await?
                && project_accepts_writes;
            let members = load_project_member_options(pool, &project_context.key).await?;
            (can_write, members)
        }
        (None, _) => (
            true,
            vec![ProjectMemberView {
                display_name: "陈".to_string(),
                username: "yuance_admin".to_string(),
                role_code: "owner".to_string(),
                role: "项目负责人".to_string(),
                joined_at: "今天".to_string(),
            }],
        ),
        _ => (false, Vec::new()),
    };
    let parent_options = if item_type == Some("task") && !filters.project_key.is_empty() {
        match context.pool {
            Some(pool) => projects::list_work_item_summaries_filtered_for_user(
                pool,
                context.user_id,
                context.can_access_all_projects,
                projects::WorkItemListFilter {
                    item_type: Some("requirement".to_string()),
                    project_key: filters.project_key.clone(),
                    ..projects::WorkItemListFilter::default()
                },
            )
            .await?
            .into_iter()
            .map(work_item_from_summary)
            .collect::<Vec<_>>(),
            None => sample_work_items(Some("requirement")),
        }
    } else {
        Vec::new()
    };

    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(WorkItemListTemplate {
            active: meta.active,
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project,
            current_project_required,
            topbar_project_options: context.topbar_project_options,
            title: meta.title,
            create_label: meta.create_label,
            item_type: item_type.unwrap_or("task"),
            has_items: !items.is_empty(),
            items,
            parent_options,
            assignee_options,
            pagination_pages: work_item_pagination_pages(
                meta.active,
                &filters,
                pagination.page,
                pagination.per_page,
                pagination.total_pages,
            ),
            filters,
            summary,
            pagination,
            can_manage_work_items,
        })?
        .into_response(),
    )
}

pub async fn work_items_partial(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<WorkItemsQuery>,
) -> AppResult<Response> {
    let item_type = requested_work_item_type(query.kind.as_deref())?;

    let Some(pool) = state.pool.as_ref() else {
        let items = sample_work_items(item_type);
        return response::html(WorkItemsPartialTemplate {
            has_items: !items.is_empty(),
            empty_message: empty_work_items_message(item_type),
            items,
        })
        .map(IntoResponse::into_response);
    };

    if bootstrap::bootstrap_required(pool).await? {
        return bootstrap_redirect(&headers);
    }

    let Some(user) = auth::user_from_headers(pool, &headers).await? else {
        return login_redirect(&headers);
    };
    ensure_view_permission(pool, &headers, user.id, "work_item.view").await?;
    let can_access_all_projects =
        user_can_access_all_projects(pool, user.id, user.is_super_admin).await?;
    let items = projects::list_work_item_summaries_for_user(
        pool,
        user.id,
        can_access_all_projects,
        item_type,
    )
    .await?
    .into_iter()
    .map(work_item_from_summary)
    .collect::<Vec<_>>();

    response::html(WorkItemsPartialTemplate {
        has_items: !items.is_empty(),
        empty_message: empty_work_items_message(item_type),
        items,
    })
    .map(IntoResponse::into_response)
}

pub async fn work_item_detail_partial(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
) -> AppResult<Response> {
    let Some(pool) = state.pool.as_ref() else {
        return response::html(sample_work_item_detail_partial()?).map(IntoResponse::into_response);
    };
    if bootstrap::bootstrap_required(pool).await? {
        return bootstrap_redirect(&headers);
    }

    let Some(user) = auth::user_from_headers(pool, &headers).await? else {
        return login_redirect(&headers);
    };
    ensure_view_permission(pool, &headers, user.id, "work_item.view").await?;
    let can_access_all_projects =
        user_can_access_all_projects(pool, user.id, user.is_super_admin).await?;
    let Some((item, comments)) =
        load_work_item_detail_for_user(pool, &item_key, user.id, can_access_all_projects).await?
    else {
        return Ok(StatusCode::NOT_FOUND.into_response());
    };
    ensure_project_key_access(pool, user.id, can_access_all_projects, &item.project_key).await?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    let can_manage_work_items = user_can_write_project_content_for_user(
        pool,
        user.id,
        user.is_super_admin,
        can_access_all_projects,
        project.id,
    )
    .await?
        && projects::ensure_project_accepts_writes(&project.status).is_ok();

    let status_options = work_item_status_options(&item.kind, &item.status_code)?;
    let discussion_count = discussion_comment_count(&comments);
    response::html(WorkItemDetailPartialTemplate {
        csrf_token: csrf::ensure_token(&headers),
        discussion_count,
        has_comments: discussion_count > 0,
        item,
        status_options,
        comments,
        can_manage_work_items,
    })
    .map(IntoResponse::into_response)
}

async fn render_dashboard(
    state: &AppState,
    context: DashboardRenderContext<'_>,
) -> AppResult<Html<String>> {
    let (metrics, projects, activities) = match context.pool {
        Some(pool) => {
            let can_view_projects =
                rbac::user_has_permission(pool, context.user_id, "project.view").await?;
            let can_view_work_items =
                rbac::user_has_permission(pool, context.user_id, "work_item.view").await?;
            let all_project_summaries = if can_view_projects {
                projects::list_project_summaries_for_user(
                    pool,
                    context.user_id,
                    context.can_access_all_projects,
                )
                .await?
            } else {
                Vec::new()
            };
            let pending_by_project =
                projects::list_project_pending_counts_for_user(pool, context.user_id)
                    .await?
                    .into_iter()
                    .map(|counts| (counts.project_id, counts))
                    .collect::<HashMap<_, _>>();
            let assigned_pending_counts = if can_view_work_items {
                projects::count_pending_assigned_work_items(
                    pool,
                    context.user_id,
                    context.can_access_all_projects,
                    None,
                )
                .await?
            } else {
                projects::WorkItemAssignmentCounts::default()
            };
            let activity_summaries = if can_view_projects {
                projects::list_recent_activities_for_user(
                    pool,
                    context.user_id,
                    context.can_access_all_projects,
                    5,
                )
                .await?
            } else {
                Vec::new()
            };
            (
                metrics_from_data(&all_project_summaries, &assigned_pending_counts),
                all_project_summaries
                    .into_iter()
                    .map(|project| {
                        let pending = pending_by_project
                            .get(&project.id)
                            .cloned()
                            .unwrap_or_default();
                        project_from_summary_with_pending(project, pending)
                    })
                    .collect(),
                activity_summaries
                    .into_iter()
                    .map(activity_from_summary)
                    .collect(),
            )
        }
        None => (sample_metrics(), sample_projects(), sample_activities()),
    };
    let can_manage_projects = match context.pool {
        Some(pool) => rbac::user_has_permission(pool, context.user_id, "project.manage").await?,
        None => true,
    };

    response::html(DashboardTemplate {
        active: "dashboard",
        environment: state.settings.env.clone(),
        current_user: context.current_user,
        csrf_token: context.csrf_token,
        system_nav: context.system_nav,
        current_project: context.current_project,
        topbar_project_options: context.topbar_project_options,
        metrics,
        projects,
        activities,
        can_manage_projects,
        current_username: context.current_username,
    })
}

struct WebContext<'a> {
    user_id: i64,
    current_user: String,
    csrf_token: String,
    is_super_admin: bool,
    can_access_all_projects: bool,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    topbar_project_options: Vec<ProjectOption>,
    pool: Option<&'a SqlitePool>,
}

struct SystemContext {
    user_id: i64,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    topbar_project_options: Vec<ProjectOption>,
}

async fn web_context_or_redirect<'a>(
    state: &'a AppState,
    headers: &HeaderMap,
) -> AppResult<Result<WebContext<'a>, Response>> {
    let Some(pool) = state.pool.as_ref() else {
        return Ok(Ok(WebContext {
            user_id: 0,
            current_user: "yuance_admin".to_string(),
            csrf_token: csrf::ensure_token(headers),
            is_super_admin: true,
            can_access_all_projects: true,
            system_nav: SystemNav::all(),
            current_project: None,
            topbar_project_options: sample_project_options(),
            pool: None,
        }));
    };

    if bootstrap::bootstrap_required(pool).await? {
        return Ok(Err(bootstrap_redirect(headers)?));
    }

    let Some(user) = auth::user_from_headers(pool, headers).await? else {
        return Ok(Err(login_redirect(headers)?));
    };

    let can_access_all_projects =
        user_can_access_all_projects(pool, user.id, user.is_super_admin).await?;
    let (current_project, topbar_project_options) =
        build_project_context(pool, user.id, can_access_all_projects).await?;
    let system_nav = build_system_nav(
        pool,
        user.id,
        can_access_all_projects,
        current_project.as_ref().map(|project| project.key.as_str()),
    )
    .await?;

    Ok(Ok(WebContext {
        user_id: user.id,
        current_user: user.display_name,
        csrf_token: csrf::ensure_token(headers),
        is_super_admin: user.is_super_admin,
        can_access_all_projects,
        system_nav,
        current_project,
        topbar_project_options,
        pool: Some(pool),
    }))
}

async fn system_context_or_redirect(
    state: &AppState,
    headers: &HeaderMap,
    permission_key: &str,
) -> AppResult<Result<SystemContext, Response>> {
    let Some(pool) = state.pool.as_ref() else {
        return Ok(Ok(SystemContext {
            user_id: 0,
            current_user: "yuance_admin".to_string(),
            csrf_token: csrf::ensure_token(headers),
            system_nav: SystemNav::all(),
            current_project: None,
            topbar_project_options: sample_project_options(),
        }));
    };

    if bootstrap::bootstrap_required(pool).await? {
        return Ok(Err(bootstrap_redirect(headers)?));
    }

    let Some(user) = auth::user_from_headers(pool, headers).await? else {
        return Ok(Err(login_redirect(headers)?));
    };

    if !rbac::user_has_permission(pool, user.id, permission_key).await? {
        record_permission_denied(pool, headers, user.id, permission_key, "web.system").await?;
        return Err(crate::platform::error::AppError::Forbidden(
            "需要系统管理权限".to_string(),
        ));
    }
    let can_access_all_projects =
        user_can_access_all_projects(pool, user.id, user.is_super_admin).await?;
    let (current_project, topbar_project_options) =
        build_project_context(pool, user.id, can_access_all_projects).await?;
    let system_nav = build_system_nav(
        pool,
        user.id,
        can_access_all_projects,
        current_project.as_ref().map(|project| project.key.as_str()),
    )
    .await?;
    Ok(Ok(SystemContext {
        user_id: user.id,
        current_user: user.display_name,
        csrf_token: csrf::ensure_token(headers),
        system_nav,
        current_project,
        topbar_project_options,
    }))
}

async fn user_can_access_all_projects(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
) -> AppResult<bool> {
    if is_super_admin {
        return Ok(true);
    }

    rbac::user_has_all_data_scope(pool, user_id).await
}

async fn build_project_context(
    pool: &SqlitePool,
    user_id: i64,
    can_access_all_projects: bool,
) -> AppResult<(Option<CurrentProjectView>, Vec<ProjectOption>)> {
    let can_view_projects = rbac::user_has_permission(pool, user_id, "project.view").await?;
    let can_view_work_items = rbac::user_has_permission(pool, user_id, "work_item.view").await?;
    if !can_view_projects && !can_view_work_items {
        return Ok((None, Vec::new()));
    }

    let project_options =
        projects::list_project_summaries_for_user(pool, user_id, can_access_all_projects)
            .await?
            .into_iter()
            .map(project_option_from_summary)
            .collect::<Vec<_>>();
    let current_project =
        projects::get_or_select_current_project_for_user(pool, user_id, can_access_all_projects)
            .await?
            .map(current_project_from_domain);

    Ok((current_project, project_options))
}

async fn refresh_context_system_nav(
    pool: &SqlitePool,
    context: &mut WebContext<'_>,
) -> AppResult<()> {
    context.system_nav = build_system_nav(
        pool,
        context.user_id,
        context.can_access_all_projects,
        context
            .current_project
            .as_ref()
            .map(|project| project.key.as_str()),
    )
    .await?;
    Ok(())
}

async fn build_system_nav(
    pool: &SqlitePool,
    user_id: i64,
    can_access_all_projects: bool,
    current_project_key: Option<&str>,
) -> AppResult<SystemNav> {
    let dashboard = rbac::user_has_permission(pool, user_id, "system.dashboard.view").await?;
    let users = rbac::user_has_permission(pool, user_id, "system.users.view").await?;
    let roles = rbac::user_has_permission(pool, user_id, "system.roles.view").await?;
    let storage = rbac::user_has_permission(pool, user_id, "system.storage.view").await?;
    let database_stats =
        rbac::user_has_permission(pool, user_id, "system.database_stats.view").await?;
    let audit = rbac::user_has_permission(pool, user_id, "system.audit.view").await?;
    let work_item_counts = projects::count_pending_visible_work_items(
        pool,
        user_id,
        can_access_all_projects,
        current_project_key,
    )
    .await?;
    let unread_notifications = notifications::unread_count(pool, user_id).await?;

    Ok(SystemNav {
        visible: dashboard || users || roles || storage || database_stats || audit,
        dashboard,
        users,
        roles,
        storage,
        database_stats,
        audit,
        requirements_badge: topnav_badge(work_item_counts.requirements),
        tasks_badge: topnav_badge(work_item_counts.tasks),
        bugs_badge: topnav_badge(work_item_counts.bugs),
        notifications_badge: topnav_badge(unread_notifications),
    })
}

fn topnav_badge(count: i64) -> String {
    match count {
        count if count <= 0 => String::new(),
        count if count > 99 => "99".to_string(),
        count => count.to_string(),
    }
}

async fn ensure_manage_permission(
    pool: &SqlitePool,
    headers: &HeaderMap,
    user_id: i64,
    permission_key: &str,
) -> AppResult<()> {
    if rbac::user_has_permission(pool, user_id, permission_key).await? {
        return Ok(());
    }

    record_permission_denied(pool, headers, user_id, permission_key, "web.action").await?;
    Err(AppError::Forbidden("缺少操作权限".to_string()))
}

async fn ensure_view_permission(
    pool: &SqlitePool,
    headers: &HeaderMap,
    user_id: i64,
    permission_key: &str,
) -> AppResult<()> {
    if rbac::user_has_permission(pool, user_id, permission_key).await? {
        return Ok(());
    }

    record_permission_denied(pool, headers, user_id, permission_key, "web.view").await?;
    Err(AppError::Forbidden("缺少查看权限".to_string()))
}

async fn record_permission_denied(
    pool: &SqlitePool,
    headers: &HeaderMap,
    user_id: i64,
    permission_key: &str,
    source: &str,
) -> AppResult<()> {
    let request_context = audit_context::from_headers(headers);
    audit::record_with_context(
        pool,
        Some(user_id),
        "permission.denied",
        "permission",
        permission_key,
        &format!(r#"{{"source":"{source}"}}"#),
        &request_context,
    )
    .await
}

fn redirect_with_session(
    state: &AppState,
    session: auth::IssuedSession,
    htmx: bool,
) -> AppResult<Response> {
    let cookie = auth::session_cookie_header_with_max_age(
        &session.raw_token,
        state.settings.session_ttl_seconds()?,
        state.settings.env == "production",
    );
    let refresh_cookie = auth::refresh_cookie_header_with_max_age(
        &session.refresh_token,
        state.settings.refresh_session_ttl_seconds()?,
        state.settings.env == "production",
    );
    let mut response = if htmx {
        StatusCode::NO_CONTENT.into_response()
    } else {
        Redirect::to("/web").into_response()
    };
    response
        .headers_mut()
        .insert(header::SET_COOKIE, cookie.parse()?);
    response
        .headers_mut()
        .append(header::SET_COOKIE, refresh_cookie.parse()?);
    if htmx {
        response
            .headers_mut()
            .insert("HX-Redirect", "/web".parse()?);
    }
    Ok(response)
}

fn login_redirect(headers: &HeaderMap) -> AppResult<Response> {
    redirect_for_web(headers, "/web/login")
}

fn bootstrap_redirect(headers: &HeaderMap) -> AppResult<Response> {
    redirect_for_web(headers, "/web/bootstrap")
}

fn redirect_for_web(headers: &HeaderMap, location: &'static str) -> AppResult<Response> {
    if is_htmx(headers) {
        let mut response = StatusCode::NO_CONTENT.into_response();
        response
            .headers_mut()
            .insert("HX-Redirect", location.parse()?);
        return Ok(response);
    }

    Ok(Redirect::to(location).into_response())
}

fn safe_web_return_to(value: &str) -> &str {
    let path = value.trim();
    let is_web_path = path == "/web" || path.starts_with("/web/") || path.starts_with("/web?");
    if is_web_path && !path.starts_with("//") && !path.contains(['\n', '\r']) {
        path
    } else {
        "/web"
    }
}

fn project_switch_return_to(value: &str, project_key: &str) -> String {
    let safe_return_to = safe_web_return_to(value);
    let project_key = project_key.trim().to_ascii_uppercase();
    if project_key.is_empty() {
        return safe_return_to.to_string();
    }

    rewrite_project_scoped_path(safe_return_to, &project_key)
        .or_else(|| rewrite_work_item_list_project_query(safe_return_to, &project_key))
        .unwrap_or_else(|| safe_return_to.to_string())
}

fn split_url_fragment(value: &str) -> (&str, Option<&str>) {
    value
        .split_once('#')
        .map_or((value, None), |(base, fragment)| (base, Some(fragment)))
}

fn rewrite_project_scoped_path(value: &str, project_key: &str) -> Option<String> {
    let (without_fragment, fragment) = split_url_fragment(value);
    let (path, query) = without_fragment
        .split_once('?')
        .map_or((without_fragment, None), |(path, query)| {
            (path, Some(query))
        });
    let rest = path.strip_prefix("/web/projects/")?;
    if rest.is_empty() {
        return None;
    }

    let suffix = rest.find('/').map_or("", |index| &rest[index..]);
    let mut rewritten = format!("/web/projects/{project_key}{suffix}");
    if let Some(query) = query.filter(|query| !query.is_empty()) {
        rewritten.push('?');
        rewritten.push_str(query);
    }
    if let Some(fragment) = fragment.filter(|fragment| !fragment.is_empty()) {
        rewritten.push('#');
        rewritten.push_str(fragment);
    }
    Some(rewritten)
}

fn rewrite_work_item_list_project_query(value: &str, project_key: &str) -> Option<String> {
    let (without_fragment, fragment) = split_url_fragment(value);
    let (path, query) = without_fragment
        .split_once('?')
        .map_or((without_fragment, ""), |(path, query)| (path, query));
    if !matches!(path, "/web/requirements" | "/web/tasks" | "/web/bugs") {
        return None;
    }

    let mut pairs = if query.is_empty() {
        Vec::new()
    } else {
        serde_urlencoded::from_str::<Vec<(String, String)>>(query).ok()?
    };
    let mut replaced_project_key = false;
    pairs.retain_mut(|(key, value)| {
        if key == "page" {
            return false;
        }
        if key == "project_key" {
            if replaced_project_key {
                return false;
            }
            *value = project_key.to_string();
            replaced_project_key = true;
        }
        true
    });
    if !replaced_project_key {
        pairs.push(("project_key".to_string(), project_key.to_string()));
    }

    let mut rewritten = path.to_string();
    let query = serde_urlencoded::to_string(pairs).ok()?;
    if !query.is_empty() {
        rewritten.push('?');
        rewritten.push_str(&query);
    }
    if let Some(fragment) = fragment.filter(|fragment| !fragment.is_empty()) {
        rewritten.push('#');
        rewritten.push_str(fragment);
    }
    Some(rewritten)
}

fn work_item_comment_url(item_key: &str, comment_id: i64) -> String {
    format!("/web/work-items/{item_key}#comment-{comment_id}")
}

fn project_info_url(project_key: &str) -> String {
    format!("/web/projects/{project_key}")
}

fn project_members_url(project_key: &str) -> String {
    format!("/web/projects/{project_key}?tab=members")
}

fn project_library_url(project_key: &str) -> String {
    format!("/web/projects/{project_key}?tab=library")
}

fn project_resource_url(project_key: &str, resource_id: i64) -> String {
    format!("/web/projects/{project_key}/resources/{resource_id}")
}

fn project_resource_edit_url(project_key: &str, resource_id: i64) -> String {
    format!("/web/projects/{project_key}/resources/{resource_id}/edit")
}

fn project_resource_archive_url(project_key: &str, resource_id: i64) -> String {
    format!("/web/projects/{project_key}/resources/{resource_id}/archive")
}

fn work_item_discussion_url(item_key: &str) -> String {
    format!("/web/work-items/{item_key}#discussion-title")
}

fn work_item_attachments_url(item_key: &str) -> String {
    format!("/web/work-items/{item_key}#legacy-attachments")
}

fn with_csrf_cookie(
    state: &AppState,
    csrf_token: &str,
    mut response: Response,
) -> AppResult<Response> {
    response.headers_mut().append(
        header::SET_COOKIE,
        csrf::cookie_header(csrf_token, state.settings.env == "production").parse()?,
    );
    Ok(response)
}

fn issue_project_resource_access_token(
    state: &AppState,
    user_id: i64,
    resource_id: i64,
) -> AppResult<String> {
    let grant = ProjectResourceAccessGrant {
        resource_id,
        user_id,
        expires_at: Utc::now().timestamp() + PROJECT_RESOURCE_ACCESS_TTL_SECONDS,
    };
    let plaintext = serde_json::to_string(&grant)
        .map_err(|error| AppError::Crypto(format!("资料访问凭证序列化失败：{error}")))?;
    crypto::encrypt_secret(
        &state.settings.security_master_key,
        &plaintext,
        PROJECT_RESOURCE_ACCESS_AAD,
    )
}

fn verify_project_resource_access_token(
    state: &AppState,
    token: &str,
    user_id: i64,
    resource_id: i64,
) -> AppResult<bool> {
    if token.trim().is_empty() {
        return Ok(false);
    }
    let plaintext = match crypto::decrypt_secret(
        &state.settings.security_master_key,
        token,
        PROJECT_RESOURCE_ACCESS_AAD,
    ) {
        Ok(value) => value,
        Err(_) => return Ok(false),
    };
    let grant = match serde_json::from_str::<ProjectResourceAccessGrant>(&plaintext) {
        Ok(value) => value,
        Err(_) => return Ok(false),
    };
    Ok(grant.user_id == user_id
        && grant.resource_id == resource_id
        && grant.expires_at >= Utc::now().timestamp())
}

fn append_resource_access_token_to_body(body_html: &str, access_token: &str) -> String {
    if access_token.trim().is_empty() {
        return body_html.to_string();
    }
    let query =
        serde_urlencoded::to_string([("access", access_token)]).unwrap_or_else(|_| String::new());
    if query.is_empty() {
        return body_html.to_string();
    }
    body_html.replace("/download\"", &format!("/download?{query}\""))
}

fn is_htmx(headers: &HeaderMap) -> bool {
    headers
        .get("HX-Request")
        .and_then(|value| value.to_str().ok())
        == Some("true")
}

fn parse_csrf_token_form(form: &[u8]) -> AppResult<String> {
    let pairs = serde_urlencoded::from_bytes::<Vec<(String, String)>>(form)
        .map_err(|error| AppError::BadRequest(format!("权限表单解析失败：{error}")))?;
    pairs
        .into_iter()
        .find_map(|(key, value)| (key == csrf::CSRF_FIELD_NAME).then_some(value))
        .map_or_else(|| Ok(String::new()), Ok)
}

fn parse_permission_keys_form(form: &[u8]) -> AppResult<Vec<String>> {
    let pairs = serde_urlencoded::from_bytes::<Vec<(String, String)>>(form)
        .map_err(|error| AppError::BadRequest(format!("权限表单解析失败：{error}")))?;

    Ok(pairs
        .into_iter()
        .filter_map(|(key, value)| {
            if key == "permission_keys" {
                let value = value.trim();
                (!value.is_empty()).then(|| value.to_string())
            } else {
                None
            }
        })
        .collect())
}

fn parse_api_token_create_form(form: &[u8]) -> AppResult<MeApiTokenCreateForm> {
    let pairs = serde_urlencoded::from_bytes::<Vec<(String, String)>>(form)
        .map_err(|error| AppError::BadRequest(format!("访问 Token 表单解析失败：{error}")))?;
    let mut csrf_token = String::new();
    let mut name = String::new();
    let mut scopes = Vec::new();
    let mut project_scope = String::new();
    let mut project_scope_projects = Vec::new();
    let mut expires_at = String::new();
    for (key, value) in pairs {
        match key.as_str() {
            csrf::CSRF_FIELD_NAME => csrf_token = value,
            "name" => name = value,
            "scopes" => scopes.push(value),
            "project_scope" => project_scope = value,
            "project_scope_projects" => project_scope_projects.push(value),
            "expires_at" => expires_at = value,
            _ => {}
        }
    }
    let project_scope = api_token_project_scope_from_form(&project_scope, project_scope_projects);

    Ok(MeApiTokenCreateForm {
        csrf_token,
        name,
        scopes,
        project_scope,
        expires_at,
    })
}

fn api_token_project_scope_from_form(
    legacy_project_scope: &str,
    project_scope_projects: Vec<String>,
) -> String {
    if project_scope_projects
        .iter()
        .any(|project| project.trim().eq_ignore_ascii_case("all"))
    {
        return "all".to_string();
    }

    let mut selected_projects = Vec::new();
    for project in project_scope_projects {
        let project = project.trim();
        if project.is_empty() {
            continue;
        }
        let project = project.to_ascii_uppercase();
        if !selected_projects
            .iter()
            .any(|existing| existing == &project)
        {
            selected_projects.push(project);
        }
    }

    if !selected_projects.is_empty() {
        return selected_projects.join(",");
    }

    let legacy_project_scope = legacy_project_scope.trim();
    if legacy_project_scope.is_empty() {
        "all".to_string()
    } else {
        legacy_project_scope.to_string()
    }
}

#[derive(Debug)]
struct ParsedProjectMemberForm {
    csrf_token: String,
    usernames: Vec<String>,
    member_role: String,
}

fn parse_project_member_form(form: &[u8]) -> AppResult<ParsedProjectMemberForm> {
    let pairs = serde_urlencoded::from_bytes::<Vec<(String, String)>>(form)
        .map_err(|error| AppError::BadRequest(format!("成员表单解析失败：{error}")))?;
    let mut csrf_token = String::new();
    let mut usernames = Vec::new();
    let mut member_role = String::new();
    for (key, value) in pairs {
        match key.as_str() {
            csrf::CSRF_FIELD_NAME => csrf_token = value,
            "username" => usernames.push(value),
            "member_role" => member_role = value,
            _ => {}
        }
    }
    if member_role.trim().is_empty() {
        member_role = "member".to_string();
    }
    Ok(ParsedProjectMemberForm {
        csrf_token,
        usernames,
        member_role,
    })
}

fn parse_i64_form_value(form: &[u8], field_name: &str) -> AppResult<Option<i64>> {
    let pairs = serde_urlencoded::from_bytes::<Vec<(String, String)>>(form)
        .map_err(|error| AppError::BadRequest(format!("表单解析失败：{error}")))?;

    pairs
        .into_iter()
        .find_map(|(key, value)| (key == field_name).then_some(value))
        .map(|value| {
            value
                .trim()
                .parse::<i64>()
                .map_err(|_| AppError::BadRequest("分页参数必须是数字".to_string()))
        })
        .transpose()
}

fn metrics_from_data(
    projects: &[projects::ProjectSummary],
    assigned_pending: &projects::WorkItemAssignmentCounts,
) -> Vec<Metric> {
    let active_projects = projects
        .iter()
        .filter(|project| {
            matches!(
                project.status.as_str(),
                "not_started" | "in_progress" | "acceptance"
            )
        })
        .count();

    vec![
        Metric {
            label: "进行中项目",
            value: active_projects.to_string(),
            tone: "info",
            icon: "projects",
        },
        Metric {
            label: "指派需求",
            value: assigned_pending.requirements.to_string(),
            tone: "info",
            icon: "doc",
        },
        Metric {
            label: "指派任务",
            value: assigned_pending.tasks.to_string(),
            tone: "warning",
            icon: "tasks",
        },
        Metric {
            label: "指派 Bug",
            value: assigned_pending.bugs.to_string(),
            tone: "danger",
            icon: "bug",
        },
    ]
}

fn project_from_summary(project: projects::ProjectSummary) -> ProjectRow {
    project_from_summary_with_pending(project, projects::ProjectPendingCounts::default())
}

fn project_from_summary_with_pending(
    project: projects::ProjectSummary,
    pending: projects::ProjectPendingCounts,
) -> ProjectRow {
    let (status, status_tone) = project_status_label(&project.status);
    ProjectRow {
        code: project.project_key,
        name: project.name,
        owner: fallback_text(project.owner_display_name, "未分配"),
        pending_in_progress_confirmation_count: project.active_work_item_count,
        total_work_items: project.work_item_count,
        status_code: project.status,
        status: status.to_string(),
        status_tone,
        updated_at: display_timestamp(project.updated_at),
        pending_requirements: pending.requirements,
        pending_tasks: pending.tasks,
        pending_bugs: pending.bugs,
    }
}

fn project_option_from_summary(project: projects::ProjectSummary) -> ProjectOption {
    ProjectOption {
        key: project.project_key,
        name: project.name,
    }
}

fn current_project_from_domain(project: projects::CurrentProject) -> CurrentProjectView {
    CurrentProjectView {
        key: project.project_key,
        name: project.name,
    }
}

fn project_detail_from_domain(project: projects::ProjectDetail) -> ProjectDetailView {
    let (status, status_tone) = project_status_label(&project.status);
    ProjectDetailView {
        code: project.project_key,
        name: project.name,
        description: project.description,
        owner_username: project.owner_username,
        owner: fallback_text(project.owner_display_name, "未分配"),
        status_code: project.status,
        status: status.to_string(),
        status_tone,
        start_date: project.start_date,
        due_date: project.due_date,
        created_at: display_timestamp(project.created_at),
        updated_at: display_timestamp(project.updated_at),
    }
}

fn project_member_from_summary(member: projects::ProjectMemberSummary) -> ProjectMemberView {
    ProjectMemberView {
        display_name: member.display_name,
        username: member.username,
        role_code: member.member_role.clone(),
        role: project_member_role_label(&member.member_role).to_string(),
        joined_at: display_timestamp(member.joined_at),
    }
}

fn project_user_option_from_summary(user: users::UserSummary) -> ProjectUserOption {
    ProjectUserOption {
        display_name: user.display_name,
        username: user.username,
        roles: fallback_text(user.role_names, "未分配角色"),
    }
}

fn attachment_from_summary(attachment: files::FileAttachmentSummary) -> AttachmentView {
    let (status, status_tone) = attachment_status_label(&attachment.status);
    let is_previewable_image = is_previewable_image_content_type(&attachment.content_type);
    let is_previewable_video = is_previewable_video_content_type(&attachment.content_type);
    let is_previewable_document =
        is_previewable_document_attachment(&attachment.original_filename, &attachment.content_type);
    AttachmentView {
        id: attachment.id,
        filename: attachment.original_filename,
        content_type: attachment.content_type,
        is_previewable_image,
        is_previewable_video,
        is_previewable_document,
        byte_size: format_byte_size(attachment.byte_size),
        status_code: attachment.status,
        status: status.to_string(),
        status_tone,
        created_by: fallback_text(attachment.created_by_display_name, "系统"),
        created_at: display_timestamp(attachment.created_at),
    }
}

fn project_resource_from_summary(
    resource: project_resources::ProjectResourceSummary,
) -> ProjectResourceView {
    let (status, status_tone) = project_resource_status_label(&resource.status);
    let is_protected = resource.is_protected;
    ProjectResourceView {
        id: resource.id,
        title: resource.title,
        category_code: resource.category.clone(),
        category: project_resources::category_label(&resource.category).to_string(),
        summary: if is_protected {
            "受保护资料，验证访问密码后查看正文。".to_string()
        } else {
            resource.summary
        },
        status_code: resource.status,
        status: status.to_string(),
        status_tone,
        is_protected,
        created_by: fallback_text(resource.created_by_display_name, "系统"),
        updated_by: fallback_text(resource.updated_by_display_name, "系统"),
        created_at: display_timestamp(resource.created_at),
        updated_at: display_timestamp(resource.updated_at),
        url: project_resource_url(&resource.project_key, resource.id),
    }
}

fn project_resource_from_detail(
    resource: project_resources::ProjectResourceDetail,
    access_token: Option<&str>,
) -> ProjectResourceDetailView {
    let (status, status_tone) = project_resource_status_label(&resource.status);
    let project_key = resource.project_key.clone();
    let resource_id = resource.id;
    let editor_body_html =
        project_resources::resource_body_html_for_display(&resource.body, &resource.body_format);
    let body_html = access_token
        .map(|token| append_resource_access_token_to_body(&resource.body_html, token))
        .unwrap_or(resource.body_html);
    ProjectResourceDetailView {
        id: resource.id,
        title: resource.title,
        category_code: resource.category.clone(),
        category: project_resources::category_label(&resource.category).to_string(),
        body: resource.body,
        body_format: resource.body_format,
        body_html,
        editor_body_html,
        summary: resource.summary,
        status_code: resource.status,
        status: status.to_string(),
        status_tone,
        is_protected: resource.is_protected,
        created_by: fallback_text(resource.created_by_display_name, "系统"),
        updated_by: fallback_text(resource.updated_by_display_name, "系统"),
        archived_by: fallback_text(resource.archived_by_display_name, "系统"),
        archived_at: display_timestamp(resource.archived_at),
        created_at: display_timestamp(resource.created_at),
        updated_at: display_timestamp(resource.updated_at),
        edit_url: project_resource_edit_url(&project_key, resource_id),
        archive_url: project_resource_archive_url(&project_key, resource_id),
    }
}

fn project_resource_category_options() -> Vec<ProjectResourceCategoryOption> {
    vec![
        ProjectResourceCategoryOption {
            value: "integration",
            label: "对接参数",
        },
        ProjectResourceCategoryOption {
            value: "customer",
            label: "客户资料",
        },
        ProjectResourceCategoryOption {
            value: "meeting",
            label: "会议纪要",
        },
        ProjectResourceCategoryOption {
            value: "implementation",
            label: "实施文档",
        },
        ProjectResourceCategoryOption {
            value: "other",
            label: "其他",
        },
    ]
}

fn project_detail_summary(
    requirements: &[WorkItem],
    tasks: &[WorkItem],
    bugs: &[WorkItem],
    members: &[ProjectMemberView],
) -> ProjectDetailSummary {
    let pending_in_progress_confirmation_count = requirements
        .iter()
        .chain(tasks)
        .chain(bugs)
        .filter(|item| is_active_work_item_status(&item.status_code))
        .count();

    ProjectDetailSummary {
        requirements: requirements.len(),
        tasks: tasks.len(),
        bugs: bugs.len(),
        pending_in_progress_confirmation_count,
        members: members.len(),
    }
}

fn work_item_from_summary(item: projects::WorkItemSummary) -> WorkItem {
    let (kind, status, status_tone) = work_item_labels(&item.item_type, &item.status);
    let priority = priority_label(&item.priority).to_string();
    WorkItem {
        key: item.item_key,
        kind_code: work_item_kind_code(&item.item_type).to_string(),
        kind: kind.to_string(),
        title: item.title,
        project: format!("{} · {}", item.project_key, item.project_name),
        assignee: fallback_text(item.assignee_display_name, "未分配"),
        priority_code: item.priority,
        priority,
        status_code: item.status,
        status: status.to_string(),
        status_tone,
    }
}

fn work_item_detail_from_domain(item: projects::WorkItemDetail) -> WorkItemDetailView {
    let (kind, status, status_tone) = work_item_labels(&item.item_type, &item.status);
    let priority = priority_label(&item.priority).to_string();
    let description_html =
        projects::work_item_description_html_for_display(&item.description, &item.item_key);
    WorkItemDetailView {
        id: item.id,
        key: item.item_key,
        kind_code: work_item_kind_code(&item.item_type).to_string(),
        kind: kind.to_string(),
        title: item.title,
        description: item.description,
        description_html,
        project_key: item.project_key,
        project_name: item.project_name,
        parent_item_key: item.parent_item_key.clone(),
        parent_title: item.parent_title,
        has_parent: !item.parent_item_key.trim().is_empty(),
        assignee_username: item.assignee_username,
        assignee: fallback_text(item.assignee_display_name, "未分配"),
        reporter_username: item.reporter_username,
        reporter: fallback_text(item.reporter_display_name, "未分配"),
        priority_code: item.priority,
        priority,
        status_code: item.status,
        status: status.to_string(),
        status_tone,
        due_date: item.due_date,
        created_at: display_timestamp(item.created_at),
        updated_at: display_timestamp(item.updated_at),
        deleted_at: display_timestamp(item.deleted_at.clone()),
        is_deleted: !item.deleted_at.trim().is_empty(),
    }
}

fn comment_from_summary(comment: projects::WorkItemCommentSummary) -> WorkItemComment {
    comment_from_summary_with_permission(comment, false)
}

fn notification_view(notification: notifications::NotificationSummary) -> NotificationView {
    NotificationView {
        id: notification.id,
        kind_label: match notification.kind.as_str() {
            "comment_replied" => "回复",
            _ => "指派",
        },
        title: fallback_text(notification.title, "消息通知"),
        body: fallback_text(notification.body, "查看详情"),
        actor: fallback_text(notification.actor_display_name, "系统"),
        created_at: display_timestamp(notification.created_at),
        is_unread: notification.read_at.is_empty(),
    }
}

fn comment_from_summary_with_permission(
    comment: projects::WorkItemCommentSummary,
    can_manage: bool,
) -> WorkItemComment {
    let is_edited = comment.updated_at != comment.created_at;
    let body = work_item_comment_body_for_display(&comment.body, comment.is_flow);
    let body_html = projects::work_item_comment_body_html_for_display(
        &body,
        &comment.body_format,
        comment.is_flow,
    );
    let author = fallback_text(comment.author_display_name, "系统");
    let parent_author = if comment.parent_comment_id.is_some() {
        fallback_text(comment.parent_author_display_name, "原评论作者")
    } else {
        String::new()
    };
    WorkItemComment {
        id: comment.id,
        parent_comment_id: comment.parent_comment_id,
        parent_author,
        body,
        body_format: comment.body_format,
        body_html,
        author,
        author_username: comment.author_username,
        created_at: display_timestamp(comment.created_at),
        updated_at: display_timestamp(comment.updated_at),
        is_edited,
        is_flow: comment.is_flow,
        attachments: Vec::new(),
        has_attachments: false,
        can_manage: can_manage && !comment.is_flow,
    }
}

fn comment_with_attachments(
    mut comment: WorkItemComment,
    attachments: Vec<files::FileAttachmentSummary>,
) -> WorkItemComment {
    let inline_attachment_ids = projects::work_item_comment_inline_attachment_ids(
        comment.id,
        &comment.body,
        &comment.body_format,
    );
    comment.attachments = attachments
        .into_iter()
        .filter(|attachment| !inline_attachment_ids.contains(&attachment.id))
        .map(attachment_from_summary)
        .collect::<Vec<_>>();
    comment.has_attachments = !comment.attachments.is_empty();
    comment
}

fn flow_record_from_summary(comment: projects::WorkItemCommentSummary) -> WorkItemFlowRecord {
    let body = work_item_comment_body_for_display(&comment.body, comment.is_flow);
    let flow_change = work_item_flow_change(&body, comment.is_flow);
    WorkItemFlowRecord {
        actor: fallback_text(comment.author_display_name, "系统"),
        created_at: display_timestamp(comment.created_at),
        status_change: flow_transition_text(&flow_change.previous_status, &flow_change.next_status),
        assignee_change: flow_transition_text(
            &flow_change.previous_assignee,
            &flow_change.next_assignee,
        ),
        note: fallback_text(flow_change.note, "—"),
    }
}

fn work_item_comment_body_for_display(body: &str, is_flow: bool) -> String {
    if !is_flow {
        return body.to_string();
    }

    let (system_summary, note) = split_flow_system_summary(body);
    let mut display_body = system_summary
        .split('；')
        .filter(|part| !part.is_empty())
        .map(|part| {
            part.strip_prefix("负责人：")
                .or_else(|| part.strip_prefix("处理人："))
                .map(|value| format!("指派：{value}"))
                .unwrap_or_else(|| part.to_string())
        })
        .collect::<Vec<_>>()
        .join("；");
    if let Some(note) = note {
        if display_body.is_empty() {
            display_body = format!("说明：{note}");
        } else {
            display_body.push_str("；说明：");
            display_body.push_str(note);
        }
    }
    display_body
}

#[cfg(test)]
fn work_item_flow_title(author: &str, body: &str, is_flow: bool) -> String {
    if !is_flow {
        return String::new();
    }

    let flow_change = work_item_flow_change(body, true);
    let has_status_change =
        !flow_change.previous_status.is_empty() && !flow_change.next_status.is_empty();
    let has_assignee_change =
        !flow_change.previous_assignee.is_empty() && !flow_change.next_assignee.is_empty();

    if has_status_change && has_assignee_change {
        return format!(
            "{author} 将状态从 {} 改为 {}，并指派给 {}",
            flow_change.previous_status, flow_change.next_status, flow_change.next_assignee
        );
    }

    if has_status_change {
        return format!(
            "{author} 将状态从 {} 改为 {}",
            flow_change.previous_status, flow_change.next_status
        );
    }

    if has_assignee_change {
        return format!(
            "{author} 将工作项由 {} 指派给 {}",
            flow_change.previous_assignee, flow_change.next_assignee
        );
    }

    if !flow_change.next_assignee.is_empty() {
        return format!("{author} 指派给 {}", flow_change.next_assignee);
    }

    format!("{author} 记录了流转")
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct WorkItemFlowChange {
    previous_status: String,
    next_status: String,
    previous_assignee: String,
    next_assignee: String,
    note: String,
}

fn work_item_flow_change(body: &str, is_flow: bool) -> WorkItemFlowChange {
    if !is_flow {
        return WorkItemFlowChange::default();
    }

    let normalized_body = work_item_comment_body_for_display(body, true);
    let (system_summary, note) = split_flow_system_summary(&normalized_body);
    let mut flow_change = WorkItemFlowChange {
        note: note.unwrap_or("").trim().to_string(),
        ..WorkItemFlowChange::default()
    };

    for part in system_summary
        .split('；')
        .map(str::trim)
        .filter(|part| !part.is_empty())
    {
        if let Some(value) = part.strip_prefix("状态：") {
            let (previous_status, next_status) = split_flow_transition(value);
            flow_change.previous_status = previous_status;
            flow_change.next_status = next_status;
            continue;
        }

        let Some(value) = part
            .strip_prefix("指派：")
            .or_else(|| part.strip_prefix("处理人："))
            .or_else(|| part.strip_prefix("负责人："))
        else {
            continue;
        };
        let (previous_assignee, next_assignee) = split_flow_transition(value);
        flow_change.previous_assignee = previous_assignee;
        flow_change.next_assignee = next_assignee;
    }

    if flow_change.note.is_empty()
        && flow_change.previous_status.is_empty()
        && flow_change.next_status.is_empty()
        && flow_change.previous_assignee.is_empty()
        && flow_change.next_assignee.is_empty()
    {
        flow_change.note = normalized_body.trim().to_string();
    }

    flow_change
}

fn split_flow_transition(value: &str) -> (String, String) {
    value
        .split_once('→')
        .map(|(previous, next)| (previous.trim().to_string(), next.trim().to_string()))
        .unwrap_or_else(|| (String::new(), value.trim().to_string()))
}

fn flow_transition_text(previous: &str, next: &str) -> String {
    let previous = previous.trim();
    let next = next.trim();
    if previous.is_empty() && next.is_empty() {
        return "—".to_string();
    }
    if previous.is_empty() {
        return next.to_string();
    }
    if next.is_empty() {
        return previous.to_string();
    }
    format!("{previous} → {next}")
}

fn split_flow_system_summary(body: &str) -> (&str, Option<&str>) {
    if let Some(note) = body.strip_prefix("说明：") {
        return ("", Some(note));
    }
    body.split_once("；说明：")
        .map(|(system_summary, note)| (system_summary, Some(note)))
        .unwrap_or((body, None))
}

fn activity_from_summary(activity: projects::ProjectActivitySummary) -> Activity {
    Activity {
        title: activity.summary,
        meta: format!(
            "{} · {} · {}",
            activity.project_key,
            fallback_text(activity.actor_display_name, "系统"),
            display_timestamp(activity.created_at)
        ),
    }
}

fn user_row_from_summary(user: users::UserSummary) -> UserRow {
    let (status, status_tone) = user_status_label(&user.status);
    UserRow {
        username: user.username,
        display_name: user.display_name,
        contact: user_contact(user.email, user.mobile),
        role_code: user.role_code,
        status_code: user.status,
        status: status.to_string(),
        status_tone,
        role_names: fallback_text(user.role_names, "未分配"),
        is_super_admin: user.is_super_admin,
        updated_at: display_timestamp(user.updated_at),
    }
}

fn role_row_from_summary(role: rbac::RoleSummary) -> RoleRow {
    let (status, status_tone) = role_status_label(&role.status);
    RoleRow {
        code: role.role_code,
        name: role.role_name,
        status_code: role.status,
        status: status.to_string(),
        status_tone,
        is_system: role.is_system,
        data_scope: data_scope_label(&role.data_scope_type).to_string(),
        permission_count: role.permission_count,
    }
}

async fn selected_role_summary(
    pool: &SqlitePool,
    roles: &[rbac::RoleSummary],
    requested_role_code: &str,
) -> AppResult<Option<rbac::RoleSummary>> {
    let requested_role_code = requested_role_code.trim();
    if !requested_role_code.is_empty() {
        if let Some(role) = roles
            .iter()
            .find(|role| role.role_code == requested_role_code)
            .cloned()
        {
            return Ok(Some(role));
        }
        return match rbac::find_role(pool, requested_role_code).await {
            Ok(Some(role)) => Ok(Some(role)),
            Ok(None) | Err(AppError::BadRequest(_)) => Ok(roles.first().cloned()),
            Err(error) => Err(error),
        };
    }

    Ok(roles.first().cloned())
}

fn permission_tree_from_summaries(
    permissions: Vec<rbac::PermissionSummary>,
) -> Vec<PermissionGroupView> {
    let mut groups = Vec::new();
    for group_def in permission_group_definitions() {
        let pages = permission_pages_for_group(&permissions, group_def.0);
        if pages.is_empty() {
            continue;
        }
        let total_count = pages.iter().map(|page| page.total_count).sum();
        let granted_count = pages.iter().map(|page| page.granted_count).sum();
        groups.push(PermissionGroupView {
            key: group_def.0.to_string(),
            name: group_def.1.to_string(),
            pages,
            total_count,
            granted_count,
            all_granted: total_count > 0 && total_count == granted_count,
        });
    }
    groups
}

fn permission_pages_for_group(
    permissions: &[rbac::PermissionSummary],
    group_key: &str,
) -> Vec<PermissionPageView> {
    permissions
        .iter()
        .filter(|permission| {
            permission.resource_type == "page"
                && permission_group_key(&permission.resource_key, &permission.permission_key)
                    == group_key
        })
        .map(|page| {
            let actions = permissions
                .iter()
                .filter(|permission| {
                    permission.resource_type == "action"
                        && permission.resource_key == page.resource_key
                })
                .map(|action| PermissionActionView {
                    key: action.permission_key.clone(),
                    name: action.permission_name.clone(),
                    granted: action.granted,
                })
                .collect::<Vec<_>>();
            let action_granted_count = actions.iter().filter(|action| action.granted).count();
            let total_count = 1 + actions.len();
            let granted_count = usize::from(page.granted) + action_granted_count;
            PermissionPageView {
                key: page.permission_key.clone(),
                name: page.permission_name.clone(),
                resource: page.resource_key.clone(),
                granted: page.granted,
                has_actions: !actions.is_empty(),
                actions,
                total_count,
                granted_count,
            }
        })
        .collect()
}

fn permission_tree_counts(permission_groups: &[PermissionGroupView]) -> (usize, usize) {
    (
        permission_groups
            .iter()
            .map(|group| group.total_count)
            .sum(),
        permission_groups
            .iter()
            .map(|group| group.granted_count)
            .sum(),
    )
}

fn permission_group_definitions() -> &'static [(&'static str, &'static str)] {
    &[
        ("system", "系统管理"),
        ("project", "项目协作"),
        ("work-item", "工作项"),
        ("other", "其他权限"),
    ]
}

fn permission_group_key(resource_key: &str, permission_key: &str) -> &'static str {
    if resource_key == "system" || resource_key.starts_with("system-") {
        return "system";
    }
    if resource_key == "projects" || permission_key.starts_with("project.") {
        return "project";
    }
    if resource_key == "work-items" || permission_key.starts_with("work_item.") {
        return "work-item";
    }
    "other"
}

fn storage_config_view_from_domain(config: storage::StorageConfig) -> StorageConfigView {
    let (status, status_tone) = storage_status_label(&config.status);
    StorageConfigView {
        has_config: true,
        provider: storage_provider_label(&config.provider).to_string(),
        endpoint: config.endpoint,
        region: fallback_text(config.region, "未填写"),
        bucket: config.bucket,
        access_key_id_hint: config.access_key_id_hint,
        status: status.to_string(),
        status_tone,
        version: config.version,
        updated_at: display_timestamp(config.updated_at),
    }
}

async fn storage_versions_page_for_view(
    pool: &SqlitePool,
    requested_pagination: projects::Pagination,
) -> AppResult<StorageVersionsPageView> {
    let total_items = storage::count_config_versions(pool).await?;
    let total_pages = total_pages(total_items, requested_pagination.per_page);
    let page_number = requested_pagination.page.min(total_pages);
    let versions =
        storage::list_config_versions_page(pool, page_number, requested_pagination.per_page)
            .await?
            .into_iter()
            .map(storage_config_version_view_from_domain)
            .collect::<Vec<_>>();
    let pagination = storage_versions_pagination_view(
        page_number,
        requested_pagination.per_page,
        total_items,
        total_pages,
    );
    let pagination_pages = storage_versions_pagination_pages(
        pagination.page,
        pagination.per_page,
        pagination.total_pages,
    );

    Ok(StorageVersionsPageView {
        versions,
        has_versions: total_items > 0,
        pagination,
        pagination_pages,
    })
}

async fn storage_bucket_inspection_for_page(
    pool: &SqlitePool,
    state: &AppState,
) -> StorageBucketInspectionView {
    match storage::inspect_active_initialization(pool, &state.settings).await {
        Ok(inspection) => storage_bucket_inspection_view_from_domain(inspection),
        Err(AppError::BadRequest(message)) if message == "对象存储未激活" => {
            storage_bucket_inspection_error_view(
                "对象存储尚未激活，请先保存并激活配置。".to_string(),
            )
        }
        Err(error) => storage_bucket_inspection_error_view(storage_probe_error_message(&error)),
    }
}

fn storage_bucket_inspection_view_from_domain(
    inspection: storage::StorageBucketInspection,
) -> StorageBucketInspectionView {
    let (status, status_tone) = if inspection.ok {
        ("运行就绪", "ok")
    } else if inspection.needs_initialization {
        ("需要初始化", "warning")
    } else {
        ("检测异常", "danger")
    };
    let checks = inspection
        .checks
        .into_iter()
        .map(storage_bucket_check_view_from_domain)
        .collect::<Vec<_>>();

    StorageBucketInspectionView {
        provider: storage_provider_label(&inspection.provider).to_string(),
        bucket: inspection.bucket,
        status: status.to_string(),
        status_tone,
        initialized: inspection.initialized,
        needs_initialization: inspection.needs_initialization,
        can_write: inspection.can_write,
        can_read: inspection.can_read,
        can_delete: inspection.can_delete,
        marker_key: inspection.marker_key,
        message: inspection.message,
        has_checks: !checks.is_empty(),
        checks,
    }
}

fn storage_bucket_check_view_from_domain(
    check: storage::StorageBucketCheck,
) -> StorageBucketCheckView {
    StorageBucketCheckView {
        code: check.code,
        status_tone: storage_bucket_check_tone(&check.status),
        status: storage_bucket_check_label(&check.status).to_string(),
        message: check.message,
    }
}

fn storage_bucket_inspection_error_view(message: String) -> StorageBucketInspectionView {
    StorageBucketInspectionView {
        provider: "阿里云 OSS".to_string(),
        bucket: "未激活".to_string(),
        status: "未配置".to_string(),
        status_tone: "danger",
        initialized: false,
        needs_initialization: false,
        can_write: false,
        can_read: false,
        can_delete: false,
        marker_key: storage::STORAGE_INIT_MARKER_KEY.to_string(),
        message,
        checks: Vec::new(),
        has_checks: false,
    }
}

fn storage_config_version_view_from_domain(
    version: storage::StorageConfigVersion,
) -> StorageConfigVersionView {
    let (snapshot_status, snapshot_status_tone) = storage_status_label(&version.snapshot_status);
    let (current_status, current_status_tone) = storage_status_label(&version.current_status);
    StorageConfigVersionView {
        version: version.version,
        provider: storage_provider_label(&version.provider).to_string(),
        endpoint: version.endpoint,
        region: fallback_text(version.region, "未填写"),
        bucket: version.bucket,
        access_key_id_hint: version.access_key_id_hint,
        snapshot_status: snapshot_status.to_string(),
        snapshot_status_tone,
        current_status: current_status.to_string(),
        current_status_tone,
        created_by: fallback_text(version.created_by, "系统"),
        created_at: display_timestamp(version.created_at),
        is_current_active: version.current_status == "active",
    }
}

async fn attachment_download_redirect(
    state: &AppState,
    pool: &SqlitePool,
    actor_user_id: i64,
    attachment: files::FileAttachmentSummary,
    target_type: &str,
    target_id: &str,
    metadata: String,
) -> AppResult<Response> {
    if attachment.status == "deleted" {
        return Err(AppError::BadRequest("附件已归档，不能下载".to_string()));
    }
    if attachment.status != "uploaded" {
        return Err(AppError::BadRequest(
            "附件尚未上传完成，不能下载".to_string(),
        ));
    }

    enum DownloadTarget {
        TestMemory {
            content_type: String,
            content: Vec<u8>,
        },
        SignedRedirect {
            url: String,
        },
    }

    let test_memory_object =
        storage::read_test_memory_object(pool, &state.settings, &attachment.object_key).await?;
    let download_target = if let Some((content_type, content)) = test_memory_object {
        DownloadTarget::TestMemory {
            content_type,
            content,
        }
    } else {
        let signed = storage::presign_download_url(
            pool,
            &state.settings,
            &attachment.object_key,
            storage::DEFAULT_DOWNLOAD_URL_TTL_SECONDS as u64,
        )
        .await?;
        DownloadTarget::SignedRedirect { url: signed.url }
    };
    audit::record(
        pool,
        Some(actor_user_id),
        "file.download",
        target_type,
        target_id,
        &metadata,
    )
    .await?;

    match download_target {
        DownloadTarget::TestMemory {
            content_type,
            content,
        } => {
            let is_inline_media = is_previewable_image_content_type(&content_type)
                || is_previewable_video_content_type(&content_type);
            let mut response = content.into_response();
            let headers = response.headers_mut();
            headers.insert(
                header::CONTENT_TYPE,
                if is_inline_media {
                    content_type.parse()?
                } else {
                    "application/octet-stream".parse()?
                },
            );
            headers.insert(header::X_CONTENT_TYPE_OPTIONS, "nosniff".parse()?);
            if !is_inline_media {
                headers.insert(header::CONTENT_DISPOSITION, "attachment".parse()?);
            }
            Ok(response)
        }
        DownloadTarget::SignedRedirect { url } => Ok(Redirect::temporary(&url).into_response()),
    }
}

async fn attachment_document_preview_response(
    state: &AppState,
    pool: &SqlitePool,
    actor_user_id: i64,
    attachment: files::FileAttachmentSummary,
    source_url: String,
    source_label: String,
    navigation: DocumentPreviewNavigation,
    preview_content_url: &str,
    target_type: &str,
    target_id: &str,
    metadata: String,
    download_url: &str,
) -> AppResult<Response> {
    audit::record(
        pool,
        Some(actor_user_id),
        "file.preview",
        target_type,
        target_id,
        &metadata,
    )
    .await?;

    let template = build_document_preview_template(
        state,
        pool,
        attachment,
        source_url,
        source_label,
        navigation,
        preview_content_url.to_string(),
        download_url.to_string(),
    )
    .await?;
    Ok(response::html(template)?.into_response())
}

async fn build_document_preview_template(
    state: &AppState,
    pool: &SqlitePool,
    attachment: files::FileAttachmentSummary,
    source_url: String,
    source_label: String,
    navigation: DocumentPreviewNavigation,
    preview_content_url: String,
    download_url: String,
) -> AppResult<DocumentPreviewTemplate> {
    let title = attachment.original_filename.clone();
    if attachment.status == "deleted" {
        return Ok(document_preview_error_template(
            title,
            source_url,
            source_label,
            navigation,
            download_url,
            "附件已归档，不能预览。".to_string(),
        ));
    }
    if attachment.status != "uploaded" {
        return Ok(document_preview_error_template(
            title,
            source_url,
            source_label,
            navigation,
            download_url,
            "附件尚未上传完成，请稍后再试。".to_string(),
        ));
    }

    let Some(strategy) =
        attachment_preview_strategy(&attachment.original_filename, &attachment.content_type)
    else {
        return Ok(document_preview_error_template(
            title,
            source_url,
            source_label,
            navigation,
            download_url,
            "当前文件类型暂不支持文档预览。".to_string(),
        ));
    };
    let Some(file_type) =
        attachment_preview_file_type(&attachment.original_filename, &attachment.content_type)
    else {
        return Ok(document_preview_error_template(
            title,
            source_url,
            source_label,
            navigation,
            download_url,
            "当前文件类型暂不支持文档预览。".to_string(),
        ));
    };
    let kind_label = document_preview_kind_label(strategy).to_string();
    let file_type_badge = file_type.to_ascii_uppercase();
    let meta_text = format!(
        "{kind_label} · {} · 站内离线预览",
        format_byte_size(attachment.byte_size)
    );
    let error_navigation = navigation.clone();
    let mut template = DocumentPreviewTemplate {
        title,
        source_url,
        source_label,
        kind_label,
        file_type_badge,
        meta_text,
        position_text: navigation.position_text,
        has_previous: navigation.previous.is_some(),
        previous_url: navigation
            .previous
            .as_ref()
            .map(|link| link.url.clone())
            .unwrap_or_default(),
        previous_title: navigation
            .previous
            .as_ref()
            .map(|link| link.title.clone())
            .unwrap_or_default(),
        has_next: navigation.next.is_some(),
        next_url: navigation
            .next
            .as_ref()
            .map(|link| link.url.clone())
            .unwrap_or_default(),
        next_title: navigation
            .next
            .as_ref()
            .map(|link| link.title.clone())
            .unwrap_or_default(),
        download_url,
        has_error: false,
        error_message: String::new(),
        preview_hint: preview_hint_for_strategy(strategy, &file_type),
        has_pdf_preview: false,
        pdf_preview_url: String::new(),
        has_text_preview: false,
        text_preview_content: String::new(),
        text_preview_line_count: 0,
        text_preview_is_truncated: false,
        has_csv_preview: false,
        csv_preview_headers: Vec::new(),
        csv_preview_rows: Vec::new(),
        csv_preview_is_truncated: false,
    };

    match strategy {
        AttachmentPreviewStrategy::Pdf => {
            template.has_pdf_preview = true;
            template.pdf_preview_url = preview_content_url;
        }
        AttachmentPreviewStrategy::OfficePdf => {
            if let Err(error) = ensure_office_preview_cached_pdf(state, pool, &attachment).await {
                return Ok(document_preview_error_template(
                    template.title,
                    template.source_url,
                    template.source_label,
                    error_navigation.clone(),
                    template.download_url,
                    error.to_string(),
                ));
            }
            template.has_pdf_preview = true;
            template.pdf_preview_url = preview_content_url;
        }
        AttachmentPreviewStrategy::Text => {
            let (_content_type, content) =
                storage::read_object(pool, &state.settings, &attachment.object_key).await?;
            let text_preview = build_text_preview_content(&content);
            template.has_text_preview = true;
            template.text_preview_content = text_preview.content;
            template.text_preview_line_count = text_preview.line_count;
            template.text_preview_is_truncated = text_preview.is_truncated;
        }
        AttachmentPreviewStrategy::Csv => {
            let (_content_type, content) =
                storage::read_object(pool, &state.settings, &attachment.object_key).await?;
            match build_csv_preview_table(&content) {
                Ok(table) => {
                    template.has_csv_preview = true;
                    template.csv_preview_headers = table.headers;
                    template.csv_preview_rows = table.rows;
                    template.csv_preview_is_truncated = table.is_truncated;
                }
                Err(error) => {
                    return Ok(document_preview_error_template(
                        template.title,
                        template.source_url,
                        template.source_label,
                        error_navigation.clone(),
                        template.download_url,
                        error.to_string(),
                    ));
                }
            }
        }
    }

    Ok(template)
}

fn document_preview_error_template(
    title: String,
    source_url: String,
    source_label: String,
    navigation: DocumentPreviewNavigation,
    download_url: String,
    error_message: String,
) -> DocumentPreviewTemplate {
    let fallback_file_type = attachment_preview_file_type(&title, "")
        .unwrap_or("file")
        .to_ascii_uppercase();
    let fallback_kind_label = attachment_preview_strategy(&title, "")
        .map(document_preview_kind_label)
        .unwrap_or("文档预览")
        .to_string();
    DocumentPreviewTemplate {
        title,
        source_url,
        source_label,
        kind_label: fallback_kind_label,
        file_type_badge: fallback_file_type,
        meta_text: "当前无法直接加载预览，可以刷新后重试或下载原文件。".to_string(),
        position_text: navigation.position_text,
        has_previous: navigation.previous.is_some(),
        previous_url: navigation
            .previous
            .as_ref()
            .map(|link| link.url.clone())
            .unwrap_or_default(),
        previous_title: navigation
            .previous
            .as_ref()
            .map(|link| link.title.clone())
            .unwrap_or_default(),
        has_next: navigation.next.is_some(),
        next_url: navigation
            .next
            .as_ref()
            .map(|link| link.url.clone())
            .unwrap_or_default(),
        next_title: navigation
            .next
            .as_ref()
            .map(|link| link.title.clone())
            .unwrap_or_default(),
        download_url,
        has_error: true,
        error_message,
        preview_hint: "当前无法直接加载预览，可以刷新后重试或下载原文件。".to_string(),
        has_pdf_preview: false,
        pdf_preview_url: String::new(),
        has_text_preview: false,
        text_preview_content: String::new(),
        text_preview_line_count: 0,
        text_preview_is_truncated: false,
        has_csv_preview: false,
        csv_preview_headers: Vec::new(),
        csv_preview_rows: Vec::new(),
        csv_preview_is_truncated: false,
    }
}

const TEXT_PREVIEW_MAX_BYTES: usize = 2 * 1024 * 1024;
const CSV_PREVIEW_MAX_BYTES: usize = 2 * 1024 * 1024;
const CSV_PREVIEW_MAX_ROWS: usize = 200;
const CSV_PREVIEW_MAX_COLUMNS: usize = 24;

fn preview_hint_for_strategy(strategy: AttachmentPreviewStrategy, file_type: &str) -> String {
    match strategy {
        AttachmentPreviewStrategy::Pdf => {
            "原始 PDF 将直接在站内预览，无需外部文档服务。".to_string()
        }
        AttachmentPreviewStrategy::Text => "文本内容由应用服务直接读取并渲染。".to_string(),
        AttachmentPreviewStrategy::Csv => {
            "CSV 将以表格方式在站内渲染，超大文件会截断展示。".to_string()
        }
        AttachmentPreviewStrategy::OfficePdf => format!(
            "{} 文档会先在服务器本地离线转换为 PDF，再进入站内预览。",
            file_type.to_ascii_uppercase()
        ),
    }
}

fn document_preview_kind_label(strategy: AttachmentPreviewStrategy) -> &'static str {
    match strategy {
        AttachmentPreviewStrategy::Pdf => "PDF",
        AttachmentPreviewStrategy::Text => "文本",
        AttachmentPreviewStrategy::Csv => "表格",
        AttachmentPreviewStrategy::OfficePdf => "文档",
    }
}

fn build_text_preview_content(content: &[u8]) -> TextPreviewContent {
    let is_truncated = content.len() > TEXT_PREVIEW_MAX_BYTES;
    let preview_bytes = if is_truncated {
        &content[..TEXT_PREVIEW_MAX_BYTES]
    } else {
        content
    };
    let text = String::from_utf8_lossy(preview_bytes).replace("\r\n", "\n");
    let line_count = text.lines().count().max(1);
    TextPreviewContent {
        content: text,
        line_count,
        is_truncated,
    }
}

fn build_csv_preview_table(content: &[u8]) -> AppResult<CsvPreviewTable> {
    if content.len() > CSV_PREVIEW_MAX_BYTES {
        return Err(AppError::BadRequest(
            "CSV 文件过大，暂不支持站内表格预览，请下载原文件查看。".to_string(),
        ));
    }

    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_reader(content);
    let header_record = reader
        .headers()
        .map_err(|error| AppError::BadRequest(format!("解析 CSV 表头失败：{error}")))?
        .clone();
    let mut is_truncated = false;
    let mut headers = header_record
        .iter()
        .take(CSV_PREVIEW_MAX_COLUMNS)
        .map(normalize_preview_cell)
        .collect::<Vec<_>>();
    if header_record.len() > CSV_PREVIEW_MAX_COLUMNS {
        headers.push(format!(
            "… 其余 {} 列",
            header_record.len() - CSV_PREVIEW_MAX_COLUMNS
        ));
        is_truncated = true;
    }

    let mut rows = Vec::new();
    for (index, record) in reader.records().enumerate() {
        if index >= CSV_PREVIEW_MAX_ROWS {
            is_truncated = true;
            break;
        }
        let record =
            record.map_err(|error| AppError::BadRequest(format!("解析 CSV 内容失败：{error}")))?;
        let mut row = record
            .iter()
            .take(CSV_PREVIEW_MAX_COLUMNS)
            .map(normalize_preview_cell)
            .collect::<Vec<_>>();
        if record.len() > CSV_PREVIEW_MAX_COLUMNS {
            row.push(format!(
                "… 其余 {} 列",
                record.len() - CSV_PREVIEW_MAX_COLUMNS
            ));
            is_truncated = true;
        }
        rows.push(row);
    }

    Ok(CsvPreviewTable {
        headers,
        rows,
        is_truncated,
    })
}

fn normalize_preview_cell(value: &str) -> String {
    let normalized = value.replace("\r\n", "\n").replace('\r', "\n");
    let collapsed = normalized
        .chars()
        .filter(|character| *character == '\n' || *character == '\t' || !character.is_control())
        .collect::<String>();
    let mut output = String::new();
    for (index, character) in collapsed.chars().enumerate() {
        if index >= 240 {
            output.push('…');
            return output;
        }
        output.push(character);
    }
    output
}

async fn attachment_document_preview_content_response(
    state: &AppState,
    pool: &SqlitePool,
    attachment: files::FileAttachmentSummary,
) -> AppResult<Response> {
    if attachment.status == "deleted" {
        return Err(AppError::NotFound("附件已归档，不能预览".to_string()));
    }
    if attachment.status != "uploaded" {
        return Err(AppError::BadRequest(
            "附件尚未上传完成，请稍后再试".to_string(),
        ));
    }
    let Some(strategy) =
        attachment_preview_strategy(&attachment.original_filename, &attachment.content_type)
    else {
        return Err(AppError::BadRequest(
            "当前文件类型暂不支持文档预览".to_string(),
        ));
    };

    let (content_type, content) = match strategy {
        AttachmentPreviewStrategy::Pdf => {
            let (content_type, content) =
                storage::read_object(pool, &state.settings, &attachment.object_key).await?;
            (content_type, content)
        }
        AttachmentPreviewStrategy::OfficePdf => {
            let cache_path = ensure_office_preview_cached_pdf(state, pool, &attachment).await?;
            let content = fs::read(&cache_path)
                .map_err(|error| AppError::BadRequest(format!("读取离线预览缓存失败：{error}")))?;
            ("application/pdf".to_string(), content)
        }
        AttachmentPreviewStrategy::Text | AttachmentPreviewStrategy::Csv => {
            return Err(AppError::NotFound("该预览不提供二进制内容入口".to_string()));
        }
    };

    let mut response = content.into_response();
    let headers = response.headers_mut();
    headers.insert(header::CONTENT_TYPE, content_type.parse()?);
    headers.insert(header::X_CONTENT_TYPE_OPTIONS, "nosniff".parse()?);
    headers.insert(header::CONTENT_DISPOSITION, "inline".parse()?);
    Ok(response)
}

async fn ensure_office_preview_cached_pdf(
    state: &AppState,
    pool: &SqlitePool,
    attachment: &files::FileAttachmentSummary,
) -> AppResult<PathBuf> {
    let cache_path = office_preview_cache_path(&state.settings, attachment);
    if cache_path.is_file() {
        return Ok(cache_path);
    }

    let (_, content) = storage::read_object(pool, &state.settings, &attachment.object_key).await?;
    let original_filename = attachment.original_filename.clone();
    let cache_path_clone = cache_path.clone();
    tokio::task::spawn_blocking(move || {
        convert_office_content_to_pdf(&cache_path_clone, &original_filename, &content)
    })
    .await
    .map_err(|error| AppError::BadRequest(format!("等待离线预览转换任务失败：{error}")))??;
    Ok(cache_path)
}

fn office_preview_cache_path(
    settings: &crate::platform::config::Settings,
    attachment: &files::FileAttachmentSummary,
) -> PathBuf {
    let mut hasher = sha2::Sha256::new();
    sha2::Digest::update(&mut hasher, attachment.object_key.as_bytes());
    sha2::Digest::update(&mut hasher, attachment.original_filename.as_bytes());
    sha2::Digest::update(&mut hasher, attachment.content_type.as_bytes());
    sha2::Digest::update(&mut hasher, attachment.byte_size.to_string().as_bytes());
    let digest = hex::encode(sha2::Digest::finalize(hasher));
    preview_cache_root(settings).join(format!("{digest}.pdf"))
}

fn preview_cache_root(settings: &crate::platform::config::Settings) -> PathBuf {
    FsPath::new(&settings.data_dir).join("preview-cache")
}

fn convert_office_content_to_pdf(
    cache_path: &FsPath,
    original_filename: &str,
    content: &[u8],
) -> AppResult<()> {
    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| AppError::BadRequest(format!("创建预览缓存目录失败：{error}")))?;
    }

    let temp_root = cache_path
        .parent()
        .unwrap_or_else(|| FsPath::new("."))
        .join(format!("tmp-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&temp_root)
        .map_err(|error| AppError::BadRequest(format!("创建临时转换目录失败：{error}")))?;

    let input_name = sanitized_preview_source_filename(original_filename);
    let input_path = temp_root.join(&input_name);
    fs::write(&input_path, content)
        .map_err(|error| AppError::BadRequest(format!("写入临时预览文件失败：{error}")))?;

    let mut command_errors = Vec::new();
    let mut converted_pdf_path = None;
    for binary in ["libreoffice", "soffice"] {
        match Command::new(binary)
            .arg("--headless")
            .arg("--convert-to")
            .arg("pdf")
            .arg("--outdir")
            .arg(&temp_root)
            .arg(&input_path)
            .output()
        {
            Ok(output) if output.status.success() => {
                let output_path = temp_root.join(output_pdf_filename(&input_name));
                if output_path.is_file() {
                    converted_pdf_path = Some(output_path);
                    break;
                }
                command_errors.push(format!(
                    "{binary} 转换命令已成功执行，但未找到导出的 PDF 文件"
                ));
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let detail = if !stderr.is_empty() {
                    stderr
                } else if !stdout.is_empty() {
                    stdout
                } else {
                    format!("退出码 {}", output.status)
                };
                command_errors.push(format!("{binary}: {detail}"));
            }
            Err(error) => {
                command_errors.push(format!("{binary}: {error}"));
            }
        }
    }

    let Some(output_path) = converted_pdf_path else {
        let _ = fs::remove_dir_all(&temp_root);
        return Err(AppError::BadRequest(format!(
            "离线文档预览转换失败：服务器未安装 LibreOffice / soffice，或当前文件无法转换为 PDF。{}",
            command_errors.join("；")
        )));
    };

    fs::copy(&output_path, cache_path)
        .map_err(|error| AppError::BadRequest(format!("写入预览缓存失败：{error}")))?;
    let _ = fs::remove_dir_all(&temp_root);
    Ok(())
}

fn sanitized_preview_source_filename(original_filename: &str) -> String {
    let filename = original_filename.trim();
    if filename.is_empty() {
        return "document".to_string();
    }
    let sanitized = filename
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();
    if sanitized.trim_matches('_').is_empty() {
        "document".to_string()
    } else {
        sanitized
    }
}

fn output_pdf_filename(input_name: &str) -> String {
    let path = FsPath::new(input_name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("document");
    format!("{stem}.pdf")
}

fn document_preview_navigation<F>(
    attachments: Vec<files::FileAttachmentSummary>,
    current_attachment_id: i64,
    url_for_attachment: F,
) -> DocumentPreviewNavigation
where
    F: Fn(i64) -> String,
{
    let previewable = attachments
        .into_iter()
        .filter(|attachment| {
            attachment.status == "uploaded"
                && is_previewable_document_attachment(
                    &attachment.original_filename,
                    &attachment.content_type,
                )
        })
        .collect::<Vec<_>>();
    let total = previewable.len();
    let Some(current_index) = previewable
        .iter()
        .position(|attachment| attachment.id == current_attachment_id)
    else {
        return DocumentPreviewNavigation::default();
    };

    let previous = if current_index > 0 {
        previewable
            .get(current_index - 1)
            .map(|attachment| DocumentPreviewNavigationLink {
                title: attachment.original_filename.clone(),
                url: url_for_attachment(attachment.id),
            })
    } else {
        None
    };
    let next = previewable
        .get(current_index + 1)
        .map(|attachment| DocumentPreviewNavigationLink {
            title: attachment.original_filename.clone(),
            url: url_for_attachment(attachment.id),
        });

    DocumentPreviewNavigation {
        position_text: format!("第 {} / {} 份可预览附件", current_index + 1, total),
        previous,
        next,
    }
}

fn audit_log_row_from_summary(log: audit::AuditLogSummary) -> AuditLogRow {
    let actor = if log.actor_username.trim().is_empty() {
        log.actor_display_name
    } else {
        format!("{} @{}", log.actor_display_name, log.actor_username)
    };
    let target = if log.target_type.trim().is_empty() && log.target_id.trim().is_empty() {
        "系统".to_string()
    } else if log.target_id.trim().is_empty() {
        log.target_type
    } else {
        format!("{} / {}", log.target_type, log.target_id)
    };

    AuditLogRow {
        actor,
        action: audit_action_label(&log.action).to_string(),
        target,
        metadata: log.metadata,
        ip: fallback_text(log.ip, "-"),
        user_agent: fallback_text(log.user_agent, "-"),
        created_at: display_timestamp(log.created_at),
    }
}

fn user_profile_from_summary(user: users::UserSummary) -> UserProfileView {
    let (status, status_tone) = user_status_label(&user.status);
    UserProfileView {
        username: user.username,
        display_name: user.display_name,
        email: user.email.clone(),
        mobile: user.mobile.clone(),
        roles: fallback_text(user.role_names, "未分配"),
        status: status.to_string(),
        status_tone,
        created_at: display_timestamp(user.created_at),
        updated_at: display_timestamp(user.updated_at),
        is_super_admin: user.is_super_admin,
    }
}

fn api_token_view(token: api_tokens::ApiTokenSummary) -> ApiTokenView {
    let is_revoked = !token.revoked_at.trim().is_empty();
    let is_expired = !token.expires_at.trim().is_empty() && token.expires_at < chrono_now_text();
    let (status, status_tone) = if is_revoked {
        ("已撤销", "danger")
    } else if is_expired {
        ("已过期", "warning")
    } else {
        ("可用", "success")
    };

    ApiTokenView {
        id: token.id,
        name: token.name,
        scopes_label: token
            .scopes
            .iter()
            .map(|scope| api_token_scope_label(scope))
            .collect::<Vec<_>>()
            .join("、"),
        project_scope: if token.project_scope == "all" {
            "全部项目（含后续新增）".to_string()
        } else {
            token
                .project_scope
                .split(',')
                .map(str::trim)
                .filter(|project| !project.is_empty())
                .collect::<Vec<_>>()
                .join("、")
        },
        token_suffix: token.token_suffix,
        expires_at: display_optional_timestamp(token.expires_at, "永不过期"),
        last_used_at: display_optional_timestamp(token.last_used_at, "尚未使用"),
        created_at: display_timestamp(token.created_at),
        status,
        status_tone,
        is_revoked,
    }
}

fn api_token_scope_label(scope: &str) -> &'static str {
    match scope {
        api_tokens::SCOPE_PROJECT_READ => "项目读取",
        api_tokens::SCOPE_WORK_ITEM_READ => "工作项读取",
        api_tokens::SCOPE_WORK_ITEM_WRITE => "工作项写入",
        api_tokens::SCOPE_COMMENT_WRITE => "评论写入",
        api_tokens::SCOPE_RESOURCE_READ => "资料读取",
        api_tokens::SCOPE_RESOURCE_WRITE => "资料写入",
        api_tokens::SCOPE_RESOURCE_UNLOCK => "资料解锁",
        api_tokens::SCOPE_NOTIFICATION_READ => "消息读取",
        _ => "未知权限",
    }
}

fn my_summary(projects: &[ProjectRow], assigned_items: &[WorkItem]) -> MySummary {
    MySummary {
        project_count: projects.len(),
        assigned_count: assigned_items.len(),
        high_priority_count: assigned_items
            .iter()
            .filter(|item| {
                is_active_work_item_status(&item.status_code)
                    && is_high_priority_code(&item.priority_code)
            })
            .count(),
    }
}

fn search_result_from_hit(hit: projects::SearchHit) -> SearchResult {
    SearchResult {
        kind_code: search_hit_type_code(&hit.hit_type).to_string(),
        kind: search_hit_type_label(&hit.hit_type).to_string(),
        key: hit.key,
        title: hit.title,
        context: fallback_text(hit.context, "无描述"),
        url: hit.url,
        updated_at: display_timestamp(hit.updated_at),
    }
}

fn empty_storage_config_view() -> StorageConfigView {
    StorageConfigView {
        has_config: false,
        provider: "阿里云 OSS".to_string(),
        endpoint: storage::DEFAULT_ALIYUN_OSS_ENDPOINT.to_string(),
        region: storage::DEFAULT_ALIYUN_OSS_REGION.to_string(),
        bucket: storage::DEFAULT_ALIYUN_OSS_BUCKET.to_string(),
        access_key_id_hint: String::new(),
        status: "未配置".to_string(),
        status_tone: "warning",
        version: 0,
        updated_at: String::new(),
    }
}

async fn ensure_project_access(
    pool: &SqlitePool,
    context: &WebContext<'_>,
    project_id: i64,
) -> AppResult<()> {
    if context.can_access_all_projects
        || projects::is_project_member(pool, project_id, context.user_id).await?
    {
        return Ok(());
    }

    Err(AppError::Forbidden("无权访问该项目".to_string()))
}

async fn ensure_project_member_manage_access(
    pool: &SqlitePool,
    context: &WebContext<'_>,
    project_id: i64,
) -> AppResult<()> {
    if user_can_manage_project_members_for_context(pool, context, project_id).await? {
        return Ok(());
    }

    Err(AppError::Forbidden(
        "只有项目负责人或项目管理员可以管理项目成员".to_string(),
    ))
}

async fn ensure_project_content_write_access(
    pool: &SqlitePool,
    context: &WebContext<'_>,
    project_id: i64,
) -> AppResult<()> {
    if user_can_write_project_content_for_context(pool, context, project_id).await? {
        return Ok(());
    }

    Err(AppError::Forbidden(
        "只读项目成员不能执行写入操作".to_string(),
    ))
}

async fn ensure_project_key_access(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
    project_key: &str,
) -> AppResult<()> {
    if is_super_admin || rbac::user_has_all_data_scope(pool, user_id).await? {
        return Ok(());
    }

    let Some(project) = projects::get_project_detail(pool, project_key).await? else {
        return Err(AppError::BadRequest("工作项所属项目不存在".to_string()));
    };
    if projects::is_project_member(pool, project.id, user_id).await? {
        return Ok(());
    }

    Err(AppError::Forbidden("无权访问该项目".to_string()))
}

async fn user_can_manage_project_members_for_context(
    pool: &SqlitePool,
    context: &WebContext<'_>,
    project_id: i64,
) -> AppResult<bool> {
    user_can_manage_project_members_for_user(
        pool,
        context.user_id,
        context.is_super_admin,
        context.can_access_all_projects,
        project_id,
    )
    .await
}

async fn user_can_manage_project_members_for_user(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
    can_access_all_projects: bool,
    project_id: i64,
) -> AppResult<bool> {
    if can_access_all_projects && rbac::user_has_permission(pool, user_id, "project.manage").await?
    {
        return Ok(true);
    }

    projects::user_can_manage_project_members(pool, project_id, user_id, is_super_admin).await
}

async fn user_can_write_project_content_for_context(
    pool: &SqlitePool,
    context: &WebContext<'_>,
    project_id: i64,
) -> AppResult<bool> {
    user_can_write_project_content_for_user(
        pool,
        context.user_id,
        context.is_super_admin,
        context.can_access_all_projects,
        project_id,
    )
    .await
}

async fn user_can_write_project_content_for_user(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
    can_access_all_projects: bool,
    project_id: i64,
) -> AppResult<bool> {
    if can_access_all_projects
        && rbac::user_has_permission(pool, user_id, "work_item.manage").await?
    {
        return Ok(true);
    }

    projects::user_can_write_project_content(pool, project_id, user_id, is_super_admin).await
}

fn ensure_work_item_accepts_writes(item: &WorkItemDetailView) -> AppResult<()> {
    if item.is_deleted {
        return Err(AppError::BadRequest(
            "历史工作项不能执行写入操作".to_string(),
        ));
    }

    Ok(())
}

fn ensure_comment_accepts_attachments(comment: &projects::WorkItemCommentSummary) -> AppResult<()> {
    if comment.is_flow {
        return Err(AppError::Forbidden("流程记录不能添加附件".to_string()));
    }

    Ok(())
}

async fn load_work_item_detail(
    pool: &SqlitePool,
    item_key: &str,
) -> AppResult<Option<(WorkItemDetailView, Vec<WorkItemComment>)>> {
    let Some(item) = projects::get_work_item_detail(pool, item_key).await? else {
        return Ok(None);
    };
    let mut item = work_item_detail_from_domain(item);
    let mut comments = Vec::new();
    for comment in projects::list_work_item_comments(pool, item.id).await? {
        let attachments = files::list_attachments(pool, "comment", comment.id).await?;
        comments.push(comment_with_attachments(
            comment_from_summary(comment),
            attachments,
        ));
    }
    promote_primary_post_to_description(&mut item, &mut comments);

    Ok(Some((item, comments)))
}

async fn load_work_item_detail_for_user(
    pool: &SqlitePool,
    item_key: &str,
    user_id: i64,
    can_access_all_projects: bool,
) -> AppResult<Option<(WorkItemDetailView, Vec<WorkItemComment>)>> {
    let Some(item) = projects::get_work_item_detail(pool, item_key).await? else {
        return Ok(None);
    };
    let mut item = work_item_detail_from_domain(item);
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    let mut comments = Vec::new();
    for comment in projects::list_work_item_comments(pool, item.id).await? {
        let can_manage = if can_access_all_projects
            && rbac::user_has_permission(pool, user_id, "work_item.manage").await?
        {
            true
        } else {
            projects::user_can_manage_work_item_comment(
                pool,
                project.id,
                comment.author_user_id,
                user_id,
                false,
            )
            .await?
        };
        let attachments = files::list_attachments(pool, "comment", comment.id).await?;
        comments.push(comment_with_attachments(
            comment_from_summary_with_permission(comment, can_manage),
            attachments,
        ));
    }
    promote_primary_post_to_description(&mut item, &mut comments);

    Ok(Some((item, comments)))
}

async fn load_work_item_flow_history(
    pool: &SqlitePool,
    item: &WorkItemDetailView,
    pagination: projects::Pagination,
) -> AppResult<(
    Vec<WorkItemFlowRecord>,
    PaginationView,
    Vec<PaginationPageView>,
)> {
    let page = projects::list_work_item_flow_comments_paginated(pool, item.id, pagination).await?;
    let total_pages = page.total_pages();
    let pagination_view = work_item_flow_history_pagination_view(
        &item.key,
        page.page,
        page.per_page,
        page.total_items,
        total_pages,
    );
    let pagination_pages =
        work_item_flow_history_pagination_pages(&item.key, page.page, page.per_page, total_pages);
    Ok((
        page.items
            .into_iter()
            .map(flow_record_from_summary)
            .collect(),
        pagination_view,
        pagination_pages,
    ))
}

fn promote_primary_post_to_description(
    item: &mut WorkItemDetailView,
    comments: &mut Vec<WorkItemComment>,
) {
    let Some(index) = comments.iter().position(|comment| {
        !comment.is_flow
            && comment.parent_comment_id.is_none()
            && comment.body_format == "html"
            && comment.author_username == item.reporter_username
    }) else {
        return;
    };

    if !work_item_description_matches_comment_summary(&item.description, &comments[index]) {
        return;
    }

    let comment = comments.remove(index);
    item.description_html = comment.body_html;
}

fn discussion_comment_count(comments: &[WorkItemComment]) -> usize {
    comments.iter().filter(|comment| !comment.is_flow).count()
}

fn sample_work_item_flow_history(
    item: &WorkItemDetailView,
    pagination: projects::Pagination,
) -> (
    Vec<WorkItemFlowRecord>,
    PaginationView,
    Vec<PaginationPageView>,
) {
    let all_records = sample_work_item_flow_records();
    let total_items = all_records.len() as i64;
    let records = paginate_items(all_records, pagination);
    let total_pages = total_pages(total_items, pagination.per_page);
    let pagination_view = work_item_flow_history_pagination_view(
        &item.key,
        pagination.page,
        pagination.per_page,
        total_items,
        total_pages,
    );
    let pagination_pages = work_item_flow_history_pagination_pages(
        &item.key,
        pagination.page,
        pagination.per_page,
        total_pages,
    );
    (records, pagination_view, pagination_pages)
}

fn work_item_description_matches_comment_summary(
    description: &str,
    comment: &WorkItemComment,
) -> bool {
    let description = normalized_plain_summary(description);
    if description.is_empty() {
        return false;
    }
    if description == normalized_plain_summary("见首条图文说明") {
        return true;
    }

    let comment_plain = projects::work_item_comment_plain_text(&comment.body, &comment.body_format);
    normalized_plain_summary(&comment_plain) == description
}

fn normalized_plain_summary(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

async fn load_project_member_options(
    pool: &SqlitePool,
    project_key: &str,
) -> AppResult<Vec<ProjectMemberView>> {
    let Some(project) = projects::get_project_detail(pool, project_key).await? else {
        return Ok(Vec::new());
    };

    Ok(projects::list_project_members(pool, project.id)
        .await?
        .into_iter()
        .map(project_member_from_summary)
        .collect())
}

async fn load_comment_attachment_context(
    pool: &SqlitePool,
    item_key: &str,
    comment_id: i64,
) -> AppResult<(
    WorkItemDetailView,
    projects::ProjectDetail,
    projects::WorkItemCommentSummary,
)> {
    let item = projects::get_work_item_detail(pool, item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    let comment = projects::get_work_item_comment(pool, item.id, comment_id).await?;

    Ok((work_item_detail_from_domain(item), project, comment))
}

fn project_list_summary(projects: &[ProjectRow]) -> ProjectListSummary {
    ProjectListSummary {
        total_projects: projects.len(),
        active_projects: projects
            .iter()
            .filter(|project| matches!(project.status.as_str(), "待启动" | "进行中" | "验收中"))
            .count(),
        pending_in_progress_confirmation_count: projects
            .iter()
            .map(|project| project.pending_in_progress_confirmation_count)
            .sum(),
    }
}

fn normalize_project_status_filter(status: &str) -> AppResult<String> {
    match status.trim() {
        "" | "all" => Ok(String::new()),
        "not_started" => Ok("not_started".to_string()),
        "in_progress" => Ok("in_progress".to_string()),
        "acceptance" => Ok("acceptance".to_string()),
        "completed" => Ok("completed".to_string()),
        "on_hold" => Ok("on_hold".to_string()),
        "cancelled" => Ok("cancelled".to_string()),
        "archived" => Ok("archived".to_string()),
        _ => Err(AppError::BadRequest(
            "项目状态筛选只能是 not_started / in_progress / acceptance / completed / on_hold / cancelled / archived".to_string(),
        )),
    }
}

fn project_matches_status_filter(project: &ProjectRow, status_filter: &str) -> bool {
    status_filter.is_empty() || project.status_code == status_filter
}

fn paginate_project_views(
    projects: Vec<ProjectRow>,
    pagination: projects::Pagination,
) -> Vec<ProjectRow> {
    paginate_items(projects, pagination)
}

fn work_item_list_summary_from_stats(stats: projects::WorkItemListStats) -> WorkItemListSummary {
    WorkItemListSummary {
        total_items: stats.total_items,
        pending_in_progress_confirmation_count: stats.active_items,
        high_priority_items: stats.high_priority_items,
    }
}

fn work_item_list_summary_from_items(items: &[WorkItem], total_items: i64) -> WorkItemListSummary {
    WorkItemListSummary {
        total_items,
        pending_in_progress_confirmation_count: items
            .iter()
            .filter(|item| is_active_work_item_status(&item.status_code))
            .count() as i64,
        high_priority_items: items
            .iter()
            .filter(|item| is_high_priority_code(&item.priority_code))
            .count() as i64,
    }
}

fn normalize_web_pagination(
    page: Option<i64>,
    per_page: Option<i64>,
) -> AppResult<projects::Pagination> {
    let page = page.unwrap_or(1);
    let per_page = per_page.unwrap_or(10);
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

fn paginate_work_item_views(
    items: Vec<WorkItem>,
    pagination: projects::Pagination,
) -> Vec<WorkItem> {
    paginate_items(items, pagination)
}

fn paginate_search_results(
    items: Vec<SearchResult>,
    pagination: projects::Pagination,
) -> Vec<SearchResult> {
    paginate_items(items, pagination)
}

fn paginate_items<T>(items: Vec<T>, pagination: projects::Pagination) -> Vec<T> {
    let offset = usize::try_from(pagination.offset().max(0)).unwrap_or(usize::MAX);
    let limit = usize::try_from(pagination.per_page.max(0)).unwrap_or(usize::MAX);
    items.into_iter().skip(offset).take(limit).collect()
}

fn total_pages(total_items: i64, per_page: i64) -> i64 {
    if total_items == 0 {
        1
    } else {
        (total_items + per_page - 1) / per_page
    }
}

fn project_pagination_view(
    status_filter: &str,
    page: i64,
    per_page: i64,
    total_items: i64,
    total_pages: i64,
) -> PaginationView {
    let has_previous = page > 1;
    let has_next = page < total_pages;
    let range_start = if total_items == 0 {
        0
    } else {
        (page - 1) * per_page + 1
    };
    let range_end = (page * per_page).min(total_items);

    PaginationView {
        page,
        per_page,
        total_items,
        total_pages,
        has_previous,
        has_next,
        previous_url: project_page_url(status_filter, page - 1, per_page),
        next_url: project_page_url(status_filter, page + 1, per_page),
        range_start,
        range_end,
    }
}

fn project_page_url(status_filter: &str, page: i64, per_page: i64) -> String {
    let mut params = Vec::new();
    push_query_param(&mut params, "status", status_filter);
    if page > 1 {
        params.push(format!("page={page}"));
    }
    if per_page != 10 {
        params.push(format!("per_page={per_page}"));
    }

    if params.is_empty() {
        "/web/projects".to_string()
    } else {
        format!("/web/projects?{}", params.join("&"))
    }
}

fn project_pagination_pages(
    status_filter: &str,
    current_page: i64,
    per_page: i64,
    total_pages: i64,
) -> Vec<PaginationPageView> {
    let window_size = 7;
    let half_window = window_size / 2;
    let mut start = (current_page - half_window).max(1);
    let end = (start + window_size - 1).min(total_pages);
    start = (end - window_size + 1).max(1);

    (start..=end)
        .map(|page| PaginationPageView {
            page,
            url: project_page_url(status_filter, page, per_page),
            current: page == current_page,
        })
        .collect()
}

fn system_users_pagination_view(
    page: i64,
    per_page: i64,
    total_items: i64,
    total_pages: i64,
) -> PaginationView {
    let has_previous = page > 1;
    let has_next = page < total_pages;
    let range_start = if total_items == 0 {
        0
    } else {
        (page - 1) * per_page + 1
    };
    let range_end = (page * per_page).min(total_items);

    PaginationView {
        page,
        per_page,
        total_items,
        total_pages,
        has_previous,
        has_next,
        previous_url: system_users_page_url(page - 1, per_page),
        next_url: system_users_page_url(page + 1, per_page),
        range_start,
        range_end,
    }
}

fn system_users_page_url(page: i64, per_page: i64) -> String {
    let mut params = Vec::new();
    if page > 1 {
        params.push(format!("page={page}"));
    }
    if per_page != 10 {
        params.push(format!("per_page={per_page}"));
    }

    if params.is_empty() {
        "/web/system/users".to_string()
    } else {
        format!("/web/system/users?{}", params.join("&"))
    }
}

fn system_users_redirect_url(page: Option<i64>, per_page: Option<i64>) -> AppResult<String> {
    let pagination = normalize_web_pagination(page, per_page)?;
    Ok(system_users_page_url(pagination.page, pagination.per_page))
}

fn system_users_pagination_pages(
    current_page: i64,
    per_page: i64,
    total_pages: i64,
) -> Vec<PaginationPageView> {
    let window_size = 7;
    let half_window = window_size / 2;
    let mut start = (current_page - half_window).max(1);
    let end = (start + window_size - 1).min(total_pages);
    start = (end - window_size + 1).max(1);

    (start..=end)
        .map(|page| PaginationPageView {
            page,
            url: system_users_page_url(page, per_page),
            current: page == current_page,
        })
        .collect()
}

fn storage_versions_pagination_view(
    page: i64,
    per_page: i64,
    total_items: i64,
    total_pages: i64,
) -> PaginationView {
    let has_previous = page > 1;
    let has_next = page < total_pages;
    let range_start = if total_items == 0 {
        0
    } else {
        (page - 1) * per_page + 1
    };
    let range_end = (page * per_page).min(total_items);

    PaginationView {
        page,
        per_page,
        total_items,
        total_pages,
        has_previous,
        has_next,
        previous_url: storage_versions_page_url(page - 1, per_page),
        next_url: storage_versions_page_url(page + 1, per_page),
        range_start,
        range_end,
    }
}

fn storage_versions_page_url(page: i64, per_page: i64) -> String {
    let mut params = Vec::new();
    if page > 1 {
        params.push(format!("page={page}"));
    }
    if per_page != 10 {
        params.push(format!("per_page={per_page}"));
    }

    if params.is_empty() {
        "/web/system/storage".to_string()
    } else {
        format!("/web/system/storage?{}", params.join("&"))
    }
}

fn storage_versions_pagination_pages(
    current_page: i64,
    per_page: i64,
    total_pages: i64,
) -> Vec<PaginationPageView> {
    let window_size = 7;
    let half_window = window_size / 2;
    let mut start = (current_page - half_window).max(1);
    let end = (start + window_size - 1).min(total_pages);
    start = (end - window_size + 1).max(1);

    (start..=end)
        .map(|page| PaginationPageView {
            page,
            url: storage_versions_page_url(page, per_page),
            current: page == current_page,
        })
        .collect()
}

fn role_workbench_pagination_view(
    selected_role_code: &str,
    page: i64,
    per_page: i64,
    total_items: i64,
    total_pages: i64,
) -> PaginationView {
    let has_previous = page > 1;
    let has_next = page < total_pages;
    let range_start = if total_items == 0 {
        0
    } else {
        (page - 1) * per_page + 1
    };
    let range_end = (page * per_page).min(total_items);

    PaginationView {
        page,
        per_page,
        total_items,
        total_pages,
        has_previous,
        has_next,
        previous_url: role_workbench_page_url(selected_role_code, page - 1, per_page),
        next_url: role_workbench_page_url(selected_role_code, page + 1, per_page),
        range_start,
        range_end,
    }
}

fn role_workbench_page_url(selected_role_code: &str, page: i64, per_page: i64) -> String {
    let mut params = Vec::new();
    let selected_role_code = selected_role_code.trim();
    if !selected_role_code.is_empty() {
        params.push(format!("role={selected_role_code}"));
    }
    if page > 1 {
        params.push(format!("page={page}"));
    }
    if per_page != 10 {
        params.push(format!("per_page={per_page}"));
    }

    if params.is_empty() {
        "/web/system/roles".to_string()
    } else {
        format!("/web/system/roles?{}", params.join("&"))
    }
}

fn role_workbench_redirect_url(
    selected_role_code: &str,
    page: Option<i64>,
    per_page: Option<i64>,
) -> AppResult<String> {
    let pagination = normalize_web_pagination(page, per_page)?;
    Ok(role_workbench_page_url(
        selected_role_code,
        pagination.page,
        pagination.per_page,
    ))
}

fn role_workbench_pagination_pages(
    selected_role_code: &str,
    current_page: i64,
    per_page: i64,
    total_pages: i64,
) -> Vec<PaginationPageView> {
    let window_size = 7;
    let half_window = window_size / 2;
    let mut start = (current_page - half_window).max(1);
    let end = (start + window_size - 1).min(total_pages);
    start = (end - window_size + 1).max(1);

    (start..=end)
        .map(|page| PaginationPageView {
            page,
            url: role_workbench_page_url(selected_role_code, page, per_page),
            current: page == current_page,
        })
        .collect()
}

fn search_pagination_view(
    query: &str,
    page: i64,
    per_page: i64,
    total_items: i64,
    total_pages: i64,
) -> PaginationView {
    let has_previous = page > 1;
    let has_next = page < total_pages;
    let range_start = if total_items == 0 {
        0
    } else {
        (page - 1) * per_page + 1
    };
    let range_end = (page * per_page).min(total_items);

    PaginationView {
        page,
        per_page,
        total_items,
        total_pages,
        has_previous,
        has_next,
        previous_url: search_page_url(query, page - 1, per_page),
        next_url: search_page_url(query, page + 1, per_page),
        range_start,
        range_end,
    }
}

fn search_page_url(query: &str, page: i64, per_page: i64) -> String {
    let mut params = Vec::new();
    push_query_param(&mut params, "q", query);
    if page > 1 {
        params.push(format!("page={page}"));
    }
    if per_page != 10 {
        params.push(format!("per_page={per_page}"));
    }

    if params.is_empty() {
        "/web/search".to_string()
    } else {
        format!("/web/search?{}", params.join("&"))
    }
}

fn search_pagination_pages(
    query: &str,
    current_page: i64,
    per_page: i64,
    total_pages: i64,
) -> Vec<PaginationPageView> {
    let window_size = 7;
    let half_window = window_size / 2;
    let mut start = (current_page - half_window).max(1);
    let end = (start + window_size - 1).min(total_pages);
    start = (end - window_size + 1).max(1);

    (start..=end)
        .map(|page| PaginationPageView {
            page,
            url: search_page_url(query, page, per_page),
            current: page == current_page,
        })
        .collect()
}

fn message_pagination_view(
    filter: MessageFilter,
    page: i64,
    per_page: i64,
    total_items: i64,
    total_pages: i64,
) -> PaginationView {
    let has_previous = page > 1;
    let has_next = page < total_pages;
    let range_start = if total_items == 0 {
        0
    } else {
        (page - 1) * per_page + 1
    };
    let range_end = (page * per_page).min(total_items);

    PaginationView {
        page,
        per_page,
        total_items,
        total_pages,
        has_previous,
        has_next,
        previous_url: message_page_url(filter, page - 1, per_page),
        next_url: message_page_url(filter, page + 1, per_page),
        range_start,
        range_end,
    }
}

fn message_page_url(filter: MessageFilter, page: i64, per_page: i64) -> String {
    let mut params = Vec::new();
    match filter {
        MessageFilter::All => {}
        MessageFilter::Unread => params.push("filter=unread".to_string()),
        MessageFilter::Read => params.push("filter=read".to_string()),
    }
    if page > 1 {
        params.push(format!("page={page}"));
    }
    if per_page != 10 {
        params.push(format!("per_page={per_page}"));
    }

    if params.is_empty() {
        "/web/messages".to_string()
    } else {
        format!("/web/messages?{}", params.join("&"))
    }
}

fn message_pagination_pages(
    filter: MessageFilter,
    current_page: i64,
    per_page: i64,
    total_pages: i64,
) -> Vec<PaginationPageView> {
    let window_size = 7;
    let half_window = window_size / 2;
    let mut start = (current_page - half_window).max(1);
    let end = (start + window_size - 1).min(total_pages);
    start = (end - window_size + 1).max(1);

    (start..=end)
        .map(|page| PaginationPageView {
            page,
            url: message_page_url(filter, page, per_page),
            current: page == current_page,
        })
        .collect()
}

fn audit_pagination_view(
    filters: &AuditLogFilterView,
    page: i64,
    per_page: i64,
    total_items: i64,
    total_pages: i64,
) -> PaginationView {
    let has_previous = page > 1;
    let has_next = page < total_pages;
    let range_start = if total_items == 0 {
        0
    } else {
        (page - 1) * per_page + 1
    };
    let range_end = (page * per_page).min(total_items);

    PaginationView {
        page,
        per_page,
        total_items,
        total_pages,
        has_previous,
        has_next,
        previous_url: audit_page_url(filters, page - 1, per_page),
        next_url: audit_page_url(filters, page + 1, per_page),
        range_start,
        range_end,
    }
}

fn audit_page_url(filters: &AuditLogFilterView, page: i64, per_page: i64) -> String {
    let mut params = Vec::new();
    push_query_param(&mut params, "actor", &filters.actor);
    push_query_param(&mut params, "action", &filters.action);
    push_query_param(&mut params, "target_type", &filters.target_type);
    push_query_param(&mut params, "target_id", &filters.target_id);
    if page > 1 {
        params.push(format!("page={page}"));
    }
    if per_page != 10 {
        params.push(format!("per_page={per_page}"));
    }

    if params.is_empty() {
        "/web/system/audit".to_string()
    } else {
        format!("/web/system/audit?{}", params.join("&"))
    }
}

fn audit_pagination_pages(
    filters: &AuditLogFilterView,
    current_page: i64,
    per_page: i64,
    total_pages: i64,
) -> Vec<PaginationPageView> {
    let window_size = 7;
    let half_window = window_size / 2;
    let mut start = (current_page - half_window).max(1);
    let end = (start + window_size - 1).min(total_pages);
    start = (end - window_size + 1).max(1);

    (start..=end)
        .map(|page| PaginationPageView {
            page,
            url: audit_page_url(filters, page, per_page),
            current: page == current_page,
        })
        .collect()
}

fn work_item_pagination_view(
    active: &str,
    filters: &WorkItemListFilterView,
    page: i64,
    per_page: i64,
    total_items: i64,
    total_pages: i64,
) -> PaginationView {
    let has_previous = page > 1;
    let has_next = page < total_pages;
    let range_start = if total_items == 0 {
        0
    } else {
        (page - 1) * per_page + 1
    };
    let range_end = (page * per_page).min(total_items);

    PaginationView {
        page,
        per_page,
        total_items,
        total_pages,
        has_previous,
        has_next,
        previous_url: work_item_page_url(active, filters, page - 1, per_page),
        next_url: work_item_page_url(active, filters, page + 1, per_page),
        range_start,
        range_end,
    }
}

fn work_item_page_url(
    active: &str,
    filters: &WorkItemListFilterView,
    page: i64,
    per_page: i64,
) -> String {
    let mut params = Vec::new();
    push_query_param(&mut params, "q", &filters.q);
    push_query_param(&mut params, "status", &filters.status);
    push_query_param(&mut params, "priority", &filters.priority);
    push_query_param(&mut params, "project_key", &filters.project_key);
    push_query_param(&mut params, "assignee_username", &filters.assignee_username);
    if page > 1 {
        params.push(format!("page={page}"));
    }
    if per_page != 10 {
        params.push(format!("per_page={per_page}"));
    }

    if params.is_empty() {
        format!("/web/{active}")
    } else {
        format!("/web/{active}?{}", params.join("&"))
    }
}

fn work_item_pagination_pages(
    active: &str,
    filters: &WorkItemListFilterView,
    current_page: i64,
    per_page: i64,
    total_pages: i64,
) -> Vec<PaginationPageView> {
    let window_size = 7;
    let half_window = window_size / 2;
    let mut start = (current_page - half_window).max(1);
    let end = (start + window_size - 1).min(total_pages);
    start = (end - window_size + 1).max(1);

    (start..=end)
        .map(|page| PaginationPageView {
            page,
            url: work_item_page_url(active, filters, page, per_page),
            current: page == current_page,
        })
        .collect()
}

fn work_item_flow_history_pagination_view(
    item_key: &str,
    page: i64,
    per_page: i64,
    total_items: i64,
    total_pages: i64,
) -> PaginationView {
    let has_previous = page > 1;
    let has_next = page < total_pages;
    let range_start = if total_items == 0 {
        0
    } else {
        (page - 1) * per_page + 1
    };
    let range_end = (page * per_page).min(total_items);

    PaginationView {
        page,
        per_page,
        total_items,
        total_pages,
        has_previous,
        has_next,
        previous_url: work_item_flow_history_page_url(item_key, page - 1, per_page),
        next_url: work_item_flow_history_page_url(item_key, page + 1, per_page),
        range_start,
        range_end,
    }
}

fn work_item_flow_history_page_url(item_key: &str, page: i64, per_page: i64) -> String {
    let mut params = Vec::new();
    if page > 1 {
        params.push(format!("page={page}"));
    }
    if per_page != 10 {
        params.push(format!("per_page={per_page}"));
    }

    if params.is_empty() {
        format!("/web/work-items/{item_key}/flow-records")
    } else {
        format!(
            "/web/work-items/{item_key}/flow-records?{}",
            params.join("&")
        )
    }
}

fn work_item_flow_history_pagination_pages(
    item_key: &str,
    current_page: i64,
    per_page: i64,
    total_pages: i64,
) -> Vec<PaginationPageView> {
    let window_size = 7;
    let half_window = window_size / 2;
    let mut start = (current_page - half_window).max(1);
    let end = (start + window_size - 1).min(total_pages);
    start = (end - window_size + 1).max(1);

    (start..=end)
        .map(|page| PaginationPageView {
            page,
            url: work_item_flow_history_page_url(item_key, page, per_page),
            current: page == current_page,
        })
        .collect()
}

fn push_query_param(params: &mut Vec<String>, key: &str, value: &str) {
    let value = value.trim();
    if value.is_empty() {
        return;
    }
    params.push(format!("{key}={}", url_query_escape(value)));
}

fn url_query_escape(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            b' ' => encoded.push_str("%20"),
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

fn requested_work_item_type(kind: Option<&str>) -> AppResult<Option<&'static str>> {
    match kind.map(str::trim).filter(|value| !value.is_empty()) {
        None => Ok(None),
        Some("requirement") => Ok(Some("requirement")),
        Some("task") => Ok(Some("task")),
        Some("bug") => Ok(Some("bug")),
        Some(_) => Err(AppError::BadRequest(
            "工作项类型只能是 requirement / task / bug".to_string(),
        )),
    }
}

fn work_item_type_options() -> Vec<WorkItemTypeOption> {
    vec![
        WorkItemTypeOption {
            value: "requirement",
            label: "需求",
        },
        WorkItemTypeOption {
            value: "task",
            label: "任务",
        },
        WorkItemTypeOption {
            value: "bug",
            label: "Bug",
        },
    ]
}

fn work_item_status_options(
    item_kind: &str,
    current_status: &str,
) -> AppResult<Vec<WorkItemStatusOption>> {
    let current_status = projects::normalize_work_item_status(current_status)?;
    // cancelled 只兼容历史数据；页面状态下拉只提供恢复到进行中。
    let selected_status = if current_status == "cancelled" {
        "in_progress"
    } else {
        current_status
    };
    let mut values = if current_status == "cancelled" {
        Vec::new()
    } else {
        vec![current_status]
    };
    for status in projects::allowed_work_item_status_transitions(current_status)? {
        let relevant = match item_kind {
            "Bug" => matches!(
                *status,
                "open"
                    | "in_progress"
                    | "pending_confirmation"
                    | "resolved"
                    | "verified"
                    | "closed"
            ),
            "需求" | "任务" => matches!(
                *status,
                "open" | "in_progress" | "pending_confirmation" | "done" | "closed"
            ),
            _ => true,
        };
        if relevant && !values.contains(status) {
            values.push(status);
        }
    }
    values
        .into_iter()
        .map(|status| {
            let (_, label, _) = work_item_labels("", status);
            Ok(WorkItemStatusOption {
                value: status,
                label,
                selected: status == selected_status,
            })
        })
        .collect()
}

fn is_active_work_item_status(status: &str) -> bool {
    !matches!(
        status,
        "done" | "closed" | "resolved" | "verified" | "cancelled"
    )
}

fn project_status_label(status: &str) -> (&'static str, &'static str) {
    match status {
        "not_started" => ("待启动", "info"),
        "in_progress" => ("进行中", "ok"),
        "acceptance" => ("验收中", "warning"),
        "completed" => ("已完成", "ok"),
        "on_hold" => ("已暂停", "warning"),
        "cancelled" => ("已取消", "danger"),
        "archived" => ("已归档", "info"),
        _ => ("未知", "info"),
    }
}

fn project_member_role_label(role: &str) -> &'static str {
    match role {
        "owner" => "项目负责人",
        "maintainer" => "项目管理员",
        "member" => "项目成员",
        "viewer" => "只读成员",
        _ => "项目成员",
    }
}

fn project_resource_status_label(status: &str) -> (&'static str, &'static str) {
    match status {
        "active" => ("可用", "ok"),
        "archived" => ("已归档", "info"),
        _ => ("未知", "warning"),
    }
}

fn user_status_label(status: &str) -> (&'static str, &'static str) {
    match status {
        "active" => ("启用", "ok"),
        "disabled" => ("禁用", "danger"),
        "locked" => ("锁定", "warning"),
        _ => ("未知", "info"),
    }
}

fn role_status_label(status: &str) -> (&'static str, &'static str) {
    match status {
        "active" => ("启用", "ok"),
        "disabled" => ("禁用", "danger"),
        _ => ("未知", "info"),
    }
}

fn storage_status_label(status: &str) -> (&'static str, &'static str) {
    match status {
        "active" => ("已激活", "ok"),
        "draft" => ("草稿", "info"),
        "disabled" => ("已停用", "danger"),
        _ => ("未知", "warning"),
    }
}

fn storage_provider_label(provider: &str) -> &'static str {
    match provider {
        storage::STORAGE_PROVIDER_ALIYUN_OSS => "阿里云 OSS",
        _ => "对象存储",
    }
}

fn storage_bucket_check_label(status: &str) -> &'static str {
    match status {
        "pass" => "通过",
        "warn" => "注意",
        "fail" => "失败",
        _ => "未知",
    }
}

fn storage_bucket_check_tone(status: &str) -> &'static str {
    match status {
        "pass" => "ok",
        "warn" => "warning",
        "fail" => "danger",
        _ => "info",
    }
}

fn storage_probe_error_message(error: &AppError) -> String {
    match error {
        AppError::BadRequest(_) | AppError::Config(_) | AppError::Crypto(_) => {
            format!("对象存储探测失败：{error}")
        }
        _ => "对象存储探测失败：服务端暂时无法完成探测，请稍后重试。".to_string(),
    }
}

fn storage_initialize_error_message(error: &AppError) -> String {
    match error {
        AppError::BadRequest(message) | AppError::Config(message) => {
            if message.starts_with("对象存储桶初始化失败：") {
                message.clone()
            } else {
                format!("对象存储桶初始化失败：{message}")
            }
        }
        AppError::Crypto(_) => {
            "对象存储桶初始化失败：敏感配置无法解密，请重新保存对象存储配置。".to_string()
        }
        _ => "对象存储桶初始化失败：服务端暂时无法完成初始化，请稍后重试。".to_string(),
    }
}

fn audit_action_label(action: &str) -> &str {
    match action {
        "auth.login" => "用户登录",
        "auth.login.failed" => "登录失败",
        "auth.logout" => "用户退出",
        "bootstrap.init" => "首次初始化",
        "storage.config.save" => "保存对象存储配置",
        "storage.config.probe" => "探测对象存储配置",
        "storage.bucket.initialize" => "初始化对象存储桶",
        "file.download" => "下载附件",
        "file.download.url" => "生成附件下载链接",
        "permission.denied" => "权限拒绝",
        "user.create" => "创建用户",
        "user.status.update" => "更新用户状态",
        "user.password.reset" => "重置用户密码",
        "role.create" => "创建角色",
        "role.status.update" => "更新角色状态",
        "role.permissions.update" => "更新角色权限",
        "api_token.delete" => "删除访问 Token",
        _ => action,
    }
}

fn search_hit_type_label(hit_type: &str) -> &'static str {
    match hit_type {
        "project" => "项目",
        "requirement" => "需求",
        "task" => "任务",
        "bug" => "Bug",
        _ => "结果",
    }
}

fn search_hit_type_code(hit_type: &str) -> &'static str {
    match hit_type {
        "project" => "project",
        "requirement" => "requirement",
        "task" => "task",
        "bug" => "bug",
        _ => "result",
    }
}

fn data_scope_label(data_scope_type: &str) -> &'static str {
    match data_scope_type {
        "all" => "全部数据",
        "self" => "本人数据",
        _ => "自定义",
    }
}

fn work_item_kind_code(item_type: &str) -> &'static str {
    match item_type {
        "requirement" => "requirement",
        "task" => "task",
        "bug" => "bug",
        _ => "work_item",
    }
}

fn work_item_kind_label(item_type: &str) -> &'static str {
    match item_type {
        "requirement" => "需求",
        "task" => "任务",
        "bug" => "Bug",
        _ => "工作项",
    }
}

fn work_item_labels(item_type: &str, status: &str) -> (&'static str, &'static str, &'static str) {
    let kind = work_item_kind_label(item_type);
    let (status, tone) = match status {
        "open" => ("待处理", "warning"),
        "in_progress" => ("进行中", "info"),
        "pending_confirmation" => ("待确认", "warning"),
        "done" => ("已完成", "ok"),
        "verified" => ("已验证", "ok"),
        "resolved" => ("已解决", "ok"),
        "closed" => ("已关闭", "ok"),
        "cancelled" => ("已取消", "danger"),
        _ => ("未分类", "info"),
    };
    (kind, status, tone)
}

fn priority_label(priority: &str) -> &'static str {
    match priority {
        "P0" => "紧急",
        "P1" => "高",
        "P2" => "中",
        "P3" => "低",
        _ => "未设置",
    }
}

fn is_high_priority_code(priority: &str) -> bool {
    matches!(priority, "P0" | "P1")
}

fn attachment_status_label(status: &str) -> (&'static str, &'static str) {
    match status {
        "pending" => ("待上传", "warning"),
        "uploaded" => ("已上传", "ok"),
        "deleted" => ("已归档", "danger"),
        _ => ("未知", "info"),
    }
}

fn is_previewable_image_content_type(content_type: &str) -> bool {
    matches!(
        content_type.trim().to_ascii_lowercase().as_str(),
        "image/avif" | "image/bmp" | "image/gif" | "image/jpeg" | "image/png" | "image/webp"
    )
}

fn is_previewable_video_content_type(content_type: &str) -> bool {
    matches!(
        content_type.trim().to_ascii_lowercase().as_str(),
        "video/mp4" | "video/ogg" | "video/quicktime" | "video/webm"
    )
}

fn is_previewable_document_attachment(filename: &str, content_type: &str) -> bool {
    attachment_preview_strategy(filename, content_type).is_some()
}

fn attachment_preview_strategy(
    filename: &str,
    content_type: &str,
) -> Option<AttachmentPreviewStrategy> {
    let file_type = attachment_preview_file_type(filename, content_type)?;
    match file_type {
        "pdf" => Some(AttachmentPreviewStrategy::Pdf),
        "csv" => Some(AttachmentPreviewStrategy::Csv),
        "txt" | "log" | "md" | "json" | "xml" | "yaml" | "yml" => {
            Some(AttachmentPreviewStrategy::Text)
        }
        "doc" | "docx" | "odt" | "rtf" | "xls" | "xlsx" | "ods" | "ppt" | "pptx" | "odp" => {
            Some(AttachmentPreviewStrategy::OfficePdf)
        }
        _ => None,
    }
}

fn attachment_preview_file_type(filename: &str, content_type: &str) -> Option<&'static str> {
    match normalized_attachment_extension(filename).as_deref() {
        Some("doc") => Some("doc"),
        Some("docx") => Some("docx"),
        Some("odt") => Some("odt"),
        Some("rtf") => Some("rtf"),
        Some("txt") => Some("txt"),
        Some("log") => Some("log"),
        Some("md") => Some("md"),
        Some("json") => Some("json"),
        Some("xml") => Some("xml"),
        Some("yaml") => Some("yaml"),
        Some("yml") => Some("yml"),
        Some("xls") => Some("xls"),
        Some("xlsx") => Some("xlsx"),
        Some("csv") => Some("csv"),
        Some("ods") => Some("ods"),
        Some("ppt") => Some("ppt"),
        Some("pptx") => Some("pptx"),
        Some("odp") => Some("odp"),
        Some("pdf") => Some("pdf"),
        _ => attachment_preview_file_type_from_content_type(content_type),
    }
}

fn normalized_attachment_extension(filename: &str) -> Option<String> {
    let (_, extension) = filename.trim().rsplit_once('.')?;
    let extension = extension.trim().to_ascii_lowercase();
    if extension.is_empty() {
        None
    } else {
        Some(extension)
    }
}

fn attachment_preview_file_type_from_content_type(content_type: &str) -> Option<&'static str> {
    match content_type.trim().to_ascii_lowercase().as_str() {
        "application/msword" => Some("doc"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => Some("docx"),
        "application/vnd.ms-excel" => Some("xls"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => Some("xlsx"),
        "application/vnd.ms-powerpoint" => Some("ppt"),
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" => Some("pptx"),
        "application/pdf" => Some("pdf"),
        "text/plain" => Some("txt"),
        "text/markdown" => Some("md"),
        "text/csv" => Some("csv"),
        "application/json" => Some("json"),
        "application/xml" | "text/xml" => Some("xml"),
        "application/yaml" | "application/x-yaml" | "text/yaml" | "text/x-yaml" => Some("yaml"),
        _ => None,
    }
}

fn user_contact(email: String, mobile: String) -> String {
    match (email.trim().is_empty(), mobile.trim().is_empty()) {
        (true, true) => "未填写".to_string(),
        (false, true) => email,
        (true, false) => mobile,
        (false, false) => format!("{email} / {mobile}"),
    }
}

fn work_item_active_key(kind: &str) -> &'static str {
    match kind {
        "需求" => "requirements",
        "任务" => "tasks",
        "Bug" => "bugs",
        _ => "dashboard",
    }
}

fn project_detail_tab(tab: Option<&str>) -> &'static str {
    match tab.map(str::trim) {
        Some("info") | Some("work") => "info",
        Some("members") => "members",
        Some("library") | Some("resources") => "library",
        Some("files") | Some("attachments") => "info",
        Some("activities") => "activities",
        _ => "info",
    }
}

fn fallback_text(value: String, fallback: &str) -> String {
    if value.trim().is_empty() {
        fallback.to_string()
    } else {
        value
    }
}

fn display_timestamp(value: String) -> String {
    value.replace('T', " ")
}

fn display_optional_timestamp(value: String, fallback: &str) -> String {
    if value.trim().is_empty() {
        fallback.to_string()
    } else {
        display_timestamp(value)
    }
}

fn chrono_now_text() -> String {
    Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn format_byte_size(byte_size: i64) -> String {
    if byte_size < 1024 {
        return format!("{byte_size} B");
    }
    if byte_size < 1024 * 1024 {
        return format!("{:.1} KB", byte_size as f64 / 1024.0);
    }
    format!("{:.1} MB", byte_size as f64 / 1024.0 / 1024.0)
}

fn empty_work_items_message(item_type: Option<&str>) -> String {
    match item_type {
        Some("requirement") => "暂无需求".to_string(),
        Some("task") => "暂无任务".to_string(),
        Some("bug") => "暂无 Bug".to_string(),
        _ => "暂无工作项".to_string(),
    }
}

fn sample_metrics() -> Vec<Metric> {
    vec![
        Metric {
            label: "进行中项目",
            value: "3".to_string(),
            tone: "info",
            icon: "projects",
        },
        Metric {
            label: "指派需求",
            value: "4".to_string(),
            tone: "info",
            icon: "doc",
        },
        Metric {
            label: "指派任务",
            value: "2".to_string(),
            tone: "warning",
            icon: "tasks",
        },
        Metric {
            label: "指派 Bug",
            value: "1".to_string(),
            tone: "danger",
            icon: "bug",
        },
    ]
}

fn sample_user_profile() -> UserProfileView {
    UserProfileView {
        username: "yuance_admin".to_string(),
        display_name: "系统管理员".to_string(),
        email: String::new(),
        mobile: String::new(),
        roles: "系统管理员".to_string(),
        status: "启用".to_string(),
        status_tone: "ok",
        created_at: "今天".to_string(),
        updated_at: "今天".to_string(),
        is_super_admin: true,
    }
}

fn sample_projects() -> Vec<ProjectRow> {
    vec![
        ProjectRow {
            code: "YCE".to_string(),
            name: "元策 MVP".to_string(),
            owner: "陈".to_string(),
            pending_in_progress_confirmation_count: 2,
            total_work_items: 4,
            status_code: "in_progress".to_string(),
            status: "进行中".to_string(),
            status_tone: "ok",
            updated_at: "今天 16:20".to_string(),
            pending_requirements: 1,
            pending_tasks: 1,
            pending_bugs: 0,
        },
        ProjectRow {
            code: "OPS".to_string(),
            name: "交付运维台".to_string(),
            owner: "林".to_string(),
            pending_in_progress_confirmation_count: 1,
            total_work_items: 1,
            status_code: "not_started".to_string(),
            status: "待启动".to_string(),
            status_tone: "info",
            updated_at: "今天 13:05".to_string(),
            pending_requirements: 0,
            pending_tasks: 1,
            pending_bugs: 0,
        },
        ProjectRow {
            code: "CRM".to_string(),
            name: "客户线索同步".to_string(),
            owner: "周".to_string(),
            pending_in_progress_confirmation_count: 1,
            total_work_items: 1,
            status_code: "on_hold".to_string(),
            status: "已暂停".to_string(),
            status_tone: "warning",
            updated_at: "昨天 19:42".to_string(),
            pending_requirements: 0,
            pending_tasks: 0,
            pending_bugs: 1,
        },
    ]
}

fn sample_project_options() -> Vec<ProjectOption> {
    sample_projects()
        .into_iter()
        .map(|project| ProjectOption {
            key: project.code,
            name: project.name,
        })
        .collect()
}

fn sample_search_results(query: &str) -> Vec<SearchResult> {
    let query = query.trim();
    if query.is_empty() {
        return Vec::new();
    }

    sample_projects()
        .into_iter()
        .filter(|project| project.code.contains(query) || project.name.contains(query))
        .map(|project| SearchResult {
            kind_code: "project".to_string(),
            kind: "项目".to_string(),
            key: project.code.clone(),
            title: project.name,
            context: format!("项目负责人 {} · {}", project.owner, project.status),
            url: format!("/web/projects/{}", project.code),
            updated_at: project.updated_at,
        })
        .chain(
            sample_work_items(None)
                .into_iter()
                .filter(|item| {
                    item.key.contains(query)
                        || item.title.contains(query)
                        || item.project.contains(query)
                })
                .map(|item| SearchResult {
                    kind_code: item.kind_code,
                    kind: item.kind,
                    key: item.key.clone(),
                    title: item.title,
                    context: item.project,
                    url: format!("/web/work-items/{}", item.key),
                    updated_at: "示例数据".to_string(),
                }),
        )
        .collect()
}

fn sample_work_items(item_type: Option<&str>) -> Vec<WorkItem> {
    sample_domain_work_items(item_type)
        .into_iter()
        .map(work_item_from_summary)
        .collect()
}

fn sample_domain_work_items(item_type: Option<&str>) -> Vec<projects::WorkItemSummary> {
    let items = vec![
        projects::WorkItemSummary {
            id: 1,
            item_key: "YCE-REQ-1".to_string(),
            item_type: "requirement".to_string(),
            title: "统一 /web 用户工作台与系统管理入口".to_string(),
            project_key: "YCE".to_string(),
            project_name: "元策 MVP".to_string(),
            assignee_display_name: "陈".to_string(),
            priority: "P0".to_string(),
            status: "in_progress".to_string(),
            updated_at: "今天 16:20".to_string(),
        },
        projects::WorkItemSummary {
            id: 2,
            item_key: "YCE-TASK-2".to_string(),
            item_type: "task".to_string(),
            title: "设计项目与工作项数据模型".to_string(),
            project_key: "YCE".to_string(),
            project_name: "元策 MVP".to_string(),
            assignee_display_name: "陈".to_string(),
            priority: "P0".to_string(),
            status: "in_progress".to_string(),
            updated_at: "今天 16:20".to_string(),
        },
        projects::WorkItemSummary {
            id: 3,
            item_key: "CRM-BUG-1".to_string(),
            item_type: "bug".to_string(),
            title: "外部线索状态映射需要人工确认".to_string(),
            project_key: "CRM".to_string(),
            project_name: "客户线索同步".to_string(),
            assignee_display_name: String::new(),
            priority: "P1".to_string(),
            status: "open".to_string(),
            updated_at: "昨天 19:42".to_string(),
        },
    ];

    items
        .into_iter()
        .filter(|item| item_type.is_none_or(|kind| item.item_type == kind))
        .collect()
}

fn render_sample_project_detail(state: &AppState, context: WebContext<'_>) -> AppResult<Response> {
    let requirements = sample_work_items(Some("requirement"));
    let tasks = sample_work_items(Some("task"));
    let bugs = sample_work_items(Some("bug"));
    let members = vec![ProjectMemberView {
        display_name: "陈".to_string(),
        username: "yuance_admin".to_string(),
        role_code: "owner".to_string(),
        role: "项目负责人".to_string(),
        joined_at: "今天".to_string(),
    }];
    let member_candidates = vec![ProjectUserOption {
        display_name: "测试成员".to_string(),
        username: "tester".to_string(),
        roles: "普通成员".to_string(),
    }];
    let resources = vec![ProjectResourceView {
        id: 1,
        title: "上游对接参数".to_string(),
        category_code: "integration".to_string(),
        category: "对接参数".to_string(),
        summary: "保存测试环境、正式环境和回调说明。".to_string(),
        status_code: "active".to_string(),
        status: "可用".to_string(),
        status_tone: "ok",
        is_protected: true,
        created_by: "陈".to_string(),
        updated_by: "陈".to_string(),
        created_at: "今天".to_string(),
        updated_at: "今天 16:20".to_string(),
        url: "/web/projects/YCE/resources/1".to_string(),
    }];
    let activities = sample_activities();
    let summary = project_detail_summary(&requirements, &tasks, &bugs, &members);

    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        state,
        &csrf_token,
        response::html(ProjectDetailTemplate {
            active: "projects",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            project: ProjectDetailView {
                code: "YCE".to_string(),
                name: "元策 MVP".to_string(),
                description: "统一项目、需求、任务、Bug 的轻量项目管理系统。".to_string(),
                owner_username: "chen".to_string(),
                owner: "陈".to_string(),
                status_code: "in_progress".to_string(),
                status: "进行中".to_string(),
                status_tone: "ok",
                start_date: "2026-06-01".to_string(),
                due_date: "2026-07-31".to_string(),
                created_at: "今天".to_string(),
                updated_at: "今天 16:20".to_string(),
            },
            has_activities: !activities.is_empty(),
            summary,
            requirements,
            members,
            has_member_candidates: !member_candidates.is_empty(),
            member_candidates,
            has_resources: !resources.is_empty(),
            resources,
            resource_filters: ProjectResourceFilterView::default(),
            resource_category_options: project_resource_category_options(),
            activities,
            project_item_type_options: work_item_type_options(),
            can_edit_project: true,
            can_manage_project: true,
            can_manage_work_items: true,
            active_tab: "info",
        })?
        .into_response(),
    )
}

fn render_sample_work_item_detail_page(
    state: &AppState,
    context: WebContext<'_>,
) -> AppResult<Response> {
    let partial = sample_work_item_detail_partial()?;
    let status_options = work_item_status_options(&partial.item.kind, &partial.item.status_code)?;
    let (flow_history_records, flow_history_pagination, flow_history_pagination_pages) =
        sample_work_item_flow_history(&partial.item, normalize_web_pagination(None, None)?);
    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        state,
        &csrf_token,
        response::html(WorkItemDetailTemplate {
            active: "tasks",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            discussion_count: partial.discussion_count,
            has_comments: partial.has_comments,
            item: partial.item,
            assignee_options: vec![ProjectMemberView {
                display_name: "陈".to_string(),
                username: "yuance_admin".to_string(),
                role_code: "owner".to_string(),
                role: "项目负责人".to_string(),
                joined_at: "今天".to_string(),
            }],
            parent_options: sample_work_items(Some("requirement")),
            status_options,
            has_attachments: false,
            attachments: Vec::new(),
            comments: partial.comments,
            has_flow_history: !flow_history_records.is_empty(),
            flow_history_records,
            flow_history_pagination,
            flow_history_pagination_pages,
            can_manage_work_items: true,
            can_restore_work_items: true,
        })?
        .into_response(),
    )
}

fn sample_work_item_detail_partial() -> AppResult<WorkItemDetailPartialTemplate> {
    let status_options = work_item_status_options("任务", "in_progress")?;
    Ok(WorkItemDetailPartialTemplate {
        csrf_token: "sample-csrf-token".to_string(),
        status_options,
        item: WorkItemDetailView {
            id: 2,
            key: "YCE-TASK-2".to_string(),
            kind_code: "task".to_string(),
            kind: "任务".to_string(),
            title: "设计项目与工作项数据模型".to_string(),
            description: "落地项目、成员、需求、任务、Bug、评论和动态表。".to_string(),
            description_html: "<p>落地项目、成员、需求、任务、Bug、评论和动态表。</p>".to_string(),
            project_key: "YCE".to_string(),
            project_name: "元策 MVP".to_string(),
            parent_item_key: "YCE-REQ-1".to_string(),
            parent_title: "统一 /web 用户工作台与系统管理入口".to_string(),
            has_parent: true,
            assignee_username: "yuance_admin".to_string(),
            assignee: "陈".to_string(),
            reporter_username: "yuance_admin".to_string(),
            reporter: "陈".to_string(),
            priority_code: "P0".to_string(),
            priority: "紧急".to_string(),
            status_code: "in_progress".to_string(),
            status: "进行中".to_string(),
            status_tone: "info",
            due_date: "2026-07-15".to_string(),
            created_at: "今天".to_string(),
            updated_at: "今天 16:20".to_string(),
            deleted_at: String::new(),
            is_deleted: false,
        },
        comments: vec![WorkItemComment {
            id: 1,
            parent_comment_id: None,
            parent_author: String::new(),
            body: "先统一项目与工作项查询模型，再继续补页面交互。".to_string(),
            body_format: "plain".to_string(),
            body_html: "<p>先统一项目与工作项查询模型，再继续补页面交互。</p>".to_string(),
            author: "陈".to_string(),
            author_username: "yuance_admin".to_string(),
            created_at: "今天".to_string(),
            updated_at: "今天".to_string(),
            is_edited: false,
            is_flow: false,
            attachments: Vec::new(),
            has_attachments: false,
            can_manage: true,
        }],
        discussion_count: 1,
        has_comments: true,
        can_manage_work_items: true,
    })
}

fn sample_activities() -> Vec<Activity> {
    vec![
        Activity {
            title: "架构计划已确认".to_string(),
            meta: "YCE · docs/plans · 20 分钟前".to_string(),
        },
        Activity {
            title: "RBAC 采用轻量权限点模型".to_string(),
            meta: "YCE · system.users.manage 等 key · 今天".to_string(),
        },
        Activity {
            title: "对象存储第一版锁定阿里云 OSS".to_string(),
            meta: "YCE · 系统管理 / 对象存储 · 今天".to_string(),
        },
    ]
}

fn sample_work_item_flow_records() -> Vec<WorkItemFlowRecord> {
    vec![
        WorkItemFlowRecord {
            actor: "陈".to_string(),
            created_at: "今天 16:20".to_string(),
            status_change: "待处理 → 进行中".to_string(),
            assignee_change: "未分配 → 陈".to_string(),
            note: "开始处理数据库设计与字段约束。".to_string(),
        },
        WorkItemFlowRecord {
            actor: "陈".to_string(),
            created_at: "今天 14:10".to_string(),
            status_change: "—".to_string(),
            assignee_change: "陈 → 界面验证成员".to_string(),
            note: "提交首轮页面联调，转给界面验证。".to_string(),
        },
        WorkItemFlowRecord {
            actor: "界面验证成员".to_string(),
            created_at: "今天 10:05".to_string(),
            status_change: "进行中 → 待确认".to_string(),
            assignee_change: "界面验证成员 → 陈".to_string(),
            note: "已完成视觉确认，请负责人复核。".to_string(),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_work_item(status_code: &str, status: &str, priority_code: &str) -> WorkItem {
        WorkItem {
            key: "YCE-TASK-1".to_string(),
            kind_code: "task".to_string(),
            kind: "任务".to_string(),
            title: "示例任务".to_string(),
            project: "YCE · 元策".to_string(),
            assignee: "张三".to_string(),
            priority_code: priority_code.to_string(),
            priority: priority_label(priority_code).to_string(),
            status_code: status_code.to_string(),
            status: status.to_string(),
            status_tone: "info",
        }
    }

    #[test]
    fn flow_comment_display_renames_legacy_assignee_label() {
        assert_eq!(
            work_item_comment_body_for_display("负责人：张三 → 李四", true),
            "指派：张三 → 李四"
        );
        assert_eq!(
            work_item_comment_body_for_display(
                "状态：待处理 → 进行中；负责人：张三 → 李四；说明：负责人：不要改；处理人：也不要改",
                true
            ),
            "状态：待处理 → 进行中；指派：张三 → 李四；说明：负责人：不要改；处理人：也不要改"
        );
        assert_eq!(
            work_item_comment_body_for_display("处理人：张三 → 李四", true),
            "指派：张三 → 李四"
        );
        assert_eq!(
            work_item_comment_body_for_display("负责人：张三", false),
            "负责人：张三"
        );
    }

    #[test]
    fn flow_comment_title_highlights_assignment_target() {
        assert_eq!(
            work_item_flow_title("王五", "状态：待处理 → 进行中；指派：张三 → 李四", true),
            "王五 将状态从 待处理 改为 进行中，并指派给 李四"
        );
        assert_eq!(
            work_item_flow_title("王五", "状态：待处理 → 进行中", true),
            "王五 将状态从 待处理 改为 进行中"
        );
        assert_eq!(
            work_item_flow_title("王五", "指派：张三 → 李四", true),
            "王五 将工作项由 张三 指派给 李四"
        );
        assert_eq!(
            work_item_flow_title("王五", "说明：补充进展", true),
            "王五 记录了流转"
        );
        assert_eq!(
            work_item_flow_title("王五", "说明：补充进展；处理人：张三 → 李四", true),
            "王五 记录了流转"
        );
        assert_eq!(work_item_flow_title("王五", "普通评论", false), "");
    }

    #[test]
    fn flow_change_parser_extracts_status_assignee_and_note() {
        let change = work_item_flow_change(
            "状态：待处理 → 待确认；负责人：张三 → 李四；说明：等待复测",
            true,
        );

        assert_eq!(change.previous_status, "待处理");
        assert_eq!(change.next_status, "待确认");
        assert_eq!(change.previous_assignee, "张三");
        assert_eq!(change.next_assignee, "李四");
        assert_eq!(change.note, "等待复测");
    }

    #[test]
    fn summaries_exclude_cancelled_items_from_active_counts() {
        let items = vec![
            sample_work_item("open", "待处理", "P2"),
            sample_work_item("in_progress", "进行中", "P2"),
            sample_work_item("pending_confirmation", "待确认", "P2"),
            sample_work_item("cancelled", "已取消", "P2"),
        ];

        let summary = work_item_list_summary_from_items(&items, items.len() as i64);
        assert_eq!(summary.pending_in_progress_confirmation_count, 3);

        let detail = project_detail_summary(&items, &[], &[], &[]);
        assert_eq!(detail.pending_in_progress_confirmation_count, 3);
    }

    #[test]
    fn my_summary_only_counts_active_high_priority_items() {
        let items = vec![
            sample_work_item("open", "待处理", "P0"),
            sample_work_item("in_progress", "进行中", "P1"),
            sample_work_item("done", "已完成", "P0"),
            sample_work_item("cancelled", "已取消", "P1"),
            sample_work_item("open", "待处理", "P3"),
        ];

        let summary = my_summary(&[], &items);
        assert_eq!(summary.assigned_count, 5);
        assert_eq!(summary.high_priority_count, 2);
    }

    #[test]
    fn attachment_preview_strategy_supports_text_csv_pdf_and_office() {
        assert_eq!(
            attachment_preview_strategy("说明.md", "text/markdown"),
            Some(AttachmentPreviewStrategy::Text)
        );
        assert_eq!(
            attachment_preview_strategy("数据.csv", "text/csv"),
            Some(AttachmentPreviewStrategy::Csv)
        );
        assert_eq!(
            attachment_preview_strategy("报告.pdf", "application/pdf"),
            Some(AttachmentPreviewStrategy::Pdf)
        );
        assert_eq!(
            attachment_preview_strategy(
                "需求说明.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ),
            Some(AttachmentPreviewStrategy::OfficePdf)
        );
    }

    #[test]
    fn build_text_preview_content_marks_large_payload_as_truncated() {
        let oversized = vec![b'a'; TEXT_PREVIEW_MAX_BYTES + 16];
        let preview = build_text_preview_content(&oversized);
        assert!(preview.is_truncated);
        assert_eq!(preview.content.len(), TEXT_PREVIEW_MAX_BYTES);
        assert_eq!(preview.line_count, 1);
    }

    #[test]
    fn build_csv_preview_table_limits_columns_and_rows() {
        let csv = "姓名,角色,邮箱,备注,附加\n张三,开发,zhangsan@example.com,第一行,扩展值\n李四,测试,lisi@example.com,第二行,扩展值"
            .as_bytes()
            .to_vec();
        let table = build_csv_preview_table(&csv).expect("csv preview should parse");

        assert_eq!(table.headers.len(), 5);
        assert_eq!(table.rows.len(), 2);
        assert_eq!(table.rows[0][0], "张三");
        assert!(!table.is_truncated);
    }

    #[test]
    fn output_pdf_filename_uses_source_stem() {
        assert_eq!(output_pdf_filename("需求说明.docx"), "需求说明.pdf");
        assert_eq!(output_pdf_filename("report.final.pptx"), "report.final.pdf");
        assert_eq!(output_pdf_filename(""), "document.pdf");
    }
}
