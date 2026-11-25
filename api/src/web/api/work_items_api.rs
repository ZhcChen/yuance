//! 工作项接口：工作项、评论、草稿、批量操作与工作项附件。

use super::*;

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
            let next = tokio::select! {
                biased;
                _ = realtime::wait_for_shutdown() => None,
                message = receiver.recv() => Some(message),
            };
            let Some(next) = next else { break };
            match next {
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

pub async fn list_work_items(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<WorkItemQuery>,
) -> AppResult<axum::Json<ApiEnvelope<PaginatedPayload<WorkItemPayload>>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    let can_access_all_projects = api_user_can_access_all_projects(pool, user).await?;
    let item_type = api_work_item_type(query.item_type.as_deref())?;
    let token_project_scope = api_token_project_scope_keys(pool, &headers, user.id).await?;
    let explicit_project_key = query.project_key.trim().to_string();
    let project_key = if explicit_project_key.is_empty() && token_project_scope.is_some() {
        String::new()
    } else {
        default_api_project_key(pool, user, can_access_all_projects, query.project_key).await?
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
                    cycle_id: query.cycle_id,
                    sort_by: query.sort,
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
            cycle_id: query.cycle_id,
            sort_by: query.sort,
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

pub async fn get_work_item_list_view(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<WorkItemQuery>,
) -> AppResult<axum::Json<ApiEnvelope<WorkItemListViewPayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    let can_access_all_projects = api_user_can_access_all_projects(pool, user).await?;
    let item_type = api_work_item_type(query.item_type.as_deref())?
        .ok_or_else(|| AppError::BadRequest("工作项类型不能为空".to_string()))?;
    let project_key =
        default_api_project_key(pool, user, can_access_all_projects, query.project_key).await?;
    if project_key.is_empty() {
        return Err(AppError::BadRequest("请先选择当前项目".to_string()));
    }
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;

    let saved_views = projects::list_work_item_saved_views_for_user(
        pool,
        user.id,
        can_access_all_projects,
        &project.project_key,
        item_type,
    )
    .await?;
    let mut filter = projects::WorkItemListFilter {
        item_type: Some(item_type.to_string()),
        project_key: project.project_key.clone(),
        sort_by: "updated_desc".to_string(),
        ..projects::WorkItemListFilter::default()
    };
    if !query.q.trim().is_empty() {
        filter.keyword = query.q;
    }
    if !query.status.trim().is_empty() {
        filter.status = query.status;
    }
    if !query.priority.trim().is_empty() {
        filter.priority = query.priority;
    }
    if !query.assignee_username.trim().is_empty() {
        filter.assignee_username = query.assignee_username;
    }
    if !query.cycle_id.trim().is_empty() {
        filter.cycle_id = query.cycle_id;
    }
    if !query.sort.trim().is_empty() {
        filter.sort_by = query.sort;
    }
    filter.item_type = Some(item_type.to_string());
    filter.project_key = project.project_key.clone();
    let pagination = normalize_api_pagination(query.page, query.per_page)?;
    let (page, stats, members, cycles) = tokio::try_join!(
        projects::list_work_item_summaries_filtered_for_user_paginated(
            pool,
            user.id,
            can_access_all_projects,
            filter.clone(),
            pagination,
        ),
        projects::work_item_list_stats_filtered_for_user(
            pool,
            user.id,
            can_access_all_projects,
            filter.clone(),
        ),
        projects::list_project_members(pool, project.id),
        projects::list_project_cycles(pool, project.id),
    )?;
    let parent_options = if item_type == "task" {
        projects::list_work_item_summaries_filtered_for_user(
            pool,
            user.id,
            can_access_all_projects,
            projects::WorkItemListFilter {
                item_type: Some("requirement".to_string()),
                project_key: project.project_key.clone(),
                ..projects::WorkItemListFilter::default()
            },
        )
        .await?
        .into_iter()
        .map(|item| WorkItemParentOptionPayload {
            key: item.item_key,
            title: item.title,
        })
        .collect()
    } else {
        Vec::new()
    };
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
    let total_pages = page.total_pages();

    Ok(json(WorkItemListViewPayload {
        items: page.items.into_iter().map(work_item_payload).collect(),
        pagination: PaginationPayload {
            page: page.page,
            per_page: page.per_page,
            total_items: page.total_items,
            total_pages,
        },
        summary: WorkItemListSummaryPayload {
            total_items: stats.total_items,
            active_items: stats.active_items,
            high_priority_items: stats.high_priority_items,
            completed_items: stats.completed_items,
        },
        filters: work_item_list_filter_payload(item_type, filter),
        assignees: members
            .into_iter()
            .map(|member| WorkItemListAssigneePayload {
                username: member.username,
                display_name: member.display_name,
            })
            .collect(),
        cycles: cycles
            .into_iter()
            .map(|cycle| WorkItemListCyclePayload {
                id: cycle.id,
                name: cycle.name,
                is_closed: !cycle.closed_at.is_empty(),
            })
            .collect(),
        parent_options,
        saved_views: saved_views
            .into_iter()
            .map(|view| WorkItemSavedViewPayload {
                id: view.id,
                name: view.name,
                filters: work_item_list_filter_payload(item_type, view.filter),
                per_page: view.per_page,
                is_default: view.is_default,
            })
            .collect(),
        can_manage_work_items,
    }))
}

pub async fn create_work_item_saved_view(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateWorkItemSavedViewRequest>,
) -> AppResult<impl IntoResponse> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_WORK_ITEM_WRITE).await?;
    let view = projects::create_work_item_saved_view(
        pool,
        user.id,
        api_user_can_access_all_projects(pool, user).await?,
        &payload.project_key,
        &payload.item_type,
        projects::CreateWorkItemSavedViewInput {
            name: payload.name,
            filter: projects::WorkItemListFilter {
                item_type: Some(payload.item_type.clone()),
                keyword: payload.q,
                status: payload.status,
                priority: payload.priority,
                project_key: payload.project_key.clone(),
                assignee_username: payload.assignee_username,
                cycle_id: payload.cycle_id,
                sort_by: payload.sort,
            },
            per_page: payload.per_page,
            is_default: payload.is_default,
        },
    )
    .await?;
    Ok((
        StatusCode::CREATED,
        json(work_item_saved_view_payload(view)),
    ))
}

