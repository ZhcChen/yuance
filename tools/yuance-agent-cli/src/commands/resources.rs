use std::path::Path;

use serde_json::Value;

use crate::{
    cli::{
        ResourceAttachmentAccessArgs, ResourceAttachmentCompleteArgs, ResourceAttachmentCreateArgs,
        ResourceAttachmentDeleteArgs, ResourceAttachmentsCommand, ResourcesCommand,
        ResourcesCreateArgs, ResourcesListArgs, ResourcesUnlockArgs, ResourcesUpdateArgs,
    },
    client::ApiClient,
    error::AgentError,
    models::{
        CompleteAttachmentUploadRequest, CreateAttachmentRequest, CreateProjectResourceRequest,
        UnlockProjectResourceRequest, UpdateProjectResourceRequest,
    },
};

use super::{
    projects::{push_option, query_refs},
    read_secret_stdin, read_text, require_non_empty,
};

pub async fn run(client: &ApiClient, command: ResourcesCommand) -> Result<Value, AgentError> {
    match command {
        ResourcesCommand::List(args) => list(client, args).await,
        ResourcesCommand::Get {
            project_key,
            resource_id,
        } => {
            client
                .get_segments(
                    &[
                        "api",
                        "v1",
                        "projects",
                        &project_key,
                        "resources",
                        &resource_id.to_string(),
                    ],
                    &[],
                )
                .await
        }
        ResourcesCommand::Create(args) => create(client, args).await,
        ResourcesCommand::Unlock(args) => unlock(client, args).await,
        ResourcesCommand::Update(args) => update(client, args).await,
        ResourcesCommand::Attachments { command } => attachments(client, command).await,
    }
}

async fn create(client: &ApiClient, args: ResourcesCreateArgs) -> Result<Value, AgentError> {
    require_non_empty(&args.title, "资料标题")?;
    if let Some(value) = &args.category {
        require_non_empty(value, "资料分类")?;
    }
    if let Some(value) = &args.body_format {
        require_non_empty(value, "资料正文格式")?;
    }
    if args.access_password_stdin && args.body_file.as_deref() == Some(Path::new("-")) {
        return Err(AgentError::Config {
            code: "conflicting_stdin_inputs",
            message: "资料正文和访问密码不能同时从 stdin 读取".to_string(),
        });
    }

    let body = read_text(None, args.body_file.as_deref(), "资料正文")?;
    let access_password = if args.access_password_stdin {
        Some(read_secret_stdin("访问密码")?)
    } else {
        None
    };
    let request = CreateProjectResourceRequest {
        title: args.title,
        category: args.category,
        body,
        body_format: args.body_format,
        access_password,
        tags: args.tags,
        related_work_item_key: args.related_work_item_key,
        related_cycle_id: args.related_cycle_id,
    };

    client
        .post_segments(
            &["api", "v1", "projects", &args.project_key, "resources"],
            &request,
        )
        .await
}

async fn list(client: &ApiClient, args: ResourcesListArgs) -> Result<Value, AgentError> {
    let mut query = Vec::new();
    push_option(&mut query, "q", args.q);
    push_option(&mut query, "category", args.category);
    push_option(&mut query, "status", args.status);
    push_option(&mut query, "tag", args.tag);
    push_option(
        &mut query,
        "related_work_item_key",
        args.related_work_item_key,
    );
    push_option(
        &mut query,
        "related_cycle_id",
        args.related_cycle_id.map(|value| value.to_string()),
    );
    client
        .get_segments(
            &["api", "v1", "projects", &args.project_key, "resources"],
            &query_refs(&query),
        )
        .await
}

async fn unlock(client: &ApiClient, args: ResourcesUnlockArgs) -> Result<Value, AgentError> {
    let access_password = read_secret_stdin("访问密码")?;
    client
        .post_segments(
            &[
                "api",
                "v1",
                "projects",
                &args.project_key,
                "resources",
                &args.resource_id.to_string(),
                "unlock",
            ],
            &UnlockProjectResourceRequest { access_password },
        )
        .await
}

async fn update(client: &ApiClient, args: ResourcesUpdateArgs) -> Result<Value, AgentError> {
    let body = read_text(None, args.body_file.as_deref(), "资料正文")?;
    if let Some(value) = &args.access_password_action {
        require_non_empty(value, "访问密码动作")?;
    }
    let access_password = if args.access_password_stdin {
        Some(read_secret_stdin("访问密码")?)
    } else {
        None
    };
    let request = UpdateProjectResourceRequest {
        title: args.title,
        category: args.category,
        body,
        body_format: args.body_format,
        access_password_action: args.access_password_action,
        access_password,
        tags: args.tags,
        related_work_item_key: args.related_work_item_key,
        related_cycle_id: args.related_cycle_id,
    };
    client
        .patch_segments(
            &[
                "api",
                "v1",
                "projects",
                &args.project_key,
                "resources",
                &args.resource_id.to_string(),
            ],
            &request,
        )
        .await
}

