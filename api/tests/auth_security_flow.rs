use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use std::sync::{Mutex, OnceLock};
use tower::ServiceExt;
use yuance_api::{
    domains::{auth, bootstrap, users},
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
    assert!(body.contains("placeholder=\"请输入用户名\""));
    assert!(!body.contains("placeholder=\"yuance_admin\""));
    assert!(!body.contains("env-badge"));
    assert!(!body.contains("统一入口 /web"));
}

#[tokio::test]
async fn login_page_preserves_safe_return_to_for_web_app() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/login?return_to=%2Fweb%2Fapp%2Fmessages%3Ftab%3Drecent")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    assert!(body.contains("name=\"return_to\" value=\"/web/app/messages?tab=recent\""));
}

#[tokio::test]
async fn login_submit_redirects_to_safe_return_to_when_present() {
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
                    "username=admin&password=AdminPass2026%21&return_to=%2Fweb%2Fapp%2Fmessages%3Ftab%3Drecent",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/app/messages?tab=recent"
    );
}

#[tokio::test]
async fn login_submit_rejects_cross_origin_return_to() {
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
                    "username=admin&password=AdminPass2026%21&return_to=https%3A%2F%2Fevil.example",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(response.headers().get(header::LOCATION).unwrap(), "/web");
}

#[tokio::test]
async fn message_open_redirects_unauthenticated_user_to_login_with_safe_return_to() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/messages/42/open")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/login?return_to=%2Fweb%2Fmessages%2F42%2Fopen"
    );
}

#[tokio::test]
async fn web_app_message_owner_redirects_unauthenticated_request_with_safe_return_to() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/messages?filter=unread&page=2&per_page=20")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/login?return_to=%2Fweb%2Fmessages%3Ffilter%3Dunread%26page%3D2%26per_page%3D20"
    );
}

#[tokio::test]
async fn web_app_system_owner_redirects_unauthenticated_request_with_safe_return_to() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/login?return_to=%2Fweb%2Fsystem"
    );
}

#[tokio::test]
async fn web_app_system_users_owner_redirects_unauthenticated_request_with_safe_return_to() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/users?page=2&per_page=20")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/login?return_to=%2Fweb%2Fsystem%2Fusers%3Fpage%3D2%26per_page%3D20"
    );
}

#[tokio::test]
async fn web_app_system_roles_owners_preserve_unauthenticated_return_paths() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    for (uri, expected) in [
        (
            "/web/system/roles?role=member&page=2&per_page=20",
            "/web/login?return_to=%2Fweb%2Fsystem%2Froles%3Frole%3Dmember%26page%3D2%26per_page%3D20",
        ),
        (
            "/web/system/roles/member/permissions?per_page=20",
            "/web/login?return_to=%2Fweb%2Fsystem%2Froles%2Fmember%2Fpermissions%3Fper_page%3D20",
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(uri)
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::SEE_OTHER);
        assert_eq!(response.headers().get(header::LOCATION).unwrap(), expected);
    }
}

#[tokio::test]
async fn web_app_system_storage_owner_preserves_unauthenticated_return_path() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/storage?page=2&per_page=20")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/login?return_to=%2Fweb%2Fsystem%2Fstorage%3Fpage%3D2%26per_page%3D20"
    );
}

#[tokio::test]
async fn web_app_system_releases_owner_preserves_unauthenticated_return_path() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/releases?page=2&per_page=20")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/login?return_to=%2Fweb%2Fsystem%2Freleases%3Fpage%3D2%26per_page%3D20"
    );
}

#[tokio::test]
async fn web_app_system_openapi_owner_preserves_unauthenticated_return_path() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/openapi")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/login?return_to=%2Fweb%2Fsystem%2Fopenapi"
    );
}

