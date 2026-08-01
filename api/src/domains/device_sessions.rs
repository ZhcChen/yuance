use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Duration, Utc};
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{Row, Sqlite, SqliteConnection, SqlitePool, Transaction};
use thiserror::Error;
use uuid::Uuid;

use crate::platform::{
    crypto,
    error::{AppError, AppResult},
};

pub const DEVICE_ACCESS_TOKEN_PREFIX: &str = "yuance_dat_";
pub const DEVICE_REFRESH_TOKEN_PREFIX: &str = "yuance_drt_";
pub const DEVICE_ACCESS_ISSUER: &str = "yuance-device-session";
pub const DEVICE_ACCESS_AUDIENCE: &str = "yuance-api";
pub const DEVICE_REFRESH_AUDIENCE: &str = "yuance-device-refresh";

const TOKEN_ENTROPY_BYTES: usize = 32;
const DEVICE_CODE_PREFIX: &str = "yuance_dc_";
const USER_CODE_ALPHABET: &[u8] = b"23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const USER_CODE_SYMBOLS: usize = 10;
const MAX_ACTIVE_AUTHORIZATIONS: i64 = 500;
const EXPIRED_AUTHORIZATION_RETENTION_SECONDS: i64 = 60 * 60;

pub type DeviceSessionResult<T> = Result<T, DeviceSessionError>;

#[derive(Debug, Error)]
pub enum DeviceSessionError {
    #[error("设备授权请求无效：{0}")]
    InvalidRequest(String),
    #[error("device code 无效")]
    InvalidDeviceCode,
    #[error("user code 无效")]
    InvalidUserCode,
    #[error("PKCE code verifier 无效")]
    InvalidCodeVerifier,
    #[error("设备授权仍待用户处理")]
    AuthorizationPending { retry_after_seconds: i64 },
    #[error("轮询过快")]
    SlowDown { retry_after_seconds: i64 },
    #[error("用户已拒绝设备授权")]
    AuthorizationDenied,
    #[error("设备授权已过期")]
    AuthorizationExpired,
    #[error("设备授权已被消费")]
    AuthorizationConsumed,
    #[error("批准设备授权的用户不可用")]
    UserInactive,
    #[error("exchange transaction 与已消费授权不匹配")]
    ExchangeTransactionMismatch,
    #[error("幂等恢复结果已过期")]
    IdempotencyExpired,
    #[error("设备授权状态不一致：{0}")]
    InvalidState(String),
    #[error("设备会话存储失败")]
    StorageFailure(#[source] sqlx::Error),
    #[error("设备凭证密文处理失败")]
    CryptoFailure,
}

impl DeviceSessionError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidRequest(_) => "invalid_request",
            Self::InvalidDeviceCode => "invalid_device_code",
            Self::InvalidUserCode => "invalid_user_code",
            Self::InvalidCodeVerifier => "invalid_code_verifier",
            Self::AuthorizationPending { .. } => "authorization_pending",
            Self::SlowDown { .. } => "slow_down",
            Self::AuthorizationDenied => "authorization_denied",
            Self::AuthorizationExpired => "authorization_expired",
            Self::AuthorizationConsumed => "authorization_consumed",
            Self::UserInactive => "user_inactive",
            Self::ExchangeTransactionMismatch => "exchange_transaction_mismatch",
            Self::IdempotencyExpired => "idempotency_expired",
            Self::InvalidState(_) => "invalid_state",
            Self::StorageFailure(_) => "storage_failure",
            Self::CryptoFailure => "crypto_failure",
        }
    }

    pub fn retry_after_seconds(&self) -> Option<i64> {
        match self {
            Self::AuthorizationPending {
                retry_after_seconds,
            }
            | Self::SlowDown {
                retry_after_seconds,
            } => Some(*retry_after_seconds),
            _ => None,
        }
    }
}

impl From<sqlx::Error> for DeviceSessionError {
    fn from(value: sqlx::Error) -> Self {
        Self::StorageFailure(value)
    }
}

#[derive(Clone, Debug)]
pub struct DeviceSessionPolicy {
    pub server_instance_id: String,
    pub authorization_ttl_seconds: i64,
    pub access_ttl_seconds: i64,
    pub refresh_sliding_ttl_seconds: i64,
    pub refresh_absolute_ttl_seconds: i64,
    pub idempotency_ttl_seconds: i64,
    pub poll_interval_seconds: i64,
}

#[derive(Clone, Debug)]
pub struct StartAuthorizationInput {
    pub code_challenge: String,
    pub installation_id: String,
    pub device_name: String,
    pub platform: String,
    pub client_version: String,
}

#[derive(Clone, Debug)]
pub struct StartedAuthorization {
    pub authorization_id: String,
    pub device_code: String,
    pub user_code: String,
    pub expires_at: DateTime<Utc>,
    pub interval_seconds: i64,
    pub server_instance_id: String,
}

