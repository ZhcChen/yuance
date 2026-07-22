use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use tower::ServiceExt;
use yuance_api::{
    domains::{auth, bootstrap, rbac},
    platform::{config::Settings, db},
    web::router::{AppState, build_router},
};

const CSRF_TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

#[tokio::test]
async fn migrations_and_core_seed_create_rbac_foundation() {
    let pool = test_pool().await;

    rbac::seed_core(&pool)
        .await
        .expect("core seed should apply");

    let role_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM roles")
        .fetch_one(&pool)
        .await
        .expect("role count should load");
    let permission_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM permissions")
        .fetch_one(&pool)
        .await
        .expect("permission count should load");
    let admin_grants = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM role_permissions rp
        JOIN roles r ON r.id = rp.role_id
        WHERE r.role_code = 'system_admin'
        "#,
    )
    .fetch_one(&pool)
    .await
    .expect("grant count should load");

    assert_eq!(role_count, 2);
    assert!(permission_count >= 8);
    assert_eq!(admin_grants, permission_count);
}

#[tokio::test]
async fn bootstrap_init_creates_first_super_admin_once() {
    let pool = test_pool().await;

    assert!(
        bootstrap::bootstrap_required(&pool)
            .await
            .expect("bootstrap check should work")
    );

    let result = bootstrap::bootstrap_init(
        &pool,
        bootstrap::BootstrapInitInput {
            username: "admin".to_string(),
            display_name: "系统管理员".to_string(),
            password: "AdminPass2026!".to_string(),
            password_confirm: "AdminPass2026!".to_string(),
        },
    )
    .await
    .expect("bootstrap should initialize");

    assert!(result.user_id > 0);
    assert!(!result.session.raw_token.is_empty());
    assert!(
        !bootstrap::bootstrap_required(&pool)
            .await
            .expect("bootstrap check should work")
    );

    let user = sqlx::query_as::<_, (String, String, i64)>(
        "SELECT username, display_name, is_super_admin FROM users WHERE id = ?1",
    )
    .bind(result.user_id)
    .fetch_one(&pool)
    .await
    .expect("user should exist");

    assert_eq!(user.0, "admin");
    assert_eq!(user.1, "系统管理员");
    assert_eq!(user.2, 1);

    let second = bootstrap::bootstrap_init(
        &pool,
        bootstrap::BootstrapInitInput {
            username: "admin2".to_string(),
            display_name: "系统管理员 2".to_string(),
            password: "AdminPass2026!".to_string(),
            password_confirm: "AdminPass2026!".to_string(),
        },
    )
    .await;

    assert!(second.is_err(), "bootstrap must be one-time only");
}

#[tokio::test]
async fn concurrent_bootstrap_init_allows_only_one_admin() {
    let pool = test_pool().await;

    let mut tasks = Vec::new();
    for index in 0..8 {
        let pool = pool.clone();
        tasks.push(tokio::spawn(async move {
            bootstrap::bootstrap_init(
                &pool,
                bootstrap::BootstrapInitInput {
                    username: format!("admin{index}"),
                    display_name: format!("系统管理员 {index}"),
                    password: "AdminPass2026!".to_string(),
                    password_confirm: "AdminPass2026!".to_string(),
                },
            )
            .await
        }));
    }

    let mut success_count = 0;
    let mut conflict_count = 0;
    for task in tasks {
        match task.await.expect("bootstrap task should join") {
            Ok(_) => success_count += 1,
            Err(error) if error.to_string().contains("系统管理员已完成初始化") => {
                conflict_count += 1;
            }
            Err(error) => panic!("unexpected bootstrap error: {error}"),
        }
    }

    let user_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users")
        .fetch_one(&pool)
        .await
        .expect("user count should load");
    let completed = sqlx::query_scalar::<_, i64>(
        "SELECT completed FROM app_bootstrap WHERE bootstrap_key = 'system'",
    )
    .fetch_one(&pool)
    .await
    .expect("bootstrap row should load");

    assert_eq!(success_count, 1);
    assert_eq!(conflict_count, 7);
    assert_eq!(user_count, 1);
    assert_eq!(completed, 1);
}

