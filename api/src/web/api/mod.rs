use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};

use crate::{
    domains::{audit, auth, bootstrap, projects, rbac},
    platform::error::{AppError, AppResult},
    web::{
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
pub struct ProjectPayload {
    pub key: String,
    pub name: String,
    pub status: String,
    pub owner: String,
    pub work_item_count: i64,
    pub open_work_item_count: i64,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct ProjectDetailPayload {
    pub key: String,
    pub name: String,
    pub description: String,
    pub status: String,
    pub owner: String,
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
pub struct WorkItemDetailPayload {
    pub key: String,
    pub item_type: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: String,
    pub project_key: String,
    pub project_name: String,
    pub assignee: String,
    pub reporter: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct CommentPayload {
    pub id: i64,
    pub body: String,
    pub author: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct WorkItemQuery {
    #[serde(default)]
    item_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProjectRequest {
    project_key: String,
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default = "default_project_status")]
    status: String,
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
}

#[derive(Debug, Deserialize)]
pub struct UpdateWorkItemRequest {
    status: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateCommentRequest {
    body: String,
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
) -> axum::Json<ApiEnvelope<ReadyPayload<'static>>> {
    json(ReadyPayload {
        service: "yuance-api",
        status: "ready",
        database: if state.pool.is_some() {
            "sqlite-connected"
        } else {
            "sqlite-not-connected"
        },
        environment: state.settings.env,
    })
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

pub async fn list_projects(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<axum::Json<ApiEnvelope<Vec<ProjectPayload>>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    let projects = projects::list_project_summaries_for_user(pool, user.id, user.is_super_admin)
        .await?
        .into_iter()
        .map(project_payload)
        .collect();

    Ok(json(projects))
}

pub async fn create_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateProjectRequest>,
) -> AppResult<impl IntoResponse> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, user.id, "project.manage").await?;
    let project = projects::create_project(
        pool,
        user.id,
        projects::CreateProjectInput {
            project_key: payload.project_key,
            name: payload.name,
            description: payload.description,
            status: payload.status,
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
            owner: project.owner_display_name,
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
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;

    Ok(json(ProjectDetailPayload {
        key: project.project_key,
        name: project.name,
        description: project.description,
        status: project.status,
        owner: project.owner_display_name,
        created_at: project.created_at,
        updated_at: project.updated_at,
    }))
}

pub async fn list_work_items(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<WorkItemQuery>,
) -> AppResult<axum::Json<ApiEnvelope<Vec<WorkItemPayload>>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    let item_type = api_work_item_type(query.item_type.as_deref())?;
    let items =
        projects::list_work_item_summaries_for_user(pool, user.id, user.is_super_admin, item_type)
            .await?
            .into_iter()
            .map(work_item_payload)
            .collect();

    Ok(json(items))
}

pub async fn create_work_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateWorkItemRequest>,
) -> AppResult<impl IntoResponse> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, user.id, "work_item.manage").await?;
    let project = projects::get_project_detail(pool, &payload.project_key)
        .await?
        .ok_or_else(|| AppError::BadRequest("项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    let item = projects::create_work_item(
        pool,
        user.id,
        projects::CreateWorkItemInput {
            project_key: payload.project_key,
            item_type: payload.item_type,
            title: payload.title,
            description: payload.description,
            priority: payload.priority,
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
    let pool = state.pool()?;
    ensure_api_permission(pool, user.id, "work_item.manage").await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    let updated =
        projects::update_work_item_status(pool, user.id, &item_key, &payload.status).await?;
    audit::record(
        pool,
        Some(user.id),
        "work_item.status.update",
        "work_item",
        &updated.item_key,
        &format!(r#"{{"status":"{}"}}"#, updated.status),
    )
    .await?;

    Ok(json(work_item_detail_payload(updated)))
}

pub async fn create_work_item_comment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
    Json(payload): Json<CreateCommentRequest>,
) -> AppResult<impl IntoResponse> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, user.id, "work_item.manage").await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_project_access(pool, user.id, user.is_super_admin, project.id).await?;
    let comment = projects::add_work_item_comment(pool, user.id, &item_key, &payload.body).await?;
    audit::record(
        pool,
        Some(user.id),
        "work_item.comment.create",
        "work_item",
        &item_key,
        "{}",
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        json(CommentPayload {
            id: comment.id,
            body: comment.body,
            author: comment.author_display_name,
            created_at: comment.created_at,
        }),
    ))
}

pub async fn unsupported_mutation() -> (StatusCode, axum::Json<ApiEnvelope<serde_json::Value>>) {
    (
        StatusCode::NOT_IMPLEMENTED,
        json(serde_json::json!({
            "message": "V1 当前只开放查询接口，创建和更新会在表单闭环稳定后接入。"
        })),
    )
}

async fn require_api_user(state: &AppState, headers: &HeaderMap) -> AppResult<auth::AuthUser> {
    let pool = state.pool()?;
    auth::user_from_headers(pool, headers)
        .await?
        .ok_or(AppError::Unauthorized)
}

async fn ensure_api_project_access(
    pool: &sqlx::SqlitePool,
    user_id: i64,
    is_super_admin: bool,
    project_id: i64,
) -> AppResult<()> {
    if is_super_admin || projects::is_project_member(pool, project_id, user_id).await? {
        return Ok(());
    }

    Err(AppError::Forbidden("无权访问该项目".to_string()))
}

async fn ensure_api_permission(
    pool: &sqlx::SqlitePool,
    user_id: i64,
    permission_key: &str,
) -> AppResult<()> {
    if rbac::user_has_permission(pool, user_id, permission_key).await? {
        return Ok(());
    }

    Err(AppError::Forbidden("缺少操作权限".to_string()))
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
        assignee: item.assignee_display_name,
        reporter: item.reporter_display_name,
        created_at: item.created_at,
        updated_at: item.updated_at,
    }
}

fn default_project_status() -> String {
    "active".to_string()
}

fn default_priority() -> String {
    "P2".to_string()
}
