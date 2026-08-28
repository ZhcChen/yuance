use std::time::{Duration, Instant};

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
    response::Response,
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{Duration as ChronoDuration, Utc};
use http_body_util::BodyExt;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use tokio::time::timeout;
use tower::ServiceExt;
use uuid::Uuid;
use yuance_api::{
    domains::{bootstrap, device_sessions},
    platform::{config::Settings, db, realtime},
    web::router::{AppState, build_router},
};

const CONTROL_PATH: &str = "/api/v1/device-session/events";
const LOGOUT_PATH: &str = "/api/v1/device-session/logout";
const CODE_VERIFIER: &str = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-._~";

#[tokio::test]
async fn independent_app_state_observes_family_revoke_and_closes_within_deadline() {
    let settings = test_settings();
    let stream_pool = db::connect_pool(&settings).await.unwrap();
    db::run_migrations(&stream_pool).await.unwrap();
    let revoke_pool = db::connect_pool(&settings).await.unwrap();
    let user_id = bootstrap_admin(&stream_pool).await;
    let credentials = issue_device_credentials(&stream_pool, user_id, "sse-revoke").await;
    let stream_app = test_app_with_settings(stream_pool, settings.clone());
    let revoke_app = test_app_with_settings(revoke_pool, settings);
    let response =
        device_request(&stream_app, "GET", CONTROL_PATH, &credentials.access_token).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(header::CONTENT_TYPE).unwrap(),
        "text/event-stream"
    );
    let mut body = response.into_body();
    let first = next_frame(&mut body).await.expect("ready frame");
    assert!(String::from_utf8_lossy(&first).contains("event: connected"));

    tokio::time::sleep(Duration::from_millis(900)).await;
    let started = Instant::now();
    let logout = device_request(&revoke_app, "POST", LOGOUT_PATH, &credentials.access_token).await;
    assert_eq!(logout.status(), StatusCode::OK);
    wait_for_eof(&mut body).await;
    assert!(started.elapsed() < Duration::from_secs(5));
}

#[tokio::test]
async fn shutdown_signal_closes_an_active_control_stream() {
    let pool = test_pool().await;
    let user_id = bootstrap_admin(&pool).await;
    let credentials = issue_device_credentials(&pool, user_id, "sse-shutdown").await;
    let state = AppState::new(test_settings(), Some(pool));
    let app = build_router(state.clone());
    let response = device_request(&app, "GET", CONTROL_PATH, &credentials.access_token).await;
    assert_eq!(response.status(), StatusCode::OK);
    let mut body = response.into_body();
    let connected = next_frame(&mut body).await.expect("ready frame");
    assert!(String::from_utf8_lossy(&connected).contains("event: connected"));
    let release = next_frame(&mut body).await.expect("release frame");
    assert!(String::from_utf8_lossy(&release).contains("event: release-version"));
    let topbar = next_frame(&mut body).await.expect("topbar frame");
    assert!(String::from_utf8_lossy(&topbar).contains("event: topbar"));
    let started = Instant::now();
    state.shutdown_device_streams();
    wait_for_eof(&mut body).await;
    assert!(started.elapsed() < Duration::from_secs(5));
}

