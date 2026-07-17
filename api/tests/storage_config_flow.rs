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
    assert!(body.contains(r#"value="https://oss-cn-hangzhou.aliyuncs.com""#));
    assert!(body.contains(r#"value="oss-cn-hangzhou""#));
    assert!(body.contains(r#"value="yuance-files""#));
    assert!(body.contains("qfy-sc 兼容策略"));
    assert!(body.contains("对象存储尚未激活，请先保存并激活配置。"));
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
async fn storage_config_save_uses_qfy_compatible_defaults_for_blank_fields() {
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
                    "endpoint=&region=&bucket=&access_key_id=AKIAUNIT5SECRETID&access_key_secret=Unit5SecretValue2026%21&activate=on",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    assert!(body.contains("对象存储配置已保存"));
    assert!(body.contains("yuance-files"));
    assert!(body.contains("oss-cn-hangzhou"));

    let (endpoint, region, bucket) = sqlx::query_as::<_, (String, String, String)>(
        r#"
        SELECT endpoint, region, bucket
        FROM storage_configs
        WHERE status = 'active'
        "#,
    )
    .fetch_one(&pool)
    .await
    .expect("storage config should exist");

    assert_eq!(endpoint, storage::DEFAULT_ALIYUN_OSS_ENDPOINT);
    assert_eq!(region, storage::DEFAULT_ALIYUN_OSS_REGION);
    assert_eq!(bucket, storage::DEFAULT_ALIYUN_OSS_BUCKET);
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
async fn storage_config_rejects_memory_endpoint_outside_test_environment() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let mut non_test_settings = test_settings();
    non_test_settings.env = "production".to_string();
    let app = build_router(AppState::new(non_test_settings, Some(pool.clone())));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/storage")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .body(Body::from(with_csrf(
                    "endpoint=memory%3A%2F%2Fyuance-tests&region=test&bucket=yuance-files&access_key_id=AKIAUNIT5SECRETID&access_key_secret=Unit5SecretValue2026%21&activate=on",
                )))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let body = response_body(response).await;
    assert!(body.contains("memory 测试对象存储只允许在 test 环境使用"));
    let config_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM storage_configs")
        .fetch_one(&pool)
        .await
        .expect("config count should load");
    assert_eq!(config_count, 0);
}

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
async fn storage_page_renders_versions_and_can_rollback() {
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

    let page_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/system/storage")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(page_response.status(), StatusCode::OK);
    let page_body = response_body(page_response).await;
    assert!(page_body.contains("配置版本"));
    assert!(page_body.contains("v1"));
    assert!(page_body.contains("v2"));
    assert!(page_body.contains("yuance-old"));
    assert!(page_body.contains("yuance-new"));
    assert!(page_body.contains(r#"data-confirm-title="回滚对象存储配置""#));
    assert!(page_body.contains(r#"action="/web/system/storage/versions/1/rollback""#));
    assert!(!page_body.contains("OldSecretValue2026"));
    assert!(!page_body.contains("NewSecretValue2026"));

    let rollback_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/storage/versions/1/rollback")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .body(Body::from(format!("_csrf={CSRF_TOKEN}")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(rollback_response.status(), StatusCode::OK);
    let rollback_body = response_body(rollback_response).await;
    assert!(rollback_body.contains("已回滚到 v1 的配置快照"));
    assert!(rollback_body.contains("yuance-old"));
    assert!(rollback_body.contains("v3"));

    let active = storage::active_config(&pool)
        .await
        .expect("active config should load")
        .expect("active config should exist");
    assert_eq!(active.bucket, "yuance-old");
    assert_eq!(active.version, 3);
}

#[tokio::test]
async fn storage_page_paginates_versions_and_preserves_page_on_rollback() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    for index in 1..=12 {
        storage::save_config(
            &pool,
            &test_settings(),
            initialized.user_id,
            storage::SaveStorageConfigInput {
                endpoint: storage::TEST_MEMORY_ENDPOINT.to_string(),
                region: "test".to_string(),
                bucket: format!("yuance-version-{index}"),
                access_key_id: format!("AKIAPAGE{index:02}SECRETID"),
                access_key_secret: format!("PageSecretValue{index:02}!2026"),
                activate: true,
            },
        )
        .await
        .expect("storage config should save");
    }
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let page_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/system/storage?page=2")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(page_response.status(), StatusCode::OK);
    let page_body = response_body(page_response).await;
    assert!(page_body.contains("共 12 个版本"));
    assert!(page_body.contains("当前显示 11-12"));
    assert!(page_body.contains(r#"href="/web/system/storage?page=2" aria-current="page">2</a>"#));
    assert!(page_body.contains(r#"action="/web/system/storage/versions/1/rollback""#));
    assert!(page_body.contains(r#"name="page" value="2""#));
    assert!(page_body.contains(r#"name="per_page" value="10""#));

    let invalid_rollback_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/storage/versions/1/rollback")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .body(Body::from(format!("_csrf={CSRF_TOKEN}&page=0&per_page=10")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(invalid_rollback_response.status(), StatusCode::BAD_REQUEST);
    let active_before = storage::active_config(&pool)
        .await
        .expect("active config should load")
        .expect("active config should exist");
    assert_eq!(active_before.version, 12);

    let rollback_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/storage/versions/1/rollback")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .body(Body::from(format!("_csrf={CSRF_TOKEN}&page=2&per_page=10")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(rollback_response.status(), StatusCode::OK);
    let rollback_body = response_body(rollback_response).await;
    assert!(rollback_body.contains("已回滚到 v1 的配置快照"));
    assert!(rollback_body.contains("共 13 个版本"));
    assert!(rollback_body.contains("当前显示 11-13"));
    assert!(rollback_body.contains(r#"name="page" value="2""#));

    let active = storage::active_config(&pool)
        .await
        .expect("active config should load")
        .expect("active config should exist");
    assert_eq!(active.version, 13);
    assert_eq!(active.bucket, "yuance-version-1");
}

#[tokio::test]
async fn storage_page_can_probe_active_config_without_leaking_secret() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    storage::save_config(
        &pool,
        &test_settings(),
        initialized.user_id,
        storage::SaveStorageConfigInput {
            endpoint: storage::TEST_MEMORY_ENDPOINT.to_string(),
            region: "test".to_string(),
            bucket: "yuance-probe-files".to_string(),
            access_key_id: "AKIAUNIT5SECRETID".to_string(),
            access_key_secret: "Unit5SecretValue2026!".to_string(),
            activate: true,
        },
    )
    .await
    .expect("storage config should save");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let page_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/system/storage")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let page_body = response_body(page_response).await;
    assert!(page_body.contains(r#"action="/web/system/storage/probe""#));
    assert!(page_body.contains("测试连接"));

    let probe_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/storage/probe")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .body(Body::from(format!("_csrf={CSRF_TOKEN}")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(probe_response.status(), StatusCode::OK);
    let probe_body = response_body(probe_response).await;
    assert!(probe_body.contains("对象存储桶可读写，但需要初始化"));
    assert!(probe_body.contains("storage-message-warning"));
    assert!(!probe_body.contains("Unit5SecretValue2026!"));
    assert!(!probe_body.contains("AKIAUNIT5SECRETID"));

    let audit_count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM audit_logs
        WHERE action = 'storage.config.probe'
          AND metadata LIKE '%"source":"web"%'
          AND metadata LIKE '%"ok":true%'
        "#,
    )
    .fetch_one(&pool)
    .await
    .expect("audit count should load");
    assert_eq!(audit_count, 1);
}

#[tokio::test]
async fn storage_probe_page_renders_sanitized_failure_for_missing_active_config() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/storage/probe")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, with_csrf_cookie(&initialized.cookie))
                .body(Body::from(format!("_csrf={CSRF_TOKEN}")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    assert!(body.contains("对象存储探测失败"));
    assert!(body.contains("对象存储未激活"));
    assert!(body.contains("storage-message-error"));
}

#[tokio::test]
async fn storage_bucket_inspect_and_initialize_marks_runtime_ready() {
    let pool = test_pool().await;
    let initialized = bootstrap_admin_session(&pool).await;
    storage::save_config(
        &pool,
        &test_settings(),
        initialized.user_id,
        storage::SaveStorageConfigInput {
            endpoint: storage::TEST_MEMORY_ENDPOINT.to_string(),
            region: "test".to_string(),
            bucket: "yuance-init-files".to_string(),
            access_key_id: "AKIAUNIT5SECRETID".to_string(),
            access_key_secret: "Unit5SecretValue2026!".to_string(),
            activate: true,
        },
    )
    .await
    .expect("storage config should save");
    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let admin_cookie = with_csrf_cookie(&initialized.cookie);

    let page_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/web/system/storage")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    let page_body = response_body(page_response).await;
    assert!(page_body.contains("桶状态"));
    assert!(page_body.contains("需要初始化"));
    assert!(page_body.contains(r#"action="/web/system/storage/initialize""#));

    let initialize_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/web/system/storage/initialize")
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .header(header::COOKIE, admin_cookie.clone())
                .body(Body::from(format!("_csrf={CSRF_TOKEN}")))
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(initialize_response.status(), StatusCode::OK);
    let initialize_body = response_body(initialize_response).await;
    assert!(initialize_body.contains("对象存储桶初始化完成"));
    assert!(initialize_body.contains("运行就绪"));
    assert!(initialize_body.contains("yuance-system/.initialized"));
    assert!(!initialize_body.contains("Unit5SecretValue2026!"));
    assert!(!initialize_body.contains("AKIAUNIT5SECRETID"));

    let api_inspect = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/storage/config/inspect")
                .header(header::COOKIE, initialized.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(api_inspect.status(), StatusCode::OK);
    let inspect_body = response_body(api_inspect).await;
    assert!(inspect_body.contains(r#""initialized":true"#));
    assert!(inspect_body.contains(r#""needs_initialization":false"#));
    assert!(inspect_body.contains("yuance-system/.initialized"));

    let api_initialize_missing_csrf = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/storage/config/initialize")
                .header(header::COOKIE, initialized.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(api_initialize_missing_csrf.status(), StatusCode::FORBIDDEN);
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
        onlyoffice_document_server_url: String::new(),
        onlyoffice_jwt_secret: String::new(),
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
