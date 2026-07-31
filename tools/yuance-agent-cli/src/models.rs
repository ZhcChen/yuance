use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct ApiErrorEnvelope {
    pub error: ApiErrorBody,
}

#[derive(Debug, Deserialize)]
pub struct ApiErrorBody {
    #[serde(default)]
    pub code: String,
    #[serde(default)]
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct ErrorEnvelope<'a> {
    pub error: ErrorBody<'a>,
}

#[derive(Debug, Serialize)]
pub struct ErrorBody<'a> {
    pub kind: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<u16>,
    pub code: &'a str,
    pub message: &'a str,
}
