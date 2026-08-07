use sqlx::SqlitePool;
use uuid::Uuid;
use yuance_api::{
    domains::device_sessions::{
        DEVICE_ACCESS_AUDIENCE, DEVICE_ACCESS_ISSUER, DEVICE_ACCESS_TOKEN_PREFIX,
        DEVICE_REFRESH_AUDIENCE, DEVICE_REFRESH_TOKEN_PREFIX, exchange_result_aad,
        hash_device_token, is_device_access_token, is_device_refresh_token, issue_access_token,
        issue_refresh_token, refresh_rotation_aad,
    },
    platform::{config::Settings, db},
};

const TRANSACTION_1: &str = "550e8400-e29b-41d4-a716-446655440001";
const TRANSACTION_2: &str = "550e8400-e29b-41d4-a716-446655440002";
const TRANSACTION_3: &str = "550e8400-e29b-41d4-a716-446655440003";

#[tokio::test]
async fn device_session_migration_creates_isolated_contract_tables() {
    let pool = test_pool().await;

    for table in [
        "device_authorizations",
        "devices",
        "device_credential_families",
        "device_access_sessions",
        "device_refresh_credentials",
        "device_refresh_rotations",
    ] {
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
        )
        .bind(table)
        .fetch_one(&pool)
        .await
        .expect("table lookup should succeed");
        assert_eq!(count, 1, "{table} should exist");
    }

    for legacy_table in ["sessions", "refresh_sessions", "api_tokens"] {
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
        )
        .bind(legacy_table)
        .fetch_one(&pool)
        .await
        .expect("legacy table lookup should succeed");
        assert_eq!(count, 1, "{legacy_table} should remain available");
    }
}

#[tokio::test]
async fn device_session_schema_rejects_duplicate_identity_generation_and_transaction() {
    let pool = test_pool().await;
    let user_id = insert_user(&pool).await;
    insert_device(&pool, "device-1", user_id, "installation-1")
        .await
        .expect("first device should insert");

    let duplicate_device = insert_device(&pool, "device-2", user_id, "installation-1").await;
    assert!(
        duplicate_device.is_err(),
        "installation identity must be unique"
    );

    insert_family(&pool, "family-1", "device-1", user_id)
        .await
        .expect("family should insert");
    insert_access(
        &pool,
        "access-1",
        "family-1",
        "device-1",
        user_id,
        0,
        DEVICE_ACCESS_ISSUER,
        DEVICE_ACCESS_AUDIENCE,
    )
    .await
    .expect("first access generation should insert");
    let duplicate_access_generation = insert_access(
        &pool,
        "access-2",
        "family-1",
        "device-1",
        user_id,
        0,
        DEVICE_ACCESS_ISSUER,
        DEVICE_ACCESS_AUDIENCE,
    )
    .await;
    assert!(
        duplicate_access_generation.is_err(),
        "a family generation must have one canonical access session"
    );
    insert_refresh(&pool, "refresh-1", "family-1", "device-1", user_id, 0)
        .await
        .expect("first generation should insert");

    let duplicate_generation =
        insert_refresh(&pool, "refresh-2", "family-1", "device-1", user_id, 0).await;
    assert!(
        duplicate_generation.is_err(),
        "a family generation must have one refresh credential"
    );

    insert_rotation(
        &pool,
        "rotation-1",
        "family-1",
        "device-1",
        user_id,
        0,
        "refresh-1-hash",
        TRANSACTION_1,
    )
    .await
    .expect("first rotation should insert");
    let duplicate_source = insert_rotation(
        &pool,
        "rotation-2",
        "family-1",
        "device-1",
        user_id,
        0,
        "refresh-1-hash",
        TRANSACTION_2,
    )
    .await;
    assert!(
        duplicate_source.is_err(),
        "a source generation must have one canonical rotation"
    );

    insert_device(&pool, "device-2", user_id, "installation-2")
        .await
        .expect("second installation should insert");
    insert_family(&pool, "family-2", "device-2", user_id)
        .await
        .expect("second family should insert");
    insert_refresh(&pool, "refresh-2", "family-2", "device-2", user_id, 0)
        .await
        .expect("second family refresh should insert");
    let duplicate_transaction = insert_rotation(
        &pool,
        "rotation-3",
        "family-2",
        "device-2",
        user_id,
        0,
        "refresh-2-hash",
        TRANSACTION_1,
    )
    .await;
    assert!(
        duplicate_transaction.is_err(),
        "transaction ids must not be reusable across families"
    );

    let delete_user = sqlx::query("DELETE FROM users WHERE id = ?1")
        .bind(user_id)
        .execute(&pool)
        .await;
    assert!(
        delete_user.is_err(),
        "device security records must prevent implicit user deletion"
    );
}

