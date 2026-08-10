use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;
use yuance_api::{
    domains::{
        auth, bootstrap, projects, rbac, storage, system_api_tokens, system_releases, users,
    },
    platform::{config::Settings, db},
    web::router::{AppState, build_router},
};

const CSRF_TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

#[tokio::test]
async fn api_system_dashboard_returns_only_fixed_authorized_links() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/dashboard")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let payload: Value = serde_json::from_str(&response_body(response).await)
        .expect("dashboard response should be JSON");
    let links = payload["data"]["links"]
        .as_array()
        .expect("dashboard links should be an array");
    assert_eq!(links.len(), 7);
    assert!(links.iter().all(|link| {
        link["path"]
            .as_str()
            .is_some_and(|path| path.starts_with("/web/system/"))
    }));
    assert!(
        links
            .iter()
            .all(|link| link.as_object().is_some_and(|value| value.len() == 4))
    );
}

#[tokio::test]
async fn api_system_permissions_returns_fixed_catalog_and_enforces_permission() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/permissions")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::OK);
    let payload = response_json(response).await;
    let items = payload["data"]
        .as_array()
        .expect("catalog should be an array");
    assert!(
        items
            .iter()
            .any(|item| item["permission_key"] == "system.roles.view")
    );
    assert!(
        items
            .iter()
            .all(|item| item.as_object().is_some_and(|object| object.len() == 5))
    );

    let member_id = users::create_user(
        &pool,
        users::CreateUserInput {
            username: "permission_catalog_denied".to_string(),
            display_name: "权限目录拒绝用户".to_string(),
            email: String::new(),
            mobile: String::new(),
            password: "MemberPass2026!".to_string(),
            role_code: "member".to_string(),
        },
    )
    .await
    .expect("member should create");
    let member_session = auth::issue_session(&pool, member_id, 3600)
        .await
        .expect("member session should issue");
    let denied = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/permissions")
                .header(
                    header::COOKIE,
                    auth::session_cookie_header(&member_session.raw_token, false),
                )
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(denied.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn api_system_users_view_returns_atomic_pagination_permissions_and_project_constraints() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let member_user_id = create_user_with_role(
        &pool,
        "atomic_member",
        "原子读取成员",
        "MemberPass2026!",
        "member",
    )
    .await;
    for index in 1..=10 {
        create_user_with_role(
            &pool,
            &format!("atomic_page_{index:02}"),
            &format!("分页成员 {index:02}"),
            "MemberPass2026!",
            "member",
        )
        .await;
    }

    let owned_project = projects::create_project(
        &pool,
        member_user_id,
        projects::CreateProjectInput {
            name: "成员负责项目".to_string(),
            description: "负责人关系不可移除".to_string(),
            status: "in_progress".to_string(),
            start_date: String::new(),
            due_date: String::new(),
        },
    )
    .await
    .expect("owned project should create");
    let blocked_project = projects::create_project(
        &pool,
        initialized.user_id,
        projects::CreateProjectInput {
            name: "活跃工作项项目".to_string(),
            description: "活跃工作项阻止移除".to_string(),
            status: "in_progress".to_string(),
            start_date: String::new(),
            due_date: String::new(),
        },
    )
    .await
    .expect("blocked project should create");
    projects::add_project_member(
        &pool,
        initialized.user_id,
        &blocked_project.project_key,
        "atomic_member",
        "maintainer",
    )
    .await
    .expect("member should join blocked project");
    projects::create_work_item(
        &pool,
        initialized.user_id,
        projects::CreateWorkItemInput {
            project_key: blocked_project.project_key.clone(),
            item_type: "task".to_string(),
            title: "阻止移除的活跃任务".to_string(),
            description: String::new(),
            priority: "P2".to_string(),
            assignee_username: "atomic_member".to_string(),
            due_date: String::new(),
            parent_item_key: String::new(),
            actor_display_name_snapshot: String::new(),
        },
    )
    .await
    .expect("blocking work item should create");
    let paused_project = projects::create_project(
        &pool,
        initialized.user_id,
        projects::CreateProjectInput {
            name: "暂停候选项目".to_string(),
            description: "暂停项目不得作为分配候选".to_string(),
            status: "on_hold".to_string(),
            start_date: String::new(),
            due_date: String::new(),
        },
    )
    .await
    .expect("paused project should create");

    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let default_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/users-view")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(default_response.status(), StatusCode::OK);
    let default_payload: Value = serde_json::from_str(&response_body(default_response).await)
        .expect("users view response should be JSON");
    assert_eq!(
        default_payload["data"]["items"].as_array().map(Vec::len),
        Some(10)
    );
    assert_eq!(default_payload["data"]["pagination"]["page"], 1);
    assert_eq!(default_payload["data"]["pagination"]["per_page"], 10);
    assert_eq!(default_payload["data"]["pagination"]["total_items"], 12);
    assert_eq!(default_payload["data"]["pagination"]["total_pages"], 2);
    assert_eq!(default_payload["data"]["can_manage_users"], true);
    assert_eq!(default_payload["data"]["can_manage_user_projects"], true);
    assert!(
        default_payload["data"]["roles"]
            .as_array()
            .is_some_and(|roles| !roles.is_empty())
    );
    let project_options = default_payload["data"]["project_options"]
        .as_array()
        .expect("project options should be an array");
    assert!(
        project_options
            .iter()
            .any(|project| project["key"] == owned_project.project_key)
    );
    assert!(
        !project_options
            .iter()
            .any(|project| project["key"] == paused_project.project_key)
    );

    let member_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/users-view?page=2&per_page=20")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(member_response.status(), StatusCode::OK);
    let member_payload: Value = serde_json::from_str(&response_body(member_response).await)
        .expect("users view response should be JSON");
    assert_eq!(member_payload["data"]["pagination"]["page"], 1);
    assert_eq!(member_payload["data"]["pagination"]["per_page"], 20);
    let member = member_payload["data"]["items"]
        .as_array()
        .and_then(|items| {
            items
                .iter()
                .find(|item| item["username"] == "atomic_member")
        })
        .expect("atomic member should be present");
    let assignments = member["assigned_projects"]
        .as_array()
        .expect("assigned projects should be an array");
    let owned = assignments
        .iter()
        .find(|project| project["key"] == owned_project.project_key)
        .expect("owned project should be present");
    assert_eq!(owned["role_code"], "owner");
    assert_eq!(owned["can_update_role"], false);
    assert_eq!(owned["can_remove"], false);
    assert!(
        owned["remove_block_reason"]
            .as_str()
            .is_some_and(|reason| reason.contains("负责人"))
    );
    let blocked = assignments
        .iter()
        .find(|project| project["key"] == blocked_project.project_key)
        .expect("blocked project should be present");
    assert_eq!(blocked["role_code"], "maintainer");
    assert_eq!(blocked["active_assigned_count"], 1);
    assert_eq!(blocked["can_update_role"], true);
    assert_eq!(blocked["can_remove"], false);
    assert!(
        blocked["remove_block_reason"]
            .as_str()
            .is_some_and(|reason| reason.contains("1 个"))
    );
}

