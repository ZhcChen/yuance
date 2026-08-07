use axum::{
    Json,
    body::Bytes,
    extract::{Path, Query, State},
    http::{HeaderMap, Method, StatusCode, header},
    response::{
        AppendHeaders, IntoResponse, Response,
        sse::{Event, KeepAlive, Sse},
    },
};
use serde::{Deserialize, Serialize};
use std::convert::Infallible;

use crate::{
    domains::{
        api_tokens, audit, auth, bootstrap, database_stats, device_sessions, files, notifications,
        project_resources, projects, rbac, storage, system_api_tokens, system_releases, users,
    },
    platform::{
        error::{AppError, AppResult},
        realtime,
        security::csrf,
    },
    web::{
        attachment_preview, audit_context,
        response::{ApiEnvelope, json},
        router::{AppState, app_release_version},
        test_storage::{
            TestStorageDownloadQuery, TestStorageUploadQuery, bind_test_storage_download_grant,
            bind_test_storage_upload_grant, verify_test_storage_download_grant,
            verify_test_storage_upload_grant,
        },
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
    pub work_item_count: i64,
    pub active_work_item_count: i64,
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
pub struct ProjectResourcePayload {
    pub id: i64,
    pub project_key: String,
    pub title: String,
    pub category: String,
    pub body: String,
    pub body_format: String,
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
    pub body_format: String,
    pub author: String,
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
pub struct TopbarStatusPayload {
    pub requirements_count: i64,
    pub tasks_count: i64,
    pub bugs_count: i64,
    pub notifications_count: i64,
    pub project_badges: Vec<TopbarProjectBadgePayload>,
    pub current_project: Option<TopbarCurrentProjectPayload>,
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

#[derive(Debug, Serialize)]
pub struct DeviceSessionPayload {
    pub family_id: String,
    pub device_id: String,
    pub device_name: String,
    pub platform: String,
    pub client_version: String,
    pub status: String,
    pub generation: i64,
    pub last_seen_at: String,
    pub created_at: String,
    pub is_current: bool,
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

fn default_notification_limit() -> i64 {
    5
}

fn notification_filter_from_query(
    value: &str,
) -> AppResult<(notifications::NotificationFilter, &'static str)> {
    match value.trim().to_ascii_lowercase().as_str() {
        "" | "all" => Ok((notifications::NotificationFilter::All, "all")),
        "unread" => Ok((notifications::NotificationFilter::Unread, "unread")),
        "pending" | "pending_discussion" => Ok((
            notifications::NotificationFilter::PendingDiscussion,
            "pending",
        )),
        "read" => Ok((notifications::NotificationFilter::Read, "read")),
        _ => Err(AppError::BadRequest("消息筛选条件无效".to_string())),
    }
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

pub async fn list_notifications(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<NotificationQuery>,
) -> AppResult<impl IntoResponse> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_NOTIFICATION_READ).await?;

    let (filter, filter_value) = notification_filter_from_query(&query.filter)?;
    let page = query.page.unwrap_or(1);
    let per_page = query
        .per_page
        .or(query.limit)
        .unwrap_or(default_notification_limit());
    if page < 1 {
        return Err(AppError::BadRequest("页码不能小于 1".to_string()));
    }
    if !(1..=100).contains(&per_page) {
        return Err(AppError::BadRequest(
            "每页数量必须在 1-100 之间".to_string(),
        ));
    }

    let total_items = notifications::count_for_user_filtered(pool, user.id, filter).await?;
    let total_pages = total_pages(total_items, per_page);
    let resolved_page = page.min(total_pages.max(1));
    let items =
        notifications::list_for_user_page_filtered(pool, user.id, filter, resolved_page, per_page)
            .await?
            .into_iter()
            .map(notification_payload)
            .collect();
    let unread_count = notifications::unread_count(pool, user.id).await?;
    let pending_count = notifications::count_for_user_filtered(
        pool,
        user.id,
        notifications::NotificationFilter::PendingDiscussion,
    )
    .await?;
    Ok(no_store_json(NotificationFeedPayload {
        items,
        unread_count,
        pending_count,
        filter: filter_value.to_string(),
        page: resolved_page,
        per_page,
        total_items,
        total_pages,
    }))
}

pub async fn get_notification_target(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(notification_id): Path<i64>,
) -> AppResult<impl IntoResponse> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_NOTIFICATION_READ).await?;
    let notification = notifications::get_for_user(pool, user.id, notification_id).await?;
    Ok(no_store_json(notification_target_result_payload(
        notification,
    )))
}

pub async fn mark_notification_read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(notification_id): Path<i64>,
) -> AppResult<impl IntoResponse> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_NOTIFICATION_READ).await?;
    ensure_api_csrf(&headers)?;
    let notification = notifications::mark_read(pool, user.id, notification_id).await?;
    Ok(no_store_json(notification_target_result_payload(
        notification,
    )))
}

pub async fn mark_all_notifications_read(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<impl IntoResponse> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_NOTIFICATION_READ).await?;
    ensure_api_csrf(&headers)?;
    let affected = notifications::mark_all_read(pool, user.id).await?;
    Ok(no_store_json(NotificationMarkAllReadPayload { affected }))
}

pub async fn get_topbar_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<impl IntoResponse> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    let can_access_all_projects = api_user_can_access_all_projects(pool, &user).await?;
    let token_project_scope = api_token_project_scope_keys(pool, &headers, user.id).await?;
    let can_view_projects = rbac::user_has_permission(pool, user.id, "project.view").await?;
    let can_view_work_items = rbac::user_has_permission(pool, user.id, "work_item.view").await?;

    let current_project = if can_view_projects || can_view_work_items {
        projects::get_or_select_current_project_for_user(pool, user.id, can_access_all_projects)
            .await?
            .filter(|project| {
                project_key_in_token_scope(&token_project_scope, &project.project_key)
            })
    } else {
        None
    };
    let current_project_key = current_project
        .as_ref()
        .map(|project| project.project_key.as_str());

    let work_item_counts = if can_view_work_items {
        ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_WORK_ITEM_READ).await?;
        projects::count_pending_assigned_work_items(
            pool,
            user.id,
            can_access_all_projects,
            current_project_key,
        )
        .await?
    } else {
        projects::WorkItemAssignmentCounts::default()
    };

    let project_badges = if can_view_projects || can_view_work_items {
        ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_PROJECT_READ).await?;
        ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_WORK_ITEM_READ).await?;
        projects::count_pending_assigned_work_items_by_project(
            pool,
            user.id,
            can_access_all_projects,
        )
        .await?
        .into_iter()
        .filter(|project| project_key_in_token_scope(&token_project_scope, &project.project_key))
        .map(|project| TopbarProjectBadgePayload {
            project_key: project.project_key,
            pending_count: project.total,
        })
        .collect()
    } else {
        Vec::new()
    };

    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_NOTIFICATION_READ).await?;
    let notifications_count = notifications::unread_count(pool, user.id).await?;
    let current_project = current_project.map(|project| {
        let pending_count = project_badges
            .iter()
            .find(|badge| badge.project_key.eq_ignore_ascii_case(&project.project_key))
            .map(|badge| badge.pending_count)
            .unwrap_or_default();
        TopbarCurrentProjectPayload {
            key: project.project_key,
            name: project.name,
            pending_count,
        }
    });

    Ok(no_store_json(TopbarStatusPayload {
        requirements_count: work_item_counts.requirements,
        tasks_count: work_item_counts.tasks,
        bugs_count: work_item_counts.bugs,
        notifications_count,
        project_badges,
        current_project,
    }))
}

