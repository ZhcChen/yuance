//! 项目接口：项目、成员、周期、时间排期与项目附件。

use super::*;

pub(super) fn deserialize_optional_cycle_id<'de, D>(
    deserializer: D,
) -> Result<Option<Option<i64>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    match Option::<Option<i64>>::deserialize(deserializer)? {
        Some(value) => Ok(Some(value)),
        None => Ok(Some(None)),
    }
}

pub async fn list_projects(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ProjectQuery>,
) -> AppResult<axum::Json<ApiEnvelope<PaginatedPayload<ProjectPayload>>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let can_access_all_projects = api_user_can_access_all_projects(pool, user).await?;
    let pagination = normalize_api_pagination(query.page, query.per_page)?;
    let filter = projects::ProjectListFilter {
        status: normalize_api_project_status(&query.status)?,
        keyword: query.q.trim().to_string(),
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
    let pending_by_project = projects::list_project_pending_counts_for_user(pool, user.id)
        .await?
        .into_iter()
        .map(|counts| (counts.project_id, counts))
        .collect::<HashMap<_, _>>();
    let items = page
        .items
        .into_iter()
        .map(|project| {
            let pending = pending_by_project
                .get(&project.id)
                .cloned()
                .unwrap_or_default();
            let mut payload = project_payload(project);
            payload.pending_requirements = pending.requirements;
            payload.pending_tasks = pending.tasks;
            payload.pending_bugs = pending.bugs;
            payload
        })
        .collect();

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
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let can_access_all_projects = api_user_can_access_all_projects(pool, user).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
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
    let can_access_all_projects = api_user_can_access_all_projects(pool, user).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
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
    let can_access_all_projects = api_user_can_access_all_projects(pool, user).await?;
    let project = project_detail_payload(pool, user.id, can_access_all_projects, project).await?;

    Ok((StatusCode::CREATED, json(project)))
}

pub async fn get_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<ProjectDetailPayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    let can_access_all_projects = api_user_can_access_all_projects(pool, user).await?;

    Ok(json(
        project_detail_payload(pool, user.id, can_access_all_projects, project).await?,
    ))
}

pub async fn update_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Json(payload): Json<UpdateProjectRequest>,
) -> AppResult<axum::Json<ApiEnvelope<ProjectDetailPayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_member_manage_access(pool, user, project.id).await?;
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

    let can_access_all_projects = api_user_can_access_all_projects(pool, user).await?;
    Ok(json(
        project_detail_payload(pool, user.id, can_access_all_projects, updated).await?,
    ))
}

pub async fn add_project_member(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Json(payload): Json<AddProjectMemberRequest>,
) -> AppResult<impl IntoResponse> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_member_manage_access(pool, user, project.id).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
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

pub async fn list_project_member_candidates(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<Vec<ProjectMemberCandidatePayload>>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_member_manage_access(pool, user, project.id).await?;

    let member_usernames = projects::list_project_members(pool, project.id)
        .await?
        .into_iter()
        .map(|member| member.username)
        .collect::<HashSet<_>>();
    let payload = users::list_users(pool)
        .await?
        .into_iter()
        .filter(|candidate| {
            candidate.status == "active" && !member_usernames.contains(&candidate.username)
        })
        .map(|candidate| ProjectMemberCandidatePayload {
            display_name: candidate.display_name,
            username: candidate.username,
            roles: candidate.role_names,
        })
        .collect();

    Ok(json(payload))
}

pub async fn add_project_members(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Json(payload): Json<AddProjectMembersRequest>,
) -> AppResult<impl IntoResponse> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_member_manage_access(pool, user, project.id).await?;
    let members = projects::add_project_members(
        pool,
        user.id,
        &project_key,
        &payload.usernames,
        &payload.member_role,
    )
    .await?;
    let usernames = members
        .iter()
        .map(|member| member.username.as_str())
        .collect::<Vec<_>>();
    audit::record(
        pool,
        Some(user.id),
        "project.member.add",
        "project",
        &project_key,
        &principal.audit_details_with(serde_json::json!({
            "usernames": usernames,
            "member_role": payload.member_role,
        })),
    )
    .await?;

    let payload: Vec<_> = members.into_iter().map(project_member_payload).collect();
    Ok((StatusCode::CREATED, json(payload)))
}