#[tokio::test]
async fn login_verifies_argon2_password_and_creates_session() {
    let pool = test_pool().await;
    bootstrap::bootstrap_init(
        &pool,
        bootstrap::BootstrapInitInput {
            username: "admin".to_string(),
            display_name: "系统管理员".to_string(),
            password: "AdminPass2026!".to_string(),
            password_confirm: "AdminPass2026!".to_string(),
        },
    )
    .await
    .expect("bootstrap should initialize");

    let session = auth::login(&pool, "admin", "AdminPass2026!")
        .await
        .expect("login should succeed");

    assert!(!session.raw_token.is_empty());

    let bad_login = auth::login(&pool, "admin", "wrong-password").await;
    assert!(bad_login.is_err());
}

#[tokio::test]
async fn api_bootstrap_init_creates_admin_sets_cookies_and_writes_audit() {
    let pool = test_pool().await;
    let mut settings = test_settings();
    settings.session_ttl = "45m".to_string();
    let app = build_router(AppState::new(settings, Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/bootstrap/init")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    r#"{"username":"admin","display_name":"系统管理员","password":"AdminPass2026!","password_confirm":"AdminPass2026!"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::CREATED);
    let set_cookies = set_cookie_values(response.headers());
    assert!(
        set_cookies
            .iter()
            .any(|cookie| cookie.starts_with("yuance_session=") && cookie.contains("Max-Age=2700"))
    );
    assert!(
        set_cookies
            .iter()
            .any(|cookie| cookie.starts_with("yuance_csrf="))
    );
    let body = response_body(response).await;
    assert!(body.contains(r#""username":"admin""#));
    assert!(body.contains(r#""display_name":"系统管理员""#));
    assert!(body.contains(r#""is_super_admin":true"#));
    assert!(body.contains(r#""csrf_token":""#));

    let completed = sqlx::query_scalar::<_, i64>(
        "SELECT completed FROM app_bootstrap WHERE bootstrap_key = 'system'",
    )
    .fetch_one(&pool)
    .await
    .expect("bootstrap row should exist");
    let audit_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM audit_logs WHERE action = 'bootstrap.init' AND metadata LIKE '%\"source\":\"api\"%'",
    )
    .fetch_one(&pool)
    .await
    .expect("audit count should load");

    assert_eq!(completed, 1);
    assert_eq!(audit_count, 1);
}

#[tokio::test]
async fn api_bootstrap_init_rejects_when_already_initialized() {
    let pool = test_pool().await;
    bootstrap::bootstrap_init(
        &pool,
        bootstrap::BootstrapInitInput {
            username: "admin".to_string(),
            display_name: "系统管理员".to_string(),
            password: "AdminPass2026!".to_string(),
            password_confirm: "AdminPass2026!".to_string(),
        },
    )
    .await
    .expect("bootstrap should initialize");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/bootstrap/init")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    r#"{"username":"admin2","display_name":"系统管理员二","password":"AdminPass2026!","password_confirm":"AdminPass2026!"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::CONFLICT);
    let body = response_body(response).await;
    assert!(body.contains("系统管理员已完成初始化"));
}

#[tokio::test]
async fn http_bootstrap_sets_session_cookie_and_redirects_for_regular_form() {
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
        response
            .headers()
            .get(header::SET_COOKIE)
            .expect("session cookie should be set")
            .to_str()
            .expect("cookie should be ascii")
            .contains("yuance_session=")
    );

    let completed = sqlx::query_scalar::<_, i64>(
        "SELECT completed FROM app_bootstrap WHERE bootstrap_key = 'system'",
    )
    .fetch_one(&pool)
    .await
    .expect("bootstrap row should exist");
    assert_eq!(completed, 1);
}

#[tokio::test]
async fn http_bootstrap_uses_hx_redirect_for_htmx_form() {
    let pool = test_pool().await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/bootstrap/init")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header("HX-Request", "true")
                .header(header::COOKIE, csrf_cookie())
                .body(Body::from(with_csrf(
                    "username=admin&display_name=%E7%B3%BB%E7%BB%9F%E7%AE%A1%E7%90%86%E5%91%98&password=AdminPass2026%21&password_confirm=AdminPass2026%21",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert_eq!(response.headers().get("HX-Redirect").unwrap(), "/web");
    assert!(
        response
            .headers()
            .get(header::SET_COOKIE)
            .expect("session cookie should be set")
            .to_str()
            .expect("cookie should be ascii")
            .contains("yuance_session=")
    );
}

#[tokio::test]
async fn web_redirects_to_bootstrap_when_database_is_empty() {
    let pool = test_pool().await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/bootstrap"
    );
}

#[tokio::test]
async fn web_renders_dashboard_after_bootstrap_with_session() {
    let pool = test_pool().await;
    let initialized = bootstrap::bootstrap_init(
        &pool,
        bootstrap::BootstrapInitInput {
            username: "admin".to_string(),
            display_name: "系统管理员".to_string(),
            password: "AdminPass2026!".to_string(),
            password_confirm: "AdminPass2026!".to_string(),
        },
    )
    .await
    .expect("bootstrap should initialize");
    let cookie = auth::session_cookie_header(&initialized.session.raw_token, false);
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web")
                .header(header::COOKIE, cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response
        .into_body()
        .collect()
        .await
        .expect("body should collect")
        .to_bytes();
    let body = std::str::from_utf8(&body).expect("body should be utf-8");

    assert!(body.contains("系统管理员"));
    assert!(!body.contains("我的工作项"));
    assert!(body.contains("我的待处理"));
    assert!(body.contains("href=\"/favicon.ico\""));
    assert!(body.contains("/static/brand/yuance-logo.svg"));
    assert!(body.contains("data-page-transition"));
    assert!(body.contains("class=\"topnav\""));
    assert!(body.contains("aria-label=\"系统管理员，打开用户菜单\""));
    assert!(body.contains("data-user-avatar"));
    assert!(body.contains("data-avatar-name=\"系统管理员\""));
    assert!(body.contains("个人中心"));
    assert!(!body.contains("class=\"global-search\""));
    assert!(!body.contains("class=\"sidebar\""));
}

#[tokio::test]
async fn system_pages_reject_regular_members() {
    let pool = test_pool().await;
    rbac::seed_core(&pool)
        .await
        .expect("core seed should apply");
    let user_id = create_member(&pool)
        .await
        .expect("member should be created");
    bootstrap::ensure_completed_by_local_admin(&pool, user_id)
        .await
        .expect("bootstrap should be completed for permission check");
    let session = auth::issue_session(&pool, user_id, 12 * 60 * 60)
        .await
        .expect("session should issue");
    let cookie = auth::session_cookie_header(&session.raw_token, false);
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system")
                .header(header::COOKIE, cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
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

async fn create_member(pool: &sqlx::SqlitePool) -> Result<i64, sqlx::Error> {
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
        VALUES ('member', ?1, '普通成员', 'active', 0)
        RETURNING id
        "#,
    )
    .bind(password_hash)
    .fetch_one(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO user_roles (user_id, role_id)
        SELECT ?1, id
        FROM roles
        WHERE role_code = 'member'
        "#,
    )
    .bind(user_id)
    .execute(pool)
    .await?;

    Ok(user_id)
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
        onlyoffice_document_server_url: String::new(),
        onlyoffice_jwt_secret: String::new(),
    }
}

fn csrf_cookie() -> String {
    format!("yuance_csrf={CSRF_TOKEN}")
}

fn with_csrf(body: &str) -> String {
    format!("{body}&_csrf={CSRF_TOKEN}")
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

fn set_cookie_values(headers: &axum::http::HeaderMap) -> Vec<String> {
    headers
        .get_all(header::SET_COOKIE)
        .iter()
        .map(|value| value.to_str().expect("cookie should be ascii").to_string())
        .collect()
}
