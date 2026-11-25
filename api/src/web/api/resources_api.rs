//! 项目资料接口：资料、资料附件、解锁与资料库关联。

use super::*;

pub async fn get_work_item_resource_library_link(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<WorkItemResourceLibraryLinkPayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_WORK_ITEM_READ).await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;

    // 没有资料库读取 scope 时只返回隐藏状态，避免把资料库关系元数据泄露到工作项接口。
    if !api_token_allows_scope(pool, &headers, user.id, api_tokens::SCOPE_RESOURCE_READ).await? {
        return Ok(json(WorkItemResourceLibraryLinkPayload {
            item_key,
            linked: false,
            linked_at: String::new(),
            can_manage: false,
        }));
    }

    let comments = projects::list_work_item_comments(pool, item.id).await?;
    let primary_post = projects::work_item_primary_post(
        &comments,
        item.primary_post_comment_id,
        &item.reporter_username,
        &item.description,
    );
    let has_linkable_primary_post = projects::work_item_has_linkable_primary_post(
        primary_post,
        item.primary_post_comment_id,
        &item.description,
    );
    let can_access_all_projects = api_user_can_access_all_projects(pool, user).await?;
    let can_manage_work_items = projects::ensure_project_accepts_writes(&project.status).is_ok()
        && ((can_access_all_projects
            && rbac::user_has_permission(pool, user.id, "work_item.manage").await?)
            || projects::user_can_write_project_content(
                pool,
                project.id,
                user.id,
                user.is_super_admin,
            )
            .await?);
    let can_manage = item.deleted_at.trim().is_empty()
        && has_linkable_primary_post
        && can_manage_work_items
        && api_token_allows_scope(pool, &headers, user.id, api_tokens::SCOPE_WORK_ITEM_WRITE)
            .await?
        && api_token_allows_scope(pool, &headers, user.id, api_tokens::SCOPE_RESOURCE_WRITE)
            .await?;
    let linked_at = project_resources::get_work_item_post_resource_link(pool, project.id, item.id)
        .await?
        .unwrap_or_default();

    Ok(json(WorkItemResourceLibraryLinkPayload {
        item_key,
        linked: !linked_at.is_empty(),
        linked_at,
        can_manage,
    }))
}

pub async fn link_work_item_to_resource_library(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<WorkItemResourceLibraryLinkPayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_WORK_ITEM_WRITE).await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_RESOURCE_WRITE).await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    ensure_api_work_item_accepts_writes(&item)?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let linked_at =
        project_resources::link_work_item_post(pool, project.id, item.id, user.id).await?;
    audit::record(
        pool,
        Some(user.id),
        "work_item.resource_library_linked",
        "work_item",
        &item.item_key,
        &principal.audit_details_with(serde_json::json!({"project": project.project_key})),
    )
    .await?;

    Ok(json(WorkItemResourceLibraryLinkPayload {
        item_key,
        linked: true,
        linked_at,
        can_manage: true,
    }))
}

pub async fn unlink_work_item_from_resource_library(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<WorkItemResourceLibraryLinkPayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_WORK_ITEM_WRITE).await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_RESOURCE_WRITE).await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    ensure_api_work_item_accepts_writes(&item)?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    project_resources::unlink_work_item_post(pool, project.id, item.id).await?;
    audit::record(
        pool,
        Some(user.id),
        "work_item.resource_library_unlinked",
        "work_item",
        &item.item_key,
        &principal.audit_details_with(serde_json::json!({"project": project.project_key})),
    )
    .await?;

    Ok(json(WorkItemResourceLibraryLinkPayload {
        item_key,
        linked: false,
        linked_at: String::new(),
        can_manage: true,
    }))
}

pub async fn list_project_resources(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Query(query): Query<ResourceQuery>,
) -> AppResult<axum::Json<ApiEnvelope<Vec<ProjectResourcePayload>>>> {
    let user = require_api_principal(&state, &headers).await?.user;
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

pub async fn list_project_resource_linked_work_item_posts(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Query(query): Query<LinkedWorkItemPostQuery>,
) -> AppResult<axum::Json<ApiEnvelope<Vec<ProjectResourceLinkedWorkItemPostPayload>>>> {
    let user = require_api_principal(&state, &headers).await?.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_RESOURCE_READ).await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    let payload = project_resources::list_linked_work_item_posts(pool, project.id, &query.q)
        .await?
        .into_iter()
        .map(project_resource_linked_work_item_post_payload)
        .collect();

    Ok(json(payload))
}

