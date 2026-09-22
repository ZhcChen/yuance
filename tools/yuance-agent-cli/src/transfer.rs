use std::{collections::BTreeMap, time::Duration};

use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use chrono::{DateTime, Utc};
use reqwest::{Client, StatusCode, Url, header};

use crate::{
    error::AgentError,
    file_crypto::encrypted_total_size,
    models::{AttachmentEncryptionPayload, AttachmentSignedUrlPayload},
};

const MAX_URL_LENGTH: usize = 8 * 1024;
const MAX_HEADER_VALUE_LENGTH: usize = 4 * 1024;
const MAX_TRANSFER_BYTES: i64 = 128 * 1024 * 1024;
const MAX_TTL_SECONDS: u64 = 60;
const MAX_CLOCK_SKEW: i64 = 5;
const FILE_CHUNK_SIZE: i64 = 1024 * 1024;
const ALLOWED_HEADERS: [&str; 7] = [
    "content-length",
    "content-md5",
    "content-type",
    "x-amz-checksum-sha256",
    "x-amz-content-sha256",
    "x-oss-content-sha256",
    "x-oss-forbid-overwrite",
];

#[derive(Debug, Clone)]
pub struct ValidatedUploadContract {
    pub attachment_id: i64,
    pub file_object_id: i64,
    pub url: Url,
    pub headers: BTreeMap<String, String>,
    pub expected_bytes: i64,
    pub plaintext_bytes: i64,
    pub plaintext_sha256: String,
    pub encryption: Option<ValidatedEncryption>,
}

#[derive(Debug, Clone)]
pub struct ValidatedEncryption {
    pub key: [u8; 32],
    pub file_object_id: i64,
    pub plaintext_byte_size: i64,
    pub plaintext_sha256: String,
    pub encrypted_byte_size: i64,
}

impl ValidatedUploadContract {
    pub fn parse(
        payload: AttachmentSignedUrlPayload,
        api_origin: &str,
        now: DateTime<Utc>,
    ) -> Result<Self, AgentError> {
        let attachment = payload.attachment;
        if attachment.id < 1 || attachment.file_object_id < 1 || attachment.status != "pending" {
            return Err(contract_error("附件状态或标识无效"));
        }
        if !(0..=MAX_TRANSFER_BYTES).contains(&attachment.byte_size) {
            return Err(contract_error("附件大小超出安全范围"));
        }
        let origin = parse_api_origin(api_origin)?;
        let url = parse_request_url(&payload.request.url, &origin)?;
        if payload.request.method != "PUT" {
            return Err(contract_error("签名请求方法必须是 PUT"));
        }
        let headers = validate_headers(payload.request.headers)?;
        let expires_at = DateTime::parse_from_rfc3339(&payload.expires_at)
            .map_err(|_| contract_error("签名有效期格式无效"))?
            .with_timezone(&Utc);
        if !(1..=MAX_TTL_SECONDS).contains(&payload.expires_in_seconds)
            || expires_at <= now
            || expires_at
                > now
                    + chrono::Duration::seconds(payload.expires_in_seconds as i64 + MAX_CLOCK_SKEW)
        {
            return Err(contract_error("签名有效期无效或已过期"));
        }
        let plaintext_sha256 = validate_sha256(&payload.checksum_sha256)?;
        let encryption = payload
            .encryption
            .map(|value| validate_encryption(value, &attachment, &plaintext_sha256))
            .transpose()?;
        let expected_bytes = encryption
            .as_ref()
            .map(|value| value.encrypted_byte_size)
            .unwrap_or(attachment.byte_size);
        if let Some(value) = headers.get("content-length")
            && value != &expected_bytes.to_string()
        {
            return Err(contract_error(&format!(
                "签名请求的 Content-Length 不匹配：签名值 {value}，期望 {expected_bytes}"
            )));
        }
        if let Some(value) = headers.get("content-type") {
            let expected_type = if encryption.is_some() {
                "application/octet-stream"
            } else {
                attachment.content_type.as_str()
            };
            if value != expected_type {
                return Err(contract_error("签名请求的 Content-Type 不匹配"));
            }
        }
        Ok(Self {
            attachment_id: attachment.id,
            file_object_id: attachment.file_object_id,
            url,
            headers,
            expected_bytes,
            plaintext_bytes: attachment.byte_size,
            plaintext_sha256,
            encryption,
        })
    }
}

#[derive(Debug, Clone)]
pub struct SignedObjectTransport {
    client: Client,
}

impl SignedObjectTransport {
    pub fn new(timeout: Duration) -> Result<Self, AgentError> {
        let client = Client::builder()
            .timeout(timeout)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(AgentError::from_reqwest)?;
        Ok(Self { client })
    }

