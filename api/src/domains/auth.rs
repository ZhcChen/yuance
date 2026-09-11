use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier, password_hash::SaltString};
use axum::http::{HeaderMap, header};
use rand_core::OsRng;
use sha2::{Digest, Sha256};
use sqlx::{Sqlite, SqlitePool, Transaction};
use uuid::Uuid;

use crate::platform::{
    crypto,
    error::{AppError, AppResult},
};

pub const SESSION_COOKIE_NAME: &str = "yuance_session";
pub const REFRESH_SESSION_COOKIE_NAME: &str = "yuance_refresh";
pub const DEFAULT_SESSION_TTL_SECONDS: i64 = 2 * 60 * 60;
pub const DEFAULT_REFRESH_SESSION_TTL_SECONDS: i64 = 30 * 24 * 60 * 60;

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
    pub refresh_token: String,
}

#[derive(Debug, sqlx::FromRow)]
struct RefreshSessionRecord {
    id: i64,
    user_id: i64,
    session_status: String,
    revoke_reason: String,
    rotated_session_token_ciphertext: Option<String>,
    rotated_refresh_token_ciphertext: Option<String>,
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
    login_with_ttls(
        pool,
        username,
        password,
        DEFAULT_SESSION_TTL_SECONDS,
        DEFAULT_REFRESH_SESSION_TTL_SECONDS,
    )
    .await
}

pub async fn login_with_ttl(
    pool: &SqlitePool,
    username: &str,
    password: &str,
    ttl_seconds: i64,
) -> AppResult<IssuedSession> {
    login_with_ttls(
        pool,
        username,
        password,
        ttl_seconds,
        DEFAULT_REFRESH_SESSION_TTL_SECONDS,
    )
    .await
}

pub async fn login_with_ttls(
    pool: &SqlitePool,
    username: &str,
    password: &str,
    ttl_seconds: i64,
    refresh_ttl_seconds: i64,
) -> AppResult<IssuedSession> {
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

    issue_session_with_ttls(pool, row.0, ttl_seconds, refresh_ttl_seconds).await
}

pub async fn issue_session(
    pool: &SqlitePool,
    user_id: i64,
    ttl_seconds: i64,
) -> AppResult<IssuedSession> {
    issue_session_with_ttls(
        pool,
        user_id,
        ttl_seconds,
        DEFAULT_REFRESH_SESSION_TTL_SECONDS,
    )
    .await
}

