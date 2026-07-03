use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use tower::ServiceExt;
use yuance_api::{
    domains::{auth, bootstrap, files, projects, rbac, storage, users},
    platform::{config::Settings, db},
    web::router::{AppState, build_router},
};

const CSRF_TOKEN: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

#[tokio::test]
async fn demo_seed_idempotently_creates_projects_and_work_items() {
    let pool = test_pool().await;
    let owner_user_id = bootstrap_admin(&pool).await;

    let first = projects::seed_demo_data(&pool, owner_user_id)
        .await
        .expect("demo seed should apply");
    let second = projects::seed_demo_data(&pool, owner_user_id)
        .await
        .expect("demo seed should be idempotent");

    assert_eq!(first.project_count, 3);
    assert_eq!(first.work_item_count, 6);
    assert_eq!(second, first);

    let project_members = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM project_members")
        .fetch_one(&pool)
        .await
        .expect("member count should load");
    let activities = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM project_activities")
        .fetch_one(&pool)
        .await
        .expect("activity count should load");
    let comments = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM work_item_comments")
        .fetch_one(&pool)
        .await
        .expect("comment count should load");

    assert_eq!(project_members, 3);
    assert_eq!(activities, 3);
    assert_eq!(comments, 2);
}

#[tokio::test]
async fn project_summaries_return_counts_and_stable_order() {
    let pool = test_pool().await;
    let owner_user_id = bootstrap_admin(&pool).await;
    projects::seed_demo_data(&pool, owner_user_id)
        .await
        .expect("demo seed should apply");

    let summaries = projects::list_project_summaries(&pool)
        .await
        .expect("project summaries should load");

    assert_eq!(summaries.len(), 3);
    let yuance = summaries
        .iter()
        .find(|project| project.project_key == "YCE")
        .expect("YCE project should exist");

    assert_eq!(yuance.name, "元策 MVP");
    assert_eq!(yuance.owner_display_name, "系统管理员");
    assert_eq!(yuance.work_item_count, 4);
    assert!(yuance.open_work_item_count >= 2);
}

#[tokio::test]
async fn project_summaries_can_paginate_and_filter_by_status() {
    let pool = test_pool().await;
    let owner_user_id = bootstrap_admin(&pool).await;
    projects::seed_demo_data(&pool, owner_user_id)
        .await
        .expect("demo seed should apply");

    let second_page = projects::list_project_summaries_paginated(
        &pool,
        projects::ProjectListFilter::default(),
        projects::Pagination {
            page: 2,
            per_page: 1,
        },
    )
    .await
    .expect("project page should load");
    assert_eq!(second_page.total_items, 3);
    assert_eq!(second_page.total_pages(), 3);
    assert_eq!(second_page.items.len(), 1);

    let paused_page = projects::list_project_summaries_paginated(
        &pool,
        projects::ProjectListFilter {
            status: "paused".to_string(),
        },
        projects::Pagination {
            page: 1,
            per_page: 10,
        },
    )
    .await
    .expect("filtered project page should load");
    assert_eq!(paused_page.total_items, 1);
    assert_eq!(paused_page.items[0].project_key, "CRM");
}

#[tokio::test]
async fn work_item_summaries_can_filter_by_type() {
    let pool = test_pool().await;
    let owner_user_id = bootstrap_admin(&pool).await;
    projects::seed_demo_data(&pool, owner_user_id)
        .await
        .expect("demo seed should apply");

    let all_items = projects::list_work_item_summaries(&pool, None)
        .await
        .expect("work items should load");
    let requirements = projects::list_work_item_summaries(&pool, Some("requirement"))
        .await
        .expect("requirements should load");
    let bugs = projects::list_work_item_summaries(&pool, Some("bug"))
        .await
        .expect("bugs should load");

    assert_eq!(all_items.len(), 6);
    assert_eq!(requirements.len(), 1);
    assert!(
        requirements
            .iter()
            .all(|item| item.item_type == "requirement")
    );
    assert_eq!(bugs.len(), 2);
    assert!(bugs.iter().all(|item| item.item_type == "bug"));
}

#[tokio::test]
async fn project_queries_handle_empty_database() {
    let pool = test_pool().await;
    rbac::seed_core(&pool)
        .await
        .expect("core seed should apply");

    let projects = projects::list_project_summaries(&pool)
        .await
        .expect("empty projects should load");
    let work_items = projects::list_work_item_summaries(&pool, None)
        .await
        .expect("empty work items should load");

    assert!(projects.is_empty());
    assert!(work_items.is_empty());
}

#[tokio::test]
async fn web_dashboard_renders_demo_projects_from_database() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;

    assert!(body.contains("元策 MVP"));
    assert!(body.contains("YCE"));
    assert!(body.contains("工作项"));
    assert!(body.contains("RBAC 采用轻量权限点模型"));
    assert!(body.contains("风险队列"));
    assert!(body.contains("YCE-REQ-1"));
    assert!(body.contains("统一 /web 用户工作台与系统管理入口"));
    assert!(!body.contains("CRM 项目接口验收延期"));
    assert!(!body.contains("对象存储密钥轮换策略未定"));
}

