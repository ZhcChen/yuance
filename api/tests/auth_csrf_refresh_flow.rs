use std::fs;

use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use tower::ServiceExt;
use uuid::Uuid;
use yuance_api::{
    domains::{auth, bootstrap},
    platform::{config::Settings, db, security::csrf::CSRF_COOKIE_NAME},
    web::router::{AppState, build_router},
};

#[tokio::test]
async fn api_auth_csrf_issues_cookie_for_authenticated_session() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/csrf")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let csrf_header = response
        .headers()
        .get("x-yuance-csrf-token")
        .and_then(|value| value.to_str().ok())
        .expect("csrf header should exist")
        .to_string();
    assert_eq!(csrf_header.len(), 64);

    let csrf_cookie = set_cookie_values(response.headers())
        .into_iter()
        .find(|cookie| cookie.starts_with(&format!("{CSRF_COOKIE_NAME}=")))
        .expect("csrf cookie should be set");
    assert_eq!(csrf_cookie_value(&csrf_cookie), csrf_header);

    let body = response_body(response).await;
    assert!(body.contains(&format!(r#""csrf_token":"{csrf_header}""#)));
}

#[tokio::test]
async fn authenticated_get_requests_reissue_csrf_cookie_when_missing() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/me")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let cookies = set_cookie_values(response.headers());
    assert!(
        cookies
            .iter()
            .any(|cookie| cookie.starts_with(&format!("{CSRF_COOKIE_NAME}=")))
    );
    let csrf_header = response
        .headers()
        .get("x-yuance-csrf-token")
        .and_then(|value| value.to_str().ok())
        .expect("csrf header should exist");
    assert_eq!(csrf_header.len(), 64);
}

#[tokio::test]
async fn api_auth_csrf_refreshes_expired_access_session_when_refresh_cookie_is_valid() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

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

    let login_cookies = set_cookie_values(login_response.headers());
    let session_cookie = login_cookies
        .iter()
        .find(|cookie| cookie.starts_with("yuance_session="))
        .cloned()
        .expect("session cookie should be set");
    let refresh_cookie = login_cookies
        .iter()
        .find(|cookie| cookie.starts_with("yuance_refresh="))
        .cloned()
        .expect("refresh cookie should be set");

    sqlx::query(
        r#"
        UPDATE sessions
        SET expires_at = datetime('now', '-5 seconds')
        WHERE user_id = (
            SELECT id FROM users WHERE username = 'admin'
        )
          AND session_status = 'active'
        "#,
    )
    .execute(&pool)
    .await
    .expect("sessions should expire");

    let csrf_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/csrf")
                .header(
                    header::COOKIE,
                    format!("{session_cookie}; {refresh_cookie}"),
                )
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(csrf_response.status(), StatusCode::OK);
    let refreshed_cookies = set_cookie_values(csrf_response.headers());
    assert!(
        refreshed_cookies
            .iter()
            .any(|cookie| cookie.starts_with("yuance_session=") && cookie != &session_cookie)
    );
    assert!(
        refreshed_cookies
            .iter()
            .any(|cookie| cookie.starts_with("yuance_refresh=") && cookie != &refresh_cookie)
    );
    assert!(
        refreshed_cookies
            .iter()
            .any(|cookie| cookie.starts_with(&format!("{CSRF_COOKIE_NAME}=")))
    );
    assert_eq!(
        csrf_response
            .headers()
            .get("x-yuance-csrf-token")
            .and_then(|value| value.to_str().ok())
            .map(str::len),
        Some(64)
    );
}

#[tokio::test]
async fn api_auth_csrf_retries_same_refresh_after_rotation_without_logout() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

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

    let login_cookies = set_cookie_values(login_response.headers());
    let session_cookie = login_cookies
        .iter()
        .find(|cookie| cookie.starts_with("yuance_session="))
        .cloned()
        .expect("session cookie should be set");
    let refresh_cookie = login_cookies
        .iter()
        .find(|cookie| cookie.starts_with("yuance_refresh="))
        .cloned()
        .expect("refresh cookie should be set");
    let old_cookies = format!("{session_cookie}; {refresh_cookie}");

    sqlx::query(
        r#"
        UPDATE sessions
        SET expires_at = datetime('now', '-5 seconds')
        WHERE user_id = (
            SELECT id FROM users WHERE username = 'admin'
        )
          AND session_status = 'active'
        "#,
    )
    .execute(&pool)
    .await
    .expect("sessions should expire");

    let first_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/csrf")
                .header(header::COOKIE, &old_cookies)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(first_response.status(), StatusCode::OK);
    let first_cookies = set_cookie_values(first_response.headers());
    let rotated_session_cookie = first_cookies
        .iter()
        .find(|cookie| cookie.starts_with("yuance_session="))
        .cloned()
        .expect("rotation should set an access cookie");
    let rotated_refresh_cookie = first_cookies
        .iter()
        .find(|cookie| cookie.starts_with("yuance_refresh="))
        .cloned()
        .expect("rotation should set a refresh cookie");

    let retry_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/csrf")
                .header(header::COOKIE, old_cookies)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(retry_response.status(), StatusCode::OK);
    let retry_cookies = set_cookie_values(retry_response.headers());
    assert!(retry_cookies.contains(&rotated_session_cookie));
    assert!(retry_cookies.contains(&rotated_refresh_cookie));
}