pub async fn issue_session_with_ttls(
    pool: &SqlitePool,
    user_id: i64,
    ttl_seconds: i64,
    refresh_ttl_seconds: i64,
) -> AppResult<IssuedSession> {
    let raw_token = Uuid::new_v4().to_string();
    let refresh_token = Uuid::new_v4().to_string();
    let token_hash = hash_session_token(&raw_token);
    let refresh_token_hash = hash_refresh_token(&refresh_token);
    let mut tx = pool.begin().await?;

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
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO refresh_sessions (
            refresh_token_hash,
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
    .bind(refresh_token_hash)
    .bind(user_id)
    .bind(refresh_ttl_seconds)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(IssuedSession {
        raw_token,
        refresh_token,
    })
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

pub async fn revoke_refresh_session(
    pool: &SqlitePool,
    raw_token: &str,
    reason: &str,
) -> AppResult<()> {
    let token_hash = hash_refresh_token(raw_token);
    let mut tx = pool.begin().await?;
    let Some(user_id) = sqlx::query_scalar::<_, i64>(
        "SELECT user_id FROM refresh_sessions WHERE refresh_token_hash = ?1",
    )
    .bind(&token_hash)
    .fetch_optional(&mut *tx)
    .await?
    else {
        tx.commit().await?;
        return Ok(());
    };

    sqlx::query(
        r#"
        UPDATE refresh_sessions
        SET session_status = 'revoked',
            revoked_at = datetime('now'),
            revoke_reason = ?2,
            updated_at = datetime('now')
        WHERE refresh_token_hash = ?1
          AND session_status = 'active'
        "#,
    )
    .bind(&token_hash)
    .bind(reason.trim())
    .execute(&mut *tx)
    .await?;

    clear_browser_refresh_rotation_recovery(&mut tx, user_id).await?;
    tx.commit().await?;

    Ok(())
}

pub(crate) async fn clear_browser_refresh_rotation_recovery(
    tx: &mut Transaction<'_, Sqlite>,
    user_id: i64,
) -> AppResult<()> {
    sqlx::query(
        r#"
        UPDATE refresh_sessions
        SET rotated_session_token_ciphertext = NULL,
            rotated_refresh_token_ciphertext = NULL,
            rotation_recovery_expires_at = NULL,
            updated_at = datetime('now')
        WHERE user_id = ?1
          AND rotation_recovery_expires_at IS NOT NULL
        "#,
    )
    .bind(user_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn touch_session(pool: &SqlitePool, raw_token: &str) -> AppResult<bool> {
    let rows = sqlx::query(
        r#"
        UPDATE sessions
        SET last_seen_at = datetime('now'),
            updated_at = datetime('now')
        WHERE session_token_hash = ?1
          AND session_status = 'active'
          AND expires_at > datetime('now')
        "#,
    )
    .bind(hash_session_token(raw_token))
    .execute(pool)
    .await?
    .rows_affected();

    Ok(rows > 0)
}

pub async fn touch_refresh_session(
    pool: &SqlitePool,
    raw_token: &str,
    ttl_seconds: i64,
) -> AppResult<bool> {
    let rows = sqlx::query(
        r#"
        UPDATE refresh_sessions
        SET last_seen_at = datetime('now'),
            expires_at = datetime('now', '+' || ?2 || ' seconds'),
            updated_at = datetime('now')
        WHERE refresh_token_hash = ?1
          AND session_status = 'active'
          AND expires_at > datetime('now')
          AND user_id IN (SELECT id FROM users WHERE status = 'active')
        "#,
    )
    .bind(hash_refresh_token(raw_token))
    .bind(ttl_seconds)
    .execute(pool)
    .await?
    .rows_affected();

    Ok(rows > 0)
}

pub async fn refresh_session(
    pool: &SqlitePool,
    raw_refresh_token: &str,
    access_ttl_seconds: i64,
    refresh_ttl_seconds: i64,
    rotation_recovery_ttl_seconds: i64,
    security_master_key: &str,
) -> AppResult<Option<IssuedSession>> {
    let refresh_token_hash = hash_refresh_token(raw_refresh_token);
    let Some(row) = find_refresh_session(pool, &refresh_token_hash).await? else {
        return Ok(None);
    };

    if row.session_status == "revoked" {
        return recover_rotated_session(&row, &refresh_token_hash, security_master_key);
    }

    let raw_token = Uuid::new_v4().to_string();
    let next_refresh_token = Uuid::new_v4().to_string();
    let token_hash = hash_session_token(&raw_token);
    let next_refresh_token_hash = hash_refresh_token(&next_refresh_token);
    let aad = rotation_recovery_aad(row.id, &refresh_token_hash);
    let rotated_session_token_ciphertext =
        crypto::encrypt_secret(security_master_key, &raw_token, aad.as_bytes())?;
    let rotated_refresh_token_ciphertext =
        crypto::encrypt_secret(security_master_key, &next_refresh_token, aad.as_bytes())?;
    let mut tx = pool.begin().await?;
    let revoked = sqlx::query(
        r#"
        UPDATE refresh_sessions
        SET session_status = 'revoked',
            revoked_at = datetime('now'),
            revoke_reason = 'rotated',
            rotated_session_token_ciphertext = ?2,
            rotated_refresh_token_ciphertext = ?3,
            rotation_recovery_expires_at = datetime('now', '+' || ?4 || ' seconds'),
            updated_at = datetime('now')
        WHERE id = ?1
          AND session_status = 'active'
        "#,
    )
    .bind(row.id)
    .bind(&rotated_session_token_ciphertext)
    .bind(&rotated_refresh_token_ciphertext)
    .bind(rotation_recovery_ttl_seconds)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if revoked == 0 {
        tx.rollback().await?;
        let Some(rotated_row) = find_refresh_session(pool, &refresh_token_hash).await? else {
            return Ok(None);
        };
        return recover_rotated_session(&rotated_row, &refresh_token_hash, security_master_key);
    }

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
    .bind(row.user_id)
    .bind(access_ttl_seconds)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO refresh_sessions (
            refresh_token_hash,
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
    .bind(next_refresh_token_hash)
    .bind(row.user_id)
    .bind(refresh_ttl_seconds)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Some(IssuedSession {
        raw_token,
        refresh_token: next_refresh_token,
    }))
}

async fn find_refresh_session(
    pool: &SqlitePool,
    refresh_token_hash: &str,
) -> AppResult<Option<RefreshSessionRecord>> {
    Ok(sqlx::query_as::<_, RefreshSessionRecord>(
        r#"
        SELECT r.id,
               r.user_id,
               r.session_status,
               r.revoke_reason,
               r.rotated_session_token_ciphertext,
               r.rotated_refresh_token_ciphertext
        FROM refresh_sessions r
        JOIN users u ON u.id = r.user_id
        WHERE r.refresh_token_hash = ?1
          AND u.status = 'active'
          AND (
              (r.session_status = 'active' AND r.expires_at > datetime('now'))
              OR (
                  r.session_status = 'revoked'
                  AND r.revoke_reason = 'rotated'
                  AND r.rotation_recovery_expires_at > datetime('now')
              )
          )
        "#,
    )
    .bind(refresh_token_hash)
    .fetch_optional(pool)
    .await?)
}

fn recover_rotated_session(
    row: &RefreshSessionRecord,
    refresh_token_hash: &str,
    security_master_key: &str,
) -> AppResult<Option<IssuedSession>> {
    if row.session_status != "revoked" || row.revoke_reason != "rotated" {
        return Ok(None);
    }
    let (Some(session_ciphertext), Some(refresh_ciphertext)) = (
        row.rotated_session_token_ciphertext.as_deref(),
        row.rotated_refresh_token_ciphertext.as_deref(),
    ) else {
        return Ok(None);
    };
    let aad = rotation_recovery_aad(row.id, refresh_token_hash);
    let raw_token =
        crypto::decrypt_secret(security_master_key, session_ciphertext, aad.as_bytes())?;
    let refresh_token =
        crypto::decrypt_secret(security_master_key, refresh_ciphertext, aad.as_bytes())?;
    Ok(Some(IssuedSession {
        raw_token,
        refresh_token,
    }))
}

fn rotation_recovery_aad(refresh_session_id: i64, refresh_token_hash: &str) -> String {
    format!("yuance:browser-refresh-rotation:{refresh_session_id}:{refresh_token_hash}")
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
    session_cookie_header_with_max_age(raw_token, DEFAULT_SESSION_TTL_SECONDS, secure)
}

pub fn session_cookie_header_with_max_age(
    raw_token: &str,
    max_age_seconds: i64,
    secure: bool,
) -> String {
    let secure = if secure { "; Secure" } else { "" };
    format!(
        "{SESSION_COOKIE_NAME}={raw_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age_seconds}{secure}"
    )
}

pub fn clear_session_cookie_header(secure: bool) -> String {
    let secure = if secure { "; Secure" } else { "" };
    format!("{SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{secure}")
}

pub fn refresh_cookie_header(raw_token: &str, secure: bool) -> String {
    refresh_cookie_header_with_max_age(raw_token, DEFAULT_REFRESH_SESSION_TTL_SECONDS, secure)
}

pub fn refresh_cookie_header_with_max_age(
    raw_token: &str,
    max_age_seconds: i64,
    secure: bool,
) -> String {
    let secure = if secure { "; Secure" } else { "" };
    format!(
        "{REFRESH_SESSION_COOKIE_NAME}={raw_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age_seconds}{secure}"
    )
}

pub fn clear_refresh_cookie_header(secure: bool) -> String {
    let secure = if secure { "; Secure" } else { "" };
    format!("{REFRESH_SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{secure}")
}

pub fn session_cookie(headers: &HeaderMap) -> Option<String> {
    cookie_value(headers, SESSION_COOKIE_NAME)
}

pub fn refresh_cookie(headers: &HeaderMap) -> Option<String> {
    cookie_value(headers, REFRESH_SESSION_COOKIE_NAME)
}

fn cookie_value(headers: &HeaderMap, cookie_name: &str) -> Option<String> {
    let cookie = headers.get(header::COOKIE)?.to_str().ok()?;
    cookie.split(';').find_map(|part| {
        let (name, value) = part.trim().split_once('=')?;
        (name == cookie_name).then(|| value.to_string())
    })
}

pub(crate) fn hash_session_token(raw_token: &str) -> String {
    let digest = Sha256::digest(raw_token.as_bytes());
    hex::encode(digest)
}

pub(crate) fn hash_refresh_token(raw_token: &str) -> String {
    let digest = Sha256::digest(raw_token.as_bytes());
    hex::encode(digest)
}
