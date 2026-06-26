use askama::Template;
use axum::{Json, response::Html};
use serde::Serialize;

use crate::platform::error::AppResult;

#[derive(Debug, Serialize)]
pub struct ApiEnvelope<T>
where
    T: Serialize,
{
    pub data: T,
}

pub fn html<T>(template: T) -> AppResult<Html<String>>
where
    T: Template,
{
    Ok(Html(template.render()?))
}

pub fn json<T>(data: T) -> Json<ApiEnvelope<T>>
where
    T: Serialize,
{
    Json(ApiEnvelope { data })
}
