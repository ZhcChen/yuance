//! 系统管理接口：用户、角色、权限、存储、OpenAPI、审计与数据库统计。

use super::*;

pub(super) async fn topbar_system_links(
    pool: &sqlx::SqlitePool,
    headers: &HeaderMap,
    user_id: i64,
) -> AppResult<Vec<SystemDashboardLinkPayload>> {
    if let Some(raw_token) = api_tokens::bearer_token(headers)
        && !api_tokens::token_has_scope_for_user(pool, &raw_token, user_id, "system:admin").await?
    {
        return Ok(Vec::new());
    }
    if !rbac::user_has_permission(pool, user_id, "system.dashboard.view").await? {
        return Ok(Vec::new());
    }
    let mut links = vec![SystemDashboardLinkPayload {
        id: "dashboard",
        title: "总览",
        description: "系统管理总览。",
        path: "/web/system",
    }];
    let candidates = [
        (
            "users",
            "用户管理",
            "账号、状态、角色绑定、重置密码。",
            "/web/system/users",
            "system.users.view",
        ),
        (
            "roles",
            "角色权限",
            "系统角色、权限点、角色授权。",
            "/web/system/roles",
            "system.roles.view",
        ),
        (
            "storage",
            "对象存储",
            "对象存储配置、探测、初始化和版本回滚。",
            "/web/system/storage",
            "system.storage.view",
        ),
        (
            "openapi",
            "系统 OpenAPI",
            "系统接口文档与 system token 管理。",
            "/web/system/openapi",
            "system.api_tokens.view",
        ),
        (
            "database-stats",
            "数据库统计",
            "按需查看表设计、表备注和数据量。",
            "/web/system/database-stats",
            "system.database_stats.view",
        ),
        (
            "audit",
            "审计日志",
            "登录、授权、配置变更和高风险操作。",
            "/web/system/audit",
            "system.audit.view",
        ),
    ];
    for (id, title, description, path, permission) in candidates {
        if rbac::user_has_permission(pool, user_id, permission).await? {
            links.push(SystemDashboardLinkPayload {
                id,
                title,
                description,
                path,
            });
        }
    }
    Ok(links)
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

pub async fn get_system_users_view(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<SystemUsersViewQuery>,
) -> AppResult<axum::Json<ApiEnvelope<SystemUsersViewPayload>>> {
    let actor = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, actor.id, "system.users.view").await?;
    let pagination = normalize_api_pagination(query.page, Some(query.per_page.unwrap_or(10)))?;
    let total_items = users::count_users(pool).await?;
    let total_pages = ((total_items + pagination.per_page - 1) / pagination.per_page).max(1);
    let page = pagination.page.min(total_pages);
    let summaries = users::list_users_page(pool, page, pagination.per_page).await?;
    let can_manage_users = rbac::user_has_permission(pool, actor.id, "system.users.manage").await?;
    let can_access_all_projects = api_user_can_access_all_projects(pool, &actor).await?;
    let can_manage_user_projects = can_manage_users
        && can_access_all_projects
        && rbac::user_has_permission(pool, actor.id, "project.manage").await?;

    let mut items = Vec::with_capacity(summaries.len());
    for summary in summaries {
        items.push(system_user_view_payload(pool, summary).await?);
    }

    let roles = rbac::list_roles(pool)
        .await?
        .into_iter()
        .map(system_role_payload)
        .collect();
    let project_options = if can_manage_user_projects {
        projects::list_project_summaries(pool)
            .await?
            .into_iter()
            .filter(|project| projects::ensure_project_accepts_writes(&project.status).is_ok())
            .map(|project| SystemProjectAssignmentOptionPayload {
                key: project.project_key,
                name: project.name,
                owner: project.owner_display_name,
                status: project.status,
            })
            .collect()
    } else {
        Vec::new()
    };

    Ok(json(SystemUsersViewPayload {
        items,
        roles,
        project_options,
        pagination: PaginationPayload {
            page,
            per_page: pagination.per_page,
            total_items,
            total_pages,
        },
        can_manage_users,
        can_manage_user_projects,
    }))
}

