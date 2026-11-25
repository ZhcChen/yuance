//! 账号接口：登录、会话、个人资料、访问令牌、通知、搜索与工作台。

use super::*;

pub(super) fn default_notification_limit() -> i64 {
    5
}

pub(super) fn notification_filter_from_query(
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

pub async fn list_notifications(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<NotificationQuery>,
) -> AppResult<impl IntoResponse> {
    let principal = require_api_principal(&state, &headers).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    let can_access_all_projects = api_user_can_access_all_projects(pool, user).await?;
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
    let project_options = if can_view_projects || can_view_work_items {
        projects::list_project_summaries_for_user(pool, user.id, can_access_all_projects)
            .await?
            .into_iter()
            .filter(|project| {
                project_key_in_token_scope(&token_project_scope, &project.project_key)
            })
            .map(|project| {
                let pending_count = project_badges
                    .iter()
                    .find(|badge| badge.project_key.eq_ignore_ascii_case(&project.project_key))
                    .map(|badge| badge.pending_count)
                    .unwrap_or_default();
                TopbarProjectOptionPayload {
                    key: project.project_key,
                    name: project.name,
                    pending_count,
                }
            })
            .collect()
    } else {
        Vec::new()
    };
    let system_links = topbar_system_links(pool, &headers, user.id).await?;

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
        project_options,
        system_links,
        current_project,
    }))
}

