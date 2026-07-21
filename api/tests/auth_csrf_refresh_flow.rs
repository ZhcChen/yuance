use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use tower::ServiceExt;
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
        security_master_key: "test-master-key".to_string(),
        onlyoffice_document_server_url: String::new(),
        onlyoffice_jwt_secret: String::new(),
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
