use serde_json::Value;

use crate::{
    cli::CreateCommentArgs, client::ApiClient, error::AgentError, models::CreateCommentRequest,
};

use super::{read_text, require_non_empty};

pub async fn list(client: &ApiClient, item_key: &str) -> Result<Value, AgentError> {
    client
        .get_segments(&["api", "v1", "work-items", item_key, "comments"], &[])
        .await
}

pub async fn create(client: &ApiClient, args: CreateCommentArgs) -> Result<Value, AgentError> {
    let body = read_text(args.body, args.body_file.as_deref(), "body")?
        .expect("clap requires body or body-file");
    require_non_empty(&body, "body")?;
    let request = CreateCommentRequest {
        body,
        body_format: args.body_format,
        parent_comment_id: args.parent_comment_id,
    };
    client
        .post_segments(
            &["api", "v1", "work-items", &args.item_key, "comments"],
            &request,
        )
        .await
}
