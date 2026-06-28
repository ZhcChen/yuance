use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use tower::ServiceExt;
use yuance_api::{
    domains::{auth, bootstrap},
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

    assert_eq!(response.status(), StatusCode::TEMPORARY_REDIRECT);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/login"
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