#[tokio::test]
async fn web_app_system_openapi_owner_keeps_rust_permission_gate() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let user_id = users::create_user(
        &pool,
        users::CreateUserInput {
            username: "system_openapi_denied".to_string(),
            display_name: "系统 Token 拒绝用户".to_string(),
            email: String::new(),
            mobile: String::new(),
            password: "MemberPass2026!".to_string(),
            role_code: "member".to_string(),
        },
    )
    .await
    .expect("member should create");
    let session = auth::issue_session(&pool, user_id, 3600)
        .await
        .expect("member session should issue");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/openapi")
                .header(
                    header::COOKIE,
                    auth::session_cookie_header(&session.raw_token, false),
                )
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn web_app_system_permissions_owner_preserves_unauthenticated_return_path() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/permissions?q=roles")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/login?return_to=%2Fweb%2Fsystem%2Fpermissions%3Fq%3Droles"
    );
}

#[tokio::test]
async fn web_app_system_permissions_owner_keeps_rust_permission_gate() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let user_id = users::create_user(
        &pool,
        users::CreateUserInput {
            username: "system_permissions_denied".to_string(),
            display_name: "权限目录拒绝用户".to_string(),
            email: String::new(),
            mobile: String::new(),
            password: "MemberPass2026!".to_string(),
            role_code: "member".to_string(),
        },
    )
    .await
    .expect("member should create");
    let session = auth::issue_session(&pool, user_id, 3600)
        .await
        .expect("member session should issue");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/permissions")
                .header(
                    header::COOKIE,
                    auth::session_cookie_header(&session.raw_token, false),
                )
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn web_app_system_database_stats_owner_preserves_unauthenticated_return_path() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/database-stats")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/login?return_to=%2Fweb%2Fsystem%2Fdatabase-stats"
    );
}

#[tokio::test]
async fn web_app_system_database_stats_owner_keeps_rust_permission_gate() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let user_id = users::create_user(
        &pool,
        users::CreateUserInput {
            username: "system_database_stats_denied".to_string(),
            display_name: "数据库统计拒绝用户".to_string(),
            email: String::new(),
            mobile: String::new(),
            password: "MemberPass2026!".to_string(),
            role_code: "member".to_string(),
        },
    )
    .await
    .expect("member should create");
    let session = auth::issue_session(&pool, user_id, 3600)
        .await
        .expect("member session should issue");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/database-stats")
                .header(
                    header::COOKIE,
                    auth::session_cookie_header(&session.raw_token, false),
                )
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn web_app_system_audit_owner_preserves_unauthenticated_return_path() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/audit?action=auth.login&page=2&per_page=20")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/login?return_to=%2Fweb%2Fsystem%2Faudit%3Faction%3Dauth.login%26page%3D2%26per_page%3D20"
    );
}

#[tokio::test]
async fn web_app_system_audit_owner_keeps_rust_permission_gate() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let user_id = users::create_user(
        &pool,
        users::CreateUserInput {
            username: "system_audit_denied".to_string(),
            display_name: "审计日志拒绝用户".to_string(),
            email: String::new(),
            mobile: String::new(),
            password: "MemberPass2026!".to_string(),
            role_code: "member".to_string(),
        },
    )
    .await
    .expect("member should create");
    let session = auth::issue_session(&pool, user_id, 3600)
        .await
        .expect("member session should issue");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/audit")
                .header(
                    header::COOKIE,
                    auth::session_cookie_header(&session.raw_token, false),
                )
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn web_app_system_api_docs_owner_preserves_unauthenticated_return_path() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/api-docs")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/login?return_to=%2Fweb%2Fsystem%2Fapi-docs"
    );
}

