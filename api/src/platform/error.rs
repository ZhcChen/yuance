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
        let (status, code) = match &self {
            AppError::BadRequest(_) => (StatusCode::BAD_REQUEST, "bad_request"),
            AppError::Conflict(_) => (StatusCode::CONFLICT, "conflict"),
            AppError::Forbidden(_) => (StatusCode::FORBIDDEN, "forbidden"),
            AppError::InvalidEnvironment(_) => (StatusCode::FORBIDDEN, "invalid_environment"),
            AppError::NotFound(_) => (StatusCode::NOT_FOUND, "not_found"),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            AppError::Config(_) | AppError::AddrParse(_) | AppError::Header(_) => {
                (StatusCode::BAD_REQUEST, "config")
            }
            AppError::Crypto(_) => (StatusCode::INTERNAL_SERVER_ERROR, "crypto"),
            AppError::Database(_)
            | AppError::Io(_)
            | AppError::Migration(_)
            | AppError::MigrationState(_)
            | AppError::PasswordHash(_)
            | AppError::Template(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal"),
        };

        let body = ErrorEnvelope {
            error: ErrorBody {
                code,
                message: self.to_string(),
            },
        };

        (status, Json(body)).into_response()
    }
}