pub async fn get_system_dashboard(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<axum::Json<ApiEnvelope<SystemDashboardPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.dashboard.view").await?;
    let mut links = topbar_system_links(pool, &headers, user.id).await?;
    links.retain(|link| link.id != "dashboard");

    Ok(json(SystemDashboardPayload { links }))
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

pub async fn assign_system_user_projects(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(username): Path<String>,
    Json(payload): Json<AssignSystemUserProjectsRequest>,
) -> AppResult<axum::Json<ApiEnvelope<SystemUserViewPayload>>> {
    let actor = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_system_user_project_management(pool, &headers, &actor).await?;
    let target = require_manageable_system_user(pool, &username).await?;
    let project_keys = normalize_unique_non_empty_strings(&payload.project_keys);
    if project_keys.is_empty() {
        return Err(AppError::BadRequest(
            "请至少选择一个要分配的项目".to_string(),
        ));
    }

    // 先校验角色：即使全部项目都会被跳过，也不接受非法角色。
    projects::validate_assignable_member_role(&payload.member_role)?;
    // 已是成员的项目直接跳过（不改角色、不算失败），保证重复提交与部分失败后的重试幂等。
    let mut assigned_project_keys = Vec::new();
    for project_key in project_keys {
        if projects::is_project_member_by_key(pool, &project_key, target.id).await? {
            continue;
        }
        projects::add_project_member(
            pool,
            actor.id,
            &project_key,
            &target.username,
            &payload.member_role,
        )
        .await?;
        assigned_project_keys.push(project_key);
    }
    if !assigned_project_keys.is_empty() {
        audit::record(
            pool,
            Some(actor.id),
            "user.project.assign",
            "user",
            &target.username,
            &serde_json::json!({
                "source": "api",
                "project_keys": assigned_project_keys,
                "member_role": payload.member_role,
            })
            .to_string(),
        )
        .await?;
    }

    Ok(json(system_user_view_payload(pool, target).await?))
}

pub async fn remove_system_user_projects(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(username): Path<String>,
    Json(payload): Json<RemoveSystemUserProjectsRequest>,
) -> AppResult<axum::Json<ApiEnvelope<SystemUserViewPayload>>> {
    let actor = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_system_user_project_management(pool, &headers, &actor).await?;
    let target = require_manageable_system_user(pool, &username).await?;
    let project_keys = normalize_unique_non_empty_strings(&payload.project_keys);
    if project_keys.is_empty() {
        return Err(AppError::BadRequest(
            "请至少选择一个要移除的项目".to_string(),
        ));
    }
    ensure_system_user_projects_removable(pool, target.id, &project_keys).await?;

    for project_key in &project_keys {
        projects::remove_project_member(pool, actor.id, project_key, &target.username).await?;
    }
    audit::record(
        pool,
        Some(actor.id),
        "user.project.remove.batch",
        "user",
        &target.username,
        &serde_json::json!({ "source": "api", "project_keys": project_keys }).to_string(),
    )
    .await?;

    Ok(json(system_user_view_payload(pool, target).await?))
}

pub async fn remove_system_user_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((username, project_key)): Path<(String, String)>,
) -> AppResult<axum::Json<ApiEnvelope<SystemUserViewPayload>>> {
    let actor = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_system_user_project_management(pool, &headers, &actor).await?;
    let target = require_manageable_system_user(pool, &username).await?;
    ensure_system_user_projects_removable(pool, target.id, std::slice::from_ref(&project_key))
        .await?;
    projects::remove_project_member(pool, actor.id, &project_key, &target.username).await?;
    audit::record(
        pool,
        Some(actor.id),
        "user.project.remove",
        "user",
        &target.username,
        &serde_json::json!({ "source": "api", "project_key": project_key }).to_string(),
    )
    .await?;

    Ok(json(system_user_view_payload(pool, target).await?))
}