#[tokio::test]
async fn api_system_user_project_relationship_flow_preserves_constraints() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let member_user_id =
        create_user_with_role(&pool, "api_member", "API 成员", "MemberPass2026!", "member").await;
    let mut project_keys = Vec::new();
    for name in ["关系项目 A", "关系项目 B", "关系项目 C"] {
        let project = projects::create_project(
            &pool,
            initialized.user_id,
            projects::CreateProjectInput {
                name: name.to_string(),
                description: "系统用户项目关系 API".to_string(),
                status: "in_progress".to_string(),
                start_date: String::new(),
                due_date: String::new(),
            },
        )
        .await
        .expect("project should create");
        project_keys.push(project.project_key);
    }
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let cookie = with_csrf_cookie(&initialized.cookie);

    let assigned = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/system/users/api_member/projects")
                .header(header::COOKIE, &cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "project_keys": project_keys,
                        "member_role": "viewer",
                    })
                    .to_string(),
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(assigned.status(), StatusCode::OK);
    let assigned_payload = response_json(assigned).await;
    assert_eq!(
        assigned_payload["data"]["assigned_projects"]
            .as_array()
            .map(Vec::len),
        Some(3)
    );

    let role_updated = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!(
                    "/api/v1/system/users/api_member/projects/{}/role",
                    project_keys[0]
                ))
                .header(header::COOKIE, &cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(r#"{"member_role":"maintainer"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(role_updated.status(), StatusCode::OK);
    assert_eq!(
        projects::project_member_role(
            &pool,
            projects::get_project_detail(&pool, &project_keys[0])
                .await
                .expect("project should load")
                .expect("project should exist")
                .id,
            member_user_id,
        )
        .await
        .expect("member role should load"),
        Some("maintainer".to_string())
    );

    projects::create_work_item(
        &pool,
        member_user_id,
        projects::CreateWorkItemInput {
            project_key: project_keys[1].clone(),
            item_type: "task".to_string(),
            title: "阻塞项目关系移除".to_string(),
            description: String::new(),
            priority: "P2".to_string(),
            assignee_username: "api_member".to_string(),
            due_date: String::new(),
            parent_item_key: String::new(),
            actor_display_name_snapshot: String::new(),
        },
    )
    .await
    .expect("blocking work item should create");
    let blocked = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri("/api/v1/system/users/api_member/projects")
                .header(header::COOKIE, &cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::json!({ "project_keys": [project_keys[1].clone(), project_keys[2].clone()] }).to_string(),
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(blocked.status(), StatusCode::BAD_REQUEST);
    let memberships = projects::list_user_project_memberships(&pool, member_user_id)
        .await
        .expect("memberships should load");
    assert_eq!(memberships.len(), 3);

    let removed_one = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!(
                    "/api/v1/system/users/api_member/projects/{}",
                    project_keys[0]
                ))
                .header(header::COOKIE, &cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(removed_one.status(), StatusCode::OK);

    let removed_batch = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri("/api/v1/system/users/api_member/projects")
                .header(header::COOKIE, cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::json!({ "project_keys": [project_keys[2].clone()] }).to_string(),
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(removed_batch.status(), StatusCode::OK);
    let remaining = projects::list_user_project_memberships(&pool, member_user_id)
        .await
        .expect("memberships should load");
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].project_key, project_keys[1]);
}

#[tokio::test]
async fn regular_member_cannot_access_system_users_page() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    create_user_with_role(&pool, "member1", "成员一", "MemberPass2026!", "member").await;
    let session = auth::login(&pool, "member1", "MemberPass2026!")
        .await
        .expect("member should login");
    let cookie = auth::session_cookie_header(&session.raw_token, false);
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/users?page=2&per_page=5")
                .header(header::COOKIE, cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn role_permission_update_adds_parent_page_for_action_permission() {
    let pool = test_pool().await;
    rbac::seed_core(&pool)
        .await
        .expect("rbac core seed should run");
    rbac::create_role(&pool, "operator", "运营", "self")
        .await
        .expect("role should create");

    rbac::replace_role_permissions(&pool, "operator", &["system.users.manage".to_string()])
        .await
        .expect("permissions should replace");

    let permissions = rbac::list_permissions_for_role(&pool, Some("operator"))
        .await
        .expect("permissions should load");
    let granted = permissions
        .into_iter()
        .filter(|permission| permission.granted)
        .map(|permission| permission.permission_key)
        .collect::<Vec<_>>();

    assert!(granted.contains(&"system.users.manage".to_string()));
    assert!(granted.contains(&"system.users.view".to_string()));
}

#[tokio::test]
async fn api_system_database_stats_requires_permission_and_returns_snapshot() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    create_user_with_role(
        &pool,
        "stats_member",
        "统计成员",
        "StatsPass2026!",
        "member",
    )
    .await;
    let regular_session = auth::login(&pool, "stats_member", "StatsPass2026!")
        .await
        .expect("member should login");
    let regular_cookie = auth::session_cookie_header(&regular_session.raw_token, false);
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let success_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/database-stats")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(success_response.status(), StatusCode::OK);
    let success_body = response_body(success_response).await;
    assert!(success_body.contains(r#""table_name":"users""#));
    assert!(success_body.contains(r#""remark":"用户账号""#));
    assert!(success_body.contains(r#""table_name":"refresh_sessions""#));

    let forbidden_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/database-stats")
                .header(header::COOKIE, regular_cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(forbidden_response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn api_system_docs_requires_permission_and_returns_embedded_contract() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    create_user_with_role(
        &pool,
        "api_docs_member",
        "文档普通成员",
        "ApiDocsPass2026!",
        "member",
    )
    .await;
    let regular_session = auth::login(&pool, "api_docs_member", "ApiDocsPass2026!")
        .await
        .expect("member should login");
    let regular_cookie = auth::session_cookie_header(&regular_session.raw_token, false);
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let success_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/api-docs-view")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(success_response.status(), StatusCode::OK);
    let payload: Value = serde_json::from_str(&response_body(success_response).await)
        .expect("API docs response should be JSON");
    let document: Value = serde_json::from_str(
        payload["data"]["source"]
            .as_str()
            .expect("embedded document should be a string"),
    )
    .expect("embedded document should be valid JSON");
    assert_eq!(document["openapi"], "3.1.0");
    assert!(document["paths"]["/api/v1/system/releases"].is_object());

    let forbidden_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/api-docs-view")
                .header(header::COOKIE, regular_cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(forbidden_response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn api_system_roles_view_returns_atomic_selection_permissions_and_capabilities() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    for index in 1..=11 {
        let role_code = format!("atomic_role_{index:02}");
        rbac::create_role(&pool, &role_code, &format!("原子角色 {index:02}"), "all")
            .await
            .expect("role should create");
    }
    rbac::replace_role_permissions(
        &pool,
        "atomic_role_11",
        &["system.dashboard.view".to_string()],
    )
    .await
    .expect("role permissions should update");

    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/roles-view?role=atomic_role_11")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::OK);
    let payload: Value = serde_json::from_str(&response_body(response).await)
        .expect("roles view response should be JSON");
    assert_eq!(payload["data"]["items"].as_array().map(Vec::len), Some(10));
    assert_eq!(payload["data"]["pagination"]["page"], 1);
    assert_eq!(payload["data"]["pagination"]["per_page"], 10);
    assert_eq!(payload["data"]["pagination"]["total_items"], 13);
    assert_eq!(payload["data"]["pagination"]["total_pages"], 2);
    assert_eq!(
        payload["data"]["selected_role"]["role_code"],
        "atomic_role_11"
    );
    assert_eq!(payload["data"]["can_manage_roles"], true);
    assert_eq!(payload["data"]["can_edit_permissions"], true);
    assert!(
        payload["data"]["permissions"]
            .as_array()
            .is_some_and(|permissions| permissions.iter().any(|permission| {
                permission["permission_key"] == "system.dashboard.view"
                    && permission["granted"] == true
            }))
    );

    let system_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/roles-view?role=system_admin&page=2")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(system_response.status(), StatusCode::OK);
    let system_payload: Value = serde_json::from_str(&response_body(system_response).await)
        .expect("roles view response should be JSON");
    assert_eq!(
        system_payload["data"]["selected_role"]["role_code"],
        "system_admin"
    );
    assert_eq!(system_payload["data"]["can_edit_permissions"], false);
}

#[tokio::test]
async fn api_system_user_management_flow_uses_rbac_and_csrf() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let regular_user_id = create_user_with_role(
        &pool,
        "api_regular",
        "API 普通用户",
        "RegularPass2026!",
        "member",
    )
    .await;
    let regular_session = auth::issue_session(&pool, regular_user_id, 3600)
        .await
        .expect("session should issue");
    let regular_cookie = auth::session_cookie_header(&regular_session.raw_token, false);
    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let admin_cookie = with_csrf_cookie(&initialized.cookie);

    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/system/users")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, admin_cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"username":"api_member","display_name":"API 成员","email":"api@example.test","mobile":"13800138000","password":"MemberPass2026!","role_code":"member"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(create_response.status(), StatusCode::CREATED);
    let create_body = response_body(create_response).await;
    assert!(create_body.contains(r#""username":"api_member""#));
    assert!(create_body.contains(r#""role_code":"member""#));

    let list_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/users")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(list_response.status(), StatusCode::OK);
    let list_body = response_body(list_response).await;
    assert!(list_body.contains("api_member"));
    assert!(!list_body.contains("MemberPass2026!"));

    let disable_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/system/users/api_member/status")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, admin_cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"status":"disabled"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(disable_response.status(), StatusCode::OK);
    assert!(
        response_body(disable_response)
            .await
            .contains(r#""status":"disabled""#)
    );

    let reset_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/system/users/api_member/password")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, admin_cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"password":"NewMemberPass2026!"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(reset_response.status(), StatusCode::OK);
    assert!(
        !response_body(reset_response)
            .await
            .contains("NewMemberPass2026!")
    );

    let forbidden_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/users")
                .header(header::COOKIE, regular_cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(forbidden_response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn api_system_role_permissions_flow_matches_permission_tree_model() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let admin_cookie = with_csrf_cookie(&initialized.cookie);

    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/system/roles")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, admin_cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"role_code":"api_viewer","role_name":"API 观察员","data_scope_type":"self"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(create_response.status(), StatusCode::CREATED);
    assert!(
        response_body(create_response)
            .await
            .contains(r#""role_code":"api_viewer""#)
    );

    let permissions_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/system/roles/api_viewer/permissions")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, admin_cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"permission_keys":["system.users.manage"]}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(permissions_response.status(), StatusCode::OK);
    let permissions_body = response_body(permissions_response).await;
    assert!(permissions_body.contains(r#""permission_key":"system.users.manage""#));
    assert!(permissions_body.contains(r#""permission_key":"system.users.view""#));
    assert!(permissions_body.contains(r#""granted":true"#));

    let list_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/roles")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(list_response.status(), StatusCode::OK);
    assert!(response_body(list_response).await.contains("api_viewer"));

    let system_role_response = app
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/system/roles/member/permissions")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, admin_cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"permission_keys":["system.users.view"]}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(system_role_response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn api_system_releases_view_returns_one_atomic_paginated_snapshot() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let write_cookie = with_csrf_cookie(&initialized.cookie);
    create_system_release_api(
        &app,
        &write_cookie,
        "v2.0.0",
        "共享发布视图",
        "原子读取设置、版本和资产。",
    )
    .await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/releases-view?page=1&per_page=20")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let payload = response_json(response).await;
    assert_eq!(payload["data"]["settings"]["retention_count"], 5);
    assert_eq!(
        payload["data"]["items"][0]["release"]["version_name"],
        "v2.0.0"
    );
    assert_eq!(payload["data"]["items"][0]["assets"], serde_json::json!([]));
    assert_eq!(payload["data"]["pagination"]["per_page"], 20);
    assert_eq!(payload["data"]["pagination"]["total_items"], 1);
    assert_eq!(payload["data"]["can_manage_releases"], true);

    let member_id = users::create_user(
        &pool,
        users::CreateUserInput {
            username: "release_view_denied".to_string(),
            display_name: "发布读取拒绝用户".to_string(),
            email: String::new(),
            mobile: String::new(),
            password: "MemberPass2026!".to_string(),
            role_code: "member".to_string(),
        },
    )
    .await
    .expect("member should create");
    let member_session = auth::issue_session(&pool, member_id, 3600)
        .await
        .expect("member session should issue");
    let denied = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/releases-view")
                .header(
                    header::COOKIE,
                    auth::session_cookie_header(&member_session.raw_token, false),
                )
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(denied.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn api_system_openapi_view_enforces_permissions_and_plaintext_once() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let write_cookie = with_csrf_cookie(&initialized.cookie);

    let empty = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/openapi-view")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(empty.status(), StatusCode::OK);
    assert_eq!(
        empty.headers().get(header::CACHE_CONTROL).unwrap(),
        "private, no-store"
    );
    let empty_payload = response_json(empty).await;
    assert_eq!(empty_payload["data"]["items"], serde_json::json!([]));
    assert_eq!(empty_payload["data"]["active_count"], 0);
    assert_eq!(empty_payload["data"]["token_limit"], 100);
    assert_eq!(empty_payload["data"]["can_manage_tokens"], true);

    let created = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/system/api-tokens")
                .header(header::COOKIE, write_cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "name": "Shared release automation",
                        "scopes": ["system_release:read", "system_release:write"]
                    })
                    .to_string(),
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(created.status(), StatusCode::CREATED);
    assert_eq!(
        created.headers().get(header::CACHE_CONTROL).unwrap(),
        "private, no-store"
    );
    let created_payload = response_json(created).await;
    let token_id = created_payload["data"]["token"]["id"]
        .as_i64()
        .expect("created token id should exist");
    let raw_token = created_payload["data"]["raw_token"]
        .as_str()
        .expect("created token plaintext should be returned once");
    assert!(raw_token.starts_with("yuance_sys_pat_"));
    assert_eq!(
        created_payload["data"]["token"]["name"],
        "Shared release automation"
    );

    let view = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/openapi-view")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let view_payload = response_json(view).await;
    assert_eq!(view_payload["data"]["active_count"], 1);
    assert_eq!(view_payload["data"]["items"][0]["id"], token_id);
    assert_eq!(
        view_payload["data"]["items"][0]["raw_token"],
        serde_json::Value::Null
    );
    assert!(!view_payload.to_string().contains(raw_token));

    let updated = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/v1/system/api-tokens/{token_id}"))
                .header(header::COOKIE, write_cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "name": "Release reader",
                        "scopes": ["system_release:read"]
                    })
                    .to_string(),
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(updated.status(), StatusCode::OK);
    let updated_payload = response_json(updated).await;
    assert_eq!(updated_payload["data"]["name"], "Release reader");
    assert_eq!(
        updated_payload["data"]["raw_token"],
        serde_json::Value::Null
    );

    let member_id = users::create_user(
        &pool,
        users::CreateUserInput {
            username: "openapi_view_denied".to_string(),
            display_name: "系统 Token 拒绝用户".to_string(),
            email: String::new(),
            mobile: String::new(),
            password: "MemberPass2026!".to_string(),
            role_code: "member".to_string(),
        },
    )
    .await
    .expect("member should create");
    let member_session = auth::issue_session(&pool, member_id, 3600)
        .await
        .expect("member session should issue");
    let denied = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/openapi-view")
                .header(
                    header::COOKIE,
                    auth::session_cookie_header(&member_session.raw_token, false),
                )
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(denied.status(), StatusCode::FORBIDDEN);

    let deleted = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/api/v1/system/api-tokens/{token_id}"))
                .header(header::COOKIE, write_cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(deleted.status(), StatusCode::OK);
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM system_api_tokens")
            .fetch_one(&pool)
            .await
            .expect("token count should load"),
        0
    );
}

#[tokio::test]
async fn system_token_can_manage_release_api_without_csrf() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    seed_memory_storage_config(&pool, initialized.user_id).await;
    let settings = test_settings();
    let created = system_api_tokens::create_token(
        &pool,
        &settings.security_master_key,
        initialized.user_id,
        system_api_tokens::CreateSystemApiTokenInput {
            name: "Release Robot".to_string(),
            scopes: vec![
                system_api_tokens::SCOPE_SYSTEM_RELEASE_READ.to_string(),
                system_api_tokens::SCOPE_SYSTEM_RELEASE_WRITE.to_string(),
            ],
        },
    )
    .await
    .expect("system token should create");
    let app = build_router(AppState::new(settings.clone(), Some(pool.clone())));

    let release_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/system/releases")
                .header(
                    header::AUTHORIZATION,
                    format!("Bearer {}", created.raw_token),
                )
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "version_name": "v2.0.0",
                        "title": "系统 Token 发布",
                        "notes": "通过 system token 创建"
                    })
                    .to_string(),
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(release_response.status(), StatusCode::CREATED);
    let release_json = response_json(release_response).await;
    let release_id = json_i64(&release_json, &["data", "release", "id"]);

    let asset_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v1/system/releases/{release_id}/assets"))
                .header(
                    header::AUTHORIZATION,
                    format!("Bearer {}", created.raw_token),
                )
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "platform": "linux",
                        "architecture": "arm64",
                        "original_filename": "yuance-linux-v2.0.0.tar.gz",
                        "content_type": "application/gzip",
                        "byte_size": 10
                    })
                    .to_string(),
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(asset_response.status(), StatusCode::CREATED);
    let asset_json = response_json(asset_response).await;
    assert_eq!(json_string(&asset_json, &["data", "architecture"]), "arm64");
    let asset_id = json_i64(&asset_json, &["data", "id"]);

    let upload_url_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/system/releases/{release_id}/assets/{asset_id}/upload-url"
                ))
                .header(
                    header::AUTHORIZATION,
                    format!("Bearer {}", created.raw_token),
                )
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(upload_url_response.status(), StatusCode::OK);
    let upload_url_json = response_json(upload_url_response).await;
    let upload_url = json_string(&upload_url_json, &["data", "request", "url"]);

    upload_test_storage_object_with_bearer(
        &app,
        &created.raw_token,
        &upload_url,
        b"release-v2",
        "application/gzip",
    )
    .await;

    let mark_uploaded_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/v1/system/releases/{release_id}/assets/{asset_id}/uploaded"
                ))
                .header(
                    header::AUTHORIZATION,
                    format!("Bearer {}", created.raw_token),
                )
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(mark_uploaded_response.status(), StatusCode::OK);

    let publish_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/v1/system/releases/{release_id}"))
                .header(
                    header::AUTHORIZATION,
                    format!("Bearer {}", created.raw_token),
                )
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "version_name": "v2.0.0",
                        "title": "系统 Token 发布",
                        "notes": "通过 system token 创建",
                        "publish": true
                    })
                    .to_string(),
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(publish_response.status(), StatusCode::OK);
    let publish_json = response_json(publish_response).await;
    assert_eq!(
        json_string(&publish_json, &["data", "release", "status"]),
        "published"
    );

    let list_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/releases")
                .header(
                    header::AUTHORIZATION,
                    format!("Bearer {}", created.raw_token),
                )
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(list_response.status(), StatusCode::OK);
    let list_json = response_json(list_response).await;
    assert_eq!(
        json_string(&list_json, &["data", "items", "0", "version_name"]),
        "v2.0.0"
    );

    let settings_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/releases/settings")
                .header(
                    header::AUTHORIZATION,
                    format!("Bearer {}", created.raw_token),
                )
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(settings_response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn desktop_downloads_page_exposes_only_published_uploaded_assets() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    seed_memory_storage_config(&pool, initialized.user_id).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let admin_cookie = with_csrf_cookie(&initialized.cookie);

    let release = create_system_release_api(
        &app,
        &admin_cookie,
        "v0.1.0",
        "元策桌面端 0.1.0",
        "首个 Electron 桌面端版本",
    )
    .await;
    let release_id = json_i64(&release, &["data", "release", "id"]);
    let desktop_assets = [
        (
            "macos",
            "x64",
            "Yuance-0.1.0-mac-x64.dmg",
            "application/x-apple-diskimage",
        ),
        (
            "macos",
            "arm64",
            "Yuance-0.1.0-mac-arm64.dmg",
            "application/x-apple-diskimage",
        ),
        (
            "windows",
            "x64",
            "Yuance-0.1.0-win-x64.exe",
            "application/x-msdownload",
        ),
        (
            "windows",
            "arm64",
            "Yuance-0.1.0-win-arm64.exe",
            "application/x-msdownload",
        ),
        (
            "linux",
            "x64",
            "Yuance-0.1.0-linux-x64.AppImage",
            "application/octet-stream",
        ),
        (
            "linux",
            "arm64",
            "Yuance-0.1.0-linux-arm64.AppImage",
            "application/octet-stream",
        ),
    ];
    let mut macos_arm64_asset_id = 0;
    for (platform, architecture, filename, content_type) in desktop_assets {
        let asset = create_system_release_asset_api_with_architecture(
            &app,
            &admin_cookie,
            release_id,
            platform,
            architecture,
            filename,
            content_type,
            11,
        )
        .await;
        let asset_id = json_i64(&asset, &["data", "id"]);
        let upload =
            get_system_release_asset_upload_url_api(&app, &admin_cookie, release_id, asset_id)
                .await;
        let upload_url = json_string(&upload, &["data", "request", "url"]);
        upload_test_storage_object(
            &app,
            &admin_cookie,
            &upload_url,
            b"desktop-app",
            content_type,
        )
        .await;
        mark_system_release_asset_uploaded_api(&app, &admin_cookie, release_id, asset_id).await;
        if platform == "macos" && architecture == "arm64" {
            macos_arm64_asset_id = asset_id;
        }
    }
    assert!(macos_arm64_asset_id > 0);
    update_system_release_api(
        &app,
        &admin_cookie,
        release_id,
        "v0.1.0",
        "元策桌面端 0.1.0",
        "首个 Electron 桌面端版本",
        true,
    )
    .await;

    let mobile_release = create_system_release_api(
        &app,
        &admin_cookie,
        "v0.2.0",
        "移动端预发布",
        "不应覆盖桌面下载入口",
    )
    .await;
    let mobile_release_id = json_i64(&mobile_release, &["data", "release", "id"]);
    let mobile_asset = create_system_release_asset_api(
        &app,
        &admin_cookie,
        mobile_release_id,
        "android",
        "Yuance-0.2.0-android-universal.apk",
        "application/vnd.android.package-archive",
        10,
    )
    .await;
    let mobile_asset_id = json_i64(&mobile_asset, &["data", "id"]);
    let mobile_upload = get_system_release_asset_upload_url_api(
        &app,
        &admin_cookie,
        mobile_release_id,
        mobile_asset_id,
    )
    .await;
    let mobile_upload_url = json_string(&mobile_upload, &["data", "request", "url"]);
    upload_test_storage_object(
        &app,
        &admin_cookie,
        &mobile_upload_url,
        b"mobile-app",
        "application/vnd.android.package-archive",
    )
    .await;
    mark_system_release_asset_uploaded_api(&app, &admin_cookie, mobile_release_id, mobile_asset_id)
        .await;
    update_system_release_api(
        &app,
        &admin_cookie,
        mobile_release_id,
        "v0.2.0",
        "移动端预发布",
        "不应覆盖桌面下载入口",
        true,
    )
    .await;

    let incomplete_release = create_system_release_api(
        &app,
        &admin_cookie,
        "v0.3.0",
        "不完整桌面端版本",
        "缺少部分桌面架构包，不应覆盖下载入口",
    )
    .await;
    let incomplete_release_id = json_i64(&incomplete_release, &["data", "release", "id"]);
    let incomplete_asset = create_system_release_asset_api_with_architecture(
        &app,
        &admin_cookie,
        incomplete_release_id,
        "windows",
        "x64",
        "Yuance-0.3.0-win-x64.exe",
        "application/x-msdownload",
        12,
    )
    .await;
    let incomplete_asset_id = json_i64(&incomplete_asset, &["data", "id"]);
    let incomplete_upload = get_system_release_asset_upload_url_api(
        &app,
        &admin_cookie,
        incomplete_release_id,
        incomplete_asset_id,
    )
    .await;
    let incomplete_upload_url = json_string(&incomplete_upload, &["data", "request", "url"]);
    upload_test_storage_object(
        &app,
        &admin_cookie,
        &incomplete_upload_url,
        b"incomplete!!",
        "application/x-msdownload",
    )
    .await;
    mark_system_release_asset_uploaded_api(
        &app,
        &admin_cookie,
        incomplete_release_id,
        incomplete_asset_id,
    )
    .await;
    update_system_release_api(
        &app,
        &admin_cookie,
        incomplete_release_id,
        "v0.3.0",
        "不完整桌面端版本",
        "缺少部分桌面架构包，不应覆盖下载入口",
        true,
    )
    .await;

    let downloads_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/downloads")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(downloads_response.status(), StatusCode::OK);
    let downloads_body = response_body(downloads_response).await;
    assert!(downloads_body.contains("元策桌面端 0.1.0"));
    assert!(downloads_body.contains("Yuance-0.1.0-mac-arm64.dmg"));
    assert!(downloads_body.contains(&format!(
        "/web/downloads/{release_id}/assets/{macos_arm64_asset_id}"
    )));
    assert_eq!(
        downloads_body
            .matches(&format!("/web/downloads/{release_id}/assets/"))
            .count(),
        6
    );
    assert!(!downloads_body.contains("待发布"));
    assert!(!downloads_body.contains("不完整桌面端版本"));
    assert!(!downloads_body.contains("class=\"topbar\""));

    let download_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/web/downloads/{release_id}/assets/{macos_arm64_asset_id}"
                ))
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(download_response.status(), StatusCode::OK);
    assert_eq!(
        download_response
            .headers()
            .get(header::CONTENT_DISPOSITION)
            .expect("download should use attachment disposition"),
        "attachment"
    );
    assert_eq!(response_body(download_response).await, "desktop-app");
}

#[tokio::test]
async fn api_system_release_flow_supports_publish_and_retention_prune() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    seed_memory_storage_config(&pool, initialized.user_id).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let admin_cookie = with_csrf_cookie(&initialized.cookie);

    let first_release =
        create_system_release_api(&app, &admin_cookie, "v1.0.0", "首发版本", "首发说明").await;
    let first_release_id = json_i64(&first_release, &["data", "release", "id"]);
    let first_version = json_string(&first_release, &["data", "release", "version_name"]);
    assert_eq!(first_version, "v1.0.0");

    let first_asset = create_system_release_asset_api(
        &app,
        &admin_cookie,
        first_release_id,
        "windows",
        "yuance-setup-v1.0.0.exe",
        "application/octet-stream",
        7,
    )
    .await;
    let first_asset_id = json_i64(&first_asset, &["data", "id"]);
    let first_object_key = json_string(&first_asset, &["data", "object_key"]);

    let first_upload = get_system_release_asset_upload_url_api(
        &app,
        &admin_cookie,
        first_release_id,
        first_asset_id,
    )
    .await;
    let first_upload_url = json_string(&first_upload, &["data", "request", "url"]);
    upload_test_storage_object(
        &app,
        &admin_cookie,
        &first_upload_url,
        b"first-v",
        "application/octet-stream",
    )
    .await;
    mark_system_release_asset_uploaded_api(&app, &admin_cookie, first_release_id, first_asset_id)
        .await;

    let first_published = update_system_release_api(
        &app,
        &admin_cookie,
        first_release_id,
        "v1.0.0",
        "首发版本",
        "首发说明",
        true,
    )
    .await;
    assert_eq!(
        json_string(&first_published, &["data", "release", "status"]),
        "published"
    );

    let settings_updated = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/system/releases/settings")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, admin_cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"retention_count":1}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(settings_updated.status(), StatusCode::OK);
    assert_eq!(
        json_i64(
            &response_json(settings_updated).await,
            &["data", "retention_count"]
        ),
        1
    );

    let second_release =
        create_system_release_api(&app, &admin_cookie, "v1.1.0", "二次发布", "第二个版本").await;
    let second_release_id = json_i64(&second_release, &["data", "release", "id"]);

    let second_asset = create_system_release_asset_api(
        &app,
        &admin_cookie,
        second_release_id,
        "android",
        "yuance-app-v1.1.0.apk",
        "application/vnd.android.package-archive",
        8,
    )
    .await;
    let second_asset_id = json_i64(&second_asset, &["data", "id"]);

    let second_upload = get_system_release_asset_upload_url_api(
        &app,
        &admin_cookie,
        second_release_id,
        second_asset_id,
    )
    .await;
    let second_upload_url = json_string(&second_upload, &["data", "request", "url"]);
    upload_test_storage_object(
        &app,
        &admin_cookie,
        &second_upload_url,
        b"second-v",
        "application/vnd.android.package-archive",
    )
    .await;
    mark_system_release_asset_uploaded_api(&app, &admin_cookie, second_release_id, second_asset_id)
        .await;

    let second_published = update_system_release_api(
        &app,
        &admin_cookie,
        second_release_id,
        "v1.1.0",
        "二次发布",
        "第二个版本",
        true,
    )
    .await;
    assert_eq!(
        json_string(&second_published, &["data", "release", "status"]),
        "published"
    );

    let first_get = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/v1/system/releases/{first_release_id}"))
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(first_get.status(), StatusCode::NOT_FOUND);

    let list_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/releases")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(list_response.status(), StatusCode::OK);
    let list_json = response_json(list_response).await;
    assert_eq!(
        json_i64(&list_json, &["data", "pagination", "total_items"]),
        1
    );
    assert_eq!(
        json_string(&list_json, &["data", "items", "0", "version_name"]),
        "v1.1.0"
    );

    let pruned_object =
        storage::read_test_memory_object(&pool, &test_settings(), &first_object_key)
            .await
            .expect("pruned object lookup should succeed");
    assert!(pruned_object.is_none());

    let release_count =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM system_release_versions")
            .fetch_one(&pool)
            .await
            .expect("release count should load");
    let asset_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM system_release_assets")
        .fetch_one(&pool)
        .await
        .expect("asset count should load");
    let file_object_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM file_objects")
        .fetch_one(&pool)
        .await
        .expect("file object count should load");
    assert_eq!(release_count, 1);
    assert_eq!(asset_count, 1);
    assert_eq!(file_object_count, 1);
}

#[tokio::test]
async fn internal_release_retention_preserves_current_and_verified_n_minus_one() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let mut release_ids = Vec::new();
    for (index, age_days) in [(1, 3), (2, 2), (3, 1)] {
        let id = sqlx::query_scalar::<_, i64>(
            r#"
            INSERT INTO system_release_versions (
                version_name, title, status, channel, verification_status,
                manifest_sha256, signing_key_id, source_commit, source_tag,
                verified_at, published_at, created_by_user_id, updated_by_user_id
            )
            VALUES (
                ?1, ?1, 'published', 'internal', 'verified',
                ?2, '0123456789ABCDEF', ?3, ?4,
                datetime('now', ?5), datetime('now', ?5), ?6, ?6
            )
            RETURNING id
            "#,
        )
        .bind(format!("v4.0.{index}"))
        .bind(format!("{index:064x}"))
        .bind(format!("{index:040x}"))
        .bind(format!("desktop-v4.0.{index}"))
        .bind(format!("-{age_days} days"))
        .bind(initialized.user_id)
        .fetch_one(&pool)
        .await
        .expect("internal release should seed");
        release_ids.push(id);
    }

    for release_id in &release_ids[1..] {
        for (platform, architecture) in [
            ("macos", "x64"),
            ("macos", "arm64"),
            ("windows", "x64"),
            ("windows", "arm64"),
            ("linux", "x64"),
            ("linux", "arm64"),
        ] {
            let file_object_id = sqlx::query_scalar::<_, i64>(
                r#"
                INSERT INTO file_objects (
                    object_key, original_filename, content_type, byte_size,
                    checksum_sha256, status, created_by_user_id
                )
                VALUES (?1, ?2, 'application/octet-stream', 1, ?3, 'uploaded', ?4)
                RETURNING id
                "#,
            )
            .bind(format!("release/{release_id}/{platform}-{architecture}"))
            .bind(format!("Yuance-{release_id}-{platform}-{architecture}.bin"))
            .bind("0".repeat(64))
            .bind(initialized.user_id)
            .fetch_one(&pool)
            .await
            .expect("installer file should seed");
            sqlx::query(
                r#"
                INSERT INTO system_release_assets (
                    release_id, file_object_id, platform, architecture, artifact_kind
                )
                VALUES (?1, ?2, ?3, ?4, 'installer')
                "#,
            )
            .bind(release_id)
            .bind(file_object_id)
            .bind(platform)
            .bind(architecture)
            .execute(&pool)
            .await
            .expect("installer asset should seed");
        }
    }

    system_releases::update_settings(&pool, &test_settings(), initialized.user_id, 1)
        .await
        .expect("retention update should succeed");

    let remaining = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM system_release_versions ORDER BY published_at, id",
    )
    .fetch_all(&pool)
    .await
    .expect("remaining releases should load");
    assert_eq!(remaining, release_ids[1..]);

    system_releases::withdraw_release(
        &pool,
        initialized.user_id,
        release_ids[2],
        system_releases::WithdrawSystemReleaseInput {
            reason: "回退演练".to_string(),
            github_withdrawal_status: "pending".to_string(),
        },
    )
    .await
    .expect("current release should withdraw");
    let failed_withdrawal = system_releases::update_withdrawal_status(
        &pool,
        initialized.user_id,
        release_ids[2],
        "failed",
    )
    .await
    .expect("GitHub withdrawal failure should remain visible");
    assert_eq!(failed_withdrawal.release.github_withdrawal_status, "failed");
    let recovered = system_releases::get_latest_published_release_detail(&pool)
        .await
        .expect("latest query should succeed")
        .expect("N-1 should become latest");
    assert_eq!(recovered.release.id, release_ids[1]);
}

#[tokio::test]
async fn concurrent_release_download_check_converges_to_withdrawn_denial() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let release_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO system_release_versions (
            version_name, title, status, published_at,
            created_by_user_id, updated_by_user_id
        )
        VALUES ('v4.1.0', '并发撤回', 'published', datetime('now'), ?1, ?1)
        RETURNING id
        "#,
    )
    .bind(initialized.user_id)
    .fetch_one(&pool)
    .await
    .expect("release should seed");
    let barrier = std::sync::Arc::new(tokio::sync::Barrier::new(2));
    let withdraw_pool = pool.clone();
    let withdraw_barrier = barrier.clone();
    let actor_user_id = initialized.user_id;
    let withdraw = tokio::spawn(async move {
        withdraw_barrier.wait().await;
        system_releases::withdraw_release(
            &withdraw_pool,
            actor_user_id,
            release_id,
            system_releases::WithdrawSystemReleaseInput {
                reason: "并发撤回演练".to_string(),
                github_withdrawal_status: "pending".to_string(),
            },
        )
        .await
    });
    let download_pool = pool.clone();
    let download = tokio::spawn(async move {
        barrier.wait().await;
        system_releases::ensure_release_allows_download(&download_pool, release_id).await
    });
    withdraw
        .await
        .expect("withdraw task should join")
        .expect("withdraw should succeed");
    let _concurrent_result = download.await.expect("download task should join");
    assert!(
        system_releases::ensure_release_allows_download(&pool, release_id)
            .await
            .is_err()
    );
}

#[tokio::test]
async fn internal_system_release_requires_verification_and_supports_withdrawal() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    seed_memory_storage_config(&pool, initialized.user_id).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let admin_cookie = with_csrf_cookie(&initialized.cookie);

    let invalid = system_release_json_request(
        &app,
        &admin_cookie,
        "POST",
        "/api/v1/system/releases",
        serde_json::json!({"version_name":"v3.0.0","channel":"internal"}),
    )
    .await;
    assert_eq!(invalid.0, StatusCode::BAD_REQUEST);

    let created = system_release_json_request(
        &app,
        &admin_cookie,
        "POST",
        "/api/v1/system/releases",
        serde_json::json!({
            "version_name": "v3.0.0",
            "title": "内部桌面版",
            "notes": "仅供内部验证",
            "channel": "internal",
            "manifest_sha256": "a".repeat(64),
            "signing_key_id": "ABCDEF0123456789",
            "source_commit": "b".repeat(40),
            "source_tag": "desktop-v3.0.0"
        }),
    )
    .await;
    assert_eq!(created.0, StatusCode::CREATED);
    let release_id = json_i64(&created.1, &["data", "release", "id"]);
    assert_eq!(
        json_string(&created.1, &["data", "release", "verification_status"]),
        "pending"
    );

    let publish_before_verify = system_release_json_request(
        &app,
        &admin_cookie,
        "PATCH",
        &format!("/api/v1/system/releases/{release_id}"),
        serde_json::json!({
            "version_name": "v3.0.0", "title": "内部桌面版",
            "notes": "仅供内部验证", "publish": true
        }),
    )
    .await;
    assert_eq!(publish_before_verify.0, StatusCode::CONFLICT);

    let verify_incomplete = system_release_json_request(
        &app,
        &admin_cookie,
        "POST",
        &format!("/api/v1/system/releases/{release_id}/verify"),
        serde_json::json!({}),
    )
    .await;
    assert_eq!(verify_incomplete.0, StatusCode::BAD_REQUEST);

    let targets = [
        ("macos", "x64", "Yuance-3.0.0-mac-x64.dmg"),
        ("macos", "arm64", "Yuance-3.0.0-mac-arm64.dmg"),
        ("windows", "x64", "Yuance-3.0.0-win-x64.exe"),
        ("windows", "arm64", "Yuance-3.0.0-win-arm64.exe"),
        ("linux", "x64", "Yuance-3.0.0-linux-x64.AppImage"),
        ("linux", "arm64", "Yuance-3.0.0-linux-arm64.AppImage"),
    ];
    let mut first_asset_id = 0;
    for (platform, architecture, filename) in targets {
        let asset = create_system_release_asset_api_with_architecture(
            &app,
            &admin_cookie,
            release_id,
            platform,
            architecture,
            filename,
            "application/octet-stream",
            8,
        )
        .await;
        let asset_id = json_i64(&asset, &["data", "id"]);
        if first_asset_id == 0 {
            first_asset_id = asset_id;
        }
        let upload =
            get_system_release_asset_upload_url_api(&app, &admin_cookie, release_id, asset_id)
                .await;
        upload_test_storage_object(
            &app,
            &admin_cookie,
            &json_string(&upload, &["data", "request", "url"]),
            b"internal",
            "application/octet-stream",
        )
        .await;
        mark_system_release_asset_uploaded_api(&app, &admin_cookie, release_id, asset_id).await;
    }

    for (platform, architecture, filename) in targets {
        create_and_upload_system_release_evidence_asset(
            &app,
            &admin_cookie,
            release_id,
            platform,
            architecture,
            "signature",
            &format!("{filename}.minisig"),
            "c".repeat(64),
        )
        .await;
        create_and_upload_system_release_evidence_asset(
            &app,
            &admin_cookie,
            release_id,
            platform,
            architecture,
            "sbom",
            &format!("{filename}.cdx.json"),
            "d".repeat(64),
        )
        .await;
    }
    let mut manifest_asset_id = 0;
    for (kind, filename, checksum) in [
        ("manifest", "release-manifest.json", "a".repeat(64)),
        ("signature", "release-manifest.json.minisig", "e".repeat(64)),
        ("checksums", "SHA256SUMS", "f".repeat(64)),
        ("signature", "SHA256SUMS.minisig", "1".repeat(64)),
    ] {
        let evidence_asset_id = create_and_upload_system_release_evidence_asset(
            &app,
            &admin_cookie,
            release_id,
            "linux",
            "universal",
            kind,
            filename,
            checksum,
        )
        .await;
        if filename == "release-manifest.json" {
            manifest_asset_id = evidence_asset_id;
        }
    }
    let readback = system_release_json_request(
        &app,
        &admin_cookie,
        "GET",
        &format!("/api/v1/system/releases/{release_id}/assets/{manifest_asset_id}/download-url"),
        serde_json::json!({}),
    )
    .await;
    assert_eq!(readback.0, StatusCode::OK);
    assert_eq!(json_i64(&readback.1, &["data", "expires_in_seconds"]), 300);
    assert_eq!(
        json_string(&readback.1, &["data", "checksum_sha256"]),
        "a".repeat(64)
    );
    let old_readback_url = json_string(&readback.1, &["data", "request", "url"]);
    let excessive_ttl = system_release_json_request(
        &app,
        &admin_cookie,
        "GET",
        &format!(
            "/api/v1/system/releases/{release_id}/assets/{manifest_asset_id}/download-url?expires_in_seconds=301"
        ),
        serde_json::json!({}),
    )
    .await;
    assert_eq!(excessive_ttl.0, StatusCode::BAD_REQUEST);

    let verified = system_release_json_request(
        &app,
        &admin_cookie,
        "POST",
        &format!("/api/v1/system/releases/{release_id}/verify"),
        serde_json::json!({}),
    )
    .await;
    assert_eq!(verified.0, StatusCode::OK);
    assert_eq!(
        json_string(&verified.1, &["data", "release", "verification_status"]),
        "verified"
    );

    let published = system_release_json_request(
        &app, &admin_cookie, "PATCH", &format!("/api/v1/system/releases/{release_id}"),
        serde_json::json!({"version_name":"v3.0.0","title":"内部桌面版","notes":"仅供内部验证","publish":true}),
    ).await;
    assert_eq!(published.0, StatusCode::OK);

    let rewrite_published = system_release_json_request(
        &app,
        &admin_cookie,
        "PATCH",
        &format!("/api/v1/system/releases/{release_id}"),
        serde_json::json!({
            "version_name":"v3.0.0",
            "title":"被改写的标题",
            "notes":"仅供内部验证",
            "publish":false
        }),
    )
    .await;
    assert_eq!(rewrite_published.0, StatusCode::CONFLICT);

    let mutate_published = system_release_json_request(
        &app, &admin_cookie, "POST", &format!("/api/v1/system/releases/{release_id}/assets"),
        serde_json::json!({"platform":"linux","architecture":"x64","original_filename":"late.AppImage","content_type":"application/octet-stream","byte_size":1}),
    ).await;
    assert_eq!(mutate_published.0, StatusCode::CONFLICT);

    let withdrawn = system_release_json_request(
        &app,
        &admin_cookie,
        "POST",
        &format!("/api/v1/system/releases/{release_id}/withdraw"),
        serde_json::json!({"reason":"内部验证发现阻塞问题","github_withdrawal_status":"pending"}),
    )
    .await;
    assert_eq!(withdrawn.0, StatusCode::OK);
    assert_eq!(
        json_string(&withdrawn.1, &["data", "release", "status"]),
        "withdrawn"
    );
    let new_readback = system_release_json_request(
        &app,
        &admin_cookie,
        "GET",
        &format!("/api/v1/system/releases/{release_id}/assets/{manifest_asset_id}/download-url"),
        serde_json::json!({}),
    )
    .await;
    assert_eq!(new_readback.0, StatusCode::NOT_FOUND);
    let residual_readback = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(old_readback_url)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(residual_readback.status(), StatusCode::OK);

    let withdrawal_updated = system_release_json_request(
        &app,
        &admin_cookie,
        "PATCH",
        &format!("/api/v1/system/releases/{release_id}/withdrawal"),
        serde_json::json!({"github_withdrawal_status":"succeeded"}),
    )
    .await;
    assert_eq!(withdrawal_updated.0, StatusCode::OK);
    assert_eq!(
        json_string(
            &withdrawal_updated.1,
            &["data", "release", "github_withdrawal_status"]
        ),
        "succeeded"
    );

    let download = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/web/downloads/{release_id}/assets/{first_asset_id}"
                ))
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(download.status(), StatusCode::NOT_FOUND);
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
        cookie: auth::session_cookie_header(&result.session.raw_token, false),
    }
}

struct InitializedAdmin {
    user_id: i64,
    cookie: String,
}

async fn create_system_release_api(
    app: &axum::Router,
    admin_cookie: &str,
    version_name: &str,
    title: &str,
    notes: &str,
) -> Value {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/system/releases")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, admin_cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    serde_json::json!({
                        "version_name": version_name,
                        "title": title,
                        "notes": notes
                    })
                    .to_string(),
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::CREATED);
    response_json(response).await
}

