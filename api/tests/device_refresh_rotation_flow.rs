use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
    response::Response,
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{Duration, Utc};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use tower::ServiceExt;
use uuid::Uuid;
use yuance_api::{
    domains::device_sessions,
    platform::{config::Settings, db},
    web::router::{AppState, build_router},
};

const REFRESH_PATH: &str = "/api/v1/device-sessions/refresh";
const CODE_VERIFIER: &str = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-._~";

#[tokio::test]
async fn refresh_rotates_and_same_transaction_recovers_identical_response() {
    let pool = test_pool().await;
    let credentials = issue_device_credentials(&pool, "refresh-recovery").await;
    let app = test_app(pool.clone());
    let transaction_id = Uuid::new_v4().to_string();
    let payload = rotation_payload(&credentials, &transaction_id);

    let first = refresh_request(&app, payload.clone(), None, None).await;
    assert_eq!(first.status(), StatusCode::OK);
    assert_no_store(&first);
    let first_body = json_body(first).await;
    assert_eq!(first_body["data"]["access"]["generation"], 1);
    assert_eq!(first_body["data"]["refresh"]["generation"], 1);
    assert_ne!(
        first_body["data"]["refresh_token"],
        credentials.refresh_token
    );

    let recovered = refresh_request(&app, payload, None, None).await;
    assert_eq!(recovered.status(), StatusCode::OK);
    assert_eq!(json_body(recovered).await, first_body);

    let probe = bearer_request(
        &app,
        "/api/v1/device-session",
        first_body["data"]["access_token"].as_str().unwrap(),
    )
    .await;
    assert_eq!(probe.status(), StatusCode::OK);
    let family_status: String =
        sqlx::query_scalar("SELECT family_status FROM device_credential_families WHERE id = ?1")
            .bind(&credentials.family_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(family_status, "active");
    let leaked_audits: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM audit_logs WHERE metadata LIKE ?1 OR metadata LIKE ?2",
    )
    .bind(format!("%{}%", credentials.refresh_token))
    .bind(format!(
        "%{}%",
        first_body["data"]["access_token"].as_str().unwrap()
    ))
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(leaked_audits, 0);
}