#[tokio::test]
async fn web_dashboard_project_area_prefers_current_project() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    projects::set_current_project_for_user(&pool, initialized.user_id, true, "YCE")
        .await
        .expect("admin should select YCE");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;

    assert!(body.contains(r#"data-project-switcher"#));
    assert!(body.contains(r#"name="project_key" value="YCE""#));
    assert!(body.contains(r#"class="project-switcher-option active""#));
    assert!(body.contains("元策 MVP"));
    assert!(!body.contains("<td><code>CRM</code></td>"));
    assert!(!body.contains("<td><code>OPS</code></td>"));
    assert!(body.contains("架构计划已确认"));
}

#[tokio::test]
async fn web_top_project_nav_points_to_current_project_detail() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    projects::set_current_project_for_user(&pool, initialized.user_id, true, "YCE")
        .await
        .expect("admin should select YCE");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let current_project_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(current_project_response.status(), StatusCode::OK);
    let current_project_body = response_body(current_project_response).await;
    assert!(
        current_project_body
            .contains(r#"<a class="topnav-item " href="/web/projects/YCE">项目</a>"#)
    );

    projects::clear_current_project(&pool, initialized.user_id)
        .await
        .expect("current project should clear");
    let default_projects =
        projects::list_project_summaries_for_user(&pool, initialized.user_id, true)
            .await
            .expect("project summaries should load");
    let default_project = default_projects
        .iter()
        .find(|project| project.status == "active")
        .or_else(|| default_projects.first())
        .expect("demo project should exist");
    let no_current_project_response = app
        .oneshot(
            Request::builder()
                .uri("/web")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(no_current_project_response.status(), StatusCode::OK);
    let no_current_project_body = response_body(no_current_project_response).await;
    assert!(no_current_project_body.contains(&format!(
        r#"<a class="topnav-item " href="/web/projects/{}">项目</a>"#,
        default_project.project_key
    )));
    let current = projects::get_current_project_for_user(&pool, initialized.user_id, true)
        .await
        .expect("current project should load")
        .expect("default current project should be set");
    assert_eq!(current.project_key, default_project.project_key);
}

#[tokio::test]
async fn web_project_detail_syncs_top_project_context() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    projects::set_current_project_for_user(&pool, initialized.user_id, true, "YCE")
        .await
        .expect("admin should select YCE first");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let detail_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/projects/OPS")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(detail_response.status(), StatusCode::OK);
    let detail_body = response_body(detail_response).await;
    assert!(detail_body.contains(r#"name="project_key" value="OPS""#));

    let current = projects::get_current_project_for_user(&pool, initialized.user_id, true)
        .await
        .expect("current project should load")
        .expect("current project should sync to detail project");
    assert_eq!(current.project_key, "OPS");

    let tasks_response = app
        .oneshot(
            Request::builder()
                .uri("/web/tasks")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(tasks_response.status(), StatusCode::OK);
    let tasks_body = response_body(tasks_response).await;
    assert!(tasks_body.contains(r#"当前项目：OPS"#));
    assert!(tasks_body.contains("OPS-TASK-1"));
    assert!(!tasks_body.contains("YCE-TASK-2"));
}

#[tokio::test]
async fn web_projects_renders_demo_projects_from_database() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/projects")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;

    assert!(body.contains("项目列表"));
    assert!(body.contains("元策 MVP"));
    assert!(body.contains("客户线索同步"));
    assert!(body.contains("开放工作项"));
    assert!(body.contains(r#"class="project-card-grid""#));
    assert!(body.contains(r#"class="project-card" href="/web/projects/YCE""#));
    assert!(body.contains(r#"data-modal-open="project-create-modal""#));
    assert!(body.contains(r#"id="project-create-modal""#));
    assert!(body.contains(r#"action="/web/projects""#));
    assert!(!body.contains(r#"id="project-create-form""#));
}

#[tokio::test]
async fn web_projects_can_filter_by_status() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let paused_response = app
        .oneshot(
            Request::builder()
                .uri("/web/projects?status=paused")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let body = response_body(paused_response).await;

    assert!(body.contains(r#"href="/web/projects?status=paused">已暂停"#));
    assert!(body.contains(r#"class="project-card" href="/web/projects/CRM""#));
    assert!(!body.contains(r#"class="project-card" href="/web/projects/YCE""#));
    assert!(!body.contains(r#"class="project-card" href="/web/projects/OPS""#));
    assert!(body.contains(r#"class="active" href="/web/projects?status=paused""#));
}

#[tokio::test]
async fn web_projects_paginates_and_preserves_status_filter() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    projects::create_project(
        &pool,
        initialized.user_id,
        projects::CreateProjectInput {
            project_key: "ACT".to_string(),
            name: "第二个进行中项目".to_string(),
            description: "用于验证项目分页保留状态筛选".to_string(),
            status: "active".to_string(),
            start_date: String::new(),
            due_date: String::new(),
        },
    )
    .await
    .expect("extra active project should create");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/projects?status=active&page=1&per_page=1")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;

    assert!(body.contains(r#"aria-label="项目分页""#));
    assert!(body.contains("第 1/2 页"));
    assert!(body.contains("共 2 个项目，每页 1 个"));
    assert!(!body.contains(r#"href="/web/projects/CRM""#));
    assert!(!body.contains(r#"href="/web/projects/OPS""#));
    assert!(body.contains(r#"href="/web/projects?status=active">进行中"#));
    assert!(body.contains("下一页"));
    assert!(body.contains("status=active"));
    assert!(body.contains("page=2"));
    assert!(body.contains("per_page=1"));
}

#[tokio::test]
async fn web_work_item_list_pages_filter_by_type() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    projects::set_current_project_for_user(&pool, initialized.user_id, true, "YCE")
        .await
        .expect("admin should select YCE");

    let tasks_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/tasks")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let bugs_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/bugs")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(tasks_response.status(), StatusCode::OK);
    assert_eq!(bugs_response.status(), StatusCode::OK);
    let tasks_body = response_body(tasks_response).await;
    let bugs_body = response_body(bugs_response).await;

    assert!(tasks_body.contains("当前项目：YCE · 元策 MVP"));
    assert!(tasks_body.contains("YCE-TASK-1"));
    assert!(tasks_body.contains("YCE-TASK-2"));
    assert!(!tasks_body.contains("OPS-TASK-1"));
    assert!(tasks_body.contains(r#"data-modal-open="work-item-create-modal""#));
    assert!(tasks_body.contains(r#"id="work-item-create-modal""#));
    assert!(tasks_body.contains(r#"name="item_type" value="task""#));
    assert!(tasks_body.contains(r#"name="project_key" value="YCE" readonly"#));
    assert!(!tasks_body.contains(r#"id="work-item-create-form""#));
    assert!(tasks_body.contains("父级需求"));
    assert!(!tasks_body.contains("CRM-BUG-1"));

    assert!(bugs_body.contains("YCE-BUG-1"));
    assert!(!bugs_body.contains("CRM-BUG-1"));
    assert!(!bugs_body.contains("YCE-REQ-1"));
    assert!(!bugs_body.contains("OPS-TASK-1"));

    projects::set_current_project_for_user(&pool, initialized.user_id, true, "OPS")
        .await
        .expect("admin should select OPS");
    let ops_tasks_response = app
        .oneshot(
            Request::builder()
                .uri("/web/tasks")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(ops_tasks_response.status(), StatusCode::OK);
    let ops_tasks_body = response_body(ops_tasks_response).await;
    assert!(ops_tasks_body.contains("OPS-TASK-1"));
    assert!(!ops_tasks_body.contains("YCE-TASK-1"));
    assert!(!ops_tasks_body.contains("YCE-TASK-2"));
}

#[tokio::test]
async fn web_work_item_list_can_filter_by_query_status_priority_and_project() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    projects::set_current_project_for_user(&pool, initialized.user_id, true, "YCE")
        .await
        .expect("admin should select YCE");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/tasks?q=%E6%95%B0%E6%8D%AE%E6%A8%A1%E5%9E%8B&status=in_progress&priority=P0&project_key=YCE&assignee_username=admin")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;

    assert!(body.contains("筛选"));
    assert!(body.contains("YCE-TASK-2"));
    assert!(body.contains("设计项目与工作项数据模型"));
    assert!(!body.contains("YCE-TASK-1"));
    assert!(!body.contains("OPS-TASK-1"));
}

#[tokio::test]
async fn web_work_item_list_paginates_current_project_items() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    projects::set_current_project_for_user(&pool, initialized.user_id, true, "YCE")
        .await
        .expect("admin should select YCE");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let first_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/tasks?per_page=1")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let second_response = app
        .oneshot(
            Request::builder()
                .uri("/web/tasks?per_page=1&page=2")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(first_response.status(), StatusCode::OK);
    assert_eq!(second_response.status(), StatusCode::OK);
    let first_body = response_body(first_response).await;
    let second_body = response_body(second_response).await;

    assert!(first_body.contains("第 1/2 页"));
    assert!(first_body.contains("显示 1-1，共 2 条，每页 1 条"));
    assert!(first_body.contains("下一页"));
    assert!(first_body.contains("project_key=YCE"));
    assert!(first_body.contains("page=2"));
    assert!(first_body.contains("per_page=1"));
    assert!(first_body.contains("YCE-TASK-1") ^ first_body.contains("YCE-TASK-2"));

    assert!(second_body.contains("第 2/2 页"));
    assert!(second_body.contains("显示 2-2，共 2 条，每页 1 条"));
    assert!(second_body.contains("上一页"));
    assert!(second_body.contains("project_key=YCE"));
    assert!(second_body.contains("per_page=1"));
    assert!(second_body.contains("YCE-TASK-1") ^ second_body.contains("YCE-TASK-2"));
    assert_ne!(
        first_body.contains("YCE-TASK-1"),
        second_body.contains("YCE-TASK-1")
    );
}

#[tokio::test]
async fn web_current_project_rejects_projects_outside_member_scope() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let member = create_regular_user(&pool, "member_yce", "元策成员").await;
    projects::add_project_member(&pool, initialized.user_id, "YCE", "member_yce", "member")
        .await
        .expect("member should join YCE");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let allowed_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/current-project")
                .header(header::COOKIE, with_csrf_cookie(&member.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&project_key=YCE&return_to=%2Fweb%2Ftasks",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(allowed_response.status(), StatusCode::SEE_OTHER);
    let current = projects::get_current_project_for_user(&pool, member.user_id, false)
        .await
        .expect("current project should load")
        .expect("current project should exist");
    assert_eq!(current.project_key, "YCE");

    let forbidden_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/current-project")
                .header(header::COOKIE, with_csrf_cookie(&member.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&project_key=OPS&return_to=%2Fweb%2Ftasks",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(forbidden_response.status(), StatusCode::FORBIDDEN);
    let current = projects::get_current_project_for_user(&pool, member.user_id, false)
        .await
        .expect("current project should load")
        .expect("current project should remain");
    assert_eq!(current.project_key, "YCE");
}

#[tokio::test]
async fn web_current_project_falls_back_for_unsafe_return_paths() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/current-project")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&project_key=YCE&return_to=%2Fwebhook",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(response.headers().get(header::LOCATION).unwrap(), "/web");
}

#[tokio::test]
async fn web_project_pages_redirect_unauthenticated_users_to_login() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/projects")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/login"
    );
}

#[tokio::test]
async fn web_project_detail_renders_project_scope() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/projects/YCE")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;

    assert!(body.contains("元策 MVP"));
    assert!(body.contains("统一项目、需求、任务、Bug 的轻量项目管理系统"));
    assert!(body.contains("YCE-REQ-1"));
    assert!(body.contains("YCE-TASK-2"));
    assert!(body.contains("YCE-BUG-1"));
    assert!(body.contains("项目成员"));
    assert!(body.contains("架构计划已确认"));
    assert!(body.contains(r#"data-modal-open="project-edit-modal""#));
    assert!(body.contains(r#"id="project-edit-modal""#));
}

#[tokio::test]
async fn web_project_detail_tab_query_selects_initial_tab() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/projects/YCE?tab=members")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    assert!(body.contains(r#"data-tabs-sync-url"#));
    assert!(body.contains(r#"data-tab-key="members""#));
    assert!(
        body.contains(
            r#"project-tab-members-trigger" type="button" role="tab" aria-selected="true""#
        )
    );
    assert!(body.contains(r#"id="project-tab-members" class="project-tab-panel active""#));
    assert!(body.contains(r#"id="project-tab-work" class="project-tab-panel " role="tabpanel" aria-labelledby="project-tab-work-trigger" data-tab-panel hidden"#));
}

#[tokio::test]
async fn web_project_detail_returns_404_for_missing_project() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/projects/NOPE")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn web_project_detail_rejects_non_members() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let outsider_cookie = create_regular_user_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/projects/YCE")
                .header(header::COOKIE, outsider_cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn web_project_detail_can_update_project_and_transfer_owner() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    create_regular_user(&pool, "owner2", "项目负责人二").await;
    projects::add_project_member(&pool, initialized.user_id, "YCE", "owner2", "member")
        .await
        .expect("new owner should be a project member");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/projects/YCE/edit")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&name=%E5%85%83%E7%AD%96+%E4%BA%8C%E6%9C%9F&description=%E8%B0%83%E6%95%B4%E5%90%8E%E7%9A%84%E9%A1%B9%E7%9B%AE%E8%AF%B4%E6%98%8E&status=paused&owner_username=owner2&start_date=2026-07-01&due_date=2026-09-30",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/projects/YCE"
    );

    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let members = projects::list_project_members(&pool, project.id)
        .await
        .expect("members should load");
    let activities = projects::list_project_activities(&pool, project.id, 10)
        .await
        .expect("activities should load");

    assert_eq!(project.name, "元策 二期");
    assert_eq!(project.description, "调整后的项目说明");
    assert_eq!(project.status, "paused");
    assert_eq!(project.owner_username, "owner2");
    assert_eq!(project.start_date, "2026-07-01");
    assert_eq!(project.due_date, "2026-09-30");
    assert!(
        members
            .iter()
            .any(|member| member.username == "owner2" && member.member_role == "owner")
    );
    assert!(
        members
            .iter()
            .any(|member| member.username == "admin" && member.member_role == "maintainer")
    );
    assert!(
        activities
            .iter()
            .any(|activity| activity.summary == "更新项目 元策 二期")
    );

    let detail_response = app
        .oneshot(
            Request::builder()
                .uri("/web/projects/YCE")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let body = response_body(detail_response).await;
    assert!(body.contains("元策 二期"));
    assert!(body.contains("调整后的项目说明"));
    assert!(body.contains("项目负责人二"));
    assert!(body.contains("暂停"));
}

#[tokio::test]
async fn work_item_detail_partial_renders_comments() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/partials/work-items/YCE-TASK-2")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;

    assert!(body.contains("设计项目与工作项数据模型"));
    assert!(body.contains("先统一项目与工作项查询模型"));
    assert!(body.contains("负责人"));
    assert!(body.contains("P0"));
}

#[tokio::test]
async fn web_work_item_detail_page_renders_full_shell() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/work-items/YCE-TASK-2")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;

    assert!(body.contains("元策工作台"));
    assert!(body.contains("YCE-TASK-2"));
    assert!(body.contains("标记完成"));
    assert!(body.contains(r#"data-modal-open="work-item-edit-modal""#));
    assert!(body.contains(r#"id="work-item-edit-modal""#));
    assert!(body.contains(r#"id="work-item-comment-modal""#));
    assert!(body.contains(r#"id="work-item-attachment-modal""#));
    assert!(body.contains("编辑工作项"));
    assert!(body.contains("新增评论"));
    assert!(body.contains("先统一项目与工作项查询模型"));
}

#[tokio::test]
async fn work_items_partial_filters_demo_items_by_type() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/partials/work-items?kind=bug")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;

    assert!(body.contains("YCE-BUG-1"));
    assert!(body.contains("CRM-BUG-1"));
    assert!(!body.contains("YCE-REQ-1"));
    assert!(!body.contains("YCE-TASK-2"));
}

#[tokio::test]
async fn work_items_partial_rejects_unknown_type() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/partials/work-items?kind=story")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn web_me_page_renders_profile_projects_and_assigned_items() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/me")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;

    assert!(body.contains("个人工作区"));
    assert!(body.contains("@admin"));
    assert!(body.contains("元策 MVP"));
    assert!(body.contains("YCE-TASK-2"));
    assert!(body.contains("编辑资料"));
    assert!(body.contains("修改密码"));
}

#[tokio::test]
async fn web_me_can_update_profile_and_change_password() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let profile_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/me/profile")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&display_name=%E7%AE%A1%E7%90%86%E5%91%98%E6%96%B0%E5%90%8D%E7%A7%B0&email=admin%40yuance.test&mobile=13800000000",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(profile_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        profile_response.headers().get(header::LOCATION).unwrap(),
        "/web/me"
    );
    let profile = users::get_user_summary(&pool, initialized.user_id)
        .await
        .expect("profile should load")
        .expect("profile should exist");
    assert_eq!(profile.display_name, "管理员新名称");
    assert_eq!(profile.email, "admin@yuance.test");
    assert_eq!(profile.mobile, "13800000000");

    let password_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/me/password")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&current_password=AdminPass2026%21&new_password=NewAdminPass2026%21&new_password_confirm=NewAdminPass2026%21",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(password_response.status(), StatusCode::SEE_OTHER);
    assert!(auth::login(&pool, "admin", "AdminPass2026!").await.is_err());
    assert!(
        auth::login(&pool, "admin", "NewAdminPass2026!")
            .await
            .is_ok()
    );

    let current_session_response = app
        .oneshot(
            Request::builder()
                .uri("/web/me")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(current_session_response.status(), StatusCode::OK);
}

#[tokio::test]
async fn web_search_finds_visible_projects_and_work_items() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/search?q=%2Fweb")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;

    assert!(body.contains("全局搜索"));
    assert!(body.contains("YCE-REQ-1"));
    assert!(body.contains("统一 /web 用户工作台与系统管理入口"));
}

#[tokio::test]
async fn web_search_respects_project_membership_scope() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let outsider_cookie = create_regular_user_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/search?q=YCE")
                .header(header::COOKIE, outsider_cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;

    assert!(body.contains("没有找到结果"));
    assert!(!body.contains("元策 MVP"));
    assert!(!body.contains("YCE-TASK-2"));
}

#[tokio::test]
async fn api_v1_lists_projects_and_work_items_for_authenticated_user() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let projects_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/projects")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let work_items_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-items?item_type=bug&project_key=YCE")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(projects_response.status(), StatusCode::OK);
    assert_eq!(work_items_response.status(), StatusCode::OK);
    let projects_body = response_body(projects_response).await;
    let work_items_body = response_body(work_items_response).await;

    assert!(projects_body.contains("\"key\":\"YCE\""));
    assert!(projects_body.contains("\"name\":\"元策 MVP\""));
    assert!(projects_body.contains("\"items\""));
    assert!(projects_body.contains("\"pagination\""));
    assert!(work_items_body.contains("\"key\":\"YCE-BUG-1\""));
    assert!(work_items_body.contains("\"item_type\":\"bug\""));
    assert!(!work_items_body.contains("\"key\":\"YCE-TASK-2\""));
}

#[tokio::test]
async fn api_v1_projects_returns_pagination_metadata_and_status_filter() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/projects?status=paused&page=1&per_page=1")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;

    assert!(body.contains("\"key\":\"CRM\""));
    assert!(!body.contains("\"key\":\"YCE\""));
    assert!(body.contains("\"page\":1"));
    assert!(body.contains("\"per_page\":1"));
    assert!(body.contains("\"total_items\":1"));
    assert!(body.contains("\"total_pages\":1"));
}

#[tokio::test]
async fn api_v1_filters_work_items_by_query_status_priority_project_and_assignee() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-items?item_type=task&q=%E6%95%B0%E6%8D%AE%E6%A8%A1%E5%9E%8B&status=in_progress&priority=P0&project_key=YCE&assignee_username=admin")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;

    assert!(body.contains("\"key\":\"YCE-TASK-2\""));
    assert!(body.contains("设计项目与工作项数据模型"));
    assert!(!body.contains("\"key\":\"YCE-TASK-1\""));
    assert!(!body.contains("\"key\":\"OPS-TASK-1\""));
}

#[tokio::test]
async fn api_v1_work_items_returns_pagination_metadata() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-items?item_type=task&project_key=YCE&page=2&per_page=1")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;

    assert!(body.contains(r#""items":["#));
    assert!(
        body.contains(r#""pagination":{"page":2,"per_page":1,"total_items":2,"total_pages":2}"#)
    );
    assert!(body.contains("YCE-TASK-1") ^ body.contains("YCE-TASK-2"));
    assert!(!body.contains("OPS-TASK-1"));
}

#[tokio::test]
async fn api_v1_current_project_controls_default_work_item_scope() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let initial_current_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/current-project")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(initial_current_response.status(), StatusCode::OK);
    let initial_current_body = response_body(initial_current_response).await;
    assert!(initial_current_body.contains(r#""key":"YCE""#));

    let unscoped_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-items?item_type=task")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(unscoped_response.status(), StatusCode::OK);
    let unscoped_body = response_body(unscoped_response).await;
    assert!(unscoped_body.contains(r#""key":"YCE-TASK-2""#));
    assert!(!unscoped_body.contains(r#""key":"OPS-TASK-1""#));

    let update_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/current-project")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"project_key":"OPS"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(update_response.status(), StatusCode::OK);
    let update_body = response_body(update_response).await;
    assert!(update_body.contains(r#""key":"OPS""#));

    let current = projects::get_current_project_for_user(&pool, initialized.user_id, true)
        .await
        .expect("current project should load")
        .expect("current project should exist");
    assert_eq!(current.project_key, "OPS");

    let default_scoped_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-items?item_type=task")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(default_scoped_response.status(), StatusCode::OK);
    let default_scoped_body = response_body(default_scoped_response).await;
    assert!(default_scoped_body.contains(r#""key":"OPS-TASK-1""#));
    assert!(!default_scoped_body.contains(r#""key":"YCE-TASK-2""#));

    let explicit_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-items?item_type=task&project_key=YCE")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(explicit_response.status(), StatusCode::OK);
    let explicit_body = response_body(explicit_response).await;
    assert!(explicit_body.contains(r#""key":"YCE-TASK-2""#));
    assert!(!explicit_body.contains(r#""key":"OPS-TASK-1""#));
}

#[tokio::test]
async fn api_v1_current_project_rejects_projects_outside_member_scope() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let member = create_regular_user(&pool, "api_current_yce", "API 当前项目成员").await;
    projects::add_project_member(
        &pool,
        initialized.user_id,
        "YCE",
        "api_current_yce",
        "member",
    )
    .await
    .expect("member should join YCE");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let allowed_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/current-project")
                .header(header::COOKIE, member.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"project_key":"YCE"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(allowed_response.status(), StatusCode::OK);

    let forbidden_response = app
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/current-project")
                .header(header::COOKIE, member.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"project_key":"OPS"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(forbidden_response.status(), StatusCode::FORBIDDEN);

    let current = projects::get_current_project_for_user(&pool, member.user_id, false)
        .await
        .expect("current project should load")
        .expect("current project should remain");
    assert_eq!(current.project_key, "YCE");
}

#[tokio::test]
async fn project_and_work_item_read_paths_require_rbac_view_permissions() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    rbac::create_role(&pool, "no_business_view", "无业务查看权限", "self")
        .await
        .expect("role should create");
    let restricted =
        create_user_with_role(&pool, "no_view_user", "无查看权限成员", "no_business_view").await;
    projects::add_project_member(&pool, initialized.user_id, "YCE", "no_view_user", "member")
        .await
        .expect("restricted user should join YCE");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let checks = [
        ("GET", "/web/projects", None),
        ("GET", "/web/projects/YCE", None),
        ("GET", "/web/tasks", None),
        ("GET", "/web/work-items/YCE-TASK-2", None),
        ("GET", "/web/partials/work-items", None),
        (
            "POST",
            "/web/current-project",
            Some(
                "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&project_key=YCE&return_to=/web",
            ),
        ),
        ("GET", "/api/v1/projects", None),
        ("GET", "/api/v1/projects/YCE", None),
        ("GET", "/api/v1/projects/YCE/members", None),
        ("GET", "/api/v1/work-items?project_key=YCE", None),
        ("GET", "/api/v1/work-items/YCE-TASK-2", None),
        ("GET", "/api/v1/work-items/YCE-TASK-2/comments", None),
    ];

    for (method, uri, body) in checks {
        let mut builder = Request::builder()
            .method(method)
            .uri(uri)
            .header(header::COOKIE, restricted.cookie.clone());
        if body.is_some() {
            builder = builder.header(header::CONTENT_TYPE, "application/x-www-form-urlencoded");
        }
        let response = app
            .clone()
            .oneshot(
                builder
                    .body(match body {
                        Some(body) => Body::from(body.to_string()),
                        None => Body::empty(),
                    })
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::FORBIDDEN, "{method} {uri}");
    }

    let denied_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM audit_logs WHERE action = 'permission.denied'",
    )
    .fetch_one(&pool)
    .await
    .expect("audit count should load");
    assert!(denied_count >= 1);
}

#[tokio::test]
async fn api_v1_project_detail_rejects_non_members() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let outsider_cookie = create_regular_user_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/projects/YCE")
                .header(header::COOKIE, outsider_cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn api_v1_can_archive_and_restore_project() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let archive_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/projects/YCE")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"status":"archived","start_date":"2026-07-01","due_date":"2026-09-30"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(archive_response.status(), StatusCode::OK);
    let archive_body = response_body(archive_response).await;
    assert!(archive_body.contains("\"status\":\"archived\""));
    assert!(archive_body.contains("\"start_date\":\"2026-07-01\""));
    assert!(archive_body.contains("\"due_date\":\"2026-09-30\""));

    let restore_response = app
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/projects/YCE")
                .header(header::COOKIE, initialized.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"status":"active"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(restore_response.status(), StatusCode::OK);
    let restore_body = response_body(restore_response).await;
    assert!(restore_body.contains("\"status\":\"active\""));

    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    assert_eq!(project.status, "active");
    assert_eq!(project.start_date, "2026-07-01");
    assert_eq!(project.due_date, "2026-09-30");
}

#[tokio::test]
async fn api_v1_rejects_project_owner_outside_project() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    create_regular_user(&pool, "outside_owner", "外部负责人").await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/projects/YCE")
                .header(header::COOKIE, initialized.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"name":"非法负责人项目","owner_username":"outside_owner"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    assert_eq!(project.name, "元策 MVP");
    assert_eq!(project.owner_username, "admin");
}

#[tokio::test]
async fn api_v1_requires_authentication() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/projects")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    let mutation_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    r#"{"project_key":"NOAUTH","name":"未登录写入"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(mutation_response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn web_admin_can_create_project_and_redirect_to_detail() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/projects")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&project_key=NEW&name=%E6%96%B0%E9%A1%B9%E7%9B%AE&description=%E7%94%A8%E4%BA%8E%E9%AA%8C%E8%AF%81%E5%86%99%E5%85%A5%E9%97%AD%E7%8E%AF&status=active&start_date=2026-07-01&due_date=2026-08-31",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/projects/NEW"
    );

    let project = projects::get_project_detail(&pool, "NEW")
        .await
        .expect("project should load")
        .expect("project should exist");
    assert_eq!(project.name, "新项目");
    assert_eq!(project.start_date, "2026-07-01");
    assert_eq!(project.due_date, "2026-08-31");
    assert!(
        projects::is_project_member(&pool, project.id, initialized.user_id)
            .await
            .expect("membership should load")
    );
}

#[tokio::test]
async fn web_project_create_rejects_due_date_before_start_date() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/projects")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&project_key=BADDATE&name=%E6%97%A5%E6%9C%9F%E9%94%99%E8%AF%AF&description=&status=active&start_date=2026-09-30&due_date=2026-07-01",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let exists = projects::get_project_detail(&pool, "BADDATE")
        .await
        .expect("project lookup should succeed")
        .is_some();
    assert!(!exists);
}

#[tokio::test]
async fn web_member_can_create_work_item_in_joined_project() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&project_key=YCE&item_type=task&title=%E8%A1%A5%E5%85%85%E5%86%99%E5%85%A5%E9%97%AD%E7%8E%AF&description=%E4%BB%8E%E9%A1%B5%E9%9D%A2%E5%88%B0%E6%95%B0%E6%8D%AE%E5%BA%93%E7%9A%84%E6%9C%80%E5%B0%8F%E9%97%AD%E7%8E%AF&priority=P1&due_date=2026-07-15",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    let location = response
        .headers()
        .get(header::LOCATION)
        .expect("location should exist")
        .to_str()
        .expect("location should be str")
        .to_string();
    assert!(
        location.starts_with("/web/work-items/YCE-TASK-"),
        "unexpected redirect: {location}"
    );

    let item_key = location.trim_start_matches("/web/work-items/").to_string();
    let item = projects::get_work_item_detail(&pool, &item_key)
        .await
        .expect("work item should load")
        .expect("work item should exist");
    assert_eq!(item.title, "补充写入闭环");
    assert_eq!(item.status, "open");
    assert_eq!(item.priority, "P1");
    assert_eq!(item.due_date, "2026-07-15");
}

#[tokio::test]
async fn api_v1_rejects_invalid_work_item_due_date() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/work-items/YCE-TASK-2")
                .header(header::COOKIE, initialized.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"due_date":"2026-02-30"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    assert!(item.due_date.is_empty());
}

#[tokio::test]
async fn web_project_detail_can_create_work_item_and_return_to_project() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let page_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/projects/YCE")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(page_response.status(), StatusCode::OK);
    let page_body = response_body(page_response).await;
    assert!(page_body.contains(r#"data-modal-open="project-work-item-create-modal""#));
    assert!(page_body.contains(r#"id="project-work-item-create-modal""#));
    assert!(page_body.contains(r#"id="project-member-add-modal""#));
    assert!(page_body.contains(r#"id="project-attachment-create-modal""#));
    assert!(page_body.contains("项目内新建工作项"));
    assert!(page_body.contains(r#"name="redirect_to" value="project""#));
    assert!(page_body.contains("父级需求"));
    assert!(page_body.contains("YCE-REQ-1"));

    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&project_key=YCE&item_type=task&title=%E9%A1%B9%E7%9B%AE%E5%86%85%E6%96%B0%E5%BB%BA%E4%BB%BB%E5%8A%A1&description=%E4%BB%8E%E9%A1%B9%E7%9B%AE%E8%AF%A6%E6%83%85%E9%A1%B5%E7%9B%B4%E6%8E%A5%E5%86%99%E5%85%A5&priority=P2&parent_item_key=YCE-REQ-1&redirect_to=project",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(create_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        create_response.headers().get(header::LOCATION).unwrap(),
        "/web/projects/YCE"
    );

    let detail_response = app
        .oneshot(
            Request::builder()
                .uri("/web/projects/YCE")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(detail_response.status(), StatusCode::OK);
    let detail_body = response_body(detail_response).await;
    let task = projects::get_work_item_detail(&pool, "YCE-TASK-3")
        .await
        .expect("task should load")
        .expect("task should exist");

    assert_eq!(task.title, "项目内新建任务");
    assert_eq!(task.parent_item_key, "YCE-REQ-1");
    assert_eq!(task.parent_title, "统一 /web 用户工作台与系统管理入口");
    assert!(detail_body.contains("项目内新建任务"));
    assert!(detail_body.contains("YCE-TASK-3"));
    assert!(detail_body.contains("创建工作项"));
}

#[tokio::test]
async fn web_work_item_detail_can_transition_status_and_add_comment() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let status_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items/YCE-TASK-2/status")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&status=done",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let comment_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items/YCE-TASK-2/comments")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&body=%E8%BF%99%E6%9D%A1%E8%AF%84%E8%AE%BA%E7%94%A8%E4%BA%8E%E9%AA%8C%E8%AF%81%E9%97%AD%E7%8E%AF",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(status_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(comment_response.status(), StatusCode::SEE_OTHER);

    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    let comments = projects::list_work_item_comments(&pool, item.id)
        .await
        .expect("comments should load");

    assert_eq!(item.status, "done");
    assert!(
        comments
            .iter()
            .any(|comment| comment.body == "这条评论用于验证闭环")
    );
}

#[tokio::test]
async fn work_item_status_machine_rejects_invalid_shortcuts_and_shapes_page_actions() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let invalid_close_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/work-items/OPS-TASK-1")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"status":"closed"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(invalid_close_response.status(), StatusCode::BAD_REQUEST);

    let open_page = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/work-items/OPS-TASK-1")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(open_page.status(), StatusCode::OK);
    let open_body = response_body(open_page).await;
    assert!(open_body.contains("开始处理"));
    assert!(open_body.contains("取消工作项"));
    assert!(!open_body.contains(r#"name="status" value="done""#));
    assert!(!open_body.contains(r#"name="status" value="closed""#));

    let start_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items/OPS-TASK-1/status")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&status=in_progress",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(start_response.status(), StatusCode::SEE_OTHER);

    let progress_page = app
        .oneshot(
            Request::builder()
                .uri("/web/work-items/OPS-TASK-1")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(progress_page.status(), StatusCode::OK);
    let progress_body = response_body(progress_page).await;
    assert!(progress_body.contains("标记完成"));
    assert!(progress_body.contains("标记解决"));
    assert!(progress_body.contains("退回待处理"));
}

#[tokio::test]
async fn web_work_item_detail_can_edit_and_delete_comment() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let member = create_regular_user(&pool, "comment_member", "评论成员").await;
    let maintainer = create_regular_user(&pool, "comment_maintainer", "评论维护者").await;
    projects::add_project_member(
        &pool,
        initialized.user_id,
        "YCE",
        "comment_member",
        "member",
    )
    .await
    .expect("member should be added");
    projects::add_project_member(
        &pool,
        initialized.user_id,
        "YCE",
        "comment_maintainer",
        "maintainer",
    )
    .await
    .expect("maintainer should be added");
    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    let comment_id =
        projects::add_work_item_comment(&pool, initialized.user_id, "YCE-TASK-2", "待编辑评论")
            .await
            .expect("comment should create")
            .id;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let member_edit_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/web/work-items/YCE-TASK-2/comments/{comment_id}/edit"))
                .header(header::COOKIE, with_csrf_cookie(&member.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&body=%E6%88%90%E5%91%98%E4%B8%8D%E8%83%BD%E7%BC%96%E8%BE%91%E4%BB%96%E4%BA%BA%E8%AF%84%E8%AE%BA",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(member_edit_response.status(), StatusCode::FORBIDDEN);

    let member_delete_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/web/work-items/YCE-TASK-2/comments/{comment_id}/delete"
                ))
                .header(header::COOKIE, with_csrf_cookie(&member.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(member_delete_response.status(), StatusCode::FORBIDDEN);

    let member_detail_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/work-items/YCE-TASK-2")
                .header(header::COOKIE, member.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let member_detail_body = response_body(member_detail_response).await;
    assert!(member_detail_body.contains("待编辑评论"));
    assert!(!member_detail_body.contains(&format!("work-item-comment-edit-modal-{comment_id}")));
    assert!(!member_detail_body.contains(&format!(
        "/web/work-items/YCE-TASK-2/comments/{comment_id}/delete"
    )));

    let maintainer_edit_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/web/work-items/YCE-TASK-2/comments/{comment_id}/edit"))
                .header(header::COOKIE, with_csrf_cookie(&maintainer.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&body=%E7%BB%B4%E6%8A%A4%E8%80%85%E5%B7%B2%E7%BC%96%E8%BE%91%E8%AF%84%E8%AE%BA",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(maintainer_edit_response.status(), StatusCode::SEE_OTHER);

    let edited_by_maintainer = projects::get_work_item_comment(&pool, item.id, comment_id)
        .await
        .expect("comment should load");
    assert_eq!(edited_by_maintainer.body, "维护者已编辑评论");

    let edit_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/web/work-items/YCE-TASK-2/comments/{comment_id}/edit"))
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&body=%E5%B7%B2%E7%BC%96%E8%BE%91%E8%AF%84%E8%AE%BA",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(edit_response.status(), StatusCode::SEE_OTHER);

    let edited = projects::get_work_item_comment(&pool, item.id, comment_id)
        .await
        .expect("comment should load");
    assert_eq!(edited.body, "已编辑评论");

    let detail_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/work-items/YCE-TASK-2")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let detail_body = response_body(detail_response).await;
    assert!(detail_body.contains("已编辑评论"));
    assert!(detail_body.contains("编辑评论"));
    assert!(detail_body.contains("删除"));

    let delete_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/web/work-items/YCE-TASK-2/comments/{comment_id}/delete"
                ))
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let comments = projects::list_work_item_comments(&pool, item.id)
        .await
        .expect("comments should load");
    let activities = projects::list_project_activities_by_key(&pool, "YCE", 10)
        .await
        .expect("activities should load");

    assert_eq!(delete_response.status(), StatusCode::SEE_OTHER);
    assert!(comments.iter().all(|comment| comment.id != comment_id));
    assert!(
        activities
            .iter()
            .any(|activity| activity.summary == "删除工作项 YCE-TASK-2 评论")
    );
}

#[tokio::test]
async fn web_work_item_detail_can_edit_core_fields_and_assignee() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    create_regular_user(&pool, "editor", "编辑成员").await;
    projects::add_project_member(&pool, initialized.user_id, "YCE", "editor", "member")
        .await
        .expect("member should be added");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items/YCE-TASK-2/edit")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&title=Edited+Task&description=Edited+description&status=in_progress&priority=P3&assignee_username=editor&due_date=2026-07-20&parent_item_key=YCE-REQ-1",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/work-items/YCE-TASK-2"
    );

    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    let activities = projects::list_project_activities(&pool, 1, 10)
        .await
        .expect("activities should load");

    assert_eq!(item.title, "Edited Task");
    assert_eq!(item.description, "Edited description");
    assert_eq!(item.status, "in_progress");
    assert_eq!(item.priority, "P3");
    assert_eq!(item.assignee_username, "editor");
    assert_eq!(item.assignee_display_name, "编辑成员");
    assert_eq!(item.due_date, "2026-07-20");
    assert_eq!(item.parent_item_key, "YCE-REQ-1");
    assert!(
        activities
            .iter()
            .any(|activity| activity.summary == "更新工作项 YCE-TASK-2")
    );
}

#[tokio::test]
async fn web_project_detail_can_register_project_attachment() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_memory_storage_config(&pool, initialized.user_id).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/projects/YCE/attachments")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&original_filename=roadmap.pdf&content_type=application%2Fpdf&byte_size=2048",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/projects/YCE"
    );

    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let attachments = files::list_attachments(&pool, "project", project.id)
        .await
        .expect("attachments should load");
    let activities = projects::list_project_activities(&pool, project.id, 10)
        .await
        .expect("activities should load");
    assert_eq!(attachments.len(), 1);
    assert_eq!(attachments[0].original_filename, "roadmap.pdf");
    assert_eq!(attachments[0].content_type, "application/pdf");
    assert_eq!(attachments[0].byte_size, 2048);
    assert!(
        activities
            .iter()
            .any(|activity| activity.summary == "登记项目附件 roadmap.pdf")
    );

    let detail_response = app
        .oneshot(
            Request::builder()
                .uri("/web/projects/YCE")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let body = response_body(detail_response).await;

    assert!(body.contains("项目附件"));
    assert!(body.contains("roadmap.pdf"));
    assert!(body.contains("application/pdf"));
    assert!(body.contains(r#"data-direct-upload"#));
    assert!(body.contains(r#"data-attachment-create-url="/api/v1/projects/YCE/attachments""#));
    assert!(body.contains(
        r#"data-attachment-upload-url-template="/api/v1/projects/YCE/attachments/{id}/upload-url""#
    ));
    assert!(body.contains(
        r#"data-attachment-complete-url-template="/api/v1/projects/YCE/attachments/{id}/uploaded""#
    ));
    assert!(body.contains(r#"data-attachment-file"#));
    assert!(body.contains("文件不会经过应用服务器中转"));
    assert!(body.contains("/api/v1/projects/YCE/attachments/"));
    assert!(body.contains("/upload-url"));
    assert!(body.contains(r#"data-existing-attachment-id=""#));
    assert!(body.contains(r#"class="inline-form attachment-resume-form""#));
    assert!(body.contains("继续上传"));
    assert!(body.contains("选择文件后继续上传"));
    assert!(body.contains("上传完成后可下载"));
    assert!(body.contains("/delete"));
    assert!(body.contains(r#"data-confirm-submit-form"#));
    assert!(!body.contains(r#">上传签名</a>"#));
}

#[tokio::test]
async fn web_work_item_detail_can_register_work_item_attachment() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_memory_storage_config(&pool, initialized.user_id).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items/YCE-TASK-2/attachments")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&original_filename=screenshot.png&content_type=image%2Fpng&byte_size=4096",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/work-items/YCE-TASK-2"
    );

    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    let attachments = files::list_attachments(&pool, "work_item", item.id)
        .await
        .expect("attachments should load");
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let activities = projects::list_project_activities(&pool, project.id, 10)
        .await
        .expect("activities should load");
    assert_eq!(attachments.len(), 1);
    assert_eq!(attachments[0].original_filename, "screenshot.png");
    assert_eq!(attachments[0].content_type, "image/png");
    assert_eq!(attachments[0].byte_size, 4096);
    assert!(
        activities
            .iter()
            .any(|activity| activity.summary == "登记工作项附件 screenshot.png")
    );

    let detail_response = app
        .oneshot(
            Request::builder()
                .uri("/web/work-items/YCE-TASK-2")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let body = response_body(detail_response).await;

    assert!(body.contains("附件"));
    assert!(body.contains("screenshot.png"));
    assert!(body.contains("image/png"));
    assert!(body.contains(r#"data-direct-upload"#));
    assert!(
        body.contains(r#"data-attachment-create-url="/api/v1/work-items/YCE-TASK-2/attachments""#)
    );
    assert!(body.contains(r#"data-attachment-upload-url-template="/api/v1/work-items/YCE-TASK-2/attachments/{id}/upload-url""#));
    assert!(body.contains(r#"data-attachment-complete-url-template="/api/v1/work-items/YCE-TASK-2/attachments/{id}/uploaded""#));
    assert!(body.contains(r#"data-attachment-file"#));
    assert!(body.contains("文件不会经过应用服务器中转"));
    assert!(body.contains("/api/v1/work-items/YCE-TASK-2/attachments/"));
    assert!(body.contains("/upload-url"));
    assert!(body.contains(r#"data-existing-attachment-id=""#));
    assert!(body.contains(r#"class="inline-form attachment-resume-form""#));
    assert!(body.contains("继续上传"));
    assert!(body.contains("选择文件后继续上传"));
    assert!(body.contains("上传完成后可下载"));
    assert!(body.contains("/delete"));
    assert!(body.contains(r#"data-confirm-title="删除工作项附件""#));
    assert!(!body.contains(r#">上传签名</a>"#));
}

#[tokio::test]
async fn web_work_item_detail_can_register_comment_attachment() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_memory_storage_config(&pool, initialized.user_id).await;
    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    let comment = projects::list_work_item_comments(&pool, item.id)
        .await
        .expect("comments should load")
        .into_iter()
        .next()
        .expect("demo comment should exist");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/web/work-items/YCE-TASK-2/comments/{}/attachments",
                    comment.id
                ))
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&original_filename=comment-log.txt&content_type=text%2Fplain&byte_size=512",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/work-items/YCE-TASK-2"
    );

    let attachments = files::list_attachments(&pool, "comment", comment.id)
        .await
        .expect("comment attachments should load");
    assert_eq!(attachments.len(), 1);
    assert_eq!(attachments[0].original_filename, "comment-log.txt");
    assert_eq!(attachments[0].content_type, "text/plain");
    assert_eq!(attachments[0].byte_size, 512);

    let detail_response = app
        .oneshot(
            Request::builder()
                .uri("/web/work-items/YCE-TASK-2")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let body = response_body(detail_response).await;

    assert!(body.contains("上传评论附件"));
    assert!(body.contains("comment-log.txt"));
    assert!(
        body.contains(r#"data-attachment-create-url="/api/v1/work-items/YCE-TASK-2/comments/"#)
    );
    assert!(body.contains("/comments/"));
    assert!(body.contains("/attachments/{id}/upload-url"));
    assert!(body.contains("/attachments/{id}/uploaded"));
}

#[tokio::test]
async fn api_v1_can_register_project_attachment() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_active_storage_config(&pool, initialized.user_id).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects/YCE/attachments")
                .header(header::COOKIE, initialized.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"original_filename":"api-roadmap.pdf","content_type":"application/pdf","byte_size":2048}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::CREATED);
    let body = response_body(response).await;
    assert!(body.contains(r#""filename":"api-roadmap.pdf""#));
    assert!(body.contains(r#""content_type":"application/pdf""#));
    assert!(body.contains(r#""byte_size":2048"#));
    assert!(body.contains(r#""status":"pending""#));
    assert!(!body.contains("Unit5SecretValue2026"));

    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let attachments = files::list_attachments(&pool, "project", project.id)
        .await
        .expect("attachments should load");
    let activities = projects::list_project_activities(&pool, project.id, 10)
        .await
        .expect("activities should load");
    assert_eq!(attachments.len(), 1);
    assert_eq!(attachments[0].original_filename, "api-roadmap.pdf");
    assert!(
        activities
            .iter()
            .any(|activity| activity.summary == "登记项目附件 api-roadmap.pdf")
    );
}

#[tokio::test]
async fn api_v1_can_register_comment_attachment() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_memory_storage_config(&pool, initialized.user_id).await;
    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    let comment = projects::list_work_item_comments(&pool, item.id)
        .await
        .expect("comments should load")
        .into_iter()
        .next()
        .expect("demo comment should exist");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{}/attachments",
                    comment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"original_filename":"api-comment-log.txt","content_type":"text/plain","byte_size":256}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::CREATED);
    let body = response_body(response).await;
    assert!(body.contains(r#""filename":"api-comment-log.txt""#));
    assert!(body.contains(r#""status":"pending""#));

    let attachments = files::list_attachments(&pool, "comment", comment.id)
        .await
        .expect("comment attachments should load");
    assert_eq!(attachments.len(), 1);
    let attachment_id = attachments[0].id;
    write_test_object(&pool, &attachments[0])
        .await
        .expect("test object should write");

    let uploaded_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{}/attachments/{}/uploaded",
                    comment.id, attachment_id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(uploaded_response.status(), StatusCode::OK);
    let uploaded_body = response_body(uploaded_response).await;
    assert!(uploaded_body.contains(r#""status":"uploaded""#));

    let delete_response = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{}/attachments/{}",
                    comment.id, attachment_id
                ))
                .header(header::COOKIE, initialized.cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(delete_response.status(), StatusCode::OK);
    let delete_body = response_body(delete_response).await;
    assert!(delete_body.contains(r#""status":"deleted""#));
}

#[tokio::test]
async fn api_v1_project_attachment_subflows_require_rbac_permissions() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_memory_storage_config(&pool, initialized.user_id).await;
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    let attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "rbac-project.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 128,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记项目附件 rbac-project.pdf".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    write_test_object(&pool, &attachment)
        .await
        .expect("test object should write");

    rbac::create_role(&pool, "project_view_only", "项目只读", "self")
        .await
        .expect("role should create");
    rbac::replace_role_permissions(&pool, "project_view_only", &["project.view".to_string()])
        .await
        .expect("role permissions should replace");
    let view_only = create_user_with_role(
        &pool,
        "project_view_only_user",
        "项目只读成员",
        "project_view_only",
    )
    .await;
    projects::add_project_member(
        &pool,
        initialized.user_id,
        "YCE",
        "project_view_only_user",
        "maintainer",
    )
    .await
    .expect("view-only user should join YCE");

    rbac::create_role(&pool, "work_manage_only", "工作项管理无查看", "self")
        .await
        .expect("role should create");
    rbac::replace_role_permissions(&pool, "work_manage_only", &["work_item.manage".to_string()])
        .await
        .expect("role permissions should replace");
    let manage_only = create_user_with_role(
        &pool,
        "work_manage_only_user",
        "工作项管理成员",
        "work_manage_only",
    )
    .await;
    projects::add_project_member(
        &pool,
        initialized.user_id,
        "YCE",
        "work_manage_only_user",
        "maintainer",
    )
    .await
    .expect("manage-only user should join YCE");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let upload_url_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/projects/YCE/attachments/{}/upload-url",
                    attachment.id
                ))
                .header(header::COOKIE, view_only.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(upload_url_response.status(), StatusCode::FORBIDDEN);

    let uploaded_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/v1/projects/YCE/attachments/{}/uploaded",
                    attachment.id
                ))
                .header(header::COOKIE, view_only.cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(uploaded_response.status(), StatusCode::FORBIDDEN);

    let delete_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!(
                    "/api/v1/projects/YCE/attachments/{}",
                    attachment.id
                ))
                .header(header::COOKIE, view_only.cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(delete_response.status(), StatusCode::FORBIDDEN);

    let download_response = app
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/projects/YCE/attachments/{}/download-url",
                    attachment.id
                ))
                .header(header::COOKIE, manage_only.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(download_response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn api_v1_attachment_download_urls_write_audit_logs() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_active_storage_config(&pool, initialized.user_id).await;
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    let comment = projects::list_work_item_comments(&pool, item.id)
        .await
        .expect("comments should load")
        .into_iter()
        .next()
        .expect("demo comment should exist");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    let project_attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "api-project-download.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 128,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记项目附件 api-project-download.pdf".to_string()),
        },
    )
    .await
    .expect("project attachment should create");
    let work_item_attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "api-work-download.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 256,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记工作项附件 api-work-download.png".to_string()),
        },
    )
    .await
    .expect("work item attachment should create");
    let comment_attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "comment".to_string(),
            target_id: comment.id,
            project_id: Some(project.id),
            original_filename: "api-comment-download.txt".to_string(),
            content_type: "text/plain".to_string(),
            byte_size: 64,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记评论附件 api-comment-download.txt".to_string()),
        },
    )
    .await
    .expect("comment attachment should create");
    files::mark_attachment_uploaded(&pool, project_attachment.id, "project", project.id)
        .await
        .expect("project attachment should mark uploaded");
    files::mark_attachment_uploaded(&pool, work_item_attachment.id, "work_item", item.id)
        .await
        .expect("work item attachment should mark uploaded");
    files::mark_attachment_uploaded(&pool, comment_attachment.id, "comment", comment.id)
        .await
        .expect("comment attachment should mark uploaded");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let project_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/projects/YCE/attachments/{}/download-url",
                    project_attachment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(project_response.status(), StatusCode::OK);

    let work_item_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/attachments/{}/download-url",
                    work_item_attachment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(work_item_response.status(), StatusCode::OK);

    let comment_response = app
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{}/attachments/{}/download-url",
                    comment.id, comment_attachment.id
                ))
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(comment_response.status(), StatusCode::OK);

    let rows = sqlx::query_as::<_, (String, String)>(
        r#"
        SELECT target_type, target_id
        FROM audit_logs
        WHERE action = 'file.download.url'
        ORDER BY id ASC
        "#,
    )
    .fetch_all(&pool)
    .await
    .expect("download url audit rows should load");
    assert_eq!(rows.len(), 3);
    assert!(rows.iter().any(|row| row.0 == "project" && row.1 == "YCE"));
    assert!(
        rows.iter()
            .any(|row| row.0 == "work_item" && row.1 == "YCE-TASK-2")
    );
    assert!(
        rows.iter()
            .any(|row| row.0 == "comment" && row.1 == comment.id.to_string())
    );
}

#[tokio::test]
async fn api_v1_work_item_attachment_create_respects_write_scope() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_active_storage_config(&pool, initialized.user_id).await;
    let viewer = create_regular_user(&pool, "api_file_viewer", "API 附件只读成员").await;
    projects::add_project_member(
        &pool,
        initialized.user_id,
        "YCE",
        "api_file_viewer",
        "viewer",
    )
    .await
    .expect("viewer should be added");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let viewer_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items/YCE-TASK-2/attachments")
                .header(header::COOKIE, viewer.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"original_filename":"viewer.png","content_type":"image/png","byte_size":512}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(viewer_response.status(), StatusCode::FORBIDDEN);

    let admin_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items/YCE-TASK-2/attachments")
                .header(header::COOKIE, initialized.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"original_filename":"api-screenshot.png","content_type":"image/png","byte_size":4096}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(admin_response.status(), StatusCode::CREATED);
    let body = response_body(admin_response).await;
    assert!(body.contains(r#""filename":"api-screenshot.png""#));
    assert!(body.contains(r#""content_type":"image/png""#));
    assert!(body.contains(r#""status":"pending""#));

    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    let attachments = files::list_attachments(&pool, "work_item", item.id)
        .await
        .expect("attachments should load");
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let activities = projects::list_project_activities(&pool, project.id, 10)
        .await
        .expect("activities should load");
    assert_eq!(attachments.len(), 1);
    assert_eq!(attachments[0].original_filename, "api-screenshot.png");
    assert!(
        activities
            .iter()
            .any(|activity| activity.summary == "登记工作项附件 api-screenshot.png")
    );
}

#[tokio::test]
async fn api_v1_attachment_create_requires_active_storage_config() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects/YCE/attachments")
                .header(header::COOKIE, initialized.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"original_filename":"no-storage.pdf","content_type":"application/pdf","byte_size":1024}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = response_body(response).await;
    assert!(body.contains("对象存储未激活"));

    let file_objects = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM file_objects")
        .fetch_one(&pool)
        .await
        .expect("file object count should load");
    assert_eq!(file_objects, 0);
}

#[tokio::test]
async fn api_v1_attachment_upload_lifecycle_marks_file_uploaded() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_memory_storage_config(&pool, initialized.user_id).await;
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    let attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "api-roadmap.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 2048,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记项目附件 api-roadmap.pdf".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let upload_url_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/projects/YCE/attachments/{}/upload-url",
                    attachment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(upload_url_response.status(), StatusCode::OK);
    let upload_url_body = response_body(upload_url_response).await;
    let upload_url_payload: serde_json::Value =
        serde_json::from_str(&upload_url_body).expect("upload url response should be json");
    assert_eq!(
        upload_url_payload["data"]["expires_in_seconds"].as_i64(),
        Some(i64::from(storage::DEFAULT_UPLOAD_URL_TTL_SECONDS))
    );
    let upload_url = upload_url_payload["data"]["request"]["url"]
        .as_str()
        .expect("upload url should be present");
    assert!(upload_url.starts_with("/api/v1/test-storage/upload?object_key="));

    let direct_upload_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(upload_url)
                .header(header::CONTENT_TYPE, "application/pdf")
                .body(Body::from(vec![b'a'; 2048]))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(direct_upload_response.status(), StatusCode::NO_CONTENT);

    let pending_download_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/projects/YCE/attachments/{}/download-url",
                    attachment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(pending_download_response.status(), StatusCode::BAD_REQUEST);

    let uploaded_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/v1/projects/YCE/attachments/{}/uploaded",
                    attachment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(uploaded_response.status(), StatusCode::OK);
    let uploaded_body = response_body(uploaded_response).await;
    assert!(uploaded_body.contains("\"status\":\"uploaded\""));

    let refreshed = files::get_attachment(&pool, attachment.id)
        .await
        .expect("attachment should load");
    assert_eq!(refreshed.status, "uploaded");

    let upload_url_response = app
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/projects/YCE/attachments/{}/upload-url?expires_in_seconds=30",
                    attachment.id
                ))
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(upload_url_response.status(), StatusCode::BAD_REQUEST);
    let body = response_body(upload_url_response).await;
    assert!(body.contains("签名有效期必须在 60-3600 秒之间"));
}

#[tokio::test]
async fn api_test_storage_upload_endpoint_is_limited_to_test_memory_config() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let object_key = "browser-smoke/guard.txt";
    let encoded_object_key = "browser-smoke%2Fguard.txt";

    let app_without_config = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let no_config_response = app_without_config
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!(
                    "/api/v1/test-storage/upload?object_key={encoded_object_key}"
                ))
                .header(header::CONTENT_TYPE, "text/plain")
                .body(Body::from("guard"))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(no_config_response.status(), StatusCode::BAD_REQUEST);
    let no_config_body = response_body(no_config_response).await;
    assert!(no_config_body.contains("对象存储未激活"));

    seed_active_storage_config(&pool, initialized.user_id).await;
    let app_with_oss_config = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let oss_config_response = app_with_oss_config
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!(
                    "/api/v1/test-storage/upload?object_key={encoded_object_key}"
                ))
                .header(header::CONTENT_TYPE, "text/plain")
                .body(Body::from("guard"))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(oss_config_response.status(), StatusCode::NOT_FOUND);
    let oss_config_body = response_body(oss_config_response).await;
    assert!(oss_config_body.contains("测试对象存储入口不存在"));

    seed_memory_storage_config(&pool, initialized.user_id).await;
    let mut non_test_settings = test_settings();
    non_test_settings.env = "production".to_string();
    let app_with_non_test_env = build_router(AppState::new(non_test_settings, Some(pool.clone())));
    let non_test_response = app_with_non_test_env
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!(
                    "/api/v1/test-storage/upload?object_key={encoded_object_key}"
                ))
                .header(header::CONTENT_TYPE, "text/plain")
                .body(Body::from("guard"))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(non_test_response.status(), StatusCode::NOT_FOUND);
    let non_test_body = response_body(non_test_response).await;
    assert!(non_test_body.contains("测试对象存储入口不存在"));

    let app_with_test_memory = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let test_memory_response = app_with_test_memory
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!(
                    "/api/v1/test-storage/upload?object_key={encoded_object_key}"
                ))
                .header(header::CONTENT_TYPE, "text/plain")
                .body(Body::from("guard"))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(test_memory_response.status(), StatusCode::NO_CONTENT);

    storage::verify_uploaded_object(&pool, &test_settings(), object_key, 5, "text/plain")
        .await
        .expect("test memory object should be uploaded");
}

#[tokio::test]
async fn api_v1_attachment_upload_url_returns_signed_put_request() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_active_storage_config(&pool, initialized.user_id).await;
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    let attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "signed-upload.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 2048,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记项目附件 signed-upload.pdf".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/projects/YCE/attachments/{}/upload-url?expires_in_seconds=600",
                    attachment.id
                ))
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    assert!(body.contains(r#""expires_in_seconds":600"#));
    assert!(body.contains(r#""method":"PUT""#));
    assert!(body.contains(r#""url":"https://"#));
    assert!(body.contains("oss-cn-hangzhou.aliyuncs.com"));
    assert!(body.contains(r#""filename":"signed-upload.pdf""#));
}

#[tokio::test]
async fn api_v1_attachment_mark_uploaded_requires_existing_object() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_memory_storage_config(&pool, initialized.user_id).await;
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    let attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "missing-object.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 2048,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记项目附件 missing-object.pdf".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let uploaded_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/v1/projects/YCE/attachments/{}/uploaded",
                    attachment.id
                ))
                .header(header::COOKIE, initialized.cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(uploaded_response.status(), StatusCode::BAD_REQUEST);
    let body = response_body(uploaded_response).await;
    assert!(body.contains("对象存储中未找到已上传文件"));

    let refreshed = files::get_attachment(&pool, attachment.id)
        .await
        .expect("attachment should load");
    assert_eq!(refreshed.status, "pending");
}

#[tokio::test]
async fn api_v1_attachment_mark_uploaded_rejects_size_mismatch() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_memory_storage_config(&pool, initialized.user_id).await;
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    let attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "wrong-size.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 2048,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记项目附件 wrong-size.pdf".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    let operator = storage::build_operator_from_active_config(&pool, &test_settings())
        .await
        .expect("test storage should build")
        .expect("test storage should exist");
    operator
        .write_with(&attachment.object_key, vec![b'x'; 1024])
        .content_type(&attachment.content_type)
        .await
        .expect("test object should write");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let uploaded_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/v1/projects/YCE/attachments/{}/uploaded",
                    attachment.id
                ))
                .header(header::COOKIE, initialized.cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(uploaded_response.status(), StatusCode::BAD_REQUEST);
    let body = response_body(uploaded_response).await;
    assert!(body.contains("对象存储文件大小不一致"));

    let refreshed = files::get_attachment(&pool, attachment.id)
        .await
        .expect("attachment should load");
    assert_eq!(refreshed.status, "pending");
}

#[tokio::test]
async fn api_v1_attachment_mark_uploaded_rejects_content_type_mismatch() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_memory_storage_config(&pool, initialized.user_id).await;
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    let attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "wrong-content-type.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 2048,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记项目附件 wrong-content-type.pdf".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    let operator = storage::build_operator_from_active_config(&pool, &test_settings())
        .await
        .expect("test storage should build")
        .expect("test storage should exist");
    operator
        .write_with(&attachment.object_key, vec![b'x'; 2048])
        .content_type("image/png")
        .await
        .expect("test object should write");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let uploaded_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/v1/projects/YCE/attachments/{}/uploaded",
                    attachment.id
                ))
                .header(header::COOKIE, initialized.cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(uploaded_response.status(), StatusCode::BAD_REQUEST);
    let body = response_body(uploaded_response).await;
    assert!(body.contains("对象存储 Content-Type 不一致"));

    let refreshed = files::get_attachment(&pool, attachment.id)
        .await
        .expect("attachment should load");
    assert_eq!(refreshed.status, "pending");
}

#[tokio::test]
async fn api_v1_attachment_create_rejects_unsupported_type_and_oversized_file() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_active_storage_config(&pool, initialized.user_id).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let unsupported_type_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects/YCE/attachments")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"original_filename":"run.sh","content_type":"application/x-sh","byte_size":128}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(unsupported_type_response.status(), StatusCode::BAD_REQUEST);
    let unsupported_type_body = response_body(unsupported_type_response).await;
    assert!(unsupported_type_body.contains("暂不支持该附件类型"));

    let oversized_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects/YCE/attachments")
                .header(header::COOKIE, initialized.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(format!(
                    r#"{{"original_filename":"large.pdf","content_type":"application/pdf","byte_size":{}}}"#,
                    files::MAX_ATTACHMENT_BYTE_SIZE + 1
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(oversized_response.status(), StatusCode::BAD_REQUEST);
    let oversized_body = response_body(oversized_response).await;
    assert!(oversized_body.contains("文件大小不能超过"));
}

#[tokio::test]
async fn web_project_attachment_download_redirects_to_signed_object_url() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_active_storage_config(&pool, initialized.user_id).await;
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    let attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "download-me.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 2048,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记项目附件 download-me.pdf".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let pending_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/web/projects/YCE/attachments/{}/download",
                    attachment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(pending_response.status(), StatusCode::BAD_REQUEST);

    files::mark_attachment_uploaded(&pool, attachment.id, "project", project.id)
        .await
        .expect("attachment should mark uploaded");

    let download_response = app
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/web/projects/YCE/attachments/{}/download",
                    attachment.id
                ))
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(download_response.status(), StatusCode::TEMPORARY_REDIRECT);
    let location = download_response
        .headers()
        .get(header::LOCATION)
        .expect("download should redirect")
        .to_str()
        .expect("location should be ascii");
    assert!(location.starts_with("https://"));
    assert!(location.contains(".pdf"));

    let audit_count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM audit_logs
        WHERE action = 'file.download'
          AND target_type = 'project'
          AND target_id = 'YCE'
          AND metadata LIKE '%"source":"web"%'
        "#,
    )
    .fetch_one(&pool)
    .await
    .expect("download audit count should load");
    assert_eq!(audit_count, 1);
}

#[tokio::test]
async fn web_project_attachment_delete_marks_file_deleted_and_records_activity() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_active_storage_config(&pool, initialized.user_id).await;
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    let attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "delete-me.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 1024,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记项目附件 delete-me.pdf".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let delete_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/web/projects/YCE/attachments/{}/delete",
                    attachment.id
                ))
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(delete_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        delete_response.headers().get(header::LOCATION).unwrap(),
        "/web/projects/YCE"
    );

    let deleted = files::get_attachment(&pool, attachment.id)
        .await
        .expect("attachment should load");
    let activities = projects::list_project_activities(&pool, project.id, 10)
        .await
        .expect("activities should load");
    assert_eq!(deleted.status, "deleted");
    assert!(
        activities
            .iter()
            .any(|activity| activity.summary == "删除项目附件 delete-me.pdf")
    );

    let download_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/web/projects/YCE/attachments/{}/download",
                    attachment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(download_response.status(), StatusCode::BAD_REQUEST);
    let download_body = response_body(download_response).await;
    assert!(download_body.contains("附件已删除，不能下载"));

    let detail_response = app
        .oneshot(
            Request::builder()
                .uri("/web/projects/YCE")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let body = response_body(detail_response).await;
    assert!(body.contains("delete-me.pdf"));
    assert!(body.contains("deleted"));
    assert!(!body.contains(&format!("/attachments/{}/delete", attachment.id)));
}

#[tokio::test]
async fn api_v1_project_attachment_delete_blocks_later_signed_urls() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_active_storage_config(&pool, initialized.user_id).await;
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    let attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "api-delete.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 2048,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记项目附件 api-delete.pdf".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let delete_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!(
                    "/api/v1/projects/YCE/attachments/{}",
                    attachment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(delete_response.status(), StatusCode::OK);
    let delete_body = response_body(delete_response).await;
    assert!(delete_body.contains("\"status\":\"deleted\""));

    let deleted = files::get_attachment(&pool, attachment.id)
        .await
        .expect("attachment should load");
    assert_eq!(deleted.status, "deleted");

    let download_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/projects/YCE/attachments/{}/download-url",
                    attachment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(download_response.status(), StatusCode::BAD_REQUEST);
    let download_body = response_body(download_response).await;
    assert!(download_body.contains("附件已删除，不能生成签名"));

    let upload_response = app
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/projects/YCE/attachments/{}/upload-url",
                    attachment.id
                ))
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(upload_response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn api_v1_work_item_attachment_lifecycle_respects_project_scope() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_memory_storage_config(&pool, initialized.user_id).await;
    let outsider = create_regular_user(&pool, "outside_file", "附件外部成员").await;
    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    let attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "api-screenshot.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 4096,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记工作项附件 api-screenshot.png".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    write_test_object(&pool, &attachment)
        .await
        .expect("test object should write");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let outsider_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/attachments/{}/uploaded",
                    attachment.id
                ))
                .header(header::COOKIE, outsider.cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(outsider_response.status(), StatusCode::FORBIDDEN);

    let uploaded_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/attachments/{}/uploaded",
                    attachment.id
                ))
                .header(header::COOKIE, initialized.cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(uploaded_response.status(), StatusCode::OK);

    let refreshed = files::get_attachment(&pool, attachment.id)
        .await
        .expect("attachment should load");
    assert_eq!(refreshed.status, "uploaded");
}

#[tokio::test]
async fn web_work_item_attachment_download_redirects_to_signed_object_url() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_active_storage_config(&pool, initialized.user_id).await;
    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    let attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "download-screenshot.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 4096,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记工作项附件 download-screenshot.png".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    files::mark_attachment_uploaded(&pool, attachment.id, "work_item", item.id)
        .await
        .expect("attachment should mark uploaded");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let download_response = app
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/web/work-items/YCE-TASK-2/attachments/{}/download",
                    attachment.id
                ))
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(download_response.status(), StatusCode::TEMPORARY_REDIRECT);
    let location = download_response
        .headers()
        .get(header::LOCATION)
        .expect("download should redirect")
        .to_str()
        .expect("location should be ascii");
    assert!(location.starts_with("https://"));
    assert!(location.contains(".png"));

    let audit_count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM audit_logs
        WHERE action = 'file.download'
          AND target_type = 'work_item'
          AND target_id = 'YCE-TASK-2'
          AND metadata LIKE '%"source":"web"%'
        "#,
    )
    .fetch_one(&pool)
    .await
    .expect("download audit count should load");
    assert_eq!(audit_count, 1);
}

#[tokio::test]
async fn web_work_item_attachment_download_rejects_deleted_attachment() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_active_storage_config(&pool, initialized.user_id).await;
    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    let attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "deleted-screenshot.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 4096,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记工作项附件 deleted-screenshot.png".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    files::mark_attachment_uploaded(&pool, attachment.id, "work_item", item.id)
        .await
        .expect("attachment should mark uploaded");
    files::delete_attachment(
        &pool,
        attachment.id,
        "work_item",
        item.id,
        initialized.user_id,
        Some(project.id),
        Some("删除工作项附件"),
    )
    .await
    .expect("attachment should delete");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let download_response = app
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/web/work-items/YCE-TASK-2/attachments/{}/download",
                    attachment.id
                ))
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(download_response.status(), StatusCode::BAD_REQUEST);
    let body = response_body(download_response).await;
    assert!(body.contains("附件已删除，不能下载"));
}

#[tokio::test]
async fn api_v1_work_item_attachment_delete_respects_write_scope() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_active_storage_config(&pool, initialized.user_id).await;
    let viewer = create_regular_user(&pool, "file_viewer", "附件只读成员").await;
    projects::add_project_member(&pool, initialized.user_id, "YCE", "file_viewer", "viewer")
        .await
        .expect("viewer should be added");
    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    let attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "delete-work-item.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 4096,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记工作项附件 delete-work-item.png".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let viewer_delete_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/attachments/{}",
                    attachment.id
                ))
                .header(header::COOKIE, viewer.cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(viewer_delete_response.status(), StatusCode::FORBIDDEN);

    let admin_delete_response = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/attachments/{}",
                    attachment.id
                ))
                .header(header::COOKIE, initialized.cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(admin_delete_response.status(), StatusCode::OK);
    let body = response_body(admin_delete_response).await;
    assert!(body.contains("\"status\":\"deleted\""));

    let deleted = files::get_attachment(&pool, attachment.id)
        .await
        .expect("attachment should load");
    let activities = projects::list_project_activities(&pool, project.id, 10)
        .await
        .expect("activities should load");
    assert_eq!(deleted.status, "deleted");
    assert!(
        activities
            .iter()
            .any(|activity| activity.summary == "删除工作项附件")
    );
}

#[tokio::test]
async fn api_v1_can_create_and_update_work_item_for_authenticated_member() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"project_key":"YCE","item_type":"task","title":"API 创建任务","description":"通过 API 写入","priority":"P0","due_date":"2026-07-10","parent_item_key":"YCE-REQ-1"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(create_response.status(), StatusCode::CREATED);
    let create_body = response_body(create_response).await;
    assert!(create_body.contains("\"key\":\"YCE-TASK-"));
    assert!(create_body.contains("\"title\":\"API 创建任务\""));
    assert!(create_body.contains("\"due_date\":\"2026-07-10\""));
    assert!(create_body.contains("\"parent_item_key\":\"YCE-REQ-1\""));

    let item_key = extract_json_string(&create_body, "key");
    let update_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/v1/work-items/{item_key}"))
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"title":"API 更新缺陷","status":"in_progress","priority":"P1","assignee_username":"admin","due_date":"2026-07-20"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let comment_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v1/work-items/{item_key}/comments"))
                .header(header::COOKIE, initialized.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"body":"API 评论"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(update_response.status(), StatusCode::OK);
    assert_eq!(comment_response.status(), StatusCode::CREATED);
    let update_body = response_body(update_response).await;
    assert!(update_body.contains("\"title\":\"API 更新缺陷\""));
    assert!(update_body.contains("\"priority\":\"P1\""));
    assert!(update_body.contains("\"assignee_username\":\"admin\""));
    assert!(update_body.contains("\"due_date\":\"2026-07-20\""));

    let item = projects::get_work_item_detail(&pool, &item_key)
        .await
        .expect("work item should load")
        .expect("work item should exist");
    let comments = projects::list_work_item_comments(&pool, item.id)
        .await
        .expect("comments should load");

    assert_eq!(item.title, "API 更新缺陷");
    assert_eq!(item.status, "in_progress");
    assert_eq!(item.priority, "P1");
    assert_eq!(item.assignee_username, "admin");
    assert_eq!(item.due_date, "2026-07-20");
    assert_eq!(item.parent_item_key, "YCE-REQ-1");
    assert!(comments.iter().any(|comment| comment.body == "API 评论"));
}

#[tokio::test]
async fn api_v1_rejects_parent_requirement_outside_same_project() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items")
                .header(header::COOKIE, initialized.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"project_key":"YCE","item_type":"task","title":"非法父级","parent_item_key":"OPS-TASK-1"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = response_body(response).await;
    assert!(body.contains("父级需求必须是同项目内未删除需求"));
}

#[tokio::test]
async fn api_v1_rejects_work_item_assignee_outside_project() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    create_regular_user(&pool, "not_in_project", "非项目成员").await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/work-items/YCE-TASK-2")
                .header(header::COOKIE, initialized.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"title":"非法负责人","assignee_username":"not_in_project"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    assert_ne!(item.title, "非法负责人");
    assert_ne!(item.assignee_username, "not_in_project");
}

#[tokio::test]
async fn api_v1_work_item_comment_edit_delete_respects_write_scope() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let viewer = create_regular_user(&pool, "comment_viewer", "评论观察者").await;
    let member = create_regular_user(&pool, "comment_member_api", "API 评论成员").await;
    let maintainer = create_regular_user(&pool, "comment_maintainer_api", "API 评论维护者").await;
    projects::add_project_member(
        &pool,
        initialized.user_id,
        "YCE",
        "comment_viewer",
        "viewer",
    )
    .await
    .expect("viewer should be added");
    projects::add_project_member(
        &pool,
        initialized.user_id,
        "YCE",
        "comment_member_api",
        "member",
    )
    .await
    .expect("member should be added");
    projects::add_project_member(
        &pool,
        initialized.user_id,
        "YCE",
        "comment_maintainer_api",
        "maintainer",
    )
    .await
    .expect("maintainer should be added");
    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    let comment_id =
        projects::add_work_item_comment(&pool, initialized.user_id, "YCE-TASK-2", "API 待编辑评论")
            .await
            .expect("comment should create")
            .id;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let viewer_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{comment_id}"
                ))
                .header(header::COOKIE, viewer.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"body":"viewer cannot edit"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(viewer_response.status(), StatusCode::FORBIDDEN);

    let member_edit_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{comment_id}"
                ))
                .header(header::COOKIE, member.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"body":"member cannot edit others"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(member_edit_response.status(), StatusCode::FORBIDDEN);

    let member_delete_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{comment_id}"
                ))
                .header(header::COOKIE, member.cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(member_delete_response.status(), StatusCode::FORBIDDEN);

    let maintainer_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{comment_id}"
                ))
                .header(header::COOKIE, maintainer.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"body":"API 维护者已编辑评论"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(maintainer_response.status(), StatusCode::OK);

    let edit_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{comment_id}"
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"body":"API 已编辑评论"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let edit_body = response_body(edit_response).await;
    let edited = projects::get_work_item_comment(&pool, item.id, comment_id)
        .await
        .expect("comment should load");
    assert!(edit_body.contains("\"body\":\"API 已编辑评论\""));
    assert_eq!(edited.body, "API 已编辑评论");

    let delete_response = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{comment_id}"
                ))
                .header(header::COOKIE, initialized.cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let delete_body = response_body(delete_response).await;
    let comments = projects::list_work_item_comments(&pool, item.id)
        .await
        .expect("comments should load");

    assert!(delete_body.contains("\"body\":\"API 已编辑评论\""));
    assert!(comments.iter().all(|comment| comment.id != comment_id));
}

#[tokio::test]
async fn work_item_soft_delete_hides_from_lists_and_can_restore() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");

    let deleted = projects::delete_work_item(&pool, initialized.user_id, "YCE-TASK-2")
        .await
        .expect("work item should delete");

    assert!(!deleted.deleted_at.is_empty());
    let tasks = projects::list_work_item_summaries(&pool, Some("task"))
        .await
        .expect("tasks should load");
    let assigned = projects::list_assigned_work_item_summaries(&pool, initialized.user_id, None)
        .await
        .expect("assigned items should load");
    let search_hits = projects::search_visible(&pool, initialized.user_id, true, "YCE-TASK-2", 10)
        .await
        .expect("search should load");
    let yce = projects::list_project_summaries(&pool)
        .await
        .expect("projects should load")
        .into_iter()
        .find(|project| project.project_key == "YCE")
        .expect("YCE should exist");
    let activities = projects::list_project_activities_by_key(&pool, "YCE", 10)
        .await
        .expect("activities should load");

    assert!(tasks.iter().all(|item| item.item_key != "YCE-TASK-2"));
    assert!(assigned.iter().all(|item| item.item_key != "YCE-TASK-2"));
    assert!(search_hits.iter().all(|hit| hit.key != "YCE-TASK-2"));
    assert_eq!(yce.work_item_count, 3);
    assert!(
        activities
            .iter()
            .any(|activity| activity.summary == "删除工作项 YCE-TASK-2")
    );

    let restored = projects::restore_work_item(&pool, initialized.user_id, "YCE-TASK-2")
        .await
        .expect("work item should restore");
    let tasks_after_restore = projects::list_work_item_summaries(&pool, Some("task"))
        .await
        .expect("tasks should load");

    assert!(restored.deleted_at.is_empty());
    assert!(
        tasks_after_restore
            .iter()
            .any(|item| item.item_key == "YCE-TASK-2")
    );
}

#[tokio::test]
async fn web_work_item_detail_can_delete_and_restore_work_item() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let delete_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items/YCE-TASK-2/delete")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(delete_response.status(), StatusCode::SEE_OTHER);
    let deleted_item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    assert!(!deleted_item.deleted_at.is_empty());

    let list_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/tasks")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let list_body = response_body(list_response).await;
    assert!(!list_body.contains("YCE-TASK-2"));

    let detail_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/work-items/YCE-TASK-2")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let detail_body = response_body(detail_response).await;
    assert!(detail_body.contains("工作项已删除"));
    assert!(detail_body.contains("恢复工作项"));
    assert!(!detail_body.contains("data-modal-open=\"work-item-edit-modal\""));

    let restore_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items/YCE-TASK-2/restore")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let restored_item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");

    assert_eq!(restore_response.status(), StatusCode::SEE_OTHER);
    assert!(restored_item.deleted_at.is_empty());
}

#[tokio::test]
async fn api_v1_work_item_delete_restore_respects_write_scope() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let viewer = create_regular_user(&pool, "delete_viewer", "删除观察者").await;
    projects::add_project_member(&pool, initialized.user_id, "YCE", "delete_viewer", "viewer")
        .await
        .expect("viewer should be added");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let viewer_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri("/api/v1/work-items/YCE-TASK-2")
                .header(header::COOKIE, viewer.cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(viewer_response.status(), StatusCode::FORBIDDEN);

    let delete_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri("/api/v1/work-items/YCE-TASK-2")
                .header(header::COOKIE, initialized.cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let delete_body = response_body(delete_response).await;
    assert!(delete_body.contains("\"key\":\"YCE-TASK-2\""));
    assert!(delete_body.contains("\"deleted_at\":\""));

    let update_deleted_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/work-items/YCE-TASK-2")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"title":"删除后不允许编辑"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(update_deleted_response.status(), StatusCode::NOT_FOUND);

    let restore_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items/YCE-TASK-2/restore")
                .header(header::COOKIE, initialized.cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let restore_body = response_body(restore_response).await;
    let restored_item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");

    assert!(restore_body.contains("\"deleted_at\":\"\""));
    assert!(restored_item.deleted_at.is_empty());
}

#[tokio::test]
async fn project_status_blocks_writes_on_paused_or_archived_projects() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_active_storage_config(&pool, initialized.user_id).await;
    let crm_project = projects::get_project_detail(&pool, "CRM")
        .await
        .expect("project should load")
        .expect("project should exist");
    let yce_project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let yce_item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    let yce_comment = projects::list_work_item_comments(&pool, yce_item.id)
        .await
        .expect("comments should load")
        .into_iter()
        .next()
        .expect("demo comment should exist");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    let paused_project_attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "project".to_string(),
            target_id: crm_project.id,
            project_id: Some(crm_project.id),
            original_filename: "paused-project.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 1024,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记项目附件 paused-project.pdf".to_string()),
        },
    )
    .await
    .expect("project attachment should create");
    let archived_project_attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "project".to_string(),
            target_id: yce_project.id,
            project_id: Some(yce_project.id),
            original_filename: "archived-project.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 1024,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记项目附件 archived-project.pdf".to_string()),
        },
    )
    .await
    .expect("project attachment should create");
    let archived_work_item_attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "work_item".to_string(),
            target_id: yce_item.id,
            project_id: Some(yce_project.id),
            original_filename: "archived-work-item.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 2048,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记工作项附件 archived-work-item.png".to_string()),
        },
    )
    .await
    .expect("work item attachment should create");
    let archived_comment_attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "comment".to_string(),
            target_id: yce_comment.id,
            project_id: Some(yce_project.id),
            original_filename: "archived-comment.txt".to_string(),
            content_type: "text/plain".to_string(),
            byte_size: 512,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记评论附件 archived-comment.txt".to_string()),
        },
    )
    .await
    .expect("comment attachment should create");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let paused_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&project_key=CRM&item_type=bug&title=%E6%9A%82%E5%81%9C%E9%A1%B9%E7%9B%AE%E5%86%99%E5%85%A5&description=%E5%BA%94%E8%AF%A5%E8%A2%AB%E6%8B%A6%E6%88%AA&priority=P1",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(paused_response.status(), StatusCode::BAD_REQUEST);

    let paused_project_attachment_create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/projects/CRM/attachments")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&original_filename=paused-new.pdf&content_type=application%2Fpdf&byte_size=1024",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(
        paused_project_attachment_create_response.status(),
        StatusCode::BAD_REQUEST
    );

    let paused_project_attachment_delete_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/web/projects/CRM/attachments/{}/delete",
                    paused_project_attachment.id
                ))
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(
        paused_project_attachment_delete_response.status(),
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        files::get_attachment(&pool, paused_project_attachment.id)
            .await
            .expect("attachment should load")
            .status,
        "pending"
    );

    sqlx::query("UPDATE projects SET status = 'archived' WHERE project_key = 'YCE'")
        .execute(&pool)
        .await
        .expect("project should archive");

    let archived_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/work-items/YCE-TASK-2")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"title":"归档项目禁止编辑"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(archived_response.status(), StatusCode::BAD_REQUEST);

    let archived_project_attachment_create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects/YCE/attachments")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"original_filename":"archived-new.pdf","content_type":"application/pdf","byte_size":1024}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(
        archived_project_attachment_create_response.status(),
        StatusCode::BAD_REQUEST
    );

    let archived_project_attachment_upload_url_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/projects/YCE/attachments/{}/upload-url",
                    archived_project_attachment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(
        archived_project_attachment_upload_url_response.status(),
        StatusCode::BAD_REQUEST
    );

    let archived_project_attachment_uploaded_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/v1/projects/YCE/attachments/{}/uploaded",
                    archived_project_attachment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(
        archived_project_attachment_uploaded_response.status(),
        StatusCode::BAD_REQUEST
    );

    let archived_project_attachment_delete_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!(
                    "/api/v1/projects/YCE/attachments/{}",
                    archived_project_attachment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(
        archived_project_attachment_delete_response.status(),
        StatusCode::BAD_REQUEST
    );

    let archived_work_item_attachment_create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items/YCE-TASK-2/attachments")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"original_filename":"archived-task-new.png","content_type":"image/png","byte_size":2048}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(
        archived_work_item_attachment_create_response.status(),
        StatusCode::BAD_REQUEST
    );

    let archived_work_item_attachment_upload_url_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/attachments/{}/upload-url",
                    archived_work_item_attachment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(
        archived_work_item_attachment_upload_url_response.status(),
        StatusCode::BAD_REQUEST
    );

    let archived_work_item_attachment_uploaded_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/attachments/{}/uploaded",
                    archived_work_item_attachment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(
        archived_work_item_attachment_uploaded_response.status(),
        StatusCode::BAD_REQUEST
    );

    let archived_work_item_attachment_delete_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/attachments/{}",
                    archived_work_item_attachment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(
        archived_work_item_attachment_delete_response.status(),
        StatusCode::BAD_REQUEST
    );

    let archived_comment_attachment_create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{}/attachments",
                    yce_comment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"original_filename":"archived-comment-new.txt","content_type":"text/plain","byte_size":512}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(
        archived_comment_attachment_create_response.status(),
        StatusCode::BAD_REQUEST
    );

    let archived_comment_attachment_upload_url_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{}/attachments/{}/upload-url",
                    yce_comment.id, archived_comment_attachment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(
        archived_comment_attachment_upload_url_response.status(),
        StatusCode::BAD_REQUEST
    );

    let archived_comment_attachment_uploaded_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{}/attachments/{}/uploaded",
                    yce_comment.id, archived_comment_attachment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(
        archived_comment_attachment_uploaded_response.status(),
        StatusCode::BAD_REQUEST
    );

    let archived_comment_attachment_delete_response = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{}/attachments/{}",
                    yce_comment.id, archived_comment_attachment.id
                ))
                .header(header::COOKIE, initialized.cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(
        archived_comment_attachment_delete_response.status(),
        StatusCode::BAD_REQUEST
    );

    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    assert_ne!(item.title, "归档项目禁止编辑");
    assert_eq!(
        files::get_attachment(&pool, archived_project_attachment.id)
            .await
            .expect("attachment should load")
            .status,
        "pending"
    );
    assert_eq!(
        files::get_attachment(&pool, archived_work_item_attachment.id)
            .await
            .expect("attachment should load")
            .status,
        "pending"
    );
    assert_eq!(
        files::get_attachment(&pool, archived_comment_attachment.id)
            .await
            .expect("attachment should load")
            .status,
        "pending"
    );
}

#[tokio::test]
async fn project_member_role_controls_write_scope() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let viewer = create_regular_user(&pool, "viewer1", "只读成员").await;
    let maintainer = create_regular_user(&pool, "maintainer1", "维护成员").await;
    let invited = create_regular_user(&pool, "invited1", "被邀请成员").await;
    projects::add_project_member(&pool, initialized.user_id, "YCE", "viewer1", "viewer")
        .await
        .expect("viewer should be added");
    projects::add_project_member(
        &pool,
        initialized.user_id,
        "YCE",
        "maintainer1",
        "maintainer",
    )
    .await
    .expect("maintainer should be added");
    rbac::create_role(&pool, "project_manager", "项目管理员", "self")
        .await
        .expect("project manager role should create");
    rbac::replace_role_permissions(&pool, "project_manager", &["project.manage".to_string()])
        .await
        .expect("project manager permissions should update");
    let mut tx = pool.begin().await.expect("tx should begin");
    rbac::assign_role_to_user(&mut tx, maintainer.user_id, "project_manager")
        .await
        .expect("project manager role should assign");
    tx.commit().await.expect("tx should commit");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let viewer_create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items")
                .header(header::COOKIE, with_csrf_cookie(&viewer.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&project_key=YCE&item_type=task&title=%E5%8F%AA%E8%AF%BB%E6%88%90%E5%91%98%E4%B8%8D%E8%83%BD%E5%86%99%E5%85%A5&description=&priority=P2",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(viewer_create_response.status(), StatusCode::FORBIDDEN);

    let viewer_comment_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items/YCE-TASK-2/comments")
                .header(header::COOKIE, viewer.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"body":"viewer cannot comment"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(viewer_comment_response.status(), StatusCode::FORBIDDEN);

    let maintainer_add_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects/YCE/members")
                .header(header::COOKIE, maintainer.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"username":"invited1","member_role":"member"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(maintainer_add_response.status(), StatusCode::CREATED);
    assert!(
        projects::is_project_member(&pool, 1, invited.user_id)
            .await
            .expect("membership should load")
    );
}

#[tokio::test]
async fn web_work_item_detail_hides_write_actions_for_project_viewers() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let viewer = create_regular_user(&pool, "detail_viewer", "详情观察者").await;
    projects::add_project_member(&pool, initialized.user_id, "YCE", "detail_viewer", "viewer")
        .await
        .expect("viewer should be added");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/work-items/YCE-TASK-2")
                .header(header::COOKIE, viewer.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    assert!(body.contains("YCE-TASK-2"));
    assert!(!body.contains(r#"data-modal-open="work-item-edit-modal""#));
    assert!(!body.contains(r#"data-modal-open="work-item-comment-modal""#));
    assert!(!body.contains(r#"data-modal-open="work-item-attachment-modal""#));
    assert!(!body.contains(r#"action="/web/work-items/YCE-TASK-2/delete""#));
}

#[tokio::test]
async fn web_project_detail_hides_write_actions_when_project_is_not_writable() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    sqlx::query("UPDATE projects SET status = 'archived' WHERE project_key = 'YCE'")
        .execute(&pool)
        .await
        .expect("project should archive");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/projects/YCE")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    assert!(body.contains(r#"data-modal-open="project-edit-modal""#));
    assert!(!body.contains(r#"data-modal-open="project-work-item-create-modal""#));
    assert!(!body.contains(r#"data-modal-open="project-member-add-modal""#));
    assert!(!body.contains(r#"data-modal-open="project-member-role-modal-"#));
    assert!(!body.contains(r#"data-modal-open="project-attachment-create-modal""#));
    assert!(!body.contains(r#"data-direct-upload data-existing-attachment-id"#));
    assert!(!body.contains(r#"/remove""#));
}

#[tokio::test]
async fn web_work_item_detail_hides_write_actions_when_project_is_not_writable() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    sqlx::query("UPDATE projects SET status = 'archived' WHERE project_key = 'YCE'")
        .execute(&pool)
        .await
        .expect("project should archive");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/work-items/YCE-TASK-2")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    assert!(body.contains("YCE-TASK-2"));
    assert!(!body.contains(r#"data-modal-open="work-item-edit-modal""#));
    assert!(!body.contains(r#"data-modal-open="work-item-comment-modal""#));
    assert!(!body.contains(r#"data-modal-open="work-item-attachment-modal""#));
    assert!(!body.contains(r#"action="/web/work-items/YCE-TASK-2/delete""#));
}

#[tokio::test]
async fn web_project_member_management_grants_and_revokes_project_access() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let outsider = create_regular_user(&pool, "outsider", "外部成员").await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let add_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/projects/YCE/members")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&username=outsider&member_role=maintainer",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(add_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        add_response.headers().get(header::LOCATION).unwrap(),
        "/web/projects/YCE"
    );

    let member_can_view = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/projects/YCE")
                .header(header::COOKIE, outsider.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(member_can_view.status(), StatusCode::OK);
    let member_page = response_body(member_can_view).await;
    assert!(member_page.contains("@outsider"));
    assert!(member_page.contains("维护者"));

    let admin_project_page = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/projects/YCE")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let admin_project_body = response_body(admin_project_page).await;
    assert!(admin_project_body.contains("project-member-role-modal-outsider"));

    let role_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/projects/YCE/members/outsider/role")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&member_role=viewer",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(role_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        projects::project_member_role(&pool, 1, outsider.user_id)
            .await
            .expect("role should load")
            .as_deref(),
        Some("viewer")
    );

    let viewer_write_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items")
                .header(header::COOKIE, with_csrf_cookie(&outsider.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&project_key=YCE&item_type=task&title=%E8%A7%82%E5%AF%9F%E8%80%85%E4%B8%8D%E8%83%BD%E5%86%99%E5%85%A5&description=&priority=P2",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(viewer_write_response.status(), StatusCode::FORBIDDEN);

    let remove_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/projects/YCE/members/outsider/remove")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(remove_response.status(), StatusCode::SEE_OTHER);

    let member_forbidden = app
        .oneshot(
            Request::builder()
                .uri("/web/projects/YCE")
                .header(header::COOKIE, outsider.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(member_forbidden.status(), StatusCode::FORBIDDEN);

    let is_member = projects::is_project_member(&pool, 1, outsider.user_id)
        .await
        .expect("membership should load");
    assert!(!is_member);
}

#[tokio::test]
async fn project_member_remove_requires_open_work_items_to_be_transferred() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let assignee = create_regular_user(&pool, "assigned_member", "负责成员").await;
    projects::add_project_member(
        &pool,
        initialized.user_id,
        "YCE",
        "assigned_member",
        "member",
    )
    .await
    .expect("member should be added");
    let created = projects::create_work_item(
        &pool,
        assignee.user_id,
        projects::CreateWorkItemInput {
            project_key: "YCE".to_string(),
            item_type: "task".to_string(),
            title: "负责成员开放任务".to_string(),
            description: String::new(),
            priority: "P2".to_string(),
            due_date: String::new(),
            parent_item_key: String::new(),
        },
    )
    .await
    .expect("work item should create");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let web_remove_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/projects/YCE/members/assigned_member/remove")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(web_remove_response.status(), StatusCode::BAD_REQUEST);
    assert!(
        projects::is_project_member(&pool, 1, assignee.user_id)
            .await
            .expect("membership should load")
    );

    let api_remove_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri("/api/v1/projects/YCE/members/assigned_member")
                .header(header::COOKIE, initialized.cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(api_remove_response.status(), StatusCode::BAD_REQUEST);

    projects::update_work_item_status(&pool, initialized.user_id, &created.item_key, "in_progress")
        .await
        .expect("work item should start");
    projects::update_work_item_status(&pool, initialized.user_id, &created.item_key, "done")
        .await
        .expect("work item should close");

    let remove_after_close_response = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri("/api/v1/projects/YCE/members/assigned_member")
                .header(header::COOKIE, initialized.cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(remove_after_close_response.status(), StatusCode::NO_CONTENT);
    assert!(
        !projects::is_project_member(&pool, 1, assignee.user_id)
            .await
            .expect("membership should load")
    );
}

#[tokio::test]
async fn api_v1_can_add_and_remove_project_member() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let outsider = create_regular_user(&pool, "outsider", "外部成员").await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let add_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects/YCE/members")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"username":"outsider","member_role":"viewer"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(add_response.status(), StatusCode::CREATED);
    let body = response_body(add_response).await;
    assert!(body.contains("\"username\":\"outsider\""));
    assert!(body.contains("\"member_role\":\"viewer\""));

    assert!(
        projects::is_project_member(&pool, 1, outsider.user_id)
            .await
            .expect("membership should load")
    );

    let role_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/projects/YCE/members/outsider")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"member_role":"maintainer"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(role_response.status(), StatusCode::OK);
    let role_body = response_body(role_response).await;
    assert!(role_body.contains("\"member_role\":\"maintainer\""));
    assert_eq!(
        projects::project_member_role(&pool, 1, outsider.user_id)
            .await
            .expect("role should load")
            .as_deref(),
        Some("maintainer")
    );

    let remove_response = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri("/api/v1/projects/YCE/members/outsider")
                .header(header::COOKIE, initialized.cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(remove_response.status(), StatusCode::NO_CONTENT);
    assert!(
        !projects::is_project_member(&pool, 1, outsider.user_id)
            .await
            .expect("membership should load")
    );
}

#[tokio::test]
async fn api_v1_lists_members_comments_and_attachments_for_visible_scope() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_active_storage_config(&pool, initialized.user_id).await;
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    let comment = projects::list_work_item_comments(&pool, item.id)
        .await
        .expect("comments should load")
        .into_iter()
        .next()
        .expect("demo comment should exist");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "api-project-list.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 128,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记项目附件 api-project-list.pdf".to_string()),
        },
    )
    .await
    .expect("project attachment should create");
    files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "api-work-item-list.txt".to_string(),
            content_type: "text/plain".to_string(),
            byte_size: 64,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记工作项附件 api-work-item-list.txt".to_string()),
        },
    )
    .await
    .expect("work item attachment should create");
    files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "comment".to_string(),
            target_id: comment.id,
            project_id: Some(project.id),
            original_filename: "api-comment-list.json".to_string(),
            content_type: "application/json".to_string(),
            byte_size: 32,
            created_by_user_id: initialized.user_id,
            activity_summary: Some("登记评论附件 api-comment-list.json".to_string()),
        },
    )
    .await
    .expect("comment attachment should create");
    let outsider = create_regular_user(&pool, "api_list_outside", "API 列表外部成员").await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let members_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/projects/YCE/members")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(members_response.status(), StatusCode::OK);
    let members_body = response_body(members_response).await;
    assert!(members_body.contains(r#""username":"admin""#));

    let project_attachments_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/projects/YCE/attachments")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(project_attachments_response.status(), StatusCode::OK);
    let project_attachments_body = response_body(project_attachments_response).await;
    assert!(project_attachments_body.contains("api-project-list.pdf"));

    let comments_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-items/YCE-TASK-2/comments")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(comments_response.status(), StatusCode::OK);
    let comments_body = response_body(comments_response).await;
    assert!(comments_body.contains("先统一项目与工作项查询模型"));

    let work_item_attachments_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-items/YCE-TASK-2/attachments")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(work_item_attachments_response.status(), StatusCode::OK);
    let work_item_attachments_body = response_body(work_item_attachments_response).await;
    assert!(work_item_attachments_body.contains("api-work-item-list.txt"));

    let comment_attachments_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{}/attachments",
                    comment.id
                ))
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(comment_attachments_response.status(), StatusCode::OK);
    let comment_attachments_body = response_body(comment_attachments_response).await;
    assert!(comment_attachments_body.contains("api-comment-list.json"));

    let forbidden_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/projects/YCE/attachments")
                .header(header::COOKIE, outsider.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(forbidden_response.status(), StatusCode::FORBIDDEN);
}

async fn bootstrap_admin(pool: &sqlx::SqlitePool) -> i64 {
    bootstrap_admin_session(pool).await.user_id
}

struct InitializedAdmin {
    user_id: i64,
    cookie: String,
}

struct InitializedUser {
    user_id: i64,
    cookie: String,
}

async fn bootstrap_admin_session(pool: &sqlx::SqlitePool) -> InitializedAdmin {
    let result = bootstrap::bootstrap_init(
        pool,
        bootstrap::BootstrapInitInput {
            username: "admin".to_string(),
            display_name: "系统管理员".to_string(),
            password: "AdminPass2026!".to_string(),
            password_confirm: "AdminPass2026!".to_string(),
        },
    )
    .await
    .expect("bootstrap should initialize");

    InitializedAdmin {
        user_id: result.user_id,
        cookie: with_csrf_cookie(&auth::session_cookie_header(
            &result.session.raw_token,
            false,
        )),
    }
}

async fn response_body(response: axum::response::Response) -> String {
    let body = response
        .into_body()
        .collect()
        .await
        .expect("body should collect")
        .to_bytes();
    std::str::from_utf8(&body)
        .expect("body should be utf-8")
        .to_string()
}

async fn create_regular_user_session(pool: &sqlx::SqlitePool) -> String {
    create_regular_user(pool, "outsider", "外部成员")
        .await
        .cookie
}

async fn create_regular_user(
    pool: &sqlx::SqlitePool,
    username: &str,
    display_name: &str,
) -> InitializedUser {
    create_user_with_role(pool, username, display_name, "member").await
}

async fn create_user_with_role(
    pool: &sqlx::SqlitePool,
    username: &str,
    display_name: &str,
    role_code: &str,
) -> InitializedUser {
    let password_hash = auth::hash_password("MemberPass2026!").expect("password should hash");
    let user_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO users (
            username,
            password_hash,
            display_name,
            status,
            is_super_admin
        )
        VALUES (?1, ?2, ?3, 'active', 0)
        RETURNING id
        "#,
    )
    .bind(username)
    .bind(password_hash)
    .bind(display_name)
    .fetch_one(pool)
    .await
    .expect("regular user should be created");

    let mut tx = pool.begin().await.expect("tx should begin");
    rbac::assign_role_to_user(&mut tx, user_id, role_code)
        .await
        .expect("role should assign");
    tx.commit().await.expect("tx should commit");

    let session = auth::issue_session(pool, user_id, 12 * 60 * 60)
        .await
        .expect("session should issue");
    InitializedUser {
        user_id,
        cookie: with_csrf_cookie(&auth::session_cookie_header(&session.raw_token, false)),
    }
}

async fn seed_active_storage_config(pool: &sqlx::SqlitePool, actor_user_id: i64) {
    storage::save_config(
        pool,
        &test_settings(),
        actor_user_id,
        storage::SaveStorageConfigInput {
            endpoint: "https://oss-cn-hangzhou.aliyuncs.com".to_string(),
            region: "cn-hangzhou".to_string(),
            bucket: "yuance-files".to_string(),
            access_key_id: "AKIAUNIT5SECRETID".to_string(),
            access_key_secret: "Unit5SecretValue2026!".to_string(),
            activate: true,
        },
    )
    .await
    .expect("storage config should save");
}

async fn seed_memory_storage_config(pool: &sqlx::SqlitePool, actor_user_id: i64) {
    storage::save_config(
        pool,
        &test_settings(),
        actor_user_id,
        storage::SaveStorageConfigInput {
            endpoint: storage::TEST_MEMORY_ENDPOINT.to_string(),
            region: "test".to_string(),
            bucket: "yuance-files".to_string(),
            access_key_id: "AKIAUNIT5SECRETID".to_string(),
            access_key_secret: "Unit5SecretValue2026!".to_string(),
            activate: true,
        },
    )
    .await
    .expect("memory storage config should save");
}

async fn write_test_object(
    pool: &sqlx::SqlitePool,
    attachment: &files::FileAttachmentSummary,
) -> Result<(), Box<dyn std::error::Error>> {
    let operator = storage::build_operator_from_active_config(pool, &test_settings())
        .await?
        .expect("test storage operator should exist");
    operator
        .write_with(
            &attachment.object_key,
            vec![b'x'; attachment.byte_size as usize],
        )
        .content_type(&attachment.content_type)
        .await?;
    Ok(())
}

fn extract_json_string(body: &str, key: &str) -> String {
    let needle = format!("\"{key}\":\"");
    let start = body.find(&needle).expect("key should exist") + needle.len();
    let rest = &body[start..];
    let end = rest.find('"').expect("value should end");
    rest[..end].to_string()
}

fn with_csrf_cookie(session_cookie: &str) -> String {
    format!("{session_cookie}; yuance_csrf={CSRF_TOKEN}")
}

async fn test_pool() -> sqlx::SqlitePool {
    let settings = test_settings();
    let pool = db::connect_pool(&settings)
        .await
        .expect("pool should connect");
    db::run_migrations(&pool)
        .await
        .expect("migrations should run");
    pool
}

fn test_settings() -> Settings {
    Settings {
        http_addr: "127.0.0.1:33033"
            .parse()
            .expect("test socket address should parse"),
        database_url: "sqlite::memory:".to_string(),
        data_dir: "data".to_string(),
        session_secret: "test-session-secret".to_string(),
        session_ttl: "12h".to_string(),
        cache_session_ttl: "5m".to_string(),
        log_level: "off".to_string(),
        env: "test".to_string(),
        security_master_key: "test-master-key-2026".to_string(),
    }
}