pub async fn topbar_events(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<impl IntoResponse> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let user_id = user.id;
    let release_version = app_release_version();
    let mut receiver = realtime::subscribe_user_realtime();
    let stream = async_stream::stream! {
        yield Result::<Event, Infallible>::Ok(
            Event::default().event("release-version").data(release_version.clone())
        );
        yield Result::<Event, Infallible>::Ok(Event::default().event("topbar").data("connected"));
        loop {
            match receiver.recv().await {
                Ok(message) => {
                    if message.kind == "topbar" && message.user_ids.iter().any(|target_id| *target_id == user_id) {
                        yield Result::<Event, Infallible>::Ok(Event::default().event("topbar").data("refresh"));
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                    yield Result::<Event, Infallible>::Ok(Event::default().event("topbar").data("refresh"));
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    };

    Ok((
        AppendHeaders([
            (header::CACHE_CONTROL, "private, no-store"),
            (header::HeaderName::from_static("x-accel-buffering"), "no"),
        ]),
        Sse::new(stream).keep_alive(
            KeepAlive::new()
                .interval(std::time::Duration::from_secs(20))
                .text("keep-alive"),
        ),
    ))
}

pub async fn work_item_events(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
) -> AppResult<impl IntoResponse> {
    let (user, _item, _project) =
        require_api_work_item_context(&state, &headers, &item_key).await?;
    let mut receiver = realtime::subscribe_work_item_realtime();
    let snapshot = work_item_typing_snapshot_payload(realtime::work_item_typing_snapshot_for_user(
        &item_key, user.id,
    ));
    let snapshot_json =
        serde_json::to_string(&snapshot).unwrap_or_else(|_| r#"{"users":[]}"#.to_string());
    let event_item_key = item_key.clone();
    let user_id = user.id;
    let stream = async_stream::stream! {
        yield Result::<Event, Infallible>::Ok(
            Event::default().event("typing").data(snapshot_json.clone())
        );
        loop {
            match receiver.recv().await {
                Ok(message) => {
                    if message.item_key != event_item_key {
                        continue;
                    }
                    if message.kind == "discussion-refresh" {
                        yield Result::<Event, Infallible>::Ok(
                            Event::default().event("discussion-refresh").data("refresh")
                        );
                        continue;
                    }
                    if message.kind == "typing" {
                        let snapshot = work_item_typing_snapshot_payload(
                            realtime::work_item_typing_snapshot_for_user(&event_item_key, user_id),
                        );
                        let payload = serde_json::to_string(&snapshot)
                            .unwrap_or_else(|_| r#"{"users":[]}"#.to_string());
                        yield Result::<Event, Infallible>::Ok(
                            Event::default().event("typing").data(payload)
                        );
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                    yield Result::<Event, Infallible>::Ok(
                        Event::default().event("discussion-refresh").data("refresh")
                    );
                    let snapshot = work_item_typing_snapshot_payload(
                        realtime::work_item_typing_snapshot_for_user(&event_item_key, user_id),
                    );
                    let payload = serde_json::to_string(&snapshot)
                        .unwrap_or_else(|_| r#"{"users":[]}"#.to_string());
                    yield Result::<Event, Infallible>::Ok(
                        Event::default().event("typing").data(payload)
                    );
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    };

    Ok(Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(std::time::Duration::from_secs(20))
            .text("keep-alive"),
    ))
}

pub async fn update_work_item_typing(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
    Json(payload): Json<WorkItemTypingRequest>,
) -> AppResult<impl IntoResponse> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_COMMENT_WRITE).await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_work_item_accepts_writes(&item)?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;

    realtime::update_work_item_typing_presence(
        &item_key,
        &payload.client_id,
        user.id,
        &principal_realtime_display_name(&principal),
        payload.active,
    );

    Ok(StatusCode::NO_CONTENT)
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
    pub expires_at: String,
    pub checksum_sha256: String,
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
pub struct SystemReleaseSettingsPayload {
    pub retention_count: i64,
    pub updated_by: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct SystemReleaseAssetPayload {
    pub id: i64,
    pub release_id: i64,
    pub file_object_id: i64,
    pub platform: String,
    pub architecture: String,
    pub artifact_kind: String,
    pub object_key: String,
    pub filename: String,
    pub content_type: String,
    pub byte_size: i64,
    pub status: String,
    pub checksum_sha256: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct SystemReleasePayload {
    pub id: i64,
    pub version_name: String,
    pub title: String,
    pub notes: String,
    pub status: String,
    pub channel: String,
    pub verification_status: String,
    pub manifest_sha256: String,
    pub signing_key_id: String,
    pub source_commit: String,
    pub source_tag: String,
    pub published_at: String,
    pub verified_at: String,
    pub withdrawn_at: String,
    pub withdrawal_reason: String,
    pub github_withdrawal_status: String,
    pub created_by: String,
    pub updated_by: String,
    pub created_at: String,
    pub updated_at: String,
    pub asset_count: i64,
    pub platform_count: i64,
}

#[derive(Debug, Serialize)]
pub struct SystemReleaseDetailPayload {
    pub release: SystemReleasePayload,
    pub assets: Vec<SystemReleaseAssetPayload>,
}

#[derive(Debug, Clone)]
struct ApiTokenActor {
    display_name: String,
}

#[derive(Debug, Clone)]
struct DeviceApiPrincipal {
    device_id: String,
    family_id: String,
    generation: i64,
    authorization_version: i64,
}

#[derive(Debug, Clone)]
enum ApiPrincipalKind {
    Session,
    ApiToken(ApiTokenActor),
    Device(DeviceApiPrincipal),
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
            ApiPrincipalKind::Session | ApiPrincipalKind::Device(_) => String::new(),
        }
    }

    fn audit_details(&self) -> String {
        match &self.kind {
            ApiPrincipalKind::Session => serde_json::json!({"source": "session"}).to_string(),
            ApiPrincipalKind::ApiToken(_) => serde_json::json!({"source": "api_token"}).to_string(),
            ApiPrincipalKind::Device(device) => serde_json::json!({
                "source": "device",
                "device_id": device.device_id,
                "family_id": device.family_id,
                "generation": device.generation,
                "authorization_version": device.authorization_version,
            })
            .to_string(),
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

fn principal_realtime_display_name(principal: &ApiPrincipal) -> String {
    let token_actor = principal.actor_display_name_snapshot();
    if !token_actor.trim().is_empty() {
        return token_actor;
    }
    if !principal.user.display_name.trim().is_empty() {
        return principal.user.display_name.trim().to_string();
    }
    principal.user.username.trim().to_string()
}

#[derive(Debug, Clone)]
enum SystemReleaseApiPrincipal {
    Session(auth::AuthUser),
    Token(system_api_tokens::AuthenticatedSystemApiToken),
}

impl SystemReleaseApiPrincipal {
    fn actor_user_id(&self) -> i64 {
        match self {
            Self::Session(user) => user.id,
            Self::Token(token) => token.owner_user_id,
        }
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
}

#[derive(Debug, Deserialize)]
pub struct SystemReleaseListQuery {
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
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

#[derive(Debug, Deserialize)]
pub struct CreateSystemReleaseRequest {
    version_name: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    notes: String,
    #[serde(default = "default_release_channel")]
    channel: String,
    #[serde(default)]
    manifest_sha256: String,
    #[serde(default)]
    signing_key_id: String,
    #[serde(default)]
    source_commit: String,
    #[serde(default)]
    source_tag: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSystemReleaseRequest {
    version_name: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    notes: String,
    #[serde(default)]
    publish: bool,
}

#[derive(Debug, Deserialize)]
pub struct WithdrawSystemReleaseRequest {
    reason: String,
    #[serde(default = "default_github_withdrawal_status")]
    github_withdrawal_status: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSystemReleaseWithdrawalRequest {
    github_withdrawal_status: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSystemReleaseSettingsRequest {
    retention_count: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateSystemReleaseAssetRequest {
    platform: String,
    architecture: String,
    #[serde(default = "default_release_artifact_kind")]
    artifact_kind: String,
    original_filename: String,
    content_type: String,
    byte_size: i64,
    #[serde(default)]
    checksum_sha256: String,
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
    let _ =
        auth::revoke_refresh_session(pool, &result.session.refresh_token, "session_ttl_reissue")
            .await;
    let ttl_seconds = state.settings.session_ttl_seconds()?;
    let refresh_ttl_seconds = state.settings.refresh_session_ttl_seconds()?;
    let session =
        auth::issue_session_with_ttls(pool, result.user_id, ttl_seconds, refresh_ttl_seconds)
            .await?;
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
    let refresh_cookie = auth::refresh_cookie_header_with_max_age(
        &session.refresh_token,
        refresh_ttl_seconds,
        state.settings.env == "production",
    );
    let csrf_cookie = csrf::cookie_header(&csrf_token, state.settings.env == "production");

    Ok((
        StatusCode::CREATED,
        AppendHeaders([
            (header::SET_COOKIE, session_cookie),
            (header::SET_COOKIE, refresh_cookie),
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
    let refresh_ttl_seconds = state.settings.refresh_session_ttl_seconds()?;
    let session = match auth::login_with_ttls(
        pool,
        &payload.username,
        &payload.password,
        ttl_seconds,
        refresh_ttl_seconds,
    )
    .await
    {
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
    let refresh_cookie = auth::refresh_cookie_header_with_max_age(
        &session.refresh_token,
        refresh_ttl_seconds,
        state.settings.env == "production",
    );
    let csrf_cookie = csrf::cookie_header(&csrf_token, state.settings.env == "production");

    Ok((
        AppendHeaders(vec![
            (header::CACHE_CONTROL, "private, no-store".to_string()),
            (header::SET_COOKIE, cookie),
            (header::SET_COOKIE, refresh_cookie),
            (header::SET_COOKIE, csrf_cookie),
        ]),
        json(LoginPayload {
            user: auth_user_payload(user),
            csrf_token,
        }),
    ))
}

pub async fn me(State(state): State<AppState>, headers: HeaderMap) -> AppResult<impl IntoResponse> {
    let user = require_d2_api_principal(&state, &headers).await?.user;

    Ok(no_store_json(auth_user_payload(user)))
}

pub async fn get_own_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<axum::Json<ApiEnvelope<OwnProfilePayload>>> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    ensure_account_principal(&principal)?;
    let profile = users::get_user_summary(state.pool()?, principal.user.id)
        .await?
        .ok_or(AppError::Unauthorized)?;
    Ok(json(own_profile_payload(profile)))
}

pub async fn update_own_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpdateOwnProfileRequest>,
) -> AppResult<axum::Json<ApiEnvelope<OwnProfilePayload>>> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    ensure_account_principal(&principal)?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    let profile = users::update_own_profile(
        pool,
        principal.user.id,
        users::UpdateOwnProfileInput {
            display_name: payload.display_name,
            email: payload.email,
            mobile: payload.mobile,
        },
    )
    .await?;
    audit::record_with_context(
        pool,
        Some(principal.user.id),
        "me.profile.update",
        "user",
        &profile.username,
        &principal.audit_details(),
        &audit_context::from_headers(&headers),
    )
    .await?;
    Ok(json(own_profile_payload(profile)))
}

pub async fn update_own_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpdateOwnPasswordRequest>,
) -> AppResult<StatusCode> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    ensure_account_principal(&principal)?;
    ensure_api_csrf(&headers)?;
    if payload.new_password != payload.new_password_confirm {
        return Err(AppError::BadRequest("两次输入的新密码不一致".to_string()));
    }
    let current_session = match &principal.kind {
        ApiPrincipalKind::Session => {
            let raw_session = auth::session_cookie(&headers).ok_or(AppError::Unauthorized)?;
            let raw_refresh = auth::refresh_cookie(&headers);
            users::CurrentPasswordSession::Browser {
                raw_session,
                raw_refresh,
            }
        }
        ApiPrincipalKind::Device(device) => users::CurrentPasswordSession::Device {
            family_id: device.family_id.clone(),
        },
        ApiPrincipalKind::ApiToken(_) => unreachable!("account principal was checked"),
    };
    users::change_own_password(
        state.pool()?,
        principal.user.id,
        &payload.current_password,
        &payload.new_password,
        current_session,
    )
    .await?;
    audit::record_with_context(
        state.pool()?,
        Some(principal.user.id),
        "me.password.update",
        "user",
        &principal.user.username,
        &principal.audit_details(),
        &audit_context::from_headers(&headers),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
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
    if let Some(raw_refresh) = auth::refresh_cookie(&headers) {
        auth::revoke_refresh_session(pool, &raw_refresh, "api_logout").await?;
    }
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
    let clear_refresh_cookie =
        auth::clear_refresh_cookie_header(state.settings.env == "production");

    Ok((
        AppendHeaders(vec![
            (header::CACHE_CONTROL, "private, no-store".to_string()),
            (header::SET_COOKIE, clear_cookie),
            (header::SET_COOKIE, clear_refresh_cookie),
        ]),
        json(LogoutPayload { revoked: true }),
    ))
}

pub async fn list_projects(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ProjectQuery>,
) -> AppResult<axum::Json<ApiEnvelope<PaginatedPayload<ProjectPayload>>>> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let can_access_all_projects = api_user_can_access_all_projects(pool, &user).await?;
    let pagination = normalize_api_pagination(query.page, query.per_page)?;
    let filter = projects::ProjectListFilter {
        status: normalize_api_project_status(&query.status)?,
    };
    let token_project_scope = api_token_project_scope_keys(pool, &headers, user.id).await?;
    if token_project_scope.is_some() {
        let all = projects::list_project_summaries_for_user_paginated(
            pool,
            user.id,
            can_access_all_projects,
            filter,
            projects::Pagination {
                page: 1,
                per_page: i64::MAX,
            },
        )
        .await?;
        let items = all
            .items
            .into_iter()
            .filter(|project| {
                project_key_in_token_scope(&token_project_scope, &project.project_key)
            })
            .map(project_payload)
            .collect();
        return Ok(json(paginate_api_items(items, pagination)));
    }

    let page = projects::list_project_summaries_for_user_paginated(
        pool,
        user.id,
        can_access_all_projects,
        filter,
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

pub async fn search(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<SearchQuery>,
) -> AppResult<axum::Json<ApiEnvelope<PaginatedPayload<SearchResultPayload>>>> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    let pagination = normalize_api_pagination(query.page, query.per_page)?;
    let search_query = query.q.trim();
    if search_query.chars().count() > 128 {
        return Err(AppError::BadRequest(
            "搜索关键词不能超过 128 个字符".to_string(),
        ));
    }
    let include_projects = rbac::user_has_permission(pool, user.id, "project.view").await?;
    let include_work_items = rbac::user_has_permission(pool, user.id, "work_item.view").await?;
    let can_access_all_projects = api_user_can_access_all_projects(pool, user).await?;
    let page = projects::search_visible_paginated(
        pool,
        user.id,
        can_access_all_projects,
        search_query,
        include_projects,
        include_work_items,
        pagination,
    )
    .await?;
    let total_pages = page.total_pages();
    let items = page.items.into_iter().map(search_result_payload).collect();

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
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let can_access_all_projects = api_user_can_access_all_projects(pool, &user).await?;
    let token_project_scope = api_token_project_scope_keys(pool, &headers, user.id).await?;
    let current =
        projects::get_or_select_current_project_for_user(pool, user.id, can_access_all_projects)
            .await?
            .filter(|project| {
                project_key_in_token_scope(&token_project_scope, &project.project_key)
            })
            .map(current_project_payload);

    Ok(json(current))
}

pub async fn update_current_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpdateCurrentProjectRequest>,
) -> AppResult<axum::Json<ApiEnvelope<CurrentProjectPayload>>> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let token_project_scope = api_token_project_scope_keys(pool, &headers, user.id).await?;
    if !project_key_in_token_scope(&token_project_scope, &payload.project_key) {
        return Err(AppError::Forbidden(
            "访问 Token 不允许访问该项目".to_string(),
        ));
    }
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
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
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
        &principal.audit_details(),
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
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;

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
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
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
        &principal.audit_details_with(serde_json::json!({
            "status": updated.status,
            "owner_username": updated.owner_username,
        })),
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
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
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
        &principal.audit_details_with(serde_json::json!({
            "username": member.username,
            "member_role": member.member_role,
        })),
    )
    .await?;

    Ok((StatusCode::CREATED, json(project_member_payload(member))))
}

pub async fn list_project_members(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<Vec<ProjectMemberPayload>>>> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
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
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
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
        &principal.audit_details_with(serde_json::json!({
            "username": member.username,
            "member_role": member.member_role,
        })),
    )
    .await?;

    Ok(json(project_member_payload(member)))
}

pub async fn remove_project_member(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, username)): Path<(String, String)>,
) -> AppResult<StatusCode> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_member_manage_access(pool, &user, project.id).await?;
    projects::remove_project_member(pool, user.id, &project_key, &username).await?;
    audit::record(
        pool,
        Some(user.id),
        "project.member.remove",
        "project",
        &project_key,
        &principal.audit_details_with(serde_json::json!({"username": username})),
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_project_cycles(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<Vec<ProjectCyclePayload>>>> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    Ok(json(
        projects::list_project_cycles(pool, project.id)
            .await?
            .into_iter()
            .map(|cycle| project_cycle_payload(cycle, Vec::new()))
            .collect(),
    ))
}

pub async fn get_project_cycle(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, cycle_id)): Path<(String, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<ProjectCyclePayload>>> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    let cycle = projects::get_project_cycle(pool, project.id, cycle_id).await?;
    let work_items =
        projects::list_project_cycle_work_item_snapshots(pool, project.id, cycle_id).await?;
    Ok(json(project_cycle_payload(cycle, work_items)))
}

pub async fn create_project_cycle(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Json(payload): Json<ProjectCycleRequest>,
) -> AppResult<impl IntoResponse> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, user, project.id).await?;
    let cycle =
        projects::create_project_cycle(pool, user.id, &project_key, cycle_create_input(payload))
            .await?;
    audit::record(
        pool,
        Some(user.id),
        "project.cycle.create",
        "project_cycle",
        &cycle.id.to_string(),
        &principal.audit_details_with(serde_json::json!({"project_key": project_key})),
    )
    .await?;
    Ok((
        StatusCode::CREATED,
        json(project_cycle_payload(cycle, Vec::new())),
    ))
}

pub async fn update_project_cycle(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, cycle_id)): Path<(String, i64)>,
    Json(payload): Json<ProjectCycleRequest>,
) -> AppResult<axum::Json<ApiEnvelope<ProjectCyclePayload>>> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, user, project.id).await?;
    let input = cycle_update_input(payload);
    let cycle =
        projects::update_project_cycle(pool, user.id, &project_key, cycle_id, input).await?;
    audit::record(
        pool,
        Some(user.id),
        "project.cycle.update",
        "project_cycle",
        &cycle.id.to_string(),
        &principal.audit_details_with(serde_json::json!({"project_key": project_key})),
    )
    .await?;
    Ok(json(project_cycle_payload(cycle, Vec::new())))
}

pub async fn close_project_cycle(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, cycle_id)): Path<(String, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<ProjectCyclePayload>>> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, user, project.id).await?;
    let cycle = projects::close_project_cycle(pool, user.id, &project_key, cycle_id).await?;
    audit::record(
        pool,
        Some(user.id),
        "project.cycle.close",
        "project_cycle",
        &cycle.id.to_string(),
        &principal.audit_details_with(serde_json::json!({"project_key": project_key})),
    )
    .await?;
    Ok(json(project_cycle_payload(cycle, Vec::new())))
}

pub async fn list_work_items(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<WorkItemQuery>,
) -> AppResult<axum::Json<ApiEnvelope<PaginatedPayload<WorkItemPayload>>>> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    let can_access_all_projects = api_user_can_access_all_projects(pool, &user).await?;
    let item_type = api_work_item_type(query.item_type.as_deref())?;
    let token_project_scope = api_token_project_scope_keys(pool, &headers, user.id).await?;
    let explicit_project_key = query.project_key.trim().to_string();
    let project_key = if explicit_project_key.is_empty() && token_project_scope.is_some() {
        String::new()
    } else {
        default_api_project_key(pool, &user, can_access_all_projects, query.project_key).await?
    };
    let pagination = normalize_api_pagination(query.page, query.per_page)?;
    if !project_key.is_empty() && !project_key_in_token_scope(&token_project_scope, &project_key) {
        return Err(AppError::Forbidden(
            "访问 Token 不允许访问该项目".to_string(),
        ));
    }
    if project_key.is_empty() {
        if token_project_scope.is_some() {
            let page = projects::list_work_item_summaries_filtered_for_user_paginated(
                pool,
                user.id,
                can_access_all_projects,
                projects::WorkItemListFilter {
                    item_type: item_type.map(ToOwned::to_owned),
                    keyword: query.q,
                    status: query.status,
                    priority: query.priority,
                    project_key: String::new(),
                    assignee_username: query.assignee_username,
                    cycle_id: String::new(),
                    sort_by: String::new(),
                },
                projects::Pagination {
                    page: 1,
                    per_page: i64::MAX,
                },
            )
            .await?;
            let items = page
                .items
                .into_iter()
                .filter(|item| project_key_in_token_scope(&token_project_scope, &item.project_key))
                .map(work_item_payload)
                .collect();
            return Ok(json(paginate_api_items(items, pagination)));
        }

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
            cycle_id: String::new(),
            sort_by: String::new(),
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
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_WORK_ITEM_WRITE).await?;
    let project = projects::get_project_detail(pool, &payload.project_key)
        .await?
        .ok_or_else(|| AppError::BadRequest("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
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
            actor_display_name_snapshot: principal.actor_display_name_snapshot(),
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
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;

    Ok(json(work_item_detail_payload(item)))
}

pub async fn update_work_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
    Json(payload): Json<UpdateWorkItemRequest>,
) -> AppResult<axum::Json<ApiEnvelope<WorkItemDetailPayload>>> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_WORK_ITEM_WRITE).await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    let status = payload.status.unwrap_or_else(|| item.status.clone());
    let assignee_username = payload
        .assignee_username
        .unwrap_or_else(|| item.assignee_username.clone());
    let updated = projects::update_work_item(
        pool,
        user.id,
        &item_key,
        projects::UpdateWorkItemInput {
            title: payload.title.unwrap_or_else(|| item.title.clone()),
            description: payload
                .description
                .unwrap_or_else(|| item.description.clone()),
            status,
            priority: payload.priority.unwrap_or_else(|| item.priority.clone()),
            assignee_username,
            due_date: payload.due_date.unwrap_or_else(|| item.due_date.clone()),
            parent_item_key: payload
                .parent_item_key
                .unwrap_or_else(|| item.parent_item_key.clone()),
            actor_display_name_snapshot: principal.actor_display_name_snapshot(),
        },
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "work_item.update",
        "work_item",
        &updated.item_key,
        &principal.audit_details(),
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
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_WORK_ITEM_WRITE).await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    ensure_api_work_item_accepts_writes(&item)?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
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
            actor_display_name_snapshot: principal.actor_display_name_snapshot(),
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
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
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
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_COMMENT_WRITE).await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_work_item_accepts_writes(&item)?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, user, project.id).await?;
    let actor_display_name_snapshot = principal.actor_display_name_snapshot();
    let comment = projects::add_work_item_comment_reply_with_format_and_actor(
        pool,
        user.id,
        &item_key,
        &payload.body,
        &payload.body_format,
        payload.parent_comment_id,
        &actor_display_name_snapshot,
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

pub async fn create_work_item_comment_draft(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
    Json(payload): Json<CreateCommentRequest>,
) -> AppResult<impl IntoResponse> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_COMMENT_WRITE).await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_work_item_accepts_writes(&item)?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    let comment = projects::create_work_item_comment_draft(
        pool,
        user.id,
        &item_key,
        payload.parent_comment_id,
        &principal.actor_display_name_snapshot(),
    )
    .await?;

    Ok((StatusCode::CREATED, json(comment_payload(comment))))
}

pub async fn publish_work_item_comment_draft(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, comment_id)): Path<(String, i64)>,
    Json(payload): Json<CreateCommentRequest>,
) -> AppResult<axum::Json<ApiEnvelope<CommentPayload>>> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_COMMENT_WRITE).await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_work_item_accepts_writes(&item)?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    let comment = projects::publish_work_item_comment_draft(
        pool,
        user.id,
        &item_key,
        comment_id,
        &payload.body,
        &payload.body_format,
        &principal.actor_display_name_snapshot(),
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

    Ok(json(comment_payload(comment)))
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
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_COMMENT_WRITE).await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_work_item_accepts_writes(&item)?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    let comment = projects::update_work_item_comment_with_format(
        pool,
        user.id,
        user.is_super_admin,
        &item_key,
        comment_id,
        &payload.body,
        &payload.body_format,
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

pub async fn create_work_item_comment_attachment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, comment_id)): Path<(String, i64)>,
    Json(payload): Json<CreateAttachmentRequest>,
) -> AppResult<impl IntoResponse> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let (user, item, project, comment) =
        require_api_comment_context(&state, &headers, &item_key, comment_id).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_COMMENT_WRITE).await?;
    ensure_api_work_item_accepts_writes(&item)?;
    ensure_api_comment_accepts_attachments(&comment)?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let config = storage::active_config(pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
    let activity_summary = if comment.is_draft {
        None
    } else {
        Some(format!("登记评论附件 {}", payload.original_filename))
    };
    let checksum_sha256 = payload.checksum_sha256.clone();
    let attachment = files::create_attachment_with_checksum(
        pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "comment".to_string(),
            target_id: comment.id,
            project_id: Some(project.id),
            folder_id: None,
            original_filename: payload.original_filename,
            content_type: payload.content_type,
            byte_size: payload.byte_size,
            created_by_user_id: user.id,
            created_by_display_name_snapshot: principal.actor_display_name_snapshot(),
            activity_summary,
        },
        &checksum_sha256,
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
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_COMMENT_WRITE).await?;
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
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_COMMENT_WRITE).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
    let (user, item, project, comment) =
        require_api_comment_context(&state, &headers, &item_key, comment_id).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_COMMENT_WRITE).await?;
    ensure_api_work_item_accepts_writes(&item)?;
    ensure_api_comment_accepts_attachments(&comment)?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    if !comment.is_draft {
        let editor_context = headers
            .get("x-yuance-editor-context")
            .and_then(|value| value.to_str().ok())
            .unwrap_or("");
        match editor_context {
            "work-item-primary-post"
                if work_item_comment_matches_primary_post_summary(&item, &comment) => {}
            "work-item-comment-edit"
                if projects::user_can_manage_work_item_comment(
                    pool,
                    project.id,
                    comment.author_user_id,
                    user.id,
                    user.is_super_admin,
                )
                .await? => {}
            _ => {
                return Err(AppError::BadRequest(
                    "已发布评论附件不能通过此入口删除".to_string(),
                ));
            }
        }
    }
    let existing =
        files::get_attachment_for_target(pool, attachment_id, "comment", comment.id).await?;
    storage::delete_object_if_exists(pool, &state.settings, &existing.object_key).await?;
    let attachment = files::archive_attachment(
        pool,
        attachment_id,
        "comment",
        comment.id,
        user.id,
        &principal.actor_display_name_snapshot(),
        None,
        None,
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "file.archive",
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
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let config = storage::active_config(pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
    let activity_summary = format!("登记项目附件 {}", payload.original_filename);
    let checksum_sha256 = payload.checksum_sha256.clone();
    let attachment = files::create_attachment_with_checksum(
        pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            folder_id: payload.folder_id,
            original_filename: payload.original_filename,
            content_type: payload.content_type,
            byte_size: payload.byte_size,
            created_by_user_id: user.id,
            created_by_display_name_snapshot: principal.actor_display_name_snapshot(),
            activity_summary: Some(activity_summary),
        },
        &checksum_sha256,
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
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
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
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
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
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
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
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
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

pub async fn project_attachment_preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, attachment_id)): Path<(String, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<ProjectAttachmentPreviewPayload>>> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "project", project.id).await?;
    let legacy_preview_enabled = state.settings.experimental_legacy_preview_enabled();
    let strategy =
        attachment_preview::strategy(&attachment.original_filename, &attachment.content_type);
    let preview_kind = attachment_preview::kind(
        &attachment.original_filename,
        &attachment.content_type,
        legacy_preview_enabled,
    );
    let content_enabled = attachment.status == "uploaded" && preview_kind.is_some();
    let navigation = project_attachment_preview_navigation(
        files::list_attachments(pool, "project", project.id).await?,
        attachment.id,
        legacy_preview_enabled,
        &project_key,
    );
    let content_url =
        format!("/api/v1/projects/{project_key}/attachments/{attachment_id}/preview/content");
    let download_url =
        format!("/api/v1/projects/{project_key}/attachments/{attachment_id}/download-url");
    audit::record(
        pool,
        Some(user.id),
        "file.preview",
        "project",
        &project_key,
        &format!(r#"{{"source":"api","attachment_id":{attachment_id}}}"#),
    )
    .await?;

    Ok(json(ProjectAttachmentPreviewPayload {
        attachment: attachment_payload(attachment.clone()),
        preview: AttachmentPreviewPayload {
            kind: preview_kind,
            strategy: strategy.map(|value| value.code()),
            file_type: attachment_preview::file_type(
                &attachment.original_filename,
                &attachment.content_type,
            ),
            kind_label: strategy.map(|value| value.kind_label()),
            is_experimental: strategy.is_some_and(|value| value.is_experimental()),
            legacy_preview_enabled,
            content_enabled,
        },
        navigation,
        content_url,
        download_url,
    }))
}

