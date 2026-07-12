use std::collections::{HashMap, HashSet};

use askama::Template;
use axum::{
    Form,
    extract::{Path, Query, RawForm, State},
    http::{HeaderMap, StatusCode, header},
    response::{Html, IntoResponse, Redirect, Response},
};
use serde::Deserialize;
use sqlx::SqlitePool;

use crate::{
    domains::{
        audit, auth,
        bootstrap::{self, BootstrapInitInput},
        files, notifications, projects, rbac, storage, users,
    },
    platform::error::{AppError, AppResult},
    platform::security::csrf,
    web::{audit_context, response, router::AppState},
};

#[derive(Debug, Clone)]
struct Metric {
    label: &'static str,
    value: String,
    hint: String,
    tone: &'static str,
}

#[derive(Debug, Clone)]
struct ProjectRow {
    code: String,
    name: String,
    owner: String,
    open_work_items: i64,
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
    hint: String,
    tone: &'static str,
}

#[derive(Debug, Clone)]
struct PersonalCompletionView {
    key: String,
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
    open_work_items: i64,
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
struct AttachmentView {
    id: i64,
    file_object_id: i64,
    filename: String,
    content_type: String,
    is_previewable_image: bool,
    is_previewable_video: bool,
    byte_size: String,
    status_code: String,
    status: String,
    status_tone: &'static str,
    created_by: String,
    created_at: String,
    object_key: String,
}

#[derive(Debug, Clone)]
struct ProjectDetailSummary {
    requirements: usize,
    tasks: usize,
    bugs: usize,
    open_items: usize,
    members: usize,
}

#[derive(Debug, Clone)]
struct WorkItem {
    key: String,
    kind: String,
    title: String,
    project: String,
    assignee: String,
    priority_code: String,
    priority: String,
    status: String,
    status_tone: &'static str,
}

#[derive(Debug, Clone)]
struct RiskItem {
    key: String,
    title: String,
    project: String,
    assignee: String,
    priority: String,
    status: String,
    status_tone: &'static str,
    url: String,
}

#[derive(Debug, Clone)]
struct WorkItemDetailView {
    id: i64,
    key: String,
    kind: String,
    title: String,
    description: String,
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
    reply_depth: usize,
    body: String,
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
struct WorkItemListSummary {
    total_items: i64,
    open_items: usize,
    high_priority_items: usize,
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
    audit: bool,
    requirements_badge: String,
    tasks_badge: String,
    bugs_badge: String,
}

impl SystemNav {
    fn all() -> Self {
        Self {
            visible: true,
            dashboard: true,
            users: true,
            roles: true,
            storage: true,
            audit: true,
            requirements_badge: String::new(),
            tasks_badge: String::new(),
            bugs_badge: String::new(),
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
    contact: String,
    roles: String,
    status: String,
    status_tone: &'static str,
    created_at: String,
    updated_at: String,
    is_super_admin: bool,
}

#[derive(Debug, Clone)]
struct MySummary {
    project_count: usize,
    assigned_count: usize,
    open_count: usize,
    high_priority_count: usize,
}

#[derive(Debug, Clone)]
struct SearchResult {
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
    risk_items: Vec<RiskItem>,
    has_risk_items: bool,
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
    assigned_items: Vec<WorkItem>,
    has_projects: bool,
    has_assigned_items: bool,
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
    tasks: Vec<WorkItem>,
    bugs: Vec<WorkItem>,
    members: Vec<ProjectMemberView>,
    member_candidates: Vec<ProjectUserOption>,
    attachments: Vec<AttachmentView>,
    activities: Vec<Activity>,
    has_requirements: bool,
    has_tasks: bool,
    has_bugs: bool,
    has_activities: bool,
    has_attachments: bool,
    has_member_candidates: bool,
    project_item_type_options: Vec<WorkItemTypeOption>,
    can_edit_project: bool,
    can_manage_project: bool,
    can_manage_work_items: bool,
    active_tab: &'static str,
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
    unread_only: bool,
    has_notifications: bool,
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
    has_comments: bool,
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
    has_comments: bool,
    can_manage_work_items: bool,
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
    bucket_inspection: StorageBucketInspectionView,
    message: String,
    message_tone: &'static str,
    can_manage_storage: bool,
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
    status: String,
}

#[derive(Debug, Deserialize)]
pub struct UserRoleForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    role_code: String,
}

#[derive(Debug, Deserialize)]
pub struct ResetPasswordForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    password: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateRoleForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    role_code: String,
    role_name: String,
    data_scope_type: String,
}

#[derive(Debug, Deserialize)]
pub struct RoleStatusForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    status: String,
}

#[derive(Debug, Deserialize)]
pub struct RoleWorkbenchQuery {
    #[serde(default)]
    role: String,
}

#[derive(Debug, Deserialize)]
pub struct StorageConfigForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
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
}

#[derive(Debug, Deserialize)]
pub struct StorageInitializeForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
}

