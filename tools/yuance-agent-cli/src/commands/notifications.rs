use serde_json::Value;

use crate::{cli::NotificationsListArgs, client::ApiClient, error::AgentError};

use super::projects::{push_option, query_refs};

pub async fn list(client: &ApiClient, args: NotificationsListArgs) -> Result<Value, AgentError> {
    let mut query = Vec::new();
    push_option(&mut query, "filter", args.filter);
    push_option(
        &mut query,
        "limit",
        args.limit.map(|value| value.to_string()),
    );
    push_option(&mut query, "page", args.page.map(|value| value.to_string()));
    push_option(
        &mut query,
        "per_page",
        args.per_page.map(|value| value.to_string()),
    );
    client
        .get("/api/v1/notifications", &query_refs(&query))
        .await
}
