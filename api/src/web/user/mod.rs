use askama::Template;
use axum::{
    Form,
    extract::{Path, Query, RawForm, State},
    http::{HeaderMap, StatusCode, header},
    response::{Html, IntoResponse, Redirect, Response},
};
use serde::Deserialize;
use sqlx::SqlitePool;

use crate::{
    domains::{
        audit, auth,
        bootstrap::{self, BootstrapInitInput},
        projects, rbac, storage, users,
    },
    platform::error::{AppError, AppResult},
    platform::security::csrf,
    web::{response, router::AppState},
};

#[derive(Debug, Clone)]
struct Metric {
    label: &'static str,
    value: String,
    hint: String,
    tone: &'static str,
}

#[derive(Debug, Clone)]
struct ProjectRow {
    code: String,
    name: String,
    owner: String,
    open_work_items: i64,
    total_work_items: i64,
    status: String,
    status_tone: &'static str,
    updated_at: String,
}

#[derive(Debug, Clone)]
struct ProjectListSummary {
    total_projects: usize,
    active_projects: usize,
    open_work_items: i64,
}

#[derive(Debug, Clone)]
struct ProjectOption {
    key: String,
    name: String,
}

#[derive(Debug, Clone)]
struct ProjectDetailView {
    code: String,
    name: String,
    description: String,
    owner: String,
    status: String,
    status_tone: &'static str,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone)]
struct ProjectMemberView {
    display_name: String,
    username: String,
    role: String,
    joined_at: String,
}

#[derive(Debug, Clone)]
struct ProjectDetailSummary {
    requirements: usize,
    tasks: usize,
    bugs: usize,
    open_items: usize,
    members: usize,
}

#[derive(Debug, Clone)]
struct WorkItem {
    key: String,
    kind: String,
    title: String,
    project: String,
    assignee: String,
    priority: String,
    status: String,
    status_tone: &'static str,
}

#[derive(Debug, Clone)]
struct WorkItemDetailView {
    key: String,
    kind: String,
    title: String,
    description: String,
    project_key: String,
    project_name: String,
    assignee: String,
    reporter: String,
    priority: String,
    status: String,
    status_tone: &'static str,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone)]
struct WorkItemComment {
    body: String,
    author: String,
    created_at: String,
}

#[derive(Debug, Clone)]
struct WorkItemListSummary {
    total_items: usize,
    open_items: usize,
    high_priority_items: usize,
}

#[derive(Debug, Clone)]
struct Activity {
    title: String,
    meta: String,
}

#[derive(Debug, Clone)]
struct SystemNav {
    visible: bool,
    dashboard: bool,
    users: bool,
    roles: bool,
    storage: bool,
    audit: bool,
}

impl SystemNav {
    fn all() -> Self {
        Self {
            visible: true,
            dashboard: true,
            users: true,
            roles: true,
            storage: true,
            audit: true,
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
struct PermissionRow {
    key: String,
    name: String,
    resource: String,
    resource_type: String,
    granted: bool,
}

#[derive(Debug, Clone)]
struct AuditLogRow {
    actor: String,
    action: String,
    target: String,
    metadata: String,
    created_at: String,
}

#[derive(Debug, Clone)]
struct UserProfileView {
    username: String,
    display_name: String,
    contact: String,
    roles: String,
    status: String,
    status_tone: &'static str,
    created_at: String,
    updated_at: String,
    is_super_admin: bool,
}

#[derive(Debug, Clone)]
struct MySummary {
    project_count: usize,
    assigned_count: usize,
    open_count: usize,
    high_priority_count: usize,
}

#[derive(Debug, Clone)]
struct SearchResult {
    kind: String,
    key: String,
    title: String,
    context: String,
    url: String,
    updated_at: String,
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

#[derive(Template)]
#[template(path = "web/system/audit.html")]
struct SystemAuditTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    logs: Vec<AuditLogRow>,
    has_logs: bool,
}

#[derive(Template)]
#[template(path = "web/dashboard.html")]
struct DashboardTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    metrics: Vec<Metric>,
    projects: Vec<ProjectRow>,
    activities: Vec<Activity>,
}

#[derive(Template)]
#[template(path = "web/me.html")]
struct MeTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    profile: UserProfileView,
    summary: MySummary,
    projects: Vec<ProjectRow>,
    assigned_items: Vec<WorkItem>,
    has_projects: bool,
    has_assigned_items: bool,
}

#[derive(Template)]
#[template(path = "web/search.html")]
struct SearchTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    query: String,
    has_query: bool,
    results: Vec<SearchResult>,
    has_results: bool,
}

#[derive(Template)]
#[template(path = "web/projects.html")]
struct ProjectsTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    projects: Vec<ProjectRow>,
    summary: ProjectListSummary,
    has_projects: bool,
}

#[derive(Template)]
#[template(path = "web/projects/detail.html")]
struct ProjectDetailTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    project: ProjectDetailView,
    summary: ProjectDetailSummary,
    requirements: Vec<WorkItem>,
    tasks: Vec<WorkItem>,
    bugs: Vec<WorkItem>,
    members: Vec<ProjectMemberView>,
    activities: Vec<Activity>,
    has_requirements: bool,
    has_tasks: bool,
    has_bugs: bool,
    has_activities: bool,
}

#[derive(Template)]
#[template(path = "web/work_items/list.html")]
struct WorkItemListTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    title: &'static str,
    description: &'static str,
    create_label: &'static str,
    item_type: &'static str,
    items: Vec<WorkItem>,
    project_options: Vec<ProjectOption>,
    summary: WorkItemListSummary,
    has_items: bool,
    has_project_options: bool,
}

#[derive(Template)]
#[template(path = "web/work_items/detail.html")]
struct WorkItemDetailTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    item: WorkItemDetailView,
    comments: Vec<WorkItemComment>,
    has_comments: bool,
}

#[derive(Template)]
#[template(path = "web/partials/work_item_detail.html")]
struct WorkItemDetailPartialTemplate {
    item: WorkItemDetailView,
    comments: Vec<WorkItemComment>,
    has_comments: bool,
}

#[derive(Template)]
#[template(path = "web/login.html")]
struct LoginTemplate {
    environment: String,
    csrf_token: String,
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
}

#[derive(Template)]
#[template(path = "web/system/storage.html")]
struct StorageSettingsTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    config: StorageConfigView,
    message: String,
}

#[derive(Template)]
#[template(path = "web/system/users.html")]
struct SystemUsersTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    users: Vec<UserRow>,
    roles: Vec<RoleRow>,
    has_users: bool,
}

#[derive(Template)]
#[template(path = "web/system/roles.html")]
struct SystemRolesTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    roles: Vec<RoleRow>,
    has_roles: bool,
}

#[derive(Template)]
#[template(path = "web/system/permissions.html")]
struct SystemPermissionsTemplate {
    active: &'static str,
    environment: String,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
    role_code: String,
    role_name: String,
    is_system_role: bool,
    permissions: Vec<PermissionRow>,
}

#[derive(Template)]
#[template(path = "web/partials/work_items.html")]
struct WorkItemsPartialTemplate {
    items: Vec<WorkItem>,
    has_items: bool,
    empty_message: String,
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
    username: String,
    password: String,
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
    status: String,
}