pub async fn update_project_member_role(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, username)): Path<(String, String)>,
    Json(payload): Json<UpdateProjectMemberRequest>,
) -> AppResult<axum::Json<ApiEnvelope<ProjectMemberPayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_member_manage_access(pool, user, project.id).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_member_manage_access(pool, user, project.id).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
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

pub async fn get_project_personal_analysis(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<ProjectPersonalAnalysisPayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    let analysis = projects::personal_project_analysis(pool, project.id, user.id).await?;
    Ok(json(project_personal_analysis_payload(user, analysis)))
}

pub async fn create_project_cycle(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Json(payload): Json<ProjectCycleRequest>,
) -> AppResult<impl IntoResponse> {
    let principal = require_api_principal(&state, &headers).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
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

pub async fn get_time_management_members(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<axum::Json<ApiEnvelope<Vec<TimeAllocationMemberPayload>>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "time.management.view").await?;
    let can_access_all_projects = api_user_can_access_all_time_management(pool, user).await?;
    let members = projects::list_time_management_members(
        pool,
        if can_access_all_projects { 0 } else { user.id },
    )
    .await?;

    Ok(json(
        members
            .into_iter()
            .map(|member| TimeAllocationMemberPayload {
                username: member.username,
                display_name: member.display_name,
            })
            .collect(),
    ))
}

pub async fn list_project_time_allocations(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
) -> AppResult<axum::Json<ApiEnvelope<Vec<TimeAllocationPayload>>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    Ok(json(
        projects::list_project_time_allocations(pool, &project_key)
            .await?
            .into_iter()
            .map(time_allocation_payload)
            .collect(),
    ))
}

pub async fn create_project_time_allocation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Json(payload): Json<CreateTimeAllocationRequest>,
) -> AppResult<impl IntoResponse> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_time_management_project_access(pool, &headers, user, project.id).await?;
    let allow_non_member_target =
        rbac::user_has_permission(pool, user.id, "time.management.edit").await?;
    let allocation = projects::create_project_time_allocation(
        pool,
        user.id,
        &project_key,
        time_allocation_create_input(payload),
        allow_non_member_target,
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "time.allocation.create",
        "time_allocation",
        &allocation.id.to_string(),
        &principal.audit_details_with(serde_json::json!({"project_key": project_key})),
    )
    .await?;
    Ok((
        StatusCode::CREATED,
        json(time_allocation_payload(allocation)),
    ))
}

pub async fn update_project_time_allocation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, allocation_id)): Path<(String, i64)>,
    Json(payload): Json<UpdateTimeAllocationRequest>,
) -> AppResult<axum::Json<ApiEnvelope<TimeAllocationPayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_time_management_project_access(pool, &headers, user, project.id).await?;
    let allow_non_member_target =
        rbac::user_has_permission(pool, user.id, "time.management.edit").await?;
    let allocation = projects::update_project_time_allocation(
        pool,
        user.id,
        &project_key,
        allocation_id,
        time_allocation_update_input(payload),
        allow_non_member_target,
    )
    .await?;
    audit::record(
        pool,
        Some(user.id),
        "time.allocation.update",
        "time_allocation",
        &allocation.id.to_string(),
        &principal.audit_details_with(serde_json::json!({"project_key": project_key})),
    )
    .await?;
    Ok(json(time_allocation_payload(allocation)))
}

pub async fn delete_project_time_allocation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, allocation_id)): Path<(String, i64)>,
) -> AppResult<StatusCode> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_time_management_project_access(pool, &headers, user, project.id).await?;
    projects::delete_project_time_allocation(pool, user.id, &project_key, allocation_id).await?;
    audit::record(
        pool,
        Some(user.id),
        "time.allocation.delete",
        "time_allocation",
        &allocation_id.to_string(),
        &principal.audit_details_with(serde_json::json!({"project_key": project_key})),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_time_allocation_changes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<TimeAllocationChangeListQuery>,
) -> AppResult<axum::Json<ApiEnvelope<PaginatedPayload<TimeAllocationChangePayload>>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "time.management.view").await?;
    let can_access_all_projects = api_user_can_access_all_time_management(pool, user).await?;
    let pagination = normalize_api_pagination(query.page, query.per_page)?;
    let page = projects::list_time_allocation_change_records_paginated(
        pool,
        projects::TimeAllocationChangeFilter {
            project_key: query.project_key,
            actor: query.actor,
            user_id: if can_access_all_projects { 0 } else { user.id },
        },
        pagination,
    )
    .await?;

    let total_pages = page.total_pages();
    Ok(json(PaginatedPayload {
        items: page
            .items
            .into_iter()
            .map(time_allocation_change_payload)
            .collect(),
        pagination: PaginationPayload {
            page: page.page,
            per_page: page.per_page,
            total_items: page.total_items,
            total_pages,
        },
    }))
}

