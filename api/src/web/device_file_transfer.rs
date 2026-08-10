use axum::{
    Json,
    body::Bytes,
    extract::{Extension, Query, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use chrono::{Duration, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{
    domains::{audit, storage},
    platform::{
        crypto,
        error::{AppError, AppResult},
    },
    web::{
        audit_context, device_auth,
        response::ApiEnvelope,
        router::{AppState, DeviceAuthClientIp},
    },
};

const TRANSFER_SCHEMA_VERSION: u32 = 1;
const TRANSFER_TTL_SECONDS: u64 = 60;
const CANARY_CONTENT: &[u8] = b"yuance-desktop-file-canary-v1-data";
const CANARY_CONTENT_TYPE: &str = "text/plain";
const CANARY_GRANT_AAD: &[u8] = b"yuance:device-file-transfer-canary:v1";

#[derive(Debug, Serialize)]
pub struct DeviceFileTransferPayload {
    schema_version: u32,
    purpose: &'static str,
    request: storage::SignedObjectRequest,
    expected_bytes: usize,
    content_type: &'static str,
    sha256: String,
    expires_in_seconds: u64,
    expires_at: String,
}

pub(crate) async fn canary_upload_request(
    State(state): State<AppState>,
    Extension(client_ip): Extension<DeviceAuthClientIp>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if !body.is_empty() {
        return no_store(
            AppError::BadRequest("Desktop 文件传输 canary 签发请求不接受 body".to_string())
                .into_response(),
        );
    }
    canary_transfer_request(state, headers, client_ip, TransferPurpose::Upload).await
}

pub(crate) async fn canary_download_request(
    State(state): State<AppState>,
    Extension(client_ip): Extension<DeviceAuthClientIp>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if !body.is_empty() {
        return no_store(
            AppError::BadRequest("Desktop 文件传输 canary 签发请求不接受 body".to_string())
                .into_response(),
        );
    }
    canary_transfer_request(state, headers, client_ip, TransferPurpose::Download).await
}

#[derive(Debug, Deserialize)]
pub(crate) struct CanaryTransferQuery {
    grant: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct CanaryTransferGrant {
    purpose: String,
    object_key: String,
    expires_at: i64,
}

pub(crate) async fn canary_upload(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<CanaryTransferQuery>,
    body: Bytes,
) -> Response {
    if let Some(response) = reject_transfer_credentials(&headers) {
        return response;
    }
    let object_key = match verify_canary_grant(&state, &query.grant, TransferPurpose::Upload) {
        Ok(object_key) => object_key,
        Err(error) => return no_store(error.into_response()),
    };
    if body.as_ref() != CANARY_CONTENT {
        return no_store(
            AppError::BadRequest("Desktop 文件传输 canary 内容无效".to_string()).into_response(),
        );
    }
    if headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        != Some(CANARY_CONTENT_TYPE)
    {
        return no_store(
            AppError::BadRequest("Desktop 文件传输 canary Content-Type 无效".to_string())
                .into_response(),
        );
    }
    let pool = match state.pool() {
        Ok(pool) => pool,
        Err(error) => return no_store(error.into_response()),
    };
    match storage::write_test_memory_object(
        pool,
        &state.settings,
        &object_key,
        CANARY_CONTENT_TYPE,
        body.to_vec(),
    )
    .await
    {
        Ok(()) => no_store(StatusCode::NO_CONTENT.into_response()),
        Err(error) => no_store(error.into_response()),
    }
}

pub(crate) async fn canary_download(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<CanaryTransferQuery>,
) -> Response {
    if let Some(response) = reject_transfer_credentials(&headers) {
        return response;
    }
    let object_key = match verify_canary_grant(&state, &query.grant, TransferPurpose::Download) {
        Ok(object_key) => object_key,
        Err(error) => return no_store(error.into_response()),
    };
    let pool = match state.pool() {
        Ok(pool) => pool,
        Err(error) => return no_store(error.into_response()),
    };
    match storage::read_object(pool, &state.settings, &object_key).await {
        Ok((_, content)) if content == CANARY_CONTENT => {
            let mut response = content.into_response();
            response.headers_mut().insert(
                header::CONTENT_TYPE,
                header::HeaderValue::from_static(CANARY_CONTENT_TYPE),
            );
            no_store(response)
        }
        Ok(_) => no_store(
            AppError::BadRequest("Desktop 文件传输 canary 内容无效".to_string()).into_response(),
        ),
        Err(error) => no_store(error.into_response()),
    }
}

#[derive(Clone, Copy)]
enum TransferPurpose {
    Upload,
    Download,
}

impl TransferPurpose {
    fn as_str(self) -> &'static str {
        match self {
            Self::Upload => "upload",
            Self::Download => "download",
        }
    }
}

async fn canary_transfer_request(
    state: AppState,
    headers: HeaderMap,
    client_ip: DeviceAuthClientIp,
    purpose: TransferPurpose,
) -> Response {
    let Some(_permit) = state.try_device_auth_permit() else {
        return device_auth::rate_limited_response(1);
    };
    let context = audit_context::from_headers_with_client_ip(&headers, client_ip.0);
    let access = match device_auth::require_device_access(&state, &headers, &context).await {
        Ok(access) => access,
        Err(response) => return response,
    };
    match build_transfer_payload(&state, &access.family_id, purpose).await {
        Ok(payload) => {
            record_canary_audit(&state, access.user_id, &access.family_id, purpose, &context).await;
            no_store(Json(ApiEnvelope { data: payload }).into_response())
        }
        Err(error) => no_store(error.into_response()),
    }
}

async fn build_transfer_payload(
    state: &AppState,
    family_id: &str,
    purpose: TransferPurpose,
) -> AppResult<DeviceFileTransferPayload> {
    let pool = state.pool()?;
    let object_key = canary_object_key(family_id);
    let now = Utc::now();
    let mut request = match purpose {
        TransferPurpose::Upload => {
            let request = storage::presign_upload_url(
                pool,
                &state.settings,
                &object_key,
                CANARY_CONTENT_TYPE,
                TRANSFER_TTL_SECONDS,
            )
            .await?;
            request
        }
        TransferPurpose::Download => {
            let request = storage::presign_download_url(
                pool,
                &state.settings,
                &object_key,
                TRANSFER_TTL_SECONDS,
            )
            .await?;
            request
        }
    };
    bind_canary_test_request(state, &object_key, purpose, now, &mut request)?;
    request.headers.sort_unstable();
    Ok(DeviceFileTransferPayload {
        schema_version: TRANSFER_SCHEMA_VERSION,
        purpose: purpose.as_str(),
        request,
        expected_bytes: CANARY_CONTENT.len(),
        content_type: CANARY_CONTENT_TYPE,
        sha256: hex::encode(Sha256::digest(CANARY_CONTENT)),
        expires_in_seconds: TRANSFER_TTL_SECONDS,
        expires_at: (now + Duration::seconds(TRANSFER_TTL_SECONDS as i64))
            .to_rfc3339_opts(SecondsFormat::Secs, true),
    })
}

fn bind_canary_test_request(
    state: &AppState,
    object_key: &str,
    purpose: TransferPurpose,
    now: chrono::DateTime<Utc>,
    request: &mut storage::SignedObjectRequest,
) -> AppResult<()> {
    let expected_prefix = match purpose {
        TransferPurpose::Upload => "/api/v1/test-storage/upload?",
        TransferPurpose::Download => "/api/v1/test-storage/download?",
    };
    if !request.url.starts_with(expected_prefix) {
        return Ok(());
    }
    let grant = CanaryTransferGrant {
        purpose: purpose.as_str().to_string(),
        object_key: object_key.to_string(),
        expires_at: (now + Duration::seconds(TRANSFER_TTL_SECONDS as i64)).timestamp(),
    };
    let plaintext = serde_json::to_string(&grant)
        .map_err(|error| AppError::BadRequest(format!("生成 canary 授权失败：{error}")))?;
    let encrypted = crypto::encrypt_secret(
        &state.settings.security_master_key,
        &plaintext,
        CANARY_GRANT_AAD,
    )?;
    let query = serde_urlencoded::to_string([("grant", encrypted.as_str())])
        .map_err(|error| AppError::BadRequest(format!("生成 canary 地址失败：{error}")))?;
    request.url = format!(
        "/api/v1/device-file-transfer/canary/{}?{query}",
        purpose.as_str()
    );
    Ok(())
}

fn verify_canary_grant(
    state: &AppState,
    encrypted: &str,
    purpose: TransferPurpose,
) -> AppResult<String> {
    let invalid = || AppError::Forbidden("Desktop 文件传输 canary 授权无效或已过期".to_string());
    let plaintext = crypto::decrypt_secret(
        &state.settings.security_master_key,
        encrypted,
        CANARY_GRANT_AAD,
    )
    .map_err(|_| invalid())?;
    let grant: CanaryTransferGrant = serde_json::from_str(&plaintext).map_err(|_| invalid())?;
    if grant.purpose != purpose.as_str()
        || grant.expires_at <= Utc::now().timestamp()
        || !is_canary_object_key(&grant.object_key)
    {
        return Err(invalid());
    }
    Ok(grant.object_key)
}

fn reject_transfer_credentials(headers: &HeaderMap) -> Option<Response> {
    if headers.contains_key(header::COOKIE) || headers.contains_key(header::AUTHORIZATION) {
        return Some(device_auth::credential_not_allowed_response());
    }
    None
}

fn canary_object_key(family_id: &str) -> String {
    let digest = hex::encode(Sha256::digest(family_id.as_bytes()));
    format!("desktop-file-canary/{digest}.txt")
}

fn is_canary_object_key(object_key: &str) -> bool {
    let Some(digest) = object_key
        .strip_prefix("desktop-file-canary/")
        .and_then(|value| value.strip_suffix(".txt"))
    else {
        return false;
    };
    digest.len() == 64
        && digest
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

async fn record_canary_audit(
    state: &AppState,
    user_id: i64,
    family_id: &str,
    purpose: TransferPurpose,
    context: &audit::AuditContext,
) {
    let Ok(pool) = state.pool() else { return };
    if let Err(error) = audit::record_with_context(
        pool,
        Some(user_id),
        "device_file_transfer.canary_request",
        "device_credential_family",
        family_id,
        &serde_json::json!({"purpose": purpose.as_str()}).to_string(),
        context,
    )
    .await
    {
        tracing::warn!(%error, "failed to record device file transfer canary audit");
    }
}

fn no_store(mut response: Response) -> Response {
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        header::HeaderValue::from_static("private, no-store"),
    );
    response
}
