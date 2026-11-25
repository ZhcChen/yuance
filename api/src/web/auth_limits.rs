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

/// 登录前检查：同一用户名或同一来源 IP 失败过多时拒绝（不执行密码校验）。
pub fn ensure_login_allowed(
    state: &AppState,
    headers: &HeaderMap,
    username: &str,
) -> AppResult<()> {
    let limits = &state.auth_limits;
    limits
        .login_by_username
        .check(&username_key(username))
        .map_err(|wait| limited(wait, "登录"))?;
    let ip = client_ip(headers);
    if !ip.is_empty() {
        limits
            .login_by_ip
            .check(&ip)
            .map_err(|wait| limited(wait, "登录"))?;
    }
    Ok(())
}

/// 记录登录结果：凭据错误计入失败；成功清除该用户名的失败计数。
pub fn record_login_result<T>(
    state: &AppState,
    headers: &HeaderMap,
    username: &str,
    result: &AppResult<T>,
) {
    let limits = &state.auth_limits;
    match result {
        Ok(_) => limits.login_by_username.reset(&username_key(username)),
        Err(AppError::Unauthorized) => {
            limits
                .login_by_username
                .record_failure(&username_key(username));
            let ip = client_ip(headers);
            if !ip.is_empty() {
                limits.login_by_ip.record_failure(&ip);
            }
        }
        Err(_) => {}
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
        .check(&resource_key(user_id, resource_id))
        .map_err(|wait| limited(wait, "访问密码验证"))
}

pub fn record_resource_unlock_result(
    state: &AppState,
    user_id: i64,
    resource_id: i64,
    verified: bool,
) {
    let key = resource_key(user_id, resource_id);
    if verified {
        state.auth_limits.resource_unlock.reset(&key);
    } else {
        state.auth_limits.resource_unlock.record_failure(&key);
    }
}
