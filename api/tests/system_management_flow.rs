use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;
use yuance_api::{
    domains::{auth, bootstrap, projects, rbac, users},
    platform::{config::Settings, db},
    web::router::{AppState, build_router},
};

const CSRF_TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

#[tokio::test]
async fn legacy_file_objects_receive_conservative_upload_expiry_backfill() {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("migration fixture database should connect");
    sqlx::query("CREATE TABLE file_objects (id INTEGER PRIMARY KEY, object_key TEXT NOT NULL)")
        .execute(&pool)
        .await
        .expect("legacy file object table should create");
    sqlx::query("INSERT INTO file_objects (id, object_key) VALUES (1, 'legacy/object')")
        .execute(&pool)
        .await
        .expect("legacy file object should insert");

    sqlx::raw_sql(include_str!(
        "../migrations/202610100002_track_file_upload_url_expiration.sql"
    ))
    .execute(&pool)
    .await
    .expect("upload expiry migration should run");

    let expiry = sqlx::query_scalar::<_, String>(
        "SELECT upload_url_expires_at FROM file_objects WHERE id = 1",
    )
    .fetch_one(&pool)
    .await
    .expect("backfilled expiry should load");
    let expiry = chrono::NaiveDateTime::parse_from_str(&expiry, "%Y-%m-%d %H:%M:%S")
        .expect("backfilled expiry should parse");
    let now = chrono::Utc::now().naive_utc();
    assert!(expiry >= now + chrono::Duration::minutes(59));
    assert!(expiry <= now + chrono::Duration::minutes(61));
}

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
    assert_eq!(links.len(), 6);
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
    assert!(document["paths"]["/api/system/openapi.json"].is_object());
    assert!(
        document["paths"]
            .as_object()
            .expect("paths should be an object")
            .keys()
            .all(|path| !path.starts_with("/api/v1/system/releases")),
        "system OpenAPI should not document retired release endpoints"
    );

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
        file_master_key: "test-file-master-key-that-is-long-enough".to_string(),
        experimental_legacy_preview_enabled: false,
    }
}

fn with_csrf_cookie(session_cookie: &str) -> String {
    format!("{session_cookie}; yuance_csrf={CSRF_TOKEN}")
}
