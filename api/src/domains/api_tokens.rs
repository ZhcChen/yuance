use axum::http::{HeaderMap, header};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use rand_core::{OsRng, RngCore};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;

use crate::{
    domains::auth::AuthUser,
    platform::{
        crypto,
        error::{AppError, AppResult},
    },
};

const TOKEN_PREFIX: &str = "yuance_pat_";
pub const MAX_ACTIVE_TOKENS_PER_USER: i64 = 100;

pub const SCOPE_PROJECT_READ: &str = "project:read";
pub const SCOPE_WORK_ITEM_READ: &str = "work_item:read";
pub const SCOPE_WORK_ITEM_WRITE: &str = "work_item:write";
pub const SCOPE_COMMENT_WRITE: &str = "comment:write";
pub const SCOPE_RESOURCE_READ: &str = "resource:read";
pub const SCOPE_RESOURCE_WRITE: &str = "resource:write";
pub const SCOPE_RESOURCE_UNLOCK: &str = "resource:unlock";
pub const SCOPE_NOTIFICATION_READ: &str = "notification:read";

const ALLOWED_SCOPES: &[&str] = &[
    SCOPE_PROJECT_READ,
    SCOPE_WORK_ITEM_READ,
    SCOPE_WORK_ITEM_WRITE,
    SCOPE_COMMENT_WRITE,
    SCOPE_RESOURCE_READ,
    SCOPE_RESOURCE_WRITE,
    SCOPE_RESOURCE_UNLOCK,
    SCOPE_NOTIFICATION_READ,
];

#[derive(Debug, Clone)]
pub struct ApiTokenSummary {
    pub id: i64,
    pub name: String,
    pub scopes: Vec<String>,
    pub project_scope: String,
    pub token_suffix: String,
    pub expires_at: String,
    pub revoked_at: String,
    pub last_used_at: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct CreatedApiToken {
    pub token: ApiTokenSummary,
    pub raw_token: String,
}

#[derive(Debug, Clone)]
pub struct ApiTokenPlaintextSummary {
    pub token: ApiTokenSummary,
    pub raw_token: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AuthenticatedApiToken {
    pub token_id: i64,
    pub token_name: String,
    pub user: AuthUser,
}

#[derive(Debug, Clone)]
pub struct CreateApiTokenInput {
    pub name: String,
    pub scopes: Vec<String>,
    pub project_scope: String,
    pub expires_at: String,
}

pub fn bearer_token(headers: &HeaderMap) -> Option<String> {
    let value = headers.get(header::AUTHORIZATION)?.to_str().ok()?.trim();
    let token = value
        .strip_prefix("Bearer ")
        .or_else(|| value.strip_prefix("bearer "))?;
    let token = token.trim();
    (!token.is_empty()).then(|| token.to_string())
}

pub async fn user_from_bearer_token(
    pool: &SqlitePool,
    raw_token: &str,
) -> AppResult<Option<AuthUser>> {
    Ok(authenticated_token_from_bearer_token(pool, raw_token)
        .await?
        .map(|token| token.user))
}

pub async fn authenticated_token_from_bearer_token(
    pool: &SqlitePool,
    raw_token: &str,
) -> AppResult<Option<AuthenticatedApiToken>> {
    if !raw_token.starts_with(TOKEN_PREFIX) {
        return Ok(None);
    }
    let token_hash = hash_token(raw_token);
    let row = sqlx::query_as::<_, (i64, String, i64, String, String, i64)>(
        r#"
        SELECT t.id, t.name, u.id, u.username, u.display_name, u.is_super_admin
        FROM api_tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = ?1
          AND t.revoked_at = ''
          AND (t.expires_at = '' OR t.expires_at > datetime('now'))
          AND u.status = 'active'
        "#,
    )
    .bind(token_hash)
    .fetch_optional(pool)
    .await?;

    let Some((token_id, token_name, id, username, display_name, is_super_admin)) = row else {
        return Ok(None);
    };

    sqlx::query(
        r#"
        UPDATE api_tokens
        SET last_used_at = datetime('now'),
            updated_at = datetime('now')
        WHERE token_hash = ?1
        "#,
    )
    .bind(hash_token(raw_token))
    .execute(pool)
    .await?;

    Ok(Some(AuthenticatedApiToken {
        token_id,
        token_name,
        user: AuthUser {
            id,
            username,
            display_name,
            is_super_admin: is_super_admin != 0,
        },
    }))
}

pub async fn create_token(
    pool: &SqlitePool,
    master_key: &str,
    user_id: i64,
    input: CreateApiTokenInput,
) -> AppResult<CreatedApiToken> {
    let name = validate_name(&input.name)?;
    let scopes = normalize_scopes(input.scopes)?;
    let scopes_json = serde_json::to_string(&scopes).unwrap_or_else(|_| "[]".to_string());
    let project_scope = normalize_project_scope(&input.project_scope)?;
    let expires_at = normalize_expires_at(&input.expires_at)?;
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
    let active_token_count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM api_tokens
        WHERE user_id = ?1
          AND revoked_at = ''
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    if active_token_count >= MAX_ACTIVE_TOKENS_PER_USER {
        return Err(AppError::BadRequest(format!(
            "每个用户最多可同时保留 {MAX_ACTIVE_TOKENS_PER_USER} 个访问 Token，请先删除不再使用的 Token"
        )));
    }

    let token_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO api_tokens (
            user_id,
            name,
            token_hash,
            token_suffix,
            token_ciphertext,
            scopes,
            project_scope,
            expires_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        RETURNING id
        "#,
    )
    .bind(user_id)
    .bind(name)
    .bind(token_hash)
    .bind(token_suffix)
    .bind(token_ciphertext)
    .bind(scopes_json)
    .bind(project_scope)
    .bind(expires_at)
    .fetch_one(pool)
    .await?;

    let token = get_token_for_user(pool, user_id, token_id).await?;
    Ok(CreatedApiToken { token, raw_token })
}

pub async fn list_tokens(pool: &SqlitePool, user_id: i64) -> AppResult<Vec<ApiTokenSummary>> {
    let rows = sqlx::query_as::<_, TokenRow>(
        r#"
        SELECT
            id,
            name,
            token_hash,
            scopes,
            project_scope,
            token_suffix,
            token_ciphertext,
            expires_at,
            revoked_at,
            last_used_at,
            created_at,
            updated_at
        FROM api_tokens
        WHERE user_id = ?1
        ORDER BY id DESC
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(token_from_row).collect())
}

pub async fn list_tokens_with_raw(
    pool: &SqlitePool,
    user_id: i64,
    master_key: &str,
) -> AppResult<Vec<ApiTokenPlaintextSummary>> {
    let rows = sqlx::query_as::<_, TokenRow>(
        r#"
        SELECT
            id,
            name,
            token_hash,
            scopes,
            project_scope,
            token_suffix,
            token_ciphertext,
            expires_at,
            revoked_at,
            last_used_at,
            created_at,
            updated_at
        FROM api_tokens
        WHERE user_id = ?1
        ORDER BY id DESC
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    rows.into_iter()
        .map(|row| {
            let raw_token = raw_token_from_row(&row, master_key)?;
            Ok(ApiTokenPlaintextSummary {
                token: token_from_row(row),
                raw_token,
            })
        })
        .collect()
}

pub async fn revoke_token(
    pool: &SqlitePool,
    user_id: i64,
    token_id: i64,
) -> AppResult<ApiTokenSummary> {
    let result = sqlx::query(
        r#"
        UPDATE api_tokens
        SET revoked_at = CASE WHEN revoked_at = '' THEN datetime('now') ELSE revoked_at END,
            updated_at = datetime('now')
        WHERE id = ?1
          AND user_id = ?2
        "#,
    )
    .bind(token_id)
    .bind(user_id)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("访问 Token 不存在".to_string()));
    }