#[derive(Debug, Deserialize)]
pub struct UserRoleForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    role_code: String,
}

#[derive(Debug, Deserialize)]
pub struct ResetPasswordForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    password: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateRoleForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    role_code: String,
    role_name: String,
    data_scope_type: String,
}

#[derive(Debug, Deserialize)]
pub struct RoleStatusForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    status: String,
}

#[derive(Debug, Deserialize)]
pub struct StorageConfigForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    endpoint: String,
    region: String,
    bucket: String,
    access_key_id: String,
    access_key_secret: String,
    #[serde(default)]
    activate: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateProjectForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    project_key: String,
    name: String,
    description: String,
    status: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateWorkItemForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    project_key: String,
    item_type: String,
    title: String,
    description: String,
    priority: String,
}

#[derive(Debug, Deserialize)]
pub struct WorkItemStatusForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    status: String,
}

#[derive(Debug, Deserialize)]
pub struct WorkItemCommentForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    body: String,
}

#[derive(Debug, Deserialize)]
pub struct ProjectMemberForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
    username: String,
    member_role: String,
}

#[derive(Debug, Deserialize)]
pub struct ProjectMemberRemoveForm {
    #[serde(default, rename = "_csrf")]
    csrf_token: String,
}

#[derive(Debug, Deserialize)]
pub struct WorkItemsQuery {
    kind: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    q: Option<String>,
}

pub async fn dashboard(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Response> {
    let Some(pool) = state.pool.as_ref() else {
        let csrf_token = csrf::ensure_token(&headers);
        return with_csrf_cookie(
            &state,
            &csrf_token,
            render_dashboard(
                &state,
                None,
                0,
                true,
                "yuance_admin".to_string(),
                csrf_token.clone(),
                SystemNav::all(),
            )
            .await?
            .into_response(),
        );
    };

    if bootstrap::bootstrap_required(pool).await? {
        return Ok(Redirect::temporary("/web/bootstrap").into_response());
    }

    let Some(user) = auth::user_from_headers(pool, &headers).await? else {
        return Ok(Redirect::temporary("/web/login").into_response());
    };

    let system_nav = build_system_nav(pool, user.id).await?;

    let csrf_token = csrf::ensure_token(&headers);
    with_csrf_cookie(
        &state,
        &csrf_token,
        render_dashboard(
            &state,
            Some(pool),
            user.id,
            user.is_super_admin,
            user.display_name,
            csrf_token.clone(),
            system_nav,
        )
        .await?
        .into_response(),
    )
}

pub async fn me_page(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };

    let (profile, projects, assigned_items) = match context.pool {
        Some(pool) => {
            let profile = users::get_user_summary(pool, context.user_id)
                .await?
                .ok_or(AppError::Unauthorized)?;
            let projects = projects::list_project_summaries_for_user(
                pool,
                context.user_id,
                context.is_super_admin,
            )
            .await?
            .into_iter()
            .map(project_from_summary)
            .collect::<Vec<_>>();
            let assigned_items =
                projects::list_assigned_work_item_summaries(pool, context.user_id, None)
                    .await?
                    .into_iter()
                    .map(work_item_from_summary)
                    .collect::<Vec<_>>();

            (user_profile_from_summary(profile), projects, assigned_items)
        }
        None => (
            sample_user_profile(),
            sample_projects(),
            sample_work_items(None),
        ),
    };
    let summary = my_summary(&projects, &assigned_items);
    let csrf_token = context.csrf_token.clone();

    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(MeTemplate {
            active: "me",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            has_projects: !projects.is_empty(),
            has_assigned_items: !assigned_items.is_empty(),
            profile,
            summary,
            projects,
            assigned_items,
        })?
        .into_response(),
    )
}

pub async fn search_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<SearchQuery>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let query = query.q.unwrap_or_default().trim().to_string();
    if query.chars().count() > 128 {
        return Err(AppError::BadRequest(
            "搜索关键词不能超过 128 个字符".to_string(),
        ));
    }

    let results = if query.is_empty() {
        Vec::new()
    } else {
        match context.pool {
            Some(pool) => {
                projects::search_visible(pool, context.user_id, context.is_super_admin, &query, 20)
                    .await?
                    .into_iter()
                    .map(search_result_from_hit)
                    .collect()
            }
            None => sample_search_results(&query),
        }
    };
    let csrf_token = context.csrf_token.clone();

    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(SearchTemplate {
            active: "search",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            has_query: !query.is_empty(),
            has_results: !results.is_empty(),
            query,
            results,
        })?
        .into_response(),
    )
}

pub async fn projects_page(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let projects = match context.pool {
        Some(pool) => {
            projects::list_project_summaries_for_user(pool, context.user_id, context.is_super_admin)
                .await?
                .into_iter()
                .map(project_from_summary)
                .collect()
        }
        None => sample_projects(),
    };
    let summary = project_list_summary(&projects);

    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(ProjectsTemplate {
            active: "projects",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            has_projects: !projects.is_empty(),
            projects,
            summary,
        })?
        .into_response(),
    )
}

pub async fn projects_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(form): Form<CreateProjectForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_manage_permission(pool, context.user_id, "project.manage").await?;
        let project = projects::create_project(
            pool,
            context.user_id,
            projects::CreateProjectInput {
                project_key: form.project_key,
                name: form.name,
                description: form.description,
                status: form.status,
            },
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "project.create",
            "project",
            &project.project_key,
            "{}",
        )
        .await?;

        return Ok(Redirect::to(&format!("/web/projects/{}", project.project_key)).into_response());
    }

    Ok(Redirect::to("/web/projects/YCE").into_response())
}

pub async fn project_detail_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let Some(pool) = context.pool else {
        return render_sample_project_detail(&state, context);
    };

    let Some(project) = projects::get_project_detail(pool, &project_key).await? else {
        return Ok(StatusCode::NOT_FOUND.into_response());
    };
    ensure_project_access(pool, &context, project.id).await?;

    let all_items = projects::list_project_work_items(pool, project.id, None).await?;
    let requirements = all_items
        .iter()
        .filter(|item| item.item_type == "requirement")
        .cloned()
        .map(work_item_from_summary)
        .collect::<Vec<_>>();
    let tasks = all_items
        .iter()
        .filter(|item| item.item_type == "task")
        .cloned()
        .map(work_item_from_summary)
        .collect::<Vec<_>>();
    let bugs = all_items
        .iter()
        .filter(|item| item.item_type == "bug")
        .cloned()
        .map(work_item_from_summary)
        .collect::<Vec<_>>();
    let members = projects::list_project_members(pool, project.id)
        .await?
        .into_iter()
        .map(project_member_from_summary)
        .collect::<Vec<_>>();
    let activities = projects::list_project_activities(pool, project.id, 10)
        .await?
        .into_iter()
        .map(activity_from_summary)
        .collect::<Vec<_>>();
    let summary = project_detail_summary(&requirements, &tasks, &bugs, &members);
    let project = project_detail_from_domain(project);

    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(ProjectDetailTemplate {
            active: "projects",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            has_requirements: !requirements.is_empty(),
            has_tasks: !tasks.is_empty(),
            has_bugs: !bugs.is_empty(),
            has_activities: !activities.is_empty(),
            project,
            summary,
            requirements,
            tasks,
            bugs,
            members,
            activities,
        })?
        .into_response(),
    )
}

