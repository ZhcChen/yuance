use askama::Template;
use axum::{
    Form,
    extract::{OriginalUri, Path, Query, State},
    http::{HeaderMap, StatusCode, Uri, header},
    response::{IntoResponse, Redirect, Response},
};
use serde::Deserialize;
use sqlx::SqlitePool;

use crate::{
    domains::{
        audit, auth,
        bootstrap::{self, BootstrapInitInput},
        files, project_resources, projects, rbac, storage, system_releases,
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
pub struct ResourceAccessQuery {
    #[serde(default)]
    access: String,
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
    shared_system_web_app_response(&state, &headers, &original_uri, "system.dashboard.view").await
}

pub async fn system_openapi_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
) -> AppResult<Response> {
    shared_system_web_app_response(&state, &headers, &original_uri, "system.api_tokens.view").await
}

pub async fn system_releases_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
) -> AppResult<Response> {
    shared_system_web_app_response(&state, &headers, &original_uri, "system.releases.view").await
}

pub async fn system_release_asset_download(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((release_id, asset_id)): Path<(i64, i64)>,
) -> AppResult<Response> {
    let pool = state.pool()?;
    if bootstrap::bootstrap_required(pool).await? {
        return bootstrap_redirect(&headers);
    }
    let Some(user) = auth::user_from_headers(pool, &headers).await? else {
        return login_redirect(&headers);
    };
    ensure_view_permission(pool, &headers, user.id, "system.releases.view").await?;
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
        user.id,
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
        Some(user.id),
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
) -> AppResult<Response> {
    shared_system_web_app_response(&state, &headers, &original_uri, "system.users.view").await
}

pub async fn system_database_stats_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
) -> AppResult<Response> {
    shared_system_web_app_response(
        &state,
        &headers,
        &original_uri,
        "system.database_stats.view",
    )
    .await
}

pub async fn system_roles_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
) -> AppResult<Response> {
    shared_system_web_app_response(&state, &headers, &original_uri, "system.roles.view").await
}

pub async fn system_role_permissions_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
) -> AppResult<Response> {
    shared_system_web_app_response(&state, &headers, &original_uri, "system.roles.view").await
}

pub async fn system_permissions_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
) -> AppResult<Response> {
    shared_system_web_app_response(&state, &headers, &original_uri, "system.roles.view").await
}

pub async fn storage_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
) -> AppResult<Response> {
    shared_system_web_app_response(&state, &headers, &original_uri, "system.storage.view").await
}

pub async fn system_audit_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
) -> AppResult<Response> {
    shared_system_web_app_response(&state, &headers, &original_uri, "system.audit.view").await
}

pub async fn system_api_docs_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(original_uri): OriginalUri,
) -> AppResult<Response> {
    shared_system_web_app_response(&state, &headers, &original_uri, "system.api_tokens.view").await
}

struct WebContext<'a> {
    user_id: i64,
    is_super_admin: bool,
    can_access_all_projects: bool,
    pool: Option<&'a SqlitePool>,
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
    original_uri: &Uri,
    permission: &str,
) -> AppResult<Response> {
    let return_to = original_uri
        .path_and_query()
        .map(|value| value.as_str())
        .unwrap_or_else(|| original_uri.path());
    let csrf_token = csrf::ensure_token(headers);
    if let Some(pool) = state.pool.as_ref() {
        if bootstrap::bootstrap_required(pool).await? {
            return bootstrap_redirect(headers);
        }
        let Some(user) = auth::user_from_headers(pool, headers).await? else {
            return login_redirect_to(headers, return_to);
        };
        ensure_view_permission(pool, headers, user.id, permission).await?;
    }
    with_csrf_cookie(
        state,
        &csrf_token,
        crate::web::router::web_app_entry_response(state),
    )
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

fn format_byte_size(byte_size: i64) -> String {
    if byte_size < 1024 {
        return format!("{byte_size} B");
    }
    if byte_size < 1024 * 1024 {
        return format!("{:.1} KB", byte_size as f64 / 1024.0);
    }
    format!("{:.1} MB", byte_size as f64 / 1024.0 / 1024.0)
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
