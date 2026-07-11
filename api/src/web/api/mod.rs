use axum::{
    Json,
    body::Bytes,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode, header},
    response::{AppendHeaders, IntoResponse},
};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::{
    domains::{audit, auth, bootstrap, files, notifications, projects, rbac, storage, users},
    platform::{
        crypto,
        error::{AppError, AppResult},
        security::csrf,
    },
    web::{
        audit_context,
        response::{ApiEnvelope, json},
        router::AppState,
    },
};

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
pub struct AuthUserPayload {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub is_super_admin: bool,
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
    pub work_item_count: i64,
    pub open_work_item_count: i64,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct ProjectQuery {
    #[serde(default)]
    status: String,
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
    pub due_date: String,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: String,
}

#[derive(Debug, Serialize)]
pub struct CommentPayload {
    pub id: i64,
    pub parent_comment_id: Option<i64>,
    pub parent_author: String,
    pub body: String,
    pub author: String,
    pub created_at: String,
    pub updated_at: String,
    pub is_flow: bool,
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
}

#[derive(Debug, Serialize)]
pub struct NotificationFeedPayload {
    pub items: Vec<NotificationPayload>,
    pub unread_count: i64,
}

#[derive(Debug, Deserialize)]
pub struct NotificationQuery {
    #[serde(default = "default_notification_limit")]
    limit: i64,
}

fn default_notification_limit() -> i64 {
    5
}

pub async fn list_notifications(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<NotificationQuery>,
) -> AppResult<axum::Json<ApiEnvelope<NotificationFeedPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    let items = notifications::list_for_user(pool, user.id, false, query.limit)
        .await?
        .into_iter()
        .map(notification_payload)
        .collect();
    let unread_count = notifications::unread_count(pool, user.id).await?;
    Ok(json(NotificationFeedPayload {
        items,
        unread_count,
    }))
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
pub struct SystemPermissionPayload {
    pub permission_key: String,
    pub permission_name: String,
    pub resource_type: String,
    pub resource_key: String,
    pub granted: bool,
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

#[derive(Debug, Deserialize)]
pub struct TestStorageUploadQuery {
    object_key: String,
    #[serde(default)]
    grant: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct TestStorageUploadGrant {
    object_key: String,
    user_id: i64,
    expires_at: i64,
}

const TEST_STORAGE_UPLOAD_GRANT_AAD: &[u8] = b"yuance:test-storage-upload:v1";

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
pub struct CreateCommentRequest {
    body: String,
    #[serde(default)]
    parent_comment_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct AddProjectMemberRequest {
    username: String,
    #[serde(default = "default_member_role")]
    member_role: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProjectMemberRequest {
    member_role: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAttachmentRequest {
    original_filename: String,
    content_type: String,
    byte_size: i64,
}

#[derive(Debug, Deserialize)]
pub struct SignedUrlQuery {
    #[serde(default)]
    expires_in_seconds: Option<u64>,
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

pub async fn bootstrap_status(
    State(state): State<AppState>,
) -> AppResult<axum::Json<ApiEnvelope<BootstrapStatusPayload>>> {
    let Some(pool) = state.pool.as_ref() else {
        return Ok(json(BootstrapStatusPayload { required: false }));
    };

    Ok(json(BootstrapStatusPayload {
        required: bootstrap::bootstrap_required(pool).await?,
    }))
}

pub async fn bootstrap_init(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<BootstrapInitRequest>,
) -> AppResult<impl IntoResponse> {
    let pool = state.pool()?;
    let request_context = audit_context::from_headers(&headers);
    let result = bootstrap::bootstrap_init(
        pool,
        bootstrap::BootstrapInitInput {
            username: payload.username,
            display_name: payload.display_name,
            password: payload.password,
            password_confirm: payload.password_confirm,
        },
    )
    .await?;
    let _ = auth::revoke_session(pool, &result.session.raw_token, "session_ttl_reissue").await;
    let ttl_seconds = state.settings.session_ttl_seconds()?;
    let session = auth::issue_session(pool, result.user_id, ttl_seconds).await?;
    let user = auth::user_from_raw_session(pool, &session.raw_token)
        .await?
        .ok_or(AppError::Unauthorized)?;
    let csrf_token = csrf::generate_token();

    audit::record_with_context(
        pool,
        Some(result.user_id),
        "bootstrap.init",
        "user",
        &result.user_id.to_string(),
        r#"{"source":"api"}"#,
        &request_context,
    )
    .await?;

    let session_cookie = auth::session_cookie_header_with_max_age(
        &session.raw_token,
        ttl_seconds,
        state.settings.env == "production",
    );
    let csrf_cookie = csrf::cookie_header(&csrf_token, state.settings.env == "production");

    Ok((
        StatusCode::CREATED,
        AppendHeaders([
            (header::SET_COOKIE, session_cookie),
            (header::SET_COOKIE, csrf_cookie),
        ]),
        json(LoginPayload {
            user: auth_user_payload(user),
            csrf_token,
        }),
    ))
}

pub async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<LoginRequest>,
) -> AppResult<impl IntoResponse> {
    let pool = state.pool()?;
    let request_context = audit_context::from_headers(&headers);
    let ttl_seconds = state.settings.session_ttl_seconds()?;
    let session =
        match auth::login_with_ttl(pool, &payload.username, &payload.password, ttl_seconds).await {
            Ok(session) => session,
            Err(error) => {
                if let Err(audit_error) = audit::record_with_context(
                    pool,
                    None,
                    "auth.login.failed",
                    "user",
                    &payload.username,
                    r#"{"source":"api"}"#,
                    &request_context,
                )
                .await
                {
                    tracing::warn!(%audit_error, "failed to record api login failure audit");
                }
                return Err(error);
            }
        };
    let user = auth::user_from_raw_session(pool, &session.raw_token)
        .await?
        .ok_or(AppError::Unauthorized)?;
    let csrf_token = csrf::generate_token();
    audit::record_with_context(
        pool,
        Some(user.id),
        "auth.login",
        "user",
        &user.username,
        r#"{"source":"api"}"#,
        &request_context,
    )
    .await?;
    let cookie = auth::session_cookie_header_with_max_age(
        &session.raw_token,
        ttl_seconds,
        state.settings.env == "production",
    );
    let csrf_cookie = csrf::cookie_header(&csrf_token, state.settings.env == "production");

    Ok((
        AppendHeaders([
            (header::SET_COOKIE, cookie),
            (header::SET_COOKIE, csrf_cookie),
        ]),
        json(LoginPayload {
            user: auth_user_payload(user),
            csrf_token,
        }),
    ))
}

pub async fn me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<axum::Json<ApiEnvelope<AuthUserPayload>>> {
    let user = require_api_user(&state, &headers).await?;

    Ok(json(auth_user_payload(user)))
}

pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<impl IntoResponse> {
    let pool = state.pool()?;
    let Some(raw_token) = auth::session_cookie(&headers) else {
        return Err(AppError::Unauthorized);
    };
    let actor_user_id = auth::user_from_raw_session(pool, &raw_token)
        .await?
        .map(|user| user.id)
        .ok_or(AppError::Unauthorized)?;
    ensure_api_csrf(&headers)?;
    let request_context = audit_context::from_headers(&headers);
    auth::revoke_session(pool, &raw_token, "api_logout").await?;
    audit::record_with_context(
        pool,
        Some(actor_user_id),
        "auth.logout",
        "session",
        "",
        r#"{"source":"api"}"#,
        &request_context,
    )
    .await?;
    let clear_cookie = auth::clear_session_cookie_header(state.settings.env == "production");

    Ok((
        [(header::SET_COOKIE, clear_cookie)],
        json(LogoutPayload { revoked: true }),
    ))
}

pub async fn list_projects(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ProjectQuery>,
) -> AppResult<axum::Json<ApiEnvelope<PaginatedPayload<ProjectPayload>>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let can_access_all_projects = api_user_can_access_all_projects(pool, &user).await?;
    let pagination = normalize_api_pagination(query.page, query.per_page)?;
    let page = projects::list_project_summaries_for_user_paginated(
        pool,
        user.id,
        can_access_all_projects,
        projects::ProjectListFilter {
            status: normalize_api_project_status(&query.status)?,
        },
        pagination,
    )
    .await?;
    let total_pages = page.total_pages();
    let items = page.items.into_iter().map(project_payload).collect();

    Ok(json(PaginatedPayload {
        items,
        pagination: PaginationPayload {
            page: page.page,
            per_page: page.per_page,
            total_items: page.total_items,
            total_pages,
        },
    }))
}

pub async fn get_current_project(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<axum::Json<ApiEnvelope<Option<CurrentProjectPayload>>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let can_access_all_projects = api_user_can_access_all_projects(pool, &user).await?;
    let current =
        projects::get_or_select_current_project_for_user(pool, user.id, can_access_all_projects)
            .await?
            .map(current_project_payload);

    Ok(json(current))
}

pub async fn update_current_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpdateCurrentProjectRequest>,
) -> AppResult<axum::Json<ApiEnvelope<CurrentProjectPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let can_access_all_projects = api_user_can_access_all_projects(pool, &user).await?;
    let current = projects::set_current_project_for_user(
        pool,
        user.id,
        can_access_all_projects,
        &payload.project_key,
    )
    .await?;