pub async fn project_member_add(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_key): Path<String>,
    Form(form): Form<ProjectMemberForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_manage_permission(pool, context.user_id, "project.manage").await?;
        let project = projects::get_project_detail(pool, &project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
        ensure_project_access(pool, &context, project.id).await?;
        let member = projects::add_project_member(
            pool,
            context.user_id,
            &project_key,
            &form.username,
            &form.member_role,
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "project.member.add",
            "project",
            &project_key,
            &format!(
                r#"{{"username":"{}","member_role":"{}"}}"#,
                member.username, member.member_role
            ),
        )
        .await?;

        return Ok(Redirect::to(&format!("/web/projects/{project_key}")).into_response());
    }

    Ok(Redirect::to("/web/projects/YCE").into_response())
}

pub async fn project_member_remove(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_key, username)): Path<(String, String)>,
    Form(form): Form<ProjectMemberRemoveForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_manage_permission(pool, context.user_id, "project.manage").await?;
        let project = projects::get_project_detail(pool, &project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
        ensure_project_access(pool, &context, project.id).await?;
        projects::remove_project_member(pool, context.user_id, &project_key, &username).await?;
        audit::record(
            pool,
            Some(context.user_id),
            "project.member.remove",
            "project",
            &project_key,
            &format!(r#"{{"username":"{}"}}"#, username),
        )
        .await?;

        return Ok(Redirect::to(&format!("/web/projects/{project_key}")).into_response());
    }

    Ok(Redirect::to("/web/projects/YCE").into_response())
}

pub async fn work_items_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(form): Form<CreateWorkItemForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_manage_permission(pool, context.user_id, "work_item.manage").await?;
        let project = projects::get_project_detail(pool, &form.project_key)
            .await?
            .ok_or_else(|| AppError::BadRequest("项目不存在".to_string()))?;
        ensure_project_access(pool, &context, project.id).await?;
        let item = projects::create_work_item(
            pool,
            context.user_id,
            projects::CreateWorkItemInput {
                project_key: form.project_key,
                item_type: form.item_type,
                title: form.title,
                description: form.description,
                priority: form.priority,
            },
        )
        .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "work_item.create",
            "work_item",
            &item.item_key,
            "{}",
        )
        .await?;

        return Ok(Redirect::to(&format!("/web/work-items/{}", item.item_key)).into_response());
    }

    Ok(Redirect::to("/web/work-items/YCE-TASK-2").into_response())
}

pub async fn requirements_page(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Response> {
    work_item_list_page(
        state,
        &headers,
        Some("requirement"),
        WorkItemListPageMeta::requirements(),
    )
    .await
}

pub async fn tasks_page(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Response> {
    work_item_list_page(state, &headers, Some("task"), WorkItemListPageMeta::tasks()).await
}

pub async fn bugs_page(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Response> {
    work_item_list_page(state, &headers, Some("bug"), WorkItemListPageMeta::bugs()).await
}

pub async fn work_item_detail_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let Some(pool) = context.pool else {
        return render_sample_work_item_detail_page(&state, context);
    };
    let Some((item, comments)) = load_work_item_detail(pool, &item_key).await? else {
        return Ok(StatusCode::NOT_FOUND.into_response());
    };
    ensure_project_key_access(
        pool,
        context.user_id,
        context.is_super_admin,
        &item.project_key,
    )
    .await?;

    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(WorkItemDetailTemplate {
            active: work_item_active_key(&item.kind),
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            has_comments: !comments.is_empty(),
            item,
            comments,
        })?
        .into_response(),
    )
}

pub async fn work_item_status_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
    Form(form): Form<WorkItemStatusForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_manage_permission(pool, context.user_id, "work_item.manage").await?;
        let Some((item, _comments)) = load_work_item_detail(pool, &item_key).await? else {
            return Ok(StatusCode::NOT_FOUND.into_response());
        };
        ensure_project_key_access(
            pool,
            context.user_id,
            context.is_super_admin,
            &item.project_key,
        )
        .await?;
        let updated =
            projects::update_work_item_status(pool, context.user_id, &item_key, &form.status)
                .await?;
        audit::record(
            pool,
            Some(context.user_id),
            "work_item.status.update",
            "work_item",
            &updated.item_key,
            &format!(r#"{{"status":"{}"}}"#, updated.status),
        )
        .await?;

        return Ok(Redirect::to(&format!("/web/work-items/{}", updated.item_key)).into_response());
    }

    Ok(Redirect::to("/web/work-items/YCE-TASK-2").into_response())
}

pub async fn work_item_comment_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
    Form(form): Form<WorkItemCommentForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let context = match web_context_or_redirect(&state, &headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    if let Some(pool) = context.pool {
        ensure_manage_permission(pool, context.user_id, "work_item.manage").await?;
        let Some((item, _comments)) = load_work_item_detail(pool, &item_key).await? else {
            return Ok(StatusCode::NOT_FOUND.into_response());
        };
        ensure_project_key_access(
            pool,
            context.user_id,
            context.is_super_admin,
            &item.project_key,
        )
        .await?;
        projects::add_work_item_comment(pool, context.user_id, &item_key, &form.body).await?;
        audit::record(
            pool,
            Some(context.user_id),
            "work_item.comment.create",
            "work_item",
            &item_key,
            "{}",
        )
        .await?;

        return Ok(Redirect::to(&format!("/web/work-items/{item_key}")).into_response());
    }

    Ok(Redirect::to("/web/work-items/YCE-TASK-2").into_response())
}