pub async fn update_system_user_project_role(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((username, project_key)): Path<(String, String)>,
    Json(payload): Json<SetSystemUserProjectRoleRequest>,
) -> AppResult<axum::Json<ApiEnvelope<SystemUserViewPayload>>> {
    let actor = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_system_user_project_management(pool, &headers, &actor).await?;
    let target = require_manageable_system_user(pool, &username).await?;
    projects::update_project_member_role(
        pool,
        actor.id,
        &project_key,
        &target.username,
        &payload.member_role,
    )
    .await?;
    audit::record(
        pool,
        Some(actor.id),
        "user.project.role.update",
        "user",
        &target.username,
        &serde_json::json!({
            "source": "api",
            "project_key": project_key,
            "member_role": payload.member_role,
        })
        .to_string(),
    )
    .await?;

    Ok(json(system_user_view_payload(pool, target).await?))
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

pub async fn get_system_roles_view(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<SystemRolesViewQuery>,
) -> AppResult<axum::Json<ApiEnvelope<SystemRolesViewPayload>>> {
    let actor = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, actor.id, "system.roles.view").await?;
    let pagination = normalize_api_pagination(query.page, Some(query.per_page.unwrap_or(10)))?;
    let total_items = rbac::count_roles(pool).await?;
    let total_pages = ((total_items + pagination.per_page - 1) / pagination.per_page).max(1);
    let page = pagination.page.min(total_pages);
    let roles = rbac::list_roles_page(pool, page, pagination.per_page).await?;
    let requested_role = query.role.as_deref().map(str::trim).unwrap_or_default();
    let selected_role = if requested_role.is_empty() {
        roles.first().cloned()
    } else if let Some(role) = roles
        .iter()
        .find(|role| role.role_code == requested_role)
        .cloned()
    {
        Some(role)
    } else {
        match rbac::find_role(pool, requested_role).await {
            Ok(Some(role)) => Some(role),
            Ok(None) | Err(AppError::BadRequest(_)) => roles.first().cloned(),
            Err(error) => return Err(error),
        }
    };
    let permissions = match selected_role.as_ref() {
        Some(role) => rbac::list_permissions_for_role(pool, Some(&role.role_code))
            .await?
            .into_iter()
            .map(system_permission_payload)
            .collect(),
        None => Vec::new(),
    };
    let can_manage_roles = rbac::user_has_permission(pool, actor.id, "system.roles.manage").await?;
    let can_edit_permissions =
        can_manage_roles && selected_role.as_ref().is_some_and(|role| !role.is_system);

    Ok(json(SystemRolesViewPayload {
        items: roles.into_iter().map(system_role_payload).collect(),
        selected_role: selected_role.map(system_role_payload),
        permissions,
        pagination: PaginationPayload {
            page,
            per_page: pagination.per_page,
            total_items,
            total_pages,
        },
        can_manage_roles,
        can_edit_permissions,
    }))
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

pub async fn get_system_openapi_view(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<impl IntoResponse> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.api_tokens.view").await?;
    let items = system_api_tokens::list_tokens(pool)
        .await?
        .into_iter()
        .map(system_api_token_payload)
        .collect::<Vec<_>>();
    let can_manage_tokens =
        rbac::user_has_permission(pool, user.id, "system.api_tokens.manage").await?;

    Ok(no_store_json(SystemOpenApiViewPayload {
        active_count: items.len() as i64,
        token_limit: system_api_tokens::MAX_ACTIVE_SYSTEM_TOKENS,
        items,
        can_manage_tokens,
    }))
}

pub async fn get_system_api_docs(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<axum::Json<ApiEnvelope<SystemApiDocsPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.api_tokens.view").await?;

    Ok(json(SystemApiDocsPayload {
        source: include_str!("../../../../docs/openapi/yuance-system.openapi.json").to_string(),
    }))
}

pub async fn create_system_api_token(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateSystemApiTokenRequest>,
) -> AppResult<Response> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.api_tokens.manage").await?;
    let created = system_api_tokens::create_token(
        pool,
        &state.settings.security_master_key,
        user.id,
        system_api_tokens::CreateSystemApiTokenInput {
            name: payload.name,
            scopes: payload.scopes,
        },
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "system.api_token.create",
        "system_api_token",
        &created.token.id.to_string(),
        r#"{"source":"api"}"#,
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        AppendHeaders([(header::CACHE_CONTROL, "private, no-store")]),
        json(CreatedSystemApiTokenPayload {
            token: system_api_token_payload(created.token),
            raw_token: created.raw_token,
        }),
    )
        .into_response())
}

pub async fn update_system_api_token(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(token_id): Path<i64>,
    Json(payload): Json<UpdateSystemApiTokenRequest>,
) -> AppResult<impl IntoResponse> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.api_tokens.manage").await?;
    let updated = system_api_tokens::update_token(
        pool,
        user.id,
        token_id,
        system_api_tokens::UpdateSystemApiTokenInput {
            name: payload.name,
            scopes: payload.scopes,
        },
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "system.api_token.update",
        "system_api_token",
        &updated.id.to_string(),
        r#"{"source":"api"}"#,
    )
    .await?;
    Ok(no_store_json(system_api_token_payload(updated)))
}

pub async fn delete_system_api_token(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(token_id): Path<i64>,
) -> AppResult<impl IntoResponse> {
    let user = require_api_user(&state, &headers).await?;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.api_tokens.manage").await?;
    let deleted = system_api_tokens::delete_token(pool, token_id).await?;
    audit::record(
        pool,
        Some(user.id),
        "system.api_token.delete",
        "system_api_token",
        &deleted.id.to_string(),
        r#"{"source":"api"}"#,
    )
    .await?;
    Ok(no_store_json(system_api_token_payload(deleted)))
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

pub async fn get_system_storage_view(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<SystemStorageViewQuery>,
) -> AppResult<axum::Json<ApiEnvelope<SystemStorageViewPayload>>> {
    let user = require_api_user(&state, &headers).await?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "system.storage.view").await?;
    let pagination = normalize_api_pagination(query.page, Some(query.per_page.unwrap_or(10)))?;
    let total_items = storage::count_config_versions(pool).await?;
    let total_pages = ((total_items + pagination.per_page - 1) / pagination.per_page).max(1);
    let page = pagination.page.min(total_pages);
    let config = storage::latest_config(pool).await?;
    let versions = storage::list_config_versions_page(pool, page, pagination.per_page)
        .await?
        .into_iter()
        .map(storage_config_version_payload)
        .collect();
    let (inspection, inspection_error) = if config.is_some() {
        match storage::inspect_active_initialization(pool, &state.settings).await {
            Ok(value) => (Some(value), String::new()),
            Err(_) => (
                None,
                "对象存储检查失败，请确认已激活配置并稍后重试。".to_string(),
            ),
        }
    } else {
        (None, "对象存储尚未配置，请先保存并激活配置。".to_string())
    };
    let can_manage_storage =
        rbac::user_has_permission(pool, user.id, "system.storage.manage").await?;

    Ok(json(SystemStorageViewPayload {
        config: config.map(storage_config_payload),
        versions,
        pagination: PaginationPayload {
            page,
            per_page: pagination.per_page,
            total_items,
            total_pages,
        },
        inspection,
        inspection_error,
        can_manage_storage,
    }))
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
