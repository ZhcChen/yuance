use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use tower::ServiceExt;
use yuance_api::{
    domains::{audit, auth, bootstrap, rbac},
    platform::{config::Settings, db},
    web::router::{AppState, build_router},
};

const CSRF_TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

#[tokio::test]
async fn bootstrap_login_and_storage_save_write_audit_logs() {
    let pool = test_pool().await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let bootstrap_response = app
        .clone()
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
    assert_eq!(bootstrap_response.status(), StatusCode::SEE_OTHER);

    let login_response = app
        .clone()
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
    assert_eq!(login_response.status(), StatusCode::SEE_OTHER);
    let session_cookie = login_response
        .headers()
        .get(header::SET_COOKIE)
        .expect("session cookie should be set")
        .to_str()
        .expect("cookie should be ascii")
        .to_string();

    let storage_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/storage")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, with_csrf_cookie(&session_cookie))
                .body(Body::from(with_csrf(
                    "endpoint=https%3A%2F%2Foss-cn-hangzhou.aliyuncs.com&region=cn-hangzhou&bucket=yuance-files&access_key_id=AKIAAUDITSECRETID&access_key_secret=AuditSecretValue2026%21&activate=on",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(storage_response.status(), StatusCode::OK);

    let actions = sqlx::query_scalar::<_, String>(
        r#"
        SELECT GROUP_CONCAT(action, ',')
        FROM audit_logs
        ORDER BY id ASC
        "#,
    )
    .fetch_one(&pool)
    .await
    .expect("audit actions should load");

    assert!(actions.contains("bootstrap.init"));
    assert!(actions.contains("auth.login"));
    assert!(actions.contains("storage.config.save"));

    let audit_page = app
        .oneshot(
            Request::builder()
                .uri("/web/system/audit")
                .header(header::COOKIE, session_cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(audit_page.status(), StatusCode::OK);
    let body = response_body(audit_page).await;
    assert!(body.contains("审计日志"));
    assert!(body.contains("首次初始化"));
    assert!(body.contains("用户登录"));
    assert!(body.contains("保存对象存储配置"));
}

#[tokio::test]
async fn audit_page_requires_audit_permission() {
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
                .uri("/web/system/audit")
                .header(header::COOKIE, cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn permission_denials_write_audit_logs() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    create_user_with_role(&pool, "member1", "成员一", "MemberPass2026!", "member").await;
    let session = auth::login(&pool, "member1", "MemberPass2026!")
        .await
        .expect("member should login");
    let cookie = auth::session_cookie_header(&session.raw_token, false);
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let web_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/system/users")
                .header(header::COOKIE, cookie.clone())
                .header("x-forwarded-for", "203.0.113.10, 10.0.0.1")
                .header(header::USER_AGENT, "YuanceWebAuditTest/1.0")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(web_response.status(), StatusCode::FORBIDDEN);

    let api_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/projects")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, with_csrf_cookie(&cookie))
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .header("x-real-ip", "198.51.100.9")
                .header(header::USER_AGENT, "YuanceApiAuditTest/1.0")
                .body(Body::from(r#"{"name":"权限拒绝测试"}"#))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(api_response.status(), StatusCode::FORBIDDEN);

    let rows = sqlx::query_as::<_, (String, String, String, String)>(
        r#"
        SELECT target_id, metadata, ip, user_agent
        FROM audit_logs
        WHERE action = 'permission.denied'
        ORDER BY id ASC
        "#,
    )
    .fetch_all(&pool)
    .await
    .expect("permission denied audit rows should load");

    assert_eq!(rows.len(), 2);
    assert!(rows.iter().any(|row| row.0 == "system.users.view"
        && row.1.contains(r#""source":"web.system""#)
        && row.2 == "203.0.113.10"
        && row.3 == "YuanceWebAuditTest/1.0"));
    assert!(rows.iter().any(|row| row.0 == "project.manage"
        && row.1.contains(r#""source":"api""#)
        && row.2 == "198.51.100.9"
        && row.3 == "YuanceApiAuditTest/1.0"));
}

#[tokio::test]
async fn failed_login_attempts_write_audit_logs_without_password() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let web_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/login")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, csrf_cookie())
                .header("x-forwarded-for", "203.0.113.20")
                .header(header::USER_AGENT, "YuanceFailedWebLogin/1.0")
                .body(Body::from(with_csrf(
                    "username=admin&password=WrongPass2026%21",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(web_response.status(), StatusCode::OK);
    let web_body = response_body(web_response).await;
    assert!(web_body.contains("用户名或密码错误，请重新输入。"));
    assert!(!web_body.contains("WrongPass2026"));

    let api_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/login")
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-real-ip", "198.51.100.20")
                .header(header::USER_AGENT, "YuanceFailedApiLogin/1.0")
                .body(Body::from(
                    r#"{"username":"admin","password":"AnotherWrongPass2026!"}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(api_response.status(), StatusCode::UNAUTHORIZED);

    let rows = sqlx::query_as::<_, (String, String, String, String, String)>(
        r#"
        SELECT action, target_id, metadata, ip, user_agent
        FROM audit_logs
        WHERE action = 'auth.login.failed'
        ORDER BY id ASC
        "#,
    )
    .fetch_all(&pool)
    .await
    .expect("failed login audit rows should load");

    assert_eq!(rows.len(), 2);
    assert!(rows.iter().all(|row| row.1 == "admin"));
    assert!(rows.iter().any(|row| row.2 == "{}"));
    assert!(rows.iter().any(|row| row.2.contains(r#""source":"api""#)));
    assert!(
        rows.iter()
            .any(|row| row.3 == "203.0.113.20" && row.4 == "YuanceFailedWebLogin/1.0")
    );
    assert!(
        rows.iter()
            .any(|row| row.3 == "198.51.100.20" && row.4 == "YuanceFailedApiLogin/1.0")
    );
    assert!(
        rows.iter()
            .all(|row| !row.2.contains("WrongPass") && !row.2.contains("AnotherWrongPass"))
    );
}

#[tokio::test]
async fn audit_page_can_filter_and_paginate_logs() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let session = auth::login(&pool, "admin", "AdminPass2026!")
        .await
        .expect("admin should login");
    let cookie = auth::session_cookie_header(&session.raw_token, false);
    let admin_id = sqlx::query_scalar::<_, i64>("SELECT id FROM users WHERE username = 'admin'")
        .fetch_one(&pool)
        .await
        .expect("admin id should load");
    audit::record(
        &pool,
        Some(admin_id),
        "storage.config.save",
        "storage_config",
        "oss-primary",
        r#"{"bucket":"primary"}"#,
    )
    .await
    .expect("audit log should record");
    audit::record(
        &pool,
        Some(admin_id),
        "storage.config.save",
        "storage_config",
        "oss-backup",
        r#"{"bucket":"backup"}"#,
    )
    .await
    .expect("audit log should record");
    audit::record(
        &pool,
        Some(admin_id),
        "user.create",
        "user",
        "member1",
        r#"{"username":"member1"}"#,
    )
    .await
    .expect("audit log should record");

    let page = audit::list_filtered(
        &pool,
        audit::AuditLogFilter {
            actor: "admin".to_string(),
            action: "storage.config.save".to_string(),
            target_type: "storage_config".to_string(),
            target_id: "oss".to_string(),
        },
        1,
        1,
    )
    .await
    .expect("audit page should load");
    assert_eq!(page.total_items, 2);
    assert_eq!(page.total_pages(), 2);
    assert_eq!(page.items.len(), 1);

    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/audit?action=storage.config.save&target_type=storage_config&target_id=oss&page=1&per_page=1")
                .header(header::COOKIE, cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    assert!(body.contains(r#"aria-label="审计日志筛选""#));
    assert!(body.contains(r#"value="storage.config.save""#));
    assert!(body.contains(r#"value="storage_config""#));
    assert!(body.contains(r#"value="oss""#));
    assert!(body.contains("保存对象存储配置"));
    assert!(!body.contains("创建用户"));
    assert!(body.contains("当前显示 1-1"));
    assert!(body.contains("共 2 条"));
    assert!(body.contains("data-pagination-size"));
    assert!(body.contains("value=\"100\""));
    assert!(body.contains("aria-label=\"跳转页码\""));
    assert!(body.contains(r#"aria-label="下一页""#));
    assert!(body.contains("action=storage.config.save"));
    assert!(body.contains("target_type=storage_config"));
    assert!(body.contains("target_id=oss"));
    assert!(body.contains("page=2"));
    assert!(body.contains("per_page=1"));
}

#[tokio::test]
async fn api_system_audit_lists_logs_with_filters_and_permission() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    audit::record(
        &pool,
        Some(1),
        "project.create",
        "project",
        "YCE",
        r#"{"source":"test"}"#,
    )
    .await
    .expect("audit log should write");
    audit::record(
        &pool,
        Some(1),
        "storage.config.save",
        "storage_config",
        "oss",
        r#"{"source":"test"}"#,
    )
    .await
    .expect("audit log should write");
    create_user_with_role(
        &pool,
        "audit_api_member",
        "审计普通成员",
        "MemberPass2026!",
        "member",
    )
    .await;
    let admin_session = auth::login(&pool, "admin", "AdminPass2026!")
        .await
        .expect("admin should login");
    let member_session = auth::login(&pool, "audit_api_member", "MemberPass2026!")
        .await
        .expect("member should login");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/audit?action=project.create&page=1&per_page=10")
                .header(
                    header::COOKIE,
                    auth::session_cookie_header(&admin_session.raw_token, false),
                )
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    assert!(body.contains(r#""action":"project.create""#));
    assert!(body.contains(r#""target_id":"YCE""#));
    assert!(body.contains(r#""ip":""#));
    assert!(body.contains(r#""user_agent":""#));
    assert!(body.contains(r#""total_items":1"#));
    assert!(!body.contains(r#""action":"storage.config.save""#));

    let forbidden_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/audit")
                .header(
                    header::COOKIE,
                    auth::session_cookie_header(&member_session.raw_token, false),
                )
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(forbidden_response.status(), StatusCode::FORBIDDEN);
}

async fn bootstrap_admin_session(pool: &sqlx::SqlitePool) {
    bootstrap::bootstrap_init(
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
    }
}

fn csrf_cookie() -> String {
    format!("yuance_csrf={CSRF_TOKEN}")
}

fn with_csrf_cookie(session_cookie: &str) -> String {
    format!("{session_cookie}; {}", csrf_cookie())
}

fn with_csrf(body: &str) -> String {
    format!("{body}&_csrf={CSRF_TOKEN}")
}