pub async fn login(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Response> {
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
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(LoginTemplate {
            environment: state.settings.env.clone(),
            csrf_token: csrf_token.clone(),
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
    let session = auth::login(pool, &form.username, &form.password).await?;
    let actor_user_id = auth::user_from_raw_session(pool, &session.raw_token)
        .await?
        .map(|user| user.id);
    audit::record(
        pool,
        actor_user_id,
        "auth.login",
        "user",
        &form.username,
        "{}",
    )
    .await?;
    redirect_with_session(&state, session.raw_token, is_htmx(&headers))
}

pub async fn bootstrap(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Response> {
    if let Some(pool) = state.pool.as_ref()
        && !bootstrap::bootstrap_required(pool).await?
    {
        return Ok(Redirect::temporary("/web/login").into_response());
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

    audit::record(
        pool,
        Some(result.user_id),
        "bootstrap.init",
        "user",
        &result.user_id.to_string(),
        "{}",
    )
    .await?;
    tracing::info!(user_id = result.user_id, "bootstrap initialized");
    redirect_with_session(&state, result.session.raw_token, is_htmx(&headers))
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
        audit::record(pool, actor_user_id, "auth.logout", "session", "", "{}").await?;
    }

    let mut response = Redirect::to("/web/login").into_response();
    let secure = state.settings.env == "production";
    response.headers_mut().insert(
        header::SET_COOKIE,
        auth::clear_session_cookie_header(secure).parse()?,
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
) -> AppResult<Response> {
    let context = require_system_permission(&state, &headers, "system.dashboard.view").await?;
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
        })?
        .into_response(),
    )
}

pub async fn system_users_page(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Response> {
    let context = require_system_permission(&state, &headers, "system.users.view").await?;
    let pool = state.pool()?;
    let users = users::list_users(pool)
        .await?
        .into_iter()
        .map(user_row_from_summary)
        .collect::<Vec<_>>();
    let roles = rbac::list_roles(pool)
        .await?
        .into_iter()
        .map(role_row_from_summary)
        .collect::<Vec<_>>();

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
            has_users: !users.is_empty(),
            users,
            roles,
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
    let _context = require_system_permission(&state, &headers, "system.users.manage").await?;
    let pool = state.pool()?;
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

    Ok(Redirect::to("/web/system/users").into_response())
}

pub async fn system_user_status_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(username): Path<String>,
    Form(form): Form<UserStatusForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let _context = require_system_permission(&state, &headers, "system.users.manage").await?;
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

    Ok(Redirect::to("/web/system/users").into_response())
}

pub async fn system_user_role_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(username): Path<String>,
    Form(form): Form<UserRoleForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let _context = require_system_permission(&state, &headers, "system.users.manage").await?;
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

    Ok(Redirect::to("/web/system/users").into_response())
}

pub async fn system_user_password_reset(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(username): Path<String>,
    Form(form): Form<ResetPasswordForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let _context = require_system_permission(&state, &headers, "system.users.manage").await?;
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

    Ok(Redirect::to("/web/system/users").into_response())
}

pub async fn system_roles_page(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Response> {
    let context = require_system_permission(&state, &headers, "system.roles.view").await?;
    let roles = rbac::list_roles(state.pool()?)
        .await?
        .into_iter()
        .map(role_row_from_summary)
        .collect::<Vec<_>>();

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
            has_roles: !roles.is_empty(),
            roles,
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
    let _context = require_system_permission(&state, &headers, "system.roles.manage").await?;
    rbac::create_role(
        state.pool()?,
        &form.role_code,
        &form.role_name,
        &form.data_scope_type,
    )
    .await?;
    audit::record(
        state.pool()?,
        Some(_context.user_id),
        "role.create",
        "role",
        &form.role_code,
        "{}",
    )
    .await?;

    Ok(Redirect::to("/web/system/roles").into_response())
}

pub async fn system_role_status_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(role_code): Path<String>,
    Form(form): Form<RoleStatusForm>,
) -> AppResult<Response> {
    csrf::verify(&headers, &form.csrf_token)?;
    let _context = require_system_permission(&state, &headers, "system.roles.manage").await?;
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

    Ok(Redirect::to("/web/system/roles").into_response())
}

pub async fn system_role_permissions_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(role_code): Path<String>,
) -> AppResult<Response> {
    let context = require_system_permission(&state, &headers, "system.roles.view").await?;
    let roles = rbac::list_roles(state.pool()?).await?;
    let Some(role) = roles.iter().find(|role| role.role_code == role_code) else {
        return Ok(StatusCode::NOT_FOUND.into_response());
    };
    let permissions = rbac::list_permissions_for_role(state.pool()?, Some(&role_code))
        .await?
        .into_iter()
        .map(permission_row_from_summary)
        .collect::<Vec<_>>();

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
            role_code,
            role_name: role.role_name.clone(),
            is_system_role: role.is_system,
            permissions,
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
    csrf::verify(&headers, &submitted_csrf)?;
    let _context = require_system_permission(&state, &headers, "system.roles.manage").await?;
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

    Ok(Redirect::to(&format!("/web/system/roles/{role_code}/permissions")).into_response())
}

pub async fn system_permissions_page(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Response> {
    let context = require_system_permission(&state, &headers, "system.roles.view").await?;
    let permissions = rbac::list_permissions_for_role(state.pool()?, None)
        .await?
        .into_iter()
        .map(permission_row_from_summary)
        .collect::<Vec<_>>();

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
            role_code: "all".to_string(),
            role_name: "全部权限点".to_string(),
            is_system_role: true,
            permissions,
        })?
        .into_response(),
    )
}

pub async fn storage_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Response> {
    let context = require_system_permission(&state, &headers, "system.storage.view").await?;
    let config = storage::latest_config(state.pool()?)
        .await?
        .map(storage_config_view_from_domain)
        .unwrap_or_else(empty_storage_config_view);
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
            config,
            message: String::new(),
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
    let context = require_system_permission(&state, &headers, "system.storage.manage").await?;
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
    audit::record(
        state.pool()?,
        Some(context.user_id),
        "storage.config.save",
        "storage_config",
        &saved.id.to_string(),
        &format!(
            r#"{{"provider":"{}","bucket":"{}","status":"{}"}}"#,
            saved.provider, saved.bucket, saved.status
        ),
    )
    .await?;

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
            config: storage_config_view_from_domain(saved),
            message: "对象存储配置已保存，密钥已加密入库。".to_string(),
        })?
        .into_response(),
    )
}

pub async fn system_audit_page(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Response> {
    let context = require_system_permission(&state, &headers, "system.audit.view").await?;
    let logs = audit::list_recent(state.pool()?, 50)
        .await?
        .into_iter()
        .map(audit_log_row_from_summary)
        .collect::<Vec<_>>();

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
            has_logs: !logs.is_empty(),
            logs,
        })?
        .into_response(),
    )
}

struct WorkItemListPageMeta {
    active: &'static str,
    title: &'static str,
    description: &'static str,
    create_label: &'static str,
}

impl WorkItemListPageMeta {
    fn requirements() -> Self {
        Self {
            active: "requirements",
            title: "需求",
            description: "跨项目查看需求，后续补齐状态、负责人和关键字筛选。",
            create_label: "新建需求",
        }
    }

    fn tasks() -> Self {
        Self {
            active: "tasks",
            title: "任务",
            description: "聚合所有项目任务，优先处理开放状态和 P0/P1 工作。",
            create_label: "新建任务",
        }
    }

    fn bugs() -> Self {
        Self {
            active: "bugs",
            title: "Bug",
            description: "跟踪未解决缺陷，优先收敛高优先级问题。",
            create_label: "新建 Bug",
        }
    }
}

async fn work_item_list_page(
    state: AppState,
    headers: &HeaderMap,
    item_type: Option<&'static str>,
    meta: WorkItemListPageMeta,
) -> AppResult<Response> {
    let context = match web_context_or_redirect(&state, headers).await? {
        Ok(context) => context,
        Err(response) => return Ok(response),
    };
    let items = match context.pool {
        Some(pool) => projects::list_work_item_summaries_for_user(
            pool,
            context.user_id,
            context.is_super_admin,
            item_type,
        )
        .await?
        .into_iter()
        .map(work_item_from_summary)
        .collect(),
        None => sample_work_items(item_type),
    };
    let summary = work_item_list_summary(&items);
    let project_options = match context.pool {
        Some(pool) => {
            projects::list_project_summaries_for_user(pool, context.user_id, context.is_super_admin)
                .await?
                .into_iter()
                .map(project_option_from_summary)
                .collect::<Vec<_>>()
        }
        None => sample_project_options(),
    };

    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        &state,
        &csrf_token,
        response::html(WorkItemListTemplate {
            active: meta.active,
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            title: meta.title,
            description: meta.description,
            create_label: meta.create_label,
            item_type: item_type.unwrap_or("task"),
            has_items: !items.is_empty(),
            has_project_options: !project_options.is_empty(),
            items,
            project_options,
            summary,
        })?
        .into_response(),
    )
}