async fn system_release_json_request(
    app: &axum::Router,
    admin_cookie: &str,
    method: &str,
    uri: &str,
    payload: Value,
) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(uri)
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, admin_cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(payload.to_string()))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let status = response.status();
    (status, response_json(response).await)
}

async fn create_and_upload_system_release_evidence_asset(
    app: &axum::Router,
    admin_cookie: &str,
    release_id: i64,
    platform: &str,
    architecture: &str,
    artifact_kind: &str,
    filename: &str,
    checksum_sha256: String,
) -> i64 {
    let created = system_release_json_request(
        app,
        admin_cookie,
        "POST",
        &format!("/api/v1/system/releases/{release_id}/assets"),
        serde_json::json!({
            "platform": platform,
            "architecture": architecture,
            "artifact_kind": artifact_kind,
            "original_filename": filename,
            "content_type": "application/octet-stream",
            "byte_size": 8,
            "checksum_sha256": checksum_sha256
        }),
    )
    .await;
    assert_eq!(created.0, StatusCode::CREATED);
    let asset_id = json_i64(&created.1, &["data", "id"]);
    let upload =
        get_system_release_asset_upload_url_api(app, admin_cookie, release_id, asset_id).await;
    upload_test_storage_object(
        app,
        admin_cookie,
        &json_string(&upload, &["data", "request", "url"]),
        b"evidence",
        "application/octet-stream",
    )
    .await;
    mark_system_release_asset_uploaded_api(app, admin_cookie, release_id, asset_id).await;
    asset_id
}