#[tokio::test]
async fn web_app_system_api_docs_owner_keeps_rust_permission_gate() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let user_id = users::create_user(
        &pool,
        users::CreateUserInput {
            username: "system_api_docs_denied".to_string(),
            display_name: "系统文档拒绝用户".to_string(),
            email: String::new(),
            mobile: String::new(),
            password: "MemberPass2026!".to_string(),
            role_code: "member".to_string(),
        },
    )
    .await
    .expect("member should create");
    let session = auth::issue_session(&pool, user_id, 3600)
        .await
        .expect("member session should issue");
    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/api-docs")
                .header(
                    header::COOKIE,
                    auth::session_cookie_header(&session.raw_token, false),
                )
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn web_app_system_owner_keeps_rust_permission_gate() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let user_id = users::create_user(
        &pool,
        users::CreateUserInput {
            username: "system_denied".to_string(),
            display_name: "系统拒绝用户".to_string(),
            email: String::new(),
            mobile: String::new(),
            password: "MemberPass2026!".to_string(),
            role_code: "member".to_string(),
        },
    )
    .await
    .expect("member should create");
    let session = auth::issue_session(&pool, user_id, 3600)
        .await
        .expect("member session should issue");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system")
                .header(
                    header::COOKIE,
                    auth::session_cookie_header(&session.raw_token, false),
                )
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn web_app_system_users_owner_keeps_rust_permission_gate() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let user_id = users::create_user(
        &pool,
        users::CreateUserInput {
            username: "system_users_denied".to_string(),
            display_name: "用户管理拒绝用户".to_string(),
            email: String::new(),
            mobile: String::new(),
            password: "MemberPass2026!".to_string(),
            role_code: "member".to_string(),
        },
    )
    .await
    .expect("member should create");
    let session = auth::issue_session(&pool, user_id, 3600)
        .await
        .expect("member session should issue");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/users")
                .header(
                    header::COOKIE,
                    auth::session_cookie_header(&session.raw_token, false),
                )
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn web_app_system_roles_owners_keep_rust_permission_gate() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let user_id = users::create_user(
        &pool,
        users::CreateUserInput {
            username: "system_roles_denied".to_string(),
            display_name: "角色管理拒绝用户".to_string(),
            email: String::new(),
            mobile: String::new(),
            password: "MemberPass2026!".to_string(),
            role_code: "member".to_string(),
        },
    )
    .await
    .expect("member should create");
    let session = auth::issue_session(&pool, user_id, 3600)
        .await
        .expect("member session should issue");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    for uri in ["/web/system/roles", "/web/system/roles/member/permissions"] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(uri)
                    .header(
                        header::COOKIE,
                        auth::session_cookie_header(&session.raw_token, false),
                    )
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
}

#[tokio::test]
async fn web_app_system_storage_owner_keeps_rust_permission_gate() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let user_id = users::create_user(
        &pool,
        users::CreateUserInput {
            username: "system_storage_denied".to_string(),
            display_name: "存储管理拒绝用户".to_string(),
            email: String::new(),
            mobile: String::new(),
            password: "MemberPass2026!".to_string(),
            role_code: "member".to_string(),
        },
    )
    .await
    .expect("member should create");
    let session = auth::issue_session(&pool, user_id, 3600)
        .await
        .expect("member session should issue");
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/storage")
                .header(
                    header::COOKIE,
                    auth::session_cookie_header(&session.raw_token, false),
                )
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn web_app_project_owner_preserves_deep_link_query_for_unauthenticated_request() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/projects/YCE/resources/9?access=opaque-token")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/login?return_to=%2Fweb%2Fprojects%2FYCE%2Fresources%2F9%3Faccess%3Dopaque-token"
    );
}

#[tokio::test]
async fn web_app_work_item_list_owner_preserves_filter_query_for_unauthenticated_request() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/tasks?status=pending&priority=P0&page=2&per_page=20")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/login?return_to=%2Fweb%2Ftasks%3Fstatus%3Dpending%26priority%3DP0%26page%3D2%26per_page%3D20"
    );
}

