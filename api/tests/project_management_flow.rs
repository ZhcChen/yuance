use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use base64::Engine as _;
use http_body_util::BodyExt;
use std::str;
use tower::ServiceExt;
use yuance_api::{
    domains::{
        auth, bootstrap, files, notifications, project_resources, projects, rbac, storage, users,
    },
    platform::{config::Settings, db, realtime},
    web::router::{AppState, build_router},
};

const CSRF_TOKEN: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

#[tokio::test]
async fn rich_text_comments_are_sanitized_and_rendered_safely() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items/YCE-TASK-2/comments")
                .header(header::COOKIE, admin.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"body":"<p>修复 <strong>完成</strong><script>alert(1)</script><a href=\"javascript:alert(1)\">坏链接</a></p>","body_format":"html"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let create_status = create_response.status();
    let create_body = response_body(create_response).await;
    assert_eq!(create_status, StatusCode::CREATED, "{create_body}");
    assert!(create_body.contains(r#""body_format":"html""#));
    assert!(!create_body.contains("<script>"));
    assert!(!create_body.contains("javascript:"));

    let detail_response = app
        .oneshot(
            Request::builder()
                .uri("/web/work-items/YCE-TASK-2")
                .header(header::COOKIE, admin.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(detail_response.status(), StatusCode::OK);
    let detail_body = response_body(detail_response).await;
    assert!(detail_body.contains("<strong>完成</strong>"));
    assert!(!detail_body.contains("alert(1)"));
    assert!(!detail_body.contains("javascript:"));
}

#[tokio::test]
async fn api_token_work_item_changes_follow_requested_statuses() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let raw_token = create_test_api_token(
        app.clone(),
        &admin.cookie,
        r#"{"name":"Codex CLI 助手","scopes":["project:read","work_item:read","work_item:write","comment:write","notification:read"],"project_scope":"YCE"}"#,
    )
    .await;
    let delegate = create_regular_user(&pool, "ai_review_delegate", "AI 验收协作者").await;
    projects::add_project_member(&pool, admin.user_id, "YCE", "ai_review_delegate", "member")
        .await
        .expect("delegate should join project");
    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items")
                .header(header::AUTHORIZATION, format!("Bearer {raw_token}"))
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    r#"{"project_key":"YCE","item_type":"bug","title":"AI 新建缺陷","description":"由 AI 助手创建","priority":"P2","assignee_username":"ai_review_delegate"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let create_status = create_response.status();
    let create_body = response_body(create_response).await;
    assert_eq!(create_status, StatusCode::CREATED, "{create_body}");
    assert!(create_body.contains("AI 新建缺陷"));
    let delegate_notifications = notifications::list_for_user(&pool, delegate.user_id, true, 10)
        .await
        .expect("delegate notifications should load");
    assert!(
        delegate_notifications
            .iter()
            .any(|notification| notification.actor_display_name == "Codex CLI 助手（系统管理员）"),
        "{delegate_notifications:?}"
    );
    let yce_project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let activities = projects::list_project_activities(&pool, yce_project.id, 10)
        .await
        .expect("project activities should load");
    assert!(
        activities
            .iter()
            .any(|activity| activity.summary.contains("创建工作项")
                && activity.actor_display_name == "Codex CLI 助手（系统管理员）"),
        "{activities:?}"
    );
    projects::handoff_work_item(
        &pool,
        admin.user_id,
        "YCE-REQ-1",
        projects::HandoffWorkItemInput {
            status: "in_progress".to_string(),
            assignee_username: "ai_review_delegate".to_string(),
            body: "先交给协作者处理".to_string(),
            source_comment_id: None,
            actor_display_name_snapshot: String::new(),
        },
    )
    .await
    .expect("delegate handoff should succeed");
    let update_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/work-items/YCE-REQ-1")
                .header(header::AUTHORIZATION, format!("Bearer {raw_token}"))
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(r#"{"status":"resolved"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let update_status = update_response.status();
    let update_body = response_body(update_response).await;
    assert_eq!(update_status, StatusCode::OK, "{update_body}");
    let updated_by_patch: serde_json::Value =
        serde_json::from_str(&update_body).expect("update response should be json");
    assert_eq!(updated_by_patch["data"]["status"], "resolved");
    assert_eq!(
        updated_by_patch["data"]["assignee_username"],
        "ai_review_delegate"
    );

    let handoff_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items/YCE-TASK-2/handoff")
                .header(header::AUTHORIZATION, format!("Bearer {raw_token}"))
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    r#"{"status":"in_progress","assignee_username":"ai_review_delegate","body":"请协作者继续处理。"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let handoff_status = handoff_response.status();
    let handoff_body = response_body(handoff_response).await;
    assert_eq!(handoff_status, StatusCode::OK, "{handoff_body}");
    let updated: serde_json::Value =
        serde_json::from_str(&handoff_body).expect("handoff response should be json");
    assert_eq!(updated["data"]["status"], "in_progress");
    assert_eq!(updated["data"]["assignee_username"], "ai_review_delegate");

    let comments_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-items/YCE-TASK-2/comments")
                .header(header::AUTHORIZATION, format!("Bearer {raw_token}"))
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(comments_response.status(), StatusCode::OK);
    let comments_body = response_body(comments_response).await;
    assert!(comments_body.contains("Codex CLI 助手（系统管理员）"));
    assert!(comments_body.contains("请协作者继续处理"));

    let delegate_notifications = notifications::list_for_user(&pool, delegate.user_id, true, 20)
        .await
        .expect("delegate notifications should load");
    assert!(
        delegate_notifications.iter().any(|notification| {
            notification.actor_display_name == "Codex CLI 助手（系统管理员）"
                && notification.work_item_key == "YCE-TASK-2"
        }),
        "{delegate_notifications:?}"
    );

    let reopen_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items/YCE-TASK-2/status")
                .header(header::COOKIE, admin.cookie.clone())
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(format!("_csrf={CSRF_TOKEN}&status=in_progress")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(reopen_response.status(), StatusCode::SEE_OTHER);
    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("item query should succeed")
        .expect("item should exist");
    assert_eq!(item.status, "in_progress");
}

#[tokio::test]
async fn project_resource_password_can_be_set_kept_and_cleared_after_creation() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects/YCE/resources")
                .header(header::COOKIE, admin.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"title":"联调资料","category":"other","body":"<p>初始正文</p>","body_format":"html"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let create_status = create_response.status();
    let create_body = response_body(create_response).await;
    assert_eq!(create_status, StatusCode::CREATED, "{create_body}");
    let created: serde_json::Value =
        serde_json::from_str(&create_body).expect("create response should be json");
    let resource_id = created["data"]["id"]
        .as_i64()
        .expect("resource id should exist");

    let set_password_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/v1/projects/YCE/resources/{resource_id}"))
                .header(header::COOKIE, admin.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"body":"<p>已加密正文</p>","body_format":"html","access_password_action":"set","access_password":"safe-pass"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let set_password_status = set_password_response.status();
    let set_password_body = response_body(set_password_response).await;
    assert_eq!(set_password_status, StatusCode::OK, "{set_password_body}");
    assert!(set_password_body.contains("受保护资料，验证访问密码后查看正文"));

    let stored_after_set = project_resources::get_resource(&pool, resource_id)
        .await
        .expect("resource should load")
        .expect("resource should exist");
    assert!(stored_after_set.is_protected);
    assert!(
        project_resources::verify_resource_password(&pool, resource_id, "safe-pass")
            .await
            .expect("password should verify")
    );

    let keep_password_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/v1/projects/YCE/resources/{resource_id}"))
                .header(header::COOKIE, admin.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"body":"<p>保持加密正文</p>","body_format":"html","access_password_action":"keep"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let keep_password_status = keep_password_response.status();
    let keep_password_body = response_body(keep_password_response).await;
    assert_eq!(keep_password_status, StatusCode::OK, "{keep_password_body}");
    assert!(keep_password_body.contains("受保护资料，验证访问密码后查看正文"));
    assert!(
        project_resources::verify_resource_password(&pool, resource_id, "safe-pass")
            .await
            .expect("kept password should still verify")
    );

    let clear_password_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/v1/projects/YCE/resources/{resource_id}"))
                .header(header::COOKIE, admin.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"body":"<p>已取消加密正文</p>","body_format":"html","access_password_action":"clear"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let clear_password_status = clear_password_response.status();
    let clear_password_body = response_body(clear_password_response).await;
    assert_eq!(
        clear_password_status,
        StatusCode::OK,
        "{clear_password_body}"
    );
    assert!(clear_password_body.contains("已取消加密正文"));

    let stored_after_clear = project_resources::get_resource(&pool, resource_id)
        .await
        .expect("resource should load")
        .expect("resource should exist");
    assert!(!stored_after_clear.is_protected);

    let detail_response = app
        .oneshot(
            Request::builder()
                .uri(format!("/api/v1/projects/YCE/resources/{resource_id}"))
                .header(header::COOKIE, admin.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let detail_status = detail_response.status();
    let detail_body = response_body(detail_response).await;
    assert_eq!(detail_status, StatusCode::OK, "{detail_body}");
    assert!(detail_body.contains("已取消加密正文"));
}

#[tokio::test]
async fn api_project_resources_can_filter_by_tag() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    project_resources::create_resource(
        &pool,
        admin.user_id,
        project_resources::CreateProjectResourceInput {
            project_id: project.id,
            title: "支付联调资料".to_string(),
            category: "integration".to_string(),
            body: "<p>联调说明</p>".to_string(),
            body_format: project_resources::RESOURCE_BODY_FORMAT_HTML.to_string(),
            access_password: String::new(),
            tags: vec!["联调".to_string(), "支付".to_string()],
            related_work_item_key: "YCE-TASK-2".to_string(),
            related_cycle_id: None,
            actor_display_name_snapshot: "管理员".to_string(),
        },
    )
    .await
    .expect("first resource should create");
    project_resources::create_resource(
        &pool,
        admin.user_id,
        project_resources::CreateProjectResourceInput {
            project_id: project.id,
            title: "会议纪要资料".to_string(),
            category: "meeting".to_string(),
            body: "<p>会议记录</p>".to_string(),
            body_format: project_resources::RESOURCE_BODY_FORMAT_HTML.to_string(),
            access_password: String::new(),
            tags: vec!["会议".to_string()],
            related_work_item_key: String::new(),
            related_cycle_id: None,
            actor_display_name_snapshot: "管理员".to_string(),
        },
    )
    .await
    .expect("second resource should create");

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/projects/YCE/resources?tag=%E8%81%94%E8%B0%83")
                .header(header::COOKIE, admin.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let status = response.status();
    let body = response_body(response).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let payload: serde_json::Value =
        serde_json::from_str(&body).expect("response should be valid json");
    let items = payload["data"].as_array().expect("data should be an array");
    assert_eq!(items.len(), 1, "{body}");
    assert_eq!(items[0]["title"], "支付联调资料");
    let tags = items[0]["tags"]
        .as_array()
        .expect("tags should be an array");
    assert!(tags.iter().any(|tag| tag == "支付"));
    assert!(tags.iter().any(|tag| tag == "联调"));
    assert_eq!(items[0]["related_work_item"]["key"], "YCE-TASK-2");
}

#[tokio::test]
async fn api_project_resources_reject_cross_project_relations() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let ops_item = projects::create_work_item(
        &pool,
        admin.user_id,
        projects::CreateWorkItemInput {
            project_key: "OPS".to_string(),
            item_type: "task".to_string(),
            title: "OPS 资料关联任务".to_string(),
            description: String::new(),
            priority: "P2".to_string(),
            assignee_username: String::new(),
            due_date: String::new(),
            parent_item_key: String::new(),
            actor_display_name_snapshot: "管理员".to_string(),
        },
    )
    .await
    .expect("ops work item should create");
    let ops_cycle = projects::create_project_cycle(
        &pool,
        admin.user_id,
        "OPS",
        projects::CreateProjectCycleInput {
            name: "OPS 外部周期".to_string(),
            goal: String::new(),
            description: String::new(),
            owner_username: String::new(),
            start_date: "2026-07-01".to_string(),
            end_date: "2026-07-31".to_string(),
        },
    )
    .await
    .expect("ops cycle should create");

    let cross_item_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects/YCE/resources")
                .header(header::COOKIE, admin.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(format!(
                    r#"{{"title":"错误关联工作项","category":"integration","body":"<p>cross item</p>","body_format":"html","related_work_item_key":"{}"}}"#,
                    ops_item.item_key
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let cross_item_status = cross_item_response.status();
    let cross_item_body = response_body(cross_item_response).await;
    assert_eq!(
        cross_item_status,
        StatusCode::BAD_REQUEST,
        "{cross_item_body}"
    );
    assert!(cross_item_body.contains("关联工作项不存在，或不属于当前项目"));

    let cross_cycle_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects/YCE/resources")
                .header(header::COOKIE, admin.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(format!(
                    r#"{{"title":"错误关联周期","category":"integration","body":"<p>cross cycle</p>","body_format":"html","related_cycle_id":{}}}"#,
                    ops_cycle.id
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let cross_cycle_status = cross_cycle_response.status();
    let cross_cycle_body = response_body(cross_cycle_response).await;
    assert_eq!(
        cross_cycle_status,
        StatusCode::BAD_REQUEST,
        "{cross_cycle_body}"
    );
    assert!(cross_cycle_body.contains("关联周期不存在，或不属于当前项目"));
}

#[tokio::test]
async fn api_v1_pat_resource_write_scope_required_for_resource_mutations() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let read_token = create_test_api_token(
        app.clone(),
        &admin.cookie,
        r#"{"name":"资料只读","scopes":["project:read","resource:read"],"project_scope":"YCE"}"#,
    )
    .await;
    let write_token = create_test_api_token(
        app.clone(),
        &admin.cookie,
        r#"{"name":"资料写入","scopes":["project:read","resource:read","resource:write"],"project_scope":"YCE"}"#,
    )
    .await;

    let read_create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects/YCE/resources")
                .header(header::AUTHORIZATION, format!("Bearer {read_token}"))
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    r#"{"title":"只读越权资料","category":"other","body":"<p>no</p>","body_format":"html"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(read_create_response.status(), StatusCode::FORBIDDEN);
    let read_create_body = response_body(read_create_response).await;
    assert!(read_create_body.contains("resource:write"));

    let write_create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects/YCE/resources")
                .header(header::AUTHORIZATION, format!("Bearer {write_token}"))
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    r#"{"title":"写入资料","category":"other","body":"<p>ok</p>","body_format":"html"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let write_create_status = write_create_response.status();
    let write_create_body = response_body(write_create_response).await;
    assert_eq!(
        write_create_status,
        StatusCode::CREATED,
        "{write_create_body}"
    );
    let created: serde_json::Value =
        serde_json::from_str(&write_create_body).expect("create response should be json");
    let resource_id = created["data"]["id"]
        .as_i64()
        .expect("resource id should exist");

    let read_patch_response = app
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/v1/projects/YCE/resources/{resource_id}"))
                .header(header::AUTHORIZATION, format!("Bearer {read_token}"))
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(r#"{"title":"只读不能编辑"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(read_patch_response.status(), StatusCode::FORBIDDEN);
    let read_patch_body = response_body(read_patch_response).await;
    assert!(read_patch_body.contains("resource:write"));
}

#[tokio::test]
async fn api_v1_work_item_primary_post_sanitizes_html_and_updates_atomic_detail() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let ordinary_html_comment = projects::add_work_item_comment_reply_with_format(
        &pool,
        initialized.user_id,
        "YCE-TASK-2",
        "<p>更早的普通 HTML 讨论</p>",
        "html",
        None,
    )
    .await
    .expect("ordinary html comment should create");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let update = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/work-items/YCE-TASK-2/primary-post")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"body":"<h2>共享主帖</h2><p>保留 <strong>正文</strong></p><script>alert(1)</script><a href=\"javascript:alert(1)\">坏链接</a>","body_format":"html"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(update.status(), StatusCode::OK);
    let updated: serde_json::Value = serde_json::from_str(&response_body(update).await)
        .expect("primary post response should be json");
    assert_eq!(updated["data"]["body_format"], "html");
    let sanitized = updated["data"]["body"]
        .as_str()
        .expect("primary post body should be a string");
    assert!(sanitized.contains("<h2>共享主帖</h2>"));
    assert!(!sanitized.contains("<script"));
    assert!(!sanitized.contains("javascript:"));

    let second_update = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/work-items/YCE-TASK-2/primary-post")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"body":"<h2>共享主帖</h2><p>第二次更新</p>","body_format":"html"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let second_status = second_update.status();
    let second_body = response_body(second_update).await;
    assert_eq!(second_status, StatusCode::OK, "{second_body}");
    let second_updated: serde_json::Value =
        serde_json::from_str(&second_body).expect("second primary post response should be json");
    assert_eq!(second_updated["data"]["id"], updated["data"]["id"]);
    assert_ne!(second_updated["data"]["id"], ordinary_html_comment.id);
    let persisted = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    assert_eq!(
        persisted.primary_post_comment_id,
        second_updated["data"]["id"].as_i64()
    );
    assert!(persisted.description.contains("第二次更新"));
    let foreign_comment = projects::add_work_item_comment_reply_with_format(
        &pool,
        initialized.user_id,
        "YCE-TASK-1",
        "<p>其他工作项正文</p>",
        "html",
        None,
    )
    .await
    .expect("foreign comment should create");
    assert!(
        projects::bind_work_item_primary_post(&pool, "YCE-TASK-2", foreign_comment.id, "错误摘要",)
            .await
            .is_err()
    );
    let still_bound = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should reload")
        .expect("work item should exist");
    assert_eq!(
        still_bound.primary_post_comment_id,
        second_updated["data"]["id"].as_i64()
    );
    sqlx::query(
        "UPDATE work_items SET description = '见首条图文说明' WHERE item_key = 'YCE-TASK-2'",
    )
    .execute(&pool)
    .await
    .expect("legacy placeholder should apply");

    let detail = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-item-detail-view/YCE-TASK-2")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(detail.status(), StatusCode::OK);
    let detail: serde_json::Value =
        serde_json::from_str(&response_body(detail).await).expect("detail response should be json");
    assert_eq!(detail["data"]["primary_post"]["id"], updated["data"]["id"]);
    assert_eq!(
        detail["data"]["primary_post"]["body"],
        second_updated["data"]["body"]
    );
    assert_eq!(detail["data"]["item"]["description"], "见首条图文说明");
}

#[tokio::test]
async fn api_v1_work_item_primary_post_requires_html_and_the_reporter() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let member = create_regular_user(&pool, "primary_post_peer", "主帖协作者").await;
    projects::add_project_member(
        &pool,
        initialized.user_id,
        "YCE",
        "primary_post_peer",
        "member",
    )
    .await
    .expect("member should join project");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let invalid_format = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/work-items/YCE-TASK-2/primary-post")
                .header(header::COOKIE, initialized.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"body":"纯文本","body_format":"plain"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(invalid_format.status(), StatusCode::BAD_REQUEST);

    let non_reporter = app
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/work-items/YCE-TASK-2/primary-post")
                .header(header::COOKIE, member.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"body":"<p>不允许修改</p>","body_format":"html"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(non_reporter.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn api_v1_concurrent_primary_post_creation_reuses_one_comment() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let item_before = projects::get_work_item_detail(&pool, "YCE-TASK-1")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    let comment_count_before = projects::list_work_item_comments(&pool, item_before.id)
        .await
        .expect("comments should load")
        .len();
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let request = |body: &'static str| {
        app.clone().oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/work-items/YCE-TASK-1/primary-post")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(body))
                .expect("request should build"),
        )
    };

    let (first, second) = tokio::join!(
        request(r#"{"body":"<p>并发主帖 A</p>","body_format":"html"}"#),
        request(r#"{"body":"<p>并发主帖 B</p>","body_format":"html"}"#),
    );
    let first = first.expect("first request should respond");
    let second = second.expect("second request should respond");
    let first_status = first.status();
    let second_status = second.status();
    let first_body = response_body(first).await;
    let second_body = response_body(second).await;
    assert_eq!(first_status, StatusCode::OK, "{first_body}");
    assert_eq!(second_status, StatusCode::OK, "{second_body}");
    let first: serde_json::Value =
        serde_json::from_str(&first_body).expect("first response should be json");
    let second: serde_json::Value =
        serde_json::from_str(&second_body).expect("second response should be json");
    assert_eq!(first["data"]["id"], second["data"]["id"]);
    let item = projects::get_work_item_detail(&pool, "YCE-TASK-1")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    assert_eq!(item.primary_post_comment_id, first["data"]["id"].as_i64());
    let comments = projects::list_work_item_comments(&pool, item.id)
        .await
        .expect("comments should load");
    assert_eq!(comments.len(), comment_count_before + 1);
    assert_eq!(
        comments
            .iter()
            .filter(|comment| comment.id == item.primary_post_comment_id.unwrap())
            .count(),
        1
    );
}

#[tokio::test]
async fn rich_text_comments_reject_uncontrolled_media_sources() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items/YCE-TASK-2/comments")
                .header(header::COOKIE, admin.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"body":"<p>外部截图</p><img src=\"https://tracker.example.invalid/pixel.png\" alt=\"pixel\">","body_format":"html"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(create_response.status(), StatusCode::BAD_REQUEST);
    let create_body = response_body(create_response).await;
    assert!(create_body.contains("正文媒体必须使用已上传的评论附件"));

    let detail_response = app
        .oneshot(
            Request::builder()
                .uri("/web/work-items/YCE-TASK-2")
                .header(header::COOKIE, admin.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(detail_response.status(), StatusCode::OK);
    let detail_body = response_body(detail_response).await;
    assert!(!detail_body.contains("tracker.example.invalid"));
}

#[tokio::test]
async fn rich_text_comments_preserve_controlled_file_attachment_cards() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    seed_memory_storage_config(&pool, admin.user_id).await;
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");

    let draft =
        projects::create_work_item_comment_draft(&pool, admin.user_id, "YCE-TASK-2", None, "")
            .await
            .expect("draft should be created");
    let attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "comment".to_string(),
            target_id: draft.id,
            project_id: Some(project.id),
            folder_id: None,
            original_filename: "rich-doc.txt".to_string(),
            content_type: "text/plain".to_string(),
            byte_size: 42,
            created_by_user_id: admin.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记评论附件 rich-doc.txt".to_string()),
        },
    )
    .await
    .expect("attachment should be created");
    files::mark_attachment_uploaded(&pool, attachment.id, "comment", draft.id)
        .await
        .expect("attachment should be marked uploaded");

    let file_url = format!(
        "/web/work-items/YCE-TASK-2/comments/{}/attachments/{}/download",
        draft.id, attachment.id
    );
    let body = format!(
        r#"<p>补充设计说明</p><a href="{file_url}" title="rich-doc.txt" data-yuance-attachment-id="{}" data-yuance-attachment-kind="file" data-yuance-align="center">rich-doc.txt</a>"#,
        attachment.id
    );
    let published = projects::publish_work_item_comment_draft(
        &pool,
        admin.user_id,
        "YCE-TASK-2",
        draft.id,
        &body,
        "html",
        "",
    )
    .await
    .expect("draft should publish with controlled file link");
    assert_eq!(published.body_format, "html");
    assert!(
        published
            .body
            .contains(r#"data-yuance-attachment-kind="file""#)
    );
    assert!(published.body.contains(r#"data-yuance-align="center""#));

    let rejected_draft =
        projects::create_work_item_comment_draft(&pool, admin.user_id, "YCE-TASK-2", None, "")
            .await
            .expect("draft should be created");
    let rejected = projects::publish_work_item_comment_draft(
        &pool,
        admin.user_id,
        "YCE-TASK-2",
        rejected_draft.id,
        r#"<p>伪装附件</p><a href="https://tracker.example.invalid/file.txt" data-yuance-attachment-kind="file">bad.txt</a>"#,
        "html",
        "",
    )
    .await;
    assert!(rejected.is_err());
    let error = rejected.expect_err("external attachment link should be rejected");
    assert!(
        error
            .to_string()
            .contains("正文附件链接必须使用已上传的评论附件"),
        "{error:?}"
    );

    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let detail_response = app
        .oneshot(
            Request::builder()
                .uri("/web/work-items/YCE-TASK-2")
                .header(header::COOKIE, admin.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(detail_response.status(), StatusCode::OK);
    let detail_body = response_body(detail_response).await;
    assert!(detail_body.contains(r#"data-yuance-attachment-kind="file""#));
    assert!(detail_body.contains("rich-doc.txt"));
    assert!(!detail_body.contains(&format!(
        r#"<a class="btn btn-sm btn-secondary" href="{file_url}" target="_blank" rel="noopener">下载</a>"#
    )));
    assert!(!detail_body.contains("tracker.example.invalid"));
}

#[tokio::test]
async fn work_item_detail_renders_rich_description_media_safely() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    seed_memory_storage_config(&pool, admin.user_id).await;
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
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
            folder_id: None,
            original_filename: "detail-shot.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 128,
            created_by_user_id: admin.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记工作项详情图片 detail-shot.png".to_string()),
        },
    )
    .await
    .expect("attachment should be created");
    files::mark_attachment_uploaded(&pool, attachment.id, "work_item", item.id)
        .await
        .expect("attachment should be marked uploaded");
    let image_url = format!(
        "/web/work-items/{}/attachments/{}/download",
        item.item_key, attachment.id
    );
    let rich_description = format!(
        r#"<p>详情截图</p><figure data-yuance-attachment-id="{}" data-yuance-attachment-kind="image" data-yuance-align="center"><img src="{image_url}" alt="详情截图" loading="lazy"><script>alert(1)</script></figure><img src="https://tracker.example.invalid/out.png">"#,
        attachment.id
    );

    projects::update_work_item(
        &pool,
        admin.user_id,
        &item.item_key,
        projects::UpdateWorkItemInput {
            title: item.title,
            description: rich_description,
            status: item.status,
            priority: item.priority,
            assignee_username: item.assignee_username,
            due_date: item.due_date,
            parent_item_key: item.parent_item_key,
            actor_display_name_snapshot: String::new(),
        },
    )
    .await
    .expect("work item should update");

    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/work-items/YCE-TASK-2")
                .header(header::COOKIE, admin.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    let description_start = body
        .find(r#"<section class="work-item-description""#)
        .expect("description section should render");
    let description_end = body[description_start..]
        .find(r#"<section class="discussion-section""#)
        .map(|index| description_start + index)
        .expect("discussion section should follow description");
    let description_section = &body[description_start..description_end];
    assert!(
        description_section.contains(r#"class="work-item-description-body discussion-rich-body""#)
    );
    assert!(description_section.contains(r#"<p>详情截图</p>"#));
    assert!(description_section.contains(&format!(r#"src="{image_url}""#)));
    assert!(description_section.contains(r#"data-yuance-attachment-kind="image""#));
    assert!(!description_section.contains("alert(1)"));
    assert!(!description_section.contains("tracker.example.invalid"));
}

#[tokio::test]
async fn work_item_detail_uses_initial_rich_comment_when_description_is_plain_summary() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    seed_memory_storage_config(&pool, admin.user_id).await;
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let item = projects::create_work_item(
        &pool,
        admin.user_id,
        projects::CreateWorkItemInput {
            project_key: "YCE".to_string(),
            item_type: "bug".to_string(),
            title: "截图富文本主内容".to_string(),
            description: "main-shot.png".to_string(),
            priority: "P2".to_string(),
            assignee_username: String::new(),
            due_date: String::new(),
            parent_item_key: String::new(),
            actor_display_name_snapshot: String::new(),
        },
    )
    .await
    .expect("work item should create");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    let draft =
        projects::create_work_item_comment_draft(&pool, admin.user_id, &item.item_key, None, "")
            .await
            .expect("draft should be created");
    let attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "comment".to_string(),
            target_id: draft.id,
            project_id: Some(project.id),
            folder_id: None,
            original_filename: "main-shot.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 128,
            created_by_user_id: admin.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记评论附件 main-shot.png".to_string()),
        },
    )
    .await
    .expect("attachment should be created");
    files::mark_attachment_uploaded(&pool, attachment.id, "comment", draft.id)
        .await
        .expect("attachment should be marked uploaded");
    let image_url = format!(
        "/web/work-items/{}/comments/{}/attachments/{}/download",
        item.item_key, draft.id, attachment.id
    );
    let body = format!(
        r#"<figure data-yuance-attachment-id="{}" data-yuance-attachment-kind="image" data-yuance-align="left"><img src="{image_url}" alt="截图" loading="lazy"><figcaption>main-shot.png</figcaption></figure>"#,
        attachment.id
    );
    projects::publish_work_item_comment_draft(
        &pool,
        admin.user_id,
        &item.item_key,
        draft.id,
        &body,
        "html",
        "",
    )
    .await
    .expect("draft should publish");

    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let response = app
        .oneshot(
            Request::builder()
                .uri(format!("/web/work-items/{}", item.item_key))
                .header(header::COOKIE, admin.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    let description_start = body
        .find(r#"<section class="work-item-description""#)
        .expect("description section should render");
    let description_end = body[description_start..]
        .find(r#"<section class="discussion-section""#)
        .map(|index| description_start + index)
        .expect("discussion section should follow description");
    let description_section = &body[description_start..description_end];
    assert!(description_section.contains(&format!(r#"src="{image_url}""#)));
    assert!(description_section.contains(r#"data-yuance-attachment-kind="image""#));
    assert!(description_section.contains(r#"<figcaption>main-shot.png</figcaption>"#));
    assert!(!description_section.contains(r#"<p>main-shot.png</p>"#));
    let discussion_section = &body[description_end..];
    assert!(discussion_section.contains("还没有讨论"));
    assert!(!discussion_section.contains(&format!(r#"src="{image_url}""#)));
}

#[tokio::test]
async fn work_item_detail_hides_primary_post_comment_when_it_is_the_post_body() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    let item = projects::create_work_item(
        &pool,
        admin.user_id,
        projects::CreateWorkItemInput {
            project_key: "YCE".to_string(),
            item_type: "task".to_string(),
            title: "正文不应重复显示".to_string(),
            description: "第一段 正文".to_string(),
            priority: "P2".to_string(),
            assignee_username: String::new(),
            due_date: String::new(),
            parent_item_key: String::new(),
            actor_display_name_snapshot: String::new(),
        },
    )
    .await
    .expect("work item should create");
    projects::add_work_item_comment_reply_with_format(
        &pool,
        admin.user_id,
        &item.item_key,
        r#"<p>第一段 <strong>正文</strong></p>"#,
        "html",
        None,
    )
    .await
    .expect("primary post comment should create");

    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let response = app
        .oneshot(
            Request::builder()
                .uri(format!("/web/work-items/{}", item.item_key))
                .header(header::COOKIE, admin.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    let description_start = body
        .find(r#"<section class="work-item-description""#)
        .expect("description section should render");
    let description_end = body[description_start..]
        .find(r#"<section class="discussion-section""#)
        .map(|index| description_start + index)
        .expect("discussion section should follow description");
    let description_section = &body[description_start..description_end];
    let discussion_section = &body[description_end..];

    assert!(description_section.contains(r#"<strong>正文</strong>"#));
    assert!(discussion_section.contains("还没有讨论"));
    assert!(!discussion_section.contains(r#"<strong>正文</strong>"#));
}

#[tokio::test]
async fn work_item_detail_promotes_primary_post_with_inline_file_attachments() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    seed_memory_storage_config(&pool, admin.user_id).await;
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let item = projects::create_work_item(
        &pool,
        admin.user_id,
        projects::CreateWorkItemInput {
            project_key: "YCE".to_string(),
            item_type: "task".to_string(),
            title: "主内容内联文件不应阻止正文提升".to_string(),
            description: "主内容摘要".to_string(),
            priority: "P2".to_string(),
            assignee_username: String::new(),
            due_date: String::new(),
            parent_item_key: String::new(),
            actor_display_name_snapshot: String::new(),
        },
    )
    .await
    .expect("work item should create");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    let draft =
        projects::create_work_item_comment_draft(&pool, admin.user_id, &item.item_key, None, "")
            .await
            .expect("draft should be created");
    let image_attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "comment".to_string(),
            target_id: draft.id,
            project_id: Some(project.id),
            folder_id: None,
            original_filename: "detail-image.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 128,
            created_by_user_id: admin.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记评论图片 detail-image.png".to_string()),
        },
    )
    .await
    .expect("image attachment should be created");
    files::mark_attachment_uploaded(&pool, image_attachment.id, "comment", draft.id)
        .await
        .expect("image attachment should upload");
    let file_attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            target_type: "comment".to_string(),
            target_id: draft.id,
            project_id: Some(project.id),
            folder_id: None,
            original_filename: "detail-note.txt".to_string(),
            content_type: "text/plain".to_string(),
            byte_size: 32,
            created_by_user_id: admin.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记评论文件 detail-note.txt".to_string()),
        },
    )
    .await
    .expect("file attachment should be created");
    files::mark_attachment_uploaded(&pool, file_attachment.id, "comment", draft.id)
        .await
        .expect("file attachment should upload");
    let image_url = format!(
        "/web/work-items/{}/comments/{}/attachments/{}/download",
        item.item_key, draft.id, image_attachment.id
    );
    let file_url = format!(
        "/web/work-items/{}/comments/{}/attachments/{}/download",
        item.item_key, draft.id, file_attachment.id
    );
    let body = format!(
        r#"<p>主内容摘要</p><figure data-yuance-attachment-id="{image_id}" data-yuance-attachment-kind="image" data-yuance-align="left"><img src="{image_url}" alt="正文图片" loading="lazy"></figure><a data-yuance-attachment-id="{file_id}" data-yuance-attachment-kind="file" data-yuance-align="left" href="{file_url}" title="detail-note.txt" data-yuance-file-kind="text" data-yuance-file-ext="TXT">detail-note.txt</a>"#,
        image_id = image_attachment.id,
        file_id = file_attachment.id,
    );
    projects::publish_work_item_comment_draft(
        &pool,
        admin.user_id,
        &item.item_key,
        draft.id,
        &body,
        "html",
        "",
    )
    .await
    .expect("draft should publish");

    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/web/work-items/{}", item.item_key))
                .header(header::COOKIE, admin.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    let description_start = body
        .find(r#"<section class="work-item-description""#)
        .expect("description section should render");
    let description_end = body[description_start..]
        .find(r#"<section class="discussion-section""#)
        .map(|index| description_start + index)
        .expect("discussion section should follow description");
    let description_section = &body[description_start..description_end];
    let discussion_section = &body[description_end..];

    assert!(description_section.contains(r#"<p>主内容摘要</p>"#));
    assert!(description_section.contains(&format!(r#"src="{image_url}""#)));
    assert!(description_section.contains(&format!(r#"href="{file_url}""#)));
    assert!(description_section.contains(r#"data-yuance-attachment-kind="file""#));
    assert!(discussion_section.contains("还没有讨论"));
    assert!(!discussion_section.contains(&format!(r#"src="{image_url}""#)));
    assert!(!discussion_section.contains(&format!(r#"href="{file_url}""#)));
    let promoted_post = projects::get_work_item_comment(&pool, item.id, draft.id)
        .await
        .expect("promoted primary post should load");
    projects::bind_work_item_primary_post(
        &pool,
        &item.item_key,
        draft.id,
        &projects::work_item_primary_post_summary(&promoted_post.body, &promoted_post.body_format),
    )
    .await
    .expect("promoted primary post should bind");
    let promoted_item = projects::get_work_item_detail(&pool, &item.item_key)
        .await
        .expect("promoted work item should load")
        .expect("promoted work item should exist");
    assert_eq!(promoted_item.primary_post_comment_id, Some(draft.id));

    let delete_response = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!(
                    "/api/v1/work-items/{}/comments/{}/attachments/{}",
                    item.item_key, draft.id, file_attachment.id
                ))
                .header(header::COOKIE, admin.cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .header("x-yuance-editor-context", "work-item-primary-post")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(delete_response.status(), StatusCode::OK);
    let updated_post = projects::get_work_item_comment(&pool, item.id, draft.id)
        .await
        .expect("primary post should remain");
    assert!(updated_post.body.contains(&format!(
        "data-yuance-attachment-id=\"{}\"",
        image_attachment.id
    )));
    assert!(!updated_post.body.contains(&format!(
        "data-yuance-attachment-id=\"{}\"",
        file_attachment.id
    )));
    assert_eq!(
        files::get_attachment(&pool, file_attachment.id)
            .await
            .expect("attachment should remain auditable")
            .status,
        "deleted"
    );
    let updated_item = projects::get_work_item_detail(&pool, &item.item_key)
        .await
        .expect("updated work item should load")
        .expect("updated work item should exist");
    assert_eq!(
        updated_item.description,
        projects::work_item_primary_post_summary(&updated_post.body, &updated_post.body_format)
    );
}

#[tokio::test]
async fn rich_text_draft_comments_are_hidden_until_published() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    seed_memory_storage_config(&pool, admin.user_id).await;
    let other = create_regular_user(&pool, "draft_peer", "草稿旁观者").await;
    projects::add_project_member(&pool, admin.user_id, "YCE", "draft_peer", "member")
        .await
        .expect("other user should join project");
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let draft_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items/YCE-TASK-2/comments/draft")
                .header(header::COOKIE, admin.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"body":"","body_format":"html"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(draft_response.status(), StatusCode::CREATED);
    let draft_body = response_body(draft_response).await;
    let draft_json: serde_json::Value =
        serde_json::from_str(&draft_body).expect("draft response should be json");
    let draft_id = draft_json["data"]["id"]
        .as_i64()
        .expect("draft id should be present");
    assert_eq!(draft_json["data"]["is_draft"].as_bool(), Some(true));

    let list_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-items/YCE-TASK-2/comments")
                .header(header::COOKIE, admin.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(list_response.status(), StatusCode::OK);
    let list_body = response_body(list_response).await;
    assert!(!list_body.contains(&format!(r#""id":{draft_id}"#)));

    let activity_count_before_attachment =
        projects::list_project_activities(&pool, project.id, 100)
            .await
            .expect("activities should load")
            .len();
    let draft_attachment_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{draft_id}/attachments"
                ))
                .header(header::COOKIE, admin.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"original_filename":"draft-only.png","content_type":"image/png","byte_size":68}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(draft_attachment_response.status(), StatusCode::CREATED);
    let activity_count_after_attachment = projects::list_project_activities(&pool, project.id, 100)
        .await
        .expect("activities should load")
        .len();
    assert_eq!(
        activity_count_after_attachment,
        activity_count_before_attachment
    );

    let forbidden_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{draft_id}/attachments"
                ))
                .header(header::COOKIE, other.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(forbidden_response.status(), StatusCode::FORBIDDEN);

    let publish_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{draft_id}/publish"
                ))
                .header(header::COOKIE, admin.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"body":"<p>草稿发布 <strong>完成</strong></p>","body_format":"html"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(publish_response.status(), StatusCode::OK);
    let publish_body = response_body(publish_response).await;
    assert!(publish_body.contains(r#""is_draft":false"#));
    let activity_count_after_publish = projects::list_project_activities(&pool, project.id, 100)
        .await
        .expect("activities should load")
        .len();
    assert_eq!(
        activity_count_after_publish,
        activity_count_after_attachment + 1
    );

    let published_list_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-items/YCE-TASK-2/comments")
                .header(header::COOKIE, admin.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(published_list_response.status(), StatusCode::OK);
    let published_list_body = response_body(published_list_response).await;
    assert!(published_list_body.contains(&format!(r#""id":{draft_id}"#)));
}

#[tokio::test]
async fn work_item_assignment_and_reply_notifications_open_and_mark_read() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    let receiver = create_regular_user(&pool, "notify_receiver", "通知接收人").await;
    projects::add_project_member(&pool, admin.user_id, "YCE", "notify_receiver", "member")
        .await
        .expect("receiver should join project");

    projects::handoff_work_item(
        &pool,
        admin.user_id,
        "YCE-TASK-2",
        projects::HandoffWorkItemInput {
            status: "in_progress".to_string(),
            assignee_username: "notify_receiver".to_string(),
            body: "请继续处理".to_string(),
            source_comment_id: None,
            actor_display_name_snapshot: String::new(),
        },
    )
    .await
    .expect("handoff should succeed");
    assert_eq!(
        notifications::unread_count(&pool, receiver.user_id)
            .await
            .expect("unread count should load"),
        1
    );

    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let feed_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/notifications?limit=5")
                .header(header::COOKIE, receiver.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(feed_response.status(), StatusCode::OK);
    let feed_body = response_body(feed_response).await;
    assert!(feed_body.contains("work_item_assigned"));
    assert!(feed_body.contains("\"unread_count\":1"));

    let receiver_web_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/tasks")
                .header(header::COOKIE, receiver.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(receiver_web_response.status(), StatusCode::OK);
    let receiver_web_body = response_body(receiver_web_response).await;
    assert!(receiver_web_body.contains(
        r#"class="notification-badge" data-notification-badge aria-label="未读消息 1">1</span>"#
    ));

    sqlx::query("UPDATE users SET display_name = '' WHERE id = ?1")
        .bind(admin.user_id)
        .execute(&pool)
        .await
        .expect("actor display name should clear");
    sqlx::query("UPDATE notifications SET title = ' ', body = '' WHERE recipient_user_id = ?1")
        .bind(receiver.user_id)
        .execute(&pool)
        .await
        .expect("notification title and body should clear");
    let fallback_feed_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/notifications?limit=5")
                .header(header::COOKIE, receiver.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(fallback_feed_response.status(), StatusCode::OK);
    let fallback_feed_body = response_body(fallback_feed_response).await;
    assert!(fallback_feed_body.contains(r#""actor":"系统""#));
    assert!(fallback_feed_body.contains(r#""title":"消息通知""#));
    assert!(fallback_feed_body.contains(r#""body":"查看详情""#));
    assert!(!fallback_feed_body.contains(r#""actor":"""#));
    assert!(!fallback_feed_body.contains(r#""title":" ""#));
    assert!(!fallback_feed_body.contains(r#""body":"""#));

    let assignment = notifications::list_for_user(&pool, receiver.user_id, true, 10)
        .await
        .expect("notifications should load")
        .remove(0);
    let forbidden_open_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/web/messages/{}/open", assignment.id))
                .header(header::COOKIE, admin.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(forbidden_open_response.status(), StatusCode::NOT_FOUND);
    let open_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/web/messages/{}/open", assignment.id))
                .header(header::COOKIE, receiver.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(open_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        open_response.headers().get(header::LOCATION).unwrap(),
        "/web/work-items/YCE-TASK-2"
    );
    assert_eq!(
        notifications::unread_count(&pool, receiver.user_id)
            .await
            .unwrap(),
        0
    );

    projects::handoff_work_item(
        &pool,
        admin.user_id,
        "YCE-TASK-2",
        projects::HandoffWorkItemInput {
            status: "open".to_string(),
            assignee_username: "notify_receiver".to_string(),
            body: "仅调整状态".to_string(),
            source_comment_id: None,
            actor_display_name_snapshot: String::new(),
        },
    )
    .await
    .expect("status-only handoff should succeed");
    assert_eq!(
        notifications::unread_count(&pool, receiver.user_id)
            .await
            .expect("unread count should load"),
        0
    );

    let parent_comment_id = projects::add_work_item_comment_reply(
        &pool,
        admin.user_id,
        "YCE-TASK-2",
        "请在这里回复处理结果",
        None,
    )
    .await
    .expect("parent comment should be created")
    .id;
    let reply = projects::add_work_item_comment_reply(
        &pool,
        receiver.user_id,
        "YCE-TASK-2",
        "收到，我来继续处理",
        Some(parent_comment_id),
    )
    .await
    .expect("reply should succeed");
    let reply_notice = notifications::list_for_user(&pool, admin.user_id, true, 10)
        .await
        .expect("admin notifications should load")
        .into_iter()
        .find(|item| item.kind == "comment_replied")
        .expect("reply notification should exist");
    assert_eq!(reply_notice.comment_id, Some(reply.id));

    projects::handoff_work_item(
        &pool,
        receiver.user_id,
        "YCE-TASK-2",
        projects::HandoffWorkItemInput {
            status: "in_progress".to_string(),
            assignee_username: "admin".to_string(),
            body: "回复后交回确认".to_string(),
            source_comment_id: Some(reply.id),
            actor_display_name_snapshot: String::new(),
        },
    )
    .await
    .expect("reply assignment should succeed");
    let reply_assignment_notice = notifications::list_for_user(&pool, admin.user_id, true, 10)
        .await
        .expect("admin notifications should load")
        .into_iter()
        .find(|item| item.kind == "work_item_assigned" && item.comment_id == Some(reply.id))
        .expect("reply assignment notification should exist");

    let reply_open_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/web/messages/{}/open", reply_notice.id))
                .header(header::COOKIE, admin.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(reply_open_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        reply_open_response.headers().get(header::LOCATION).unwrap(),
        format!("/web/work-items/YCE-TASK-2#comment-{}", reply.id).as_str()
    );

    let deleted_parent_comment_id = projects::add_work_item_comment_reply(
        &pool,
        admin.user_id,
        "YCE-TASK-2",
        "这条回复稍后会隐藏",
        None,
    )
    .await
    .expect("deleted parent comment should be created")
    .id;
    let deleted_reply = projects::add_work_item_comment_reply(
        &pool,
        receiver.user_id,
        "YCE-TASK-2",
        "隐藏后通知应回到工作项顶部",
        Some(deleted_parent_comment_id),
    )
    .await
    .expect("deleted reply should be created");
    let deleted_comment_notice = notifications::list_for_user(&pool, admin.user_id, true, 10)
        .await
        .expect("admin notifications should load")
        .into_iter()
        .find(|item| item.kind == "comment_replied" && item.comment_id == Some(deleted_reply.id))
        .expect("deleted reply notification should exist");
    sqlx::query(
        "UPDATE work_item_comments SET deleted_at = datetime('now'), deleted_by_user_id = ?1 WHERE id = ?2",
    )
    .bind(admin.user_id)
    .bind(deleted_reply.id)
    .execute(&pool)
    .await
    .expect("reply comment should be hidden");
    let deleted_comment_open_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/web/messages/{}/open", deleted_comment_notice.id))
                .header(header::COOKIE, admin.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(
        deleted_comment_open_response.status(),
        StatusCode::SEE_OTHER
    );
    assert_eq!(
        deleted_comment_open_response
            .headers()
            .get(header::LOCATION)
            .unwrap(),
        "/web/work-items/YCE-TASK-2"
    );
    let opened_deleted_notice = notifications::list_for_user(&pool, admin.user_id, false, 10)
        .await
        .expect("admin notifications should load")
        .into_iter()
        .find(|item| item.id == deleted_comment_notice.id)
        .expect("opened deleted reply notification should remain listed");
    assert_eq!(opened_deleted_notice.comment_id, None);
    assert!(!opened_deleted_notice.read_at.is_empty());

    let reply_assignment_open_response = app
        .oneshot(
            Request::builder()
                .uri(format!("/web/messages/{}/open", reply_assignment_notice.id))
                .header(header::COOKIE, admin.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(
        reply_assignment_open_response.status(),
        StatusCode::SEE_OTHER
    );
    assert_eq!(
        reply_assignment_open_response
            .headers()
            .get(header::LOCATION)
            .unwrap(),
        format!("/web/work-items/YCE-TASK-2#comment-{}", reply.id).as_str()
    );
}

#[tokio::test]
async fn api_v1_notification_target_and_read_endpoints_follow_semantic_contract() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    let receiver = create_regular_user(&pool, "notify_api_reader", "通知 API 读取人").await;
    projects::add_project_member(&pool, admin.user_id, "YCE", "notify_api_reader", "member")
        .await
        .expect("receiver should join project");

    projects::handoff_work_item(
        &pool,
        admin.user_id,
        "YCE-TASK-2",
        projects::HandoffWorkItemInput {
            status: "in_progress".to_string(),
            assignee_username: "notify_api_reader".to_string(),
            body: "请通过 API 查看通知语义目标".to_string(),
            source_comment_id: None,
            actor_display_name_snapshot: String::new(),
        },
    )
    .await
    .expect("handoff should create notification");

    let notice = notifications::list_for_user(&pool, receiver.user_id, true, 10)
        .await
        .expect("notifications should load")
        .remove(0);
    let work_item_id =
        sqlx::query_scalar::<_, i64>("SELECT id FROM work_items WHERE item_key = 'YCE-TASK-2'")
            .fetch_one(&pool)
            .await
            .expect("work item should exist");

    sqlx::query(
        r#"
        INSERT INTO notifications (
            recipient_user_id,
            actor_user_id,
            actor_display_name_snapshot,
            kind,
            work_item_id,
            comment_id,
            title,
            body
        )
        VALUES (?1, ?2, '系统管理员', 'comment_mentioned', ?3, NULL, '第二条消息', '用于 read-all 校验')
        "#,
    )
    .bind(receiver.user_id)
    .bind(admin.user_id)
    .bind(work_item_id)
    .execute(&pool)
    .await
    .expect("second notification should insert");

    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let target_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/v1/notifications/{}/target", notice.id))
                .header(header::COOKIE, receiver.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(target_response.status(), StatusCode::OK);
    assert_eq!(
        target_response
            .headers()
            .get(header::CACHE_CONTROL)
            .unwrap(),
        "private, no-store"
    );
    let target_body = response_body(target_response).await;
    let target_payload: serde_json::Value =
        serde_json::from_str(&target_body).expect("target response should be json");
    let target_data = target_payload
        .get("data")
        .expect("target response should contain data");
    assert_eq!(
        target_data
            .get("notification_id")
            .and_then(|value| value.as_i64()),
        Some(notice.id)
    );
    assert_eq!(
        target_data.get("read").and_then(|value| value.as_bool()),
        Some(false)
    );
    let target = target_data
        .get("target")
        .expect("target payload should contain target object");
    assert_eq!(
        target.get("work_item_key").and_then(|value| value.as_str()),
        Some("YCE-TASK-2")
    );
    assert_eq!(
        target.get("project_key").and_then(|value| value.as_str()),
        Some("YCE")
    );
    assert_eq!(
        target.get("kind").and_then(|value| value.as_str()),
        Some("work_item")
    );

    let unauthorized_target_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/v1/notifications/{}/target", notice.id))
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(
        unauthorized_target_response.status(),
        StatusCode::UNAUTHORIZED
    );

    let missing_csrf_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v1/notifications/{}/read", notice.id))
                .header(header::COOKIE, receiver.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(missing_csrf_response.status(), StatusCode::FORBIDDEN);

    let read_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v1/notifications/{}/read", notice.id))
                .header(header::COOKIE, with_csrf_cookie(&receiver.cookie))
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(read_response.status(), StatusCode::OK);
    assert_eq!(
        read_response.headers().get(header::CACHE_CONTROL).unwrap(),
        "private, no-store"
    );
    let read_body = response_body(read_response).await;
    let read_payload: serde_json::Value =
        serde_json::from_str(&read_body).expect("read response should be json");
    let read_data = read_payload
        .get("data")
        .expect("read response should contain data");
    assert_eq!(
        read_data.get("read").and_then(|value| value.as_bool()),
        Some(true)
    );
    assert_eq!(
        read_data
            .get("target")
            .and_then(|value| value.get("work_item_key"))
            .and_then(|value| value.as_str()),
        Some("YCE-TASK-2")
    );
    assert_eq!(
        notifications::unread_count(&pool, receiver.user_id)
            .await
            .expect("unread count should load"),
        1
    );

    let read_all_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/notifications/read-all")
                .header(header::COOKIE, with_csrf_cookie(&receiver.cookie))
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(read_all_response.status(), StatusCode::OK);
    let read_all_body = response_body(read_all_response).await;
    let read_all_payload: serde_json::Value =
        serde_json::from_str(&read_all_body).expect("read-all response should be json");
    assert_eq!(
        read_all_payload
            .get("data")
            .and_then(|value| value.get("affected"))
            .and_then(|value| value.as_u64()),
        Some(1)
    );
    assert_eq!(
        notifications::unread_count(&pool, receiver.user_id)
            .await
            .expect("unread count should load"),
        0
    );
}

#[tokio::test]
async fn web_messages_page_paginates_notifications_with_shared_controls() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    let receiver = create_regular_user(&pool, "message_page_owner", "消息页负责人").await;
    projects::add_project_member(&pool, admin.user_id, "YCE", "message_page_owner", "member")
        .await
        .expect("receiver should join project");
    let work_item_id =
        sqlx::query_scalar::<_, i64>("SELECT id FROM work_items WHERE item_key = 'YCE-TASK-2'")
            .fetch_one(&pool)
            .await
            .expect("work item should exist");
    for index in 1..=12 {
        sqlx::query(
            r#"
            INSERT INTO notifications (
                recipient_user_id, actor_user_id, kind, work_item_id, title, body
            )
            VALUES (?1, ?2, 'work_item_assigned', ?3, ?4, ?5)
            "#,
        )
        .bind(receiver.user_id)
        .bind(admin.user_id)
        .bind(work_item_id)
        .bind(format!("分页消息 {index:02}"))
        .bind(format!("第 {index:02} 条消息"))
        .execute(&pool)
        .await
        .expect("notification should insert");
    }
    sqlx::query("UPDATE notifications SET title = ' ', body = '' WHERE title = '分页消息 12'")
        .execute(&pool)
        .await
        .expect("notification title and body should clear");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let first_page_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/messages?per_page=5")
                .header(header::COOKIE, receiver.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(first_page_response.status(), StatusCode::OK);
    let first_body = response_body(first_page_response).await;
    assert_eq!(first_body.matches("class=\"message-row").count(), 5);
    assert!(first_body.contains(r#"aria-haspopup="dialog""#));
    assert!(first_body.contains(r#"aria-controls="topbar-notification-panel""#));
    assert!(first_body.contains(r#"id="topbar-notification-panel""#));
    assert!(first_body.contains(r#"role="dialog" aria-label="最近消息""#));
    assert!(first_body.contains("data-notification-read-all"));
    assert!(first_body.contains("data-message-center"));
    assert!(first_body.contains(r#"aria-label="消息分页""#));
    assert!(first_body.contains("当前显示 1-5"));
    assert!(first_body.contains("共 12 条"));
    assert!(first_body.contains("<strong>消息通知</strong>"));
    assert!(first_body.contains("<span>查看详情</span>"));
    assert!(first_body.contains("data-pagination-size"));
    assert!(first_body.contains(r#"<option value="5" selected>当前 5</option>"#));
    assert!(first_body.contains("value=\"100\""));
    assert!(first_body.contains("aria-label=\"跳转页码\""));
    assert!(first_body.contains("page=2"));
    assert!(first_body.contains("per_page=5"));
    assert!(first_body.contains(r#"href="/web/messages?filter=unread&#38;per_page=5""#));
    assert!(first_body.contains(r#"href="/web/messages?filter=read&#38;per_page=5""#));

    let third_page_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/messages?per_page=5&page=3")
                .header(header::COOKIE, receiver.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(third_page_response.status(), StatusCode::OK);
    let third_body = response_body(third_page_response).await;
    assert_eq!(third_body.matches("class=\"message-row").count(), 2);
    assert!(third_body.contains("当前显示 11-12"));
    assert!(third_body.contains(r#"aria-current="page">3</a>"#));
    let all_read_all_form = html_fragment(
        &third_body,
        r#"<form method="post" action="/web/messages/read-all" data-message-read-all-form data-success-message="消息已全部标为已读。">"#,
        "</form>",
    );
    assert!(!all_read_all_form.contains(r#"name="unread""#));
    assert!(!all_read_all_form.contains(r#"name="filter""#));
    assert!(all_read_all_form.contains(r#"name="page" value="3""#));
    assert!(all_read_all_form.contains(r#"name="per_page" value="5""#));

    let unread_page_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/messages?unread=true&per_page=5&page=3")
                .header(header::COOKIE, receiver.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(unread_page_response.status(), StatusCode::OK);
    let unread_body = response_body(unread_page_response).await;
    assert!(unread_body.contains(r#"name="filter" value="unread""#));
    assert!(unread_body.contains(r#"href="/web/messages?filter=read&#38;per_page=5""#));
    assert!(unread_body.contains("当前显示 11-12"));
    let unread_read_all_form = html_fragment(
        &unread_body,
        r#"<form method="post" action="/web/messages/read-all" data-message-read-all-form data-success-message="消息已全部标为已读。">"#,
        "</form>",
    );
    assert!(unread_read_all_form.contains(r#"name="filter" value="unread""#));
    assert!(unread_read_all_form.contains(r#"name="page" value="3""#));
    assert!(unread_read_all_form.contains(r#"name="per_page" value="5""#));
    assert!(unread_body.contains("/web/messages?filter=unread&#38;page=2&#38;per_page=5"));

    let invalid_read_all_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/messages/read-all")
                .header(header::COOKIE, with_csrf_cookie(&receiver.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(format!(
                    "_csrf={CSRF_TOKEN}&unread=true&page=0&per_page=5"
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(invalid_read_all_response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        notifications::unread_count(&pool, receiver.user_id)
            .await
            .expect("unread count should load"),
        12
    );

    let read_all_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/messages/read-all")
                .header(header::COOKIE, with_csrf_cookie(&receiver.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(format!(
                    "_csrf={CSRF_TOKEN}&filter=unread&page=3&per_page=5"
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(read_all_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        read_all_response.headers().get(header::LOCATION).unwrap(),
        "/web/messages?filter=unread&page=3&per_page=5"
    );

    let read_page_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/messages?filter=read&per_page=5")
                .header(header::COOKIE, receiver.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(read_page_response.status(), StatusCode::OK);
    let read_body = response_body(read_page_response).await;
    assert!(read_body.contains(r#"class="content-tab active" data-content-tab aria-current="page" href="/web/messages?filter=read&#38;per_page=5""#));
    assert_eq!(read_body.matches("class=\"message-row").count(), 5);

    let all_tab_read_all_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/messages/read-all")
                .header(header::COOKIE, with_csrf_cookie(&receiver.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(format!("_csrf={CSRF_TOKEN}&page=3&per_page=5")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(all_tab_read_all_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        all_tab_read_all_response
            .headers()
            .get(header::LOCATION)
            .unwrap(),
        "/web/messages?page=3&per_page=5"
    );
}

#[tokio::test]
async fn web_messages_page_filters_pending_discussions_and_drops_read_items() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    let receiver = create_regular_user(&pool, "message_pending_owner", "待处理消息负责人").await;
    projects::add_project_member(
        &pool,
        admin.user_id,
        "YCE",
        "message_pending_owner",
        "member",
    )
    .await
    .expect("receiver should join project");
    let work_item_id =
        sqlx::query_scalar::<_, i64>("SELECT id FROM work_items WHERE item_key = 'YCE-TASK-2'")
            .fetch_one(&pool)
            .await
            .expect("work item should exist");

    insert_test_notification_with_kind(
        &pool,
        receiver.user_id,
        admin.user_id,
        work_item_id,
        "work_item_assigned",
        "指派消息",
        "这条指派不应进入待处理讨论",
    )
    .await;
    insert_test_notification_with_kind(
        &pool,
        receiver.user_id,
        admin.user_id,
        work_item_id,
        "comment_replied",
        "回复消息",
        "这条回复应进入待处理讨论",
    )
    .await;
    insert_test_notification_with_kind(
        &pool,
        receiver.user_id,
        admin.user_id,
        work_item_id,
        "comment_mentioned",
        "提及消息",
        "这条提及应进入待处理讨论",
    )
    .await;

    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let pending_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/messages?filter=pending")
                .header(header::COOKIE, receiver.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(pending_response.status(), StatusCode::OK);
    let pending_body = response_body(pending_response).await;
    assert!(pending_body.contains("待处理讨论"));
    assert!(pending_body.contains("回复消息"));
    assert!(pending_body.contains("提及消息"));
    assert!(!pending_body.contains("指派消息"));
    assert_eq!(pending_body.matches("class=\"message-row").count(), 2);
    assert!(pending_body.contains(r#"href="/web/messages?filter=unread""#));
    assert!(pending_body.contains(r#"href="/web/messages?filter=read""#));
    assert!(pending_body.contains(r#"name="filter" value="pending""#));

    let mention_notice = notifications::list_for_user(&pool, receiver.user_id, true, 10)
        .await
        .expect("notifications should load")
        .into_iter()
        .find(|item| item.title == "提及消息")
        .expect("mention notice should exist");
    let open_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/web/messages/{}/open", mention_notice.id))
                .header(header::COOKIE, receiver.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(open_response.status(), StatusCode::SEE_OTHER);

    let refreshed_pending_response = app
        .oneshot(
            Request::builder()
                .uri("/web/messages?filter=pending")
                .header(header::COOKIE, receiver.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(refreshed_pending_response.status(), StatusCode::OK);
    let refreshed_pending_body = response_body(refreshed_pending_response).await;
    assert!(refreshed_pending_body.contains("回复消息"));
    assert!(!refreshed_pending_body.contains("提及消息"));
    assert_eq!(
        refreshed_pending_body
            .matches("class=\"message-row")
            .count(),
        1
    );
}

#[tokio::test]
async fn work_item_comment_mentions_create_notifications_and_open_to_comment_anchor() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    let mentioned = create_regular_user(&pool, "mention_target", "提及成员").await;
    projects::add_project_member(&pool, admin.user_id, "YCE", "mention_target", "member")
        .await
        .expect("mentioned user should join project");

    let comment = projects::add_work_item_comment_reply_with_format(
        &pool,
        admin.user_id,
        "YCE-TASK-2",
        r#"<p>请 <span data-yuance-mention-username="mention_target" data-yuance-mention-display-name="提及成员">@提及成员</span> 帮忙复核。</p>"#,
        "html",
        None,
    )
    .await
    .expect("mention comment should create");

    let mention_notice = notifications::list_for_user(&pool, mentioned.user_id, true, 10)
        .await
        .expect("notifications should load")
        .into_iter()
        .find(|item| item.kind == "comment_mentioned" && item.comment_id == Some(comment.id))
        .expect("mention notification should exist");

    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let messages_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/messages?filter=unread")
                .header(header::COOKIE, mentioned.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(messages_response.status(), StatusCode::OK);
    let messages_body = response_body(messages_response).await;
    assert!(messages_body.contains("提及"), "{messages_body}");

    let detail_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/work-items/YCE-TASK-2")
                .header(header::COOKIE, admin.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(detail_response.status(), StatusCode::OK);
    let detail_body = response_body(detail_response).await;
    assert!(detail_body.contains("data-rich-mention-options="));
    assert!(detail_body.contains("mention_target"));
    assert!(detail_body.contains(r#"data-yuance-mention-username="mention_target""#));

    let open_response = app
        .oneshot(
            Request::builder()
                .uri(format!("/web/messages/{}/open", mention_notice.id))
                .header(header::COOKIE, mentioned.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(open_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        open_response.headers().get(header::LOCATION).unwrap(),
        format!("/web/work-items/YCE-TASK-2#comment-{}", comment.id).as_str()
    );
    assert_eq!(
        notifications::unread_count(&pool, mentioned.user_id)
            .await
            .expect("unread count should load"),
        0
    );
}

#[tokio::test]
async fn work_item_comment_mentions_reject_non_project_members() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    create_regular_user(&pool, "mention_outsider", "提及外部成员").await;

    let error = projects::add_work_item_comment_reply_with_format(
        &pool,
        admin.user_id,
        "YCE-TASK-2",
        r#"<p><span data-yuance-mention-username="mention_outsider" data-yuance-mention-display-name="提及外部成员">@提及外部成员</span> 不应被允许。</p>"#,
        "html",
        None,
    )
    .await
    .expect_err("non-member mention should fail");

    assert!(error.to_string().contains("不是当前项目成员"), "{}", error);
}

#[tokio::test]
async fn work_item_reply_mentions_deduplicate_reply_notification_for_same_target() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    let replier = create_regular_user(&pool, "mention_replier", "提及回复者").await;
    projects::add_project_member(&pool, admin.user_id, "YCE", "mention_replier", "member")
        .await
        .expect("replier should join project");

    let parent_comment_id = projects::add_work_item_comment_reply(
        &pool,
        admin.user_id,
        "YCE-TASK-2",
        "请继续同步处理进展",
        None,
    )
    .await
    .expect("parent comment should create")
    .id;

    let reply = projects::add_work_item_comment_reply_with_format(
        &pool,
        replier.user_id,
        "YCE-TASK-2",
        r#"<p>收到，<span data-yuance-mention-username="admin" data-yuance-mention-display-name="系统管理员">@系统管理员</span> 我来继续跟进。</p>"#,
        "html",
        Some(parent_comment_id),
    )
    .await
    .expect("reply should create");

    let admin_notifications = notifications::list_for_user(&pool, admin.user_id, true, 10)
        .await
        .expect("admin notifications should load");
    assert!(
        admin_notifications
            .iter()
            .any(|item| { item.kind == "comment_mentioned" && item.comment_id == Some(reply.id) })
    );
    assert!(
        !admin_notifications
            .iter()
            .any(|item| { item.kind == "comment_replied" && item.comment_id == Some(reply.id) })
    );
}

#[tokio::test]
async fn web_messages_page_clamps_unread_badge_to_99() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    let receiver = create_regular_user(&pool, "message_badge_owner", "消息角标负责人").await;
    projects::add_project_member(&pool, admin.user_id, "YCE", "message_badge_owner", "member")
        .await
        .expect("receiver should join project");
    let work_item_id =
        sqlx::query_scalar::<_, i64>("SELECT id FROM work_items WHERE item_key = 'YCE-TASK-2'")
            .fetch_one(&pool)
            .await
            .expect("work item should exist");
    for index in 1..=100 {
        insert_test_notification(&pool, receiver.user_id, admin.user_id, work_item_id, index).await;
    }
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/messages?unread=true")
                .header(header::COOKIE, receiver.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    assert!(body.contains("未读消息 100 条"));
    assert!(body.contains(
        r#"class="notification-badge" data-notification-badge aria-label="未读消息 99">99</span>"#
    ));
    assert!(body.contains(
        r#"class="content-tab active" data-content-tab aria-current="page" href="/web/messages?filter=unread"#
    ));
    assert!(body.contains(r#"<span class="content-tab-badge">99</span>"#));
    assert!(!body.contains(r#"<span class="content-tab-badge">99+</span>"#));
}

#[tokio::test]
async fn web_topnav_work_item_badge_clamps_to_99() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    let assignee = create_regular_user(&pool, "topnav_badge_owner", "顶部角标负责人").await;
    projects::add_project_member(&pool, admin.user_id, "YCE", "topnav_badge_owner", "member")
        .await
        .expect("assignee should join project");
    let project_id =
        sqlx::query_scalar::<_, i64>("SELECT id FROM projects WHERE project_key = 'YCE'")
            .fetch_one(&pool)
            .await
            .expect("project should exist");
    for index in 1..=100 {
        sqlx::query(
            r#"
            INSERT INTO work_items (
                project_id,
                item_key,
                item_type,
                title,
                description,
                status,
                priority,
                assignee_user_id,
                reporter_user_id
            )
            VALUES (?1, ?2, 'bug', ?3, '用于验证顶部导航角标上限。', 'open', 'P2', ?4, ?5)
            "#,
        )
        .bind(project_id)
        .bind(format!("YCE-BADGE-BUG-{index:03}"))
        .bind(format!("顶部角标测试 Bug {index:03}"))
        .bind(assignee.user_id)
        .bind(admin.user_id)
        .execute(&pool)
        .await
        .expect("work item should insert");
    }
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/bugs")
                .header(header::COOKIE, assignee.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    assert!(body.contains(r#"aria-label="待处理 Bug 99">99</span>"#));
    assert!(!body.contains(r#"aria-label="待处理 Bug 99+">99+</span>"#));
}

#[tokio::test]
async fn web_project_switcher_shows_assigned_pending_badges_for_current_user() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    let assignee = create_regular_user(&pool, "switcher_badge_owner", "项目切换角标负责人").await;
    projects::add_project_member(
        &pool,
        admin.user_id,
        "YCE",
        "switcher_badge_owner",
        "member",
    )
    .await
    .expect("assignee should join YCE");
    projects::add_project_member(
        &pool,
        admin.user_id,
        "OPS",
        "switcher_badge_owner",
        "member",
    )
    .await
    .expect("assignee should join OPS");
    let yce_project_id =
        sqlx::query_scalar::<_, i64>("SELECT id FROM projects WHERE project_key = 'YCE'")
            .fetch_one(&pool)
            .await
            .expect("YCE project should exist");
    let ops_project_id =
        sqlx::query_scalar::<_, i64>("SELECT id FROM projects WHERE project_key = 'OPS'")
            .fetch_one(&pool)
            .await
            .expect("OPS project should exist");

    for index in 1..=2 {
        sqlx::query(
            r#"
            INSERT INTO work_items (
                project_id,
                item_key,
                item_type,
                title,
                description,
                status,
                priority,
                assignee_user_id,
                reporter_user_id
            )
            VALUES (?1, ?2, 'task', ?3, '用于验证项目切换角标。', 'open', 'P2', ?4, ?5)
            "#,
        )
        .bind(yce_project_id)
        .bind(format!("YCE-SWITCHER-BADGE-TASK-{index}"))
        .bind(format!("YCE 项目切换角标任务 {index}"))
        .bind(assignee.user_id)
        .bind(admin.user_id)
        .execute(&pool)
        .await
        .expect("YCE work item should insert");
    }

    sqlx::query(
        r#"
        INSERT INTO work_items (
            project_id,
            item_key,
            item_type,
            title,
            description,
            status,
            priority,
            assignee_user_id,
            reporter_user_id
        )
        VALUES (?1, 'OPS-SWITCHER-BADGE-BUG-1', 'bug', 'OPS 项目切换角标 Bug', '用于验证项目切换角标。', 'open', 'P1', ?2, ?3)
        "#,
    )
    .bind(ops_project_id)
    .bind(assignee.user_id)
    .bind(admin.user_id)
    .execute(&pool)
    .await
    .expect("OPS work item should insert");

    projects::set_current_project_for_user(&pool, assignee.user_id, false, "YCE")
        .await
        .expect("assignee should select YCE");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/tasks")
                .header(header::COOKIE, assignee.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    assert!(body.contains(r#"data-current-project-badge aria-label="全部项目待处理 3">3</span>"#));
    assert!(body.contains(
        r#"data-project-key="YCE" data-project-name="元策 MVP" data-project-pending-count="2""#
    ));
    assert!(body.contains(
        r#"data-project-key="OPS" data-project-name="交付运维台" data-project-pending-count="1""#
    ));
}

#[tokio::test]
async fn api_v1_topbar_status_returns_current_project_counts_and_project_badges() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    let assignee = create_regular_user(&pool, "topbar_status_owner", "顶部状态负责人").await;
    projects::add_project_member(&pool, admin.user_id, "YCE", "topbar_status_owner", "member")
        .await
        .expect("assignee should join YCE");
    projects::add_project_member(&pool, admin.user_id, "OPS", "topbar_status_owner", "member")
        .await
        .expect("assignee should join OPS");
    let yce_project_id =
        sqlx::query_scalar::<_, i64>("SELECT id FROM projects WHERE project_key = 'YCE'")
            .fetch_one(&pool)
            .await
            .expect("YCE project should exist");
    let ops_project_id =
        sqlx::query_scalar::<_, i64>("SELECT id FROM projects WHERE project_key = 'OPS'")
            .fetch_one(&pool)
            .await
            .expect("OPS project should exist");
    let yce_task_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO work_items (
            project_id,
            item_key,
            item_type,
            title,
            description,
            status,
            priority,
            assignee_user_id,
            reporter_user_id
        )
        VALUES (?1, 'YCE-TOPBAR-STATUS-TASK-1', 'task', 'YCE 顶部状态任务 1', '用于验证顶部状态接口。', 'open', 'P2', ?2, ?3)
        RETURNING id
        "#,
    )
    .bind(yce_project_id)
    .bind(assignee.user_id)
    .bind(admin.user_id)
    .fetch_one(&pool)
    .await
    .expect("YCE task should insert");

    sqlx::query(
        r#"
        INSERT INTO work_items (
            project_id,
            item_key,
            item_type,
            title,
            description,
            status,
            priority,
            assignee_user_id,
            reporter_user_id
        )
        VALUES (?1, 'YCE-TOPBAR-STATUS-TASK-2', 'task', 'YCE 顶部状态任务 2', '用于验证顶部状态接口。', 'open', 'P2', ?2, ?3)
        "#,
    )
    .bind(yce_project_id)
    .bind(assignee.user_id)
    .bind(admin.user_id)
    .execute(&pool)
    .await
    .expect("second YCE task should insert");

    sqlx::query(
        r#"
        INSERT INTO work_items (
            project_id,
            item_key,
            item_type,
            title,
            description,
            status,
            priority,
            assignee_user_id,
            reporter_user_id
        )
        VALUES (?1, 'OPS-TOPBAR-STATUS-BUG-1', 'bug', 'OPS 顶部状态 Bug', '用于验证顶部状态接口。', 'open', 'P1', ?2, ?3)
        "#,
    )
    .bind(ops_project_id)
    .bind(assignee.user_id)
    .bind(admin.user_id)
    .execute(&pool)
    .await
    .expect("OPS bug should insert");

    sqlx::query(
        r#"
        INSERT INTO notifications (
            recipient_user_id,
            actor_user_id,
            actor_display_name_snapshot,
            kind,
            work_item_id,
            comment_id,
            title,
            body
        )
        VALUES (?1, ?2, '系统管理员', 'work_item_assigned', ?3, NULL, '新的指派', '请尽快处理')
        "#,
    )
    .bind(assignee.user_id)
    .bind(admin.user_id)
    .bind(yce_task_id)
    .execute(&pool)
    .await
    .expect("notification should insert");

    projects::set_current_project_for_user(&pool, assignee.user_id, false, "YCE")
        .await
        .expect("assignee should select YCE");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/topbar/status")
                .header(header::COOKIE, assignee.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    let payload: serde_json::Value =
        serde_json::from_str(&body).expect("topbar status should be json");
    let data = payload
        .get("data")
        .expect("response should contain data object");
    assert_eq!(
        data.get("requirements_count")
            .and_then(|value| value.as_i64()),
        Some(0)
    );
    assert_eq!(
        data.get("tasks_count").and_then(|value| value.as_i64()),
        Some(2)
    );
    assert_eq!(
        data.get("bugs_count").and_then(|value| value.as_i64()),
        Some(0)
    );
    assert_eq!(
        data.get("notifications_count")
            .and_then(|value| value.as_i64()),
        Some(1)
    );
    let current_project = data
        .get("current_project")
        .expect("current_project should exist");
    assert_eq!(
        current_project.get("key").and_then(|value| value.as_str()),
        Some("YCE")
    );
    assert_eq!(
        current_project
            .get("pending_count")
            .and_then(|value| value.as_i64()),
        Some(2)
    );

    let project_badges = data
        .get("project_badges")
        .and_then(|value| value.as_array())
        .expect("project_badges should be array");
    assert!(project_badges.iter().any(|project| {
        project.get("project_key").and_then(|value| value.as_str()) == Some("YCE")
            && project
                .get("pending_count")
                .and_then(|value| value.as_i64())
                == Some(2)
    }));
    assert!(project_badges.iter().any(|project| {
        project.get("project_key").and_then(|value| value.as_str()) == Some("OPS")
            && project
                .get("pending_count")
                .and_then(|value| value.as_i64())
                == Some(1)
    }));
}

#[tokio::test]
async fn api_v1_topbar_events_returns_sse_stream_for_authenticated_user() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/topbar/events")
                .header(header::COOKIE, admin.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok()),
        Some("text/event-stream")
    );

    let mut body = response.into_body();
    let mut payload = String::new();
    for _ in 0..3 {
        let frame = tokio::time::timeout(std::time::Duration::from_secs(1), body.frame())
            .await
            .expect("sse frame should arrive")
            .expect("stream should stay open")
            .expect("frame should be ok");
        if let Some(data) = frame.data_ref() {
            payload.push_str(str::from_utf8(data).expect("sse chunk should be utf-8"));
        }
        if payload.contains("event: release-version") && payload.contains("event: topbar") {
            break;
        }
    }
    assert!(payload.contains("event: release-version"));
}

#[tokio::test]
async fn api_v1_work_item_events_returns_sse_stream_for_authenticated_user() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-items/YCE-TASK-2/events")
                .header(header::COOKIE, admin.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok()),
        Some("text/event-stream")
    );
}

#[tokio::test]
async fn api_v1_work_item_typing_updates_ephemeral_presence() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let active_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items/YCE-TASK-2/typing")
                .header(header::COOKIE, admin.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"client_id":"browser-tab-1","active":true}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(active_response.status(), StatusCode::NO_CONTENT);
    assert_eq!(
        realtime::work_item_typing_snapshot_for_user("YCE-TASK-2", 0),
        vec![realtime::WorkItemTypingUser {
            user_id: admin.user_id,
            display_name: "系统管理员".to_string(),
        }]
    );

    let inactive_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items/YCE-TASK-2/typing")
                .header(header::COOKIE, admin.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"client_id":"browser-tab-1","active":false}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(inactive_response.status(), StatusCode::NO_CONTENT);
    assert!(
        realtime::work_item_typing_snapshot_for_user("YCE-TASK-2", 0).is_empty(),
        "typing presence should clear after inactive update"
    );
}

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
    assert!(yuance.active_work_item_count >= 2);
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

    let on_hold_page = projects::list_project_summaries_paginated(
        &pool,
        projects::ProjectListFilter {
            status: "on_hold".to_string(),
        },
        projects::Pagination {
            page: 1,
            per_page: 10,
        },
    )
    .await
    .expect("filtered project page should load");
    assert_eq!(on_hold_page.total_items, 1);
    assert_eq!(on_hold_page.items[0].project_key, "CRM");
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
async fn personal_project_analysis_counts_only_real_terminal_transitions() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("YCE should exist");

    projects::update_work_item_status(&pool, initialized.user_id, "YCE-REQ-1", "done")
        .await
        .expect("requirement should complete");
    projects::handoff_work_item(
        &pool,
        initialized.user_id,
        "YCE-REQ-1",
        projects::HandoffWorkItemInput {
            status: "done".to_string(),
            assignee_username: "admin".to_string(),
            body: "补充完成说明，不应重复计算产出".to_string(),
            source_comment_id: None,
            actor_display_name_snapshot: String::new(),
        },
    )
    .await
    .expect("terminal item note should save");

    let analysis = projects::personal_project_analysis(&pool, project.id, initialized.user_id)
        .await
        .expect("analysis should load");
    assert_eq!(analysis.completed_total, 1);
    assert_eq!(analysis.completed_requirements, 1);
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
    assert!(!tasks_body.contains(r#"class="page-hero""#));
    let panel_head = tasks_body
        .find(r#"class="panel-head""#)
        .expect("list panel head should render");
    let create_button = tasks_body
        .find(r#"data-modal-open="work-item-create-modal""#)
        .expect("create button should render");
    assert!(create_button > panel_head);
    assert!(tasks_body.contains(r#"id="work-item-create-modal""#));
    assert!(tasks_body.contains(r#"name="item_type" value="task""#));
    assert!(tasks_body.contains(r#"name="project_key" value="YCE" data-bug-report-item-field"#));
    assert!(tasks_body.contains(r#"data-bug-report-form"#));
    assert!(tasks_body.contains(r#"data-rich-text-editor data-placeholder="请输入内容...""#));
    assert!(tasks_body.contains(r#"data-rich-text-input data-placeholder="请输入内容...""#));
    assert!(tasks_body.contains(r#"data-bug-report-description"#));
    assert!(tasks_body.contains(r#"data-bug-report-status hidden"#));
    assert!(!tasks_body.contains(r#"data-bug-report-groups"#));
    assert!(!tasks_body.contains(r#"type="file" multiple data-bug-report-image"#));
    assert!(tasks_body.contains(r#"data-select-search-placeholder="搜索处理人""#));
    assert!(!tasks_body.contains(r#"class="work-type-tabs""#));
    assert!(!tasks_body.contains(r#"id="work-item-create-form""#));
    assert!(tasks_body.contains("父级需求"));
    assert!(!tasks_body.contains("CRM-BUG-1"));

    assert!(bugs_body.contains("YCE-BUG-1"));
    assert!(!bugs_body.contains("CRM-BUG-1"));
    assert!(!bugs_body.contains("YCE-REQ-1"));
    assert!(!bugs_body.contains("OPS-TASK-1"));
    assert!(bugs_body.contains(r#"data-bug-report-form"#));
    assert!(bugs_body.contains(r#"data-rich-text-editor data-placeholder="请输入内容...""#));
    assert!(bugs_body.contains(r#"data-rich-text-input data-placeholder="请输入内容...""#));
    assert!(bugs_body.contains(r#"data-bug-report-status hidden"#));
    assert!(!bugs_body.contains(r#"data-bug-report-groups"#));
    assert!(!bugs_body.contains(r#"type="file" multiple data-bug-report-image"#));
    assert!(!bugs_body.contains("每组说明会保存为一条评论"));
    assert!(!bugs_body.contains(r#"class="work-type-tabs""#));

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
    assert!(body.contains("待处理 / 进行中 / 待确认"));
    assert!(!body.contains("全部待处理"));
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

    assert!(first_body.contains("当前显示 1-1"));
    assert!(first_body.contains("共 2 条"));
    assert!(first_body.contains("待处理 / 进行中 / 待确认"));
    assert!(first_body.contains("<strong>1</strong>"));
    assert!(first_body.contains("高优先级"));
    assert!(first_body.contains("<strong>2</strong>"));
    assert!(first_body.contains("aria-label=\"下一页\""));
    assert!(first_body.contains("<table class=\"data-table work-item-table\">"));
    assert!(first_body.contains("<th class=\"work-table-actions\" scope=\"col\">操作</th>"));
    assert!(first_body.contains(">查看</a>"));
    assert!(first_body.contains("data-pagination-size"));
    assert!(first_body.contains(r#"<option value="1" selected>当前 1</option>"#));
    assert!(first_body.contains("value=\"100\""));
    assert!(first_body.contains("aria-label=\"跳转页码\""));
    assert!(first_body.contains("project_key=YCE"));
    assert!(first_body.contains("page=2"));
    assert!(first_body.contains("per_page=1"));
    assert!(first_body.contains("YCE-TASK-1") ^ first_body.contains("YCE-TASK-2"));

    assert!(second_body.contains("当前显示 2-2"));
    assert!(second_body.contains("共 2 条"));
    assert!(second_body.contains("待处理 / 进行中 / 待确认"));
    assert!(second_body.contains("<strong>1</strong>"));
    assert!(second_body.contains("高优先级"));
    assert!(second_body.contains("<strong>2</strong>"));
    assert!(second_body.contains("aria-label=\"上一页\""));
    assert!(second_body.contains("project_key=YCE"));
    assert!(second_body.contains("per_page=1"));
    assert!(second_body.contains("YCE-TASK-1") ^ second_body.contains("YCE-TASK-2"));
    assert_ne!(
        first_body.contains("YCE-TASK-1"),
        second_body.contains("YCE-TASK-1")
    );
}

#[tokio::test]
async fn web_work_item_saved_view_can_apply_default_filters_and_be_managed() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    projects::set_current_project_for_user(&pool, initialized.user_id, true, "YCE")
        .await
        .expect("admin should select YCE");
    let cycle = projects::create_project_cycle(
        &pool,
        initialized.user_id,
        "YCE",
        projects::CreateProjectCycleInput {
            name: "协作迭代一".to_string(),
            goal: String::new(),
            description: String::new(),
            owner_username: "admin".to_string(),
            start_date: "2026-07-01".to_string(),
            end_date: "2026-07-15".to_string(),
        },
    )
    .await
    .expect("cycle should create");
    projects::set_work_item_cycle(
        &pool,
        initialized.user_id,
        "YCE-TASK-2",
        Some(cycle.id),
        "系统管理员",
    )
    .await
    .expect("task should join cycle");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-item-views")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(format!(
                    "_csrf={CSRF_TOKEN}&project_key=YCE&item_type=task&name=%E9%87%8D%E7%82%B9%E4%BB%BB%E5%8A%A1&q=&status=in_progress&priority=P0&assignee_username=admin&cycle_id={}&sort=priority_desc&per_page=20&is_default=true&return_to=%2Fweb%2Ftasks%3Fstatus%3Din_progress",
                    cycle.id
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(create_response.status(), StatusCode::SEE_OTHER);

    let saved_view_id = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM work_item_saved_views WHERE user_id = ?1 AND name = ?2",
    )
    .bind(initialized.user_id)
    .bind("重点任务")
    .fetch_one(&pool)
    .await
    .expect("saved view should persist");

    let default_response = app
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
    assert_eq!(default_response.status(), StatusCode::OK);
    let default_body = response_body(default_response).await;
    assert!(default_body.contains("重点任务"));
    assert!(default_body.contains(r#"option value="in_progress" selected"#));
    assert!(default_body.contains(r#"option value="P0" selected"#));
    assert!(default_body.contains(&format!(r#"option value="{}" selected"#, cycle.id)));
    assert!(default_body.contains(r#"option value="priority_desc" selected"#));
    assert!(default_body.contains(r#"<option value="20" selected>20</option>"#));
    assert!(default_body.contains("YCE-TASK-2"));
    assert!(!default_body.contains("YCE-TASK-1"));

    let reset_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/tasks?clear_default=true&per_page=1")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(reset_response.status(), StatusCode::OK);
    let reset_body = response_body(reset_response).await;
    assert!(reset_body.contains("共 2 条"));
    assert!(reset_body.contains("clear_default=true"));
    assert!(!reset_body.contains("clear_default=1"));

    let rename_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/web/work-item-views/{saved_view_id}/rename"))
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(format!(
                    "_csrf={CSRF_TOKEN}&name=%E5%8D%8F%E4%BD%9C%E9%87%8D%E7%82%B9&return_to=%2Fweb%2Ftasks"
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(rename_response.status(), StatusCode::SEE_OTHER);

    let renamed_response = app
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
    let renamed_body = response_body(renamed_response).await;
    assert!(renamed_body.contains("协作重点"));
    assert!(!renamed_body.contains("重点任务"));

    let delete_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/web/work-item-views/{saved_view_id}/delete"))
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(format!(
                    "_csrf={CSRF_TOKEN}&return_to=%2Fweb%2Ftasks"
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(delete_response.status(), StatusCode::SEE_OTHER);

    let after_delete_response = app
        .oneshot(
            Request::builder()
                .uri("/web/tasks")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(after_delete_response.status(), StatusCode::OK);
    let after_delete_body = response_body(after_delete_response).await;
    assert!(!after_delete_body.contains("协作重点"));
    assert!(after_delete_body.contains("YCE-TASK-1"));
    assert!(after_delete_body.contains("YCE-TASK-2"));
}

#[tokio::test]
async fn web_work_item_saved_view_rejects_duplicate_names_and_isolated_per_user() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let member = create_regular_user(&pool, "saved_view_member", "视图成员").await;
    projects::add_project_member(
        &pool,
        initialized.user_id,
        "YCE",
        "saved_view_member",
        "member",
    )
    .await
    .expect("member should join project");
    projects::set_current_project_for_user(&pool, initialized.user_id, true, "YCE")
        .await
        .expect("admin should select YCE");
    projects::set_current_project_for_user(&pool, member.user_id, false, "YCE")
        .await
        .expect("member should select YCE");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let first_create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-item-views")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(format!(
                    "_csrf={CSRF_TOKEN}&project_key=YCE&item_type=task&name=%E5%BE%85%E6%88%91%E5%A4%84%E7%90%86&assignee_username=admin&sort=updated_desc&per_page=10&return_to=%2Fweb%2Ftasks"
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(first_create_response.status(), StatusCode::SEE_OTHER);

    let duplicate_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-item-views")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(format!(
                    "_csrf={CSRF_TOKEN}&project_key=YCE&item_type=task&name=%E5%BE%85%E6%88%91%E5%A4%84%E7%90%86&assignee_username=admin&sort=updated_desc&per_page=10&return_to=%2Fweb%2Ftasks"
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(duplicate_response.status(), StatusCode::BAD_REQUEST);
    let duplicate_body = response_body(duplicate_response).await;
    assert!(duplicate_body.contains("保存视图“待我处理”已存在"));

    let admin_view_id = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM work_item_saved_views WHERE user_id = ?1 AND name = ?2",
    )
    .bind(initialized.user_id)
    .bind("待我处理")
    .fetch_one(&pool)
    .await
    .expect("admin saved view should persist");

    let member_views =
        projects::list_work_item_saved_views_for_user(&pool, member.user_id, false, "YCE", "task")
            .await
            .expect("member views should load");
    assert!(member_views.is_empty());

    let forbidden_rename_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/web/work-item-views/{admin_view_id}/rename"))
                .header(header::COOKIE, member.cookie)
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(format!(
                    "_csrf={CSRF_TOKEN}&name=%E9%9D%9E%E6%B3%95%E4%BF%AE%E6%94%B9&return_to=%2Fweb%2Ftasks"
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(forbidden_rename_response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn web_work_item_batch_update_can_assign_tasks_and_render_controls() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let _member = create_regular_user(&pool, "batch_task_owner", "批量任务处理人").await;
    projects::add_project_member(
        &pool,
        initialized.user_id,
        "YCE",
        "batch_task_owner",
        "member",
    )
    .await
    .expect("member should join project");
    projects::set_current_project_for_user(&pool, initialized.user_id, true, "YCE")
        .await
        .expect("admin should select YCE");
    let third_task = projects::create_work_item(
        &pool,
        initialized.user_id,
        projects::CreateWorkItemInput {
            project_key: "YCE".to_string(),
            item_type: "task".to_string(),
            title: "补齐批量操作联调".to_string(),
            description: "用于验证批量指派".to_string(),
            priority: "P2".to_string(),
            assignee_username: String::new(),
            due_date: String::new(),
            parent_item_key: String::new(),
            actor_display_name_snapshot: "系统管理员".to_string(),
        },
    )
    .await
    .expect("third task should create");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

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
    assert_eq!(list_response.status(), StatusCode::OK);
    let list_body = response_body(list_response).await;
    assert!(list_body.contains("data-work-item-batch-form"));
    assert!(list_body.contains("data-work-item-batch-select-all"));
    assert!(list_body.contains("data-work-item-batch-checkbox"));
    assert!(list_body.contains("批量调整周期"));
    assert!(list_body.contains("执行批量操作"));

    let batch_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items/batch")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(format!(
                    "_csrf={CSRF_TOKEN}&project_key=YCE&item_type=task&item_key=YCE-TASK-1&item_key=YCE-TASK-2&item_key={}&action=assignee&assignee_username=batch_task_owner&return_to=%2Fweb%2Ftasks",
                    third_task.item_key
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(batch_response.status(), StatusCode::SEE_OTHER);

    let assigned_count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM work_items wi
        JOIN users u ON u.id = wi.assignee_user_id
        WHERE wi.item_key IN (?1, ?2, ?3)
          AND u.username = ?4
        "#,
    )
    .bind("YCE-TASK-1")
    .bind("YCE-TASK-2")
    .bind(&third_task.item_key)
    .bind("batch_task_owner")
    .fetch_one(&pool)
    .await
    .expect("assigned count should load");
    assert_eq!(assigned_count, 3);

    let audit_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM audit_logs WHERE action = 'work_item.batch.update' AND target_type = 'project' AND target_id = 'YCE'",
    )
    .fetch_one(&pool)
    .await
    .expect("audit count should load");
    assert_eq!(audit_count, 1);
}

#[tokio::test]
async fn web_work_item_batch_update_can_update_cycle_and_record_flow() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    projects::set_current_project_for_user(&pool, initialized.user_id, true, "YCE")
        .await
        .expect("admin should select YCE");
    let cycle = projects::create_project_cycle(
        &pool,
        initialized.user_id,
        "YCE",
        projects::CreateProjectCycleInput {
            name: "批量协作迭代".to_string(),
            goal: String::new(),
            description: String::new(),
            owner_username: "admin".to_string(),
            start_date: "2026-07-01".to_string(),
            end_date: "2026-07-15".to_string(),
        },
    )
    .await
    .expect("cycle should create");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let batch_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items/batch")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(format!(
                    "_csrf={CSRF_TOKEN}&project_key=YCE&item_type=task&item_key=YCE-TASK-1&item_key=YCE-TASK-2&action=cycle&cycle_id={}&return_to=%2Fweb%2Ftasks",
                    cycle.id
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(batch_response.status(), StatusCode::SEE_OTHER);

    let cycle_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM work_items WHERE item_key IN ('YCE-TASK-1', 'YCE-TASK-2') AND cycle_id = ?1",
    )
    .bind(cycle.id)
    .fetch_one(&pool)
    .await
    .expect("cycle count should load");
    assert_eq!(cycle_count, 2);

    let flow_comment_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM work_item_comments WHERE work_item_id IN (SELECT id FROM work_items WHERE item_key IN ('YCE-TASK-1', 'YCE-TASK-2')) AND body = ?1",
    )
    .bind("[yuance-flow] 周期：未关联 → 批量协作迭代")
    .fetch_one(&pool)
    .await
    .expect("flow comment count should load");
    assert_eq!(flow_comment_count, 2);
}

#[tokio::test]
async fn web_work_item_batch_update_rejects_cross_project_items() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    projects::set_current_project_for_user(&pool, initialized.user_id, true, "YCE")
        .await
        .expect("admin should select YCE");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let batch_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items/batch")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(format!(
                    "_csrf={CSRF_TOKEN}&project_key=YCE&item_type=task&item_key=YCE-TASK-1&item_key=OPS-TASK-1&action=priority&priority=P1&return_to=%2Fweb%2Ftasks",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(batch_response.status(), StatusCode::BAD_REQUEST);
    let batch_body = response_body(batch_response).await;
    assert!(batch_body.contains("不属于当前项目 YCE"));

    let yce_priority = sqlx::query_scalar::<_, String>(
        "SELECT priority FROM work_items WHERE item_key = 'YCE-TASK-1'",
    )
    .fetch_one(&pool)
    .await
    .expect("yce priority should load");
    let ops_priority = sqlx::query_scalar::<_, String>(
        "SELECT priority FROM work_items WHERE item_key = 'OPS-TASK-1'",
    )
    .fetch_one(&pool)
    .await
    .expect("ops priority should load");
    assert_eq!(yce_priority, "P0");
    assert_eq!(ops_priority, "P2");
}

#[tokio::test]
async fn web_work_item_batch_update_rejects_status_not_supported_for_type() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    projects::set_current_project_for_user(&pool, initialized.user_id, true, "YCE")
        .await
        .expect("admin should select YCE");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let batch_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items/batch")
                .header(header::COOKIE, initialized.cookie)
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(format!(
                    "_csrf={CSRF_TOKEN}&project_key=YCE&item_type=task&item_key=YCE-TASK-2&action=status&status=resolved&return_to=%2Fweb%2Ftasks",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(batch_response.status(), StatusCode::BAD_REQUEST);
    let batch_body = response_body(batch_response).await;
    assert!(batch_body.contains("任务 不支持状态 已解决"));
}

#[tokio::test]
async fn api_v1_work_item_batch_update_reports_partial_failures() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items/batch")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"project_key":"YCE","item_type":"task","item_keys":["YCE-TASK-1","OPS-TASK-1"],"action":"priority","priority":"P1"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::OK);
    let body: serde_json::Value = serde_json::from_str(&response_body(response).await)
        .expect("batch response should be json");
    assert_eq!(body["data"]["updated_count"], 1);
    assert_eq!(
        body["data"]["updated_item_keys"],
        serde_json::json!(["YCE-TASK-1"])
    );
    assert_eq!(body["data"]["failed_count"], 1);
    assert_eq!(body["data"]["failed_items"][0]["item_key"], "OPS-TASK-1");
    assert_eq!(body["data"]["failed_items"][0]["code"], "bad_request");

    let priorities = sqlx::query_as::<_, (String, String)>(
        "SELECT item_key, priority FROM work_items WHERE item_key IN ('YCE-TASK-1', 'OPS-TASK-1') ORDER BY item_key",
    )
    .fetch_all(&pool)
    .await
    .expect("priorities should load");
    assert_eq!(
        priorities,
        vec![
            ("OPS-TASK-1".to_string(), "P2".to_string()),
            ("YCE-TASK-1".to_string(), "P1".to_string())
        ]
    );

    let duplicate = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items/batch")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"project_key":"YCE","item_type":"task","item_keys":["YCE-TASK-1","yce-task-1"],"action":"priority","priority":"P2"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(duplicate.status(), StatusCode::BAD_REQUEST);
    assert!(
        response_body(duplicate)
            .await
            .contains("工作项编号不能重复")
    );
}

#[tokio::test]
async fn retired_project_web_mutation_routes_are_not_registered() {
    let app = build_router(AppState::for_tests());

    let project_switch = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/current-project")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from("project_key=YCE&_csrf=invalid"))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(project_switch.status(), StatusCode::FORBIDDEN);

    for (uri, expected) in [
        ("/web/projects", StatusCode::METHOD_NOT_ALLOWED),
        ("/web/projects/YCE/edit", StatusCode::NOT_FOUND),
        ("/web/projects/YCE/members", StatusCode::NOT_FOUND),
        (
            "/web/projects/YCE/members/member/remove",
            StatusCode::NOT_FOUND,
        ),
        (
            "/web/projects/YCE/members/member/role",
            StatusCode::NOT_FOUND,
        ),
        ("/web/projects/YCE/cycles", StatusCode::NOT_FOUND),
        ("/web/projects/YCE/cycles/7", StatusCode::METHOD_NOT_ALLOWED),
        ("/web/projects/YCE/cycles/7/edit", StatusCode::NOT_FOUND),
        ("/web/projects/YCE/cycles/7/close", StatusCode::NOT_FOUND),
        ("/web/projects/YCE/attachments", StatusCode::NOT_FOUND),
        (
            "/web/projects/YCE/attachments/7/delete",
            StatusCode::NOT_FOUND,
        ),
        ("/web/projects/YCE/resources", StatusCode::NOT_FOUND),
        (
            "/web/projects/YCE/resources/7/unlock",
            StatusCode::NOT_FOUND,
        ),
        (
            "/web/projects/YCE/resources/7/password/reset",
            StatusCode::NOT_FOUND,
        ),
        ("/web/projects/YCE/resources/7/edit", StatusCode::NOT_FOUND),
        (
            "/web/projects/YCE/resources/7/archive",
            StatusCode::NOT_FOUND,
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(uri)
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), expected, "POST {uri}");
    }
}

#[tokio::test]
async fn work_item_detail_partial_is_retired() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/partials/work-items/YCE-TASK-2")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
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
    assert!(body.contains("发布人"));
    assert!(body.contains("指派 / 流转"));
    assert!(body.contains("查看操作记录"));
    assert!(body.contains("发表新评论"));
    assert!(!body.contains("查看指派记录"));
    assert!(body.contains(r#"data-modal-open="work-item-edit-modal""#));
    assert!(body.contains(r#"id="work-item-edit-modal""#));
    assert!(body.contains(r#"class="work-item-action-rail""#));
    assert!(body.contains(r#"data-discussion-form"#));
    assert!(body.contains(r#"data-discussion-main-composer"#));
    assert!(body.contains(r#"data-discussion-scroll-composer"#));
    assert!(!body.contains(r#"discussion-composer-shortcut"#));
    assert!(!body.contains(r#"id="work-item-comment-modal""#));
    assert!(!body.contains(r#"id="work-item-attachment-modal""#));
    assert!(body.contains("编辑任务"));
    assert!(body.contains("先统一项目与工作项查询模型"));
}

#[tokio::test]
async fn web_work_item_detail_page_renders_previous_next_navigation() {
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

    assert!(body.contains(r#"aria-label="帖子切换""#));
    assert!(body.contains(r#"href="/web/work-items/YCE-TASK-1""#));
    assert!(body.contains("下一个任务 →"));
    assert!(body.contains(r#"aria-disabled="true">← 上一个任务"#));
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
async fn api_v1_own_profile_supports_read_and_update() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let read_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/me/profile")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(read_response.status(), StatusCode::OK);
    let read: serde_json::Value = serde_json::from_str(&response_body(read_response).await)
        .expect("profile response should be JSON");
    assert_eq!(read["data"]["username"], "admin");
    assert_eq!(read["data"]["display_name"], "系统管理员");

    let update_response = app
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/me/profile")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"display_name":"管理员新名称","email":"admin@yuance.test","mobile":"13800000000"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(update_response.status(), StatusCode::OK);
    let updated: serde_json::Value = serde_json::from_str(&response_body(update_response).await)
        .expect("updated profile should be JSON");
    assert_eq!(updated["data"]["display_name"], "管理员新名称");
    assert_eq!(updated["data"]["email"], "admin@yuance.test");
    assert_eq!(updated["data"]["mobile"], "13800000000");

    let stored = users::get_user_summary(&pool, initialized.user_id)
        .await
        .expect("profile should load")
        .expect("profile should exist");
    assert_eq!(stored.display_name, "管理员新名称");
}

#[tokio::test]
async fn api_v1_search_returns_visible_paginated_results() {
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
                .uri("/api/v1/search?q=%2Fweb&per_page=1")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body: serde_json::Value = serde_json::from_str(&response_body(response).await)
        .expect("search response should be JSON");
    let data = &body["data"];
    assert_eq!(data["items"].as_array().map(Vec::len), Some(1));
    assert_eq!(data["pagination"]["per_page"], 1);
    assert!(
        data["pagination"]["total_items"]
            .as_i64()
            .unwrap_or_default()
            > 0
    );
    assert!(
        data["items"][0]["target"]
            .as_str()
            .is_some_and(|target| target.starts_with("/web/"))
    );
    assert!(data["items"][0].get("kind").is_some());

    let oversized = format!("/api/v1/search?q={}", "x".repeat(129));
    let invalid_response = app
        .oneshot(
            Request::builder()
                .uri(oversized)
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(invalid_response.status(), StatusCode::BAD_REQUEST);
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
    assert!(projects_body.contains("\"active_work_item_count\":"));
    assert!(!projects_body.contains("\"open_work_item_count\":"));
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
                .uri("/api/v1/projects?status=on_hold&page=1&per_page=1")
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
async fn api_v1_pat_project_scope_filters_project_and_work_item_lists() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let token = create_test_api_token(
        app.clone(),
        &initialized.cookie,
        r#"{"name":"仅 OPS","scopes":["project:read","work_item:read"],"project_scope":"OPS"}"#,
    )
    .await;

    let projects_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/projects")
                .header(header::AUTHORIZATION, format!("Bearer {token}"))
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(projects_response.status(), StatusCode::OK);
    let projects_body = response_body(projects_response).await;
    assert!(projects_body.contains(r#""key":"OPS""#));
    assert!(!projects_body.contains(r#""key":"YCE""#));
    assert!(projects_body.contains(r#""total_items":1"#));

    let current_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/current-project")
                .header(header::AUTHORIZATION, format!("Bearer {token}"))
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(current_response.status(), StatusCode::OK);
    let current_body = response_body(current_response).await;
    assert!(current_body.contains(r#""data":null"#));
    assert!(!current_body.contains(r#""key":"YCE""#));

    let work_items_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-items?item_type=task")
                .header(header::AUTHORIZATION, format!("Bearer {token}"))
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(work_items_response.status(), StatusCode::OK);
    let work_items_body = response_body(work_items_response).await;
    assert!(work_items_body.contains(r#""key":"OPS-TASK-1""#));
    assert!(!work_items_body.contains(r#""key":"YCE-TASK-2""#));

    let forbidden_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-items?item_type=task&project_key=YCE")
                .header(header::AUTHORIZATION, format!("Bearer {token}"))
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(forbidden_response.status(), StatusCode::FORBIDDEN);
    let forbidden_body = response_body(forbidden_response).await;
    assert!(forbidden_body.contains("不允许访问该项目"));

    let current_forbidden_response = app
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/current-project")
                .header(header::AUTHORIZATION, format!("Bearer {token}"))
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(r#"{"project_key":"YCE"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(current_forbidden_response.status(), StatusCode::FORBIDDEN);
    let current_forbidden_body = response_body(current_forbidden_response).await;
    assert!(current_forbidden_body.contains("不允许访问该项目"));
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
async fn api_v1_filters_and_sorts_work_items_with_the_shared_cycle_contract() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let filtered = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-items?item_type=task&project_key=YCE&cycle_id=999&sort=priority_desc")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(filtered.status(), StatusCode::OK);
    assert!(response_body(filtered).await.contains(r#""items":[]"#));

    let invalid_sort = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-items?item_type=task&project_key=YCE&sort=random")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(invalid_sort.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn api_v1_work_item_list_view_returns_atomic_shared_page_contract() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    projects::create_work_item_saved_view(
        &pool,
        initialized.user_id,
        true,
        "YCE",
        "task",
        projects::CreateWorkItemSavedViewInput {
            name: "高优先级任务".to_string(),
            filter: projects::WorkItemListFilter {
                item_type: Some("task".to_string()),
                priority: "P0".to_string(),
                project_key: "YCE".to_string(),
                sort_by: "priority_desc".to_string(),
                ..projects::WorkItemListFilter::default()
            },
            per_page: 10,
            is_default: true,
        },
    )
    .await
    .expect("saved view should persist");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-item-list-view?item_type=task&project_key=YCE&priority=P0&sort=priority_desc&page=1&per_page=10")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::OK);
    let body: serde_json::Value = serde_json::from_str(&response_body(response).await)
        .expect("list view response should be json");
    let data = &body["data"];

    assert_eq!(data["filters"]["item_type"], "task");
    assert_eq!(data["filters"]["project_key"], "YCE");
    assert_eq!(data["filters"]["priority"], "P0");
    assert_eq!(data["filters"]["sort"], "priority_desc");
    assert_eq!(data["pagination"]["page"], 1);
    assert_eq!(data["pagination"]["per_page"], 10);
    assert_eq!(
        data["summary"]["total_items"],
        data["pagination"]["total_items"]
    );
    assert_eq!(
        data["summary"]["high_priority_items"],
        data["summary"]["total_items"]
    );
    assert!(data["items"].as_array().is_some_and(|items| {
        !items.is_empty()
            && items
                .iter()
                .all(|item| item["item_type"] == "task" && item["priority"] == "P0")
    }));
    assert!(
        data["assignees"]
            .as_array()
            .is_some_and(|items| !items.is_empty())
    );
    assert!(data["cycles"].is_array());
    assert!(data["parent_options"].as_array().is_some_and(|items| {
        items.iter().any(|item| {
            item["key"] == "YCE-REQ-1" && !item["title"].as_str().unwrap_or("").is_empty()
        })
    }));
    assert_eq!(data["saved_views"][0]["name"], "高优先级任务");
    assert_eq!(data["saved_views"][0]["filters"]["priority"], "P0");
    assert_eq!(data["saved_views"][0]["per_page"], 10);
    assert_eq!(data["saved_views"][0]["is_default"], true);
    assert_eq!(data["can_manage_work_items"], true);

    let missing_type = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-item-list-view?project_key=YCE")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(missing_type.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn api_v1_work_item_detail_view_returns_atomic_shared_page_contract() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-item-detail-view/YCE-TASK-2")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::OK);
    let body: serde_json::Value = serde_json::from_str(&response_body(response).await)
        .expect("detail view response should be json");
    let data = &body["data"];

    assert_eq!(data["item"]["key"], "YCE-TASK-2");
    assert_eq!(data["item"]["item_type"], "task");
    assert_eq!(data["item"]["project_key"], "YCE");
    let assignee_username = data["item"]["assignee_username"]
        .as_str()
        .expect("detail assignee should be a string");
    assert!(data["assignees"].as_array().is_some_and(|items| {
        items.iter().any(|item| {
            item["value"] == assignee_username && !item["label"].as_str().unwrap_or("").is_empty()
        })
    }));
    assert!(
        data["parent_options"]
            .as_array()
            .is_some_and(|items| { items.iter().any(|item| item["key"] == "YCE-REQ-1") })
    );
    assert!(data["status_options"].as_array().is_some_and(|items| {
        items.iter().any(|item| item["value"] == "in_progress")
            && items
                .iter()
                .all(|item| !item["label"].as_str().unwrap_or("").is_empty())
    }));
    assert_eq!(data["permissions"]["can_manage_work_items"], true);
    assert_eq!(data["permissions"]["can_edit_primary_post"], true);
    assert!(data["navigation"].as_object().is_some_and(|navigation| {
        navigation.contains_key("previous") && navigation.contains_key("next")
    }));
    assert!(data["flow_history"]["items"].is_array());
    assert_eq!(data["flow_history"]["pagination"]["page"], 1);
    assert_eq!(data["flow_history"]["pagination"]["per_page"], 10);
}

#[tokio::test]
async fn api_v1_work_item_saved_view_json_lifecycle_is_user_scoped() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let create = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-item-saved-views")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"project_key":"YCE","item_type":"task","name":"我的任务","status":"in_progress","priority":"P0","sort":"priority_desc","per_page":20}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(create.status(), StatusCode::CREATED);
    let created: serde_json::Value =
        serde_json::from_str(&response_body(create).await).expect("create response should be json");
    let saved_view_id = created["data"]["id"]
        .as_i64()
        .expect("saved view id should exist");
    assert_eq!(created["data"]["name"], "我的任务");
    assert_eq!(created["data"]["filters"]["status"], "in_progress");
    assert_eq!(created["data"]["per_page"], 20);

    let rename = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/v1/work-item-saved-views/{saved_view_id}"))
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"name":"重点任务"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(rename.status(), StatusCode::OK);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&response_body(rename).await)
            .expect("rename response should be json")["data"]["name"],
        "重点任务"
    );

    let set_default = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/v1/work-item-saved-views/{saved_view_id}/default"
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(set_default.status(), StatusCode::OK);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&response_body(set_default).await)
            .expect("default response should be json")["data"]["is_default"],
        true
    );

    let list = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-item-list-view?item_type=task&project_key=YCE")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(list.status(), StatusCode::OK);
    let listed: serde_json::Value =
        serde_json::from_str(&response_body(list).await).expect("list response should be json");
    assert_eq!(listed["data"]["saved_views"][0]["id"], saved_view_id);
    assert_eq!(listed["data"]["saved_views"][0]["name"], "重点任务");
    assert_eq!(listed["data"]["filters"]["status"], "in_progress");
    assert_eq!(listed["data"]["pagination"]["per_page"], 20);

    let cleared = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(
                    "/api/v1/work-item-list-view?item_type=task&project_key=YCE&clear_default=true&per_page=10",
                )
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let cleared: serde_json::Value = serde_json::from_str(&response_body(cleared).await)
        .expect("cleared list response should be json");
    assert_eq!(cleared["data"]["filters"]["status"], "");
    assert_eq!(cleared["data"]["pagination"]["per_page"], 10);

    let delete = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/api/v1/work-item-saved-views/{saved_view_id}"))
                .header(header::COOKIE, initialized.cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(delete.status(), StatusCode::NO_CONTENT);

    let after_delete = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-item-list-view?item_type=task&project_key=YCE")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let after_delete: serde_json::Value =
        serde_json::from_str(&response_body(after_delete).await).expect("response should be json");
    assert_eq!(after_delete["data"]["saved_views"], serde_json::json!([]));
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
async fn api_v1_can_follow_project_status_lifecycle_to_archive_and_restore() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let acceptance_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/projects/YCE")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"status":"acceptance","start_date":"2026-07-01","due_date":"2026-09-30"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(acceptance_response.status(), StatusCode::OK);
    let acceptance_body = response_body(acceptance_response).await;
    assert!(acceptance_body.contains("\"status\":\"acceptance\""));

    let completed_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/projects/YCE")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"status":"completed"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(completed_response.status(), StatusCode::OK);
    let completed_body = response_body(completed_response).await;
    assert!(completed_body.contains("\"status\":\"completed\""));

    let archive_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/v1/projects/YCE")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"status":"archived"}"#))
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
                .body(Body::from(r#"{"status":"in_progress"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(restore_response.status(), StatusCode::OK);
    let restore_body = response_body(restore_response).await;
    assert!(restore_body.contains("\"status\":\"in_progress\""));

    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    assert_eq!(project.status, "in_progress");
    assert_eq!(project.start_date, "2026-07-01");
    assert_eq!(project.due_date, "2026-09-30");
}

#[tokio::test]
async fn api_v1_rejects_invalid_project_status_transition() {
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
                .uri("/api/v1/projects/YCE")
                .header(header::COOKIE, initialized.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"status":"archived"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = response_body(response).await;
    assert!(body.contains("项目状态不能从 进行中 切换到 已归档"));

    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    assert_eq!(project.status, "in_progress");
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
                .body(Body::from(r#"{"name":"未登录写入"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(mutation_response.status(), StatusCode::UNAUTHORIZED);
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
async fn web_project_member_without_work_item_manage_can_create_bug_with_assignee() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    rbac::create_role(&pool, "work_view_only", "工作项只读入口", "self")
        .await
        .expect("role should create");
    rbac::replace_role_permissions(
        &pool,
        "work_view_only",
        &["project.view".to_string(), "work_item.view".to_string()],
    )
    .await
    .expect("role permissions should replace");
    let reporter =
        create_user_with_role(&pool, "bug_reporter", "缺陷报告人", "work_view_only").await;
    let assignee = create_user_with_role(&pool, "bug_owner", "缺陷负责人", "work_view_only").await;
    projects::add_project_member(&pool, initialized.user_id, "YCE", "bug_reporter", "member")
        .await
        .expect("reporter should join YCE");
    projects::add_project_member(&pool, initialized.user_id, "YCE", "bug_owner", "member")
        .await
        .expect("assignee should join YCE");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items")
                .header(header::COOKIE, with_csrf_cookie(&reporter.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&project_key=YCE&item_type=bug&title=%E6%99%AE%E9%80%9A%E6%88%90%E5%91%98%E6%8F%90%E4%BA%A4+Bug&description=%E5%A4%8D%E7%8E%B0%E6%AD%A5%E9%AA%A4&priority=P1&assignee_username=bug_owner",
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
        location.starts_with("/web/work-items/YCE-BUG-"),
        "unexpected redirect: {location}"
    );

    let item_key = location.trim_start_matches("/web/work-items/").to_string();
    let item = projects::get_work_item_detail(&pool, &item_key)
        .await
        .expect("work item should load")
        .expect("work item should exist");
    assert_eq!(item.item_type, "bug");
    assert_eq!(item.title, "普通成员提交 Bug");
    assert_eq!(item.assignee_username, "bug_owner");
    assert_eq!(item.assignee_display_name, "缺陷负责人");
    assert_ne!(reporter.user_id, assignee.user_id);
}

#[tokio::test]
async fn web_work_item_only_member_can_see_bug_create_button() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    rbac::create_role(&pool, "work_item_only", "仅工作项入口", "self")
        .await
        .expect("role should create");
    rbac::replace_role_permissions(&pool, "work_item_only", &["work_item.view".to_string()])
        .await
        .expect("role permissions should replace");
    let user = create_user_with_role(&pool, "bug_submitter", "Bug 提交人", "work_item_only").await;
    projects::add_project_member(&pool, initialized.user_id, "YCE", "bug_submitter", "member")
        .await
        .expect("user should join YCE");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/bugs")
                .header(header::COOKIE, user.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    assert!(body.contains("当前项目：YCE · 元策 MVP"));
    assert!(body.contains(r#"data-modal-open="work-item-create-modal""#));
    assert!(body.contains(r#"id="work-item-create-modal""#));
    assert!(body.contains("新建 Bug"));
    assert!(body.contains(r#"name="item_type" value="bug""#));
    assert!(body.contains(r#"data-bug-report-form"#));
}

#[tokio::test]
async fn web_all_scope_system_admin_can_see_bug_create_button_without_project_membership() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let user = create_user_with_role(&pool, "system_operator", "系统运营", "system_admin").await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/bugs")
                .header(header::COOKIE, user.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    assert!(body.contains("当前项目：YCE · 元策 MVP"));
    assert!(body.contains(r#"data-modal-open="work-item-create-modal""#));
    assert!(body.contains("新建 Bug"));
    assert!(body.contains(r#"name="item_type" value="bug""#));
}

#[tokio::test]
async fn api_all_scope_system_admin_can_create_bug_without_project_membership() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let user =
        create_user_with_role(&pool, "api_system_operator", "API 系统运营", "system_admin").await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items")
                .header(header::COOKIE, user.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"project_key":"YCE","item_type":"bug","title":"全局角色提交 Bug","description":"非项目成员但具备全局数据范围","priority":"P2"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::CREATED);
    let body = response_body(response).await;
    assert!(body.contains(r#""key":"YCE-BUG-"#));
    assert!(body.contains(r#""title":"全局角色提交 Bug""#));
    assert!(body.contains(r#""assignee_username":"api_system_operator""#));
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
        .clone()
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
    assert_eq!(
        status_response.headers().get(header::LOCATION).unwrap(),
        "/web/work-items/YCE-TASK-2#discussion-title"
    );
    assert_eq!(comment_response.status(), StatusCode::SEE_OTHER);

    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    let comments = projects::list_work_item_comments(&pool, item.id)
        .await
        .expect("comments should load");

    assert_eq!(item.status, "done");
    let created_comment = comments
        .iter()
        .find(|comment| comment.body == "这条评论用于验证闭环")
        .expect("created web comment should exist");
    let created_comment_id = created_comment.id;
    assert_eq!(
        comment_response.headers().get(header::LOCATION).unwrap(),
        format!("/web/work-items/YCE-TASK-2#comment-{created_comment_id}").as_str()
    );

    let reply_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items/YCE-TASK-2/comments")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(format!(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&body=%E8%BF%99%E6%98%AF%E7%BD%91%E9%A1%B5%E5%9B%9E%E5%A4%8D&parent_comment_id={}",
                    created_comment_id
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(reply_response.status(), StatusCode::SEE_OTHER);
    let comments = projects::list_work_item_comments(&pool, item.id)
        .await
        .expect("comments should reload");
    let reply = comments
        .iter()
        .find(|comment| comment.body == "这是网页回复")
        .expect("web reply should exist");
    assert_eq!(reply.parent_comment_id, Some(created_comment_id));
    assert_eq!(
        reply_response.headers().get(header::LOCATION).unwrap(),
        format!("/web/work-items/YCE-TASK-2#comment-{}", reply.id).as_str()
    );
}

#[tokio::test]
async fn web_work_item_handoff_returns_to_discussion_context() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    create_regular_user(&pool, "handoff_target", "流转目标").await;
    projects::add_project_member(
        &pool,
        initialized.user_id,
        "YCE",
        "handoff_target",
        "member",
    )
    .await
    .expect("member should be added");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items/YCE-TASK-2/handoff")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&status=in_progress&assignee_username=handoff_target&body=%E8%AF%B7%E7%BB%A7%E7%BB%AD%E5%A4%84%E7%90%86%EF%BC%9B%E5%A4%84%E7%90%86%E4%BA%BA%EF%BC%9A%E4%BC%AA%E9%80%A0+A+%E2%86%92+%E4%BC%AA%E9%80%A0+B",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/work-items/YCE-TASK-2#discussion-title"
    );

    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    assert_eq!(item.assignee_username, "handoff_target");

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
    let detail_body = response_body(detail_response).await;
    assert!(detail_body.contains("系统管理员 → 流转目标"));
    assert!(detail_body.contains("流转目标"));
    assert!(detail_body.contains("请继续处理；处理人：伪造 A → 伪造 B"));
    assert!(!detail_body.contains("指派：伪造 A → 伪造 B"));
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
    assert_eq!(invalid_close_response.status(), StatusCode::OK);

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
    assert!(open_body.contains("重新打开"));
    assert!(open_body.contains(r#"data-success-message="任务已重新打开。""#));
    assert!(!open_body.contains("取消工作项"));
    assert!(open_body.contains(r#"name="status" value="in_progress""#));

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
    assert_eq!(progress_page.status(), StatusCode::OK);
    let progress_body = response_body(progress_page).await;
    assert!(progress_body.contains("指派 / 流转"));
    assert!(progress_body.contains("查看操作记录"));
    assert!(progress_body.contains("发表新评论"));
    assert!(progress_body.contains("关闭任务"));
    assert!(progress_body.contains(r#"data-success-message="任务已关闭。""#));
    assert!(progress_body.contains(r#"data-success-message="任务已保存。""#));
    assert!(progress_body.contains(r#"data-success-message="指派已更新。""#));
    assert!(progress_body.contains("发表并指派"));
    assert!(
        progress_body
            .contains(r#"data-discussion-assign-status data-select-panel-min-width="208""#)
    );
    assert!(!progress_body.contains(r#"value="resolved"#));
    assert!(!progress_body.contains(r#"value="verified"#));
    assert!(!progress_body.contains("取消工作项"));
    assert!(!progress_body.contains("查看指派记录"));

    sqlx::query("UPDATE work_items SET status = 'cancelled' WHERE item_key = 'OPS-TASK-1'")
        .execute(&pool)
        .await
        .expect("legacy cancelled item should be shaped");
    let cancelled_page = app
        .oneshot(
            Request::builder()
                .uri("/web/work-items/OPS-TASK-1")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(cancelled_page.status(), StatusCode::OK);
    let cancelled_body = response_body(cancelled_page).await;
    assert!(cancelled_body.contains("重新打开"));
    assert!(cancelled_body.contains(r#"<option value="in_progress" selected"#));
    assert!(!cancelled_body.contains(r#"<option value="cancelled""#));
}

#[tokio::test]
async fn web_work_item_only_current_assignee_can_close_but_members_can_reopen() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let assignee = create_regular_user(&pool, "close_owner", "当前处理人").await;
    let member = create_regular_user(&pool, "reopen_member", "协作成员").await;
    projects::add_project_member(&pool, initialized.user_id, "YCE", "close_owner", "member")
        .await
        .expect("assignee should join project");
    projects::add_project_member(&pool, initialized.user_id, "YCE", "reopen_member", "member")
        .await
        .expect("member should join project");
    let created = projects::create_work_item(
        &pool,
        initialized.user_id,
        projects::CreateWorkItemInput {
            project_key: "YCE".to_string(),
            item_type: "task".to_string(),
            title: "仅处理人可关闭".to_string(),
            description: "验证关闭与重新打开权限".to_string(),
            priority: "P2".to_string(),
            assignee_username: "close_owner".to_string(),
            due_date: String::new(),
            parent_item_key: String::new(),
            actor_display_name_snapshot: String::new(),
        },
    )
    .await
    .expect("work item should create");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let admin_detail = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/web/work-items/{}", created.item_key))
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(admin_detail.status(), StatusCode::OK);
    let admin_body = response_body(admin_detail).await;
    assert!(!admin_body.contains("关闭任务"));

    let assignee_detail = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/web/work-items/{}", created.item_key))
                .header(header::COOKIE, assignee.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(assignee_detail.status(), StatusCode::OK);
    let assignee_body = response_body(assignee_detail).await;
    assert!(assignee_body.contains("关闭任务"));

    let close_forbidden = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/web/work-items/{}/status", created.item_key))
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&status=closed",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(close_forbidden.status(), StatusCode::FORBIDDEN);

    let close_success = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/web/work-items/{}/status", created.item_key))
                .header(header::COOKIE, with_csrf_cookie(&assignee.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&status=closed",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(close_success.status(), StatusCode::SEE_OTHER);

    let member_detail = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/web/work-items/{}", created.item_key))
                .header(header::COOKIE, member.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(member_detail.status(), StatusCode::OK);
    let member_body = response_body(member_detail).await;
    assert!(member_body.contains("重新打开"));

    let reopen_success = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/web/work-items/{}/status", created.item_key))
                .header(header::COOKIE, with_csrf_cookie(&member.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&status=in_progress",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(reopen_success.status(), StatusCode::SEE_OTHER);

    let item = projects::get_work_item_detail(&pool, &created.item_key)
        .await
        .expect("item should reload")
        .expect("item should exist");
    assert_eq!(item.status, "in_progress");
}

#[tokio::test]
async fn web_work_item_operation_history_includes_edit_close_and_reopen_records() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let edit_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items/YCE-TASK-2/edit")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&title=Edited+Task&description=Edited+description&status=in_progress&priority=P1&assignee_username=admin&due_date=&parent_item_key=YCE-REQ-1",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(edit_response.status(), StatusCode::SEE_OTHER);

    let close_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items/YCE-TASK-2/status")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&status=closed",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(close_response.status(), StatusCode::SEE_OTHER);

    let reopen_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items/YCE-TASK-2/status")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&status=in_progress",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(reopen_response.status(), StatusCode::SEE_OTHER);

    let history_response = app
        .oneshot(
            Request::builder()
                .uri("/web/work-items/YCE-TASK-2/flow-records")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(history_response.status(), StatusCode::OK);
    let history_body = response_body(history_response).await;

    assert!(history_body.contains("编辑"));
    assert!(history_body.contains("关闭"));
    assert!(history_body.contains("重新打开"));
    assert!(history_body.contains("作者编辑了主帖内容"));
    assert!(history_body.contains("进行中 → 已关闭"));
    assert!(history_body.contains("已关闭 → 进行中"));
}

#[tokio::test]
async fn web_work_item_detail_allows_comment_edit_but_not_delete() {
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
    let foreign_comment_id =
        projects::add_work_item_comment(&pool, member.user_id, "YCE-TASK-2", "foreign comment")
            .await
            .expect("member comment should create")
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
    assert_eq!(member_delete_response.status(), StatusCode::NOT_FOUND);

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
    assert_eq!(maintainer_edit_response.status(), StatusCode::FORBIDDEN);

    let unchanged_after_maintainer = projects::get_work_item_comment(&pool, item.id, comment_id)
        .await
        .expect("comment should load");
    assert_eq!(unchanged_after_maintainer.body, "待编辑评论");

    let admin_foreign_edit_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/web/work-items/YCE-TASK-2/comments/{foreign_comment_id}/edit"
                ))
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&body=admin+cannot+edit+others",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(admin_foreign_edit_response.status(), StatusCode::FORBIDDEN);
    let unchanged_foreign_comment =
        projects::get_work_item_comment(&pool, item.id, foreign_comment_id)
            .await
            .expect("foreign comment should load");
    assert_eq!(unchanged_foreign_comment.body, "foreign comment");

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
    assert_eq!(
        edit_response.headers().get(header::LOCATION).unwrap(),
        format!("/web/work-items/YCE-TASK-2#comment-{comment_id}").as_str()
    );

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
    assert!(detail_body.contains("编辑发表内容"));
    assert!(detail_body.contains(r#"data-success-message="评论已更新。""#));
    assert!(!detail_body.contains("删除评论"));
    assert!(!detail_body.contains(&format!(
        "work-item-comment-edit-modal-{foreign_comment_id}"
    )));

    let delete_response = app
        .clone()
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
    assert_eq!(delete_response.status(), StatusCode::NOT_FOUND);
    assert!(comments.iter().any(|comment| comment.id == comment_id));
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
async fn web_work_item_primary_post_only_author_can_edit() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let member = create_regular_user(&pool, "post_author", "主帖作者").await;
    create_regular_user(&pool, "post_editor", "编辑成员").await;
    projects::add_project_member(&pool, initialized.user_id, "YCE", "post_author", "member")
        .await
        .expect("author should be added");
    projects::add_project_member(&pool, initialized.user_id, "YCE", "post_editor", "member")
        .await
        .expect("editor should be added");
    let created = projects::create_work_item(
        &pool,
        member.user_id,
        projects::CreateWorkItemInput {
            project_key: "YCE".to_string(),
            item_type: "task".to_string(),
            title: "成员发布的工作项".to_string(),
            description: "只有发布人本人可以修改".to_string(),
            priority: "P2".to_string(),
            assignee_username: "post_editor".to_string(),
            due_date: String::new(),
            parent_item_key: String::new(),
            actor_display_name_snapshot: String::new(),
        },
    )
    .await
    .expect("work item should create");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let detail_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/web/work-items/{}", created.item_key))
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(detail_response.status(), StatusCode::OK);
    let detail_body = response_body(detail_response).await;
    assert!(!detail_body.contains(r#"data-modal-open="work-item-edit-modal""#));
    assert!(!detail_body.contains(r#"id="work-item-edit-modal""#));
    assert!(detail_body.contains("发布人"));
    assert!(detail_body.contains("主帖作者"));

    let edit_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/web/work-items/{}/edit", created.item_key))
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&title=Admin+Edited&description=forbidden&status=in_progress&priority=P1&assignee_username=post_editor&due_date=&parent_item_key=",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(edit_response.status(), StatusCode::FORBIDDEN);

    let reloaded = projects::get_work_item_detail(&pool, &created.item_key)
        .await
        .expect("work item should reload")
        .expect("work item should exist");
    assert_eq!(reloaded.title, "成员发布的工作项");
    assert_eq!(reloaded.description, "只有发布人本人可以修改");
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
        "/web/work-items/YCE-TASK-2#legacy-attachments"
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
    assert!(body.contains("已有附件"));
    assert!(body.contains("待上传"));
    assert!(body.contains(r#"data-discussion-form"#));
    assert!(!body.contains(r#"data-confirm-title="归档工作项附件""#));
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
        format!("/web/work-items/YCE-TASK-2#comment-{}", comment.id).as_str()
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

    assert!(body.contains(r#"data-placeholder="请输入内容...""#));
    assert!(body.contains("comment-log.txt"));
    assert!(body.contains(r#"data-rich-text-editor"#));
    assert!(!body.contains(r#"data-discussion-files"#));
    assert!(!body.contains("删除评论附件"));
}

#[tokio::test]
async fn web_detail_renders_uploaded_raster_attachments_as_image_previews() {
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

    let project_image = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            folder_id: None,
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "roadmap.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 512,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记项目附件 roadmap.png".to_string()),
        },
    )
    .await
    .expect("project image should create");
    files::mark_attachment_uploaded(&pool, project_image.id, "project", project.id)
        .await
        .expect("project image should upload");

    let work_item_image = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "failure.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 512,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记工作项附件 failure.png".to_string()),
        },
    )
    .await
    .expect("work item image should create");
    files::mark_attachment_uploaded(&pool, work_item_image.id, "work_item", item.id)
        .await
        .expect("work item image should upload");

    let comment_image = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            folder_id: None,
            target_type: "comment".to_string(),
            target_id: comment.id,
            project_id: Some(project.id),
            original_filename: "stacktrace.jpeg".to_string(),
            content_type: "image/jpeg".to_string(),
            byte_size: 512,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记评论附件 stacktrace.jpeg".to_string()),
        },
    )
    .await
    .expect("comment image should create");
    files::mark_attachment_uploaded(&pool, comment_image.id, "comment", comment.id)
        .await
        .expect("comment image should upload");

    let vector_attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "diagram.svg".to_string(),
            content_type: "image/svg+xml".to_string(),
            byte_size: 512,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记工作项附件 diagram.svg".to_string()),
        },
    )
    .await
    .expect("vector attachment should create");
    files::mark_attachment_uploaded(&pool, vector_attachment.id, "work_item", item.id)
        .await
        .expect("vector attachment should upload");

    let pdf_attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "report.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 512,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记工作项附件 report.pdf".to_string()),
        },
    )
    .await
    .expect("pdf attachment should create");
    files::mark_attachment_uploaded(&pool, pdf_attachment.id, "work_item", item.id)
        .await
        .expect("pdf attachment should upload");

    let deleted_image = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "deleted-preview.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 512,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记工作项附件 deleted-preview.png".to_string()),
        },
    )
    .await
    .expect("deleted image should create");
    files::mark_attachment_uploaded(&pool, deleted_image.id, "work_item", item.id)
        .await
        .expect("deleted image should upload");
    files::archive_attachment(
        &pool,
        deleted_image.id,
        "work_item",
        item.id,
        initialized.user_id,
        "",
        Some(project.id),
        Some("归档工作项附件 deleted-preview.png"),
    )
    .await
    .expect("deleted image should archive");

    let pending_image = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "pending.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 512,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记工作项附件 pending.png".to_string()),
        },
    )
    .await
    .expect("pending image should create");

    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let work_item_response = app
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
    let work_item_body = response_body(work_item_response).await;
    assert!(work_item_body.contains(&format!(
        r#"data-image-source="/web/work-items/YCE-TASK-2/attachments/{}/download""#,
        work_item_image.id
    )));
    assert!(work_item_body.contains(&format!(
        r#"data-image-source="/web/work-items/YCE-TASK-2/comments/{}/attachments/{}/download""#,
        comment.id, comment_image.id
    )));
    assert!(work_item_body.contains(r#"data-image-gallery="work-item-media-YCE-TASK-2""#));
    assert!(!work_item_body.contains(&format!(
        r#"data-image-source="/web/work-items/YCE-TASK-2/attachments/{}/download""#,
        vector_attachment.id
    )));
    assert!(!work_item_body.contains(&format!(
        r#"data-image-source="/web/work-items/YCE-TASK-2/attachments/{}/download""#,
        pdf_attachment.id
    )));
    assert!(!work_item_body.contains(&format!(
        r#"data-image-source="/web/work-items/YCE-TASK-2/attachments/{}/download""#,
        deleted_image.id
    )));
    assert!(!work_item_body.contains(&format!(
        r#"data-image-source="/web/work-items/YCE-TASK-2/attachments/{}/download""#,
        pending_image.id
    )));

    let project_response = app
        .oneshot(
            Request::builder()
                .uri("/web/projects/YCE")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let project_body = response_body(project_response).await;
    assert!(!project_body.contains(&format!(
        r#"data-image-source="/web/projects/YCE/attachments/{}/download""#,
        project_image.id
    )));
    assert!(!project_body.contains(r#"data-image-gallery="project-media-YCE""#));
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
    let attachment_only_body = format!(
        r#"<a data-yuance-attachment-id="{attachment_id}" data-yuance-attachment-kind="file" href="/web/work-items/YCE-TASK-2/comments/{}/attachments/{attachment_id}/download" title="api-comment-log.txt">api-comment-log.txt</a>"#,
        comment.id
    );
    projects::update_work_item_comment_with_format(
        &pool,
        initialized.user_id,
        true,
        "YCE-TASK-2",
        comment.id,
        &attachment_only_body,
        "html",
    )
    .await
    .expect("attachment-only body should persist");
    let empty_body_delete_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{}/attachments/{}",
                    comment.id, attachment_id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .header("x-yuance-editor-context", "work-item-comment-edit")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(empty_body_delete_response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        files::get_attachment(&pool, attachment_id)
            .await
            .expect("rejected deletion should preserve attachment")
            .status,
        "uploaded"
    );
    assert!(
        storage::read_test_memory_object(&pool, &test_settings(), &attachments[0].object_key)
            .await
            .expect("test object should read")
            .is_some()
    );
    let inline_body = format!(
        r#"<p>保留正文</p><a data-yuance-attachment-id="{attachment_id}" data-yuance-attachment-kind="file" href="/web/work-items/YCE-TASK-2/comments/{}/attachments/{attachment_id}/download" title="api-comment-log.txt">api-comment-log.txt</a>"#,
        comment.id
    );
    projects::update_work_item_comment_with_format(
        &pool,
        initialized.user_id,
        true,
        "YCE-TASK-2",
        comment.id,
        &inline_body,
        "html",
    )
    .await
    .expect("inline attachment reference should persist");

    let delete_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{}/attachments/{}",
                    comment.id, attachment_id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(delete_response.status(), StatusCode::BAD_REQUEST);
    let preserved = files::get_attachment(&pool, attachment_id)
        .await
        .expect("attachment should remain");
    assert_eq!(preserved.status, "uploaded");

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
                .header("x-yuance-editor-context", "work-item-comment-edit")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(delete_response.status(), StatusCode::OK);
    assert!(
        response_body(delete_response)
            .await
            .contains(r#""status":"deleted""#)
    );
    assert_eq!(
        files::get_attachment(&pool, attachment_id)
            .await
            .expect("attachment should remain auditable")
            .status,
        "deleted"
    );
    assert!(
        storage::read_test_memory_object(&pool, &test_settings(), &attachments[0].object_key)
            .await
            .expect("test object should read")
            .is_none()
    );
    let updated_comment = projects::get_work_item_comment(&pool, item.id, comment.id)
        .await
        .expect("comment should remain");
    assert!(updated_comment.body.contains("保留正文"));
    assert!(
        !updated_comment
            .body
            .contains(&format!("data-yuance-attachment-id=\"{attachment_id}\""))
    );
}

#[tokio::test]
async fn api_v1_can_delete_draft_comment_attachment_and_cleanup_object() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_memory_storage_config(&pool, initialized.user_id).await;
    let draft = projects::create_work_item_comment_draft(
        &pool,
        initialized.user_id,
        "YCE-TASK-2",
        None,
        "",
    )
    .await
    .expect("draft should create");
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
            folder_id: None,
            target_type: "comment".to_string(),
            target_id: draft.id,
            project_id: Some(project.id),
            original_filename: "draft-image.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 1024,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: None,
        },
    )
    .await
    .expect("attachment should create");
    write_test_object(&pool, &attachment)
        .await
        .expect("test object should write");
    files::mark_attachment_uploaded(&pool, attachment.id, "comment", draft.id)
        .await
        .expect("attachment should upload");

    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let delete_response = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!(
                    "/api/v1/work-items/{}/comments/{}/attachments/{}",
                    item.item_key, draft.id, attachment.id
                ))
                .header(header::COOKIE, initialized.cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(delete_response.status(), StatusCode::OK);
    assert!(
        response_body(delete_response)
            .await
            .contains(r#""status":"deleted""#)
    );
    assert_eq!(
        files::get_attachment(&pool, attachment.id)
            .await
            .expect("attachment should load")
            .status,
        "deleted"
    );
    assert!(
        storage::read_test_memory_object(&pool, &test_settings(), &attachment.object_key)
            .await
            .expect("test object should read")
            .is_none()
    );
}

#[tokio::test]
async fn api_v1_can_cancel_own_comment_draft_and_cleanup_all_attachments() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_memory_storage_config(&pool, initialized.user_id).await;
    let draft = projects::create_work_item_comment_draft(
        &pool,
        initialized.user_id,
        "YCE-TASK-2",
        None,
        "",
    )
    .await
    .expect("draft should create");
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
            folder_id: None,
            target_type: "comment".to_string(),
            target_id: draft.id,
            project_id: Some(project.id),
            original_filename: "cancelled-draft.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 1024,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: None,
        },
    )
    .await
    .expect("attachment should create");
    write_test_object(&pool, &attachment)
        .await
        .expect("test object should write");
    files::mark_attachment_uploaded(&pool, attachment.id, "comment", draft.id)
        .await
        .expect("attachment should upload");

    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let response = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{}/draft",
                    draft.id
                ))
                .header(header::COOKIE, initialized.cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::OK);
    assert!(response_body(response).await.contains(r#""is_draft":true"#));
    let work_item_id =
        sqlx::query_scalar::<_, i64>("SELECT id FROM work_items WHERE item_key = 'YCE-TASK-2'")
            .fetch_one(&pool)
            .await
            .expect("work item id should load");
    assert!(
        projects::get_work_item_comment_including_drafts(&pool, work_item_id, draft.id,)
            .await
            .is_err()
    );
    assert_eq!(
        files::get_attachment(&pool, attachment.id)
            .await
            .expect("attachment should load")
            .status,
        "deleted"
    );
    assert!(
        storage::read_test_memory_object(&pool, &test_settings(), &attachment.object_key)
            .await
            .expect("test object should read")
            .is_none()
    );
}

#[tokio::test]
async fn api_v1_can_delete_project_resource_attachment_and_cleanup_object() {
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
    let resource = project_resources::create_resource(
        &pool,
        initialized.user_id,
        project_resources::CreateProjectResourceInput {
            project_id: project.id,
            title: "资源附件删除".to_string(),
            category: "other".to_string(),
            body: String::new(),
            body_format: "html".to_string(),
            access_password: String::new(),
            tags: Vec::new(),
            related_work_item_key: String::new(),
            related_cycle_id: None,
            actor_display_name_snapshot: String::new(),
        },
    )
    .await
    .expect("resource should create");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    let attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            folder_id: None,
            target_type: "project_resource".to_string(),
            target_id: resource.id,
            project_id: Some(project.id),
            original_filename: "resource-image.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 2048,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: None,
        },
    )
    .await
    .expect("attachment should create");
    write_test_object(&pool, &attachment)
        .await
        .expect("test object should write");
    files::mark_attachment_uploaded(&pool, attachment.id, "project_resource", resource.id)
        .await
        .expect("attachment should upload");

    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let delete_response = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!(
                    "/api/v1/projects/YCE/resources/{}/attachments/{}",
                    resource.id, attachment.id
                ))
                .header(header::COOKIE, initialized.cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(delete_response.status(), StatusCode::OK);
    assert!(
        response_body(delete_response)
            .await
            .contains(r#""status":"deleted""#)
    );
    assert_eq!(
        files::get_attachment(&pool, attachment.id)
            .await
            .expect("attachment should load")
            .status,
        "deleted"
    );
    assert!(
        storage::read_test_memory_object(&pool, &test_settings(), &attachment.object_key)
            .await
            .expect("test object should read")
            .is_none()
    );
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
            folder_id: None,
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "rbac-project.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 128,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
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
            folder_id: None,
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "api-project-download.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 128,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记项目附件 api-project-download.pdf".to_string()),
        },
    )
    .await
    .expect("project attachment should create");
    let work_item_attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "api-work-download.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 256,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记工作项附件 api-work-download.png".to_string()),
        },
    )
    .await
    .expect("work item attachment should create");
    let comment_attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            folder_id: None,
            target_type: "comment".to_string(),
            target_id: comment.id,
            project_id: Some(project.id),
            original_filename: "api-comment-download.txt".to_string(),
            content_type: "text/plain".to_string(),
            byte_size: 64,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
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
            folder_id: None,
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "api-roadmap.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 2048,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
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
    assert!(upload_url.contains("&grant="));

    let direct_upload_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(upload_url)
                .header(header::CONTENT_TYPE, "application/pdf")
                .header(header::COOKIE, initialized.cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
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

    let download_url_response = app
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
    assert_eq!(download_url_response.status(), StatusCode::OK);
    let download_url_body = response_body(download_url_response).await;
    let download_url_payload: serde_json::Value =
        serde_json::from_str(&download_url_body).expect("download url response should be json");
    let download_url = download_url_payload["data"]["request"]["url"]
        .as_str()
        .expect("download url should be present");
    assert!(download_url.starts_with("/api/v1/test-storage/download?object_key="));
    assert!(download_url.contains("&grant="));

    let direct_download_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(download_url)
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(direct_download_response.status(), StatusCode::OK);
    assert_eq!(
        direct_download_response
            .headers()
            .get(header::CONTENT_TYPE)
            .unwrap(),
        "application/pdf"
    );
    assert_eq!(
        direct_download_response
            .headers()
            .get(header::X_CONTENT_TYPE_OPTIONS)
            .unwrap(),
        "nosniff"
    );
    assert_eq!(
        response_bytes(direct_download_response).await,
        vec![b'a'; 2048]
    );

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
async fn api_test_storage_upload_endpoint_requires_valid_bound_grant() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let encoded_object_key = "browser-smoke%2Fguard.txt";
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let unauthorized_response = app
        .clone()
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
    assert_eq!(unauthorized_response.status(), StatusCode::FORBIDDEN);

    let missing_csrf_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!(
                    "/api/v1/test-storage/upload?object_key={encoded_object_key}"
                ))
                .header(header::CONTENT_TYPE, "text/plain")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::from("guard"))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(missing_csrf_response.status(), StatusCode::FORBIDDEN);

    let invalid_grant_response = app
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!(
                    "/api/v1/test-storage/upload?object_key={encoded_object_key}"
                ))
                .header(header::CONTENT_TYPE, "text/plain")
                .header(header::COOKIE, initialized.cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from("guard"))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(invalid_grant_response.status(), StatusCode::FORBIDDEN);
    let body = response_body(invalid_grant_response).await;
    assert!(body.contains("测试对象存储上传授权无效或已过期"));
}

#[tokio::test]
async fn api_test_storage_download_endpoint_requires_valid_bound_grant() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let encoded_object_key = "browser-smoke%2Fguard.txt";
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let unauthorized_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/test-storage/download?object_key={encoded_object_key}"
                ))
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(unauthorized_response.status(), StatusCode::FORBIDDEN);

    let invalid_grant_response = app
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/test-storage/download?object_key={encoded_object_key}"
                ))
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(invalid_grant_response.status(), StatusCode::FORBIDDEN);
    let body = response_body(invalid_grant_response).await;
    assert!(body.contains("测试对象存储下载授权无效或已过期"));
}

#[tokio::test]
async fn api_test_storage_upload_grant_does_not_require_ambient_user_credentials() {
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
            folder_id: None,
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "bound-grant.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 1,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记项目附件 bound-grant.png".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let signing_response = app
        .clone()
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
    assert_eq!(signing_response.status(), StatusCode::OK);
    let signing_body = response_body(signing_response).await;
    let signing_payload: serde_json::Value =
        serde_json::from_str(&signing_body).expect("upload url response should be json");
    let upload_url = signing_payload["data"]["request"]["url"]
        .as_str()
        .expect("upload url should be present");

    let upload_response = app
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(upload_url)
                .header(header::CONTENT_TYPE, "image/png")
                .body(Body::from(vec![0_u8]))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(upload_response.status(), StatusCode::NO_CONTENT);
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
            folder_id: None,
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "signed-upload.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 2048,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
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
            folder_id: None,
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "missing-object.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 2048,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
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
            folder_id: None,
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "wrong-size.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 2048,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
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
            folder_id: None,
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "wrong-content-type.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 2048,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
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

    let video_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects/YCE/attachments")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"original_filename":"demo.mp4","content_type":"video/mp4","byte_size":2048}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(video_response.status(), StatusCode::CREATED);
    let video_body = response_body(video_response).await;
    assert!(video_body.contains(r#""content_type":"video/mp4""#));

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
async fn api_v1_project_file_folders_manage_upload_and_move_scope() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_active_storage_config(&pool, initialized.user_id).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let folder_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects/YCE/folders")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"name":"设计文档","description":"项目文件分类"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(folder_response.status(), StatusCode::CREATED);
    let folder_payload: serde_json::Value =
        serde_json::from_str(&response_body(folder_response).await).expect("json should parse");
    let folder_id = folder_payload["data"]["id"]
        .as_i64()
        .expect("folder id should exist");

    let duplicate_folder_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects/YCE/folders")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"name":"设计文档","description":"重复文件夹"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(duplicate_folder_response.status(), StatusCode::CONFLICT);
    let duplicate_body = response_body(duplicate_folder_response).await;
    assert!(duplicate_body.contains("同级文件夹名称已存在"));

    let sibling_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects/YCE/folders")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"name":"研发文档","description":""}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(sibling_response.status(), StatusCode::CREATED);
    let sibling_payload: serde_json::Value =
        serde_json::from_str(&response_body(sibling_response).await).expect("json should parse");
    let sibling_folder_id = sibling_payload["data"]["id"]
        .as_i64()
        .expect("sibling folder id should exist");

    let duplicate_update_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/v1/folders/{sibling_folder_id}"))
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"name":"设计文档"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(duplicate_update_response.status(), StatusCode::CONFLICT);
    let duplicate_update_body = response_body(duplicate_update_response).await;
    assert!(duplicate_update_body.contains("同级文件夹名称已存在"));

    let child_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects/YCE/folders")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(format!(
                    r#"{{"parent_id":{folder_id},"name":"终稿","description":""}}"#
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(child_response.status(), StatusCode::CREATED);
    let child_payload: serde_json::Value =
        serde_json::from_str(&response_body(child_response).await).expect("json should parse");
    let child_folder_id = child_payload["data"]["id"]
        .as_i64()
        .expect("child folder id should exist");

    let tree_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/projects/YCE/folders/tree")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(tree_response.status(), StatusCode::OK);
    let tree_body = response_body(tree_response).await;
    assert!(tree_body.contains("设计文档"));
    assert!(tree_body.contains("终稿"));

    let create_attachment_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects/YCE/attachments")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(format!(
                    r#"{{"original_filename":"spec.pdf","content_type":"application/pdf","byte_size":2048,"folder_id":{folder_id}}}"#
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(create_attachment_response.status(), StatusCode::CREATED);
    let attachment_payload: serde_json::Value =
        serde_json::from_str(&response_body(create_attachment_response).await)
            .expect("json should parse");
    let file_object_id = attachment_payload["data"]["file_object_id"]
        .as_i64()
        .expect("file object id should exist");
    assert_eq!(
        files::get_file_object(&pool, file_object_id)
            .await
            .expect("file object should load")
            .folder_id,
        Some(folder_id)
    );

    let ops = projects::get_project_detail(&pool, "OPS")
        .await
        .expect("ops project should load")
        .expect("ops project should exist");
    let ops_folder = files::create_folder(
        &pool,
        files::CreateFolderInput {
            parent_id: None,
            project_id: ops.id,
            name: "OPS 文件".to_string(),
            description: None,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
        },
    )
    .await
    .expect("ops folder should create");

    let cross_project_attachment_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects/YCE/attachments")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(format!(
                    r#"{{"original_filename":"cross.pdf","content_type":"application/pdf","byte_size":2048,"folder_id":{}}}"#,
                    ops_folder.id
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(
        cross_project_attachment_response.status(),
        StatusCode::BAD_REQUEST
    );

    let move_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/v1/file-objects/{file_object_id}/folder"))
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(format!(r#"{{"folder_id":{child_folder_id}}}"#)))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(move_response.status(), StatusCode::OK);
    assert_eq!(
        files::get_file_object(&pool, file_object_id)
            .await
            .expect("file object should load")
            .folder_id,
        Some(child_folder_id)
    );

    let invalid_move_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/v1/file-objects/{file_object_id}/folder"))
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(format!(r#"{{"folder_id":{}}}"#, ops_folder.id)))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(invalid_move_response.status(), StatusCode::BAD_REQUEST);

    let content_response = app
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/projects/YCE/folders/content?folder_id={child_folder_id}"
                ))
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(content_response.status(), StatusCode::OK);
    let content_body = response_body(content_response).await;
    assert!(content_body.contains("spec.pdf"));
    assert!(content_body.contains(r#""folders":[]"#));
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
            folder_id: None,
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "download-me.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 2048,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
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
async fn api_v1_project_attachment_archive_blocks_later_signed_urls() {
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
            folder_id: None,
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "api-delete.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 2048,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记项目附件 api-delete.pdf".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let archive_response = app
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
    assert_eq!(archive_response.status(), StatusCode::OK);
    let archive_body = response_body(archive_response).await;
    assert!(archive_body.contains("\"status\":\"deleted\""));

    let archived = files::get_attachment(&pool, attachment.id)
        .await
        .expect("attachment should load");
    assert_eq!(archived.status, "deleted");

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
    assert!(download_body.contains("附件已归档，不能生成签名"));

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
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "api-screenshot.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 4096,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
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
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "download-screenshot.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 4096,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
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
async fn web_work_item_attachment_download_serves_test_memory_object() {
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
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "memory-preview.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 13,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记工作项附件 memory-preview.png".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    storage::write_test_memory_object(
        &pool,
        &test_settings(),
        &attachment.object_key,
        "image/png",
        b"preview-bytes".to_vec(),
    )
    .await
    .expect("test object should write");
    files::mark_attachment_uploaded(&pool, attachment.id, "work_item", item.id)
        .await
        .expect("attachment should upload");

    let unsafe_attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "unsafe.html".to_string(),
            content_type: "text/html".to_string(),
            byte_size: 32,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记工作项附件 unsafe.html".to_string()),
        },
    )
    .await
    .expect("unsafe attachment should create");
    storage::write_test_memory_object(
        &pool,
        &test_settings(),
        &unsafe_attachment.object_key,
        "text/html",
        b"<script>alert('unsafe')</script>".to_vec(),
    )
    .await
    .expect("unsafe test object should write");
    files::mark_attachment_uploaded(&pool, unsafe_attachment.id, "work_item", item.id)
        .await
        .expect("unsafe attachment should upload");

    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let unsafe_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/web/work-items/YCE-TASK-2/attachments/{}/download",
                    unsafe_attachment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(unsafe_response.status(), StatusCode::OK);
    assert_eq!(
        unsafe_response.headers().get(header::CONTENT_TYPE).unwrap(),
        "application/octet-stream"
    );
    assert_eq!(
        unsafe_response
            .headers()
            .get(header::CONTENT_DISPOSITION)
            .unwrap(),
        "attachment"
    );
    assert_eq!(
        unsafe_response
            .headers()
            .get(header::X_CONTENT_TYPE_OPTIONS)
            .unwrap(),
        "nosniff"
    );

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

    assert_eq!(download_response.status(), StatusCode::OK);
    assert_eq!(
        download_response
            .headers()
            .get(header::CONTENT_TYPE)
            .unwrap(),
        "image/png"
    );
    assert_eq!(
        download_response
            .headers()
            .get(header::X_CONTENT_TYPE_OPTIONS)
            .unwrap(),
        "nosniff"
    );
    assert_eq!(response_body(download_response).await, "preview-bytes");
}

#[tokio::test]
async fn web_work_item_pdf_preview_content_is_served_as_inline_pdf() {
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
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    let pdf_bytes = minimal_pdf_bytes();
    let attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "inline-preview.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: pdf_bytes.len() as i64,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记工作项附件 inline-preview.pdf".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    let operator = storage::build_operator_from_active_config(&pool, &test_settings())
        .await
        .expect("test storage should build")
        .expect("test storage should exist");
    operator
        .write_with(&attachment.object_key, pdf_bytes.clone())
        .content_type("application/octet-stream")
        .await
        .expect("pdf object should write");
    files::mark_attachment_uploaded(&pool, attachment.id, "work_item", item.id)
        .await
        .expect("attachment should upload");

    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/web/work-items/YCE-TASK-2/attachments/{}/preview/content",
                    attachment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::TEMPORARY_REDIRECT);
    let location = response
        .headers()
        .get(header::LOCATION)
        .expect("preview content should redirect")
        .to_str()
        .expect("location should be ascii")
        .to_string();
    assert!(location.starts_with("/api/v1/test-storage/download?object_key="));
    assert!(location.contains("&grant="));

    let redirected = app
        .oneshot(
            Request::builder()
                .uri(location)
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(redirected.status(), StatusCode::OK);
    assert_eq!(
        redirected.headers().get(header::CONTENT_TYPE).unwrap(),
        "application/pdf"
    );
    assert_eq!(
        redirected
            .headers()
            .get(header::CONTENT_DISPOSITION)
            .unwrap(),
        "inline"
    );
    assert_eq!(
        redirected
            .headers()
            .get(header::X_CONTENT_TYPE_OPTIONS)
            .unwrap(),
        "nosniff"
    );
    assert_eq!(response_bytes(redirected).await, pdf_bytes);
}

#[tokio::test]
async fn web_work_item_preview_page_uses_signed_test_storage_url_for_memory_preview() {
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
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let config = storage::active_config(&pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    let pdf_bytes = minimal_pdf_bytes();
    let attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "signed-preview.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: pdf_bytes.len() as i64,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记工作项附件 signed-preview.pdf".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    storage::write_test_memory_object(
        &pool,
        &test_settings(),
        &attachment.object_key,
        "application/pdf",
        pdf_bytes,
    )
    .await
    .expect("pdf object should write");
    files::mark_attachment_uploaded(&pool, attachment.id, "work_item", item.id)
        .await
        .expect("attachment should upload");

    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let response = app
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/web/work-items/YCE-TASK-2/attachments/{}/preview",
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
    assert!(body.contains("/api/v1/test-storage/download?object_key="));
    assert!(body.contains("grant="));
    assert!(!body.contains("/preview/content"));
}

#[tokio::test]
async fn web_work_item_docx_preview_page_uses_frontend_preview_contract() {
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
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "frontend-preview.docx".to_string(),
            content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                .to_string(),
            byte_size: 2048,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记工作项附件 frontend-preview.docx".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    files::mark_attachment_uploaded(&pool, attachment.id, "work_item", item.id)
        .await
        .expect("attachment should upload");

    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let response = app
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/web/work-items/YCE-TASK-2/attachments/{}/preview",
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
    assert!(body.contains("data-document-preview-root"));
    assert!(body.contains(r#"data-preview-type="docx""#));
    assert!(body.contains("data-preview-url=\""));
    assert!(body.contains("Word预览"));
}

#[tokio::test]
async fn web_work_item_legacy_doc_preview_page_degrades_when_flag_disabled() {
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
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "legacy-preview.doc".to_string(),
            content_type: "application/msword".to_string(),
            byte_size: 1024,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记工作项附件 legacy-preview.doc".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    files::mark_attachment_uploaded(&pool, attachment.id, "work_item", item.id)
        .await
        .expect("attachment should upload");

    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let response = app
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/web/work-items/YCE-TASK-2/attachments/{}/preview",
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
    assert!(body.contains("旧格式实验性预览当前未开启，请下载原文件查看。"));
    assert!(body.contains("实验性预览"));
    assert!(body.contains("下载后查看"));
    assert!(!body.contains("data-document-preview-root"));
    assert!(!body.contains(r#"data-preview-type="legacy-doc""#));
    assert!(!body.contains("data-preview-url=\""));
}

#[tokio::test]
async fn web_work_item_legacy_doc_preview_page_uses_frontend_preview_contract_when_flag_enabled() {
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
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "legacy-preview.doc".to_string(),
            content_type: "application/msword".to_string(),
            byte_size: 1024,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记工作项附件 legacy-preview.doc".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    files::mark_attachment_uploaded(&pool, attachment.id, "work_item", item.id)
        .await
        .expect("attachment should upload");

    let app = build_router(AppState::new(
        test_settings_with_legacy_preview_enabled(),
        Some(pool),
    ));
    let response = app
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/web/work-items/YCE-TASK-2/attachments/{}/preview",
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
    assert!(body.contains("data-document-preview-root"));
    assert!(body.contains(r#"data-preview-type="legacy-doc""#));
    assert!(body.contains(r#"data-preview-experimental="true""#));
    assert!(body.contains("实验性预览"));
    assert!(body.contains("data-preview-url=\""));
}

#[tokio::test]
async fn web_work_item_legacy_ppt_preview_page_requires_feature_flag() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_active_storage_config(&pool, initialized.user_id).await;
    let attachment = create_uploaded_work_item_attachment(
        &pool,
        &initialized,
        "legacy-preview.ppt",
        "application/vnd.ms-powerpoint",
        1536,
    )
    .await;

    let disabled_app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let disabled_response = disabled_app
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/web/work-items/YCE-TASK-2/attachments/{}/preview",
                    attachment.id
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(disabled_response.status(), StatusCode::OK);
    let disabled_body = response_body(disabled_response).await;
    assert!(disabled_body.contains("旧格式实验性预览当前未开启，请下载原文件查看。"));
    assert!(disabled_body.contains("实验性预览"));
    assert!(!disabled_body.contains("data-document-preview-root"));
    assert!(!disabled_body.contains(r#"data-preview-type="legacy-ppt""#));
    assert!(!disabled_body.contains("data-preview-url=\""));

    let enabled_app = build_router(AppState::new(
        test_settings_with_legacy_preview_enabled(),
        Some(pool),
    ));
    let enabled_response = enabled_app
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/web/work-items/YCE-TASK-2/attachments/{}/preview",
                    attachment.id
                ))
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(enabled_response.status(), StatusCode::OK);
    let enabled_body = response_body(enabled_response).await;
    assert!(enabled_body.contains("data-document-preview-root"));
    assert!(enabled_body.contains(r#"data-preview-type="legacy-ppt""#));
    assert!(enabled_body.contains(r#"data-preview-experimental="true""#));
    assert!(enabled_body.contains("实验性预览"));
    assert!(enabled_body.contains("当前运行时会带可见水印"));
    assert!(enabled_body.contains("data-preview-url=\""));
}

#[tokio::test]
async fn web_work_item_detail_hides_legacy_doc_preview_button_by_default() {
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
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "legacy-hidden.doc".to_string(),
            content_type: "application/msword".to_string(),
            byte_size: 1024,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记工作项附件 legacy-hidden.doc".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    files::mark_attachment_uploaded(&pool, attachment.id, "work_item", item.id)
        .await
        .expect("attachment should upload");

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
    assert!(body.contains("legacy-hidden.doc"));
    assert!(!body.contains(&format!(
        r#"data-document-preview-url="/web/work-items/YCE-TASK-2/attachments/{}/preview""#,
        attachment.id
    )));
}

#[tokio::test]
async fn web_work_item_detail_shows_legacy_doc_preview_button_when_flag_enabled() {
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
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "legacy-visible.doc".to_string(),
            content_type: "application/msword".to_string(),
            byte_size: 1024,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记工作项附件 legacy-visible.doc".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    files::mark_attachment_uploaded(&pool, attachment.id, "work_item", item.id)
        .await
        .expect("attachment should upload");

    let app = build_router(AppState::new(
        test_settings_with_legacy_preview_enabled(),
        Some(pool),
    ));
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
    assert!(body.contains("legacy-visible.doc"));
    assert!(body.contains(&format!(
        r#"data-document-preview-url="/web/work-items/YCE-TASK-2/attachments/{}/preview""#,
        attachment.id
    )));
    assert!(body.contains(r#"data-document-preview-experimental="true""#));
    assert!(body.contains("实验性预览"));
}

#[tokio::test]
async fn web_work_item_detail_toggles_legacy_ppt_preview_button_by_flag() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_active_storage_config(&pool, initialized.user_id).await;
    let attachment = create_uploaded_work_item_attachment(
        &pool,
        &initialized,
        "legacy-visible.ppt",
        "application/vnd.ms-powerpoint",
        1536,
    )
    .await;
    let preview_attr = format!(
        r#"data-document-preview-url="/web/work-items/YCE-TASK-2/attachments/{}/preview""#,
        attachment.id
    );

    let disabled_app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let disabled_response = disabled_app
        .oneshot(
            Request::builder()
                .uri("/web/work-items/YCE-TASK-2")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(disabled_response.status(), StatusCode::OK);
    let disabled_body = response_body(disabled_response).await;
    assert!(disabled_body.contains("legacy-visible.ppt"));
    assert!(!disabled_body.contains(&preview_attr));

    let enabled_app = build_router(AppState::new(
        test_settings_with_legacy_preview_enabled(),
        Some(pool),
    ));
    let enabled_response = enabled_app
        .oneshot(
            Request::builder()
                .uri("/web/work-items/YCE-TASK-2")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(enabled_response.status(), StatusCode::OK);
    let enabled_body = response_body(enabled_response).await;
    assert!(enabled_body.contains("legacy-visible.ppt"));
    assert!(enabled_body.contains(&preview_attr));
    assert!(enabled_body.contains(r#"data-document-preview-experimental="true""#));
    assert!(enabled_body.contains("实验性预览"));
}

#[tokio::test]
async fn web_work_item_detail_keeps_docx_preview_button_available() {
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
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "always-visible.docx".to_string(),
            content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                .to_string(),
            byte_size: 2048,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记工作项附件 always-visible.docx".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    files::mark_attachment_uploaded(&pool, attachment.id, "work_item", item.id)
        .await
        .expect("attachment should upload");

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
    assert!(body.contains("always-visible.docx"));
    assert!(body.contains(&format!(
        r#"data-document-preview-url="/web/work-items/YCE-TASK-2/attachments/{}/preview""#,
        attachment.id
    )));
}

#[tokio::test]
async fn web_work_item_stable_spreadsheet_and_pptx_preview_stay_available() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    seed_active_storage_config(&pool, initialized.user_id).await;
    let xls_attachment = create_uploaded_work_item_attachment(
        &pool,
        &initialized,
        "stable-sheet.xls",
        "application/vnd.ms-excel",
        2048,
    )
    .await;
    let pptx_attachment = create_uploaded_work_item_attachment(
        &pool,
        &initialized,
        "stable-slides.pptx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        4096,
    )
    .await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    for (attachment, preview_type) in [(&xls_attachment, "spreadsheet"), (&pptx_attachment, "pptx")]
    {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!(
                        "/web/work-items/YCE-TASK-2/attachments/{}/preview",
                        attachment.id
                    ))
                    .header(header::COOKIE, initialized.cookie.clone())
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let body = response_body(response).await;
        assert!(body.contains("data-document-preview-root"));
        assert!(body.contains(&format!(r#"data-preview-type="{preview_type}""#)));
        assert!(body.contains(r#"data-preview-experimental="false""#));
        assert!(body.contains("data-preview-url=\""));
        assert!(!body.contains("旧格式实验性预览当前未开启"));
    }

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

    assert_eq!(detail_response.status(), StatusCode::OK);
    let detail_body = response_body(detail_response).await;
    assert!(detail_body.contains("stable-sheet.xls"));
    assert!(detail_body.contains(&format!(
        r#"data-document-preview-url="/web/work-items/YCE-TASK-2/attachments/{}/preview""#,
        xls_attachment.id
    )));
    assert!(detail_body.contains("stable-slides.pptx"));
    assert!(detail_body.contains(&format!(
        r#"data-document-preview-url="/web/work-items/YCE-TASK-2/attachments/{}/preview""#,
        pptx_attachment.id
    )));
    assert!(!detail_body.contains(r#"data-document-preview-experimental="true""#));
}

#[tokio::test]
async fn web_work_item_attachment_download_rejects_archived_attachment() {
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
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "deleted-screenshot.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 4096,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记工作项附件 deleted-screenshot.png".to_string()),
        },
    )
    .await
    .expect("attachment should create");
    files::mark_attachment_uploaded(&pool, attachment.id, "work_item", item.id)
        .await
        .expect("attachment should mark uploaded");
    files::archive_attachment(
        &pool,
        attachment.id,
        "work_item",
        item.id,
        initialized.user_id,
        "",
        Some(project.id),
        Some("归档工作项附件"),
    )
    .await
    .expect("attachment should archive");
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
    assert!(body.contains("附件已归档，不能下载"));
}

#[tokio::test]
async fn api_v1_work_item_attachment_delete_route_is_unavailable() {
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
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "delete-work-item.png".to_string(),
            content_type: "image/png".to_string(),
            byte_size: 4096,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
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
    assert_eq!(viewer_delete_response.status(), StatusCode::NOT_FOUND);

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
    assert_eq!(admin_delete_response.status(), StatusCode::NOT_FOUND);

    let deleted = files::get_attachment(&pool, attachment.id)
        .await
        .expect("attachment should load");
    let activities = projects::list_project_activities(&pool, project.id, 10)
        .await
        .expect("activities should load");
    assert_eq!(deleted.status, "pending");
    assert!(
        activities
            .iter()
            .all(|activity| activity.summary != "归档工作项附件")
    );
}

#[tokio::test]
async fn api_v1_can_create_and_update_work_item_for_authenticated_member() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let cycle = projects::create_project_cycle(
        &pool,
        initialized.user_id,
        "YCE",
        projects::CreateProjectCycleInput {
            name: "API 创建周期".to_string(),
            goal: String::new(),
            description: String::new(),
            owner_username: String::new(),
            start_date: "2026-08-01".to_string(),
            end_date: "2026-08-31".to_string(),
        },
    )
    .await
    .expect("cycle should create");
    let cycle_id = cycle.id;
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
                .body(Body::from(format!(
                    r#"{{"project_key":"YCE","item_type":"task","title":"API 创建任务","description":"通过 API 写入","priority":"P0","due_date":"2026-07-10","parent_item_key":"YCE-REQ-1","cycle_id":{cycle_id}}}"#,
                )))
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
    assert_eq!(item.cycle_id, Some(cycle_id));
    let linked_activity_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM project_activities WHERE action = 'work_item.cycle.linked' AND target_id = ?1",
    )
    .bind(&item_key)
    .fetch_one(&pool)
    .await
    .expect("cycle activity should load");
    assert_eq!(linked_activity_count, 1);
    assert_eq!(item.parent_item_key, "YCE-REQ-1");
    assert!(comments.iter().any(|comment| comment.body == "API 评论"));
}

#[tokio::test]
async fn api_v1_work_item_handoff_updates_assignee_flow_record_and_badges() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    rbac::create_role(&pool, "work_entry_only", "工作项入口", "self")
        .await
        .expect("role should create");
    rbac::replace_role_permissions(
        &pool,
        "work_entry_only",
        &["project.view".to_string(), "work_item.view".to_string()],
    )
    .await
    .expect("role permissions should replace");
    let reporter =
        create_user_with_role(&pool, "api_bug_reporter", "API 报告人", "work_entry_only").await;
    let first_owner =
        create_user_with_role(&pool, "api_bug_owner_a", "负责人 A", "work_entry_only").await;
    let next_owner =
        create_user_with_role(&pool, "api_bug_owner_b", "负责人 B", "work_entry_only").await;
    let final_owner =
        create_user_with_role(&pool, "api_bug_owner_c", "负责人 C", "work_entry_only").await;
    for username in [
        "api_bug_reporter",
        "api_bug_owner_a",
        "api_bug_owner_b",
        "api_bug_owner_c",
    ] {
        projects::add_project_member(&pool, initialized.user_id, "YCE", username, "member")
            .await
            .expect("member should join YCE");
    }
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items")
                .header(header::COOKIE, reporter.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"project_key":"YCE","item_type":"bug","title":"API 指派缺陷","description":"待第一负责人处理","priority":"P1","assignee_username":"api_bug_owner_a"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(create_response.status(), StatusCode::CREATED);
    let create_body = response_body(create_response).await;
    let item_key = extract_json_string(&create_body, "key");

    let first_counts =
        projects::count_pending_assigned_work_items(&pool, first_owner.user_id, false, None)
            .await
            .expect("first owner counts should load");
    assert_eq!(first_counts.bugs, 1);

    let handoff_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v1/work-items/{item_key}/handoff"))
                .header(header::COOKIE, first_owner.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"status":"in_progress","assignee_username":"api_bug_owner_b","body":"已复现，转开发修复"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(handoff_response.status(), StatusCode::OK);

    let item = projects::get_work_item_detail(&pool, &item_key)
        .await
        .expect("work item should load")
        .expect("work item should exist");
    let comments = projects::list_work_item_comments(&pool, item.id)
        .await
        .expect("comments should load");
    assert_eq!(item.status, "in_progress");
    assert_eq!(item.assignee_username, "api_bug_owner_b");
    assert!(comments.iter().any(|comment| {
        comment.is_flow
            && comment.body.contains("状态：待处理 → 进行中")
            && comment.body.contains("处理人：负责人 A → 负责人 B")
            && comment.body.contains("说明：已复现，转开发修复")
    }));
    let flow_comment_id = comments
        .iter()
        .find(|comment| comment.is_flow)
        .expect("flow comment should exist")
        .id;

    let old_counts =
        projects::count_pending_assigned_work_items(&pool, first_owner.user_id, false, None)
            .await
            .expect("old owner counts should load");
    let next_counts =
        projects::count_pending_assigned_work_items(&pool, next_owner.user_id, false, None)
            .await
            .expect("next owner counts should load");
    assert_eq!(old_counts.bugs, 0);
    assert_eq!(next_counts.bugs, 1);

    let next_owner_bugs_page = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/bugs")
                .header(header::COOKIE, next_owner.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(next_owner_bugs_page.status(), StatusCode::OK);
    let next_owner_bugs_body = response_body(next_owner_bugs_page).await;
    assert!(next_owner_bugs_body.contains(r#"aria-label="待处理 Bug 1">1</span>"#));

    let edit_flow_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!(
                    "/api/v1/work-items/{item_key}/comments/{flow_comment_id}"
                ))
                .header(header::COOKIE, next_owner.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"body":"不能修改流程记录"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(edit_flow_response.status(), StatusCode::FORBIDDEN);

    let repeated_handoff_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v1/work-items/{item_key}/handoff"))
                .header(header::COOKIE, next_owner.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"status":"in_progress","assignee_username":"api_bug_owner_c","body":"保持处理中，继续转派"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(repeated_handoff_response.status(), StatusCode::OK);

    let repeated_item = projects::get_work_item_detail(&pool, &item_key)
        .await
        .expect("work item should load")
        .expect("work item should exist");
    let repeated_comments = projects::list_work_item_comments(&pool, repeated_item.id)
        .await
        .expect("comments should load");
    assert_eq!(repeated_item.status, "in_progress");
    assert_eq!(repeated_item.assignee_username, "api_bug_owner_c");
    assert!(repeated_comments.iter().any(|comment| {
        comment.is_flow
            && !comment.body.contains("状态：")
            && comment.body.contains("处理人：负责人 B → 负责人 C")
            && comment.body.contains("说明：保持处理中，继续转派")
    }));

    let resolve_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v1/work-items/{item_key}/handoff"))
                .header(header::COOKIE, final_owner.cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"status":"resolved","assignee_username":"api_bug_owner_c","body":"已修复"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(resolve_response.status(), StatusCode::OK);
    let resolved_counts =
        projects::count_pending_assigned_work_items(&pool, final_owner.user_id, false, None)
            .await
            .expect("resolved counts should load");
    assert_eq!(resolved_counts.bugs, 0);
}

#[tokio::test]
async fn api_v1_work_item_comments_render_flat_reply_timeline() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let replier = create_regular_user(&pool, "timeline_replier", "回复成员").await;
    projects::add_project_member(
        &pool,
        initialized.user_id,
        "YCE",
        "timeline_replier",
        "member",
    )
    .await
    .expect("replier should join project");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let parent_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items/YCE-TASK-2/comments")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"body":"这是主题内容"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(parent_response.status(), StatusCode::CREATED);
    let parent_payload: serde_json::Value =
        serde_json::from_str(&response_body(parent_response).await).expect("json should parse");
    let parent_id = parent_payload["data"]["id"]
        .as_i64()
        .expect("parent id should exist");
    assert_eq!(parent_payload["data"]["author_username"], "admin");

    let standalone_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items/YCE-TASK-2/comments")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"body":"这是中间普通评论"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(standalone_response.status(), StatusCode::CREATED);

    let reply_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items/YCE-TASK-2/comments")
                .header(header::COOKIE, replier.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(format!(
                    r#"{{"body":"这是对主题的回复","parent_comment_id":{parent_id}}}"#
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(reply_response.status(), StatusCode::CREATED);
    let reply_body = response_body(reply_response).await;
    assert!(reply_body.contains(&format!(r#""parent_comment_id":{parent_id}"#)));
    assert!(reply_body.contains(r#""parent_author":"系统管理员""#));
    assert!(reply_body.contains(r#""author_username":"timeline_replier""#));
    let reply_payload: serde_json::Value =
        serde_json::from_str(&reply_body).expect("json should parse");
    let reply_id = reply_payload["data"]["id"]
        .as_i64()
        .expect("reply id should exist");

    let nested_reply_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items/YCE-TASK-2/comments")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(format!(
                    r#"{{"body":"这是对回复的回复","parent_comment_id":{reply_id}}}"#
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(nested_reply_response.status(), StatusCode::CREATED);

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
    let detail_body = response_body(detail_response).await;
    assert!(detail_body.contains("这是主题内容"));
    assert!(detail_body.contains("这是中间普通评论"));
    assert!(detail_body.contains("这是对主题的回复"));
    assert!(detail_body.contains("这是对回复的回复"));
    assert!(detail_body.contains("回复 系统管理员"));
    assert!(detail_body.contains("回复 回复成员"));
    assert!(detail_body.contains(r##"class="discussion-reply-target" href="#comment-"##));
    assert!(detail_body.contains(">回复 系统管理员</a>"));
    assert!(detail_body.contains(">回复 回复成员</a>"));
    assert!(!detail_body.contains("data-reply-depth"));

    let parent_position = detail_body.find("这是主题内容").expect("parent rendered");
    let standalone_position = detail_body
        .find("这是中间普通评论")
        .expect("standalone comment rendered");
    let reply_position = detail_body
        .find("这是对主题的回复")
        .expect("reply rendered");
    let nested_reply_position = detail_body
        .find("这是对回复的回复")
        .expect("nested reply rendered");
    assert!(parent_position < standalone_position);
    assert!(standalone_position < reply_position);
    assert!(reply_position < nested_reply_position);
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
async fn api_v1_work_item_comment_allows_edit_but_not_delete() {
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
    let foreign_comment_id =
        projects::add_work_item_comment(&pool, member.user_id, "YCE-TASK-2", "api foreign comment")
            .await
            .expect("member comment should create")
            .id;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let create_flow_prefix_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/work-items/YCE-TASK-2/comments")
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"body":"[yuance-flow] 伪造流程"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(
        create_flow_prefix_response.status(),
        StatusCode::BAD_REQUEST
    );

    let update_flow_prefix_response = app
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
                .body(Body::from(r#"{"body":"[yuance-flow] 伪造流程"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(
        update_flow_prefix_response.status(),
        StatusCode::BAD_REQUEST
    );

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
    assert_eq!(
        member_delete_response.status(),
        StatusCode::METHOD_NOT_ALLOWED
    );

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
    assert_eq!(maintainer_response.status(), StatusCode::FORBIDDEN);

    let admin_foreign_edit_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!(
                    "/api/v1/work-items/YCE-TASK-2/comments/{foreign_comment_id}"
                ))
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(r#"{"body":"admin cannot edit others"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(admin_foreign_edit_response.status(), StatusCode::FORBIDDEN);

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
    let delete_status = delete_response.status();
    let comments = projects::list_work_item_comments(&pool, item.id)
        .await
        .expect("comments should load");
    let unchanged_foreign_comment =
        projects::get_work_item_comment(&pool, item.id, foreign_comment_id)
            .await
            .expect("foreign comment should load");

    assert_eq!(delete_status, StatusCode::METHOD_NOT_ALLOWED);
    assert!(comments.iter().any(|comment| comment.id == comment_id));
    assert_eq!(unchanged_foreign_comment.body, "api foreign comment");
}

#[tokio::test]
async fn api_v1_work_item_update_forbids_non_author_even_super_admin() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let member = create_regular_user(&pool, "api_post_author", "API 主帖作者").await;
    create_regular_user(&pool, "api_post_editor", "API 编辑成员").await;
    projects::add_project_member(
        &pool,
        initialized.user_id,
        "YCE",
        "api_post_author",
        "member",
    )
    .await
    .expect("author should be added");
    projects::add_project_member(
        &pool,
        initialized.user_id,
        "YCE",
        "api_post_editor",
        "member",
    )
    .await
    .expect("editor should be added");
    let created = projects::create_work_item(
        &pool,
        member.user_id,
        projects::CreateWorkItemInput {
            project_key: "YCE".to_string(),
            item_type: "task".to_string(),
            title: "API 成员主帖".to_string(),
            description: "超管不能编辑别人主帖".to_string(),
            priority: "P2".to_string(),
            assignee_username: "api_post_editor".to_string(),
            due_date: String::new(),
            parent_item_key: String::new(),
            actor_display_name_snapshot: String::new(),
        },
    )
    .await
    .expect("work item should create");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/v1/work-items/{}", created.item_key))
                .header(header::COOKIE, initialized.cookie.clone())
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"title":"API Admin Edited","description":"should stay unchanged"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let reloaded = projects::get_work_item_detail(&pool, &created.item_key)
        .await
        .expect("work item should reload")
        .expect("work item should exist");
    assert_eq!(reloaded.title, "API 成员主帖");
    assert_eq!(reloaded.description, "超管不能编辑别人主帖");
}

#[tokio::test]
async fn work_item_archive_hides_from_lists_and_can_restore() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let archived = projects::archive_work_item(&pool, initialized.user_id, "YCE-TASK-2")
        .await
        .expect("work item should archive");

    assert!(!archived.deleted_at.is_empty());
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
            .any(|activity| activity.summary == "归档工作项 YCE-TASK-2")
    );

    let archived_detail_response = app
        .oneshot(
            Request::builder()
                .uri("/web/work-items/YCE-TASK-2")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(archived_detail_response.status(), StatusCode::OK);
    let archived_detail_body = response_body(archived_detail_response).await;
    assert!(archived_detail_body.contains(r#"data-success-message="任务已恢复。""#));

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
async fn web_work_item_delete_route_is_unavailable_and_preserves_item() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");
    rbac::create_role(&pool, "work_delete_view_only", "工作项查看无删除", "self")
        .await
        .expect("role should create");
    rbac::replace_role_permissions(
        &pool,
        "work_delete_view_only",
        &["project.view".to_string(), "work_item.view".to_string()],
    )
    .await
    .expect("role permissions should replace");
    let view_only = create_user_with_role(
        &pool,
        "web_delete_view_only",
        "删除只读成员",
        "work_delete_view_only",
    )
    .await;
    projects::add_project_member(
        &pool,
        initialized.user_id,
        "YCE",
        "web_delete_view_only",
        "member",
    )
    .await
    .expect("view-only member should join project");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let view_only_detail_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/work-items/YCE-TASK-2")
                .header(header::COOKIE, view_only.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let view_only_detail_body = response_body(view_only_detail_response).await;
    assert!(view_only_detail_body.contains("指派 / 流转"));
    assert!(!view_only_detail_body.contains(r#"action="/web/work-items/YCE-TASK-2/delete""#));

    let forbidden_delete_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/work-items/YCE-TASK-2/delete")
                .header(header::COOKIE, view_only.cookie.clone())
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "_csrf=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(forbidden_delete_response.status(), StatusCode::NOT_FOUND);
    let still_active_item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    assert!(still_active_item.deleted_at.is_empty());

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

    assert_eq!(delete_response.status(), StatusCode::NOT_FOUND);
    let deleted_item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    assert!(deleted_item.deleted_at.is_empty());
}

#[tokio::test]
async fn api_v1_work_item_delete_route_is_unavailable_and_preserves_item() {
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
    assert_eq!(viewer_response.status(), StatusCode::METHOD_NOT_ALLOWED);
    let preserved_item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    assert!(preserved_item.deleted_at.is_empty());
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
            folder_id: None,
            target_type: "project".to_string(),
            target_id: project.id,
            project_id: Some(project.id),
            original_filename: "api-project-list.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 128,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记项目附件 api-project-list.pdf".to_string()),
        },
    )
    .await
    .expect("project attachment should create");
    files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "api-work-item-list.txt".to_string(),
            content_type: "text/plain".to_string(),
            byte_size: 64,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some("登记工作项附件 api-work-item-list.txt".to_string()),
        },
    )
    .await
    .expect("work item attachment should create");
    files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            folder_id: None,
            target_type: "comment".to_string(),
            target_id: comment.id,
            project_id: Some(project.id),
            original_filename: "api-comment-list.json".to_string(),
            content_type: "application/json".to_string(),
            byte_size: 32,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
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

#[tokio::test]
async fn project_cycles_reject_invalid_ranges_and_cross_project_links() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, initialized.user_id)
        .await
        .expect("demo seed should apply");

    let invalid_cycle = projects::create_project_cycle(
        &pool,
        initialized.user_id,
        "YCE",
        projects::CreateProjectCycleInput {
            name: "非法周期".to_string(),
            goal: String::new(),
            description: String::new(),
            owner_username: "admin".to_string(),
            start_date: "2026-07-31".to_string(),
            end_date: "2026-07-01".to_string(),
        },
    )
    .await;
    assert!(invalid_cycle.is_err());
    assert!(
        invalid_cycle
            .expect_err("invalid range should fail")
            .to_string()
            .contains("周期结束日期不能早于开始日期")
    );

    let ops_cycle = projects::create_project_cycle(
        &pool,
        initialized.user_id,
        "OPS",
        projects::CreateProjectCycleInput {
            name: "OPS 运维窗口".to_string(),
            goal: String::new(),
            description: String::new(),
            owner_username: "admin".to_string(),
            start_date: "2026-07-01".to_string(),
            end_date: "2026-07-15".to_string(),
        },
    )
    .await
    .expect("ops cycle should create");

    let cross_project_link = projects::set_work_item_cycle(
        &pool,
        initialized.user_id,
        "YCE-TASK-2",
        Some(ops_cycle.id),
        "",
    )
    .await;
    assert!(cross_project_link.is_err());
    assert!(
        cross_project_link
            .expect_err("cross project cycle link should fail")
            .to_string()
            .contains("周期不存在或不属于当前项目")
    );
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

async fn response_bytes(response: axum::response::Response) -> Vec<u8> {
    response
        .into_body()
        .collect()
        .await
        .expect("body should collect")
        .to_bytes()
        .to_vec()
}

fn minimal_pdf_bytes() -> Vec<u8> {
    base64::engine::general_purpose::STANDARD
        .decode("JVBERi0xLjQKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQovUmVzb3VyY2VzIDw8Ci9Gb250IDw8Ci9GMSA0IDAgUgo+Pgo+PgovQ29udGVudHMgNSAwIFIKPj4KZW5kb2JqCjQgMCBvYmoKPDwKL1R5cGUgL0ZvbnQKL1N1YnR5cGUgL1R5cGUxCi9CYXNlRm9udCAvSGVsdmV0aWNhCj4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggNDQgPj4Kc3RyZWFtCkJUCi9GMSAyNCBUZgoxMDAgNzAwIFRkCihIZWxsbywgUERGISkgVGoKRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNDEgMDAwMDAgbiAKMDAwMDAwMDMxMSAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDYKL1Jvb3QgMSAwIFIKPj4Kc3RhcnR4cmVmCjQwNAolJUVPRg==")
        .expect("embedded pdf fixture should decode")
}

async fn create_test_api_token(app: axum::Router, cookie: &str, payload: &str) -> String {
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/me/tokens")
                .header(header::COOKIE, cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(payload.to_string()))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let status = response.status();
    let body = response_body(response).await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let created: serde_json::Value =
        serde_json::from_str(&body).expect("token response should be json");
    created["data"]["raw_token"]
        .as_str()
        .expect("raw token should exist")
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

async fn insert_test_notification(
    pool: &sqlx::SqlitePool,
    recipient_user_id: i64,
    actor_user_id: i64,
    work_item_id: i64,
    index: i32,
) {
    sqlx::query(
        r#"
        INSERT INTO notifications (
            recipient_user_id, actor_user_id, kind, work_item_id, title, body
        )
        VALUES (?1, ?2, 'work_item_assigned', ?3, ?4, ?5)
        "#,
    )
    .bind(recipient_user_id)
    .bind(actor_user_id)
    .bind(work_item_id)
    .bind(format!("角标消息 {index:03}"))
    .bind(format!("第 {index:03} 条消息"))
    .execute(pool)
    .await
    .expect("notification should insert");
}

async fn insert_test_notification_with_kind(
    pool: &sqlx::SqlitePool,
    recipient_user_id: i64,
    actor_user_id: i64,
    work_item_id: i64,
    kind: &str,
    title: &str,
    body: &str,
) {
    sqlx::query(
        r#"
        INSERT INTO notifications (
            recipient_user_id, actor_user_id, kind, work_item_id, title, body
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        "#,
    )
    .bind(recipient_user_id)
    .bind(actor_user_id)
    .bind(kind)
    .bind(work_item_id)
    .bind(title)
    .bind(body)
    .execute(pool)
    .await
    .expect("notification should insert");
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

async fn create_uploaded_work_item_attachment(
    pool: &sqlx::SqlitePool,
    initialized: &InitializedAdmin,
    original_filename: &str,
    content_type: &str,
    byte_size: i64,
) -> files::FileAttachmentSummary {
    let item = projects::get_work_item_detail(pool, "YCE-TASK-2")
        .await
        .expect("work item should load")
        .expect("work item should exist");
    let project = projects::get_project_detail(pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist");
    let config = storage::active_config(pool)
        .await
        .expect("storage config should load")
        .expect("storage config should exist");
    let attachment = files::create_attachment(
        pool,
        &config,
        files::CreateAttachmentInput {
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: original_filename.to_string(),
            content_type: content_type.to_string(),
            byte_size,
            created_by_user_id: initialized.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: Some(format!("登记工作项附件 {original_filename}")),
        },
    )
    .await
    .expect("attachment should create");
    files::mark_attachment_uploaded(pool, attachment.id, "work_item", item.id)
        .await
        .expect("attachment should upload");
    attachment
}

fn extract_json_string(body: &str, key: &str) -> String {
    let needle = format!("\"{key}\":\"");
    let start = body.find(&needle).expect("key should exist") + needle.len();
    let rest = &body[start..];
    let end = rest.find('"').expect("value should end");
    rest[..end].to_string()
}

fn html_fragment<'a>(body: &'a str, marker: &str, closing: &str) -> &'a str {
    let start = body.find(marker).expect("fragment marker should exist");
    let tail = &body[start..];
    let end = tail.find(closing).expect("fragment closing should exist") + closing.len();
    &tail[..end]
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
        session_ttl: "2h".to_string(),
        refresh_session_ttl: "30d".to_string(),
        cache_session_ttl: "5m".to_string(),
        log_level: "off".to_string(),
        env: "test".to_string(),
        security_master_key: "test-master-key-2026".to_string(),
        device_sessions: Default::default(),
        experimental_legacy_preview_enabled: false,
    }
}

fn test_settings_with_legacy_preview_enabled() -> Settings {
    let mut settings = test_settings();
    settings.experimental_legacy_preview_enabled = true;
    settings
}
