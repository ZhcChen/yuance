use std::{path::Path, time::Duration};

use chrono::Utc;
use serde_json::Value;

use crate::{
    cli::{
        ResourceAttachmentAccessArgs, ResourceAttachmentCompleteArgs, ResourceAttachmentCreateArgs,
        ResourceAttachmentDeleteArgs, ResourceAttachmentUploadArgs, ResourceAttachmentsCommand,
        ResourcesCommand, ResourcesCreateArgs, ResourcesListArgs, ResourcesUnlockArgs,
        ResourcesUpdateArgs,
    },
    client::ApiClient,
    error::AgentError,
    file_crypto::{EncryptedFileBody, hash_file},
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
        ResourceAttachmentsCommand::Upload(args) => upload_attachment(client, args).await,
        ResourceAttachmentsCommand::UploadUrl(args) => signed_url(client, args, "upload-url").await,
        ResourceAttachmentsCommand::DownloadUrl(args) => {
            signed_url(client, args, "download-url").await
        }
        ResourceAttachmentsCommand::Complete(args) => complete_attachment(client, args).await,
        ResourceAttachmentsCommand::Delete(args) => delete_attachment(client, args).await,
    }
}

async fn upload_attachment(
    client: &ApiClient,
    args: ResourceAttachmentUploadArgs,
) -> Result<Value, AgentError> {
    let filename = args
        .file
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| upload_error("local-validation", "文件名无效", None, None))?
        .to_string();
    let digest = hash_file(&args.file).map_err(|error| {
        upload_error(
            "local-validation",
            &format!("读取上传文件失败: {error}"),
            None,
            None,
        )
    })?;
    let content_type = args
        .content_type
        .or_else(|| infer_content_type(&filename).map(str::to_string))
        .unwrap_or_else(|| "application/octet-stream".to_string());
    let created = client
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
                original_filename: filename,
                content_type,
                byte_size: i64::try_from(digest.byte_size).map_err(|_| {
                    upload_error("local-validation", "文件大小超出支持范围", None, None)
                })?,
                checksum_sha256: Some(digest.sha256.clone()),
            },
        )
        .await
        .map_err(|error| upload_error("registering", &error.to_string(), None, None))?;
    let attachment_id = created
        .get("data")
        .and_then(|value| value.get("id"))
        .and_then(Value::as_i64)
        .filter(|value| *value > 0)
        .ok_or_else(|| upload_error("registering", "附件登记响应缺少有效 ID", None, None))?;

    let signed = signed_url(
        client,
        ResourceAttachmentAccessArgs {
            project_key: args.project_key.clone(),
            resource_id: args.resource_id,
            attachment_id: Some(attachment_id),
            access_token_stdin: false,
            expires_in_seconds: Some(60),
        },
        "upload-url",
    )
    .await
    .map_err(|error| upload_error("signing", &error.to_string(), Some(attachment_id), None))?;
    let signed = serde_json::from_value::<crate::models::AttachmentSignedUrlEnvelope>(signed)
        .map_err(|_| upload_error("signing", "签名响应格式无效", Some(attachment_id), None))?
        .data;
    let contract = crate::transfer::ValidatedUploadContract::parse(
        signed,
        &format!("{}/", client.api_origin()),
        Utc::now(),
    )
    .map_err(|error| upload_error("signing", &error.to_string(), Some(attachment_id), None))?;
    if contract.attachment_id != attachment_id
        || contract.plaintext_bytes != i64::try_from(digest.byte_size).unwrap_or(-1)
        || contract.plaintext_sha256 != digest.sha256
    {
        return Err(upload_error(
            "signing",
            "签名响应与本地文件元数据不匹配",
            Some(attachment_id),
            None,
        ));
    }

    let transport =
        crate::transfer::SignedObjectTransport::new(Duration::from_secs(30)).map_err(|error| {
            upload_error("uploading", &error.to_string(), Some(attachment_id), None)
        })?;
    let (body, encrypted_digest) = if let Some(encryption) = &contract.encryption {
        let body = EncryptedFileBody::open(
            &args.file,
            encryption.file_object_id,
            encryption.key,
            &digest,
        )
        .map_err(|error| {
            upload_error(
                "uploading",
                &format!("加密文件失败: {error}"),
                Some(attachment_id),
                None,
            )
        })?;
        let digest_handle = body.digest();
        (body.into_body(), Some(digest_handle))
    } else {
        let file = tokio::fs::File::open(&args.file).await.map_err(|error| {
            upload_error(
                "uploading",
                &format!("打开上传文件失败: {error}"),
                Some(attachment_id),
                None,
            )
        })?;
        let stream = tokio_util::io::ReaderStream::new(file);
        (reqwest::Body::wrap_stream(stream), None)
    };
    transport.put(&contract, body).await.map_err(|error| {
        upload_error("uploading", &error.to_string(), Some(attachment_id), None)
    })?;
    let encrypted_sha256 = if let Some(handle) = encrypted_digest {
        Some(handle.encrypted_sha256().map_err(|error| {
            upload_error(
                "uploading",
                &format!("读取密文摘要失败: {error}"),
                Some(attachment_id),
                None,
            )
        })?)
    } else {
        let current = hash_file(&args.file).map_err(|error| {
            upload_error(
                "uploading",
                &format!("复核上传文件失败: {error}"),
                Some(attachment_id),
                None,
            )
        })?;
        if current != digest {
            return Err(upload_error(
                "uploading",
                "文件在上传期间发生变化",
                Some(attachment_id),
                None,
            ));
        }
        None
    };
    let completed = client
        .post_segments(
            &[
                "api",
                "v1",
                "projects",
                &args.project_key,
                "resources",
                &args.resource_id.to_string(),
                "attachments",
                &attachment_id.to_string(),
                "uploaded",
            ],
            &CompleteAttachmentUploadRequest {
                encrypted_sha256: encrypted_sha256.clone(),
            },
        )
        .await
        .map_err(|error| {
            upload_error(
                "confirming",
                &error.to_string(),
                Some(attachment_id),
                encrypted_sha256.clone(),
            )
        })?;
    Ok(completed)
}

fn infer_content_type(filename: &str) -> Option<&'static str> {
    match filename
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())
    {
        Some(extension) if extension == "svg" => Some("image/svg+xml"),
        Some(extension) if extension == "png" => Some("image/png"),
        Some(extension) if extension == "jpg" || extension == "jpeg" => Some("image/jpeg"),
        Some(extension) if extension == "gif" => Some("image/gif"),
        Some(extension) if extension == "pdf" => Some("application/pdf"),
        _ => None,
    }
}

fn upload_error(
    stage: &'static str,
    message: &str,
    attachment_id: Option<i64>,
    encrypted_sha256: Option<String>,
) -> AgentError {
    AgentError::Upload {
        stage,
        code: "upload_failed",
        message: message.to_string(),
        attachment_id,
        encrypted_sha256,
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