async fn update_system_release_api(
    app: &axum::Router,
    admin_cookie: &str,
    release_id: i64,
    version_name: &str,
    title: &str,
    notes: &str,
    publish: bool,
) -> Value {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/v1/system/releases/{release_id}"))
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, admin_cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    serde_json::json!({
                        "version_name": version_name,
                        "title": title,
                        "notes": notes,
                        "publish": publish
                    })
                    .to_string(),
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::OK);
    response_json(response).await
}

async fn create_system_release_asset_api(
    app: &axum::Router,
    admin_cookie: &str,
    release_id: i64,
    platform: &str,
    filename: &str,
    content_type: &str,
    byte_size: i64,
) -> Value {
    create_system_release_asset_api_with_architecture(
        app,
        admin_cookie,
        release_id,
        platform,
        "universal",
        filename,
        content_type,
        byte_size,
    )
    .await
}

async fn create_system_release_asset_api_with_architecture(
    app: &axum::Router,
    admin_cookie: &str,
    release_id: i64,
    platform: &str,
    architecture: &str,
    filename: &str,
    content_type: &str,
    byte_size: i64,
) -> Value {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v1/system/releases/{release_id}/assets"))
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, admin_cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    serde_json::json!({
                        "platform": platform,
                        "architecture": architecture,
                        "original_filename": filename,
                        "content_type": content_type,
                        "byte_size": byte_size,
                        "checksum_sha256": "0".repeat(64)
                    })
                    .to_string(),
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let status = response.status();
    let body = response_body(response).await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    serde_json::from_str(&body).expect("body should be valid json")
}

