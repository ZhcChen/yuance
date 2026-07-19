use std::{
    collections::HashMap,
    sync::{LazyLock, Mutex},
    time::Duration,
};

use opendal::{Error as OpendalError, ErrorKind, Operator, options, services};
use reqsign_aliyun_oss::{Credential as OssCredential, RequestSigner};
use reqsign_core::{Context as ReqsignContext, SignRequest};
use serde::Serialize;
use sqlx::SqlitePool;

use crate::platform::{
    config::Settings,
    crypto,
    error::{AppError, AppResult},
};

pub const STORAGE_PROVIDER_ALIYUN_OSS: &str = "aliyun_oss";
pub const DEFAULT_ALIYUN_OSS_ENDPOINT: &str = "https://oss-cn-hangzhou.aliyuncs.com";
pub const DEFAULT_ALIYUN_OSS_REGION: &str = "oss-cn-hangzhou";
pub const DEFAULT_ALIYUN_OSS_BUCKET: &str = "yuance-files";
pub const DEFAULT_UPLOAD_URL_TTL_SECONDS: i32 = 900;
pub const DEFAULT_DOWNLOAD_URL_TTL_SECONDS: i32 = 600;
pub const TEST_MEMORY_ENDPOINT: &str = "memory://yuance-tests";
pub const STORAGE_INIT_MARKER_KEY: &str = "yuance-system/.initialized";
const STORAGE_PROBE_PREFIX: &str = "yuance-system/probes";
const OSS_BUCKET_INIT_TIMEOUT_SECONDS: u64 = 15;
const OSS_DIRECT_UPLOAD_CORS_RULE: &str = r#"<CORSRule><AllowedOrigin>*</AllowedOrigin><AllowedMethod>PUT</AllowedMethod><AllowedMethod>GET</AllowedMethod><AllowedMethod>HEAD</AllowedMethod><AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader><ExposeHeader>x-oss-request-id</ExposeHeader><MaxAgeSeconds>3600</MaxAgeSeconds></CORSRule>"#;