pub async fn rename_work_item_saved_view(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(saved_view_id): Path<i64>,
    Json(payload): Json<RenameWorkItemSavedViewRequest>,
) -> AppResult<axum::Json<ApiEnvelope<WorkItemSavedViewPayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, principal.user.id, "work_item.view").await?;
    ensure_api_token_scope(
        pool,
        &headers,
        principal.user.id,
        api_tokens::SCOPE_WORK_ITEM_WRITE,
    )
    .await?;
    let view = projects::rename_work_item_saved_view(
        pool,
        principal.user.id,
        saved_view_id,
        &payload.name,
    )
    .await?;
    Ok(json(work_item_saved_view_payload(view)))
}

pub async fn set_default_work_item_saved_view(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(saved_view_id): Path<i64>,
) -> AppResult<axum::Json<ApiEnvelope<WorkItemSavedViewPayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, principal.user.id, "work_item.view").await?;
    ensure_api_token_scope(
        pool,
        &headers,
        principal.user.id,
        api_tokens::SCOPE_WORK_ITEM_WRITE,
    )
    .await?;
    let view =
        projects::set_default_work_item_saved_view(pool, principal.user.id, saved_view_id).await?;
    Ok(json(work_item_saved_view_payload(view)))
}

pub async fn delete_work_item_saved_view(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(saved_view_id): Path<i64>,
) -> AppResult<StatusCode> {
    let principal = require_api_principal(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, principal.user.id, "work_item.view").await?;
    ensure_api_token_scope(
        pool,
        &headers,
        principal.user.id,
        api_tokens::SCOPE_WORK_ITEM_WRITE,
    )
    .await?;
    projects::delete_work_item_saved_view(pool, principal.user.id, saved_view_id).await?;
    Ok(StatusCode::NO_CONTENT)
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
    ensure_api_project_content_write_access(pool, user, project.id).await?;
    let item = projects::create_work_item_with_cycle(
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
        payload.cycle_id,
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

pub async fn batch_update_work_items(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<BatchUpdateWorkItemsRequest>,
) -> AppResult<axum::Json<ApiEnvelope<BatchUpdateWorkItemsPayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_WORK_ITEM_WRITE).await?;
    let project = projects::get_project_detail(pool, &payload.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, user, project.id).await?;

    let action_target_is_valid = match payload.action.trim() {
        "assignee" => {
            !payload.assignee_username.trim().is_empty()
                && payload.status.trim().is_empty()
                && payload.priority.trim().is_empty()
                && payload.cycle_id.is_none()
        }
        "status" => {
            !payload.status.trim().is_empty()
                && payload.assignee_username.trim().is_empty()
                && payload.priority.trim().is_empty()
                && payload.cycle_id.is_none()
        }
        "priority" => {
            !payload.priority.trim().is_empty()
                && payload.status.trim().is_empty()
                && payload.assignee_username.trim().is_empty()
                && payload.cycle_id.is_none()
        }
        "cycle" => {
            payload.status.trim().is_empty()
                && payload.assignee_username.trim().is_empty()
                && payload.priority.trim().is_empty()
        }
        _ => false,
    };
    if !action_target_is_valid {
        return Err(AppError::BadRequest(
            "批量操作动作与目标参数不匹配".to_string(),
        ));
    }

    if payload.item_keys.len() > 100 {
        return Err(AppError::BadRequest(
            "单次最多只能批量操作 100 个工作项".to_string(),
        ));
    }
    let mut item_keys = Vec::new();
    for item_key in payload.item_keys {
        let item_key = item_key.trim().to_ascii_uppercase();
        if item_keys.contains(&item_key) {
            return Err(AppError::BadRequest("工作项编号不能重复".to_string()));
        }
        item_keys.push(item_key);
    }
    if item_keys.is_empty() {
        return Err(AppError::BadRequest("请至少选择一个工作项".to_string()));
    }

    let mut updated_item_keys = Vec::new();
    let mut failed_items = Vec::new();
    for item_key in item_keys {
        let result = projects::batch_update_work_items(
            pool,
            user.id,
            projects::BatchUpdateWorkItemsInput {
                project_key: payload.project_key.clone(),
                item_type: payload.item_type.clone(),
                item_keys: vec![item_key.clone()],
                action: payload.action.clone(),
                status: payload.status.clone(),
                assignee_username: payload.assignee_username.clone(),
                priority: payload.priority.clone(),
                cycle_id: payload.cycle_id,
                actor_display_name_snapshot: principal.actor_display_name_snapshot(),
            },
        )
        .await;
        match result {
            Ok(_) => updated_item_keys.push(item_key),
            Err(error @ (AppError::Database(_) | AppError::Io(_))) => return Err(error),
            Err(error) => {
                let code = match &error {
                    AppError::BadRequest(_) => "bad_request",
                    AppError::Conflict(_) => "conflict",
                    AppError::Forbidden(_) => "forbidden",
                    AppError::NotFound(_) => "not_found",
                    _ => "operation_failed",
                };
                failed_items.push(BatchUpdateWorkItemFailurePayload {
                    item_key,
                    code,
                    message: error.to_string(),
                });
            }
        }
    }

    let response = BatchUpdateWorkItemsPayload {
        updated_count: updated_item_keys.len(),
        updated_item_keys,
        failed_count: failed_items.len(),
        failed_items,
    };
    audit::record(
        pool,
        Some(user.id),
        "work_item.batch.update",
        "project",
        &project.project_key,
        &serde_json::json!({
            "action": payload.action,
            "updated_count": response.updated_count,
            "failed_count": response.failed_count,
            "updated_item_keys": response.updated_item_keys,
            "failed_item_keys": response.failed_items.iter().map(|item| &item.item_key).collect::<Vec<_>>(),
        })
        .to_string(),
    )
    .await?;

    Ok(json(response))
}

