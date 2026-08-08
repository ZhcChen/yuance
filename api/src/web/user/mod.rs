use std::collections::{HashMap, HashSet};

use askama::Template;
use axum::{
    Form,
    extract::{OriginalUri, Path, Query, RawForm, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Redirect, Response},
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::{
    domains::{
        audit, auth,
        bootstrap::{self, BootstrapInitInput},
        files, notifications, project_resources, projects, rbac, storage, system_api_tokens,
        system_releases, users,
    },
    platform::error::{AppError, AppResult},
    platform::security::csrf,
    web::{
        attachment_preview::{
            AttachmentPreviewStrategy, file_type as attachment_preview_file_type,
            strategy as attachment_preview_strategy,
        },
        audit_context, response,
        router::AppState,
        test_storage::bind_test_storage_download_grant,
    },
};

#[derive(Debug, Clone)]
struct ProjectOption {
    key: String,
    name: String,
    assigned_pending_count: i64,
}

#[derive(Debug, Clone)]
struct CurrentProjectView {
    key: String,
    name: String,
    topbar_pending_count: i64,
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
struct SystemNav {
    visible: bool,
    dashboard: bool,
    users: bool,
    roles: bool,
    storage: bool,
    openapi: bool,
    releases: bool,
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
            openapi: true,
            releases: true,
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
    assigned_projects: Vec<UserAssignedProjectView>,
    assigned_project_count: usize,
    assigned_project_overflow_count: usize,
    assigned_projects_json: String,
}

#[derive(Debug, Clone, Serialize)]
struct UserAssignedProjectView {
    key: String,
    name: String,
    status: String,
    status_tone: &'static str,
    role_code: String,
    role: String,
    active_assigned_count: i64,
    can_remove: bool,
    can_update_role: bool,
    remove_block_reason: String,
}

#[derive(Debug, Clone)]
struct UserProjectAssignmentOptionView {
    key: String,
    name: String,
    owner: String,
    status: String,
    summary: String,
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
struct SystemApiTokenView {
    id: i64,
    name: String,
    scopes_label: String,
    scope_options: Vec<SystemApiTokenScopeOptionView>,
    token_suffix: String,
    copy_text: String,
    can_copy_raw_token: bool,
    created_by: String,
    updated_by: String,
    last_used_at: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone)]
struct SystemApiTokenScopeOptionView {
    key: &'static str,
    label: &'static str,
    selected: bool,
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

#[derive(Debug, Clone)]
struct SystemReleaseSettingsView {
    retention_count: i64,
    updated_by: String,
    updated_at: String,
}

#[derive(Debug, Clone)]
struct SystemReleaseAssetView {
    id: i64,
    platform: String,
    architecture: String,
    filename: String,
    content_type: String,
    byte_size: String,
    status: String,
    status_tone: &'static str,
    created_at: String,
    download_url: String,
}

#[derive(Debug, Clone)]
struct SystemReleaseRow {
    id: i64,
    version_name: String,
    title: String,
    notes: String,
    status_code: String,
    status: String,
    status_tone: &'static str,
    channel: String,
    verification_status: String,
    signing_key_id: String,
    github_withdrawal_status: String,
    published_at: String,
    created_by: String,
    updated_by: String,
    created_at: String,
    updated_at: String,
    asset_count: i64,
    platform_count: i64,
    assets: Vec<SystemReleaseAssetView>,
    has_assets: bool,
}

#[derive(Debug, Clone)]
struct SystemReleasesPageView {
    releases: Vec<SystemReleaseRow>,
    has_releases: bool,
    pagination: PaginationView,
    pagination_pages: Vec<PaginationPageView>,
}

#[derive(Debug, Clone)]
struct SystemOpenApiPageView {
    tokens: Vec<SystemApiTokenView>,
    has_tokens: bool,
    token_active_count: usize,
    token_limit: i64,
    can_create_token: bool,
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
#[template(path = "web/document_preview.html")]
struct DocumentPreviewTemplate {
    title: String,
    source_url: String,
    source_label: String,
    kind_label: String,
    preview_type: String,
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
    preview_content_url: String,
    has_pdf_preview: bool,
    is_experimental_preview: bool,
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

#[derive(Template)]
#[template(path = "web/login.html")]
struct LoginTemplate {
    csrf_token: String,
    error_message: String,
    return_to: String,
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
#[template(path = "web/system/releases.html")]
struct SystemReleasesTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    topbar_project_options: Vec<ProjectOption>,
    settings: SystemReleaseSettingsView,
    releases: Vec<SystemReleaseRow>,
    has_releases: bool,
    pagination: PaginationView,
    pagination_pages: Vec<PaginationPageView>,
    message: String,
    message_tone: &'static str,
    can_manage_releases: bool,
}

#[derive(Debug, Clone)]
struct DesktopDownloadLinkView {
    available: bool,
    url: String,
    filename: String,
    byte_size: String,
}

#[derive(Debug, Clone)]
struct DesktopDownloadPlatformView {
    name: &'static str,
    x64: DesktopDownloadLinkView,
    arm64: DesktopDownloadLinkView,
}

#[derive(Template)]
#[template(path = "web/desktop_downloads.html")]
struct DesktopDownloadsTemplate {
    has_release: bool,
    version_name: String,
    title: String,
    notes: String,
    published_at: String,
    is_internal: bool,
    signing_key_id: String,
    platforms: Vec<DesktopDownloadPlatformView>,
}

#[derive(Template)]
#[template(path = "web/system/openapi.html")]
struct SystemOpenApiTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    current_project: Option<CurrentProjectView>,
    topbar_project_options: Vec<ProjectOption>,
    tokens: Vec<SystemApiTokenView>,
    has_tokens: bool,
    token_active_count: usize,
    token_limit: i64,
    can_create_token: bool,
    can_manage_tokens: bool,
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
    project_assignment_options: Vec<UserProjectAssignmentOptionView>,
    has_project_assignment_options: bool,
    has_users: bool,
    pagination: PaginationView,
    pagination_pages: Vec<PaginationPageView>,
    can_manage_users: bool,
    can_manage_user_projects: bool,
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
    #[serde(default)]
    return_to: String,
    username: String,
    password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginQuery {
    #[serde(default)]
    return_to: String,
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

#[derive(Debug)]
struct ParsedSystemUserProjectAssignForm {
    csrf_token: String,
    page: Option<i64>,
    per_page: Option<i64>,
    project_keys: Vec<String>,
    member_role: String,
}

#[derive(Debug)]
struct ParsedSystemUserProjectRemoveForm {
    csrf_token: String,
    page: Option<i64>,
    per_page: Option<i64>,
    project_keys: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct SystemUserProjectRemoveForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct SystemUserProjectRoleForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
    member_role: String,
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
pub struct SystemReleasesQuery {
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSystemReleaseForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    version_name: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    notes: String,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSystemReleaseForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    version_name: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    notes: String,
    #[serde(default)]
    publish: String,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSystemReleaseSettingsForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    retention_count: i64,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
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
pub struct ResourceAccessQuery {
    #[serde(default)]
    access: String,
}

#[derive(Debug, Deserialize)]
pub struct SystemApiTokenCreateForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    name: String,
    #[serde(default)]
    scopes: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct SystemApiTokenUpdateForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    name: String,
    #[serde(default)]
    scopes: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct SystemApiTokenDeleteForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
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
    retired_shared_web_app_response(&state, &headers, "/web").await
}

pub async fn me_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
) -> AppResult<Response> {
    retired_shared_web_app_response(
        &state,
        &headers,
        original_uri
            .path_and_query()
            .map_or(original_uri.path(), |value| value.as_str()),
    )
    .await
}

pub async fn search_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
) -> AppResult<Response> {
    retired_shared_web_app_response(
        &state,
        &headers,
        original_uri
            .path_and_query()
            .map_or(original_uri.path(), |value| value.as_str()),
    )
    .await
}

pub async fn messages_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
) -> AppResult<Response> {
    retired_shared_web_app_response(
        &state,
        &headers,
        original_uri
            .path_and_query()
            .map_or(original_uri.path(), |value| value.as_str()),
    )
    .await
}

pub async fn projects_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
) -> AppResult<Response> {
    retired_shared_web_app_response(
        &state,
        &headers,
        original_uri
            .path_and_query()
            .map_or(original_uri.path(), |value| value.as_str()),
    )
    .await
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
    let pool = context.pool;
    if let Some(pool) = pool {
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

    let return_to = project_switch_return_to(pool, &form.return_to, &selected_project_key).await?;
    Ok(Redirect::to(&return_to).into_response())
}

pub async fn project_detail_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
    Path(_project_key): Path<String>,
) -> AppResult<Response> {
    retired_shared_web_app_response(
        &state,
        &headers,
        original_uri
            .path_and_query()
            .map_or(original_uri.path(), |value| value.as_str()),
    )
    .await
}

pub async fn project_cycle_detail_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
    Path((_project_key, _cycle_id)): Path<(String, i64)>,
) -> AppResult<Response> {
    retired_shared_web_app_response(
        &state,
        &headers,
        original_uri
            .path_and_query()
            .map_or(original_uri.path(), |value| value.as_str()),
    )
    .await
}

pub async fn project_personal_analysis_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
    Path(_project_key): Path<String>,
) -> AppResult<Response> {
    retired_shared_web_app_response(
        &state,
        &headers,
        original_uri
            .path_and_query()
            .map_or(original_uri.path(), |value| value.as_str()),
    )
    .await
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
            state.settings.experimental_legacy_preview_enabled(),
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
        return attachment_document_preview_content_response(
            &state,
            pool,
            context.user_id,
            attachment,
        )
        .await;
    }

    Ok(Redirect::to("/web/projects/YCE").into_response())
}