#[tokio::test]
async fn device_session_schema_rejects_invalid_states_and_cross_family_references() {
    let pool = test_pool().await;
    let user_id = insert_user(&pool).await;

    let invalid_authorization = sqlx::query(
        r#"
        INSERT INTO device_authorizations (
            id, device_code_hash, user_code_hash, code_challenge,
            server_instance_id, installation_id, device_name, platform,
            client_version, authorization_status, poll_interval_seconds, expires_at
        ) VALUES (
            'authorization-1', 'device-code-hash', 'user-code-hash', 'challenge',
            'test-server', 'installation-1', 'Test', 'test', '0.1.0',
            'invalid', 5, datetime('now', '+10 minutes')
        )
        "#,
    )
    .execute(&pool)
    .await;
    assert!(invalid_authorization.is_err());

    let contradictory_authorization = sqlx::query(
        r#"
        INSERT INTO device_authorizations (
            id, device_code_hash, user_code_hash, code_challenge,
            server_instance_id, installation_id, device_name, platform,
            client_version, authorization_status, approved_user_id,
            approved_at, denied_at, poll_interval_seconds, expires_at
        ) VALUES (
            'authorization-2', 'device-code-hash-2', 'user-code-hash-2', 'challenge',
            'test-server', 'installation-2', 'Test', 'test', '0.1.0',
            'denied', ?1, datetime('now'), datetime('now'), 5,
            datetime('now', '+10 minutes')
        )
        "#,
    )
    .bind(user_id)
    .execute(&pool)
    .await;
    assert!(
        contradictory_authorization.is_err(),
        "denied authorization cannot retain approval identity"
    );

    insert_device(&pool, "device-1", user_id, "installation-1")
        .await
        .expect("device should insert");
    insert_device(&pool, "device-2", user_id, "installation-2")
        .await
        .expect("device should insert");
    insert_family(&pool, "family-1", "device-1", user_id)
        .await
        .expect("family should insert");

    let family_without_authorization = sqlx::query(
        r#"
        INSERT INTO device_credential_families (
            id, device_id, user_id, server_instance_id,
            refresh_sliding_expires_at, refresh_absolute_expires_at
        ) VALUES (
            'family-without-authorization', 'device-1', ?1, 'test-server',
            datetime('now', '+30 days'), datetime('now', '+90 days')
        )
        "#,
    )
    .bind(user_id)
    .execute(&pool)
    .await;
    assert!(
        family_without_authorization.is_err(),
        "every credential family must trace to one authorization"
    );
    insert_refresh(&pool, "refresh-1", "family-1", "device-1", user_id, 0)
        .await
        .expect("refresh should insert");

    let invalid_rotated_state = sqlx::query(
        "UPDATE device_refresh_credentials SET credential_status = 'rotated' WHERE id = 'refresh-1'",
    )
    .execute(&pool)
    .await;
    assert!(
        invalid_rotated_state.is_err(),
        "rotated refresh must record consumption time"
    );

    let future_refresh =
        insert_refresh(&pool, "refresh-2", "family-1", "device-1", user_id, 1).await;
    assert!(
        future_refresh.is_err(),
        "a family cannot have two active refresh generations"
    );

    let wrong_access_audience = insert_access(
        &pool,
        "access-1",
        "family-1",
        "device-1",
        user_id,
        0,
        DEVICE_ACCESS_ISSUER,
        DEVICE_REFRESH_AUDIENCE,
    )
    .await;
    assert!(
        wrong_access_audience.is_err(),
        "access sessions must use the fixed access audience"
    );

    let cross_device_rotation = insert_rotation(
        &pool,
        "rotation-1",
        "family-1",
        "device-2",
        user_id,
        0,
        "refresh-1-hash",
        TRANSACTION_1,
    )
    .await;
    assert!(
        cross_device_rotation.is_err(),
        "rotation device must belong to the credential family"
    );

    let missing_source_generation = insert_rotation(
        &pool,
        "rotation-2",
        "family-1",
        "device-1",
        user_id,
        1,
        "missing-refresh-hash",
        TRANSACTION_2,
    )
    .await;
    assert!(
        missing_source_generation.is_err(),
        "rotation must reference an existing source generation"
    );

    let wrong_source_hash = insert_rotation(
        &pool,
        "rotation-3",
        "family-1",
        "device-1",
        user_id,
        0,
        "wrong-refresh-hash",
        TRANSACTION_3,
    )
    .await;
    assert!(
        wrong_source_hash.is_err(),
        "rotation must reference the exact source refresh hash"
    );
}

