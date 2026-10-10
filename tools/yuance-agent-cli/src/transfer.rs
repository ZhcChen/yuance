use std::{collections::BTreeMap, fmt, time::Duration};

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
pub const MAX_TRANSFER_BYTES: i64 = 128 * 1024 * 1024;
const MAX_TTL_SECONDS: u64 = 60;
const MAX_DOWNLOAD_TTL_SECONDS: u64 = 3600;
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

#[derive(Clone)]
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

#[derive(Clone)]
pub struct ValidatedEncryption {
    pub key: [u8; 32],
    pub file_object_id: i64,
    pub plaintext_byte_size: i64,
    pub plaintext_sha256: String,
    pub encrypted_byte_size: i64,
}

#[derive(Clone)]
pub struct ValidatedDownloadContract {
    pub attachment_id: i64,
    pub filename: String,
    pub content_type: String,
    pub url: Url,
    pub headers: BTreeMap<String, String>,
    pub expected_bytes: i64,
    pub checksum_sha256: Option<String>,
    pub encryption: Option<ValidatedDownloadEncryption>,
}

#[derive(Clone)]
pub struct ValidatedDownloadEncryption {
    pub key: [u8; 32],
    pub file_object_id: i64,
    pub plaintext_byte_size: i64,
    pub plaintext_sha256: String,
    pub encrypted_byte_size: i64,
    pub encrypted_checksum_sha256: String,
}

impl fmt::Debug for ValidatedUploadContract {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ValidatedUploadContract")
            .field("attachment_id", &self.attachment_id)
            .field("file_object_id", &self.file_object_id)
            .field("url", &"[REDACTED]")
            .field("headers", &"[REDACTED]")
            .field("expected_bytes", &self.expected_bytes)
            .field("plaintext_bytes", &self.plaintext_bytes)
            .field("plaintext_sha256", &self.plaintext_sha256)
            .field("encryption", &self.encryption)
            .finish()
    }
}

impl fmt::Debug for ValidatedEncryption {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ValidatedEncryption")
            .field("key", &"[REDACTED]")
            .field("file_object_id", &self.file_object_id)
            .field("plaintext_byte_size", &self.plaintext_byte_size)
            .field("plaintext_sha256", &self.plaintext_sha256)
            .field("encrypted_byte_size", &self.encrypted_byte_size)
            .finish()
    }
}

impl fmt::Debug for ValidatedDownloadContract {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ValidatedDownloadContract")
            .field("attachment_id", &self.attachment_id)
            .field("filename", &self.filename)
            .field("content_type", &self.content_type)
            .field("url", &"[REDACTED]")
            .field("headers", &"[REDACTED]")
            .field("expected_bytes", &self.expected_bytes)
            .field("checksum_sha256", &self.checksum_sha256)
            .field("encryption", &self.encryption)
            .finish()
    }
}

impl fmt::Debug for ValidatedDownloadEncryption {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ValidatedDownloadEncryption")
            .field("key", &"[REDACTED]")
            .field("file_object_id", &self.file_object_id)
            .field("plaintext_byte_size", &self.plaintext_byte_size)
            .field("plaintext_sha256", &self.plaintext_sha256)
            .field("encrypted_byte_size", &self.encrypted_byte_size)
            .field("encrypted_checksum_sha256", &self.encrypted_checksum_sha256)
            .finish()
    }
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