pub async fn get_work_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<WorkItemDetailPayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
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

pub async fn get_work_item_detail_view(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<WorkItemDetailViewPayload>>> {
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
    let is_deleted = !item.deleted_at.trim().is_empty();
    let can_restore_work_item = is_deleted
        && can_manage_work_items
        && rbac::user_has_permission(pool, user.id, "work_item.manage").await?;
    let members = projects::list_project_members(pool, project.id).await?;
    let parent_options = if item.item_type == "task" {
        projects::list_work_item_summaries_filtered_for_user(
            pool,
            user.id,
            can_access_all_projects,
            projects::WorkItemListFilter {
                item_type: Some("requirement".to_string()),
                project_key: project.project_key.clone(),
                ..projects::WorkItemListFilter::default()
            },
        )
        .await?
        .into_iter()
        .map(|entry| WorkItemParentOptionPayload {
            key: entry.item_key,
            title: entry.title,
        })
        .collect()
    } else {
        Vec::new()
    };
    let navigation = if is_deleted {
        WorkItemDetailNavigationPayload {
            previous: None,
            next: None,
        }
    } else {
        work_item_detail_navigation(
            projects::list_work_item_summaries_filtered_for_user(
                pool,
                user.id,
                can_access_all_projects,
                projects::WorkItemListFilter {
                    item_type: Some(item.item_type.clone()),
                    project_key: project.project_key.clone(),
                    ..projects::WorkItemListFilter::default()
                },
            )
            .await?,
            &item.item_key,
        )
    };
    let flow_page = projects::list_work_item_operation_records_paginated(
        pool,
        item.id,
        &item.item_key,
        projects::Pagination {
            page: 1,
            per_page: 10,
        },
    )
    .await?;
    let flow_total_pages = flow_page.total_pages();
    let current_status = projects::normalize_work_item_status(&item.status)?;
    let comments = projects::list_work_item_comments(pool, item.id).await?;
    let primary_post = projects::work_item_primary_post(
        &comments,
        item.primary_post_comment_id,
        &item.reporter_username,
        &item.description,
    )
    .cloned()
    .map(comment_payload);
    Ok(json(WorkItemDetailViewPayload {
        item: work_item_detail_payload(item.clone()),
        primary_post,
        cycle: item
            .cycle_id
            .map(|cycle_id| WorkItemDetailViewOptionPayload {
                value: cycle_id.to_string(),
                label: item.cycle_name.clone(),
            }),
        assignees: members
            .into_iter()
            .map(|member| WorkItemDetailViewOptionPayload {
                value: member.username,
                label: member.display_name,
            })
            .collect(),
        parent_options,
        status_options: api_work_item_status_options(&item.item_type, current_status)?,
        permissions: WorkItemDetailViewPermissionsPayload {
            can_manage_work_items,
            can_edit_primary_post: !is_deleted
                && can_manage_work_items
                && projects::user_can_edit_work_item_post(item.reporter_user_id, user.id),
            can_close_work_item: can_manage_work_items
                && !is_deleted
                && !matches!(current_status, "closed" | "cancelled"),
            can_reopen_work_item: can_manage_work_items
                && !is_deleted
                && matches!(current_status, "closed" | "cancelled"),
            can_restore_work_item,
        },
        navigation,
        flow_history: WorkItemFlowHistoryPayload {
            items: flow_page
                .items
                .into_iter()
                .map(work_item_flow_record_payload)
                .collect(),
            pagination: PaginationPayload {
                page: flow_page.page,
                per_page: flow_page.per_page,
                total_items: flow_page.total_items,
                total_pages: flow_total_pages,
            },
        },
    }))
}

pub async fn update_work_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
    Json(payload): Json<UpdateWorkItemRequest>,
) -> AppResult<axum::Json<ApiEnvelope<WorkItemDetailPayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
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
    ensure_api_project_content_write_access(pool, user, project.id).await?;
    let status = payload.status.unwrap_or_else(|| item.status.clone());
    let assignee_username = payload
        .assignee_username
        .unwrap_or_else(|| item.assignee_username.clone());
    let cycle_id = payload.cycle_id.unwrap_or(item.cycle_id);
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
            cycle_id,
            actor_display_name_snapshot: principal.actor_display_name_snapshot(),
            expected_updated_at: payload.expected_updated_at.unwrap_or_default(),
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

