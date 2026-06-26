use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier, password_hash::SaltString};
use axum::http::{HeaderMap, header};
use rand_core::OsRng;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::platform::error::{AppError, AppResult};

pub const SESSION_COOKIE_NAME: &str = "yuance_session";

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub is_super_admin: bool,
}

#[derive(Debug, Clone)]
pub struct IssuedSession {
    pub raw_token: String,
}

pub fn hash_password(password: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Ok(Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|error| AppError::PasswordHash(error.to_string()))?
        .to_string())
}

pub fn verify_password(password: &str, password_hash: &str) -> AppResult<bool> {
    let parsed = PasswordHash::new(password_hash)
        .map_err(|error| AppError::PasswordHash(error.to_string()))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

pub fn validate_username(username: &str) -> AppResult<String> {
    let username = username.trim();
    if username.len() < 3 || username.len() > 64 {
        return Err(AppError::BadRequest(
            "用户名长度必须为 3-64 个字符".to_string(),
        ));
    }
    if !username
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
    {
        return Err(AppError::BadRequest(
            "用户名只能包含字母、数字、下划线、中划线和点".to_string(),
        ));
    }
    Ok(username.to_string())
}

pub fn validate_display_name(display_name: &str) -> AppResult<String> {
    let display_name = display_name.trim();
    if display_name.is_empty() || display_name.len() > 64 {
        return Err(AppError::BadRequest(
            "显示名称不能为空且不能超过 64 个字符".to_string(),
        ));
    }
    Ok(display_name.to_string())
}

pub fn validate_password(password: &str) -> AppResult<()> {
    if password.len() < 10 || password.len() > 128 {
        return Err(AppError::BadRequest(
            "密码长度必须为 10-128 个字符".to_string(),
        ));
    }
    Ok(())
}

pub async fn login(pool: &SqlitePool, username: &str, password: &str) -> AppResult<IssuedSession> {
    let username = validate_username(username)?;

    let row = sqlx::query_as::<_, (i64, String, String)>(
        r#"
        SELECT id, password_hash, status
        FROM users
        WHERE username = ?1
        "#,
    )
    .bind(username)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::Unauthorized)?;

    if row.2 != "active" || !verify_password(password, &row.1)? {
        return Err(AppError::Unauthorized);
    }

    issue_session(pool, row.0, 12 * 60 * 60).await
}

pub async fn issue_session(
    pool: &SqlitePool,
    user_id: i64,
    ttl_seconds: i64,
) -> AppResult<IssuedSession> {
    let raw_token = Uuid::new_v4().to_string();
    let token_hash = hash_session_token(&raw_token);

    sqlx::query(
        r#"
        INSERT INTO sessions (
            session_token_hash,
            user_id,
            session_status,
            expires_at
        )
        VALUES (
            ?1,
            ?2,
            'active',
            datetime('now', '+' || ?3 || ' seconds')
        )
        "#,
    )
    .bind(token_hash)
    .bind(user_id)
    .bind(ttl_seconds)
    .execute(pool)
    .await?;

    Ok(IssuedSession { raw_token })
}

pub async fn revoke_session(pool: &SqlitePool, raw_token: &str, reason: &str) -> AppResult<()> {
    let token_hash = hash_session_token(raw_token);
    sqlx::query(
        r#"
        UPDATE sessions
        SET session_status = 'revoked',
            revoked_at = datetime('now'),
            revoke_reason = ?2,
            updated_at = datetime('now')
        WHERE session_token_hash = ?1
          AND session_status = 'active'
        "#,
    )
    .bind(token_hash)
    .bind(reason.trim())
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn user_from_headers(
    pool: &SqlitePool,
    headers: &HeaderMap,
) -> AppResult<Option<AuthUser>> {
    let Some(raw_token) = session_cookie(headers) else {
        return Ok(None);
    };
    let token_hash = hash_session_token(&raw_token);
    user_from_token_hash(pool, &token_hash).await
}

pub async fn user_from_raw_session(
    pool: &SqlitePool,
    raw_token: &str,
) -> AppResult<Option<AuthUser>> {
    let token_hash = hash_session_token(raw_token);
    user_from_token_hash(pool, &token_hash).await
}

async fn user_from_token_hash(pool: &SqlitePool, token_hash: &str) -> AppResult<Option<AuthUser>> {
    let row = sqlx::query_as::<_, (i64, String, String, i64)>(
        r#"
        SELECT u.id, u.username, u.display_name, u.is_super_admin
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.session_token_hash = ?1
          AND s.session_status = 'active'
          AND s.expires_at > datetime('now')
          AND u.status = 'active'
        "#,
    )
    .bind(token_hash)
    .fetch_optional(pool)
    .await?;

    Ok(
        row.map(|(id, username, display_name, is_super_admin)| AuthUser {
            id,
            username,
            display_name,
            is_super_admin: is_super_admin != 0,
        }),
    )
}

pub fn session_cookie_header(raw_token: &str, secure: bool) -> String {
    let secure = if secure { "; Secure" } else { "" };
    format!(
        "{SESSION_COOKIE_NAME}={raw_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200{secure}"
    )
}

pub fn clear_session_cookie_header(secure: bool) -> String {
    let secure = if secure { "; Secure" } else { "" };
    format!("{SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{secure}")
}

pub fn session_cookie(headers: &HeaderMap) -> Option<String> {
    let cookie = headers.get(header::COOKIE)?.to_str().ok()?;
    cookie.split(';').find_map(|part| {
        let (name, value) = part.trim().split_once('=')?;
        (name == SESSION_COOKIE_NAME).then(|| value.to_string())
    })
}

fn hash_session_token(raw_token: &str) -> String {
    let digest = Sha256::digest(raw_token.as_bytes());
    hex::encode(digest)
}