    get_token_for_user(pool, user_id, token_id).await
}

pub async fn delete_token(
    pool: &SqlitePool,
    user_id: i64,
    token_id: i64,
) -> AppResult<ApiTokenSummary> {
    let token = get_token_for_user(pool, user_id, token_id).await?;
    sqlx::query(
        r#"
        DELETE FROM api_tokens
        WHERE id = ?1
          AND user_id = ?2
        "#,
    )
    .bind(token_id)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(token)
}

pub async fn token_has_scope_for_user(
    pool: &SqlitePool,
    raw_token: &str,
    user_id: i64,
    required_scope: &str,
) -> AppResult<bool> {
    let scopes = sqlx::query_scalar::<_, String>(
        r#"
        SELECT scopes
        FROM api_tokens
        WHERE token_hash = ?1
          AND user_id = ?2
          AND revoked_at = ''
          AND (expires_at = '' OR expires_at > datetime('now'))
        "#,
    )
    .bind(hash_token(raw_token))
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let Some(scopes) = scopes else {
        return Ok(false);
    };

    Ok(parse_scopes(&scopes)
        .iter()
        .any(|scope| scope == required_scope))
}

pub async fn token_allows_project(
    pool: &SqlitePool,
    raw_token: &str,
    user_id: i64,
    project_id: i64,
) -> AppResult<bool> {
    let project_scope = sqlx::query_scalar::<_, String>(
        r#"
        SELECT project_scope
        FROM api_tokens
        WHERE token_hash = ?1
          AND user_id = ?2
          AND revoked_at = ''
          AND (expires_at = '' OR expires_at > datetime('now'))
        "#,
    )
    .bind(hash_token(raw_token))
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let Some(project_scope) = project_scope else {
        return Ok(false);
    };
    if project_scope == "all" {
        return Ok(true);
    }

    let project_key = sqlx::query_scalar::<_, String>(
        r#"
        SELECT project_key
        FROM projects
        WHERE id = ?1
        "#,
    )
    .bind(project_id)
    .fetch_optional(pool)
    .await?;
    let Some(project_key) = project_key else {
        return Ok(false);
    };

    let allowed_project_keys = project_scope_keys(&project_scope);
    Ok(allowed_project_keys
        .iter()
        .any(|allowed_project_key| allowed_project_key.eq_ignore_ascii_case(&project_key)))
}

pub async fn token_project_scope_keys(
    pool: &SqlitePool,
    raw_token: &str,
    user_id: i64,
) -> AppResult<Option<Vec<String>>> {
    let project_scope = sqlx::query_scalar::<_, String>(
        r#"
        SELECT project_scope
        FROM api_tokens
        WHERE token_hash = ?1
          AND user_id = ?2
          AND revoked_at = ''
          AND (expires_at = '' OR expires_at > datetime('now'))
        "#,
    )
    .bind(hash_token(raw_token))
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let Some(project_scope) = project_scope else {
        return Ok(Some(Vec::new()));
    };
    if project_scope.trim().eq_ignore_ascii_case("all") {
        return Ok(None);
    }

    Ok(Some(project_scope_keys(&project_scope)))
}

async fn get_token_for_user(
    pool: &SqlitePool,
    user_id: i64,
    token_id: i64,
) -> AppResult<ApiTokenSummary> {
    let row = sqlx::query_as::<_, TokenRow>(
        r#"
        SELECT
            id,
            name,
            token_hash,
            scopes,
            project_scope,
            token_suffix,
            token_ciphertext,
            expires_at,
            revoked_at,
            last_used_at,
            created_at,
            updated_at
        FROM api_tokens
        WHERE id = ?1
          AND user_id = ?2
        "#,
    )
    .bind(token_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("访问 Token 不存在".to_string()))?;

    Ok(token_from_row(row))
}

#[derive(sqlx::FromRow)]
struct TokenRow {
    id: i64,
    name: String,
    token_hash: String,
    scopes: String,
    project_scope: String,
    token_suffix: String,
    token_ciphertext: String,
    expires_at: String,
    revoked_at: String,
    last_used_at: String,
    created_at: String,
    updated_at: String,
}

fn token_from_row(row: TokenRow) -> ApiTokenSummary {
    ApiTokenSummary {
        id: row.id,
        name: row.name,
        scopes: parse_scopes(&row.scopes),
        project_scope: row.project_scope,
        token_suffix: row.token_suffix,
        expires_at: row.expires_at,
        revoked_at: row.revoked_at,
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
    format!("api-token:{token_hash}")
}

fn validate_name(name: &str) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() || name.len() > 80 {
        return Err(AppError::BadRequest(
            "访问 Token 名称不能为空且不能超过 80 个字符".to_string(),
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
                "不支持的访问 Token scope：{scope}"
            )));
        }
        if !normalized.iter().any(|existing| existing == scope) {
            normalized.push(scope.to_string());
        }
    }

    if normalized.is_empty() {
        return Err(AppError::BadRequest(
            "访问 Token 至少需要选择一个 scope".to_string(),
        ));
    }

    Ok(normalized)
}