static TEST_MEMORY_OPERATORS: LazyLock<Mutex<HashMap<String, Operator>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StorageConfig {
    pub id: i64,
    pub provider: String,
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub access_key_id_hint: String,
    pub status: String,
    pub version: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StorageConfigVersion {
    pub id: i64,
    pub storage_config_id: i64,
    pub version: i64,
    pub provider: String,
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub access_key_id_hint: String,
    pub snapshot_status: String,
    pub current_status: String,
    pub created_by: String,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct SaveStorageConfigInput {
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub access_key_id: String,
    pub access_key_secret: String,
    pub activate: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SignedObjectRequest {
    pub method: String,
    pub url: String,
    pub headers: Vec<(String, String)>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StorageProbeResult {
    pub ok: bool,
    pub provider: String,
    pub bucket: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StorageBucketInspection {
    pub ok: bool,
    pub provider: String,
    pub bucket: String,
    pub initialized: bool,
    pub needs_initialization: bool,
    pub can_write: bool,
    pub can_read: bool,
    pub can_delete: bool,
    pub marker_key: String,
    pub checks: Vec<StorageBucketCheck>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StorageBucketCheck {
    pub code: String,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StorageBucketInitializeResult {
    pub ok: bool,
    pub provider: String,
    pub bucket: String,
    pub marker_key: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct AliyunOssBucketInitialization {
    bucket_message: String,
    cors_message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct AliyunOssServiceError {
    status: u16,
    code: String,
    message: String,
    request_id: String,
}

pub async fn active_config(pool: &SqlitePool) -> AppResult<Option<StorageConfig>> {
    let row = sqlx::query_as::<
        _,
        (
            i64,
            String,
            String,
            String,
            String,
            String,
            String,
            i64,
            String,
        ),
    >(
        r#"
        SELECT
            id,
            provider,
            endpoint,
            region,
            bucket,
            access_key_id_hint,
            status,
            version,
            updated_at
        FROM storage_configs
        WHERE provider = ?1
          AND status = 'active'
        ORDER BY version DESC, id DESC
        LIMIT 1
        "#,
    )
    .bind(STORAGE_PROVIDER_ALIYUN_OSS)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(storage_config_from_row))
}

pub async fn latest_config(pool: &SqlitePool) -> AppResult<Option<StorageConfig>> {
    let row = sqlx::query_as::<
        _,
        (
            i64,
            String,
            String,
            String,
            String,
            String,
            String,
            i64,
            String,
        ),
    >(
        r#"
        SELECT
            id,
            provider,
            endpoint,
            region,
            bucket,
            access_key_id_hint,
            status,
            version,
            updated_at
        FROM storage_configs
        WHERE provider = ?1
        ORDER BY version DESC, id DESC
        LIMIT 1
        "#,
    )
    .bind(STORAGE_PROVIDER_ALIYUN_OSS)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(storage_config_from_row))
}

pub async fn list_config_versions(pool: &SqlitePool) -> AppResult<Vec<StorageConfigVersion>> {
    let rows = sqlx::query_as::<
        _,
        (
            i64,
            i64,
            i64,
            String,
            String,
            String,
            String,
            String,
            String,
            String,
            String,
            String,
        ),
    >(
        r#"
        SELECT
            v.id,
            v.storage_config_id,
            v.version,
            v.provider,
            v.endpoint,
            v.region,
            v.bucket,
            v.access_key_id_hint,
            v.status AS snapshot_status,
            COALESCE(c.status, v.status) AS current_status,
            COALESCE(u.display_name, '') AS created_by,
            v.created_at
        FROM storage_config_versions v
        LEFT JOIN storage_configs c ON c.id = v.storage_config_id
        LEFT JOIN users u ON u.id = v.created_by_user_id
        WHERE v.provider = ?1
        ORDER BY v.version DESC, v.id DESC
        "#,
    )
    .bind(STORAGE_PROVIDER_ALIYUN_OSS)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(storage_config_version_from_row)
        .collect())
}

pub async fn count_config_versions(pool: &SqlitePool) -> AppResult<i64> {
    Ok(sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM storage_config_versions
        WHERE provider = ?1
        "#,
    )
    .bind(STORAGE_PROVIDER_ALIYUN_OSS)
    .fetch_one(pool)
    .await?)
}

pub async fn list_config_versions_page(
    pool: &SqlitePool,
    page: i64,
    per_page: i64,
) -> AppResult<Vec<StorageConfigVersion>> {
    if page < 1 {
        return Err(AppError::BadRequest("页码不能小于 1".to_string()));
    }
    if per_page < 1 {
        return Err(AppError::BadRequest("每页数量不能小于 1".to_string()));
    }
    let offset = (page - 1).saturating_mul(per_page);
    let rows = sqlx::query_as::<
        _,
        (
            i64,
            i64,
            i64,
            String,
            String,
            String,
            String,
            String,
            String,
            String,
            String,
            String,
        ),
    >(
        r#"
        SELECT
            v.id,
            v.storage_config_id,
            v.version,
            v.provider,
            v.endpoint,
            v.region,
            v.bucket,
            v.access_key_id_hint,
            v.status AS snapshot_status,
            COALESCE(c.status, v.status) AS current_status,
            COALESCE(u.display_name, '') AS created_by,
            v.created_at
        FROM storage_config_versions v
        LEFT JOIN storage_configs c ON c.id = v.storage_config_id
        LEFT JOIN users u ON u.id = v.created_by_user_id
        WHERE v.provider = ?1
        ORDER BY v.version DESC, v.id DESC
        LIMIT ?2 OFFSET ?3
        "#,
    )
    .bind(STORAGE_PROVIDER_ALIYUN_OSS)
    .bind(per_page)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(storage_config_version_from_row)
        .collect())
}

pub async fn save_config(
    pool: &SqlitePool,
    settings: &Settings,
    actor_user_id: i64,
    input: SaveStorageConfigInput,
) -> AppResult<StorageConfig> {
    let endpoint = default_if_blank(&input.endpoint, DEFAULT_ALIYUN_OSS_ENDPOINT);
    let endpoint = validate_required_urlish("Endpoint", &endpoint)?;
    if endpoint == TEST_MEMORY_ENDPOINT && settings.env != "test" {
        return Err(AppError::InvalidEnvironment(
            "memory 测试对象存储只允许在 test 环境使用".to_string(),
        ));
    }
    let region = default_if_blank(&input.region, DEFAULT_ALIYUN_OSS_REGION);
    let bucket = default_if_blank(&input.bucket, DEFAULT_ALIYUN_OSS_BUCKET);
    let bucket = validate_bucket(&bucket)?;
    let access_key_id = validate_required("AccessKey ID", &input.access_key_id)?;
    let access_key_secret = validate_required("AccessKey Secret", &input.access_key_secret)?;
    let access_key_id_hint = access_key_id_hint(&access_key_id);
    let aad = storage_secret_aad(STORAGE_PROVIDER_ALIYUN_OSS, &bucket, &access_key_id_hint);
    let access_key_id_ciphertext = crypto::encrypt_secret(
        &settings.security_master_key,
        &access_key_id,
        aad.as_bytes(),
    )?;
    let access_key_secret_ciphertext = crypto::encrypt_secret(
        &settings.security_master_key,
        &access_key_secret,
        aad.as_bytes(),
    )?;
    let status = if input.activate { "active" } else { "draft" };

    let mut tx = pool.begin().await?;
    if input.activate {
        sqlx::query(
            r#"
            UPDATE storage_configs
            SET status = 'disabled',
                updated_at = datetime('now')
            WHERE provider = ?1
              AND status = 'active'
            "#,
        )
        .bind(STORAGE_PROVIDER_ALIYUN_OSS)
        .execute(&mut *tx)
        .await?;
    }

    let version = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COALESCE(MAX(version), 0) + 1
        FROM storage_configs
        WHERE provider = ?1
        "#,
    )
    .bind(STORAGE_PROVIDER_ALIYUN_OSS)
    .fetch_one(&mut *tx)
    .await?;

    let id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO storage_configs (
            provider,
            endpoint,
            region,
            bucket,
            access_key_id_hint,
            access_key_id_ciphertext,
            access_key_secret_ciphertext,
            status,
            version,
            created_by_user_id,
            updated_by_user_id
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
        RETURNING id
        "#,
    )
    .bind(STORAGE_PROVIDER_ALIYUN_OSS)
    .bind(&endpoint)
    .bind(&region)
    .bind(&bucket)
    .bind(&access_key_id_hint)
    .bind(&access_key_id_ciphertext)
    .bind(&access_key_secret_ciphertext)
    .bind(status)
    .bind(version)
    .bind(actor_user_id)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO storage_config_versions (
            storage_config_id,
            version,
            provider,
            endpoint,
            region,
            bucket,
            access_key_id_hint,
            access_key_id_ciphertext,
            access_key_secret_ciphertext,
            status,
            created_by_user_id
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        "#,
    )
    .bind(id)
    .bind(version)
    .bind(STORAGE_PROVIDER_ALIYUN_OSS)
    .bind(&endpoint)
    .bind(&region)
    .bind(&bucket)
    .bind(&access_key_id_hint)
    .bind(&access_key_id_ciphertext)
    .bind(&access_key_secret_ciphertext)
    .bind(status)
    .bind(actor_user_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    latest_config(pool)
        .await?
        .ok_or_else(|| AppError::Database(sqlx::Error::RowNotFound))
}

pub async fn rollback_config(
    pool: &SqlitePool,
    settings: &Settings,
    actor_user_id: i64,
    source_version: i64,
) -> AppResult<StorageConfig> {
    if source_version <= 0 {
        return Err(AppError::BadRequest("配置版本号无效".to_string()));
    }

    let Some((
        provider,
        endpoint,
        region,
        bucket,
        access_key_id_hint,
        access_key_id_ciphertext,
        access_key_secret_ciphertext,
    )) = sqlx::query_as::<_, (String, String, String, String, String, String, String)>(
        r#"
        SELECT
            provider,
            endpoint,
            region,
            bucket,
            access_key_id_hint,
            access_key_id_ciphertext,
            access_key_secret_ciphertext
        FROM storage_config_versions
        WHERE provider = ?1
          AND version = ?2
        ORDER BY id DESC
        LIMIT 1
        "#,
    )
    .bind(STORAGE_PROVIDER_ALIYUN_OSS)
    .bind(source_version)
    .fetch_optional(pool)
    .await?
    else {
        return Err(AppError::NotFound(format!(
            "对象存储配置版本 v{source_version} 不存在"
        )));
    };

    let aad = storage_secret_aad(&provider, &bucket, &access_key_id_hint);
    crypto::decrypt_secret(
        &settings.security_master_key,
        &access_key_id_ciphertext,
        aad.as_bytes(),
    )?;
    crypto::decrypt_secret(
        &settings.security_master_key,
        &access_key_secret_ciphertext,
        aad.as_bytes(),
    )?;

    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        UPDATE storage_configs
        SET status = 'disabled',
            updated_by_user_id = ?1,
            updated_at = datetime('now')
        WHERE provider = ?2
          AND status = 'active'
        "#,
    )
    .bind(actor_user_id)
    .bind(STORAGE_PROVIDER_ALIYUN_OSS)
    .execute(&mut *tx)
    .await?;

    let version = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COALESCE(MAX(version), 0) + 1
        FROM storage_configs
        WHERE provider = ?1
        "#,
    )
    .bind(STORAGE_PROVIDER_ALIYUN_OSS)
    .fetch_one(&mut *tx)
    .await?;

    let id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO storage_configs (
            provider,
            endpoint,
            region,
            bucket,
            access_key_id_hint,
            access_key_id_ciphertext,
            access_key_secret_ciphertext,
            status,
            version,
            created_by_user_id,
            updated_by_user_id
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active', ?8, ?9, ?9)
        RETURNING id
        "#,
    )
    .bind(&provider)
    .bind(&endpoint)
    .bind(&region)
    .bind(&bucket)
    .bind(&access_key_id_hint)
    .bind(&access_key_id_ciphertext)
    .bind(&access_key_secret_ciphertext)
    .bind(version)
    .bind(actor_user_id)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO storage_config_versions (
            storage_config_id,
            version,
            provider,
            endpoint,
            region,
            bucket,
            access_key_id_hint,
            access_key_id_ciphertext,
            access_key_secret_ciphertext,
            status,
            created_by_user_id
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'active', ?10)
        "#,
    )
    .bind(id)
    .bind(version)
    .bind(&provider)
    .bind(&endpoint)
    .bind(&region)
    .bind(&bucket)
    .bind(&access_key_id_hint)
    .bind(&access_key_id_ciphertext)
    .bind(&access_key_secret_ciphertext)
    .bind(actor_user_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    latest_config(pool)
        .await?
        .ok_or_else(|| AppError::Database(sqlx::Error::RowNotFound))
}

pub async fn build_operator_from_active_config(
    pool: &SqlitePool,
    settings: &Settings,
) -> AppResult<Option<Operator>> {
    let Some((config, access_key_id, access_key_secret)) =
        load_active_config_with_secret(pool, settings).await?
    else {
        return Ok(None);
    };

    if is_test_memory_config(settings, &config) {
        return build_test_memory_operator(&config).map(Some);
    }

    Ok(Some(build_oss_operator(
        &config,
        &access_key_id,
        &access_key_secret,
    )?))
}

pub async fn probe_active_config(
    pool: &SqlitePool,
    settings: &Settings,
) -> AppResult<StorageProbeResult> {
    let config = active_config(pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
    let operator = build_operator_from_active_config(pool, settings)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
    let probe_key = format!("yuance-probes/{}.txt", uuid::Uuid::new_v4());

    operator
        .write(&probe_key, b"yuance storage probe".to_vec())
        .await
        .map_err(|_| AppError::BadRequest("对象存储探测失败：无法写入探测文件".to_string()))?;
    operator.stat(&probe_key).await.map_err(|_| {
        AppError::BadRequest("对象存储探测失败：无法读取探测文件元数据".to_string())
    })?;
    operator
        .delete(&probe_key)
        .await
        .map_err(|_| AppError::BadRequest("对象存储探测失败：无法清理探测文件".to_string()))?;

    Ok(StorageProbeResult {
        ok: true,
        provider: config.provider,
        bucket: config.bucket,
        message: "对象存储探测通过".to_string(),
    })
}

pub async fn inspect_active_config(
    pool: &SqlitePool,
    settings: &Settings,
) -> AppResult<StorageBucketInspection> {
    let config = active_config(pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
    let operator = build_operator_from_active_config(pool, settings)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
    Ok(inspect_bucket_with_operator(config, operator).await)
}

pub async fn inspect_active_initialization(
    pool: &SqlitePool,
    settings: &Settings,
) -> AppResult<StorageBucketInspection> {
    let config = active_config(pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
    let operator = build_operator_from_active_config(pool, settings)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
    Ok(inspect_initialization_marker_with_operator(config, operator).await)
}

pub async fn initialize_active_config(
    pool: &SqlitePool,
    settings: &Settings,
) -> AppResult<StorageBucketInitializeResult> {
    let Some((config, access_key_id, access_key_secret)) =
        load_active_config_with_secret(pool, settings).await?
    else {
        return Err(AppError::BadRequest("对象存储未激活".to_string()));
    };

    let bucket_initialization = if is_test_memory_config(settings, &config) {
        None
    } else {
        Some(
            ensure_aliyun_oss_bucket_initialized(&config, &access_key_id, &access_key_secret)
                .await?,
        )
    };
    let operator = if is_test_memory_config(settings, &config) {
        build_test_memory_operator(&config)?
    } else {
        build_oss_operator(&config, &access_key_id, &access_key_secret)?
    };
    let inspection = inspect_bucket_with_operator(config.clone(), operator.clone()).await;
    if !(inspection.can_write && inspection.can_read && inspection.can_delete) {
        let detail = inspection
            .checks
            .iter()
            .find(|check| check.status == "fail" || check.status == "warn")
            .map(|check| check.message.clone())
            .unwrap_or(inspection.message);
        return Err(AppError::BadRequest(format!(
            "对象存储桶初始化失败：初始化前检测未通过。{detail}"
        )));
    }

    let marker_body = format!(
        "yuance storage initialized\nprovider={}\nbucket={}\n",
        config.provider, config.bucket
    );
    operator
        .write(STORAGE_INIT_MARKER_KEY, marker_body.into_bytes())
        .await
        .map_err(|error| {
            AppError::BadRequest(format!(
                "对象存储桶初始化失败：{}",
                storage_operation_error_message(&config, "写入初始化标记", &error)
            ))
        })?;
    operator
        .stat(STORAGE_INIT_MARKER_KEY)
        .await
        .map_err(|error| {
            AppError::BadRequest(format!(
                "对象存储桶初始化失败：{}",
                storage_operation_error_message(&config, "读取初始化标记", &error)
            ))
        })?;

    Ok(StorageBucketInitializeResult {
        ok: true,
        provider: config.provider,
        bucket: config.bucket,
        marker_key: STORAGE_INIT_MARKER_KEY.to_string(),
        message: bucket_initialization
            .map(|init| {
                format!(
                    "对象存储桶初始化完成：{}{}",
                    init.bucket_message, init.cors_message
                )
            })
            .unwrap_or_else(|| "对象存储桶初始化完成".to_string()),
    })
}

pub async fn verify_uploaded_object(
    pool: &SqlitePool,
    settings: &Settings,
    object_key: &str,
    expected_byte_size: i64,
    expected_content_type: &str,
) -> AppResult<()> {
    if expected_byte_size < 0 {
        return Err(AppError::BadRequest("文件大小不能小于 0".to_string()));
    }
    let object_key = normalize_object_key(object_key)?;
    let expected_content_type = validate_content_type(expected_content_type)?;
    let operator = build_operator_from_active_config(pool, settings)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
    let metadata = operator.stat(&object_key).await.map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            AppError::BadRequest("对象存储中未找到已上传文件".to_string())
        } else {
            AppError::BadRequest(format!("校验对象存储文件失败：{error}"))
        }
    })?;
    let actual_byte_size = i64::try_from(metadata.content_length())
        .map_err(|_| AppError::BadRequest("对象存储文件大小超出系统支持范围".to_string()))?;
    if actual_byte_size != expected_byte_size {
        return Err(AppError::BadRequest(format!(
            "对象存储文件大小不一致：期望 {expected_byte_size} 字节，实际 {actual_byte_size} 字节"
        )));
    }
    if let Some(actual_content_type) = metadata.content_type()
        && !actual_content_type.eq_ignore_ascii_case(&expected_content_type)
    {
        return Err(AppError::BadRequest(format!(
            "对象存储 Content-Type 不一致：期望 {expected_content_type}，实际 {actual_content_type}"
        )));
    }

    Ok(())
}

pub async fn delete_object_if_exists(
    pool: &SqlitePool,
    settings: &Settings,
    object_key: &str,
) -> AppResult<()> {
    let object_key = normalize_object_key(object_key)?;
    let config = active_config(pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
    let operator = build_operator_from_active_config(pool, settings)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;

    match operator.delete(&object_key).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(AppError::BadRequest(format!(
            "删除对象存储文件失败：{}",
            storage_operation_error_message(&config, "删除对象存储文件", &error)
        ))),
    }
}

pub async fn write_test_memory_object(
    pool: &SqlitePool,
    settings: &Settings,
    object_key: &str,
    content_type: &str,
    content: Vec<u8>,
) -> AppResult<()> {
    let config = active_config(pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
    if !is_test_memory_config(settings, &config) {
        return Err(AppError::NotFound("测试对象存储入口不存在".to_string()));
    }
    let object_key = normalize_object_key(object_key)?;
    let content_type = validate_content_type(content_type)?;
    let operator = build_test_memory_operator(&config)?;
    operator
        .write_with(&object_key, content)
        .content_type(&content_type)
        .await
        .map_err(|error| AppError::BadRequest(format!("测试对象存储写入失败：{error}")))?;
    Ok(())
}

pub async fn read_test_memory_object(
    pool: &SqlitePool,
    settings: &Settings,
    object_key: &str,
) -> AppResult<Option<(String, Vec<u8>)>> {
    let Some(config) = active_config(pool).await? else {
        return Ok(None);
    };
    if !is_test_memory_config(settings, &config) {
        return Ok(None);
    }

    let object_key = normalize_object_key(object_key)?;
    let operator = build_test_memory_operator(&config)?;
    let metadata = match operator.stat(&object_key).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(AppError::BadRequest(format!(
                "读取测试对象存储元数据失败：{error}"
            )));
        }
    };
    let content = operator
        .read(&object_key)
        .await
        .map_err(|error| AppError::BadRequest(format!("读取测试对象存储文件失败：{error}")))?;
    let content_type = metadata
        .content_type()
        .unwrap_or("application/octet-stream")
        .to_string();

    Ok(Some((content_type, content.to_vec())))
}

pub async fn read_object(
    pool: &SqlitePool,
    settings: &Settings,
    object_key: &str,
) -> AppResult<(String, Vec<u8>)> {
    if let Some(result) = read_test_memory_object(pool, settings, object_key).await? {
        return Ok(result);
    }

    let object_key = normalize_object_key(object_key)?;
    let operator = build_operator_from_active_config(pool, settings)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
    let metadata = operator
        .stat(&object_key)
        .await
        .map_err(|error| AppError::BadRequest(format!("读取对象存储元数据失败：{error}")))?;
    let content = operator
        .read(&object_key)
        .await
        .map_err(|error| AppError::BadRequest(format!("读取对象存储文件失败：{error}")))?;
    let content_type = metadata
        .content_type()
        .unwrap_or("application/octet-stream")
        .to_string();

    Ok((content_type, content.to_vec()))
}

pub async fn presign_upload_url(
    pool: &SqlitePool,
    settings: &Settings,
    object_key: &str,
    content_type: &str,
    expire_seconds: u64,
) -> AppResult<SignedObjectRequest> {
    if let Some(config) = active_config(pool).await?
        && is_test_memory_config(settings, &config)
    {
        let object_key = normalize_object_key(object_key)?;
        let content_type = validate_content_type(content_type)?;
        let query = serde_urlencoded::to_string([("object_key", object_key.as_str())])
            .map_err(|error| AppError::BadRequest(format!("生成测试上传地址失败：{error}")))?;
        return Ok(SignedObjectRequest {
            method: "PUT".to_string(),
            url: format!("/api/v1/test-storage/upload?{query}"),
            headers: vec![("content-type".to_string(), content_type)],
        });
    }

    let operator = build_operator_from_active_config(pool, settings)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
    let request = operator
        .presign_write_options(
            &normalize_object_key(object_key)?,
            Duration::from_secs(expire_seconds),
            options::WriteOptions {
                content_type: Some(validate_content_type(content_type)?),
                ..Default::default()
            },
        )
        .await
        .map_err(|error| AppError::BadRequest(format!("生成上传签名失败：{error}")))?;
    Ok(signed_request_from_opendal(request))
}

pub async fn presign_download_url(
    pool: &SqlitePool,
    settings: &Settings,
    object_key: &str,
    expire_seconds: u64,
) -> AppResult<SignedObjectRequest> {
    let operator = build_operator_from_active_config(pool, settings)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活".to_string()))?;
    let request = operator
        .presign_read(
            &normalize_object_key(object_key)?,
            Duration::from_secs(expire_seconds),
        )
        .await
        .map_err(|error| AppError::BadRequest(format!("生成下载签名失败：{error}")))?;
    Ok(signed_request_from_opendal(request))
}

pub fn access_key_id_hint(access_key_id: &str) -> String {
    let value = access_key_id.trim();
    if value.len() <= 8 {
        return "****".to_string();
    }
    format!("{}****{}", &value[..4], &value[value.len() - 4..])
}

pub fn storage_secret_aad(provider: &str, bucket: &str, access_key_id_hint: &str) -> String {
    format!("{provider}:{bucket}:{access_key_id_hint}")
}

async fn load_active_config_with_secret(
    pool: &SqlitePool,
    settings: &Settings,
) -> AppResult<Option<(StorageConfig, String, String)>> {
    let row = sqlx::query_as::<
        _,
        (
            i64,
            String,
            String,
            String,
            String,
            String,
            String,
            i64,
            String,
            String,
            String,
        ),
    >(
        r#"
        SELECT
            id,
            provider,
            endpoint,
            region,
            bucket,
            access_key_id_hint,
            status,
            version,
            updated_at,
            access_key_id_ciphertext,
            access_key_secret_ciphertext
        FROM storage_configs
        WHERE provider = ?1
          AND status = 'active'
        ORDER BY version DESC, id DESC
        LIMIT 1
        "#,
    )
    .bind(STORAGE_PROVIDER_ALIYUN_OSS)
    .fetch_optional(pool)
    .await?;

    let Some((
        id,
        provider,
        endpoint,
        region,
        bucket,
        access_key_id_hint,
        status,
        version,
        updated_at,
        access_key_id_ciphertext,
        ciphertext,
    )) = row
    else {
        return Ok(None);
    };

    let aad = storage_secret_aad(&provider, &bucket, &access_key_id_hint);
    let access_key_id = crypto::decrypt_secret(
        &settings.security_master_key,
        &access_key_id_ciphertext,
        aad.as_bytes(),
    )?;
    let access_key_secret =
        crypto::decrypt_secret(&settings.security_master_key, &ciphertext, aad.as_bytes())?;
    Ok(Some((
        StorageConfig {
            id,
            provider,
            endpoint,
            region,
            bucket,
            access_key_id_hint,
            status,
            version,
            updated_at,
        },
        access_key_id,
        access_key_secret,
    )))
}

fn build_oss_operator(
    config: &StorageConfig,
    access_key_id: &str,
    access_key_secret: &str,
) -> AppResult<Operator> {
    let builder = services::Oss::default()
        .root("/")
        .bucket(&config.bucket)
        .endpoint(&config.endpoint)
        .access_key_id(access_key_id)
        .access_key_secret(access_key_secret);

    Operator::new(builder)
        .map(|builder| builder.finish())
        .map_err(|error| AppError::BadRequest(format!("OSS 配置无效：{error}")))
}

fn build_test_memory_operator(config: &StorageConfig) -> AppResult<Operator> {
    let cache_key = format!("{}:{}", config.endpoint, config.bucket);
    let mut operators = TEST_MEMORY_OPERATORS
        .lock()
        .map_err(|_| AppError::Config("测试对象存储状态已损坏".to_string()))?;
    if let Some(operator) = operators.get(&cache_key) {
        return Ok(operator.clone());
    }

    let builder = services::Memory::default().root("/");
    let operator = Operator::new(builder)
        .map(|builder| builder.finish())
        .map_err(|error| AppError::BadRequest(format!("测试对象存储配置无效：{error}")))?;
    operators.insert(cache_key, operator.clone());
    Ok(operator)
}

async fn ensure_aliyun_oss_bucket_initialized(
    config: &StorageConfig,
    access_key_id: &str,
    access_key_secret: &str,
) -> AppResult<AliyunOssBucketInitialization> {
    if config.provider != STORAGE_PROVIDER_ALIYUN_OSS {
        return Err(oss_bucket_init_error(
            "当前仅支持阿里云 OSS Bucket 初始化。",
        ));
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(OSS_BUCKET_INIT_TIMEOUT_SECONDS))
        .build()
        .map_err(|error| {
            oss_bucket_init_error(format!("创建阿里云 OSS 管理客户端失败：{error}"))
        })?;

    let bucket_exists =
        aliyun_oss_bucket_exists(&client, config, access_key_id, access_key_secret).await?;
    let bucket_message = if bucket_exists {
        "Bucket 已存在，已复用当前桶。".to_string()
    } else {
        create_aliyun_oss_bucket(&client, config, access_key_id, access_key_secret).await?
    };
    let cors_message =
        ensure_aliyun_oss_direct_upload_cors(&client, config, access_key_id, access_key_secret)
            .await?;

    Ok(AliyunOssBucketInitialization {
        bucket_message,
        cors_message,
    })
}

async fn aliyun_oss_bucket_exists(
    client: &reqwest::Client,
    config: &StorageConfig,
    access_key_id: &str,
    access_key_secret: &str,
) -> AppResult<bool> {
    let response = signed_aliyun_oss_bucket_request(
        client,
        config,
        access_key_id,
        access_key_secret,
        AliyunOssBucketRequest {
            method: "HEAD",
            query: None,
            headers: vec![],
            body: None,
        },
    )
    .await?;
    if response.status().is_success() {
        return Ok(true);
    }

    let error = aliyun_oss_service_error_from_response(response).await;
    if error.status == 404 || error.code == "NoSuchBucket" {
        return Ok(false);
    }
    Err(oss_bucket_init_error(format!(
        "检查 Bucket 是否存在失败：{}",
        format_aliyun_oss_service_error(&error)
    )))
}

async fn create_aliyun_oss_bucket(
    client: &reqwest::Client,
    config: &StorageConfig,
    access_key_id: &str,
    access_key_secret: &str,
) -> AppResult<String> {
    let body = r#"<?xml version="1.0" encoding="UTF-8"?><CreateBucketConfiguration><StorageClass>Standard</StorageClass></CreateBucketConfiguration>"#;
    let response = signed_aliyun_oss_bucket_request(
        client,
        config,
        access_key_id,
        access_key_secret,
        AliyunOssBucketRequest {
            method: "PUT",
            query: None,
            headers: vec![
                ("content-type", "application/xml".to_string()),
                ("x-oss-acl", "private".to_string()),
                ("x-oss-storage-class", "Standard".to_string()),
            ],
            body: Some(body.to_string()),
        },
    )
    .await?;
    if response.status().is_success() {
        return Ok("Bucket 已创建，默认使用私有权限。".to_string());
    }

    let error = aliyun_oss_service_error_from_response(response).await;
    if error.code == "BucketAlreadyOwnedByYou" {
        return Ok("Bucket 已存在，已复用当前桶。".to_string());
    }
    if error.code == "BucketAlreadyExists" {
        return Err(oss_bucket_init_error(
            "Bucket 名称已被其他账号占用，不能作为当前项目桶复用，请更换项目专用 Bucket 名称。",
        ));
    }
    Err(oss_bucket_init_error(format!(
        "创建 Bucket 失败：{}",
        format_aliyun_oss_service_error(&error)
    )))
}

async fn ensure_aliyun_oss_direct_upload_cors(
    client: &reqwest::Client,
    config: &StorageConfig,
    access_key_id: &str,
    access_key_secret: &str,
) -> AppResult<String> {
    let response = signed_aliyun_oss_bucket_request(
        client,
        config,
        access_key_id,
        access_key_secret,
        AliyunOssBucketRequest {
            method: "GET",
            query: Some("cors"),
            headers: vec![],
            body: None,
        },
    )
    .await?;

    let cors_xml = if response.status().is_success() {
        response
            .text()
            .await
            .map_err(|error| oss_bucket_init_error(format!("读取 Bucket CORS 响应失败：{error}")))?
    } else {
        let error = aliyun_oss_service_error_from_response(response).await;
        if !(error.status == 404
            || error.code == "NoSuchCORS"
            || error.code == "NoSuchCORSConfiguration")
        {
            return Err(oss_bucket_init_error(format!(
                "读取 Bucket CORS 配置失败：{}",
                format_aliyun_oss_service_error(&error)
            )));
        }
        String::new()
    };

    if cors_allows_direct_upload(&cors_xml) {
        return Ok("浏览器直传 CORS 已存在。".to_string());
    }

    let next_cors_xml = append_direct_upload_cors_rule(&cors_xml);
    let response = signed_aliyun_oss_bucket_request(
        client,
        config,
        access_key_id,
        access_key_secret,
        AliyunOssBucketRequest {
            method: "PUT",
            query: Some("cors"),
            headers: vec![("content-type", "application/xml".to_string())],
            body: Some(next_cors_xml),
        },
    )
    .await?;
    if response.status().is_success() {
        return Ok("浏览器直传 CORS 已配置。".to_string());
    }

    let error = aliyun_oss_service_error_from_response(response).await;
    Err(oss_bucket_init_error(format!(
        "写入 Bucket CORS 配置失败：{}",
        format_aliyun_oss_service_error(&error)
    )))
}

struct AliyunOssBucketRequest<'a> {
    method: &'a str,
    query: Option<&'a str>,
    headers: Vec<(&'a str, String)>,
    body: Option<String>,
}

async fn signed_aliyun_oss_bucket_request(
    client: &reqwest::Client,
    config: &StorageConfig,
    access_key_id: &str,
    access_key_secret: &str,
    bucket_request: AliyunOssBucketRequest<'_>,
) -> AppResult<reqwest::Response> {
    let url = aliyun_oss_bucket_url(config, bucket_request.query)?;
    let mut builder = http::Request::builder()
        .method(bucket_request.method)
        .uri(&url);
    for (name, value) in &bucket_request.headers {
        builder = builder.header(*name, value);
    }
    let (mut parts, _) = builder
        .body(())
        .map_err(|error| oss_bucket_init_error(format!("构造阿里云 OSS 管理请求失败：{error}")))?
        .into_parts();

    let credential = OssCredential {
        access_key_id: access_key_id.to_string(),
        access_key_secret: access_key_secret.to_string(),
        security_token: None,
        expires_in: None,
    };
    RequestSigner::new(&config.bucket)
        .sign_request(&ReqsignContext::new(), &mut parts, Some(&credential), None)
        .await
        .map_err(|error| oss_bucket_init_error(format!("签名阿里云 OSS 管理请求失败：{error}")))?;

    let reqwest_method = reqwest::Method::from_bytes(bucket_request.method.as_bytes())
        .map_err(|error| oss_bucket_init_error(format!("OSS 管理请求方法无效：{error}")))?;
    let mut request = client.request(reqwest_method, url);
    for (name, value) in &parts.headers {
        let value = value
            .to_str()
            .map_err(|error| oss_bucket_init_error(format!("OSS 管理请求 Header 无效：{error}")))?;
        request = request.header(name.as_str(), value);
    }
    if let Some(body) = bucket_request.body {
        request = request.body(body);
    }
    request
        .send()
        .await
        .map_err(|error| oss_bucket_init_error(format!("请求阿里云 OSS 失败：{error}")))
}

fn aliyun_oss_bucket_url(config: &StorageConfig, query: Option<&str>) -> AppResult<String> {
    let endpoint = config.endpoint.trim().trim_end_matches('/');
    let url = reqwest::Url::parse(endpoint)
        .map_err(|error| oss_bucket_init_error(format!("Endpoint 不是有效 URL：{error}")))?;
    if url.path() != "/" && !url.path().is_empty() {
        return Err(oss_bucket_init_error(
            "Endpoint 不应包含路径，请填写类似 https://oss-cn-hangzhou.aliyuncs.com 的地域 Endpoint。",
        ));
    }
    let host = url
        .host_str()
        .ok_or_else(|| oss_bucket_init_error("Endpoint 缺少 Host。"))?;
    let bucket_host_prefix = format!("{}.", config.bucket);
    let host = if host.starts_with(&bucket_host_prefix) {
        host.to_string()
    } else {
        format!("{}.{}", config.bucket, host)
    };
    let port = url
        .port()
        .map(|port| format!(":{port}"))
        .unwrap_or_default();
    let query = query.map(|value| format!("?{value}")).unwrap_or_default();
    Ok(format!("{}://{}{}/{}", url.scheme(), host, port, query))
}

async fn aliyun_oss_service_error_from_response(
    response: reqwest::Response,
) -> AliyunOssServiceError {
    let status = response.status().as_u16();
    let request_id = response
        .headers()
        .get("x-oss-request-id")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_string();
    let body = response.text().await.unwrap_or_default();
    AliyunOssServiceError {
        status,
        code: xml_tag_first_value(&body, "Code").unwrap_or_default(),
        message: xml_tag_first_value(&body, "Message").unwrap_or_default(),
        request_id,
    }
}

fn format_aliyun_oss_service_error(error: &AliyunOssServiceError) -> String {
    let mut parts = Vec::new();
    if !error.code.is_empty() {
        parts.push(format!("错误码 {}", error.code));
    }
    if !error.message.is_empty() {
        parts.push(error.message.clone());
    }
    if !error.request_id.is_empty() {
        parts.push(format!("RequestId {}", error.request_id));
    }
    if parts.is_empty() {
        format!("HTTP {}", error.status)
    } else {
        parts.join("，")
    }
}

fn append_direct_upload_cors_rule(cors_xml: &str) -> String {
    if cors_allows_direct_upload(cors_xml) {
        return cors_xml.trim().to_string();
    }
    let cors_xml = cors_xml.trim();
    if cors_xml.is_empty() {
        return format!("<CORSConfiguration>{OSS_DIRECT_UPLOAD_CORS_RULE}</CORSConfiguration>");
    }
    if let Some(position) = cors_xml.rfind("</CORSConfiguration>") {
        let mut next = String::with_capacity(cors_xml.len() + OSS_DIRECT_UPLOAD_CORS_RULE.len());
        next.push_str(&cors_xml[..position]);
        next.push_str(OSS_DIRECT_UPLOAD_CORS_RULE);
        next.push_str(&cors_xml[position..]);
        next
    } else {
        format!("<CORSConfiguration>{OSS_DIRECT_UPLOAD_CORS_RULE}</CORSConfiguration>")
    }
}

fn cors_allows_direct_upload(cors_xml: &str) -> bool {
    cors_xml
        .split("<CORSRule>")
        .filter_map(|part| part.split("</CORSRule>").next())
        .any(|rule| {
            let methods = xml_tag_values(rule, "AllowedMethod");
            let origins = xml_tag_values(rule, "AllowedOrigin");
            let headers = xml_tag_values(rule, "AllowedHeader");
            contains_xml_value(&methods, "PUT")
                && contains_xml_value(&methods, "GET")
                && contains_xml_value(&origins, "*")
                && contains_xml_value(&headers, "*")
        })
}

fn contains_xml_value(values: &[String], expected: &str) -> bool {
    values
        .iter()
        .any(|value| value.trim().eq_ignore_ascii_case(expected))
}

fn xml_tag_values(xml: &str, tag: &str) -> Vec<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let mut rest = xml;
    let mut values = Vec::new();
    while let Some(open_position) = rest.find(&open) {
        let value_start = open_position + open.len();
        let after_open = &rest[value_start..];
        let Some(close_position) = after_open.find(&close) else {
            break;
        };
        values.push(after_open[..close_position].trim().to_string());
        rest = &after_open[(close_position + close.len())..];
    }
    values
}

