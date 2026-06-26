use axum::extract::State;
use serde::Serialize;

use crate::web::{
    response::{ApiEnvelope, json},
    router::AppState,
};

#[derive(Debug, Serialize)]
pub struct HealthPayload<'a> {
    pub service: &'a str,
    pub status: &'a str,
    pub version: &'a str,
}

#[derive(Debug, Serialize)]
pub struct ReadyPayload<'a> {
    pub service: &'a str,
    pub status: &'a str,
    pub database: &'a str,
    pub environment: String,
}

pub async fn healthz() -> axum::Json<ApiEnvelope<HealthPayload<'static>>> {
    json(HealthPayload {
        service: "yuance-api",
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

pub async fn readyz(
    State(state): State<AppState>,
) -> axum::Json<ApiEnvelope<ReadyPayload<'static>>> {
    json(ReadyPayload {
        service: "yuance-api",
        status: "ready",
        database: "sqlite-not-connected-in-skeleton",
        environment: state.settings.env,
    })
}