#[tokio::test]
async fn control_stream_rejects_missing_wrong_namespace_and_cookie_credentials() {
    let pool = test_pool().await;
    let app = test_app(pool);
    for token in [
        "",
        "yuance_pat_wrong",
        "yuance_drt_wrong",
        "yuance_sat_wrong",
    ] {
        let response = device_request(&app, "GET", CONTROL_PATH, token).await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
    let response = app
        .oneshot(
            Request::builder()
                .uri(CONTROL_PATH)
                .header(header::COOKIE, "yuance_session=forged")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn lease_revalidation_closes_for_every_persisted_authorization_change() {
    let pool = test_pool().await;
    let user_id = bootstrap_admin(&pool).await;

    let device = issue_device_credentials(&pool, user_id, "sse-device").await;
    assert_stream_closes_after(
        &pool,
        &device,
        sqlx::query("UPDATE devices SET device_status = 'revoked', revoked_at = ?1 WHERE id = ?2")
            .bind(Utc::now().to_rfc3339())
            .bind(&device.device_id),
    )
    .await;

    let version = issue_device_credentials(&pool, user_id, "sse-version").await;
    assert_stream_closes_after(
        &pool,
        &version,
        sqlx::query(
            "UPDATE devices SET authorization_version = authorization_version + 1 WHERE id = ?1",
        )
        .bind(&version.device_id),
    )
    .await;

    let expired = issue_device_credentials(&pool, user_id, "sse-expired").await;
    assert_stream_closes_after(
        &pool,
        &expired,
        sqlx::query("UPDATE device_access_sessions SET expires_at = ?1 WHERE family_id = ?2")
            .bind((Utc::now() - ChronoDuration::seconds(1)).to_rfc3339())
            .bind(&expired.family_id),
    )
    .await;

    let disabled = issue_device_credentials(&pool, user_id, "sse-user").await;
    assert_stream_closes_after(
        &pool,
        &disabled,
        sqlx::query("UPDATE users SET status = 'disabled' WHERE id = ?1").bind(user_id),
    )
    .await;
}

#[tokio::test]
async fn healthy_stream_receives_heartbeat_comment() {
    let pool = test_pool().await;
    let user_id = bootstrap_admin(&pool).await;
    let credentials = issue_device_credentials(&pool, user_id, "sse-pool").await;
    let app = test_app(pool.clone());
    let response = device_request(&app, "GET", CONTROL_PATH, &credentials.access_token).await;
    let mut body = response.into_body();
    let connected = next_frame(&mut body).await.expect("ready frame");
    assert!(String::from_utf8_lossy(&connected).contains("event: connected"));
    let release = next_frame(&mut body).await.expect("release frame");
    assert!(String::from_utf8_lossy(&release).contains("event: release-version"));
    let topbar = next_frame(&mut body).await.expect("topbar frame");
    assert!(String::from_utf8_lossy(&topbar).contains("event: topbar"));
    timeout(Duration::from_secs(2), async {
        loop {
            let frame = body
                .frame()
                .await
                .transpose()
                .expect("heartbeat frame")
                .expect("stream closed before heartbeat");
            let Some(data) = frame.into_data().ok() else {
                continue;
            };
            if String::from_utf8_lossy(&data).contains(": keep-alive") {
                break;
            }
        }
    })
    .await
    .expect("heartbeat deadline");

    drop(body);
}

#[tokio::test]
async fn control_stream_emits_only_targeted_topbar_refresh_facts() {
    let pool = test_pool().await;
    let user_id = bootstrap_admin(&pool).await;
    let credentials = issue_device_credentials(&pool, user_id, "sse-facts").await;
    let app = test_app(pool.clone());
    let response = device_request(&app, "GET", CONTROL_PATH, &credentials.access_token).await;
    let mut body = response.into_body();
    for _ in 0..3 {
        next_frame(&mut body).await.expect("initial fact");
    }

    realtime::publish_topbar_refresh_for_user(user_id + 1);
    realtime::publish_topbar_refresh_for_user(user_id);
    let refresh = timeout(Duration::from_millis(500), next_frame(&mut body))
        .await
        .expect("targeted refresh deadline")
        .expect("targeted refresh frame");
    let refresh = String::from_utf8_lossy(&refresh);
    assert!(refresh.contains("event: topbar"));
    assert!(refresh.contains("\"reason\":\"refresh\""));
}

#[tokio::test]
async fn exhausted_pool_hits_the_revalidation_timeout() {
    let mut settings = test_settings();
    settings.database_url = "sqlite::memory:".to_string();
    let pool = db::connect_pool(&settings).await.unwrap();
    db::run_migrations(&pool).await.unwrap();
    let user_id = bootstrap_admin(&pool).await;
    let credentials = issue_device_credentials(&pool, user_id, "sse-pool-timeout").await;
    let access = device_sessions::authenticate_access_token(
        &pool,
        &credentials.access_token,
        &credentials.server_instance_id,
        Utc::now(),
        "127.0.0.1",
        "test",
    )
    .await
    .unwrap();
    let lease = device_sessions::DeviceAccessLease::from(&access);
    let connection = pool.acquire().await.unwrap();
    assert!(
        timeout(
            Duration::from_millis(500),
            device_sessions::revalidate_access_lease(&pool, &lease, Utc::now()),
        )
        .await
        .is_err()
    );
    drop(connection);
}

#[tokio::test]
async fn access_expiry_timer_closes_stream_without_a_revocation() {
    let pool = test_pool().await;
    let user_id = bootstrap_admin(&pool).await;
    let credentials = issue_device_credentials(&pool, user_id, "sse-access-expiry").await;
    let expires_at = Utc::now() + ChronoDuration::seconds(2);
    sqlx::query("UPDATE device_access_sessions SET expires_at = ?1 WHERE family_id = ?2")
        .bind(expires_at.to_rfc3339())
        .bind(&credentials.family_id)
        .execute(&pool)
        .await
        .unwrap();
    let app = test_app(pool);
    let response = device_request(&app, "GET", CONTROL_PATH, &credentials.access_token).await;
    assert_eq!(response.status(), StatusCode::OK);
    let mut body = response.into_body();
    next_frame(&mut body).await.expect("ready frame");
    let started = Instant::now();
    wait_for_eof(&mut body).await;
    assert!(started.elapsed() < Duration::from_secs(5));
}

#[tokio::test]
async fn active_stream_limit_is_held_until_body_drop() {
    let pool = test_pool().await;
    let user_id = bootstrap_admin(&pool).await;
    let first_family = issue_device_credentials(&pool, user_id, "sse-limit-first").await;
    let second_family = issue_device_credentials(&pool, user_id, "sse-limit-second").await;
    let app = test_app(pool);

    let first = device_request(&app, "GET", CONTROL_PATH, &first_family.access_token).await;
    assert_eq!(first.status(), StatusCode::OK);
    let rejected = device_request(&app, "GET", CONTROL_PATH, &first_family.access_token).await;
    assert_eq!(rejected.status(), StatusCode::TOO_MANY_REQUESTS);

    let second = device_request(&app, "GET", CONTROL_PATH, &second_family.access_token).await;
    assert_eq!(second.status(), StatusCode::OK);

    drop(first);
    let recovered = device_request(&app, "GET", CONTROL_PATH, &first_family.access_token).await;
    assert_eq!(recovered.status(), StatusCode::OK);
}

#[tokio::test]
async fn shutdown_before_stream_poll_prevents_connected_event() {
    let pool = test_pool().await;
    let user_id = bootstrap_admin(&pool).await;
    let credentials = issue_device_credentials(&pool, user_id, "sse-shutdown-race").await;
    let state = AppState::new(test_settings(), Some(pool));
    state.shutdown_device_streams();
    let app = build_router(state);
    let response = device_request(&app, "GET", CONTROL_PATH, &credentials.access_token).await;
    assert_eq!(response.status(), StatusCode::OK);
    let mut body = response.into_body();
    assert!(next_frame(&mut body).await.is_none());
}

#[tokio::test]
async fn rotation_closes_old_generation_and_new_access_opens_a_stream() {
    let pool = test_pool().await;
    let user_id = bootstrap_admin(&pool).await;
    let credentials = issue_device_credentials(&pool, user_id, "sse-rotation").await;
    let app = test_app(pool.clone());
    let response = device_request(&app, "GET", CONTROL_PATH, &credentials.access_token).await;
    let mut old_body = response.into_body();
    next_frame(&mut old_body)
        .await
        .expect("old connected frame");
    let rotated = device_sessions::rotate_refresh_token(
        &pool,
        &test_settings().security_master_key,
        &device_policy(),
        device_sessions::RotateRefreshInput {
            refresh_token: credentials.refresh_token,
            generation: credentials.generation,
            transaction_id: Uuid::new_v4().to_string(),
            device_id: credentials.device_id,
            server_instance_id: credentials.server_instance_id,
        },
        Utc::now(),
    )
    .await
    .unwrap();
    wait_for_eof(&mut old_body).await;
    let response = device_request(&app, "GET", CONTROL_PATH, &rotated.access_token).await;
    assert_eq!(response.status(), StatusCode::OK);
    let mut new_body = response.into_body();
    let connected = next_frame(&mut new_body)
        .await
        .expect("new connected frame");
    assert!(String::from_utf8_lossy(&connected).contains("event: connected"));
}

async fn assert_stream_closes_after<'q>(
    pool: &SqlitePool,
    credentials: &device_sessions::InitialDeviceCredentials,
    mutation: sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments>,
) {
    let app = test_app(pool.clone());
    let response = device_request(&app, "GET", CONTROL_PATH, &credentials.access_token).await;
    assert_eq!(response.status(), StatusCode::OK);
    let mut body = response.into_body();
    next_frame(&mut body).await.expect("ready frame");
    let started = Instant::now();
    mutation.execute(pool).await.unwrap();
    wait_for_eof(&mut body).await;
    assert!(started.elapsed() < Duration::from_secs(5));
}

async fn next_frame(body: &mut Body) -> Option<Vec<u8>> {
    timeout(Duration::from_secs(2), body.frame())
        .await
        .expect("frame deadline")
        .transpose()
        .expect("body frame")
        .and_then(|frame| frame.into_data().ok())
        .map(|bytes| bytes.to_vec())
}

async fn wait_for_eof(body: &mut Body) {
    timeout(Duration::from_secs(5), async {
        while next_frame(body).await.is_some() {}
    })
    .await
    .expect("control stream EOF deadline");
}

async fn device_request(app: &Router, method: &str, path: &str, token: &str) -> Response {
    let mut request = Request::builder().method(method).uri(path);
    if !token.is_empty() {
        request = request.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    app.clone()
        .oneshot(request.body(Body::empty()).unwrap())
        .await
        .unwrap()
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

async fn bootstrap_admin(pool: &SqlitePool) -> i64 {
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
    .unwrap()
    .user_id
}

fn device_policy() -> device_sessions::DeviceSessionPolicy {
    device_sessions::DeviceSessionPolicy {
        server_instance_id: "device-sse-test".to_string(),
        authorization_ttl_seconds: 600,
        access_ttl_seconds: 900,
        refresh_sliding_ttl_seconds: 30 * 24 * 60 * 60,
        refresh_absolute_ttl_seconds: 90 * 24 * 60 * 60,
        idempotency_ttl_seconds: 24 * 60 * 60,
        poll_interval_seconds: 5,
    }
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

fn test_app_with_settings(pool: SqlitePool, settings: Settings) -> Router {
    build_router(AppState::new(settings, Some(pool)))
}

fn test_settings() -> Settings {
    let mut settings = Settings {
        http_addr: "127.0.0.1:33033".parse().unwrap(),
        database_url: format!(
            "sqlite:file:device-sse-{}?mode=memory&cache=shared",
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
        file_master_key: "test-file-master-key-that-is-long-enough".to_string(),
        device_sessions: Default::default(),
        experimental_legacy_preview_enabled: false,
    };
    settings.device_sessions.server_instance_id = "device-sse-test".to_string();
    settings.device_sessions.trusted_proxy_cidrs.clear();
    settings
}