fn xml_tag_first_value(xml: &str, tag: &str) -> Option<String> {
    xml_tag_values(xml, tag).into_iter().next()
}

fn oss_bucket_init_error(message: impl Into<String>) -> AppError {
    AppError::BadRequest(format!("对象存储桶初始化失败：{}", message.into()))
}

async fn inspect_initialization_marker_with_operator(
    config: StorageConfig,
    operator: Operator,
) -> StorageBucketInspection {
    let mut checks = Vec::new();
    let initialized = match operator.stat(STORAGE_INIT_MARKER_KEY).await {
        Ok(_) => {
            checks.push(StorageBucketCheck {
                code: "init_marker".to_string(),
                status: "pass".to_string(),
                message: format!("已找到初始化标记：{STORAGE_INIT_MARKER_KEY}。"),
            });
            true
        }
        Err(error) if is_missing_bucket_error(&error) => {
            checks.push(StorageBucketCheck {
                code: "bucket_access".to_string(),
                status: "fail".to_string(),
                message: storage_operation_error_message(&config, "读取初始化标记", &error),
            });
            return StorageBucketInspection {
                ok: false,
                provider: config.provider,
                bucket: config.bucket,
                initialized: false,
                needs_initialization: false,
                can_write: false,
                can_read: false,
                can_delete: false,
                marker_key: STORAGE_INIT_MARKER_KEY.to_string(),
                checks,
                message: "对象存储桶不存在或配置不匹配".to_string(),
            };
        }
        Err(error) if error.kind() == ErrorKind::NotFound => {
            checks.push(StorageBucketCheck {
                code: "init_marker".to_string(),
                status: "warn".to_string(),
                message: format!(
                    "未找到初始化标记：{STORAGE_INIT_MARKER_KEY}，建议执行一次初始化。"
                ),
            });
            false
        }
        Err(error) => {
            checks.push(StorageBucketCheck {
                code: "init_marker".to_string(),
                status: "fail".to_string(),
                message: storage_operation_error_message(&config, "读取初始化标记", &error),
            });
            false
        }
    };
    let message = if initialized {
        "对象存储桶运行就绪".to_string()
    } else {
        "对象存储桶需要初始化".to_string()
    };

    StorageBucketInspection {
        ok: initialized,
        provider: config.provider,
        bucket: config.bucket,
        initialized,
        needs_initialization: !initialized,
        can_write: false,
        can_read: initialized,
        can_delete: false,
        marker_key: STORAGE_INIT_MARKER_KEY.to_string(),
        checks,
        message,
    }
}