#[derive(Debug, Deserialize)]
pub struct StorageRollbackForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
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
pub struct WorkItemCommentForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    body: String,
    #[serde(default)]
    parent_comment_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct ProjectMemberForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    username: String,
    member_role: String,
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
pub struct SearchQuery {
    q: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct MessagesQuery {
    #[serde(default)]
    unread: bool,
}

#[derive(Debug, Deserialize)]
pub struct MessageActionForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
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
    let system_nav = build_system_nav(pool, user.id, can_access_all_projects).await?;
    let (current_project, topbar_project_options) =
        build_project_context(pool, user.id, can_access_all_projects).await?;

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

    let (profile, projects, assigned_items) = match context.pool {
        Some(pool) => {
            let Some(profile) = users::get_user_summary(pool, context.user_id).await? else {
                return login_redirect(&headers);
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

            (user_profile_from_summary(profile), projects, assigned_items)
        }
        None => (
            sample_user_profile(),
            sample_projects(),
            sample_work_items(None),
        ),
    };
    let summary = my_summary(&projects, &assigned_items);
    let csrf_token = context.csrf_token.clone();

    with_csrf_cookie(
        &state,
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
            has_assigned_items: !assigned_items.is_empty(),
            profile,
            summary,
            projects,
            assigned_items,
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
        users::change_own_password(
            pool,
            context.user_id,
            &form.current_password,
            &form.new_password,
            &raw_session,
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

pub async fn search_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<SearchQuery>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let query = query.q.unwrap_or_default().trim().to_string();
    if query.chars().count() > 128 {
        return Err(AppError::BadRequest(
            "搜索关键词不能超过 128 个字符".to_string(),
        ));
    }

    let results = if query.is_empty() {
        Vec::new()
    } else {
        match context.pool {
            Some(pool) => {
                let can_view_projects =
                    rbac::user_has_permission(pool, context.user_id, "project.view").await?;
                let can_view_work_items =
                    rbac::user_has_permission(pool, context.user_id, "work_item.view").await?;
                projects::search_visible(
                    pool,
                    context.user_id,
                    context.can_access_all_projects,
                    &query,
                    20,
                )
                .await?
                .into_iter()
                .filter(|hit| {
                    if hit.hit_type == "project" {
                        can_view_projects
                    } else {
                        can_view_work_items
                    }
                })
                .map(search_result_from_hit)
                .collect()
            }
            None => sample_search_results(&query),
        }
    };
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
    let (items, unread_count) = match context.pool {
        Some(pool) => (
            notifications::list_for_user(pool, context.user_id, query.unread, 100)
                .await?
                .into_iter()
                .map(notification_view)
                .collect::<Vec<_>>(),
            notifications::unread_count(pool, context.user_id).await?,
        ),
        None => (Vec::new(), 0),
    };
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
        unread_only: query.unread,
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
    if let Some(pool) = context.pool {
        notifications::mark_all_read(pool, context.user_id).await?;
    }
    Ok(Redirect::to("/web/messages").into_response())
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

        return Ok(Redirect::to(&format!("/web/projects/{}", updated.project_key)).into_response());
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

    if let Some(pool) = context.pool {
        ensure_view_permission(pool, &headers, context.user_id, "project.view").await?;
        projects::set_current_project_for_user(
            pool,
            context.user_id,
            context.can_access_all_projects,
            &form.project_key,
        )
        .await?;
    }

    Ok(Redirect::to(safe_web_return_to(&form.return_to)).into_response())
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
    let attachments = files::list_attachments(pool, "project", project.id)
        .await?
        .into_iter()
        .map(attachment_from_summary)
        .collect::<Vec<_>>();
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
            has_requirements: !requirements.is_empty(),
            has_tasks: !tasks.is_empty(),
            has_bugs: !bugs.is_empty(),
            has_activities: !activities.is_empty(),
            project,
            summary,
            requirements,
            tasks,
            bugs,
            members,
            has_member_candidates: !member_candidates.is_empty(),
            member_candidates,
            has_attachments: !attachments.is_empty(),
            attachments,
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

    let username = sqlx::query_scalar::<_, String>("SELECT username FROM users WHERE id = ?1")
        .bind(context.user_id)
        .fetch_one(pool)
        .await?;
    let analysis = projects::personal_project_analysis(pool, project.id, context.user_id).await?;
    let output_metrics = vec![
        PersonalAnalysisMetric {
            label: "累计处理",
            value: analysis.completed_total.to_string(),
            hint: format!(
                "需求 {} · 任务 {} · Bug {}",
                analysis.completed_requirements, analysis.completed_tasks, analysis.completed_bugs
            ),
            tone: "info",
        },
        PersonalAnalysisMetric {
            label: "近 30 日",
            value: analysis.completed_last_30_days.to_string(),
            hint: "实际推进至终态".to_string(),
            tone: "ok",
        },
        PersonalAnalysisMetric {
            label: "已处理 Bug",
            value: analysis.completed_bugs.to_string(),
            hint: "解决 / 验证 / 关闭".to_string(),
            tone: "danger",
        },
        PersonalAnalysisMetric {
            label: "当前待处理",
            value: (analysis.pending.requirements + analysis.pending.tasks + analysis.pending.bugs)
                .to_string(),
            hint: format!(
                "需求 {} · 任务 {} · Bug {}",
                analysis.pending.requirements, analysis.pending.tasks, analysis.pending.bugs
            ),
            tone: "warning",
        },
    ];
    let efficiency_metrics = vec![
        PersonalAnalysisMetric {
            label: "日平均处理",
            value: format!("{:.2}", analysis.daily_average),
            hint: "加入项目后的自然日均值".to_string(),
            tone: "info",
        },
        PersonalAnalysisMetric {
            label: "单日最大处理",
            value: analysis.daily_peak.to_string(),
            hint: if analysis.daily_peak_date.is_empty() {
                "暂无完成记录".to_string()
            } else {
                analysis.daily_peak_date.clone()
            },
            tone: "warning",
        },
        PersonalAnalysisMetric {
            label: "月平均处理",
            value: format!("{:.2}", analysis.monthly_average),
            hint: "加入项目后的自然月均值".to_string(),
            tone: "info",
        },
        PersonalAnalysisMetric {
            label: "单月最大处理",
            value: analysis.monthly_peak.to_string(),
            hint: if analysis.monthly_peak_month.is_empty() {
                "暂无完成记录".to_string()
            } else {
                analysis.monthly_peak_month.clone()
            },
            tone: "ok",
        },
    ];
    let recent_completions = analysis
        .recent_completions
        .iter()
        .map(|item| PersonalCompletionView {
            key: item.item_key.clone(),
            kind: match item.item_type.as_str() {
                "requirement" => "需求",
                "task" => "任务",
                "bug" => "Bug",
                _ => "工作项",
            },
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
    Form(form): Form<ProjectMemberForm>,
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
        let member = projects::add_project_member(
            pool,
            context.user_id,
            &project_key,
            &form.username,
            &form.member_role,
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "project.member.add",
            "project",
            &project_key,
            &format!(
                r#"{{"username":"{}","member_role":"{}"}}"#,
                member.username, member.member_role
            ),
        )
        .await?;

        return Ok(Redirect::to(&format!("/web/projects/{project_key}")).into_response());
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

        return Ok(Redirect::to(&format!("/web/projects/{project_key}")).into_response());
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

        return Ok(Redirect::to(&format!("/web/projects/{project_key}")).into_response());
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

        return Ok(Redirect::to(&format!("/web/projects/{project_key}?tab=files")).into_response());
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
        let activity_summary = format!("删除项目附件 {}", attachment.original_filename);
        let deleted = files::delete_attachment(
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
            "file.delete.project",
            "project",
            &project_key,
            &format!(
                r#"{{"attachment_id":{},"file_object_id":{}}}"#,
                deleted.id, deleted.file_object_id
            ),
        )
        .await?;

        return Ok(Redirect::to(&format!("/web/projects/{project_key}?tab=files")).into_response());
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
            return Ok(Redirect::to(&format!("/web/projects/{}", item.project_key)).into_response());
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
            has_comments: !comments.is_empty(),
            item,
            assignee_options,
            parent_options,
            status_options,
            has_attachments: !attachments.is_empty(),
            attachments,
            comments,
            can_manage_work_items,
            can_restore_work_items,
        })?
        .into_response(),
    )
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

        return Ok(Redirect::to(&format!("/web/work-items/{}", updated.item_key)).into_response());
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

        return Ok(Redirect::to(&format!("/web/work-items/{}", updated.item_key)).into_response());
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
        projects::add_work_item_comment_reply(
            pool,
            context.user_id,
            &item_key,
            &form.body,
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

        return Ok(Redirect::to(&format!("/web/work-items/{item_key}")).into_response());
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
        projects::update_work_item_comment(
            pool,
            context.user_id,
            context.is_super_admin,
            &item_key,
            comment_id,
            &form.body,
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

        return Ok(Redirect::to(&format!("/web/work-items/{item_key}")).into_response());
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

        return Ok(Redirect::to(&format!("/web/work-items/{item_key}")).into_response());
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

        return Ok(Redirect::to(&format!("/web/work-items/{item_key}")).into_response());
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
    let session = match auth::login_with_ttl(
        pool,
        &form.username,
        &form.password,
        state.settings.session_ttl_seconds()?,
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
    redirect_with_session(&state, session.raw_token, is_htmx(&headers))
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
    let session =
        auth::issue_session(pool, result.user_id, state.settings.session_ttl_seconds()?).await?;
    redirect_with_session(&state, session.raw_token, is_htmx(&headers))
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
) -> AppResult<Response> {
    let context = match system_context_or_redirect(&state, &headers, "system.users.view").await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let pool = state.pool()?;
    let users = users::list_users(pool)
        .await?
        .into_iter()
        .map(user_row_from_summary)
        .collect::<Vec<_>>();
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
            can_manage_users,
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

    Ok(Redirect::to("/web/system/users").into_response())
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

    Ok(Redirect::to("/web/system/users").into_response())
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

    Ok(Redirect::to("/web/system/users").into_response())
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

    Ok(Redirect::to("/web/system/users").into_response())
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
    let role_summaries = rbac::list_roles(state.pool()?).await?;
    let selected_role = selected_role_summary(&role_summaries, &query.role).cloned();
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
    rbac::create_role(
        state.pool()?,
        &form.role_code,
        &form.role_name,
        &form.data_scope_type,
    )
    .await?;
    audit::record(
        state.pool()?,
        Some(_context.user_id),
        "role.create",
        "role",
        &form.role_code,
        "{}",
    )
    .await?;

    Ok(Redirect::to(&format!("/web/system/roles?role={}", form.role_code.trim())).into_response())
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

    Ok(Redirect::to(&format!("/web/system/roles?role={role_code}")).into_response())
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
    csrf::verify(&headers, &submitted_csrf)?;
    let _context = match system_context_or_redirect(&state, &headers, "system.roles.manage").await?
    {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
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

    Ok(Redirect::to(&format!("/web/system/roles?role={role_code}")).into_response())
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
) -> AppResult<Response> {
    let context = match system_context_or_redirect(&state, &headers, "system.storage.view").await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let config = storage::latest_config(state.pool()?)
        .await?
        .map(storage_config_view_from_domain)
        .unwrap_or_else(empty_storage_config_view);
    let versions = storage_versions_for_view(state.pool()?).await?;
    let has_versions = !versions.is_empty();
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
            versions,
            has_versions,
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
    let versions = storage_versions_for_view(state.pool()?).await?;
    let has_versions = !versions.is_empty();
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
            versions,
            has_versions,
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
    let versions = storage_versions_for_view(pool).await?;
    let has_versions = !versions.is_empty();

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
            versions,
            has_versions,
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
    let versions = storage_versions_for_view(pool).await?;
    let has_versions = !versions.is_empty();
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
            versions,
            has_versions,
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
    let versions = storage_versions_for_view(pool).await?;
    let has_versions = !versions.is_empty();
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
            versions,
            has_versions,
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
    let (items, total_items, page_number, per_page) = if current_project_required {
        (Vec::new(), 0, pagination.page, pagination.per_page)
    } else {
        match context.pool {
            Some(pool) => {
                let page = projects::list_work_item_summaries_filtered_for_user_paginated(
                    pool,
                    context.user_id,
                    context.can_access_all_projects,
                    projects::WorkItemListFilter {
                        item_type: item_type.map(ToOwned::to_owned),
                        keyword: filters.q.clone(),
                        status: filters.status.clone(),
                        priority: filters.priority.clone(),
                        project_key: filters.project_key.clone(),
                        assignee_username: filters.assignee_username.clone(),
                    },
                    pagination,
                )
                .await?;
                let items = page
                    .items
                    .into_iter()
                    .map(work_item_from_summary)
                    .collect::<Vec<_>>();
                (items, page.total_items, page.page, page.per_page)
            }
            None => {
                let sample_items = sample_work_items(item_type);
                let total_items = sample_items.len() as i64;
                let items = paginate_work_item_views(sample_items, pagination);
                (items, total_items, pagination.page, pagination.per_page)
            }
        }
    };
    let total_pages = total_pages(total_items, per_page);
    let summary = work_item_list_summary(&items, total_items);
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
        return response::html(sample_work_item_detail_partial()).map(IntoResponse::into_response);
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
    response::html(WorkItemDetailPartialTemplate {
        csrf_token: csrf::ensure_token(&headers),
        has_comments: !comments.is_empty(),
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
    let current_project_key = context
        .current_project
        .as_ref()
        .map(|project| project.key.clone());
    let (metrics, projects, risk_items, activities) = match context.pool {
        Some(pool) => {
            let can_view_projects =
                rbac::user_has_permission(pool, context.user_id, "project.view").await?;
            let can_view_work_items =
                rbac::user_has_permission(pool, context.user_id, "work_item.view").await?;
            let project_summaries = if can_view_projects {
                projects::list_project_summaries_for_user(
                    pool,
                    context.user_id,
                    context.can_access_all_projects,
                )
                .await?
            } else {
                Vec::new()
            };
            let project_summaries = match current_project_key.as_ref() {
                Some(project_key) => project_summaries
                    .into_iter()
                    .filter(|project| project.project_key == *project_key)
                    .collect::<Vec<_>>(),
                None => project_summaries,
            };
            let pending_by_project =
                projects::list_project_pending_counts_for_user(pool, context.user_id)
                    .await?
                    .into_iter()
                    .map(|counts| (counts.project_id, counts))
                    .collect::<HashMap<_, _>>();
            let work_item_summaries = if can_view_work_items {
                match current_project_key.as_ref() {
                    Some(project_key) => {
                        projects::list_work_item_summaries_filtered_for_user(
                            pool,
                            context.user_id,
                            context.can_access_all_projects,
                            projects::WorkItemListFilter {
                                project_key: project_key.clone(),
                                ..projects::WorkItemListFilter::default()
                            },
                        )
                        .await?
                    }
                    None => {
                        projects::list_work_item_summaries_for_user(
                            pool,
                            context.user_id,
                            context.can_access_all_projects,
                            None,
                        )
                        .await?
                    }
                }
            } else {
                Vec::new()
            };
            let activity_summaries = if can_view_projects {
                match current_project_key.as_ref() {
                    Some(project_key) => {
                        projects::list_project_activities_by_key(pool, project_key, 5).await?
                    }
                    None => {
                        projects::list_recent_activities_for_user(
                            pool,
                            context.user_id,
                            context.can_access_all_projects,
                            5,
                        )
                        .await?
                    }
                }
            } else {
                Vec::new()
            };
            (
                metrics_from_data(&project_summaries, &work_item_summaries),
                project_summaries
                    .into_iter()
                    .map(|project| {
                        let pending = pending_by_project
                            .get(&project.id)
                            .cloned()
                            .unwrap_or_default();
                        project_from_summary_with_pending(project, pending)
                    })
                    .collect(),
                risk_items_from_work_items(&work_item_summaries),
                activity_summaries
                    .into_iter()
                    .map(activity_from_summary)
                    .collect(),
            )
        }
        None => (
            sample_metrics(),
            sample_projects(),
            risk_items_from_work_items(&sample_domain_work_items(None)),
            sample_activities(),
        ),
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
        has_risk_items: !risk_items.is_empty(),
        risk_items,
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
    let system_nav = build_system_nav(pool, user.id, can_access_all_projects).await?;
    let (current_project, topbar_project_options) =
        build_project_context(pool, user.id, can_access_all_projects).await?;

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
    let system_nav = build_system_nav(pool, user.id, can_access_all_projects).await?;
    let (current_project, topbar_project_options) =
        build_project_context(pool, user.id, can_access_all_projects).await?;
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

async fn build_system_nav(
    pool: &SqlitePool,
    user_id: i64,
    can_access_all_projects: bool,
) -> AppResult<SystemNav> {
    let dashboard = rbac::user_has_permission(pool, user_id, "system.dashboard.view").await?;
    let users = rbac::user_has_permission(pool, user_id, "system.users.view").await?;
    let roles = rbac::user_has_permission(pool, user_id, "system.roles.view").await?;
    let storage = rbac::user_has_permission(pool, user_id, "system.storage.view").await?;
    let audit = rbac::user_has_permission(pool, user_id, "system.audit.view").await?;
    let assignment_counts =
        projects::count_pending_assigned_work_items(pool, user_id, can_access_all_projects).await?;

    Ok(SystemNav {
        visible: dashboard || users || roles || storage || audit,
        dashboard,
        users,
        roles,
        storage,
        audit,
        requirements_badge: topnav_badge(assignment_counts.requirements),
        tasks_badge: topnav_badge(assignment_counts.tasks),
        bugs_badge: topnav_badge(assignment_counts.bugs),
    })
}

fn topnav_badge(count: i64) -> String {
    match count {
        count if count <= 0 => String::new(),
        count if count > 99 => "99+".to_string(),
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

fn redirect_with_session(state: &AppState, raw_token: String, htmx: bool) -> AppResult<Response> {
    let cookie = auth::session_cookie_header_with_max_age(
        &raw_token,
        state.settings.session_ttl_seconds()?,
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

fn with_csrf_cookie(
    state: &AppState,
    csrf_token: &str,
    mut response: Response,
) -> AppResult<Response> {
    response.headers_mut().insert(
        header::SET_COOKIE,
        csrf::cookie_header(csrf_token, state.settings.env == "production").parse()?,
    );
    Ok(response)
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

fn metrics_from_data(
    projects: &[projects::ProjectSummary],
    work_items: &[projects::WorkItemSummary],
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
    let on_hold_projects = projects
        .iter()
        .filter(|project| project.status == "on_hold")
        .count();
    let pending_tasks = work_items
        .iter()
        .filter(|item| item.item_type == "task" && is_open_status(&item.status))
        .count();
    let unresolved_bugs = work_items
        .iter()
        .filter(|item| item.item_type == "bug" && is_open_status(&item.status))
        .count();
    let high_priority_bugs = work_items
        .iter()
        .filter(|item| {
            item.item_type == "bug"
                && is_open_status(&item.status)
                && is_high_priority_code(&item.priority)
        })
        .count();
    let completed_items = work_items
        .iter()
        .filter(|item| is_completed_status(&item.status))
        .count();

    vec![
        Metric {
            label: "进行中项目",
            value: active_projects.to_string(),
            hint: format!("{on_hold_projects} 个已暂停"),
            tone: "info",
        },
        Metric {
            label: "待处理任务",
            value: pending_tasks.to_string(),
            hint: "开放状态任务".to_string(),
            tone: "warning",
        },
        Metric {
            label: "未解决 Bug",
            value: unresolved_bugs.to_string(),
            hint: format!("{high_priority_bugs} 个紧急/高"),
            tone: "danger",
        },
        Metric {
            label: "已完成",
            value: completed_items.to_string(),
            hint: "已完成 / 已解决 / 已验证".to_string(),
            tone: "ok",
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
        open_work_items: project.open_work_item_count,
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
    AttachmentView {
        id: attachment.id,
        file_object_id: attachment.file_object_id,
        filename: attachment.original_filename,
        content_type: attachment.content_type,
        is_previewable_image,
        is_previewable_video,
        byte_size: format_byte_size(attachment.byte_size),
        status_code: attachment.status,
        status: status.to_string(),
        status_tone,
        created_by: fallback_text(attachment.created_by_display_name, "系统"),
        created_at: display_timestamp(attachment.created_at),
        object_key: attachment.object_key,
    }
}

fn project_detail_summary(
    requirements: &[WorkItem],
    tasks: &[WorkItem],
    bugs: &[WorkItem],
    members: &[ProjectMemberView],
) -> ProjectDetailSummary {
    let open_items = requirements
        .iter()
        .chain(tasks)
        .chain(bugs)
        .filter(|item| {
            !matches!(
                item.status.as_str(),
                "已完成" | "已解决" | "已验证" | "已关闭"
            )
        })
        .count();

    ProjectDetailSummary {
        requirements: requirements.len(),
        tasks: tasks.len(),
        bugs: bugs.len(),
        open_items,
        members: members.len(),
    }
}

fn work_item_from_summary(item: projects::WorkItemSummary) -> WorkItem {
    let (kind, status, status_tone) = work_item_labels(&item.item_type, &item.status);
    let priority = priority_label(&item.priority).to_string();
    WorkItem {
        key: item.item_key,
        kind: kind.to_string(),
        title: item.title,
        project: format!("{} · {}", item.project_key, item.project_name),
        assignee: fallback_text(item.assignee_display_name, "未分配"),
        priority_code: item.priority,
        priority,
        status: status.to_string(),
        status_tone,
    }
}

fn risk_items_from_work_items(items: &[projects::WorkItemSummary]) -> Vec<RiskItem> {
    let mut risk_items = items
        .iter()
        .filter(|item| is_open_status(&item.status) && is_high_priority_code(&item.priority))
        .cloned()
        .collect::<Vec<_>>();
    risk_items.sort_by(|left, right| {
        priority_rank(&left.priority)
            .cmp(&priority_rank(&right.priority))
            .then_with(|| left.updated_at.cmp(&right.updated_at).reverse())
            .then_with(|| left.item_key.cmp(&right.item_key))
    });
    risk_items
        .into_iter()
        .take(5)
        .map(risk_item_from_summary)
        .collect()
}

fn risk_item_from_summary(item: projects::WorkItemSummary) -> RiskItem {
    let (_, status, status_tone) = work_item_labels(&item.item_type, &item.status);
    RiskItem {
        key: item.item_key.clone(),
        title: item.title,
        project: format!("{} · {}", item.project_key, item.project_name),
        assignee: fallback_text(item.assignee_display_name, "未分配"),
        priority: priority_label(&item.priority).to_string(),
        status: status.to_string(),
        status_tone,
        url: format!("/web/work-items/{}", item.item_key),
    }
}

fn work_item_detail_from_domain(item: projects::WorkItemDetail) -> WorkItemDetailView {
    let (kind, status, status_tone) = work_item_labels(&item.item_type, &item.status);
    let priority = priority_label(&item.priority).to_string();
    WorkItemDetailView {
        id: item.id,
        key: item.item_key,
        kind: kind.to_string(),
        title: item.title,
        description: item.description,
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
        title: notification.title,
        body: notification.body,
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
    let parent_author = if comment.parent_comment_id.is_some() {
        fallback_text(comment.parent_author_display_name, "原评论作者")
    } else {
        String::new()
    };
    WorkItemComment {
        id: comment.id,
        parent_comment_id: comment.parent_comment_id,
        parent_author,
        reply_depth: 0,
        body,
        author: fallback_text(comment.author_display_name, "系统"),
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

fn flatten_comment_threads(comments: Vec<WorkItemComment>) -> Vec<WorkItemComment> {
    let all_ids = comments
        .iter()
        .map(|comment| comment.id)
        .collect::<HashSet<_>>();
    let mut child_ids = HashMap::<i64, Vec<i64>>::new();
    let mut root_ids = Vec::new();
    let order = comments
        .iter()
        .map(|comment| comment.id)
        .collect::<Vec<_>>();
    for comment in &comments {
        match comment.parent_comment_id {
            Some(parent_id) if all_ids.contains(&parent_id) && !comment.is_flow => {
                child_ids.entry(parent_id).or_default().push(comment.id);
            }
            _ => root_ids.push(comment.id),
        }
    }
    let mut nodes = comments
        .into_iter()
        .map(|comment| (comment.id, comment))
        .collect::<HashMap<_, _>>();
    let mut flattened = Vec::new();

    fn append_thread(
        id: i64,
        depth: usize,
        nodes: &mut HashMap<i64, WorkItemComment>,
        child_ids: &HashMap<i64, Vec<i64>>,
        flattened: &mut Vec<WorkItemComment>,
    ) {
        let Some(mut comment) = nodes.remove(&id) else {
            return;
        };
        comment.reply_depth = depth.min(4);
        flattened.push(comment);
        if let Some(children) = child_ids.get(&id) {
            for child_id in children {
                append_thread(*child_id, depth + 1, nodes, child_ids, flattened);
            }
        }
    }

    for root_id in root_ids {
        append_thread(root_id, 0, &mut nodes, &child_ids, &mut flattened);
    }
    for id in order {
        append_thread(id, 0, &mut nodes, &child_ids, &mut flattened);
    }
    flattened
}

fn comment_with_attachments(
    mut comment: WorkItemComment,
    attachments: Vec<files::FileAttachmentSummary>,
) -> WorkItemComment {
    comment.attachments = attachments
        .into_iter()
        .map(attachment_from_summary)
        .collect::<Vec<_>>();
    comment.has_attachments = !comment.attachments.is_empty();
    comment
}

fn work_item_comment_body_for_display(body: &str, is_flow: bool) -> String {
    if !is_flow {
        return body.to_string();
    }

    body.split('；')
        .map(|part| {
            part.strip_prefix("负责人：")
                .map(|value| format!("处理人：{value}"))
                .unwrap_or_else(|| part.to_string())
        })
        .collect::<Vec<_>>()
        .join("；")
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

fn selected_role_summary<'a>(
    roles: &'a [rbac::RoleSummary],
    requested_role_code: &str,
) -> Option<&'a rbac::RoleSummary> {
    let requested_role_code = requested_role_code.trim();
    if !requested_role_code.is_empty() {
        return roles
            .iter()
            .find(|role| role.role_code == requested_role_code)
            .or_else(|| roles.first());
    }

    roles.first()
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

async fn storage_versions_for_view(pool: &SqlitePool) -> AppResult<Vec<StorageConfigVersionView>> {
    Ok(storage::list_config_versions(pool)
        .await?
        .into_iter()
        .map(storage_config_version_view_from_domain)
        .collect())
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
        return Err(AppError::BadRequest("附件已删除，不能下载".to_string()));
    }
    if attachment.status != "uploaded" {
        return Err(AppError::BadRequest(
            "附件尚未上传完成，不能下载".to_string(),
        ));
    }

    let test_memory_object =
        storage::read_test_memory_object(pool, &state.settings, &attachment.object_key).await?;
    let signed = if test_memory_object.is_none() {
        Some(
            storage::presign_download_url(
                pool,
                &state.settings,
                &attachment.object_key,
                storage::DEFAULT_DOWNLOAD_URL_TTL_SECONDS as u64,
            )
            .await?,
        )
    } else {
        None
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

    if let Some((content_type, content)) = test_memory_object {
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
        return Ok(response);
    }

    Ok(Redirect::temporary(&signed.expect("signed request should exist").url).into_response())
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
        contact: user_contact(user.email, user.mobile),
        roles: fallback_text(user.role_names, "未分配"),
        status: status.to_string(),
        status_tone,
        created_at: display_timestamp(user.created_at),
        updated_at: display_timestamp(user.updated_at),
        is_super_admin: user.is_super_admin,
    }
}

fn my_summary(projects: &[ProjectRow], assigned_items: &[WorkItem]) -> MySummary {
    MySummary {
        project_count: projects.len(),
        assigned_count: assigned_items.len(),
        open_count: assigned_items
            .iter()
            .filter(|item| {
                !matches!(
                    item.status.as_str(),
                    "已完成" | "已解决" | "已验证" | "已关闭"
                )
            })
            .count(),
        high_priority_count: assigned_items
            .iter()
            .filter(|item| is_high_priority_code(&item.priority_code))
            .count(),
    }
}

fn search_result_from_hit(hit: projects::SearchHit) -> SearchResult {
    SearchResult {
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
    let mut comments = Vec::new();
    for comment in projects::list_work_item_comments(pool, item.id).await? {
        let attachments = files::list_attachments(pool, "comment", comment.id).await?;
        comments.push(comment_with_attachments(
            comment_from_summary(comment),
            attachments,
        ));
    }

    Ok(Some((
        work_item_detail_from_domain(item),
        flatten_comment_threads(comments),
    )))
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

    Ok(Some((
        work_item_detail_from_domain(item),
        flatten_comment_threads(comments),
    )))
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
        open_work_items: projects.iter().map(|project| project.open_work_items).sum(),
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
    let offset = pagination.offset().min(usize::MAX as i64) as usize;
    projects
        .into_iter()
        .skip(offset)
        .take(pagination.per_page as usize)
        .collect()
}

fn work_item_list_summary(items: &[WorkItem], total_items: i64) -> WorkItemListSummary {
    WorkItemListSummary {
        total_items,
        open_items: items
            .iter()
            .filter(|item| {
                !matches!(
                    item.status.as_str(),
                    "已完成" | "已解决" | "已验证" | "已关闭"
                )
            })
            .count(),
        high_priority_items: items
            .iter()
            .filter(|item| is_high_priority_code(&item.priority_code))
            .count(),
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
    let offset = pagination.offset().min(usize::MAX as i64) as usize;
    items
        .into_iter()
        .skip(offset)
        .take(pagination.per_page as usize)
        .collect()
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
    let mut values = vec![current_status];
    for status in projects::allowed_work_item_status_transitions(current_status)? {
        let relevant = match item_kind {
            "Bug" => matches!(
                *status,
                "open" | "in_progress" | "resolved" | "verified" | "closed"
            ),
            "需求" | "任务" => matches!(*status, "open" | "in_progress" | "done" | "closed"),
            _ => true,
        };
        if relevant {
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
                selected: status == current_status,
            })
        })
        .collect()
}

fn is_open_status(status: &str) -> bool {
    !matches!(
        status,
        "done" | "closed" | "resolved" | "verified" | "cancelled"
    )
}

fn is_completed_status(status: &str) -> bool {
    matches!(status, "done" | "closed" | "resolved" | "verified")
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

fn data_scope_label(data_scope_type: &str) -> &'static str {
    match data_scope_type {
        "all" => "全部数据",
        "self" => "本人数据",
        _ => "自定义",
    }
}

fn work_item_labels(item_type: &str, status: &str) -> (&'static str, &'static str, &'static str) {
    let kind = match item_type {
        "requirement" => "需求",
        "task" => "任务",
        "bug" => "Bug",
        _ => "工作项",
    };
    let (status, tone) = match status {
        "open" => ("待处理", "warning"),
        "in_progress" => ("进行中", "info"),
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
        "deleted" => ("已删除", "danger"),
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

fn priority_rank(priority: &str) -> i32 {
    match priority {
        "P0" => 0,
        "P1" => 1,
        "P2" => 2,
        "P3" => 3,
        _ => 9,
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
        Some("info") => "info",
        Some("members") => "members",
        Some("files") | Some("attachments") => "files",
        Some("activities") => "activities",
        _ => "work",
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
            hint: "待启动 / 进行中 / 验收中".to_string(),
            tone: "info",
        },
        Metric {
            label: "待处理任务",
            value: "2".to_string(),
            hint: "开放状态任务".to_string(),
            tone: "warning",
        },
        Metric {
            label: "未解决 Bug",
            value: "1".to_string(),
            hint: "1 个紧急/高".to_string(),
            tone: "danger",
        },
        Metric {
            label: "已完成",
            value: "2".to_string(),
            hint: "已完成 / 已验证".to_string(),
            tone: "ok",
        },
    ]
}

fn sample_user_profile() -> UserProfileView {
    UserProfileView {
        username: "yuance_admin".to_string(),
        display_name: "系统管理员".to_string(),
        email: String::new(),
        mobile: String::new(),
        contact: "未填写".to_string(),
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
            open_work_items: 2,
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
            open_work_items: 1,
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
            open_work_items: 1,
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
            has_requirements: !requirements.is_empty(),
            has_tasks: !tasks.is_empty(),
            has_bugs: !bugs.is_empty(),
            has_activities: !activities.is_empty(),
            summary,
            requirements,
            tasks,
            bugs,
            members,
            has_member_candidates: !member_candidates.is_empty(),
            member_candidates,
            has_attachments: false,
            attachments: Vec::new(),
            activities,
            project_item_type_options: work_item_type_options(),
            can_edit_project: true,
            can_manage_project: true,
            can_manage_work_items: true,
            active_tab: "work",
        })?
        .into_response(),
    )
}

fn render_sample_work_item_detail_page(
    state: &AppState,
    context: WebContext<'_>,
) -> AppResult<Response> {
    let partial = sample_work_item_detail_partial();
    let status_options = work_item_status_options(&partial.item.kind, &partial.item.status_code)?;
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
            can_manage_work_items: true,
            can_restore_work_items: true,
        })?
        .into_response(),
    )
}

fn sample_work_item_detail_partial() -> WorkItemDetailPartialTemplate {
    let status_options = work_item_status_options("任务", "in_progress")
        .expect("sample work item statuses should be valid");
    WorkItemDetailPartialTemplate {
        csrf_token: "sample-csrf-token".to_string(),
        status_options,
        item: WorkItemDetailView {
            id: 2,
            key: "YCE-TASK-2".to_string(),
            kind: "任务".to_string(),
            title: "设计项目与工作项数据模型".to_string(),
            description: "落地项目、成员、需求、任务、Bug、评论和动态表。".to_string(),
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
            reply_depth: 0,
            body: "先统一项目与工作项查询模型，再继续补页面交互。".to_string(),
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
        has_comments: true,
        can_manage_work_items: true,
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flow_comment_display_renames_legacy_assignee_label() {
        assert_eq!(
            work_item_comment_body_for_display("负责人：张三 → 李四", true),
            "处理人：张三 → 李四"
        );
        assert_eq!(
            work_item_comment_body_for_display(
                "状态：待处理 → 进行中；负责人：张三 → 李四；说明：负责人：不要改",
                true
            ),
            "状态：待处理 → 进行中；处理人：张三 → 李四；说明：负责人：不要改"
        );
        assert_eq!(
            work_item_comment_body_for_display("负责人：张三", false),
            "负责人：张三"
        );
    }
}