pub async fn project_attachment_preview_content(
    State(state): State<AppState>,
    method: Method,
    headers: HeaderMap,
    Path((project_key, attachment_id)): Path<(String, i64)>,
) -> AppResult<Response> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "project", project.id).await?;
    ensure_attachment_preview_content_enabled(
        &attachment,
        state.settings.experimental_legacy_preview_enabled(),
    )?;
    let (stored_content_type, total_u64) =
        storage::stat_object(pool, &state.settings, &attachment.object_key).await?;
    let total = usize::try_from(total_u64)
        .map_err(|_| AppError::BadRequest("附件大小超出当前预览能力".to_string()))?;
    let range = match headers.get(header::RANGE) {
        Some(value) => match parse_single_byte_range(value.to_str().unwrap_or_default(), total) {
            Some(range) => Some(range),
            None => return Ok(range_not_satisfiable_response(total)?),
        },
        None => None,
    };
    let (status, start, end) = match range {
        Some((start, end)) => (StatusCode::PARTIAL_CONTENT, start, end),
        None => (StatusCode::OK, 0, total.saturating_sub(1)),
    };
    let selected_length = if total == 0 { 0 } else { end - start + 1 };
    let body = if method == Method::HEAD || selected_length == 0 {
        Bytes::new()
    } else if status == StatusCode::PARTIAL_CONTENT {
        Bytes::from(
            storage::read_object_range(
                pool,
                &state.settings,
                &attachment.object_key,
                start as u64,
                (end + 1) as u64,
            )
            .await?,
        )
    } else {
        let (_, content) =
            storage::read_object(pool, &state.settings, &attachment.object_key).await?;
        Bytes::from(content)
    };
    let mut response = (status, body).into_response();
    let response_headers = response.headers_mut();
    response_headers.insert(header::CONTENT_TYPE, stored_content_type.parse()?);
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
        Some(user.id),
        "file.preview.content",
        "project",
        &project_key,
        &format!(r#"{{"source":"api","attachment_id":{attachment_id}}}"#),
    )
    .await?;
    Ok(response)
}