async fn inspect_bucket_with_operator(
    config: StorageConfig,
    operator: Operator,
) -> StorageBucketInspection {
    let mut checks = Vec::new();
    let mut can_read = false;
    let mut can_delete = false;
    let probe_key = format!("{STORAGE_PROBE_PREFIX}/{}.txt", uuid::Uuid::new_v4());
    let probe_body = b"yuance storage bucket inspection".to_vec();

    match operator.write(&probe_key, probe_body).await {
        Ok(_) => {
            checks.push(StorageBucketCheck {
                code: "write_probe".to_string(),
                status: "pass".to_string(),
                message: "已成功写入临时探测对象。".to_string(),
            });
        }
        Err(error) => {
            checks.push(StorageBucketCheck {
                code: "write_probe".to_string(),
                status: "fail".to_string(),
                message: storage_operation_error_message(&config, "写入临时探测对象", &error),
            });
            return bucket_inspection_result(config, checks, false, false, false, false);
        }
    }
    let can_write = true;

    match operator.stat(&probe_key).await {
        Ok(_) => {
            can_read = true;
            checks.push(StorageBucketCheck {
                code: "read_probe".to_string(),
                status: "pass".to_string(),
                message: "已成功读取临时探测对象元数据。".to_string(),
            });
        }
        Err(error) => {
            checks.push(StorageBucketCheck {
                code: "read_probe".to_string(),
                status: "fail".to_string(),
                message: storage_operation_error_message(&config, "读取临时探测对象", &error),
            });
        }
    }

    match operator.delete(&probe_key).await {
        Ok(()) => {
            can_delete = true;
            checks.push(StorageBucketCheck {
                code: "delete_probe".to_string(),
                status: "pass".to_string(),
                message: "已成功清理临时探测对象。".to_string(),
            });
        }
        Err(error) => {
            checks.push(StorageBucketCheck {
                code: "delete_probe".to_string(),
                status: "warn".to_string(),
                message: storage_operation_error_message(&config, "清理临时探测对象", &error),
            });
        }
    }

    let initialized = match operator.stat(STORAGE_INIT_MARKER_KEY).await {
        Ok(_) => {
            checks.push(StorageBucketCheck {
                code: "init_marker".to_string(),
                status: "pass".to_string(),
                message: format!("已找到初始化标记：{STORAGE_INIT_MARKER_KEY}。"),
            });
            true
        }
        Err(error) if error.kind() == ErrorKind::NotFound => {
            checks.push(StorageBucketCheck {
                code: "init_marker".to_string(),
                status: "warn".to_string(),
                message: format!(
                    "未找到初始化标记：{STORAGE_INIT_MARKER_KEY}，建议执行一次初始化。"
                ),
            });
            false
        }
        Err(error) => {
            checks.push(StorageBucketCheck {
                code: "init_marker".to_string(),
                status: "warn".to_string(),
                message: storage_operation_error_message(&config, "读取初始化标记", &error),
            });
            false
        }
    };

    bucket_inspection_result(config, checks, initialized, can_write, can_read, can_delete)
}

