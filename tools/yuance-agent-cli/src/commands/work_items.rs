use clap::ValueEnum;
use serde_json::Value;

use crate::{
    cli::{CreateWorkItemArgs, HandoffWorkItemArgs, UpdateWorkItemArgs, WorkItemsListArgs},
    client::ApiClient,
    error::AgentError,
    models::{CreateWorkItemRequest, HandoffWorkItemRequest, UpdateWorkItemRequest},
};

use super::{
    projects::{push_option, query_refs},
    read_text,
};

pub async fn list(client: &ApiClient, args: WorkItemsListArgs) -> Result<Value, AgentError> {
    let mut query = Vec::new();
    push_option(&mut query, "item_type", enum_value(args.item_type));
    push_option(&mut query, "project_key", args.project_key);
    push_option(&mut query, "q", args.q);
    push_option(&mut query, "status", enum_value(args.status));
    push_option(&mut query, "priority", enum_value(args.priority));
    push_option(&mut query, "assignee_username", args.assignee_username);
    push_option(&mut query, "page", args.page.map(|value| value.to_string()));
    push_option(
        &mut query,
        "per_page",
        args.per_page.map(|value| value.to_string()),
    );
    let query_refs = query_refs(&query);
    client
        .get_segments(&["api", "v1", "work-items"], &query_refs)
        .await
}

pub async fn get(client: &ApiClient, item_key: &str) -> Result<Value, AgentError> {
    client
        .get_segments(&["api", "v1", "work-items", item_key], &[])
        .await
}

pub async fn create(client: &ApiClient, args: CreateWorkItemArgs) -> Result<Value, AgentError> {
    let request = CreateWorkItemRequest {
        project_key: args.project_key,
        item_type: args.item_type,
        title: args.title,
        description: read_text(
            args.description,
            args.description_file.as_deref(),
            "description",
        )?,
        priority: args.priority,
        assignee_username: args.assignee_username,
        due_date: args.due_date,
        parent_item_key: args.parent_item_key,
    };
    client
        .post_segments(&["api", "v1", "work-items"], &request)
        .await
}

pub async fn update(client: &ApiClient, args: UpdateWorkItemArgs) -> Result<Value, AgentError> {
    let request = UpdateWorkItemRequest {
        title: args.title,
        description: read_text(
            args.description,
            args.description_file.as_deref(),
            "description",
        )?,
        priority: args.priority,
        due_date: args.due_date,
        parent_item_key: args.parent_item_key,
    };
    if request.is_empty() {
        return Err(AgentError::Config {
            code: "missing_update_fields",
            message: "work-items update 至少需要一个元数据字段".to_string(),
        });
    }
    client
        .patch_segments(&["api", "v1", "work-items", &args.item_key], &request)
        .await
}

pub async fn handoff(client: &ApiClient, args: HandoffWorkItemArgs) -> Result<Value, AgentError> {
    let request = HandoffWorkItemRequest {
        status: args.status,
        assignee_username: args.assignee_username,
        body: read_text(args.body, args.body_file.as_deref(), "body")?,
        source_comment_id: args.source_comment_id,
    };
    client
        .post_segments(
            &["api", "v1", "work-items", &args.item_key, "handoff"],
            &request,
        )
        .await
}

fn enum_value<T: ValueEnum>(value: Option<T>) -> Option<String> {
    value.map(|value| {
        value
            .to_possible_value()
            .expect("ValueEnum variant")
            .get_name()
            .to_string()
    })
}