    pub async fn put(
        &self,
        contract: &ValidatedUploadContract,
        body: reqwest::Body,
    ) -> Result<StatusCode, AgentError> {
        let mut request = self.client.put(contract.url.clone()).body(body);
        for (name, value) in &contract.headers {
            let header_name = header::HeaderName::from_bytes(name.as_bytes())
                .map_err(|_| contract_error("签名请求 header 名称无效"))?;
            let header_value = header::HeaderValue::from_str(value)
                .map_err(|_| contract_error("签名请求 header 值无效"))?;
            request = request.header(header_name, header_value);
        }
        let response = request.send().await.map_err(AgentError::from_reqwest)?;
        let status = response.status();
        if !status.is_success() {
            return Err(AgentError::Http {
                status: status.as_u16(),
                code: "signed_upload_failed".to_string(),
                message: "对象存储上传失败".to_string(),
            });
        }
        Ok(status)
    }
}

fn validate_encryption(
    value: AttachmentEncryptionPayload,
    attachment: &crate::models::AttachmentPayload,
    checksum: &str,
) -> Result<ValidatedEncryption, AgentError> {
    if value.algorithm != "AES-256-GCM"
        || value.format != "YUANCE-ENC-v1"
        || value.chunk_size != FILE_CHUNK_SIZE
        || value.file_object_id != attachment.file_object_id
        || value.plaintext_byte_size != attachment.byte_size
        || value.plaintext_sha256 != checksum
        || !(0..=MAX_TRANSFER_BYTES).contains(&value.plaintext_byte_size)
    {
        return Err(contract_error("加密上传契约无效"));
    }
    let calculated_byte_size = encrypted_total_size(value.plaintext_byte_size as u64);
    if value.encrypted_byte_size < 0
        || (value.encrypted_byte_size > 0
            && u64::try_from(value.encrypted_byte_size).ok() != Some(calculated_byte_size))
    {
        return Err(contract_error(&format!(
            "服务端密文大小无效：声明 {}，协议计算 {}",
            value.encrypted_byte_size, calculated_byte_size
        )));
    }
    let key = BASE64
        .decode(value.key)
        .map_err(|_| contract_error("加密密钥格式无效"))?;
    let key: [u8; 32] = key
        .try_into()
        .map_err(|_| contract_error("加密密钥长度无效"))?;
    Ok(ValidatedEncryption {
        key,
        file_object_id: value.file_object_id,
        plaintext_byte_size: value.plaintext_byte_size,
        plaintext_sha256: value.plaintext_sha256,
        encrypted_byte_size: if value.encrypted_byte_size > 0 {
            value.encrypted_byte_size
        } else {
            calculated_byte_size
                .try_into()
                .map_err(|_| contract_error("加密文件大小超出系统支持范围"))?
        },
    })
}

fn validate_headers(
    headers: BTreeMap<String, String>,
) -> Result<BTreeMap<String, String>, AgentError> {
    if headers.len() > 16 {
        return Err(contract_error("签名请求 header 数量超限"));
    }
    for (name, value) in &headers {
        if !ALLOWED_HEADERS.contains(&name.as_str())
            || name.is_empty()
            || name.len() > 128
            || value.is_empty()
            || value.len() > MAX_HEADER_VALUE_LENGTH
            || value.trim() != value
            || value.chars().any(|ch| ch.is_control())
        {
            return Err(contract_error("签名请求 header 不安全"));
        }
    }
    Ok(headers)
}

fn parse_api_origin(value: &str) -> Result<Url, AgentError> {
    let url = Url::parse(value).map_err(|_| contract_error("API origin 无效"))?;
    let is_loopback = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
        || !(url.scheme() == "https" || (url.scheme() == "http" && is_loopback))
    {
        return Err(contract_error("API origin 必须是 HTTPS 或 loopback HTTP"));
    }
    Ok(url)
}

fn parse_request_url(value: &str, api_origin: &Url) -> Result<Url, AgentError> {
    if value.is_empty() || value.len() > MAX_URL_LENGTH || !value.is_ascii() || value.contains('\\')
    {
        return Err(contract_error("签名 URL 无效"));
    }
    let url = Url::parse(value)
        .or_else(|_| api_origin.join(value))
        .map_err(|_| contract_error("签名 URL 无效"))?;
    if !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() {
        return Err(contract_error("签名 URL 含有不安全部分"));
    }
    if url.scheme() != "https"
        && !(url.scheme() == "http"
            && url.origin().ascii_serialization() == api_origin.origin().ascii_serialization())
    {
        return Err(contract_error(
            "签名 URL 必须使用 HTTPS 或 API loopback HTTP",
        ));
    }
    Ok(url)
}

fn validate_sha256(value: &str) -> Result<String, AgentError> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(contract_error("SHA-256 校验值无效"));
    }
    Ok(value.to_string())
}

fn contract_error(message: &str) -> AgentError {
    AgentError::Upload {
        stage: "signing",
        code: "invalid_transfer_contract",
        message: message.to_string(),
        attachment_id: None,
        encrypted_sha256: None,
    }
}