#[test]
fn device_token_contracts_are_namespaced_and_bind_recovery_context() {
    let access = issue_access_token();
    let refresh = issue_refresh_token();

    assert!(access.starts_with(DEVICE_ACCESS_TOKEN_PREFIX));
    assert!(refresh.starts_with(DEVICE_REFRESH_TOKEN_PREFIX));
    assert!(is_device_access_token(&access));
    assert!(is_device_refresh_token(&refresh));
    assert_ne!(hash_device_token(&access), hash_device_token(&refresh));
    assert_eq!(DEVICE_ACCESS_ISSUER, "yuance-device-session");
    assert_eq!(DEVICE_ACCESS_AUDIENCE, "yuance-api");
    assert_eq!(DEVICE_REFRESH_AUDIENCE, "yuance-device-refresh");

    let rotation_aad = refresh_rotation_aad(
        "family-1",
        "device-1",
        "test-server",
        0,
        TRANSACTION_1,
        "refresh-hash",
    );
    let exchange_aad = exchange_result_aad(
        "authorization-1",
        "test-server",
        TRANSACTION_1,
        "device-code-hash",
    );
    assert_ne!(rotation_aad, exchange_aad);
}

#[test]
fn openapi_publishes_registered_device_session_paths_and_security() {
    let document: serde_json::Value =
        serde_json::from_str(include_str!("../../docs/openapi/yuance.openapi.json"))
            .expect("OpenAPI document should parse");

    assert_eq!(
        document["components"]["securitySchemes"]["deviceAccess"]["bearerFormat"],
        "Yuance Device Access Token"
    );
    assert_eq!(
        document["components"]["schemas"]["DeviceAuthorizationStatus"]["enum"],
        serde_json::json!(["pending", "approved", "denied", "expired", "consumed"])
    );
    assert_eq!(
        document["paths"]["/api/v1/device-authorizations"]["post"]["security"],
        serde_json::json!([])
    );
    assert_eq!(
        document["paths"]["/api/v1/device-authorizations/exchange"]["post"]["security"],
        serde_json::json!([])
    );
    for (path, method) in [
        ("/api/v1/device-session", "get"),
        ("/api/v1/device-session/logout", "post"),
    ] {
        assert_eq!(
            document["paths"][path][method]["security"],
            serde_json::json!([{"deviceAccess": []}])
        );
        assert_eq!(
            document["paths"][path][method]["responses"]["401"]["$ref"],
            "#/components/responses/DeviceSessionError"
        );
    }
    let error_codes = document["components"]["schemas"]["DeviceAuthorizationErrorCode"]["enum"]
        .as_array()
        .expect("device error codes should be an array");
    for code in [
        "invalid_device_access",
        "device_access_expired",
        "device_revoked",
        "device_session_revoked",
        "device_session_unavailable",
        "invalid_device_refresh",
        "device_refresh_expired",
        "device_refresh_replay",
        "rotation_recovery_failed",
    ] {
        assert!(error_codes.iter().any(|value| value == code));
    }
    let refresh = &document["paths"]["/api/v1/device-sessions/refresh"]["post"];
    assert_eq!(refresh["security"], serde_json::json!([]));
    assert_eq!(
        refresh["requestBody"]["content"]["application/json"]["schema"]["$ref"],
        "#/components/schemas/DeviceRefreshRotationRequest"
    );
    assert_eq!(
        refresh["responses"]["200"]["content"]["application/json"]["schema"]["$ref"],
        "#/components/schemas/DeviceRefreshRotationEnvelope"
    );
}