pub async fn work_items_partial(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<WorkItemsQuery>,
) -> AppResult<Html<String>> {
    let item_type = requested_work_item_type(query.kind.as_deref())?;

    let Some(pool) = state.pool.as_ref() else {
        let items = sample_work_items(item_type);
        return response::html(WorkItemsPartialTemplate {
            has_items: !items.is_empty(),
            empty_message: empty_work_items_message(item_type),
            items,
        });
    };

    let user = auth::user_from_headers(pool, &headers)
        .await?
        .ok_or(AppError::Unauthorized)?;
    let items =
        projects::list_work_item_summaries_for_user(pool, user.id, user.is_super_admin, item_type)
            .await?
            .into_iter()
            .map(work_item_from_summary)
            .collect::<Vec<_>>();

    response::html(WorkItemsPartialTemplate {
        has_items: !items.is_empty(),
        empty_message: empty_work_items_message(item_type),
        items,
    })
}

pub async fn work_item_detail_partial(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_key): Path<String>,
) -> AppResult<Response> {
    let Some(pool) = state.pool.as_ref() else {
        return response::html(sample_work_item_detail_partial()).map(IntoResponse::into_response);
    };
    let user = auth::user_from_headers(pool, &headers)
        .await?
        .ok_or(AppError::Unauthorized)?;
    let Some((item, comments)) = load_work_item_detail(pool, &item_key).await? else {
        return Ok(StatusCode::NOT_FOUND.into_response());
    };
    ensure_project_key_access(pool, user.id, user.is_super_admin, &item.project_key).await?;

    response::html(WorkItemDetailPartialTemplate {
        has_comments: !comments.is_empty(),
        item,
        comments,
    })
    .map(IntoResponse::into_response)
}

async fn render_dashboard(
    state: &AppState,
    pool: Option<&SqlitePool>,
    user_id: i64,
    is_super_admin: bool,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
) -> AppResult<Html<String>> {
    let (metrics, projects, activities) = match pool {
        Some(pool) => {
            let project_summaries =
                projects::list_project_summaries_for_user(pool, user_id, is_super_admin).await?;
            let work_item_summaries =
                projects::list_work_item_summaries_for_user(pool, user_id, is_super_admin, None)
                    .await?;
            let activity_summaries =
                projects::list_recent_activities_for_user(pool, user_id, is_super_admin, 5).await?;
            (
                metrics_from_data(&project_summaries, &work_item_summaries),
                project_summaries
                    .into_iter()
                    .map(project_from_summary)
                    .collect(),
                activity_summaries
                    .into_iter()
                    .map(activity_from_summary)
                    .collect(),
            )
        }
        None => (sample_metrics(), sample_projects(), sample_activities()),
    };

    response::html(DashboardTemplate {
        active: "dashboard",
        environment: state.settings.env.clone(),
        current_user,
        csrf_token,
        system_nav,
        metrics,
        projects,
        activities,
    })
}

struct WebContext<'a> {
    user_id: i64,
    current_user: String,
    csrf_token: String,
    is_super_admin: bool,
    system_nav: SystemNav,
    pool: Option<&'a SqlitePool>,
}

struct SystemContext {
    user_id: i64,
    current_user: String,
    csrf_token: String,
    system_nav: SystemNav,
}

async fn web_context_or_redirect<'a>(
    state: &'a AppState,
    headers: &HeaderMap,
) -> AppResult<Result<WebContext<'a>, Response>> {
    let Some(pool) = state.pool.as_ref() else {
        return Ok(Ok(WebContext {
            user_id: 0,
            current_user: "yuance_admin".to_string(),
            csrf_token: csrf::ensure_token(headers),
            is_super_admin: true,
            system_nav: SystemNav::all(),
            pool: None,
        }));
    };

    if bootstrap::bootstrap_required(pool).await? {
        return Ok(Err(Redirect::temporary("/web/bootstrap").into_response()));
    }

    let Some(user) = auth::user_from_headers(pool, headers).await? else {
        return Ok(Err(Redirect::temporary("/web/login").into_response()));
    };

    let system_nav = build_system_nav(pool, user.id).await?;

    Ok(Ok(WebContext {
        user_id: user.id,
        current_user: user.display_name,
        csrf_token: csrf::ensure_token(headers),
        is_super_admin: user.is_super_admin,
        system_nav,
        pool: Some(pool),
    }))
}

async fn require_system_permission(
    state: &AppState,
    headers: &HeaderMap,
    permission_key: &str,
) -> AppResult<SystemContext> {
    let Some(pool) = state.pool.as_ref() else {
        return Ok(SystemContext {
            user_id: 0,
            current_user: "yuance_admin".to_string(),
            csrf_token: csrf::ensure_token(headers),
            system_nav: SystemNav::all(),
        });
    };

    let user = auth::user_from_headers(pool, headers)
        .await?
        .ok_or(crate::platform::error::AppError::Unauthorized)?;
    if !rbac::user_has_permission(pool, user.id, permission_key).await? {
        return Err(crate::platform::error::AppError::Forbidden(
            "需要系统管理权限".to_string(),
        ));
    }
    let system_nav = build_system_nav(pool, user.id).await?;
    Ok(SystemContext {
        user_id: user.id,
        current_user: user.display_name,
        csrf_token: csrf::ensure_token(headers),
        system_nav,
    })
}

async fn build_system_nav(pool: &SqlitePool, user_id: i64) -> AppResult<SystemNav> {
    let dashboard = rbac::user_has_permission(pool, user_id, "system.dashboard.view").await?;
    let users = rbac::user_has_permission(pool, user_id, "system.users.view").await?;
    let roles = rbac::user_has_permission(pool, user_id, "system.roles.view").await?;
    let storage = rbac::user_has_permission(pool, user_id, "system.storage.view").await?;
    let audit = rbac::user_has_permission(pool, user_id, "system.audit.view").await?;

    Ok(SystemNav {
        visible: dashboard || users || roles || storage || audit,
        dashboard,
        users,
        roles,
        storage,
        audit,
    })
}

async fn ensure_manage_permission(
    pool: &SqlitePool,
    user_id: i64,
    permission_key: &str,
) -> AppResult<()> {
    if rbac::user_has_permission(pool, user_id, permission_key).await? {
        return Ok(());
    }

    Err(AppError::Forbidden("缺少操作权限".to_string()))
}

fn redirect_with_session(state: &AppState, raw_token: String, htmx: bool) -> AppResult<Response> {
    let cookie = auth::session_cookie_header(&raw_token, state.settings.env == "production");
    let mut response = if htmx {
        StatusCode::NO_CONTENT.into_response()
    } else {
        Redirect::to("/web").into_response()
    };
    response
        .headers_mut()
        .insert(header::SET_COOKIE, cookie.parse()?);
    if htmx {
        response
            .headers_mut()
            .insert("HX-Redirect", "/web".parse()?);
    }
    Ok(response)
}