pub(super) fn resource_json<T>(payload: Result<Json<T>, JsonRejection>) -> AppResult<T> {
    match payload {
        Ok(Json(payload)) => Ok(payload),
        Err(rejection) if rejection.status() == StatusCode::PAYLOAD_TOO_LARGE => {
            Err(AppError::PayloadTooLarge(format!(
                "资料请求完整 UTF-8 JSON 超过 {} 字节（16 MiB）传输容量；正文没有固定字符数上限",
                RESOURCE_JSON_MAX_BYTES
            )))
        }
        Err(rejection) => Err(rejection.into()),
    }
}

pub async fn create_project_resource(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    payload: Result<Json<CreateProjectResourceRequest>, JsonRejection>,
) -> AppResult<impl IntoResponse> {
    let payload = resource_json(payload)?;
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
    ensure_api_project_content_write_access(pool, user, project.id).await?;
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
    payload: Result<Json<UpdateProjectResourceRequest>, JsonRejection>,
) -> AppResult<axum::Json<ApiEnvelope<ProjectResourcePayload>>> {
    let payload = resource_json(payload)?;
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
    auth_limits::ensure_resource_unlock_allowed(&state, user.id, resource.id)?;
    let (verified, access_token) =
        project_resources::verify_resource_password_and_issue_access_token(
            pool,
            &state.settings.security_master_key,
            user.id,
            resource.id,
            &payload.access_password,
        )
        .await?;
    auth_limits::record_resource_unlock_result(&state, user.id, resource.id, verified);
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

    Ok(json(project_resource_unlocked_payload(
        resource,
        access_token,
    )))
}

pub async fn reset_project_resource_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, resource_id)): Path<(String, i64)>,
    Json(payload): Json<ResetProjectResourcePasswordRequest>,
) -> AppResult<axum::Json<ApiEnvelope<ProjectResourcePayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let (user, project, resource) =
        require_api_project_resource_context(&state, &headers, &project_key, resource_id).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_RESOURCE_WRITE).await?;
    if !user.is_super_admin {
        return Err(AppError::Forbidden(
            "只有超级管理员可以重置资料保险箱密码".to_string(),
        ));
    }
    projects::ensure_project_accepts_writes(&project.status)?;
    let updated = project_resources::reset_resource_access_password(
        pool,
        user.id,
        resource.id,
        project_resources::ResetProjectResourceAccessPasswordInput {
            access_password_action: payload.access_password_action,
            access_password: payload.access_password,
            actor_display_name_snapshot: principal.actor_display_name_snapshot(),
        },
    )
    .await?;
    let mode = if updated.is_protected { "set" } else { "clear" };
    audit::record(
        pool,
        Some(user.id),
        "project_resource.password.reset",
        "project_resource",
        &updated.id.to_string(),
        &principal.audit_details_with(serde_json::json!({
            "project": project.project_key,
            "mode": mode,
            "actor_is_super_admin": true,
        })),
    )
    .await?;
    let refresh_user_ids = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT user_id FROM project_members WHERE project_id = ?1
        UNION
        SELECT id FROM users WHERE is_super_admin = 1 AND status = 'active'
        "#,
    )
    .bind(project.id)
    .fetch_all(pool)
    .await?;
    realtime::publish_topbar_refresh_for_users(refresh_user_ids);

    Ok(json(project_resource_payload(updated)))
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
    let attachment = files::create_attachment_with_checksum_encrypted(
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
        &state.settings.file_master_key,
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

pub async fn list_project_resource_attachments(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, resource_id)): Path<(String, i64)>,
    Query(query): Query<SignedUrlQuery>,
) -> AppResult<axum::Json<ApiEnvelope<Vec<AttachmentPayload>>>> {
    let (user, _project, resource) =
        require_api_project_resource_context(&state, &headers, &project_key, resource_id).await?;
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_RESOURCE_READ).await?;
    if resource.is_protected
        && !project_resources::verify_resource_access_token(
            pool,
            &state.settings.security_master_key,
            &query.access,
            user.id,
            resource.id,
        )
        .await?
    {
        return Err(AppError::Forbidden(
            "受保护资料附件需要先验证访问密码".to_string(),
        ));
    }
    let attachments = files::list_attachments(pool, "project_resource", resource.id)
        .await?
        .into_iter()
        .map(attachment_payload)
        .collect();
    Ok(json(attachments))
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
    body: Bytes,
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
    let attachment = if files::get_file_object_encryption(pool, attachment.file_object_id)
        .await?
        .is_some()
    {
        let encrypted_checksum_sha256 = parse_mark_uploaded_request(&body)?
            .and_then(|request| request.encrypted_sha256)
            .ok_or_else(|| {
                AppError::BadRequest("加密附件上传完成登记缺少密文 SHA-256".to_string())
            })?;
        let encrypted_byte_size = i64::try_from(file_crypto::encrypted_total_size(
            attachment.byte_size as u64,
        ))
        .map_err(|_| AppError::BadRequest("加密文件大小超出系统支持范围".to_string()))?;
        let actual_checksum_sha256 = storage::verify_uploaded_object(
            pool,
            &state.settings,
            &attachment.object_key,
            encrypted_byte_size,
            "application/octet-stream",
        )
        .await?;
        if actual_checksum_sha256 != encrypted_checksum_sha256 {
            return Err(AppError::BadRequest(
                "上传对象 SHA-256 与提交的密文摘要不一致".to_string(),
            ));
        }
        validate_svg_attachment_content(&state, pool, &attachment).await?;
        files::mark_attachment_uploaded_encrypted(
            pool,
            attachment_id,
            "project_resource",
            resource.id,
            encrypted_byte_size,
            &actual_checksum_sha256,
        )
        .await?
    } else {
        let actual_checksum_sha256 = storage::verify_uploaded_object(
            pool,
            &state.settings,
            &attachment.object_key,
            attachment.byte_size,
            &attachment.content_type,
        )
        .await?;
        validate_svg_attachment_content(&state, pool, &attachment).await?;
        files::mark_attachment_uploaded_with_checksum(
            pool,
            attachment_id,
            "project_resource",
            resource.id,
            &actual_checksum_sha256,
        )
        .await?
    };
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
    let pool = state.pool()?;
    if resource.is_protected
        && !project_resources::verify_resource_access_token(
            pool,
            &state.settings.security_master_key,
            &query.access,
            user.id,
            resource.id,
        )
        .await?
    {
        return Err(AppError::Forbidden(
            "受保护资料附件需要先验证访问密码".to_string(),
        ));
    }
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