    Ok(json(current_project_payload(current)))
}

pub async fn create_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateProjectRequest>,
) -> AppResult<impl IntoResponse> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.manage").await?;
    let project = projects::create_project(
        pool,
        user.id,
        projects::CreateProjectInput {
            name: payload.name,
            description: payload.description,
            status: payload.status,
            start_date: payload.start_date,
            due_date: payload.due_date,
        },
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "project.create",
        "project",
        &project.project_key,
        "{}",
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        json(ProjectDetailPayload {
            key: project.project_key,
            name: project.name,
            description: project.description,
            status: project.status,
            owner_username: project.owner_username,
            owner: project.owner_display_name,
            start_date: project.start_date,
            due_date: project.due_date,
            created_at: project.created_at,
            updated_at: project.updated_at,
        }),
    ))
}

pub async fn get_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<ProjectDetailPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;

    Ok(json(ProjectDetailPayload {
        key: project.project_key,
        name: project.name,
        description: project.description,
        status: project.status,
        owner_username: project.owner_username,
        owner: project.owner_display_name,
        start_date: project.start_date,
        due_date: project.due_date,
        created_at: project.created_at,
        updated_at: project.updated_at,
    }))
}

pub async fn update_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Json(payload): Json<UpdateProjectRequest>,
) -> AppResult<axum::Json<ApiEnvelope<ProjectDetailPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_member_manage_access(pool, &user, project.id).await?;
    let updated = projects::update_project(
        pool,
        user.id,
        &project_key,
        projects::UpdateProjectInput {
            name: payload.name.unwrap_or_else(|| project.name.clone()),
            description: payload
                .description
                .unwrap_or_else(|| project.description.clone()),
            status: payload.status.unwrap_or_else(|| project.status.clone()),
            owner_username: payload
                .owner_username
                .unwrap_or_else(|| project.owner_username.clone()),
            start_date: payload
                .start_date
                .unwrap_or_else(|| project.start_date.clone()),
            due_date: payload.due_date.unwrap_or_else(|| project.due_date.clone()),
        },
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "project.update",
        "project",
        &updated.project_key,
        &format!(
            r#"{{"status":"{}","owner_username":"{}"}}"#,
            updated.status, updated.owner_username
        ),
    )
    .await?;

    Ok(json(ProjectDetailPayload {
        key: updated.project_key,
        name: updated.name,
        description: updated.description,
        status: updated.status,
        owner_username: updated.owner_username,
        owner: updated.owner_display_name,
        start_date: updated.start_date,
        due_date: updated.due_date,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
    }))
}

pub async fn add_project_member(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Json(payload): Json<AddProjectMemberRequest>,
) -> AppResult<impl IntoResponse> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_member_manage_access(pool, &user, project.id).await?;
    let member = projects::add_project_member(
        pool,
        user.id,
        &project_key,
        &payload.username,
        &payload.member_role,
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "project.member.add",
        "project",
        &project_key,
        &format!(
            r#"{{"username":"{}","member_role":"{}"}}"#,
            member.username, member.member_role
        ),
    )
    .await?;

    Ok((StatusCode::CREATED, json(project_member_payload(member))))
}

pub async fn list_project_members(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<Vec<ProjectMemberPayload>>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    let payload = projects::list_project_members(pool, project.id)
        .await?
        .into_iter()
        .map(project_member_summary_payload)
        .collect();

    Ok(json(payload))
}

pub async fn update_project_member_role(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, username)): Path<(String, String)>,
    Json(payload): Json<UpdateProjectMemberRequest>,
) -> AppResult<axum::Json<ApiEnvelope<ProjectMemberPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_member_manage_access(pool, &user, project.id).await?;
    let member = projects::update_project_member_role(
        pool,
        user.id,
        &project_key,
        &username,
        &payload.member_role,
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "project.member.role.update",
        "project",
        &project_key,
        &format!(
            r#"{{"username":"{}","member_role":"{}"}}"#,
            member.username, member.member_role
        ),
    )
    .await?;

    Ok(json(project_member_payload(member)))
}