fn bucket_inspection_result(
    config: StorageConfig,
    checks: Vec<StorageBucketCheck>,
    initialized: bool,
    can_write: bool,
    can_read: bool,
    can_delete: bool,
) -> StorageBucketInspection {
    let needs_initialization = can_write && can_read && can_delete && !initialized;
    let ok = can_write && can_read && can_delete && initialized;
    let message = if ok {
        "对象存储桶运行就绪".to_string()
    } else if needs_initialization {
        "对象存储桶可读写，但需要初始化".to_string()
    } else {
        "对象存储桶检测未通过".to_string()
    };

    StorageBucketInspection {
        ok,
        provider: config.provider,
        bucket: config.bucket,
        initialized,
        needs_initialization,
        can_write,
        can_read,
        can_delete,
        marker_key: STORAGE_INIT_MARKER_KEY.to_string(),
        checks,
        message,
    }
}

fn storage_operation_error_message(
    config: &StorageConfig,
    operation: &str,
    error: &OpendalError,
) -> String {
    let error_text = error.to_string();
    if is_missing_bucket_error(error) {
        return format!(
            "{operation}失败：Bucket `{}` 不存在，或 Endpoint/Region 与 Bucket 不匹配；请先在阿里云 OSS 控制台创建 Bucket，并确认 Bucket、Endpoint、AccessKey 属于同一个账号和地域。当前 Endpoint：{}。",
            config.bucket, config.endpoint
        );
    }
    if error_text.contains("InvalidAccessKeyId") {
        return format!(
            "{operation}失败：AccessKey ID 无效或不属于当前 OSS 账号；请检查对象存储配置。"
        );
    }
    if error_text.contains("SignatureDoesNotMatch") {
        return format!("{operation}失败：AccessKey Secret 错误或签名配置不匹配；请重新保存配置。");
    }
    if error.kind() == ErrorKind::PermissionDenied || error_text.contains("AccessDenied") {
        return format!(
            "{operation}失败：AccessKey 权限不足；请授予当前 Bucket 的对象写入、读取和删除权限。"
        );
    }
    if error.kind() == ErrorKind::NotFound {
        return format!(
            "{operation}失败：目标对象不存在；如正在检测初始化状态，请先执行桶状态检测确认 Bucket 可访问。"
        );
    }
    if error.kind() == ErrorKind::ConfigInvalid {
        return format!(
            "{operation}失败：OSS 配置无效；请检查 Endpoint、Bucket 和 AccessKey 配置。"
        );
    }

    format!(
        "{operation}失败：对象存储服务暂时无法完成请求；请检查 Endpoint、Bucket、Region 和 AccessKey 权限。"
    )
}

