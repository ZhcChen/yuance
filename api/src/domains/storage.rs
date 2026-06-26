use std::time::Duration;

use opendal::{Operator, options, services};
use serde::Serialize;
use sqlx::SqlitePool;

use crate::platform::{
    config::Settings,
    crypto,
    error::{AppError, AppResult},
};

pub const STORAGE_PROVIDER_ALIYUN_OSS: &str = "aliyun_oss";

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

pub async fn save_config(
    pool: &SqlitePool,
    settings: &Settings,
    actor_user_id: i64,
    input: SaveStorageConfigInput,
) -> AppResult<StorageConfig> {
    let endpoint = validate_required_urlish("Endpoint", &input.endpoint)?;
    let region = input.region.trim().to_string();
    let bucket = validate_bucket(&input.bucket)?;
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

pub async fn build_operator_from_active_config(
    pool: &SqlitePool,
    settings: &Settings,
) -> AppResult<Option<Operator>> {
    let Some((config, access_key_id, access_key_secret)) =
        load_active_config_with_secret(pool, settings).await?
    else {
        return Ok(None);
    };

    Ok(Some(build_oss_operator(
        &config,
        &access_key_id,
        &access_key_secret,
    )?))
}

pub async fn presign_upload_url(
    pool: &SqlitePool,
    settings: &Settings,
    object_key: &str,
    content_type: &str,
    expire_seconds: u64,
) -> AppResult<SignedObjectRequest> {
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

fn validate_required(label: &str, value: &str) -> AppResult<String> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::BadRequest(format!("{label} 不能为空")));
    }
    Ok(value.to_string())
}

fn validate_required_urlish(label: &str, value: &str) -> AppResult<String> {
    let value = validate_required(label, value)?;
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
