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
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};
use std::net::SocketAddr;
use tower::ServiceExt;
use uuid::Uuid;
use yuance_api::{
    domains::{auth, bootstrap, device_sessions},
    platform::{config::Settings, db, security::csrf::CSRF_COOKIE_NAME},
    web::router::{AppState, build_router},
};

const START_PATH: &str = "/api/v1/device-authorizations";
const EXCHANGE_PATH: &str = "/api/v1/device-authorizations/exchange";
const CODE_VERIFIER: &str = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-._~";

#[tokio::test]
async fn start_is_credential_free_no_store_and_rejects_ambient_credentials() {
    let pool = test_pool().await;
    let app = test_app(pool);

    let response = start_authorization(&app, None, "installation-clean").await;
    assert_eq!(response.status(), StatusCode::CREATED);
    assert_no_store(&response);
    let body = json_body(response).await;
    assert_eq!(
        body["data"]["verification_path"],
        "/web/device-authorization"
    );
    assert_eq!(body["data"]["server_instance_id"], "device-auth-test");
    assert!(
        body["data"]["device_code"]
            .as_str()
            .unwrap()
            .starts_with("yuance_dc_")
    );
    assert!(!body["data"]["user_code"].as_str().unwrap().is_empty());

    for credential in [
        (header::COOKIE, "yuance_session=ambient"),
        (header::AUTHORIZATION, "Bearer pat_ambient"),
        (header::AUTHORIZATION, "Bearer yuance_dat_ambient"),
    ] {
        let response =
            start_authorization(&app, Some(credential), &Uuid::new_v4().to_string()).await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_no_store(&response);
        assert_error(response, "credential_not_allowed", None).await;
    }

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(START_PATH)
                .header(header::COOKIE, "yuance_session=ambient")
                .header(header::AUTHORIZATION, "Bearer mixed")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(start_payload("installation-mixed").to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_error(response, "credential_not_allowed", None).await;

    for credential in [
        (header::COOKIE, "yuance_session=ambient"),
        (header::AUTHORIZATION, "Bearer pat_ambient"),
        (header::AUTHORIZATION, "Bearer yuance_dat_ambient"),
    ] {
        let response = exchange_with_credential(&app, credential).await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_error(response, "credential_not_allowed", None).await;
    }

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(EXCHANGE_PATH)
                .header(header::COOKIE, "yuance_session=ambient")
                .header(header::AUTHORIZATION, "Bearer mixed")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    exchange_payload("invalid", &Uuid::new_v4().to_string()).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_error(response, "credential_not_allowed", None).await;

    for path in [START_PATH, EXCHANGE_PATH] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(path)
                    .header(header::COOKIE, "yuance_session=ambient")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from("{not-json"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_error(response, "credential_not_allowed", None).await;
    }

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(START_PATH)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from("{not-json"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_error(response, "invalid_device_request", None).await;

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(START_PATH)
                .header(header::CONTENT_TYPE, "text/plain")
                .body(Body::from(
                    start_payload("installation-wrong-media").to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);
    assert_error(response, "invalid_device_request", None).await;
}

#[tokio::test]
async fn anonymous_start_is_rate_limited_before_database_capacity_is_exhausted() {
    let pool = test_pool().await;
    let app = test_app(pool.clone());

    for index in 0..20 {
        let response =
            start_authorization_from_proxy(&app, &format!("rate-limit-{index}"), "192.0.2.10")
                .await;
        assert_eq!(response.status(), StatusCode::CREATED);
    }
    let response = start_authorization_from_proxy(&app, "rate-limit-rejected", "192.0.2.10").await;
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_error(response, "rate_limited", Some(60)).await;

    let response = start_authorization_from_proxy(&app, "rate-limit-other", "192.0.2.11").await;
    assert_eq!(response.status(), StatusCode::CREATED);

    let persisted: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM device_authorizations")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(persisted, 21);
}

#[tokio::test]
async fn untrusted_direct_peer_cannot_split_rate_limit_with_forwarded_for() {
    let pool = test_pool().await;
    let mut settings = test_settings();
    settings.device_sessions.trusted_proxy_cidrs.clear();
    let app = build_router(AppState::new(settings, Some(pool.clone())));

    for index in 0..20 {
        let response = start_authorization_from_peer(
            &app,
            &format!("untrusted-peer-{index}"),
            "10.0.0.2:43100",
            &format!("192.0.2.{index}"),
        )
        .await;
        assert_eq!(response.status(), StatusCode::CREATED);
    }
    let response = start_authorization_from_peer(
        &app,
        "untrusted-peer-rejected",
        "10.0.0.2:43100",
        "198.51.100.99",
    )
    .await;
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_error(response, "rate_limited", Some(60)).await;

    let persisted: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM device_authorizations")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(persisted, 20);
}

#[tokio::test]
async fn trusted_proxy_uses_rightmost_untrusted_forwarded_address() {
    let pool = test_pool().await;
    let app = test_app(pool.clone());

    for index in 0..20 {
        let response = start_authorization_from_peer(
            &app,
            &format!("appended-forwarded-{index}"),
            "172.17.0.1:43100",
            &format!("192.0.2.{index}, 198.51.100.20"),
        )
        .await;
        assert_eq!(response.status(), StatusCode::CREATED);
    }
    let response = start_authorization_from_peer(
        &app,
        "appended-forwarded-rejected",
        "172.17.0.1:43100",
        "203.0.113.99, 198.51.100.20",
    )
    .await;
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_error(response, "rate_limited", Some(60)).await;

    let persisted: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM device_authorizations")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(persisted, 20);
    let audit_ips: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT ip FROM audit_logs WHERE action = 'device_authorization.started'",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(audit_ips, vec!["198.51.100.20"]);
}

#[tokio::test]
async fn start_rejects_unknown_fields_and_openapi_length_violations() {
    let pool = test_pool().await;
    let app = test_app(pool);

    let mut unknown = start_payload("unknown-field");
    unknown["unexpected"] = json!(true);
    let response = start_authorization_payload(&app, unknown).await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_error(response, "invalid_device_request", None).await;

    for (field, length) in [
        ("installation_id", 129),
        ("device_name", 129),
        ("platform", 65),
        ("client_version", 65),
    ] {
        let mut payload = start_payload("length-boundary");
        payload[field] = json!("x".repeat(length));
        let response = start_authorization_payload(&app, payload).await;
        assert_eq!(response.status(), StatusCode::BAD_REQUEST, "field={field}");
        assert_error(response, "invalid_device_request", None).await;
    }
}

#[tokio::test]
async fn browser_approval_requires_login_and_valid_csrf() {
    let pool = test_pool().await;
    let app = test_app(pool.clone());
    let started = start(&app, "installation-browser").await;
    let user_code = started["user_code"].as_str().unwrap();
    let encoded_code = serde_urlencoded::to_string([("user_code", user_code)]).unwrap();

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/web/device-authorization?{encoded_code}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    let location = response
        .headers()
        .get(header::LOCATION)
        .unwrap()
        .to_str()
        .unwrap();
    assert!(location.starts_with("/web/login?return_to="));
    assert!(location.contains("%2Fweb%2Fdevice-authorization"));

    let session_cookie = bootstrap_admin_session(&pool).await;
    let response = authorization_page(&app, user_code, &session_cookie).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_no_store(&response);
    let csrf_cookie = response
        .headers()
        .get_all(header::SET_COOKIE)
        .iter()
        .find_map(|value| {
            let value = value.to_str().ok()?;
            value
                .starts_with(&format!("{CSRF_COOKIE_NAME}="))
                .then(|| cookie_pair(value))
        })
        .expect("approval page should set csrf cookie");

    let response = decision_request(&app, "approve", user_code, &session_cookie, None).await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let status: String = sqlx::query_scalar(
        "SELECT authorization_status FROM device_authorizations WHERE installation_id = 'installation-browser'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(status, "pending");

    let csrf_token = csrf_cookie.split_once('=').unwrap().1;
    let response = decision_request(
        &app,
        "approve",
        user_code,
        &format!("{session_cookie}; {csrf_cookie}"),
        Some(csrf_token),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_no_store(&response);
    assert!(text_body(response).await.contains("设备已批准"));
}

#[tokio::test]
async fn approved_exchange_is_idempotent_hashes_secrets_and_keeps_audit_clean() {
    let pool = test_pool().await;
    let app = test_app(pool.clone());
    let started = start(&app, "installation-exchange").await;
    approve(&app, &pool, started["user_code"].as_str().unwrap()).await;
    allow_poll_now(&pool, "installation-exchange").await;

    let transaction_id = Uuid::new_v4().to_string();
    let first = exchange(
        &app,
        started["device_code"].as_str().unwrap(),
        &transaction_id,
    )
    .await;
    let first_status = first.status();
    assert_no_store(&first);
    let first_body = json_body(first).await;
    assert_eq!(
        first_status,
        StatusCode::OK,
        "unexpected exchange body: {first_body}"
    );
    let first = first_body["data"].clone();
    let access_token = first["access_token"].as_str().unwrap();
    let refresh_token = first["refresh_token"].as_str().unwrap();
    assert!(access_token.starts_with(device_sessions::DEVICE_ACCESS_TOKEN_PREFIX));
    assert!(refresh_token.starts_with(device_sessions::DEVICE_REFRESH_TOKEN_PREFIX));
    assert_eq!(first["access"]["generation"], 0);
    assert_eq!(first["refresh"]["generation"], 0);

    let recovered = exchange(
        &app,
        started["device_code"].as_str().unwrap(),
        &transaction_id,
    )
    .await;
    assert_eq!(recovered.status(), StatusCode::OK);
    let recovered = json_body(recovered).await["data"].clone();
    assert_eq!(recovered["access_token"], first["access_token"]);
    assert_eq!(recovered["refresh_token"], first["refresh_token"]);

    let conflict = exchange(
        &app,
        started["device_code"].as_str().unwrap(),
        &Uuid::new_v4().to_string(),
    )
    .await;
    assert_eq!(conflict.status(), StatusCode::CONFLICT);
    assert_error(conflict, "exchange_transaction_conflict", None).await;

    let authorization = sqlx::query(
        "SELECT device_code_hash, user_code_hash, exchange_result_ciphertext FROM device_authorizations WHERE installation_id = ?1",
    )
    .bind("installation-exchange")
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        authorization.get::<String, _>("device_code_hash"),
        device_sessions::hash_device_token(started["device_code"].as_str().unwrap())
    );
    assert_ne!(
        authorization.get::<String, _>("user_code_hash"),
        started["user_code"]
    );
    let ciphertext = authorization.get::<String, _>("exchange_result_ciphertext");
    for raw_secret in [
        access_token,
        refresh_token,
        started["device_code"].as_str().unwrap(),
        started["user_code"].as_str().unwrap(),
    ] {
        assert!(!ciphertext.contains(raw_secret));
    }

    let access_hash: String =
        sqlx::query_scalar("SELECT access_token_hash FROM device_access_sessions")
            .fetch_one(&pool)
            .await
            .unwrap();
    let refresh_hash: String =
        sqlx::query_scalar("SELECT refresh_token_hash FROM device_refresh_credentials")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        access_hash,
        device_sessions::hash_device_token(access_token)
    );
    assert_eq!(
        refresh_hash,
        device_sessions::hash_device_token(refresh_token)
    );

    let audit_metadata: Vec<String> = sqlx::query_scalar(
        "SELECT metadata FROM audit_logs WHERE action LIKE 'device_authorization.%' ORDER BY id",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert!(audit_metadata.len() >= 3);
    for metadata in audit_metadata {
        for raw_secret in [
            access_token,
            refresh_token,
            started["device_code"].as_str().unwrap(),
            started["user_code"].as_str().unwrap(),
            CODE_VERIFIER,
        ] {
            assert!(
                !metadata.contains(raw_secret),
                "audit metadata leaked a raw secret: {metadata}"
            );
        }
    }
}

#[tokio::test]
async fn exchange_reports_pending_slow_down_denied_and_expired_with_stable_codes() {
    let pool = test_pool().await;
    let app = test_app(pool.clone());

    let pending = start(&app, "installation-pending").await;
    allow_poll_now(&pool, "installation-pending").await;
    let response = exchange(
        &app,
        pending["device_code"].as_str().unwrap(),
        &Uuid::new_v4().to_string(),
    )
    .await;
    let status = response.status();
    let retry_header = response.headers().get(header::RETRY_AFTER).cloned();
    let body = json_body(response).await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "unexpected pending body: {body}"
    );
    assert_eq!(body["error"]["code"], "authorization_pending");
    assert_eq!(body["error"]["retry_after"], 5);
    assert_eq!(retry_header.unwrap(), "5");
    let response = exchange(
        &app,
        pending["device_code"].as_str().unwrap(),
        &Uuid::new_v4().to_string(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_error_with_retry_header(response, "slow_down").await;

    let denied = start(&app, "installation-denied").await;
    deny(&app, &pool, denied["user_code"].as_str().unwrap()).await;
    let response = exchange(
        &app,
        denied["device_code"].as_str().unwrap(),
        &Uuid::new_v4().to_string(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_error(response, "authorization_denied", None).await;

    let expired = start(&app, "installation-expired").await;
    let past = (Utc::now() - Duration::seconds(1)).to_rfc3339_opts(SecondsFormat::Secs, true);
    sqlx::query(
        "UPDATE device_authorizations SET expires_at = ?1, next_poll_at = ?1 WHERE installation_id = ?2",
    )
    .bind(past)
    .bind("installation-expired")
    .execute(&pool)
    .await
    .unwrap();
    let response = exchange(
        &app,
        expired["device_code"].as_str().unwrap(),
        &Uuid::new_v4().to_string(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_error(response, "authorization_expired", None).await;
}

async fn start(app: &Router, installation_id: &str) -> Value {
    let response = start_authorization(app, None, installation_id).await;
    assert_eq!(response.status(), StatusCode::CREATED);
    assert_no_store(&response);
    json_body(response).await["data"].clone()
}

async fn start_authorization(
    app: &Router,
    credential: Option<(header::HeaderName, &'static str)>,
    installation_id: &str,
) -> Response {
    let mut request = Request::builder()
        .method("POST")
        .uri(START_PATH)
        .header(header::CONTENT_TYPE, "application/json");
    if let Some((name, value)) = credential {
        request = request.header(name, value);
    }
    app.clone()
        .oneshot(
            request
                .body(Body::from(start_payload(installation_id).to_string()))
                .unwrap(),
        )
        .await
        .unwrap()
}

async fn start_authorization_payload(app: &Router, payload: Value) -> Response {
    app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(START_PATH)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap()
}

async fn start_authorization_from_proxy(
    app: &Router,
    installation_id: &str,
    forwarded_ip: &str,
) -> Response {
    start_authorization_from_peer(app, installation_id, "172.17.0.1:43100", forwarded_ip).await
}

async fn start_authorization_from_peer(
    app: &Router,
    installation_id: &str,
    direct_peer: &str,
    forwarded_ip: &str,
) -> Response {
    let mut request = Request::builder()
        .method("POST")
        .uri(START_PATH)
        .header(header::CONTENT_TYPE, "application/json")
        .header("x-forwarded-for", forwarded_ip)
        .body(Body::from(start_payload(installation_id).to_string()))
        .unwrap();
    request
        .extensions_mut()
        .insert(ConnectInfo(direct_peer.parse::<SocketAddr>().unwrap()));
    app.clone().oneshot(request).await.unwrap()
}

fn start_payload(installation_id: &str) -> Value {
    json!({
        "code_challenge": pkce_challenge(CODE_VERIFIER),
        "code_challenge_method": "S256",
        "installation_id": installation_id,
        "device_name": "Integration Test Desktop",
        "platform": "test",
        "client_version": "0.1.0-test"
    })
}

async fn exchange(app: &Router, device_code: &str, transaction_id: &str) -> Response {
    app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(EXCHANGE_PATH)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    exchange_payload(device_code, transaction_id).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap()
}

async fn exchange_with_credential(
    app: &Router,
    credential: (header::HeaderName, &'static str),
) -> Response {
    app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(EXCHANGE_PATH)
                .header(header::CONTENT_TYPE, "application/json")
                .header(credential.0, credential.1)
                .body(Body::from(
                    exchange_payload("invalid", &Uuid::new_v4().to_string()).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap()
}

fn exchange_payload(device_code: &str, transaction_id: &str) -> Value {
    json!({
        "device_code": device_code,
        "code_verifier": CODE_VERIFIER,
        "exchange_transaction_id": transaction_id
    })
}

async fn approve(app: &Router, pool: &SqlitePool, user_code: &str) {
    decide(app, pool, user_code, "approve").await;
}

async fn deny(app: &Router, pool: &SqlitePool, user_code: &str) {
    decide(app, pool, user_code, "deny").await;
}

async fn decide(app: &Router, pool: &SqlitePool, user_code: &str, action: &str) {
    let session_cookie = bootstrap_admin_session(pool).await;
    let page = authorization_page(app, user_code, &session_cookie).await;
    assert_eq!(page.status(), StatusCode::OK);
    let csrf_cookie = page
        .headers()
        .get_all(header::SET_COOKIE)
        .iter()
        .find_map(|value| {
            let value = value.to_str().ok()?;
            value
                .starts_with(&format!("{CSRF_COOKIE_NAME}="))
                .then(|| cookie_pair(value))
        })
        .unwrap();
    let csrf_token = csrf_cookie.split_once('=').unwrap().1.to_string();
    let response = decision_request(
        app,
        action,
        user_code,
        &format!("{session_cookie}; {csrf_cookie}"),
        Some(&csrf_token),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_no_store(&response);
}

async fn authorization_page(app: &Router, user_code: &str, cookie: &str) -> Response {
    let query = serde_urlencoded::to_string([("user_code", user_code)]).unwrap();
    app.clone()
        .oneshot(
            Request::builder()
                .uri(format!("/web/device-authorization?{query}"))
                .header(header::COOKIE, cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap()
}

async fn decision_request(
    app: &Router,
    action: &str,
    user_code: &str,
    cookie: &str,
    csrf_token: Option<&str>,
) -> Response {
    let body = serde_urlencoded::to_string([
        ("_csrf", csrf_token.unwrap_or("")),
        ("user_code", user_code),
    ])
    .unwrap();
    app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/web/device-authorization/{action}"))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, cookie)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap()
}

async fn bootstrap_admin_session(pool: &SqlitePool) -> String {
    let existing_user: Option<i64> =
        sqlx::query_scalar("SELECT id FROM users WHERE username = 'admin'")
            .fetch_optional(pool)
            .await
            .unwrap();
    if existing_user.is_some() {
        let session = auth::issue_session(pool, existing_user.unwrap(), 12 * 60 * 60)
            .await
            .unwrap();
        return cookie_pair(&auth::session_cookie_header(&session.raw_token, false));
    }
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
    cookie_pair(&auth::session_cookie_header(
        &initialized.session.raw_token,
        false,
    ))
}

async fn allow_poll_now(pool: &SqlitePool, installation_id: &str) {
    let past = (Utc::now() - Duration::seconds(1)).to_rfc3339_opts(SecondsFormat::Secs, true);
    sqlx::query("UPDATE device_authorizations SET next_poll_at = ?1 WHERE installation_id = ?2")
        .bind(past)
        .bind(installation_id)
        .execute(pool)
        .await
        .unwrap();
}

async fn assert_error(response: Response, code: &str, retry_after: Option<i64>) {
    assert_no_store(&response);
    let retry_header = response
        .headers()
        .get(header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let body = json_body(response).await;
    assert_eq!(body["error"]["code"], code);
    match retry_after {
        Some(seconds) => {
            assert_eq!(body["error"]["retry_after"], seconds);
            assert_eq!(retry_header.as_deref(), Some(seconds.to_string().as_str()));
        }
        None => assert!(body["error"].get("retry_after").is_none()),
    }
}

async fn assert_error_with_retry_header(response: Response, code: &str) {
    assert_no_store(&response);
    let retry_header: i64 = response
        .headers()
        .get(header::RETRY_AFTER)
        .unwrap()
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let body = json_body(response).await;
    assert_eq!(body["error"]["code"], code);
    assert_eq!(body["error"]["retry_after"], retry_header);
    assert!(retry_header >= 1);
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

fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn cookie_pair(set_cookie: &str) -> String {
    set_cookie.split(';').next().unwrap().to_string()
}

async fn json_body(response: Response) -> Value {
    serde_json::from_str(&text_body(response).await).unwrap()
}

async fn text_body(response: Response) -> String {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    String::from_utf8(bytes.to_vec()).unwrap()
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
    };
    settings.device_sessions.server_instance_id = "device-auth-test".to_string();
    settings.device_sessions.trusted_proxy_cidrs = "172.16.0.0/12".to_string();
    settings.device_sessions.poll_interval = "5s".to_string();
    settings
}