async fn get_system_release_asset_upload_url_api(
    app: &axum::Router,
    admin_cookie: &str,
    release_id: i64,
    asset_id: i64,
) -> Value {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/system/releases/{release_id}/assets/{asset_id}/upload-url"
                ))
                .header(header::COOKIE, admin_cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::OK);
    response_json(response).await
}

async fn mark_system_release_asset_uploaded_api(
    app: &axum::Router,
    admin_cookie: &str,
    release_id: i64,
    asset_id: i64,
) -> Value {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/v1/system/releases/{release_id}/assets/{asset_id}/uploaded"
                ))
                .header(header::COOKIE, admin_cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::OK);
    response_json(response).await
}

async fn upload_test_storage_object(
    app: &axum::Router,
    admin_cookie: &str,
    upload_url: &str,
    body: &[u8],
    content_type: &str,
) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(upload_url)
                .header(header::COOKIE, admin_cookie)
                .header(header::CONTENT_TYPE, content_type)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(body.to_vec()))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
}

async fn upload_test_storage_object_with_bearer(
    app: &axum::Router,
    raw_token: &str,
    upload_url: &str,
    body: &[u8],
    content_type: &str,
) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(upload_url)
                .header(header::AUTHORIZATION, format!("Bearer {raw_token}"))
                .header(header::CONTENT_TYPE, content_type)
                .body(Body::from(body.to_vec()))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
}