#[derive(Clone, Debug)]
pub struct AuthorizationReview {
    pub authorization_id: String,
    pub device_name: String,
    pub platform: String,
    pub client_version: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AuthorizationStatus {
    Pending,
    Approved,
    Denied,
    Expired,
    Consumed,
}

#[derive(Clone, Debug)]
pub struct AuthorizationPoll {
    pub status: AuthorizationStatus,
    pub interval_seconds: i64,
}

#[derive(Clone, Debug)]
pub struct ExchangeAuthorizationInput {
    pub device_code: String,
    pub code_verifier: String,
    pub exchange_transaction_id: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct InitialDeviceCredentials {
    pub access_token: String,
    pub refresh_token: String,
    pub device_id: String,
    pub family_id: String,
    pub user_id: i64,
    pub generation: i64,
    pub authorization_version: i64,
    pub access_expires_at: DateTime<Utc>,
    pub refresh_expires_at: DateTime<Utc>,
    pub refresh_absolute_expires_at: DateTime<Utc>,
    pub server_instance_id: String,
}

pub async fn start_authorization(
    pool: &SqlitePool,
    master_key: &str,
    policy: &DeviceSessionPolicy,
    input: StartAuthorizationInput,
    now: DateTime<Utc>,
) -> DeviceSessionResult<StartedAuthorization> {
    validate_policy(policy)?;
    validate_code_challenge(&input.code_challenge)?;
    validate_metadata("installation_id", &input.installation_id, 1, 128)?;
    validate_metadata("device_name", &input.device_name, 1, 128)?;
    validate_metadata("platform", &input.platform, 1, 64)?;
    validate_metadata("client_version", &input.client_version, 1, 64)?;

    let mut transaction = begin_immediate(pool).await?;
    let result =
        start_authorization_in_transaction(&mut transaction, master_key, policy, input, now).await;
    finish_transaction(transaction, transaction_should_commit(&result)).await?;
    result
}

async fn start_authorization_in_transaction(
    connection: &mut SqliteConnection,
    master_key: &str,
    policy: &DeviceSessionPolicy,
    input: StartAuthorizationInput,
    now: DateTime<Utc>,
) -> DeviceSessionResult<StartedAuthorization> {
    prepare_authorization_capacity(connection, &policy.server_instance_id, now).await?;

    let expires_at = now + Duration::seconds(policy.authorization_ttl_seconds);
    for _ in 0..5 {
        let authorization_id = Uuid::new_v4().to_string();
        let device_code = issue_token(DEVICE_CODE_PREFIX);
        let user_code = issue_user_code();
        let result = sqlx::query(
            r#"
            INSERT INTO device_authorizations (
                id, device_code_hash, user_code_hash, code_challenge,
                server_instance_id, installation_id, device_name, platform,
                client_version, poll_interval_seconds, next_poll_at,
                expires_at, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?11, ?11)
            "#,
        )
        .bind(&authorization_id)
        .bind(hash_device_token(&device_code))
        .bind(hash_user_code(master_key, &user_code)?)
        .bind(&input.code_challenge)
        .bind(&policy.server_instance_id)
        .bind(input.installation_id.trim())
        .bind(input.device_name.trim())
        .bind(input.platform.trim())
        .bind(input.client_version.trim())
        .bind(policy.poll_interval_seconds)
        .bind(timestamp(now))
        .bind(timestamp(expires_at))
        .execute(&mut *connection)
        .await;

        match result {
            Ok(_) => {
                return Ok(StartedAuthorization {
                    authorization_id,
                    device_code,
                    user_code,
                    expires_at,
                    interval_seconds: policy.poll_interval_seconds,
                    server_instance_id: policy.server_instance_id.clone(),
                });
            }
            Err(error) if is_unique_violation(&error) => continue,
            Err(error) => return Err(error.into()),
        }
    }
    Err(DeviceSessionError::InvalidState(
        "生成唯一授权 code 失败".to_string(),
    ))
}

pub async fn authorization_for_review(
    pool: &SqlitePool,
    master_key: &str,
    server_instance_id: &str,
    user_code: &str,
    now: DateTime<Utc>,
) -> DeviceSessionResult<AuthorizationReview> {
    let user_code_hash = hash_user_code(master_key, user_code)?;
    expire_authorization_by_user_code(pool, &user_code_hash, server_instance_id, now).await?;
    let row = sqlx::query(
        r#"
        SELECT id, device_name, platform, client_version, authorization_status,
               created_at, expires_at
        FROM device_authorizations
        WHERE user_code_hash = ?1 AND server_instance_id = ?2
        "#,
    )
    .bind(user_code_hash)
    .bind(server_instance_id)
    .fetch_optional(pool)
    .await?
    .ok_or(DeviceSessionError::InvalidUserCode)?;

    match row.get::<String, _>("authorization_status").as_str() {
        "pending" => Ok(AuthorizationReview {
            authorization_id: row.get("id"),
            device_name: row.get("device_name"),
            platform: row.get("platform"),
            client_version: row.get("client_version"),
            created_at: parse_timestamp(row.get("created_at"))?,
            expires_at: parse_timestamp(row.get("expires_at"))?,
        }),
        "approved" | "consumed" => Err(DeviceSessionError::AuthorizationConsumed),
        "denied" => Err(DeviceSessionError::AuthorizationDenied),
        "expired" => Err(DeviceSessionError::AuthorizationExpired),
        state => Err(invalid_state(state)),
    }
}

pub async fn approve_authorization(
    pool: &SqlitePool,
    authorization_id: &str,
    user_id: i64,
    now: DateTime<Utc>,
) -> DeviceSessionResult<()> {
    decide_authorization(pool, authorization_id, Some(user_id), now).await
}

pub async fn deny_authorization(
    pool: &SqlitePool,
    authorization_id: &str,
    now: DateTime<Utc>,
) -> DeviceSessionResult<()> {
    decide_authorization(pool, authorization_id, None, now).await
}

pub async fn poll_authorization(
    pool: &SqlitePool,
    device_code: &str,
    server_instance_id: &str,
    now: DateTime<Utc>,
) -> DeviceSessionResult<AuthorizationPoll> {
    let device_code_hash = checked_device_code_hash(device_code)?;
    let mut transaction = begin_immediate(pool).await?;
    let result =
        poll_in_transaction(&mut transaction, &device_code_hash, server_instance_id, now).await;
    finish_transaction(transaction, transaction_should_commit(&result)).await?;
    result
}

pub async fn exchange_authorization(
    pool: &SqlitePool,
    master_key: &str,
    policy: &DeviceSessionPolicy,
    input: ExchangeAuthorizationInput,
    now: DateTime<Utc>,
) -> DeviceSessionResult<InitialDeviceCredentials> {
    validate_policy(policy)?;
    validate_code_verifier(&input.code_verifier)?;
    let transaction_id = normalize_transaction_id_domain(&input.exchange_transaction_id)?;
    let device_code_hash = checked_device_code_hash(&input.device_code)?;

    let exists = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM device_authorizations WHERE device_code_hash = ?1 AND server_instance_id = ?2",
    )
    .bind(&device_code_hash)
    .bind(&policy.server_instance_id)
    .fetch_one(pool)
    .await?;
    if exists == 0 {
        return Err(DeviceSessionError::InvalidDeviceCode);
    }

    let mut transaction = begin_immediate(pool).await?;
    let result = exchange_in_transaction(
        &mut transaction,
        master_key,
        policy,
        &device_code_hash,
        &input.code_verifier,
        &transaction_id,
        now,
    )
    .await;
    finish_transaction(transaction, transaction_should_commit(&result)).await?;
    result
}

pub async fn erase_expired_exchange_results(
    pool: &SqlitePool,
    now: DateTime<Utc>,
) -> DeviceSessionResult<u64> {
    Ok(sqlx::query(
        r#"
        UPDATE device_authorizations
        SET exchange_result_ciphertext = '', updated_at = ?1
        WHERE authorization_status = 'consumed'
          AND exchange_result_ciphertext <> ''
          AND exchange_result_expires_at <= ?1
        "#,
    )
    .bind(timestamp(now))
    .execute(pool)
    .await?
    .rows_affected())
}

async fn prepare_authorization_capacity(
    connection: &mut SqliteConnection,
    server_instance_id: &str,
    now: DateTime<Utc>,
) -> DeviceSessionResult<()> {
    let now = timestamp(now);
    sqlx::query(
        r#"
        UPDATE device_authorizations
        SET authorization_status = 'expired', updated_at = ?1
        WHERE server_instance_id = ?2
          AND authorization_status IN ('pending', 'approved')
          AND expires_at <= ?1
        "#,
    )
    .bind(&now)
    .bind(server_instance_id)
    .execute(&mut *connection)
    .await?;

    let retention_cutoff = timestamp(
        parse_timestamp(&now)? - Duration::seconds(EXPIRED_AUTHORIZATION_RETENTION_SECONDS),
    );
    sqlx::query(
        r#"
        DELETE FROM device_authorizations
        WHERE server_instance_id = ?1
          AND authorization_status = 'expired'
          AND updated_at <= ?2
          AND NOT EXISTS (
              SELECT 1 FROM device_credential_families family
              WHERE family.authorization_id = device_authorizations.id
          )
        "#,
    )
    .bind(server_instance_id)
    .bind(retention_cutoff)
    .execute(&mut *connection)
    .await?;

    let active = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*) FROM device_authorizations
        WHERE server_instance_id = ?1
          AND authorization_status IN ('pending', 'approved')
        "#,
    )
    .bind(server_instance_id)
    .fetch_one(connection)
    .await?;
    if active >= MAX_ACTIVE_AUTHORIZATIONS {
        return Err(DeviceSessionError::SlowDown {
            retry_after_seconds: 60,
        });
    }
    Ok(())
}