pub async fn restore_time_allocation_change(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(path): Path<TimeAllocationChangePath>,
) -> AppResult<axum::Json<ApiEnvelope<Option<TimeAllocationPayload>>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "time.management.view").await?;
    let meta = projects::get_time_allocation_change_record_meta(pool, path.record_id)
        .await?
        .ok_or_else(|| AppError::NotFound("修改记录不存在".to_string()))?;
    ensure_api_time_management_write_access(pool, user, meta.project_id).await?;
    let restored = projects::restore_time_allocation_from_record(pool, user.id, &meta).await?;
    audit::record(
        pool,
        Some(user.id),
        "time.allocation.restore",
        "time_allocation",
        &meta.record_id.to_string(),
        &principal.audit_details_with(serde_json::json!({
            "project_key": meta.project_key,
            "source_activity_id": meta.record_id,
        })),
    )
    .await?;

    Ok(json(restored.map(time_allocation_payload)))
}

pub async fn create_project_attachment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Json(payload): Json<CreateAttachmentRequest>,
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
    ensure_api_project_content_write_access(pool, user, project.id).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, user, project.id).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "project", project.id).await?;
    let actual_checksum_sha256 = storage::verify_uploaded_object(
        pool,
        &state.settings,
        &attachment.object_key,
        attachment.byte_size,
        &attachment.content_type,
    )
    .await?;
    let attachment = files::mark_attachment_uploaded_with_checksum(
        pool,
        attachment_id,
        "project",
        project.id,
        &actual_checksum_sha256,
    )
    .await?;
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
    let principal = require_api_principal(&state, &headers).await?;
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
    let principal = require_api_principal(&state, &headers).await?;
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
    let navigation = attachment_preview_navigation(
        files::list_attachments(pool, "project", project.id).await?,
        attachment.id,
        legacy_preview_enabled,
        |sibling| {
            format!(
                "/api/v1/projects/{project_key}/attachments/{}/preview",
                sibling.id
            )
        },
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
    Query(query): Query<PreviewContentQuery>,
) -> AppResult<Response> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "project.view").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    let attachment =
        files::get_attachment_for_target(pool, attachment_id, "project", project.id).await?;
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
            target_type: "project",
            target_id: &project_key,
            detail: &format!(r#"{{"source":"api","attachment_id":{attachment_id}}}"#),
        },
    )
    .await
}