#[tokio::test]
async fn different_transaction_replay_revokes_every_family_credential() {
    let pool = test_pool().await;
    let credentials = issue_device_credentials(&pool, "refresh-replay").await;
    let app = test_app(pool.clone());
    let first = refresh_request(
        &app,
        rotation_payload(&credentials, &Uuid::new_v4().to_string()),
        None,
        None,
    )
    .await;
    assert_eq!(first.status(), StatusCode::OK);
    let first_body = json_body(first).await;

    let replay = refresh_request(
        &app,
        rotation_payload(&credentials, &Uuid::new_v4().to_string()),
        None,
        None,
    )
    .await;
    assert_eq!(replay.status(), StatusCode::CONFLICT);
    assert_error(replay, "device_refresh_replay").await;

    let probe = bearer_request(
        &app,
        "/api/v1/device-session",
        first_body["data"]["access_token"].as_str().unwrap(),
    )
    .await;
    assert_eq!(probe.status(), StatusCode::UNAUTHORIZED);
    assert_error(probe, "device_session_revoked").await;
    let active_count: i64 = sqlx::query_scalar(
        "SELECT (SELECT COUNT(*) FROM device_access_sessions WHERE family_id = ?1 AND session_status = 'active') + (SELECT COUNT(*) FROM device_refresh_credentials WHERE family_id = ?1 AND credential_status = 'active')",
    )
    .bind(&credentials.family_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(active_count, 0);
    let security_audit: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM audit_logs WHERE action = 'device_session.refresh_security_failure' AND target_id = ?1",
    )
    .bind(&credentials.device_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(security_audit, 1);
}

#[tokio::test]
async fn concurrent_rotations_converge_for_same_id_and_revoke_for_different_ids() {
    let pool = test_pool().await;
    let same = issue_device_credentials(&pool, "same-transaction").await;
    let app = test_app(pool.clone());
    let same_payload = rotation_payload(&same, &Uuid::new_v4().to_string());
    let (first, second) = tokio::join!(
        refresh_request(&app, same_payload.clone(), None, None),
        refresh_request(&app, same_payload, None, None),
    );
    assert_eq!(first.status(), StatusCode::OK);
    assert_eq!(second.status(), StatusCode::OK);
    assert_eq!(json_body(first).await, json_body(second).await);

    let competing = issue_device_credentials(&pool, "different-transactions").await;
    let first_payload = rotation_payload(&competing, &Uuid::new_v4().to_string());
    let second_payload = rotation_payload(&competing, &Uuid::new_v4().to_string());
    let (first, second) = tokio::join!(
        refresh_request(&app, first_payload, None, None),
        refresh_request(&app, second_payload, None, None),
    );
    let statuses = [first.status(), second.status()];
    assert!(statuses.contains(&StatusCode::OK));
    assert!(statuses.contains(&StatusCode::CONFLICT));
    let winning_body = if first.status() == StatusCode::OK {
        json_body(first).await
    } else {
        json_body(second).await
    };
    let family_status: String =
        sqlx::query_scalar("SELECT family_status FROM device_credential_families WHERE id = ?1")
            .bind(&competing.family_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(family_status, "revoked");
    let probe = bearer_request(
        &app,
        "/api/v1/device-session",
        winning_body["data"]["access_token"].as_str().unwrap(),
    )
    .await;
    assert_eq!(probe.status(), StatusCode::UNAUTHORIZED);
    let next_refresh = json!({
        "refresh_token": winning_body["data"]["refresh_token"],
        "generation": 1,
        "transaction_id": Uuid::new_v4().to_string(),
        "device_id": competing.device_id,
        "server_instance_id": competing.server_instance_id
    });
    let response = refresh_request(&app, next_refresh, None, None).await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_error(response, "device_session_revoked").await;
}

#[tokio::test]
async fn refresh_rejects_ambient_credentials_wrong_binding_and_expiry() {
    let pool = test_pool().await;
    let credentials = issue_device_credentials(&pool, "refresh-boundary").await;
    let app = test_app(pool.clone());
    let payload = rotation_payload(&credentials, &Uuid::new_v4().to_string());

    for (cookie, authorization) in [
        (Some("yuance_session=ambient"), None),
        (None, Some("Bearer yuance_pat_ambient")),
    ] {
        let response = refresh_request(&app, payload.clone(), cookie, authorization).await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_error(response, "credential_not_allowed").await;
    }

    for changed in [
        json!({"generation": 1}),
        json!({"device_id": "wrong-device"}),
        json!({"server_instance_id": "wrong-server"}),
        json!({"refresh_token": "yuance_pat_not-refresh"}),
    ] {
        let mut invalid = payload.clone();
        for (key, value) in changed.as_object().unwrap() {
            invalid[key] = value.clone();
        }
        let response = refresh_request(&app, invalid, None, None).await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_error(response, "invalid_device_refresh").await;
    }

    sqlx::query(
        "UPDATE device_refresh_credentials SET expires_at = ?1 WHERE family_id = ?2 AND generation = 0",
    )
    .bind((Utc::now() - Duration::seconds(1)).to_rfc3339())
    .bind(&credentials.family_id)
    .execute(&pool)
    .await
    .unwrap();
    let response = refresh_request(&app, payload, None, None).await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_error(response, "device_refresh_expired").await;
}

#[tokio::test]
async fn refresh_rejects_inactive_user_and_key_change_revokes_recovery() {
    let pool = test_pool().await;
    let inactive = issue_device_credentials(&pool, "inactive-refresh-user").await;
    sqlx::query("UPDATE users SET status = 'disabled' WHERE id = ?1")
        .bind(inactive.user_id)
        .execute(&pool)
        .await
        .unwrap();
    let app = test_app(pool.clone());
    let response = refresh_request(
        &app,
        rotation_payload(&inactive, &Uuid::new_v4().to_string()),
        None,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_error(response, "user_inactive").await;

    let recoverable = issue_device_credentials(&pool, "key-change-recovery").await;
    let payload = rotation_payload(&recoverable, &Uuid::new_v4().to_string());
    let response = refresh_request(&app, payload.clone(), None, None).await;
    assert_eq!(response.status(), StatusCode::OK);

    let mut wrong_key_settings = test_settings();
    wrong_key_settings.security_master_key =
        "different-test-master-key-that-is-long-enough".to_string();
    let wrong_key_app = build_router(AppState::new(wrong_key_settings, Some(pool.clone())));
    let response = refresh_request(&wrong_key_app, payload, None, None).await;
    assert_eq!(response.status(), StatusCode::CONFLICT);
    assert_error(response, "rotation_recovery_failed").await;
    let family_status: String =
        sqlx::query_scalar("SELECT family_status FROM device_credential_families WHERE id = ?1")
            .bind(&recoverable.family_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(family_status, "revoked");
}

#[tokio::test]
async fn refresh_rejects_absolute_expiry_and_revoked_device_or_family() {
    let pool = test_pool().await;
    let app = test_app(pool.clone());

    let absolute = issue_device_credentials(&pool, "absolute-expiry").await;
    sqlx::query(
        "UPDATE device_credential_families SET refresh_sliding_expires_at = ?1, refresh_absolute_expires_at = ?2 WHERE id = ?3",
    )
    .bind((Utc::now() - Duration::seconds(2)).to_rfc3339())
    .bind((Utc::now() - Duration::seconds(1)).to_rfc3339())
    .bind(&absolute.family_id)
    .execute(&pool)
    .await
    .unwrap();
    let response = refresh_request(
        &app,
        rotation_payload(&absolute, &Uuid::new_v4().to_string()),
        None,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_error(response, "device_refresh_expired").await;

    let revoked_device = issue_device_credentials(&pool, "revoked-device").await;
    sqlx::query("UPDATE devices SET device_status = 'revoked', revoked_at = ?1 WHERE id = ?2")
        .bind(Utc::now().to_rfc3339())
        .bind(&revoked_device.device_id)
        .execute(&pool)
        .await
        .unwrap();
    let response = refresh_request(
        &app,
        rotation_payload(&revoked_device, &Uuid::new_v4().to_string()),
        None,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_error(response, "device_revoked").await;

    let revoked_family = issue_device_credentials(&pool, "revoked-family").await;
    device_sessions::revoke_family_for_user(
        &pool,
        revoked_family.user_id,
        &revoked_family.family_id,
        Utc::now(),
        "test_revoke",
    )
    .await
    .unwrap();
    let response = refresh_request(
        &app,
        rotation_payload(&revoked_family, &Uuid::new_v4().to_string()),
        None,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_error(response, "device_session_revoked").await;
}

#[tokio::test]
async fn commit_failure_preserves_source_and_dropped_response_is_recoverable() {
    let pool = test_pool().await;
    let credentials = issue_device_credentials(&pool, "rotation-failure").await;
    let app = test_app(pool.clone());
    let payload = rotation_payload(&credentials, &Uuid::new_v4().to_string());
    sqlx::query(
        r#"
        CREATE TRIGGER fail_generation_one_access
        BEFORE INSERT ON device_access_sessions
        WHEN NEW.generation = 1
        BEGIN
            SELECT RAISE(ABORT, 'injected rotation failure');
        END
        "#,
    )
    .execute(&pool)
    .await
    .unwrap();
    let response = refresh_request(&app, payload.clone(), None, None).await;
    assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    let source_status: String = sqlx::query_scalar(
        "SELECT credential_status FROM device_refresh_credentials WHERE family_id = ?1 AND generation = 0",
    )
    .bind(&credentials.family_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(source_status, "active");
    let rotation_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM device_refresh_rotations WHERE family_id = ?1")
            .bind(&credentials.family_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(rotation_count, 0);
    sqlx::query("DROP TRIGGER fail_generation_one_access")
        .execute(&pool)
        .await
        .unwrap();

    let lost_response = refresh_request(&app, payload.clone(), None, None).await;
    assert_eq!(lost_response.status(), StatusCode::OK);
    drop(lost_response);
    let recovered = refresh_request(&app, payload, None, None).await;
    assert_eq!(recovered.status(), StatusCode::OK);
    assert_eq!(
        json_body(recovered).await["data"]["access"]["generation"],
        1
    );
    let generation_one_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM device_refresh_credentials WHERE family_id = ?1 AND generation = 1",
    )
    .bind(&credentials.family_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(generation_one_count, 1);
}

#[tokio::test]
async fn expired_idempotency_result_does_not_issue_another_generation() {
    let pool = test_pool().await;
    let credentials = issue_device_credentials(&pool, "expired-idempotency").await;
    let app = test_app(pool.clone());
    let payload = rotation_payload(&credentials, &Uuid::new_v4().to_string());
    let response = refresh_request(&app, payload.clone(), None, None).await;
    assert_eq!(response.status(), StatusCode::OK);
    sqlx::query("UPDATE device_refresh_rotations SET result_expires_at = ?1 WHERE family_id = ?2")
        .bind((Utc::now() - Duration::seconds(1)).to_rfc3339())
        .bind(&credentials.family_id)
        .execute(&pool)
        .await
        .unwrap();

    let invalid = json!({
        "refresh_token": device_sessions::issue_refresh_token(),
        "generation": 0,
        "transaction_id": Uuid::new_v4().to_string(),
        "device_id": credentials.device_id,
        "server_instance_id": credentials.server_instance_id
    });
    let invalid_response = refresh_request(&app, invalid, None, None).await;
    assert_eq!(invalid_response.status(), StatusCode::UNAUTHORIZED);
    let retained_ciphertext: String = sqlx::query_scalar(
        "SELECT result_ciphertext FROM device_refresh_rotations WHERE family_id = ?1",
    )
    .bind(&credentials.family_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(!retained_ciphertext.is_empty());

    let response = refresh_request(&app, payload, None, None).await;
    assert_eq!(response.status(), StatusCode::CONFLICT);
    assert_error(response, "rotation_recovery_failed").await;
    let state = sqlx::query_as::<_, (String, i64, i64)>(
        r#"
        SELECT family_status,
               (SELECT COUNT(*) FROM device_refresh_credentials WHERE family_id = family.id AND credential_status = 'rotated'),
               (SELECT COUNT(*) FROM device_refresh_credentials WHERE family_id = family.id AND credential_status = 'active')
        FROM device_credential_families family WHERE id = ?1
        "#,
    )
    .bind(&credentials.family_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(state, ("revoked".to_string(), 0, 0));
}

async fn issue_device_credentials(
    pool: &SqlitePool,
    installation_id: &str,
) -> device_sessions::InitialDeviceCredentials {
    let user_id = sqlx::query(
        "INSERT INTO users (username, password_hash, display_name, status) VALUES (?1, 'hash', 'Refresh User', 'active')",
    )
    .bind(format!("refresh-user-{}", Uuid::new_v4()))
    .execute(pool)
    .await
    .unwrap()
    .last_insert_rowid();
    let now = Utc::now();
    let policy = device_policy();
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(CODE_VERIFIER.as_bytes()));
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

fn rotation_payload(
    credentials: &device_sessions::InitialDeviceCredentials,
    transaction_id: &str,
) -> Value {
    json!({
        "refresh_token": credentials.refresh_token,
        "generation": credentials.generation,
        "transaction_id": transaction_id,
        "device_id": credentials.device_id,
        "server_instance_id": credentials.server_instance_id
    })
}

async fn refresh_request(
    app: &Router,
    payload: Value,
    cookie: Option<&str>,
    authorization: Option<&str>,
) -> Response {
    let mut request = Request::builder()
        .method("POST")
        .uri(REFRESH_PATH)
        .header(header::CONTENT_TYPE, "application/json");
    if let Some(cookie) = cookie {
        request = request.header(header::COOKIE, cookie);
    }
    if let Some(authorization) = authorization {
        request = request.header(header::AUTHORIZATION, authorization);
    }
    app.clone()
        .oneshot(request.body(Body::from(payload.to_string())).unwrap())
        .await
        .unwrap()
}

async fn bearer_request(app: &Router, path: &str, token: &str) -> Response {
    app.clone()
        .oneshot(
            Request::builder()
                .uri(path)
                .header(header::AUTHORIZATION, format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap()
}

async fn assert_error(response: Response, code: &str) {
    assert_no_store(&response);
    assert_eq!(json_body(response).await["error"]["code"], code);
}

fn assert_no_store(response: &Response) {
    assert_eq!(
        response.headers().get(header::CACHE_CONTROL).unwrap(),
        "private, no-store"
    );
}

async fn json_body(response: Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
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

fn device_policy() -> device_sessions::DeviceSessionPolicy {
    device_sessions::DeviceSessionPolicy {
        server_instance_id: "device-refresh-test".to_string(),
        authorization_ttl_seconds: 600,
        access_ttl_seconds: 900,
        refresh_sliding_ttl_seconds: 30 * 24 * 60 * 60,
        refresh_absolute_ttl_seconds: 90 * 24 * 60 * 60,
        idempotency_ttl_seconds: 24 * 60 * 60,
        poll_interval_seconds: 5,
    }
}

fn test_settings() -> Settings {
    let mut settings = Settings {
        http_addr: "127.0.0.1:33033".parse().unwrap(),
        database_url: format!(
            "sqlite:file:device-refresh-{}?mode=memory&cache=shared",
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
    settings.device_sessions.server_instance_id = "device-refresh-test".to_string();
    settings.device_sessions.trusted_proxy_cidrs.clear();
    settings
}