#[tokio::test]
async fn web_app_work_item_detail_owner_preserves_deep_link_query_for_unauthenticated_request() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("true"));

    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/work-items/YCE-TASK-2?focus=comment-7")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web/login?return_to=%2Fweb%2Fwork-items%2FYCE-TASK-2%3Ffocus%3Dcomment-7"
    );
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
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", Some("false"));

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
async fn api_auth_me_refreshes_expired_access_cookie_when_refresh_cookie_is_valid() {
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
    let set_cookies = set_cookie_values(login_response.headers());
    let session_cookie = set_cookies
        .iter()
        .find(|cookie| cookie.starts_with("yuance_session="))
        .cloned()
        .expect("session cookie should be set");
    let refresh_cookie = set_cookies
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

    let me_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/me")
                .header(
                    header::COOKIE,
                    format!("{session_cookie}; {refresh_cookie}"),
                )
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(me_response.status(), StatusCode::OK);
    let refreshed_cookies = set_cookie_values(me_response.headers());
    assert!(
        refreshed_cookies
            .iter()
            .any(|cookie| { cookie.starts_with("yuance_session=") && cookie != &session_cookie })
    );
    assert!(
        refreshed_cookies
            .iter()
            .any(|cookie| { cookie.starts_with("yuance_refresh=") && cookie != &refresh_cookie })
    );
    let me_body = response_body(me_response).await;
    assert!(me_body.contains(r#""username":"admin""#));
}

#[tokio::test]
async fn authenticated_requests_extend_refresh_cookie_window() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

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
    let set_cookies = set_cookie_values(login_response.headers());
    let session_cookie = set_cookies
        .iter()
        .find(|cookie| cookie.starts_with("yuance_session="))
        .cloned()
        .expect("session cookie should be set");
    let refresh_cookie = set_cookies
        .iter()
        .find(|cookie| cookie.starts_with("yuance_refresh="))
        .cloned()
        .expect("refresh cookie should be set");

    let me_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/me")
                .header(
                    header::COOKIE,
                    format!("{session_cookie}; {refresh_cookie}"),
                )
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(me_response.status(), StatusCode::OK);
    let refreshed_cookies = set_cookie_values(me_response.headers());
    assert!(refreshed_cookies.iter().any(|cookie| {
        cookie.starts_with("yuance_refresh=") && cookie.contains("Max-Age=2592000")
    }));
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
    let _guard = env_lock().lock().expect("env lock should acquire");
    let _web_shell = EnvOverride::set("YUANCE_WEB_APP_SHELL_V1", None);
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
        "/web/login?return_to=%2Fweb"
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
                    r#"{"name":"Agent 测试","scopes":["project:read"],"project_scope":"all"}"#,
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
    assert_eq!(created["data"]["token"]["name"], "Agent 测试");

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
    assert!(list_body.contains("Agent 测试"));
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
async fn retired_personal_web_mutation_routes_are_not_registered() {
    let app = build_router(AppState::for_tests());

    for (uri, method) in [
        ("/web/me/profile", "POST"),
        ("/web/me/password", "POST"),
        ("/web/me/api-tokens", "POST"),
        ("/web/me/api-tokens/7/edit", "POST"),
        ("/web/me/api-tokens/7/delete", "POST"),
        ("/web/me/device-sessions/family-7/revoke", "POST"),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(uri)
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::NOT_FOUND, "{method} {uri}");
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
        device_sessions: Default::default(),
        experimental_legacy_preview_enabled: false,
    }
}

fn env_lock() -> &'static Mutex<()> {
    static ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    ENV_LOCK.get_or_init(|| Mutex::new(()))
}

struct EnvOverride {
    key: &'static str,
    previous: Option<String>,
}

impl EnvOverride {
    fn set(key: &'static str, value: Option<&str>) -> Self {
        let previous = std::env::var(key).ok();
        unsafe {
            match value {
                Some(value) => std::env::set_var(key, value),
                None => std::env::remove_var(key),
            }
        }
        Self { key, previous }
    }
}

impl Drop for EnvOverride {
    fn drop(&mut self) {
        unsafe {
            match self.previous.take() {
                Some(value) => std::env::set_var(self.key, value),
                None => std::env::remove_var(self.key),
            }
        }
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
