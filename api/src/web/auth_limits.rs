//! 登录与资料解锁的失败限流接入：键的组成、检查与结果记录。

use axum::http::HeaderMap;

use crate::{
    platform::{
        error::{AppError, AppResult},
        rate_limit::retry_after_minutes,
    },
    web::{audit_context, router::AppState},
};

fn username_key(username: &str) -> String {
    username.trim().to_ascii_lowercase()
}

fn client_ip(headers: &HeaderMap) -> String {
    audit_context::from_headers(headers).ip
}

fn limited(wait: std::time::Duration, subject: &str) -> AppError {
    AppError::TooManyRequests(format!(
        "{subject}失败次数过多，请 {} 分钟后再试",
        retry_after_minutes(wait)
    ))
}

/// 登录前登记一次尝试：同一用户名或同一来源 IP 失败过多时拒绝（不执行密码校验）。
/// 校验前就计数，并发请求无法同时绕过上限；结果由 `record_login_result` 修正。
pub fn ensure_login_allowed(
    state: &AppState,
    headers: &HeaderMap,
    username: &str,
) -> AppResult<()> {
    let limits = &state.auth_limits;
    let user_key = username_key(username);
    limits
        .login_by_username
        .begin_attempt(&user_key)
        .map_err(|wait| limited(wait, "登录"))?;
    let ip = client_ip(headers);
    if !ip.is_empty()
        && let Err(wait) = limits.login_by_ip.begin_attempt(&ip)
    {
        limits.login_by_username.undo_attempt(&user_key);
        return Err(limited(wait, "登录"));
    }
    Ok(())
}

/// 修正登录前登记的尝试：成功时清零该用户名并撤销 IP 计数；凭据错误保留计数；
/// 其他错误（限流、内部错误）不算一次猜测，撤销登记。
pub fn record_login_result<T>(
    state: &AppState,
    headers: &HeaderMap,
    username: &str,
    result: &AppResult<T>,
) {
    let limits = &state.auth_limits;
    let user_key = username_key(username);
    let ip = client_ip(headers);
    match result {
        Ok(_) => {
            limits.login_by_username.reset(&user_key);
            if !ip.is_empty() {
                limits.login_by_ip.undo_attempt(&ip);
            }
        }
        Err(AppError::Unauthorized) => {}
        Err(AppError::TooManyRequests(_)) => {}
        Err(_) => {
            limits.login_by_username.undo_attempt(&user_key);
            if !ip.is_empty() {
                limits.login_by_ip.undo_attempt(&ip);
            }
        }
    }
}

fn resource_key(user_id: i64, resource_id: i64) -> String {
    format!("{user_id}:{resource_id}")
}

pub fn ensure_resource_unlock_allowed(
    state: &AppState,
    user_id: i64,
    resource_id: i64,
) -> AppResult<()> {
    state
        .auth_limits
        .resource_unlock
        .begin_attempt(&resource_key(user_id, resource_id))
        .map_err(|wait| limited(wait, "访问密码验证"))
}

pub fn record_resource_unlock_result(
    state: &AppState,
    user_id: i64,
    resource_id: i64,
    verified: bool,
) {
    let key = resource_key(user_id, resource_id);
    // 校验前已登记一次尝试：失败时保留计数，成功时清零。
    if verified {
        state.auth_limits.resource_unlock.reset(&key);
    }
}