#[test]
fn openapi_freezes_d2_device_business_allowlist() {
    let document: serde_json::Value =
        serde_json::from_str(include_str!("../../docs/openapi/yuance.openapi.json"))
            .expect("OpenAPI document should parse");
    let allowlist = document["x-yuance-device-business-allowlist"]
        .as_array()
        .expect("Device business allowlist should be an array");
    let expected = serde_json::json!([
        "GET /api/v1/auth/me",
        "GET /api/v1/projects",
        "GET /api/v1/projects/{project_key}/attachments/{attachment_id}/preview",
        "GET /api/v1/projects/{project_key}/attachments/{attachment_id}/preview/content",
        "HEAD /api/v1/projects/{project_key}/attachments/{attachment_id}/preview/content",
        "GET /api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/preview",
        "GET /api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/preview/content",
        "HEAD /api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/preview/content",
        "GET /api/v1/current-project",
        "PATCH /api/v1/current-project",
        "GET /api/v1/topbar/status",
        "GET /api/v1/topbar/events",
        "GET /api/v1/notifications",
        "GET /api/v1/notifications/{notification_id}/target",
        "POST /api/v1/notifications/{notification_id}/read",
        "POST /api/v1/notifications/read-all",
        "GET /api/v1/work-item-list-view",
        "GET /api/v1/work-item-detail-view/{item_key}",
        "POST /api/v1/work-item-saved-views",
        "PATCH /api/v1/work-item-saved-views/{saved_view_id}",
        "DELETE /api/v1/work-item-saved-views/{saved_view_id}",
        "POST /api/v1/work-item-saved-views/{saved_view_id}/default",
        "GET /api/v1/work-items",
        "POST /api/v1/work-items",
        "POST /api/v1/work-items/batch",
        "GET /api/v1/work-items/{item_key}",
        "PATCH /api/v1/work-items/{item_key}",
        "PATCH /api/v1/work-items/{item_key}/primary-post",
        "POST /api/v1/work-items/{item_key}/restore",
        "POST /api/v1/work-items/{item_key}/handoff",
        "GET /api/v1/work-items/{item_key}/events",
        "GET /api/v1/work-items/{item_key}/comments",
        "POST /api/v1/work-items/{item_key}/comments",
        "POST /api/v1/work-items/{item_key}/comments/draft",
        "PATCH /api/v1/work-items/{item_key}/comments/{comment_id}",
        "POST /api/v1/work-items/{item_key}/comments/{comment_id}/publish",
        "GET /api/v1/work-items/{item_key}/comments/{comment_id}/attachments",
        "POST /api/v1/work-items/{item_key}/comments/{comment_id}/attachments",
        "GET /api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/upload-url",
        "POST /api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/uploaded",
        "GET /api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/download-url",
        "GET /api/v1/work-items/{item_key}/attachments",
        "POST /api/v1/work-items/{item_key}/attachments",
        "GET /api/v1/work-items/{item_key}/attachments/{attachment_id}/upload-url",
        "POST /api/v1/work-items/{item_key}/attachments/{attachment_id}/uploaded",
        "GET /api/v1/work-items/{item_key}/attachments/{attachment_id}/download-url",
        "GET /api/v1/work-items/{item_key}/attachments/{attachment_id}/preview",
        "GET /api/v1/work-items/{item_key}/attachments/{attachment_id}/preview/content",
        "HEAD /api/v1/work-items/{item_key}/attachments/{attachment_id}/preview/content"
    ]);
    assert_eq!(allowlist, expected.as_array().unwrap());
    for forbidden in [
        "GET /api/v1/projects/{project_key}",
        "DELETE /api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}",
    ] {
        assert!(!allowlist.iter().any(|entry| entry == forbidden));
    }
}