pub async fn project_resource_detail_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
    Path((_project_key, _resource_id)): Path<(String, i64)>,
    Query(_query): Query<ResourceAccessQuery>,
) -> AppResult<Response> {
    retired_shared_web_app_response(
        &state,
        &headers,
        original_uri
            .path_and_query()
            .map_or(original_uri.path(), |value| value.as_str()),
    )
    .await
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
            && !project_resources::verify_resource_access_token(
                pool,
                &state.settings.security_master_key,
                &query.access,
                context.user_id,
                resource.id,
            )
            .await?
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
            && !project_resources::verify_resource_access_token(
                pool,
                &state.settings.security_master_key,
                &query.access,
                context.user_id,
                resource.id,
            )
            .await?
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
            state.settings.experimental_legacy_preview_enabled(),
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
            && !project_resources::verify_resource_access_token(
                pool,
                &state.settings.security_master_key,
                &query.access,
                context.user_id,
                resource.id,
            )
            .await?
        {
            return Err(AppError::Forbidden("请先验证资料访问密码".to_string()));
        }
        let attachment =
            files::get_attachment_for_target(pool, attachment_id, "project_resource", resource.id)
                .await?;
        return attachment_document_preview_content_response(
            &state,
            pool,
            context.user_id,
            attachment,
        )
        .await;
    }

    Ok(Redirect::to("/web/projects/YCE?tab=library").into_response())
}

pub async fn requirements_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
) -> AppResult<Response> {
    retired_shared_web_app_response(
        &state,
        &headers,
        original_uri
            .path_and_query()
            .map_or(original_uri.path(), |value| value.as_str()),
    )
    .await
}

pub async fn tasks_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
) -> AppResult<Response> {
    retired_shared_web_app_response(
        &state,
        &headers,
        original_uri
            .path_and_query()
            .map_or(original_uri.path(), |value| value.as_str()),
    )
    .await
}

pub async fn bugs_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
) -> AppResult<Response> {
    retired_shared_web_app_response(
        &state,
        &headers,
        original_uri
            .path_and_query()
            .map_or(original_uri.path(), |value| value.as_str()),
    )
    .await
}

pub async fn work_item_detail_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
    Path(_item_key): Path<String>,
) -> AppResult<Response> {
    retired_shared_web_app_response(
        &state,
        &headers,
        original_uri
            .path_and_query()
            .map_or(original_uri.path(), |value| value.as_str()),
    )
    .await
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
        let Some(item) = projects::get_work_item_detail(pool, &item_key).await? else {
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
        let Some(item) = projects::get_work_item_detail(pool, &item_key).await? else {
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
            state.settings.experimental_legacy_preview_enabled(),
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
        let Some(item) = projects::get_work_item_detail(pool, &item_key).await? else {
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
        return attachment_document_preview_content_response(
            &state,
            pool,
            context.user_id,
            attachment,
        )
        .await;
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
                item.item_key
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
            state.settings.experimental_legacy_preview_enabled(),
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
                item.item_key, comment.id
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
        return attachment_document_preview_content_response(
            &state,
            pool,
            context.user_id,
            attachment,
        )
        .await;
    }

    Ok(Redirect::to("/web/work-items/YCE-TASK-2").into_response())
}

pub async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<LoginQuery>,
) -> AppResult<Response> {
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
    let return_to = safe_web_return_to(&query.return_to).to_string();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(LoginTemplate {
            csrf_token: csrf_token.clone(),
            error_message: String::new(),
            return_to,
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
                    csrf_token: csrf_token.clone(),
                    error_message: message,
                    return_to: safe_web_return_to(&form.return_to).to_string(),
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
    redirect_with_session(
        &state,
        session,
        is_htmx(&headers),
        safe_web_return_to(&form.return_to),
    )
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
    redirect_with_session(&state, session, is_htmx(&headers), "/web")
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
    OriginalUri(original_uri): OriginalUri,
) -> AppResult<Response> {
    if let Some(response) = shared_system_web_app_response(
        &state,
        &headers,
        original_uri.path(),
        "system.dashboard.view",
    )
    .await?
    {
        return Ok(response);
    }
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

pub async fn system_openapi_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
) -> AppResult<Response> {
    if let Some(response) = shared_system_web_app_response(
        &state,
        &headers,
        original_uri.path(),
        "system.api_tokens.view",
    )
    .await?
    {
        return Ok(response);
    }
    let context =
        match system_context_or_redirect(&state, &headers, "system.api_tokens.view").await? {
            Ok(context) => context,
            Err(response) => return Ok(response),
        };
    render_system_openapi_template(&state, context).await
}

pub async fn system_api_token_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    RawForm(form): RawForm,
) -> AppResult<Response> {
    let form = parse_system_api_token_create_form(&form)?;
    csrf::verify(&headers, &form.csrf_token)?;
    let context =
        match system_context_or_redirect(&state, &headers, "system.api_tokens.manage").await? {
            Ok(context) => context,
            Err(response) => return Ok(response),
        };
    if let Some(pool) = state.pool.as_ref() {
        let created = system_api_tokens::create_token(
            pool,
            &state.settings.security_master_key,
            context.user_id,
            system_api_tokens::CreateSystemApiTokenInput {
                name: form.name,
                scopes: form.scopes,
            },
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "system.api_token.create",
            "system_api_token",
            &created.token.id.to_string(),
            r#"{"source":"web"}"#,
        )
        .await?;
    }
    Ok(Redirect::to("/web/system/openapi").into_response())
}

pub async fn system_api_token_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(token_id): Path<i64>,
    RawForm(form): RawForm,
) -> AppResult<Response> {
    let form = parse_system_api_token_update_form(&form)?;
    csrf::verify(&headers, &form.csrf_token)?;
    let context =
        match system_context_or_redirect(&state, &headers, "system.api_tokens.manage").await? {
            Ok(context) => context,
            Err(response) => return Ok(response),
        };
    if let Some(pool) = state.pool.as_ref() {
        let updated = system_api_tokens::update_token(
            pool,
            context.user_id,
            token_id,
            system_api_tokens::UpdateSystemApiTokenInput {
                name: form.name,
                scopes: form.scopes,
            },
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "system.api_token.update",
            "system_api_token",
            &updated.id.to_string(),
            r#"{"source":"web"}"#,
        )
        .await?;
    }
    Ok(Redirect::to("/web/system/openapi").into_response())
}

pub async fn system_api_token_delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(token_id): Path<i64>,
    Form(form): Form<SystemApiTokenDeleteForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context =
        match system_context_or_redirect(&state, &headers, "system.api_tokens.manage").await? {
            Ok(context) => context,
            Err(response) => return Ok(response),
        };
    if let Some(pool) = state.pool.as_ref() {
        let token = system_api_tokens::delete_token(pool, token_id).await?;
        audit::record(
            pool,
            Some(context.user_id),
            "system.api_token.delete",
            "system_api_token",
            &token.id.to_string(),
            r#"{"source":"web"}"#,
        )
        .await?;
    }
    Ok(Redirect::to("/web/system/openapi").into_response())
}

pub async fn system_releases_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
    Query(query): Query<SystemReleasesQuery>,
) -> AppResult<Response> {
    let return_to = original_uri
        .path_and_query()
        .map(|value| value.as_str())
        .unwrap_or_else(|| original_uri.path());
    if let Some(response) =
        shared_system_web_app_response(&state, &headers, return_to, "system.releases.view").await?
    {
        return Ok(response);
    }
    let context = match system_context_or_redirect(&state, &headers, "system.releases.view").await?
    {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let requested_pagination = normalize_web_pagination(query.page, query.per_page)?;
    let page_view = system_releases_page_for_view(state.pool()?, requested_pagination).await?;
    let settings_view = system_release_settings_view_from_domain(
        system_releases::get_settings(state.pool()?).await?,
    );
    let can_manage_releases =
        rbac::user_has_permission(state.pool()?, context.user_id, "system.releases.manage").await?;
    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(SystemReleasesTemplate {
            active: "system-releases",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            settings: settings_view,
            releases: page_view.releases,
            has_releases: page_view.has_releases,
            pagination: page_view.pagination,
            pagination_pages: page_view.pagination_pages,
            message: String::new(),
            message_tone: "info",
            can_manage_releases,
        })?
        .into_response(),
    )
}

pub async fn system_releases_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(form): Form<CreateSystemReleaseForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context =
        match system_context_or_redirect(&state, &headers, "system.releases.manage").await? {
            Ok(context) => context,
            Err(response) => return Ok(response),
        };
    let requested_pagination = normalize_web_pagination(form.page, form.per_page)?;
    let created = system_releases::create_release(
        state.pool()?,
        context.user_id,
        system_releases::CreateSystemReleaseInput {
            version_name: form.version_name,
            title: form.title,
            notes: form.notes,
            channel: system_releases::RELEASE_CHANNEL_LEGACY.to_string(),
            manifest_sha256: String::new(),
            signing_key_id: String::new(),
            source_commit: String::new(),
            source_tag: String::new(),
        },
    )
    .await?;
    let request_context = audit_context::from_headers(&headers);
    audit::record_with_context(
        state.pool()?,
        Some(context.user_id),
        "system.release.create",
        "system_release",
        &created.release.id.to_string(),
        &format!(
            r#"{{"version_name":"{}","status":"{}"}}"#,
            created.release.version_name.replace('"', "\\\""),
            created.release.status
        ),
        &request_context,
    )
    .await?;
    render_system_releases_template(
        &state,
        context,
        requested_pagination,
        "版本草稿已创建，可继续上传各平台安装包。".to_string(),
        "success",
    )
    .await
}