pub async fn project_attachment_delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, attachment_id)): Path<(String, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentPayload>>> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let attachment = files::archive_attachment(
        pool,
        attachment_id,
        "project",
        project.id,
        user.id,
        &principal.actor_display_name_snapshot(),
        Some(project.id),
        Some("归档项目附件"),
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "file.archive",
        "project",
        &project_key,
        &format!(r#"{{"attachment_id":{attachment_id}}}"#),
    )
    .await?;

    Ok(json(attachment_payload(attachment)))
}

pub async fn list_project_resources(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Query(query): Query<ResourceQuery>,
) -> AppResult<axum::Json<ApiEnvelope<Vec<ProjectResourcePayload>>>> {
    let user = require_d2_api_principal(&state, &headers).await?.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_RESOURCE_READ).await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    let payload = project_resources::list_resources(
        pool,
        project.id,
        project_resources::ProjectResourceFilter {
            keyword: query.q,
            category: query.category,
            status: query.status,
            tag: query.tag,
            related_work_item_key: query.related_work_item_key,
            related_cycle_id: parse_api_optional_i64(&query.related_cycle_id)?,
        },
    )
    .await?
    .into_iter()
    .map(project_resource_summary_payload)
    .collect();

    Ok(json(payload))
}

pub async fn create_project_resource(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Json(payload): Json<CreateProjectResourceRequest>,
) -> AppResult<impl IntoResponse> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_RESOURCE_WRITE).await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let resource = project_resources::create_resource(
        pool,
        user.id,
        project_resources::CreateProjectResourceInput {
            project_id: project.id,
            title: payload.title,
            category: payload.category,
            body: payload.body,
            body_format: payload.body_format,
            access_password: payload.access_password,
            tags: payload.tags,
            related_work_item_key: payload.related_work_item_key,
            related_cycle_id: parse_api_optional_cycle_id(payload.related_cycle_id)?,
            actor_display_name_snapshot: principal.actor_display_name_snapshot(),
        },
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "project_resource.create",
        "project_resource",
        &resource.id.to_string(),
        &format!(r#"{{"project":"{}"}}"#, project.project_key),
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        json(project_resource_payload(resource)),
    ))
}

pub async fn get_project_resource(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, resource_id)): Path<(String, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<ProjectResourcePayload>>> {
    let (user, _project, resource) =
        require_api_project_resource_context(&state, &headers, &project_key, resource_id).await?;
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_RESOURCE_READ).await?;
    if resource.is_protected {
        return Err(AppError::Forbidden(
            "受保护资料需要在页面验证访问密码".to_string(),
        ));
    }
    Ok(json(project_resource_payload(resource)))
}

pub async fn update_project_resource(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, resource_id)): Path<(String, i64)>,
    Json(payload): Json<UpdateProjectResourceRequest>,
) -> AppResult<axum::Json<ApiEnvelope<ProjectResourcePayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let (user, project, resource) =
        require_api_project_resource_context(&state, &headers, &project_key, resource_id).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_RESOURCE_WRITE).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let updated = project_resources::update_resource(
        pool,
        user.id,
        resource.id,
        project_resources::UpdateProjectResourceInput {
            title: payload.title.unwrap_or_else(|| resource.title.clone()),
            category: payload
                .category
                .unwrap_or_else(|| resource.category.clone()),
            body: payload.body.unwrap_or_else(|| resource.body.clone()),
            body_format: payload
                .body_format
                .unwrap_or_else(|| resource.body_format.clone()),
            access_password_action: payload.access_password_action,
            access_password: payload.access_password,
            tags: payload.tags.unwrap_or_else(|| resource.tags.clone()),
            related_work_item_key: payload.related_work_item_key.unwrap_or_else(|| {
                resource
                    .related_work_item
                    .as_ref()
                    .map(|item| item.item_key.clone())
                    .unwrap_or_default()
            }),
            related_cycle_id: parse_api_optional_cycle_id_with_fallback(
                payload.related_cycle_id,
                resource.related_cycle.as_ref().map(|cycle| cycle.id),
            )?,
            actor_display_name_snapshot: principal.actor_display_name_snapshot(),
        },
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "project_resource.update",
        "project_resource",
        &updated.id.to_string(),
        &format!(r#"{{"project":"{}"}}"#, project.project_key),
    )
    .await?;

    Ok(json(project_resource_payload(updated)))
}

pub async fn archive_project_resource(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, resource_id)): Path<(String, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<ProjectResourcePayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let (user, project, resource) =
        require_api_project_resource_context(&state, &headers, &project_key, resource_id).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_RESOURCE_WRITE).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let archived = project_resources::archive_resource(
        pool,
        user.id,
        project.id,
        resource.id,
        &principal.actor_display_name_snapshot(),
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "project_resource.archive",
        "project_resource",
        &archived.id.to_string(),
        &format!(r#"{{"project":"{}"}}"#, project.project_key),
    )
    .await?;

    Ok(json(project_resource_payload(archived)))
}

pub async fn unlock_project_resource(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, resource_id)): Path<(String, i64)>,
    Json(payload): Json<UnlockProjectResourceRequest>,
) -> AppResult<axum::Json<ApiEnvelope<ProjectResourcePayload>>> {
    let (user, project, resource) =
        require_api_project_resource_context(&state, &headers, &project_key, resource_id).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_RESOURCE_READ).await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_RESOURCE_UNLOCK).await?;
    let verified =
        project_resources::verify_resource_password(pool, resource.id, &payload.access_password)
            .await?;
    let audit_action = if verified {
        "project_resource.unlock.success"
    } else {
        "project_resource.unlock.failed"
    };
    audit::record(
        pool,
        Some(user.id),
        audit_action,
        "project_resource",
        &resource.id.to_string(),
        &format!(r#"{{"project":"{}","source":"api"}}"#, project.project_key),
    )
    .await?;
    if !verified {
        return Err(AppError::Forbidden("访问密码不正确".to_string()));
    }

    Ok(json(project_resource_unlocked_payload(resource)))
}

pub async fn create_project_resource_attachment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, resource_id)): Path<(String, i64)>,
    Json(payload): Json<CreateAttachmentRequest>,
) -> AppResult<impl IntoResponse> {
    let principal = require_api_principal(&state, &headers).await?;
    let (user, project, resource) =
        require_api_project_resource_context(&state, &headers, &project_key, resource_id).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_RESOURCE_WRITE).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    if resource.status == "archived" {
        return Err(AppError::BadRequest(
            "已归档资料不能继续添加附件".to_string(),
        ));
    }
    let config = storage::active_config(pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
    let checksum_sha256 = payload.checksum_sha256.clone();
    let attachment = files::create_attachment_with_checksum(
        pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "project_resource".to_string(),
            target_id: resource.id,
            project_id: Some(project.id),
            folder_id: None,
            original_filename: payload.original_filename,
            content_type: payload.content_type,
            byte_size: payload.byte_size,
            created_by_user_id: user.id,
            created_by_display_name_snapshot: principal.actor_display_name_snapshot(),
            activity_summary: None,
        },
        &checksum_sha256,
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "file.attach.project_resource",
        "project_resource",
        &resource.id.to_string(),
        &format!(
            r#"{{"project":"{}","file_object_id":{}}}"#,
            project.project_key, attachment.file_object_id
        ),
    )
    .await?;

    Ok((StatusCode::CREATED, json(attachment_payload(attachment))))
}

pub async fn project_resource_attachment_upload_url(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, resource_id, attachment_id)): Path<(String, i64, i64)>,
    Query(query): Query<SignedUrlQuery>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentSignedUrlPayload>>> {
    let (user, project, resource) =
        require_api_project_resource_context(&state, &headers, &project_key, resource_id).await?;
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_RESOURCE_WRITE).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    if resource.status == "archived" {
        return Err(AppError::BadRequest(
            "已归档资料不能继续上传附件".to_string(),
        ));
    }
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "project_resource", resource.id)
            .await?;

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

pub async fn project_resource_attachment_mark_uploaded(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, resource_id, attachment_id)): Path<(String, i64, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentPayload>>> {
    let (user, project, resource) =
        require_api_project_resource_context(&state, &headers, &project_key, resource_id).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_RESOURCE_WRITE).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    if resource.status == "archived" {
        return Err(AppError::BadRequest(
            "已归档资料不能继续上传附件".to_string(),
        ));
    }
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "project_resource", resource.id)
            .await?;
    storage::verify_uploaded_object(
        pool,
        &state.settings,
        &attachment.object_key,
        attachment.byte_size,
        &attachment.content_type,
    )
    .await?;
    let attachment =
        files::mark_attachment_uploaded(pool, attachment_id, "project_resource", resource.id)
            .await?;
    audit::record(
        pool,
        Some(user.id),
        "file.upload.completed",
        "project_resource",
        &resource.id.to_string(),
        &format!(
            r#"{{"project":"{}","attachment_id":{attachment_id}}}"#,
            project.project_key
        ),
    )
    .await?;

    Ok(json(attachment_payload(attachment)))
}