pub async fn remove_project_member(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, username)): Path<(String, String)>,
) -> AppResult<StatusCode> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_member_manage_access(pool, &user, project.id).await?;
    projects::remove_project_member(pool, user.id, &project_key, &username).await?;
    audit::record(
        pool,
        Some(user.id),
        "project.member.remove",
        "project",
        &project_key,
        &format!(r#"{{"username":"{}"}}"#, username),
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_work_items(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<WorkItemQuery>,
) -> AppResult<axum::Json<ApiEnvelope<PaginatedPayload<WorkItemPayload>>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    let can_access_all_projects = api_user_can_access_all_projects(pool, &user).await?;
    let item_type = api_work_item_type(query.item_type.as_deref())?;
    let project_key =
        default_api_project_key(pool, &user, can_access_all_projects, query.project_key).await?;
    let pagination = normalize_api_pagination(query.page, query.per_page)?;
    if project_key.is_empty() {
        return Ok(json(PaginatedPayload {
            items: Vec::new(),
            pagination: PaginationPayload {
                page: pagination.page,
                per_page: pagination.per_page,
                total_items: 0,
                total_pages: 1,
            },
        }));
    }
    let page = projects::list_work_item_summaries_filtered_for_user_paginated(
        pool,
        user.id,
        can_access_all_projects,
        projects::WorkItemListFilter {
            item_type: item_type.map(ToOwned::to_owned),
            keyword: query.q,
            status: query.status,
            priority: query.priority,
            project_key,
            assignee_username: query.assignee_username,
        },
        pagination,
    )
    .await?;
    let total_pages = page.total_pages();
    let items = page.items.into_iter().map(work_item_payload).collect();

    Ok(json(PaginatedPayload {
        items,
        pagination: PaginationPayload {
            page: page.page,
            per_page: page.per_page,
            total_items: page.total_items,
            total_pages,
        },
    }))
}

pub async fn create_work_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateWorkItemRequest>,
) -> AppResult<impl IntoResponse> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    let project = projects::get_project_detail(pool, &payload.project_key)
        .await?
        .ok_or_else(|| AppError::BadRequest("项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    let item = projects::create_work_item(
        pool,
        user.id,
        projects::CreateWorkItemInput {
            project_key: payload.project_key,
            item_type: payload.item_type,
            title: payload.title,
            description: payload.description,
            priority: payload.priority,
            assignee_username: payload.assignee_username,
            due_date: payload.due_date,
            parent_item_key: payload.parent_item_key,
        },
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "work_item.create",
        "work_item",
        &item.item_key,
        "{}",
    )
    .await?;

    Ok((StatusCode::CREATED, json(work_item_detail_payload(item))))
}

pub async fn get_work_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<WorkItemDetailPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;

    Ok(json(work_item_detail_payload(item)))
}

pub async fn update_work_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
    Json(payload): Json<UpdateWorkItemRequest>,
) -> AppResult<axum::Json<ApiEnvelope<WorkItemDetailPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    let updated = projects::update_work_item(
        pool,
        user.id,
        &item_key,
        projects::UpdateWorkItemInput {
            title: payload.title.unwrap_or_else(|| item.title.clone()),
            description: payload
                .description
                .unwrap_or_else(|| item.description.clone()),
            status: payload.status.unwrap_or_else(|| item.status.clone()),
            priority: payload.priority.unwrap_or_else(|| item.priority.clone()),
            assignee_username: payload
                .assignee_username
                .unwrap_or_else(|| item.assignee_username.clone()),
            due_date: payload.due_date.unwrap_or_else(|| item.due_date.clone()),
            parent_item_key: payload
                .parent_item_key
                .unwrap_or_else(|| item.parent_item_key.clone()),
        },
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "work_item.update",
        "work_item",
        &updated.item_key,
        "{}",
    )
    .await?;

    Ok(json(work_item_detail_payload(updated)))
}

pub async fn handoff_work_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
    Json(payload): Json<HandoffWorkItemRequest>,
) -> AppResult<axum::Json<ApiEnvelope<WorkItemDetailPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    ensure_api_work_item_accepts_writes(&item)?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    let updated = projects::handoff_work_item(
        pool,
        user.id,
        &item_key,
        projects::HandoffWorkItemInput {
            status: payload.status,
            assignee_username: payload.assignee_username,
            body: payload.body,
            source_comment_id: payload.source_comment_id,
        },
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "work_item.handoff",
        "work_item",
        &updated.item_key,
        &format!(
            r#"{{"status":"{}","assignee_username":"{}"}}"#,
            updated.status, updated.assignee_username
        ),
    )
    .await?;

    Ok(json(work_item_detail_payload(updated)))
}

pub async fn delete_work_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<WorkItemDetailPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.manage").await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    let deleted = projects::delete_work_item(pool, user.id, &item_key).await?;
    audit::record(
        pool,
        Some(user.id),
        "work_item.delete",
        "work_item",
        &deleted.item_key,
        "{}",
    )
    .await?;

    Ok(json(work_item_detail_payload(deleted)))
}

pub async fn restore_work_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<WorkItemDetailPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.manage").await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    let restored = projects::restore_work_item(pool, user.id, &item_key).await?;
    audit::record(
        pool,
        Some(user.id),
        "work_item.restore",
        "work_item",
        &restored.item_key,
        "{}",
    )
    .await?;

    Ok(json(work_item_detail_payload(restored)))
}

pub async fn create_work_item_comment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
    Json(payload): Json<CreateCommentRequest>,
) -> AppResult<impl IntoResponse> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_work_item_accepts_writes(&item)?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    let comment = projects::add_work_item_comment_reply(
        pool,
        user.id,
        &item_key,
        &payload.body,
        payload.parent_comment_id,
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "work_item.comment.create",
        "work_item",
        &item_key,
        "{}",
    )
    .await?;

    Ok((StatusCode::CREATED, json(comment_payload(comment))))
}

pub async fn list_work_item_comments(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<Vec<CommentPayload>>>> {
    let (_user, item, _project) =
        require_api_work_item_context(&state, &headers, &item_key).await?;
    let pool = state.pool()?;
    let payload = projects::list_work_item_comments(pool, item.id)
        .await?
        .into_iter()
        .map(comment_payload)
        .collect();

    Ok(json(payload))
}

pub async fn update_work_item_comment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, comment_id)): Path<(String, i64)>,
    Json(payload): Json<CreateCommentRequest>,
) -> AppResult<axum::Json<ApiEnvelope<CommentPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_work_item_accepts_writes(&item)?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    let comment = projects::update_work_item_comment(
        pool,
        user.id,
        user.is_super_admin,
        &item_key,
        comment_id,
        &payload.body,
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "work_item.comment.update",
        "comment",
        &comment_id.to_string(),
        &format!(r#"{{"work_item":"{item_key}"}}"#),
    )
    .await?;

    Ok(json(comment_payload(comment)))
}