#[tokio::test]
async fn concurrent_refresh_requests_share_one_rotation_result() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let login_response = app
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
    let refresh_cookie = set_cookie_values(login_response.headers())
        .into_iter()
        .find(|cookie| cookie.starts_with("yuance_refresh="))
        .expect("refresh cookie should be set");
    let refresh_token = csrf_cookie_value(&refresh_cookie);

    sqlx::query(
        r#"
        UPDATE sessions
        SET expires_at = datetime('now', '-5 seconds')
        WHERE user_id = (
            SELECT id FROM users WHERE username = 'admin'
        )
          AND session_status = 'active'
        "#,
    )
    .execute(&pool)
    .await
    .expect("sessions should expire");

    let (first, second) = tokio::join!(
        auth::refresh_session(
            &pool,
            &refresh_token,
            2 * 60 * 60,
            30 * 24 * 60 * 60,
            5 * 60,
            "test-security-master-key-that-is-long-enough",
        ),
        auth::refresh_session(
            &pool,
            &refresh_token,
            2 * 60 * 60,
            30 * 24 * 60 * 60,
            5 * 60,
            "test-security-master-key-that-is-long-enough",
        ),
    );
    let first = first
        .expect("first refresh should succeed")
        .expect("first refresh should issue a session");
    let second = second
        .expect("second refresh should succeed")
        .expect("second refresh should recover the rotation");

    assert_eq!(first.raw_token, second.raw_token);
    assert_eq!(first.refresh_token, second.refresh_token);
}

#[tokio::test]
async fn logout_clears_old_refresh_rotation_recovery() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let login_response = app
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
    let old_refresh_cookie = set_cookie_values(login_response.headers())
        .into_iter()
        .find(|cookie| cookie.starts_with("yuance_refresh="))
        .expect("refresh cookie should be set");
    let old_refresh_token = csrf_cookie_value(&old_refresh_cookie);

    sqlx::query(
        r#"
        UPDATE sessions
        SET expires_at = datetime('now', '-5 seconds')
        WHERE user_id = (
            SELECT id FROM users WHERE username = 'admin'
        )
          AND session_status = 'active'
        "#,
    )
    .execute(&pool)
    .await
    .expect("sessions should expire");

    let rotated = auth::refresh_session(
        &pool,
        &old_refresh_token,
        2 * 60 * 60,
        30 * 24 * 60 * 60,
        5 * 60,
        &test_settings().security_master_key,
    )
    .await
    .expect("refresh should succeed")
    .expect("refresh should issue a session");
    auth::revoke_refresh_session(&pool, &rotated.refresh_token, "logout")
        .await
        .expect("logout should revoke the current refresh session");

    let recovered = auth::refresh_session(
        &pool,
        &old_refresh_token,
        2 * 60 * 60,
        30 * 24 * 60 * 60,
        5 * 60,
        &test_settings().security_master_key,
    )
    .await
    .expect("old refresh lookup should succeed");
    assert!(recovered.is_none());
}

#[tokio::test]
async fn browser_session_survives_reconnecting_same_sqlite_database() {
    let database_path =
        std::env::temp_dir().join(format!("yuance-auth-restart-{}.sqlite3", Uuid::new_v4()));
    let mut settings = test_settings();
    settings.database_url = format!("sqlite://{}", database_path.display());
    settings.data_dir = database_path
        .parent()
        .expect("temporary database should have a parent")
        .display()
        .to_string();

    let first_pool = db::connect_pool(&settings)
        .await
        .expect("first pool should connect");
    db::run_migrations(&first_pool)
        .await
        .expect("first migrations should run");
    let initialized = bootstrap::bootstrap_init(
        &first_pool,
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
    drop(first_pool);

    let second_pool = db::connect_pool(&settings)
        .await
        .expect("second pool should connect to the same database");
    let app = build_router(AppState::new(settings, Some(second_pool)));
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/me")
                .header(header::COOKIE, cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);

    for suffix in ["", "-wal", "-shm"] {
        let _ = fs::remove_file(format!("{}{}", database_path.display(), suffix));
    }
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
        cookie: auth::session_cookie_header(&result.session.raw_token, false),
    }
}

struct InitializedAdmin {
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
        session_ttl: "2h".to_string(),
        refresh_session_ttl: "30d".to_string(),
        cache_session_ttl: "5m".to_string(),
        log_level: "off".to_string(),
        env: "test".to_string(),
        security_master_key: "test-master-key-that-is-long-enough".to_string(),
        file_master_key: "test-file-master-key-that-is-long-enough".to_string(),
        device_sessions: Default::default(),
        experimental_legacy_preview_enabled: false,
    }
}

fn csrf_cookie_value(cookie: &str) -> String {
    cookie
        .split(';')
        .next()
        .and_then(|part| part.split_once('='))
        .map(|(_, value)| value.to_string())
        .expect("csrf cookie should include a token")
}

fn set_cookie_values(headers: &axum::http::HeaderMap) -> Vec<String> {
    headers
        .get_all(header::SET_COOKIE)
        .iter()
        .map(|value| value.to_str().expect("cookie should be ascii").to_string())
        .collect()
}