pub async fn project_resource_attachment_download_url(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, resource_id, attachment_id)): Path<(String, i64, i64)>,
    Query(query): Query<SignedUrlQuery>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentSignedUrlPayload>>> {
    let (user, project, resource) =
        require_api_project_resource_context(&state, &headers, &project_key, resource_id).await?;
    if resource.is_protected {
        return Err(AppError::Forbidden(
            "受保护资料附件需要先验证访问密码".to_string(),
        ));
    }
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_RESOURCE_READ).await?;
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "project_resource", resource.id)
            .await?;
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
        "project_resource",
        &resource.id.to_string(),
        &format!(
            r#"{{"source":"api","project":"{}","attachment_id":{},"file_object_id":{}}}"#,
            project.project_key, payload.attachment.id, payload.attachment.file_object_id
        ),
    )
    .await?;

    Ok(json(payload))
}

pub async fn project_resource_attachment_delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, resource_id, attachment_id)): Path<(String, i64, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentPayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let (user, project, resource) =
        require_api_project_resource_context(&state, &headers, &project_key, resource_id).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_RESOURCE_WRITE).await?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    if resource.status == "archived" {
        return Err(AppError::BadRequest(
            "已归档资料不能继续删除附件".to_string(),
        ));
    }
    let existing =
        files::get_attachment_for_target(pool, attachment_id, "project_resource", resource.id)
            .await?;
    storage::delete_object_if_exists(pool, &state.settings, &existing.object_key).await?;
    let attachment = files::archive_attachment(
        pool,
        attachment_id,
        "project_resource",
        resource.id,
        user.id,
        &principal.actor_display_name_snapshot(),
        None,
        None,
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "file.archive",
        "project_resource",
        &resource.id.to_string(),
        &format!(
            r#"{{"project":"{}","attachment_id":{attachment_id}}}"#,
            project.project_key
        ),
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
    let principal = require_d2_api_principal(&state, &headers).await?;
    let (user, item, project) = require_api_work_item_context(&state, &headers, &item_key).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_WORK_ITEM_WRITE).await?;
    ensure_api_work_item_accepts_writes(&item)?;
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let config = storage::active_config(pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
    let activity_summary = format!("登记工作项附件 {}", payload.original_filename);
    let checksum_sha256 = payload.checksum_sha256.clone();
    let attachment = files::create_attachment_with_checksum(
        pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            folder_id: None,
            original_filename: payload.original_filename,
            content_type: payload.content_type,
            byte_size: payload.byte_size,
            created_by_user_id: user.id,
            created_by_display_name_snapshot: principal.actor_display_name_snapshot(),
            activity_summary: Some(activity_summary),
        },
        &checksum_sha256,
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
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_WORK_ITEM_WRITE).await?;
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
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_WORK_ITEM_WRITE).await?;
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

pub async fn list_system_database_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<axum::Json<ApiEnvelope<DatabaseStatsSnapshotPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.database_stats.view").await?;
    let snapshot = database_stats::build_snapshot(pool).await?;

    Ok(json(database_stats_snapshot_payload(snapshot)))
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

pub async fn get_system_release_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<axum::Json<ApiEnvelope<SystemReleaseSettingsPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.releases.view").await?;
    let settings = system_releases::get_settings(pool).await?;
    Ok(json(system_release_settings_payload(settings)))
}

pub async fn update_system_release_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpdateSystemReleaseSettingsRequest>,
) -> AppResult<axum::Json<ApiEnvelope<SystemReleaseSettingsPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.releases.manage").await?;
    let updated =
        system_releases::update_settings(pool, &state.settings, user.id, payload.retention_count)
            .await?;
    let request_context = audit_context::from_headers(&headers);
    audit::record_with_context(
        pool,
        Some(user.id),
        "system.release.settings.update",
        "system_release_settings",
        "1",
        &format!(
            r#"{{"source":"api","retention_count":{}}}"#,
            updated.retention_count
        ),
        &request_context,
    )
    .await?;
    Ok(json(system_release_settings_payload(updated)))
}