async fn create_user_with_role(
    pool: &sqlx::SqlitePool,
    username: &str,
    display_name: &str,
    password: &str,
    role_code: &str,
) -> i64 {
    let password_hash = auth::hash_password(password).expect("password should hash");
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
    .expect("user should create");

    let mut tx = pool.begin().await.expect("tx should begin");
    rbac::assign_role_to_user(&mut tx, user_id, role_code)
        .await
        .expect("role should assign");
    tx.commit().await.expect("tx should commit");

    user_id
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

async fn response_json(response: axum::response::Response) -> Value {
    serde_json::from_str(&response_body(response).await).expect("body should be valid json")
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

fn test_settings() -> Settings {
    Settings {
        http_addr: "127.0.0.1:33033"
            .parse()
            .expect("test socket address should parse"),
        database_url: "sqlite::memory:".to_string(),
        data_dir: "data".to_string(),
        session_secret: "test-session-secret".to_string(),
        session_ttl: "2h".to_string(),
        refresh_session_ttl: "30d".to_string(),
        cache_session_ttl: "5m".to_string(),
        log_level: "off".to_string(),
        env: "test".to_string(),
        security_master_key: "test-master-key-that-is-long-enough".to_string(),
        device_sessions: Default::default(),
        experimental_legacy_preview_enabled: false,
    }
}

fn with_csrf_cookie(session_cookie: &str) -> String {
    format!("{session_cookie}; yuance_csrf={CSRF_TOKEN}")
}

fn json_path<'a>(value: &'a Value, path: &[&str]) -> &'a Value {
    path.iter().fold(value, |current, key| {
        if let Ok(index) = key.parse::<usize>() {
            current.get(index).expect("json index should exist")
        } else {
            current.get(*key).expect("json key should exist")
        }
    })
}

fn json_string(value: &Value, path: &[&str]) -> String {
    json_path(value, path)
        .as_str()
        .expect("json string should exist")
        .to_string()
}

fn json_i64(value: &Value, path: &[&str]) -> i64 {
    json_path(value, path)
        .as_i64()
        .expect("json number should exist")
}