pub async fn update_work_item_primary_post(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
    Json(payload): Json<UpdateWorkItemPrimaryPostRequest>,
) -> AppResult<axum::Json<ApiEnvelope<CommentPayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.view").await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_WORK_ITEM_WRITE).await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_COMMENT_WRITE).await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    ensure_api_work_item_accepts_writes(&item)?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, user, project.id).await?;
    if !projects::user_can_edit_work_item_post(item.reporter_user_id, user.id) {
        return Err(AppError::Forbidden(
            "只有报告人可以编辑工作项主内容".to_string(),
        ));
    }
    if payload.body_format != "html" {
        return Err(AppError::BadRequest(
            "工作项主内容格式只能是 html".to_string(),
        ));
    }
    let comments = projects::list_work_item_comments(pool, item.id).await?;
    let existing = projects::work_item_primary_post(
        &comments,
        item.primary_post_comment_id,
        &item.reporter_username,
        &item.description,
    )
    .map(|comment| comment.id);
    let comment = projects::upsert_work_item_primary_post(
        pool,
        user.id,
        &item_key,
        existing,
        &payload.body,
        &principal.actor_display_name_snapshot(),
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "work_item.primary_post.update",
        "work_item",
        &item_key,
        &principal.audit_details(),
    )
    .await?;

    Ok(json(comment_payload(comment)))
}

pub async fn handoff_work_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
    Json(payload): Json<HandoffWorkItemRequest>,
) -> AppResult<axum::Json<ApiEnvelope<WorkItemDetailPayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
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
    ensure_api_project_content_write_access(pool, user, project.id).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.manage").await?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_WORK_ITEM_WRITE).await?;
    let item = projects::get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, user, project.id).await?;
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