pub async fn project_attachment_delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, attachment_id)): Path<(String, i64)>,
) -> AppResult<axum::Json<ApiEnvelope<AttachmentPayload>>> {
    let principal = require_api_principal(&state, &headers).await?;
    let user = &principal.user;
    ensure_api_csrf(&headers)?;
    let pool = state.pool()?;
    ensure_api_permission(pool, &headers, user.id, "work_item.manage").await?;
    let project = projects::get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_api_project_access(pool, &headers, user.id, user.is_super_admin, project.id).await?;
    ensure_api_project_content_write_access(pool, user, project.id).await?;
    projects::ensure_project_accepts_writes(&project.status)?;
    let attachment = files::archive_attachment(
        pool,
        files::ArchiveAttachmentInput {
            attachment_id,
            target_type: "project",
            target_id: project.id,
            actor_user_id: user.id,
            actor_display_name_snapshot: &principal.actor_display_name_snapshot(),
            project_id: Some(project.id),
            activity_summary: Some("归档项目附件"),
        },
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

pub(super) async fn api_user_can_access_all_projects(
    pool: &sqlx::SqlitePool,
    user: &auth::AuthUser,
) -> AppResult<bool> {
    if user.is_super_admin {
        return Ok(true);
    }

    rbac::user_has_all_data_scope(pool, user.id).await
}

pub(super) async fn ensure_api_project_access(
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

pub(super) async fn ensure_api_token_project_scope(
    pool: &sqlx::SqlitePool,
    headers: &HeaderMap,
    user_id: i64,
    project_id: i64,
) -> AppResult<()> {
    let Some(raw_token) = api_tokens::bearer_token(headers) else {
        return Ok(());
    };
    if api_tokens::token_allows_project(pool, &raw_token, user_id, project_id).await? {
        return Ok(());
    }

    Err(AppError::Forbidden(
        "访问 Token 不允许访问该项目".to_string(),
    ))
}

pub(super) async fn api_token_project_scope_keys(
    pool: &sqlx::SqlitePool,
    headers: &HeaderMap,
    user_id: i64,
) -> AppResult<Option<Vec<String>>> {
    let Some(raw_token) = api_tokens::bearer_token(headers) else {
        return Ok(None);
    };
    api_tokens::token_project_scope_keys(pool, &raw_token, user_id).await
}

pub(super) fn project_key_in_token_scope(
    project_scope: &Option<Vec<String>>,
    project_key: &str,
) -> bool {
    match project_scope {
        None => true,
        Some(allowed_project_keys) => allowed_project_keys
            .iter()
            .any(|allowed_project_key| allowed_project_key.eq_ignore_ascii_case(project_key)),
    }
}

pub(super) async fn ensure_api_project_member_manage_access(
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

pub(super) async fn ensure_api_project_content_write_access(
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

pub(super) async fn ensure_api_time_management_project_access(
    pool: &sqlx::SqlitePool,
    headers: &HeaderMap,
    user: &auth::AuthUser,
    project_id: i64,
) -> AppResult<()> {
    if rbac::user_has_permission(pool, user.id, "time.management.edit").await? {
        ensure_api_token_project_scope(pool, headers, user.id, project_id).await?;
        return Ok(());
    }

    ensure_api_project_access(pool, headers, user.id, user.is_super_admin, project_id).await?;
    ensure_api_time_management_write_access(pool, user, project_id).await?;
    Ok(())
}

pub(super) async fn default_api_project_key(
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

pub(super) fn parse_api_optional_cycle_id(
    value: Option<serde_json::Value>,
) -> AppResult<Option<i64>> {
    parse_api_optional_cycle_id_with_fallback(value, None)
}

pub(super) fn parse_api_optional_cycle_id_with_fallback(
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

pub(super) fn normalize_api_project_status(status: &str) -> AppResult<String> {
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

pub(super) fn project_payload(project: projects::ProjectSummary) -> ProjectPayload {
    ProjectPayload {
        key: project.project_key,
        name: project.name,
        status: project.status,
        owner: project.owner_display_name,
        owner_username: project.owner_username,
        work_item_count: project.work_item_count,
        active_work_item_count: project.active_work_item_count,
        pending_requirements: 0,
        pending_tasks: 0,
        pending_bugs: 0,
        updated_at: project.updated_at,
    }
}

pub(super) async fn project_detail_payload(
    pool: &sqlx::SqlitePool,
    user_id: i64,
    can_access_all_projects: bool,
    project: projects::ProjectDetail,
) -> AppResult<ProjectDetailPayload> {
    let count = |item_type: &str| {
        projects::work_item_list_stats_filtered_for_user(
            pool,
            user_id,
            can_access_all_projects,
            projects::WorkItemListFilter {
                item_type: Some(item_type.to_string()),
                project_key: project.project_key.clone(),
                ..Default::default()
            },
        )
    };
    let (requirements, tasks, bugs) =
        tokio::try_join!(count("requirement"), count("task"), count("bug"))?;
    Ok(ProjectDetailPayload {
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
        requirements: requirements.total_items,
        tasks: tasks.total_items,
        bugs: bugs.total_items,
    })
}

pub(super) fn current_project_payload(project: projects::CurrentProject) -> CurrentProjectPayload {
    CurrentProjectPayload {
        key: project.project_key,
        name: project.name,
    }
}

pub(super) fn project_member_payload(
    member: projects::ProjectMemberDetail,
) -> ProjectMemberPayload {
    ProjectMemberPayload {
        user_id: member.user_id,
        display_name: member.display_name,
        username: member.username,
        member_role: member.member_role,
        joined_at: member.joined_at,
    }
}

pub(super) fn project_member_summary_payload(
    member: projects::ProjectMemberSummary,
) -> ProjectMemberPayload {
    ProjectMemberPayload {
        user_id: member.user_id,
        display_name: member.display_name,
        username: member.username,
        member_role: member.member_role,
        joined_at: member.joined_at,
    }
}

pub(super) fn project_cycle_payload(
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

pub(super) fn project_personal_analysis_payload(
    user: &auth::AuthUser,
    analysis: projects::PersonalProjectAnalysis,
) -> ProjectPersonalAnalysisPayload {
    ProjectPersonalAnalysisPayload {
        username: user.username.clone(),
        display_name: user.display_name.clone(),
        joined_at: analysis.joined_at,
        completed_total: analysis.completed_total,
        completed_requirements: analysis.completed_requirements,
        completed_tasks: analysis.completed_tasks,
        completed_bugs: analysis.completed_bugs,
        completed_last_30_days: analysis.completed_last_30_days,
        pending: ProjectPersonalAnalysisPendingPayload {
            requirements: analysis.pending.requirements,
            tasks: analysis.pending.tasks,
            bugs: analysis.pending.bugs,
        },
        daily_average: analysis.daily_average,
        daily_peak: analysis.daily_peak,
        daily_peak_date: analysis.daily_peak_date,
        monthly_average: analysis.monthly_average,
        monthly_peak: analysis.monthly_peak,
        monthly_peak_month: analysis.monthly_peak_month,
        active_days: analysis.active_days,
        comment_count: analysis.comment_count,
        handoff_count: analysis.handoff_count,
        recent_completions: analysis
            .recent_completions
            .into_iter()
            .map(|item| ProjectPersonalCompletionPayload {
                key: item.item_key,
                item_type: item.item_type,
                title: item.title,
                completed_at: item.completed_at,
            })
            .collect(),
    }
}

pub(super) fn cycle_create_input(
    payload: ProjectCycleRequest,
) -> projects::CreateProjectCycleInput {
    projects::CreateProjectCycleInput {
        name: payload.name,
        goal: payload.goal,
        description: payload.description,
        owner_username: payload.owner_username,
        start_date: payload.start_date,
        end_date: payload.end_date,
    }
}

pub(super) fn cycle_update_input(
    payload: ProjectCycleRequest,
) -> projects::UpdateProjectCycleInput {
    projects::UpdateProjectCycleInput {
        name: payload.name,
        goal: payload.goal,
        description: payload.description,
        owner_username: payload.owner_username,
        start_date: payload.start_date,
        end_date: payload.end_date,
    }
}

pub(super) fn time_allocation_payload(
    allocation: projects::TimeAllocationDetail,
) -> TimeAllocationPayload {
    TimeAllocationPayload {
        id: allocation.id,
        project_key: allocation.project_key,
        project_name: allocation.project_name,
        username: allocation.username,
        display_name: allocation.display_name,
        start_date: allocation.start_date,
        end_date: allocation.end_date,
        daily_hours: allocation.daily_hours,
        phase_task_name: allocation.phase_task_name,
        note: allocation.note,
        created_at: allocation.created_at,
        updated_at: allocation.updated_at,
    }
}

pub(super) fn time_allocation_change_payload(
    record: projects::TimeAllocationChangeRecord,
) -> TimeAllocationChangePayload {
    TimeAllocationChangePayload {
        id: record.id,
        allocation_id: record.allocation_id,
        project_key: record.project_key,
        project_name: record.project_name,
        action: record.action,
        actor_username: record.actor_username,
        actor_display_name: record.actor_display_name,
        summary: record.summary,
        changes: record
            .changes
            .into_iter()
            .map(|change| TimeAllocationFieldChangePayload {
                field: change.field,
                before: change.before,
                after: change.after,
            })
            .collect(),
        before: record.before,
        after: record.after,
        created_at: record.created_at,
    }
}

pub(super) fn time_allocation_create_input(
    payload: CreateTimeAllocationRequest,
) -> projects::CreateTimeAllocationInput {
    projects::CreateTimeAllocationInput {
        username: payload.username,
        start_date: payload.start_date,
        end_date: payload.end_date,
        daily_hours: payload.daily_hours,
        phase_task_name: payload.phase_task_name,
        note: payload.note,
    }
}

pub(super) fn time_allocation_update_input(
    payload: UpdateTimeAllocationRequest,
) -> projects::UpdateTimeAllocationInput {
    projects::UpdateTimeAllocationInput {
        username: payload.username,
        start_date: payload.start_date,
        end_date: payload.end_date,
        daily_hours: payload.daily_hours,
        phase_task_name: payload.phase_task_name,
        note: payload.note,
    }
}