async fn attachments(
    client: &ApiClient,
    command: ResourceAttachmentsCommand,
) -> Result<Value, AgentError> {
    match command {
        ResourceAttachmentsCommand::List(args) => list_attachments(client, args).await,
        ResourceAttachmentsCommand::Create(args) => create_attachment(client, args).await,
        ResourceAttachmentsCommand::UploadUrl(args) => signed_url(client, args, "upload-url").await,
        ResourceAttachmentsCommand::DownloadUrl(args) => {
            signed_url(client, args, "download-url").await
        }
        ResourceAttachmentsCommand::Complete(args) => complete_attachment(client, args).await,
        ResourceAttachmentsCommand::Delete(args) => delete_attachment(client, args).await,
    }
}

async fn list_attachments(
    client: &ApiClient,
    args: ResourceAttachmentAccessArgs,
) -> Result<Value, AgentError> {
    let access = access_query(&args)?;
    let query_refs = access
        .iter()
        .map(|(name, value)| (*name, value.as_str()))
        .collect::<Vec<_>>();
    client
        .get_segments(
            &[
                "api",
                "v1",
                "projects",
                &args.project_key,
                "resources",
                &args.resource_id.to_string(),
                "attachments",
            ],
            &query_refs,
        )
        .await
}

async fn create_attachment(
    client: &ApiClient,
    args: ResourceAttachmentCreateArgs,
) -> Result<Value, AgentError> {
    require_non_empty(&args.original_filename, "文件名")?;
    require_non_empty(&args.content_type, "媒体类型")?;
    if args.byte_size < 0 {
        return Err(AgentError::Config {
            code: "invalid_byte_size",
            message: "文件大小不能小于 0".to_string(),
        });
    }
    client
        .post_segments(
            &[
                "api",
                "v1",
                "projects",
                &args.project_key,
                "resources",
                &args.resource_id.to_string(),
                "attachments",
            ],
            &CreateAttachmentRequest {
                original_filename: args.original_filename,
                content_type: args.content_type,
                byte_size: args.byte_size,
                checksum_sha256: args.checksum_sha256,
            },
        )
        .await
}

async fn signed_url(
    client: &ApiClient,
    args: ResourceAttachmentAccessArgs,
    action: &str,
) -> Result<Value, AgentError> {
    let attachment_id = args.attachment_id.ok_or_else(|| AgentError::Config {
        code: "missing_attachment_id",
        message: "该附件命令必须提供 --attachment-id".to_string(),
    })?;
    let mut query = access_query(&args)?;
    if let Some(value) = args.expires_in_seconds {
        query.push(("expires_in_seconds", value.to_string()));
    }
    let query_refs = query
        .iter()
        .map(|(name, value)| (*name, value.as_str()))
        .collect::<Vec<_>>();
    client
        .get_segments(
            &[
                "api",
                "v1",
                "projects",
                &args.project_key,
                "resources",
                &args.resource_id.to_string(),
                "attachments",
                &attachment_id.to_string(),
                action,
            ],
            &query_refs,
        )
        .await
}

async fn complete_attachment(
    client: &ApiClient,
    args: ResourceAttachmentCompleteArgs,
) -> Result<Value, AgentError> {
    client
        .post_segments(
            &[
                "api",
                "v1",
                "projects",
                &args.project_key,
                "resources",
                &args.resource_id.to_string(),
                "attachments",
                &args.attachment_id.to_string(),
                "uploaded",
            ],
            &CompleteAttachmentUploadRequest {
                encrypted_sha256: args.encrypted_sha256,
            },
        )
        .await
}

async fn delete_attachment(
    client: &ApiClient,
    args: ResourceAttachmentDeleteArgs,
) -> Result<Value, AgentError> {
    require_non_empty(&args.if_match, "If-Match")?;
    client
        .delete_segments_with_if_match(
            &[
                "api",
                "v1",
                "projects",
                &args.project_key,
                "resources",
                &args.resource_id.to_string(),
                "attachments",
                &args.attachment_id.to_string(),
            ],
            &args.if_match,
        )
        .await
}

fn access_query(
    args: &ResourceAttachmentAccessArgs,
) -> Result<Vec<(&'static str, String)>, AgentError> {
    if !args.access_token_stdin {
        return Ok(Vec::new());
    }
    Ok(vec![("access", read_secret_stdin("资料访问凭证")?)])
}