pub async fn system_releases_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(release_id): Path<i64>,
    Form(form): Form<UpdateSystemReleaseForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context =
        match system_context_or_redirect(&state, &headers, "system.releases.manage").await? {
            Ok(context) => context,
            Err(response) => return Ok(response),
        };
    let requested_pagination = normalize_web_pagination(form.page, form.per_page)?;
    let updated = system_releases::update_release(
        state.pool()?,
        &state.settings,
        context.user_id,
        release_id,
        system_releases::UpdateSystemReleaseInput {
            version_name: form.version_name,
            title: form.title,
            notes: form.notes,
            publish: form.publish == "on",
        },
    )
    .await?;
    let request_context = audit_context::from_headers(&headers);
    audit::record_with_context(
        state.pool()?,
        Some(context.user_id),
        if form.publish == "on" {
            "system.release.publish"
        } else {
            "system.release.update"
        },
        "system_release",
        &updated.release.id.to_string(),
        &format!(
            r#"{{"version_name":"{}","status":"{}","asset_count":{}}}"#,
            updated.release.version_name.replace('"', "\\\""),
            updated.release.status,
            updated.release.asset_count
        ),
        &request_context,
    )
    .await?;
    render_system_releases_template(
        &state,
        context,
        requested_pagination,
        if form.publish == "on" {
            "版本已发布，并已按保留策略自动清理旧版本。".to_string()
        } else {
            "版本信息已更新。".to_string()
        },
        "success",
    )
    .await
}

pub async fn system_releases_settings_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(form): Form<UpdateSystemReleaseSettingsForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context =
        match system_context_or_redirect(&state, &headers, "system.releases.manage").await? {
            Ok(context) => context,
            Err(response) => return Ok(response),
        };
    let requested_pagination = normalize_web_pagination(form.page, form.per_page)?;
    let updated = system_releases::update_settings(
        state.pool()?,
        &state.settings,
        context.user_id,
        form.retention_count,
    )
    .await?;
    let request_context = audit_context::from_headers(&headers);
    audit::record_with_context(
        state.pool()?,
        Some(context.user_id),
        "system.release.settings.update",
        "system_release_settings",
        "1",
        &format!(r#"{{"retention_count":{}}}"#, updated.retention_count),
        &request_context,
    )
    .await?;
    render_system_releases_template(
        &state,
        context,
        requested_pagination,
        format!("版本保留数已更新为 {}。", updated.retention_count),
        "success",
    )
    .await
}

pub async fn system_release_asset_download(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((release_id, asset_id)): Path<(i64, i64)>,
) -> AppResult<Response> {
    let context = match system_context_or_redirect(&state, &headers, "system.releases.view").await?
    {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    system_releases::ensure_release_allows_download(state.pool()?, release_id).await?;
    let asset = system_releases::get_release_asset(state.pool()?, release_id, asset_id).await?;
    let mut request = storage::presign_download_url(
        state.pool()?,
        &state.settings,
        &asset.object_key,
        system_releases::INTERNAL_RELEASE_DOWNLOAD_TTL_SECONDS,
    )
    .await?;
    bind_test_storage_download_grant(
        &state,
        &asset.object_key,
        &asset.content_type,
        context.user_id,
        system_releases::INTERNAL_RELEASE_DOWNLOAD_TTL_SECONDS,
        &mut request,
    )?;
    if !request.headers.is_empty() {
        return Err(AppError::BadRequest(
            "当前版本包下载签名包含额外请求头，暂不支持浏览器直接跳转".to_string(),
        ));
    }
    let request_context = audit_context::from_headers(&headers);
    audit::record_with_context(
        state.pool()?,
        Some(context.user_id),
        "system.release.asset.download",
        "system_release",
        &release_id.to_string(),
        &format!(
            r#"{{"asset_id":{},"filename":"{}"}}"#,
            asset_id,
            asset.original_filename.replace('"', "\\\"")
        ),
        &request_context,
    )
    .await?;
    Ok(Redirect::temporary(&request.url).into_response())
}

pub async fn desktop_downloads_page(State(state): State<AppState>) -> AppResult<Response> {
    let latest_release =
        system_releases::get_latest_published_release_detail(state.pool()?).await?;
    Ok(response::html(desktop_downloads_template(latest_release))?.into_response())
}

pub async fn desktop_download_asset(
    State(state): State<AppState>,
    Path((release_id, asset_id)): Path<(i64, i64)>,
) -> AppResult<Response> {
    let asset =
        system_releases::get_published_release_asset(state.pool()?, release_id, asset_id).await?;

    if let Some((content_type, content)) =
        storage::read_test_memory_object(state.pool()?, &state.settings, &asset.object_key).await?
    {
        let mut response = content.into_response();
        let headers = response.headers_mut();
        headers.insert(header::CONTENT_TYPE, content_type.parse()?);
        headers.insert(header::X_CONTENT_TYPE_OPTIONS, "nosniff".parse()?);
        headers.insert(header::CONTENT_DISPOSITION, "attachment".parse()?);
        return Ok(response);
    }

    let request = storage::presign_download_url(
        state.pool()?,
        &state.settings,
        &asset.object_key,
        system_releases::INTERNAL_RELEASE_DOWNLOAD_TTL_SECONDS,
    )
    .await?;
    if !request.headers.is_empty() {
        return Err(AppError::BadRequest(
            "当前版本包下载签名包含额外请求头，暂不支持浏览器直接跳转".to_string(),
        ));
    }
    Ok(Redirect::temporary(&request.url).into_response())
}

pub async fn system_users_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
    Query(query): Query<SystemUsersQuery>,
) -> AppResult<Response> {
    let return_to = original_uri
        .path_and_query()
        .map(|value| value.as_str())
        .unwrap_or_else(|| original_uri.path());
    if let Some(response) =
        shared_system_web_app_response(&state, &headers, return_to, "system.users.view").await?
    {
        return Ok(response);
    }
    let context = match system_context_or_redirect(&state, &headers, "system.users.view").await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let pool = state.pool()?;
    let requested_pagination = normalize_web_pagination(query.page, query.per_page)?;
    let total_items = users::count_users(pool).await?;
    let total_pages = total_pages(total_items, requested_pagination.per_page);
    let page_number = requested_pagination.page.min(total_pages);
    let user_summaries =
        users::list_users_page(pool, page_number, requested_pagination.per_page).await?;
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
    let can_manage_user_projects = if can_manage_users {
        can_manage_system_user_projects(pool, context.user_id).await?
    } else {
        false
    };
    let project_assignment_options = if can_manage_user_projects {
        load_assignable_user_project_options(pool).await?
    } else {
        Vec::new()
    };
    let mut users = Vec::with_capacity(user_summaries.len());
    for user in user_summaries {
        let assigned_projects = if user.is_super_admin {
            Vec::new()
        } else {
            load_user_assigned_projects(pool, user.id).await?
        };
        users.push(user_row_from_summary(user, assigned_projects));
    }

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
            has_project_assignment_options: !project_assignment_options.is_empty(),
            project_assignment_options,
            pagination,
            pagination_pages,
            can_manage_users,
            can_manage_user_projects,
        })?
        .into_response(),
    )
}

