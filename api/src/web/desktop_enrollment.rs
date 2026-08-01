use axum::{
    extract::State,
    http::header,
    response::{IntoResponse, Response},
};
use serde::Serialize;

use crate::web::router::AppState;

pub const DESKTOP_ENROLLMENT_SCHEMA_VERSION: u32 = 1;
pub const DESKTOP_API_PROTOCOL_VERSION: u32 = 1;
pub const DESKTOP_CAPABILITIES: [&str; 2] = ["device-authorization.v1", "device-session.probe.v1"];

#[derive(Debug, Serialize)]
struct DesktopEnrollment<'a> {
    schema_version: u32,
    api_protocol_version: u32,
    server_instance_id: &'a str,
    capabilities: [&'static str; 2],
}

pub async fn desktop_enrollment(State(state): State<AppState>) -> Response {
    (
        [
            (header::CONTENT_TYPE, "application/json; charset=utf-8"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        axum::Json(DesktopEnrollment {
            schema_version: DESKTOP_ENROLLMENT_SCHEMA_VERSION,
            api_protocol_version: DESKTOP_API_PROTOCOL_VERSION,
            server_instance_id: &state.settings.device_sessions.server_instance_id,
            capabilities: DESKTOP_CAPABILITIES,
        }),
    )
        .into_response()
}