pub async fn delete_work_item_comment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, comment_id)): Path<(String, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<CommentPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_work_item_accepts_writes(&item)?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    let comment = projects::delete_work_item_comment(
        pool,
        user.id,
        user.is_super_admin,
        &item_key,
        comment_id,
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "work_item.comment.delete",
        "comment",
        &comment_id.to_string(),
        &format!(r#"{{"work_item":"{item_key}"}}"#),
    )
    .await?;

    Ok(json(comment_payload(comment)))
}

pub async fn create_work_item_comment_attachment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, comment_id)): Path<(String, i64)>,
    Json(payload): Json<CreateAttachmentRequest>,
) -> AppResult<impl IntoResponse> {
    let (user, item, project, comment) =
        require_api_comment_context(&state, &headers, &item_key, comment_id).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_work_item_accepts_writes(&item)?;
    ensure_api_comment_accepts_attachments(&comment)?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let config = storage::active_config(pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
    let activity_summary = format!("登记评论附件 {}", payload.original_filename);
    let attachment = files::create_attachment(
        pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "comment".to_string(),
            target_id: comment.id,
            project_id: Some(project.id),
            original_filename: payload.original_filename,
            content_type: payload.content_type,
            byte_size: payload.byte_size,
            created_by_user_id: user.id,
            activity_summary: Some(activity_summary),
        },
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "file.attach.comment",
        "comment",
        &comment_id.to_string(),
        &format!(
            r#"{{"work_item":"{}","file_object_id":{}}}"#,
            item.item_key, attachment.file_object_id
        ),
    )
    .await?;

    Ok((StatusCode::CREATED, json(attachment_payload(attachment))))
}

pub async fn list_work_item_comment_attachments(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, comment_id)): Path<(String, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<Vec<AttachmentPayload>>>> {
    let (_user, _item, _project, comment) =
        require_api_comment_context(&state, &headers, &item_key, comment_id).await?;
    let pool = state.pool()?;
    let payload = files::list_attachments(pool, "comment", comment.id)
        .await?
        .into_iter()
        .map(attachment_payload)
        .collect();

    Ok(json(payload))
}

pub async fn work_item_comment_attachment_upload_url(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, comment_id, attachment_id)): Path<(String, i64, i64)>,
    Query(query): Query<SignedUrlQuery>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentSignedUrlPayload>>> {
    let (user, item, project, comment) =
        require_api_comment_context(&state, &headers, &item_key, comment_id).await?;
    let pool = state.pool()?;
    ensure_api_work_item_accepts_writes(&item)?;
    ensure_api_comment_accepts_attachments(&comment)?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "comment", comment.id).await?;

    Ok(json(
        signed_attachment_url_payload(
            &state,
            pool,
            attachment,
            user.id,
            SignedUrlKind::Upload,
            query,
        )
        .await?,
    ))
}

pub async fn work_item_comment_attachment_mark_uploaded(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, comment_id, attachment_id)): Path<(String, i64, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentPayload>>> {
    let (user, item, project, comment) =
        require_api_comment_context(&state, &headers, &item_key, comment_id).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_work_item_accepts_writes(&item)?;
    ensure_api_comment_accepts_attachments(&comment)?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "comment", comment.id).await?;
    storage::verify_uploaded_object(
        pool,
        &state.settings,
        &attachment.object_key,
        attachment.byte_size,
        &attachment.content_type,
    )
    .await?;
    let attachment =
        files::mark_attachment_uploaded(pool, attachment_id, "comment", comment.id).await?;
    audit::record(
        pool,
        Some(user.id),
        "file.upload.completed",
        "comment",
        &comment_id.to_string(),
        &format!(r#"{{"work_item":"{item_key}","attachment_id":{attachment_id}}}"#),
    )
    .await?;

    Ok(json(attachment_payload(attachment)))
}

pub async fn work_item_comment_attachment_download_url(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, comment_id, attachment_id)): Path<(String, i64, i64)>,
    Query(query): Query<SignedUrlQuery>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentSignedUrlPayload>>> {
    let (user, item, _project, comment) =
        require_api_comment_context(&state, &headers, &item_key, comment_id).await?;
    let pool = state.pool()?;
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "comment", comment.id).await?;
    let payload = signed_attachment_url_payload(
        &state,
        pool,
        attachment,
        user.id,
        SignedUrlKind::Download,
        query,
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "file.download.url",
        "comment",
        &comment_id.to_string(),
        &format!(
            r#"{{"source":"api","work_item":"{}","attachment_id":{},"file_object_id":{}}}"#,
            item.item_key, payload.attachment.id, payload.attachment.file_object_id
        ),
    )
    .await?;

    Ok(json(payload))
}

pub async fn work_item_comment_attachment_delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, comment_id, attachment_id)): Path<(String, i64, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentPayload>>> {
    let (user, item, project, comment) =
        require_api_comment_context(&state, &headers, &item_key, comment_id).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_work_item_accepts_writes(&item)?;
    ensure_api_comment_accepts_attachments(&comment)?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let attachment = files::delete_attachment(
        pool,
        attachment_id,
        "comment",
        comment.id,
        user.id,
        Some(project.id),
        Some("删除评论附件"),
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "file.delete",
        "comment",
        &comment_id.to_string(),
        &format!(r#"{{"work_item":"{item_key}","attachment_id":{attachment_id}}}"#),
    )
    .await?;

    Ok(json(attachment_payload(attachment)))
}

pub async fn create_project_attachment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Json(payload): Json<CreateAttachmentRequest>,
) -> AppResult<impl IntoResponse> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let config = storage::active_config(pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
    let activity_summary = format!("登记项目附件 {}", payload.original_filename);
    let attachment = files::create_attachment(
        pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: payload.original_filename,
            content_type: payload.content_type,
            byte_size: payload.byte_size,
            created_by_user_id: user.id,
            activity_summary: Some(activity_summary),
        },
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "file.attach.project",
        "project",
        &project_key,
        &format!(r#"{{"file_object_id":{}}}"#, attachment.file_object_id),
    )
    .await?;

    Ok((StatusCode::CREATED, json(attachment_payload(attachment))))
}

pub async fn list_project_attachments(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<Vec<AttachmentPayload>>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    let payload = files::list_attachments(pool, "project", project.id)
        .await?
        .into_iter()
        .map(attachment_payload)
        .collect();

    Ok(json(payload))
}

pub async fn project_attachment_upload_url(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, attachment_id)): Path<(String, i64)>,
    Query(query): Query<SignedUrlQuery>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentSignedUrlPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "project", project.id).await?;

    Ok(json(
        signed_attachment_url_payload(
            &state,
            pool,
            attachment,
            user.id,
            SignedUrlKind::Upload,
            query,
        )
        .await?,
    ))
}

pub async fn project_attachment_mark_uploaded(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, attachment_id)): Path<(String, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "project", project.id).await?;
    storage::verify_uploaded_object(
        pool,
        &state.settings,
        &attachment.object_key,
        attachment.byte_size,
        &attachment.content_type,
    )
    .await?;
    let attachment =
        files::mark_attachment_uploaded(pool, attachment_id, "project", project.id).await?;
    audit::record(
        pool,
        Some(user.id),
        "file.upload.completed",
        "project",
        &project_key,
        &format!(r#"{{"attachment_id":{attachment_id}}}"#),
    )
    .await?;

    Ok(json(attachment_payload(attachment)))
}

