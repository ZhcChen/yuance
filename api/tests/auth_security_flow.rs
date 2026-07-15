use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use tower::ServiceExt;
use yuance_api::{
    domains::{api_tokens, auth, bootstrap, projects},
    platform::{
        config::Settings,
        db,
        security::csrf::{CSRF_COOKIE_NAME, CSRF_FIELD_NAME},
    },
    web::router::{AppState, build_router},
};

const CSRF_TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

#[tokio::test]
async fn login_page_sets_csrf_cookie_and_hidden_field() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/login")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    assert!(
        set_cookie_values(response.headers())
            .iter()
            .any(|cookie| cookie.starts_with(&format!("{CSRF_COOKIE_NAME}=")))
    );

    let body = response_body(response).await;
    assert!(body.contains(&format!("name=\"{CSRF_FIELD_NAME}\"")));
    assert!(body.contains("data-page-transition"));
    assert!(body.contains("登录"));
}

#[tokio::test]
async fn login_submit_rejects_missing_csrf() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/login")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from("username=admin&password=AdminPass2026%21"))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn htmx_login_submit_can_use_csrf_header() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/login")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, csrf_cookie())
                .header("HX-Request", "true")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from("username=admin&password=AdminPass2026%21"))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert_eq!(response.headers().get("HX-Redirect").unwrap(), "/web");
    assert!(
        set_cookie_values(response.headers())
            .iter()
            .any(|cookie| cookie.starts_with("yuance_session="))
    );
}

#[tokio::test]
async fn login_submit_with_invalid_credentials_renders_login_page_error() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/login")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, csrf_cookie())
                .body(Body::from(with_csrf("username=admin&password=wrong")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    assert!(body.contains("用户名或密码错误，请重新输入。"));
    assert!(body.contains("<form class=\"auth-form\" method=\"post\" action=\"/web/login\">"));
    assert!(!body.contains(r#""code":"unauthorized""#));
}

#[tokio::test]
async fn htmx_role_permission_update_can_use_csrf_header() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/roles/member/permissions")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header("HX-Request", "true")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from("permission_keys=project.view"))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn system_page_redirects_expired_login_to_login_page() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/users")
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
async fn system_post_redirects_expired_login_to_login_page() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/users")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, csrf_cookie())
                .body(Body::from(with_csrf(
                    "username=member1&display_name=%E6%88%90%E5%91%98%E4%B8%80&email=member1%40example.test&mobile=13800000001&password=MemberPass2026%21&role_code=member",
                )))
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
async fn htmx_system_post_uses_hx_redirect_when_login_expired() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/roles/member/permissions")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, csrf_cookie())
                .header("HX-Request", "true")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from("permission_keys=project.view"))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert_eq!(response.headers().get("HX-Redirect").unwrap(), "/web/login");
}

#[tokio::test]
async fn htmx_partial_uses_hx_redirect_when_login_expired() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/partials/work-items")
                .header("HX-Request", "true")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert_eq!(response.headers().get("HX-Redirect").unwrap(), "/web/login");
}