fn is_missing_bucket_error(error: &OpendalError) -> bool {
    let error_text = error.to_string();
    error_text.contains("NoSuchBucket")
        || error_text.contains("The specified bucket does not exist")
}

fn is_test_memory_config(settings: &Settings, config: &StorageConfig) -> bool {
    settings.env == "test" && config.endpoint == TEST_MEMORY_ENDPOINT
}

fn signed_request_from_opendal(request: opendal::raw::PresignedRequest) -> SignedObjectRequest {
    let headers = request
        .header()
        .iter()
        .filter_map(|(key, value)| {
            value
                .to_str()
                .ok()
                .map(|value| (key.as_str().to_string(), value.to_string()))
        })
        .collect();

    SignedObjectRequest {
        method: request.method().to_string(),
        url: request.uri().to_string(),
        headers,
    }
}

fn storage_config_from_row(
    row: (
        i64,
        String,
        String,
        String,
        String,
        String,
        String,
        i64,
        String,
    ),
) -> StorageConfig {
    let (id, provider, endpoint, region, bucket, access_key_id_hint, status, version, updated_at) =
        row;
    StorageConfig {
        id,
        provider,
        endpoint,
        region,
        bucket,
        access_key_id_hint,
        status,
        version,
        updated_at,
    }
}

fn storage_config_version_from_row(
    row: (
        i64,
        i64,
        i64,
        String,
        String,
        String,
        String,
        String,
        String,
        String,
        String,
        String,
    ),
) -> StorageConfigVersion {
    let (
        id,
        storage_config_id,
        version,
        provider,
        endpoint,
        region,
        bucket,
        access_key_id_hint,
        snapshot_status,
        current_status,
        created_by,
        created_at,
    ) = row;
    StorageConfigVersion {
        id,
        storage_config_id,
        version,
        provider,
        endpoint,
        region,
        bucket,
        access_key_id_hint,
        snapshot_status,
        current_status,
        created_by,
        created_at,
    }
}

