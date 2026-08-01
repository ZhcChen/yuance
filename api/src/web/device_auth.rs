use askama::Template;
use axum::{
    Form, Json,
    extract::{Extension, Query, State, rejection::JsonRejection},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Redirect, Response},
};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::{
    domains::{audit, auth, device_sessions},
    platform::{error::AppResult, security::csrf},
    web::{
        audit_context,
        response::{self, ApiEnvelope},
        router::{AppState, DeviceAuthClientIp},
    },
};

const VERIFICATION_PATH: &str = "/web/device-authorization";

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StartAuthorizationRequest {
    code_challenge: String,
    code_challenge_method: String,
    installation_id: String,
    device_name: String,
    platform: String,
    client_version: String,
}

#[derive(Debug, Serialize)]
pub struct StartedAuthorizationPayload {
    device_code: String,
    user_code: String,
    verification_path: &'static str,
    expires_in: i64,
    interval: i64,
    server_instance_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExchangeAuthorizationRequest {
    device_code: String,
    code_verifier: String,
    exchange_transaction_id: String,
}

#[derive(Debug, Serialize)]
pub struct CredentialMetadataPayload {
    token_type: &'static str,
    issuer: &'static str,
    audience: &'static str,
    device_id: String,
    family_id: String,
    generation: i64,
    authorization_version: i64,
}

#[derive(Debug, Serialize)]
pub struct ExchangedAuthorizationPayload {
    access_token: String,
    refresh_token: String,
    access_expires_in: i64,
    refresh_expires_in: i64,
    access: CredentialMetadataPayload,
    refresh: CredentialMetadataPayload,
}

#[derive(Debug, Deserialize)]
pub struct AuthorizationQuery {
    user_code: String,
}

#[derive(Debug, Deserialize)]
pub struct AuthorizationDecisionForm {
    #[serde(rename = "_csrf")]
    csrf_token: String,
    user_code: String,
}

#[derive(Template)]
#[template(path = "web/device_authorization.html")]
struct DeviceAuthorizationTemplate {
    csrf_token: String,
    user_code: String,
    device_name: String,
    platform: String,
    client_version: String,
    server_instance_id: String,
    created_at: String,
    current_user: String,
    error_message: String,
}

#[derive(Template)]
#[template(path = "web/device_authorization_result.html")]
struct DeviceAuthorizationResultTemplate {
    csrf_token: String,
    user_code: String,
    title: String,
    message: String,
}

#[derive(Debug, Serialize)]
struct DeviceErrorEnvelope {
    error: DeviceErrorBody,
}

#[derive(Debug, Serialize)]
struct DeviceErrorBody {
    code: &'static str,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    retry_after: Option<i64>,
}

pub(crate) async fn start_authorization(
    State(state): State<AppState>,
    Extension(client_ip): Extension<DeviceAuthClientIp>,
    headers: HeaderMap,
    payload: Result<Json<StartAuthorizationRequest>, JsonRejection>,
) -> Response {
    let Json(payload) = match payload {
        Ok(payload) => payload,
        Err(error) => return json_rejection(error),
    };
    let Some(_permit) = state.try_device_auth_permit() else {
        return rate_limited_response(1);
    };
    if let Some(response) = reject_ambient_credentials(&headers) {
        return response;
    }
    if payload.code_challenge_method != "S256" {
        return protocol_error(
            StatusCode::BAD_REQUEST,
            "invalid_code_challenge",
            "仅支持 S256 code_challenge_method".to_string(),
            None,
        );
    }
    let pool = match state.pool() {
        Ok(pool) => pool,
        Err(error) => return no_store(error.into_response()),
    };
    let policy = match device_policy(&state) {
        Ok(policy) => policy,
        Err(error) => return no_store(error.into_response()),
    };
    let now = Utc::now();
    let started = match device_sessions::start_authorization(
        pool,
        &state.settings.security_master_key,
        &policy,
        device_sessions::StartAuthorizationInput {
            code_challenge: payload.code_challenge,
            installation_id: payload.installation_id,
            device_name: payload.device_name,
            platform: payload.platform,
            client_version: payload.client_version,
        },
        now,
    )
    .await
    {
        Ok(started) => started,
        Err(error) => return domain_error(error),
    };

    let metadata = serde_json::json!({
        "server_instance_id": started.server_instance_id,
        "source": "device_authorization_api"
    });
    if let Err(error) = audit::record_with_context(
        pool,
        None,
        "device_authorization.started",
        "device_authorization",
        &started.authorization_id,
        &metadata.to_string(),
        &device_audit_context(&headers, client_ip),
    )
    .await
    {
        tracing::warn!(%error, "failed to record device authorization start audit");
    }

    no_store(
        (
            StatusCode::CREATED,
            Json(ApiEnvelope {
                data: StartedAuthorizationPayload {
                    device_code: started.device_code,
                    user_code: started.user_code,
                    verification_path: VERIFICATION_PATH,
                    expires_in: (started.expires_at - now).num_seconds().max(1),
                    interval: started.interval_seconds,
                    server_instance_id: started.server_instance_id,
                },
            }),
        )
            .into_response(),
    )
}

pub(crate) async fn exchange_authorization(
    State(state): State<AppState>,
    Extension(client_ip): Extension<DeviceAuthClientIp>,
    headers: HeaderMap,
    payload: Result<Json<ExchangeAuthorizationRequest>, JsonRejection>,
) -> Response {
    let Json(payload) = match payload {
        Ok(payload) => payload,
        Err(error) => return json_rejection(error),
    };
    let Some(_permit) = state.try_device_auth_permit() else {
        return rate_limited_response(1);
    };
    if let Some(response) = reject_ambient_credentials(&headers) {
        return response;
    }
    let pool = match state.pool() {
        Ok(pool) => pool,
        Err(error) => return no_store(error.into_response()),
    };
    let policy = match device_policy(&state) {
        Ok(policy) => policy,
        Err(error) => return no_store(error.into_response()),
    };
    let now = Utc::now();
    let credentials = match device_sessions::exchange_authorization(
        pool,
        &state.settings.security_master_key,
        &policy,
        device_sessions::ExchangeAuthorizationInput {
            device_code: payload.device_code,
            code_verifier: payload.code_verifier,
            exchange_transaction_id: payload.exchange_transaction_id,
        },
        now,
    )
    .await
    {
        Ok(credentials) => credentials,
        Err(error) => return domain_error(error),
    };

    let metadata = serde_json::json!({
        "device_id": credentials.device_id,
        "family_id": credentials.family_id,
        "generation": credentials.generation,
        "server_instance_id": credentials.server_instance_id
    });
    if let Err(error) = audit::record_with_context(
        pool,
        Some(credentials.user_id),
        "device_authorization.exchanged",
        "device_credential_family",
        &credentials.family_id,
        &metadata.to_string(),
        &device_audit_context(&headers, client_ip),
    )
    .await
    {
        tracing::warn!(%error, "failed to record device authorization exchange audit");
    }

    let access_expires_in = (credentials.access_expires_at - now).num_seconds().max(1);
    let refresh_expires_in = (credentials.refresh_expires_at - now).num_seconds().max(1);
    let common = |audience| CredentialMetadataPayload {
        token_type: "Bearer",
        issuer: device_sessions::DEVICE_ACCESS_ISSUER,
        audience,
        device_id: credentials.device_id.clone(),
        family_id: credentials.family_id.clone(),
        generation: credentials.generation,
        authorization_version: credentials.authorization_version,
    };
    no_store(
        Json(ApiEnvelope {
            data: ExchangedAuthorizationPayload {
                access_token: credentials.access_token,
                refresh_token: credentials.refresh_token,
                access_expires_in,
                refresh_expires_in,
                access: common(device_sessions::DEVICE_ACCESS_AUDIENCE),
                refresh: common(device_sessions::DEVICE_REFRESH_AUDIENCE),
            },
        })
        .into_response(),
    )
}

pub async fn authorization_page(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<AuthorizationQuery>,
) -> AppResult<Response> {
    let Some(_permit) = state.try_device_auth_permit() else {
        return Ok(browser_rate_limited_response());
    };
    let pool = state.pool()?;
    let Some(user) = auth::user_from_headers(pool, &headers).await? else {
        return login_redirect(&query.user_code);
    };
    let csrf_token = csrf::ensure_token(&headers);
    let review = match device_sessions::authorization_for_review(
        pool,
        &state.settings.security_master_key,
        &state.settings.device_sessions.server_instance_id,
        &query.user_code,
        Utc::now(),
    )
    .await
    {
        Ok(review) => review,
        Err(error) => return render_result(&state, csrf_token, query.user_code, error),
    };
    let response = response::html(DeviceAuthorizationTemplate {
        csrf_token: csrf_token.clone(),
        user_code: query.user_code,
        device_name: review.device_name,
        platform: review.platform,
        client_version: review.client_version,
        server_instance_id: state.settings.device_sessions.server_instance_id.clone(),
        created_at: review
            .created_at
            .format("%Y-%m-%d %H:%M:%S UTC")
            .to_string(),
        current_user: if user.display_name.trim().is_empty() {
            user.username
        } else {
            user.display_name
        },
        error_message: String::new(),
    })?
    .into_response();
    with_csrf_cookie(&state, &csrf_token, no_store(response))
}

pub(crate) async fn approve_authorization(
    State(state): State<AppState>,
    Extension(client_ip): Extension<DeviceAuthClientIp>,
    headers: HeaderMap,
    Form(form): Form<AuthorizationDecisionForm>,
) -> AppResult<Response> {
    decide_from_browser(state, client_ip, headers, form, true).await
}

pub(crate) async fn deny_authorization(
    State(state): State<AppState>,
    Extension(client_ip): Extension<DeviceAuthClientIp>,
    headers: HeaderMap,
    Form(form): Form<AuthorizationDecisionForm>,
) -> AppResult<Response> {
    decide_from_browser(state, client_ip, headers, form, false).await
}

async fn decide_from_browser(
    state: AppState,
    client_ip: DeviceAuthClientIp,
    headers: HeaderMap,
    form: AuthorizationDecisionForm,
    approve: bool,
) -> AppResult<Response> {
    let Some(_permit) = state.try_device_auth_permit() else {
        return Ok(browser_rate_limited_response());
    };
    csrf::verify(&headers, &form.csrf_token)?;
    let pool = state.pool()?;
    let Some(user) = auth::user_from_headers(pool, &headers).await? else {
        return login_redirect(&form.user_code);
    };
    let review = match device_sessions::authorization_for_review(
        pool,
        &state.settings.security_master_key,
        &state.settings.device_sessions.server_instance_id,
        &form.user_code,
        Utc::now(),
    )
    .await
    {
        Ok(review) => review,
        Err(error) => {
            return render_result(&state, csrf::ensure_token(&headers), form.user_code, error);
        }
    };
    let decision = if approve {
        device_sessions::approve_authorization(pool, &review.authorization_id, user.id, Utc::now())
            .await
    } else {
        device_sessions::deny_authorization(pool, &review.authorization_id, Utc::now()).await
    };
    if let Err(error) = decision {
        return render_result(&state, csrf::ensure_token(&headers), form.user_code, error);
    }
    let action = if approve {
        "device_authorization.approved"
    } else {
        "device_authorization.denied"
    };
    if let Err(error) = audit::record_with_context(
        pool,
        Some(user.id),
        action,
        "device_authorization",
        &review.authorization_id,
        &serde_json::json!({"server_instance_id": state.settings.device_sessions.server_instance_id}).to_string(),
        &device_audit_context(&headers, client_ip),
    )
    .await
    {
        tracing::warn!(%error, action, "failed to record device authorization decision audit");
    }
    render_success_result(
        &state,
        csrf::ensure_token(&headers),
        form.user_code,
        approve,
    )
}

fn device_audit_context(
    headers: &HeaderMap,
    DeviceAuthClientIp(client_ip): DeviceAuthClientIp,
) -> audit::AuditContext {
    let mut context = audit_context::from_headers(headers);
    context.ip = client_ip.map_or_else(String::new, |ip| ip.to_string());
    context
}

fn device_policy(state: &AppState) -> AppResult<device_sessions::DeviceSessionPolicy> {
    let durations = state
        .settings
        .device_sessions
        .validate(&state.settings.env)?;
    Ok(device_sessions::DeviceSessionPolicy {
        server_instance_id: state.settings.device_sessions.server_instance_id.clone(),
        authorization_ttl_seconds: durations.authorization_ttl_seconds,
        access_ttl_seconds: durations.access_ttl_seconds,
        refresh_sliding_ttl_seconds: durations.refresh_sliding_ttl_seconds,
        refresh_absolute_ttl_seconds: durations.refresh_absolute_ttl_seconds,
        idempotency_ttl_seconds: durations.idempotency_ttl_seconds,
        poll_interval_seconds: durations.poll_interval_seconds,
    })
}

fn reject_ambient_credentials(headers: &HeaderMap) -> Option<Response> {
    if headers.contains_key(header::COOKIE) || headers.contains_key(header::AUTHORIZATION) {
        return Some(protocol_error(
            StatusCode::UNAUTHORIZED,
            "credential_not_allowed",
            "设备授权接口不接受 Cookie 或 Authorization 凭证".to_string(),
            None,
        ));
    }
    None
}

pub(crate) fn credential_not_allowed_response() -> Response {
    protocol_error(
        StatusCode::UNAUTHORIZED,
        "credential_not_allowed",
        "设备授权接口不接受 Cookie 或 Authorization 凭证".to_string(),
        None,
    )
}

pub(crate) fn rate_limited_response(retry_after: i64) -> Response {
    protocol_error(
        StatusCode::TOO_MANY_REQUESTS,
        "rate_limited",
        "设备授权请求过于频繁".to_string(),
        Some(retry_after),
    )
}

pub(crate) fn browser_rate_limited_response() -> Response {
    let mut response = (
        StatusCode::TOO_MANY_REQUESTS,
        "设备授权请求过于频繁，请稍后重试。",
    )
        .into_response();
    response
        .headers_mut()
        .insert(header::RETRY_AFTER, header::HeaderValue::from_static("60"));
    no_store(response)
}

fn domain_error(error: device_sessions::DeviceSessionError) -> Response {
    use device_sessions::DeviceSessionError as Error;
    let status = match &error {
        Error::SlowDown { .. } => StatusCode::TOO_MANY_REQUESTS,
        Error::AuthorizationConsumed
        | Error::ExchangeTransactionMismatch
        | Error::IdempotencyExpired => StatusCode::CONFLICT,
        Error::InvalidState(_) | Error::StorageFailure(_) | Error::CryptoFailure => {
            StatusCode::INTERNAL_SERVER_ERROR
        }
        _ => StatusCode::BAD_REQUEST,
    };
    if status == StatusCode::INTERNAL_SERVER_ERROR {
        tracing::error!(error_code = error.code(), %error, "device authorization operation failed");
        return protocol_error(
            status,
            "device_authorization_unavailable",
            "设备授权服务暂时不可用".to_string(),
            None,
        );
    }
    let code = match &error {
        Error::InvalidRequest(message) if message.contains("code_challenge") => {
            "invalid_code_challenge"
        }
        Error::InvalidRequest(_) => "invalid_device_request",
        Error::ExchangeTransactionMismatch => "exchange_transaction_conflict",
        other => other.code(),
    };
    protocol_error(status, code, error.to_string(), error.retry_after_seconds())
}

fn json_rejection(error: JsonRejection) -> Response {
    let status = if error.status() == StatusCode::UNSUPPORTED_MEDIA_TYPE {
        StatusCode::UNSUPPORTED_MEDIA_TYPE
    } else {
        StatusCode::BAD_REQUEST
    };
    protocol_error(
        status,
        "invalid_device_request",
        "设备授权请求必须是有效 JSON".to_string(),
        None,
    )
}

fn protocol_error(
    status: StatusCode,
    code: &'static str,
    message: String,
    retry_after: Option<i64>,
) -> Response {
    let mut response = (
        status,
        Json(DeviceErrorEnvelope {
            error: DeviceErrorBody {
                code,
                message,
                retry_after,
            },
        }),
    )
        .into_response();
    if let Some(seconds) = retry_after
        && let Ok(value) = seconds.to_string().parse()
    {
        response.headers_mut().insert(header::RETRY_AFTER, value);
    }
    no_store(response)
}

fn render_result(
    state: &AppState,
    csrf_token: String,
    user_code: String,
    error: device_sessions::DeviceSessionError,
) -> AppResult<Response> {
    let (title, message) = match error {
        device_sessions::DeviceSessionError::AuthorizationDenied => {
            ("授权已拒绝", "此设备授权请求已经被拒绝。")
        }
        device_sessions::DeviceSessionError::AuthorizationExpired => (
            "授权已过期",
            "此设备授权请求已过期，请从桌面客户端重新发起。",
        ),
        device_sessions::DeviceSessionError::AuthorizationConsumed => {
            ("授权已完成", "此设备授权请求已经处理。")
        }
        _ => ("授权请求无效", "无法识别此设备授权请求，请核对授权码。"),
    };
    let response = response::html(DeviceAuthorizationResultTemplate {
        csrf_token: csrf_token.clone(),
        user_code,
        title: title.to_string(),
        message: message.to_string(),
    })?
    .into_response();
    with_csrf_cookie(state, &csrf_token, no_store(response))
}

fn render_success_result(
    state: &AppState,
    csrf_token: String,
    user_code: String,
    approved: bool,
) -> AppResult<Response> {
    let (title, message) = if approved {
        ("设备已批准", "桌面客户端现在可以完成凭证交换。")
    } else {
        ("设备已拒绝", "此设备不会获得访问凭证。")
    };
    let response = response::html(DeviceAuthorizationResultTemplate {
        csrf_token: csrf_token.clone(),
        user_code,
        title: title.to_string(),
        message: message.to_string(),
    })?
    .into_response();
    with_csrf_cookie(state, &csrf_token, no_store(response))
}

fn login_redirect(user_code: &str) -> AppResult<Response> {
    let return_to = serde_urlencoded::to_string([("user_code", user_code)])
        .map_err(|error| crate::platform::error::AppError::BadRequest(error.to_string()))?;
    let return_to = format!("{VERIFICATION_PATH}?{return_to}");
    let query = serde_urlencoded::to_string([("return_to", return_to)])
        .map_err(|error| crate::platform::error::AppError::BadRequest(error.to_string()))?;
    Ok(Redirect::to(&format!("/web/login?{query}")).into_response())
}

fn with_csrf_cookie(state: &AppState, token: &str, mut response: Response) -> AppResult<Response> {
    response.headers_mut().append(
        header::SET_COOKIE,
        csrf::cookie_header(token, state.settings.env == "production").parse()?,
    );
    Ok(response)
}

fn no_store(mut response: Response) -> Response {
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        header::HeaderValue::from_static("private, no-store"),
    );
    response
}
