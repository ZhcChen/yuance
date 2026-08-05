use std::{env, time::Duration};

use reqwest::{Client, Method, Url, header};
use serde::Serialize;
use serde_json::Value;

use crate::{error::AgentError, models::ApiErrorEnvelope};

pub const DEFAULT_BASE_URL: &str = "https://yuance.quanxinfu.com";
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;

pub struct ClientConfig {
    base_url: Url,
    api_token: String,
    timeout: Duration,
}

impl std::fmt::Debug for ClientConfig {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ClientConfig")
            .field("base_url", &self.base_url)
            .field("api_token", &"[REDACTED]")
            .field("timeout", &self.timeout)
            .finish()
    }
}

impl ClientConfig {
    pub fn from_env() -> Result<Self, AgentError> {
        let base_url = env::var("YUANCE_BASE_URL").unwrap_or_else(|_| DEFAULT_BASE_URL.to_string());
        let api_token = env::var("YUANCE_API_TOKEN").unwrap_or_default();
        Self::new(&base_url, &api_token, DEFAULT_TIMEOUT)
    }

    pub fn new(base_url: &str, api_token: &str, timeout: Duration) -> Result<Self, AgentError> {
        let base_url = normalize_base_url(base_url)?;
        let api_token = api_token.trim();
        if api_token.is_empty() {
            return Err(AgentError::Config {
                code: "missing_api_token",
                message: "缺少 YUANCE_API_TOKEN".to_string(),
            });
        }

        Ok(Self {
            base_url,
            api_token: api_token.to_string(),
            timeout,
        })
    }

    pub fn base_url(&self) -> &Url {
        &self.base_url
    }
}

#[derive(Debug, Clone)]
pub struct ApiClient {
    base_url: Url,
    client: Client,
}

impl ApiClient {
    pub fn from_config(config: ClientConfig) -> Result<Self, AgentError> {
        let mut authorization =
            header::HeaderValue::from_str(&format!("Bearer {}", config.api_token)).map_err(
                |_| AgentError::Config {
                    code: "invalid_api_token",
                    message: "YUANCE_API_TOKEN 包含无效字符".to_string(),
                },
            )?;
        authorization.set_sensitive(true);

        let mut headers = header::HeaderMap::new();
        headers.insert(
            header::ACCEPT,
            header::HeaderValue::from_static("application/json"),
        );
        headers.insert(header::AUTHORIZATION, authorization);

        let client = Client::builder()
            .default_headers(headers)
            .timeout(config.timeout)
            .redirect(reqwest::redirect::Policy::none())
            .user_agent(concat!("yuance-agent/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(AgentError::from_reqwest)?;

        Ok(Self {
            base_url: config.base_url,
            client,
        })
    }

    pub async fn get(&self, path: &str, query: &[(&str, &str)]) -> Result<Value, AgentError> {
        let url = self.url(path)?;
        self.request::<Value>(Method::GET, url, query, None).await
    }

    pub async fn get_segments(
        &self,
        segments: &[&str],
        query: &[(&str, &str)],
    ) -> Result<Value, AgentError> {
        let url = self.url_segments(segments)?;
        self.request::<Value>(Method::GET, url, query, None).await
    }

    pub async fn post_segments<T: Serialize + ?Sized>(
        &self,
        segments: &[&str],
        body: &T,
    ) -> Result<Value, AgentError> {
        let url = self.url_segments(segments)?;
        self.request(Method::POST, url, &[], Some(body)).await
    }

    pub async fn patch_segments<T: Serialize + ?Sized>(
        &self,
        segments: &[&str],
        body: &T,
    ) -> Result<Value, AgentError> {
        let url = self.url_segments(segments)?;
        self.request(Method::PATCH, url, &[], Some(body)).await
    }

    async fn request<T: Serialize + ?Sized>(
        &self,
        method: Method,
        mut url: Url,
        query: &[(&str, &str)],
        body: Option<&T>,
    ) -> Result<Value, AgentError> {
        if !query.is_empty() {
            url.query_pairs_mut().extend_pairs(query.iter().copied());
        }
        let mut request = self.client.request(method, url);
        if let Some(body) = body {
            request = request.json(body);
        }

        let response = request.send().await.map_err(AgentError::from_reqwest)?;
        let status = response.status();
        let body = read_response_body(response).await?;

        if !status.is_success() {
            let api_error = serde_json::from_slice::<ApiErrorEnvelope>(&body).ok();
            let code = api_error
                .as_ref()
                .map(|payload| payload.error.code.trim())
                .filter(|code| !code.is_empty())
                .unwrap_or("http_error")
                .to_string();
            let message = api_error
                .as_ref()
                .map(|payload| payload.error.message.trim())
                .filter(|message| !message.is_empty())
                .unwrap_or_else(|| status.canonical_reason().unwrap_or("request failed"))
                .to_string();
            return Err(AgentError::Http {
                status: status.as_u16(),
                code,
                message,
            });
        }

        serde_json::from_slice(&body).map_err(|_| AgentError::Response {
            code: "invalid_json",
            message: "元策 API 响应无法解析为 JSON".to_string(),
        })
    }

    fn url(&self, path: &str) -> Result<Url, AgentError> {
        self.base_url
            .join(path.trim_start_matches('/'))
            .map_err(|_| AgentError::Config {
                code: "invalid_request_path",
                message: "请求路径无效".to_string(),
            })
    }

    fn url_segments(&self, segments: &[&str]) -> Result<Url, AgentError> {
        let mut url = self.base_url.clone();
        let mut path = url.path_segments_mut().map_err(|_| AgentError::Config {
            code: "invalid_request_path",
            message: "请求路径无效".to_string(),
        })?;
        path.pop_if_empty();
        path.extend(segments);
        drop(path);
        Ok(url)
    }
}

async fn read_response_body(mut response: reqwest::Response) -> Result<Vec<u8>, AgentError> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err(response_too_large());
    }

    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(AgentError::from_reqwest)? {
        if body.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err(response_too_large());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

fn response_too_large() -> AgentError {
    AgentError::Response {
        code: "response_too_large",
        message: format!(
            "元策 API 响应超过 {} MiB 限制",
            MAX_RESPONSE_BYTES / 1024 / 1024
        ),
    }
}

fn normalize_base_url(value: &str) -> Result<Url, AgentError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AgentError::Config {
            code: "missing_base_url",
            message: "YUANCE_BASE_URL 不能为空".to_string(),
        });
    }

    let mut url = Url::parse(value).map_err(|_| AgentError::Config {
        code: "invalid_base_url",
        message: "YUANCE_BASE_URL 不是有效 URL".to_string(),
    })?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err(AgentError::Config {
            code: "invalid_base_url",
            message: "YUANCE_BASE_URL 必须是 http 或 https URL".to_string(),
        });
    }
    url.set_query(None);
    url.set_fragment(None);
    if !url.path().ends_with('/') {
        let path = format!("{}/", url.path());
        url.set_path(&path);
    }
    Ok(url)
}