pub async fn project_attachment_download_url(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, attachment_id)): Path<(String, i64)>,
    Query(query): Query<SignedUrlQuery>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentSignedUrlPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "project", project.id).await?;
    let payload = signed_attachment_url_payload(
        &state,
        pool,
        attachment,
        user.id,
        SignedUrlKind::Download,
        query,
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "file.download.url",
        "project",
        &project_key,
        &format!(
            r#"{{"source":"api","attachment_id":{},"file_object_id":{}}}"#,
            payload.attachment.id, payload.attachment.file_object_id
        ),
    )
    .await?;

    Ok(json(payload))
}

pub async fn project_attachment_delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, attachment_id)): Path<(String, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let attachment = files::delete_attachment(
        pool,
        attachment_id,
        "project",
        project.id,
        user.id,
        Some(project.id),
        Some("删除项目附件"),
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "file.delete",
        "project",
        &project_key,
        &format!(r#"{{"attachment_id":{attachment_id}}}"#),
    )
    .await?;

    Ok(json(attachment_payload(attachment)))
}

pub async fn create_work_item_attachment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
    Json(payload): Json<CreateAttachmentRequest>,
) -> AppResult<impl IntoResponse> {
    let (user, item, project) = require_api_work_item_context(&state, &headers, &item_key).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_work_item_accepts_writes(&item)?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let config = storage::active_config(pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
    let activity_summary = format!("登记工作项附件 {}", payload.original_filename);
    let attachment = files::create_attachment(
        pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: payload.original_filename,
            content_type: payload.content_type,
            byte_size: payload.byte_size,
            created_by_user_id: user.id,
            activity_summary: Some(activity_summary),
        },
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "file.attach.work_item",
        "work_item",
        &item_key,
        &format!(r#"{{"file_object_id":{}}}"#, attachment.file_object_id),
    )
    .await?;

    Ok((StatusCode::CREATED, json(attachment_payload(attachment))))
}

pub async fn list_work_item_attachments(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<Vec<AttachmentPayload>>>> {
    let (_user, item, _project) =
        require_api_work_item_context(&state, &headers, &item_key).await?;
    let pool = state.pool()?;
    let payload = files::list_attachments(pool, "work_item", item.id)
        .await?
        .into_iter()
        .map(attachment_payload)
        .collect();

    Ok(json(payload))
}

pub async fn work_item_attachment_upload_url(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, attachment_id)): Path<(String, i64)>,
    Query(query): Query<SignedUrlQuery>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentSignedUrlPayload>>> {
    let (user, item, project) = require_api_work_item_context(&state, &headers, &item_key).await?;
    let pool = state.pool()?;
    ensure_api_work_item_accepts_writes(&item)?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "work_item", item.id).await?;

    Ok(json(
        signed_attachment_url_payload(
            &state,
            pool,
            attachment,
            user.id,
            SignedUrlKind::Upload,
            query,
        )
        .await?,
    ))
}

pub async fn work_item_attachment_mark_uploaded(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, attachment_id)): Path<(String, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentPayload>>> {
    let (user, item, project) = require_api_work_item_context(&state, &headers, &item_key).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_work_item_accepts_writes(&item)?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "work_item", item.id).await?;
    storage::verify_uploaded_object(
        pool,
        &state.settings,
        &attachment.object_key,
        attachment.byte_size,
        &attachment.content_type,
    )
    .await?;
    let attachment =
        files::mark_attachment_uploaded(pool, attachment_id, "work_item", item.id).await?;
    audit::record(
        pool,
        Some(user.id),
        "file.upload.completed",
        "work_item",
        &item_key,
        &format!(r#"{{"attachment_id":{attachment_id}}}"#),
    )
    .await?;

    Ok(json(attachment_payload(attachment)))
}

pub async fn work_item_attachment_download_url(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, attachment_id)): Path<(String, i64)>,
    Query(query): Query<SignedUrlQuery>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentSignedUrlPayload>>> {
    let (user, item, _project) = require_api_work_item_context(&state, &headers, &item_key).await?;
    let pool = state.pool()?;
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "work_item", item.id).await?;
    let payload = signed_attachment_url_payload(
        &state,
        pool,
        attachment,
        user.id,
        SignedUrlKind::Download,
        query,
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "file.download.url",
        "work_item",
        &item_key,
        &format!(
            r#"{{"source":"api","attachment_id":{},"file_object_id":{}}}"#,
            payload.attachment.id, payload.attachment.file_object_id
        ),
    )
    .await?;

    Ok(json(payload))
}

pub async fn work_item_attachment_delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, attachment_id)): Path<(String, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentPayload>>> {
    let (user, item, project) = require_api_work_item_context(&state, &headers, &item_key).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_work_item_accepts_writes(&item)?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let attachment = files::delete_attachment(
        pool,
        attachment_id,
        "work_item",
        item.id,
        user.id,
        Some(project.id),
        Some("删除工作项附件"),
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "file.delete",
        "work_item",
        &item_key,
        &format!(r#"{{"attachment_id":{attachment_id}}}"#),
    )
    .await?;

    Ok(json(attachment_payload(attachment)))
}

pub async fn list_system_users(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<axum::Json<ApiEnvelope<Vec<SystemUserPayload>>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.users.view").await?;
    let payload = users::list_users(pool)
        .await?
        .into_iter()
        .map(system_user_payload)
        .collect();

    Ok(json(payload))
}

pub async fn create_system_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateSystemUserRequest>,
) -> AppResult<impl IntoResponse> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.users.manage").await?;
    let user_id = users::create_user(
        pool,
        users::CreateUserInput {
            username: payload.username.clone(),
            display_name: payload.display_name,
            email: payload.email,
            mobile: payload.mobile,
            password: payload.password,
            role_code: payload.role_code,
        },
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "user.create",
        "user",
        &payload.username,
        r#"{"source":"api"}"#,
    )
    .await?;
    let created = users::get_user_summary(pool, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("用户不存在".to_string()))?;

    Ok((StatusCode::CREATED, json(system_user_payload(created))))
}

pub async fn update_system_user_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(username): Path<String>,
    Json(payload): Json<SetUserStatusRequest>,
) -> AppResult<axum::Json<ApiEnvelope<SystemUserPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.users.manage").await?;
    users::set_user_status(pool, &username, &payload.status).await?;
    audit::record(
        pool,
        Some(user.id),
        "user.status.update",
        "user",
        &username,
        &format!(r#"{{"source":"api","status":"{}"}}"#, payload.status),
    )
    .await?;
    let updated = users::get_user_summary_by_username(pool, &username)
        .await?
        .ok_or_else(|| AppError::NotFound("用户不存在".to_string()))?;

    Ok(json(system_user_payload(updated)))
}