fn validate_required(label: &str, value: &str) -> AppResult<String> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::BadRequest(format!("{label} 不能为空")));
    }
    Ok(value.to_string())
}

fn default_if_blank(value: &str, fallback: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        fallback.to_string()
    } else {
        value.to_string()
    }
}

fn validate_required_urlish(label: &str, value: &str) -> AppResult<String> {
    let value = validate_required(label, value)?;
    if value == TEST_MEMORY_ENDPOINT {
        return Ok(value);
    }
    if !(value.starts_with("http://") || value.starts_with("https://")) {
        return Err(AppError::BadRequest(format!(
            "{label} 必须以 http:// 或 https:// 开头"
        )));
    }
    Ok(value)
}

fn validate_bucket(bucket: &str) -> AppResult<String> {
    let bucket = validate_required("Bucket", bucket)?;
    if bucket.len() > 128
        || !bucket
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err(AppError::BadRequest(
            "Bucket 只能包含小写字母、数字和中划线，且不能超过 128 个字符".to_string(),
        ));
    }
    Ok(bucket)
}

fn normalize_object_key(object_key: &str) -> AppResult<String> {
    let object_key = object_key.trim().trim_start_matches('/');
    if object_key.is_empty() || object_key.contains("..") {
        return Err(AppError::BadRequest("object key 无效".to_string()));
    }
    Ok(object_key.to_string())
}

