use axum::http::{HeaderMap, header};
use rand_core::{OsRng, RngCore};

use crate::platform::error::{AppError, AppResult};

pub const CSRF_COOKIE_NAME: &str = "yuance_csrf";
pub const CSRF_FIELD_NAME: &str = "_csrf";
pub const CSRF_HEADER_NAME: &str = "x-yuance-csrf-token";

pub fn generate_token() -> String {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

pub fn ensure_token(headers: &HeaderMap) -> String {
    token_from_headers(headers).unwrap_or_else(generate_token)
}

pub fn verify(headers: &HeaderMap, submitted_token: &str) -> AppResult<()> {
    let Some(cookie_token) = token_from_headers(headers) else {
        return Err(AppError::Forbidden("CSRF token 缺失或已失效".to_string()));
    };
    let submitted_token = submitted_token.trim();
    let header_token = headers
        .get(CSRF_HEADER_NAME)
        .and_then(|value| value.to_str().ok())
        .map(str::trim);
    let submitted_token = if submitted_token.is_empty() {
        header_token.unwrap_or("")
    } else {
        submitted_token
    };

    if !is_valid_token(submitted_token)
        || !constant_time_eq(cookie_token.as_bytes(), submitted_token.as_bytes())
    {
        return Err(AppError::Forbidden("CSRF token 校验失败".to_string()));
    }

    Ok(())
}

pub fn token_from_headers(headers: &HeaderMap) -> Option<String> {
    let cookie = headers.get(header::COOKIE)?.to_str().ok()?;
    cookie.split(';').find_map(|part| {
        let (name, value) = part.trim().split_once('=')?;
        if name == CSRF_COOKIE_NAME && is_valid_token(value) {
            Some(value.to_string())
        } else {
            None
        }
    })
}

pub fn cookie_header(token: &str, secure: bool) -> String {
    let secure = if secure { "; Secure" } else { "" };
    format!("{CSRF_COOKIE_NAME}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200{secure}")
}

pub fn expired_cookie_header(secure: bool) -> String {
    let secure = if secure { "; Secure" } else { "" };
    format!("{CSRF_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{secure}")
}

fn is_valid_token(token: &str) -> bool {
    token.len() == 64 && token.chars().all(|c| c.is_ascii_hexdigit())
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }

    left.iter()
        .zip(right.iter())
        .fold(0_u8, |diff, (left, right)| diff | (left ^ right))
        == 0
}
