use serde_json::Value;

use crate::{cli::ProjectsListArgs, client::ApiClient, error::AgentError};

pub async fn list(client: &ApiClient, args: ProjectsListArgs) -> Result<Value, AgentError> {
    let mut query = Vec::new();
    push_option(&mut query, "status", args.status);
    push_option(&mut query, "page", args.page.map(|value| value.to_string()));
    push_option(
        &mut query,
        "per_page",
        args.per_page.map(|value| value.to_string()),
    );
    let query_refs = query_refs(&query);
    client
        .get_segments(&["api", "v1", "projects"], &query_refs)
        .await
}

pub async fn get(client: &ApiClient, project_key: &str) -> Result<Value, AgentError> {
    client
        .get_segments(&["api", "v1", "projects", project_key], &[])
        .await
}

pub(super) fn push_option(
    query: &mut Vec<(&'static str, String)>,
    name: &'static str,
    value: Option<String>,
) {
    if let Some(value) = value {
        query.push((name, value));
    }
}

pub(super) fn query_refs<'a>(query: &'a [(&'static str, String)]) -> Vec<(&'static str, &'a str)> {
    query
        .iter()
        .map(|(name, value)| (*name, value.as_str()))
        .collect()
}