pub async fn project_resource_attachment_preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, resource_id, attachment_id)): Path<(String, i64, i64)>,
    Query(query): Query<SignedUrlQuery>,
) -> AppResult<axum::Json<ApiEnvelope<ProjectAttachmentPreviewPayload>>> {
    let (user, _project, resource) =
        require_api_project_resource_context(&state, &headers, &project_key, resource_id).await?;
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_RESOURCE_READ).await?;
    ensure_project_resource_access_grant(&state, pool, &user, &resource, &query.access).await?;
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "project_resource", resource.id)
            .await?;
    let legacy_preview_enabled = state.settings.experimental_legacy_preview_enabled();
    let strategy =
        attachment_preview::strategy(&attachment.original_filename, &attachment.content_type);
    let preview_kind = attachment_preview::kind(
        &attachment.original_filename,
        &attachment.content_type,
        legacy_preview_enabled,
    );
    let content_enabled = attachment.status == "uploaded" && preview_kind.is_some();
    let access_suffix = resource_access_query_suffix(&query.access);
    let navigation = attachment_preview_navigation(
        files::list_attachments(pool, "project_resource", resource.id).await?,
        attachment.id,
        legacy_preview_enabled,
        |sibling| {
            format!(
                "/api/v1/projects/{project_key}/resources/{resource_id}/attachments/{}/preview{access_suffix}",
                sibling.id
            )
        },
    );
    audit::record(
        pool,
        Some(user.id),
        "file.preview",
        "project_resource",
        &resource.id.to_string(),
        &format!(r#"{{"source":"api","project":"{project_key}","attachment_id":{attachment_id}}}"#),
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
        content_url: format!(
            "/api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/preview/content{access_suffix}"
        ),
        download_url: format!(
            "/api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/download-url{access_suffix}"
        ),
    }))
}

