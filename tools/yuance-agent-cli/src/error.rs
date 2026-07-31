use std::error::Error as StdError;

use thiserror::Error;

use crate::models::{ErrorBody, ErrorEnvelope};

#[derive(Debug, Error)]
pub enum AgentError {
    #[error("{message}")]
    Config { code: &'static str, message: String },
    #[error("元策 API 返回 HTTP {status}: {message}")]
    Http {
        status: u16,
        code: String,
        message: String,
    },
    #[error("请求元策服务超时")]
    Timeout,
    #[error("无法解析元策服务域名")]
    Dns,
    #[error("元策服务 TLS 连接失败")]
    Tls,
    #[error("无法连接元策服务")]
    Connect,
    #[error("{message}")]
    Response { code: &'static str, message: String },
    #[error("内部错误: {0}")]
    Internal(String),
}

impl AgentError {
    pub fn from_reqwest(error: reqwest::Error) -> Self {
        if error.is_timeout() {
            return Self::Timeout;
        }

        let causes = error_chain(&error).to_ascii_lowercase();
        if causes.contains("dns")
            || causes.contains("failed to lookup")
            || causes.contains("name resolution")
        {
            return Self::Dns;
        }
        if causes.contains("tls") || causes.contains("ssl") || causes.contains("certificate") {
            return Self::Tls;
        }
        if error.is_connect() {
            return Self::Connect;
        }
        if error.is_decode() {
            return Self::Response {
                code: "invalid_response",
                message: "元策 API 响应无法解析".to_string(),
            };
        }

        Self::Internal("HTTP client request failed".to_string())
    }

    pub fn exit_code(&self) -> i32 {
        match self {
            Self::Config { .. } => 2,
            Self::Http { status: 401, .. } => 10,
            Self::Http { status: 403, .. } => 11,
            Self::Http { status: 404, .. } => 12,
            Self::Http { .. } => 13,
            Self::Timeout => 20,
            Self::Dns => 21,
            Self::Tls => 22,
            Self::Connect => 23,
            Self::Response { .. } => 24,
            Self::Internal(_) => 1,
        }
    }

    pub fn envelope(&self) -> ErrorEnvelope<'_> {
        match self {
            Self::Config { code, message } => error_envelope("config", None, code, message),
            Self::Http {
                status,
                code,
                message,
            } => error_envelope("http", Some(*status), code, message),
            Self::Timeout => error_envelope("timeout", None, "request_timeout", "请求元策服务超时"),
            Self::Dns => error_envelope("dns", None, "dns_failed", "无法解析元策服务域名"),
            Self::Tls => error_envelope("tls", None, "tls_failed", "元策服务 TLS 连接失败"),
            Self::Connect => error_envelope("connect", None, "connect_failed", "无法连接元策服务"),
            Self::Response { code, message } => error_envelope("response", None, code, message),
            Self::Internal(message) => error_envelope("internal", None, "internal", message),
        }
    }
}

fn error_envelope<'a>(
    kind: &'a str,
    status: Option<u16>,
    code: &'a str,
    message: &'a str,
) -> ErrorEnvelope<'a> {
    ErrorEnvelope {
        error: ErrorBody {
            kind,
            status,
            code,
            message,
        },
    }
}

fn error_chain(error: &dyn StdError) -> String {
    let mut messages = Vec::new();
    let mut current = Some(error);
    while let Some(source) = current {
        messages.push(source.to_string());
        current = source.source();
    }
    messages.join(": ")
}