pub async fn system_database_stats_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
) -> AppResult<Response> {
    let return_to = original_uri
        .path_and_query()
        .map(|value| value.as_str())
        .unwrap_or_else(|| original_uri.path());
    if let Some(response) =
        shared_system_web_app_response(&state, &headers, return_to, "system.database_stats.view")
            .await?
    {
        return Ok(response);
    }
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

pub async fn system_user_project_assign(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(username): Path<String>,
    RawForm(form): RawForm,
) -> AppResult<Response> {
    let form = parse_system_user_project_assign_form(&form)?;
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match system_context_or_redirect(&state, &headers, "system.users.manage").await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let pool = state.pool()?;
    if !can_manage_system_user_projects(pool, context.user_id).await? {
        return Err(AppError::Forbidden(
            "需要全项目管理权限才能直接分配项目".to_string(),
        ));
    }
    let redirect_url = system_users_redirect_url(form.page, form.per_page)?;
    let user = users::get_user_summary_by_username(pool, &username)
        .await?
        .ok_or_else(|| AppError::BadRequest("用户不存在".to_string()))?;
    if user.is_super_admin {
        return Err(AppError::BadRequest(
            "超级管理员默认拥有全项目访问，无需额外分配项目".to_string(),
        ));
    }

    let project_keys = normalize_non_empty_unique_strings(&form.project_keys);
    if project_keys.is_empty() {
        return Err(AppError::BadRequest(
            "请至少选择一个要分配的项目".to_string(),
        ));
    }

    let mut assigned_project_keys = Vec::new();
    for project_key in project_keys {
        let member = projects::add_project_member(
            pool,
            context.user_id,
            &project_key,
            &username,
            &form.member_role,
        )
        .await?;
        if member.username == username {
            assigned_project_keys.push(project_key);
        }
    }

    let project_keys_json =
        serde_json::to_string(&assigned_project_keys).unwrap_or_else(|_| "[]".to_string());
    let member_role_json =
        serde_json::to_string(&form.member_role).unwrap_or_else(|_| "\"member\"".to_string());
    audit::record(
        pool,
        Some(context.user_id),
        "user.project.assign",
        "user",
        &username,
        &format!(r#"{{"project_keys":{project_keys_json},"member_role":{member_role_json}}}"#),
    )
    .await?;

    Ok(Redirect::to(&redirect_url).into_response())
}

pub async fn system_user_project_remove(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((username, project_key)): Path<(String, String)>,
    Form(form): Form<SystemUserProjectRemoveForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match system_context_or_redirect(&state, &headers, "system.users.manage").await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let pool = state.pool()?;
    if !can_manage_system_user_projects(pool, context.user_id).await? {
        return Err(AppError::Forbidden(
            "需要全项目管理权限才能直接移除项目成员".to_string(),
        ));
    }
    let redirect_url = system_users_redirect_url(form.page, form.per_page)?;
    let user = users::get_user_summary_by_username(pool, &username)
        .await?
        .ok_or_else(|| AppError::BadRequest("用户不存在".to_string()))?;
    if user.is_super_admin {
        return Err(AppError::BadRequest(
            "超级管理员默认拥有全项目访问，不能通过这里移除项目".to_string(),
        ));
    }

    projects::remove_project_member(pool, context.user_id, &project_key, &username).await?;
    let project_key_json =
        serde_json::to_string(&project_key).unwrap_or_else(|_| "\"\"".to_string());
    audit::record(
        pool,
        Some(context.user_id),
        "user.project.remove",
        "user",
        &username,
        &format!(r#"{{"project_key":{project_key_json}}}"#),
    )
    .await?;

    Ok(Redirect::to(&redirect_url).into_response())
}

pub async fn system_user_project_remove_batch(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(username): Path<String>,
    RawForm(form): RawForm,
) -> AppResult<Response> {
    let form = parse_system_user_project_remove_form(&form)?;
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match system_context_or_redirect(&state, &headers, "system.users.manage").await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let pool = state.pool()?;
    if !can_manage_system_user_projects(pool, context.user_id).await? {
        return Err(AppError::Forbidden(
            "需要全项目管理权限才能直接移除项目成员".to_string(),
        ));
    }
    let redirect_url = system_users_redirect_url(form.page, form.per_page)?;
    let user = users::get_user_summary_by_username(pool, &username)
        .await?
        .ok_or_else(|| AppError::BadRequest("用户不存在".to_string()))?;
    if user.is_super_admin {
        return Err(AppError::BadRequest(
            "超级管理员默认拥有全项目访问，不能通过这里移除项目".to_string(),
        ));
    }

    let project_keys = normalize_non_empty_unique_strings(&form.project_keys);
    if project_keys.is_empty() {
        return Err(AppError::BadRequest(
            "请至少选择一个要移除的项目".to_string(),
        ));
    }

    let assigned_projects = load_user_assigned_projects(pool, user.id).await?;
    let assigned_project_map = assigned_projects
        .into_iter()
        .map(|project| (project.key.clone(), project))
        .collect::<HashMap<_, _>>();
    for project_key in &project_keys {
        let Some(project) = assigned_project_map.get(project_key) else {
            return Err(AppError::BadRequest(format!(
                "用户当前未加入项目 {project_key}"
            )));
        };
        if !project.can_remove {
            let reason = if project.remove_block_reason.is_empty() {
                "该项目当前不允许移除成员".to_string()
            } else {
                project.remove_block_reason.clone()
            };
            return Err(AppError::BadRequest(reason));
        }
    }

    for project_key in &project_keys {
        projects::remove_project_member(pool, context.user_id, project_key, &username).await?;
    }

    let project_keys_json =
        serde_json::to_string(&project_keys).unwrap_or_else(|_| "[]".to_string());
    audit::record(
        pool,
        Some(context.user_id),
        "user.project.remove.batch",
        "user",
        &username,
        &format!(r#"{{"project_keys":{project_keys_json}}}"#),
    )
    .await?;

    Ok(Redirect::to(&redirect_url).into_response())
}

pub async fn system_user_project_role_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((username, project_key)): Path<(String, String)>,
    Form(form): Form<SystemUserProjectRoleForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match system_context_or_redirect(&state, &headers, "system.users.manage").await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let pool = state.pool()?;
    if !can_manage_system_user_projects(pool, context.user_id).await? {
        return Err(AppError::Forbidden(
            "需要全项目管理权限才能直接调整项目成员角色".to_string(),
        ));
    }
    let redirect_url = system_users_redirect_url(form.page, form.per_page)?;
    let user = users::get_user_summary_by_username(pool, &username)
        .await?
        .ok_or_else(|| AppError::BadRequest("用户不存在".to_string()))?;
    if user.is_super_admin {
        return Err(AppError::BadRequest(
            "超级管理员默认拥有全项目访问，无需在项目内调整角色".to_string(),
        ));
    }

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
        "user.project.role.update",
        "user",
        &username,
        &format!(
            r#"{{"project_key":"{}","member_role":"{}"}}"#,
            project_key, member.member_role
        ),
    )
    .await?;

    Ok(Redirect::to(&redirect_url).into_response())
}

pub async fn system_roles_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
    Query(query): Query<RoleWorkbenchQuery>,
) -> AppResult<Response> {
    let return_to = original_uri
        .path_and_query()
        .map(|value| value.as_str())
        .unwrap_or_else(|| original_uri.path());
    if let Some(response) =
        shared_system_web_app_response(&state, &headers, return_to, "system.roles.view").await?
    {
        return Ok(response);
    }
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
    OriginalUri(original_uri): OriginalUri,
    Path(role_code): Path<String>,
) -> AppResult<Response> {
    let return_to = original_uri
        .path_and_query()
        .map(|value| value.as_str())
        .unwrap_or_else(|| original_uri.path());
    if let Some(response) =
        shared_system_web_app_response(&state, &headers, return_to, "system.roles.view").await?
    {
        return Ok(response);
    }
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
    OriginalUri(original_uri): OriginalUri,
) -> AppResult<Response> {
    let return_to = original_uri
        .path_and_query()
        .map(|value| value.as_str())
        .unwrap_or_else(|| original_uri.path());
    if let Some(response) =
        shared_system_web_app_response(&state, &headers, return_to, "system.roles.view").await?
    {
        return Ok(response);
    }
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
    OriginalUri(original_uri): OriginalUri,
    Query(query): Query<StorageSettingsQuery>,
) -> AppResult<Response> {
    let return_to = original_uri
        .path_and_query()
        .map(|value| value.as_str())
        .unwrap_or_else(|| original_uri.path());
    if let Some(response) =
        shared_system_web_app_response(&state, &headers, return_to, "system.storage.view").await?
    {
        return Ok(response);
    }
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
    OriginalUri(original_uri): OriginalUri,
    Query(query): Query<AuditLogQuery>,
) -> AppResult<Response> {
    let return_to = original_uri
        .path_and_query()
        .map(|value| value.as_str())
        .unwrap_or_else(|| original_uri.path());
    if let Some(response) =
        shared_system_web_app_response(&state, &headers, return_to, "system.audit.view").await?
    {
        return Ok(response);
    }
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

pub async fn system_api_docs_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
) -> AppResult<Response> {
    let return_to = original_uri
        .path_and_query()
        .map(|value| value.as_str())
        .unwrap_or_else(|| original_uri.path());
    if let Some(response) =
        shared_system_web_app_response(&state, &headers, return_to, "system.api_tokens.view")
            .await?
    {
        return Ok(response);
    }
    if state.pool.is_some()
        && let Err(response) =
            system_context_or_redirect(&state, &headers, "system.api_tokens.view").await?
    {
        return Ok(response);
    }
    Ok(crate::web::router::legacy_system_api_docs_response())
}

struct WebContext<'a> {
    user_id: i64,
    is_super_admin: bool,
    can_access_all_projects: bool,
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
            is_super_admin: true,
            can_access_all_projects: true,
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
    Ok(Ok(WebContext {
        user_id: user.id,
        is_super_admin: user.is_super_admin,
        can_access_all_projects,
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

    let assigned_counts = projects::count_pending_assigned_work_items_by_project(
        pool,
        user_id,
        can_access_all_projects,
    )
    .await?
    .into_iter()
    .map(|count| (count.project_key, count.total))
    .collect::<HashMap<_, _>>();
    let project_options =
        projects::list_project_summaries_for_user(pool, user_id, can_access_all_projects)
            .await?
            .into_iter()
            .map(|project| {
                let assigned_pending_count = assigned_counts
                    .get(&project.project_key)
                    .copied()
                    .unwrap_or_default();
                project_option_from_summary(project, assigned_pending_count)
            })
            .collect::<Vec<_>>();
    let current_project =
        projects::get_or_select_current_project_for_user(pool, user_id, can_access_all_projects)
            .await?
            .map(|project| {
                let topbar_pending_count = total_project_option_pending_count(&project_options);
                current_project_from_domain(project, topbar_pending_count)
            });

    Ok((current_project, project_options))
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
    let openapi = rbac::user_has_permission(pool, user_id, "system.api_tokens.view").await?;
    let releases = rbac::user_has_permission(pool, user_id, "system.releases.view").await?;
    let database_stats =
        rbac::user_has_permission(pool, user_id, "system.database_stats.view").await?;
    let audit = rbac::user_has_permission(pool, user_id, "system.audit.view").await?;
    let work_item_counts = projects::count_pending_assigned_work_items(
        pool,
        user_id,
        can_access_all_projects,
        current_project_key,
    )
    .await?;
    let unread_notifications = notifications::unread_count(pool, user_id).await?;

    Ok(SystemNav {
        visible: dashboard
            || users
            || roles
            || storage
            || openapi
            || releases
            || database_stats
            || audit,
        dashboard,
        users,
        roles,
        storage,
        openapi,
        releases,
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
    return_to: &str,
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
    let safe_return_to = safe_web_return_to(return_to);
    let mut response = if htmx {
        StatusCode::NO_CONTENT.into_response()
    } else {
        Redirect::to(safe_return_to).into_response()
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
            .insert("HX-Redirect", safe_return_to.parse()?);
    }
    Ok(response)
}

fn login_redirect(headers: &HeaderMap) -> AppResult<Response> {
    redirect_for_web(headers, "/web/login")
}

fn login_redirect_to(headers: &HeaderMap, return_to: &str) -> AppResult<Response> {
    let query = serde_urlencoded::to_string([("return_to", safe_web_return_to(return_to))])
        .unwrap_or_else(|_| String::new());
    let location = if query.is_empty() {
        "/web/login".to_string()
    } else {
        format!("/web/login?{query}")
    };
    redirect_for_web_to(headers, &location)
}

async fn retired_shared_web_app_response(
    state: &AppState,
    headers: &HeaderMap,
    return_to: &str,
) -> AppResult<Response> {
    let csrf_token = csrf::ensure_token(headers);
    if let Some(pool) = state.pool.as_ref() {
        if bootstrap::bootstrap_required(pool).await? {
            return bootstrap_redirect(headers);
        }
        if auth::user_from_headers(pool, headers).await?.is_none() {
            return login_redirect_to(headers, return_to);
        }
    }
    with_csrf_cookie(
        state,
        &csrf_token,
        crate::web::router::web_app_entry_response(state),
    )
}

async fn shared_system_web_app_response(
    state: &AppState,
    headers: &HeaderMap,
    return_to: &str,
    permission: &str,
) -> AppResult<Option<Response>> {
    if !state.settings.web_app_shell_v1_enabled() {
        return Ok(None);
    }
    let csrf_token = csrf::ensure_token(headers);
    if let Some(pool) = state.pool.as_ref() {
        if bootstrap::bootstrap_required(pool).await? {
            return bootstrap_redirect(headers).map(Some);
        }
        let Some(user) = auth::user_from_headers(pool, headers).await? else {
            return login_redirect_to(headers, return_to).map(Some);
        };
        ensure_view_permission(pool, headers, user.id, permission).await?;
    }
    with_csrf_cookie(
        state,
        &csrf_token,
        crate::web::router::web_app_entry_response(state),
    )
    .map(Some)
}

fn bootstrap_redirect(headers: &HeaderMap) -> AppResult<Response> {
    redirect_for_web(headers, "/web/bootstrap")
}

fn redirect_for_web(headers: &HeaderMap, location: &'static str) -> AppResult<Response> {
    redirect_for_web_to(headers, location)
}

fn redirect_for_web_to(headers: &HeaderMap, location: &str) -> AppResult<Response> {
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

async fn project_switch_return_to(
    pool: Option<&SqlitePool>,
    value: &str,
    project_key: &str,
) -> AppResult<String> {
    let safe_return_to = safe_web_return_to(value);
    let project_key = project_key.trim().to_ascii_uppercase();
    if project_key.is_empty() {
        return Ok(safe_return_to.to_string());
    }

    if let Some(rewritten) =
        rewrite_work_item_detail_return_to(pool, safe_return_to, &project_key).await?
    {
        return Ok(rewritten);
    }
    if rewrite_project_resource_detail_return_to(safe_return_to).is_some() {
        return Ok(project_library_url(&project_key));
    }
    if rewrite_project_cycle_detail_return_to(safe_return_to).is_some() {
        return Ok(project_cycles_url(&project_key));
    }

    Ok(rewrite_project_scoped_path(safe_return_to, &project_key)
        .or_else(|| rewrite_work_item_list_project_query(safe_return_to, &project_key))
        .unwrap_or_else(|| safe_return_to.to_string()))
}

fn split_url_fragment(value: &str) -> (&str, Option<&str>) {
    value
        .split_once('#')
        .map_or((value, None), |(base, fragment)| (base, Some(fragment)))
}

fn split_url_path_and_query(value: &str) -> (&str, Option<&str>) {
    value
        .split_once('?')
        .map_or((value, None), |(path, query)| (path, Some(query)))
}

async fn rewrite_work_item_detail_return_to(
    pool: Option<&SqlitePool>,
    value: &str,
    project_key: &str,
) -> AppResult<Option<String>> {
    let (without_fragment, _) = split_url_fragment(value);
    let (path, _) = split_url_path_and_query(without_fragment);
    let Some(item_key) = path.strip_prefix("/web/work-items/") else {
        return Ok(None);
    };
    if item_key.is_empty() || item_key.contains('/') {
        return Ok(None);
    }

    let item_type = if let Some(pool) = pool {
        projects::get_work_item_detail(pool, item_key)
            .await?
            .map(|item| item.item_type)
    } else {
        None
    };
    let list_path = work_item_list_path_for_key(item_type.as_deref(), item_key);
    Ok(Some(format!("{list_path}?project_key={project_key}")))
}

fn rewrite_project_resource_detail_return_to(value: &str) -> Option<()> {
    let (without_fragment, _) = split_url_fragment(value);
    let (path, _) = split_url_path_and_query(without_fragment);
    let rest = path.strip_prefix("/web/projects/")?;
    let (_, suffix) = rest.split_once('/')?;
    suffix.starts_with("resources/").then_some(())
}

fn rewrite_project_cycle_detail_return_to(value: &str) -> Option<()> {
    let (without_fragment, _) = split_url_fragment(value);
    let (path, _) = split_url_path_and_query(without_fragment);
    let rest = path.strip_prefix("/web/projects/")?;
    let (_, suffix) = rest.split_once('/')?;
    let cycle_suffix = suffix.strip_prefix("cycles/")?;
    (!cycle_suffix.is_empty() && !cycle_suffix.contains('/')).then_some(())
}

fn work_item_list_path_for_key(item_type: Option<&str>, item_key: &str) -> &'static str {
    match item_type.or_else(|| infer_work_item_type_from_key(item_key)) {
        Some("requirement") => "/web/requirements",
        Some("bug") => "/web/bugs",
        _ => "/web/tasks",
    }
}

fn infer_work_item_type_from_key(item_key: &str) -> Option<&'static str> {
    let mut segments = item_key.split('-');
    let _project_key = segments.next()?;
    match segments.next()? {
        "REQ" => Some("requirement"),
        "BUG" => Some("bug"),
        "TASK" => Some("task"),
        _ => None,
    }
}

fn rewrite_project_scoped_path(value: &str, project_key: &str) -> Option<String> {
    let (without_fragment, fragment) = split_url_fragment(value);
    let (path, query) = split_url_path_and_query(without_fragment);
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
    let (path, query) = split_url_path_and_query(without_fragment);
    if !matches!(path, "/web/requirements" | "/web/tasks" | "/web/bugs") {
        return None;
    }

    let mut pairs = match query {
        Some(query) if !query.is_empty() => {
            serde_urlencoded::from_str::<Vec<(String, String)>>(query).ok()?
        }
        _ => Vec::new(),
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

fn project_cycles_url(project_key: &str) -> String {
    format!("/web/projects/{project_key}?tab=cycles")
}

fn project_library_url(project_key: &str) -> String {
    format!("/web/projects/{project_key}?tab=library")
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

fn parse_system_api_token_form(form: &[u8]) -> AppResult<SystemApiTokenUpdateForm> {
    let pairs = serde_urlencoded::from_bytes::<Vec<(String, String)>>(form)
        .map_err(|error| AppError::BadRequest(format!("系统访问 Token 表单解析失败：{error}")))?;
    let mut csrf_token = String::new();
    let mut name = String::new();
    let mut scopes = Vec::new();
    for (key, value) in pairs {
        match key.as_str() {
            csrf::CSRF_FIELD_NAME => csrf_token = value,
            "name" => name = value,
            "scopes" => scopes.push(value),
            _ => {}
        }
    }
    Ok(SystemApiTokenUpdateForm {
        csrf_token,
        name,
        scopes,
    })
}

fn parse_system_api_token_create_form(form: &[u8]) -> AppResult<SystemApiTokenCreateForm> {
    let parsed = parse_system_api_token_form(form)?;
    Ok(SystemApiTokenCreateForm {
        csrf_token: parsed.csrf_token,
        name: parsed.name,
        scopes: parsed.scopes,
    })
}

fn parse_system_api_token_update_form(form: &[u8]) -> AppResult<SystemApiTokenUpdateForm> {
    parse_system_api_token_form(form)
}

fn parse_system_user_project_assign_form(
    form: &[u8],
) -> AppResult<ParsedSystemUserProjectAssignForm> {
    let pairs = serde_urlencoded::from_bytes::<Vec<(String, String)>>(form)
        .map_err(|error| AppError::BadRequest(format!("项目分配表单解析失败：{error}")))?;
    let mut csrf_token = String::new();
    let mut page = None;
    let mut per_page = None;
    let mut project_keys = Vec::new();
    let mut member_role = String::new();
    for (key, value) in pairs {
        match key.as_str() {
            csrf::CSRF_FIELD_NAME => csrf_token = value,
            "page" => {
                page = value.trim().parse::<i64>().ok();
            }
            "per_page" => {
                per_page = value.trim().parse::<i64>().ok();
            }
            "project_key" => project_keys.push(value),
            "member_role" => member_role = value,
            _ => {}
        }
    }
    if member_role.trim().is_empty() {
        member_role = "member".to_string();
    }
    Ok(ParsedSystemUserProjectAssignForm {
        csrf_token,
        page,
        per_page,
        project_keys,
        member_role,
    })
}

fn parse_system_user_project_remove_form(
    form: &[u8],
) -> AppResult<ParsedSystemUserProjectRemoveForm> {
    let pairs = serde_urlencoded::from_bytes::<Vec<(String, String)>>(form)
        .map_err(|error| AppError::BadRequest(format!("项目移除表单解析失败：{error}")))?;
    let mut csrf_token = String::new();
    let mut page = None;
    let mut per_page = None;
    let mut project_keys = Vec::new();
    for (key, value) in pairs {
        match key.as_str() {
            csrf::CSRF_FIELD_NAME => csrf_token = value,
            "page" => {
                page = value.trim().parse::<i64>().ok();
            }
            "per_page" => {
                per_page = value.trim().parse::<i64>().ok();
            }
            "project_key" => project_keys.push(value),
            _ => {}
        }
    }
    Ok(ParsedSystemUserProjectRemoveForm {
        csrf_token,
        page,
        per_page,
        project_keys,
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

fn project_option_from_summary(
    project: projects::ProjectSummary,
    assigned_pending_count: i64,
) -> ProjectOption {
    ProjectOption {
        key: project.project_key,
        name: project.name,
        assigned_pending_count,
    }
}

fn current_project_from_domain(
    project: projects::CurrentProject,
    topbar_pending_count: i64,
) -> CurrentProjectView {
    CurrentProjectView {
        key: project.project_key,
        name: project.name,
        topbar_pending_count,
    }
}

fn total_project_option_pending_count(project_options: &[ProjectOption]) -> i64 {
    project_options
        .iter()
        .map(|option| option.assigned_pending_count.max(0))
        .sum()
}

async fn can_manage_system_user_projects(pool: &SqlitePool, user_id: i64) -> AppResult<bool> {
    let Some(user) = users::get_user_summary(pool, user_id).await? else {
        return Ok(false);
    };
    let can_access_all_projects =
        user_can_access_all_projects(pool, user_id, user.is_super_admin).await?;
    if !can_access_all_projects {
        return Ok(false);
    }
    rbac::user_has_permission(pool, user_id, "project.manage").await
}

async fn load_user_assigned_projects(
    pool: &SqlitePool,
    user_id: i64,
) -> AppResult<Vec<UserAssignedProjectView>> {
    let active_assigned_counts =
        projects::count_pending_assigned_work_items_by_project(pool, user_id, false)
            .await?
            .into_iter()
            .map(|entry| (entry.project_key, entry.total))
            .collect::<HashMap<_, _>>();
    Ok(projects::list_user_project_memberships(pool, user_id)
        .await?
        .into_iter()
        .map(|project| {
            let active_assigned_count = active_assigned_counts
                .get(&project.project_key)
                .copied()
                .unwrap_or(0);
            user_assigned_project_from_summary(project, active_assigned_count)
        })
        .collect())
}

async fn load_assignable_user_project_options(
    pool: &SqlitePool,
) -> AppResult<Vec<UserProjectAssignmentOptionView>> {
    Ok(projects::list_project_summaries(pool)
        .await?
        .into_iter()
        .filter(|project| projects::ensure_project_accepts_writes(&project.status).is_ok())
        .map(user_project_assignment_option_from_summary)
        .collect())
}

fn user_assigned_project_from_summary(
    project: projects::UserProjectMembershipSummary,
    active_assigned_count: i64,
) -> UserAssignedProjectView {
    let (status, status_tone) = project_status_label(&project.project_status);
    let role_code = project.member_role;
    let role = project_member_role_label(&role_code).to_string();
    let can_update_role = role_code != "owner";
    let can_remove = can_update_role && active_assigned_count <= 0;
    let remove_block_reason = if role_code == "owner" {
        "该成员当前是项目负责人，请先在项目详情中转移负责人".to_string()
    } else if can_remove {
        String::new()
    } else {
        format!(
            "该成员在此项目仍有 {} 个待处理 / 进行中 / 待确认工作项，需先转交处理人",
            active_assigned_count
        )
    };
    UserAssignedProjectView {
        key: project.project_key,
        name: project.project_name,
        status: status.to_string(),
        status_tone,
        role_code,
        role,
        active_assigned_count,
        can_remove,
        can_update_role,
        remove_block_reason,
    }
}

fn normalize_non_empty_unique_strings(values: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .filter(|value| seen.insert((*value).to_string()))
        .map(str::to_string)
        .collect()
}

fn user_project_assignment_option_from_summary(
    project: projects::ProjectSummary,
) -> UserProjectAssignmentOptionView {
    let (status, _) = project_status_label(&project.status);
    let owner = fallback_text(project.owner_display_name, "未设置负责人");
    UserProjectAssignmentOptionView {
        key: project.project_key,
        name: project.name,
        owner: owner.clone(),
        status: status.to_string(),
        summary: format!("{owner} · {status}"),
    }
}

fn user_row_from_summary(
    user: users::UserSummary,
    assigned_projects: Vec<UserAssignedProjectView>,
) -> UserRow {
    let (status, status_tone) = user_status_label(&user.status);
    let assigned_projects_json =
        serde_json::to_string(&assigned_projects).unwrap_or_else(|_| "[]".to_string());
    let assigned_project_count = assigned_projects.len();
    let assigned_project_overflow_count = assigned_project_count.saturating_sub(2);
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
        assigned_projects,
        assigned_project_count,
        assigned_project_overflow_count,
        assigned_projects_json,
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

async fn system_openapi_page_for_view(
    pool: &SqlitePool,
    master_key: &str,
    include_raw_tokens: bool,
) -> AppResult<SystemOpenApiPageView> {
    let tokens = if include_raw_tokens {
        system_api_tokens::list_tokens_with_raw(pool, master_key)
            .await?
            .into_iter()
            .map(system_api_token_view_from_domain)
            .collect::<Vec<_>>()
    } else {
        system_api_tokens::list_tokens(pool)
            .await?
            .into_iter()
            .map(|token| {
                system_api_token_view_from_domain(
                    system_api_tokens::SystemApiTokenPlaintextSummary {
                        token,
                        raw_token: None,
                    },
                )
            })
            .collect::<Vec<_>>()
    };
    let token_active_count = tokens.len();
    let can_create_token =
        (token_active_count as i64) < system_api_tokens::MAX_ACTIVE_SYSTEM_TOKENS;

    Ok(SystemOpenApiPageView {
        has_tokens: !tokens.is_empty(),
        tokens,
        token_active_count,
        token_limit: system_api_tokens::MAX_ACTIVE_SYSTEM_TOKENS,
        can_create_token,
    })
}

async fn system_releases_page_for_view(
    pool: &SqlitePool,
    requested_pagination: projects::Pagination,
) -> AppResult<SystemReleasesPageView> {
    let total_items = system_releases::count_releases(pool).await?;
    let total_pages = total_pages(total_items, requested_pagination.per_page);
    let page_number = requested_pagination.page.min(total_pages);
    let page = system_releases::list_releases_page(
        pool,
        projects::Pagination {
            page: page_number,
            per_page: requested_pagination.per_page,
        },
    )
    .await?;
    let total_pages = page.total_pages();
    let mut releases = Vec::with_capacity(page.items.len());
    for release in page.items {
        let assets = system_releases::list_release_assets(pool, release.id).await?;
        releases.push(system_release_row_from_domain(release, assets));
    }
    let pagination =
        system_releases_pagination_view(page.page, page.per_page, page.total_items, total_pages);
    let pagination_pages = system_releases_pagination_pages(
        pagination.page,
        pagination.per_page,
        pagination.total_pages,
    );

    Ok(SystemReleasesPageView {
        has_releases: total_items > 0,
        releases,
        pagination,
        pagination_pages,
    })
}

async fn render_system_openapi_template(
    state: &AppState,
    context: SystemContext,
) -> AppResult<Response> {
    let pool = state.pool()?;
    let can_manage_tokens =
        rbac::user_has_permission(pool, context.user_id, "system.api_tokens.manage").await?;
    let page_view =
        system_openapi_page_for_view(pool, &state.settings.security_master_key, can_manage_tokens)
            .await?;
    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        state,
        &csrf_token,
        response::html(SystemOpenApiTemplate {
            active: "system-openapi",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            tokens: page_view.tokens,
            has_tokens: page_view.has_tokens,
            token_active_count: page_view.token_active_count,
            token_limit: page_view.token_limit,
            can_create_token: page_view.can_create_token,
            can_manage_tokens,
        })?
        .into_response(),
    )
}

async fn render_system_releases_template(
    state: &AppState,
    context: SystemContext,
    requested_pagination: projects::Pagination,
    message: String,
    message_tone: &'static str,
) -> AppResult<Response> {
    let page_view = system_releases_page_for_view(state.pool()?, requested_pagination).await?;
    let settings_view = system_release_settings_view_from_domain(
        system_releases::get_settings(state.pool()?).await?,
    );
    let can_manage_releases =
        rbac::user_has_permission(state.pool()?, context.user_id, "system.releases.manage").await?;
    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        state,
        &csrf_token,
        response::html(SystemReleasesTemplate {
            active: "system-releases",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            current_project: context.current_project,
            topbar_project_options: context.topbar_project_options,
            settings: settings_view,
            releases: page_view.releases,
            has_releases: page_view.has_releases,
            pagination: page_view.pagination,
            pagination_pages: page_view.pagination_pages,
            message,
            message_tone,
            can_manage_releases,
        })?
        .into_response(),
    )
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

fn system_release_settings_view_from_domain(
    settings: system_releases::SystemReleaseSettings,
) -> SystemReleaseSettingsView {
    SystemReleaseSettingsView {
        retention_count: settings.retention_count,
        updated_by: fallback_text(settings.updated_by_display_name, "系统"),
        updated_at: display_timestamp(settings.updated_at),
    }
}

fn system_release_row_from_domain(
    release: system_releases::SystemReleaseVersionSummary,
    assets: Vec<system_releases::SystemReleaseAssetSummary>,
) -> SystemReleaseRow {
    let (status, status_tone) = system_release_status_label(&release.status);
    let assets = assets
        .into_iter()
        .map(system_release_asset_view_from_domain)
        .collect::<Vec<_>>();
    SystemReleaseRow {
        id: release.id,
        version_name: release.version_name,
        title: fallback_text(release.title, "未填写标题"),
        notes: release.notes,
        status_code: release.status.clone(),
        status: status.to_string(),
        status_tone,
        channel: release.channel,
        verification_status: release.verification_status,
        signing_key_id: release.signing_key_id,
        github_withdrawal_status: release.github_withdrawal_status,
        published_at: if release.published_at.trim().is_empty() {
            "未发布".to_string()
        } else {
            display_timestamp(release.published_at)
        },
        created_by: fallback_text(release.created_by_display_name, "系统"),
        updated_by: fallback_text(release.updated_by_display_name, "系统"),
        created_at: display_timestamp(release.created_at),
        updated_at: display_timestamp(release.updated_at),
        asset_count: release.asset_count,
        platform_count: release.platform_count,
        has_assets: !assets.is_empty(),
        assets,
    }
}

fn desktop_downloads_template(
    detail: Option<system_releases::SystemReleaseDetail>,
) -> DesktopDownloadsTemplate {
    let Some(detail) = detail else {
        return DesktopDownloadsTemplate {
            has_release: false,
            version_name: String::new(),
            title: String::new(),
            notes: String::new(),
            published_at: String::new(),
            is_internal: false,
            signing_key_id: String::new(),
            platforms: desktop_download_platforms(&[], 0),
        };
    };

    let release = detail.release;
    let platforms = desktop_download_platforms(&detail.assets, release.id);
    DesktopDownloadsTemplate {
        has_release: true,
        version_name: release.version_name,
        title: fallback_text(release.title, "元策桌面端"),
        notes: fallback_text(release.notes, "此版本包含桌面端安装包。"),
        published_at: display_timestamp(release.published_at),
        is_internal: release.channel == system_releases::RELEASE_CHANNEL_INTERNAL,
        signing_key_id: release.signing_key_id,
        platforms,
    }
}

fn desktop_download_platforms(
    assets: &[system_releases::SystemReleaseAssetSummary],
    release_id: i64,
) -> Vec<DesktopDownloadPlatformView> {
    [
        (system_releases::RELEASE_PLATFORM_MACOS, "macOS"),
        (system_releases::RELEASE_PLATFORM_WINDOWS, "Windows"),
        (system_releases::RELEASE_PLATFORM_LINUX, "Linux"),
    ]
    .into_iter()
    .map(|(platform, name)| DesktopDownloadPlatformView {
        name,
        x64: desktop_download_link_view(
            assets,
            release_id,
            platform,
            system_releases::RELEASE_ARCHITECTURE_X64,
        ),
        arm64: desktop_download_link_view(
            assets,
            release_id,
            platform,
            system_releases::RELEASE_ARCHITECTURE_ARM64,
        ),
    })
    .collect()
}

fn desktop_download_link_view(
    assets: &[system_releases::SystemReleaseAssetSummary],
    release_id: i64,
    platform: &str,
    architecture: &str,
) -> DesktopDownloadLinkView {
    let matching_asset = assets.iter().find(|asset| {
        asset.status == "uploaded"
            && asset.artifact_kind == system_releases::RELEASE_ARTIFACT_INSTALLER
            && asset.platform == platform
            && asset.architecture == architecture
    });
    let matching_asset = matching_asset.or_else(|| {
        assets.iter().find(|asset| {
            asset.status == "uploaded"
                && asset.artifact_kind == system_releases::RELEASE_ARTIFACT_INSTALLER
                && asset.platform == platform
                && asset.architecture == system_releases::RELEASE_ARCHITECTURE_UNIVERSAL
        })
    });

    match matching_asset {
        Some(asset) => DesktopDownloadLinkView {
            available: true,
            url: format!("/web/downloads/{release_id}/assets/{}", asset.id),
            filename: asset.original_filename.clone(),
            byte_size: display_byte_size(asset.byte_size),
        },
        None => DesktopDownloadLinkView {
            available: false,
            url: String::new(),
            filename: "暂未提供".to_string(),
            byte_size: String::new(),
        },
    }
}

fn system_release_asset_view_from_domain(
    asset: system_releases::SystemReleaseAssetSummary,
) -> SystemReleaseAssetView {
    let (status, status_tone) = attachment_status_label(&asset.status);
    SystemReleaseAssetView {
        id: asset.id,
        platform: system_release_platform_label(&asset.platform).to_string(),
        architecture: system_release_architecture_label(&asset.architecture).to_string(),
        filename: asset.original_filename,
        content_type: asset.content_type,
        byte_size: display_byte_size(asset.byte_size),
        status: status.to_string(),
        status_tone,
        created_at: display_timestamp(asset.created_at),
        download_url: format!(
            "/web/system/releases/{}/assets/{}/download",
            asset.release_id, asset.id
        ),
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

    let legacy_preview_enabled = state.settings.experimental_legacy_preview_enabled();
    let resolved_preview_content_url =
        if attachment_preview_content_enabled(&attachment, legacy_preview_enabled) {
            resolve_attachment_preview_content_url(
                state,
                pool,
                actor_user_id,
                &attachment,
                preview_content_url,
            )
            .await?
        } else {
            String::new()
        };

    let template = build_document_preview_template(
        attachment,
        source_url,
        source_label,
        navigation,
        resolved_preview_content_url,
        download_url.to_string(),
        legacy_preview_enabled,
    )
    .await?;
    Ok(response::html(template)?.into_response())
}

async fn resolve_attachment_preview_content_url(
    state: &AppState,
    pool: &SqlitePool,
    actor_user_id: i64,
    attachment: &files::FileAttachmentSummary,
    _fallback_preview_content_url: &str,
) -> AppResult<String> {
    let mut signed = storage::presign_download_url(
        pool,
        &state.settings,
        &attachment.object_key,
        storage::DEFAULT_DOWNLOAD_URL_TTL_SECONDS as u64,
    )
    .await?;
    bind_test_storage_download_grant(
        state,
        &attachment.object_key,
        &attachment.content_type,
        actor_user_id,
        storage::DEFAULT_DOWNLOAD_URL_TTL_SECONDS as u64,
        &mut signed,
    )?;
    Ok(signed.url)
}

async fn build_document_preview_template(
    attachment: files::FileAttachmentSummary,
    source_url: String,
    source_label: String,
    navigation: DocumentPreviewNavigation,
    preview_content_url: String,
    download_url: String,
    legacy_preview_enabled: bool,
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
    if !is_document_preview_entry_enabled(strategy, legacy_preview_enabled) {
        return Ok(document_preview_error_template(
            title,
            source_url,
            source_label,
            navigation,
            download_url,
            "旧格式实验性预览当前未开启，请下载原文件查看。".to_string(),
        ));
    }
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
    let preview_type = document_preview_type_code(strategy).to_string();
    let file_type_badge = file_type.to_ascii_uppercase();
    let meta_text = if is_experimental_preview_strategy(strategy) {
        format!(
            "{kind_label} · {} · 实验性站内预览",
            format_byte_size(attachment.byte_size)
        )
    } else {
        format!(
            "{kind_label} · {} · 站内离线预览",
            format_byte_size(attachment.byte_size)
        )
    };
    Ok(DocumentPreviewTemplate {
        title,
        source_url,
        source_label,
        kind_label,
        preview_type,
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
        preview_hint: preview_hint_for_strategy(strategy),
        preview_content_url,
        has_pdf_preview: matches!(strategy, AttachmentPreviewStrategy::Pdf),
        is_experimental_preview: is_experimental_preview_strategy(strategy),
    })
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
    let fallback_strategy = attachment_preview_strategy(&title, "");
    DocumentPreviewTemplate {
        title,
        source_url,
        source_label,
        kind_label: fallback_kind_label,
        preview_type: "unsupported".to_string(),
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
        preview_content_url: String::new(),
        has_pdf_preview: false,
        is_experimental_preview: fallback_strategy.is_some_and(is_experimental_preview_strategy),
    }
}

fn is_experimental_preview_strategy(strategy: AttachmentPreviewStrategy) -> bool {
    strategy.is_experimental()
}

fn preview_hint_for_strategy(strategy: AttachmentPreviewStrategy) -> String {
    match strategy {
        AttachmentPreviewStrategy::Pdf => {
            "原始 PDF 将直接在站内预览，无需外部文档服务。".to_string()
        }
        AttachmentPreviewStrategy::Text => "文本内容将由站内前端模块直接解析并渲染。".to_string(),
        AttachmentPreviewStrategy::Spreadsheet => {
            "表格内容将由站内前端模块直接解析并渲染。".to_string()
        }
        AttachmentPreviewStrategy::Docx => "Word 文档将由站内前端模块直接解析并渲染。".to_string(),
        AttachmentPreviewStrategy::Pptx => "演示文稿将由站内前端模块直接解析并渲染。".to_string(),
        AttachmentPreviewStrategy::LegacyDoc => {
            "旧版 Word 文档将走实验性前端解析链路，复杂版式与图片兼容性可能有限。".to_string()
        }
        AttachmentPreviewStrategy::LegacyPpt => {
            "旧版演示文稿将走实验性前端解析链路，复杂版式兼容性有限，且当前运行时会带可见水印。"
                .to_string()
        }
    }
}

fn document_preview_type_code(strategy: AttachmentPreviewStrategy) -> &'static str {
    strategy.code()
}

fn document_preview_kind_label(strategy: AttachmentPreviewStrategy) -> &'static str {
    strategy.kind_label()
}

async fn attachment_document_preview_content_response(
    state: &AppState,
    pool: &SqlitePool,
    actor_user_id: i64,
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
    if !is_document_preview_entry_enabled(
        strategy,
        state.settings.experimental_legacy_preview_enabled(),
    ) {
        return Err(AppError::BadRequest(
            "旧格式实验性预览当前未开启，请下载原文件查看".to_string(),
        ));
    }

    let mut signed = storage::presign_download_url(
        pool,
        &state.settings,
        &attachment.object_key,
        storage::DEFAULT_DOWNLOAD_URL_TTL_SECONDS as u64,
    )
    .await?;
    bind_test_storage_download_grant(
        state,
        &attachment.object_key,
        &attachment.content_type,
        actor_user_id,
        storage::DEFAULT_DOWNLOAD_URL_TTL_SECONDS as u64,
        &mut signed,
    )?;
    Ok(Redirect::temporary(&signed.url).into_response())
}

fn document_preview_navigation<F>(
    attachments: Vec<files::FileAttachmentSummary>,
    current_attachment_id: i64,
    legacy_preview_enabled: bool,
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
                    legacy_preview_enabled,
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

fn system_api_token_view_from_domain(
    token: system_api_tokens::SystemApiTokenPlaintextSummary,
) -> SystemApiTokenView {
    let raw_token = token.raw_token;
    let can_copy_raw_token = raw_token.is_some();
    let token = token.token;
    SystemApiTokenView {
        id: token.id,
        name: token.name,
        scopes_label: token
            .scopes
            .iter()
            .map(|scope| system_api_token_scope_label(scope))
            .collect::<Vec<_>>()
            .join("、"),
        scope_options: system_api_token_scope_options(&token.scopes),
        token_suffix: token.token_suffix,
        copy_text: raw_token.unwrap_or_default(),
        can_copy_raw_token,
        created_by: fallback_text(token.created_by_display_name, "系统"),
        updated_by: fallback_text(token.updated_by_display_name, "系统"),
        last_used_at: display_optional_timestamp(token.last_used_at, "尚未使用"),
        created_at: display_timestamp(token.created_at),
        updated_at: display_timestamp(token.updated_at),
    }
}

fn system_api_token_scope_options(
    selected_scopes: &[String],
) -> Vec<SystemApiTokenScopeOptionView> {
    [
        system_api_tokens::SCOPE_SYSTEM_RELEASE_READ,
        system_api_tokens::SCOPE_SYSTEM_RELEASE_WRITE,
    ]
    .into_iter()
    .map(|scope| SystemApiTokenScopeOptionView {
        key: scope,
        label: system_api_token_scope_label(scope),
        selected: selected_scopes.iter().any(|selected| selected == scope),
    })
    .collect()
}

fn system_api_token_scope_label(scope: &str) -> &'static str {
    match scope {
        system_api_tokens::SCOPE_SYSTEM_RELEASE_READ => "版本读取",
        system_api_tokens::SCOPE_SYSTEM_RELEASE_WRITE => "版本写入 / 发布 / 资产上传",
        _ => "未知权限",
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

async fn load_comment_attachment_context(
    pool: &SqlitePool,
    item_key: &str,
    comment_id: i64,
) -> AppResult<(
    projects::WorkItemDetail,
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

    Ok((item, project, comment))
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

fn total_pages(total_items: i64, per_page: i64) -> i64 {
    if total_items == 0 {
        1
    } else {
        (total_items + per_page - 1) / per_page
    }
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

fn system_releases_pagination_view(
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
        previous_url: system_releases_page_url(page - 1, per_page),
        next_url: system_releases_page_url(page + 1, per_page),
        range_start,
        range_end,
    }
}

fn system_releases_page_url(page: i64, per_page: i64) -> String {
    let mut params = Vec::new();
    if page > 1 {
        params.push(format!("page={page}"));
    }
    if per_page != 10 {
        params.push(format!("per_page={per_page}"));
    }

    if params.is_empty() {
        "/web/system/releases".to_string()
    } else {
        format!("/web/system/releases?{}", params.join("&"))
    }
}

fn system_releases_pagination_pages(
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
            url: system_releases_page_url(page, per_page),
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
        "api_token.create" => "创建访问 Token",
        "api_token.update" => "更新访问 Token",
        "api_token.delete" => "删除访问 Token",
        "project_resource.password.reset" => "重置资料保险箱密码",
        _ => action,
    }
}

fn data_scope_label(data_scope_type: &str) -> &'static str {
    match data_scope_type {
        "all" => "全部数据",
        "self" => "本人数据",
        _ => "自定义",
    }
}

fn attachment_status_label(status: &str) -> (&'static str, &'static str) {
    match status {
        "pending" => ("待上传", "warning"),
        "uploaded" => ("已上传", "ok"),
        "deleted" => ("已归档", "danger"),
        _ => ("未知", "info"),
    }
}

fn system_release_status_label(status: &str) -> (&'static str, &'static str) {
    match status {
        "draft" => ("草稿", "warning"),
        "published" => ("已发布", "ok"),
        "withdrawn" => ("已撤回", "danger"),
        _ => ("未知", "info"),
    }
}

fn system_release_platform_label(platform: &str) -> &'static str {
    match platform {
        "windows" => "Windows",
        "macos" => "macOS",
        "linux" => "Linux",
        "android" => "Android",
        "ios" => "iOS",
        _ => "未知平台",
    }
}

fn system_release_architecture_label(architecture: &str) -> &'static str {
    match architecture {
        "x64" => "x64",
        "arm64" => "ARM64",
        "universal" => "通用",
        _ => "未知架构",
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

fn is_previewable_document_attachment(
    filename: &str,
    content_type: &str,
    legacy_preview_enabled: bool,
) -> bool {
    attachment_preview_strategy(filename, content_type)
        .is_some_and(|strategy| is_document_preview_entry_enabled(strategy, legacy_preview_enabled))
}

fn attachment_preview_content_enabled(
    attachment: &files::FileAttachmentSummary,
    legacy_preview_enabled: bool,
) -> bool {
    attachment.status == "uploaded"
        && is_previewable_document_attachment(
            &attachment.original_filename,
            &attachment.content_type,
            legacy_preview_enabled,
        )
}

fn is_document_preview_entry_enabled(
    strategy: AttachmentPreviewStrategy,
    legacy_preview_enabled: bool,
) -> bool {
    strategy.is_enabled(legacy_preview_enabled)
}

fn user_contact(email: String, mobile: String) -> String {
    match (email.trim().is_empty(), mobile.trim().is_empty()) {
        (true, true) => "未填写".to_string(),
        (false, true) => email,
        (true, false) => mobile,
        (false, false) => format!("{email} / {mobile}"),
    }
}

fn fallback_text(value: String, fallback: &str) -> String {
    if value.trim().is_empty() {
        fallback.to_string()
    } else {
        value
    }
}

fn display_byte_size(value: i64) -> String {
    if value < 1024 {
        return format!("{value} B");
    }
    if value < 1024 * 1024 {
        return format!("{:.1} KB", value as f64 / 1024.0);
    }
    if value < 1024 * 1024 * 1024 {
        return format!("{:.1} MB", value as f64 / 1024.0 / 1024.0);
    }
    format!("{:.1} GB", value as f64 / 1024.0 / 1024.0 / 1024.0)
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

fn format_byte_size(byte_size: i64) -> String {
    if byte_size < 1024 {
        return format!("{byte_size} B");
    }
    if byte_size < 1024 * 1024 {
        return format!("{:.1} KB", byte_size as f64 / 1024.0);
    }
    format!("{:.1} MB", byte_size as f64 / 1024.0 / 1024.0)
}

fn sample_project_options() -> Vec<ProjectOption> {
    [
        ("YCE", "元策 MVP"),
        ("OPS", "交付运维台"),
        ("CRM", "客户线索同步"),
    ]
    .into_iter()
    .map(|(key, name)| ProjectOption {
        key: key.to_string(),
        name: name.to_string(),
        assigned_pending_count: 0,
    })
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn attachment_preview_strategy_supports_frontend_document_types() {
        assert_eq!(
            attachment_preview_strategy("说明.md", "text/markdown"),
            Some(AttachmentPreviewStrategy::Text)
        );
        assert_eq!(
            attachment_preview_strategy("数据.csv", "text/csv"),
            Some(AttachmentPreviewStrategy::Spreadsheet)
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
            Some(AttachmentPreviewStrategy::Docx)
        );
        assert_eq!(
            attachment_preview_strategy(
                "宣讲材料.pptx",
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            ),
            Some(AttachmentPreviewStrategy::Pptx)
        );
        assert_eq!(
            attachment_preview_strategy(
                "兼容表格.ods",
                "application/vnd.oasis.opendocument.spreadsheet",
            ),
            Some(AttachmentPreviewStrategy::Spreadsheet)
        );
        assert_eq!(
            attachment_preview_strategy("旧版文档.doc", "application/msword"),
            Some(AttachmentPreviewStrategy::LegacyDoc)
        );
        assert_eq!(
            attachment_preview_strategy("旧版课件.ppt", "application/vnd.ms-powerpoint"),
            Some(AttachmentPreviewStrategy::LegacyPpt)
        );
    }

    #[test]
    fn legacy_document_preview_entries_require_feature_flag() {
        assert!(!is_previewable_document_attachment(
            "旧版文档.doc",
            "application/msword",
            false
        ));
        assert!(!is_previewable_document_attachment(
            "旧版课件.ppt",
            "application/vnd.ms-powerpoint",
            false
        ));
        assert!(is_previewable_document_attachment(
            "旧版文档.doc",
            "application/msword",
            true
        ));
        assert!(is_previewable_document_attachment(
            "旧版课件.ppt",
            "application/vnd.ms-powerpoint",
            true
        ));
        assert!(is_previewable_document_attachment(
            "新版文档.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            false
        ));
    }
}