pub async fn list_system_releases(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<SystemReleaseListQuery>,
) -> AppResult<axum::Json<ApiEnvelope<PaginatedPayload<SystemReleasePayload>>>> {
    let principal = require_system_release_api_principal(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_system_release_api_permission(pool, &headers, &principal, "system.releases.view")
        .await?;
    let pagination = normalize_api_pagination(query.page, query.per_page)?;
    let page = system_releases::list_releases_page(pool, pagination).await?;
    let total_pages = page.total_pages();
    Ok(json(PaginatedPayload {
        items: page.items.into_iter().map(system_release_payload).collect(),
        pagination: PaginationPayload {
            page: page.page,
            per_page: page.per_page,
            total_items: page.total_items,
            total_pages,
        },
    }))
}

pub async fn create_system_release(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateSystemReleaseRequest>,
) -> AppResult<impl IntoResponse> {
    let principal = require_system_release_api_principal(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_system_release_api_permission(pool, &headers, &principal, "system.releases.manage")
        .await?;
    let created = system_releases::create_release(
        pool,
        principal.actor_user_id(),
        system_releases::CreateSystemReleaseInput {
            version_name: payload.version_name,
            title: payload.title,
            notes: payload.notes,
            channel: payload.channel,
            manifest_sha256: payload.manifest_sha256,
            signing_key_id: payload.signing_key_id,
            source_commit: payload.source_commit,
            source_tag: payload.source_tag,
        },
    )
    .await?;
    let request_context = audit_context::from_headers(&headers);
    audit::record_with_context(
        pool,
        Some(principal.actor_user_id()),
        "system.release.create",
        "system_release",
        &created.release.id.to_string(),
        &format!(
            r#"{{{},"version_name":"{}","status":"{}"}}"#,
            system_release_audit_source(&principal),
            created.release.version_name.replace('"', "\\\""),
            created.release.status
        ),
        &request_context,
    )
    .await?;
    Ok((
        StatusCode::CREATED,
        json(system_release_detail_payload(created)),
    ))
}

pub async fn get_system_release(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(release_id): Path<i64>,
) -> AppResult<axum::Json<ApiEnvelope<SystemReleaseDetailPayload>>> {
    let principal = require_system_release_api_principal(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_system_release_api_permission(pool, &headers, &principal, "system.releases.view")
        .await?;
    let detail = system_releases::get_release_detail(pool, release_id)
        .await?
        .ok_or_else(|| AppError::NotFound("版本不存在".to_string()))?;
    Ok(json(system_release_detail_payload(detail)))
}

pub async fn update_system_release(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(release_id): Path<i64>,
    Json(payload): Json<UpdateSystemReleaseRequest>,
) -> AppResult<axum::Json<ApiEnvelope<SystemReleaseDetailPayload>>> {
    let principal = require_system_release_api_principal(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_system_release_api_permission(pool, &headers, &principal, "system.releases.manage")
        .await?;
    let updated = system_releases::update_release(
        pool,
        &state.settings,
        principal.actor_user_id(),
        release_id,
        system_releases::UpdateSystemReleaseInput {
            version_name: payload.version_name,
            title: payload.title,
            notes: payload.notes,
            publish: payload.publish,
        },
    )
    .await?;
    let request_context = audit_context::from_headers(&headers);
    audit::record_with_context(
        pool,
        Some(principal.actor_user_id()),
        if payload.publish {
            "system.release.publish"
        } else {
            "system.release.update"
        },
        "system_release",
        &updated.release.id.to_string(),
        &format!(
            r#"{{{},"version_name":"{}","status":"{}","asset_count":{}}}"#,
            system_release_audit_source(&principal),
            updated.release.version_name.replace('"', "\\\""),
            updated.release.status,
            updated.release.asset_count
        ),
        &request_context,
    )
    .await?;
    Ok(json(system_release_detail_payload(updated)))
}

pub async fn verify_system_release(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(release_id): Path<i64>,
) -> AppResult<axum::Json<ApiEnvelope<SystemReleaseDetailPayload>>> {
    let principal = require_system_release_api_principal(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_system_release_api_permission(pool, &headers, &principal, "system.releases.manage")
        .await?;
    let verified =
        system_releases::mark_release_verified(pool, principal.actor_user_id(), release_id).await?;
    let request_context = audit_context::from_headers(&headers);
    audit::record_with_context(
        pool,
        Some(principal.actor_user_id()),
        "system.release.verify",
        "system_release",
        &release_id.to_string(),
        &format!(r#"{{{}}}"#, system_release_audit_source(&principal)),
        &request_context,
    )
    .await?;
    Ok(json(system_release_detail_payload(verified)))
}

pub async fn withdraw_system_release(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(release_id): Path<i64>,
    Json(payload): Json<WithdrawSystemReleaseRequest>,
) -> AppResult<axum::Json<ApiEnvelope<SystemReleaseDetailPayload>>> {
    let principal = require_system_release_api_principal(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_system_release_api_permission(pool, &headers, &principal, "system.releases.manage")
        .await?;
    let withdrawn = system_releases::withdraw_release(
        pool,
        principal.actor_user_id(),
        release_id,
        system_releases::WithdrawSystemReleaseInput {
            reason: payload.reason,
            github_withdrawal_status: payload.github_withdrawal_status,
        },
    )
    .await?;
    let request_context = audit_context::from_headers(&headers);
    audit::record_with_context(
        pool,
        Some(principal.actor_user_id()),
        "system.release.withdraw",
        "system_release",
        &release_id.to_string(),
        &format!(r#"{{{}}}"#, system_release_audit_source(&principal)),
        &request_context,
    )
    .await?;
    Ok(json(system_release_detail_payload(withdrawn)))
}

pub async fn update_system_release_withdrawal(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(release_id): Path<i64>,
    Json(payload): Json<UpdateSystemReleaseWithdrawalRequest>,
) -> AppResult<axum::Json<ApiEnvelope<SystemReleaseDetailPayload>>> {
    let principal = require_system_release_api_principal(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_system_release_api_permission(pool, &headers, &principal, "system.releases.manage")
        .await?;
    let updated = system_releases::update_withdrawal_status(
        pool,
        principal.actor_user_id(),
        release_id,
        &payload.github_withdrawal_status,
    )
    .await?;
    let request_context = audit_context::from_headers(&headers);
    audit::record_with_context(
        pool,
        Some(principal.actor_user_id()),
        "system.release.withdrawal.update",
        "system_release",
        &release_id.to_string(),
        &format!(
            r#"{{{},"github_withdrawal_status":"{}"}}"#,
            system_release_audit_source(&principal),
            updated.release.github_withdrawal_status
        ),
        &request_context,
    )
    .await?;
    Ok(json(system_release_detail_payload(updated)))
}

pub async fn create_system_release_asset(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(release_id): Path<i64>,
    Json(payload): Json<CreateSystemReleaseAssetRequest>,
) -> AppResult<impl IntoResponse> {
    let principal = require_system_release_api_principal(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_system_release_api_permission(pool, &headers, &principal, "system.releases.manage")
        .await?;
    let asset = system_releases::create_release_asset(
        pool,
        release_id,
        system_releases::CreateSystemReleaseAssetInput {
            platform: payload.platform,
            architecture: payload.architecture,
            artifact_kind: payload.artifact_kind,
            original_filename: payload.original_filename,
            content_type: payload.content_type,
            byte_size: payload.byte_size,
            checksum_sha256: payload.checksum_sha256,
            created_by_user_id: principal.actor_user_id(),
        },
    )
    .await?;
    Ok((
        StatusCode::CREATED,
        json(system_release_asset_payload(asset)),
    ))
}

pub async fn system_release_asset_upload_url(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((release_id, asset_id)): Path<(i64, i64)>,
    Query(query): Query<SignedUrlQuery>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentSignedUrlPayload>>> {
    let principal = require_system_release_api_principal(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_system_release_api_permission(pool, &headers, &principal, "system.releases.manage")
        .await?;
    system_releases::ensure_release_is_mutable(pool, release_id).await?;
    let asset = system_releases::get_release_asset(pool, release_id, asset_id).await?;
    let expires_in_seconds =
        normalize_signed_url_expiration(SignedUrlKind::Upload, query.expires_in_seconds)?;
    let expires_at = (chrono::Utc::now() + chrono::Duration::seconds(expires_in_seconds as i64))
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let mut request = storage::presign_upload_url(
        pool,
        &state.settings,
        &asset.object_key,
        &asset.content_type,
        expires_in_seconds,
    )
    .await?;
    bind_test_storage_upload_grant(
        &state,
        &asset.object_key,
        principal.actor_user_id(),
        expires_in_seconds,
        &mut request,
    )?;
    Ok(json(AttachmentSignedUrlPayload {
        attachment: AttachmentPayload {
            id: asset.id,
            file_object_id: asset.file_object_id,
            object_key: asset.object_key,
            filename: asset.original_filename,
            content_type: asset.content_type,
            byte_size: asset.byte_size,
            status: asset.status,
            created_by: String::new(),
            created_at: asset.created_at,
        },
        request,
        expires_in_seconds,
        expires_at,
        checksum_sha256: String::new(),
    }))
}

pub async fn system_release_asset_download_url(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((release_id, asset_id)): Path<(i64, i64)>,
    Query(query): Query<SignedUrlQuery>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentSignedUrlPayload>>> {
    let principal = require_system_release_api_principal(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_system_release_api_permission(pool, &headers, &principal, "system.releases.manage")
        .await?;
    system_releases::ensure_release_allows_download(pool, release_id).await?;
    let asset = system_releases::get_release_asset(pool, release_id, asset_id).await?;
    if asset.status != "uploaded" {
        return Err(AppError::BadRequest(
            "版本资产尚未上传完成，不能回读".to_string(),
        ));
    }
    let expires_in_seconds =
        normalize_system_release_download_expiration(query.expires_in_seconds)?;
    let expires_at = (chrono::Utc::now() + chrono::Duration::seconds(expires_in_seconds as i64))
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let mut request =
        storage::presign_download_url(pool, &state.settings, &asset.object_key, expires_in_seconds)
            .await?;
    bind_test_storage_download_grant(
        &state,
        &asset.object_key,
        &asset.content_type,
        principal.actor_user_id(),
        expires_in_seconds,
        &mut request,
    )?;
    Ok(json(AttachmentSignedUrlPayload {
        attachment: AttachmentPayload {
            id: asset.id,
            file_object_id: asset.file_object_id,
            object_key: asset.object_key,
            filename: asset.original_filename,
            content_type: asset.content_type,
            byte_size: asset.byte_size,
            status: asset.status,
            created_by: String::new(),
            created_at: asset.created_at,
        },
        request,
        expires_in_seconds,
        expires_at,
        checksum_sha256: asset.checksum_sha256,
    }))
}

pub async fn system_release_asset_mark_uploaded(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((release_id, asset_id)): Path<(i64, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<SystemReleaseAssetPayload>>> {
    let principal = require_system_release_api_principal(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_system_release_api_permission(pool, &headers, &principal, "system.releases.manage")
        .await?;
    let asset = system_releases::get_release_asset(pool, release_id, asset_id).await?;
    storage::verify_uploaded_object(
        pool,
        &state.settings,
        &asset.object_key,
        asset.byte_size,
        &asset.content_type,
    )
    .await?;
    let asset = system_releases::mark_release_asset_uploaded(pool, release_id, asset_id).await?;
    Ok(json(system_release_asset_payload(asset)))
}

pub async fn delete_system_release_asset(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((release_id, asset_id)): Path<(i64, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<SystemReleaseAssetPayload>>> {
    let principal = require_system_release_api_principal(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_system_release_api_permission(pool, &headers, &principal, "system.releases.manage")
        .await?;
    let deleted =
        system_releases::delete_release_asset(pool, &state.settings, release_id, asset_id).await?;
    Ok(json(system_release_asset_payload(deleted)))
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
    verify_test_storage_upload_grant(&state, &query)?;
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

pub async fn test_storage_download(
    State(state): State<AppState>,
    Query(query): Query<TestStorageDownloadQuery>,
) -> AppResult<impl IntoResponse> {
    let granted_content_type = verify_test_storage_download_grant(&state, &query)?;
    let (storage_content_type, content) =
        storage::read_object(state.pool()?, &state.settings, &query.object_key).await?;
    let normalized_storage_content_type = storage_content_type.trim().to_ascii_lowercase();
    let content_type = if !granted_content_type.trim().is_empty()
        && (normalized_storage_content_type.is_empty()
            || normalized_storage_content_type == "application/octet-stream")
    {
        granted_content_type
    } else if !storage_content_type.trim().is_empty() {
        storage_content_type
    } else if !granted_content_type.trim().is_empty() {
        granted_content_type
    } else {
        "application/octet-stream".to_string()
    };

    let mut response = content.into_response();
    let headers = response.headers_mut();
    headers.insert(header::CONTENT_TYPE, content_type.parse()?);
    headers.insert(header::X_CONTENT_TYPE_OPTIONS, "nosniff".parse()?);
    headers.insert(header::CONTENT_DISPOSITION, "inline".parse()?);
    Ok(response)
}

pub async fn list_api_tokens(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<axum::Json<ApiEnvelope<Vec<ApiTokenPayload>>>> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    ensure_account_principal(&principal)?;
    let pool = state.pool()?;
    let tokens = api_tokens::list_tokens(pool, principal.user.id)
        .await?
        .into_iter()
        .map(api_token_payload)
        .collect();

    Ok(json(tokens))
}

pub async fn create_api_token(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateApiTokenRequest>,
) -> AppResult<impl IntoResponse> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    ensure_account_principal(&principal)?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    let created = api_tokens::create_token(
        pool,
        &state.settings.security_master_key,
        principal.user.id,
        api_tokens::CreateApiTokenInput {
            name: payload.name,
            scopes: payload.scopes,
            project_scope: payload.project_scope,
            expires_at: payload.expires_at,
        },
    )
    .await?;
    audit::record(
        pool,
        Some(principal.user.id),
        "api_token.create",
        "api_token",
        &created.token.id.to_string(),
        "{}",
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        json(CreatedApiTokenPayload {
            token: api_token_payload(created.token),
            raw_token: created.raw_token,
        }),
    ))
}

pub async fn update_api_token(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(token_id): Path<i64>,
    Json(payload): Json<UpdateApiTokenRequest>,
) -> AppResult<axum::Json<ApiEnvelope<ApiTokenPayload>>> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    ensure_account_principal(&principal)?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    let token = api_tokens::update_token(
        pool,
        principal.user.id,
        token_id,
        api_tokens::UpdateApiTokenInput {
            name: payload.name,
            scopes: payload.scopes,
            project_scope: payload.project_scope,
        },
    )
    .await?;
    audit::record_with_context(
        pool,
        Some(principal.user.id),
        "api_token.update",
        "api_token",
        &token.id.to_string(),
        &principal.audit_details(),
        &audit_context::from_headers(&headers),
    )
    .await?;
    Ok(json(api_token_payload(token)))
}

pub async fn delete_api_token(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(token_id): Path<i64>,
) -> AppResult<axum::Json<ApiEnvelope<ApiTokenPayload>>> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    ensure_account_principal(&principal)?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    let token = api_tokens::delete_token(pool, principal.user.id, token_id).await?;
    audit::record(
        pool,
        Some(principal.user.id),
        "api_token.delete",
        "api_token",
        &token.id.to_string(),
        "{}",
    )
    .await?;

    Ok(json(api_token_payload(token)))
}

pub async fn list_device_sessions(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<axum::Json<ApiEnvelope<Vec<DeviceSessionPayload>>>> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    ensure_account_principal(&principal)?;
    let current_family_id = match &principal.kind {
        ApiPrincipalKind::Device(device) => Some(device.family_id.as_str()),
        _ => None,
    };
    let sessions = device_sessions::list_device_families_for_user(
        state.pool()?,
        principal.user.id,
        &state.settings.device_sessions.server_instance_id,
    )
    .await
    .map_err(device_session_api_error)?
    .into_iter()
    .map(|session| DeviceSessionPayload {
        is_current: current_family_id == Some(session.family_id.as_str()),
        family_id: session.family_id,
        device_id: session.device_id,
        device_name: session.device_name,
        platform: session.platform,
        client_version: session.client_version,
        status: session.family_status,
        generation: session.generation,
        last_seen_at: session.last_seen_at.to_rfc3339(),
        created_at: session.created_at.to_rfc3339(),
    })
    .collect();
    Ok(json(sessions))
}

pub async fn revoke_device_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(family_id): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<DeviceSessionPayload>>> {
    let principal = require_d2_api_principal(&state, &headers).await?;
    ensure_account_principal(&principal)?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    let session = device_sessions::list_device_families_for_user(
        pool,
        principal.user.id,
        &state.settings.device_sessions.server_instance_id,
    )
    .await
    .map_err(device_session_api_error)?
    .into_iter()
    .find(|session| session.family_id == family_id)
    .ok_or_else(|| AppError::NotFound("设备会话不存在".to_string()))?;
    device_sessions::revoke_family_for_user(
        pool,
        principal.user.id,
        &family_id,
        chrono::Utc::now(),
        "user_revoke",
    )
    .await
    .map_err(device_session_api_error)?;
    audit::record_with_context(
        pool,
        Some(principal.user.id),
        "device_session.revoke",
        "device_credential_family",
        &family_id,
        &principal.audit_details(),
        &audit_context::from_headers(&headers),
    )
    .await?;
    Ok(json(DeviceSessionPayload {
        is_current: matches!(&principal.kind, ApiPrincipalKind::Device(device) if device.family_id == family_id),
        family_id: session.family_id,
        device_id: session.device_id,
        device_name: session.device_name,
        platform: session.platform,
        client_version: session.client_version,
        status: "revoked".to_string(),
        generation: session.generation,
        last_seen_at: session.last_seen_at.to_rfc3339(),
        created_at: session.created_at.to_rfc3339(),
    }))
}

fn device_session_api_error(error: device_sessions::DeviceSessionError) -> AppError {
    match error {
        device_sessions::DeviceSessionError::StorageFailure(error) => AppError::Database(error),
        device_sessions::DeviceSessionError::InvalidRequest(message) => {
            AppError::BadRequest(message)
        }
        device_sessions::DeviceSessionError::FamilyRevoked => {
            AppError::Conflict("设备会话已撤销".to_string())
        }
        error => AppError::Conflict(error.to_string()),
    }
}

fn ensure_account_principal(principal: &ApiPrincipal) -> AppResult<()> {
    match &principal.kind {
        ApiPrincipalKind::Session | ApiPrincipalKind::Device(_) => Ok(()),
        ApiPrincipalKind::ApiToken(_) => Err(AppError::Forbidden(
            "访问 Token 不能读取或修改账户资料".to_string(),
        )),
    }
}

fn ensure_api_csrf(headers: &HeaderMap) -> AppResult<()> {
    if api_tokens::bearer_token(headers).is_some() {
        return Ok(());
    }
    csrf::verify(headers, "")
}

async fn require_api_user(state: &AppState, headers: &HeaderMap) -> AppResult<auth::AuthUser> {
    Ok(require_api_principal(state, headers).await?.user)
}

async fn require_api_principal(state: &AppState, headers: &HeaderMap) -> AppResult<ApiPrincipal> {
    let pool = state.pool()?;
    if let Some(raw_token) = single_bearer_token(headers)? {
        if device_sessions::is_device_access_token(&raw_token) {
            return Err(AppError::Forbidden(
                "设备 access token 未授权访问此业务 API".to_string(),
            ));
        }
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

async fn require_d2_api_principal(
    state: &AppState,
    headers: &HeaderMap,
) -> AppResult<ApiPrincipal> {
    let Some(raw_token) = single_bearer_token(headers)? else {
        return require_api_principal(state, headers).await;
    };
    if !device_sessions::is_device_access_token(&raw_token) {
        return require_api_principal(state, headers).await;
    }

    let pool = state.pool()?;
    let context = audit_context::from_headers(headers);
    let access = device_sessions::authenticate_access_token(
        pool,
        &raw_token,
        &state.settings.device_sessions.server_instance_id,
        chrono::Utc::now(),
        &context.ip,
        &context.user_agent,
    )
    .await
    .map_err(|_| AppError::Unauthorized)?;
    Ok(ApiPrincipal {
        user: auth::AuthUser {
            id: access.user_id,
            username: access.username,
            display_name: access.display_name,
            is_super_admin: access.is_super_admin,
        },
        kind: ApiPrincipalKind::Device(DeviceApiPrincipal {
            device_id: access.device_id,
            family_id: access.family_id,
            generation: access.generation,
            authorization_version: access.authorization_version,
        }),
    })
}

async fn require_system_release_api_principal(
    state: &AppState,
    headers: &HeaderMap,
) -> AppResult<SystemReleaseApiPrincipal> {
    let pool = state.pool()?;
    if let Some(raw_token) = single_bearer_token(headers)? {
        if !system_api_tokens::is_system_token(&raw_token) {
            return Err(AppError::Forbidden(
                "系统版本管理接口仅支持系统访问 Token 或浏览器登录会话".to_string(),
            ));
        }
        let authenticated =
            system_api_tokens::authenticated_token_from_bearer_token(pool, &raw_token)
                .await?
                .ok_or(AppError::Unauthorized)?;
        return Ok(SystemReleaseApiPrincipal::Token(authenticated));
    }

    let user = auth::user_from_headers(pool, headers)
        .await?
        .ok_or(AppError::Unauthorized)?;
    Ok(SystemReleaseApiPrincipal::Session(user))
}

fn single_bearer_token(headers: &HeaderMap) -> AppResult<Option<String>> {
    if headers.get_all(header::AUTHORIZATION).iter().count() > 1 {
        return Err(AppError::Forbidden(
            "请求只能携带一个 Authorization 凭证".to_string(),
        ));
    }
    Ok(api_tokens::bearer_token(headers))
}

async fn ensure_system_release_api_permission(
    pool: &sqlx::SqlitePool,
    headers: &HeaderMap,
    principal: &SystemReleaseApiPrincipal,
    permission_key: &str,
) -> AppResult<()> {
    match principal {
        SystemReleaseApiPrincipal::Session(user) => {
            ensure_api_permission(pool, headers, user.id, permission_key).await
        }
        SystemReleaseApiPrincipal::Token(token) => {
            let required_scope = match permission_key {
                "system.releases.view" => system_api_tokens::SCOPE_SYSTEM_RELEASE_READ,
                "system.releases.manage" => system_api_tokens::SCOPE_SYSTEM_RELEASE_WRITE,
                _ => {
                    return Err(AppError::Forbidden(
                        "当前系统访问 Token 不支持该系统接口".to_string(),
                    ));
                }
            };
            if token.scopes.iter().any(|scope| scope == required_scope) {
                Ok(())
            } else {
                Err(AppError::Forbidden(format!(
                    "系统访问 Token 缺少 scope：{required_scope}"
                )))
            }
        }
    }
}

fn system_release_audit_source(principal: &SystemReleaseApiPrincipal) -> String {
    match principal {
        SystemReleaseApiPrincipal::Session(_) => r#""source":"api""#.to_string(),
        SystemReleaseApiPrincipal::Token(token) => format!(
            r#""source":"api-system-token","token_id":{},"token_name":"{}""#,
            token.token_id,
            token.token_name.replace('"', "\\\"")
        ),
    }
}

fn api_token_actor_display_name(user: &auth::AuthUser, token_name: &str) -> String {
    let owner = if user.display_name.trim().is_empty() {
        user.username.trim()
    } else {
        user.display_name.trim()
    };
    format!("{}（{}）", token_name.trim(), owner)
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

fn search_result_payload(hit: projects::SearchHit) -> SearchResultPayload {
    SearchResultPayload {
        kind: hit.hit_type,
        key: hit.key,
        title: hit.title,
        context: hit.context,
        target: hit.url,
        updated_at: hit.updated_at,
    }
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
    let user = require_d2_api_principal(state, headers).await?.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, headers, user.id, "work_item.view").await?;
    let item = projects::get_work_item_detail(pool, item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_project_access(pool, headers, user.id, user.is_super_admin, project.id).await?;

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
    let comment =
        projects::get_work_item_comment_including_drafts(pool, item.id, comment_id).await?;
    if comment.is_draft && comment.author_user_id != Some(user.id) {
        return Err(AppError::Forbidden("无权访问该草稿评论".to_string()));
    }

    Ok((user, item, project, comment))
}

fn work_item_comment_matches_primary_post_summary(
    item: &projects::WorkItemDetail,
    comment: &projects::WorkItemCommentSummary,
) -> bool {
    if comment.is_flow
        || comment.parent_comment_id.is_some()
        || comment.body_format != "html"
        || comment.author_username != item.reporter_username
    {
        return false;
    }

    let description = normalized_primary_post_summary(&item.description);
    if description.is_empty() {
        return false;
    }
    if description == normalized_primary_post_summary("见首条图文说明") {
        return true;
    }

    let comment_plain = projects::work_item_comment_plain_text(&comment.body, &comment.body_format);
    normalized_primary_post_summary(&comment_plain) == description
}

fn normalized_primary_post_summary(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

async fn require_api_project_resource_context(
    state: &AppState,
    headers: &HeaderMap,
    project_key: &str,
    resource_id: i64,
) -> AppResult<(
    auth::AuthUser,
    projects::ProjectDetail,
    project_resources::ProjectResourceDetail,
)> {
    let user = require_d2_api_principal(state, headers).await?.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, headers, user.id, user.is_super_admin, project.id).await?;
    let resource = project_resources::get_project_resource(pool, project.id, resource_id).await?;

    Ok((user, project, resource))
}

async fn ensure_api_project_access(
    pool: &sqlx::SqlitePool,
    headers: &HeaderMap,
    user_id: i64,
    is_super_admin: bool,
    project_id: i64,
) -> AppResult<()> {
    if is_super_admin
        || rbac::user_has_all_data_scope(pool, user_id).await?
        || projects::is_project_member(pool, project_id, user_id).await?
    {
        ensure_api_token_project_scope(pool, headers, user_id, project_id).await?;
        return Ok(());
    }

    Err(AppError::Forbidden("无权访问该项目".to_string()))
}

async fn ensure_api_token_project_scope(
    pool: &sqlx::SqlitePool,
    headers: &HeaderMap,
    user_id: i64,
    project_id: i64,
) -> AppResult<()> {
    let Some(raw_token) = api_tokens::bearer_token(headers) else {
        return Ok(());
    };
    if device_sessions::is_device_access_token(&raw_token) {
        return Ok(());
    }
    if api_tokens::token_allows_project(pool, &raw_token, user_id, project_id).await? {
        return Ok(());
    }

    Err(AppError::Forbidden(
        "访问 Token 不允许访问该项目".to_string(),
    ))
}

async fn api_token_project_scope_keys(
    pool: &sqlx::SqlitePool,
    headers: &HeaderMap,
    user_id: i64,
) -> AppResult<Option<Vec<String>>> {
    let Some(raw_token) = api_tokens::bearer_token(headers) else {
        return Ok(None);
    };
    if device_sessions::is_device_access_token(&raw_token) {
        return Ok(None);
    }
    api_tokens::token_project_scope_keys(pool, &raw_token, user_id).await
}

fn project_key_in_token_scope(project_scope: &Option<Vec<String>>, project_key: &str) -> bool {
    match project_scope {
        None => true,
        Some(allowed_project_keys) => allowed_project_keys
            .iter()
            .any(|allowed_project_key| allowed_project_key.eq_ignore_ascii_case(project_key)),
    }
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
        "历史工作项不能执行写入操作".to_string(),
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

async fn ensure_api_token_scope(
    pool: &sqlx::SqlitePool,
    headers: &HeaderMap,
    user_id: i64,
    required_scope: &str,
) -> AppResult<()> {
    let Some(raw_token) = api_tokens::bearer_token(headers) else {
        return Ok(());
    };
    if device_sessions::is_device_access_token(&raw_token) {
        return Ok(());
    }
    if api_tokens::token_has_scope_for_user(pool, &raw_token, user_id, required_scope).await? {
        return Ok(());
    }

    Err(AppError::Forbidden(format!(
        "访问 Token 缺少 scope：{required_scope}"
    )))
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
        return Err(AppError::BadRequest("附件已归档，不能生成签名".to_string()));
    }
    if matches!(kind, SignedUrlKind::Download) && attachment.status != "uploaded" {
        return Err(AppError::BadRequest(
            "附件尚未上传完成，不能下载".to_string(),
        ));
    }

    let expires_in_seconds = normalize_signed_url_expiration(kind, query.expires_in_seconds)?;
    let expires_at = (chrono::Utc::now() + chrono::Duration::seconds(expires_in_seconds as i64))
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
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
    } else {
        bind_test_storage_download_grant(
            state,
            &attachment.object_key,
            &attachment.content_type,
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

    Ok(AttachmentSignedUrlPayload {
        attachment: attachment_payload(attachment),
        request,
        expires_in_seconds,
        expires_at,
        checksum_sha256,
    })
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

fn normalize_system_release_download_expiration(value: Option<u64>) -> AppResult<u64> {
    let value = value.unwrap_or(system_releases::INTERNAL_RELEASE_DOWNLOAD_TTL_SECONDS);
    if !(60..=system_releases::INTERNAL_RELEASE_DOWNLOAD_TTL_SECONDS).contains(&value) {
        return Err(AppError::BadRequest(
            "版本资产下载签名有效期必须在 60-300 秒之间".to_string(),
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

fn parse_api_optional_cycle_id(value: Option<serde_json::Value>) -> AppResult<Option<i64>> {
    parse_api_optional_cycle_id_with_fallback(value, None)
}

fn parse_api_optional_cycle_id_with_fallback(
    value: Option<serde_json::Value>,
    fallback: Option<i64>,
) -> AppResult<Option<i64>> {
    match value {
        None => Ok(fallback),
        Some(serde_json::Value::Null) => Ok(None),
        Some(serde_json::Value::Number(number)) => {
            let Some(parsed) = number.as_i64() else {
                return Err(AppError::BadRequest("关联周期 ID 无效".to_string()));
            };
            if parsed <= 0 {
                return Err(AppError::BadRequest("关联周期 ID 无效".to_string()));
            }
            Ok(Some(parsed))
        }
        Some(serde_json::Value::String(text)) => {
            let text = text.trim();
            if text.is_empty() {
                return Ok(None);
            }
            let parsed = text
                .parse::<i64>()
                .map_err(|_| AppError::BadRequest("关联周期 ID 无效".to_string()))?;
            if parsed <= 0 {
                return Err(AppError::BadRequest("关联周期 ID 无效".to_string()));
            }
            Ok(Some(parsed))
        }
        Some(_) => Err(AppError::BadRequest("关联周期 ID 无效".to_string())),
    }
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

fn own_profile_payload(profile: users::UserSummary) -> OwnProfilePayload {
    OwnProfilePayload {
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name,
        email: profile.email,
        mobile: profile.mobile,
        status: profile.status,
        is_super_admin: profile.is_super_admin,
        roles: profile.role_names,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
    }
}

fn api_token_payload(token: api_tokens::ApiTokenSummary) -> ApiTokenPayload {
    ApiTokenPayload {
        id: token.id,
        name: token.name,
        scopes: token.scopes,
        project_scope: token.project_scope,
        token_suffix: token.token_suffix,
        expires_at: token.expires_at,
        revoked_at: token.revoked_at,
        last_used_at: token.last_used_at,
        created_at: token.created_at,
        updated_at: token.updated_at,
    }
}

fn project_payload(project: projects::ProjectSummary) -> ProjectPayload {
    ProjectPayload {
        key: project.project_key,
        name: project.name,
        status: project.status,
        owner: project.owner_display_name,
        work_item_count: project.work_item_count,
        active_work_item_count: project.active_work_item_count,
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

fn project_cycle_payload(
    cycle: projects::ProjectCycleDetail,
    work_items: Vec<projects::ProjectCycleWorkItemSnapshot>,
) -> ProjectCyclePayload {
    let is_closed = !cycle.closed_at.is_empty();
    ProjectCyclePayload {
        id: cycle.id,
        name: cycle.name,
        goal: cycle.goal,
        description: cycle.description,
        owner_username: cycle.owner_username,
        owner: cycle.owner_display_name,
        start_date: cycle.start_date,
        end_date: cycle.end_date,
        closed_at: cycle.closed_at,
        is_closed,
        total_items: cycle.total_items,
        requirement_count: cycle.requirement_count,
        task_count: cycle.task_count,
        bug_count: cycle.bug_count,
        pending_count: cycle.pending_count,
        created_at: cycle.created_at,
        updated_at: cycle.updated_at,
        work_items: work_items
            .into_iter()
            .map(|item| ProjectCycleWorkItemPayload {
                key: item.item_key,
                item_type: item.item_type,
                title: item.title,
                status: item.status,
                priority: item.priority,
                assignee_username: item.assignee_username,
                assignee: item.assignee_display_name,
                due_date: item.due_date,
                updated_at: item.updated_at,
            })
            .collect(),
    }
}

fn cycle_create_input(payload: ProjectCycleRequest) -> projects::CreateProjectCycleInput {
    projects::CreateProjectCycleInput {
        name: payload.name,
        goal: payload.goal,
        description: payload.description,
        owner_username: payload.owner_username,
        start_date: payload.start_date,
        end_date: payload.end_date,
    }
}

fn cycle_update_input(payload: ProjectCycleRequest) -> projects::UpdateProjectCycleInput {
    projects::UpdateProjectCycleInput {
        name: payload.name,
        goal: payload.goal,
        description: payload.description,
        owner_username: payload.owner_username,
        start_date: payload.start_date,
        end_date: payload.end_date,
    }
}

fn project_resource_summary_payload(
    resource: project_resources::ProjectResourceSummary,
) -> ProjectResourcePayload {
    let is_protected = resource.is_protected;
    let project_key = resource.project_key.clone();
    ProjectResourcePayload {
        id: resource.id,
        project_key: project_key.clone(),
        title: resource.title,
        category: resource.category,
        body: String::new(),
        body_format: resource.body_format,
        summary: if is_protected {
            "受保护资料，验证访问密码后查看正文。".to_string()
        } else {
            resource.summary
        },
        status: resource.status,
        is_protected,
        tags: resource.tags,
        related_work_item: resource
            .related_work_item
            .map(project_resource_work_item_relation_payload),
        related_cycle: resource
            .related_cycle
            .map(|cycle| project_resource_cycle_relation_payload(&project_key, cycle)),
        created_by: resource.created_by_display_name,
        updated_by: resource.updated_by_display_name,
        created_at: resource.created_at,
        updated_at: resource.updated_at,
        url: format!(
            "/web/projects/{}/resources/{}",
            resource.project_key, resource.id
        ),
    }
}

fn project_resource_payload(
    resource: project_resources::ProjectResourceDetail,
) -> ProjectResourcePayload {
    let is_protected = resource.is_protected;
    let project_key = resource.project_key.clone();
    ProjectResourcePayload {
        id: resource.id,
        project_key: project_key.clone(),
        title: resource.title,
        category: resource.category,
        body: if is_protected {
            String::new()
        } else {
            resource.body
        },
        body_format: resource.body_format,
        summary: if is_protected {
            "受保护资料，验证访问密码后查看正文。".to_string()
        } else {
            resource.summary
        },
        status: resource.status,
        is_protected,
        tags: resource.tags,
        related_work_item: resource
            .related_work_item
            .map(project_resource_work_item_relation_payload),
        related_cycle: resource
            .related_cycle
            .map(|cycle| project_resource_cycle_relation_payload(&project_key, cycle)),
        created_by: resource.created_by_display_name,
        updated_by: resource.updated_by_display_name,
        created_at: resource.created_at,
        updated_at: resource.updated_at,
        url: format!(
            "/web/projects/{}/resources/{}",
            resource.project_key, resource.id
        ),
    }
}

fn project_resource_unlocked_payload(
    resource: project_resources::ProjectResourceDetail,
) -> ProjectResourcePayload {
    let project_key = resource.project_key.clone();
    ProjectResourcePayload {
        id: resource.id,
        project_key: project_key.clone(),
        title: resource.title,
        category: resource.category,
        body: resource.body,
        body_format: resource.body_format,
        summary: resource.summary,
        status: resource.status,
        is_protected: resource.is_protected,
        tags: resource.tags,
        related_work_item: resource
            .related_work_item
            .map(project_resource_work_item_relation_payload),
        related_cycle: resource
            .related_cycle
            .map(|cycle| project_resource_cycle_relation_payload(&project_key, cycle)),
        created_by: resource.created_by_display_name,
        updated_by: resource.updated_by_display_name,
        created_at: resource.created_at,
        updated_at: resource.updated_at,
        url: format!(
            "/web/projects/{}/resources/{}",
            resource.project_key, resource.id
        ),
    }
}

fn project_resource_work_item_relation_payload(
    relation: project_resources::ProjectResourceWorkItemRelation,
) -> ProjectResourceWorkItemRelationPayload {
    ProjectResourceWorkItemRelationPayload {
        key: relation.item_key.clone(),
        item_type: relation.item_type,
        title: relation.title,
        url: format!("/web/work-items/{}", relation.item_key),
    }
}

fn project_resource_cycle_relation_payload(
    project_key: &str,
    relation: project_resources::ProjectResourceCycleRelation,
) -> ProjectResourceCycleRelationPayload {
    ProjectResourceCycleRelationPayload {
        id: relation.id,
        name: relation.name,
        start_date: relation.start_date,
        end_date: relation.end_date,
        url: format!("/web/projects/{project_key}/cycles#cycle-{}", relation.id),
    }
}

fn comment_payload(comment: projects::WorkItemCommentSummary) -> CommentPayload {
    CommentPayload {
        id: comment.id,
        parent_comment_id: comment.parent_comment_id,
        parent_author: comment.parent_author_display_name,
        body: comment.body,
        body_format: comment.body_format,
        author: comment.author_display_name,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        is_flow: comment.is_flow,
        is_draft: comment.is_draft,
    }
}

fn work_item_typing_snapshot_payload(
    users: Vec<realtime::WorkItemTypingUser>,
) -> WorkItemTypingSnapshotPayload {
    WorkItemTypingSnapshotPayload {
        users: users
            .into_iter()
            .map(|user| WorkItemTypingUserPayload {
                user_id: user.user_id,
                display_name: user.display_name,
            })
            .collect(),
    }
}

fn notification_payload(notification: notifications::NotificationSummary) -> NotificationPayload {
    let target = notification_target_payload(&notification);
    let read = !notification.read_at.is_empty();
    NotificationPayload {
        id: notification.id,
        kind: notification.kind,
        title: fallback_text(notification.title, "消息通知"),
        body: fallback_text(notification.body, "查看详情"),
        actor: fallback_text(notification.actor_display_name, "系统"),
        created_at: notification.created_at,
        read,
        open_url: format!("/web/messages/{}/open", notification.id),
        target: Some(target),
    }
}

fn notification_target_result_payload(
    notification: notifications::NotificationSummary,
) -> NotificationTargetResultPayload {
    NotificationTargetResultPayload {
        notification_id: notification.id,
        read: !notification.read_at.is_empty(),
        target: Some(notification_target_payload(&notification)),
    }
}

fn notification_target_payload(
    notification: &notifications::NotificationSummary,
) -> NotificationTargetPayload {
    NotificationTargetPayload {
        kind: "work_item".to_string(),
        project_key: notification
            .work_item_key
            .split('-')
            .next()
            .unwrap_or_default()
            .to_string(),
        work_item_key: notification.work_item_key.clone(),
        comment_id: notification.comment_id,
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

fn project_attachment_preview_navigation(
    attachments: Vec<files::FileAttachmentSummary>,
    current_attachment_id: i64,
    legacy_preview_enabled: bool,
    project_key: &str,
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
        url: format!(
            "/api/v1/projects/{project_key}/attachments/{}/preview",
            attachment.id
        ),
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
    let strategy =
        attachment_preview::strategy(&attachment.original_filename, &attachment.content_type);
    if strategy.is_some_and(|value| !value.is_enabled(legacy_preview_enabled)) {
        return Err(AppError::BadRequest(
            "旧格式实验性预览当前未开启，请下载原文件查看".to_string(),
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

fn system_release_settings_payload(
    settings: system_releases::SystemReleaseSettings,
) -> SystemReleaseSettingsPayload {
    SystemReleaseSettingsPayload {
        retention_count: settings.retention_count,
        updated_by: settings.updated_by_display_name,
        updated_at: settings.updated_at,
    }
}

fn system_release_asset_payload(
    asset: system_releases::SystemReleaseAssetSummary,
) -> SystemReleaseAssetPayload {
    SystemReleaseAssetPayload {
        id: asset.id,
        release_id: asset.release_id,
        file_object_id: asset.file_object_id,
        platform: asset.platform,
        architecture: asset.architecture,
        artifact_kind: asset.artifact_kind,
        object_key: asset.object_key,
        filename: asset.original_filename,
        content_type: asset.content_type,
        byte_size: asset.byte_size,
        status: asset.status,
        checksum_sha256: asset.checksum_sha256,
        created_at: asset.created_at,
    }
}

fn system_release_payload(
    release: system_releases::SystemReleaseVersionSummary,
) -> SystemReleasePayload {
    SystemReleasePayload {
        id: release.id,
        version_name: release.version_name,
        title: release.title,
        notes: release.notes,
        status: release.status,
        channel: release.channel,
        verification_status: release.verification_status,
        manifest_sha256: release.manifest_sha256,
        signing_key_id: release.signing_key_id,
        source_commit: release.source_commit,
        source_tag: release.source_tag,
        published_at: release.published_at,
        verified_at: release.verified_at,
        withdrawn_at: release.withdrawn_at,
        withdrawal_reason: release.withdrawal_reason,
        github_withdrawal_status: release.github_withdrawal_status,
        created_by: release.created_by_display_name,
        updated_by: release.updated_by_display_name,
        created_at: release.created_at,
        updated_at: release.updated_at,
        asset_count: release.asset_count,
        platform_count: release.platform_count,
    }
}

fn system_release_detail_payload(
    detail: system_releases::SystemReleaseDetail,
) -> SystemReleaseDetailPayload {
    SystemReleaseDetailPayload {
        release: system_release_payload(detail.release),
        assets: detail
            .assets
            .into_iter()
            .map(system_release_asset_payload)
            .collect(),
    }
}

fn default_project_status() -> String {
    "not_started".to_string()
}

fn default_release_channel() -> String {
    system_releases::RELEASE_CHANNEL_LEGACY.to_string()
}

fn default_release_artifact_kind() -> String {
    system_releases::RELEASE_ARTIFACT_INSTALLER.to_string()
}

fn default_github_withdrawal_status() -> String {
    "pending".to_string()
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
    ensure_api_project_content_write_access(pool, &user, project.id).await?;
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
