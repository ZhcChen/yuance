use axum::{
    Router,
    body::Body,
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
    domains::{api_tokens, bootstrap, device_sessions, storage, system_api_tokens},
    platform::{config::Settings, db},
    web::router::{AppState, build_router},
};

const UPLOAD_REQUEST_PATH: &str = "/api/v1/device-file-transfer/canary/upload-request";
const DOWNLOAD_REQUEST_PATH: &str = "/api/v1/device-file-transfer/canary/download-request";
const CODE_VERIFIER: &str = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-._~";
const CANARY_CONTENT: &[u8] = b"yuance-desktop-file-canary-v1-data";

#[tokio::test]
async fn device_canary_upload_request_has_frozen_transfer_schema() {
    let pool = test_pool().await;
    let user_id = bootstrap_admin(&pool).await;
    seed_memory_storage(&pool, user_id).await;
    let credentials = issue_device_credentials(&pool, user_id).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response =
        device_request(&app, "POST", UPLOAD_REQUEST_PATH, &credentials.access_token).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(header::CACHE_CONTROL).unwrap(),
        "private, no-store"
    );
    let body = json_body(response).await;
    let transfer = &body["data"];
    assert_eq!(transfer["schema_version"], 1);
    assert_eq!(transfer["purpose"], "upload");
    assert_eq!(transfer["request"]["method"], "PUT");
    assert_eq!(transfer["expected_bytes"], 34);
    assert_eq!(transfer["content_type"], "text/plain; charset=utf-8");
    assert_eq!(transfer["expires_in_seconds"], 60);
    assert!(transfer["expires_at"].as_str().is_some());
    assert!(
        transfer["sha256"]
            .as_str()
            .is_some_and(|value| value.len() == 64)
    );
    assert!(
        transfer["request"]["url"]
            .as_str()
            .unwrap()
            .starts_with("/api/v1/device-file-transfer/canary/upload?")
    );
    assert_eq!(
        transfer["request"]["headers"],
        serde_json::json!([["content-type", "text/plain; charset=utf-8"]])
    );

    let response = signed_request(&app, transfer, Some(CANARY_CONTENT)).await;
    assert_eq!(response.status(), StatusCode::NO_CONTENT);

    let response = device_request(
        &app,
        "GET",
        DOWNLOAD_REQUEST_PATH,
        &credentials.access_token,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    let transfer = &body["data"];
    assert_eq!(transfer["schema_version"], 1);
    assert_eq!(transfer["purpose"], "download");
    assert_eq!(transfer["request"]["method"], "GET");
    assert_eq!(transfer["expected_bytes"], 34);
    assert_eq!(transfer["content_type"], "text/plain; charset=utf-8");
    assert_eq!(transfer["expires_in_seconds"], 60);
    assert!(
        transfer["request"]["url"]
            .as_str()
            .unwrap()
            .starts_with("/api/v1/device-file-transfer/canary/download?")
    );
    assert_eq!(transfer["request"]["headers"], serde_json::json!([]));
    let response = signed_request(&app, transfer, None).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(body_bytes(response).await, CANARY_CONTENT);

    let upload = json_body(
        device_request(&app, "POST", UPLOAD_REQUEST_PATH, &credentials.access_token).await,
    )
    .await;
    let response = signed_request(&app, &upload["data"], Some(b"wrong-canary-content")).await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(upload["data"]["request"]["url"].as_str().unwrap())
                .header(header::CONTENT_TYPE, "application/octet-stream")
                .body(Body::from(CANARY_CONTENT))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);

    let upload_url = upload["data"]["request"]["url"].as_str().unwrap();
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("{upload_url}x"))
                .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
                .body(Body::from(CANARY_CONTENT))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(upload_url.replace("/upload?", "/download?"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(upload_url)
                .header(
                    header::AUTHORIZATION,
                    format!("Bearer {}", credentials.access_token),
                )
                .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
                .body(Body::from(CANARY_CONTENT))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(
        json_body(response).await["error"]["code"],
        "credential_not_allowed"
    );
}

#[tokio::test]
async fn device_canary_ignores_untrusted_transfer_fields_and_rejects_wrong_routes() {
    let pool = test_pool().await;
    let user_id = bootstrap_admin(&pool).await;
    seed_memory_storage(&pool, user_id).await;
    let credentials = issue_device_credentials(&pool, user_id).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let baseline = json_body(
        device_request(&app, "POST", UPLOAD_REQUEST_PATH, &credentials.access_token).await,
    )
    .await;
    let malicious_path = format!(
        "{UPLOAD_REQUEST_PATH}?url=https%3A%2F%2Fattacker.invalid&object_key=attacker&header=authorization"
    );
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(malicious_path)
                .header(header::AUTHORIZATION, format!("Bearer {}", credentials.access_token))
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(r#"{"url":"https://attacker.invalid","object_key":"attacker","headers":[["authorization","secret"]]}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);

    let response = device_request(
        &app,
        "POST",
        &format!(
            "{UPLOAD_REQUEST_PATH}?url=https%3A%2F%2Fattacker.invalid&object_key=attacker&header=authorization"
        ),
        &credentials.access_token,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let malicious = json_body(response).await;
    assert_eq!(
        normalized_transfer(malicious.clone()),
        normalized_transfer(baseline)
    );
    let signed_url = malicious["data"]["request"]["url"].as_str().unwrap();
    assert!(!signed_url.contains("attacker"));

    for (method, path, expected) in [
        ("GET", UPLOAD_REQUEST_PATH, StatusCode::METHOD_NOT_ALLOWED),
        (
            "POST",
            DOWNLOAD_REQUEST_PATH,
            StatusCode::METHOD_NOT_ALLOWED,
        ),
        (
            "POST",
            "/api/v1/device-file-transfer/canary/upload-request/",
            StatusCode::NOT_FOUND,
        ),
        (
            "POST",
            "/api/v1/device-file-transfer/canary/other",
            StatusCode::NOT_FOUND,
        ),
    ] {
        let response = device_request(&app, method, path, &credentials.access_token).await;
        assert_eq!(response.status(), expected, "{method} {path}");
    }
}

#[tokio::test]
async fn device_canary_rejects_other_credentials_and_business_api_stays_closed() {
    let pool = test_pool().await;
    let user_id = bootstrap_admin(&pool).await;
    seed_memory_storage(&pool, user_id).await;
    let credentials = issue_device_credentials(&pool, user_id).await;
    let pat = api_tokens::create_token(
        &pool,
        &test_settings().security_master_key,
        user_id,
        api_tokens::CreateApiTokenInput {
            name: "Transfer PAT".to_string(),
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
            name: "Transfer System".to_string(),
            scopes: vec![system_api_tokens::SCOPE_SYSTEM_RELEASE_READ.to_string()],
        },
    )
    .await
    .unwrap();
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(UPLOAD_REQUEST_PATH)
                .header(header::COOKIE, "session=browser")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(
        json_body(response).await["error"]["code"],
        "credential_not_allowed"
    );

    for token in [
        &pat.raw_token,
        &system.raw_token,
        &credentials.refresh_token,
    ] {
        let response = device_request(&app, "POST", UPLOAD_REQUEST_PATH, token).await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(
            json_body(response).await["error"]["code"],
            "invalid_device_access"
        );
    }

    let mut mixed = Request::builder()
        .method("POST")
        .uri(UPLOAD_REQUEST_PATH)
        .body(Body::empty())
        .unwrap();
    mixed.headers_mut().append(
        header::AUTHORIZATION,
        format!("Bearer {}", credentials.access_token)
            .parse()
            .unwrap(),
    );
    mixed.headers_mut().append(
        header::AUTHORIZATION,
        format!("Bearer {}", pat.raw_token).parse().unwrap(),
    );
    let response = app.clone().oneshot(mixed).await.unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(UPLOAD_REQUEST_PATH)
                .header(
                    header::AUTHORIZATION,
                    format!("Bearer {}", credentials.access_token),
                )
                .header(header::COOKIE, "session=browser")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(
        json_body(response).await["error"]["code"],
        "credential_not_allowed"
    );

    let response = device_request(&app, "GET", "/api/v1/projects", &credentials.access_token).await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn device_canary_rejects_revoked_and_expired_access() {
    let pool = test_pool().await;
    let user_id = bootstrap_admin(&pool).await;
    seed_memory_storage(&pool, user_id).await;
    let revoked = issue_device_credentials(&pool, user_id).await;
    sqlx::query("UPDATE devices SET device_status = 'revoked', revoked_at = ?1 WHERE id = ?2")
        .bind(Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true))
        .bind(&revoked.device_id)
        .execute(&pool)
        .await
        .unwrap();
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let response = device_request(&app, "POST", UPLOAD_REQUEST_PATH, &revoked.access_token).await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(json_body(response).await["error"]["code"], "device_revoked");

    let expired = issue_device_credentials(&pool, user_id).await;
    sqlx::query("UPDATE device_access_sessions SET expires_at = ?1 WHERE family_id = ?2")
        .bind((Utc::now() - Duration::seconds(1)).to_rfc3339_opts(SecondsFormat::Secs, true))
        .bind(&expired.family_id)
        .execute(&pool)
        .await
        .unwrap();
    let response = device_request(&app, "GET", DOWNLOAD_REQUEST_PATH, &expired.access_token).await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(
        json_body(response).await["error"]["code"],
        "device_access_expired"
    );
}

async fn device_request(app: &Router, method: &str, path: &str, token: &str) -> Response {
    app.clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header(header::AUTHORIZATION, format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap()
}

async fn json_body(response: Response) -> Value {
    serde_json::from_slice(&body_bytes(response).await).unwrap()
}

async fn body_bytes(response: Response) -> Vec<u8> {
    response
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes()
        .to_vec()
}

async fn signed_request(app: &Router, transfer: &Value, body: Option<&[u8]>) -> Response {
    let request = &transfer["request"];
    let mut builder = Request::builder()
        .method(request["method"].as_str().unwrap())
        .uri(request["url"].as_str().unwrap());
    for header in request["headers"].as_array().unwrap() {
        builder = builder.header(header[0].as_str().unwrap(), header[1].as_str().unwrap());
    }
    app.clone()
        .oneshot(
            builder
                .body(Body::from(body.unwrap_or_default().to_vec()))
                .unwrap(),
        )
        .await
        .unwrap()
}

fn normalized_transfer(mut payload: Value) -> Value {
    payload["data"]["request"]["url"] = Value::String("<signed-request>".to_string());
    payload
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

async fn seed_memory_storage(pool: &SqlitePool, user_id: i64) {
    storage::save_config(
        pool,
        &test_settings(),
        user_id,
        storage::SaveStorageConfigInput {
            endpoint: storage::TEST_MEMORY_ENDPOINT.to_string(),
            region: "test".to_string(),
            bucket: "yuance-device-canary".to_string(),
            access_key_id: "TESTACCESSKEY2026".to_string(),
            access_key_secret: "TestSecretValue2026!".to_string(),
            activate: true,
        },
    )
    .await
    .unwrap();
}

async fn issue_device_credentials(
    pool: &SqlitePool,
    user_id: i64,
) -> device_sessions::InitialDeviceCredentials {
    let now = Utc::now();
    let installation_id = format!("device-transfer-test-{}", Uuid::new_v4());
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(CODE_VERIFIER.as_bytes()));
    let policy = device_policy();
    let started = device_sessions::start_authorization(
        pool,
        &test_settings().security_master_key,
        &policy,
        device_sessions::StartAuthorizationInput {
            code_challenge: challenge,
            installation_id: installation_id.clone(),
            device_name: "Device Transfer Test".to_string(),
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
        server_instance_id: "device-transfer-test".to_string(),
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

fn test_settings() -> Settings {
    let mut settings = Settings {
        http_addr: "127.0.0.1:33033".parse().unwrap(),
        database_url: format!(
            "sqlite:file:device-transfer-{}?mode=memory&cache=shared",
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
    settings.device_sessions.server_instance_id = "device-transfer-test".to_string();
    settings.device_sessions.trusted_proxy_cidrs.clear();
    settings
}