pub async fn update_system_user_role(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(username): Path<String>,
    Json(payload): Json<SetUserRoleRequest>,
) -> AppResult<axum::Json<ApiEnvelope<SystemUserPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.users.manage").await?;
    users::replace_user_role(pool, &username, &payload.role_code).await?;
    audit::record(
        pool,
        Some(user.id),
        "user.role.update",
        "user",
        &username,
        &format!(r#"{{"source":"api","role_code":"{}"}}"#, payload.role_code),
    )
    .await?;
    let updated = users::get_user_summary_by_username(pool, &username)
        .await?
        .ok_or_else(|| AppError::NotFound("用户不存在".to_string()))?;

    Ok(json(system_user_payload(updated)))
}

pub async fn reset_system_user_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(username): Path<String>,
    Json(payload): Json<ResetUserPasswordRequest>,
) -> AppResult<axum::Json<ApiEnvelope<SystemUserPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.users.manage").await?;
    users::reset_user_password(pool, &username, &payload.password).await?;
    audit::record(
        pool,
        Some(user.id),
        "user.password.reset",
        "user",
        &username,
        r#"{"source":"api"}"#,
    )
    .await?;
    let updated = users::get_user_summary_by_username(pool, &username)
        .await?
        .ok_or_else(|| AppError::NotFound("用户不存在".to_string()))?;

    Ok(json(system_user_payload(updated)))
}

pub async fn list_system_roles(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<axum::Json<ApiEnvelope<Vec<SystemRolePayload>>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.roles.view").await?;
    let payload = rbac::list_roles(pool)
        .await?
        .into_iter()
        .map(system_role_payload)
        .collect();

    Ok(json(payload))
}

pub async fn create_system_role(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateSystemRoleRequest>,
) -> AppResult<impl IntoResponse> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.roles.manage").await?;
    rbac::create_role(
        pool,
        &payload.role_code,
        &payload.role_name,
        &payload.data_scope_type,
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "role.create",
        "role",
        &payload.role_code,
        r#"{"source":"api"}"#,
    )
    .await?;
    let role = rbac::get_role(pool, &payload.role_code).await?;

    Ok((StatusCode::CREATED, json(system_role_payload(role))))
}

pub async fn update_system_role_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(role_code): Path<String>,
    Json(payload): Json<SetRoleStatusRequest>,
) -> AppResult<axum::Json<ApiEnvelope<SystemRolePayload>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.roles.manage").await?;
    rbac::set_role_status(pool, &role_code, &payload.status).await?;
    audit::record(
        pool,
        Some(user.id),
        "role.status.update",
        "role",
        &role_code,
        &format!(r#"{{"source":"api","status":"{}"}}"#, payload.status),
    )
    .await?;
    let role = rbac::get_role(pool, &role_code).await?;

    Ok(json(system_role_payload(role)))
}

pub async fn list_system_role_permissions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(role_code): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<Vec<SystemPermissionPayload>>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.roles.view").await?;
    if !rbac::role_exists(pool, &role_code).await? {
        return Err(AppError::NotFound("角色不存在".to_string()));
    }
    let payload = rbac::list_permissions_for_role(pool, Some(&role_code))
        .await?
        .into_iter()
        .map(system_permission_payload)
        .collect();

    Ok(json(payload))
}

pub async fn update_system_role_permissions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(role_code): Path<String>,
    Json(payload): Json<ReplaceRolePermissionsRequest>,
) -> AppResult<axum::Json<ApiEnvelope<Vec<SystemPermissionPayload>>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.roles.manage").await?;
    rbac::replace_role_permissions(pool, &role_code, &payload.permission_keys).await?;
    audit::record(
        pool,
        Some(user.id),
        "role.permissions.update",
        "role",
        &role_code,
        r#"{"source":"api"}"#,
    )
    .await?;
    let permissions = rbac::list_permissions_for_role(pool, Some(&role_code))
        .await?
        .into_iter()
        .map(system_permission_payload)
        .collect();

    Ok(json(permissions))
}

pub async fn list_system_permissions(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<axum::Json<ApiEnvelope<Vec<SystemPermissionPayload>>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.roles.view").await?;
    let payload = rbac::list_permissions_for_role(pool, None)
        .await?
        .into_iter()
        .map(system_permission_payload)
        .collect();

    Ok(json(payload))
}

pub async fn list_system_audit_logs(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<AuditLogQuery>,
) -> AppResult<axum::Json<ApiEnvelope<PaginatedPayload<AuditLogPayload>>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.audit.view").await?;
    let pagination = normalize_api_pagination(query.page, query.per_page)?;
    let page = audit::list_filtered(
        pool,
        audit::AuditLogFilter {
            actor: query.actor,
            action: query.action,
            target_type: query.target_type,
            target_id: query.target_id,
        },
        pagination.page,
        pagination.per_page,
    )
    .await?;
    let total_pages = page.total_pages();
    let items = page.items.into_iter().map(audit_log_payload).collect();

    Ok(json(PaginatedPayload {
        items,
        pagination: PaginationPayload {
            page: page.page,
            per_page: page.per_page,
            total_items: page.total_items,
            total_pages,
        },
    }))
}

pub async fn get_storage_config(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<axum::Json<ApiEnvelope<Option<StorageConfigPayload>>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.storage.view").await?;
    let payload = storage::latest_config(pool)
        .await?
        .map(storage_config_payload);

    Ok(json(payload))
}

pub async fn save_storage_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SaveStorageConfigRequest>,
) -> AppResult<impl IntoResponse> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let request_context = audit_context::from_headers(&headers);
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.storage.manage").await?;
    let config = storage::save_config(
        pool,
        &state.settings,
        user.id,
        storage::SaveStorageConfigInput {
            endpoint: payload.endpoint,
            region: payload.region,
            bucket: payload.bucket,
            access_key_id: payload.access_key_id,
            access_key_secret: payload.access_key_secret,
            activate: payload.activate,
        },
    )
    .await?;
    audit::record_with_context(
        pool,
        Some(user.id),
        "storage.config.save",
        "storage_config",
        &config.id.to_string(),
        &format!(
            r#"{{"source":"api","provider":"{}","bucket":"{}","version":{}}}"#,
            config.provider, config.bucket, config.version
        ),
        &request_context,
    )
    .await?;

    Ok((StatusCode::CREATED, json(storage_config_payload(config))))
}

pub async fn probe_storage_config(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<axum::Json<ApiEnvelope<storage::StorageProbeResult>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let request_context = audit_context::from_headers(&headers);
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.storage.manage").await?;
    let result = storage::probe_active_config(pool, &state.settings).await?;
    audit::record_with_context(
        pool,
        Some(user.id),
        "storage.config.probe",
        "storage_config",
        &result.bucket,
        &format!(
            r#"{{"source":"api","provider":"{}","ok":{}}}"#,
            result.provider, result.ok
        ),
        &request_context,
    )
    .await?;

    Ok(json(result))
}