fn normalize_project_scope(project_scope: &str) -> AppResult<String> {
    let project_scope = project_scope.trim();
    if project_scope.is_empty() || project_scope.eq_ignore_ascii_case("all") {
        return Ok("all".to_string());
    }
    if project_scope.len() > 128 {
        return Err(AppError::BadRequest(
            "项目范围不能超过 128 个字符".to_string(),
        ));
    }
    Ok(project_scope.to_ascii_uppercase())
}

fn project_scope_keys(project_scope: &str) -> Vec<String> {
    project_scope
        .split(',')
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .map(str::to_ascii_uppercase)
        .collect()
}

fn normalize_expires_at(expires_at: &str) -> AppResult<String> {
    let expires_at = expires_at.trim();
    if expires_at.is_empty() {
        return Ok(String::new());
    }
    if expires_at.len() > 32
        || !expires_at
            .chars()
            .all(|c| c.is_ascii_digit() || matches!(c, '-' | ':' | 'T' | 'Z' | ' '))
    {
        return Err(AppError::BadRequest(
            "过期时间格式无效，请使用日期或 ISO 时间".to_string(),
        ));
    }
    Ok(expires_at
        .replace('T', " ")
        .trim_end_matches('Z')
        .to_string())
}

fn parse_scopes(scopes: &str) -> Vec<String> {
    match serde_json::from_str::<Value>(scopes) {
        Ok(Value::Array(values)) => values
            .into_iter()
            .filter_map(|value| value.as_str().map(ToOwned::to_owned))
            .collect(),
        _ => Vec::new(),
    }
}
