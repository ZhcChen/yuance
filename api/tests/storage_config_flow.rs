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
async fn storage_config_versions_can_list_and_rollback_through_api() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    storage::save_config(
        &pool,
        &test_settings(),
        initialized.user_id,
        storage::SaveStorageConfigInput {
            endpoint: storage::TEST_MEMORY_ENDPOINT.to_string(),
            region: "test".to_string(),
            bucket: "yuance-old".to_string(),
            access_key_id: "AKIAOLDSECRETID".to_string(),
            access_key_secret: "OldSecretValue2026!".to_string(),
            activate: true,
        },
    )
    .await
    .expect("first storage config should save");
    storage::save_config(
        &pool,
        &test_settings(),
        initialized.user_id,
        storage::SaveStorageConfigInput {
            endpoint: storage::TEST_MEMORY_ENDPOINT.to_string(),
            region: "test".to_string(),
            bucket: "yuance-new".to_string(),
            access_key_id: "AKIANEWSECRETID".to_string(),
            access_key_secret: "NewSecretValue2026!".to_string(),
            activate: true,
        },
    )
    .await
    .expect("second storage config should save");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let list_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/storage/config/versions")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(list_response.status(), StatusCode::OK);
    let list_body = response_body(list_response).await;
    assert!(list_body.contains(r#""version":2"#));
    assert!(list_body.contains(r#""version":1"#));
    assert!(list_body.contains(r#""bucket":"yuance-old""#));
    assert!(list_body.contains(r#""bucket":"yuance-new""#));
    assert!(list_body.contains(r#""current_status":"active""#));
    assert!(list_body.contains(r#""current_status":"disabled""#));
    assert!(!list_body.contains("OldSecretValue2026"));
    assert!(!list_body.contains("NewSecretValue2026"));
    assert!(!list_body.contains("AKIAOLDSECRETID"));
    assert!(!list_body.contains("AKIANEWSECRETID"));

    let rollback_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/storage/config/versions/1/rollback")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(rollback_response.status(), StatusCode::OK);
    let rollback_body = response_body(rollback_response).await;
    assert!(rollback_body.contains(r#""bucket":"yuance-old""#));
    assert!(rollback_body.contains(r#""version":3"#));
    assert!(rollback_body.contains(r#""status":"active""#));
    assert!(!rollback_body.contains("OldSecretValue2026"));
    assert!(!rollback_body.contains("AKIAOLDSECRETID"));

    let active = storage::active_config(&pool)
        .await
        .expect("active config should load")
        .expect("active config should exist");
    assert_eq!(active.bucket, "yuance-old");
    assert_eq!(active.version, 3);
    let active_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM storage_configs WHERE provider = 'aliyun_oss' AND status = 'active'",
    )
    .fetch_one(&pool)
    .await
    .expect("active count should load");
    assert_eq!(active_count, 1);
    let audit_count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM audit_logs
        WHERE action = 'storage.config.rollback'
          AND metadata LIKE '%"source":"api"%'
          AND metadata LIKE '%"from_version":1%'
          AND metadata LIKE '%"new_version":3%'
        "#,
    )
    .fetch_one(&pool)
    .await
    .expect("audit count should load");
    assert_eq!(audit_count, 1);
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
            folder_id: None,
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

#[tokio::test]
async fn same_name_file_objects_use_distinct_server_generated_object_keys() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    storage::save_config(
        &pool,
        &test_settings(),
        initialized.user_id,
        storage::SaveStorageConfigInput {
            endpoint: storage::TEST_MEMORY_ENDPOINT.to_string(),
            region: "test".to_string(),
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

    let first = files::create_file_object(
        &pool,
        &config,
        files::CreateFileObjectInput {
            folder_id: None,
            original_filename: "roadmap.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 5,
            created_by_user_id: initialized.user_id,
        },
    )
    .await
    .expect("first file object should create");
    let second = files::create_file_object(
        &pool,
        &config,
        files::CreateFileObjectInput {
            folder_id: None,
            original_filename: "roadmap.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: 6,
            created_by_user_id: initialized.user_id,
        },
    )
    .await
    .expect("second file object should create");

    assert_eq!(first.original_filename, "roadmap.pdf");
    assert_eq!(second.original_filename, "roadmap.pdf");
    assert_ne!(first.object_key, second.object_key);
    assert!(first.object_key.starts_with("uploads/pending/"));
    assert!(second.object_key.starts_with("uploads/pending/"));

    storage::write_test_memory_object(
        &pool,
        &test_settings(),
        &first.object_key,
        &first.content_type,
        b"first".to_vec(),
    )
    .await
    .expect("first object should write");
    storage::write_test_memory_object(
        &pool,
        &test_settings(),
        &second.object_key,
        &second.content_type,
        b"second".to_vec(),
    )
    .await
    .expect("second object should write");

    let (_, first_content) =
        storage::read_test_memory_object(&pool, &test_settings(), &first.object_key)
            .await
            .expect("first object should read")
            .expect("first object should exist");
    let (_, second_content) =
        storage::read_test_memory_object(&pool, &test_settings(), &second.object_key)
            .await
            .expect("second object should read")
            .expect("second object should exist");
    assert_eq!(first_content, b"first");
    assert_eq!(second_content, b"second");
}

#[tokio::test]
async fn build_operator_returns_none_without_active_config() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;

    let operator = storage::build_operator_from_active_config(&pool, &test_settings())
        .await
        .expect("operator lookup should not fail");

    assert!(operator.is_none());
}

#[tokio::test]
async fn active_storage_secret_decryption_failure_is_reported() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    storage::save_config(
        &pool,
        &test_settings(),
        initialized.user_id,
        storage::SaveStorageConfigInput {
            endpoint: storage::TEST_MEMORY_ENDPOINT.to_string(),
            region: "test".to_string(),
            bucket: "yuance-files".to_string(),
            access_key_id: "AKIAUNIT5SECRETID".to_string(),
            access_key_secret: "Unit5SecretValue2026!".to_string(),
            activate: true,
        },
    )
    .await
    .expect("storage config should save");
    sqlx::query(
        r#"
        UPDATE storage_configs
        SET access_key_secret_ciphertext = 'v1:not-valid:still-invalid'
        WHERE status = 'active'
        "#,
    )
    .execute(&pool)
    .await
    .expect("ciphertext should corrupt");

    let error = storage::build_operator_from_active_config(&pool, &test_settings())
        .await
        .expect_err("corrupted storage secret should fail");

    assert!(error.to_string().contains("敏感配置处理失败"));
}

#[tokio::test]
async fn api_storage_config_save_masks_secret_and_requires_permission() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let member_id = create_user_with_role(
        &pool,
        "storage_api_member",
        "存储普通成员",
        "MemberPass2026!",
        "member",
    )
    .await;
    let member_session = auth::issue_session(&pool, member_id, 3600)
        .await
        .expect("member session should issue");
    let member_cookie = auth::session_cookie_header(&member_session.raw_token, false);
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let forbidden_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/storage/config")
                .header(header::COOKIE, member_cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(forbidden_response.status(), StatusCode::FORBIDDEN);

    let admin_cookie = with_csrf_cookie(&initialized.cookie);
    let save_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/storage/config")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, admin_cookie)
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(
                    r#"{"endpoint":"https://oss-cn-hangzhou.aliyuncs.com","region":"cn-hangzhou","bucket":"yuance-files","access_key_id":"AKIAUNIT5SECRETID","access_key_secret":"Unit5SecretValue2026!","activate":true}"#,
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(save_response.status(), StatusCode::CREATED);
    let save_body = response_body(save_response).await;
    assert!(save_body.contains(r#""bucket":"yuance-files""#));
    assert!(save_body.contains(r#""access_key_id_hint":"AKIA****ETID""#));
    assert!(!save_body.contains("Unit5SecretValue2026!"));
    assert!(!save_body.contains("AKIAUNIT5SECRETID"));

    let get_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/storage/config")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(get_response.status(), StatusCode::OK);
    let get_body = response_body(get_response).await;
    assert!(get_body.contains(r#""status":"active""#));
    assert!(!get_body.contains("Unit5SecretValue2026!"));
}

#[tokio::test]
async fn api_system_storage_view_returns_one_masked_paginated_snapshot() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let settings = test_settings();
    for index in 1..=12 {
        storage::save_config(
            &pool,
            &settings,
            initialized.user_id,
            storage::SaveStorageConfigInput {
                endpoint: storage::TEST_MEMORY_ENDPOINT.to_string(),
                region: "test".to_string(),
                bucket: format!("storage-view-{index:02}"),
                access_key_id: "AKIASTORAGEVIEWSECRET".to_string(),
                access_key_secret: "StorageViewSecret2026!".to_string(),
                activate: true,
            },
        )
        .await
        .expect("storage config should save");
    }
    let app = build_router(AppState::new(settings, Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/storage-view?page=2&per_page=10")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    let payload: serde_json::Value =
        serde_json::from_str(&body).expect("storage view should be JSON");
    assert_eq!(payload["data"]["config"]["bucket"], "storage-view-12");
    assert_eq!(
        payload["data"]["config"]["access_key_id_hint"],
        "AKIA****CRET"
    );
    assert_eq!(payload["data"]["versions"].as_array().unwrap().len(), 2);
    assert_eq!(payload["data"]["pagination"]["page"], 2);
    assert_eq!(payload["data"]["pagination"]["total_items"], 12);
    assert_eq!(payload["data"]["pagination"]["total_pages"], 2);
    assert_eq!(payload["data"]["can_manage_storage"], true);
    assert!(!body.contains("AKIASTORAGEVIEWSECRET"));
    assert!(!body.contains("StorageViewSecret2026"));
}

#[tokio::test]
async fn api_system_storage_view_returns_stable_empty_state_and_requires_view_permission() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let member_id = create_user_with_role(
        &pool,
        "storage_view_member",
        "存储读取普通成员",
        "MemberPass2026!",
        "member",
    )
    .await;
    let member_session = auth::issue_session(&pool, member_id, 3600)
        .await
        .expect("member session should issue");
    let member_cookie = auth::session_cookie_header(&member_session.raw_token, false);
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let forbidden_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/storage-view")
                .header(header::COOKIE, member_cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(forbidden_response.status(), StatusCode::FORBIDDEN);

    let empty_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/system/storage-view")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(empty_response.status(), StatusCode::OK);
    let body = response_body(empty_response).await;
    let payload: serde_json::Value =
        serde_json::from_str(&body).expect("storage view should be JSON");
    assert!(payload["data"]["config"].is_null());
    assert_eq!(payload["data"]["versions"], serde_json::json!([]));
    assert_eq!(payload["data"]["pagination"]["page"], 1);
    assert_eq!(payload["data"]["pagination"]["per_page"], 10);
    assert_eq!(payload["data"]["pagination"]["total_items"], 0);
    assert_eq!(payload["data"]["pagination"]["total_pages"], 1);
    assert!(payload["data"]["inspection"].is_null());
    assert_eq!(
        payload["data"]["inspection_error"],
        "对象存储尚未配置，请先保存并激活配置。"
    );
    assert_eq!(payload["data"]["can_manage_storage"], true);
}

#[tokio::test]
async fn api_storage_config_probe_uses_active_config_without_leaking_secret() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let admin_cookie = with_csrf_cookie(&initialized.cookie);

    let save_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/storage/config")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, admin_cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::from(format!(
                    r#"{{"endpoint":"{}","region":"test","bucket":"yuance-files","access_key_id":"AKIAUNIT5SECRETID","access_key_secret":"Unit5SecretValue2026!","activate":true}}"#,
                    storage::TEST_MEMORY_ENDPOINT
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(save_response.status(), StatusCode::CREATED);

    let probe_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/storage/config/probe")
                .header(header::COOKIE, admin_cookie.clone())
                .header("x-yuance-csrf-token", CSRF_TOKEN)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(probe_response.status(), StatusCode::OK);
    let probe_body = response_body(probe_response).await;
    assert!(probe_body.contains(r#""ok":true"#));
    assert!(probe_body.contains("对象存储探测通过"));
    assert!(!probe_body.contains("Unit5SecretValue2026!"));
    assert!(!probe_body.contains("AKIAUNIT5SECRETID"));

    let missing_csrf_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/storage/config/probe")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(missing_csrf_response.status(), StatusCode::FORBIDDEN);
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
        session_ttl: "2h".to_string(),
        refresh_session_ttl: "30d".to_string(),
        cache_session_ttl: "5m".to_string(),
        log_level: "off".to_string(),
        env: "test".to_string(),
        security_master_key: "test-master-key-that-is-long-enough".to_string(),
        file_master_key: "test-file-master-key-that-is-long-enough".to_string(),
        device_sessions: Default::default(),
        experimental_legacy_preview_enabled: false,
    }
}

fn csrf_cookie() -> String {
    format!("yuance_csrf={CSRF_TOKEN}")
}

fn with_csrf_cookie(session_cookie: &str) -> String {
    format!("{session_cookie}; {}", csrf_cookie())
}