fn with_csrf_cookie(
    state: &AppState,
    csrf_token: &str,
    mut response: Response,
) -> AppResult<Response> {
    response.headers_mut().insert(
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

fn metrics_from_data(
    projects: &[projects::ProjectSummary],
    work_items: &[projects::WorkItemSummary],
) -> Vec<Metric> {
    let active_projects = projects
        .iter()
        .filter(|project| matches!(project.status.as_str(), "active" | "planning"))
        .count();
    let paused_projects = projects
        .iter()
        .filter(|project| project.status == "paused")
        .count();
    let pending_tasks = work_items
        .iter()
        .filter(|item| item.item_type == "task" && is_open_status(&item.status))
        .count();
    let unresolved_bugs = work_items
        .iter()
        .filter(|item| item.item_type == "bug" && is_open_status(&item.status))
        .count();
    let high_priority_bugs = work_items
        .iter()
        .filter(|item| {
            item.item_type == "bug"
                && is_open_status(&item.status)
                && matches!(item.priority.as_str(), "P0" | "P1")
        })
        .count();
    let completed_items = work_items
        .iter()
        .filter(|item| is_completed_status(&item.status))
        .count();

    vec![
        Metric {
            label: "进行中项目",
            value: active_projects.to_string(),
            hint: format!("{paused_projects} 个暂停/有风险"),
            tone: "info",
        },
        Metric {
            label: "待处理任务",
            value: pending_tasks.to_string(),
            hint: "开放状态任务".to_string(),
            tone: "warning",
        },
        Metric {
            label: "未解决 Bug",
            value: unresolved_bugs.to_string(),
            hint: format!("{high_priority_bugs} 个 P0/P1"),
            tone: "danger",
        },
        Metric {
            label: "已完成",
            value: completed_items.to_string(),
            hint: "已完成 / 已解决 / 已验证".to_string(),
            tone: "ok",
        },
    ]
}

fn project_from_summary(project: projects::ProjectSummary) -> ProjectRow {
    let (status, status_tone) = project_status_label(&project.status);
    ProjectRow {
        code: project.project_key,
        name: project.name,
        owner: fallback_text(project.owner_display_name, "未分配"),
        open_work_items: project.open_work_item_count,
        total_work_items: project.work_item_count,
        status: status.to_string(),
        status_tone,
        updated_at: display_timestamp(project.updated_at),
    }
}

fn project_option_from_summary(project: projects::ProjectSummary) -> ProjectOption {
    ProjectOption {
        key: project.project_key,
        name: project.name,
    }
}

fn project_detail_from_domain(project: projects::ProjectDetail) -> ProjectDetailView {
    let (status, status_tone) = project_status_label(&project.status);
    ProjectDetailView {
        code: project.project_key,
        name: project.name,
        description: project.description,
        owner: fallback_text(project.owner_display_name, "未分配"),
        status: status.to_string(),
        status_tone,
        created_at: display_timestamp(project.created_at),
        updated_at: display_timestamp(project.updated_at),
    }
}

fn project_member_from_summary(member: projects::ProjectMemberSummary) -> ProjectMemberView {
    ProjectMemberView {
        display_name: member.display_name,
        username: member.username,
        role: project_member_role_label(&member.member_role).to_string(),
        joined_at: display_timestamp(member.joined_at),
    }
}

fn project_detail_summary(
    requirements: &[WorkItem],
    tasks: &[WorkItem],
    bugs: &[WorkItem],
    members: &[ProjectMemberView],
) -> ProjectDetailSummary {
    let open_items = requirements
        .iter()
        .chain(tasks)
        .chain(bugs)
        .filter(|item| {
            !matches!(
                item.status.as_str(),
                "已完成" | "已解决" | "已验证" | "已关闭"
            )
        })
        .count();

    ProjectDetailSummary {
        requirements: requirements.len(),
        tasks: tasks.len(),
        bugs: bugs.len(),
        open_items,
        members: members.len(),
    }
}

fn work_item_from_summary(item: projects::WorkItemSummary) -> WorkItem {
    let (kind, status, status_tone) = work_item_labels(&item.item_type, &item.status);
    WorkItem {
        key: item.item_key,
        kind: kind.to_string(),
        title: item.title,
        project: format!("{} · {}", item.project_key, item.project_name),
        assignee: fallback_text(item.assignee_display_name, "未分配"),
        priority: item.priority,
        status: status.to_string(),
        status_tone,
    }
}

fn work_item_detail_from_domain(item: projects::WorkItemDetail) -> WorkItemDetailView {
    let (kind, status, status_tone) = work_item_labels(&item.item_type, &item.status);
    WorkItemDetailView {
        key: item.item_key,
        kind: kind.to_string(),
        title: item.title,
        description: item.description,
        project_key: item.project_key,
        project_name: item.project_name,
        assignee: fallback_text(item.assignee_display_name, "未分配"),
        reporter: fallback_text(item.reporter_display_name, "未分配"),
        priority: item.priority,
        status: status.to_string(),
        status_tone,
        created_at: display_timestamp(item.created_at),
        updated_at: display_timestamp(item.updated_at),
    }
}

fn comment_from_summary(comment: projects::WorkItemCommentSummary) -> WorkItemComment {
    WorkItemComment {
        body: comment.body,
        author: fallback_text(comment.author_display_name, "系统"),
        created_at: display_timestamp(comment.created_at),
    }
}

fn activity_from_summary(activity: projects::ProjectActivitySummary) -> Activity {
    Activity {
        title: activity.summary,
        meta: format!(
            "{} · {} · {}",
            activity.project_key,
            fallback_text(activity.actor_display_name, "系统"),
            display_timestamp(activity.created_at)
        ),
    }
}

fn user_row_from_summary(user: users::UserSummary) -> UserRow {
    let (status, status_tone) = user_status_label(&user.status);
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

fn permission_row_from_summary(permission: rbac::PermissionSummary) -> PermissionRow {
    PermissionRow {
        key: permission.permission_key,
        name: permission.permission_name,
        resource: permission.resource_key,
        resource_type: permission.resource_type,
        granted: permission.granted,
    }
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
        created_at: display_timestamp(log.created_at),
    }
}

fn user_profile_from_summary(user: users::UserSummary) -> UserProfileView {
    let (status, status_tone) = user_status_label(&user.status);
    UserProfileView {
        username: user.username,
        display_name: user.display_name,
        contact: user_contact(user.email, user.mobile),
        roles: fallback_text(user.role_names, "未分配"),
        status: status.to_string(),
        status_tone,
        created_at: display_timestamp(user.created_at),
        updated_at: display_timestamp(user.updated_at),
        is_super_admin: user.is_super_admin,
    }
}

fn my_summary(projects: &[ProjectRow], assigned_items: &[WorkItem]) -> MySummary {
    MySummary {
        project_count: projects.len(),
        assigned_count: assigned_items.len(),
        open_count: assigned_items
            .iter()
            .filter(|item| {
                !matches!(
                    item.status.as_str(),
                    "已完成" | "已解决" | "已验证" | "已关闭"
                )
            })
            .count(),
        high_priority_count: assigned_items
            .iter()
            .filter(|item| matches!(item.priority.as_str(), "P0" | "P1"))
            .count(),
    }
}

fn search_result_from_hit(hit: projects::SearchHit) -> SearchResult {
    SearchResult {
        kind: search_hit_type_label(&hit.hit_type).to_string(),
        key: hit.key,
        title: hit.title,
        context: fallback_text(hit.context, "无描述"),
        url: hit.url,
        updated_at: display_timestamp(hit.updated_at),
    }
}

fn empty_storage_config_view() -> StorageConfigView {
    StorageConfigView {
        has_config: false,
        provider: "阿里云 OSS".to_string(),
        endpoint: String::new(),
        region: String::new(),
        bucket: String::new(),
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
    if context.is_super_admin
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
    if is_super_admin {
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

async fn load_work_item_detail(
    pool: &SqlitePool,
    item_key: &str,
) -> AppResult<Option<(WorkItemDetailView, Vec<WorkItemComment>)>> {
    let Some(item) = projects::get_work_item_detail(pool, item_key).await? else {
        return Ok(None);
    };
    let comments = projects::list_work_item_comments(pool, item.id)
        .await?
        .into_iter()
        .map(comment_from_summary)
        .collect::<Vec<_>>();

    Ok(Some((work_item_detail_from_domain(item), comments)))
}

fn project_list_summary(projects: &[ProjectRow]) -> ProjectListSummary {
    ProjectListSummary {
        total_projects: projects.len(),
        active_projects: projects
            .iter()
            .filter(|project| matches!(project.status.as_str(), "规划中" | "进行中"))
            .count(),
        open_work_items: projects.iter().map(|project| project.open_work_items).sum(),
    }
}

fn work_item_list_summary(items: &[WorkItem]) -> WorkItemListSummary {
    WorkItemListSummary {
        total_items: items.len(),
        open_items: items
            .iter()
            .filter(|item| {
                !matches!(
                    item.status.as_str(),
                    "已完成" | "已解决" | "已验证" | "已关闭"
                )
            })
            .count(),
        high_priority_items: items
            .iter()
            .filter(|item| matches!(item.priority.as_str(), "P0" | "P1"))
            .count(),
    }
}

fn requested_work_item_type(kind: Option<&str>) -> AppResult<Option<&'static str>> {
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

fn is_open_status(status: &str) -> bool {
    !matches!(
        status,
        "done" | "closed" | "resolved" | "verified" | "cancelled"
    )
}

fn is_completed_status(status: &str) -> bool {
    matches!(status, "done" | "closed" | "resolved" | "verified")
}

fn project_status_label(status: &str) -> (&'static str, &'static str) {
    match status {
        "planning" => ("规划中", "info"),
        "active" => ("进行中", "ok"),
        "paused" => ("暂停", "warning"),
        "archived" => ("归档", "info"),
        _ => ("未知", "info"),
    }
}

fn project_member_role_label(role: &str) -> &'static str {
    match role {
        "owner" => "负责人",
        "maintainer" => "维护者",
        "member" => "成员",
        "viewer" => "观察者",
        _ => "成员",
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

fn audit_action_label(action: &str) -> &str {
    match action {
        "auth.login" => "用户登录",
        "auth.logout" => "用户退出",
        "bootstrap.init" => "首次初始化",
        "storage.config.save" => "保存对象存储配置",
        "user.create" => "创建用户",
        "user.status.update" => "更新用户状态",
        "user.password.reset" => "重置用户密码",
        "role.create" => "创建角色",
        "role.status.update" => "更新角色状态",
        "role.permissions.update" => "更新角色权限",
        _ => action,
    }
}

fn search_hit_type_label(hit_type: &str) -> &'static str {
    match hit_type {
        "project" => "项目",
        "requirement" => "需求",
        "task" => "任务",
        "bug" => "Bug",
        _ => "结果",
    }
}

fn data_scope_label(data_scope_type: &str) -> &'static str {
    match data_scope_type {
        "all" => "全部数据",
        "self" => "本人数据",
        _ => "自定义",
    }
}

fn work_item_labels(item_type: &str, status: &str) -> (&'static str, &'static str, &'static str) {
    let kind = match item_type {
        "requirement" => "需求",
        "task" => "任务",
        "bug" => "Bug",
        _ => "工作项",
    };
    let (status, tone) = match status {
        "open" => ("待处理", "warning"),
        "in_progress" => ("进行中", "info"),
        "done" => ("已完成", "ok"),
        "verified" => ("已验证", "ok"),
        "resolved" => ("已解决", "ok"),
        "closed" => ("已关闭", "ok"),
        "cancelled" => ("已取消", "danger"),
        _ => ("未分类", "info"),
    };
    (kind, status, tone)
}

fn user_contact(email: String, mobile: String) -> String {
    match (email.trim().is_empty(), mobile.trim().is_empty()) {
        (true, true) => "未填写".to_string(),
        (false, true) => email,
        (true, false) => mobile,
        (false, false) => format!("{email} / {mobile}"),
    }
}

fn work_item_active_key(kind: &str) -> &'static str {
    match kind {
        "需求" => "requirements",
        "任务" => "tasks",
        "Bug" => "bugs",
        _ => "dashboard",
    }
}

fn fallback_text(value: String, fallback: &str) -> String {
    if value.trim().is_empty() {
        fallback.to_string()
    } else {
        value
    }
}

fn display_timestamp(value: String) -> String {
    value.replace('T', " ")
}

fn empty_work_items_message(item_type: Option<&str>) -> String {
    match item_type {
        Some("requirement") => "暂无需求".to_string(),
        Some("task") => "暂无任务".to_string(),
        Some("bug") => "暂无 Bug".to_string(),
        _ => "暂无工作项".to_string(),
    }
}

fn sample_metrics() -> Vec<Metric> {
    vec![
        Metric {
            label: "进行中项目",
            value: "3".to_string(),
            hint: "1 个暂停/有风险".to_string(),
            tone: "info",
        },
        Metric {
            label: "待处理任务",
            value: "2".to_string(),
            hint: "开放状态任务".to_string(),
            tone: "warning",
        },
        Metric {
            label: "未解决 Bug",
            value: "1".to_string(),
            hint: "1 个 P0/P1".to_string(),
            tone: "danger",
        },
        Metric {
            label: "已完成",
            value: "2".to_string(),
            hint: "已完成 / 已验证".to_string(),
            tone: "ok",
        },
    ]
}

fn sample_user_profile() -> UserProfileView {
    UserProfileView {
        username: "yuance_admin".to_string(),
        display_name: "系统管理员".to_string(),
        contact: "未填写".to_string(),
        roles: "系统管理员".to_string(),
        status: "启用".to_string(),
        status_tone: "ok",
        created_at: "今天".to_string(),
        updated_at: "今天".to_string(),
        is_super_admin: true,
    }
}

fn sample_projects() -> Vec<ProjectRow> {
    vec![
        ProjectRow {
            code: "YCE".to_string(),
            name: "元策 MVP".to_string(),
            owner: "陈".to_string(),
            open_work_items: 2,
            total_work_items: 4,
            status: "进行中".to_string(),
            status_tone: "ok",
            updated_at: "今天 16:20".to_string(),
        },
        ProjectRow {
            code: "OPS".to_string(),
            name: "交付运维台".to_string(),
            owner: "林".to_string(),
            open_work_items: 1,
            total_work_items: 1,
            status: "规划中".to_string(),
            status_tone: "info",
            updated_at: "今天 13:05".to_string(),
        },
        ProjectRow {
            code: "CRM".to_string(),
            name: "客户线索同步".to_string(),
            owner: "周".to_string(),
            open_work_items: 1,
            total_work_items: 1,
            status: "暂停".to_string(),
            status_tone: "warning",
            updated_at: "昨天 19:42".to_string(),
        },
    ]
}

fn sample_project_options() -> Vec<ProjectOption> {
    sample_projects()
        .into_iter()
        .map(|project| ProjectOption {
            key: project.code,
            name: project.name,
        })
        .collect()
}

fn sample_search_results(query: &str) -> Vec<SearchResult> {
    let query = query.trim();
    if query.is_empty() {
        return Vec::new();
    }

    sample_projects()
        .into_iter()
        .filter(|project| project.code.contains(query) || project.name.contains(query))
        .map(|project| SearchResult {
            kind: "项目".to_string(),
            key: project.code.clone(),
            title: project.name,
            context: format!("负责人 {} · {}", project.owner, project.status),
            url: format!("/web/projects/{}", project.code),
            updated_at: project.updated_at,
        })
        .chain(
            sample_work_items(None)
                .into_iter()
                .filter(|item| {
                    item.key.contains(query)
                        || item.title.contains(query)
                        || item.project.contains(query)
                })
                .map(|item| SearchResult {
                    kind: item.kind,
                    key: item.key.clone(),
                    title: item.title,
                    context: item.project,
                    url: format!("/web/work-items/{}", item.key),
                    updated_at: "示例数据".to_string(),
                }),
        )
        .collect()
}

fn sample_work_items(item_type: Option<&str>) -> Vec<WorkItem> {
    let items = vec![
        WorkItem {
            key: "YCE-REQ-1".to_string(),
            kind: "需求".to_string(),
            title: "统一 /web 用户工作台与系统管理入口".to_string(),
            project: "YCE · 元策 MVP".to_string(),
            assignee: "陈".to_string(),
            priority: "P0".to_string(),
            status: "进行中".to_string(),
            status_tone: "info",
        },
        WorkItem {
            key: "YCE-TASK-2".to_string(),
            kind: "任务".to_string(),
            title: "设计项目与工作项数据模型".to_string(),
            project: "YCE · 元策 MVP".to_string(),
            assignee: "陈".to_string(),
            priority: "P0".to_string(),
            status: "进行中".to_string(),
            status_tone: "info",
        },
        WorkItem {
            key: "CRM-BUG-1".to_string(),
            kind: "Bug".to_string(),
            title: "外部线索状态映射需要人工确认".to_string(),
            project: "CRM · 客户线索同步".to_string(),
            assignee: "未分配".to_string(),
            priority: "P1".to_string(),
            status: "待处理".to_string(),
            status_tone: "warning",
        },
    ];

    items
        .into_iter()
        .filter(|item| {
            item_type.is_none_or(|kind| {
                matches!(
                    (kind, item.kind.as_str()),
                    ("requirement", "需求") | ("task", "任务") | ("bug", "Bug")
                )
            })
        })
        .collect()
}

fn render_sample_project_detail(state: &AppState, context: WebContext<'_>) -> AppResult<Response> {
    let requirements = sample_work_items(Some("requirement"));
    let tasks = sample_work_items(Some("task"));
    let bugs = sample_work_items(Some("bug"));
    let members = vec![ProjectMemberView {
        display_name: "陈".to_string(),
        username: "yuance_admin".to_string(),
        role: "负责人".to_string(),
        joined_at: "今天".to_string(),
    }];
    let activities = sample_activities();
    let summary = project_detail_summary(&requirements, &tasks, &bugs, &members);

    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        state,
        &csrf_token,
        response::html(ProjectDetailTemplate {
            active: "projects",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            project: ProjectDetailView {
                code: "YCE".to_string(),
                name: "元策 MVP".to_string(),
                description: "统一项目、需求、任务、Bug 的轻量项目管理系统。".to_string(),
                owner: "陈".to_string(),
                status: "进行中".to_string(),
                status_tone: "ok",
                created_at: "今天".to_string(),
                updated_at: "今天 16:20".to_string(),
            },
            has_requirements: !requirements.is_empty(),
            has_tasks: !tasks.is_empty(),
            has_bugs: !bugs.is_empty(),
            has_activities: !activities.is_empty(),
            summary,
            requirements,
            tasks,
            bugs,
            members,
            activities,
        })?
        .into_response(),
    )
}

fn render_sample_work_item_detail_page(
    state: &AppState,
    context: WebContext<'_>,
) -> AppResult<Response> {
    let partial = sample_work_item_detail_partial();
    let csrf_token = context.csrf_token.clone();
    with_csrf_cookie(
        state,
        &csrf_token,
        response::html(WorkItemDetailTemplate {
            active: "tasks",
            environment: state.settings.env.clone(),
            current_user: context.current_user,
            csrf_token: context.csrf_token,
            system_nav: context.system_nav,
            has_comments: partial.has_comments,
            item: partial.item,
            comments: partial.comments,
        })?
        .into_response(),
    )
}

fn sample_work_item_detail_partial() -> WorkItemDetailPartialTemplate {
    WorkItemDetailPartialTemplate {
        item: WorkItemDetailView {
            key: "YCE-TASK-2".to_string(),
            kind: "任务".to_string(),
            title: "设计项目与工作项数据模型".to_string(),
            description: "落地项目、成员、需求、任务、Bug、评论和动态表。".to_string(),
            project_key: "YCE".to_string(),
            project_name: "元策 MVP".to_string(),
            assignee: "陈".to_string(),
            reporter: "陈".to_string(),
            priority: "P0".to_string(),
            status: "进行中".to_string(),
            status_tone: "info",
            created_at: "今天".to_string(),
            updated_at: "今天 16:20".to_string(),
        },
        comments: vec![WorkItemComment {
            body: "先统一项目与工作项查询模型，再继续补页面交互。".to_string(),
            author: "陈".to_string(),
            created_at: "今天".to_string(),
        }],
        has_comments: true,
    }
}

fn sample_activities() -> Vec<Activity> {
    vec![
        Activity {
            title: "架构计划已确认".to_string(),
            meta: "YCE · docs/plans · 20 分钟前".to_string(),
        },
        Activity {
            title: "RBAC 采用轻量权限点模型".to_string(),
            meta: "YCE · system.users.manage 等 key · 今天".to_string(),
        },
        Activity {
            title: "对象存储第一版锁定阿里云 OSS".to_string(),
            meta: "YCE · 系统管理 / 对象存储 · 今天".to_string(),
        },
    ]
}