#[derive(Debug)]
struct ExchangeRow {
    id: String,
    code_challenge: String,
    installation_id: String,
    device_name: String,
    platform: String,
    client_version: String,
    status: String,
    approved_user_id: Option<i64>,
    transaction_id: Option<String>,
    ciphertext: String,
    result_expires_at: Option<String>,
    expires_at: String,
    next_poll_at: String,
    poll_interval_seconds: i64,
}

async fn exchange_in_transaction(
    connection: &mut SqliteConnection,
    master_key: &str,
    policy: &DeviceSessionPolicy,
    device_code_hash: &str,
    code_verifier: &str,
    transaction_id: &str,
    now: DateTime<Utc>,
) -> DeviceSessionResult<InitialDeviceCredentials> {
    let row = fetch_exchange_row(connection, device_code_hash, &policy.server_instance_id)
        .await?
        .ok_or(DeviceSessionError::InvalidDeviceCode)?;
    if !pkce_matches(code_verifier, &row.code_challenge) {
        return Err(DeviceSessionError::InvalidCodeVerifier);
    }

    if row.status == "consumed" {
        if row.transaction_id.as_deref() != Some(transaction_id) {
            return Err(DeviceSessionError::ExchangeTransactionMismatch);
        }
        let result_expires_at = row
            .result_expires_at
            .as_deref()
            .ok_or_else(|| invalid_state("consumed_without_result_expiry"))?;
        if row.ciphertext.is_empty() || parse_timestamp(result_expires_at)? <= now {
            return Err(DeviceSessionError::IdempotencyExpired);
        }
        return decrypt_exchange_result(
            master_key,
            &row.ciphertext,
            &row.id,
            &policy.server_instance_id,
            transaction_id,
            device_code_hash,
        );
    }

    if parse_timestamp(&row.expires_at)? <= now {
        sqlx::query(
            "UPDATE device_authorizations SET authorization_status = 'expired', updated_at = ?1 WHERE id = ?2 AND authorization_status IN ('pending', 'approved')",
        )
        .bind(timestamp(now))
        .bind(&row.id)
        .execute(&mut *connection)
        .await?;
        return Err(DeviceSessionError::AuthorizationExpired);
    }
    match row.status.as_str() {
        "denied" => return Err(DeviceSessionError::AuthorizationDenied),
        "expired" => return Err(DeviceSessionError::AuthorizationExpired),
        "pending" | "approved" => {}
        state => return Err(invalid_state(state)),
    }
    enforce_poll_gate(connection, &row, now).await?;
    if row.status == "pending" {
        return Err(DeviceSessionError::AuthorizationPending {
            retry_after_seconds: row.poll_interval_seconds,
        });
    }

    let user_id = row
        .approved_user_id
        .ok_or_else(|| invalid_state("approved_without_user"))?;
    ensure_active_user(connection, user_id).await?;
    let device_id = upsert_device(connection, policy, &row, user_id, now).await?;
    let family_id = Uuid::new_v4().to_string();
    let access_token = issue_access_token();
    let refresh_token = issue_refresh_token();
    let access_expires_at = now + Duration::seconds(policy.access_ttl_seconds);
    let refresh_expires_at = now + Duration::seconds(policy.refresh_sliding_ttl_seconds);
    let refresh_absolute_expires_at = now + Duration::seconds(policy.refresh_absolute_ttl_seconds);
    let result_expires_at = now + Duration::seconds(policy.idempotency_ttl_seconds);

    sqlx::query(
        r#"
        INSERT INTO device_credential_families (
            id, authorization_id, device_id, user_id, server_instance_id,
            refresh_sliding_expires_at, refresh_absolute_expires_at,
            created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
        "#,
    )
    .bind(&family_id)
    .bind(&row.id)
    .bind(&device_id)
    .bind(user_id)
    .bind(&policy.server_instance_id)
    .bind(timestamp(refresh_expires_at))
    .bind(timestamp(refresh_absolute_expires_at))
    .bind(timestamp(now))
    .execute(&mut *connection)
    .await?;

    let authorization_version =
        sqlx::query_scalar::<_, i64>("SELECT authorization_version FROM devices WHERE id = ?1")
            .bind(&device_id)
            .fetch_one(&mut *connection)
            .await?;
    sqlx::query(
        r#"
        INSERT INTO device_access_sessions (
            id, access_token_hash, family_id, device_id, user_id,
            server_instance_id, generation, issuer, audience,
            authorization_version, expires_at, last_seen_at, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8, ?9, ?10, ?11, ?11, ?11)
        "#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(hash_device_token(&access_token))
    .bind(&family_id)
    .bind(&device_id)
    .bind(user_id)
    .bind(&policy.server_instance_id)
    .bind(DEVICE_ACCESS_ISSUER)
    .bind(DEVICE_ACCESS_AUDIENCE)
    .bind(authorization_version)
    .bind(timestamp(access_expires_at))
    .bind(timestamp(now))
    .execute(&mut *connection)
    .await?;
    sqlx::query(
        r#"
        INSERT INTO device_refresh_credentials (
            id, refresh_token_hash, family_id, device_id, user_id,
            server_instance_id, generation, issuer, audience, expires_at,
            created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8, ?9, ?10, ?10)
        "#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(hash_device_token(&refresh_token))
    .bind(&family_id)
    .bind(&device_id)
    .bind(user_id)
    .bind(&policy.server_instance_id)
    .bind(DEVICE_ACCESS_ISSUER)
    .bind(DEVICE_REFRESH_AUDIENCE)
    .bind(timestamp(refresh_expires_at))
    .bind(timestamp(now))
    .execute(&mut *connection)
    .await?;

    let credentials = InitialDeviceCredentials {
        access_token,
        refresh_token,
        device_id,
        family_id,
        user_id,
        generation: 0,
        authorization_version,
        access_expires_at,
        refresh_expires_at,
        refresh_absolute_expires_at,
        server_instance_id: policy.server_instance_id.clone(),
    };
    let plaintext =
        serde_json::to_string(&credentials).map_err(|_| DeviceSessionError::CryptoFailure)?;
    let aad = exchange_result_aad(
        &row.id,
        &policy.server_instance_id,
        transaction_id,
        device_code_hash,
    );
    let ciphertext = crypto::encrypt_secret(master_key, &plaintext, &aad)
        .map_err(|_| DeviceSessionError::CryptoFailure)?;
    let updated = sqlx::query(
        r#"
        UPDATE device_authorizations
        SET authorization_status = 'consumed', exchange_transaction_id = ?1,
            exchange_result_ciphertext = ?2, exchange_result_expires_at = ?3,
            consumed_at = ?4, updated_at = ?4
        WHERE id = ?5 AND authorization_status = 'approved'
        "#,
    )
    .bind(transaction_id)
    .bind(ciphertext)
    .bind(timestamp(result_expires_at))
    .bind(timestamp(now))
    .bind(&row.id)
    .execute(&mut *connection)
    .await?;
    if updated.rows_affected() != 1 {
        return Err(invalid_state("authorization_exchange_cas_failed"));
    }
    Ok(credentials)
}

async fn fetch_exchange_row(
    connection: &mut SqliteConnection,
    device_code_hash: &str,
    server_instance_id: &str,
) -> DeviceSessionResult<Option<ExchangeRow>> {
    let row = sqlx::query(
        r#"
        SELECT id, code_challenge, installation_id, device_name, platform,
               client_version, authorization_status, approved_user_id,
               exchange_transaction_id, exchange_result_ciphertext,
               exchange_result_expires_at, expires_at, next_poll_at,
               poll_interval_seconds
        FROM device_authorizations
        WHERE device_code_hash = ?1 AND server_instance_id = ?2
        "#,
    )
    .bind(device_code_hash)
    .bind(server_instance_id)
    .fetch_optional(connection)
    .await?;
    Ok(row.map(|row| ExchangeRow {
        id: row.get("id"),
        code_challenge: row.get("code_challenge"),
        installation_id: row.get("installation_id"),
        device_name: row.get("device_name"),
        platform: row.get("platform"),
        client_version: row.get("client_version"),
        status: row.get("authorization_status"),
        approved_user_id: row.get("approved_user_id"),
        transaction_id: row.get("exchange_transaction_id"),
        ciphertext: row.get("exchange_result_ciphertext"),
        result_expires_at: row.get("exchange_result_expires_at"),
        expires_at: row.get("expires_at"),
        next_poll_at: row.get("next_poll_at"),
        poll_interval_seconds: row.get("poll_interval_seconds"),
    }))
}

async fn upsert_device(
    connection: &mut SqliteConnection,
    policy: &DeviceSessionPolicy,
    authorization: &ExchangeRow,
    user_id: i64,
    now: DateTime<Utc>,
) -> DeviceSessionResult<String> {
    let device_id = Uuid::new_v4().to_string();
    sqlx::query(
        r#"
        INSERT INTO devices (
            id, user_id, server_instance_id, installation_id, device_name,
            platform, client_version, last_seen_at, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?8)
        ON CONFLICT(user_id, server_instance_id, installation_id) DO UPDATE SET
            device_name = excluded.device_name,
            platform = excluded.platform,
            client_version = excluded.client_version,
            last_seen_at = excluded.last_seen_at,
            updated_at = excluded.updated_at
        "#,
    )
    .bind(&device_id)
    .bind(user_id)
    .bind(&policy.server_instance_id)
    .bind(&authorization.installation_id)
    .bind(&authorization.device_name)
    .bind(&authorization.platform)
    .bind(&authorization.client_version)
    .bind(timestamp(now))
    .execute(&mut *connection)
    .await?;
    let (actual_id, status) = sqlx::query_as::<_, (String, String)>(
        r#"
        SELECT id, device_status FROM devices
        WHERE user_id = ?1 AND server_instance_id = ?2 AND installation_id = ?3
        "#,
    )
    .bind(user_id)
    .bind(&policy.server_instance_id)
    .bind(&authorization.installation_id)
    .fetch_one(connection)
    .await?;
    if status != "active" {
        return Err(DeviceSessionError::InvalidState(
            "已撤销 installation 不可重新交换凭证".to_string(),
        ));
    }
    Ok(actual_id)
}

async fn poll_in_transaction(
    connection: &mut SqliteConnection,
    device_code_hash: &str,
    server_instance_id: &str,
    now: DateTime<Utc>,
) -> DeviceSessionResult<AuthorizationPoll> {
    let row = fetch_exchange_row(connection, device_code_hash, server_instance_id)
        .await?
        .ok_or(DeviceSessionError::InvalidDeviceCode)?;
    if parse_timestamp(&row.expires_at)? <= now
        && matches!(row.status.as_str(), "pending" | "approved")
    {
        sqlx::query(
            "UPDATE device_authorizations SET authorization_status = 'expired', updated_at = ?1 WHERE id = ?2 AND authorization_status IN ('pending', 'approved')",
        )
        .bind(timestamp(now))
        .bind(&row.id)
        .execute(&mut *connection)
        .await?;
        return Err(DeviceSessionError::AuthorizationExpired);
    }
    let status = parse_status(&row.status)?;
    if matches!(
        status,
        AuthorizationStatus::Pending | AuthorizationStatus::Approved
    ) {
        enforce_poll_gate(connection, &row, now).await?;
    }
    Ok(AuthorizationPoll {
        status,
        interval_seconds: row.poll_interval_seconds,
    })
}

async fn enforce_poll_gate(
    connection: &mut SqliteConnection,
    row: &ExchangeRow,
    now: DateTime<Utc>,
) -> DeviceSessionResult<()> {
    let next_poll_at = parse_timestamp(&row.next_poll_at)?;
    if next_poll_at > now {
        let retry_after_seconds = (next_poll_at - now).num_seconds().max(1);
        let delayed_until = next_poll_at + Duration::seconds(row.poll_interval_seconds);
        sqlx::query(
            "UPDATE device_authorizations SET next_poll_at = ?1, updated_at = ?2 WHERE id = ?3",
        )
        .bind(timestamp(delayed_until))
        .bind(timestamp(now))
        .bind(&row.id)
        .execute(connection)
        .await?;
        return Err(DeviceSessionError::SlowDown {
            retry_after_seconds: retry_after_seconds + row.poll_interval_seconds,
        });
    }
    let next_poll_at = now + Duration::seconds(row.poll_interval_seconds);
    let updated = sqlx::query(
        r#"
        UPDATE device_authorizations SET next_poll_at = ?1, updated_at = ?2
        WHERE id = ?3 AND next_poll_at <= ?2
        "#,
    )
    .bind(timestamp(next_poll_at))
    .bind(timestamp(now))
    .bind(&row.id)
    .execute(connection)
    .await?;
    if updated.rows_affected() != 1 {
        return Err(DeviceSessionError::SlowDown {
            retry_after_seconds: row.poll_interval_seconds,
        });
    }
    Ok(())
}

async fn decide_authorization(
    pool: &SqlitePool,
    authorization_id: &str,
    user_id: Option<i64>,
    now: DateTime<Utc>,
) -> DeviceSessionResult<()> {
    let mut transaction = begin_immediate(pool).await?;
    let result =
        decide_authorization_in_transaction(&mut transaction, authorization_id, user_id, now).await;
    finish_transaction(transaction, transaction_should_commit(&result)).await?;
    result
}

async fn decide_authorization_in_transaction(
    connection: &mut SqliteConnection,
    authorization_id: &str,
    user_id: Option<i64>,
    now: DateTime<Utc>,
) -> DeviceSessionResult<()> {
    if let Some(user_id) = user_id {
        ensure_active_user(connection, user_id).await?;
    }
    let (status, approval_user, approved_at, denied_at) = if let Some(user_id) = user_id {
        ("approved", Some(user_id), Some(timestamp(now)), None)
    } else {
        ("denied", None, None, Some(timestamp(now)))
    };
    let result = sqlx::query(
        r#"
        UPDATE device_authorizations
        SET authorization_status = ?1, approved_user_id = ?2,
            approved_at = ?3, denied_at = ?4, updated_at = ?5
        WHERE id = ?6 AND authorization_status = 'pending' AND expires_at > ?5
        "#,
    )
    .bind(status)
    .bind(approval_user)
    .bind(approved_at)
    .bind(denied_at)
    .bind(timestamp(now))
    .bind(authorization_id)
    .execute(&mut *connection)
    .await?;
    if result.rows_affected() == 1 {
        return Ok(());
    }
    classify_decision_failure(connection, authorization_id, now).await
}

async fn classify_decision_failure(
    connection: &mut SqliteConnection,
    authorization_id: &str,
    now: DateTime<Utc>,
) -> DeviceSessionResult<()> {
    let row = sqlx::query_as::<_, (String, String)>(
        "SELECT authorization_status, expires_at FROM device_authorizations WHERE id = ?1",
    )
    .bind(authorization_id)
    .fetch_optional(&mut *connection)
    .await?
    .ok_or(DeviceSessionError::InvalidUserCode)?;
    if parse_timestamp(&row.1)? <= now && row.0 == "pending" {
        sqlx::query(
            "UPDATE device_authorizations SET authorization_status = 'expired', updated_at = ?1 WHERE id = ?2 AND authorization_status = 'pending'",
        )
        .bind(timestamp(now))
        .bind(authorization_id)
        .execute(connection)
        .await?;
        return Err(DeviceSessionError::AuthorizationExpired);
    }
    match row.0.as_str() {
        "approved" | "consumed" => Err(DeviceSessionError::AuthorizationConsumed),
        "denied" => Err(DeviceSessionError::AuthorizationDenied),
        "expired" => Err(DeviceSessionError::AuthorizationExpired),
        state => Err(invalid_state(state)),
    }
}

async fn ensure_active_user(
    connection: &mut SqliteConnection,
    user_id: i64,
) -> DeviceSessionResult<()> {
    let status = sqlx::query_scalar::<_, String>("SELECT status FROM users WHERE id = ?1")
        .bind(user_id)
        .fetch_optional(connection)
        .await?;
    if status.as_deref() != Some("active") {
        return Err(DeviceSessionError::UserInactive);
    }
    Ok(())
}

async fn expire_authorization_by_user_code(
    pool: &SqlitePool,
    user_code_hash: &str,
    server_instance_id: &str,
    now: DateTime<Utc>,
) -> DeviceSessionResult<()> {
    sqlx::query(
        r#"
        UPDATE device_authorizations
        SET authorization_status = 'expired', updated_at = ?1
        WHERE user_code_hash = ?2 AND server_instance_id = ?3
          AND authorization_status = 'pending' AND expires_at <= ?1
        "#,
    )
    .bind(timestamp(now))
    .bind(user_code_hash)
    .bind(server_instance_id)
    .execute(pool)
    .await?;
    Ok(())
}

async fn begin_immediate(pool: &SqlitePool) -> DeviceSessionResult<Transaction<'static, Sqlite>> {
    Ok(pool.begin_with("BEGIN IMMEDIATE").await?)
}

async fn finish_transaction(
    transaction: Transaction<'static, Sqlite>,
    commit: bool,
) -> DeviceSessionResult<()> {
    if commit {
        transaction.commit().await?;
    } else {
        transaction.rollback().await?;
    }
    Ok(())
}

fn transaction_should_commit<T>(result: &DeviceSessionResult<T>) -> bool {
    !matches!(
        result,
        Err(DeviceSessionError::StorageFailure(_))
            | Err(DeviceSessionError::CryptoFailure)
            | Err(DeviceSessionError::InvalidState(_))
    )
}

fn decrypt_exchange_result(
    master_key: &str,
    ciphertext: &str,
    authorization_id: &str,
    server_instance_id: &str,
    transaction_id: &str,
    device_code_hash: &str,
) -> DeviceSessionResult<InitialDeviceCredentials> {
    let aad = exchange_result_aad(
        authorization_id,
        server_instance_id,
        transaction_id,
        device_code_hash,
    );
    let plaintext = crypto::decrypt_secret(master_key, ciphertext, &aad)
        .map_err(|_| DeviceSessionError::CryptoFailure)?;
    serde_json::from_str(&plaintext).map_err(|_| DeviceSessionError::CryptoFailure)
}

pub fn issue_access_token() -> String {
    issue_token(DEVICE_ACCESS_TOKEN_PREFIX)
}

pub fn issue_refresh_token() -> String {
    issue_token(DEVICE_REFRESH_TOKEN_PREFIX)
}

pub fn is_device_access_token(value: &str) -> bool {
    valid_token_with_prefix(value, DEVICE_ACCESS_TOKEN_PREFIX)
}

pub fn is_device_refresh_token(value: &str) -> bool {
    valid_token_with_prefix(value, DEVICE_REFRESH_TOKEN_PREFIX)
}

pub fn hash_device_token(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

pub fn normalize_transaction_id(value: &str) -> AppResult<String> {
    normalize_transaction_id_domain(value)
        .map_err(|_| AppError::BadRequest("transaction_id 必须是有效 UUID".to_string()))
}

pub fn refresh_rotation_aad(
    family_id: &str,
    device_id: &str,
    server_instance_id: &str,
    source_generation: i64,
    transaction_id: &str,
    source_refresh_token_hash: &str,
) -> Vec<u8> {
    structured_aad(
        "device-refresh:v1",
        &[
            family_id,
            device_id,
            server_instance_id,
            &source_generation.to_string(),
            transaction_id,
            source_refresh_token_hash,
        ],
    )
}

pub fn exchange_result_aad(
    authorization_id: &str,
    server_instance_id: &str,
    transaction_id: &str,
    device_code_hash: &str,
) -> Vec<u8> {
    structured_aad(
        "device-exchange:v1",
        &[
            authorization_id,
            server_instance_id,
            transaction_id,
            device_code_hash,
        ],
    )
}

fn issue_token(prefix: &str) -> String {
    let mut entropy = [0_u8; TOKEN_ENTROPY_BYTES];
    OsRng.fill_bytes(&mut entropy);
    format!("{prefix}{}", URL_SAFE_NO_PAD.encode(entropy))
}

fn issue_user_code() -> String {
    let mut bytes = [0_u8; USER_CODE_SYMBOLS];
    OsRng.fill_bytes(&mut bytes);
    let mut code = String::with_capacity(USER_CODE_SYMBOLS + 1);
    for (index, byte) in bytes.into_iter().enumerate() {
        if index == USER_CODE_SYMBOLS / 2 {
            code.push('-');
        }
        code.push(USER_CODE_ALPHABET[usize::from(byte) % USER_CODE_ALPHABET.len()] as char);
    }
    code
}

fn hash_user_code(master_key: &str, value: &str) -> DeviceSessionResult<String> {
    let normalized = normalize_user_code(value)?;
    if master_key.trim().len() < 16 {
        return Err(DeviceSessionError::CryptoFailure);
    }
    let hkdf = Hkdf::<Sha256>::new(Some(b"yuance-device-user-code"), master_key.as_bytes());
    let mut key = [0_u8; 32];
    hkdf.expand(b"yuance-device-user-code:hmac-sha256:v1", &mut key)
        .map_err(|_| DeviceSessionError::CryptoFailure)?;
    let mut mac =
        Hmac::<Sha256>::new_from_slice(&key).map_err(|_| DeviceSessionError::CryptoFailure)?;
    mac.update(normalized.as_bytes());
    Ok(hex::encode(mac.finalize().into_bytes()))
}

fn normalize_user_code(value: &str) -> DeviceSessionResult<String> {
    let normalized: String = value
        .chars()
        .filter(|character| !matches!(character, '-' | ' '))
        .flat_map(char::to_uppercase)
        .collect();
    if normalized.len() != USER_CODE_SYMBOLS
        || !normalized
            .bytes()
            .all(|byte| USER_CODE_ALPHABET.contains(&byte))
    {
        return Err(DeviceSessionError::InvalidUserCode);
    }
    Ok(normalized)
}

fn checked_device_code_hash(value: &str) -> DeviceSessionResult<String> {
    if !valid_token_with_prefix(value, DEVICE_CODE_PREFIX) {
        return Err(DeviceSessionError::InvalidDeviceCode);
    }
    Ok(hash_device_token(value))
}

fn valid_token_with_prefix(value: &str, prefix: &str) -> bool {
    let Some(encoded) = value.strip_prefix(prefix) else {
        return false;
    };
    if encoded.len() != 43 {
        return false;
    }
    let Ok(decoded) = URL_SAFE_NO_PAD.decode(encoded) else {
        return false;
    };
    decoded.len() == TOKEN_ENTROPY_BYTES && URL_SAFE_NO_PAD.encode(decoded) == encoded
}

fn validate_code_challenge(value: &str) -> DeviceSessionResult<()> {
    let decoded = URL_SAFE_NO_PAD.decode(value).map_err(|_| {
        DeviceSessionError::InvalidRequest(
            "code_challenge 必须是 canonical S256 Base64URL".to_string(),
        )
    })?;
    if decoded.len() != 32 || URL_SAFE_NO_PAD.encode(decoded) != value {
        return Err(DeviceSessionError::InvalidRequest(
            "code_challenge 必须是 canonical S256 Base64URL".to_string(),
        ));
    }
    Ok(())
}

fn validate_code_verifier(value: &str) -> DeviceSessionResult<()> {
    if !(43..=128).contains(&value.len())
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~'))
    {
        return Err(DeviceSessionError::InvalidCodeVerifier);
    }
    Ok(())
}

fn pkce_matches(verifier: &str, expected_challenge: &str) -> bool {
    let actual = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    constant_time_eq(actual.as_bytes(), expected_challenge.as_bytes())
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0_u8, |difference, (left, right)| {
            difference | (left ^ right)
        })
        == 0
}

fn validate_metadata(field: &str, value: &str, min: usize, max: usize) -> DeviceSessionResult<()> {
    let length = value.trim().chars().count();
    if !(min..=max).contains(&length) {
        return Err(DeviceSessionError::InvalidRequest(format!(
            "{field} 长度必须在 {min} 到 {max} 之间"
        )));
    }
    Ok(())
}

fn validate_policy(policy: &DeviceSessionPolicy) -> DeviceSessionResult<()> {
    if policy.server_instance_id.trim().is_empty()
        || policy.authorization_ttl_seconds <= 0
        || policy.access_ttl_seconds <= 0
        || policy.refresh_sliding_ttl_seconds <= 0
        || policy.refresh_absolute_ttl_seconds < policy.refresh_sliding_ttl_seconds
        || policy.idempotency_ttl_seconds <= 0
        || !(2..=15).contains(&policy.poll_interval_seconds)
    {
        return Err(DeviceSessionError::InvalidRequest(
            "device session policy 无效".to_string(),
        ));
    }
    Ok(())
}

fn normalize_transaction_id_domain(value: &str) -> DeviceSessionResult<String> {
    Uuid::parse_str(value.trim())
        .map(|id| id.hyphenated().to_string())
        .map_err(|_| {
            DeviceSessionError::InvalidRequest("transaction_id 必须是有效 UUID".to_string())
        })
}

fn timestamp(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

fn parse_timestamp(value: &str) -> DeviceSessionResult<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|value| value.with_timezone(&Utc))
        .map_err(|_| invalid_state("invalid_timestamp"))
}

fn parse_status(value: &str) -> DeviceSessionResult<AuthorizationStatus> {
    match value {
        "pending" => Ok(AuthorizationStatus::Pending),
        "approved" => Ok(AuthorizationStatus::Approved),
        "denied" => Ok(AuthorizationStatus::Denied),
        "expired" => Ok(AuthorizationStatus::Expired),
        "consumed" => Ok(AuthorizationStatus::Consumed),
        state => Err(invalid_state(state)),
    }
}

fn invalid_state(state: &str) -> DeviceSessionError {
    DeviceSessionError::InvalidState(state.to_string())
}

fn is_unique_violation(error: &sqlx::Error) -> bool {
    error
        .as_database_error()
        .and_then(|error| error.code())
        .is_some_and(|code| code == "2067" || code == "1555")
}

fn structured_aad(domain: &str, fields: &[&str]) -> Vec<u8> {
    let mut encoded = Vec::with_capacity(
        domain.len() + fields.iter().map(|field| field.len() + 4).sum::<usize>(),
    );
    encoded.extend_from_slice(domain.as_bytes());
    encoded.push(0);
    for field in fields {
        let bytes = field.as_bytes();
        let length = u32::try_from(bytes.len()).expect("AAD field length should fit u32");
        encoded.extend_from_slice(&length.to_be_bytes());
        encoded.extend_from_slice(bytes);
    }
    encoded
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::{config::Settings, db};

    const MASTER_KEY: &str = "device-session-test-master-key-long-enough";

    fn policy() -> DeviceSessionPolicy {
        DeviceSessionPolicy {
            server_instance_id: "device-session-test".to_string(),
            authorization_ttl_seconds: 600,
            access_ttl_seconds: 900,
            refresh_sliding_ttl_seconds: 30 * 24 * 60 * 60,
            refresh_absolute_ttl_seconds: 90 * 24 * 60 * 60,
            idempotency_ttl_seconds: 24 * 60 * 60,
            poll_interval_seconds: 5,
        }
    }

    fn verifier_and_challenge() -> (String, String) {
        let verifier = "0123456789012345678901234567890123456789012".to_string();
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        (verifier, challenge)
    }

    async fn test_pool() -> SqlitePool {
        let settings = Settings {
            http_addr: "127.0.0.1:33033".parse().unwrap(),
            database_url: format!(
                "sqlite:file:device-session-{}?mode=memory&cache=shared",
                Uuid::new_v4()
            ),
            data_dir: "data".to_string(),
            session_secret: "test-session-secret".to_string(),
            session_ttl: "2h".to_string(),
            refresh_session_ttl: "30d".to_string(),
            cache_session_ttl: "5m".to_string(),
            log_level: "off".to_string(),
            env: "test".to_string(),
            security_master_key: MASTER_KEY.to_string(),
            device_sessions: Default::default(),
            experimental_legacy_preview_enabled: false,
        };
        let pool = db::connect_pool(&settings).await.unwrap();
        db::run_migrations(&pool).await.unwrap();
        pool
    }

    async fn insert_user(pool: &SqlitePool, status: &str) -> i64 {
        sqlx::query(
            "INSERT INTO users (username, password_hash, display_name, status) VALUES (?1, 'hash', 'Device User', ?2)",
        )
        .bind(format!("device-user-{}", Uuid::new_v4()))
        .bind(status)
        .execute(pool)
        .await
        .unwrap()
            .last_insert_rowid()
    }

    #[tokio::test]
    async fn cancelled_immediate_transaction_rolls_back_before_connection_reuse() {
        let pool = test_pool().await;
        let task_pool = pool.clone();
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(async move {
            let _transaction = begin_immediate(&task_pool).await.unwrap();
            started_tx.send(()).unwrap();
            std::future::pending::<()>().await;
        });
        started_rx.await.unwrap();
        task.abort();
        let _ = task.await;

        let transaction =
            tokio::time::timeout(std::time::Duration::from_secs(1), begin_immediate(&pool))
                .await
                .expect("cancelled transaction must not retain the only pooled connection")
                .expect("connection should accept a new immediate transaction");
        transaction.rollback().await.unwrap();
    }

    async fn start(pool: &SqlitePool, now: DateTime<Utc>) -> (StartedAuthorization, String) {
        let (verifier, challenge) = verifier_and_challenge();
        let started = start_authorization(
            pool,
            MASTER_KEY,
            &policy(),
            StartAuthorizationInput {
                code_challenge: challenge,
                installation_id: Uuid::new_v4().to_string(),
                device_name: "Test Desktop".to_string(),
                platform: "test".to_string(),
                client_version: "0.1.0".to_string(),
            },
            now,
        )
        .await
        .unwrap();
        (started, verifier)
    }

    #[test]
    fn device_tokens_use_distinct_namespaces_and_full_entropy() {
        let access = issue_access_token();
        let refresh = issue_refresh_token();
        assert!(is_device_access_token(&access));
        assert!(!is_device_refresh_token(&access));
        assert!(is_device_refresh_token(&refresh));
        assert!(!is_device_access_token(&refresh));
        assert_ne!(access, issue_access_token());
        assert_ne!(refresh, issue_refresh_token());
    }

    #[test]
    fn token_validation_rejects_other_credential_types_and_bad_lengths() {
        for value in [
            "",
            "yuance_pat_example",
            "yuance_dat_short",
            "yuance_drt_short",
            "Bearer yuance_dat_example",
        ] {
            assert!(!is_device_access_token(value));
            assert!(!is_device_refresh_token(value));
        }
    }

    #[test]
    fn user_code_hash_is_keyed_and_normalized() {
        let code = issue_user_code();
        let compact = code.replace('-', "").to_lowercase();
        assert_eq!(
            hash_user_code("first-master-key-long-enough", &code).unwrap(),
            hash_user_code("first-master-key-long-enough", &compact).unwrap()
        );
        assert_ne!(
            hash_user_code("first-master-key-long-enough", &code).unwrap(),
            hash_user_code("other-master-key-long-enough", &code).unwrap()
        );
        assert!(hash_user_code("too-short", &code).is_err());
    }

    #[test]
    fn s256_pkce_is_strict_and_matches() {
        let verifier = "0123456789012345678901234567890123456789012";
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        validate_code_challenge(&challenge).unwrap();
        validate_code_verifier(verifier).unwrap();
        assert!(pkce_matches(verifier, &challenge));
        assert!(!pkce_matches(
            "0123456789012345678901234567890123456789013",
            &challenge
        ));
    }

    #[test]
    fn transaction_ids_are_canonicalized() {
        assert_eq!(
            normalize_transaction_id("550E8400-E29B-41D4-A716-446655440000").unwrap(),
            "550e8400-e29b-41d4-a716-446655440000"
        );
        assert!(normalize_transaction_id("not-a-uuid").is_err());
    }

    #[test]
    fn rotation_aad_binds_every_recovery_dimension() {
        let baseline = refresh_rotation_aad("family", "device", "server", 3, "tx", "hash");
        for candidate in [
            refresh_rotation_aad("other", "device", "server", 3, "tx", "hash"),
            refresh_rotation_aad("family", "other", "server", 3, "tx", "hash"),
            refresh_rotation_aad("family", "device", "other", 3, "tx", "hash"),
            refresh_rotation_aad("family", "device", "server", 4, "tx", "hash"),
            refresh_rotation_aad("family", "device", "server", 3, "other", "hash"),
            refresh_rotation_aad("family", "device", "server", 3, "tx", "other"),
        ] {
            assert_ne!(baseline, candidate);
        }
    }

    #[test]
    fn structured_aad_does_not_confuse_delimiter_placements() {
        assert_ne!(
            refresh_rotation_aad("family:a", "device", "server", 3, "tx", "hash"),
            refresh_rotation_aad("family", "a:device", "server", 3, "tx", "hash")
        );
    }

    #[tokio::test]
    async fn poll_gate_persists_pending_and_slow_down_updates() {
        let pool = test_pool().await;
        let now = Utc::now();
        let (started, _) = start(&pool, now).await;

        let first = poll_authorization(
            &pool,
            &started.device_code,
            &started.server_instance_id,
            now,
        )
        .await
        .unwrap();
        assert_eq!(first.status, AuthorizationStatus::Pending);
        let after_first = sqlx::query_scalar::<_, String>(
            "SELECT next_poll_at FROM device_authorizations WHERE id = ?1",
        )
        .bind(&started.authorization_id)
        .fetch_one(&pool)
        .await
        .unwrap();

        let error = poll_authorization(
            &pool,
            &started.device_code,
            &started.server_instance_id,
            now,
        )
        .await
        .unwrap_err();
        assert_eq!(error.code(), "slow_down");
        let after_slow_down = sqlx::query_scalar::<_, String>(
            "SELECT next_poll_at FROM device_authorizations WHERE id = ?1",
        )
        .bind(&started.authorization_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(after_slow_down > after_first);

        let expired_at = now + Duration::seconds(policy().authorization_ttl_seconds + 1);
        let error = poll_authorization(
            &pool,
            &started.device_code,
            &started.server_instance_id,
            expired_at,
        )
        .await
        .unwrap_err();
        assert_eq!(error.code(), "authorization_expired");
        let status = sqlx::query_scalar::<_, String>(
            "SELECT authorization_status FROM device_authorizations WHERE id = ?1",
        )
        .bind(&started.authorization_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(status, "expired");
    }

    #[tokio::test]
    async fn approval_and_exchange_require_an_active_user() {
        let pool = test_pool().await;
        let now = Utc::now();
        let disabled_user_id = insert_user(&pool, "disabled").await;
        let (disabled_start, _) = start(&pool, now).await;
        let error = approve_authorization(
            &pool,
            &disabled_start.authorization_id,
            disabled_user_id,
            now,
        )
        .await
        .unwrap_err();
        assert_eq!(error.code(), "user_inactive");

        let active_user_id = insert_user(&pool, "active").await;
        let (started, verifier) = start(&pool, now).await;
        approve_authorization(&pool, &started.authorization_id, active_user_id, now)
            .await
            .unwrap();
        sqlx::query("UPDATE users SET status = 'locked' WHERE id = ?1")
            .bind(active_user_id)
            .execute(&pool)
            .await
            .unwrap();
        let error = exchange_authorization(
            &pool,
            MASTER_KEY,
            &policy(),
            ExchangeAuthorizationInput {
                device_code: started.device_code,
                code_verifier: verifier,
                exchange_transaction_id: Uuid::new_v4().to_string(),
            },
            now,
        )
        .await
        .unwrap_err();
        assert_eq!(error.code(), "user_inactive");
        let family_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM device_credential_families WHERE authorization_id = ?1",
        )
        .bind(&started.authorization_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(family_count, 0);
    }

    #[tokio::test]
    async fn exchange_issues_generation_zero_and_recovers_only_same_transaction() {
        let pool = test_pool().await;
        let now = Utc::now();
        let user_id = insert_user(&pool, "active").await;
        let (started, verifier) = start(&pool, now).await;
        approve_authorization(&pool, &started.authorization_id, user_id, now)
            .await
            .unwrap();
        let transaction_id = Uuid::new_v4().to_string();
        let input = || ExchangeAuthorizationInput {
            device_code: started.device_code.clone(),
            code_verifier: verifier.clone(),
            exchange_transaction_id: transaction_id.clone(),
        };

        let issued = exchange_authorization(&pool, MASTER_KEY, &policy(), input(), now)
            .await
            .unwrap();
        let recovered = exchange_authorization(&pool, MASTER_KEY, &policy(), input(), now)
            .await
            .unwrap();
        assert_eq!(issued, recovered);
        assert_eq!(issued.generation, 0);
        assert_eq!(issued.authorization_version, 1);
        assert!(is_device_access_token(&issued.access_token));
        assert!(is_device_refresh_token(&issued.refresh_token));

        let family_authorization = sqlx::query_scalar::<_, String>(
            "SELECT authorization_id FROM device_credential_families WHERE id = ?1",
        )
        .bind(&issued.family_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(family_authorization, started.authorization_id);

        let error = exchange_authorization(
            &pool,
            MASTER_KEY,
            &policy(),
            ExchangeAuthorizationInput {
                exchange_transaction_id: Uuid::new_v4().to_string(),
                ..input()
            },
            now,
        )
        .await
        .unwrap_err();
        assert_eq!(error.code(), "exchange_transaction_mismatch");

        let erased = erase_expired_exchange_results(
            &pool,
            now + Duration::seconds(policy().idempotency_ttl_seconds + 1),
        )
        .await
        .unwrap();
        assert_eq!(erased, 1);
        let error = exchange_authorization(
            &pool,
            MASTER_KEY,
            &policy(),
            input(),
            now + Duration::seconds(policy().idempotency_ttl_seconds + 1),
        )
        .await
        .unwrap_err();
        assert_eq!(error.code(), "idempotency_expired");
    }

    #[tokio::test]
    async fn approve_and_deny_cas_has_one_winner() {
        let pool = test_pool().await;
        let now = Utc::now();
        let user_id = insert_user(&pool, "active").await;
        let (started, _) = start(&pool, now).await;
        let approve_pool = pool.clone();
        let deny_pool = pool.clone();
        let approve_id = started.authorization_id.clone();
        let deny_id = started.authorization_id;
        let (approved, denied) = tokio::join!(
            approve_authorization(&approve_pool, &approve_id, user_id, now),
            deny_authorization(&deny_pool, &deny_id, now),
        );
        assert_ne!(approved.is_ok(), denied.is_ok());
    }

    #[tokio::test]
    async fn concurrent_exchange_creates_one_canonical_generation() {
        let pool = test_pool().await;
        let now = Utc::now();
        let user_id = insert_user(&pool, "active").await;
        let (started, verifier) = start(&pool, now).await;
        approve_authorization(&pool, &started.authorization_id, user_id, now)
            .await
            .unwrap();
        let transaction_id = Uuid::new_v4().to_string();
        let first_pool = pool.clone();
        let second_pool = pool.clone();
        let first_input = ExchangeAuthorizationInput {
            device_code: started.device_code.clone(),
            code_verifier: verifier.clone(),
            exchange_transaction_id: transaction_id.clone(),
        };
        let second_input = ExchangeAuthorizationInput {
            device_code: started.device_code,
            code_verifier: verifier,
            exchange_transaction_id: transaction_id,
        };
        let first_policy = policy();
        let second_policy = policy();

        let (first, second) = tokio::join!(
            exchange_authorization(&first_pool, MASTER_KEY, &first_policy, first_input, now),
            exchange_authorization(&second_pool, MASTER_KEY, &second_policy, second_input, now),
        );
        let first = first.unwrap();
        let second = second.unwrap();
        assert_eq!(first, second);

        let counts = sqlx::query_as::<_, (i64, i64, i64)>(
            r#"
            SELECT
                (SELECT COUNT(*) FROM device_credential_families WHERE authorization_id = ?1),
                (SELECT COUNT(*) FROM device_access_sessions WHERE family_id = ?2 AND generation = 0),
                (SELECT COUNT(*) FROM device_refresh_credentials WHERE family_id = ?2 AND generation = 0)
            "#,
        )
        .bind(&started.authorization_id)
        .bind(&first.family_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(counts, (1, 1, 1));
    }
}