pub async fn inspect_storage_config(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<axum::Json<ApiEnvelope<storage::StorageBucketInspection>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.storage.view").await?;
    let result = storage::inspect_active_initialization(pool, &state.settings).await?;

    Ok(json(result))
}

pub async fn initialize_storage_config(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<axum::Json<ApiEnvelope<storage::StorageBucketInitializeResult>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let request_context = audit_context::from_headers(&headers);
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.storage.manage").await?;
    let result = storage::initialize_active_config(pool, &state.settings).await?;
    audit::record_with_context(
        pool,
        Some(user.id),
        "storage.bucket.initialize",
        "storage_config",
        &result.bucket,
        &format!(
            r#"{{"source":"api","provider":"{}","ok":{}}}"#,
            result.provider, result.ok
        ),
        &request_context,
    )
    .await?;

    Ok(json(result))
}

pub async fn list_storage_config_versions(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<axum::Json<ApiEnvelope<Vec<StorageConfigVersionPayload>>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.storage.view").await?;
    let payload = storage::list_config_versions(pool)
        .await?
        .into_iter()
        .map(storage_config_version_payload)
        .collect();

    Ok(json(payload))
}

pub async fn rollback_storage_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(version): Path<i64>,
) -> AppResult<axum::Json<ApiEnvelope<StorageConfigPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let request_context = audit_context::from_headers(&headers);
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.storage.manage").await?;
    let config = storage::rollback_config(pool, &state.settings, user.id, version).await?;
    audit::record_with_context(
        pool,
        Some(user.id),
        "storage.config.rollback",
        "storage_config",
        &config.id.to_string(),
        &format!(
            r#"{{"source":"api","from_version":{},"new_version":{},"provider":"{}","bucket":"{}"}}"#,
            version, config.version, config.provider, config.bucket
        ),
        &request_context,
    )
    .await?;

    Ok(json(storage_config_payload(config)))
}

