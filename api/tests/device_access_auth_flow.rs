use std::net::SocketAddr;

use axum::{
    Router,
    body::Body,
    extract::ConnectInfo,
    http::{Request, StatusCode, header},
    response::Response,
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{Duration, SecondsFormat, Utc};
use http_body_util::BodyExt;
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use tower::ServiceExt;
use uuid::Uuid;
use yuance_api::{
    domains::{api_tokens, auth, bootstrap, device_sessions, system_api_tokens},
    platform::{config::Settings, db, security::csrf::CSRF_COOKIE_NAME},
    web::router::{AppState, build_router},
};

const PROBE_PATH: &str = "/api/v1/device-session";
const LOGOUT_PATH: &str = "/api/v1/device-session/logout";
const CODE_VERIFIER: &str = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-._~";
const CSRF_TOKEN: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

#[tokio::test]
async fn device_access_probes_logs_out_and_cannot_enter_business_api() {
    let pool = test_pool().await;
    let (user_id, session_cookie) = bootstrap_admin_session(&pool).await;
    let credentials = issue_device_credentials(&pool, user_id, "probe-device").await;
    let app = test_app(pool.clone());

    let response = device_request(&app, "GET", PROBE_PATH, &credentials.access_token, None).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_no_store(&response);
    let body = json_body(response).await;
    assert_eq!(body["data"]["user_id"], user_id);
    assert_eq!(body["data"]["device_id"], credentials.device_id);
    assert_eq!(body["data"]["family_id"], credentials.family_id);
    assert_eq!(body["data"]["generation"], 0);
    assert!(body["data"].get("access_token").is_none());
    assert!(body["data"].get("refresh_token").is_none());

    let response = device_request(
        &app,
        "GET",
        "/api/v1/auth/me",
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let first_logout = device_request(&app, "POST", LOGOUT_PATH, &credentials.access_token, None);
    let second_logout = device_request(&app, "POST", LOGOUT_PATH, &credentials.access_token, None);
    let (first_logout, second_logout) = tokio::join!(first_logout, second_logout);
    let logout_statuses = [first_logout.status(), second_logout.status()];
    assert!(logout_statuses.contains(&StatusCode::OK));
    assert!(
        logout_statuses
            .iter()
            .all(|status| matches!(*status, StatusCode::OK | StatusCode::UNAUTHORIZED))
    );
    for response in [first_logout, second_logout] {
        assert_no_store(&response);
        let status = response.status();
        let body = json_body(response).await;
        if status == StatusCode::OK {
            assert_eq!(body["data"]["revoked"], true);
        } else {
            assert_eq!(body["error"]["code"], "device_session_revoked");
        }
    }

    let response = device_request(&app, "GET", PROBE_PATH, &credentials.access_token, None).await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_device_error(response, "device_session_revoked").await;
    let statuses = sqlx::query_as::<_, (String, String, String)>(
        r#"
        SELECT family.family_status, access.session_status, refresh.credential_status
        FROM device_credential_families family
        JOIN device_access_sessions access ON access.family_id = family.id
        JOIN device_refresh_credentials refresh ON refresh.family_id = family.id
        WHERE family.id = ?1
        "#,
    )
    .bind(&credentials.family_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        statuses,
        ("revoked".into(), "revoked".into(), "revoked".into())
    );
    assert!(!session_cookie.is_empty());
}

#[tokio::test]
async fn device_endpoints_reject_cookie_pat_system_and_refresh_credentials() {
    let pool = test_pool().await;
    let (user_id, session_cookie) = bootstrap_admin_session(&pool).await;
    let credentials = issue_device_credentials(&pool, user_id, "credential-boundary").await;
    let pat = api_tokens::create_token(
        &pool,
        &test_settings().security_master_key,
        user_id,
        api_tokens::CreateApiTokenInput {
            name: "Boundary PAT".to_string(),
            scopes: vec![api_tokens::SCOPE_PROJECT_READ.to_string()],
            project_scope: "all".to_string(),
            expires_at: String::new(),
        },
    )
    .await
    .unwrap();
    let system = system_api_tokens::create_token(
        &pool,
        &test_settings().security_master_key,
        user_id,
        system_api_tokens::CreateSystemApiTokenInput {
            name: "Boundary System Token".to_string(),
            scopes: vec![system_api_tokens::SCOPE_SYSTEM_RELEASE_READ.to_string()],
        },
    )
    .await
    .unwrap();
    let app = test_app(pool.clone());

    let response = device_request(&app, "GET", PROBE_PATH, "", Some(&session_cookie)).await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_device_error(response, "credential_not_allowed").await;

    for token in [
        pat.raw_token.as_str(),
        system.raw_token.as_str(),
        credentials.refresh_token.as_str(),
    ] {
        let response = device_request(&app, "GET", PROBE_PATH, token, None).await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_device_error(response, "invalid_device_access").await;
    }

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(PROBE_PATH)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_device_error(response, "invalid_device_access").await;

    let mut request = Request::builder()
        .uri(PROBE_PATH)
        .body(Body::empty())
        .unwrap();
    request.headers_mut().append(
        header::AUTHORIZATION,
        format!("Bearer {}", credentials.access_token)
            .parse()
            .unwrap(),
    );
    request.headers_mut().append(
        header::AUTHORIZATION,
        format!("Bearer {}", pat.raw_token).parse().unwrap(),
    );
    let response = app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_device_error(response, "invalid_device_access").await;

    let mut request = Request::builder()
        .uri("/api/v1/projects")
        .body(Body::empty())
        .unwrap();
    request.headers_mut().append(
        header::AUTHORIZATION,
        format!("Bearer {}", pat.raw_token).parse().unwrap(),
    );
    request.headers_mut().append(
        header::AUTHORIZATION,
        format!("Bearer {}", credentials.access_token)
            .parse()
            .unwrap(),
    );
    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    for path in [
        "/api/v1/system/releases",
        "/api/v1/test-storage/download?object_key=missing",
    ] {
        let mut request = Request::builder().uri(path).body(Body::empty()).unwrap();
        request.headers_mut().append(
            header::AUTHORIZATION,
            format!("Bearer {}", system.raw_token).parse().unwrap(),
        );
        request.headers_mut().append(
            header::AUTHORIZATION,
            format!("Bearer {}", credentials.access_token)
                .parse()
                .unwrap(),
        );
        let response = test_app(pool.clone()).oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN, "path: {path}");
    }
}

#[tokio::test]
async fn disabled_user_and_expired_access_are_rejected() {
    let pool = test_pool().await;
    let (user_id, _) = bootstrap_admin_session(&pool).await;
    let credentials = issue_device_credentials(&pool, user_id, "state-boundary").await;
    let app = test_app(pool.clone());

    sqlx::query("UPDATE users SET status = 'disabled' WHERE id = ?1")
        .bind(user_id)
        .execute(&pool)
        .await
        .unwrap();
    let response = device_request(&app, "GET", PROBE_PATH, &credentials.access_token, None).await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_device_error(response, "user_inactive").await;

    sqlx::query("UPDATE users SET status = 'active' WHERE id = ?1")
        .bind(user_id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE devices SET device_status = 'revoked', revoked_at = ?1 WHERE id = ?2")
        .bind(Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true))
        .bind(&credentials.device_id)
        .execute(&pool)
        .await
        .unwrap();
    let response = device_request(&app, "GET", PROBE_PATH, &credentials.access_token, None).await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_device_error(response, "device_revoked").await;
    sqlx::query("UPDATE devices SET device_status = 'active', revoked_at = NULL WHERE id = ?1")
        .bind(&credentials.device_id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE device_access_sessions SET expires_at = ?1 WHERE family_id = ?2")
        .bind((Utc::now() - Duration::seconds(1)).to_rfc3339_opts(SecondsFormat::Secs, true))
        .bind(&credentials.family_id)
        .execute(&pool)
        .await
        .unwrap();
    let response = device_request(&app, "GET", PROBE_PATH, &credentials.access_token, None).await;
    let status = response.status();
    let body = json_body(response).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "unexpected body: {body}");
    assert_eq!(body["error"]["code"], "device_access_expired");
}

#[tokio::test]
async fn browser_lists_and_revokes_only_its_own_family_with_csrf() {
    let pool = test_pool().await;
    let (user_id, session_cookie) = bootstrap_admin_session(&pool).await;
    let credentials = issue_device_credentials(&pool, user_id, "Browser Managed Desktop").await;
    let mut settings = test_settings();
    settings.device_sessions.trusted_proxy_cidrs = "172.16.0.0/12".to_string();
    let app = build_router(AppState::new(settings, Some(pool.clone())));

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/me")
                .header(header::COOKIE, &session_cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(
        text_body(response)
            .await
            .contains("Browser Managed Desktop")
    );

    let revoke_path = format!("/web/me/device-sessions/{}/revoke", credentials.family_id);
    let response = browser_revoke(&app, &revoke_path, &session_cookie, "").await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let other_user_id = sqlx::query(
        "INSERT INTO users (username, password_hash, display_name, status) VALUES ('other-device-user', 'hash', 'Other Device User', 'active')",
    )
    .execute(&pool)
    .await
    .unwrap()
    .last_insert_rowid();
    let other_credentials = issue_device_credentials(&pool, other_user_id, "Other Desktop").await;
    let other_revoke_path = format!(
        "/web/me/device-sessions/{}/revoke",
        other_credentials.family_id
    );
    let cookie = format!("{session_cookie}; {CSRF_COOKIE_NAME}={CSRF_TOKEN}");
    let response = browser_revoke(&app, &other_revoke_path, &cookie, CSRF_TOKEN).await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let other_status: String =
        sqlx::query_scalar("SELECT family_status FROM device_credential_families WHERE id = ?1")
            .bind(&other_credentials.family_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(other_status, "active");

    let response = browser_revoke_from_peer(
        &app,
        &revoke_path,
        &cookie,
        CSRF_TOKEN,
        "172.17.0.1:43100",
        "192.0.2.99, 198.51.100.20",
    )
    .await;
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(response.headers().get(header::LOCATION).unwrap(), "/web/me");
    let family_status: String =
        sqlx::query_scalar("SELECT family_status FROM device_credential_families WHERE id = ?1")
            .bind(&credentials.family_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(family_status, "revoked");
    let audit_ip: String = sqlx::query_scalar(
        "SELECT ip FROM audit_logs WHERE action = 'device_session.revoke' AND target_id = ?1",
    )
    .bind(&credentials.family_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audit_ip, "198.51.100.20");

    let response = browser_revoke(&app, &revoke_path, &cookie, CSRF_TOKEN).await;
    assert_eq!(response.status(), StatusCode::SEE_OTHER);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(&revoke_path)
                .header(header::AUTHORIZATION, "Bearer yuance_pat_wrong-surface")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(format!("_csrf={CSRF_TOKEN}")))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn browser_revoke_rate_limit_is_shared_across_family_ids() {
    let pool = test_pool().await;
    let (_, session_cookie) = bootstrap_admin_session(&pool).await;
    let app = test_app(pool);
    let cookie = format!("{session_cookie}; {CSRF_COOKIE_NAME}={CSRF_TOKEN}");

    for index in 0..30 {
        let path = format!("/web/me/device-sessions/missing-{index}/revoke");
        let response = browser_revoke(&app, &path, &cookie, CSRF_TOKEN).await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
    let response = browser_revoke(
        &app,
        "/web/me/device-sessions/another-missing-family/revoke",
        &cookie,
        CSRF_TOKEN,
    )
    .await;
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
}

async fn issue_device_credentials(
    pool: &SqlitePool,
    user_id: i64,
    installation_id: &str,
) -> device_sessions::InitialDeviceCredentials {
    let now = Utc::now();
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(CODE_VERIFIER.as_bytes()));
    let policy = device_policy();
    let started = device_sessions::start_authorization(
        pool,
        &test_settings().security_master_key,
        &policy,
        device_sessions::StartAuthorizationInput {
            code_challenge: challenge,
            installation_id: installation_id.to_string(),
            device_name: installation_id.to_string(),
            platform: "test".to_string(),
            client_version: "0.1.0-test".to_string(),
        },
        now,
    )
    .await
    .unwrap();
    device_sessions::approve_authorization(pool, &started.authorization_id, user_id, now)
        .await
        .unwrap();
    device_sessions::exchange_authorization(
        pool,
        &test_settings().security_master_key,
        &policy,
        device_sessions::ExchangeAuthorizationInput {
            device_code: started.device_code,
            code_verifier: CODE_VERIFIER.to_string(),
            exchange_transaction_id: Uuid::new_v4().to_string(),
        },
        now,
    )
    .await
    .unwrap()
}

fn device_policy() -> device_sessions::DeviceSessionPolicy {
    device_sessions::DeviceSessionPolicy {
        server_instance_id: "device-access-test".to_string(),
        authorization_ttl_seconds: 600,
        access_ttl_seconds: 900,
        refresh_sliding_ttl_seconds: 30 * 24 * 60 * 60,
        refresh_absolute_ttl_seconds: 90 * 24 * 60 * 60,
        idempotency_ttl_seconds: 24 * 60 * 60,
        poll_interval_seconds: 5,
    }
}

async fn bootstrap_admin_session(pool: &SqlitePool) -> (i64, String) {
    let initialized = bootstrap::bootstrap_init(
        pool,
        bootstrap::BootstrapInitInput {
            username: "admin".to_string(),
            display_name: "系统管理员".to_string(),
            password: "AdminPass2026!".to_string(),
            password_confirm: "AdminPass2026!".to_string(),
        },
    )
    .await
    .unwrap();
    (
        initialized.user_id,
        cookie_pair(&auth::session_cookie_header(
            &initialized.session.raw_token,
            false,
        )),
    )
}

async fn browser_revoke(app: &Router, path: &str, cookie: &str, csrf: &str) -> Response {
    app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(path)
                .header(header::COOKIE, cookie)
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(format!("_csrf={csrf}")))
                .unwrap(),
        )
        .await
        .unwrap()
}

async fn browser_revoke_from_peer(
    app: &Router,
    path: &str,
    cookie: &str,
    csrf: &str,
    direct_peer: &str,
    forwarded_ip: &str,
) -> Response {
    let mut request = Request::builder()
        .method("POST")
        .uri(path)
        .header(header::COOKIE, cookie)
        .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
        .header("x-forwarded-for", forwarded_ip)
        .body(Body::from(format!("_csrf={csrf}")))
        .unwrap();
    request
        .extensions_mut()
        .insert(ConnectInfo(direct_peer.parse::<SocketAddr>().unwrap()));
    app.clone().oneshot(request).await.unwrap()
}

async fn device_request(
    app: &Router,
    method: &str,
    path: &str,
    token: &str,
    cookie: Option<&str>,
) -> Response {
    let mut request = Request::builder().method(method).uri(path);
    if !token.is_empty() {
        request = request.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    if let Some(cookie) = cookie {
        request = request.header(header::COOKIE, cookie);
    }
    app.clone()
        .oneshot(request.body(Body::empty()).unwrap())
        .await
        .unwrap()
}

async fn assert_device_error(response: Response, code: &str) {
    assert_no_store(&response);
    assert_eq!(json_body(response).await["error"]["code"], code);
}

fn assert_no_store(response: &Response) {
    assert_eq!(
        response
            .headers()
            .get(header::CACHE_CONTROL)
            .and_then(|value| value.to_str().ok()),
        Some("private, no-store")
    );
}

async fn json_body(response: Response) -> Value {
    serde_json::from_str(&text_body(response).await).unwrap()
}

async fn text_body(response: Response) -> String {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    String::from_utf8(bytes.to_vec()).unwrap()
}

fn cookie_pair(value: &str) -> String {
    value.split(';').next().unwrap().to_string()
}

async fn test_pool() -> SqlitePool {
    let settings = test_settings();
    let pool = db::connect_pool(&settings).await.unwrap();
    db::run_migrations(&pool).await.unwrap();
    pool
}

fn test_app(pool: SqlitePool) -> Router {
    build_router(AppState::new(test_settings(), Some(pool)))
}

fn test_settings() -> Settings {
    let mut settings = Settings {
        http_addr: "127.0.0.1:33033".parse().unwrap(),
        database_url: format!(
            "sqlite:file:device-access-{}?mode=memory&cache=shared",
            Uuid::new_v4()
        ),
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
    };
    settings.device_sessions.server_instance_id = "device-access-test".to_string();
    settings.device_sessions.trusted_proxy_cidrs.clear();
    settings
}