pub async fn close_work_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<WorkItemDetailPayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
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
    // “任何人可关闭”限定为对项目有写权限的成员，只读成员不可关闭。
    ensure_api_project_content_write_access(pool, user, project.id).await?;
    let updated = projects::close_work_item(pool, user.id, &item_key).await?;
    audit::record(
        pool,
        Some(user.id),
        "work_item.close",
        "work_item",
        &updated.item_key,
        &principal.audit_details(),
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

pub async fn cancel_work_item_comment_draft(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, comment_id)): Path<(String, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<CommentPayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let (item, project, comment) = require_api_comment_context_for_user(
        &state,
        &headers,
        &principal.user,
        &item_key,
        comment_id,
    )
    .await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_COMMENT_WRITE).await?;
    ensure_api_work_item_accepts_writes(&item)?;
    ensure_api_project_content_write_access(pool, user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    if !comment.is_draft {
        return Err(AppError::BadRequest("该评论不是草稿".to_string()));
    }
    if comment.author_user_id != Some(user.id) {
        return Err(AppError::Forbidden("只能取消自己的草稿评论".to_string()));
    }

    let cancelled =
        projects::cancel_work_item_comment_draft(pool, user.id, &item_key, comment_id).await?;
    audit::record(
        pool,
        Some(user.id),
        "work_item.comment.draft.cancel",
        "work_item",
        &item_key,
        &format!(r#"{{"comment_id":{comment_id}}}"#),
    )
    .await?;
    Ok(json(comment_payload(cancelled)))
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

/// 一次返回工作项全部已发布评论的附件，按评论 ID 分组（避免详情页逐条评论请求）。
pub async fn list_work_item_comment_attachments_batch(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<std::collections::BTreeMap<String, Vec<AttachmentPayload>>>>>
{
    let (_user, item, _project) =
        require_api_work_item_context(&state, &headers, &item_key).await?;
    let pool = state.pool()?;
    let comment_ids = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT id
        FROM work_item_comments
        WHERE work_item_id = ?1
          AND deleted_at IS NULL
          AND is_draft = 0
        ORDER BY id
        "#,
    )
    .bind(item.id)
    .fetch_all(pool)
    .await?;
    let mut grouped = std::collections::BTreeMap::new();
    for comment_id in comment_ids {
        let attachments = files::list_attachments(pool, "comment", comment_id)
            .await?
            .into_iter()
            .map(attachment_payload)
            .collect();
        grouped.insert(comment_id.to_string(), attachments);
    }

    Ok(json(grouped))
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
    let attachment = complete_attachment_upload(
        &state,
        pool,
        user.id,
        attachment,
        AttachmentTarget {
            kind: "comment",
            id: comment.id,
            audit_target_type: "comment",
            audit_target_id: comment_id.to_string(),
            audit_metadata: format!(
                r#"{{"work_item":"{item_key}","attachment_id":{attachment_id}}}"#
            ),
        },
        UploadCompletionOptions::PLAIN,
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

pub async fn work_item_comment_attachment_preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, comment_id, attachment_id)): Path<(String, i64, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<ProjectAttachmentPreviewPayload>>> {
    let (user, _item, _project, comment) =
        require_api_comment_context(&state, &headers, &item_key, comment_id).await?;
    let pool = state.pool()?;
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "comment", comment.id).await?;
    let legacy_preview_enabled = state.settings.experimental_legacy_preview_enabled();
    let strategy =
        attachment_preview::strategy(&attachment.original_filename, &attachment.content_type);
    let preview_kind = attachment_preview::kind(
        &attachment.original_filename,
        &attachment.content_type,
        legacy_preview_enabled,
    );
    let content_enabled = attachment.status == "uploaded" && preview_kind.is_some();
    let navigation = attachment_preview_navigation(
        files::list_attachments(pool, "comment", comment.id).await?,
        attachment.id,
        legacy_preview_enabled,
        |sibling| {
            format!(
                "/api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{}/preview",
                sibling.id
            )
        },
    );
    audit::record(
        pool,
        Some(user.id),
        "file.preview",
        "comment",
        &comment_id.to_string(),
        &format!(r#"{{"source":"api","work_item":"{item_key}","attachment_id":{attachment_id}}}"#),
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
            "/api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/preview/content"
        ),
        download_url: format!(
            "/api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/download-url"
        ),
    }))
}

pub async fn work_item_comment_attachment_preview_content(
    State(state): State<AppState>,
    method: Method,
    headers: HeaderMap,
    Path((item_key, comment_id, attachment_id)): Path<(String, i64, i64)>,
    Query(query): Query<PreviewContentQuery>,
) -> AppResult<Response> {
    let (user, _item, _project, comment) =
        require_api_comment_context(&state, &headers, &item_key, comment_id).await?;
    let pool = state.pool()?;
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "comment", comment.id).await?;
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
            target_type: "comment",
            target_id: &comment_id.to_string(),
            detail: &format!(
                r#"{{"source":"api","work_item":"{item_key}","attachment_id":{attachment_id}}}"#
            ),
        },
    )
    .await
}

pub async fn work_item_comment_attachment_delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, comment_id, attachment_id)): Path<(String, i64, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentPayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let (item, project, comment) = require_api_comment_context_for_user(
        &state,
        &headers,
        &principal.user,
        &item_key,
        comment_id,
    )
    .await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_COMMENT_WRITE).await?;
    ensure_api_work_item_accepts_writes(&item)?;
    ensure_api_comment_accepts_attachments(&comment)?;
    ensure_api_project_content_write_access(pool, user, project.id).await?;
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
    projects::ensure_work_item_comment_inline_attachment_can_be_removed(
        pool,
        item.id,
        comment.id,
        attachment_id,
    )
    .await?;
    projects::archive_work_item_comment_inline_attachment(
        pool,
        item.id,
        comment.id,
        attachment_id,
        comment.is_draft,
    )
    .await?;
    let attachment = files::get_attachment(pool, attachment_id).await?;
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

