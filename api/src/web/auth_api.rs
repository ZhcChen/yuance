use axum::{
    extract::State,
    http::{HeaderMap, HeaderName, header},
    response::{AppendHeaders, IntoResponse},
};
use serde::Serialize;

use crate::{
    domains::auth,
    platform::{
        error::{AppError, AppResult},
        security::csrf,
    },
    web::{response::json, router::AppState},
};

#[derive(Debug, Serialize)]
pub struct CsrfTokenPayload {
    pub csrf_token: String,
}

pub async fn csrf_token(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<impl IntoResponse> {
    let pool = state.pool()?;
    let Some(_user) = auth::user_from_headers(pool, &headers).await? else {
        return Err(AppError::Unauthorized);
    };

    let csrf_token = csrf::ensure_token(&headers);
    let secure = state.settings.env == "production";

    Ok((
        AppendHeaders([
            (header::SET_COOKIE, csrf::cookie_header(&csrf_token, secure)),
            (
                HeaderName::from_static(csrf::CSRF_HEADER_NAME),
                csrf_token.clone(),
            ),
        ]),
        json(CsrfTokenPayload { csrf_token }),
    ))
}