pub async fn project_resource_attachment_preview_content(
    State(state): State<AppState>,
    method: Method,
    headers: HeaderMap,
    Path((project_key, resource_id, attachment_id)): Path<(String, i64, i64)>,
    Query(query): Query<PreviewContentQuery>,
) -> AppResult<Response> {
    let (user, _project, resource) =
        require_api_project_resource_context(&state, &headers, &project_key, resource_id).await?;
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_RESOURCE_READ).await?;
    ensure_project_resource_access_grant(&state, pool, &user, &resource, &query.access).await?;
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "project_resource", resource.id)
            .await?;
    if client_decrypt_requested(&query.client_decrypt)
        && files::get_file_object_encryption(pool, attachment.file_object_id)
            .await?
            .is_some()
    {
        return encrypted_preview_content_response(&state, pool, user.id, attachment).await;
    }
    attachment_preview_content_response(
        &state,
        pool,
        &headers,
        method,
        attachment,
        AttachmentPreviewAudit {
            user_id: user.id,
            target_type: "project_resource",
            target_id: &resource.id.to_string(),
            detail: &format!(
                r#"{{"source":"api","project":"{project_key}","attachment_id":{attachment_id}}}"#
            ),
        },
    )
    .await
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
    let expected_updated_at = headers
        .get("if-match")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            AppError::BadRequest("删除附件必须提供 If-Match: resource.updated_at".to_string())
        })?;
    let attachment = files::archive_resource_attachment_if_match(
        pool,
        attachment_id,
        resource.id,
        expected_updated_at,
        user.id,
        &principal.actor_display_name_snapshot(),
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

pub(super) async fn require_api_project_resource_context(
    state: &AppState,
    headers: &HeaderMap,
    project_key: &str,
    resource_id: i64,
) -> AppResult<(
    auth::AuthUser,
    projects::ProjectDetail,
    project_resources::ProjectResourceDetail,
)> {
    let user = require_api_principal(state, headers).await?.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, headers, user.id, user.is_super_admin, project.id).await?;
    let resource = project_resources::get_project_resource(pool, project.id, resource_id).await?;

    Ok((user, project, resource))
}

pub(super) fn project_resource_summary_payload(
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
        body_html: String::new(),
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
        access_token: None,
    }
}

pub(super) fn project_resource_linked_work_item_post_payload(
    post: project_resources::ProjectResourceLinkedWorkItemPost,
) -> ProjectResourceLinkedWorkItemPostPayload {
    ProjectResourceLinkedWorkItemPostPayload {
        key: post.item_key.clone(),
        item_type: post.item_type,
        title: post.title,
        summary: post.summary,
        author: post.author_display_name,
        updated_at: post.updated_at,
        linked_at: post.linked_at,
        url: format!("/web/work-items/{}", post.item_key),
    }
}

pub(super) fn project_resource_payload(
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
            resource.body.clone()
        },
        body_format: resource.body_format,
        body_html: if is_protected {
            String::new()
        } else {
            resource.body_html
        },
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
        access_token: None,
    }
}

pub(super) fn project_resource_unlocked_payload(
    resource: project_resources::ProjectResourceDetail,
    access_token: Option<String>,
) -> ProjectResourcePayload {
    let project_key = resource.project_key.clone();
    ProjectResourcePayload {
        id: resource.id,
        project_key: project_key.clone(),
        title: resource.title,
        category: resource.category,
        body: resource.body,
        body_format: resource.body_format,
        body_html: resource.body_html,
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
        access_token,
    }
}

pub(super) fn project_resource_work_item_relation_payload(
    relation: project_resources::ProjectResourceWorkItemRelation,
) -> ProjectResourceWorkItemRelationPayload {
    ProjectResourceWorkItemRelationPayload {
        key: relation.item_key.clone(),
        item_type: relation.item_type,
        title: relation.title,
        url: format!("/web/work-items/{}", relation.item_key),
    }
}

pub(super) fn project_resource_cycle_relation_payload(
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

pub(super) async fn ensure_project_resource_access_grant(
    state: &AppState,
    pool: &SqlitePool,
    user: &auth::AuthUser,
    resource: &project_resources::ProjectResourceDetail,
    access_token: &str,
) -> AppResult<()> {
    if resource.is_protected
        && !project_resources::verify_resource_access_token(
            pool,
            &state.settings.security_master_key,
            access_token,
            user.id,
            resource.id,
        )
        .await?
    {
        return Err(AppError::Forbidden(
            "受保护资料附件需要先验证访问密码".to_string(),
        ));
    }
    Ok(())
}

pub(super) fn resource_access_query_suffix(access_token: &str) -> String {
    if access_token.trim().is_empty() {
        return String::new();
    }
    let encoded = serde_urlencoded::to_string([("access", access_token)]).unwrap_or_default();
    if encoded.is_empty() {
        String::new()
    } else {
        format!("?{encoded}")
    }
}
