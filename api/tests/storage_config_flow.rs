use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use tower::ServiceExt;
use yuance_api::{
    domains::{auth, bootstrap, files, rbac, storage},
    platform::{config::Settings, db},
    web::router::{AppState, build_router},
};

const CSRF_TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

#[tokio::test]
async fn storage_page_renders_empty_state_for_admin() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/storage")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    assert!(body.contains("阿里云 OSS"));
    assert!(body.contains("尚未配置对象存储"));
    assert!(body.contains(r#"data-modal-open="storage-config-modal""#));
    assert!(body.contains(r#"id="storage-config-modal""#));
    assert!(body.contains(r#"role="dialog""#));
    assert!(body.contains("name=\"_csrf\""));
}

#[tokio::test]
async fn storage_config_save_encrypts_secret_and_renders_masked_config() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/storage")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .body(Body::from(with_csrf(
                    "endpoint=https%3A%2F%2Foss-cn-hangzhou.aliyuncs.com&region=cn-hangzhou&bucket=yuance-files&access_key_id=AKIAUNIT5SECRETID&access_key_secret=Unit5SecretValue2026%21&activate=on",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    assert!(body.contains("对象存储配置已保存"));
    assert!(body.contains("yuance-files"));
    assert!(body.contains("AKIA****ETID"));
    assert!(body.contains("已激活"));
    assert!(!body.contains("AKIAUNIT5SECRETID"));
    assert!(!body.contains("Unit5SecretValue2026"));

    let (id_ciphertext, secret_ciphertext, hint, status) =
        sqlx::query_as::<_, (String, String, String, String)>(
            r#"
            SELECT
                access_key_id_ciphertext,
                access_key_secret_ciphertext,
                access_key_id_hint,
                status
            FROM storage_configs
            WHERE bucket = 'yuance-files'
            "#,
        )
        .fetch_one(&pool)
        .await
        .expect("storage config should exist");

    assert_eq!(hint, "AKIA****ETID");
    assert_eq!(status, "active");
    assert_ne!(id_ciphertext, "AKIAUNIT5SECRETID");
    assert_ne!(secret_ciphertext, "Unit5SecretValue2026!");
    assert!(id_ciphertext.starts_with("v1:"));
    assert!(secret_ciphertext.starts_with("v1:"));
}

#[tokio::test]
async fn storage_config_requires_csrf_and_manage_permission() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    create_user_with_role(&pool, "member1", "成员一", "MemberPass2026!", "member").await;
    let member_session = auth::login(&pool, "member1", "MemberPass2026!")
        .await
        .expect("member should login");
    let member_cookie = auth::session_cookie_header(&member_session.raw_token, false);
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let missing_csrf = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/storage")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::from(storage_body()))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(missing_csrf.status(), StatusCode::FORBIDDEN);

    let member_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/storage")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, with_csrf_cookie(&member_cookie))
                .body(Body::from(with_csrf(&storage_body())))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(member_response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn storage_config_validation_rejects_invalid_bucket() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/storage")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .body(Body::from(with_csrf(
                    "endpoint=https%3A%2F%2Foss-cn-hangzhou.aliyuncs.com&region=cn-hangzhou&bucket=Invalid_Bucket&access_key_id=AKIAUNIT5SECRETID&access_key_secret=Unit5SecretValue2026%21&activate=on",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn file_object_metadata_uses_active_storage_config() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    storage::save_config(
        &pool,
        &test_settings(),
        initialized.user_id,
        storage::SaveStorageConfigInput {
            endpoint: "https://oss-cn-hangzhou.aliyuncs.com".to_string(),
            region: "cn-hangzhou".to_string(),
            bucket: "yuance-files".to_string(),
            access_key_id: "AKIAUNIT5SECRETID".to_string(),
            access_key_secret: "Unit5SecretValue2026!".to_string(),
            activate: true,
        },
    )
    .await
    .expect("storage config should save");
    let config = storage::active_config(&pool)
        .await
        .expect("active config query should work")
        .expect("active config should exist");

    let object = files::create_file_object(
        &pool,
        &config,
        files::CreateFileObjectInput {
            original_filename: "roadmap.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 1024,
            created_by_user_id: initialized.user_id,
        },
    )
    .await
    .expect("file object should create");

    assert_eq!(object.original_filename, "roadmap.pdf");
    assert_eq!(object.content_type, "application/pdf");
    assert_eq!(object.byte_size, 1024);
    assert_eq!(object.status, "pending");
    assert!(object.object_key.starts_with("uploads/pending/"));
    assert!(object.object_key.ends_with(".pdf"));
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
        user_id: result.user_id,
        cookie: auth::session_cookie_header(&result.session.raw_token, false),
    }
}

struct InitializedAdmin {
    user_id: i64,
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
        security_master_key: "test-master-key-that-is-long-enough".to_string(),
    }
}

fn csrf_cookie() -> String {
    format!("yuance_csrf={CSRF_TOKEN}")
}

fn with_csrf_cookie(session_cookie: &str) -> String {
    format!("{session_cookie}; {}", csrf_cookie())
}

fn with_csrf(body: &str) -> String {
    format!("{body}&_csrf={CSRF_TOKEN}")
}

fn storage_body() -> String {
    "endpoint=https%3A%2F%2Foss-cn-hangzhou.aliyuncs.com&region=cn-hangzhou&bucket=yuance-files&access_key_id=AKIAUNIT5SECRETID&access_key_secret=Unit5SecretValue2026%21&activate=on".to_string()
}