/// 草稿附件上下文：新建工作项弹窗在工作项创建前上传附件。
/// 要求可查看工作项、具备评论写入令牌范围、项目访问与内容写权限，且项目可写。
pub(super) async fn require_api_draft_attachment_context(
    state: &AppState,
    headers: &HeaderMap,
    project_key: &str,
) -> AppResult<(ApiPrincipal, projects::ProjectDetail)> {
    let principal = require_api_principal(state, headers).await?;
    let pool = state.pool()?;
    let user = &principal.user;
    ensure_api_permission(pool, headers, user.id, "work_item.view").await?;
    ensure_api_token_scope(pool, headers, user.id, api_tokens::SCOPE_COMMENT_WRITE).await?;
    let project = projects::get_project_detail(pool, project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    Ok((principal, project))
}

pub async fn create_work_item_draft_attachment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Json(payload): Json<CreateAttachmentRequest>,
) -> AppResult<impl IntoResponse> {
    ensure_api_csrf(&headers)?;
    let (principal, project) =
        require_api_draft_attachment_context(&state, &headers, &project_key).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    let config = storage::active_config(pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
    // 顺带清理全站已过期的草稿（单次最多 500 个），避免依赖人工执行清理命令。
    if let Err(error) = files::cleanup_expired_draft_attachments(
        pool,
        DRAFT_ATTACHMENT_RETENTION_HOURS,
        None,
        false,
    )
    .await
    {
        tracing::warn!(%error, "草稿附件过期清理失败");
    }
    let checksum_sha256 = payload.checksum_sha256.clone();
    let attachment = files::create_attachment_with_checksum(
        pool,
        &config,
        files::CreateAttachmentInput {
            target_type: files::DRAFT_ATTACHMENT_TARGET_TYPE.to_string(),
            target_id: project.id,
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
        "file.attach.draft",
        "project",
        &project.project_key,
        &format!(r#"{{"file_object_id":{}}}"#, attachment.file_object_id),
    )
    .await?;

    Ok((StatusCode::CREATED, json(attachment_payload(attachment))))
}

pub async fn work_item_draft_attachment_upload_url(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, attachment_id)): Path<(String, i64)>,
    Query(query): Query<SignedUrlQuery>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentSignedUrlPayload>>> {
    let (principal, project) =
        require_api_draft_attachment_context(&state, &headers, &project_key).await?;
    let pool = state.pool()?;
    let attachment =
        files::get_draft_attachment_for_owner(pool, attachment_id, project.id, principal.user.id)
            .await?;
    Ok(json(
        signed_attachment_url_payload(
            &state,
            pool,
            attachment,
            principal.user.id,
            SignedUrlKind::Upload,
            query,
        )
        .await?,
    ))
}

pub async fn work_item_draft_attachment_mark_uploaded(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, attachment_id)): Path<(String, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentPayload>>> {
    ensure_api_csrf(&headers)?;
    let (principal, project) =
        require_api_draft_attachment_context(&state, &headers, &project_key).await?;
    let pool = state.pool()?;
    let attachment =
        files::get_draft_attachment_for_owner(pool, attachment_id, project.id, principal.user.id)
            .await?;
    let attachment = complete_attachment_upload(
        &state,
        pool,
        principal.user.id,
        attachment,
        AttachmentTarget {
            kind: files::DRAFT_ATTACHMENT_TARGET_TYPE,
            id: project.id,
            audit_target_type: "project",
            audit_target_id: project.project_key.clone(),
            audit_metadata: format!(r#"{{"draft":true,"attachment_id":{attachment_id}}}"#),
        },
        UploadCompletionOptions::PLAIN,
    )
    .await?;

    Ok(json(attachment_payload(attachment)))
}

pub async fn work_item_draft_attachment_download_url(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, attachment_id)): Path<(String, i64)>,
    Query(query): Query<SignedUrlQuery>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentSignedUrlPayload>>> {
    let (principal, project) =
        require_api_draft_attachment_context(&state, &headers, &project_key).await?;
    let pool = state.pool()?;
    let attachment =
        files::get_draft_attachment_for_owner(pool, attachment_id, project.id, principal.user.id)
            .await?;
    Ok(json(
        signed_attachment_url_payload(
            &state,
            pool,
            attachment,
            principal.user.id,
            SignedUrlKind::Download,
            query,
        )
        .await?,
    ))
}

pub async fn work_item_draft_attachment_delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, attachment_id)): Path<(String, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentPayload>>> {
    ensure_api_csrf(&headers)?;
    let (principal, project) =
        require_api_draft_attachment_context(&state, &headers, &project_key).await?;
    let pool = state.pool()?;
    let attachment =
        files::delete_draft_attachment(pool, attachment_id, project.id, principal.user.id).await?;
    audit::record(
        pool,
        Some(principal.user.id),
        "file.archive",
        "project",
        &project.project_key,
        &format!(r#"{{"draft":true,"attachment_id":{attachment_id}}}"#),
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
    let principal = require_api_principal(&state, &headers).await?;
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
    let attachment = complete_attachment_upload(
        &state,
        pool,
        user.id,
        attachment,
        AttachmentTarget {
            kind: "work_item",
            id: item.id,
            audit_target_type: "work_item",
            audit_target_id: item_key.clone(),
            audit_metadata: format!(r#"{{"attachment_id":{attachment_id}}}"#),
        },
        UploadCompletionOptions::PLAIN,
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

pub async fn work_item_attachment_preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((item_key, attachment_id)): Path<(String, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<ProjectAttachmentPreviewPayload>>> {
    let (user, item, _project) = require_api_work_item_context(&state, &headers, &item_key).await?;
    let pool = state.pool()?;
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "work_item", item.id).await?;
    let legacy_preview_enabled = state.settings.experimental_legacy_preview_enabled();
    let strategy =
        attachment_preview::strategy(&attachment.original_filename, &attachment.content_type);
    let preview_kind = attachment_preview::kind(
        &attachment.original_filename,
        &attachment.content_type,
        legacy_preview_enabled,
    );
    let content_enabled = attachment.status == "uploaded" && preview_kind.is_some();
    let navigation = attachment_preview_navigation(
        files::list_attachments(pool, "work_item", item.id).await?,
        attachment.id,
        legacy_preview_enabled,
        |sibling| {
            format!(
                "/api/v1/work-items/{item_key}/attachments/{}/preview",
                sibling.id
            )
        },
    );
    audit::record(
        pool,
        Some(user.id),
        "file.preview",
        "work_item",
        &item_key,
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
        content_url: format!(
            "/api/v1/work-items/{item_key}/attachments/{attachment_id}/preview/content"
        ),
        download_url: format!(
            "/api/v1/work-items/{item_key}/attachments/{attachment_id}/download-url"
        ),
    }))
}

pub async fn work_item_attachment_preview_content(
    State(state): State<AppState>,
    method: Method,
    headers: HeaderMap,
    Path((item_key, attachment_id)): Path<(String, i64)>,
    Query(query): Query<PreviewContentQuery>,
) -> AppResult<Response> {
    let (user, item, _project) = require_api_work_item_context(&state, &headers, &item_key).await?;
    let pool = state.pool()?;
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "work_item", item.id).await?;
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
            target_type: "work_item",
            target_id: &item_key,
            detail: &format!(r#"{{"source":"api","attachment_id":{attachment_id}}}"#),
        },
    )
    .await
}

pub(super) async fn require_api_work_item_context(
    state: &AppState,
    headers: &HeaderMap,
    item_key: &str,
) -> AppResult<(
    auth::AuthUser,
    projects::WorkItemDetail,
    projects::ProjectDetail,
)> {
    let user = require_api_principal(state, headers).await?.user;
    let (item, project) =
        require_api_work_item_context_for_user(state, headers, &user, item_key).await?;
    Ok((user, item, project))
}

pub(super) async fn require_api_work_item_context_for_user(
    state: &AppState,
    headers: &HeaderMap,
    user: &auth::AuthUser,
    item_key: &str,
) -> AppResult<(projects::WorkItemDetail, projects::ProjectDetail)> {
    let pool = state.pool()?;
    ensure_api_permission(pool, headers, user.id, "work_item.view").await?;
    let item = projects::get_work_item_detail(pool, item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))?;
    let project = projects::get_project_detail(pool, &item.project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项所属项目不存在".to_string()))?;
    ensure_api_project_access(pool, headers, user.id, user.is_super_admin, project.id).await?;

    Ok((item, project))
}

pub(super) async fn require_api_comment_context(
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
    let comment = require_api_comment_for_user(state, &user, &item, comment_id).await?;

    Ok((user, item, project, comment))
}

pub(super) async fn require_api_comment_context_for_user(
    state: &AppState,
    headers: &HeaderMap,
    user: &auth::AuthUser,
    item_key: &str,
    comment_id: i64,
) -> AppResult<(
    projects::WorkItemDetail,
    projects::ProjectDetail,
    projects::WorkItemCommentSummary,
)> {
    let (item, project) =
        require_api_work_item_context_for_user(state, headers, user, item_key).await?;
    let comment = require_api_comment_for_user(state, user, &item, comment_id).await?;
    Ok((item, project, comment))
}

pub(super) async fn require_api_comment_for_user(
    state: &AppState,
    user: &auth::AuthUser,
    item: &projects::WorkItemDetail,
    comment_id: i64,
) -> AppResult<projects::WorkItemCommentSummary> {
    let pool = state.pool()?;
    let comment =
        projects::get_work_item_comment_including_drafts(pool, item.id, comment_id).await?;
    if comment.is_draft && comment.author_user_id != Some(user.id) {
        return Err(AppError::Forbidden("无权访问该草稿评论".to_string()));
    }

    Ok(comment)
}

pub(super) fn work_item_comment_matches_primary_post_summary(
    item: &projects::WorkItemDetail,
    comment: &projects::WorkItemCommentSummary,
) -> bool {
    if let Some(primary_post_comment_id) = item.primary_post_comment_id {
        return comment.id == primary_post_comment_id;
    }
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

pub(super) fn ensure_api_work_item_accepts_writes(
    item: &projects::WorkItemDetail,
) -> AppResult<()> {
    if item.deleted_at.trim().is_empty() {
        return Ok(());
    }

    Err(AppError::BadRequest(
        "历史工作项不能执行写入操作".to_string(),
    ))
}

pub(super) fn ensure_api_comment_accepts_attachments(
    comment: &projects::WorkItemCommentSummary,
) -> AppResult<()> {
    if !comment.is_flow {
        return Ok(());
    }

    Err(AppError::Forbidden("流程记录不能添加附件".to_string()))
}

pub(super) fn api_work_item_type(kind: Option<&str>) -> AppResult<Option<&'static str>> {
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

pub(super) fn work_item_payload(item: projects::WorkItemSummary) -> WorkItemPayload {
    WorkItemPayload {
        key: item.item_key,
        item_type: item.item_type,
        title: item.title,
        status: item.status,
        priority: item.priority,
        project_key: item.project_key,
        project_name: item.project_name,
        assignee: item.assignee_display_name,
        due_date: item.due_date,
        updated_at: item.updated_at,
    }
}

pub(super) fn work_item_list_filter_payload(
    item_type: &str,
    filter: projects::WorkItemListFilter,
) -> WorkItemListFilterPayload {
    WorkItemListFilterPayload {
        item_type: item_type.to_string(),
        q: filter.keyword,
        status: filter.status,
        priority: filter.priority,
        project_key: filter.project_key,
        assignee_username: filter.assignee_username,
        cycle_id: filter.cycle_id,
        sort: if filter.sort_by.trim().is_empty() {
            "updated_desc".to_string()
        } else {
            filter.sort_by
        },
    }
}

pub(super) fn work_item_saved_view_payload(
    view: projects::WorkItemSavedView,
) -> WorkItemSavedViewPayload {
    let item_type = view.item_type.clone();
    WorkItemSavedViewPayload {
        id: view.id,
        name: view.name,
        filters: work_item_list_filter_payload(&item_type, view.filter),
        per_page: view.per_page,
        is_default: view.is_default,
    }
}

pub(super) fn default_work_item_saved_view_per_page() -> i64 {
    10
}

pub(super) fn work_item_detail_payload(item: projects::WorkItemDetail) -> WorkItemDetailPayload {
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
        reporter_username: item.reporter_username,
        due_date: item.due_date,
        created_at: item.created_at,
        updated_at: item.updated_at,
        deleted_at: item.deleted_at,
    }
}

pub(super) fn work_item_detail_navigation(
    items: Vec<projects::WorkItemSummary>,
    current_item_key: &str,
) -> WorkItemDetailNavigationPayload {
    let Some(index) = items
        .iter()
        .position(|entry| entry.item_key == current_item_key)
    else {
        return WorkItemDetailNavigationPayload {
            previous: None,
            next: None,
        };
    };
    let link = |entry: &projects::WorkItemSummary| WorkItemDetailNavigationLinkPayload {
        item_key: entry.item_key.clone(),
        title: entry.title.clone(),
    };
    WorkItemDetailNavigationPayload {
        previous: index
            .checked_sub(1)
            .and_then(|value| items.get(value))
            .map(link),
        next: items.get(index + 1).map(link),
    }
}

pub(super) fn api_work_item_status_options(
    item_type: &str,
    current_status: &str,
) -> AppResult<Vec<WorkItemDetailViewOptionPayload>> {
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
        let relevant = match item_type {
            "bug" => matches!(
                *status,
                "open"
                    | "in_progress"
                    | "pending_confirmation"
                    | "resolved"
                    | "verified"
                    | "closed"
            ),
            "requirement" | "task" => matches!(
                *status,
                "open" | "in_progress" | "pending_confirmation" | "done" | "closed"
            ),
            _ => false,
        };
        if relevant && !values.contains(status) {
            values.push(status);
        }
    }
    if values.is_empty() {
        values.push(selected_status);
    }
    values
        .into_iter()
        .map(|status| {
            Ok(WorkItemDetailViewOptionPayload {
                value: status.to_string(),
                label: api_work_item_status_label(status)?.to_string(),
            })
        })
        .collect()
}

pub(super) fn api_work_item_status_label(status: &str) -> AppResult<&'static str> {
    match status {
        "open" => Ok("待处理"),
        "in_progress" => Ok("进行中"),
        "pending_confirmation" => Ok("待确认"),
        "done" => Ok("已完成"),
        "resolved" => Ok("已解决"),
        "verified" => Ok("已验证"),
        "closed" => Ok("已关闭"),
        "cancelled" => Ok("已取消"),
        _ => Err(AppError::BadRequest("工作项状态无效".to_string())),
    }
}

pub(super) fn work_item_flow_record_payload(
    record: projects::WorkItemOperationSummary,
) -> WorkItemFlowRecordPayload {
    let summary = if record.source_kind == "edit" {
        "作者编辑了主帖内容".to_string()
    } else {
        record
            .body
            .strip_prefix("[yuance-flow] ")
            .unwrap_or(&record.body)
            .to_string()
    };
    WorkItemFlowRecordPayload {
        source_kind: record.source_kind,
        actor: if record.actor_display_name.trim().is_empty() {
            "系统".to_string()
        } else {
            record.actor_display_name
        },
        created_at: record.created_at,
        summary,
    }
}

pub(super) fn comment_payload(comment: projects::WorkItemCommentSummary) -> CommentPayload {
    CommentPayload {
        id: comment.id,
        parent_comment_id: comment.parent_comment_id,
        parent_author: comment.parent_author_display_name,
        body: comment.body,
        body_format: comment.body_format,
        author: comment.author_display_name,
        author_username: comment.author_username,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        is_flow: comment.is_flow,
        is_draft: comment.is_draft,
    }
}

pub(super) fn work_item_typing_snapshot_payload(
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