#[test]
fn openapi_publishes_project_attachment_preview_metadata_and_range_content() {
    let document: serde_json::Value =
        serde_json::from_str(include_str!("../../docs/openapi/yuance.openapi.json"))
            .expect("OpenAPI document should parse");
    let preview =
        &document["paths"]["/api/v1/projects/{project_key}/attachments/{attachment_id}/preview"];
    assert_eq!(
        preview["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"],
        "#/components/schemas/ProjectAttachmentPreviewEnvelope"
    );

    let content = &document["paths"]["/api/v1/projects/{project_key}/attachments/{attachment_id}/preview/content"];
    assert_eq!(
        content["get"]["parameters"][0]["$ref"],
        "#/components/parameters/Range"
    );
    for method in ["get", "head"] {
        for status in ["200", "206", "416"] {
            assert!(
                content[method]["responses"][status].is_object(),
                "{method} {status}"
            );
        }
        assert_eq!(
            content[method]["responses"]["206"]["$ref"],
            "#/components/responses/PreviewPartialContent"
        );
    }
    let resource_preview = &document["paths"]["/api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/preview"];
    assert_eq!(
        resource_preview["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"],
        "#/components/schemas/ProjectAttachmentPreviewEnvelope"
    );
    assert_eq!(resource_preview["get"]["parameters"][3]["name"], "access");
    let resource_content = &document["paths"]["/api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/preview/content"];
    assert_eq!(resource_content["parameters"][3]["name"], "access");
    for method in ["get", "head"] {
        assert_eq!(
            resource_content[method]["responses"]["206"]["$ref"],
            "#/components/responses/PreviewPartialContent"
        );
    }
    assert_eq!(
        document["components"]["responses"]["PreviewPartialContent"]["headers"]["Accept-Ranges"]["schema"]
            ["const"],
        "bytes"
    );
}

#[test]
fn openapi_publishes_work_item_attachment_preview_metadata_and_range_content() {
    let document: serde_json::Value =
        serde_json::from_str(include_str!("../../docs/openapi/yuance.openapi.json"))
            .expect("OpenAPI document should parse");
    let preview =
        &document["paths"]["/api/v1/work-items/{item_key}/attachments/{attachment_id}/preview"];
    assert_eq!(
        preview["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"],
        "#/components/schemas/ProjectAttachmentPreviewEnvelope"
    );

    let content = &document["paths"]["/api/v1/work-items/{item_key}/attachments/{attachment_id}/preview/content"];
    assert_eq!(
        content["get"]["parameters"][0]["$ref"],
        "#/components/parameters/Range"
    );
    for method in ["get", "head"] {
        for status in ["200", "206", "416"] {
            assert!(
                content[method]["responses"][status].is_object(),
                "{method} {status}"
            );
        }
        assert_eq!(
            content[method]["responses"]["206"]["$ref"],
            "#/components/responses/PreviewPartialContent"
        );
    }
}

async fn test_pool() -> SqlitePool {
    let settings = Settings {
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
    };
    let pool = db::connect_pool(&settings)
        .await
        .expect("pool should connect");
    db::run_migrations(&pool)
        .await
        .expect("migrations should run");
    pool
}

async fn insert_user(pool: &SqlitePool) -> i64 {
    sqlx::query(
        "INSERT INTO users (username, password_hash, display_name) VALUES ('device-user', 'hash', 'Device User')",
    )
    .execute(pool)
    .await
    .expect("user should insert")
    .last_insert_rowid()
}

async fn insert_device(
    pool: &SqlitePool,
    id: &str,
    user_id: i64,
    installation_id: &str,
) -> Result<sqlx::sqlite::SqliteQueryResult, sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO devices (
            id, user_id, server_instance_id, installation_id,
            device_name, platform, client_version
        ) VALUES (?1, ?2, 'test-server', ?3, 'Test Device', 'test', '0.1.0')
        "#,
    )
    .bind(id)
    .bind(user_id)
    .bind(installation_id)
    .execute(pool)
    .await
}