impl ValidatedDownloadContract {
    pub fn parse(
        payload: AttachmentSignedUrlPayload,
        api_origin: &str,
        now: DateTime<Utc>,
    ) -> Result<Self, AgentError> {
        let attachment = payload.attachment;
        if attachment.id < 1 || attachment.file_object_id < 1 || attachment.status != "uploaded" {
            return Err(download_contract_error("附件状态或标识无效"));
        }
        if attachment.filename.trim().is_empty()
            || attachment.content_type.trim().is_empty()
            || !(0..=MAX_TRANSFER_BYTES).contains(&attachment.byte_size)
        {
            return Err(download_contract_error("附件元数据无效或超出大小限制"));
        }
        let origin = parse_api_origin(api_origin).map_err(as_download_contract_error)?;
        let url =
            parse_request_url(&payload.request.url, &origin).map_err(as_download_contract_error)?;
        if payload.request.method != "GET" {
            return Err(download_contract_error("签名请求方法必须是 GET"));
        }
        let headers =
            validate_headers(payload.request.headers).map_err(as_download_contract_error)?;
        let expires_at = DateTime::parse_from_rfc3339(&payload.expires_at)
            .map_err(|_| download_contract_error("签名有效期格式无效"))?
            .with_timezone(&Utc);
        if !(1..=MAX_DOWNLOAD_TTL_SECONDS).contains(&payload.expires_in_seconds)
            || expires_at <= now
            || expires_at
                > now
                    + chrono::Duration::seconds(payload.expires_in_seconds as i64 + MAX_CLOCK_SKEW)
        {
            return Err(download_contract_error("签名有效期无效或已过期"));
        }

        let checksum_sha256 = if payload.checksum_sha256.is_empty() {
            None
        } else {
            Some(validate_sha256(&payload.checksum_sha256).map_err(as_download_contract_error)?)
        };
        let encryption = payload
            .encryption
            .map(|value| {
                validate_download_encryption(
                    value,
                    &attachment,
                    checksum_sha256.as_deref().unwrap_or_default(),
                )
            })
            .transpose()?;
        let expected_bytes = encryption
            .as_ref()
            .map(|value| value.encrypted_byte_size)
            .unwrap_or(attachment.byte_size);
        let max_encrypted_bytes = encrypted_total_size(MAX_TRANSFER_BYTES as u64);
        if expected_bytes < 0 || expected_bytes as u64 > max_encrypted_bytes {
            return Err(download_contract_error("附件下载大小超出安全限制"));
        }
        if let Some(value) = headers.get("content-length")
            && value != &expected_bytes.to_string()
        {
            return Err(download_contract_error(
                "签名请求 Content-Length 与附件大小不匹配",
            ));
        }
        let expected_content_type = if encryption.is_some() {
            "application/octet-stream"
        } else {
            attachment.content_type.as_str()
        };
        if let Some(value) = headers.get("content-type")
            && !value.eq_ignore_ascii_case(expected_content_type)
        {
            return Err(download_contract_error(
                "签名请求 Content-Type 与附件不匹配",
            ));
        }

        Ok(Self {
            attachment_id: attachment.id,
            filename: attachment.filename,
            content_type: expected_content_type.to_string(),
            url,
            headers,
            expected_bytes,
            checksum_sha256,
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

    pub async fn get(&self, contract: &ValidatedDownloadContract) -> Result<Vec<u8>, AgentError> {
        let mut request = self.client.get(contract.url.clone());
        for (name, value) in &contract.headers {
            let header_name = header::HeaderName::from_bytes(name.as_bytes()).map_err(|_| {
                download_error(
                    "invalid_download_contract",
                    "签名请求 header 无效",
                    contract.attachment_id,
                )
            })?;
            let header_value = header::HeaderValue::from_str(value).map_err(|_| {
                download_error(
                    "invalid_download_contract",
                    "签名请求 header 无效",
                    contract.attachment_id,
                )
            })?;
            request = request.header(header_name, header_value);
        }
        let mut response = request.send().await.map_err(|error| {
            download_error(
                "download_request_failed",
                &AgentError::from_reqwest(error).to_string(),
                contract.attachment_id,
            )
        })?;
        if response.status() != StatusCode::OK || response.url() != &contract.url {
            return Err(download_error(
                "download_response_invalid",
                "对象存储返回了无效响应",
                contract.attachment_id,
            ));
        }
        let content_type = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok());
        if !content_type.is_some_and(|value| value.eq_ignore_ascii_case(&contract.content_type)) {
            return Err(download_error(
                "download_response_invalid",
                "对象存储响应类型与附件不匹配",
                contract.attachment_id,
            ));
        }
        if response
            .content_length()
            .is_some_and(|length| length != contract.expected_bytes as u64)
        {
            return Err(download_error(
                "download_size_mismatch",
                "附件下载大小不匹配",
                contract.attachment_id,
            ));
        }

        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|error| {
            download_error(
                "download_request_failed",
                &AgentError::from_reqwest(error).to_string(),
                contract.attachment_id,
            )
        })? {
            if bytes.len().saturating_add(chunk.len()) > contract.expected_bytes as usize {
                return Err(download_error(
                    "download_size_mismatch",
                    "附件下载超过声明大小",
                    contract.attachment_id,
                ));
            }
            bytes.extend_from_slice(&chunk);
        }
        if bytes.len() as i64 != contract.expected_bytes {
            return Err(download_error(
                "download_size_mismatch",
                "附件下载大小不匹配",
                contract.attachment_id,
            ));
        }
        Ok(bytes)
    }
}

fn validate_download_encryption(
    value: AttachmentEncryptionPayload,
    attachment: &crate::models::AttachmentPayload,
    checksum: &str,
) -> Result<ValidatedDownloadEncryption, AgentError> {
    if value.algorithm != "AES-256-GCM"
        || value.format != "YUANCE-ENC-v1"
        || value.chunk_size != FILE_CHUNK_SIZE
        || value.file_object_id != attachment.file_object_id
        || value.plaintext_byte_size != attachment.byte_size
        || value.plaintext_sha256 != checksum
        || !(0..=MAX_TRANSFER_BYTES).contains(&value.plaintext_byte_size)
    {
        return Err(download_contract_error("附件解密契约无效"));
    }
    let calculated_byte_size = encrypted_total_size(value.plaintext_byte_size as u64);
    if value.encrypted_byte_size < 0
        || u64::try_from(value.encrypted_byte_size).ok() != Some(calculated_byte_size)
    {
        return Err(download_contract_error("附件密文大小无效"));
    }
    let encrypted_checksum_sha256 =
        validate_sha256(&value.encrypted_checksum_sha256).map_err(as_download_contract_error)?;
    let key = BASE64
        .decode(value.key)
        .map_err(|_| download_contract_error("附件解密密钥格式无效"))?;
    let key: [u8; 32] = key
        .try_into()
        .map_err(|_| download_contract_error("附件解密密钥长度无效"))?;
    Ok(ValidatedDownloadEncryption {
        key,
        file_object_id: value.file_object_id,
        plaintext_byte_size: value.plaintext_byte_size,
        plaintext_sha256: value.plaintext_sha256,
        encrypted_byte_size: value.encrypted_byte_size,
        encrypted_checksum_sha256,
    })
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

fn as_download_contract_error(error: AgentError) -> AgentError {
    download_contract_error(&error.to_string())
}

fn download_contract_error(message: &str) -> AgentError {
    download_error("invalid_download_contract", message, 0)
}

fn download_error(code: &'static str, message: &str, attachment_id: i64) -> AgentError {
    AgentError::Download {
        stage: "downloading",
        code,
        message: message.to_string(),
        attachment_id: (attachment_id > 0).then_some(attachment_id),
    }
}
