use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
    response::Response,
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::Utc;
use http_body_util::BodyExt;
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use tower::ServiceExt;
use uuid::Uuid;
use yuance_api::{
    domains::{bootstrap, device_sessions, projects, users},
    platform::{config::Settings, db},
    web::router::{AppState, build_router},
};

const CODE_VERIFIER: &str = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-._~";

#[tokio::test]
async fn device_principal_matches_business_read_write_and_revocation_contract() {
    let pool = test_pool().await;
    let admin_id = bootstrap_admin(&pool).await;
    projects::seed_demo_data(&pool, admin_id).await.unwrap();
    let credentials = issue_device_credentials(&pool, admin_id, "business-parity").await;
    let app = test_app(pool.clone());

    for path in [
        "/api/v1/auth/me",
        "/api/v1/projects",
        "/api/v1/current-project",
        "/api/v1/topbar/status",
        "/api/v1/notifications",
        "/api/v1/work-items?project_key=YCE",
        "/api/v1/work-items/YCE-TASK-2",
        "/api/v1/work-items/YCE-TASK-2/comments",
        "/api/v1/work-items/YCE-TASK-2/attachments",
    ] {
        let response = request(&app, "GET", path, &credentials.access_token, None).await;
        assert_eq!(response.status(), StatusCode::OK, "path: {path}");
    }

    let response = request(
        &app,
        "PATCH",
        "/api/v1/work-items/YCE-TASK-2",
        &credentials.access_token,
        Some(serde_json::json!({"title": "Device parity mutation"})),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(json_body(response).await["data"]["title"], "Device parity mutation");

    device_sessions::revoke_family_for_user(
        &pool,
        admin_id,
        &credentials.family_id,
        Utc::now(),
        "business_parity",
    )
    .await
    .unwrap();
    let response = request(
        &app,
        "GET",
        "/api/v1/work-items/YCE-TASK-2",
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn device_principal_does_not_bypass_project_membership_or_viewer_role() {
    let pool = test_pool().await;
    let admin_id = bootstrap_admin(&pool).await;
    projects::seed_demo_data(&pool, admin_id).await.unwrap();
    let viewer_id = users::create_user(
        &pool,
        users::CreateUserInput {
            username: "parity_viewer".to_string(),
            display_name: "Parity Viewer".to_string(),
            email: String::new(),
            mobile: String::new(),
            password: "ViewerPass2026!".to_string(),
            role_code: "member".to_string(),
        },
    )
    .await
    .unwrap();
    let credentials = issue_device_credentials(&pool, viewer_id, "viewer-parity").await;
    let app = test_app(pool.clone());

    let response = request(
        &app,
        "GET",
        "/api/v1/work-items/YCE-TASK-2",
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let project_id = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM projects WHERE project_key = 'YCE'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO project_members (project_id, user_id, member_role) VALUES (?1, ?2, 'viewer')",
    )
    .bind(project_id)
    .bind(viewer_id)
    .execute(&pool)
    .await
    .unwrap();

    let response = request(
        &app,
        "GET",
        "/api/v1/work-items/YCE-TASK-2",
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let response = request(
        &app,
        "PATCH",
        "/api/v1/work-items/YCE-TASK-2",
        &credentials.access_token,
        Some(serde_json::json!({"title": "forbidden viewer mutation"})),
    )
    .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let response = request(
        &app,
        "GET",
        "/api/v1/projects/YCE",
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
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

async fn issue_device_credentials(
    pool: &SqlitePool,
    user_id: i64,
    installation_id: &str,
) -> device_sessions::InitialDeviceCredentials {
    let now = Utc::now();
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(CODE_VERIFIER.as_bytes()));
    let policy = device_sessions::DeviceSessionPolicy {
        server_instance_id: "device-business-parity".to_string(),
        authorization_ttl_seconds: 600,
        access_ttl_seconds: 900,
        refresh_sliding_ttl_seconds: 30 * 24 * 60 * 60,
        refresh_absolute_ttl_seconds: 90 * 24 * 60 * 60,
        idempotency_ttl_seconds: 24 * 60 * 60,
        poll_interval_seconds: 5,
    };
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

async fn request(
    app: &Router,
    method: &str,
    path: &str,
    token: &str,
    payload: Option<Value>,
) -> Response {
    let mut request = Request::builder()
        .method(method)
        .uri(path)
        .header(header::AUTHORIZATION, format!("Bearer {token}"));
    let body = if let Some(payload) = payload {
        request = request.header(header::CONTENT_TYPE, "application/json");
        Body::from(payload.to_string())
    } else {
        Body::empty()
    };
    app.clone().oneshot(request.body(body).unwrap()).await.unwrap()
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

fn test_settings() -> Settings {
    let mut settings = Settings {
        http_addr: "127.0.0.1:33034".parse().unwrap(),
        database_url: format!(
            "sqlite:file:device-business-parity-{}?mode=memory&cache=shared",
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
    settings.device_sessions.server_instance_id = "device-business-parity".to_string();
    settings.device_sessions.trusted_proxy_cidrs.clear();
    settings
}