async fn insert_family(
    pool: &SqlitePool,
    id: &str,
    device_id: &str,
    user_id: i64,
) -> Result<sqlx::sqlite::SqliteQueryResult, sqlx::Error> {
    let authorization_id = format!("authorization-{id}");
    sqlx::query(
        r#"
        INSERT INTO device_authorizations (
            id, device_code_hash, user_code_hash, code_challenge,
            server_instance_id, installation_id, device_name, platform,
            client_version, authorization_status, approved_user_id,
            exchange_transaction_id, exchange_result_expires_at,
            poll_interval_seconds, expires_at, approved_at, consumed_at
        ) VALUES (
            ?1, ?1 || '-device-hash', ?1 || '-user-hash', 'challenge',
            'test-server', ?1 || '-installation', 'Test Device', 'test',
            '0.1.0', 'consumed', ?2, ?3, datetime('now', '+1 day'),
            5, datetime('now', '+10 minutes'), datetime('now'), datetime('now')
        )
        "#,
    )
    .bind(&authorization_id)
    .bind(user_id)
    .bind(Uuid::new_v4().to_string())
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        INSERT INTO device_credential_families (
            id, authorization_id, device_id, user_id, server_instance_id,
            refresh_sliding_expires_at, refresh_absolute_expires_at
        ) VALUES (
            ?1, ?2, ?3, ?4, 'test-server',
            datetime('now', '+30 days'), datetime('now', '+90 days')
        )
        "#,
    )
    .bind(id)
    .bind(authorization_id)
    .bind(device_id)
    .bind(user_id)
    .execute(pool)
    .await
}

async fn insert_refresh(
    pool: &SqlitePool,
    id: &str,
    family_id: &str,
    device_id: &str,
    user_id: i64,
    generation: i64,
) -> Result<sqlx::sqlite::SqliteQueryResult, sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO device_refresh_credentials (
            id, refresh_token_hash, family_id, device_id, user_id,
            server_instance_id, generation, issuer, audience, expires_at
        ) VALUES (
            ?1, ?1 || '-hash', ?2, ?3, ?4,
            'test-server', ?5, 'yuance-device-session',
            'yuance-device-refresh', datetime('now', '+30 days')
        )
        "#,
    )
    .bind(id)
    .bind(family_id)
    .bind(device_id)
    .bind(user_id)
    .bind(generation)
    .execute(pool)
    .await
}

#[allow(clippy::too_many_arguments)]
async fn insert_access(
    pool: &SqlitePool,
    id: &str,
    family_id: &str,
    device_id: &str,
    user_id: i64,
    generation: i64,
    issuer: &str,
    audience: &str,
) -> Result<sqlx::sqlite::SqliteQueryResult, sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO device_access_sessions (
            id, access_token_hash, family_id, device_id, user_id,
            server_instance_id, generation, issuer, audience,
            authorization_version, expires_at
        ) VALUES (
            ?1, ?1 || '-hash', ?2, ?3, ?4,
            'test-server', ?5, ?6, ?7, 1, datetime('now', '+15 minutes')
        )
        "#,
    )
    .bind(id)
    .bind(family_id)
    .bind(device_id)
    .bind(user_id)
    .bind(generation)
    .bind(issuer)
    .bind(audience)
    .execute(pool)
    .await
}

async fn insert_rotation(
    pool: &SqlitePool,
    id: &str,
    family_id: &str,
    device_id: &str,
    user_id: i64,
    source_generation: i64,
    source_refresh_token_hash: &str,
    transaction_id: &str,
) -> Result<sqlx::sqlite::SqliteQueryResult, sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO device_refresh_rotations (
            id, family_id, device_id, user_id, server_instance_id,
            source_generation, source_refresh_token_hash, transaction_id,
            result_ciphertext, result_expires_at
        ) VALUES (
            ?1, ?2, ?3, ?4, 'test-server', ?5,
            ?6, ?7, 'ciphertext', datetime('now', '+1 day')
        )
        "#,
    )
    .bind(id)
    .bind(family_id)
    .bind(device_id)
    .bind(user_id)
    .bind(source_generation)
    .bind(source_refresh_token_hash)
    .bind(transaction_id)
    .execute(pool)
    .await
}