pub async fn topbar_events(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<impl IntoResponse> {
    let principal = require_api_principal(&state, &headers).await?;
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
            // 停机时结束流，避免优雅停机一直等待长连接。
            let next = tokio::select! {
                biased;
                _ = realtime::wait_for_shutdown() => None,
                message = receiver.recv() => Some(message),
            };
            let Some(next) = next else { break };
            match next {
                Ok(message) => {
                    if message.kind == "topbar" && message.user_ids.contains(&user_id) {
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

pub(super) fn principal_realtime_display_name(principal: &ApiPrincipal) -> String {
    let token_actor = principal.actor_display_name_snapshot();
    if !token_actor.trim().is_empty() {
        return token_actor;
    }
    if !principal.user.display_name.trim().is_empty() {
        return principal.user.display_name.trim().to_string();
    }
    principal.user.username.trim().to_string()
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
    let login_result = match auth_limits::ensure_login_allowed(&state, &headers, &payload.username)
    {
        Ok(()) => {
            auth::login_with_ttls(
                pool,
                &payload.username,
                &payload.password,
                ttl_seconds,
                refresh_ttl_seconds,
            )
            .await
        }
        Err(error) => Err(error),
    };
    auth_limits::record_login_result(&state, &headers, &payload.username, &login_result);
    let session = match login_result {
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

pub async fn get_own_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<axum::Json<ApiEnvelope<OwnProfilePayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
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

pub async fn search(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<SearchQuery>,
) -> AppResult<axum::Json<ApiEnvelope<PaginatedPayload<SearchResultPayload>>>> {
    let principal = require_api_principal(&state, &headers).await?;
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

pub async fn get_time_management_overview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<TimeAllocationListQuery>,
) -> AppResult<axum::Json<ApiEnvelope<Vec<TimeAllocationPayload>>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "time.management.view").await?;
    let can_access_all_projects = api_user_can_access_all_time_management(pool, user).await?;
    let filter = projects::TimeAllocationListFilter {
        project_key: query.project_key,
        username: query.username,
        start_date: query.start,
        end_date: query.end,
        user_id: if can_access_all_projects { 0 } else { user.id },
    };
    Ok(json(
        projects::list_time_allocations(pool, filter)
            .await?
            .into_iter()
            .map(time_allocation_payload)
            .collect(),
    ))
}

pub async fn get_dashboard(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<impl IntoResponse> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    let can_access_all_projects = api_user_can_access_all_projects(pool, user).await?;
    let can_view_projects = rbac::user_has_permission(pool, user.id, "project.view").await?;
    let can_view_work_items = rbac::user_has_permission(pool, user.id, "work_item.view").await?;
    let summaries = if can_view_projects {
        ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_PROJECT_READ).await?;
        projects::list_project_summaries_for_user(pool, user.id, can_access_all_projects).await?
    } else {
        Vec::new()
    };
    let pending_by_project = if can_view_work_items {
        ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_WORK_ITEM_READ).await?;
        projects::list_project_pending_counts_for_user(pool, user.id)
            .await?
            .into_iter()
            .map(|counts| (counts.project_id, counts))
            .collect::<HashMap<_, _>>()
    } else {
        HashMap::new()
    };
    let assigned = if can_view_work_items {
        projects::count_pending_assigned_work_items(pool, user.id, can_access_all_projects, None)
            .await?
    } else {
        projects::WorkItemAssignmentCounts::default()
    };
    let assigned_items = if can_view_work_items {
        projects::list_assigned_work_item_summaries(pool, user.id, None).await?
    } else {
        Vec::new()
    };
    let high_priority = assigned_items
        .iter()
        .filter(|item| {
            matches!(item.priority.as_str(), "P0" | "P1")
                && !matches!(
                    item.status.as_str(),
                    "done" | "closed" | "resolved" | "verified" | "cancelled"
                )
        })
        .count();
    let active_projects = summaries
        .iter()
        .filter(|project| {
            matches!(
                project.status.as_str(),
                "not_started" | "in_progress" | "acceptance"
            )
        })
        .count();
    let projects = summaries
        .into_iter()
        .map(|project| {
            let pending = pending_by_project
                .get(&project.id)
                .cloned()
                .unwrap_or_default();
            DashboardProjectPayload {
                key: project.project_key,
                name: project.name,
                owner: fallback_text(project.owner_display_name, "未分配"),
                owner_username: project.owner_username.clone(),
                status: project.status,
                work_item_count: project.work_item_count,
                active_work_item_count: project.active_work_item_count,
                pending_requirements: pending.requirements,
                pending_tasks: pending.tasks,
                pending_bugs: pending.bugs,
                updated_at: project.updated_at,
            }
        })
        .collect();
    ensure_api_token_scope(pool, &headers, user.id, api_tokens::SCOPE_NOTIFICATION_READ).await?;
    let pending_discussion_count = notifications::count_for_user_filtered(
        pool,
        user.id,
        notifications::NotificationFilter::PendingDiscussion,
    )
    .await?;
    let pending_discussions = notifications::list_for_user_page_filtered(
        pool,
        user.id,
        notifications::NotificationFilter::PendingDiscussion,
        1,
        5,
    )
    .await?
    .into_iter()
    .map(notification_payload)
    .collect();
    let activities = if can_view_projects {
        projects::list_recent_activities_for_user(pool, user.id, can_access_all_projects, 5)
            .await?
            .into_iter()
            .map(|activity| DashboardActivityPayload {
                id: activity.id,
                project_key: activity.project_key,
                summary: activity.summary,
                actor: fallback_text(activity.actor_display_name, "系统"),
                created_at: activity.created_at,
            })
            .collect()
    } else {
        Vec::new()
    };
    let assigned_items: Vec<WorkItemPayload> = assigned_items
        .into_iter()
        .filter(|item| {
            !matches!(
                item.status.as_str(),
                "done" | "closed" | "resolved" | "verified" | "cancelled"
            )
        })
        .take(DASHBOARD_ASSIGNED_ITEM_LIMIT)
        .map(work_item_payload)
        .collect();
    Ok(no_store_json(DashboardPayload {
        metrics: DashboardMetricsPayload {
            active_projects,
            requirements: assigned.requirements,
            tasks: assigned.tasks,
            bugs: assigned.bugs,
            assigned_total: assigned_items.len(),
            high_priority,
        },
        projects,
        pending_discussions,
        pending_discussion_count,
        activities,
        assigned_items,
        can_manage_projects: rbac::user_has_permission(pool, user.id, "project.manage").await?,
    }))
}

pub async fn list_api_tokens(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<axum::Json<ApiEnvelope<Vec<ApiTokenPayload>>>> {
    let principal = require_api_principal(&state, &headers).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
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

pub(super) fn ensure_api_csrf(headers: &HeaderMap) -> AppResult<()> {
    if api_tokens::bearer_token(headers).is_some() {
        return Ok(());
    }
    csrf::verify(headers, "")
}

pub(super) fn single_bearer_token(headers: &HeaderMap) -> AppResult<Option<String>> {
    if headers.get_all(header::AUTHORIZATION).iter().count() > 1 {
        return Err(AppError::Forbidden(
            "请求只能携带一个 Authorization 凭证".to_string(),
        ));
    }
    Ok(api_tokens::bearer_token(headers))
}

pub(super) fn api_token_actor_display_name(user: &auth::AuthUser, token_name: &str) -> String {
    let owner = if user.display_name.trim().is_empty() {
        user.username.trim()
    } else {
        user.display_name.trim()
    };
    format!("{}（{}）", token_name.trim(), owner)
}

pub(super) async fn api_user_can_access_all_time_management(
    pool: &sqlx::SqlitePool,
    user: &auth::AuthUser,
) -> AppResult<bool> {
    if user.is_super_admin {
        return Ok(true);
    }
    if rbac::user_has_all_data_scope(pool, user.id).await? {
        return Ok(true);
    }

    rbac::user_has_permission(pool, user.id, "time.management.view").await
}

pub(super) fn search_result_payload(hit: projects::SearchHit) -> SearchResultPayload {
    SearchResultPayload {
        kind: hit.hit_type,
        key: hit.key,
        title: hit.title,
        context: hit.context,
        target: hit.url,
        updated_at: hit.updated_at,
    }
}

pub(super) async fn ensure_api_time_management_write_access(
    pool: &sqlx::SqlitePool,
    user: &auth::AuthUser,
    project_id: i64,
) -> AppResult<()> {
    if rbac::user_has_permission(pool, user.id, "time.management.edit").await?
        || projects::user_can_manage_project_time(pool, project_id, user.id, user.is_super_admin)
            .await?
    {
        return Ok(());
    }

    Err(AppError::Forbidden("缺少时间排期管理权限".to_string()))
}

pub(super) async fn ensure_api_token_scope(
    pool: &sqlx::SqlitePool,
    headers: &HeaderMap,
    user_id: i64,
    required_scope: &str,
) -> AppResult<()> {
    let Some(raw_token) = api_tokens::bearer_token(headers) else {
        return Ok(());
    };
    if api_tokens::token_has_scope_for_user(pool, &raw_token, user_id, required_scope).await? {
        return Ok(());
    }

    Err(AppError::Forbidden(format!(
        "访问 Token 缺少 scope：{required_scope}"
    )))
}

pub(super) async fn api_token_allows_scope(
    pool: &sqlx::SqlitePool,
    headers: &HeaderMap,
    user_id: i64,
    required_scope: &str,
) -> AppResult<bool> {
    let Some(raw_token) = api_tokens::bearer_token(headers) else {
        return Ok(true);
    };
    api_tokens::token_has_scope_for_user(pool, &raw_token, user_id, required_scope).await
}

pub(super) fn auth_user_payload(user: auth::AuthUser) -> AuthUserPayload {
    AuthUserPayload {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        is_super_admin: user.is_super_admin,
    }
}

pub(super) fn own_profile_payload(profile: users::UserSummary) -> OwnProfilePayload {
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

pub(super) fn api_token_payload(token: api_tokens::ApiTokenSummary) -> ApiTokenPayload {
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

pub(super) fn notification_payload(
    notification: notifications::NotificationSummary,
) -> NotificationPayload {
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

pub(super) fn notification_target_result_payload(
    notification: notifications::NotificationSummary,
) -> NotificationTargetResultPayload {
    NotificationTargetResultPayload {
        notification_id: notification.id,
        read: !notification.read_at.is_empty(),
        target: Some(notification_target_payload(&notification)),
    }
}

pub(super) fn notification_target_payload(
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