fn validate_content_type(content_type: &str) -> AppResult<String> {
    let content_type = validate_required("Content-Type", content_type)?;
    if content_type.len() > 128 || content_type.contains('\n') || content_type.contains('\r') {
        return Err(AppError::BadRequest("Content-Type 无效".to_string()));
    }
    Ok(content_type)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> StorageConfig {
        StorageConfig {
            id: 1,
            provider: STORAGE_PROVIDER_ALIYUN_OSS.to_string(),
            endpoint: "https://oss-cn-hangzhou.aliyuncs.com".to_string(),
            region: "cn-hangzhou".to_string(),
            bucket: "yuance-files".to_string(),
            access_key_id_hint: "LTAI****P2Xa".to_string(),
            status: "active".to_string(),
            version: 1,
            updated_at: "2026-06-30 00:00:00".to_string(),
        }
    }

    #[test]
    fn storage_operation_error_message_handles_missing_bucket_without_leaking_raw_error() {
        let raw_error = OpendalError::new(
            ErrorKind::NotFound,
            r#"OssError { code: "NoSuchBucket", message: "The specified bucket does not exist.", request_id: "6A438791A711D13738671BC4", host_id: "yuance-files.oss-cn-hangzhou.aliyuncs.com" }"#,
        )
        .with_operation("write")
        .with_context("uri", "https://yuance-files.oss-cn-hangzhou.aliyuncs.com/yuance-system/.initialized");

        let message = storage_operation_error_message(&test_config(), "写入初始化标记", &raw_error);

        assert!(message.contains("Bucket `yuance-files` 不存在"));
        assert!(message.contains("当前 Endpoint：https://oss-cn-hangzhou.aliyuncs.com"));
        assert!(!message.contains("request_id"));
        assert!(!message.contains("host_id"));
        assert!(!message.contains("6A438791A711D13738671BC4"));
    }

    #[test]
    fn aliyun_oss_bucket_url_builds_virtual_host_bucket_url() {
        let url = aliyun_oss_bucket_url(&test_config(), Some("cors")).expect("url should build");

        assert_eq!(
            url,
            "https://yuance-files.oss-cn-hangzhou.aliyuncs.com/?cors"
        );
    }

    #[test]
    fn aliyun_oss_bucket_url_does_not_duplicate_bucket_host() {
        let mut config = test_config();
        config.endpoint = "https://yuance-files.oss-cn-hangzhou.aliyuncs.com".to_string();

        let url = aliyun_oss_bucket_url(&config, None).expect("url should build");

        assert_eq!(url, "https://yuance-files.oss-cn-hangzhou.aliyuncs.com/");
    }

    #[test]
    fn append_direct_upload_cors_rule_creates_config_when_empty() {
        let cors = append_direct_upload_cors_rule("");

        assert!(cors.contains("<CORSConfiguration>"));
        assert!(cors_allows_direct_upload(&cors));
    }

    #[test]
    fn append_direct_upload_cors_rule_preserves_existing_rules() {
        let existing = r#"<CORSConfiguration><CORSRule><AllowedOrigin>https://example.test</AllowedOrigin><AllowedMethod>GET</AllowedMethod><AllowedHeader>Authorization</AllowedHeader></CORSRule></CORSConfiguration>"#;

        let cors = append_direct_upload_cors_rule(existing);

        assert!(cors.contains("https://example.test"));
        assert!(cors_allows_direct_upload(&cors));
        assert_eq!(cors.matches("<CORSRule>").count(), 2);
    }

    #[test]
    fn append_direct_upload_cors_rule_is_idempotent() {
        let cors = append_direct_upload_cors_rule("");
        let next = append_direct_upload_cors_rule(&cors);

        assert_eq!(next.matches("<CORSRule>").count(), 1);
    }
}