#[tokio::test]
async fn login_submit_with_csrf_creates_session_cookie() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/login")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, csrf_cookie())
                .body(Body::from(with_csrf(
                    "username=admin&password=AdminPass2026%21",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(response.headers().get(header::LOCATION).unwrap(), "/web");
    assert!(
        set_cookie_values(response.headers())
            .iter()
            .any(|cookie| cookie.starts_with("yuance_session="))
    );
}

#[tokio::test]
async fn web_login_uses_configured_session_ttl_for_cookie_and_database_expiry() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let mut settings = test_settings();
    settings.session_ttl = "30m".to_string();
    let app = build_router(AppState::new(settings, Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/login")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, csrf_cookie())
                .body(Body::from(with_csrf(
                    "username=admin&password=AdminPass2026%21",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert!(
        set_cookie_values(response.headers())
            .iter()
            .any(|cookie| cookie.starts_with("yuance_session=") && cookie.contains("Max-Age=1800"))
    );

    let ttl_seconds = sqlx::query_scalar::<_, i64>(
        "SELECT CAST(strftime('%s', expires_at) - strftime('%s', created_at) AS INTEGER) FROM sessions ORDER BY id DESC LIMIT 1",
    )
    .fetch_one(&pool)
    .await
    .expect("session ttl should load");
    assert!((1795..=1805).contains(&ttl_seconds));
}

#[tokio::test]
async fn api_auth_login_me_and_logout_flow_uses_json_contract() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let mut settings = test_settings();
    settings.session_ttl = "15m".to_string();
    let app = build_router(AppState::new(settings, Some(pool)));

    let login_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/login")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    r#"{"username":"admin","password":"AdminPass2026!"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(login_response.status(), StatusCode::OK);
    let session_cookie = set_cookie_values(login_response.headers())
        .into_iter()
        .find(|cookie| cookie.starts_with("yuance_session="))
        .expect("session cookie should be set");
    assert!(session_cookie.contains("Max-Age=900"));
    let csrf_cookie = set_cookie_values(login_response.headers())
        .into_iter()
        .find(|cookie| cookie.starts_with(&format!("{CSRF_COOKIE_NAME}=")))
        .expect("csrf cookie should be set");
    let login_body = response_body(login_response).await;
    assert!(login_body.contains(r#""username":"admin""#));
    assert!(login_body.contains(r#""is_super_admin":true"#));
    assert!(login_body.contains(r#""csrf_token":""#));

    let me_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/me")
                .header(header::COOKIE, session_cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(me_response.status(), StatusCode::OK);
    let me_body = response_body(me_response).await;
    assert!(me_body.contains(r#""display_name":"系统管理员""#));

    let logout_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/logout")
                .header(header::COOKIE, format!("{session_cookie}; {csrf_cookie}"))
                .header("x-yuance-csrf-token", csrf_token_from_cookie(&csrf_cookie))
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(logout_response.status(), StatusCode::OK);
    assert!(
        set_cookie_values(logout_response.headers())
            .iter()
            .any(|cookie| cookie.starts_with("yuance_session=;") && cookie.contains("Max-Age=0"))
    );

    let expired_me_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/me")
                .header(header::COOKIE, session_cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(expired_me_response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn api_auth_login_rejects_invalid_credentials() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/login")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(r#"{"username":"admin","password":"wrong"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn api_cookie_mutations_require_csrf_token() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let missing_csrf_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::from(
                    r#"{"name":"安全边界","description":"缺少 CSRF 应拒绝"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(missing_csrf_response.status(), StatusCode::FORBIDDEN);

    let with_csrf_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"name":"安全边界","description":"带 CSRF 应允许"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(with_csrf_response.status(), StatusCode::CREATED);
}

#[tokio::test]
async fn bootstrap_page_sets_csrf_cookie_and_hidden_field() {
    let pool = test_pool().await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/bootstrap")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    assert!(
        set_cookie_values(response.headers())
            .iter()
            .any(|cookie| cookie.starts_with(&format!("{CSRF_COOKIE_NAME}=")))
    );

    let body = response_body(response).await;
    assert!(body.contains(&format!("name=\"{CSRF_FIELD_NAME}\"")));
    assert!(body.contains("创建系统管理员"));
}

#[tokio::test]
async fn bootstrap_init_rejects_missing_csrf() {
    let pool = test_pool().await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/bootstrap/init")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "username=admin&display_name=%E7%B3%BB%E7%BB%9F%E7%AE%A1%E7%90%86%E5%91%98&password=AdminPass2026%21&password_confirm=AdminPass2026%21",
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn bootstrap_init_with_csrf_creates_admin_session() {
    let pool = test_pool().await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/bootstrap/init")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, csrf_cookie())
                .body(Body::from(with_csrf(
                    "username=admin&display_name=%E7%B3%BB%E7%BB%9F%E7%AE%A1%E7%90%86%E5%91%98&password=AdminPass2026%21&password_confirm=AdminPass2026%21",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(response.headers().get(header::LOCATION).unwrap(), "/web");
    assert!(
        set_cookie_values(response.headers())
            .iter()
            .any(|cookie| cookie.starts_with("yuance_session="))
    );
    assert!(
        !bootstrap::bootstrap_required(&pool)
            .await
            .expect("bootstrap check should work")
    );
}

#[tokio::test]
async fn logout_revokes_session_and_clears_cookies() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/logout")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .body(Body::from(csrf_field()))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/login"
    );
    let set_cookies = set_cookie_values(response.headers());
    assert!(
        set_cookies.iter().any(|cookie| {
            cookie.starts_with("yuance_session=;") && cookie.contains("Max-Age=0")
        })
    );
    assert!(set_cookies.iter().any(|cookie| {
        cookie.starts_with(&format!("{CSRF_COOKIE_NAME}=;")) && cookie.contains("Max-Age=0")
    }));

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

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/login"
    );
}

#[tokio::test]
async fn api_personal_access_tokens_create_list_revoke_and_authenticate() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/me/tokens")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"name":"MCP 测试","scopes":["project:read"],"project_scope":"all"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(create_response.status(), StatusCode::CREATED);
    let create_body = response_body(create_response).await;
    let created: serde_json::Value =
        serde_json::from_str(&create_body).expect("created token response should be json");
    let raw_token = created["data"]["raw_token"]
        .as_str()
        .expect("raw token should be returned once")
        .to_string();
    assert!(raw_token.starts_with("yuance_pat_"));
    assert_eq!(created["data"]["token"]["name"], "MCP 测试");

    let list_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/me/tokens")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(list_response.status(), StatusCode::OK);
    let list_body = response_body(list_response).await;
    assert!(list_body.contains("MCP 测试"));
    assert!(!list_body.contains(&raw_token));

    let projects_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/projects")
                .header(header::AUTHORIZATION, format!("Bearer {raw_token}"))
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(projects_response.status(), StatusCode::OK);

    let token_id = created["data"]["token"]["id"]
        .as_i64()
        .expect("token id should be present");
    let revoke_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/api/v1/me/tokens/{token_id}"))
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(revoke_response.status(), StatusCode::OK);

    let revoked_projects_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/projects")
                .header(header::AUTHORIZATION, format!("Bearer {raw_token}"))
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(revoked_projects_response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn api_token_scope_is_enforced_for_bearer_requests() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/me/tokens")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"name":"只读项目","scopes":["project:read"],"project_scope":"all"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(create_response.status(), StatusCode::CREATED);
    let create_body = response_body(create_response).await;
    let created: serde_json::Value =
        serde_json::from_str(&create_body).expect("created token response should be json");
    let raw_token = created["data"]["raw_token"]
        .as_str()
        .expect("raw token should be returned once");

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/work-items")
                .header(header::AUTHORIZATION, format!("Bearer {raw_token}"))
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let body = response_body(response).await;
    assert!(body.contains("work_item:read"));
}

#[tokio::test]
async fn me_page_creates_api_token_and_renders_plaintext_once() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let project_a = projects::create_project(
        &pool,
        initialized.user_id,
        projects::CreateProjectInput {
            name: "Alpha 项目".to_string(),
            description: "用于验证 Token 项目范围多选".to_string(),
            status: "in_progress".to_string(),
            start_date: String::new(),
            due_date: String::new(),
        },
    )
    .await
    .expect("project A should create");
    let project_b = projects::create_project(
        &pool,
        initialized.user_id,
        projects::CreateProjectInput {
            name: "Beta 项目".to_string(),
            description: "用于验证 Token 项目范围多选".to_string(),
            status: "not_started".to_string(),
            start_date: String::new(),
            due_date: String::new(),
        },
    )
    .await
    .expect("project B should create");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let page_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/me")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(page_response.status(), StatusCode::OK);
    let page_body = response_body(page_response).await;
    assert!(page_body.contains("Personal Access Token"));
    assert!(page_body.contains("创建访问 Token"));
    assert!(page_body.contains("可用 Token 0/100"));
    assert!(page_body.contains(r#"name="project_scope_projects" value="all" checked"#));
    assert!(page_body.contains("全部项目（包含后续新增）"));
    assert!(page_body.contains("Alpha 项目"));
    assert!(page_body.contains("Beta 项目"));

    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/me/api-tokens")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf(
                    "name=MCP%20UI&project_scope_projects=all&scopes=project%3Aread&scopes=work_item%3Aread",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(create_response.status(), StatusCode::OK);
    let create_body = response_body(create_response).await;
    assert!(create_body.contains("Token 已创建，请立即复制保存"));
    assert!(create_body.contains("yuance_pat_"));
    assert!(create_body.contains("MCP UI"));
    assert!(create_body.contains("全部项目（含后续新增）"));

    let scoped_body = format!(
        "name=MCP%20Scoped&project_scope_projects={}&project_scope_projects={}&scopes=project%3Aread",
        project_a.project_key, project_b.project_key
    );
    let scoped_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/me/api-tokens")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf(&scoped_body)))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(scoped_response.status(), StatusCode::OK);
    let scoped_page = response_body(scoped_response).await;
    assert!(scoped_page.contains("MCP Scoped"));
    assert!(scoped_page.contains(&format!(
        "{}、{}",
        project_a.project_key, project_b.project_key
    )));

    let stored_scope = sqlx::query_scalar::<_, String>(
        r#"
        SELECT project_scope
        FROM api_tokens
        WHERE user_id = ?1
          AND name = 'MCP Scoped'
        "#,
    )
    .bind(initialized.user_id)
    .fetch_one(&pool)
    .await
    .expect("scoped token should persist");
    assert_eq!(
        stored_scope,
        format!("{},{}", project_a.project_key, project_b.project_key)
    );
}

#[tokio::test]
async fn api_token_creation_rejects_more_than_100_unrevoked_tokens() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    for index in 0..api_tokens::MAX_ACTIVE_TOKENS_PER_USER {
        sqlx::query(
            r#"
            INSERT INTO api_tokens (
                user_id,
                name,
                token_hash,
                token_suffix,
                scopes,
                project_scope
            )
            VALUES (?1, ?2, ?3, ?4, '["project:read"]', 'all')
            "#,
        )
        .bind(initialized.user_id)
        .bind(format!("Token {index}"))
        .bind(format!("hash-{index}"))
        .bind(format!("{index:08}"))
        .execute(&pool)
        .await
        .expect("token fixture should insert");
    }

    let create_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/me/api-tokens")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf(
                    "name=Overflow&project_scope_projects=all&scopes=project%3Aread",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(create_response.status(), StatusCode::BAD_REQUEST);
    let body = response_body(create_response).await;
    assert!(body.contains("最多可同时保留 100 个访问 Token"));
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
        security_master_key: "test-master-key".to_string(),
    }
}

fn csrf_cookie() -> String {
    format!("{CSRF_COOKIE_NAME}={CSRF_TOKEN}")
}

fn with_csrf_cookie(session_cookie: &str) -> String {
    format!("{session_cookie}; {}", csrf_cookie())
}

fn csrf_field() -> String {
    format!("{CSRF_FIELD_NAME}={CSRF_TOKEN}")
}

fn csrf_token_from_cookie(cookie: &str) -> String {
    cookie
        .split(';')
        .next()
        .and_then(|part| part.split_once('='))
        .map(|(_, value)| value.to_string())
        .expect("csrf cookie should include a token")
}

fn with_csrf(body: &str) -> String {
    format!("{body}&{}", csrf_field())
}

fn set_cookie_values(headers: &axum::http::HeaderMap) -> Vec<String> {
    headers
        .get_all(header::SET_COOKIE)
        .iter()
        .map(|value| value.to_str().expect("cookie should be ascii").to_string())
        .collect()
}
