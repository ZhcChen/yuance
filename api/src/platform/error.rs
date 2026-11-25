use std::net::AddrParseError;

use axum::{
    Json,
    http::{StatusCode, header::InvalidHeaderValue},
    response::{IntoResponse, Response},
};
use serde::Serialize;
use thiserror::Error;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("请求体过大：{0}")]
    PayloadTooLarge(String),
    #[error(transparent)]
    JsonRejection(#[from] axum::extract::rejection::JsonRejection),
    #[error("请求参数错误：{0}")]
    BadRequest(String),
    #[error("配置错误：{0}")]
    Config(String),
    #[error("敏感配置处理失败：{0}")]
    Crypto(String),
    #[error("数据冲突：{0}")]
    Conflict(String),
    #[error("数据库错误：{0}")]
    Database(#[from] sqlx::Error),
    #[error("无权限访问：{0}")]
    Forbidden(String),
    #[error("当前环境不允许该操作：{0}")]
    InvalidEnvironment(String),
    #[error("资源不存在：{0}")]
    NotFound(String),
    #[error("未登录或登录已失效")]
    Unauthorized,
    #[error("{0}")]
    TooManyRequests(String),
    #[error(transparent)]
    AddrParse(#[from] AddrParseError),
    #[error(transparent)]
    Header(#[from] InvalidHeaderValue),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("迁移执行失败：{0}")]
    Migration(sqlx::migrate::MigrateError),
    #[error("迁移状态异常：{0}")]
    MigrationState(String),
    #[error("密码处理失败：{0}")]
    PasswordHash(String),
    #[error(transparent)]
    Template(#[from] askama::Error),
}

#[derive(Debug, Serialize)]
struct ErrorEnvelope<'a> {
    error: ErrorBody<'a>,
}

#[derive(Debug, Serialize)]
struct ErrorBody<'a> {
    code: &'a str,
    message: String,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        if let Self::JsonRejection(rejection) = self {
            return rejection.into_response();
        }
        let (status, code) = match &self {
            AppError::PayloadTooLarge(_) => (StatusCode::PAYLOAD_TOO_LARGE, "payload_too_large"),
            AppError::JsonRejection(_) => unreachable!(),
            AppError::BadRequest(_) => (StatusCode::BAD_REQUEST, "bad_request"),
            AppError::Conflict(_) => (StatusCode::CONFLICT, "conflict"),
            AppError::Forbidden(_) => (StatusCode::FORBIDDEN, "forbidden"),
            AppError::InvalidEnvironment(_) => (StatusCode::FORBIDDEN, "invalid_environment"),
            AppError::NotFound(_) => (StatusCode::NOT_FOUND, "not_found"),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            AppError::TooManyRequests(_) => (StatusCode::TOO_MANY_REQUESTS, "too_many_requests"),
            AppError::Config(_) | AppError::AddrParse(_) | AppError::Header(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "internal")
            }
            AppError::Crypto(_) => (StatusCode::INTERNAL_SERVER_ERROR, "crypto"),
            AppError::Database(_)
            | AppError::Io(_)
            | AppError::Migration(_)
            | AppError::MigrationState(_)
            | AppError::PasswordHash(_)
            | AppError::Template(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal"),
        };

        // 5xx 不向客户端暴露内部错误原文（表名、约束、路径、锁状态等），完整错误写入日志，
        // 由请求 span 中的 request_id 关联；客户端可凭响应头 x-request-id 反馈。
        let message = if status.is_server_error() {
            tracing::error!(error = %self, code, "request failed");
            "服务暂时无法完成请求，请稍后重试。".to_string()
        } else {
            self.to_string()
        };
        let body = ErrorEnvelope {
            error: ErrorBody { code, message },
        };

        (status, Json(body)).into_response()
    }
}