pub async fn test_storage_upload(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<TestStorageUploadQuery>,
    body: Bytes,
) -> AppResult<StatusCode> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    verify_test_storage_upload_grant(&state, &query, user.id)?;
    let content_type = headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/octet-stream");
    storage::write_test_memory_object(
        state.pool()?,
        &state.settings,
        &query.object_key,
        content_type,
        body.to_vec(),
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

fn ensure_api_csrf(headers: &HeaderMap) -> AppResult<()> {
    csrf::verify(headers, "")
}

async fn require_api_user(state: &AppState, headers: &HeaderMap) -> AppResult<auth::AuthUser> {
    let pool = state.pool()?;
    auth::user_from_headers(pool, headers)
        .await?
        .ok_or(AppError::Unauthorized)
}

async fn api_user_can_access_all_projects(
    pool: &sqlx::SqlitePool,
    user: &auth::AuthUser,
) -> AppResult<bool> {
    if user.is_super_admin {
        return Ok(true);
    }

    rbac::user_has_all_data_scope(pool, user.id).await
}

async fn require_api_work_item_context(
    state: &AppState,
    headers: &HeaderMap,
    item_key: &str,
) -> AppResult<(
    auth::AuthUser,
    projects::WorkItemDetail,
    projects::ProjectDetail,
)> {
    let user = require_api_user(state, headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, headers, user.id, "work_item.view").await?;
    let item = projects::get_work_item_detail(pool, item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;

    Ok((user, item, project))
}

async fn require_api_comment_context(
    state: &AppState,
    headers: &HeaderMap,
    item_key: &str,
    comment_id: i64,
) -> AppResult<(
    auth::AuthUser,
    projects::WorkItemDetail,
    projects::ProjectDetail,
    projects::WorkItemCommentSummary,
)> {
    let (user, item, project) = require_api_work_item_context(state, headers, item_key).await?;
    let pool = state.pool()?;
    let comment = projects::get_work_item_comment(pool, item.id, comment_id).await?;

    Ok((user, item, project, comment))
}

async fn ensure_api_project_access(
    pool: &sqlx::SqlitePool,
    user_id: i64,
    is_super_admin: bool,
    project_id: i64,
) -> AppResult<()> {
    if is_super_admin
        || rbac::user_has_all_data_scope(pool, user_id).await?
        || projects::is_project_member(pool, project_id, user_id).await?
    {
        return Ok(());
    }

    Err(AppError::Forbidden("无权访问该项目".to_string()))
}

async fn ensure_api_project_member_manage_access(
    pool: &sqlx::SqlitePool,
    user: &auth::AuthUser,
    project_id: i64,
) -> AppResult<()> {
    let can_access_all_projects = api_user_can_access_all_projects(pool, user).await?;
    if can_access_all_projects && rbac::user_has_permission(pool, user.id, "project.manage").await?
    {
        return Ok(());
    }

    if projects::user_can_manage_project_members(pool, project_id, user.id, user.is_super_admin)
        .await?
    {
        return Ok(());
    }

    Err(AppError::Forbidden(
        "只有项目负责人或项目管理员可以管理项目成员".to_string(),
    ))
}

async fn ensure_api_project_content_write_access(
    pool: &sqlx::SqlitePool,
    user: &auth::AuthUser,
    project_id: i64,
) -> AppResult<()> {
    let can_access_all_projects = api_user_can_access_all_projects(pool, user).await?;
    if can_access_all_projects
        && rbac::user_has_permission(pool, user.id, "work_item.manage").await?
    {
        return Ok(());
    }

    if projects::user_can_write_project_content(pool, project_id, user.id, user.is_super_admin)
        .await?
    {
        return Ok(());
    }

    Err(AppError::Forbidden(
        "只读项目成员不能执行写入操作".to_string(),
    ))
}

fn ensure_api_work_item_accepts_writes(item: &projects::WorkItemDetail) -> AppResult<()> {
    if item.deleted_at.trim().is_empty() {
        return Ok(());
    }

    Err(AppError::BadRequest(
        "工作项已删除，不能执行写入操作".to_string(),
    ))
}

fn ensure_api_comment_accepts_attachments(
    comment: &projects::WorkItemCommentSummary,
) -> AppResult<()> {
    if !comment.is_flow {
        return Ok(());
    }

    Err(AppError::Forbidden("流程记录不能添加附件".to_string()))
}

async fn ensure_api_permission(
    pool: &sqlx::SqlitePool,
    headers: &HeaderMap,
    user_id: i64,
    permission_key: &str,
) -> AppResult<()> {
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

async fn default_api_project_key(
    pool: &sqlx::SqlitePool,
    user: &auth::AuthUser,
    can_access_all_projects: bool,
    explicit_project_key: String,
) -> AppResult<String> {
    let explicit_project_key = explicit_project_key.trim();
    if !explicit_project_key.is_empty() {
        return Ok(explicit_project_key.to_ascii_uppercase());
    }

    Ok(
        projects::get_or_select_current_project_for_user(pool, user.id, can_access_all_projects)
            .await?
            .map(|project| project.project_key)
            .unwrap_or_default(),
    )
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
    if attachment.status == "deleted" {
        return Err(AppError::BadRequest("附件已删除，不能生成签名".to_string()));
    }
    if matches!(kind, SignedUrlKind::Download) && attachment.status != "uploaded" {
        return Err(AppError::BadRequest(
            "附件尚未上传完成，不能下载".to_string(),
        ));
    }

    let expires_in_seconds = normalize_signed_url_expiration(kind, query.expires_in_seconds)?;
    let mut request = match kind {
        SignedUrlKind::Upload => {
            storage::presign_upload_url(
                pool,
                &state.settings,
                &attachment.object_key,
                &attachment.content_type,
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
        bind_test_storage_upload_grant(
            state,
            &attachment.object_key,
            actor_user_id,
            expires_in_seconds,
            &mut request,
        )?;
    }

    Ok(AttachmentSignedUrlPayload {
        attachment: attachment_payload(attachment),
        request,
        expires_in_seconds,
    })
}

fn bind_test_storage_upload_grant(
    state: &AppState,
    object_key: &str,
    user_id: i64,
    expires_in_seconds: u64,
    request: &mut storage::SignedObjectRequest,
) -> AppResult<()> {
    if !request.url.starts_with("/api/v1/test-storage/upload?") {
        return Ok(());
    }

    let expires_in_seconds = i64::try_from(expires_in_seconds)
        .map_err(|_| AppError::BadRequest("测试上传授权有效期无效".to_string()))?;
    let grant = TestStorageUploadGrant {
        object_key: object_key.to_string(),
        user_id,
        expires_at: Utc::now().timestamp() + expires_in_seconds,
    };
    let plaintext = serde_json::to_string(&grant)
        .map_err(|error| AppError::BadRequest(format!("生成测试上传授权失败：{error}")))?;
    let encrypted_grant = crypto::encrypt_secret(
        &state.settings.security_master_key,
        &plaintext,
        TEST_STORAGE_UPLOAD_GRANT_AAD,
    )?;
    let query = serde_urlencoded::to_string([
        ("object_key", object_key),
        ("grant", encrypted_grant.as_str()),
    ])
    .map_err(|error| AppError::BadRequest(format!("生成测试上传地址失败：{error}")))?;
    request.url = format!("/api/v1/test-storage/upload?{query}");
    Ok(())
}

fn verify_test_storage_upload_grant(
    state: &AppState,
    query: &TestStorageUploadQuery,
    user_id: i64,
) -> AppResult<()> {
    let plaintext = crypto::decrypt_secret(
        &state.settings.security_master_key,
        &query.grant,
        TEST_STORAGE_UPLOAD_GRANT_AAD,
    )
    .map_err(|_| AppError::Forbidden("测试对象存储上传授权无效或已过期".to_string()))?;
    let grant: TestStorageUploadGrant = serde_json::from_str(&plaintext)
        .map_err(|_| AppError::Forbidden("测试对象存储上传授权无效或已过期".to_string()))?;
    if grant.object_key != query.object_key
        || grant.user_id != user_id
        || grant.expires_at <= Utc::now().timestamp()
    {
        return Err(AppError::Forbidden(
            "测试对象存储上传授权无效或已过期".to_string(),
        ));
    }
    Ok(())
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

fn api_work_item_type(kind: Option<&str>) -> AppResult<Option<&'static str>> {
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

fn normalize_api_project_status(status: &str) -> AppResult<String> {
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

fn auth_user_payload(user: auth::AuthUser) -> AuthUserPayload {
    AuthUserPayload {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        is_super_admin: user.is_super_admin,
    }
}

fn project_payload(project: projects::ProjectSummary) -> ProjectPayload {
    ProjectPayload {
        key: project.project_key,
        name: project.name,
        status: project.status,
        owner: project.owner_display_name,
        work_item_count: project.work_item_count,
        open_work_item_count: project.open_work_item_count,
        updated_at: project.updated_at,
    }
}

fn current_project_payload(project: projects::CurrentProject) -> CurrentProjectPayload {
    CurrentProjectPayload {
        key: project.project_key,
        name: project.name,
    }
}

fn work_item_payload(item: projects::WorkItemSummary) -> WorkItemPayload {
    WorkItemPayload {
        key: item.item_key,
        item_type: item.item_type,
        title: item.title,
        status: item.status,
        priority: item.priority,
        project_key: item.project_key,
        project_name: item.project_name,
        assignee: item.assignee_display_name,
        updated_at: item.updated_at,
    }
}

fn work_item_detail_payload(item: projects::WorkItemDetail) -> WorkItemDetailPayload {
    WorkItemDetailPayload {
        key: item.item_key,
        item_type: item.item_type,
        title: item.title,
        description: item.description,
        status: item.status,
        priority: item.priority,
        project_key: item.project_key,
        project_name: item.project_name,
        parent_item_key: item.parent_item_key,
        parent_title: item.parent_title,
        assignee_username: item.assignee_username,
        assignee: item.assignee_display_name,
        reporter: item.reporter_display_name,
        due_date: item.due_date,
        created_at: item.created_at,
        updated_at: item.updated_at,
        deleted_at: item.deleted_at,
    }
}

fn project_member_payload(member: projects::ProjectMemberDetail) -> ProjectMemberPayload {
    ProjectMemberPayload {
        user_id: member.user_id,
        display_name: member.display_name,
        username: member.username,
        member_role: member.member_role,
        joined_at: member.joined_at,
    }
}

fn project_member_summary_payload(member: projects::ProjectMemberSummary) -> ProjectMemberPayload {
    ProjectMemberPayload {
        user_id: member.user_id,
        display_name: member.display_name,
        username: member.username,
        member_role: member.member_role,
        joined_at: member.joined_at,
    }
}

fn comment_payload(comment: projects::WorkItemCommentSummary) -> CommentPayload {
    CommentPayload {
        id: comment.id,
        parent_comment_id: comment.parent_comment_id,
        parent_author: comment.parent_author_display_name,
        body: comment.body,
        author: comment.author_display_name,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        is_flow: comment.is_flow,
    }
}

fn notification_payload(notification: notifications::NotificationSummary) -> NotificationPayload {
    NotificationPayload {
        id: notification.id,
        kind: notification.kind,
        title: notification.title,
        body: notification.body,
        actor: notification.actor_display_name,
        created_at: notification.created_at,
        read: !notification.read_at.is_empty(),
        open_url: format!("/web/messages/{}/open", notification.id),
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

fn default_project_status() -> String {
    "not_started".to_string()
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
