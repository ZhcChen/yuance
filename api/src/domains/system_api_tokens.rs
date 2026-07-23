use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use rand_core::{OsRng, RngCore};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;

use crate::platform::{
    crypto,
    error::{AppError, AppResult},
};

const TOKEN_PREFIX: &str = "yuance_sys_pat_";
pub const MAX_ACTIVE_SYSTEM_TOKENS: i64 = 100;

pub const SCOPE_SYSTEM_RELEASE_READ: &str = "system_release:read";
pub const SCOPE_SYSTEM_RELEASE_WRITE: &str = "system_release:write";

const ALLOWED_SCOPES: &[&str] = &[SCOPE_SYSTEM_RELEASE_READ, SCOPE_SYSTEM_RELEASE_WRITE];

#[derive(Debug, Clone)]
pub struct SystemApiTokenSummary {
    pub id: i64,
    pub name: String,
    pub scopes: Vec<String>,
    pub token_suffix: String,
    pub created_by_display_name: String,
    pub updated_by_display_name: String,
    pub last_used_at: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct CreatedSystemApiToken {
    pub token: SystemApiTokenSummary,
    pub raw_token: String,
}

#[derive(Debug, Clone)]
pub struct SystemApiTokenPlaintextSummary {
    pub token: SystemApiTokenSummary,
    pub raw_token: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AuthenticatedSystemApiToken {
    pub token_id: i64,
    pub token_name: String,
    pub owner_user_id: i64,
    pub scopes: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct CreateSystemApiTokenInput {
    pub name: String,
    pub scopes: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct UpdateSystemApiTokenInput {
    pub name: String,
    pub scopes: Vec<String>,
}

pub fn is_system_token(raw_token: &str) -> bool {
    raw_token.starts_with(TOKEN_PREFIX)
}

pub async fn authenticated_token_from_bearer_token(
    pool: &SqlitePool,
    raw_token: &str,
) -> AppResult<Option<AuthenticatedSystemApiToken>> {
    if !is_system_token(raw_token) {
        return Ok(None);
    }
    let token_hash = hash_token(raw_token);
    let row = sqlx::query_as::<_, (i64, String, i64, String)>(
        r#"
        SELECT t.id, t.name, u.id, t.scopes
        FROM system_api_tokens t
        JOIN users u ON u.id = t.created_by_user_id
        WHERE t.token_hash = ?1
          AND u.status = 'active'
        "#,
    )
    .bind(&token_hash)
    .fetch_optional(pool)
    .await?;

    let Some((token_id, token_name, owner_user_id, scopes_json)) = row else {
        return Ok(None);
    };

    sqlx::query(
        r#"
        UPDATE system_api_tokens
        SET last_used_at = datetime('now'),
            updated_at = datetime('now')
        WHERE token_hash = ?1
        "#,
    )
    .bind(token_hash)
    .execute(pool)
    .await?;

    Ok(Some(AuthenticatedSystemApiToken {
        token_id,
        token_name,
        owner_user_id,
        scopes: parse_scopes(&scopes_json),
    }))
}

pub async fn create_token(
    pool: &SqlitePool,
    master_key: &str,
    actor_user_id: i64,
    input: CreateSystemApiTokenInput,
) -> AppResult<CreatedSystemApiToken> {
    let name = validate_name(&input.name)?;
    let scopes = normalize_scopes(input.scopes)?;
    let scopes_json = serde_json::to_string(&scopes).unwrap_or_else(|_| "[]".to_string());
    let active_token_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM system_api_tokens")
        .fetch_one(pool)
        .await?;
    if active_token_count >= MAX_ACTIVE_SYSTEM_TOKENS {
        return Err(AppError::BadRequest(format!(
            "系统访问 Token 最多保留 {MAX_ACTIVE_SYSTEM_TOKENS} 个，请先删除不再使用的 Token"
        )));
    }

    let raw_token = generate_token();
    let token_hash = hash_token(&raw_token);
    let token_suffix = raw_token
        .chars()
        .rev()
        .take(8)
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();
    let token_ciphertext = crypto::encrypt_secret(
        master_key,
        &raw_token,
        token_secret_aad(&token_hash).as_bytes(),
    )?;

    let token_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO system_api_tokens (
            name,
            token_hash,
            token_suffix,
            token_ciphertext,
            scopes,
            created_by_user_id,
            updated_by_user_id
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
        RETURNING id
        "#,
    )
    .bind(name)
    .bind(token_hash)
    .bind(token_suffix)
    .bind(token_ciphertext)
    .bind(scopes_json)
    .bind(actor_user_id)
    .fetch_one(pool)
    .await?;

    let token = get_token(pool, token_id).await?;
    Ok(CreatedSystemApiToken { token, raw_token })
}

pub async fn list_tokens(pool: &SqlitePool) -> AppResult<Vec<SystemApiTokenSummary>> {
    let rows = sqlx::query_as::<_, TokenRow>(
        r#"
        SELECT
            t.id,
            t.name,
            t.token_hash,
            t.token_suffix,
            t.token_ciphertext,
            t.scopes,
            COALESCE(NULLIF(created_user.display_name, ''), created_user.username, '') AS created_by_display_name,
            COALESCE(NULLIF(updated_user.display_name, ''), updated_user.username, '') AS updated_by_display_name,
            t.last_used_at,
            t.created_at,
            t.updated_at
        FROM system_api_tokens t
        JOIN users created_user ON created_user.id = t.created_by_user_id
        JOIN users updated_user ON updated_user.id = t.updated_by_user_id
        ORDER BY t.id DESC
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(token_from_row).collect())
}

pub async fn list_tokens_with_raw(
    pool: &SqlitePool,
    master_key: &str,
) -> AppResult<Vec<SystemApiTokenPlaintextSummary>> {
    let rows = sqlx::query_as::<_, TokenRow>(
        r#"
        SELECT
            t.id,
            t.name,
            t.token_hash,
            t.token_suffix,
            t.token_ciphertext,
            t.scopes,
            COALESCE(NULLIF(created_user.display_name, ''), created_user.username, '') AS created_by_display_name,
            COALESCE(NULLIF(updated_user.display_name, ''), updated_user.username, '') AS updated_by_display_name,
            t.last_used_at,
            t.created_at,
            t.updated_at
        FROM system_api_tokens t
        JOIN users created_user ON created_user.id = t.created_by_user_id
        JOIN users updated_user ON updated_user.id = t.updated_by_user_id
        ORDER BY t.id DESC
        "#,
    )
    .fetch_all(pool)
    .await?;

    rows.into_iter()
        .map(|row| {
            let raw_token = raw_token_from_row(&row, master_key)?;
            Ok(SystemApiTokenPlaintextSummary {
                token: token_from_row(row),
                raw_token,
            })
        })
        .collect()
}

pub async fn update_token(
    pool: &SqlitePool,
    actor_user_id: i64,
    token_id: i64,
    input: UpdateSystemApiTokenInput,
) -> AppResult<SystemApiTokenSummary> {
    let name = validate_name(&input.name)?;
    let scopes = normalize_scopes(input.scopes)?;
    let scopes_json = serde_json::to_string(&scopes).unwrap_or_else(|_| "[]".to_string());

    let result = sqlx::query(
        r#"
        UPDATE system_api_tokens
        SET name = ?1,
            scopes = ?2,
            updated_by_user_id = ?3,
            updated_at = datetime('now')
        WHERE id = ?4
        "#,
    )
    .bind(name)
    .bind(scopes_json)
    .bind(actor_user_id)
    .bind(token_id)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("系统访问 Token 不存在".to_string()));
    }

    get_token(pool, token_id).await
}

pub async fn delete_token(pool: &SqlitePool, token_id: i64) -> AppResult<SystemApiTokenSummary> {
    let token = get_token(pool, token_id).await?;
    sqlx::query(
        r#"
        DELETE FROM system_api_tokens
        WHERE id = ?1
        "#,
    )
    .bind(token_id)
    .execute(pool)
    .await?;
    Ok(token)
}

pub async fn token_has_scope(
    pool: &SqlitePool,
    raw_token: &str,
    required_scope: &str,
) -> AppResult<bool> {
    let scopes = sqlx::query_scalar::<_, String>(
        r#"
        SELECT scopes
        FROM system_api_tokens
        WHERE token_hash = ?1
        "#,
    )
    .bind(hash_token(raw_token))
    .fetch_optional(pool)
    .await?;

    let Some(scopes) = scopes else {
        return Ok(false);
    };

    Ok(parse_scopes(&scopes)
        .iter()
        .any(|scope| scope == required_scope))
}

async fn get_token(pool: &SqlitePool, token_id: i64) -> AppResult<SystemApiTokenSummary> {
    let row = sqlx::query_as::<_, TokenRow>(
        r#"
        SELECT
            t.id,
            t.name,
            t.token_hash,
            t.token_suffix,
            t.token_ciphertext,
            t.scopes,
            COALESCE(NULLIF(created_user.display_name, ''), created_user.username, '') AS created_by_display_name,
            COALESCE(NULLIF(updated_user.display_name, ''), updated_user.username, '') AS updated_by_display_name,
            t.last_used_at,
            t.created_at,
            t.updated_at
        FROM system_api_tokens t
        JOIN users created_user ON created_user.id = t.created_by_user_id
        JOIN users updated_user ON updated_user.id = t.updated_by_user_id
        WHERE t.id = ?1
        "#,
    )
    .bind(token_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("系统访问 Token 不存在".to_string()))?;

    Ok(token_from_row(row))
}

#[derive(sqlx::FromRow)]
struct TokenRow {
    id: i64,
    name: String,
    token_hash: String,
    token_suffix: String,
    token_ciphertext: String,
    scopes: String,
    created_by_display_name: String,
    updated_by_display_name: String,
    last_used_at: String,
    created_at: String,
    updated_at: String,
}

fn token_from_row(row: TokenRow) -> SystemApiTokenSummary {
    SystemApiTokenSummary {
        id: row.id,
        name: row.name,
        scopes: parse_scopes(&row.scopes),
        token_suffix: row.token_suffix,
        created_by_display_name: row.created_by_display_name,
        updated_by_display_name: row.updated_by_display_name,
        last_used_at: row.last_used_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

fn raw_token_from_row(row: &TokenRow, master_key: &str) -> AppResult<Option<String>> {
    let ciphertext = row.token_ciphertext.trim();
    if ciphertext.is_empty() {
        return Ok(None);
    }

    crypto::decrypt_secret(
        master_key,
        ciphertext,
        token_secret_aad(&row.token_hash).as_bytes(),
    )
    .map(Some)
}

fn generate_token() -> String {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    format!("{TOKEN_PREFIX}{}", URL_SAFE_NO_PAD.encode(bytes))
}

fn hash_token(raw_token: &str) -> String {
    let digest = Sha256::digest(raw_token.as_bytes());
    hex::encode(digest)
}

fn token_secret_aad(token_hash: &str) -> String {
    format!("system-api-token:{token_hash}")
}

fn validate_name(name: &str) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() || name.len() > 80 {
        return Err(AppError::BadRequest(
            "系统访问 Token 名称不能为空且不能超过 80 个字符".to_string(),
        ));
    }
    Ok(name.to_string())
}

fn normalize_scopes(scopes: Vec<String>) -> AppResult<Vec<String>> {
    let mut normalized = Vec::new();
    for scope in scopes {
        let scope = scope.trim();
        if scope.is_empty() {
            continue;
        }
        if !ALLOWED_SCOPES.contains(&scope) {
            return Err(AppError::BadRequest(format!(
                "不支持的系统访问 Token scope：{scope}"
            )));
        }
        if !normalized.iter().any(|existing| existing == scope) {
            normalized.push(scope.to_string());
        }
    }

    if normalized.is_empty() {
        return Err(AppError::BadRequest(
            "系统访问 Token 至少需要选择一个 scope".to_string(),
        ));
    }

    Ok(normalized)
}

fn parse_scopes(scopes_json: &str) -> Vec<String> {
    serde_json::from_str::<Value>(scopes_json)
        .ok()
        .and_then(|value| value.as_array().cloned())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(ToOwned::to_owned))
                .collect()
        })
        .unwrap_or_default()
}
