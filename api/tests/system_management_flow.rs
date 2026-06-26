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
async fn system_users_page_renders_accounts_and_roles_for_admin() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/users")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;

    assert!(body.contains("用户管理"));
    assert!(body.contains("系统管理员"));
    assert!(body.contains("系统管理"));
    assert!(body.contains("角色权限"));
}

#[tokio::test]
async fn admin_can_create_member_user_and_member_can_login() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/users")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
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
        "/web/system/users"
    );

    let role = user_role_code(&pool, "member1").await;
    assert_eq!(role, "member");

    let session = auth::login(&pool, "member1", "MemberPass2026!")
        .await
        .expect("created member should login");
    assert!(!session.raw_token.is_empty());
}

#[tokio::test]
async fn disabled_user_loses_existing_session() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    create_user_with_role(&pool, "member1", "成员一", "MemberPass2026!", "member").await;
    let member_session = auth::login(&pool, "member1", "MemberPass2026!")
        .await
        .expect("member should login");
    let member_cookie = auth::session_cookie_header(&member_session.raw_token, false);
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/users/member1/status")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf("status=disabled")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::SEE_OTHER);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web")
                .header(header::COOKIE, member_cookie)
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

#[tokio::test]
async fn resetting_password_revokes_old_sessions_and_allows_new_password() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    create_user_with_role(&pool, "member1", "成员一", "MemberPass2026!", "member").await;
    let member_session = auth::login(&pool, "member1", "MemberPass2026!")
        .await
        .expect("member should login");
    let member_cookie = auth::session_cookie_header(&member_session.raw_token, false);
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/users/member1/password")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf("password=MemberPass2027%21")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::SEE_OTHER);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web")
                .header(header::COOKIE, member_cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::TEMPORARY_REDIRECT);

    let old_login = auth::login(&pool, "member1", "MemberPass2026!").await;
    assert!(old_login.is_err());
    let new_login = auth::login(&pool, "member1", "MemberPass2027!")
        .await
        .expect("new password should login");
    assert!(!new_login.raw_token.is_empty());
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
                .uri("/web/system/users")
                .header(header::COOKIE, cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn custom_role_can_receive_permissions_and_drive_system_nav() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let create_role_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/roles")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf(
                    "role_code=system_viewer&role_name=%E7%B3%BB%E7%BB%9F%E8%A7%82%E5%AF%9F%E5%91%98&data_scope_type=self",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(create_role_response.status(), StatusCode::SEE_OTHER);

    let permissions_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/system/roles/system_viewer/permissions")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(permissions_response.status(), StatusCode::OK);
    let permissions_body = response_body(permissions_response).await;
    assert!(permissions_body.contains("系统观察员"));
    assert!(permissions_body.contains("system.users.view"));

    let update_permissions_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/roles/system_viewer/permissions")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf("permission_keys=system.users.view")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(update_permissions_response.status(), StatusCode::SEE_OTHER);

    create_user_with_role(
        &pool,
        "viewer1",
        "观察员一",
        "ViewerPass2026!",
        "system_viewer",
    )
    .await;
    let viewer_session = auth::login(&pool, "viewer1", "ViewerPass2026!")
        .await
        .expect("viewer should login");
    let viewer_cookie = auth::session_cookie_header(&viewer_session.raw_token, false);

    let users_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/system/users")
                .header(header::COOKIE, viewer_cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(users_response.status(), StatusCode::OK);
    let users_body = response_body(users_response).await;
    assert!(users_body.contains("用户管理"));
    assert!(users_body.contains("/web/system/users"));
    assert!(!users_body.contains("/web/system/roles"));
    assert!(!users_body.contains("/web/system/storage"));

    let roles_response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/roles")
                .header(header::COOKIE, viewer_cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(roles_response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn system_role_permissions_cannot_be_modified_from_page() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/roles/member/permissions")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf("permission_keys=project.view")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn role_status_controls_assigned_permissions() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    rbac::create_role(&pool, "system_viewer", "系统观察员", "self")
        .await
        .expect("role should create");
    rbac::replace_role_permissions(&pool, "system_viewer", &["system.users.view".to_string()])
        .await
        .expect("permissions should replace");
    create_user_with_role(
        &pool,
        "viewer1",
        "观察员一",
        "ViewerPass2026!",
        "system_viewer",
    )
    .await;
    let viewer_session = auth::login(&pool, "viewer1", "ViewerPass2026!")
        .await
        .expect("viewer should login");
    let viewer_cookie = auth::session_cookie_header(&viewer_session.raw_token, false);
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/roles/system_viewer/status")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(with_csrf("status=disabled")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::SEE_OTHER);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/users")
                .header(header::COOKIE, viewer_cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
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

async fn user_role_code(pool: &sqlx::SqlitePool, username: &str) -> String {
    sqlx::query_scalar::<_, String>(
        r#"
        SELECT r.role_code
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id
        WHERE u.username = ?1
        "#,
    )
    .bind(username)
    .fetch_one(pool)
    .await
    .expect("role code should load")
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

fn with_csrf_cookie(session_cookie: &str) -> String {
    format!("{session_cookie}; yuance_csrf={CSRF_TOKEN}")
}

fn with_csrf(body: &str) -> String {
    format!("{body}&_csrf={CSRF_TOKEN}")
}
